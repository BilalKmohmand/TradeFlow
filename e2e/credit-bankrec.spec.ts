import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';

/**
 * Credit limits on bills + bank reconciliation.
 * Books (bank side): opening 100,000; +30,000 cash deposited (transfer); +15,000 cheque from a customer;
 * −5,000 rent by bank transfer; −8,000 cheque to a supplier that has not cleared yet.
 * Statement: the first three (dates a little off), plus a −250 bank charge the books don't have.
 * Closing balance on the statement: 139,750.
 */
const seed = () => {
  if (localStorage.getItem('e2e_credit_seeded')) return;
  localStorage.setItem('e2e_credit_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Limited Traders', company: 'Limited Traders', phone: '03001111111', email: '', address: '', totalDue: 8000, creditLimit: 10000, createdAt: today },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: today },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 0, createdAt: today }]);
  set('tradeflow_products_v2', [{ id: 'p1', name: 'Oil tin', category: 'General', unit: 'tin', unitPricePerKg: 1000, stockKg: 500, minThresholdKg: 0 }]);
  set('tradeflow_invoices_v1', []);
  set('tradeflow_ledger_v2', [
    { id: 'led-chq-in', entityType: 'customer', entityId: 'c2', type: 'payment_received', referenceId: 'PAY-1', date: '2026-03-03', description: 'Payment received: Cheque', debit: 0, credit: 15000, balanceAfter: 0, method: 'Cheque' },
    { id: 'led-chq-out', entityType: 'supplier', entityId: 's1', type: 'payment_made', referenceId: 'PAY-2', date: '2026-03-06', description: 'Payment made: Cheque 555', debit: 0, credit: 8000, balanceAfter: 0, method: 'Cheque' },
  ]);
  set('tradeflow_expenses_v2', [{ id: 'exp-rent', date: '2026-03-04', category: 'rent', amount: 5000, description: 'Shop rent March', paidVia: 'Bank Transfer', createdAt: '2026-03-04' }]);
  set('tradeflow_cash_entries_v2', [
    { id: 'cash-dep-out', date: '2026-03-02', direction: 'out', amount: 30000, description: 'Deposited cash to bank', method: 'Cash', createdAt: '2026-03-02', pairId: 'xfer-1' },
    { id: 'cash-dep-in', date: '2026-03-02', direction: 'in', amount: 30000, description: 'Deposited cash to bank', method: 'Bank Transfer', createdAt: '2026-03-02', pairId: 'xfer-1' },
  ]);
};

const CSV = [
  'Date,Description,Amount',
  '02/03/2026,Cash deposit,"30,000"',
  '04/03/2026,Clearing chq 123,15000',
  '06/03/2026,IBFT rent,-5000',
  '2026-03-05,Bank charges,-250',
].join('\n');

async function unlock(page: Page) {
  await signIn(page); // owner "bilal" / Sarmaya@2026 (see e2e/helpers/users.ts)
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

const noOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(0);
};

