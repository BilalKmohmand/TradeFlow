import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';
import { VOUCHER_TITLE, voucherLine } from './helpers/voucher';

/**
 * Multiple bank accounts, vouchers (CPV / BPV / JV / CRV), the account ledger for any account,
 * chart of accounts tree, receivable & payable by city and party city details — desktop and a phone.
 */
const seed = () => {
  if (localStorage.getItem('e2e_vch_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_vch_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil Traders', companyAddress: 'Batkhela', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: '141454', name: 'Zaman Store', company: 'Zaman Store', phone: '03443838294', email: '', address: '', totalDue: 5000, creditLimit: 0, createdAt: '2026-01-01', city: 'Peshawar' },
    { id: 'c2', code: '141455', name: 'Bismillah Traders', company: 'Bismillah Traders', phone: '03001234567', email: '', address: '', totalDue: 2500, creditLimit: 0, createdAt: '2026-01-01', city: 'Mardan' },
  ]);
  set('tradeflow_suppliers_v2', [
    { id: 's1', code: '241001', name: 'Ghee Mills', company: 'Ghee Mills', phone: '0333111', email: '', address: '', materialCategory: '', totalOwed: 30000, createdAt: '2026-01-01', city: 'Lahore' },
    { id: 's2', code: '241002', name: 'Oil Co', company: 'Oil Co', phone: '0333222', email: '', address: '', materialCategory: '', totalOwed: 8000, createdAt: '2026-01-01', city: 'Peshawar' },
  ]);
  set('tradeflow_products_v2', [{ id: 'p1', name: 'Dalda 16 L Tin', category: 'Oil', unit: 'tin', unitPricePerKg: 5000, costPricePerKg: 4500, stockKg: 40, minThresholdKg: 0 }]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2', 'tradeflow_journal_entries_v1', 'tradeflow_accounts_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name });
async function accTab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
}
async function noSideScroll(page: Page, label: string) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(r.sw, `${label}: page is wider than the screen`).toBeLessThanOrEqual(r.w);
}
async function addBank(page: Page, name: string, number: string, opening: string) {
  await page.getByTestId('bank-accounts').getByRole('button', { name: 'Add bank account' }).click();
  const d = dialog(page, 'Add bank account');
  await d.getByLabel('Bank name').fill(name);
  await d.getByLabel('Account number (optional)').fill(number);
  await d.getByLabel('Opening balance (Rs.)').fill(opening);
  await d.getByRole('button', { name: 'Add bank account' }).click();
  await expect(d).toHaveCount(0);
}

