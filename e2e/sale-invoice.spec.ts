import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo, openMenuOption } from './helpers/nav';
import { salesSeed } from './helpers/salesSeed';

/**
 * The old program's workflow, step for step (Apna Accountant SB → Sarmaya): Sale Invoice from the keyboard
 * only (Code Enter → Qty Enter → Rate Enter puts the line in the grid, the next line starts at Code), the
 * Payment Method grid, "Search Party By City", the Cash Sale Invoice, the Purchase Invoice with Search → edit /
 * delete, and the Invoice menu (Purchase Invoice ›, Sale Invoice ›, Store Transfer).
 */
async function open(page: Page, afterSave: 'next' | 'close' = 'close') {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript((v) => { if (!localStorage.getItem('e2e_after_save_set')) { localStorage.setItem('e2e_after_save_set', '1'); localStorage.setItem('sarmaya_bill_after_save', v); } }, afterSave);
  await page.addInitScript(salesSeed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 15_000 });
}
const store = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), key);

async function trialBalanced(page: Page) {
  await goTo(page, 'Accounts');
  await page.getByRole('tab', { name: 'Trial balance', exact: true }).click();
  await expect(page.getByText('Balanced ✓').first()).toBeVisible();
}

test('Sale Invoice by keyboard only: codes, Enter across the entry row, lines into the grid, payment line, F9, next bill opens', async ({ page }) => {
  await open(page, 'next');
  await page.keyboard.press('F2');
  const d = page.getByRole('dialog', { name: 'New Bill' });
  await expect(d).toBeVisible();
  const cust = d.getByLabel('Customer code', { exact: true });
  await cust.focus();
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(d.getByLabel('Customer', { exact: true })).toHaveValue('c2');
  await expect(d.getByTestId('bill-party-balance')).toHaveText('Rs. 0');

  // Line 1: code → Enter → Qty → Enter → Rate → Enter: into the grid, cursor back at Code (line 2).
  await expect(d.getByLabel('Code 1', { exact: true })).toBeFocused();
  await page.keyboard.type('101');
  await page.keyboard.press('Enter');
  await expect(d.getByLabel('Item 1', { exact: true })).toHaveValue('p1');
  await expect(d.getByTestId('bill-stock-box')).toContainText('120');
  await expect(d.getByLabel('Quantity 1', { exact: true })).toBeFocused();
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(d.getByLabel('Price 1', { exact: true })).toBeFocused();
  await expect(d.getByLabel('Price 1', { exact: true })).toHaveValue('7050');
  await page.keyboard.press('Enter');
  await expect(d.getByTestId('bill-line')).toHaveCount(1);
  await expect(d.getByLabel('Code 2', { exact: true })).toBeFocused();
  await expect(d.getByLabel('Item 2', { exact: true })).toHaveValue('');
  await expect(d.getByTestId('line-amount-1')).toHaveText('Rs. 35,250');

  // Line 2 the same way.
  await page.keyboard.type('104');
  await page.keyboard.press('Enter');
  await page.keyboard.type('10');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(d.getByTestId('bill-line')).toHaveCount(2);
  await expect(d.getByLabel('Code 3', { exact: true })).toBeFocused();

  // A grid line clicked comes back into the entry row; Enter on Rate puts it back.
  await d.getByTestId('bill-line').nth(1).click();
  await expect(d.getByLabel('Quantity 2', { exact: true })).toHaveValue('10');
  await d.getByLabel('Quantity 2', { exact: true }).fill('12');
  await d.getByLabel('Price 2', { exact: true }).press('Enter');
  await expect(d.getByTestId('line-amount-2')).toHaveText('Rs. 19,800');
  // Delete on a grid line removes it (a third, wrong line).
  await page.keyboard.type('112');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(d.getByTestId('bill-line')).toHaveCount(3);
  await d.getByTestId('bill-line').nth(2).focus();
  await page.keyboard.press('Delete');
  await expect(d.getByTestId('bill-line')).toHaveCount(2);

  // Empty Code + Enter: to the Payment Method line (cash). Debit → Narration → Enter puts the payment in.
  await d.getByLabel('Code 3', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(d.getByLabel('Paid now', { exact: true })).toBeFocused();
  await page.keyboard.type('20000');
  await page.keyboard.press('Enter');
  await expect(d.getByLabel('Narration', { exact: true })).toBeFocused();
  await page.keyboard.type('counter cash');
  await page.keyboard.press('Enter');
  await expect(d.getByTestId('bill-pay-line')).toHaveCount(1);
  // 5 × 7,050 + 12 × 1,650 = 35,250 + 19,800 = 55,050; 20,000 paid.
  await expect(d.getByTestId('bill-total')).toHaveText('Rs. 55,050');
  await expect(d.getByTestId('bill-balance')).toHaveText('Rs. 35,050');
  await page.keyboard.press('F9');

  // Saved, and a new blank invoice is open at once.
  await expect(d.getByTestId('bill-line')).toHaveCount(0);
  await expect(d.getByLabel('Item 1', { exact: true })).toHaveValue('');
  const invs = await store(page, 'tradeflow_invoices_v1');
  expect(invs).toHaveLength(1);
  expect(invs[0].totalAmount).toBe(55050);
  expect(invs[0].paidAmount).toBe(20000);
  expect(invs[0].items.map((i: { productId: string; qty: number }) => `${i.productId}×${i.qty}`)).toEqual(['p1×5', 'p4×12']);
  await page.keyboard.press('Escape');
  await trialBalanced(page);
});

test('Bill edit the old way: Search by number opens it filled in; change qty and rate; Save keeps the number; Delete; refused with a reason', async ({ page }) => {
  await open(page);
  // INV-1: 4 tins, Lumsum 50, Others 200, Rs. 10,000 received in cash, a remark.
  await page.keyboard.press('F2');
  let d = page.getByRole('dialog', { name: 'New Bill' });
  await d.getByLabel('Customer code', { exact: true }).fill('3');
  await d.getByLabel('Customer code', { exact: true }).press('Enter');
  await page.keyboard.type('101');
  await page.keyboard.press('Enter');
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await d.getByLabel('Lumsum Disc (Rs.)', { exact: true }).fill('50');
  await d.getByLabel('Others Charges', { exact: true }).fill('200');
  await d.getByLabel('Remarks', { exact: true }).fill('first');
  await d.getByLabel('Paid now', { exact: true }).fill('10000');
  await expect(d.getByTestId('bill-total')).toHaveText('Rs. 28,350'); // 28,200 − 50 + 200
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(d).toBeHidden();
  // INV-2, to delete later.
  await page.keyboard.press('F2');
  await d.getByLabel('Customer code', { exact: true }).fill('4');
  await d.getByLabel('Customer code', { exact: true }).press('Enter');
  await page.keyboard.type('104');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(d).toBeHidden();

  // Search "1" (just the digits) → INV-1 in the same form, every field filled in.
  await page.keyboard.press('F2');
  await d.getByLabel('Search old bill').fill('1');
  await d.getByLabel('Search old bill').press('Enter');
  const e = page.getByRole('dialog', { name: 'Edit bill INV-1' });
  await expect(e).toBeVisible();
  await expect(e.getByTestId('bill-next-number')).toHaveText('INV-1');
  await expect(e.getByLabel('Customer', { exact: true })).toHaveValue('c3');
  await expect(e.getByTestId('bill-line')).toHaveCount(1);
  await expect(e.getByTestId('line-amount-1')).toHaveText('Rs. 28,200');
  await expect(e.getByLabel('Lumsum Disc (Rs.)', { exact: true })).toHaveValue('50');
  await expect(e.getByLabel('Others Charges', { exact: true })).toHaveValue('200');
  await expect(e.getByLabel('Remarks', { exact: true })).toHaveValue('first');
  await expect(e.getByTestId('bill-saved-pay')).toHaveCount(1);
  await expect(e.getByTestId('bill-saved-pay')).toContainText('Rs. 10,000');
  // Change qty and rate on the line, then Save: same number, new totals, balance follows.
  await e.getByTestId('bill-line').first().click();
  await e.getByLabel('Quantity 1', { exact: true }).fill('6');
  await e.getByLabel('Price 1', { exact: true }).fill('7000');
  await e.getByLabel('Price 1', { exact: true }).press('Enter');
  await expect(e.getByTestId('bill-total')).toHaveText('Rs. 42,150'); // 42,000 − 50 + 200
  await expect(e.getByTestId('bill-balance')).toHaveText('Rs. 32,150');
  await e.getByRole('button', { name: 'Save', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Bill INV-1' });
  await expect(detail.getByTestId('bill-net-total')).toContainText('42,150');
  await page.keyboard.press('Escape');
  let invs = await store(page, 'tradeflow_invoices_v1');
  expect(invs).toHaveLength(2);
  const inv1 = invs.find((i: { invoiceNumber: string }) => i.invoiceNumber === 'INV-1');
  expect([inv1.totalAmount, inv1.paidAmount, inv1.balanceDue]).toEqual([42150, 10000, 32150]);
  expect((await store(page, 'tradeflow_customers_v2')).find((c: { id: string }) => c.id === 'c3').totalDue).toBe(32150);

  // Search INV-2 by its full number and Delete it.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('F2');
  await d.getByLabel('Search old bill').fill('INV-2');
  await d.getByLabel('Search old bill').press('Enter');
  const e2 = page.getByRole('dialog', { name: 'Edit bill INV-2' });
  await e2.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog', { name: /Delete bill INV-2/ }).getByRole('button', { name: 'Delete bill' }).click();
  await expect(e2).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'New Bill' })).toBeVisible(); // a new blank one
  await page.keyboard.press('Escape');
  invs = await store(page, 'tradeflow_invoices_v1');
  expect(invs.map((i: { invoiceNumber: string }) => i.invoiceNumber)).toEqual(['INV-1']);

  // Goods returned on INV-1: Search refuses to open it for changes and says why.
  await goTo(page, 'Bills');
  await page.getByRole('button', { name: /Old Khan|حاجی عبدالرحمن/ }).first().click();
  const bd = page.getByRole('dialog', { name: 'Bill INV-1' });
  await bd.getByRole('button', { name: 'Return items' }).click();
  const ret = page.getByRole('dialog', { name: 'Return items — Bill INV-1' });
  await ret.getByLabel('Return qty 1', { exact: true }).fill('1');
  await ret.getByLabel('Print the credit note after saving').uncheck();
  await ret.getByRole('button', { name: 'Save return' }).click();
  await expect(ret).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('F2');
  d = page.getByRole('dialog', { name: 'New Bill' });
  await d.getByLabel('Search old bill').fill('1');
  await d.getByLabel('Search old bill').press('Enter');
  await expect(d.getByText(/INV-1 cannot be opened for changes: Goods were returned/)).toBeVisible();
  await page.keyboard.press('Escape');
  await trialBalanced(page);
});

