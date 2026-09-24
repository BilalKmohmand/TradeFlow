import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { addPayment, saveAndPrint } from './helpers/bill';
import { signIn } from './helpers/login';

/**
 * Batch 2: pack units, keyboard billing (F-keys, Enter through the bill, type-to-find), split payment
 * with a cheque, print sizes / footer / previous balance, the "stock short" setting and CSV exports.
 */
const seed = () => {
  if (localStorage.getItem('e2e_b2_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_b2_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', companyPhone: '3410550055', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0, allowNegativeStock: false });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 0, creditLimit: 500000, createdAt: today, code: 'Z01' },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: today },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 0, createdAt: today }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '16 L Tin Dalda', category: 'General', unit: 'tin', unitPricePerKg: 1000, stockKg: 44, minThresholdKg: 0, packName: 'carton', packSize: 6, code: 'DT16' },
    { id: 'p2', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2000, stockKg: 5, minThresholdKg: 0 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_cheques_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

test.describe('Batch 2 (desktop)', () => {
  test('keyboard billing: F2, type to find, Enter through fields, cartons, F9 saves; last rate; F3 / F4 / F6', async ({ page }) => {
    await open(page);

    // F2 opens a new bill; other function keys do nothing while it is open.
    await page.keyboard.press('F2');
    const dialog = page.getByRole('dialog', { name: 'New Bill' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('F3');
    await expect(page.getByRole('dialog', { name: 'Receive payment' })).toHaveCount(0);

    // Customer: type the code, see balance / credit left beside it; Enter → first item.
    const cust = dialog.getByLabel('Customer', { exact: true });
    await expect(cust).toBeFocused();
    await page.keyboard.type('z01');
    await expect(cust).toHaveValue('c1');
    await expect(dialog.getByTestId('bill-customer-info')).toContainText('Credit left Rs. 500,000');
    await page.keyboard.press('Enter');
    const item1 = dialog.getByLabel('Item 1', { exact: true });
    await expect(item1).toBeFocused();

    // Item by code, switch the line to cartons, 2.5 cartons at the carton price.
    await page.keyboard.type('dt16');
    await expect(item1).toHaveValue('p1');
    await expect(dialog.getByTestId('line-info-1')).toContainText('Stock 7 ctn + 2 tins');
    await dialog.getByLabel('Unit 1', { exact: true }).selectOption({ label: 'carton (6)' });
    await expect(dialog.getByLabel('Price 1', { exact: true })).toHaveValue('6000');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('2.5');
    await expect(dialog.getByTestId('line-info-1')).toContainText('= 2 cartons + 3 tins');
    await dialog.getByLabel('Quantity 1', { exact: true }).press('Enter');
    await expect(dialog.getByLabel('Price 1', { exact: true })).toBeFocused();
    await page.keyboard.press('Enter'); // Enter on the rate: the line goes into the grid, cursor back at Code
    await expect(dialog.getByTestId('bill-line')).toHaveCount(1);
    await expect(dialog.getByLabel('Code 2', { exact: true })).toBeFocused();
    const item2 = dialog.getByLabel('Item 2', { exact: true });

    // Item by name ("can") in the Code box, Enter → qty, "+" puts the line in the grid.
    await page.keyboard.type('can');
    await page.keyboard.press('Enter');
    await expect(item2).toHaveValue('p2');
    await expect(dialog.getByLabel('Quantity 2', { exact: true })).toBeFocused();
    await page.keyboard.type('2');
    await page.keyboard.press('+');
    await expect(dialog.getByLabel('Code 3', { exact: true })).toBeFocused();
    await page.keyboard.press('Enter'); // empty Code box → "Paid now"
    await expect(dialog.getByLabel('Paid now', { exact: true })).toBeFocused();
    await page.keyboard.type('5000');
    await expect(dialog).toContainText('Rs. 19,000'); // 15,000 + 4,000
    await page.keyboard.press('F9');
    await expect(dialog).toBeHidden();

    // The bill shows cartons + tins; stock is kept in tins.
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    const detail = page.getByRole('dialog', { name: 'Bill INV-1' });
    await expect(detail.getByTestId('line-packs')).toHaveText('2 cartons + 3 tins');
    await expect(detail).toContainText('Rs. 6,000/ctn');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Items & Prices' }).first().click();
    await expect(page.getByTestId('stock-p1')).toContainText('4 ctn + 5 tins'); // 44 − 15 = 29
    await expect(page.getByTestId('stock-p1')).toContainText('29 tin in all');

    // Next bill for the same customer shows the last rate; Ctrl+Enter saves.
    await page.keyboard.press('F2');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c1');
    await expect(dialog.getByTestId('bill-customer-info')).toContainText('INV-1');
    await expect(dialog.getByTestId('bill-customer-info')).toContainText('Last payment Rs. 5,000');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await expect(dialog.getByTestId('line-info-1')).toContainText('Last rate Rs. 1,000/tin');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('1');
    await dialog.getByLabel('Quantity 1', { exact: true }).press('Control+Enter');
    await expect(dialog).toBeHidden();

    // F3 / F4 / F6 on their own.
    await page.keyboard.press('F3');
    await expect(page.getByRole('dialog', { name: 'Receive payment' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('F4');
    await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('F6');
    const rcv = page.getByRole('dialog', { name: 'Receive stock' });
    await expect(rcv).toBeVisible();
    // Receive 2 cartons at Rs. 5,400 a carton → 12 tins at Rs. 900.
    await rcv.getByLabel('Item', { exact: true }).selectOption('p1');
    await rcv.getByRole('group', { name: 'Unit for item 1' }).getByRole('button', { name: 'carton (6)' }).click();
    await rcv.getByLabel('Quantity (carton)', { exact: true }).fill('2');
    await rcv.getByLabel('Cost per carton (optional)', { exact: true }).fill('5400');
    await expect(rcv).toContainText('= 2 cartons • Rs. 900 per tin');
    await rcv.getByRole('button', { name: 'Receive stock' }).click();
    await expect(rcv).toBeHidden();
    await expect(page.getByTestId('stock-p1')).toContainText('6 ctn + 4 tins'); // 28 + 12 = 40
  });

  test('split payment with a cheque, stock-short setting, thermal print with footer, CSV exports', async ({ page }) => {
    await open(page);

    // With "allow short stock" turned off, Save stays off with a clear reason.
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Bill' });
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c2');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p2');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('7');
    await expect(dialog.getByTestId('stock-note-1')).toContainText('Only 5 cans of 5 kgs Can in stock');
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Settings: allow short stock, thermal paper, footer, previous balance.
    await page.getByRole('button', { name: 'Admin' }).first().click();
    await page.getByRole('button', { name: /System & Backups/ }).click();
    const card = page.getByTestId('bill-settings');
    await card.getByLabel('Allow bills when stock is short').check();
    await card.getByLabel('Show previous balance on bill').check();
    await card.getByLabel('Print bills and receipts on').selectOption('thermal80');
    await card.getByLabel('Footer / terms on bills').fill('Goods once sold will not be taken back.');
    await card.getByRole('button', { name: 'Save footer' }).click();

    // Bill 1 (on credit) so the next bill has a previous balance. F2 works from any screen.
    await page.keyboard.press('F2');
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c2');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('3');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    // Bill 2: 7 cans (only 5 in stock → warning, still saves) paid cash + bank + cheque.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('F2');
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c2');
    await expect(dialog.getByTestId('bill-customer-info')).toContainText('Balance Rs. 3,000');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p2');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('7');
    await expect(dialog.getByTestId('stock-note-1')).toContainText('stock will go to -2 cans');
    // Payment Method grid: cash, the bank, and a customer's cheque (Cheques in hand).
    await addPayment(dialog, '1000', '4000');
    await addPayment(dialog, '1010', '3000');
    await addPayment(dialog, '1150', '7000', { keep: true });
    await dialog.getByLabel('Cheque no.', { exact: true }).fill('445566');
    await dialog.getByLabel('Bank', { exact: true }).fill('HBL');
    await expect(dialog).toContainText('Fully paid');
    await saveAndPrint(dialog, 'Mini');
    await expect(dialog).toBeHidden();

    // Thermal receipt: shop name, item, totals, previous balance, footer, thank-you.
    const receipt = page.getByTestId('thermal-receipt');
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText('Rohail Zaman Traders');
    await expect(receipt).toContainText('5 kgs Can');
    await expect(receipt).toContainText('Paid (Cash + Bank Transfer + Cheque)');
    await expect(receipt).toContainText('PAID IN FULL');
    await expect(receipt).toContainText('Previous balance');
    await expect(receipt).toContainText('Goods once sold will not be taken back.');
    await expect(receipt).toContainText('Thank you for your business!');
    await page.keyboard.press('Escape');

    // Negative stock in red on Items.
    await page.getByRole('button', { name: 'Items & Prices' }).first().click();
    await expect(page.getByTestId('stock-p2')).toHaveAttribute('data-negative', 'true');
    await expect(page.getByTestId('stock-p2')).toContainText('-2 can');

    // The cheque is in the register (in hand), not in the bank.
    await page.getByRole('button', { name: 'Money' }).first().click();
    await page.getByRole('button', { name: 'Cheques' }).first().click();
    await expect(page.getByTestId('cheques-tab').getByTestId('cheque-row').filter({ hasText: '445566' })).toContainText('In hand');
    const chqCsv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download cheques CSV' }).click();
    expect(readFileSync(await (await chqCsv).path(), 'utf8')).toContain('445566');

    // Daily sheet: cash in 4,000, bank in 3,000; CSV has the bill and the cheque.
    await page.getByRole('button', { name: 'Daily Sheet' }).first().click();
    await expect(page.getByRole('heading', { name: 'Daily Sheet' })).toBeVisible();
    await expect(page.getByText('Rs. 4,000').first()).toBeVisible();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download daily sheet CSV' }).click();
    const download = await dl;
    expect(download.suggestedFilename()).toMatch(/^daily-sheet-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync(await download.path(), 'utf8');
    expect(csv).toContain('"Bill","INV-2","Haji Karim"');
    expect(csv).toContain('"Cheque received","445566"');

    // Accounts: trial balance CSV (balanced totals).
    await page.getByRole('button', { name: 'Accounts', exact: true }).first().click();
    const tbDl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download trial balance CSV' }).click();
    const tb = readFileSync(await (await tbDl).path(), 'utf8').trim().split('\n');
    const total = tb[tb.length - 1].split(',');
    expect(total[1]).toBe('"Total"');
    expect(total[2]).toBe(total[3]);
  });
});