test('banks, vouchers, account ledger, chart tree, receivable & payable by city', async ({ page }) => {
  await open(page);

  // --- Money: two more bank accounts, then a customer pays into HBL.
  await goTo(page, 'Money');
  await addBank(page, 'HBL', '0012345678', '50000');
  await addBank(page, 'UBL', '998877', '0');
  const banks = page.getByTestId('bank-accounts');
  await expect(banks.getByTestId('bank-balance-1010')).toHaveText('Rs. 100,000');
  await expect(banks.getByTestId('bank-balance-1011')).toHaveText('Rs. 50,000');
  await page.getByRole('button', { name: 'Receive payment' }).first().click();
  const rc = dialog(page, 'Receive payment');
  await rc.getByLabel('Customer').selectOption('c1');
  await rc.getByLabel('Amount (Rs.)').fill('2000');
  await rc.getByLabel('Method').selectOption('Bank Transfer');
  await rc.getByLabel('Into bank').selectOption('1011');
  await rc.getByRole('button', { name: 'Receive' }).click();
  await expect(rc).toHaveCount(0);
  await expect(banks.getByTestId('bank-balance-1011')).toHaveText('Rs. 52,000');
  await expect(banks.getByTestId('bank-balance-1010')).toHaveText('Rs. 100,000');
  // Cash <-> bank: move 5,000 from HBL to UBL.
  await page.getByRole('button', { name: 'Cash ↔ Bank' }).click();
  const tr = dialog(page, 'Cash ↔ Bank');
  await tr.getByRole('button', { name: /Bank → bank/ }).click();
  await tr.getByLabel('From bank').selectOption('1011');
  await tr.getByLabel('To bank').selectOption('1012');
  await tr.getByLabel('Amount (Rs.)').fill('5000');
  await tr.getByRole('button', { name: 'Record' }).click();
  await expect(tr).toHaveCount(0);
  await expect(banks.getByTestId('bank-balance-1011')).toHaveText('Rs. 47,000');
  await expect(banks.getByTestId('bank-balance-1012')).toHaveText('Rs. 5,000');

  // --- Accounts → Vouchers: a CPV with two lines (number given automatically, cash side implied).
  await goTo(page, 'Accounts');
  await accTab(page, 'Vouchers');
  await page.getByRole('button', { name: 'New Cash payment voucher' }).click();
  let v = dialog(page, VOUCHER_TITLE.CPV);
  await expect(v.getByTestId('voucher-number')).toHaveValue('CPV-1');
  await voucherLine(page, v, '241001', { debit: '10000' }, 'On account');
  await voucherLine(page, v, '6000', { debit: '500' }, 'Tea');
  await expect(v.getByTestId('voucher-money-side')).toContainText('Cr Rs. 10,500');
  await expect(v.getByTestId('voucher-total-debit')).toHaveText('Rs. 10,500');
  await v.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(v.getByTestId('voucher-number')).toHaveValue('CPV-2');
  await page.keyboard.press('Escape');
  await expect(v).toHaveCount(0);
  await expect(page.getByTestId('voucher-row').filter({ hasText: 'CPV-1' })).toBeVisible();

  // A BPV from HBL, found by typing the supplier code in the F1 search.
  await page.getByRole('button', { name: 'New Bank payment voucher' }).click();
  v = dialog(page, VOUCHER_TITLE.BPV);
  await expect(v.getByTestId('voucher-number')).toHaveValue('BPV-1');
  await v.getByLabel('Bank account').selectOption('1011');
  await v.getByRole('button', { name: 'Search Code (By Title)' }).click();
  const find = dialog(page, 'Search Code (By Title)');
  await find.getByLabel('Search by title').fill('241002');
  await find.getByLabel('Search by title').press('Enter');
  await expect(find).toHaveCount(0);
  await expect(v.getByLabel('Title', { exact: true })).toHaveValue('Oil Co');
  await expect(v.getByLabel('Debit', { exact: true })).toBeFocused();
  await page.keyboard.type('3000');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Oil Co paid by HBL');
  await page.keyboard.press('Enter');
  await expect(v.getByTestId('voucher-line')).toHaveCount(1);
  await v.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(v.getByTestId('voucher-number')).toHaveValue('BPV-2');
  await page.keyboard.press('Escape');

  // A JV that must balance.
  await page.getByRole('button', { name: 'New Journal voucher' }).click();
  v = dialog(page, VOUCHER_TITLE.JV);
  await voucherLine(page, v, '141454', { debit: '1000' }, 'Freight charged to Zaman');
  await voucherLine(page, v, '4100', { credit: '900' }, 'Freight charged to Zaman');
  await v.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(v.getByRole('status').first()).toContainText('Debits (1000) must equal credits (900)');
  // Click the line: it comes back into the entry row, on its amount; change it and Enter, Enter.
  await v.getByTestId('voucher-line').nth(1).click();
  await expect(v.getByLabel('Credit', { exact: true })).toBeFocused();
  await v.getByLabel('Credit', { exact: true }).fill('1000');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(v.getByTestId('voucher-line')).toHaveCount(2);
  await expect(v.getByTestId('voucher-total-credit')).toHaveText('Rs. 1,000');
  await v.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(v.getByTestId('voucher-number')).toHaveValue('JV-2');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('voucher-row')).toHaveCount(3);

  // Vouchers printing: all three, each with the signature lines.
  await page.getByRole('button', { name: 'Vouchers printing' }).click();
  await expect(page.getByTestId('printed-voucher')).toHaveCount(3);
  await expect(page.getByTestId('printed-voucher').first()).toContainText('Madina Oil Traders');
  await expect(page.getByTestId('voucher-signatures').first()).toContainText('Received by');
  await page.getByRole('button', { name: 'Close preview' }).click();

  // Trial balance still balances.
  await accTab(page, 'Trial balance');
  await expect(page.getByText('Balanced ✓').first()).toBeVisible();

  // --- Account ledger for the customer: OB 5,000 Dr, HBL receipt −2,000, JV +1,000 = 4,000 Dr.
  await accTab(page, 'Account ledger');
  await page.getByLabel('Ledger account', { exact: true }).selectOption('cust:c1');
  await page.getByLabel('Date from').fill('2026-01-01');
  const led = page.getByTestId('account-ledger');
  await expect(led.getByTestId('ledger-ob')).toContainText('5,000 Dr');
  await expect(led.getByTestId('ledger-row')).toHaveCount(2);
  await expect(led.getByTestId('ledger-total')).toContainText('4,000 Dr');
  await led.getByRole('button', { name: 'Print account ledger' }).click();
  const printed = page.getByTestId('printed-account-ledger');
  await expect(printed).toContainText('Account Ledger Report');
  await expect(printed).toContainText('141454');
  await expect(printed).toContainText('Grand Total');
  await page.getByRole('button', { name: 'Close preview' }).click();
  // The HBL bank account ledger shows the voucher number.
  await page.getByLabel('Ledger account', { exact: true }).selectOption('1011');
  await expect(led.getByTestId('ledger-row').filter({ hasText: 'BPV-1' })).toBeVisible();

  // --- Chart of accounts tree: banks under Bank, customers under Receivable.
  await accTab(page, 'Chart of accounts');
  await expect(page.getByTestId('coa-account-1011')).toContainText('HBL');
  await page.getByRole('button', { name: 'Expand Accounts receivable (customers)' }).click();
  await expect(page.getByTestId('coa-party-141454')).toContainText('Zaman Store');
  await page.getByRole('button', { name: 'Add sub-account under Day-to-day expenses' }).click();
  const sub = dialog(page, 'Add under Day-to-day expenses');
  await expect(sub.getByLabel('Code')).toHaveValue('6001');
  await sub.getByLabel('Name').fill('Tea & refreshments');
  await sub.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByTestId('coa-account-6001')).toBeVisible();

  // --- Receivable & payable, city-wise.
  await accTab(page, 'Receivable & payable');
  const pb = page.getByTestId('party-balances');
  await expect(pb.getByTestId('city-subtotal').filter({ hasText: 'Peshawar' })).toBeVisible();
  await expect(pb.getByTestId('grand-receivable')).toHaveText('Rs. 6,500 Dr');
  await expect(pb.getByTestId('grand-payable')).toHaveText('Rs. 25,000 Cr');
  await pb.getByRole('button', { name: 'Payable only' }).click();
  await expect(pb.getByTestId('party-balance-row')).toHaveCount(2);

  // --- Customers: add one with a city, then search by city.
  await goTo(page, 'Customers');
  await page.getByRole('button', { name: 'Add customer' }).first().click();
  const nc = dialog(page, 'New customer');
  await nc.getByLabel('Name', { exact: true }).fill('Khan Kiryana');
  await nc.getByLabel('Phone', { exact: true }).fill('03115556677');
  await nc.getByLabel('City / town (optional)').fill('Mardan');
  await nc.getByLabel('Sales tax # (optional)').fill('32-77-8761');
  await nc.getByRole('button', { name: 'Save customer' }).click();
  await expect(nc).toHaveCount(0);
  await page.getByTestId('customer-city').selectOption('Mardan');
  await expect(page.getByRole('button', { name: /Khan Kiryana/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Bismillah Traders/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Zaman Store/ })).toHaveCount(0);
  // New bill: the customer picker can be narrowed by city too.
  await page.getByRole('button', { name: 'New bill for Khan Kiryana' }).click();
  const bill = dialog(page, 'New Bill');
  await bill.getByTestId('bill-customer-city').selectOption('Mardan');
  await expect(bill.locator('#bill-customer option')).toHaveText(['Select customer…', /Bismillah Traders/, /Khan Kiryana/]);
  await bill.getByRole('button', { name: 'Close' }).first().click();
  await expect(bill).toHaveCount(0);

  // --- Money → Cash book, HBL only.
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Cash book', exact: true }).click();
  await page.getByTestId('cashbook-account').selectOption('1011');
  await expect(page.getByText(/Zaman Store/).first()).toBeVisible();
  await expect(page.getByText(/Oil Co/).first()).toBeVisible();

  // --- Delete the CPV: it goes to the bin and the supplier owes the full amount again.
  await goTo(page, 'Accounts');
  await accTab(page, 'Vouchers');
  await page.getByRole('button', { name: 'Delete voucher CPV-1' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete voucher' }).click();
  await expect(page.getByTestId('voucher-row')).toHaveCount(2);
  await accTab(page, 'Receivable & payable');
  await expect(page.getByTestId('grand-payable')).toHaveText('Rs. 35,000 Cr');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('vouchers, account ledger and bank accounts fit a phone', async ({ page }) => {
    await open(page);
    await goTo(page, 'Money');
    await addBank(page, 'MBL', '4455', '1000');
    await expect(page.getByTestId('bank-balance-1011')).toHaveText('Rs. 1,000');
    await noSideScroll(page, 'Money with bank accounts');
    await goTo(page, 'Accounts');
    await accTab(page, 'Vouchers');
    await noSideScroll(page, 'Vouchers');
    await page.getByRole('button', { name: 'New Cash receipt voucher' }).click();
    const v = dialog(page, VOUCHER_TITLE.CRV);
    await voucherLine(page, v, '141455', { credit: '2500' }, 'Full');
    await expect(v.getByTestId('voucher-money-side')).toContainText('Dr Rs. 2,500');
    const box = await v.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    await v.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(v.getByTestId('voucher-number')).toHaveValue('CRV-2');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('voucher-row').filter({ hasText: 'CRV-1' })).toBeVisible();
    await noSideScroll(page, 'Vouchers list');
    await accTab(page, 'Account ledger');
    await page.getByLabel('Ledger account', { exact: true }).selectOption('cust:c2');
    await page.getByLabel('Date from').fill('2026-01-01');
    await expect(page.getByTestId('ledger-total')).toContainText('0');
    await noSideScroll(page, 'Account ledger');
    await accTab(page, 'Receivable & payable');
    await noSideScroll(page, 'Receivable & payable');
    await accTab(page, 'Chart of accounts');
    await noSideScroll(page, 'Chart of accounts');
  });
});