test('Search Party By City: a name typed in the customer box, or F2, opens it; city + text narrow it; Enter picks', async ({ page }) => {
  await open(page);
  await page.keyboard.press('F2');
  const d = page.getByRole('dialog', { name: 'New Bill' });
  const cust = d.getByLabel('Customer code', { exact: true });
  await cust.focus();
  await page.keyboard.type('sw');
  const sp = page.getByRole('dialog', { name: 'Search Party By City' });
  await expect(sp).toBeVisible();
  await expect(sp.getByLabel('Search', { exact: true })).toBeFocused();
  await page.keyboard.type('at');
  await expect(sp.getByLabel('Search', { exact: true })).toHaveValue('swat');
  await expect(sp.getByRole('row').filter({ hasText: 'Swat Ghee Centre' })).toHaveCount(1);
  await expect(sp.getByRole('row').filter({ hasText: 'PartyID #' })).toBeVisible();
  // Narrow by city: nobody called "swat" in Dargai.
  await sp.getByLabel('City', { exact: true }).selectOption('Dargai');
  await expect(sp.getByText('No party matches.')).toBeVisible();
  await sp.getByLabel('City', { exact: true }).selectOption('Mingora');
  await sp.getByLabel('Search', { exact: true }).press('Enter');
  await expect(sp).toBeHidden();
  await expect(d.getByLabel('Customer', { exact: true })).toHaveValue('c9');
  await expect(d.getByLabel('Customer code', { exact: true })).toHaveValue('C-0009');

  // F2 in the customer box; ↓ and a double-click pick too.
  await cust.focus();
  await page.keyboard.press('F2');
  await expect(sp).toBeVisible();
  await sp.getByLabel('City', { exact: true }).selectOption('Dargai');
  await sp.getByRole('row').filter({ hasText: 'Taj Traders' }).dblclick();
  await expect(sp).toBeHidden();
  await expect(d.getByLabel('Customer', { exact: true })).toHaveValue('c19');
});

