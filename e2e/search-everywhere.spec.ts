import { test, expect, Page, Locator } from '@playwright/test';
import { signIn, OWNER } from './helpers/login';
import { bigShop } from './helpers/bigShop';
import { openMenuOption } from './helpers/nav';
import { NAV_GROUPS } from '../src/utils/navMap';

/**
 * SEARCH EVERYWHERE — every search box and picker finds things the way staff type them: by name, code
 * (with or without the dash), shop name, phone (with spaces), city, bill / memo number; Urdu and Roman-Urdu
 * names; any case. One rule for all of them (src/utils/search.ts).
 *
 * The big shop (helpers/bigShop.ts): C-0007 "Gul Khan & Sons" (0300 1074070, Peshawar, owes 2 bills: INV-18,
 * INV-58), C-0004 "محمد اسلم کریانہ سٹور", C-0001 "Zaman and Co BTK" (shop "Zaman Shop"), supplier S-0003
 * "Seasons Edible Oil" (0321 7008642), item 105 "Habib Cooking Oil 5 L", bill INV-12 (memo M-512), purchase
 * P-3 (supplier bill SB-9003), voucher CPV-1 "Shop rent September", cheque 100200 from Haji Karim.
 */
test.use({ viewport: { width: 1360, height: 900 } });

async function open(page: Page) {
  await page.addInitScript(bigShop);
  await signIn(page, OWNER);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({ timeout: 15_000 });
}

/** Open a nav-map option by its id through the top menu bar (the Invoice menu opens its options to the side). */
async function openById(page: Page, id: string) {
  const g = NAV_GROUPS.find((x) => x.sections.some((s) => s.entries.some((e) => e.id === id)))!;
  const e = g.sections.flatMap((s) => s.entries).find((x) => x.id === id)!;
  await openMenuOption(page, g.label, e.label);
}

/** Type into a search box and check what the list shows (and, optionally, what it no longer shows). */
async function expectFinds(box: Locator, area: Locator, query: string, shows: string, hides?: string) {
  await box.fill(query);
  await expect(area, `"${query}" finds ${shows}`).toContainText(shows);
  if (hides) await expect(area, `"${query}" hides ${hides}`).not.toContainText(hides);
}

test('Find anything (Ctrl+K): customers, suppliers, items, bills, memos, purchases and vouchers, typed any way', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+k');
  const dlg = page.getByRole('dialog', { name: 'Find anything' });
  const box = dlg.getByRole('combobox', { name: 'Search' });
  const cases: [string, string][] = [
    ['c0007', 'Gul Khan & Sons'], // code without the dash
    ['C-0007', 'Gul Khan & Sons'],
    ['0300 1074070', 'Gul Khan & Sons'], // phone with a space
    ['03001074070', 'Gul Khan & Sons'],
    ['GUL KHAN', 'Gul Khan & Sons'],
    ['sons gul', 'Gul Khan & Sons'], // words in any order
    ['peshawar', 'Gul Khan & Sons'], // city
    ['zaman shop', 'Zaman and Co BTK'], // shop name
    ['اسلم', 'محمد اسلم کریانہ سٹور'], // Urdu
    ['s0003', 'Seasons Edible Oil'],
    ['0321 7008642', 'Seasons Edible Oil'],
    ['105', 'Habib Cooking Oil 5 L'], // item code
    ['inv12', 'INV-12'],
    ['m-512', 'INV-12'], // memo no.
    ['sb-9003', 'P-3'], // supplier's bill no.
    ['cpv1', 'CPV-1'],
  ];
  for (const [q, want] of cases) await expectFinds(box, dlg, q, want);
  await page.keyboard.press('Escape');
});

test('Customer, supplier and item lists find by code, shop name, phone, city, Urdu, any case', async ({ page }) => {
  await open(page);
  const main = page.locator('main');
  await openById(page, 'customers');
  const cs = page.getByLabel('Search customers');
  await expectFinds(cs, main, 'c-0007', 'Gul Khan & Sons', 'Zaman and Co BTK');
  await expectFinds(cs, main, 'C0007', 'Gul Khan & Sons', 'Zaman and Co BTK');
  await expectFinds(cs, main, '0300 1074070', 'Gul Khan & Sons', 'Zaman and Co BTK');
  await expectFinds(cs, main, 'gul KHAN', 'Gul Khan & Sons', 'Zaman and Co BTK');
  await expectFinds(cs, main, 'Peshawar', 'Gul Khan & Sons', 'Zaman and Co BTK');
  await expectFinds(cs, main, 'ZAMAN SHOP', 'Zaman and Co BTK', 'Gul Khan & Sons');
  await expectFinds(cs, main, 'اسلم', 'محمد اسلم کریانہ سٹور', 'Gul Khan & Sons');

  await openById(page, 'suppliers');
  const ss = page.getByLabel('Search suppliers');
  await expectFinds(ss, main, 's0003', 'Seasons Edible Oil', 'Habib Oil Mills');
  await expectFinds(ss, main, '0321 7008642', 'Seasons Edible Oil', 'Habib Oil Mills');
  await expectFinds(ss, main, 'کسان', 'کسان گھی ملز', 'Habib Oil Mills');
  await expectFinds(ss, main, 'SEASONS', 'Seasons Edible Oil', 'Habib Oil Mills');

  await openById(page, 'items');
  const is = page.getByLabel('Search items');
  await expectFinds(is, main, '105', 'Habib Cooking Oil 5 L', 'Dalda Banaspati 16 L Tin');
  await expectFinds(is, main, 'canola seasons', 'Seasons Canola Oil 5 L', 'Dalda Banaspati 16 L Tin');
  await expectFinds(is, main, 'کسان', 'کسان گھی 16 کلو', 'Dalda Banaspati 16 L Tin');
  await expectFinds(is, main, 'DALDA', 'Dalda Banaspati 16 L Tin', 'Habib Cooking Oil 5 L');
});

