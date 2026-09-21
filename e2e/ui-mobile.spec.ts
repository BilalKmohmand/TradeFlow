import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';

/**
 * Visual / layout check of every billing screen and its main dialog:
 * phones (390×844, 360×740) through the bottom tab bar and the "More" sheet,
 * desktop (1360×900) through the sidebar, in light and dark mode.
 * Screenshots land in test-results/ui/ for a human (or agent) to look at.
 */
const SHOTS = 'test-results/ui';

/** A small but lived-in oil & ghee shop: bills this week, dues, a credit limit, low stock, expenses. */
const seedShop = (dark: boolean) => {
  if (localStorage.getItem('e2e_ui_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_ui_seeded', '1');
  localStorage.setItem('tradeflow_theme_mode_v1', dark ? 'dark' : 'light');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().split('T')[0];
  const today = day(0);
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Amandarra, Alladand Road', companyPhone: '3410550055', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: 'C-101', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 65350, creditLimit: 100000, createdAt: day(120) },
    { id: 'c2', name: 'Old Khan Store', company: 'Old Khan Store', phone: '03001112223', email: '', address: 'Swat', totalDue: 13070, creditLimit: 0, createdAt: day(120) },
    { id: 'c3', name: 'Haji Karim General Store Mingora', company: 'Karim Store', phone: '03001234567', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: day(30) },
    { id: 'c4', name: 'Advance Traders', company: 'Advance Traders', phone: '03111234567', email: '', address: '', totalDue: -2500, creditLimit: 50000, createdAt: day(30) },
  ]);
  set('tradeflow_suppliers_v2', [
    { id: 's1', code: 'S-1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 240000, createdAt: day(120) },
    { id: 's2', name: 'Imran', company: 'Sufi Ghee Mills', phone: '03009998887', email: '', materialCategory: 'Ghee', address: 'Lahore', totalOwed: 0, createdAt: day(60) },
  ]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, costPricePerKg: 1900, stockKg: 800, minThresholdKg: 50 },
    { id: 'p2', name: '2.5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 1037.5, costPricePerKg: 960, stockKg: 600, minThresholdKg: 50 },
    { id: 'p3', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, costPricePerKg: 6000, stockKg: 28, minThresholdKg: 50 },
  ]);
  set('tradeflow_purchases_v2', [{ id: 'pur1', receiptNumber: 'GRN-2026-101', supplierId: 's1', productId: 'p3', kg: 40, pricePerKg: 6000, amount: 240000, date: day(80), createdAt: day(80) }]);
  const line = (id: string, pid: string, name: string, unit: string, qty: number, price: number) => ({ id, productId: pid, productName: name, kg: qty, qty, ratePerKg: price, unitPrice: price, unit, costPricePerKg: price * 0.92, amount: qty * price });
  const bill = (id: string, no: string, cust: string, name: string, date: string, lines: ReturnType<typeof line>[], paid: number) => {
    const total = lines.reduce((a, l) => a + l.amount, 0);
    return {
      id, invoiceNumber: no, customerId: cust, customerName: name, issueDate: date, dueDate: date, status: 'issued', paymentStatus: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid', items: lines,
      subtotal: total, taxRatePct: 0, taxAmount: 0, discount: 0, totalAmount: total, paidAmount: paid, balanceDue: total - paid, payments: [], createdAt: date, billKind: paid >= total ? 'cash' : 'credit', paymentMethod: paid > 0 ? 'Cash' : 'Credit',
    };
  };
  set('tradeflow_invoices_v1', [
    bill('inv1', 'INV-1', 'c2', 'Old Khan Store', day(75), [line('l1', 'p3', '15.7 kgs Tin', 'tin', 2, 6535)], 0),
    bill('inv2', 'INV-2', 'c1', 'Zaman and Co BTK', today, [line('l2', 'p3', '15.7 kgs Tin', 'tin', 10, 6535)], 0),
    bill('inv3', 'INV-3', 'c3', 'Haji Karim General Store Mingora', today, [line('l3', 'p1', '5 kgs Can', 'can', 4, 2065), line('l4', 'p2', '2.5 kgs Can', 'can', 3, 1037.5)], 11372.5),
  ]);
  set('tradeflow_ledger_v2', [
    { id: 'g0', entityType: 'supplier', entityId: 's1', type: 'purchase_received', referenceId: 'GRN-2026-101', date: day(80), description: 'Stock received GRN-2026-101', debit: 240000, credit: 0, balanceAfter: 240000, kg: 40 },
    { id: 'g1', entityType: 'customer', entityId: 'c2', type: 'bill_issued', referenceId: 'INV-1', sourceId: 'inv1', date: day(75), description: 'Bill INV-1', debit: 13070, credit: 0, balanceAfter: 13070 },
    { id: 'g2', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV-2', sourceId: 'inv2', date: today, description: 'Bill INV-2', debit: 65350, credit: 0, balanceAfter: 65350 },
  ]);
  set('tradeflow_expenses_v2', [
    { id: 'e1', date: today, category: 'transport', description: 'Rickshaw to Mingora', amount: 800, paidVia: 'Cash', createdAt: today },
    { id: 'e2', date: today, category: 'food', description: 'Tea for staff', amount: 250, paidVia: 'Cash', createdAt: today },
  ]);
  set('tradeflow_cash_entries_v2', []);
};

