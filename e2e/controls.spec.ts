import { test, expect, Page } from '@playwright/test';
import { signIn, OPERATOR, MANAGER } from './helpers/login';
import { goTo } from './helpers/nav';

/**
 * Controls: approval rules (supplier payment sent by staff, a big-discount bill and a stock loss decided
 * by a manager), the deleted-records bin with restore, number series, branches, the owner dashboard with
 * its printable daily report, and automatic backups.
 */
const seedShop = () => {
  if (localStorage.getItem('e2e_controls_seeded')) return; // survive reloads
  localStorage.setItem('e2e_controls_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', {
    appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 10000, openingBankBalance: 0, cashOpeningDate: '2026-01-01', taxRatePct: 0,
    approvalRules: { discountPctAbove: 10, supplierPaymentAbove: 100000, stockLossAbove: 5000, creditLimit: false, deleteBills: false },
  });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman and Co', company: 'Zaman and Co', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
    { id: 'c2', name: 'Swat Ghee House', company: 'Swat Ghee House', phone: '03001112223', email: '', address: 'Swat', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', address: 'Karachi', totalOwed: 240000, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [{ id: 'p1', name: 'Dalda 16kg tin', category: 'General', unit: 'tin', unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 100, minThresholdKg: 0 }]);
  set('tradeflow_invoices_v1', []);
  set('tradeflow_ledger_v2', []);
  set('tradeflow_expenses_v2', []);
  set('tradeflow_cash_entries_v2', []);
  const req = (id: string, kind: string, rules: string[], title: string, reasons: string[], amount: number, payload: unknown) => ({
    id, kind, rules, status: 'pending', title, reasons, amount, payload, requestedBy: 'Zahid Yard Weighbridge', requestedById: 'user-operator', requestedAt: new Date().toISOString(),
  });
  set('sarmaya_approvals_v1', [
    req('apr-bill', 'bill', ['discount'], 'Bill for Swat Ghee House — Rs. 8,000', ['Discount 20% (Rs. 2,000) is over the 10% limit'], 8000, { customerId: 'c2', items: [{ productId: 'p1', name: 'Dalda 16kg tin', qty: 10, unitPrice: 1000, discountType: 'pct', discountValue: 20 }], paidNow: 0, date: today }),
    req('apr-stock', 'stock_loss', ['stock_loss'], 'Take off 10 tin Dalda 16kg tin — Rs. 8,000', ['Stock loss worth Rs. 8,000 is over the Rs. 5,000 limit'], 8000, { productId: 'p1', deltaQty: -10, reason: 'leaked', date: today }),
  ]);
};

const noSideScroll = async (page: Page, label: string) => {
  const x = await page.evaluate(() => { window.scrollTo(10000, window.scrollY); const v = window.scrollX; window.scrollTo(0, window.scrollY); return v; });
  expect(x, `${label}: page must not scroll sideways`).toBe(0);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(seedShop);
});

test('staff: a big supplier payment is sent for approval, nothing is paid', async ({ page }) => {
  await signIn(page, OPERATOR);
  await goTo(page, 'Suppliers');
  await page.getByRole('button', { name: 'Pay Dalda Foods' }).click();
  const pay = page.getByRole('dialog', { name: 'Pay supplier' });
  await pay.getByLabel('Amount (Rs.)').fill('150000');
  await expect(pay.getByText(/Needs a manager’s approval: Supplier payment of Rs\. 150,000/)).toBeVisible();
  await pay.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(pay.getByTestId('payment-sent-for-approval')).toContainText('Sent for approval');
  await pay.getByRole('button', { name: 'Close', exact: true }).last().click();
  // Still owed in full; the request shows on Home for the person who sent it.
  await expect(page.getByText('Rs. 240,000').first()).toBeVisible();
  await goTo(page, 'Home');
  await expect(page.getByTestId('approvals-tile')).toContainText('3 waiting for approval');
});

test('manager: approve a bill, reject a stock loss; delete and restore a customer', async ({ page }) => {
  await signIn(page, MANAGER);
  await expect(page.getByTestId('approvals-tile')).toContainText('2 waiting for approval');
  await page.getByTestId('approvals-tile').click();
  const inbox = page.getByRole('dialog', { name: 'Approvals' });
  await expect(inbox.getByTestId('approval-request')).toHaveCount(2);
  await inbox.getByLabel('Note for Take off 10 tin Dalda 16kg tin — Rs. 8,000').fill('count again first');
  await inbox.getByTestId('approval-request').filter({ hasText: 'Take off 10 tin' }).getByRole('button', { name: 'Reject' }).click();
  await expect(inbox.getByText('Rejected. Nothing was posted.')).toBeVisible();
  await inbox.getByTestId('approval-request').filter({ hasText: 'Swat Ghee House' }).getByRole('button', { name: 'Approve' }).click();
  await expect(inbox.getByText(/Approved\. Bill INV-1 is posted\./)).toBeVisible();
  await inbox.getByRole('tab', { name: 'Done' }).click();
  await expect(inbox.getByTestId('approval-request')).toHaveCount(2);
  await inbox.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('approvals-tile')).toHaveCount(0);

  await goTo(page, 'Bills');
  await expect(page.getByText('Swat Ghee House').first()).toBeVisible();

  // Delete a customer with a reason: it lands in Admin → Deleted records.
  await goTo(page, 'Customers');
  await page.getByRole('button', { name: /Zaman and Co/ }).first().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByLabel(/Why\?/).fill('opened twice');
  await confirm.getByRole('button', { name: /Delete/ }).click();
  await goTo(page, 'Admin');
  await page.getByRole('button', { name: /Deleted records/ }).click();
  const row = page.getByTestId('deleted-record').filter({ hasText: 'Zaman and Co' });
  await expect(row).toContainText('“opened twice”');
  await expect(row).toContainText('Rashid Minhas');
  // Managers can view but not restore.
  await expect(row.getByRole('button', { name: /Restore/ })).toHaveCount(0);
});