test('Bills list, purchase invoices, cheques and vouchers find by number, memo, party code, phone and city', async ({ page }) => {
  await open(page);
  const main = page.locator('main');
  await openById(page, 'bills');
  await main.getByRole('button', { name: 'All', exact: true }).click();
  const bs = page.getByLabel('Search bills');
  await expectFinds(bs, main, 'inv12', 'INV-12', 'INV-18');
  await expectFinds(bs, main, 'M-512', 'INV-12', 'INV-18');
  await expectFinds(bs, main, '0300 1074070', 'INV-18', 'INV-12'); // the customer's phone with a space
  await expectFinds(bs, main, 'c-0007', 'INV-58', 'INV-12'); // the customer's code
  await expectFinds(bs, main, 'gul khan', 'INV-18', 'INV-12');

  await openById(page, 'purchases');
  const ps = page.getByLabel('Search purchase invoices');
  await expectFinds(ps, main, 'sb9003', 'P-3', 'P-12');
  await expectFinds(ps, main, 's-0004', 'P-3', 'P-12'); // P-3 is from S-0004 (Eva Cooking Oil)
  await expectFinds(ps, main, 'eva', 'P-3', 'P-12');

  await openById(page, 'cheques');
  await page.getByRole('tablist', { name: 'Cheque lists' }).getByRole('tab', { name: /^All/ }).click();
  const qs = page.getByLabel('Search cheques');
  await expectFinds(qs, main, 'HAJI KARIM', '100200', '778899');
  await expectFinds(qs, main, 'hbl', '778899', '100200');

  await openById(page, 'vouchers');
  const vs = page.getByLabel('Search', { exact: true });
  await expectFinds(vs, main, 'cpv1', 'CPV-1', 'CRV-1');
  await expectFinds(vs, main, 'RENT', 'CPV-1', 'CRV-1');
});

test('Pickers: Receive payment, Receive from many, report filter and the voucher account search', async ({ page }) => {
  await open(page);
  // Receive payment (F3): the Code box, and type-to-find in the name list.
  await page.keyboard.press('F3');
  const rc = page.getByRole('dialog', { name: 'Receive payment' });
  await rc.getByLabel('Customer', { exact: true }).focus();
  await page.keyboard.type('gul');
  await expect(rc.getByLabel('Customer', { exact: true })).toHaveValue('c7');
  await rc.getByLabel('Code', { exact: true }).fill('4');
  await rc.getByLabel('Code', { exact: true }).press('Enter');
  await expect(rc.getByLabel('Customer', { exact: true })).toHaveValue('c4');
  await expect(rc.getByLabel('Amount (Rs.)')).toBeFocused(); // Enter moves on, like the old program
  await rc.getByLabel('Code', { exact: true }).fill('C-9999');
  await rc.getByLabel('Code', { exact: true }).press('Enter');
  await expect(rc.getByRole('alert')).toContainText('No code');
  await page.keyboard.press('Escape');

  // Receive from many (a voucher table): the line's Code box takes "c0007"; the name list finds by typing.
  await openById(page, 'receive-many');
  const rm = page.getByRole('dialog', { name: 'Receive from many' });
  await rm.getByLabel('Line 1 code').fill('c0007');
  await rm.getByLabel('Line 1 code').press('Enter');
  await expect(rm.getByLabel('Line 1 customer')).toHaveValue('c7');
  await rm.getByLabel('Line 1 amount').fill('1000'); // a line goes into the grid with its amount
  await rm.getByRole('button', { name: 'Add row' }).click();
  await rm.getByLabel('Line 2 customer').focus();
  await page.keyboard.type('gul');
  await expect(rm.getByLabel('Line 2 customer')).toHaveValue('');
  await expect(rm.getByText(/Gul Khan & Sons is already on line 1/)).toBeVisible();
  await expect(rm.getByLabel('Line 2 code')).toBeFocused(); // back to Code for another customer
  await page.keyboard.press('Escape');

  // A report's customer filter: Code box + type-to-find.
  await openById(page, 'rep-party-sales');
  const repCust = page.getByLabel('Customer', { exact: true });
  await page.getByLabel('Code', { exact: true }).fill('c0007');
  await page.getByLabel('Code', { exact: true }).press('Enter');
  await expect(repCust).toHaveValue('c7');
  await repCust.focus();
  await page.keyboard.type('zaman');
  await expect(repCust).toHaveValue('c1');

  // Voucher line: the account search (F1 / search button) by phone and shop name.
  await openById(page, 'vouchers');
  await page.getByRole('button', { name: 'New Cash payment voucher' }).click();
  const v = page.getByRole('dialog', { name: 'Cash Payment -- [Debit Voucher]' });
  await v.getByRole('button', { name: 'Search Code (By Title)' }).click();
  const fa = page.getByRole('dialog', { name: 'Search Code (By Title)' });
  await fa.getByLabel('Search by title').fill('0321 7008642');
  await expect(fa.getByRole('grid', { name: 'Accounts found' })).toContainText('Seasons Edible Oil');
  await fa.getByLabel('Search by title').fill('zaman shop');
  await expect(fa.getByRole('row').nth(1)).toContainText('Zaman and Co BTK');
  await fa.getByLabel('Search by title').press('Enter');
  await expect(fa).toHaveCount(0);
  await expect(v.getByLabel('Title', { exact: true })).toHaveValue('Zaman and Co BTK');
});
