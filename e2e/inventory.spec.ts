import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';

/** Billing shop selling oil cans and tins: one plain item (tins) and one that will track batches (cans). */
const seedInventory = () => {
  if (localStorage.getItem('e2e_inventory_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_inventory_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', companyPhone: '3410550055', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: today }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 0, createdAt: today }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, stockKg: 0, minThresholdKg: 0 },
    { id: 'p2', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 45, minThresholdKg: 5 },
  ]);
  set('tradeflow_invoices_v1', []);
  set('tradeflow_ledger_v2', []);
  set('tradeflow_expenses_v2', []);
  set('tradeflow_cash_entries_v2', []);
  set('tradeflow_purchases_v2', []);
};

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0];
const dmy = (s: string) => s.split('-').reverse().join('-');

async function unlock(page: Page) {
  await signIn(page); // owner "bilal" / Sarmaya@2026 (see e2e/helpers/users.ts)
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

const noOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(0);
};

const goItems = (page: Page) => goTo(page, 'Items & Prices');
const goHome = (page: Page) => goTo(page, 'Home');

async function batchesGodownsAndBills(page: Page) {
  const early = iso(20);
  const late = iso(200);
  await unlock(page);

  // 1. Turn on batch tracking for the cans.
  await goItems(page);
  await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
  await noOverflow(page, 'items');
  await page.getByRole('button', { name: 'Edit 5 kgs Can' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit item' });
  await edit.getByRole('checkbox', { name: /Track batch & expiry/ }).check();
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText('batch & expiry').first()).toBeVisible();

  // 2. Receive two batches with different expiry dates (the second one bought on credit from the supplier).
  await page.getByRole('button', { name: 'Receive stock for 5 kgs Can' }).click();
  let rcv = page.getByRole('dialog', { name: 'Receive stock' });
  await rcv.getByLabel(/^Quantity/).fill('50');
  await rcv.getByLabel('Batch no.', { exact: true }).fill('LATE-7');
  await rcv.getByLabel('Expiry date', { exact: true }).fill(late);
  await noOverflow(page, 'receive stock');
  await rcv.getByRole('button', { name: 'Receive stock' }).click();
  await expect(rcv).toBeHidden();

  await page.getByRole('button', { name: 'Receive stock', exact: true }).first().click();
  rcv = page.getByRole('dialog', { name: 'Receive stock' });
  await rcv.getByLabel('Item', { exact: true }).selectOption('p1');
  await rcv.getByLabel(/^Quantity/).fill('30');
  await rcv.getByLabel('Batch no.', { exact: true }).fill('EARLY-3');
  await rcv.getByLabel('Expiry date', { exact: true }).fill(early);
  await rcv.getByLabel(/^Cost per/).fill('1800');
  await rcv.getByLabel('Supplier (optional)', { exact: true }).selectOption('s1');
  await expect(rcv.getByText('Rs. 54,000 will be added')).toBeVisible();
  await rcv.getByRole('button', { name: 'Receive stock' }).click();
  await expect(rcv).toBeHidden();

  const cans = page.locator('[data-testid="stock-details-p1"]:visible');
  await expect(cans).toContainText('EARLY-3');
  await expect(cans).toContainText('LATE-7');
  await expect(cans.locator('[data-expiry="soon"]')).toContainText(dmy(early));
  await expect(page.getByTestId('item-stock-p1')).toHaveText('80 can');
  await noOverflow(page, 'items with batches');

  // 3. Home warns about the batch expiring within 30 days.
  await goHome(page);
  const attention = page.getByTestId('expiry-attention');
  await expect(attention).toContainText('1 expiring within 30 days');
  await expect(attention).toContainText('EARLY-3');
  await noOverflow(page, 'home with expiry alert');

  // 4. A bill takes the earlier-expiring batch first, and the printed bill says so.
  await page.getByRole('button', { name: 'New Bill' }).first().click();
  let bill = page.getByRole('dialog', { name: 'New Bill' });
  await bill.getByLabel('Customer', { exact: true }).selectOption('c1');
  await bill.getByLabel('Item 1', { exact: true }).selectOption('p1');
  await bill.getByLabel('Quantity 1', { exact: true }).fill('40');
  await expect(bill.getByTestId('stock-note-1')).toContainText(`Batch EARLY-3 · Exp ${dmy(early)} × 30`);
  await expect(bill.getByLabel('From godown')).toHaveCount(0); // one godown: no godown picker
  await noOverflow(page, 'new bill with batches');
  await bill.getByRole('button', { name: 'Save & Print' }).click();
  const printed = page.locator('#print-root');
  await expect(printed).toContainText('INVOICE');
  await expect(printed).toContainText(`Batch EARLY-3 · Exp ${dmy(early)} × 30`);
  await expect(printed).toContainText(`Batch LATE-7 · Exp ${dmy(late)} × 10`);
  await page.keyboard.press('Escape');
  await expect(printed).toHaveCount(0);

  await goItems(page);
  await expect(page.getByTestId('item-stock-p1')).toHaveText('40 can');
  await expect(cans).not.toContainText('EARLY-3'); // used up
  await expect(cans).toContainText('LATE-7');

  // 5. A second godown; move 10 tins there.
  await page.getByRole('button', { name: /^Godowns/ }).click();
  const gd = page.getByRole('dialog', { name: 'Godowns' });
  await gd.getByLabel('New godown', { exact: true }).fill('Batkhela godown');
  await gd.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(gd.getByText('Batkhela godown added.')).toBeVisible();
  await noOverflow(page, 'godowns');
  await gd.getByRole('button', { name: 'Move stock between godowns' }).click();
  const mv = page.getByRole('dialog', { name: 'Move stock' });
  await mv.getByLabel('Item', { exact: true }).selectOption('p2');
  await expect(mv.getByLabel('To', { exact: true })).toHaveValue(/gdn-/);
  await mv.getByLabel(/^Quantity/).fill('10');
  await mv.getByLabel('Note (optional)', { exact: true }).fill('for the shop');
  await noOverflow(page, 'move stock');
  await mv.getByRole('button', { name: 'Move stock' }).click();
  await expect(mv).toBeHidden();
  const tins = page.locator('[data-testid="stock-details-p2"]:visible');
  await expect(tins).toContainText('Main godown: 35');
  await expect(tins).toContainText('Batkhela godown: 10');
  await expect(page.getByTestId('item-stock-p2')).toHaveText('45 tin'); // total unchanged
  await noOverflow(page, 'items with two godowns');

  // 6. Bill from the second godown.
  await goHome(page);
  await page.getByRole('button', { name: 'New Bill' }).first().click();
  bill = page.getByRole('dialog', { name: 'New Bill' });
  await bill.getByLabel('Customer', { exact: true }).selectOption('c1');
  await bill.getByLabel('From godown', { exact: true }).selectOption({ label: 'Batkhela godown' });
  await bill.getByLabel('Item 1', { exact: true }).selectOption('p2');
  await bill.getByLabel('Quantity 1', { exact: true }).fill('4');
  await noOverflow(page, 'new bill from second godown');
  await bill.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bill).toBeHidden();

  await goItems(page);
  await expect(tins).toContainText('Batkhela godown: 6');
  await expect(tins).toContainText('Main godown: 35');
  await expect(page.getByTestId('item-stock-p2')).toHaveText('41 tin');

  // Survives a reload (local-first).
  await page.reload(); // still signed in ("Keep me signed in")
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
  await goItems(page);
  await expect(page.locator('[data-testid="stock-details-p2"]:visible')).toContainText('Batkhela godown: 6');
  await expect(page.locator('[data-testid="stock-details-p1"]:visible')).toContainText('LATE-7');
}

