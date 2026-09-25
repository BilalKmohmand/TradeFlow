import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo, openMenuOption } from './helpers/nav';

/**
 * Receive from many: the sheet has one voucher number (CS-n) and every customer line gets its own receipt
 * number from the Receipt series (after the PAY-1 already used), shown before saving, printed one slip per
 * line, and listed on the customer.
 */
const seed = () => {
  if (localStorage.getItem('e2e_rmr_seeded')) return;
  localStorage.setItem('e2e_rmr_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', companyPhone: '3410550055', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  const c = (id: string, code: string, name: string, due: number) => ({ id, code, name, company: name, phone: '', email: '', address: 'Batkhela', totalDue: due, creditLimit: 0, createdAt: day(120) });
  set('tradeflow_customers_v2', [c('c1', 'Z01', 'Zaman and Co BTK', 9000), c('c2', 'K02', 'Old Khan Store', 8000), c('c3', 'N03', 'Noor Kiryana', 7000)]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', []);
  const bill = (id: string, cid: string, amt: number) => ({ id, entityType: 'customer', entityId: cid, type: 'bill_issued', referenceId: `OLD-${id}`, date: day(20), description: 'Old bill', debit: amt, credit: 0, balanceAfter: amt });
  set('tradeflow_ledger_v2', [
    { id: 'p1', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'PAY-1', date: day(5), description: 'Payment received: Cash', method: 'Cash', debit: 0, credit: 1000, balanceAfter: 9000 },
    bill('g1', 'c1', 10000), bill('g2', 'c2', 8000), bill('g3', 'c3', 7000),
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_cheques_v1', 'tradeflow_salesmen_v1', 'tradeflow_areas_v1', 'tradeflow_schemes_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

async function addLine(page: Page, n: number, code: string, amount: string, method?: string) {
  const dlg = page.getByRole('dialog', { name: 'Receive from many' });
  await dlg.getByLabel(`Line ${n} code`).fill(code);
  await dlg.getByLabel(`Line ${n} code`).press('Enter');
  await dlg.getByLabel(`Line ${n} amount`).fill(amount);
  if (method) await dlg.getByLabel(`Line ${n} method`).selectOption(method);
  await dlg.getByRole('button', { name: 'Add row' }).click();
  await expect(dlg.getByTestId('receive-many-row')).toHaveCount(n);
}

test('receive from many: voucher CS-1, a receipt number per line, print receipts, customer shows the receipt no.', async ({ page }) => {
  await open(page);
  await openMenuOption(page, 'Accounts', 'Receive from many');
  const dlg = page.getByRole('dialog', { name: 'Receive from many' });
  await expect(dlg.getByText('Voucher # / Receipt no.')).toBeVisible();
  await expect(dlg.getByTestId('rm-next-number')).toHaveText('CS-1');
  await expect(dlg.getByText('Receipt no.', { exact: true })).toBeVisible(); // the grid's column
  // The entry row shows the number the first line will get, after the PAY-1 already used.
  await expect(dlg.getByTestId('rm-receipt-no-1')).toHaveText('PAY-2');

  await addLine(page, 1, 'Z01', '1000');
  await addLine(page, 2, 'K02', '2000', 'Bank Transfer');
  await addLine(page, 3, 'N03', '3000');
  await expect(dlg.getByTestId('rm-receipt-no-1')).toHaveText('PAY-2');
  await expect(dlg.getByTestId('rm-receipt-no-2')).toHaveText('PAY-3');
  await expect(dlg.getByTestId('rm-receipt-no-3')).toHaveText('PAY-4');
  await expect(dlg.getByTestId('rm-receipt-no-4')).toHaveText('PAY-5'); // the (empty) entry row
  // Removing a line renumbers what is shown; nothing is used up before saving.
  await dlg.getByRole('button', { name: 'Remove line 2' }).click();
  await expect(dlg.getByTestId('rm-receipt-no-2')).toHaveText('PAY-3');
  await addLine(page, 3, 'K02', '2000', 'Bank Transfer');
  await expect(dlg.getByTestId('receive-many-total')).toHaveText('Rs. 6,000');

  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  const done = page.getByRole('dialog', { name: 'Money received' });
  await expect(done).toContainText(/6,000 received from 3 customers \(CS-1, receipts PAY-2 to PAY-4\)/);
  await expect(done.getByTestId('rm-saved-receipt-no')).toHaveText(['PAY-2', 'PAY-3', 'PAY-4']);

  // Print receipts: one slip per customer line.
  await done.getByRole('button', { name: 'Print receipts' }).click();
  const root = page.locator('#print-root');
  await expect(root.getByTestId('receipt-slip')).toHaveCount(3);
  await expect(root.getByTestId('slip-receipt-no')).toHaveText(['PAY-2', 'PAY-3', 'PAY-4']);
  const slip2 = root.getByTestId('receipt-slip').nth(2);
  await expect(slip2).toContainText('Old Khan Store');
  await expect(slip2).toContainText('K02');
  await expect(slip2).toContainText('Bank Transfer');
  await expect(slip2).toContainText('Rs. 2,000');
  await expect(slip2).toContainText('CS-1');
  await expect(slip2).toContainText('Rohail Zaman Traders');
  await expect(slip2).toContainText('Payer signature');
  await page.getByRole('button', { name: 'Close preview' }).click();

  // One line's receipt on its own.
  await done.getByRole('button', { name: 'Print receipt PAY-3' }).click();
  await expect(root.getByTestId('receipt-slip')).toHaveCount(1);
  await expect(root.getByTestId('slip-receipt-no')).toHaveText('PAY-3');
  await expect(root).toContainText('Noor Kiryana');
  await page.getByRole('button', { name: 'Close preview' }).click();

  // The collection sheet keeps CS-1 and lists each line's receipt number.
  await done.getByRole('button', { name: 'Print collection sheet' }).click();
  await expect(root).toContainText('CS-1');
  await expect(root.getByTestId('print-collection')).toContainText('PAY-4');
  await page.getByRole('button', { name: 'Close preview' }).click();
  await done.getByRole('button', { name: 'Done' }).click();

  // The customer's Money received shows the line's own receipt number, and Edit payment keeps it.
  await goTo(page, 'Customers');
  await page.getByRole('button', { name: /Old Khan Store/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Old Khan Store' });
  await expect(sheet.getByTestId('payment-no').first()).toHaveText('PAY-4');
  await expect(sheet).toContainText('voucher CS-1');
  await sheet.getByRole('button', { name: 'Edit payment PAY-4' }).click();
  const ed = page.getByRole('dialog', { name: 'Edit payment PAY-4' });
  await ed.getByLabel('Amount').fill('2500');
  await ed.getByRole('button', { name: 'Save changes' }).click();
  await expect(ed).toBeHidden();
  await expect(sheet.getByTestId('payment-no').first()).toHaveText('PAY-4');
  await page.keyboard.press('Escape');

  // Cash book lists it under the same receipt number.
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Cash book', exact: true }).click();
  await expect(page.getByTestId('cashbook-ref').filter({ hasText: /^PAY-2$/ })).toHaveCount(1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tradeflow_ledger_v2') || '[]'));
  const rows = stored.filter((l: { referenceId: string }) => l.referenceId === 'CS-1');
  expect(rows.map((l: { receiptNo: string }) => l.receiptNo).sort()).toEqual(['PAY-2', 'PAY-3', 'PAY-4']);
});
