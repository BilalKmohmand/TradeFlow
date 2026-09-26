import { test, expect, Page, Locator } from '@playwright/test';
import { addPayment, saveAndPrint } from './helpers/bill';
import { readFileSync } from 'fs';
import { login, signIn, OPERATOR, OWNER } from './helpers/login';
import { goTo } from './helpers/nav';

/**
 * Final QA: a shopkeeper's whole day in simple billing, through the screens only. Each test is one part of
 * the day on its own seeded shop (so they can run in any order); every test ends by checking the money
 * holds together: trial balance "Balanced", receivable / payable = the customers' / suppliers' balances,
 * the daily sheet's closing cash = Money → Cash in hand, and item stock = the last line of its history.
 * Any page error or console error fails the test.
 */

// ---------------------------------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------------------------------
const seedShop = () => {
  if (localStorage.getItem('e2e_qa_seeded')) return; // survive reloads and sign-outs
  localStorage.setItem('e2e_qa_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Amandarra, Batkhela', companyPhone: '3410550055', cashOpeningBalance: 50000, openingBankBalance: 200000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: 'Z01', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
    { id: 'c2', code: 'H02', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: 'Swat', totalDue: 0, creditLimit: 20000, createdAt: '2026-01-01' },
    { id: 'c3', name: 'Old Khan Store', company: 'Old Khan Store', phone: '03001112223', email: '', address: 'Swat', totalDue: 13070, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', code: 'S-01', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Ghee', address: 'Karachi', totalOwed: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: 'Dalda 16 L Tin', category: 'Ghee', brand: 'Dalda', unit: 'tin', unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 60, minThresholdKg: 70, reorderQty: 50, supplierId: 's1', packName: 'carton', packSize: 6, code: 'DT16', barcode: '8964000123456' },
    { id: 'p2', name: 'Habib 5 L Can', category: 'Oil', brand: 'Habib', unit: 'can', unitPricePerKg: 2000, costPricePerKg: 1700, stockKg: 40, minThresholdKg: 0 },
  ]);
  set('tradeflow_ledger_v2', [
    { id: 'old-1', entityType: 'customer', entityId: 'c3', type: 'bill_issued', referenceId: 'OLD-1', date: day(75), description: 'Old bill', debit: 13070, credit: 0, balanceAfter: 13070 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_purchase_orders_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2', 'tradeflow_quotations_v2', 'tradeflow_journal_entries_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};

// ---------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------
/** Page errors and console errors are collected and fail the test at the end. */
const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return () => expect(errors, 'page / console errors').toEqual([]);
};

const open = async (page: Page, who = OWNER) => {
  const done = watch(page);
  await page.addInitScript(seedShop);
  await signIn(page, who);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
  return done;
};

const main = (page: Page) => page.getByRole('main');
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });
const printRoot = (page: Page) => page.locator('#print-root');
const closePreview = async (page: Page) => {
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(printRoot(page)).toHaveCount(0);
};
/** The big number of a Tile (label text → the value under it). */
const tile = (scope: Page | Locator, label: string) => scope.getByText(label, { exact: true }).first().locator('xpath=../following-sibling::div[1]');
const noSideScroll = async (page: Page, label: string) => {
  const x = await page.evaluate(() => { window.scrollTo(10000, window.scrollY); const v = window.scrollX; window.scrollTo(0, window.scrollY); return v; });
  expect(x, `${label}: page must not scroll sideways`).toBe(0);
};
/** "Rs. 1,234" exactly as the app formats it (same Intl in the browser). */
const rsIn = (page: Page, n: number) => page.evaluate((v) => {
  const r = Math.round(v * 100) / 100;
  return `Rs. ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: Number.isInteger(r) ? 0 : 2, minimumFractionDigits: Number.isInteger(r) ? 0 : 2 }).format(r)}`;
}, n);
const moneyIn = (page: Page, n: number) => page.evaluate((v) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(v), n);
const stored = <T,>(page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), key) as Promise<T>;

type Party = { id: string; name: string; company?: string; totalDue?: number; totalOwed?: number };
type Led = { entityType: string; entityId: string; debit: number; credit: number };

/**
 * The owner's end-of-day check: every rule the books must keep, read off the screens.
 * `opening` = balances brought in from old books that no statement line explains.
 */
