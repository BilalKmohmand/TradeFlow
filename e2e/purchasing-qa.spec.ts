import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { openMenuOption, goTo } from './helpers/nav';
import { purchasingSeed } from './helpers/purchasingSeed';

/**
 * Purchasing & suppliers, used the way a demanding shopkeeper does (QA round, Sept 2026):
 * 22 suppliers with codes / cities, 32 items with codes, barcodes and cartons, 2 godowns.
 * Every money flow is checked against the books: supplier balance = its ledger (the statement),
 * Payable = sum of supplier balances.
 */
async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(purchasingSeed);
  await signIn(page);
  return errors;
}
const store = (page: Page, k: string) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), k);

/** Supplier balance on record vs. the sum of its ledger rows (what the statement prints). */
async function booksAgree(page: Page) {
  const [sups, led] = await Promise.all([store(page, 'tradeflow_suppliers_v2'), store(page, 'tradeflow_ledger_v2')]);
  for (const s of sups as { id: string; totalOwed: number; company: string }[]) {
    const fromLedger = (led as { entityType: string; entityId: string; debit: number; credit: number }[])
      .filter((l) => l.entityType === 'supplier' && l.entityId === s.id)
      .reduce((a, l) => a + (l.debit || 0) - (l.credit || 0), 0);
    expect(Math.round(fromLedger * 100) / 100, `${s.company}: balance ≠ statement`).toBe(Math.round(s.totalOwed * 100) / 100);
  }
}

async function openPurchaseInvoice(page: Page) {
  await openMenuOption(page, 'Invoice', 'Purchase invoice');
  const form = page.getByRole('dialog', { name: 'Purchase Invoice' });
  await expect(form).toBeVisible();
  return form;
}

