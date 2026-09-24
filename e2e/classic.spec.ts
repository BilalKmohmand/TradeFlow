import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';

/**
 * The "Apna Accountant" layer in the real app: the classic menu (16 buttons) on Home and under More,
 * Sale Invoice with memo no. / delivery order / search, the Pending Delivery List, Purchase Invoice
 * with discount and other charges, the Reports hub, F9 → Cash Book and the F-keys in Cmd+K.
 */
const seed = () => {
  if (localStorage.getItem('e2e_classic_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_classic_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 20000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', code: 'C-0001', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', code: 'S-0001', name: 'Ahmed', company: 'Dalda Foods', phone: '0300 1234567', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', code: '101', name: '16 L Tin Dalda', category: 'Oil', unit: 'tin', unitPricePerKg: 7000, costPricePerKg: 6000, stockKg: 20, minThresholdKg: 5 },
    { id: 'p2', code: '102', name: '5 L Can Habib', category: 'Oil', unit: 'can', packName: 'carton', packSize: 4, unitPricePerKg: 2400, costPricePerKg: 2000, stockKg: 8, minThresholdKg: 10 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2'].forEach((k) => localStorage.setItem(k, '[]'));
};

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

async function noSideScroll(page: Page, label: string) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(r.sw, `${label}: page is wider than the screen`).toBeLessThanOrEqual(r.w);
}

test.describe('Classic menu and reports on desktop', () => {
  test('all 16 classic buttons open something', async ({ page }) => {
    await open(page);
    const menu = page.getByTestId('classic-menu');
    await expect(menu).toBeVisible();
    const h1 = (name: string) => page.getByRole('heading', { level: 1, name, exact: true });
    const checks: [string, () => Promise<void>][] = [
      ['Product Coding', () => expect(h1('Items & Prices')).toBeVisible()],
      ['Sale Invoice', async () => { await expect(page.getByRole('dialog', { name: 'New Bill' })).toBeVisible(); await page.keyboard.press('Escape'); }],
      ['Purchase Invoice', async () => { await expect(page.getByRole('dialog', { name: 'Purchase Invoice' })).toBeVisible(); await page.keyboard.press('Escape'); }],
      ['Product List', () => expect(h1('Product List / Rate List')).toBeVisible()],
      ['Daily Gross Profit', () => expect(h1('Daily Gross Profit')).toBeVisible()],
      ['Daily Sale', () => expect(h1('Daily Sale')).toBeVisible()],
      ['Daily Purchase', () => expect(h1('Daily Purchase')).toBeVisible()],
      ['Stock In Hand', () => expect(h1('Stock In Hand')).toBeVisible()],
      ['Accounts Coding', () => expect(page.getByRole('tab', { name: 'Chart of accounts', selected: true })).toBeVisible()],
      ['Account Ledger', () => expect(page.getByRole('tab', { name: 'Account ledger', selected: true })).toBeVisible()],
      ['Cheque Deposits Bank', async () => { await expect(h1('Money')).toBeVisible(); await expect(page.getByRole('button', { name: 'Cheques', exact: true })).toHaveAttribute('aria-pressed', 'true'); }],
      ['Books', async () => { await expect(h1('Books')).toBeVisible(); await expect(page.getByTestId('books-menu').getByRole('button', { name: /Cash Book/ })).toBeVisible(); }],
      ['Vouchers', () => expect(page.getByRole('tab', { name: 'Vouchers', selected: true })).toBeVisible()],
      ['Trial Balances', () => expect(h1('Trial Balance')).toBeVisible()],
      ['Profit & Loss', () => expect(h1('Profit And Loss')).toBeVisible()],
      ['Balance Sheet', () => expect(h1('Balance Sheet')).toBeVisible()],
    ];
    for (const [label, check] of checks) {
      await goTo(page, 'Home');
      await menu.getByRole('button', { name: label, exact: true }).click();
      await check();
    }
    // The switch in Admin hides it.
    await goTo(page, 'Admin');
    await page.getByRole('button', { name: /System & Backups/ }).click();
    await page.getByTestId('bill-settings').getByLabel('Show the classic menu').uncheck();
    await goTo(page, 'Home');
    await expect(page.getByTestId('classic-menu')).toHaveCount(0);
  });

  test('sale invoice: memo no., delivery order → pending list → delivered with challan; search; F9; Cmd+K keys', async ({ page }) => {
    await open(page);
    await page.getByTestId('classic-menu').getByRole('button', { name: 'Sale Invoice', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'New Bill' });
    await expect(dialog.getByTestId('bill-next-number')).toHaveText('INV-1');
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c1');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('3');
    await expect(dialog.getByTestId('bill-stock-in-hand')).toContainText('16 L Tin Dalda');
    await expect(dialog.getByTestId('bill-stock-in-hand')).toContainText('20 tins');
    await dialog.getByLabel('Memo No', { exact: true }).fill('BK-77');
    await dialog.getByLabel('Delivery Order').check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    // Bills: found by memo no., marked "to deliver".
    await goTo(page, 'Bills');
    await page.getByLabel('Search bills').fill('bk-77');
    await expect(page.getByText('To deliver')).toBeVisible();
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    const detail = page.getByRole('dialog', { name: 'Bill INV-1' });
    await expect(detail.getByTestId('bill-entered-on')).toContainText('Memo No BK-77');
    await expect(detail.getByTestId('bill-entered-on')).toContainText('entered on');
    await expect(detail.getByTestId('bill-delivery')).toContainText('waiting for delivery');
    await page.keyboard.press('Escape');

    // Pending Delivery List (Reports hub) → Mark delivered → challan printed with driver and vehicle.
    await goTo(page, 'Reports');
    await page.getByRole('region', { name: 'Pending Delivery' }).getByRole('button', { name: /Pending Delivery List Report/ }).click();
    const report = page.getByTestId('report-pending-delivery');
    await expect(report.getByTestId('report-table')).toContainText('INV-1');
    await expect(report.getByTestId('report-table')).toContainText('BK-77');
    await report.getByRole('button', { name: 'Print', exact: true }).click();
    await expect(page.getByTestId('classic-title')).toHaveText('Pending Delivery List');
    await expect(page.locator('#print-root')).toContainText('Rohail Zaman Traders');
    await page.getByRole('button', { name: 'Close preview' }).click();
    await report.getByRole('button', { name: 'Mark INV-1 delivered' }).click();
    const dlv = page.getByRole('dialog', { name: 'Mark delivered: INV-1' });
    await dlv.getByLabel('Delivered by').fill('Rashid');
    await dlv.getByLabel('Vehicle no.').fill('les-1234');
    await dlv.getByRole('button', { name: /Delivered & print challan/ }).click();
    await expect(page.locator('#print-root')).toContainText('DELIVERY CHALLAN');
    await expect(page.locator('#print-root')).toContainText('Rashid');
    await expect(page.locator('#print-root')).toContainText('LES-1234');
    await page.getByRole('button', { name: 'Close preview' }).click();
    await expect(report.getByTestId('report-table')).toContainText('Nothing is waiting for delivery.');
    await report.getByRole('button', { name: 'Delivered', exact: true }).click();
    await expect(report.getByTestId('report-table')).toContainText('by Rashid (LES-1234)');

    // Search from the bill form opens the old bill in the same form, to change it (same number).
    await goTo(page, 'Home');
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    dialog = page.getByRole('dialog', { name: 'New Bill' });
    await expect(dialog.getByTestId('bill-next-number')).toHaveText('INV-2');
    await dialog.getByLabel('Search old bill').fill('1');
    await dialog.getByLabel('Search old bill').press('Enter');
    const found = page.getByRole('dialog', { name: 'Edit bill INV-1' });
    await expect(found).toBeVisible();
    await expect(found.getByTestId('bill-next-number')).toHaveText('INV-1');
    await expect(found.getByTestId('bill-line')).toHaveCount(1);
    await expect(found.getByLabel('Memo No', { exact: true })).toHaveValue('BK-77');
    await expect(found.getByLabel('Delivery Order')).toBeChecked();
    await page.keyboard.press('Escape');

    // F9 opens the Cash Book (the 3 tins were on credit, so only the opening cash).
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('F9');
    await expect(page.getByRole('heading', { level: 1, name: 'Cash Book' })).toBeVisible();
    await expect(page.getByTestId('summary-Opening cash')).toHaveText('Rs. 20,000');

    // Cmd+K documents the function keys.
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-bar-fkeys')).toContainText('F9');
    await expect(page.getByTestId('command-bar-fkeys')).toContainText('Cash Book');
    await page.keyboard.press('Escape');
  });

  test('purchase invoice with discount and other charges; list, search, print; books stay balanced', async ({ page }) => {
    await open(page);
    await page.getByTestId('classic-menu').getByRole('button', { name: 'Purchase Invoice', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Purchase Invoice' });
    await expect(form.getByTestId('pi-number')).toHaveText('P-1');
    await form.getByLabel('Supplier', { exact: true }).selectOption('s1');
    await form.getByLabel('Memo No (supplier bill no.)').fill('DF-4471');
    await form.getByLabel('Product 1', { exact: true }).selectOption('p1');
    await form.getByLabel('Qty 1', { exact: true }).fill('10');
    await form.getByLabel('Rate 1', { exact: true }).fill('6000');
    await form.getByRole('button', { name: 'Add another item' }).click();
    await form.getByLabel('Product 2', { exact: true }).selectOption('p2');
    await form.getByLabel('Unit 2', { exact: true }).selectOption('pack');
    await form.getByLabel('Qty 2', { exact: true }).fill('2');
    await form.getByLabel('Rate 2', { exact: true }).fill('8000');
    await expect(form.getByTestId('pi-amount-2')).toHaveText('16,000.00');
    await form.getByLabel('Discount %').fill('5');
    await form.getByLabel('Other charges (Rs.)').fill('1520');
    await form.getByLabel('Paid now').fill('20000');
    await expect(form.getByTestId('pi-total')).toHaveText('Rs. 73,720');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Purchase Invoice P-1' });
    await expect(detail.getByTestId('pid-total')).toHaveText('Rs. 73,720');
    await expect(detail).toContainText('landed Rs. 5,820');
    await detail.getByRole('button', { name: 'Print A5' }).click();
    await expect(page.getByTestId('print-purchase-invoice')).toContainText('DF-4471');
    expect(await page.getByTestId('print-page').textContent()).toContain('size: A5');
    await page.getByRole('button', { name: 'Close preview' }).click();
    await page.keyboard.press('Escape');

    // The list finds it by the supplier's bill no.
    await goTo(page, 'Purchase invoices');
    await page.getByLabel('Search purchase invoices').fill('4471');
    await expect(page.getByTestId('purchase-invoice-list')).toContainText('P-1');
    await expect(page.getByTestId('purchase-invoice-list')).toContainText('Rs. 73,720');

    // Reports: supplier owed 53,720; stock valued at landed cost; trial balance balanced.
    await goTo(page, 'Reports');
    await page.getByRole('button', { name: /^Payable/ }).first().click();
    await expect(page.getByTestId('report-table')).toContainText('Dalda Foods');
    await expect(page.getByTestId('report-totals')).toContainText('53,720');
    await page.getByRole('button', { name: 'Reports', exact: true }).last().click();
    await page.getByRole('button', { name: /^Trial Balance$/ }).click();
    await expect(page.getByTestId('summary-Balanced')).toHaveText('Debit = Credit');
    await page.getByRole('button', { name: 'Reports', exact: true }).last().click();
    await page.getByRole('button', { name: /^Daily Purchase/ }).click();
    await expect(page.getByTestId('report-totals')).toContainText('73,720');
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await expect(page.getByTestId('classic-title')).toHaveText('Daily Purchase');
    await page.getByRole('button', { name: 'Close preview' }).click();
  });
});

test.describe('Classic menu on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('compact grid under More opens the reports; nothing scrolls sideways', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('classic-menu')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    const grid = sheet.getByTestId('classic-menu-compact');
    await expect(grid.getByRole('button')).toHaveCount(16);
    await noSideScroll(page, 'More sheet');
    await grid.getByRole('button', { name: 'Stock In Hand', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Stock In Hand' })).toBeVisible();
    await expect(page.getByTestId('report-table')).toContainText('16 L Tin Dalda');
    await noSideScroll(page, 'Stock In Hand');
    await goTo(page, 'Reports');
    await expect(page.getByTestId('reports-menu')).toBeVisible();
    await page.getByRole('button', { name: /^Low Stock/ }).click();
    await expect(page.getByTestId('report-table')).toContainText('5 L Can Habib');
    await noSideScroll(page, 'Low Stock');
  });
});
