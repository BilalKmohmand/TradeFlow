import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';

/** Billing shop: tins bought from Dalda, one bill this week and an old unpaid bill from 75 days ago. */
const seedShop = () => {
  if (localStorage.getItem('e2e_stock_reports_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_stock_reports_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().split('T')[0];
  const today = day(0);
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', companyPhone: '3410550055', cashOpeningBalance: 20000, openingBankBalance: 0, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 65350, creditLimit: 0, createdAt: day(120) },
    { id: 'c2', name: 'Old Khan Store', company: 'Old Khan Store', phone: '03001112223', email: '', address: 'Swat', totalDue: 13070, creditLimit: 0, createdAt: day(120) },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 240000, createdAt: day(120) }]);
  set('tradeflow_products_v2', [{ id: 'p2', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 28, minThresholdKg: 5 }]);
  set('tradeflow_purchases_v2', [{ id: 'pur1', receiptNumber: 'GRN-2026-101', supplierId: 's1', productId: 'p2', kg: 40, pricePerKg: 6000, amount: 240000, date: day(80), createdAt: day(80) }]);
  const line = (id: string, qty: number) => ({ id, productId: 'p2', productName: '15.7 kgs Tin', kg: qty, qty, ratePerKg: 6535, unitPrice: 6535, unit: 'tin', costPricePerKg: 6000, amount: qty * 6535 });
  const bill = (id: string, no: string, cust: string, name: string, date: string, qty: number) => ({
    id, invoiceNumber: no, customerId: cust, customerName: name, issueDate: date, dueDate: date, status: 'issued', paymentStatus: 'unpaid', items: [line(`${id}-l`, qty)],
    subtotal: qty * 6535, taxRatePct: 0, taxAmount: 0, discount: 0, totalAmount: qty * 6535, paidAmount: 0, balanceDue: qty * 6535, payments: [], createdAt: date, billKind: 'credit', paymentMethod: 'Credit',
  });
  set('tradeflow_invoices_v1', [bill('inv1', 'INV-1', 'c2', 'Old Khan Store', day(75), 2), bill('inv2', 'INV-2', 'c1', 'Zaman and Co BTK', today, 10)]);
  set('tradeflow_ledger_v2', [
    { id: 'l0', entityType: 'supplier', entityId: 's1', type: 'purchase_received', referenceId: 'GRN-2026-101', date: day(80), description: 'Stock received GRN-2026-101', debit: 240000, credit: 0, balanceAfter: 240000, kg: 40 },
    { id: 'l1', entityType: 'customer', entityId: 'c2', type: 'bill_issued', referenceId: 'INV-1', sourceId: 'inv1', date: day(75), description: 'Bill INV-1', debit: 13070, credit: 0, balanceAfter: 13070 },
    { id: 'l2', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV-2', sourceId: 'inv2', date: today, description: 'Bill INV-2', debit: 65350, credit: 0, balanceAfter: 65350 },
  ]);
  set('tradeflow_expenses_v2', []);
  set('tradeflow_cash_entries_v2', []);
};

