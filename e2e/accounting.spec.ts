import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';

const SHOTS = process.env.SHOT_DIR || 'e2e/screenshots';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

/** Billing-mode shop with opening balances, an old supplier balance, priced items with cost, and a few expenses. */
const seedBooks = () => {
  if (localStorage.getItem('e2e_accounts_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_accounts_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: today },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: '', totalDue: 8000, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 45000, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, costPricePerKg: 1800, stockKg: 800, minThresholdKg: 50 },
    { id: 'p2', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 45, minThresholdKg: 10 },
  ]);
  set('tradeflow_invoices_v1', []);
  set('tradeflow_ledger_v2', []);
  set('tradeflow_expenses_v2', [
    { id: 'e1', date: today, category: 'food', amount: 1200, description: 'Lunch for staff', paidVia: 'Cash', createdAt: today },
    { id: 'e2', date: today, category: 'rent', amount: 25000, description: 'Shop rent', paidVia: 'Credit (unpaid)', createdAt: today },
    { id: 'e3', date: today, category: 'drawings', amount: 3000, description: 'Home', paidVia: 'Bank Transfer', createdAt: today },
  ]);
  set('tradeflow_cash_entries_v2', [
    { id: 'x1', date: today, direction: 'out', amount: 5000, description: 'Deposited cash to bank', method: 'Cash', createdAt: today, pairId: 'xf1' },
    { id: 'x2', date: today, direction: 'in', amount: 5000, description: 'Deposited cash to bank', method: 'Bank Transfer', createdAt: today, pairId: 'xf1' },
  ]);
  set('tradeflow_journal_entries_v1', []);
  set('tradeflow_accounts_v1', []);
};

async function unlock(page: Page) {
  await signIn(page); // owner "bilal" / Sarmaya@2026 (see e2e/helpers/users.ts)
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

const noOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(0);
};