test('Cash Sale Invoice: walk-in name, paid in full in cash, Print Full → the A4 print; the Cash Sale account', async ({ page }) => {
  await open(page);
  await openMenuOption(page, 'Invoice', 'Cash Sale Invoice');
  const d = page.getByRole('dialog', { name: 'Cash Sale Invoice' });
  await expect(d).toBeVisible();
  await expect(d.getByTestId('bill-payments')).toHaveCount(0);
  await d.getByLabel('Code 1', { exact: true }).fill('111');
  await d.getByLabel('Code 1', { exact: true }).press('Enter');
  await expect(d.getByText('Product Balance/Unit')).toBeVisible();
  await expect(d.getByTestId('bill-stock-box')).not.toHaveText('—');
  await page.keyboard.type('10');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(d.getByTestId('bill-line')).toHaveCount(1);
  await d.getByLabel('Customer:', { exact: true }).fill('Gul Khan');
  await expect(d.getByTestId('cash-sale-paid')).toContainText('Rs. 550');
  await d.getByRole('radiogroup', { name: 'Print Invoice' }).getByText('Full', { exact: true }).click();
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#print-root')).toContainText('Cash Sale — Gul Khan');
  await expect(page.locator('#print-root')).toHaveAttribute('data-paper', 'a4');
  await page.getByRole('button', { name: 'Close preview' }).click();
  const [inv] = await store(page, 'tradeflow_invoices_v1');
  expect(inv.customerName).toBe('Cash Sale');
  expect(inv.walkInName).toBe('Gul Khan');
  expect(inv.balanceDue).toBe(0);
  expect(inv.cashSale).toBe(true);
  // Put the print choice back for the other tests on this device.
  await page.evaluate(() => localStorage.setItem('sarmaya_print_cash-sale', 'none'));
  await trialBalanced(page);
});

