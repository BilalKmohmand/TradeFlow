import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';

/**
 * Navigation like Apna Accountant, in our own style: the five menus (Coding · Invoice · Accounts · Reports ·
 * System) in a desktop top bar, "Find anything" (/ or Ctrl+K), the breadcrumb, and the phone More sheet.
 */
const SHOTS = 'e2e/screenshots/navigation';
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const seed = () => {
  if (localStorage.getItem('e2e_nav_seeded')) return;
  localStorage.setItem('e2e_nav_seeded', '1');
  const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 20000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', code: 'C-0001', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 14000, creditLimit: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', code: 'S-0001', name: 'Ahmed', company: 'Dalda Foods', phone: '0300 1234567', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', code: '101', name: '16 L Tin Dalda', category: 'Oil', unit: 'tin', unitPricePerKg: 7000, costPricePerKg: 6000, stockKg: 20, minThresholdKg: 5 },
    { id: 'p2', code: '102', name: '5 L Can Habib', category: 'Oil', unit: 'can', packName: 'carton', packSize: 4, unitPricePerKg: 2400, costPricePerKg: 2000, stockKg: 8, minThresholdKg: 10 },
  ]);
  set('tradeflow_invoices_v1', [{
    id: 'inv-77', invoiceNumber: 'INV-77', memoNo: 'M-5501', customerId: 'c1', customerName: 'Zaman and Co BTK', issueDate: iso(3), dueDate: iso(3), status: 'issued', paymentStatus: 'unpaid',
    items: [{ id: 'bi-1', productId: 'p1', productName: '16 L Tin Dalda', kg: 2, ratePerKg: 7000, amount: 14000, qty: 2, unitPrice: 7000, unit: 'tin' }],
    subtotal: 14000, taxRatePct: 0, taxAmount: 0, totalAmount: 14000, paidAmount: 0, balanceDue: 14000, createdAt: iso(3), billKind: 'credit', paymentMethod: 'Credit',
  }]);
  set('tradeflow_ledger_v2', [{ id: 'g1', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV-77', sourceId: 'inv-77', date: iso(3), description: 'Bill INV-77', debit: 14000, credit: 0, balanceAfter: 14000 }]);
  ['tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2'].forEach((k) => localStorage.setItem(k, '[]'));
};
void day;

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

async function noSideScroll(page: Page, label: string) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(r.sw, `${label}: page is wider than the screen`).toBeLessThanOrEqual(r.w);
}

const menubar = (page: Page) => page.getByRole('menubar', { name: 'Menu bar' });
const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true });
const crumb = (page: Page) => page.getByTestId('breadcrumb');