type Screen = { name: string; heading: RegExp; dialog?: { open: string; title: string; before?: (page: Page) => Promise<void> } };
const SCREENS: Screen[] = [
  { name: 'Home', heading: /^Home$/, dialog: { open: 'New Bill', title: 'New Bill' } },
  { name: 'Bills', heading: /^Bills$/, dialog: { open: 'New Bill', title: 'New Bill' } },
  { name: 'Money', heading: /^Money$/, dialog: { open: 'Receive payment', title: 'Receive payment' } },
  { name: 'Daily Sheet', heading: /^Daily Sheet$/, dialog: { open: 'Add expense', title: 'Add expense' } },
  { name: 'Customers', heading: /^Customers$/, dialog: { open: 'Add customer', title: 'New customer' } },
  { name: 'Suppliers', heading: /^Suppliers$/, dialog: { open: 'Add supplier', title: 'New supplier' } },
  { name: 'Items & Prices', heading: /^Items/, dialog: { open: 'Receive stock', title: 'Receive stock' } },
  { name: 'Accounts', heading: /^Accounts$/ },
  { name: 'Admin', heading: /Control Center/ },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

async function noSideScroll(page: Page, label: string) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(r.sw, `${label}: page is wider than the screen`).toBeLessThanOrEqual(r.w);
}

async function barDoesNotCoverContent(page: Page, label: string) {
  const bar = page.getByRole('navigation', { name: 'Main' });
  await expect(bar, `${label}: bottom bar visible`).toBeVisible();
  const r = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const content = document.querySelector('main > div') as HTMLElement;
    const nav = document.querySelector('nav[aria-label="Main"]') as HTMLElement;
    return { contentBottom: content.getBoundingClientRect().bottom, barTop: nav.getBoundingClientRect().top, vh: window.innerHeight, barBottom: nav.getBoundingClientRect().bottom };
  });
  expect(r.contentBottom, `${label}: last content hides behind the bottom bar`).toBeLessThanOrEqual(r.barTop + 1);
  expect(Math.round(r.barBottom), `${label}: bottom bar sits at the bottom edge`).toBe(r.vh);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function dialogChecks(page: Page, title: string, label: string, phone: boolean) {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300);
  await noSideScroll(page, `${label} dialog`);
  if (phone) {
    // No iOS zoom-on-focus: every field is at least 16px.
    const small = await dialog.evaluate((d) =>
      Array.from(d.querySelectorAll('input:not([type=checkbox]):not([type=radio]),select,textarea'))
        .filter((el) => (el as HTMLElement).offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => (el as HTMLElement).getAttribute('aria-label') || (el as HTMLElement).id || el.tagName)
    );
    expect(small, `${label}: fields smaller than 16px`).toEqual([]);
    // Dialog sits at the bottom as a sheet, and its footer is on screen.
    const box = await dialog.boundingBox();
    const vh = page.viewportSize()!.height;
    expect(Math.round(box!.y + box!.height), `${label}: dialog is a bottom sheet`).toBeGreaterThanOrEqual(vh - 1);
  }
}

