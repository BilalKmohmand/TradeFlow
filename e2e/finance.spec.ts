import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';

/**
 * Finance: fixed assets & depreciation, staff & salaries, budgets, cost centres, cash flow & ratios,
 * year-end close and cheque printing. The shop started its books at the start of last financial year with
 * Rs. 200,000 cash and Rs. 500,000 in the bank; last financial year it paid rent and earned commission.
 */
const seed = () => {
  if (localStorage.getItem('e2e_finance_seeded')) return;
  localStorage.setItem('e2e_finance_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  // Start of the current financial year (1 July), and the one before it.
  const fyStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const prevStart = `${fyStartYear - 1}-07-01`;
  const inPrev = `${fyStartYear}-03-10`;
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 200000, openingBankBalance: 500000, cashOpeningDate: prevStart, taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: prevStart }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 0, createdAt: prevStart }]);
  set('tradeflow_products_v2', [{ id: 'p1', name: 'Ghee tin', category: 'General', unit: 'tin', unitPricePerKg: 6000, costPricePerKg: 5000, stockKg: 100, minThresholdKg: 0 }]);
  set('tradeflow_invoices_v1', []);
  set('tradeflow_ledger_v2', []);
  set('tradeflow_expenses_v2', [{ id: 'e-prev', date: inPrev, category: 'rent', amount: 30000, description: 'Shop rent', paidVia: 'Cash', createdAt: inPrev }]);
  set('tradeflow_cash_entries_v2', [{ id: 'x-prev', date: inPrev, direction: 'in', amount: 80000, description: 'Commission received', method: 'Cash', accountCode: '4900', createdAt: inPrev }]);
  set('tradeflow_cheques_v1', [{ id: 'chq1', direction: 'issued', customerId: null, supplierId: 's1', partyName: 'Dalda Foods', bankName: 'HBL', chequeNumber: '556677', amount: 125000, chequeDate: today, entryDate: today, status: 'issued', createdAt: today }]);
  set('tradeflow_journal_entries_v1', []);
};

async function open(page: Page) {
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
  await goTo(page, 'Accounts');
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
}

const tab = (page: Page, name: string) => page.getByRole('tablist', { name: 'Accounts views' }).getByRole('tab', { name, exact: true }).click();
const noOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(0);
};
const status = (page: Page) => page.getByRole('status').filter({ hasText: /./ }).first();

