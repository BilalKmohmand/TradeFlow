import { test, expect, Page } from '@playwright/test';

/**
 * Post-dated cheque register. Haji Karim owes Rs. 100,000; Dalda Foods is owed Rs. 50,000.
 * A cheque is received through "Receive payment", another (post-dated) from the Cheques tab;
 * the first is deposited and cleared, the second bounces with a bank charge passed on; a cheque is
 * given to the supplier; then the cash book, daily sheet, customer balance and printed register are checked.
 */
const seed = () => {
  if (localStorage.getItem('e2e_cheque_seeded')) return;
  localStorage.setItem('e2e_cheque_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: '', totalDue: 100000, creditLimit: 0, createdAt: today }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 50000, createdAt: today }]);
  set('tradeflow_products_v2', [{ id: 'p1', name: 'Ghee tin', category: 'General', unit: 'tin', unitPricePerKg: 6000, stockKg: 100, minThresholdKg: 0 }]);
  set('tradeflow_invoices_v1', []);
  set('tradeflow_ledger_v2', []);
  set('tradeflow_expenses_v2', []);
  set('tradeflow_cash_entries_v2', []);
  set('tradeflow_cheques_v1', []);
};

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

async function unlock(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Unlock/ })).toBeVisible();
  for (const d of '7860') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: /^Unlock/ }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

const noOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(0);
};