async function makeBill(page: Page, customer: string, qty: string, paid: string) {
  await page.getByRole('button', { name: 'New Bill' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New Bill' });
  await dialog.getByLabel('Customer', { exact: true }).selectOption(customer);
  await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
  await dialog.getByLabel('Quantity 1', { exact: true }).fill(qty);
  await dialog.getByLabel('Paid now', { exact: true }).fill(paid);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
}

async function addJournal(page: Page) {
  await page.getByRole('button', { name: 'New journal entry' }).click();
  const je = page.getByRole('dialog', { name: 'New journal entry' });
  await expect(je).toBeVisible();
  await je.getByLabel('Narration', { exact: true }).fill('Owner paid shop rent from personal money');
  await je.getByLabel('Account 1', { exact: true }).selectOption('2010');
  await je.getByLabel('Debit 1', { exact: true }).fill('25000');
  await je.getByLabel('Account 2', { exact: true }).selectOption('3000');
  await je.getByLabel('Credit 2', { exact: true }).fill('20000');
  // Unbalanced: cannot be saved
  await expect(je.getByText('Out by Rs. 5,000')).toBeVisible();
  await expect(je.getByRole('button', { name: 'Save entry' })).toBeDisabled();
  await je.getByLabel('Credit 2', { exact: true }).fill('25000');
  await expect(je.getByText('Balanced ✓')).toBeVisible();
  await je.getByRole('button', { name: 'Save entry' }).click();
  await expect(je).toBeHidden();
}

test.describe('Accounts (double-entry)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seedBooks);
  });

  test('desktop: bills post automatically, trial balance balances, manual journal, P&L, balance sheet, print', async ({ page }) => {
    await unlock(page);
    await makeBill(page, 'c1', '10', '5000'); // 20,650: 5,000 cash + 15,650 on credit
    await makeBill(page, 'c2', '2', '0');

    await goTo(page, 'Accounts');
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();

    // Trial balance
    const tb = page.getByRole('table', { name: 'Trial balance' });
    await expect(tb).toContainText('Cash in hand');
    await expect(tb).toContainText('Accounts receivable');
    await expect(page.getByText('Balanced ✓').first()).toBeVisible();
    const dr = await page.getByTestId('tb-total-debit').textContent();
    expect(dr).toBe(await page.getByTestId('tb-total-credit').textContent());
    // Receivable = 15,650 + 4,130 + opening 8,000
    await expect(tb.getByRole('row', { name: /Accounts receivable/ })).toContainText('27,780');
    // Cash = 20,000 opening + 5,000 bill - 1,200 lunch - 5,000 deposit
    await expect(tb.getByRole('row', { name: /Cash in hand/ })).toContainText('18,800');
    await shot(page, 'accounts-trial-balance');

    // General ledger for receivables links back to the bill
    await tb.getByRole('row', { name: /Accounts receivable/ }).click();
    await expect(page.getByRole('tab', { name: 'General ledger' })).toHaveAttribute('aria-selected', 'true');
    const gl = page.getByRole('table', { name: 'General ledger' });
    await expect(gl).toContainText('Bill INV-1');
    await gl.getByRole('button', { name: /INV-1/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'Bill INV-1' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Bill INV-1' })).toBeHidden();

    // Manual journal: unbalanced refused, balanced saved
    await addJournal(page);
    await openTab(page, 'Journal');
    await page.getByLabel('Show', { exact: true }).selectOption('manual');
    await expect(page.getByTestId('journal-entry')).toHaveCount(1);
    await expect(page.getByTestId('journal-entry').first()).toContainText('Owner paid shop rent');
    await page.getByLabel('Show', { exact: true }).selectOption('all');
    await expect(page.getByTestId('journal-entry').filter({ hasText: 'INV-1' }).first()).toBeVisible();
    await shot(page, 'accounts-journal');
    await openTab(page, 'Trial balance');
    await expect(page.getByText('Balanced ✓').first()).toBeVisible();

    // Chart of accounts: add an account
    await openTab(page, 'Chart of accounts');
    await page.getByLabel('Code', { exact: true }).fill('1020');
    await page.getByLabel('Type', { exact: true }).selectOption('asset');
    await page.getByLabel('Name', { exact: true }).fill('Meezan Bank');
    await page.getByRole('button', { name: 'Add account' }).click();
    await expect(page.getByRole('table', { name: 'Chart of accounts' })).toContainText('Meezan Bank');

    // Profit & Loss: sales 24,780 − COGS 21,600 − food 1,200 − rent 25,000 = −23,020
    await openTab(page, 'Profit & Loss');
    const pnl = page.getByRole('table', { name: 'Profit and loss' });
    await expect(pnl).toContainText('Sales');
    await expect(pnl).toContainText('Cost of goods sold');
    await expect(page.getByTestId('pnl-net')).toHaveText('-23,020');
    await expect(pnl).not.toContainText('Owner drawings');
    await shot(page, 'accounts-pnl');

    // Balance sheet balances
    await openTab(page, 'Balance sheet');
    await expect(page.getByRole('table', { name: 'Balance sheet' })).toContainText('Owner drawings');
    await expect(page.getByText('Balanced ✓').first()).toBeVisible();
    await shot(page, 'accounts-balance-sheet');

    // Print previews
    await page.getByRole('button', { name: 'Print balance sheet' }).click();
    await expect(page.locator('#print-root')).toContainText('BALANCE SHEET');
    await expect(page.locator('#print-root')).toContainText('Assets = Liabilities + Equity');
    await page.keyboard.press('Escape');
    await openTab(page, 'Trial balance');
    await page.getByRole('button', { name: 'Print trial balance' }).click();
    await expect(page.locator('#print-root')).toContainText('TRIAL BALANCE');
    await expect(page.locator('#print-root')).toContainText('Balanced');
    await shot(page, 'accounts-print-trial-balance');
    await page.keyboard.press('Escape');
    await openTab(page, 'Profit & Loss');
    await page.getByRole('button', { name: 'Print profit and loss' }).click();
    await expect(page.locator('#print-root')).toContainText('PROFIT & LOSS');
    await expect(page.locator('#print-root')).toContainText('Net loss');
    await page.keyboard.press('Escape');

    // Books survive a reload
    await page.reload(); // still signed in ("Keep me signed in")
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
    await goTo(page, 'Accounts');
    await openTab(page, 'Journal');
    await page.getByLabel('Show', { exact: true }).selectOption('manual');
    await expect(page.getByTestId('journal-entry')).toHaveCount(1);
  });
});

test.describe('Accounts on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seedBooks);
  });

  test('every tab fits at 390px, journal entry and print work', async ({ page }) => {
    await unlock(page);
    await makeBill(page, 'c1', '4', '5000');
    await goTo(page, 'Accounts');
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
    await expect(page.getByText('Balanced ✓').first()).toBeVisible();
    await noOverflow(page, 'trial balance');
    await shot(page, 'accounts-phone-trial-balance');

    for (const t of ['General ledger', 'Journal', 'Chart of accounts', 'Profit & Loss', 'Balance sheet']) {
      await openTab(page, t);
      await noOverflow(page, t);
    }
    await expect(page.getByText('Balanced ✓').first()).toBeVisible();
    await shot(page, 'accounts-phone-balance-sheet');

    await addJournal(page);
    await noOverflow(page, 'after journal');
    await openTab(page, 'Journal');
    await page.getByLabel('Show', { exact: true }).selectOption('manual');
    await expect(page.getByTestId('journal-entry')).toHaveCount(1);
    await noOverflow(page, 'journal list');

    await openTab(page, 'Balance sheet');
    await page.getByRole('button', { name: 'Print balance sheet' }).click();
    await expect(page.locator('#print-root')).toContainText('BALANCE SHEET');
    await noOverflow(page, 'print preview');
    await page.keyboard.press('Escape');
  });
});