async function reconcile(page: Page, opts: { mobile?: boolean } = {}) {
  await page.getByRole('button', { name: 'Money', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible();
  await page.getByRole('button', { name: 'Bank reconciliation' }).click();
  const tab = page.getByTestId('bank-rec');
  await expect(tab.getByText('Check your bank statement')).toBeVisible();
  if (opts.mobile) await noOverflow(page, 'bank reconciliation (empty)');

  // Upload the CSV → mapping step guessed from the headings → import.
  await page.getByTestId('bank-csv-input').setInputFiles({ name: 'statement-march.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  const mapping = page.getByTestId('bank-mapping');
  await expect(mapping).toContainText('statement-march.csv');
  await expect(mapping).toContainText('4 lines ready');
  if (opts.mobile) await noOverflow(page, 'bank mapping');
  await mapping.getByRole('button', { name: 'Import 4 lines' }).click();
  await expect(tab.getByText('4 lines added. 3 matched automatically.')).toBeVisible();
  await expect(tab.getByRole('button', { name: 'Matched (3)' })).toBeVisible();
  await expect(tab.getByRole('button', { name: 'Not matched (1)' })).toBeVisible();
  const deposit = tab.getByTestId('bank-line').filter({ hasText: 'Cash deposit' });
  await expect(deposit).toContainText('Sure — same day');
  await expect(tab.getByTestId('bank-line').filter({ hasText: 'IBFT rent' })).toContainText('Likely — 2–3 days apart');

  // Closing balance before the charge is recorded: the 250 is listed as "not in your books", still reconciles.
  await page.getByLabel('Closing balance on statement').fill('139750');
  await expect(page.getByTestId('bank-summary')).toContainText('In your books, not on the statement yet (1)');
  await expect(page.getByTestId('bank-summary')).toContainText('Dalda Foods');

  // Create the missing bank-charges expense from the unmatched line.
  const charge = tab.getByTestId('bank-line').filter({ hasText: 'Bank charges' });
  await charge.getByRole('button', { name: 'Add as expense' }).click();
  await expect(charge.getByLabel('Expense type')).toHaveValue('bank_charges');
  if (opts.mobile) await noOverflow(page, 'bank create expense');
  await charge.getByRole('button', { name: 'Add expense' }).click();
  await expect(tab.getByText(/Expense of .* added/)).toBeVisible();
  await expect(tab.getByRole('button', { name: 'Matched (4)' })).toBeVisible();
  await expect(charge).toContainText('Matched');

  const status = page.getByTestId('rec-status');
  await expect(status).toContainText('Reconciled ✓');
  await expect(page.getByTestId('bank-summary')).toContainText('Rs. 131,750');
  if (opts.mobile) await noOverflow(page, 'bank reconciled');

  // A wrong closing balance shows the gap.
  await page.getByLabel('Closing balance on statement').fill('139000');
  await expect(status).toContainText('Off by Rs. 750');
  await page.getByLabel('Closing balance on statement').fill('139750');
  await expect(status).toContainText('Reconciled ✓');
  await page.getByTestId('bank-summary').getByRole('button', { name: 'Save' }).click();
  await expect(tab.getByText('Bank reconciled to')).toBeVisible();

  // The expense really exists in the Expense sheets.
  await page.getByRole('button', { name: 'Expense sheets' }).click();
  await page.getByLabel('Month').fill('2026-03');
  await expect(page.getByText('Bank charges sheet')).toBeVisible();

  // Printable report.
  await page.getByRole('button', { name: 'Bank reconciliation' }).click();
  await page.getByTestId('bank-summary').getByRole('button', { name: 'Print' }).click();
  const print = page.locator('#print-root');
  await expect(print).toContainText('BANK RECONCILIATION');
  await expect(print).toContainText('Reconciled ✓');
  await expect(print).toContainText('Cheque 555');
  if (opts.mobile) await noOverflow(page, 'bank print preview');
  await page.keyboard.press('Escape');
  await expect(print).toHaveCount(0);
}

test.describe('Credit limits and bank reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seed);
  });

  test('desktop: credit limit blocks, override records reason; customers + home flag it', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Bill' });
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c1');
    const credit = dialog.getByTestId('bill-credit');
    await expect(credit).toContainText('Credit limit Rs. 10,000 · owes Rs. 8,000 · available Rs. 2,000');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('3');
    await expect(credit.getByRole('alert')).toContainText('Over the credit limit');
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    // Paying part now brings it under the limit.
    await dialog.getByLabel('Paid now').fill('1000');
    await expect(credit.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await dialog.getByLabel('Paid now').fill('');
    await expect(credit.getByRole('alert')).toBeVisible();

    // Admin may allow it, with a reason.
    await credit.getByLabel('Allow over limit').check();
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await credit.getByLabel('Reason for allowing over limit').fill('Old customer, pays Friday');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // Home: needs attention.
    await expect(page.getByText('1 customer over their credit limit')).toBeVisible();
    await page.getByRole('button', { name: /1 customer over their credit limit/ }).click();

    // Customers: badge + usage in the detail; the bill carries the override.
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
    const row = page.getByRole('button', { name: /Limited Traders/ }).first();
    await expect(row).toContainText('Over limit');
    await row.click();
    const detail = page.getByRole('dialog', { name: 'Limited Traders' });
    await expect(detail.getByTestId('credit-usage')).toContainText('Over limit by Rs. 1,000');
    await detail.getByRole('button', { name: /INV-1/ }).click();
    await expect(page.getByText(/Allowed over credit limit by .+: Old customer, pays Friday/)).toBeVisible();
  });

  test('desktop: import a statement, auto-match, add the missing bank charge, reconcile and print', async ({ page }) => {
    await unlock(page);
    await reconcile(page);
  });
});

test.describe('Credit limits and bank reconciliation on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seed);
  });

  test('bank reconciliation fits a 390px screen and works', async ({ page }) => {
    await unlock(page);
    await reconcile(page, { mobile: true });
  });

  test('credit limit notice fits on the new bill screen', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Bill' });
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c1');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('5');
    await expect(dialog.getByTestId('bill-credit').getByRole('alert')).toBeVisible();
    await noOverflow(page, 'new bill over limit');
  });
});

