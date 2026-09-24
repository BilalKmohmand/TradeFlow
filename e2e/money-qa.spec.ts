import { test, expect, Page, Locator } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';
import { seedMoneyShop } from './helpers/moneyShop';

/**
 * QA of money, banks and vouchers on a realistic shop (30 customers, 15 suppliers, Meezan + HBL + UBL + MBL,
 * three months of bills and payments — see helpers/moneyShop.ts). Every figure below was worked out by hand
 * from the seed:
 *   HBL 1011 = 800,000 opening + 109,500 received − 124,000 paid to suppliers − 45,000 rent = 740,500
 *   UBL 1012 = 350,000 opening, nothing through it yet
 * Page errors and console errors fail every test.
 */

const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return () => expect(errors, 'page / console errors').toEqual([]);
};
const open = async (page: Page, pre?: () => void) => {
  const done = watch(page);
  await page.addInitScript(seedMoneyShop);
  if (pre) await page.addInitScript(pre);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
  return done;
};
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });
const stored = <T,>(page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), key) as Promise<T>;
const tile = (scope: Page | Locator, label: string) => scope.getByText(label, { exact: true }).first().locator('xpath=../following-sibling::div[1]');
const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().split('T')[0];
const bankBal = (page: Page, code: string) => page.getByTestId('bank-accounts').getByTestId(`bank-balance-${code}`);
const noSideScroll = async (page: Page, label: string) => {
  const x = await page.evaluate(() => { window.scrollTo(10000, window.scrollY); const v = window.scrollX; window.scrollTo(0, window.scrollY); return v; });
  expect(x, `${label}: page must not scroll sideways`).toBe(0);
};
/** The owner's end-of-day check: trial balance balanced, cash in hand = daily sheet closing cash. */
const checkBooks = async (page: Page) => {
  await goTo(page, 'Accounts');
  await page.getByRole('tablist', { name: 'Accounts views' }).getByRole('tab', { name: 'Trial balance', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Balanced ✓' })).toBeVisible();
  expect(await page.getByTestId('tb-total-debit').textContent()).toBe(await page.getByTestId('tb-total-credit').textContent());
  const customers = await stored<{ id: string; totalDue: number }[]>(page, 'tradeflow_customers_v2');
  const ledger = await stored<{ entityType: string; entityId: string; debit: number; credit: number }[]>(page, 'tradeflow_ledger_v2');
  for (const c of customers) {
    const net = ledger.filter((l) => l.entityType === 'customer' && l.entityId === c.id).reduce((a, l) => a + l.debit - l.credit, 0);
    expect(Math.round((c.totalDue - net) * 100) / 100, `${c.id}: balance vs statement`).toBe(0);
  }
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const cash = (await tile(page.getByRole('main'), 'Cash in hand').textContent())!.trim();
  await goTo(page, 'Daily Sheet');
  await expect(tile(page.getByRole('main'), 'Closing cash')).toHaveText(cash);
};

test('double-clicking Save records once: expense, receive payment, cash ↔ bank', async ({ page }) => {
  const done = await open(page);
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Expense sheets', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).first().click();
  let d = dialog(page, 'Add expense');
  await d.getByLabel('What for').fill('Loader wages');
  await d.getByLabel('Amount (Rs.)').fill('700');
  await d.getByRole('button', { name: 'Save expense' }).dblclick();
  await expect(d).toHaveCount(0);
  expect((await stored<{ description: string }[]>(page, 'tradeflow_expenses_v2')).filter((e) => e.description === 'Loader wages')).toHaveLength(1);

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Receive payment' }).first().click();
  d = dialog(page, 'Receive payment');
  await d.getByLabel('Customer').selectOption('c1');
  await d.getByLabel('Amount (Rs.)').fill('100');
  await d.getByRole('button', { name: 'Receive' }).dblclick();
  await expect(d).toHaveCount(0);
  expect((await stored<{ entityId: string; credit: number }[]>(page, 'tradeflow_ledger_v2')).filter((l) => l.entityId === 'c1' && l.credit === 100)).toHaveLength(1);

  await page.getByRole('button', { name: 'Cash ↔ Bank' }).click();
  d = dialog(page, 'Cash ↔ Bank');
  await d.getByLabel('Amount (Rs.)').fill('333');
  await d.getByRole('button', { name: 'Record' }).dblclick();
  await expect(d).toHaveCount(0);
  expect((await stored<{ amount: number }[]>(page, 'tradeflow_cash_entries_v2')).filter((c) => c.amount === 333)).toHaveLength(2); // one out, one in
  done();
});

test('receive by code into a bank on an earlier date, cheque by code, bounce with charge, receive from many into HBL, bank to bank — every bank adds up', async ({ page }) => {
  test.setTimeout(120_000);
  const done = await open(page);
  await goTo(page, 'Money');
  await expect(bankBal(page, '1011')).toHaveText('Rs. 740,500');
  await expect(bankBal(page, '1012')).toHaveText('Rs. 350,000');

  // Receive payment: keyboard only — type the code C007 in the Code box, Enter, and the rest.
  await page.getByRole('button', { name: 'Receive payment' }).first().click();
  let d = dialog(page, 'Receive payment');
  await expect(d.getByLabel('Code', { exact: true })).toBeFocused();
  await page.keyboard.type('c007');
  await page.keyboard.press('Enter');
  await expect(d.getByLabel('Customer')).toHaveValue('c7');
  await expect(d.getByTestId('rc-balance')).toContainText('Owes Rs. 75,500');
  await d.getByLabel('Amount (Rs.)').fill('5500.50');
  await d.getByLabel('Method').selectOption('Bank Transfer');
  await d.getByLabel('Into bank').selectOption('1012');
  await d.getByLabel('Date', { exact: true }).fill(day(2));
  await d.getByRole('button', { name: 'Receive' }).click();
  await expect(d).toHaveCount(0);
  await expect(bankBal(page, '1012')).toHaveText('Rs. 355,500.50');
  const row = (await stored<{ entityId: string; credit: number; date: string; bankCode?: string }[]>(page, 'tradeflow_ledger_v2')).find((l) => l.entityId === 'c7' && l.credit === 5500.5);
  expect(row).toMatchObject({ date: day(2), bankCode: '1012' });

  // A date in a closed period is refused.
  await page.evaluate((until) => { const s = JSON.parse(localStorage.getItem('tradeflow_settings_v2')!); s.booksLockedUntil = until; localStorage.setItem('tradeflow_settings_v2', JSON.stringify(s)); }, day(5));
  await page.reload();
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Receive payment' }).first().click();
  d = dialog(page, 'Receive payment');
  await d.getByLabel('Code', { exact: true }).fill('C001');
  await d.getByLabel('Code', { exact: true }).press('Enter');
  await d.getByLabel('Amount (Rs.)').fill('1000');
  await d.getByLabel('Date', { exact: true }).fill(day(10));
  await d.getByRole('button', { name: 'Receive' }).click();
  await expect(d.getByRole('status')).toContainText('The books are closed');
  await page.keyboard.press('Escape');

  // Cheque received, picked by code; deposited into UBL; bounces with a Rs. 500 charge the shop pays.
  await page.getByRole('button', { name: 'Cheques', exact: true }).click();
  await page.getByRole('button', { name: 'Cheque received' }).click();
  d = dialog(page, 'Cheque received');
  await d.getByLabel('Code', { exact: true }).fill('12');
  await d.getByLabel('Code', { exact: true }).press('Tab');
  await expect(d.getByLabel('Customer')).toHaveValue('c12');
  await d.getByLabel('Amount (Rs.)').fill('20000');
  await d.getByLabel('Cheque no.').fill('10045521');
  await d.getByLabel('Bank', { exact: true }).fill('MCB');
  await d.getByRole('button', { name: 'Save cheque' }).click();
  await expect(d).toHaveCount(0);
  await page.getByRole('tab', { name: /^All/ }).click();
  await page.getByRole('button', { name: 'Deposit', exact: true }).click();
  d = dialog(page, 'Deposit cheque');
  await d.getByLabel('Deposited into').selectOption('1012');
  await d.getByRole('button', { name: 'Deposit' }).click();
  await page.getByRole('button', { name: 'Bounced' }).click();
  d = dialog(page, 'Cheque bounced');
  await d.getByLabel('Why it bounced').fill('Insufficient funds');
  await d.getByLabel('Bank charge (Rs.)').fill('500');
  await d.getByRole('button', { name: 'Shop', exact: true }).click();
  await d.getByRole('button', { name: 'Mark bounced' }).click();
  await expect(page.getByText(/marked bounced/)).toBeVisible();
  const c12 = (await stored<{ id: string; totalDue: number }[]>(page, 'tradeflow_customers_v2')).find((c) => c.id === 'c12')!;
  expect(c12.totalDue).toBe(117250); // the cheque is owed again, the charge stays with the shop

  // Receive from many: Zaman Store pays Rs. 1,000 by bank transfer into HBL.
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(bankBal(page, '1012')).toHaveText('Rs. 355,000.50');
  await page.getByRole('button', { name: 'Receive from many' }).click();
  d = dialog(page, 'Receive from many');
  await d.getByLabel('Line 1 code').fill('C001');
  await d.getByLabel('Line 1 code').press('Enter');
  await d.getByLabel('Line 1 amount').fill('1000');
  await d.getByLabel('Line 1 method').selectOption('Bank Transfer');
  await d.getByLabel('Line 1 into bank').selectOption('1011');
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog(page, 'Money received')).toBeVisible();
  await dialog(page, 'Money received').getByRole('button', { name: 'Done' }).click();
  await expect(bankBal(page, '1011')).toHaveText('Rs. 741,500');

  // Bank to bank: more than HBL has is refused; 41,500 from HBL to MBL goes through.
  await page.getByRole('button', { name: 'Cash ↔ Bank' }).click();
  d = dialog(page, 'Cash ↔ Bank');
  await d.getByRole('button', { name: /Bank → bank/ }).click();
  await d.getByLabel('From bank').selectOption('1011');
  await d.getByLabel('To bank').selectOption('1013');
  await d.getByLabel('Amount (Rs.)').fill('45000000');
  await d.getByRole('button', { name: 'Record' }).click();
  await expect(d.getByRole('status')).toContainText('Only Rs. 741,500 is in HBL');
  await d.getByLabel('Amount (Rs.)').fill('41500');
  await d.getByRole('button', { name: 'Record' }).click();
  await expect(d).toHaveCount(0);
  await expect(bankBal(page, '1011')).toHaveText('Rs. 700,000');

  // Cash book for HBL alone: brought forward, running balance, and the balance equals the bank's figure.
  await page.getByRole('button', { name: 'Cash book', exact: true }).click();
  await page.getByTestId('cashbook-account').selectOption('1011');
  await expect(page.getByTestId('book-closing')).toHaveText('Rs. 700,000');
  await expect(page.getByTestId('book-balance').last()).toHaveText('bal Rs. 700,000');
  await checkBooks(page);
  done();
});

test('opening balances: every bank on one form, and locked once the period is closed', async ({ page }) => {
  const done = await open(page);
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Opening balances' }).click();
  const form = page.getByRole('form', { name: 'Opening balances' });
  await expect(form.getByLabel('Meezan Bank on opening day')).toHaveValue('1500000');
  await expect(form.getByLabel('HBL — 5678 on opening day')).toHaveValue('800000');
  await form.getByLabel('UBL — 8877 on opening day').fill('400000');
  await form.getByRole('button', { name: 'Save opening balances' }).click();
  await expect(form).toHaveCount(0);
  await expect(bankBal(page, '1012')).toHaveText('Rs. 400,000');

  await page.evaluate((until) => { const s = JSON.parse(localStorage.getItem('tradeflow_settings_v2')!); s.booksLockedUntil = until; localStorage.setItem('tradeflow_settings_v2', JSON.stringify(s)); }, day(3));
  await page.reload();
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Opening balances' }).click();
  await form.getByLabel('Cash on opening day').fill('999');
  await form.getByRole('button', { name: 'Save opening balances' }).click();
  await expect(form.getByRole('status')).toContainText("Opening balances can't be changed");
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('tradeflow_settings_v2')!))).cashOpeningBalance).toBe(250000);
  // Same from the bank's own edit form.
  await page.getByRole('button', { name: 'Edit UBL — 8877' }).click();
  const ed = dialog(page, 'Edit UBL — 8877');
  await ed.getByLabel('Opening balance (Rs.)').fill('1');
  await ed.getByRole('button', { name: 'Save' }).click();
  await expect(ed.getByRole('status')).toContainText("opening balance can't be changed");
  done();
});