async function chequeFlow(page: Page, opts: { mobile?: boolean } = {}) {
  const tile = page.getByTestId('cheques-due-tile');
  await expect(tile).toContainText('0 • Rs. 0');

  // 1. Receive payment by cheque: asks for cheque no., bank and date.
  await page.getByRole('button', { name: 'Receive payment' }).first().click();
  const rc = page.getByRole('dialog', { name: 'Receive payment' });
  await rc.getByLabel('Customer').selectOption('c1');
  await rc.getByLabel('Amount (Rs.)').fill('25000');
  await rc.getByLabel('Method').selectOption('Cheque');
  await rc.getByLabel('Cheque no.').fill('100200');
  await rc.getByLabel('Bank', { exact: true }).fill('HBL');
  if (opts.mobile) await noOverflow(page, 'receive by cheque');
  await rc.getByRole('button', { name: 'Receive' }).click();
  await expect(rc).toHaveCount(0);
  await expect(tile).toContainText('1 • Rs. 25,000');

  // 2. The tile opens Money → Cheques.
  await tile.click();
  await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible();
  const tab = page.getByTestId('cheques-tab');
  await expect(tab.getByTestId('cheque-row').filter({ hasText: '100200' })).toContainText('In hand');
  if (opts.mobile) await noOverflow(page, 'cheques tab');

  // 3. A post-dated cheque from the Cheques tab: can't be deposited yet.
  await tab.getByRole('button', { name: 'Cheque received' }).click();
  const form = page.getByRole('dialog', { name: 'Cheque received' });
  await form.getByLabel('Customer').selectOption('c1');
  await form.getByLabel('Amount (Rs.)').fill('10000');
  await form.getByLabel('Cheque no.').fill('100201');
  await form.getByLabel('Bank', { exact: true }).fill('MCB');
  await form.getByLabel('Date on cheque').fill(inDays(3));
  await expect(form).toContainText('Post-dated');
  if (opts.mobile) await noOverflow(page, 'cheque form');
  await form.getByRole('button', { name: 'Save cheque' }).click();
  await expect(form).toHaveCount(0);
  await expect(tab.getByRole('tab', { name: 'Due this week (2)' })).toBeVisible();
  const pdc = tab.getByTestId('cheque-row').filter({ hasText: '100201' });
  await expect(pdc.getByRole('button', { name: 'Deposit' })).toBeDisabled();

  // 4. Deposit and clear the first one.
  await tab.getByTestId('cheque-row').filter({ hasText: '100200' }).getByRole('button', { name: 'Deposit' }).click();
  await page.getByRole('dialog', { name: 'Deposit cheque' }).getByRole('button', { name: 'Deposit' }).click();
  await expect(tab.getByText(/Cheque 100200 \(HBL\) deposited/)).toBeVisible();
  await tab.getByRole('tab', { name: /^Deposited/ }).click();
  await tab.getByTestId('cheque-row').filter({ hasText: '100200' }).getByRole('button', { name: 'Mark cleared' }).click();
  await page.getByRole('dialog', { name: 'Mark cheque cleared' }).getByRole('button', { name: 'Mark cleared' }).click();
  await expect(tab.getByText(/Rs\.?\s*25,000 added to the bank/)).toBeVisible();

  // 5. The post-dated one bounces; the bank charge is passed on to the customer.
  await tab.getByRole('tab', { name: /^In hand/ }).click();
  await tab.getByTestId('cheque-row').filter({ hasText: '100201' }).getByRole('button', { name: 'Bounced' }).click();
  const bounce = page.getByRole('dialog', { name: 'Cheque bounced' });
  await bounce.getByLabel('Why it bounced').fill('Insufficient funds');
  await bounce.getByLabel('Bank charge (Rs.)').fill('500');
  await bounce.getByRole('button', { name: 'Customer' }).click();
  if (opts.mobile) await noOverflow(page, 'bounce dialog');
  await bounce.getByRole('button', { name: 'Mark bounced' }).click();
  await expect(tab.getByText(/Rs\.?\s*10,500 added back to Haji Karim/)).toBeVisible();
  await tab.getByRole('tab', { name: /^Bounced/ }).click();
  await expect(tab.getByTestId('cheque-row').filter({ hasText: '100201' })).toContainText('Insufficient funds');

  // 6. Give a cheque to the supplier.
  await tab.getByRole('button', { name: 'Give a cheque' }).click();
  const give = page.getByRole('dialog', { name: 'Give a cheque' });
  await give.getByLabel('Supplier').selectOption('s1');
  await give.getByLabel('Amount (Rs.)').fill('20000');
  await give.getByLabel('Cheque no.').fill('555');
  await give.getByLabel('Bank', { exact: true }).fill('Meezan Bank');
  await give.getByRole('button', { name: 'Save cheque' }).click();
  await tab.getByRole('tab', { name: 'Issued (1)' }).click();
  await expect(tab.getByTestId('cheque-list-total')).toHaveText('Rs. 20,000');

  // 7. Printable register with totals.
  await tab.getByRole('tab', { name: /^All/ }).click();
  await tab.getByRole('button', { name: 'Print register' }).click();
  const print = page.locator('#print-root');
  await expect(print).toContainText('CHEQUE REGISTER');
  await expect(print).toContainText('Cheques received (2)');
  await expect(print).toContainText('35,000.00');
  await expect(print).toContainText('Cheques given (1)');
  if (opts.mobile) await noOverflow(page, 'register print');
  await page.keyboard.press('Escape');
  await expect(print).toHaveCount(0);

  // 8. Cash book shows only the cleared cheque and the bank charge; customer owes 100,000 − 25,000 + 500.
  await page.getByRole('button', { name: 'Cash book' }).click();
  await expect(page.getByText(/Cheque 100200 \(HBL\) cleared/)).toBeVisible();
  await expect(page.getByText(/Bank charge: bounced cheque 100201/)).toBeVisible();
  await expect(page.getByText(/100201 \(MCB\)/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByText('Rs. 75,500').first()).toBeVisible();

  // 9. Daily sheet lists today's cheques.
  await page.getByRole('button', { name: 'Home' }).first().click();
  await page.getByRole('button', { name: 'Daily sheet' }).first().click();
  const daily = page.getByTestId('daily-cheques');
  await expect(daily).toContainText('Cheque received from Haji Karim');
  await expect(daily).toContainText('Cleared');
  await expect(daily).toContainText('Bounced');
  await expect(daily).toContainText('Cheque given to Dalda Foods');
  if (opts.mobile) await noOverflow(page, 'daily sheet');
}

test.describe('Cheque register', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seed);
  });
  test('desktop: receive, deposit, clear, bounce, issue, print', async ({ page }) => {
    await unlock(page);
    await chequeFlow(page);
  });
});

test.describe('Cheque register on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seed);
  });
  test('fits a 390px screen and works', async ({ page }) => {
    await unlock(page);
    await chequeFlow(page, { mobile: true });
  });
});