test('Purchase Invoice: codes + Enter, discount %, Search loads it back to change it (same number), then Delete', async ({ page }) => {
  await open(page);
  await openMenuOption(page, 'Invoice', 'Purchase Invoice');
  let f = page.getByRole('dialog', { name: 'Purchase Invoice' });
  await expect(f.getByLabel('Supplier code')).toBeFocused();
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await expect(f.locator('#pi-godown')).toBeFocused(); // two godowns: Store Name, then Memo No
  await page.keyboard.press('Enter');
  await expect(f.locator('#pi-memo')).toBeFocused();
  await page.keyboard.type('DF-9');
  await expect(f.getByTestId('pi-purchase-ac-code')).toHaveText('1200');
  await f.getByLabel('Product code 1').fill('101');
  await f.getByLabel('Product code 1').press('Enter');
  await expect(f.getByLabel('Qty 1', { exact: true })).toBeFocused();
  await page.keyboard.type('10');
  await page.keyboard.press('Enter');
  await expect(f.getByLabel('Rate 1', { exact: true })).toHaveValue('6400');
  await page.keyboard.press('Enter');
  await expect(f.getByTestId('pi-line')).toHaveCount(1);
  await expect(f.getByLabel('Product code 2')).toBeFocused();
  await page.keyboard.type('102');
  await page.keyboard.press('Enter');
  await f.getByLabel('Unit 2', { exact: true }).selectOption('pack');
  await expect(f.getByTestId('pi-packing')).toContainText('4 can/carton');
  await f.getByLabel('Qty 2', { exact: true }).fill('2');
  await expect(f.getByLabel('Rate 2', { exact: true })).toHaveValue('8800');
  await f.getByLabel('Rate 2', { exact: true }).press('Enter');
  await expect(f.getByTestId('pi-line')).toHaveCount(2);
  await page.keyboard.press('Enter'); // empty code: to the discount
  await expect(f.getByLabel('Discount %')).toBeFocused();
  await page.keyboard.type('5');
  // 64,000 + 17,600 = 81,600 − 5% = 77,520
  await expect(f.getByTestId('pi-subtotal')).toHaveText('Rs. 81,600');
  await expect(f.getByLabel('Discount (Rs.)')).toHaveValue('4080');
  await expect(f.getByTestId('pi-total')).toHaveText('Rs. 77,520');
  await page.keyboard.press('F9');
  await expect(page.getByRole('dialog', { name: 'Purchase Invoice P-1' }).getByTestId('pid-total')).toHaveText('Rs. 77,520');
  await page.keyboard.press('Escape');

  // Search: back into the form to change it.
  await openMenuOption(page, 'Invoice', 'Purchase Invoice');
  f = page.getByRole('dialog', { name: 'Purchase Invoice' });
  await f.locator('#pi-search').fill('DF-9');
  await f.locator('#pi-search').press('Enter');
  f = page.getByRole('dialog', { name: 'Purchase Invoice — change P-1' });
  await expect(f.getByTestId('pi-line')).toHaveCount(2);
  await expect(f.getByTestId('pi-number')).toHaveText('P-1');
  await f.getByTestId('pi-line').first().click();
  await expect(f.getByLabel('Qty 1', { exact: true })).toHaveValue('10');
  await f.getByLabel('Qty 1', { exact: true }).fill('12');
  await f.getByLabel('Rate 1', { exact: true }).press('Enter');
  // 76,800 + 17,600 = 94,400 − 5% = 89,680
  await expect(f.getByTestId('pi-total')).toHaveText('Rs. 89,680');
  await f.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Purchase Invoice P-1' }).getByTestId('pid-total')).toHaveText('Rs. 89,680');
  await page.keyboard.press('Escape');
  expect(await store(page, 'tradeflow_purchase_invoices_v1')).toHaveLength(1);
  expect((await store(page, 'tradeflow_suppliers_v2'))[0].totalOwed).toBe(89680);
  expect((await store(page, 'tradeflow_products_v2')).find((p: { id: string }) => p.id === 'p1').stockKg).toBe(132);

  // Search again, and Delete it.
  await openMenuOption(page, 'Invoice', 'Purchase Invoice');
  f = page.getByRole('dialog', { name: 'Purchase Invoice' });
  await f.locator('#pi-search').fill('1');
  await f.locator('#pi-search').press('Enter');
  f = page.getByRole('dialog', { name: 'Purchase Invoice — change P-1' });
  await f.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog', { name: /Delete purchase invoice P-1/ }).getByRole('button', { name: 'Delete invoice' }).click();
  await expect(page.getByRole('dialog', { name: 'Purchase Invoice' })).toBeVisible(); // a new blank one
  expect(await store(page, 'tradeflow_purchase_invoices_v1')).toHaveLength(0);
  expect((await store(page, 'tradeflow_suppliers_v2'))[0].totalOwed).toBe(0);
  await page.keyboard.press('Escape');
  await trialBalanced(page);
});