test('vouchers: code box, numbers from CPV-1064, JV must balance, delete and restore; statement CSV with ";" and decimal commas', async ({ page }) => {
  test.setTimeout(120_000);
  const done = await open(page, () => {
    const s = JSON.parse(localStorage.getItem('tradeflow_settings_v2')!);
    if (!s.numberSeries) { s.numberSeries = { cpv: { prefix: 'CPV-', startAt: 1064 } }; localStorage.setItem('tradeflow_settings_v2', JSON.stringify(s)); }
  });
  await goTo(page, 'Accounts');
  await page.getByRole('tab', { name: 'Vouchers', exact: true }).click();
  await page.getByRole('button', { name: 'New Cash payment voucher' }).click();
  let v = dialog(page, 'New Cash payment voucher');
  await expect(v.getByTestId('voucher-number')).toHaveValue('CPV-1064');
  // Focus starts on a field you type in, not on the read-only number.
  await expect(v.getByTestId('voucher-number')).not.toBeFocused();
  await v.getByLabel('Code for Line 1 account').fill('S003');
  await v.getByLabel('Code for Line 1 account').press('Enter');
  await expect(v.getByLabel('Line 1 account', { exact: true })).toHaveValue('supp:s3');
  await v.getByLabel('Line 1 debit').fill('10000');
  await v.getByRole('button', { name: 'Add line' }).click();
  await v.getByLabel('Code for Line 2 account').fill('6000');
  await v.getByLabel('Code for Line 2 account').press('Tab');
  await expect(v.getByLabel('Line 2 account', { exact: true })).toHaveValue('6000');
  await v.getByLabel('Line 2 debit').fill('250.50');
  await v.getByLabel('Narration', { exact: true }).fill('Payments of the day');
  await expect(v.getByTestId('voucher-money-side')).toContainText('Cr Rs. 10,250.50');
  await v.getByRole('button', { name: 'Save voucher' }).click();
  await expect(v).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New Cash payment voucher' }).click();
  await expect(dialog(page, 'New Cash payment voucher').getByTestId('voucher-number')).toHaveValue('CPV-1065');
  await page.keyboard.press('Escape');

  // JV: a paisa out and it won't save.
  await page.getByRole('button', { name: 'New Journal voucher' }).click();
  v = dialog(page, 'New Journal voucher');
  await v.getByLabel('Narration', { exact: true }).fill('Set off');
  await v.getByLabel('Line 1 account', { exact: true }).selectOption('cust:c1');
  await v.getByLabel('Line 1 credit').fill('45000');
  await v.getByLabel('Line 2 account', { exact: true }).selectOption('supp:s1');
  await v.getByLabel('Line 2 debit').fill('44999.99');
  await expect(v.getByTestId('voucher-totals')).toContainText('Difference Rs. 0.01');
  await v.getByRole('button', { name: 'Save voucher' }).click();
  await expect(v).toBeVisible();
  await v.getByRole('button', { name: 'Cancel' }).click();

  // Delete CPV-1064 and put it back from Admin → Deleted records.
  await page.getByRole('button', { name: 'Delete voucher CPV-1064' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete voucher' }).click();
  await expect(page.getByTestId('voucher-row')).toHaveCount(0);
  await goTo(page, 'Admin');
  await page.getByRole('button', { name: /Deleted records/ }).click();
  await page.getByTestId('deleted-record').filter({ hasText: 'CPV-1064' }).getByRole('button', { name: /Restore/ }).click();
  await expect(page.getByText(/CPV-1064 is back/)).toBeVisible();
  await checkBooks(page);

  // Bank statement for HBL saved with ";" and decimal commas.
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Bank reconciliation', exact: true }).click();
  await page.getByLabel('Bank account to reconcile').selectOption('1011');
  const csv = `Date;Narration;Withdrawal;Deposit\n${day(13)};IBFT Shah Jee;;27.500,00\n${day(2)};Charges;350,00;\n`;
  await page.locator('input[type=file]').first().setInputFiles({ name: 'hbl.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('2 lines ready')).toBeVisible();
  await expect(page.getByText(/money in Rs\. 27,500 • money out Rs\. 350/)).toBeVisible();
  done();
});

test('phone 390px: voucher buttons fit, the account ledger shows amounts, money screens never scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const done = await open(page);
  await goTo(page, 'Accounts');
  await page.getByRole('tab', { name: 'Vouchers', exact: true }).click();
  await page.getByRole('button', { name: 'New Journal voucher' }).click();
  const v = dialog(page, 'New Journal voucher');
  for (const name of ['Cancel', 'Save & print']) {
    const box = (await v.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.height, `${name} on one line`).toBeLessThanOrEqual(48);
  }
  expect((await v.getByRole('button', { name: 'Save voucher' }).boundingBox())!.width).toBeGreaterThan(300);
  await v.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('tab', { name: 'Account ledger', exact: true }).click();
  const card = page.getByTestId('ledger-card').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText(/bal /);
  await noSideScroll(page, 'Account ledger');
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Cash book', exact: true }).click();
  await page.getByTestId('cashbook-account').selectOption('1011');
  await expect(page.getByTestId('book-closing')).toHaveText('Rs. 740,500');
  await noSideScroll(page, 'Cash book');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Receive payment' }).first().click();
  const code = dialog(page, 'Receive payment').getByLabel('Code', { exact: true });
  expect((await code.boundingBox())!.width).toBeGreaterThanOrEqual(90);
  await noSideScroll(page, 'Receive payment');
  done();
});