const checkBooks = async (page: Page, opts: { item?: { id: string; name: string } } = {}) => {
  // 1. Trial balance balances, and receivable / payable equal the party balances.
  await goTo(page, 'Accounts');
  await page.getByRole('tablist', { name: 'Accounts views' }).getByRole('tab', { name: 'Trial balance', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Balanced ✓' })).toBeVisible();
  expect(await page.getByTestId('tb-total-debit').textContent()).toBe(await page.getByTestId('tb-total-credit').textContent());
  const customers = await stored<Party[]>(page, 'tradeflow_customers_v2');
  const suppliers = await stored<Party[]>(page, 'tradeflow_suppliers_v2');
  const ledger = await stored<Led[]>(page, 'tradeflow_ledger_v2');
  const owed = customers.reduce((a, c) => a + (c.totalDue || 0), 0);
  const owing = suppliers.reduce((a, s) => a + (s.totalOwed || 0), 0);
  const tb = page.getByRole('table', { name: 'Trial balance' });
  if (Math.abs(owed) > 0.001) await expect(tb.getByRole('row', { name: /Accounts receivable/ })).toContainText(await moneyIn(page, Math.abs(owed)));
  if (Math.abs(owing) > 0.001) await expect(tb.getByRole('row', { name: /Accounts payable/ })).toContainText(await moneyIn(page, Math.abs(owing)));
  // 2. Every customer / supplier balance is exactly what their statement lines add up to.
  for (const c of customers) {
    const net = ledger.filter((l) => l.entityType === 'customer' && l.entityId === c.id).reduce((a, l) => a + l.debit - l.credit, 0);
    expect(Math.round(((c.totalDue || 0) - net) * 100) / 100, `${c.name}: balance vs statement`).toBe(0);
  }
  for (const s of suppliers) {
    const net = ledger.filter((l) => l.entityType === 'supplier' && l.entityId === s.id).reduce((a, l) => a + l.debit - l.credit, 0);
    expect(Math.round(((s.totalOwed || 0) - net) * 100) / 100, `${s.company}: balance vs statement`).toBe(0);
  }
  // 3. Daily sheet closing cash = Money → Cash in hand (and the same for the bank).
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const cash = (await tile(main(page), 'Cash in hand').textContent())!.trim();
  const bank = (await tile(main(page), 'In bank').textContent())!.trim();
  await goTo(page, 'Daily Sheet');
  await expect(tile(main(page), 'Closing cash')).toHaveText(cash);
  await expect(main(page).getByText(`bank ${bank}`, { exact: true }).last()).toBeVisible();
  // 4. An item's stock figure = the balance after the last line of its history.
  if (opts.item) {
    await goTo(page, 'Items & Prices');
    const products = await stored<{ id: string; stockKg: number }[]>(page, 'tradeflow_products_v2');
    const qty = (products.find((p) => p.id === opts.item!.id)!.stockKg).toLocaleString('en-US');
    // The stock figure on the list (packs show "N tin in all" under the cartons).
    await expect(page.getByTestId(`stock-${opts.item.id}`).first()).toContainText(qty);
    await page.getByRole('button', { name: `History of ${opts.item.name}` }).first().click();
    const hist = dialog(page, `${opts.item.name} — history`);
    await expect(hist.getByTestId('item-history').locator('li').first()).toContainText(`bal ${qty}`);
    await hist.getByRole('button', { name: 'Close' }).last().click();
  }
};

// ---------------------------------------------------------------------------------------------------
// 1. Opening the shop on a new device
// ---------------------------------------------------------------------------------------------------
test.describe('QA — a new shop', () => {
  test('Admin / 1234, my account, staff & roles, items with pack / group / brand / barcode / photo / batches, customers, suppliers, dark mode, trading suite switch', async ({ page }) => {
    const done = watch(page);
    // Built-in Admin / 1234 on an empty device.
    await login(page, 'Admin', '1234');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

    // My account: username and a new password.
    await page.getByRole('button', { name: /^Account menu for/ }).click();
    await page.getByRole('menuitem', { name: /My account/ }).click();
    await expect(page.getByTestId('my-username')).toHaveText('admin');
    await page.getByLabel('Current password', { exact: true }).fill('1234');
    await page.getByLabel('New password', { exact: true }).fill('Batkhela-2026');
    await page.getByLabel('Confirm new password', { exact: true }).fill('Batkhela-2026');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('status').filter({ hasText: /password/i })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();

    // Staff user with a role.
    await goTo(page, 'Admin');
    await page.getByRole('button', { name: 'Add staff' }).click();
    const add = dialog(page, 'Add staff');
    await add.getByLabel('Full name').fill('Sana Cashier');
    await add.getByLabel('Username').fill('sana');
    await add.getByLabel('Role').selectOption('operator');
    await add.getByLabel('Temporary password').fill('welcome-sana');
    await add.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('staff-created')).toContainText('sana');
    await page.getByTestId('staff-created').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('user-row-sana')).toBeVisible();

    // Items: a tin sold in cartons with group, brand, barcode, photo and batch tracking.
    await goTo(page, 'Items & Prices');
    await page.getByRole('button', { name: 'New item' }).first().click();
    const item = dialog(page, 'New item');
    await item.getByLabel('Item name', { exact: true }).fill('Dalda 16 L Tin');
    await item.getByLabel('Sold per', { exact: true }).selectOption('tin');
    await item.getByLabel('Selling price (Rs.)', { exact: true }).fill('1000');
    await item.getByLabel('Cost price (optional)', { exact: true }).fill('800');
    await item.getByLabel('Pack (optional)', { exact: true }).fill('carton');
    await item.getByLabel('tin per pack', { exact: true }).fill('6');
    await item.getByLabel('Item code (optional)', { exact: true }).fill('DT16');
    await item.getByLabel('Group', { exact: true }).fill('Ghee');
    await item.getByLabel('Brand', { exact: true }).fill('Dalda');
    await item.getByRole('button', { name: /Make one/ }).click();
    await expect(item.getByLabel('Barcode (optional)', { exact: true })).not.toHaveValue('');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBmgAAQAAKlZA/1Wv1tBAAAAAElFTkSuQmCC', 'base64');
    await item.getByLabel('Item photo').setInputFiles({ name: 'tin.png', mimeType: 'image/png', buffer: png });
    await expect(item.getByRole('button', { name: 'Remove photo' })).toBeVisible();
    await item.getByRole('checkbox', { name: /Track batch & expiry/ }).check();
    await item.getByRole('button', { name: 'Add item' }).click();
    await expect(item).toBeHidden();
    await page.getByRole('button', { name: 'New item' }).first().click();
    await item.getByLabel('Item name', { exact: true }).fill('Habib 5 L Can');
    await item.getByLabel('Sold per', { exact: true }).selectOption('can');
    await item.getByLabel('Selling price (Rs.)', { exact: true }).fill('2000');
    await item.getByLabel('Stock on hand', { exact: true }).fill('20');
    await item.getByLabel('Group', { exact: true }).fill('Oil');
    await item.getByLabel('Brand', { exact: true }).fill('Habib');
    await item.getByRole('button', { name: 'Add item' }).click();
    await expect(main(page)).toContainText('Ghee • Dalda');
    await expect(main(page).locator('img').first()).toBeVisible(); // the photo thumbnail
    await expect(main(page)).toContainText('batch & expiry');
    await page.getByLabel('Filter by brand').selectOption('Habib');
    await expect(main(page).getByText('Dalda 16 L Tin')).toHaveCount(0);
    await page.getByLabel('Filter by brand').selectOption('');
    // Receive the first batch of tins with a batch number and expiry date.
    const expiry = new Date(Date.now() + 90 * 86_400_000).toISOString().split('T')[0];
    await page.getByRole('button', { name: 'Receive stock for Dalda 16 L Tin' }).click();
    const batchIn = dialog(page, 'Receive stock');
    await batchIn.getByLabel(/^Quantity/).fill('24');
    await batchIn.getByLabel('Batch no.', { exact: true }).fill('DL-0925');
    await batchIn.getByLabel('Expiry date', { exact: true }).fill(expiry);
    await batchIn.getByRole('button', { name: 'Receive stock' }).click();
    await expect(batchIn).toBeHidden();
    await expect(page.locator('[data-testid^="stock-details-"]:visible').filter({ hasText: 'DL-0925' })).toHaveCount(1);

    // Supplier with a Supplier ID; customer with a Customer ID and a credit limit.
    await goTo(page, 'Suppliers');
    await page.getByRole('button', { name: 'Add supplier' }).first().click();
    const sup = dialog(page, 'New supplier');
    await sup.getByLabel('Supplier ID').fill('S-01');
    await sup.getByLabel('Name', { exact: true }).fill('Ahmed');
    await sup.getByLabel('Company / mill name (optional)').fill('Dalda Foods');
    await sup.getByLabel('Phone', { exact: true }).fill('03007654321');
    await sup.getByRole('button', { name: /Save supplier/ }).click();
    await expect(main(page).getByText('S-01')).toBeVisible();
    await goTo(page, 'Customers');
    await page.getByRole('button', { name: 'Add customer' }).first().click();
    const cust = dialog(page, 'New customer');
    await cust.getByLabel('Customer ID').fill('Z01');
    await cust.getByLabel('Name', { exact: true }).fill('Zaman and Co BTK');
    await cust.getByLabel('Phone', { exact: true }).fill('03443838294');
    await cust.getByLabel('Credit limit in Rs. (optional)').fill('50000');
    await cust.getByRole('button', { name: 'Save customer' }).click();
    await expect(main(page).getByText('Z01')).toBeVisible();
    await expect(main(page)).toContainText('Rs. 50,000');

    // Dark mode on and off.
    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('button', { name: /Deep Ocean \(Dark\)/ }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('button', { name: /^Light Neutral/ }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    // Full trading suite switch in the sidebar, and back.
    await page.getByRole('button', { name: 'Full trading suite' }).click();
    await expect(page.getByRole('button', { name: 'Bookings' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Back to simple billing' }).click();
    await expect(page.getByRole('button', { name: 'Daily Sheet' }).first()).toBeVisible();

    // The new password works after signing out; the staff member must set their own.
    await page.getByRole('button', { name: /^Account menu for/ }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await login(page, 'sana', 'welcome-sana', { goto: false, waitForApp: false });
    const change = page.getByTestId('change-password-form');
    await change.getByLabel('New password', { exact: true }).fill('sana-own-pass');
    await change.getByLabel('Confirm new password').fill('sana-own-pass');
    await change.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0); // operators have no Admin
    await page.getByRole('button', { name: /^Account menu for/ }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await login(page, 'admin', 'Batkhela-2026', { goto: false });
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    done();
  });
});

// ---------------------------------------------------------------------------------------------------
// 2. Buying: re-order → PO → receive → supplier bill → claim → return → pay; godowns, adjust, labels
// ---------------------------------------------------------------------------------------------------
test.describe('QA — buying and stock', () => {
  test('re-order report → PO → receive → 3-way supplier bill → claim → purchase return → multi-item receipt → pay (cash + cheque) → godown move → leak → labels; books in step', async ({ page }) => {
    const done = await open(page);

    // Re-order report makes the purchase order.
    await goTo(page, 'Items & Prices');
    await page.getByRole('button', { name: /^Re-order/ }).click();
    const ro = dialog(page, 'Re-order report');
    await expect(ro.getByTestId('reorder-p1')).toBeVisible();
    await expect(ro.getByLabel('Qty (tin)')).toHaveValue('54'); // re-order qty 50, rounded up to full cartons of 6
    await ro.getByLabel('Qty (tin)').fill('50');
    await ro.getByLabel('Rate').fill('800');
    await ro.getByRole('button', { name: /Make purchase order/ }).click();
    await expect(page.getByTestId('purchasing-toast')).toContainText('PO-1');

    // Receive 40 of the 50 against the order.
    await goTo(page, 'Suppliers');
    await page.getByRole('tab', { name: /^Orders/ }).click();
    await page.getByRole('button', { name: 'Open PO-1' }).click();
    await dialog(page, 'Purchase order PO-1').getByRole('button', { name: 'Receive goods' }).click();
    const rcv = dialog(page, 'Receive goods for PO-1');
    await expect(rcv.locator('#rs-qty')).toHaveValue('50');
    await rcv.locator('#rs-qty').fill('40');
    await rcv.getByRole('button', { name: 'Receive stock' }).click();
    await expect(rcv).toBeHidden();
    await expect(main(page).getByText('Partly received')).toBeVisible();

    // Supplier bill at 820 a tin: Rs. 800 more than received (three-way match).
    await page.getByRole('tab', { name: 'Supplier bills' }).click();
    await page.getByRole('button', { name: 'Record supplier bill' }).click();
    const bill = dialog(page, 'Record supplier bill');
    await bill.locator('#sb-supplier').selectOption('s1');
    await bill.getByRole('checkbox').first().check();
    await expect(bill.getByLabel('Qty billed for Dalda 16 L Tin')).toHaveValue('40');
    await bill.getByLabel('Rate billed for Dalda 16 L Tin').fill('820');
    await bill.locator('#sb-number').fill('DF-4471');
    await expect(bill.getByTestId('bill-difference')).toContainText('Rs. 800 will be added');
    await bill.getByRole('button', { name: 'Save bill' }).click();
    await expect(bill).toBeHidden();
    await expect(page.getByRole('list', { name: 'Supplier bills' })).toContainText('Bill DF-4471');

    // Two tins arrived leaking: claim, the supplier accepts.
    await page.getByRole('tab', { name: /^Claims/ }).click();
    await page.getByRole('button', { name: 'New claim' }).click();
    const claim = dialog(page, 'New supplier claim');
    await claim.locator('#cl-supplier').selectOption('s1');
    await claim.locator('#cl-receipt').selectOption({ index: 1 });
    await claim.locator('#cl-qty').fill('2');
    await claim.getByRole('button', { name: 'Save claim' }).click();
    await expect(claim).toBeHidden();
    await page.getByRole('button', { name: 'Accept claim CLM-1' }).click();
    const accept = dialog(page, 'Supplier accepted CLM-1');
    await expect(accept.locator('#cl-accept-amount')).toHaveValue('1600');
    await accept.getByRole('button', { name: 'Save' }).click();
    await expect(main(page).getByText(/Claim CLM-1 accepted/)).toBeVisible();

    // Three cans go back: debit note, printed.
    await page.getByRole('button', { name: 'Return goods' }).first().click();
    const ret = dialog(page, 'Return goods to supplier');
    await ret.getByLabel('Supplier', { exact: true }).selectOption('s1');
    await ret.getByLabel('Item', { exact: true }).selectOption('p2');
    await ret.getByLabel(/^Rate per/).fill('1700');
    await ret.getByLabel(/^Quantity/).fill('3');
    await ret.getByLabel('Reason', { exact: true }).fill('Leaking cans');
    await expect(ret.getByTestId('return-amount')).toContainText('Rs. 5,100');
    await ret.getByRole('button', { name: 'Send back' }).click();
    await expect(dialog(page, 'Goods sent back')).toContainText('DN-1');
    await page.getByRole('button', { name: 'Print debit note' }).click();
    await expect(printRoot(page)).toContainText('DEBIT NOTE');
    await closePreview(page);
    await dialog(page, 'Goods sent back').getByRole('button', { name: 'Done' }).click();

    // A delivery with two items, no order.
    await page.getByRole('tab', { name: 'Suppliers', exact: true }).click();
    await page.getByRole('button', { name: 'Receive stock from Dalda Foods' }).click();
    const multi = dialog(page, 'Receive stock');
    await expect(multi.getByLabel('Supplier (optional)', { exact: true })).toHaveValue('s1');
    await multi.getByLabel('Item', { exact: true }).selectOption('p1');
    await multi.getByLabel(/^Quantity/).fill('12');
    await multi.getByLabel(/^Cost per/).fill('800');
    await multi.getByRole('button', { name: 'Add another item' }).click();
    await multi.getByLabel('Item 2', { exact: true }).selectOption('p2');
    await multi.locator('#rs-qty-2').fill('5');
    await multi.locator('#rs-cost-2').fill('1700');
    await multi.getByRole('button', { name: 'Receive 2 items' }).click();
    await expect(multi).toBeHidden();
    // 32,000 + 800 − 1,600 − 5,100 + 9,600 + 8,500
    await expect(main(page).getByText('Rs. 44,200').first()).toBeVisible();

    // Purchase register: receipts and the debit note.
    await page.getByRole('tab', { name: 'Stock received' }).click();
    await page.getByLabel('From', { exact: true }).fill('2026-01-01');
    await expect(page.getByTestId('purchase-register')).toContainText('DN-1');
    await expect(page.getByTestId('purchase-register')).toContainText('GRN-');

    // Pay the supplier: cash, then a cheque (goes into the cheque register).
    await page.getByRole('tab', { name: 'Suppliers', exact: true }).click();
    await page.getByRole('button', { name: 'Pay Dalda Foods' }).click();
    let pay = dialog(page, 'Pay supplier');
    await pay.getByLabel('Amount (Rs.)').fill('10000');
    await pay.getByRole('button', { name: 'Pay', exact: true }).click();
    await expect(pay).toBeHidden();
    await page.getByRole('button', { name: 'Pay Dalda Foods' }).click();
    pay = dialog(page, 'Pay supplier');
    await pay.getByLabel('Amount (Rs.)').fill('5000');
    await pay.getByLabel('Method').selectOption('Cheque');
    await pay.getByLabel('Cheque no.').fill('777001');
    await pay.getByLabel('Bank', { exact: true }).fill('HBL');
    await pay.getByRole('button', { name: 'Pay', exact: true }).click();
    await expect(pay).toBeHidden();
    await expect(main(page).getByText('Rs. 29,200').first()).toBeVisible();
    // Supplier statement closes on what is owed.
    await page.getByRole('button', { name: /Dalda Foods/ }).first().click();
    await dialog(page, 'Dalda Foods').getByRole('button', { name: 'Statement' }).click();
    await expect(printRoot(page)).toContainText('Closing balance as at');
    await expect(printRoot(page).locator('tfoot')).toContainText('29,200');
    // The cash payment took the next supplier-payment number (number series).
    await expect(printRoot(page)).toContainText('SUP-PAY-1');
    await closePreview(page);
    await page.keyboard.press('Escape');
    await goTo(page, 'Money');
    await page.getByRole('button', { name: 'Cheques', exact: true }).click();
    await page.getByTestId('cheques-tab').getByRole('tab', { name: /^Issued/ }).click();
    await expect(page.getByTestId('cheques-tab').getByTestId('cheque-row').filter({ hasText: '777001' })).toBeVisible();

    // Godowns: a back store, move 10 tins there.
    await goTo(page, 'Items & Prices');
    await page.getByRole('button', { name: /^Godowns/ }).click();
    const gd = dialog(page, 'Godowns');
    await gd.getByLabel('New godown', { exact: true }).fill('Back store');
    await gd.getByRole('button', { name: 'Add', exact: true }).click();
    await gd.getByRole('button', { name: 'Move stock between godowns' }).click();
    const mv = dialog(page, 'Move stock');
    await mv.getByLabel('Item', { exact: true }).selectOption('p1');
    await mv.getByLabel(/^Quantity/).fill('10');
    await mv.getByRole('button', { name: 'Move stock' }).click();
    await expect(mv).toBeHidden();
    await expect(page.locator('[data-testid="stock-details-p1"]:visible')).toContainText('Back store: 10');
    // With two godowns the header has one more button ("Move stock"); the title must not be squeezed.
    const title = page.getByRole('heading', { name: 'Items & Prices' });
    const expectWideTitle = async (label: string) => {
      const box = (await title.boundingBox())!;
      expect(box.width, `${label}: title width`).toBeGreaterThan(150);
      expect(box.height, `${label}: title on one line`).toBeLessThan(45);
    };
    await expectWideTitle('1360px');
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expectWideTitle('1600px, sidebar collapsed');
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await page.setViewportSize({ width: 1360, height: 900 });

    // Two tins leaked in the shop: stock adjustment with a reason.
    await page.getByRole('button', { name: 'Adjust stock of Dalda 16 L Tin' }).click();
    const adj = dialog(page, 'Adjust stock');
    await adj.getByRole('radio', { name: 'Leaked' }).click();
    await adj.getByLabel(/^Quantity lost/).fill('2');
    await adj.getByLabel('Note', { exact: true }).fill('front shelf');
    await adj.getByRole('button', { name: 'Save adjustment' }).click();
    await expect(adj).toBeHidden();
    await expect(page.getByTestId('stock-p1').first()).toContainText('110 tin in all'); // 60 + 40 + 12 − 2

    // Barcode labels.
    await page.getByRole('button', { name: 'Labels' }).click();
    const labels = dialog(page, 'Print barcode labels');
    await labels.getByLabel('Labels for Dalda 16 L Tin').fill('2');
    // The count box is narrow and the item names stay readable beside it.
    expect((await labels.getByLabel('Labels for Dalda 16 L Tin').boundingBox())!.width).toBeLessThan(100);
    expect((await labels.getByText('Dalda 16 L Tin', { exact: true }).boundingBox())!.width).toBeGreaterThan(80);
    await labels.getByRole('button', { name: 'Preview labels' }).click();
    await expect(page.getByTestId('label-preview').getByTestId('label')).toHaveCount(2);
    await page.getByRole('button', { name: 'Close label preview' }).click();
    await page.keyboard.press('Escape');

    await checkBooks(page, { item: { id: 'p1', name: 'Dalda 16 L Tin' } });
    done();
  });
});

// ---------------------------------------------------------------------------------------------------
// 3. Selling: New Bill with everything, credit limit, print sizes, pay later, return, challan,
//    quotation → bill, CSV, approvals
// ---------------------------------------------------------------------------------------------------
test.describe('QA — selling', () => {
  test('F2 bill with customer panel, cartons, scheme, line + bill discount, freight, salesman / area, cost centre, split cash / bank / cheque; credit limit; A4 / A5 / thermal; pay later; return; challan; quotation → bill; staff bill approved by the owner; books in step', async ({ page }) => {
    const done = await open(page);

    // Sales team, area and a "10 + 1" scheme; Zaman gets defaults and a special rate on cans.
    await goTo(page, 'Customers');
    await main(page).getByRole('button', { name: 'Sales & recovery' }).click();
    await dialog(page, 'Sales & recovery').getByRole('button', { name: /Salesmen & areas/ }).click();
    const team = dialog(page, 'Salesmen & areas');
    await team.getByLabel('Name', { exact: true }).fill('Rashid');
    await team.getByLabel('Commission %').fill('2');
    await team.getByRole('button', { name: 'Add salesman' }).click();
    await expect(team.getByTestId('salesmen-list')).toContainText('Rashid');
    await team.getByRole('tab', { name: /Areas/ }).click();
    await team.getByLabel('Area name').fill('Saddar');
    await team.getByRole('button', { name: 'Add area' }).click();
    await page.keyboard.press('Escape');
    await main(page).getByRole('button', { name: 'Sales & recovery' }).click();
    await dialog(page, 'Sales & recovery').getByRole('button', { name: /Schemes/ }).click();
    const sch = dialog(page, 'Schemes');
    await sch.getByRole('button', { name: 'New scheme' }).click();
    await sch.getByLabel('Scheme name').fill('Dalda 10 + 1');
    await sch.getByLabel('Item bought').selectOption('p1');
    await sch.getByLabel('For every (qty bought)').fill('10');
    await sch.getByLabel('Free qty').fill('1');
    await sch.getByRole('button', { name: 'Save scheme' }).click();
    await expect(sch.getByTestId('schemes-list')).toContainText('Dalda 10 + 1');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    const zaman = dialog(page, 'Zaman and Co BTK');
    const panel = zaman.getByTestId('customer-sales-panel');
    await panel.getByLabel('Area', { exact: true }).selectOption({ label: 'Saddar' });
    await panel.getByLabel('Salesman', { exact: true }).selectOption({ label: 'Rashid' });
    await panel.getByRole('button', { name: 'Save area & salesman' }).click();
    await expect(panel).toContainText('saved');
    await zaman.getByLabel('Rate item', { exact: true }).selectOption('p2');
    await zaman.getByLabel('Their rate', { exact: true }).fill('1900');
    await zaman.getByRole('button', { name: 'Save rate' }).click();
    await expect(zaman.getByTestId('customer-rates')).toContainText('Habib 5 L Can');
    await page.keyboard.press('Escape');
    // A cost centre for the P&L.
    await goTo(page, 'Accounts');
    await page.getByRole('tablist', { name: 'Accounts views' }).getByRole('tab', { name: 'Cost centres', exact: true }).click();
    await page.getByTestId('centres-tab').getByLabel('New cost centre').fill('Main shop');
    await page.getByTestId('centres-tab').getByRole('button', { name: 'Add' }).click();
    await expect(page.getByTestId('centres-tab').getByTestId('centre-row')).toContainText('Main shop');

    // --- F2: the big bill.
    await goTo(page, 'Home');
    await page.keyboard.press('F2');
    const bill = dialog(page, 'New Bill');
    await expect(bill).toBeVisible();
    await bill.getByLabel('Customer', { exact: true }).selectOption('c1');
    await expect(bill.getByTestId('bill-customer-info')).toContainText('Balance');
    await expect(bill.getByLabel('Salesman', { exact: true })).not.toHaveValue('');
    await expect(bill.getByLabel('Area', { exact: true })).not.toHaveValue('');
    await bill.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await bill.getByLabel('Unit 1', { exact: true }).selectOption({ label: 'carton (6)' });
    await expect(bill.getByLabel('Price 1', { exact: true })).toHaveValue('6000');
    await bill.getByLabel('Quantity 1', { exact: true }).fill('2');
    await expect(bill.getByTestId('bill-free-lines')).toContainText('Dalda 16 L Tin'); // 12 tins → 1 free
    await bill.getByRole('button', { name: 'Add another item' }).click();
    await bill.getByLabel('Item 2', { exact: true }).selectOption('p2');
    await expect(bill.getByLabel('Price 2', { exact: true })).toHaveValue('1900');
    await expect(bill.getByTestId('customer-rate-2')).toBeVisible();
    await bill.getByLabel('Quantity 2', { exact: true }).fill('5');
    await bill.getByLabel('Discount 2', { exact: true }).fill('10');
    await bill.getByRole('group', { name: 'Discount type 2' }).getByRole('button', { name: '%' }).click();
    await bill.getByLabel('Carriage Expenses (Rs.)', { exact: true }).fill('100');
    await bill.getByLabel('Others Charges').fill('500');
    await bill.getByLabel('Cost centre (optional)').selectOption({ label: 'Main shop' });
    // 12,000 + (9,500 − 10%) − 100 + 500 = 20,950
    await expect(bill.getByText('Rs. 20,950').first()).toBeVisible();
    // Payment Method grid: cash, the bank, and a customer's cheque (Cheques in hand).
    await addPayment(bill, '1000', '5000');
    await addPayment(bill, '1010', '3000');
    await addPayment(bill, '1150', '12950', { keep: true });
    await bill.getByLabel('Cheque no.', { exact: true }).fill('445566');
    await bill.getByLabel('Bank', { exact: true }).fill('HBL');
    await expect(bill).toContainText('Fully paid');
    await saveAndPrint(bill);
    await expect(bill).toBeHidden();
    await expect(printRoot(page)).toContainText('INVOICE');
    await expect(printRoot(page)).toHaveAttribute('data-paper', 'a4');
    await expect(printRoot(page).getByTestId('print-free-line')).toContainText('FREE — Dalda 10 + 1');
    await expect(printRoot(page).getByTestId('print-freight')).toContainText('500');
    await expect(printRoot(page).getByTestId('print-bill-salesman')).toContainText('Salesman: Rashid · Area: Saddar');
    await expect(printRoot(page).getByTestId('print-line-packs').first()).toContainText('2 cartons');
    await closePreview(page);

    // --- Credit limit: Haji Karim (limit 20,000). Scan the tin by barcode, 25 of them on credit.
    await page.getByRole('main').getByRole('button', { name: 'New Bill', exact: true }).first().click();
    await bill.getByLabel('Customer', { exact: true }).selectOption('c2');
    await bill.getByRole('button', { name: 'Scan barcode' }).click();
    const scan = dialog(page, 'Scan barcode');
    await scan.getByLabel('Barcode or item code').fill('8964000123456');
    await scan.getByLabel('Barcode or item code').press('Enter');
    await expect(scan.getByText('Dalda 16 L Tin added.')).toBeVisible();
    await scan.getByRole('button', { name: 'Close scanner' }).click();
    await expect(bill.getByLabel('Item 1', { exact: true })).toHaveValue('p1');
    await bill.getByLabel('Quantity 1', { exact: true }).fill('25');
    const credit = bill.getByTestId('bill-credit');
    await expect(credit.getByRole('alert')).toContainText('Over the credit limit');
    await expect(bill.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await credit.getByLabel('Allow over limit').check();
    await credit.getByLabel('Reason for allowing over limit').fill('Pays every Friday');
    await bill.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bill).toBeHidden();

    // --- Paper sizes: A5, then the thermal receipt, then back to A4.
    await goTo(page, 'Admin');
    await page.getByRole('button', { name: /System & Backups/ }).click();
    await page.getByTestId('bill-settings').getByLabel('Print bills and receipts on').selectOption('a5');
    await goTo(page, 'Bills');
    await main(page).getByRole('button', { name: 'Print INV-2' }).click();
    await expect(printRoot(page)).toHaveAttribute('data-paper', 'a5');
    await expect(printRoot(page)).toContainText('Haji Karim');
    await closePreview(page);
    await goTo(page, 'Admin');
    await page.getByRole('button', { name: /System & Backups/ }).click();
    await page.getByTestId('bill-settings').getByLabel('Print bills and receipts on').selectOption('thermal80');
    await goTo(page, 'Bills');
    await main(page).getByRole('button', { name: 'Print INV-1' }).click();
    await expect(page.getByTestId('thermal-receipt')).toContainText('Paid (Cash + Bank Transfer + Cheque)');
    await closePreview(page);
    await goTo(page, 'Admin');
    await page.getByRole('button', { name: /System & Backups/ }).click();
    await page.getByTestId('bill-settings').getByLabel('Print bills and receipts on').selectOption('a4');

    // --- Bills list: search, unpaid, CSV; pay part of Haji's bill later.
    await goTo(page, 'Bills');
    await page.getByLabel('Search bills').fill('haji');
    await expect(main(page).getByText('INV-1')).toHaveCount(0);
    await page.getByLabel('Search bills').fill('');
    await page.getByRole('button', { name: 'Unpaid' }).click();
    await expect(main(page).getByText('INV-2').first()).toBeVisible();
    await expect(main(page).getByText('INV-1')).toHaveCount(0);
    const csv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download as CSV' }).click();
    expect(readFileSync(await (await csv).path(), 'utf8')).toContain('Haji Karim');
    await page.getByRole('button', { name: 'Unpaid' }).click();
    await page.getByRole('button', { name: /Haji Karim/ }).first().click();
    const inv2 = dialog(page, 'Bill INV-2');
    await expect(inv2.getByText(/Allowed over credit limit/)).toBeVisible();
    await inv2.getByLabel('Amount', { exact: true }).fill('10000');
    await inv2.getByRole('button', { name: 'Receive', exact: true }).click();
    await expect(inv2.getByText(/15,000 still due/)).toBeVisible();
    await page.keyboard.press('Escape');

    // --- Zaman brings one can back: money given back, credit note printed; then a delivery challan.
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    await dialog(page, 'Bill INV-1').getByRole('button', { name: 'Return items' }).click();
    const ret = dialog(page, 'Return items — Bill INV-1');
    await ret.getByLabel('Return qty 2', { exact: true }).fill('1');
    await ret.getByLabel('Why (optional)', { exact: true }).fill('Dented can');
    await ret.getByRole('button', { name: 'Save return' }).click();
    await expect(printRoot(page)).toContainText('CREDIT NOTE');
    await expect(printRoot(page)).toContainText('CN-1');
    await page.keyboard.press('Escape');
    const again = dialog(page, 'Bill INV-1');
    await expect(again.getByText('CN-1')).toBeVisible();
    await again.getByRole('button', { name: 'Delivery challan' }).click();
    await again.getByLabel('Driver (optional)', { exact: true }).fill('Gul Khan');
    await again.getByRole('button', { name: 'Print challan' }).click();
    await expect(printRoot(page)).toContainText('DELIVERY CHALLAN');
    await expect(printRoot(page)).toContainText('Gul Khan');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // --- Quotation for Haji Karim becomes a bill.
    await page.getByRole('tab', { name: /Quotations/ }).click();
    await page.getByRole('button', { name: 'New Quotation' }).click();
    const q = dialog(page, 'New Quotation');
    await q.getByLabel('Customer', { exact: true }).selectOption('c2');
    await q.getByLabel('Quote item 1', { exact: true }).selectOption('p2');
    await q.getByLabel('Quote qty 1', { exact: true }).fill('2');
    await q.getByLabel('Quote price 1', { exact: true }).fill('1950');
    await q.getByRole('button', { name: 'Save & Print' }).click();
    await expect(printRoot(page)).toContainText('QUOTATION');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Make bill from QT-1' }).click();
    const fromQuote = dialog(page, 'New Bill');
    await fromQuote.getByTestId('bill-line').first().click(); // the quoted line, back in the entry row
    await expect(fromQuote.getByLabel('Price 1', { exact: true })).toHaveValue('1950');
    await fromQuote.getByRole('button', { name: 'Full' }).click();
    await fromQuote.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(fromQuote).toBeHidden();
    await expect(main(page).getByText('Billed')).toBeVisible();

    // --- Approval rule: bills with more than 5% discount need the owner.
    await goTo(page, 'Admin');
    await page.getByRole('button', { name: /Rules, numbers & branches/ }).click();
    await page.getByLabel('Discount on a bill above (%)').fill('5');
    await page.getByRole('button', { name: 'Save rules' }).click();
    await expect(page.getByText('Approval rules saved.')).toBeVisible();
    await page.getByRole('button', { name: /^Account menu for/ }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await login(page, OPERATOR.username, OPERATOR.password, { goto: false });
    await main(page).getByRole('button', { name: 'New Bill', exact: true }).first().click();
    await bill.getByLabel('Customer', { exact: true }).selectOption('c1');
    await bill.getByLabel('Item 1', { exact: true }).selectOption('p2');
    await bill.getByLabel('Quantity 1', { exact: true }).fill('2');
    await bill.getByLabel('Carriage Expenses (Rs.)', { exact: true }).fill('400'); // 400 of 3,800 = 10.5%
    await expect(bill.getByTestId('bill-needs-approval')).toContainText('over the 5% limit');
    await bill.getByLabel('Paid now', { exact: true }).fill('3400');
    await bill.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bill.getByTestId('bill-sent-for-approval')).toContainText('Sent for approval');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Account menu for/ }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await login(page, OWNER.username, OWNER.password, { goto: false });
    await page.getByTestId('approvals-tile').click();
    const inbox = dialog(page, 'Approvals');
    await inbox.getByTestId('approval-request').first().getByRole('button', { name: 'Approve' }).click();
    await expect(inbox.getByText(/Approved\. Bill INV-4 is posted\./)).toBeVisible();
    await page.keyboard.press('Escape');

    await checkBooks(page, { item: { id: 'p2', name: 'Habib 5 L Can' } });
    done();
  });
});

// ---------------------------------------------------------------------------------------------------
// 4. Money: expenses, cash ↔ bank, receive from many, cheques end to end, daily sheet, bank reconciliation
// ---------------------------------------------------------------------------------------------------
test.describe('QA — money', () => {
  test('expense, cash → bank, receive from many, cheques (receive / deposit / clear / bounce / give / print), daily sheet, bank reconciliation; closing cash = cash in hand', async ({ page }) => {
    const done = await open(page);
    const today = new Date().toISOString().split('T')[0];
    const dmy = today.split('-').reverse().join('/');

    // A credit bill for Zaman (20,000) and stock bought on credit (17,000) so there is money to move.
    await main(page).getByRole('button', { name: 'New Bill', exact: true }).first().click();
    const bill = dialog(page, 'New Bill');
    await bill.getByLabel('Customer', { exact: true }).selectOption('c1');
    await bill.getByLabel('Item 1', { exact: true }).selectOption('p2');
    await bill.getByLabel('Quantity 1', { exact: true }).fill('10');
    await bill.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bill).toBeHidden();
    await goTo(page, 'Suppliers');
    await page.getByRole('button', { name: 'Receive stock from Dalda Foods' }).click();
    const rcv = dialog(page, 'Receive stock');
    await rcv.getByLabel('Item', { exact: true }).selectOption('p2');
    await rcv.getByLabel(/^Quantity/).fill('10');
    await rcv.getByLabel(/^Cost per/).fill('1700');
    await rcv.getByRole('button', { name: 'Receive stock' }).click();
    await expect(rcv).toBeHidden();

    // Expense (cash) from the Money screen's expense sheets.
    await goTo(page, 'Money');
    await page.getByRole('button', { name: 'Expense sheets', exact: true }).click();
    await main(page).getByRole('button', { name: 'Add expense' }).first().click();
    const exp = dialog(page, 'Add expense');
    await exp.getByLabel('What for', { exact: true }).fill('Shop electricity');
    await exp.getByLabel('Amount (Rs.)', { exact: true }).fill('3500');
    await exp.getByRole('button', { name: 'Save expense' }).click();
    await expect(main(page).getByText('Shop electricity')).toBeVisible();

    // Cash → bank.
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await main(page).getByRole('button', { name: 'Cash ↔ Bank' }).click();
    const tr = dialog(page, 'Cash ↔ Bank');
    await tr.getByLabel('Amount (Rs.)', { exact: true }).fill('20000');
    await tr.getByRole('button', { name: 'Record' }).click();
    await expect(tr).toBeHidden();

    // Receive from many: Old Khan Store pays 5,000 cash; collection sheet printed.
    await main(page).getByRole('button', { name: 'Receive from many' }).click();
    const many = dialog(page, 'Receive from many');
    await many.getByLabel('Line 1 customer').selectOption('c3');
    await many.getByLabel('Line 1 amount').fill('5000');
    await many.getByRole('button', { name: 'Save & Print' }).click();
    await expect(printRoot(page).getByTestId('print-collection')).toContainText('Old Khan Store');
    await closePreview(page);
    await dialog(page, 'Money received').getByRole('button', { name: 'Done' }).click();

    // Cheques: Zaman pays 10,000 by cheque (cleared) and 5,000 by a cheque that bounces.
    await main(page).getByRole('button', { name: 'Receive payment' }).first().click();
    const rc = dialog(page, 'Receive payment');
    await rc.getByLabel('Customer').selectOption('c1');
    await rc.getByLabel('Amount (Rs.)').fill('10000');
    await rc.getByLabel('Method').selectOption('Cheque');
    await rc.getByLabel('Cheque no.').fill('500100');
    await rc.getByLabel('Bank', { exact: true }).fill('MCB');
    await rc.getByRole('button', { name: 'Receive' }).click();
    await expect(rc).toBeHidden();
    await page.getByRole('button', { name: 'Cheques', exact: true }).click();
    const tab = page.getByTestId('cheques-tab');
    await tab.getByRole('button', { name: 'Cheque received' }).click();
    const form = dialog(page, 'Cheque received');
    await form.getByLabel('Customer').selectOption('c1');
    await form.getByLabel('Amount (Rs.)').fill('5000');
    await form.getByLabel('Cheque no.').fill('500101');
    await form.getByLabel('Bank', { exact: true }).fill('UBL');
    await form.getByRole('button', { name: 'Save cheque' }).click();
    await expect(form).toBeHidden();
    await tab.getByTestId('cheque-row').filter({ hasText: '500100' }).getByRole('button', { name: 'Deposit' }).click();
    await dialog(page, 'Deposit cheque').getByRole('button', { name: 'Deposit' }).click();
    await tab.getByRole('tab', { name: /^Deposited/ }).click();
    await tab.getByTestId('cheque-row').filter({ hasText: '500100' }).getByRole('button', { name: 'Mark cleared' }).click();
    await dialog(page, 'Mark cheque cleared').getByRole('button', { name: 'Mark cleared' }).click();
    await expect(tab.getByText(/10,000 added to the bank/)).toBeVisible();
    await tab.getByRole('tab', { name: /^In hand/ }).click();
    await tab.getByTestId('cheque-row').filter({ hasText: '500101' }).getByRole('button', { name: 'Bounced' }).click();
    const bounce = dialog(page, 'Cheque bounced');
    await bounce.getByLabel('Why it bounced').fill('Insufficient funds');
    await bounce.getByLabel('Bank charge (Rs.)').fill('300');
    await bounce.getByRole('button', { name: 'Customer' }).click();
    await bounce.getByRole('button', { name: 'Mark bounced' }).click();
    await expect(tab.getByText(/5,300 added back to Zaman and Co BTK/)).toBeVisible();
    // A cheque to the supplier, printed on the saved layout; then the register.
    await tab.getByRole('button', { name: 'Give a cheque' }).click();
    const give = dialog(page, 'Give a cheque');
    await give.getByLabel('Supplier').selectOption('s1');
    await give.getByLabel('Amount (Rs.)').fill('12000');
    await give.getByLabel('Cheque no.').fill('900001');
    await give.getByLabel('Bank', { exact: true }).fill('Meezan Bank');
    await give.getByRole('button', { name: 'Save cheque' }).click();
    await expect(give).toBeHidden();
    await tab.getByRole('tab', { name: /^All/ }).click();
    await tab.getByRole('button', { name: 'Print cheque 900001' }).click();
    await expect(page.getByTestId('cheque-leaf').getByTestId('cheque-words')).toHaveText('Rupees Twelve Thousand Only');
    await closePreview(page);
    await tab.getByRole('button', { name: 'Print register' }).click();
    await expect(printRoot(page)).toContainText('CHEQUE REGISTER');
    await closePreview(page);

    // Daily sheet: cheques, expense, deposit; printable; CSV.
    await goTo(page, 'Daily Sheet');
    await expect(page.getByTestId('daily-cheques')).toContainText('Bounced');
    await expect(main(page).getByText('Shop electricity')).toBeVisible();
    await expect(main(page).getByText('Deposited cash to bank').first()).toBeVisible();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download daily sheet CSV' }).click();
    expect(readFileSync(await (await dl).path(), 'utf8')).toContain('500100');
    await main(page).getByRole('button', { name: 'Print' }).click();
    await expect(printRoot(page)).toContainText('DAILY SHEET');
    await closePreview(page);

    // Bank reconciliation: the statement has the deposit, the cleared cheque, the bounce charge and an SMS fee.
    await goTo(page, 'Money');
    await page.getByRole('button', { name: 'Bank reconciliation' }).click();
    const csvText = ['Date,Description,Amount', `${dmy},Cash deposit,20000`, `${dmy},Clearing chq 500100,10000`, `${dmy},Return charges,-300`, `${dmy},SMS alerts,-150`].join('\n');
    await page.getByTestId('bank-csv-input').setInputFiles({ name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(csvText) });
    await page.getByTestId('bank-mapping').getByRole('button', { name: 'Import 4 lines' }).click();
    const rec = page.getByTestId('bank-rec');
    await expect(rec.getByText(/4 lines added\. 3 matched automatically\./)).toBeVisible();
    const sms = rec.getByTestId('bank-line').filter({ hasText: 'SMS alerts' });
    await sms.getByRole('button', { name: 'Add as expense' }).click();
    await sms.getByRole('button', { name: 'Add expense' }).click();
    await page.getByLabel('Closing balance on statement').fill('229550'); // 200,000 + 20,000 + 10,000 − 300 − 150
    await expect(page.getByTestId('rec-status')).toContainText('Reconciled ✓');
    await page.getByTestId('bank-summary').getByRole('button', { name: 'Save' }).click();
    await page.getByTestId('bank-summary').getByRole('button', { name: 'Print' }).click();
    await expect(printRoot(page)).toContainText('BANK RECONCILIATION');
    await closePreview(page);

    // Money overview: what customers owe = 20,000 − 10,000 − 5,000 + 5,300 + 13,070 − 5,000.
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(tile(main(page), 'Customers owe you')).toHaveText('Rs. 18,370');
    // A name in "Customers owe you" / "You owe" opens that customer / supplier on the billing screens.
    await main(page).getByRole('button', { name: /^Old Khan Store/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
    await expect(dialog(page, 'Old Khan Store').getByTestId('customer-sales-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await goTo(page, 'Money');
    await main(page).getByRole('button', { name: /^Dalda Foods/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Suppliers' })).toBeVisible();
    await expect(dialog(page, 'Dalda Foods')).toContainText('Stock received');
    await page.keyboard.press('Escape');
    await checkBooks(page, { item: { id: 'p2', name: 'Habib 5 L Can' } });
    done();
  });
});

// ---------------------------------------------------------------------------------------------------
// 5. Reports and the books
// ---------------------------------------------------------------------------------------------------
test.describe('QA — reports and accounts', () => {
  test('aging, recovery, sales by salesman / area, commission, interest, profit by item / customer / group / brand, owner dashboard + daily report, CSVs; trial balance, ledger, journal, manual entry, chart, P&L, balance sheet, cash flow, budgets, cost centres, assets + depreciation, salaries + advance + payslip, year close, period lock', async ({ page }) => {
    const done = await open(page);
    const accTab = (name: string) => page.getByRole('tablist', { name: 'Accounts views' }).getByRole('tab', { name, exact: true }).click();

    // Salesman + area on Zaman; two bills.
    await goTo(page, 'Customers');
    await main(page).getByRole('button', { name: 'Sales & recovery' }).click();
    await dialog(page, 'Sales & recovery').getByRole('button', { name: /Salesmen & areas/ }).click();
    const team = dialog(page, 'Salesmen & areas');
    await team.getByLabel('Name', { exact: true }).fill('Rashid');
    await team.getByLabel('Commission %').fill('2');
    await team.getByRole('button', { name: 'Add salesman' }).click();
    await team.getByRole('tab', { name: /Areas/ }).click();
    await team.getByLabel('Area name').fill('Saddar');
    await team.getByRole('button', { name: 'Add area' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    const panel = dialog(page, 'Zaman and Co BTK').getByTestId('customer-sales-panel');
    await panel.getByLabel('Area', { exact: true }).selectOption({ label: 'Saddar' });
    await panel.getByLabel('Salesman', { exact: true }).selectOption({ label: 'Rashid' });
    await panel.getByRole('button', { name: 'Save area & salesman' }).click();
    await expect(panel).toContainText('saved');
    await page.keyboard.press('Escape');
    // Old Khan Store pays 2% a month late-payment interest after 30 days.
    await page.getByRole('button', { name: /Old Khan Store/ }).first().click();
    const okPanel = dialog(page, 'Old Khan Store').getByTestId('customer-sales-panel');
    await okPanel.getByLabel('Interest % a month').fill('2');
    await okPanel.getByLabel('After how many days').fill('30');
    await okPanel.getByRole('button', { name: 'Save area & salesman' }).click();
    await expect(okPanel).toContainText('saved');
    await page.keyboard.press('Escape');
    const makeBill = async (cust: string, item: string, qty: string, paid: string) => {
      await main(page).getByRole('button', { name: `New bill for ${cust}` }).click();
      const b = dialog(page, 'New Bill');
      await b.getByLabel('Item 1', { exact: true }).selectOption(item);
      await b.getByLabel('Quantity 1', { exact: true }).fill(qty);
      if (paid) await b.getByLabel('Paid now', { exact: true }).fill(paid);
      await b.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(b).toBeHidden();
    };
    await makeBill('Zaman and Co BTK', 'p1', '10', '');
    await makeBill('Haji Karim', 'p2', '5', '10000');

    // Aging: the old bill is 61–90 days.
    await main(page).getByRole('button', { name: 'Who owes for how long' }).click();
    const aging = dialog(page, 'Who owes for how long');
    await expect(aging.getByTestId('aging-table').locator('tr', { hasText: 'Old Khan Store' })).toContainText('13,070');
    const agingCsv = page.waitForEvent('download');
    await aging.getByRole('button', { name: 'CSV' }).click();
    expect(readFileSync(await (await agingCsv).path(), 'utf8')).toContain('Old Khan Store');
    await aging.getByRole('button', { name: 'Close' }).last().click();
    // Customers CSV.
    const custCsv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download customers CSV' }).click();
    expect(readFileSync(await (await custCsv).path(), 'utf8')).toContain('Z01');

    // Sales by salesman and by area; recovery list; commission paid.
    await main(page).getByRole('button', { name: 'Sales & recovery' }).click();
    await dialog(page, 'Sales & recovery').getByRole('button', { name: /Sales by salesman/ }).click();
    const rep = dialog(page, 'Sales reports');
    await expect(rep.getByTestId('sales-by-table')).toContainText('Rashid');
    await rep.getByRole('tab', { name: 'By area' }).click();
    await expect(rep.getByTestId('sales-by-table')).toContainText('Saddar');
    await rep.getByRole('tab', { name: 'Recovery list' }).click();
    await expect(rep.getByTestId('recovery-list')).toContainText('Old Khan Store');
    await rep.getByRole('tab', { name: 'Commission' }).click();
    const com = rep.getByTestId('commission-list');
    await expect(com).toContainText('still owed Rs. 200');
    // "Earned" is for the dates picked; what is still owed is clearly all time up to the end date.
    await expect(com).toContainText('earned in these dates');
    await expect(com.getByTestId('commission-to-date')).toContainText(/All time up to .*: earned Rs\. 200 • paid Rs\. 0 • still owed Rs\. 200/);
    await com.getByRole('button', { name: 'Pay commission' }).click();
    await rep.getByTestId('pay-commission-form').getByRole('button', { name: 'Pay', exact: true }).click();
    await expect(com).toContainText('still owed Rs. 0');
    await page.keyboard.press('Escape');
    // Late-payment interest.
    await main(page).getByRole('button', { name: 'Sales & recovery' }).click();
    await dialog(page, 'Sales & recovery').getByRole('button', { name: /Charge interest/ }).click();
    const run = dialog(page, 'Charge interest');
    await expect(run.getByTestId('interest-preview')).toContainText('Old Khan Store');
    await run.getByRole('button', { name: 'Post interest' }).click();
    await expect(run).toContainText('charged to 1 customer');
    await page.keyboard.press('Escape');

    // Owner dashboard and the printable daily business report.
    await goTo(page, 'Owner dashboard');
    await expect(page.getByTestId('owner-dashboard')).toContainText('Stock value (at cost)');
    await page.getByRole('button', { name: 'Daily business report' }).click();
    await expect(page.getByTestId('daily-business-report')).toContainText('DAILY BUSINESS REPORT');
    await page.getByRole('button', { name: 'Close report' }).click();

    // Accounts: profit by item / group / brand / customer.
    await goTo(page, 'Accounts');
    await accTab('Profit by item');
    await expect(page.getByTestId('profit-by-item').locator('tr', { hasText: 'Dalda 16 L Tin' })).toContainText('2,000'); // 10 × (1,000 − 800)
    for (const by of ['By group', 'By brand', 'By customer']) {
      await page.getByRole('tablist', { name: 'Profit by' }).getByRole('tab', { name: by }).click();
      await expect(main(page)).toContainText(by === 'By group' ? 'Ghee' : by === 'By brand' ? 'Habib' : 'Haji Karim');
    }

    // Trial balance → ledger of receivables; CSV.
    await accTab('Trial balance');
    const tbCsv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download trial balance CSV' }).click();
    const tbRows = readFileSync(await (await tbCsv).path(), 'utf8').trim().split('\n');
    const total = tbRows[tbRows.length - 1].split(',');
    expect(total[2]).toBe(total[3]);
    await page.getByRole('table', { name: 'Trial balance' }).getByRole('row', { name: /Accounts receivable/ }).click();
    await expect(page.getByRole('table', { name: 'General ledger' })).toContainText('INV-1');

    // Manual journal entry, then the journal filtered to manual entries.
    await page.getByRole('button', { name: 'New journal entry' }).click();
    const je = dialog(page, 'New journal entry');
    await je.getByLabel('Narration', { exact: true }).fill('Owner paid rent from home');
    await je.getByLabel('Account 1', { exact: true }).selectOption('6010');
    await je.getByLabel('Debit 1', { exact: true }).fill('15000');
    await je.getByLabel('Account 2', { exact: true }).selectOption('3000');
    await je.getByLabel('Credit 2', { exact: true }).fill('15000');
    await expect(je.getByText('Balanced ✓')).toBeVisible();
    await je.getByRole('button', { name: 'Save entry' }).click();
    await expect(je).toBeHidden();
    await accTab('Journal');
    await page.getByLabel('Show', { exact: true }).selectOption('manual');
    await expect(page.getByTestId('journal-entry')).toContainText('Owner paid rent from home');

    // Chart of accounts: a new bank account.
    await accTab('Chart of accounts');
    await page.getByLabel('Code', { exact: true }).fill('1020');
    await page.getByLabel('Type', { exact: true }).selectOption('asset');
    await page.getByLabel('Name', { exact: true }).fill('Meezan Bank');
    await page.getByRole('button', { name: 'Add account' }).click();
    await expect(page.getByRole('table', { name: 'Chart of accounts' })).toContainText('Meezan Bank');

    // Cost centre + a fuel expense tagged with it; a fuel budget of 10,000 is 80% used.
    await accTab('Cost centres');
    await page.getByTestId('centres-tab').getByLabel('New cost centre').fill('Shehzore truck');
    await page.getByTestId('centres-tab').getByLabel('Kind').selectOption('vehicle');
    await page.getByTestId('centres-tab').getByRole('button', { name: 'Add' }).click();
    await goTo(page, 'Daily Sheet');
    await main(page).getByRole('button', { name: 'Add expense' }).first().click();
    const ex = dialog(page, 'Add expense');
    await ex.getByLabel('What for', { exact: true }).fill('Diesel');
    await ex.getByLabel('Amount (Rs.)', { exact: true }).fill('8000');
    await ex.getByLabel('Category').selectOption('fuel');
    await ex.getByLabel('Cost centre (optional)').selectOption({ label: 'Shehzore truck' });
    await ex.getByRole('button', { name: 'Save expense' }).click();
    await goTo(page, 'Accounts');
    await accTab('Cost centres');
    await expect(page.getByTestId('centre-pnl').filter({ hasText: 'Shehzore truck' })).toContainText('Rs. 8,000');
    await accTab('Budgets');
    const bt = page.getByTestId('budget-tab');
    await bt.getByRole('tab', { name: 'Set budget' }).click();
    await bt.getByLabel(/6040\s*Fuel/).fill('10000');
    await bt.getByLabel(/6040\s*Fuel/).blur();
    await bt.getByRole('tab', { name: 'Budget vs actual' }).click();
    await expect(bt.getByTestId('budget-row').filter({ hasText: 'Fuel' })).toContainText('80% used');

    // P&L, balance sheet, cash flow & ratios.
    await accTab('Profit & Loss');
    await expect(page.getByRole('table', { name: 'Profit and loss' })).toContainText('Sales');
    await expect(page.getByTestId('pnl-net')).toBeVisible();
    await accTab('Balance sheet');
    await expect(page.getByRole('status').filter({ hasText: 'Balanced ✓' })).toBeVisible();
    await accTab('Cash flow & ratios');
    await expect(page.getByTestId('cashflow-tab').getByTestId('cf-operating')).toBeVisible();
    await expect(page.getByTestId('cashflow-tab').getByTestId('ratio-current_ratio')).toBeVisible();

    // Fixed asset and this month's depreciation.
    await accTab('Fixed assets');
    const assets = page.getByTestId('assets-tab');
    await assets.getByRole('button', { name: 'Add asset' }).click();
    const fa = dialog(page, 'Add fixed asset');
    await fa.getByLabel('Name').fill('Honda generator');
    await fa.getByLabel('Type').selectOption('generator');
    await fa.getByLabel('Cost (Rs.)').fill('120000');
    await fa.getByLabel('Useful life (years)').fill('5');
    await fa.getByRole('button', { name: 'Save asset' }).click();
    await assets.getByRole('button', { name: /^Run for (January|February|March|April|May|June|July|August|September|October|November|December)/ }).click();
    await expect(assets.getByTestId('asset-row')).toContainText('Rs. 118,000');
    await assets.getByRole('button', { name: 'Edit Honda generator' }).click();
    const edit = dialog(page, 'Edit Honda generator');
    await edit.getByLabel('Name').fill('Honda generator 5 kVA');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(assets.getByTestId('asset-row')).toContainText('Honda generator 5 kVA');

    // Staff: advance, salary sheet recovering it, payslip.
    await accTab('Staff & salaries');
    const staff = page.getByTestId('staff-tab');
    await staff.getByRole('button', { name: 'Add staff' }).click();
    const sd = dialog(page, 'Add staff member');
    await sd.getByLabel('Name').fill('Ali Khan');
    await sd.getByLabel('Monthly salary (Rs.)').fill('30000');
    await sd.getByLabel('Joined on').fill('2025-01-01');
    await sd.getByRole('button', { name: 'Save' }).click();
    await staff.getByRole('button', { name: 'Give advance' }).click();
    const ad = dialog(page, 'Give an advance');
    await ad.getByLabel('Staff member').selectOption({ label: 'Ali Khan' });
    await ad.getByLabel('Amount (Rs.)').fill('5000');
    await ad.getByRole('button', { name: 'Give advance' }).click();
    await expect(staff.getByTestId('staff-row')).toContainText('owes Rs. 5,000');
    await staff.getByRole('button', { name: 'Salary sheet' }).click();
    const sheet = dialog(page, 'Salary sheet');
    await expect(sheet.getByTestId('salary-net-total')).toHaveText('Rs. 25,000');
    await sheet.getByRole('button', { name: 'Pay salaries' }).click();
    await staff.getByRole('button', { name: /^Payslip for Ali Khan/ }).click();
    await expect(printRoot(page)).toContainText('PAYSLIP');
    await closePreview(page);

    // Year end: close last financial year (nothing in it but opening balances), then reopen.
    await accTab('Year end');
    const ye = page.getByTestId('yearend-tab');
    await expect(ye.getByTestId('close-checks')).toContainText('is balanced');
    await ye.getByRole('button', { name: /^Close FY/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Close the year' }).click();
    await expect(ye.getByTestId('year-close')).toHaveCount(1);
    await expect(page.getByText(/Books are closed up to/)).toBeVisible();
    await ye.getByRole('button', { name: /^Reopen FY/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reopen year' }).click();
    await expect(ye.getByTestId('year-close')).toHaveCount(0);

    // Period lock: lock up to yesterday, a back-dated expense is refused, unlock.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    await accTab('Chart of accounts');
    await page.getByLabel('Locked up to').fill(yesterday);
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(page.getByText(/Books are closed up to/)).toBeVisible();
    await goTo(page, 'Money');
    await page.getByRole('button', { name: 'Expense sheets', exact: true }).click();
    await main(page).getByRole('button', { name: 'Add expense' }).first().click();
    const late = dialog(page, 'Add expense');
    await late.getByLabel('What for', { exact: true }).fill('Back-dated');
    await late.getByLabel('Amount (Rs.)', { exact: true }).fill('100');
    await late.getByLabel('Date', { exact: true }).fill(yesterday);
    await late.getByRole('button', { name: 'Save expense' }).click();
    await expect(late.getByRole('status')).toContainText(/closed/i);
    await page.keyboard.press('Escape');
    await goTo(page, 'Accounts');
    await accTab('Chart of accounts');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText(/Books are closed up to/)).toHaveCount(0);

    await checkBooks(page, { item: { id: 'p1', name: 'Dalda 16 L Tin' } });
    done();
  });
});

// ---------------------------------------------------------------------------------------------------
// 6. Admin: bin + restore, number series, approvals, branches, backups, export / import, CSV import, audit
// ---------------------------------------------------------------------------------------------------
test.describe('QA — admin', () => {
  test('deleted records bin (supplier bill + customer) with restore, bill number series, approvals inbox, branches, auto-backup, export → import, CSV data import, audit log; books in step', async ({ page }) => {
    const done = await open(page);
    const adminTab = (name: RegExp) => page.getByRole('button', { name }).first().click();

    // A receipt and its supplier bill, then the bill is deleted with a reason.
    await goTo(page, 'Suppliers');
    await page.getByRole('button', { name: 'Receive stock from Dalda Foods' }).click();
    const rcv = dialog(page, 'Receive stock');
    await rcv.getByLabel('Item', { exact: true }).selectOption('p1');
    await rcv.getByLabel(/^Quantity/).fill('6');
    await rcv.getByLabel(/^Cost per/).fill('800');
    await rcv.getByRole('button', { name: 'Receive stock' }).click();
    await expect(rcv).toBeHidden();
    await page.getByRole('tab', { name: 'Supplier bills' }).click();
    await page.getByRole('button', { name: 'Record supplier bill' }).click();
    const sb = dialog(page, 'Record supplier bill');
    await sb.locator('#sb-supplier').selectOption('s1');
    await sb.getByRole('checkbox').first().check();
    await sb.locator('#sb-number').fill('B-77');
    await sb.getByRole('button', { name: 'Save bill' }).click();
    await expect(sb).toBeHidden();
    await page.getByRole('button', { name: 'Delete bill B-77' }).click();
    await page.getByRole('alertdialog').getByLabel(/Why\?/).fill('entered twice');
    await page.getByRole('alertdialog').getByRole('button', { name: /Delete/ }).click();
    await expect(page.getByRole('list', { name: 'Supplier bills' })).toHaveCount(0);

    // A customer deleted by mistake, then put back from the bin.
    await goTo(page, 'Customers');
    await page.getByRole('button', { name: /Haji Karim/ }).first().click();
    await dialog(page, 'Haji Karim').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByLabel(/Why\?/).fill('wrong customer');
    await page.getByRole('alertdialog').getByRole('button', { name: /Delete/ }).click();
    await expect(main(page).getByText('Haji Karim')).toHaveCount(0);
    await goTo(page, 'Admin');
    await adminTab(/Deleted records/);
    const binBill = page.getByTestId('deleted-record').filter({ hasText: 'B-77' });
    await expect(binBill).toContainText('Supplier bill');
    await expect(binBill).toContainText('“entered twice”');
    await page.getByTestId('deleted-record').filter({ hasText: 'Haji Karim' }).getByRole('button', { name: /Restore/ }).click();
    await expect(page.getByText(/Haji Karim is back/)).toBeVisible();

    // Bill numbers: RZT-<year>-0001.
    const year = new Date().getFullYear();
    await adminTab(/Rules, numbers & branches/);
    const series = page.getByTestId('series-bill');
    await series.getByLabel('Prefix').fill('RZT-');
    await series.getByLabel('New series each year').check();
    await series.getByRole('button', { name: 'Save Bills (invoices) numbers' }).click();
    await expect(page.getByText(`Bills (invoices): Saved. The next one will be RZT-${year}-0001.`)).toBeVisible();
    // Branches: the filter shows once there are two.
    await page.getByLabel('Branch name').fill('Batkhela shop');
    await page.getByRole('button', { name: 'Add branch' }).click();
    await page.getByLabel('Branch name').fill('Mingora shop');
    await page.getByRole('button', { name: 'Add branch' }).click();
    await page.getByLabel('Branch of Zahid Yard Weighbridge').selectOption({ label: 'Mingora shop' });
    await expect(page.getByText('Zahid Yard Weighbridge now works in Mingora shop.')).toBeVisible();
    // Approvals inbox is reachable from Admin (nothing waiting).
    await adminTab(/^Approvals/);
    await expect(page.getByRole('tab', { name: /Waiting \(0\)/ })).toBeVisible();

    await goTo(page, 'Home');
    await expect(page.getByTestId('branch-filter')).toBeVisible();
    await main(page).getByRole('button', { name: 'New Bill', exact: true }).first().click();
    const bill = dialog(page, 'New Bill');
    await bill.getByLabel('Customer', { exact: true }).selectOption('c1');
    await bill.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await bill.getByLabel('Quantity 1', { exact: true }).fill('3');
    await bill.getByRole('button', { name: 'Full' }).click();
    await bill.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bill).toBeHidden();
    await goTo(page, 'Bills');
    await expect(main(page).getByText(`RZT-${year}-0001`).first()).toBeVisible();

    // Backups: one now on the device, a JSON export, then import it back over a change.
    await goTo(page, 'Admin');
    await adminTab(/System & Backups/);
    const auto = page.getByTestId('auto-backups');
    await expect(auto.getByTestId('auto-backup-row').first()).toBeVisible({ timeout: 10_000 });
    const before = await auto.getByTestId('auto-backup-row').count();
    await auto.getByRole('button', { name: 'Back up now' }).click();
    await expect(auto.getByTestId('auto-backup-row')).toHaveCount(before + 1);
    const exp = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export Backup/ }).click();
    const backupPath = await (await exp).path();
    expect(readFileSync(backupPath, 'utf8')).toContain(`RZT-${year}-0001`);
    await goTo(page, 'Customers');
    await page.getByRole('button', { name: 'Add customer' }).first().click();
    const nc = dialog(page, 'New customer');
    await nc.getByLabel('Name', { exact: true }).fill('Temp Shop');
    await nc.getByLabel('Phone', { exact: true }).fill('03009998887');
    await nc.getByRole('button', { name: 'Save customer' }).click();
    await expect(main(page).getByText('Temp Shop')).toBeVisible();
    await goTo(page, 'Admin');
    await adminTab(/System & Backups/);
    await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(backupPath);
    await expect(page.getByText('Database successfully restored from backup.')).toBeVisible();
    await goTo(page, 'Customers');
    await expect(main(page).getByText('Temp Shop')).toHaveCount(0);

    // CSV import of customers.
    await goTo(page, 'Admin');
    await adminTab(/Data Import/);
    const csv = 'name,company,phone,email,address,creditLimit,openingDue,code\nGul Traders,Gul Traders,03125556677,,Mardan,40000,0,G-9\n';
    await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({ name: 'customers.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByRole('button', { name: 'Import 1 customers' }).click();
    await expect(page.getByText('Imported 1, skipped 0.')).toBeVisible();
    await goTo(page, 'Customers');
    await expect(main(page).getByText('G-9')).toBeVisible();

    // Removing a salesman asks first, and the bin keeps a copy with the reason.
    await main(page).getByRole('button', { name: 'Sales & recovery' }).click();
    await dialog(page, 'Sales & recovery').getByRole('button', { name: /Salesmen & areas/ }).click();
    const team = dialog(page, 'Salesmen & areas');
    await team.getByLabel('Name', { exact: true }).fill('Temp man');
    await team.getByRole('button', { name: 'Add salesman' }).click();
    await team.getByRole('button', { name: 'Remove Temp man' }).click();
    await page.getByRole('alertdialog').getByLabel(/Why\?/).fill('left the job');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(team.getByText('Temp man deleted.')).toBeVisible();
    await page.keyboard.press('Escape');
    await goTo(page, 'Admin');
    await adminTab(/Deleted records/);
    await expect(page.getByTestId('deleted-record').filter({ hasText: 'Salesman Temp man' })).toContainText('“left the job”');

    // Audit log.
    await goTo(page, 'Admin');
    await adminTab(/Audit Trail/);
    await expect(main(page)).toContainText('Bill Created');
    await expect(main(page)).toContainText('Backup Restored');
    await expect(main(page)).toContainText('Deleted Record Restored');

    await checkBooks(page, { item: { id: 'p1', name: 'Dalda 16 L Tin' } });
    done();
  });
});

// ---------------------------------------------------------------------------------------------------
// 7. The same shop on a phone: bottom bar, More sheet, every screen, a bill, dark mode
// ---------------------------------------------------------------------------------------------------
test.describe('QA — phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('bottom bar + More reach every screen without side-scroll; bill from the bar; receive payment; dark mode and My account from More; books in step', async ({ page }) => {
    const done = await open(page);
    const bar = page.getByRole('navigation', { name: 'Main' });
    await expect(bar).toBeVisible();
    const screens: [string, RegExp][] = [
      ['Bills', /^Bills$/], ['Money', /^Money$/], ['Owner dashboard', /Owner dashboard|Owner/], ['Customers', /^Customers$/], ['Suppliers', /^Suppliers$/],
      ['Items & Prices', /^Items & Prices$/], ['Daily Sheet', /^Daily Sheet$/], ['Accounts', /^Accounts$/], ['Admin', /Admin/], ['Home', /^Home$/],
    ];
    for (const [name, heading] of screens) {
      await goTo(page, name);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      await noSideScroll(page, name);
    }

    // A bill from the big button in the bar.
    await bar.getByRole('button', { name: 'New bill' }).click();
    const bill = dialog(page, 'New Bill');
    await bill.getByLabel('Customer', { exact: true }).selectOption('c2');
    await bill.getByLabel('Item 1', { exact: true }).selectOption('p2');
    await bill.getByLabel('Quantity 1', { exact: true }).fill('30');
    await bill.getByLabel('Discount 1', { exact: true }).fill('1000');
    await bill.getByRole('button', { name: 'Add another item' }).click();
    await bill.getByLabel('Item 2', { exact: true }).selectOption('p1');
    await bill.getByLabel('Quantity 2', { exact: true }).fill('50');
    await bill.getByLabel('Paid now', { exact: true }).fill('100000');
    await expect(bill.getByTestId('bill-credit')).toHaveCount(1); // Haji's limit 20,000 is not passed: 9,000 on credit
    await noSideScroll(page, 'new bill');
    await bill.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bill).toBeHidden();
    // The A4 bill preview is scaled to the phone's width, not cut off at the right.
    await goTo(page, 'Bills');
    await main(page).getByRole('button', { name: 'Print INV-1' }).click();
    await expect(printRoot(page)).toContainText('INVOICE');
    const fit = await printRoot(page).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(fit.sw, 'print preview wider than the phone').toBeLessThanOrEqual(fit.cw + 1);
    const total = printRoot(page).getByText('109,000', { exact: false }).last();
    expect((await total.boundingBox())!.x + (await total.boundingBox())!.width).toBeLessThanOrEqual(390);
    await noSideScroll(page, 'bill print preview');
    await closePreview(page);
    // Receive the rest from the Money tab.
    await goTo(page, 'Money');
    await main(page).getByRole('button', { name: 'Receive payment from Haji Karim' }).click();
    const rc = dialog(page, 'Receive payment');
    await rc.getByRole('button', { name: 'Full' }).click();
    await rc.getByRole('button', { name: 'Receive' }).click();
    await expect(rc).toBeHidden();

    // More sheet: dark mode, then My account.
    await bar.getByRole('button', { name: 'More', exact: true }).click();
    const more = dialog(page, 'More');
    await more.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await more.getByRole('button', { name: /My account/ }).click();
    await expect(page.getByTestId('my-username')).toHaveText('bilal');
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await noSideScroll(page, 'dark mode');
    await bar.getByRole('button', { name: 'More', exact: true }).click();
    await dialog(page, 'More').getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' }).click();
    await page.keyboard.press('Escape');

    await checkBooks(page, { item: { id: 'p2', name: 'Habib 5 L Can' } });
    done();
  });
});