async function unlock(page: Page) {
  await signIn(page); // owner "bilal" / Sarmaya@2026 (see e2e/helpers/users.ts)
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

const noSideScroll = async (page: Page, label: string) => {
  const scrolled = await page.evaluate(() => {
    window.scrollTo(10000, window.scrollY);
    const x = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return x;
  });
  expect(scrolled, `${label}: page must not scroll sideways`).toBe(0);
};

const go = (page: Page, name: RegExp) => page.getByRole('button', { name }).first().click();

async function flow(page: Page) {
  await unlock(page);

  // Home warns about money owed for more than 60 days.
  await expect(page.getByTestId('overdue-60')).toContainText('Old Khan Store');
  await noSideScroll(page, 'home');

  // 1. Tap an item: its history lists the receipt and both bills with a running balance.
  await go(page, /^Items( & Prices)?$/);
  await page.getByRole('button', { name: 'History of 15.7 kgs Tin' }).click();
  const hist = page.getByRole('dialog', { name: '15.7 kgs Tin — history' });
  const list = hist.getByTestId('item-history');
  await expect(list).toContainText('Received from Dalda Foods');
  await expect(list).toContainText('Sold on bill INV-1');
  await expect(list).toContainText('Sold on bill INV-2');
  await expect(list.locator('li').first()).toContainText('bal 28');
  await noSideScroll(page, 'item history');

  // 2. Adjust stock from the history: two tins leaked.
  await hist.getByRole('button', { name: 'Adjust stock' }).click();
  const adj = page.getByRole('dialog', { name: 'Adjust stock' });
  await adj.getByRole('radio', { name: 'Leaked' }).click();
  await adj.getByLabel(/^Quantity lost/).fill('2');
  await adj.getByLabel('Note', { exact: true }).fill('back row');
  await expect(adj.getByTestId('adjust-preview')).toContainText('26 tin');
  await noSideScroll(page, 'adjust stock');
  await adj.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(adj).toBeHidden();
  await expect(list.locator('li').first()).toContainText('Adjusted: Leaked');
  await expect(list.locator('li').first()).toContainText('bal 26');
  await hist.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('cell', { name: '26 tin', exact: true })).toBeVisible();

  // 3. Suppliers (billing screen, no dispatch or bookings): send 3 tins back and print the debit note.
  await go(page, /^Suppliers$/);
  await expect(page.getByRole('heading', { name: 'Suppliers' })).toBeVisible();
  await expect(page.getByText('Purchase Orders')).toHaveCount(0);
  await noSideScroll(page, 'suppliers');
  await page.getByRole('button', { name: 'Return goods' }).first().click();
  const ret = page.getByRole('dialog', { name: 'Return goods to supplier' });
  await ret.getByLabel('Supplier', { exact: true }).selectOption('s1');
  await ret.getByLabel('Item', { exact: true }).selectOption('p2');
  await expect(ret.getByLabel(/^Rate per/)).toHaveValue('6000');
  await ret.getByLabel(/^Quantity/).fill('3');
  await ret.getByLabel('Reason', { exact: true }).fill('dented tins');
  await expect(ret.getByTestId('return-amount')).toContainText('Rs. 18,000');
  await noSideScroll(page, 'return goods');
  await ret.getByRole('button', { name: 'Send back' }).click();
  await expect(page.getByRole('dialog', { name: 'Goods sent back' })).toContainText('DN-1');
  await page.getByRole('button', { name: 'Print debit note' }).click();
  const printed = page.locator('#print-root');
  await expect(printed).toContainText('DEBIT NOTE');
  await expect(printed).toContainText('Dalda Foods');
  await expect(printed).toContainText('18,000');
  await page.getByRole('button', { name: 'Close preview' }).click();
  await page.getByRole('dialog', { name: 'Goods sent back' }).getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('you owe Rs. 222,000')).toBeVisible();

  // 4. Purchase register: the receipt and the return, with a net total.
  await page.getByRole('tab', { name: 'Stock received' }).click();
  await page.getByLabel('From', { exact: true }).fill('2026-01-01');
  const reg = page.getByTestId('purchase-register');
  await expect(reg).toContainText('GRN-2026-101');
  await expect(reg).toContainText('DN-1');
  await expect(reg).toContainText('222,000');
  await noSideScroll(page, 'purchase register');

  // 5. Aging from Money: the old bill sits in 61–90 days.
  await go(page, /^Money$/);
  await page.getByRole('button', { name: 'How long?' }).first().click();
  const aging = page.getByRole('dialog', { name: 'Who owes for how long' });
  await expect(aging.getByTestId('aging-table')).toContainText('Old Khan Store');
  await expect(aging.getByTestId('aging-table').locator('tr', { hasText: 'Old Khan Store' })).toContainText('13,070');
  await noSideScroll(page, 'aging');
  await aging.getByRole('button', { name: 'Close' }).click();

  // 6. Profit by item in Accounts.
  await go(page, /^Accounts$/);
  await page.getByRole('tab', { name: 'Profit by item' }).click();
  await page.getByLabel('From', { exact: true }).fill('2026-01-01');
  const profit = page.getByTestId('profit-by-item');
  await expect(profit.locator('tr', { hasText: '15.7 kgs Tin' })).toContainText('6,420'); // 12 × (6,535 − 6,000)
  await noSideScroll(page, 'profit report');
}

test.describe('Stock history, adjustments, purchase returns and reports (billing)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seedShop);
  });

  test('desktop', async ({ page }) => {
    await flow(page);
    // Cmd+K offers billing actions, not trading ones.
    await page.keyboard.press('Control+k');
    const search = page.getByRole('textbox', { name: 'Search' });
    await expect(search).toBeVisible();
    await expect(page.getByText('New bill', { exact: true })).toBeVisible();
    await expect(page.getByText('Receive stock', { exact: true })).toBeVisible();
    await expect(page.getByText('Log Truck Dispatch')).toHaveCount(0);
    await expect(page.getByText(/Reports & Financial Exports/)).toHaveCount(0);
    await search.fill('new bill');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'New Bill' })).toBeVisible();
  });
});

test.describe('Stock reports on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seedShop);
  });

  test('same flow fits a 390px screen', async ({ page }) => {
    await flow(page);
  });
});