test.describe('Batches, expiry and godowns', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seedInventory);
  });

  test('desktop: batches FEFO on bills and print, expiry alert, second godown, transfer, bill from it', async ({ page }) => {
    await batchesGodownsAndBills(page);
  });
});

test.describe('Batches, expiry and godowns on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seedInventory);
  });

  test('same flow fits a 390px screen', async ({ page }) => {
    await batchesGodownsAndBills(page);
  });
});

test.describe('Receive a supplier delivery with several items', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seedInventory);
  });

  test('supplier "Receive stock" takes more than one item and adds both to what you owe', async ({ page }) => {
    await unlock(page);
    await goTo(page, 'Suppliers');
    await page.getByRole('button', { name: 'Receive stock from Dalda Foods' }).click();

    const rcv = page.getByRole('dialog', { name: 'Receive stock' });
    await expect(rcv.getByLabel('Supplier (optional)', { exact: true })).toHaveValue('s1');
    await rcv.getByLabel('Item', { exact: true }).selectOption('p1');
    await rcv.getByLabel(/^Quantity/).fill('10');
    await rcv.getByLabel(/^Cost per/).fill('1800');
    await rcv.getByRole('button', { name: 'Add another item' }).click();
    await rcv.getByLabel('Item 2', { exact: true }).selectOption('p2');
    await rcv.locator('#rs-qty-2').fill('5');
    await rcv.locator('#rs-cost-2').fill('6000');
    await expect(rcv).toContainText('48,000'); // 10 × 1,800 + 5 × 6,000
    await rcv.getByRole('button', { name: 'Receive 2 items' }).click();
    await expect(rcv).toBeHidden();

    await expect.poll(() => page.evaluate(() => {
      const sup = JSON.parse(localStorage.getItem('tradeflow_suppliers_v2') || '[]')[0];
      const prods = JSON.parse(localStorage.getItem('tradeflow_products_v2') || '[]');
      const purchases = JSON.parse(localStorage.getItem('tradeflow_purchases_v2') || '[]');
      return { owed: sup.totalOwed, p1: prods.find((p: { id: string }) => p.id === 'p1').stockKg, p2: prods.find((p: { id: string }) => p.id === 'p2').stockKg, n: purchases.length };
    })).toEqual({ owed: 48000, p1: 10, p2: 50, n: 2 });
  });

  test('a half-filled second line stops the save and nothing is received', async ({ page }) => {
    await unlock(page);
    await goItems(page);
    await page.getByRole('button', { name: 'Receive stock', exact: true }).first().click();
    const rcv = page.getByRole('dialog', { name: 'Receive stock' });
    await rcv.getByLabel('Supplier (optional)', { exact: true }).selectOption('s1');
    await rcv.getByLabel('Item', { exact: true }).selectOption('p1');
    await rcv.getByLabel(/^Quantity/).fill('10');
    await rcv.getByLabel(/^Cost per/).fill('1800');
    await rcv.getByRole('button', { name: 'Add another item' }).click();
    await rcv.getByLabel('Item 2', { exact: true }).selectOption('p2');
    await rcv.getByRole('button', { name: 'Receive 2 items' }).click();
    await expect(rcv.getByText(/Line 2: enter the quantity/)).toBeVisible();
    const stock = await page.evaluate(() => JSON.parse(localStorage.getItem('tradeflow_products_v2') || '[]').find((p: { id: string }) => p.id === 'p1').stockKg);
    expect(stock).toBe(0);
  });
});