test('owner: rules & numbers & branches, restore from the bin, owner dashboard, report and backups', async ({ page }) => {
  await signIn(page);
  await goTo(page, 'Customers');
  await page.getByRole('button', { name: /Zaman and Co/ }).first().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByLabel(/Why\?/).fill('test');
  await page.getByRole('alertdialog').getByRole('button', { name: /Delete/ }).click();

  await goTo(page, 'Admin');
  await page.getByRole('button', { name: /Deleted records/ }).click();
  await page.getByTestId('deleted-record').filter({ hasText: 'Zaman and Co' }).getByRole('button', { name: /Restore/ }).click();
  await expect(page.getByText(/Zaman and Co is back/)).toBeVisible();

  // Number series: yearly bills.
  await page.getByRole('button', { name: /Rules, numbers & branches/ }).click();
  const year = new Date().getFullYear();
  const bills = page.getByTestId('series-bill');
  await bills.getByLabel('Prefix').fill('RZT-');
  await bills.getByLabel('New series each year').check();
  await bills.getByRole('button', { name: 'Save Bills (invoices) numbers' }).click();
  await expect(page.getByText(`Bills (invoices): Saved. The next one will be RZT-${year}-0001.`)).toBeVisible();

  // Branches: the filter only appears with two.
  await page.getByLabel('Branch name').fill('Batkhela shop');
  await page.getByRole('button', { name: 'Add branch' }).click();
  await expect(page.getByLabel('Branch of Rashid Minhas')).toHaveCount(0);
  await page.getByLabel('Branch name').fill('Mingora shop');
  await page.getByRole('button', { name: 'Add branch' }).click();
  await page.getByLabel('Branch of Zahid Yard Weighbridge').selectOption({ label: 'Mingora shop' });
  await expect(page.getByText('Zahid Yard Weighbridge now works in Mingora shop.')).toBeVisible();

  await goTo(page, 'Home');
  await expect(page.getByTestId('branch-filter')).toBeVisible();
  await page.getByTestId('branch-filter').selectOption({ label: 'Mingora shop' });
  await goTo(page, 'Bills');
  await expect(page.getByTestId('branch-filter')).toHaveValue(/br-/);

  // Owner dashboard + printable daily business report.
  await goTo(page, 'Owner dashboard');
  await page.getByTestId('branch-filter').selectOption('all');
  await expect(page.getByTestId('owner-dashboard')).toContainText('Stock value (at cost)');
  await expect(page.getByTestId('owner-dashboard')).toContainText('Rs. 80,000');
  await page.getByRole('button', { name: 'Daily business report' }).click();
  const report = page.getByTestId('daily-business-report');
  await expect(report).toContainText('DAILY BUSINESS REPORT');
  await expect(report).toContainText('Cash in hand');
  await page.getByRole('button', { name: 'Close report' }).click();

  // Automatic backups on the device.
  await goTo(page, 'Admin');
  await page.getByRole('button', { name: /System & Backups/ }).click();
  const panel = page.getByTestId('auto-backups');
  await expect(panel.getByTestId('auto-backup-row').first()).toBeVisible({ timeout: 10_000 }); // the daily one, made after sign-in
  const before = await panel.getByTestId('auto-backup-row').count();
  await panel.getByRole('button', { name: 'Back up now' }).click();
  await expect(panel.getByTestId('auto-backup-row')).toHaveCount(before + 1);
});

test('phone: owner dashboard and approvals fit a 390px screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await goTo(page, 'Owner dashboard');
  await expect(page.getByTestId('owner-dashboard')).toBeVisible();
  await expect(page.getByTestId('sales-trend').or(page.getByText('No bills in the last 30 days.'))).toBeVisible();
  await noSideScroll(page, 'owner dashboard');
  await page.getByTestId('approvals-tile').click();
  await expect(page.getByRole('dialog', { name: 'Approvals' }).getByTestId('approval-request')).toHaveCount(2);
  await noSideScroll(page, 'approvals');
});
