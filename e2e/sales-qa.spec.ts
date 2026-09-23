import { test, expect, Page, Locator } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';
import { salesSeed } from './helpers/salesSeed';

/**
 * Sales, used like a demanding shopkeeper would (QA pass): Code boxes beside the customer and every bill line
 * (code, just the number, barcode, or a name), keyboard-only billing from the Code boxes, line columns wide
 * enough for big figures on desktop / tablet / phone, Urdu names that don't scramble, bills search across
 * dates, a bank refund on a return, printed paisa, and the trial balance staying balanced throughout.
 * Seed: 32 customers, 22 items with codes / barcodes / cartons, two godowns, batches, two banks (helpers/salesSeed.ts).
 */
async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(salesSeed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

async function newBill(page: Page) {
  await goTo(page, 'Bills');
  await page.getByRole('button', { name: 'New Bill' }).first().click();
  const d = page.getByRole('dialog', { name: 'New Bill' });
  await expect(d).toBeVisible();
  return d;
}

async function trialBalanced(page: Page) {
  await goTo(page, 'Accounts');
  await page.getByRole('tab', { name: 'Trial balance', exact: true }).click();
  await expect(page.getByText('Balanced ✓').first()).toBeVisible();
}

/** The whole value can be seen: nothing scrolled out of the box. */
async function fullyVisible(input: Locator, label: string) {
  const r = await input.evaluate((el: HTMLInputElement) => ({ sw: el.scrollWidth, cw: el.clientWidth, v: el.value }));
  expect(r.sw, `${label} "${r.v}" is cut off (${r.sw} > ${r.cw})`).toBeLessThanOrEqual(r.cw + 1);
}

test.describe('Sales QA', () => {
  test('Code boxes: customer and item by code, number, barcode or name; keyboard only from the Code boxes; F9 saves', async ({ page }) => {
    await open(page);
    await page.keyboard.press('F2');
    const d = page.getByRole('dialog', { name: 'New Bill' });
    await expect(d.getByLabel('Customer', { exact: true })).toBeFocused(); // the name list still gets the first focus

    // Customer: just the number part of C-0004.
    const custCode = d.getByLabel('Customer code', { exact: true });
    await custCode.fill('4');
    await custCode.press('Enter');
    await expect(d.getByLabel('Customer', { exact: true })).toHaveValue('c4');
    await expect(custCode).toHaveValue('C-0004');
    await expect(d.getByTestId('bill-customer-info')).toBeVisible();
    // Enter moved on to line 1's Code box.
    const code1 = d.getByLabel('Code 1', { exact: true });
    await expect(code1).toBeFocused();

    // Item by its code → Qty → Price → next line's Code box.
    await page.keyboard.type('121');
    await page.keyboard.press('Enter');
    await expect(d.getByLabel('Item 1', { exact: true })).toHaveValue('p21');
    await expect(d.getByLabel('Quantity 1', { exact: true })).toBeFocused();
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await expect(d.getByLabel('Price 1', { exact: true })).toBeFocused();
    await expect(d.getByLabel('Price 1', { exact: true })).toHaveValue('1980');
    await page.keyboard.press('Enter');
    const code2 = d.getByLabel('Code 2', { exact: true });
    await expect(code2).toBeFocused();

    // A code nobody has: the box says so and keeps the cursor.
    await page.keyboard.type('999');
    await page.keyboard.press('Enter');
    await expect(d.getByRole('alert').filter({ hasText: 'No code "999"' })).toBeVisible();
    await expect(code2).toBeFocused();
    await expect(d.getByLabel('Item 2', { exact: true })).toHaveValue('');

    // A barcode (USB scanner types it + Enter) picks the item too.
    const barcode = await page.evaluate(() => JSON.parse(localStorage.getItem('tradeflow_products_v2') || '[]').find((p: { id: string }) => p.id === 'p3').barcode as string);
    await code2.fill(barcode);
    await code2.press('Enter');
    await expect(d.getByLabel('Item 2', { exact: true })).toHaveValue('p3');
    await expect(code2).toHaveValue('103');
    await page.keyboard.type('5');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // A name typed in the Code box still finds the item.
    const code3 = d.getByLabel('Code 3', { exact: true });
    await expect(code3).toBeFocused();
    await page.keyboard.type('sugar');
    await page.keyboard.press('Enter');
    await expect(d.getByLabel('Item 3', { exact: true })).toHaveValue('p12');
    await expect(code3).toHaveValue('112');
    await page.keyboard.type('2');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    // An empty Code box + Enter ends the list: "Paid now".
    await expect(d.getByLabel('Code 4', { exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(d.getByLabel('Paid now', { exact: true })).toBeFocused();
    // 12 × 1,980 + 5 × 560 + 2 × 7,250 = 23,760 + 2,800 + 14,500 = 41,060
    await expect(d.getByTestId('line-amount-1')).toHaveText('Rs. 23,760');
    await expect(d.getByText('Rs. 41,060', { exact: true }).first()).toBeVisible();
    await page.keyboard.type('41060');
    await page.keyboard.press('F9');
    await expect(d).toBeHidden();

    // Tab (no Enter) also picks, and picking by name fills the Code box.
    const d2 = await newBill(page);
    await d2.getByLabel('Customer code', { exact: true }).fill('c-0007');
    await d2.getByLabel('Customer code', { exact: true }).press('Tab');
    await expect(d2.getByLabel('Customer', { exact: true })).toHaveValue('c7');
    await d2.getByLabel('Item 1', { exact: true }).selectOption('p9');
    await expect(d2.getByLabel('Code 1', { exact: true })).toHaveValue('109');
    await page.keyboard.press('Escape');

    await goTo(page, 'Bills');
    await expect(page.getByText('INV-1')).toBeVisible();
    await trialBalanced(page);
  });

  for (const [name, vp] of [['desktop', { width: 1360, height: 900 }], ['tablet', { width: 820, height: 1180 }], ['phone', { width: 390, height: 844 }]] as const) {
    test(`bill lines have room for big figures on ${name}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await open(page);
      const d = await newBill(page);
      await d.getByLabel('Customer', { exact: true }).selectOption('c4');
      await d.getByLabel('Item 1', { exact: true }).selectOption('p12');
      await d.getByLabel('Quantity 1', { exact: true }).fill('12345.25');
      await d.getByLabel('Price 1', { exact: true }).fill('12345678.50');
      for (const label of ['Code 1', 'Quantity 1', 'Price 1', 'Customer code']) await fullyVisible(d.getByLabel(label, { exact: true }), `${name} ${label}`);
      // Rs. 12,345,678.50 stays on one line and does not run under the remove button.
      await d.getByLabel('Quantity 1', { exact: true }).fill('1');
      const amount = d.getByTestId('line-amount-1');
      await expect(amount).toHaveText('Rs. 12,345,678.50');
      const a = (await amount.boundingBox())!;
      expect(a.height, 'amount wraps onto two lines').toBeLessThan(26);
      const bin = d.getByRole('button', { name: 'Remove item 1' });
      const b = (await bin.boundingBox())!;
      expect(a.x + a.width <= b.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'amount overlaps the remove button').toBe(true);
      const q = (await d.getByLabel('Quantity 1', { exact: true }).boundingBox())!;
      expect(q.width, 'qty box too narrow').toBeGreaterThanOrEqual(95);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // The cheque's date is not squeezed in the payment box.
      await d.getByLabel('Method', { exact: true }).selectOption('Cheque');
      await d.getByLabel('Paid now', { exact: true }).fill('5000');
      const date = (await d.getByLabel('Date on cheque').boundingBox())!;
      expect(date.width, 'cheque date too narrow').toBeGreaterThanOrEqual(140);
    });
  }

  test('Urdu names, bills search over all dates / by code / by amount, bank refund on a return, paisa on the print', async ({ page }) => {
    await open(page);
    // A back-dated bill for an Urdu-named customer, part paid, with paisa.
    const d = await newBill(page);
    await d.getByLabel('Customer code', { exact: true }).fill('3');
    await d.getByLabel('Customer code', { exact: true }).press('Enter');
    await expect(d.getByLabel('Customer', { exact: true })).toHaveValue('c3');
    const lastWeek = new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0];
    await d.getByLabel('Date', { exact: true }).fill(lastWeek);
    await d.getByLabel('Item 1', { exact: true }).selectOption('p12');
    await d.getByLabel('Quantity 1', { exact: true }).fill('1234');
    await d.getByLabel('Price 1', { exact: true }).fill('9999.75');
    await d.getByRole('button', { name: 'Full', exact: true }).click();
    await d.getByRole('button', { name: 'Save & Print' }).click();
    const print = page.locator('#print-root');
    await expect(print).toContainText('12,339,691.50'); // not "12,339,691.5"
    await page.getByRole('button', { name: 'Close preview' }).click();

    // Bills: "Today" is picked, yet typing finds the older bill — by number, customer code and amount.
    await goTo(page, 'Bills');
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('No bills match')).toBeVisible();
    const search = page.getByLabel('Search bills');
    for (const q of ['INV-1', 'c-0003', '12,339,691.50', 'Rs. 12339691.5', 'حاجی']) {
      await search.fill(q);
      await expect(page.getByRole('button', { name: /حاجی عبدالرحمن/ }), `search "${q}"`).toBeVisible();
    }
    await search.fill('');
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await search.fill('INV-1');

    // Bill detail: the Urdu name is kept apart from the date so neither is scrambled.
    await page.getByRole('button', { name: /حاجی عبدالرحمن/ }).first().click();
    const det = page.getByRole('dialog', { name: 'Bill INV-1' });
    const sub = await det.locator('h2 + p').textContent();
    expect(sub).toMatch(/^⁨حاجی عبدالرحمن اینڈ سنز⁩ • /);

    // Return 1 bag, money back by bank transfer from HBL (the second bank).
    await det.getByRole('button', { name: 'Return items' }).click();
    const ret = page.getByRole('dialog', { name: /Return items/ });
    await ret.getByLabel('Return qty 1', { exact: true }).fill('1');
    await ret.getByLabel('Paid back by').selectOption('Bank Transfer');
    await ret.getByLabel('Paid from bank').selectOption('1011');
    await ret.getByLabel('Print the credit note after saving').uncheck();
    await ret.getByRole('button', { name: 'Save return' }).click();
    await expect(ret).toBeHidden();
    const refund = await page.evaluate(() => JSON.parse(localStorage.getItem('tradeflow_ledger_v2') || '[]').find((l: { type: string }) => l.type === 'refund_paid'));
    expect(refund.bankCode).toBe('1011');
    expect(refund.debit).toBe(9999.75);
    await page.keyboard.press('Escape');
    await trialBalanced(page);
  });

  test('quotation: Code boxes, then turned into a bill', async ({ page }) => {
    await open(page);
    await goTo(page, 'Bills');
    await page.getByRole('tab', { name: /Quotations/ }).click();
    await page.getByRole('button', { name: 'New Quotation' }).click();
    const q = page.getByRole('dialog', { name: 'New Quotation' });
    await q.getByLabel('Customer code', { exact: true }).fill('C-0010');
    await q.getByLabel('Customer code', { exact: true }).press('Tab');
    await expect(q.getByLabel('Customer', { exact: true })).toHaveValue('c10');
    await q.getByLabel('Quote code 1', { exact: true }).fill('104');
    await q.getByLabel('Quote code 1', { exact: true }).press('Enter');
    await expect(q.getByLabel('Quote item 1', { exact: true })).toHaveValue('p4');
    await q.getByLabel('Quote qty 1', { exact: true }).fill('30');
    await expect(q).toContainText('Rs. 49,500');
    await q.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(q).toBeHidden();
    await page.getByRole('button', { name: /^Make bill from / }).first().click();
    const d = page.getByRole('dialog', { name: 'New Bill' });
    await expect(d.getByLabel('Customer code', { exact: true })).toHaveValue('C-0010');
    await expect(d.getByLabel('Code 1', { exact: true })).toHaveValue('104');
    await d.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(d).toBeHidden();
    await trialBalanced(page);
  });
});