test.describe('Finance', () => {
  test('fixed asset → depreciation → register print; staff advance → salary sheet → payslip', async ({ page }) => {
    await open(page);
    await tab(page, 'Fixed assets');
    const assets = page.getByTestId('assets-tab');
    await assets.getByRole('button', { name: 'Add asset' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add fixed asset' });
    await dlg.getByLabel('Name').fill('Honda generator');
    await dlg.getByLabel('Type').selectOption('generator');
    await dlg.getByLabel('Cost (Rs.)').fill('120000');
    await dlg.getByLabel('Useful life (years)').fill('5');
    await expect(dlg).toContainText('Rs. 2,000');
    await dlg.getByRole('button', { name: 'Save asset' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(assets.getByTestId('asset-row')).toContainText('Honda generator');
    await expect(assets.getByTestId('asset-row')).toContainText('Rs. 120,000');

    // Run depreciation for this month; running it again says it is already done.
    await assets.getByRole('button', { name: /^Run for (January|February|March|April|May|June|July|August|September|October|November|December)/ }).click();
    await expect(status(page)).toContainText(/2,000 charged on 1 asset/);
    await assets.getByRole('button', { name: /^Run for (January|February|March|April|May|June|July|August|September|October|November|December)/ }).click();
    await expect(status(page)).toContainText('already been run');
    await expect(assets.getByTestId('dep-run')).toHaveCount(1);
    await expect(assets.getByTestId('asset-row')).toContainText('Rs. 118,000');

    // The balance sheet shows cost less accumulated depreciation and still balances.
    await tab(page, 'Balance sheet');
    const bs = page.getByRole('table', { name: 'Balance sheet' });
    await expect(bs).toContainText('Fixed assets (at cost)');
    await expect(bs.getByRole('row', { name: /Accumulated depreciation/ })).toContainText('-2,000');
    await expect(page.getByRole('status').filter({ hasText: 'Balanced' })).toBeVisible();

    await tab(page, 'Fixed assets');
    await page.getByRole('button', { name: 'Print register' }).click();
    const doc = page.locator('#print-root');
    await expect(doc).toContainText('FIXED ASSET REGISTER');
    await expect(doc).toContainText('Honda generator');
    await expect(doc).toContainText('118,000');
    await page.getByRole('button', { name: 'Close preview' }).click();

    // Staff: add, give an advance, pay the salary sheet with the advance recovered.
    await tab(page, 'Staff & salaries');
    const staff = page.getByTestId('staff-tab');
    await staff.getByRole('button', { name: 'Add staff' }).click();
    const sd = page.getByRole('dialog', { name: 'Add staff member' });
    await sd.getByLabel('Name').fill('Ali Khan');
    await sd.getByLabel('Job').fill('Salesman');
    await sd.getByLabel('Monthly salary (Rs.)').fill('30000');
    await sd.getByLabel('Joined on').fill('2025-01-01');
    await sd.getByRole('button', { name: 'Save' }).click();
    await expect(staff.getByTestId('staff-row')).toContainText('Ali Khan');
    await staff.getByRole('button', { name: 'Give advance' }).click();
    const ad = page.getByRole('dialog', { name: 'Give an advance' });
    await ad.getByLabel('Staff member').selectOption({ label: 'Ali Khan' });
    await ad.getByLabel('Amount (Rs.)').fill('5000');
    await ad.getByRole('button', { name: 'Give advance' }).click();
    await expect(staff.getByTestId('staff-row')).toContainText('owes Rs. 5,000');

    await staff.getByRole('button', { name: 'Salary sheet' }).click();
    const sheet = page.getByRole('dialog', { name: 'Salary sheet' });
    await expect(sheet.getByTestId('salary-line')).toContainText('Ali Khan');
    await sheet.getByLabel('Bonus for Ali Khan').fill('1000');
    await expect(sheet.getByTestId('salary-net-total')).toHaveText('Rs. 26,000');
    await sheet.getByRole('button', { name: 'Pay salaries' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(staff.getByTestId('salary-run')).toContainText('Rs. 26,000');
    await expect(staff.getByTestId('staff-row')).not.toContainText('owes');

    await staff.getByRole('button', { name: /^Payslip for Ali Khan/ }).click();
    await expect(doc).toContainText('PAYSLIP');
    await expect(doc).toContainText('Net pay');
    await expect(doc).toContainText('26,000');
    await expect(doc).toContainText('Rupees Twenty-Six Thousand Only');
    await page.getByRole('button', { name: 'Close preview' }).click();

    // Trial balance still balances.
    await tab(page, 'Trial balance');
    await expect(page.getByRole('status').filter({ hasText: 'Balanced' })).toBeVisible();
  });

  test('budgets, cost centres, cash flow & ratios, year-end close', async ({ page }) => {
    await open(page);
    // Cost centre, then an expense tagged with it.
    await tab(page, 'Cost centres');
    const cc = page.getByTestId('centres-tab');
    await cc.getByLabel('New cost centre').fill('Shehzore truck');
    await cc.getByLabel('Kind').selectOption('vehicle');
    await cc.getByRole('button', { name: 'Add' }).click();
    await expect(cc.getByTestId('centre-row')).toContainText('Shehzore truck');

    await goTo(page, 'Daily Sheet');
    await page.getByRole('button', { name: '+ Food & refreshments' }).click();
    const ex = page.getByRole('dialog', { name: 'Add expense' });
    await ex.getByLabel('What for', { exact: true }).fill('Diesel');
    await ex.getByLabel('Amount (Rs.)', { exact: true }).fill('8000');
    await ex.getByLabel('Category').selectOption('fuel');
    await ex.getByLabel('Cost centre (optional)').selectOption({ label: 'Shehzore truck' });
    await ex.getByRole('button', { name: 'Save expense' }).click();
    await expect(ex).toHaveCount(0);

    await goTo(page, 'Accounts');
    await tab(page, 'Cost centres');
    const truck = page.getByTestId('centre-pnl').filter({ hasText: 'Shehzore truck' });
    await expect(truck).toContainText('Rs. 8,000');

    // Budget for fuel this month: 10,000 → 80% used.
    await tab(page, 'Budgets');
    const bt = page.getByTestId('budget-tab');
    await bt.getByRole('tab', { name: 'Set budget' }).click();
    await bt.getByLabel(/6040\s*Fuel/).fill('10000');
    await bt.getByLabel(/6040\s*Fuel/).blur();
    await bt.getByRole('tab', { name: 'Budget vs actual' }).click();
    const fuel = bt.getByTestId('budget-row').filter({ hasText: 'Fuel' });
    await expect(fuel).toContainText('80% used');
    await expect(fuel).toContainText('Rs. 2,000 under budget');

    // Cash flow: opening 700,000 at the start of this month's range is shown and the ratios render.
    await tab(page, 'Cash flow & ratios');
    const cf = page.getByTestId('cashflow-tab');
    await expect(cf.getByTestId('cf-operating')).toContainText('8,000');
    await expect(cf.getByTestId('ratio-current_ratio')).toBeVisible();
    await expect(cf.getByTestId('ratio-gross_margin')).toContainText('No sales');

    // Year end: close last financial year (profit 80,000 commission − 30,000 rent = 50,000).
    await tab(page, 'Year end');
    const ye = page.getByTestId('yearend-tab');
    await expect(ye.getByTestId('close-checks')).toContainText('is balanced');
    await expect(ye.getByTestId('close-profit')).toHaveText('Rs. 50,000');
    await ye.getByRole('button', { name: /^Close FY/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Close the year' }).click();
    await expect(ye.getByTestId('year-close')).toHaveCount(1);
    await expect(ye.getByTestId('year-close')).toContainText('Profit Rs. 50,000');
    await expect(page.getByText(/Books are closed up to/)).toBeVisible();

    // P&L for that year still shows the profit; the balance sheet carries it in retained earnings.
    await tab(page, 'Profit & Loss');
    const fySelect = page.getByLabel('Financial year');
    const labels = await fySelect.locator('option').allTextContents();
    await fySelect.selectOption({ label: labels[2] }); // [Custom, current FY, previous FY]
    await expect(page.getByTestId('pnl-net')).toHaveText('50,000');
    await tab(page, 'Balance sheet');
    await expect(page.getByRole('table', { name: 'Balance sheet' }).getByRole('row', { name: /Retained earnings/ })).toContainText('50,000');
    await expect(page.getByRole('status').filter({ hasText: 'Balanced' })).toBeVisible();

    // Reopen the last closed year.
    await tab(page, 'Year end');
    await ye.getByRole('button', { name: /^Reopen FY/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reopen year' }).click();
    await expect(ye.getByTestId('year-close')).toHaveCount(0);
  });

  test('prints a supplier cheque with the amount in words, at the saved layout', async ({ page }) => {
    await open(page);
    await goTo(page, 'Money');
    await page.getByRole('button', { name: 'Cheques', exact: true }).click();
    const tabEl = page.getByTestId('cheques-tab');
    await tabEl.getByRole('tab', { name: /^All/ }).click();
    await tabEl.getByRole('button', { name: 'Cheque layout' }).click();
    const lay = page.getByRole('dialog', { name: 'Cheque layout' });
    await lay.locator('#cl-payee-x').fill('30');
    await lay.getByRole('button', { name: 'Save layout' }).click();
    await expect(lay).toHaveCount(0);
    await tabEl.getByRole('button', { name: 'Print cheque 556677' }).click();
    const leaf = page.getByTestId('cheque-leaf');
    await expect(leaf.getByTestId('cheque-payee')).toHaveText('Dalda Foods');
    await expect(leaf.getByTestId('cheque-words')).toHaveText('Rupees One Lakh Twenty-Five Thousand Only');
    await expect(leaf.getByTestId('cheque-figures')).toHaveText('1,25,000/-');
    await expect(leaf.getByTestId('cheque-payee')).toHaveAttribute('style', /left: 30mm/);
    await expect(page.getByTestId('print-page')).toBeAttached();
  });

  test('phone: finance tabs fit a 390px screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    for (const name of ['Fixed assets', 'Staff & salaries', 'Budgets', 'Cost centres', 'Cash flow & ratios', 'Year end']) {
      await tab(page, name);
      await noOverflow(page, name);
    }
    await tab(page, 'Staff & salaries');
    await page.getByRole('button', { name: 'Add staff' }).click();
    const sd = page.getByRole('dialog', { name: 'Add staff member' });
    await sd.getByLabel('Name').fill('Bashir');
    await sd.getByLabel('Monthly salary (Rs.)').fill('20000');
    await sd.getByLabel('Joined on').fill('2025-01-01');
    await sd.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Salary sheet' }).click();
    await expect(page.getByRole('dialog', { name: 'Salary sheet' }).getByTestId('salary-line')).toBeVisible();
    await noOverflow(page, 'salary sheet');
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/finance-salary-phone.png` });
    await page.getByRole('dialog', { name: 'Salary sheet' }).getByRole('button', { name: 'Cancel' }).click();
    await tab(page, 'Fixed assets');
    await page.getByRole('button', { name: 'Add asset' }).click();
    await noOverflow(page, 'add asset');
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/finance-asset-phone.png` });
  });
});