test.describe('Customer dialog', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seed);
  });

  test('a customer added without typing a limit has no credit limit and nothing invented', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: 'Customers' }).first().click();
    await page.getByRole('button', { name: 'Add customer' }).click();
    const form = page.getByRole('dialog', { name: 'New customer' });
    await expect(form.getByLabel('Credit limit in Rs. (optional)')).toHaveValue('');
    await form.getByLabel('Name', { exact: true }).fill('Gul Traders');
    await form.getByLabel('Phone', { exact: true }).fill('0312 5556677');
    await form.getByRole('button', { name: 'Save customer' }).click();
    await expect(form).toBeHidden();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tradeflow_customers_v2') || '[]').find((c: { name: string }) => c.name === 'Gul Traders'));
    expect(stored.creditLimit).toBe(0);
    expect(stored.email).toBe('');
    expect(stored.address).toBe('');

    // A big bill on credit is not blocked by a limit nobody set.
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    const bill = page.getByRole('dialog', { name: 'New Bill' });
    await bill.getByLabel('Customer', { exact: true }).selectOption({ label: 'Gul Traders • 0312 5556677' });
    await bill.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await bill.getByLabel('Quantity 1', { exact: true }).fill('300');
    await expect(bill.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await bill.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bill).toBeHidden();
  });

  test('typing 0 keeps no limit, and a typed limit is saved', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: 'Customers' }).first().click();
    await page.getByRole('button', { name: 'Add customer' }).click();
    const form = page.getByRole('dialog', { name: 'New customer' });
    await form.getByLabel('Name', { exact: true }).fill('Zero Shop');
    await form.getByLabel('Phone', { exact: true }).fill('0313 0000000');
    await form.getByLabel('Credit limit in Rs. (optional)').fill('0');
    await form.getByRole('button', { name: 'Save customer' }).click();
    await page.getByRole('button', { name: 'Add customer' }).click();
    await form.getByLabel('Name', { exact: true }).fill('Limit Shop');
    await form.getByLabel('Phone', { exact: true }).fill('0313 1111111');
    await form.getByLabel('Credit limit in Rs. (optional)').fill('75,000');
    await form.getByRole('button', { name: 'Save customer' }).click();
    const limits = await page.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('tradeflow_customers_v2') || '[]').map((c: { name: string; creditLimit: number }) => [c.name, c.creditLimit])));
    expect(limits['Zero Shop']).toBe(0);
    expect(limits['Limit Shop']).toBe(75000);
  });
});
