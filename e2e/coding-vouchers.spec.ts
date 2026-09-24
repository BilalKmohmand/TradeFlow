import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo, openMenuOption } from './helpers/nav';
import { VOUCHER_TITLE, voucherLine } from './helpers/voucher';
import { NAV_GROUPS, navCheck } from '../src/utils/navMap';

/**
 * Apna Accountant SB, step for step: the Cash Payment -- [Debit Voucher] screen typed with the keyboard only
 * (Code → Enter → Title → Enter → Debit → Enter → Narration → Enter), the "Search Code (By Title)" popup,
 * Search by voucher number, and the Coding menu (every item opens; Accounts Opening Balances and Opening
 * Stocks post).
 */
const seed = () => {
  if (localStorage.getItem('e2e_coding_seeded')) return;
  localStorage.setItem('e2e_coding_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'GOHAR ZAMAN CO', companyAddress: 'Dargai', cashOpeningBalance: 5000000, openingBankBalance: 1000000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: '141274', name: 'Zaman Kiryana Dargai', company: 'Zaman Kiryana', phone: '03440000001', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01', city: 'Dargai' },
    { id: 'c2', code: '141275', name: 'Haji Gul Store', company: 'Haji Gul Store', phone: '03440000002', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01', city: 'Batkhela' },
  ]);
  set('tradeflow_suppliers_v2', [
    { id: 's1', code: '2224', name: 'MG Edible', company: 'MG EDIBLE OIL AND GHEE (PVT) LTD', phone: '', email: '', address: '', materialCategory: '', totalOwed: 0, createdAt: '2026-01-01', city: 'Peshawar' },
    { id: 's2', code: '2230', name: 'Dalda', company: 'Dalda Foods', phone: '', email: '', address: '', materialCategory: '', totalOwed: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_products_v2', [
    { id: 'p1', code: '101', name: 'Dalda 16 L Tin', category: 'Ghee', brand: 'Dalda', unit: 'tin', unitPricePerKg: 6000, costPricePerKg: 5500, stockKg: 0, minThresholdKg: 0 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2', 'tradeflow_journal_entries_v1', 'tradeflow_accounts_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

test('CPV typed with the keyboard only: code + Enter, the title search, the grid, Save, Search by number', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await openMenuOption(page, 'Accounts', 'CPV — Cash payment voucher');
  const v = page.getByRole('dialog', { name: VOUCHER_TITLE.CPV });
  await expect(v).toBeVisible();
  await expect(v.getByTestId('voucher-number')).toHaveValue('CPV-1');
  const code = v.getByLabel('Code', { exact: true });
  await expect(code).toBeFocused();
  // A/C Balance: the cash in hand until an account is picked.
  await expect(v.getByTestId('voucher-ac-balance')).toHaveValue('5,000,000.00 Dr — Cash in hand');

  // 2224 Enter → the title shows, Enter → Debit, amount Enter → Narration, Enter → into the grid.
  await page.keyboard.type('2224');
  await page.keyboard.press('Enter');
  await expect(v.getByLabel('Title', { exact: true })).toBeFocused();
  await expect(v.getByLabel('Title', { exact: true })).toHaveValue('MG EDIBLE OIL AND GHEE (PVT) LTD');
  await expect(v.getByTestId('voucher-ac-balance')).toHaveValue('0.00 — MG EDIBLE OIL AND GHEE (PVT) LTD');
  await page.keyboard.press('Enter');
  await expect(v.getByLabel('Debit', { exact: true })).toBeFocused();
  await page.keyboard.type('1750000');
  await page.keyboard.press('Enter');
  await expect(v.getByLabel('Narration', { exact: true })).toBeFocused();
  await page.keyboard.type('BAHL- RAHMAT ALI PESHAWAR');
  await page.keyboard.press('Enter');
  const lines = v.getByTestId('voucher-line');
  await expect(lines).toHaveCount(1);
  await expect(lines.first()).toContainText('2224');
  await expect(lines.first()).toContainText('MG EDIBLE OIL AND GHEE (PVT) LTD');
  await expect(lines.first()).toContainText('1,750,000.00');
  await expect(lines.first()).toContainText('BAHL- RAHMAT ALI PESHAWAR');
  await expect(code).toBeFocused();
  await expect(code).toHaveValue('');

  // F1 in Code: "Search Code (By Title)" — type, arrows, Enter.
  await page.keyboard.press('F1');
  const pop = page.getByRole('dialog', { name: 'Search Code (By Title)' });
  await expect(pop).toBeVisible();
  await expect(pop.getByRole('columnheader', { name: 'Customer #' })).toBeVisible();
  await expect(pop.getByRole('columnheader', { name: 'Customer Name' })).toBeVisible();
  await page.keyboard.type('dargai');
  await expect(pop.getByRole('row', { selected: true })).toContainText('Zaman Kiryana Dargai');
  await page.keyboard.press('Enter');
  await expect(pop).toHaveCount(0);
  await expect(v.getByLabel('Debit', { exact: true })).toBeFocused();
  await page.keyboard.type('500');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // no narration
  await expect(lines).toHaveCount(2);

  // Typing a name in Title opens the same popup with what was typed; a double-click picks.
  await page.keyboard.press('Tab');
  await expect(v.getByLabel('Title', { exact: true })).toBeFocused();
  await page.keyboard.type('Dal');
  await expect(pop).toBeVisible();
  await expect(pop.getByLabel('Search by title')).toHaveValue('Dal');
  await pop.getByRole('row').filter({ hasText: 'Dalda Foods' }).dblclick();
  await expect(pop).toHaveCount(0);
  await expect(v.getByLabel('Title', { exact: true })).toHaveValue('Dalda Foods');
  await expect(v.getByLabel('Debit', { exact: true })).toBeFocused();
  await page.keyboard.type('99');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(lines).toHaveCount(3);

  // Delete key on a grid line removes it.
  await lines.nth(2).focus();
  await page.keyboard.press('Delete');
  await expect(lines).toHaveCount(2);
  await expect(v.getByTestId('voucher-total-debit')).toHaveText('1,750,500.00');
  await expect(v.getByTestId('voucher-money-side')).toContainText('Cr Rs. 1,750,500');

  // Print Voucher ticked, Save (keyboard): printed, then a new blank voucher.
  await v.getByLabel('Print Voucher').focus();
  await page.keyboard.press('Space');
  await v.getByRole('button', { name: 'Save', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('printed-voucher')).toHaveCount(1);
  await expect(page.getByTestId('printed-voucher')).toContainText('BAHL- RAHMAT ALI PESHAWAR');
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(v.getByTestId('voucher-number')).toHaveValue('CPV-2');
  // Print Voucher stays ticked for the next voucher, as in the old program; untick it.
  await expect(v.getByLabel('Print Voucher')).toBeChecked();
  await v.getByLabel('Print Voucher').uncheck();
  await expect(lines).toHaveCount(0);
  await expect(v.getByRole('status').first()).toContainText('Voucher CPV-1 saved');

  // Search: open CPV 1 by its number, change a line, Save keeps the number.
  await v.getByRole('button', { name: 'Search', exact: true }).click();
  const find = page.getByRole('dialog', { name: 'Search Voucher' });
  await find.getByLabel('Voucher #').fill('1');
  await find.getByLabel('Voucher #').press('Enter');
  await expect(find).toHaveCount(0);
  await expect(v.getByTestId('voucher-number')).toHaveValue('CPV-1');
  await expect(lines).toHaveCount(2);
  await lines.first().click();
  await expect(v.getByLabel('Debit', { exact: true })).toBeFocused();
  await v.getByLabel('Debit', { exact: true }).fill('1760000');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(lines.first()).toContainText('1,760,000.00');
  await v.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(v.getByRole('status').first()).toContainText('Voucher CPV-1 saved');
  await expect(v.getByTestId('voucher-number')).toHaveValue('CPV-2');

  // Delete: open it again and delete it.
  await v.getByRole('button', { name: 'Search', exact: true }).click();
  await find.getByLabel('Voucher #').fill('CPV-1');
  await find.getByLabel('Voucher #').press('Enter');
  await v.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete voucher' }).click();
  await expect(v.getByRole('status').first()).toContainText('CPV-1 deleted');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  // Cancel on a blank voucher closes the screen.
  await v.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(v).toHaveCount(0);
});

test('CRV: customers credited by code with bill-number narrations; totals', async ({ page }) => {
  await open(page);
  await openMenuOption(page, 'Accounts', 'CRV — Cash receipt voucher');
  const v = page.getByRole('dialog', { name: VOUCHER_TITLE.CRV });
  await voucherLine(page, v, '141274', { credit: '120000' }, 'Bill # 1203');
  await voucherLine(page, v, '141275', { credit: '38632350' }, 'Bill # 1204');
  await expect(v.getByTestId('voucher-total-credit')).toHaveText('38,752,350.00');
  await expect(v.getByTestId('voucher-money-side')).toContainText('Dr Rs. 38,752,350');
  await v.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(v.getByTestId('voucher-number')).toHaveValue('CRV-2');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('voucher-row').filter({ hasText: 'CRV-1' })).toContainText('Rs. 38,752,350');
});

test('Coding menu: the old program’s ten items in order, each opens a working screen', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const coding = NAV_GROUPS.find((g) => g.id === 'coding')!.sections[0].entries;
  await page.getByRole('menubar', { name: 'Menu bar' }).getByRole('menuitem', { name: 'Coding', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Coding' });
  const items = await menu.getByRole('menuitem').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  // The first ten items read exactly as the old Coding menu.
  expect(items.slice(0, 10)).toEqual(coding.map((e) => e.label));
  await page.keyboard.press('Escape');

  for (const e of coding) {
    await openMenuOption(page, 'Coding', e.label);
    const c = navCheck(e);
    if (c.heading) await expect(page.getByRole('heading', { level: 1, name: c.heading, exact: true }).first(), e.label).toBeVisible();
    if (c.tab) await expect(page.getByRole('tab', { name: c.tab, exact: true }), e.label).toHaveAttribute('aria-selected', 'true');
    if (c.pressed) await expect(page.getByRole('button', { name: c.pressed, pressed: true }).first(), e.label).toBeVisible();
    if (c.dialog) {
      await expect(page.getByRole('dialog', { name: c.dialog }), e.label).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  }
});

test('Accounts Opening Balances and Opening Stocks post; unit list feeds items', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  // Accounts Opening Balances: a customer owes 25,000, we owe the supplier 90,000; Enter moves down.
  await openMenuOption(page, 'Coding', 'Accounts Opening Balances');
  const ob = page.getByTestId('opening-balances');
  await ob.getByLabel('Zaman Kiryana Dargai debit opening').fill('25000');
  await ob.getByLabel('MG EDIBLE OIL AND GHEE (PVT) LTD credit opening').fill('90000');
  await expect(ob.getByTestId('opening-total-debit')).toHaveText('Rs. 6,025,000');
  await expect(ob.getByTestId('opening-total-credit')).toHaveText('Rs. 90,000');
  await ob.getByRole('button', { name: 'Save opening balances' }).click();
  await expect(page.getByRole('status').first()).toContainText('Opening balances saved (2 accounts)');
  await expect(ob.getByTestId('opening-equity')).toContainText('Cr Rs. 5,935,000');

  // Opening Stocks: 100 tins at 5,600.
  await page.getByRole('tab', { name: 'Opening Stocks', exact: true }).click();
  const os = page.getByTestId('opening-stock');
  await os.getByLabel('Dalda 16 L Tin opening qty').fill('100');
  await os.getByLabel('Dalda 16 L Tin rate').fill('5600');
  await expect(os.getByTestId('opening-stock-total')).toHaveText('Rs. 560,000');
  await os.getByRole('button', { name: 'Save opening stock' }).click();
  await expect(page.getByRole('status').first()).toContainText('Opening stock saved (1 item)');
  await expect(os.getByTestId('opening-stock-row').first()).toContainText('100');

  // Product Unit Coding: add "ctn 12" and it is offered on the item form.
  await page.getByRole('tab', { name: 'Product Unit Coding', exact: true }).click();
  await page.getByLabel('New unit').fill('ctn 12');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('coding-list-unit')).toContainText('ctn 12');

  // The books still balance with the opening stock in them.
  await goTo(page, 'Accounts');
  await page.getByRole('tab', { name: 'Trial balance', exact: true }).click();
  await expect(page.getByText('Balanced ✓').first()).toBeVisible();
});