for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
  test.describe(`Billing UI on a ${vp.width}px phone`, () => {
    test.use({ viewport: vp, isMobile: true, hasTouch: true });

    for (const dark of [false, true]) {
      if (dark && vp.width !== 390) continue;
      const mode = dark ? 'dark' : 'light';
      test(`every screen and main dialog fit (${mode})`, async ({ page }) => {
        page.on('pageerror', (e) => { throw e; });
        await page.addInitScript(seedShop, dark);
        await signIn(page);
        await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

        for (const s of SCREENS) {
          const label = `${vp.width} ${mode} ${s.name}`;
          await goTo(page, s.name);
          await expect(page.getByRole('heading', { level: 1, name: s.heading })).toBeVisible();
          await page.waitForTimeout(350);
          await noSideScroll(page, label);
          await barDoesNotCoverContent(page, label);
          await page.screenshot({ path: `${SHOTS}/phone-${vp.width}-${mode}-${slug(s.name)}.png`, fullPage: true });
          if (s.dialog) {
            await page.getByRole('main').getByRole('button', { name: s.dialog.open, exact: true }).first().click();
            await dialogChecks(page, s.dialog.title, label, true);
            await page.screenshot({ path: `${SHOTS}/phone-${vp.width}-${mode}-${slug(s.name)}-dialog.png` });
            await page.keyboard.press('Escape');
            await expect(page.getByRole('dialog', { name: s.dialog.title })).toBeHidden();
          }
        }

        // The centre "New bill" tab opens a bill from anywhere.
        await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New bill' }).click();
        await dialogChecks(page, 'New Bill', `${vp.width} ${mode} bottom-bar new bill`, true);
        await page.keyboard.press('Escape');

        // The More sheet itself.
        await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${SHOTS}/phone-${vp.width}-${mode}-more-sheet.png` });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'More' })).toBeHidden();

        // A customer card opens the customer sheet.
        await goTo(page, 'Customers');
        await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
        await expect(page.getByRole('dialog', { name: 'Zaman and Co BTK' })).toBeVisible();
        await page.waitForTimeout(300);
        await noSideScroll(page, 'customer sheet');
        await page.screenshot({ path: `${SHOTS}/phone-${vp.width}-${mode}-customer-sheet.png` });
      });
    }
  });
}

test.describe('Billing UI on desktop', () => {
  test.use({ viewport: { width: 1360, height: 900 } });
  for (const dark of [false, true]) {
    const mode = dark ? 'dark' : 'light';
    test(`every screen and main dialog (${mode})`, async ({ page }) => {
      page.on('pageerror', (e) => { throw e; });
      await page.addInitScript(seedShop, dark);
      await signIn(page);
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
      for (const s of SCREENS) {
        await goTo(page, s.name);
        await expect(page.getByRole('heading', { level: 1, name: s.heading })).toBeVisible();
        await page.waitForTimeout(350);
        await noSideScroll(page, `desktop ${mode} ${s.name}`);
        await page.screenshot({ path: `${SHOTS}/desktop-${mode}-${slug(s.name)}.png`, fullPage: true });
        if (s.dialog) {
          await page.getByRole('main').getByRole('button', { name: s.dialog.open, exact: true }).first().click();
          await dialogChecks(page, s.dialog.title, `desktop ${mode} ${s.name}`, false);
          await page.screenshot({ path: `${SHOTS}/desktop-${mode}-${slug(s.name)}-dialog.png` });
          await page.keyboard.press('Escape');
        }
      }
    });
  }
});