test.describe('Purchase Invoice: code boxes and keyboard only', () => {
  test('type codes + Enter all the way; name picker and code box follow each other; F9 saves', async ({ page }) => {
    const errors = await open(page);
    const form = await openPurchaseInvoice(page);
    const sc = form.getByLabel('Supplier code');
    // The cursor starts in the supplier Code box (the date is already today).
    await expect(sc).toBeFocused();

    // Just the number → S-0003; Enter jumps to Memo No.
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    await expect(form.locator('#pi-supplier')).toHaveValue('s3');
    await expect(sc).toHaveValue('S-0003');
    await expect(form.locator('#pi-memo')).toBeFocused();

    // A wrong code says so and keeps the supplier; picking by name puts its code in the box.
    await sc.fill('999');
    await sc.press('Enter');
    await expect(form.getByRole('alert')).toHaveText('No code "999"');
    await expect(form.locator('#pi-supplier')).toHaveValue('s3');
    await form.locator('#pi-supplier').selectOption('s22');
    await expect(sc).toHaveValue('S-0022');
    await expect(form.getByRole('alert')).toHaveCount(0);
    // Lower case + Tab works too.
    await sc.fill('s-0002');
    await sc.press('Tab');
    await expect(form.locator('#pi-supplier')).toHaveValue('s2');

    await form.locator('#pi-memo').fill('HB-7781');
    await form.locator('#pi-memo').press('Enter');
    await expect(form.locator('#pi-godown')).toBeFocused();
    await page.keyboard.press('Enter');
    // (Search old invoice is skipped: it is not a data-entry field.)
    await expect(form.getByLabel('Product code 1')).toBeFocused();

    // Line 1: item code → Enter → Qty → Enter → Rate (cost price filled) → Enter → new line's Code box.
    await page.keyboard.type('102');
    await page.keyboard.press('Enter');
    await expect(form.getByLabel('Product 1', { exact: true })).toHaveValue('p2');
    await expect(form.getByLabel('Qty 1', { exact: true })).toBeFocused();
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await expect(form.getByLabel('Rate 1', { exact: true })).toBeFocused();
    await expect(form.getByLabel('Rate 1', { exact: true })).toHaveValue('2000');
    await page.keyboard.press('Enter');
    await expect(form.getByLabel('Product code 2')).toBeFocused();

    // Line 2 by barcode; then change the name and the code box follows.
    await page.keyboard.type('896400000010');
    await page.keyboard.press('Enter');
    await expect(form.getByLabel('Product 2', { exact: true })).toHaveValue('p11');
    await expect(form.getByLabel('Product code 2')).toHaveValue('111');
    await form.getByLabel('Product 2', { exact: true }).selectOption('p5');
    await expect(form.getByLabel('Product code 2')).toHaveValue('105');
    await form.getByLabel('Qty 2', { exact: true }).fill('3');
    await form.getByLabel('Rate 2', { exact: true }).press('Enter');
    // Line 3: an empty code ends the list → Discount %.
    await expect(form.getByLabel('Product code 3')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(form.getByLabel('Discount %')).toBeFocused();
    await page.keyboard.type('10');
    // Alt+N adds a line from anywhere; remove it again.
    await page.keyboard.press('Alt+n');
    await expect(form.getByLabel('Product code 4')).toBeFocused();
    await form.locator('button[aria-label="Remove line 4"]:visible').click();
    await form.locator('button[aria-label="Remove line 3"]:visible').click();
    await expect(form.getByTestId('pi-line')).toHaveCount(2);

    // 12 cans × 2,000 + 3 tins × 6,000 = 42,000 − 10% = 37,800.
    await expect(form.getByTestId('pi-total')).toHaveText('Rs. 37,800');
    await form.getByLabel('Paid now').fill('7800');
    await page.keyboard.press('F9');
    await expect(page.getByRole('dialog', { name: 'Purchase Invoice P-1' })).toBeVisible();
    await page.keyboard.press('Escape');

    const sups = await store(page, 'tradeflow_suppliers_v2');
    expect(sups.find((s: { id: string }) => s.id === 's2').totalOwed).toBe(30000);
    const items = await store(page, 'tradeflow_products_v2');
    expect(items.find((p: { id: string }) => p.id === 'p2').stockKg).toBe(12);
    expect(items.find((p: { id: string }) => p.id === 'p5').stockKg).toBe(3);
    await booksAgree(page);

    // The same bill no. from the same supplier again: refused, with a proper sentence.
    const again = await openPurchaseInvoice(page);
    await again.getByLabel('Supplier code').fill('2');
    await again.getByLabel('Supplier code').press('Enter');
    await again.locator('#pi-memo').fill('hb-7781');
    await again.getByLabel('Product code 1').fill('101');
    await again.getByLabel('Product code 1').press('Enter');
    await again.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(again.getByText('Enter the quantity of Dalda Ghee 16 L Tin.')).toBeVisible();
    await again.getByLabel('Qty 1', { exact: true }).fill('1');
    await again.getByRole('button', { name: 'Save', exact: true }).dblclick();
    await expect(again.getByText('Bill no. hb-7781 of Habib Oil Mills is already entered.')).toBeVisible();
    await again.locator('#pi-memo').fill('HB-7790');
    await again.getByRole('button', { name: 'Save', exact: true }).dblclick();
    await expect(page.getByRole('dialog', { name: 'Purchase Invoice P-2' })).toBeVisible();
    expect(await store(page, 'tradeflow_purchase_invoices_v1')).toHaveLength(2);
    await page.keyboard.press('Escape');

    // The list finds invoices by supplier code, city, bill no. and item code.
    await goTo(page, 'Purchase invoices');
    const search = page.getByLabel('Search purchase invoices');
    const list = page.getByTestId('purchase-invoice-list');
    for (const q of ['S-0002', 'lahore', 'HB-7790', '105', 'Habib']) {
      await search.fill(q);
      await expect(list, `search "${q}"`).toBeVisible();
    }
    await search.fill('S-0002');
    await expect(list.locator('tbody tr')).toHaveCount(2);
    // The sticky header must not sit on top of the first row (it did inside an overflow box).
    const head = (await list.locator('thead').boundingBox())!;
    const first = (await list.locator('tbody tr').first().boundingBox())!;
    expect(first.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
    await list.getByRole('button', { name: 'P-2', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Purchase Invoice P-2' })).toBeVisible();
    await page.keyboard.press('Escape');
    await search.fill('105');
    await expect(list.locator('tbody tr')).toHaveCount(1);
    await search.fill('Quetta');
    await expect(page.getByText('No purchase invoice matches.')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Purchase Invoice: nothing cut off', () => {
  for (const width of [1360, 1024, 820, 390]) {
    test(`big numbers fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      // Open from the Purchase invoices screen (works on phones too).
      await goTo(page, 'Purchase invoices');
      await page.getByRole('button', { name: 'Purchase Invoice', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Purchase Invoice' });
      await form.getByLabel('Supplier code').fill('22');
      await form.getByLabel('Supplier code').press('Enter');
      await form.getByLabel('Product code 1').fill('131');
      await form.getByLabel('Product code 1').press('Enter');
      await form.getByLabel('Qty 1', { exact: true }).fill('123456.75');
      await form.getByLabel('Rate 1', { exact: true }).fill('1234567.89');
      await form.getByRole('button', { name: 'Add another item' }).click();
      await form.getByLabel('Product code 2').fill('105'); // batches: batch + expiry row
      await form.getByLabel('Product code 2').press('Enter');
      await form.getByLabel('Qty 2', { exact: true }).fill('10');

      // No text cut off inside the Code / Qty / Rate boxes.
      const cut = await form.locator('input[aria-label^="Qty"], input[aria-label^="Rate"], input[aria-label^="Product code"]').evaluateAll((els) =>
        els.filter((e) => (e as HTMLInputElement).scrollWidth > (e as HTMLInputElement).clientWidth + 1).map((e) => `${e.getAttribute('aria-label')}=${(e as HTMLInputElement).value}`)
      );
      expect(cut, 'values cut off').toEqual([]);
      // Every part of each line stays inside the dialog (amount, delete, batch/expiry).
      const dialogBox = (await form.boundingBox())!;
      const outside = await form.locator('[data-testid="pi-line"] input, [data-testid="pi-line"] select, [data-testid="pi-line"] [data-testid^="pi-amount"], [data-testid="pi-line"] button').evaluateAll(
        (els, right) => els.filter((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().right > right + 1).map((e) => e.getAttribute('aria-label') || e.getAttribute('data-testid') || e.tagName),
        dialogBox.x + dialogBox.width
      );
      expect(outside, 'sticks out of the dialog').toEqual([]);
      await expect(form.getByTestId('pi-amount-1')).toHaveText('Rs. 152,415,739,353.76');
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(wide, 'page scrolls sideways').toBe(false);
    });
  }
});

test.describe('Paying and receiving', () => {
  test('double-clicking Pay pays once; carton toggle converts the typed quantity', async ({ page }) => {
    await open(page);
    await openMenuOption(page, 'Invoice', 'Receive stock');
    const rs = page.getByRole('dialog', { name: 'Receive stock' });
    // Suppliers are listed by firm name with their code.
    await expect(rs.locator('#rs-supplier option').nth(1)).toHaveText('S-0020 • Bannu Ghee Mills');
    await rs.locator('#rs-supplier').selectOption('s2');
    await rs.locator('#rs-item').selectOption('p2');
    await rs.locator('#rs-qty').fill('8');
    await rs.locator('#rs-cost').fill('2000');
    // 8 cans at 2,000 → 2 cartons (of 4) at 8,000, not 8 cartons.
    await rs.getByRole('group', { name: 'Unit for item 1' }).getByRole('button', { name: /carton/ }).click();
    await expect(rs.locator('#rs-qty')).toHaveValue('2');
    await expect(rs.locator('#rs-cost')).toHaveValue('8000');
    await rs.getByRole('group', { name: 'Unit for item 1' }).getByRole('button', { name: 'can', exact: true }).click();
    await expect(rs.locator('#rs-qty')).toHaveValue('8');
    await rs.getByRole('group', { name: 'Unit for item 1' }).getByRole('button', { name: /carton/ }).click();
    await rs.getByRole('button', { name: 'Receive stock' }).click();
    await expect(rs).toBeHidden();
    let items = await store(page, 'tradeflow_products_v2');
    expect(items.find((p: { id: string }) => p.id === 'p2').stockKg).toBe(8);

    await openMenuOption(page, 'Accounts', 'Pay supplier');
    const pay = page.getByRole('dialog', { name: 'Pay supplier' });
    await pay.locator('#ps-sup').selectOption('s2');
    await pay.locator('#ps-amount').fill('1000');
    await pay.getByRole('button', { name: 'Pay', exact: true }).dblclick();
    await expect(pay).toBeHidden();
    const led = await store(page, 'tradeflow_ledger_v2');
    expect(led.filter((l: { type: string }) => l.type === 'payment_made')).toHaveLength(1);
    const sups = await store(page, 'tradeflow_suppliers_v2');
    expect(sups.find((s: { id: string }) => s.id === 's2').totalOwed).toBe(15000);
    await booksAgree(page);
    items = await store(page, 'tradeflow_products_v2');
    expect(items.find((p: { id: string }) => p.id === 'p2').stockKg).toBe(8);

    // The statement: the goods first, then the payment; the tins are "can", not kg.
    await goTo(page, 'Suppliers');
    await page.getByLabel('Search suppliers').fill('S-0002');
    await page.getByRole('button', { name: /Habib Oil Mills/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'Habib Oil Mills' })).toContainText('S-0002');
    await page.getByRole('button', { name: 'Statement' }).click();
    const doc = page.locator('#print-root');
    await expect(doc).toContainText('8 can Habib Oil 5 L Can');
    await expect(doc).not.toContainText(' kg');
    const balances = await doc.locator('tbody tr td:last-child').allInnerTexts();
    expect(balances.map((b) => b.replace(/\s+/g, ' ').trim())).toEqual(['Rs 0', 'Rs 16,000', 'Rs 15,000']);
  });
});

test.describe('Orders and search', () => {
  test('re-order makes one order per supplier, listed newest number first; supplier search by code, city and phone', async ({ page }) => {
    await open(page);
    await openMenuOption(page, 'Invoice', 'Re-order list');
    const ro = page.getByRole('dialog', { name: 'Re-order report' });
    await ro.getByRole('button', { name: /Make purchase order/ }).click();
    await expect(ro).toBeHidden();
    // 20 orders: a short message, not a wall of text over the screen.
    await expect(page.getByTestId('purchasing-toast')).toHaveText('20 purchase orders made: PO-1 to PO-20 for 20 suppliers — see Suppliers → Orders.');
    await goTo(page, 'Suppliers');
    await page.getByRole('tab', { name: /^Orders/ }).click();
    const names = await page.getByRole('list', { name: 'Purchase orders' }).getByRole('button', { name: /^Open PO-/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(names.slice(0, 3)).toEqual(['Open PO-20', 'Open PO-19', 'Open PO-18']);
    expect(names[names.length - 1]).toBe('Open PO-1');

    await page.getByRole('tab', { name: 'Suppliers', exact: true }).click();
    const box = page.getByLabel('Search suppliers');
    await expect(box).toHaveAttribute('placeholder', 'Search by name, code, city, phone or contact');
    const rows = page.locator('main').getByRole('button', { name: /^S-00/ });
    await box.fill('S-0005');
    await expect(rows).toHaveCount(1);
    await box.fill('mardan');
    await expect(rows).toHaveCount(3);
    await box.fill('0300 1000 822');
    await expect(rows).toHaveCount(1);
    await box.fill('شاہین');
    await expect(rows).toHaveCount(1);
  });
});