test.describe('Desktop top menu bar', () => {
  test('each of the five menus opens and one option in each works; the breadcrumb follows', async ({ page }) => {
    await open(page);
    await expect(menubar(page).getByRole('menuitem')).toHaveCount(5);
    await expect(menubar(page).getByRole('menuitem')).toHaveText(['Coding', 'Invoice', 'Accounts', 'Reports', 'System']);
    await expect(crumb(page)).toHaveText('Home');

    const pick = async (group: string, option: string, shot?: string) => {
      await menubar(page).getByRole('menuitem', { name: group, exact: true }).click();
      const menu = page.getByRole('menu', { name: group });
      await expect(menu).toBeVisible();
      await expect(menubar(page).getByRole('menuitem', { name: group, exact: true })).toHaveAttribute('aria-expanded', 'true');
      if (shot) { await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${shot}.png` }); }
      await menu.getByRole('menuitem', { name: option, exact: true }).click();
      await expect(menu).toBeHidden();
    };

    // Coding › Chart of accounts
    await pick('Coding', 'Chart of accounts', 'desktop-coding');
    await expect(page.getByRole('tab', { name: 'Chart of accounts', selected: true })).toBeVisible();
    await expect(crumb(page)).toHaveText(/Coding\s*Chart of accounts/);

    // Invoice › Sale Invoice › Sale Invoice
    await pick('Invoice', 'Sale Invoice', 'desktop-invoice');
    await expect(page.getByRole('dialog', { name: 'New Bill' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'New Bill' })).toBeHidden();

    // Accounts › CPV opens a new cash payment voucher
    await pick('Accounts', 'CPV — Cash payment voucher', 'desktop-accounts');
    await expect(page.getByRole('tab', { name: 'Vouchers', selected: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /Cash payment voucher/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(crumb(page)).toHaveText(/Accounts\s*Vouchers/);

    // Reports › Stock Reports › Stock In Hand
    await pick('Reports', 'Stock In Hand', 'desktop-reports');
    await expect(h1(page, 'Stock In Hand')).toBeVisible();
    await expect(page.getByTestId('report-table')).toContainText('16 L Tin Dalda');
    await expect(crumb(page)).toHaveText(/Reports\s*Stock In Hand/);

    // System › Document numbers (Admin → Rules, numbers & branches, scrolled to the card)
    await pick('System', 'Document numbers', 'desktop-system');
    await expect(page.getByRole('heading', { name: 'Administrator Control Center' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Document numbers/ })).toBeInViewport();
    await expect(crumb(page)).toHaveText(/System\s*Document numbers/);

    // Menus only show what the user may open; the Reports panel holds the hub's sections and sub-menus.
    await menubar(page).getByRole('menuitem', { name: 'Reports', exact: true }).click();
    const rep = page.getByRole('menu', { name: 'Reports' });
    for (const g of ['Dashboards & business', 'Accounts Reports', 'Inventory Reports', 'Pending Delivery']) await expect(rep.getByRole('group', { name: g }).first()).toBeVisible();
    await expect(rep.getByText('Party Reports ›')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(rep).toBeHidden();
    await noSideScroll(page, 'desktop menus');
  });

  test('keyboard: Alt+letter, arrows, Enter and Esc', async ({ page }) => {
    await open(page);
    // Alt+A opens Accounts with the first option focused.
    await page.keyboard.press('Alt+KeyA');
    const acc = page.getByRole('menu', { name: 'Accounts' });
    await expect(acc).toBeVisible();
    await expect(acc.getByRole('menuitem').first()).toBeFocused();
    await expect(acc.getByRole('menuitem', { name: 'Vouchers', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(acc.getByRole('menuitem', { name: 'CPV — Cash payment voucher' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(acc.getByRole('menuitem').last()).toBeFocused();
    // Right arrow moves to the next menu (Reports), Left back; Esc closes and returns focus to the bar.
    await page.keyboard.press('ArrowRight');
    const rep = page.getByRole('menu', { name: 'Reports' });
    await expect(rep).toBeVisible();
    await expect(acc).toBeHidden();
    await expect(rep.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(acc).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(acc).toBeHidden();
    await expect(menubar(page).getByRole('menuitem', { name: 'Accounts', exact: true })).toBeFocused();
    // On the bar: ArrowRight to Reports, ArrowDown opens it, type "t" jumps to an option starting with T.
    await page.keyboard.press('ArrowRight');
    await expect(menubar(page).getByRole('menuitem', { name: 'Reports', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rep).toBeVisible();
    await page.keyboard.press('t');
    await expect(rep.getByRole('menuitem', { name: 'Trial Balance', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(h1(page, 'Trial Balance')).toBeVisible();
    // Alt+I, then Enter on the focused first option (Purchase Invoice › Purchase Invoice, as in the old program).
    await page.keyboard.press('Alt+KeyI');
    await expect(page.getByRole('menu', { name: 'Invoice' }).getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Purchase Invoice' })).toBeVisible();
    await page.keyboard.press('Escape');
    // Alt+letter does nothing while a dialog is open.
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Find anything' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Find anything: "/" focuses it; finds and opens options, customers, suppliers, items, bills', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: 'Find anything' })).toBeVisible();
    const box = page.getByRole('dialog', { name: 'Find anything' });
    const input = box.getByRole('combobox', { name: 'Search' });
    const find = async (q: string, shot?: string) => {
      await expect(page.getByRole('dialog')).toHaveCount(0); // the last dialog has finished closing
      await page.keyboard.press('/');
      await expect(input).toBeFocused();
      await input.fill(q);
      if (shot) { await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/${shot}.png` }); }
    };

    // 1. Roman Urdu → Receivable report (grouped under Menu options)
    await find('udhaar', 'search-udhaar');
    await expect(box.getByTestId('find-section-options')).toContainText('Receivable');
    await expect(box.getByTestId('find-section-options')).toContainText('Who owes for how long');
    await box.getByRole('option', { name: /^Receivable Reports › Accounts Reports/ }).click();
    await expect(box).toBeHidden();
    await expect(h1(page, 'Receivable')).toBeVisible();

    // 2. "CPV" + Enter → a new cash payment voucher
    await find('CPV');
    await expect(box.getByRole('option').first()).toContainText('CPV — Cash payment voucher');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /Cash payment voucher/i })).toBeVisible();
    await page.keyboard.press('Escape');

    // 3. A customer
    await find('zaman');
    await expect(box.getByTestId('find-section-customers')).toContainText('Zaman and Co BTK');
    await box.getByTestId('find-section-customers').getByRole('option').first().click();
    await expect(page.getByRole('dialog', { name: 'Zaman and Co BTK' })).toBeVisible();
    await page.keyboard.press('Escape');

    // 4. A bill by memo number
    await find('M-5501', 'search-bill');
    await expect(box.getByTestId('find-section-bills')).toContainText('INV-77');
    await box.getByTestId('find-section-bills').getByRole('option').first().click();
    await expect(page.getByRole('dialog', { name: 'Bill INV-77' })).toBeVisible();
    await page.keyboard.press('Escape');

    // 5. An item (arrow keys down to it) → stock history
    await find('habib');
    await expect(box.getByTestId('find-section-items')).toContainText('5 L Can Habib');
    await box.getByTestId('find-section-items').getByRole('option').first().click();
    await expect(page.getByRole('dialog', { name: /5 L Can Habib/ })).toBeVisible();
    await page.keyboard.press('Escape');

    // 6. A supplier
    await find('dalda foods');
    await box.getByTestId('find-section-suppliers').getByRole('option').first().click();
    await expect(page.getByRole('dialog', { name: 'Dalda Foods' })).toBeVisible();
    await page.keyboard.press('Escape');

    // 7. "ledger" → Account ledger first; arrows + Enter
    await find('ledger');
    await expect(box.getByRole('option').first()).toContainText('Account ledger');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'Account ledger', selected: true })).toBeVisible();
    await expect(crumb(page)).toHaveText(/Accounts\s*Account ledger/);

    // "/" inside a text field types a slash, it does not open the search.
    await page.getByRole('tab', { name: 'Journal' }).click();
    const s = page.getByLabel('Search', { exact: true });
    await s.fill('a/b');
    await expect(s).toHaveValue('a/b');
    await expect(box).toBeHidden();
  });
});

