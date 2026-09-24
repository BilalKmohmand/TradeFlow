import { test, expect, Page } from '@playwright/test';
import { signIn, OWNER } from './helpers/login';
import { openMenuOption } from './helpers/nav';
import { VOUCHER_TITLE, voucherLine } from './helpers/voucher';
import { NAV_GROUPS, NavEntry, navCheck } from '../src/utils/navMap';

/**
 * EVERY option of the five menus, generated from the nav map itself (a new entry is tested automatically):
 * open it, check that exactly what the map says is visible (heading / tab / toggle / dialog / card), check that
 * nothing threw and nothing was logged as an error, then close whatever it opened. Signed in as the owner
 * (super admin), with a realistic shop: customers, suppliers, items in two godowns, bills, a bank account,
 * a voucher and a cheque. Also: a sample of every group through "Find anything" and through the phone More
 * sheet at 390px.
 */
const today = () => new Date().toISOString().slice(0, 10);

const seed = () => {
  if (localStorage.getItem('e2e_every_seeded')) return;
  localStorage.setItem('e2e_every_seeded', '1');
  const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil & Ghee Traders', companyAddress: 'Batkhela', cashOpeningBalance: 50000, openingBankBalance: 200000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: 'C-0001', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', city: 'Batkhela', totalDue: 28000, creditLimit: 100000, createdAt: '2026-01-01' },
    { id: 'c2', code: 'C-0002', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: 'Mingora', city: 'Mingora', totalDue: 9600, creditLimit: 0, createdAt: '2026-01-01' },
    { id: 'c3', code: 'C-0003', name: 'Shah Jee Kiryana', company: 'Shah Jee', phone: '03111222333', email: '', address: 'Thana', city: 'Thana', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', [
    { id: 's1', code: 'S-0001', name: 'Ahmed', company: 'Dalda Foods', phone: '0300 1234567', email: '', materialCategory: 'Oil', address: 'Karachi', city: 'Karachi', totalOwed: 0, createdAt: '2026-01-01' },
    { id: 's2', code: 'S-0002', name: 'Imran', company: 'Habib Oil Mills', phone: '0321 7654321', email: '', materialCategory: 'Oil', address: 'Karachi', city: 'Karachi', totalOwed: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_products_v2', [
    { id: 'p1', code: '101', name: '16 L Tin Dalda', category: 'Ghee', brand: 'Dalda', unit: 'tin', unitPricePerKg: 7000, costPricePerKg: 6000, stockKg: 40, minThresholdKg: 5 },
    { id: 'p2', code: '102', name: '5 L Can Habib', category: 'Oil', brand: 'Habib', unit: 'can', packName: 'carton', packSize: 4, unitPricePerKg: 2400, costPricePerKg: 2000, stockKg: 8, minThresholdKg: 10 },
    { id: 'p3', code: '103', name: 'Salt 1 kg', category: 'General', unit: 'pcs', unitPricePerKg: 60, costPricePerKg: 45, stockKg: 200, minThresholdKg: 20 },
  ]);
  set('tradeflow_godowns_v1', [
    { id: 'g-main', name: 'Main shop', isDefault: true, createdAt: '2026-01-01' },
    { id: 'g-back', name: 'Back godown', isDefault: false, createdAt: '2026-01-01' },
  ]);
  const bill = (id: string, no: string, c: { id: string; name: string }, days: number, lines: [string, string, number, number, string][]) => {
    const items = lines.map(([pid, name, qty, rate, unit], i) => ({ id: `${id}-${i}`, productId: pid, productName: name, kg: qty, ratePerKg: rate, amount: qty * rate, qty, unitPrice: rate, unit }));
    const total = items.reduce((a, x) => a + x.amount, 0);
    return { id, invoiceNumber: no, memoNo: `M-${no.slice(4)}`, customerId: c.id, customerName: c.name, issueDate: iso(days), dueDate: iso(days), status: 'issued', paymentStatus: 'unpaid', items, subtotal: total, taxRatePct: 0, taxAmount: 0, totalAmount: total, paidAmount: 0, balanceDue: total, createdAt: iso(days), billKind: 'credit', paymentMethod: 'Credit' };
  };
  const bills = [
    bill('inv-1', 'INV-1', { id: 'c1', name: 'Zaman and Co BTK' }, 40, [['p1', '16 L Tin Dalda', 4, 7000, 'tin']]),
    bill('inv-2', 'INV-2', { id: 'c2', name: 'Haji Karim' }, 5, [['p2', '5 L Can Habib', 4, 2400, 'can']]),
  ];
  set('tradeflow_invoices_v1', bills);
  set('tradeflow_ledger_v2', bills.map((b, i) => ({ id: `l${i}`, entityType: 'customer', entityId: b.customerId, type: 'bill_issued', referenceId: b.invoiceNumber, sourceId: b.id, date: b.issueDate, description: `Bill ${b.invoiceNumber}`, debit: b.totalAmount, credit: 0, balanceAfter: b.totalAmount })));
  ['tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2', 'tradeflow_journal_entries_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};

/** Page errors and console errors since the last reset. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return { take: () => errors.splice(0, errors.length) };
}

async function open(page: Page) {
  await page.addInitScript(seed);
  await signIn(page, OWNER); // the owner: super admin, every permission
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

/** A bank account, a cheque in hand and a cash payment voucher, made the way a user makes them. */
async function addBankChequeVoucher(page: Page) {
  const dialog = (name: string) => page.getByRole('dialog', { name });
  await openMenuOption(page, 'Coding', 'Bank accounts');
  await page.getByTestId('bank-accounts').getByRole('button', { name: 'Add bank account' }).click();
  const b = dialog('Add bank account');
  await b.getByLabel('Bank name').fill('HBL');
  await b.getByLabel('Account number (optional)').fill('0012345678');
  await b.getByLabel('Opening balance (Rs.)').fill('50000');
  await b.getByRole('button', { name: 'Add bank account' }).click();
  await expect(b).toHaveCount(0);

  await openMenuOption(page, 'Accounts', 'Receive payment');
  const rc = dialog('Receive payment');
  await rc.getByLabel('Customer').selectOption('c1');
  await rc.getByLabel('Amount (Rs.)').fill('10000');
  await rc.getByLabel('Method').selectOption('Cheque');
  await rc.getByLabel('Cheque no.').fill('100200');
  await rc.getByLabel('Bank', { exact: true }).fill('MCB');
  await rc.getByRole('button', { name: 'Receive' }).click();
  await expect(rc).toHaveCount(0);

  await openMenuOption(page, 'Accounts', 'CPV — Cash payment voucher');
  const v = dialog(VOUCHER_TITLE.CPV);
  await voucherLine(page, v, 'S-0001', { debit: '3000' }, 'Shop rent');
  await v.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(v.getByTestId('voucher-number')).toHaveValue('CPV-2'); // a new blank voucher
  await closeAll(page);
  await expect(page.getByTestId('voucher-row').filter({ hasText: 'CPV-1' })).toBeVisible();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Is exactly what the map promises on the screen? */
async function verify(page: Page, e: NavEntry) {
  const c = navCheck(e);
  const what = `${e.group} › ${e.label}`;
  if (c.special === 'tradingSuite') {
    await expect(page.getByRole('button', { name: 'Back to simple billing' }).first(), what).toBeVisible();
    await page.getByRole('button', { name: 'Back to simple billing' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Home' }), what).toBeVisible();
    return;
  }
  if (c.special === 'lock') {
    await expect(page.getByTestId('auth-gate'), what).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByTestId('auth-gate'), what).toHaveCount(0);
    return;
  }
  if (c.heading) await expect(page.getByRole('heading', { level: 1, name: c.heading, exact: true }).first(), `${what}: heading ${c.heading}`).toBeVisible();
  if (c.dialog) await expect(page.getByRole('dialog', { name: c.dialog, exact: true }), `${what}: dialog ${c.dialog}`).toBeVisible();
  if (c.tab) await expect(page.getByRole('tab', { name: new RegExp(`^${esc(c.tab)}`), selected: true }), `${what}: tab ${c.tab}`).toBeVisible();
  if (c.pressed) await expect(page.getByRole('button', { name: new RegExp(`^${esc(c.pressed)}`), pressed: true }).first(), `${what}: ${c.pressed} pressed`).toBeVisible();
  if (c.anchor) await expect(page.locator(`[data-nav-anchor="${c.anchor}"]`), `${what}: card ${c.anchor}`).toBeInViewport();
}

/** Close every dialog it opened (a dialog can open a second one, e.g. a voucher view). */
async function closeAll(page: Page) {
  for (let i = 0; i < 4 && (await page.getByRole('dialog').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const everyEntry = () => NAV_GROUPS.flatMap((g) => g.sections.flatMap((s) => s.entries));

test.describe('Every nav-map entry through the desktop top menu', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const g of NAV_GROUPS) {
    const entries = g.sections.flatMap((s) => s.entries);
    test(`${g.label}: all ${entries.length} options open what they promise`, async ({ page }) => {
      test.setTimeout(240_000);
      const errs = watchErrors(page);
      await open(page);
      await addBankChequeVoucher(page);
      expect(errs.take(), 'setting up the shop').toEqual([]);
      const failed: string[] = [];
      for (const e of entries) {
        await test.step(`${g.label} › ${e.label}`, async () => {
          await openMenuOption(page, g.label, e.label);
          await verify(page, e);
          await page.waitForTimeout(150); // let effects run: a crash after first paint still counts
          const errors = errs.take();
          if (errors.length) failed.push(`${e.label}: ${errors.join(' | ')}`);
          await closeAll(page);
        });
      }
      expect(failed, 'options that logged an error').toEqual([]);
    });
  }
});

test.describe('Every group through "Find anything"', () => {
  test.use({ viewport: { width: 1360, height: 900 } });
  test('first, middle and last option of each menu, found by name and opened with Enter or a click', async ({ page }) => {
    test.setTimeout(180_000);
    const errs = watchErrors(page);
    await open(page);
    const box = page.getByRole('dialog', { name: 'Find anything' });
    const input = box.getByRole('combobox', { name: 'Search' });
    for (const g of NAV_GROUPS) {
      const all = g.sections.flatMap((s) => s.entries).filter((e) => !navCheck(e).special);
      const picks = [...new Set([all[0], all[Math.floor(all.length / 2)], all[all.length - 1]])];
      for (const e of picks) {
        await test.step(`search ${e.label}`, async () => {
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await page.keyboard.press('/');
          await expect(input).toBeFocused();
          await input.fill(e.label);
          const option = box.getByTestId('find-section-options').getByRole('option', { name: new RegExp(`^${esc(e.label)} ${esc(g.label)} ›`) }).first();
          await expect(option, `${g.label} › ${e.label} is found`).toBeVisible();
          await option.click();
          await expect(box).toBeHidden();
          await verify(page, e);
          expect(errs.take(), e.label).toEqual([]);
          await closeAll(page);
        });
      }
    }
  });
});

test.describe('Every group through the phone More sheet', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('first and last option of each group, and one found by the sheet’s search; nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(180_000);
    const errs = watchErrors(page);
    await open(page);
    const bar = page.getByRole('navigation', { name: 'Main' });
    const sheet = page.getByRole('dialog', { name: 'More' });
    const noSideScroll = async (label: string) => {
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
      expect(r.sw, `${label}: page is wider than the screen`).toBeLessThanOrEqual(r.w);
    };
    for (const g of NAV_GROUPS) {
      const all = g.sections.flatMap((s) => s.entries).filter((e) => !navCheck(e).special);
      for (const e of [all[0], all[all.length - 1]]) {
        await test.step(`${g.label} › ${e.label}`, async () => {
          await bar.getByRole('button', { name: 'More', exact: true }).click();
          await expect(sheet).toBeVisible();
          await sheet.getByTestId(`more-group-${g.id}`).click();
          const group = sheet.getByRole('group', { name: g.label });
          await noSideScroll(`More › ${g.label}`);
          await group.getByRole('button', { name: e.label, exact: true }).first().click();
          await expect(sheet).toBeHidden();
          await verify(page, e);
          await noSideScroll(`${g.label} › ${e.label}`);
          expect(errs.take(), e.label).toEqual([]);
          await closeAll(page);
        });
      }
      // The sheet's search finds the middle one.
      const mid = all[Math.floor(all.length / 2)];
      await test.step(`search ${mid.label}`, async () => {
        await bar.getByRole('button', { name: 'More', exact: true }).click();
        await sheet.getByRole('searchbox', { name: 'Find anything' }).fill(mid.label);
        const option = sheet.getByTestId('more-search-results').getByRole('option', { name: new RegExp(`^${esc(mid.label)} ${esc(g.label)} ›`) }).first();
        await expect(option).toBeVisible();
        await option.click();
        await expect(sheet).toBeHidden();
        await verify(page, mid);
        expect(errs.take(), mid.label).toEqual([]);
        await closeAll(page);
      });
    }
    expect(everyEntry().length).toBeGreaterThan(100);
    void today;
  });
});