test('Invoice menu: Purchase Invoice ›, Sale Invoice ›, Store Transfer first, each opening its screen', async ({ page }) => {
  await open(page);
  await page.getByRole('menubar', { name: 'Menu bar' }).getByRole('menuitem', { name: 'Invoice', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Invoice' });
  const first = menu.getByRole('group', { name: 'Invoice' });
  await expect(first.getByRole('menuitem')).toHaveText([
    /^Purchase Invoice/, /^Purchase Return/, /^Purchase Invoices list/,
    /^Sale Invoice/, /^Cash Sale Invoice/, /^Sale Return/, /^Sale Invoices list/,
    /^Store Transfer/,
  ]);
  await expect(first).toContainText('Purchase Invoice ›');
  await expect(first).toContainText('Sale Invoice ›');
  // The other Invoice options are still there.
  for (const o of ['Quotations', 'Delivery orders (pending)', 'Purchase orders', 'Receive stock', 'Adjust stock']) await expect(menu.getByRole('menuitem', { name: o, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  const checks: [string, () => Promise<void>][] = [
    ['Purchase Invoice', async () => { await expect(page.getByRole('dialog', { name: 'Purchase Invoice' })).toBeVisible(); await page.keyboard.press('Escape'); }],
    ['Purchase Return', async () => { await expect(page.getByRole('dialog', { name: 'Return goods to supplier' })).toBeVisible(); await page.keyboard.press('Escape'); }],
    ['Purchase Invoices list', async () => { await expect(page.getByRole('heading', { level: 1, name: 'Purchase invoices' })).toBeVisible(); }],
    ['Sale Invoice', async () => { await expect(page.getByRole('dialog', { name: 'New Bill' })).toBeVisible(); await page.keyboard.press('Escape'); }],
    ['Cash Sale Invoice', async () => { await expect(page.getByRole('dialog', { name: 'Cash Sale Invoice' })).toBeVisible(); await page.keyboard.press('Escape'); }],
    ['Sale Return', async () => { await expect(page.getByRole('tab', { name: /^Returns/, selected: true })).toBeVisible(); }],
    ['Sale Invoices list', async () => { await expect(page.getByRole('tab', { name: /^Bills/, selected: true })).toBeVisible(); }],
    ['Store Transfer', async () => { await expect(page.getByRole('dialog', { name: 'Move stock' })).toBeVisible(); await page.keyboard.press('Escape'); }],
  ];
  for (const [option, check] of checks) {
    await openMenuOption(page, 'Invoice', option);
    await check();
  }
});