test.describe('Phone More sheet', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('five collapsible groups, search at the top, no sideways scroll', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('menubar')).toHaveCount(0);
    await expect(crumb(page)).toHaveText('Home');
    await noSideScroll(page, 'phone home');
    const bar = page.getByRole('navigation', { name: 'Main' });
    await bar.getByRole('button', { name: 'More', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet).toBeVisible();
    const search = sheet.getByRole('searchbox', { name: 'Find anything' });
    await expect(search).toBeVisible();
    await expect(search).not.toBeFocused(); // no keyboard popping up just for opening More
    for (const g of ['coding', 'invoice', 'accounts', 'reports', 'system']) await expect(sheet.getByTestId(`more-group-${g}`)).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/phone-more.png` });
    await noSideScroll(page, 'More sheet');

    // Open Accounts, pick Cheques.
    await sheet.getByTestId('more-group-accounts').click();
    await expect(sheet.getByTestId('more-group-accounts')).toHaveAttribute('aria-expanded', 'true');
    const accounts = sheet.getByRole('group', { name: 'Accounts' });
    await expect(accounts.getByRole('button', { name: 'Receive payment', exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/phone-more-accounts.png` });
    await noSideScroll(page, 'More sheet, Accounts open');
    await accounts.getByRole('button', { name: 'Cheques', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(h1(page, 'Money')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cheques', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(crumb(page)).toHaveText(/Accounts\s*Cheques/);
    await noSideScroll(page, 'Money cheques');

    // Search inside the sheet.
    await bar.getByRole('button', { name: 'More', exact: true }).click();
    await sheet.getByRole('searchbox', { name: 'Find anything' }).fill('stock in hand');
    await expect(sheet.getByTestId('more-search-results')).toContainText('Stock In Hand');
    await expect(sheet.getByTestId('more-menus')).toHaveCount(0); // results replace the groups while searching
    await page.screenshot({ path: `${SHOTS}/phone-more-search.png` });
    await noSideScroll(page, 'More search');
    await sheet.getByRole('searchbox', { name: 'Find anything' }).press('Enter');
    await expect(sheet).toBeHidden();
    await expect(h1(page, 'Stock In Hand')).toBeVisible();
    await noSideScroll(page, 'Stock In Hand');

    // The breadcrumb's group opens the sheet on that group.
    await crumb(page).getByRole('button', { name: 'Open the Reports menu' }).click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('more-group-reports')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
  });
});
