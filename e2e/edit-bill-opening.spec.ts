import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';

/** Billing shop: one customer, two items, nothing sold yet. */
const seed = () => {
  if (localStorage.getItem('e2e_edit_seeded')) return;
  localStorage.setItem('e2e_edit_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil Traders', cashOpeningBalance: 0, openingBankBalance: 0, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Zaman Store', company: 'Zaman Store', phone: '03443838294', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: today }]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', [
    { id: 'p1', name: 'Dalda 5L', category: 'Ghee', unit: 'tin', unitPricePerKg: 2000, stockKg: 100, minThresholdKg: 0 },
    { id: 'p2', name: 'Soya Oil 1L', category: 'Oil', unit: 'btl', unitPricePerKg: 500, stockKg: 50, minThresholdKg: 0 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2'].forEach((k) => set(k, []));
};

async function unlock(page: Page) {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

test.describe('Edit bill and opening balances', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seed);
  });

  test('edit a saved bill: same number, new lines, bill detail reopens with the new figures', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Bill' });
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c1');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('10');
    await dialog.getByLabel('Paid now', { exact: true }).fill('5000');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    await goTo(page, 'Bills');
    await page.getByRole('button', { name: /Zaman Store/ }).first().click();
    const detail = page.getByRole('dialog', { name: 'Bill INV-1' });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Edit bill' }).click();

    const edit = page.getByRole('dialog', { name: 'Edit bill INV-1' });
    await expect(edit).toBeVisible();
    // The saved lines are in the grid; a click brings one back into the entry row to change it.
    await expect(edit.getByTestId('bill-line')).toHaveCount(1);
    await expect(edit.getByTestId('bill-edit-paid')).toContainText('5,000');
    await edit.getByTestId('bill-line').first().click();
    await expect(edit.getByLabel('Quantity 1', { exact: true })).toHaveValue('10');
    await edit.getByLabel('Quantity 1', { exact: true }).fill('6');
    await edit.getByRole('button', { name: 'Update line' }).click();
    await edit.getByLabel('Item 2', { exact: true }).selectOption('p2');
    await edit.getByLabel('Quantity 2', { exact: true }).fill('4');
    await edit.getByLabel('Others Charges').fill('300');
    await edit.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(edit).toBeHidden();

    // Back on the same bill, not a new one: 6 × 2000 + 4 × 500 + 300 = 14,300; 5,000 paid; 9,300 left.
    const again = page.getByRole('dialog', { name: 'Bill INV-1' });
    await expect(again).toBeVisible();
    await expect(again.getByTestId('bill-net-total')).toContainText('14,300');
    await expect(again.getByText('Rs. 9,300').first()).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'New Bill' })).toHaveCount(0);
  });

  test('a new customer with an opening balance owes it straight away', async ({ page }) => {
    await unlock(page);
    await goTo(page, 'Customers');
    await page.getByRole('button', { name: 'Add customer' }).click();
    const form = page.getByRole('dialog', { name: 'New customer' });
    await form.getByLabel('Name', { exact: true }).fill('Gul Traders');
    await form.getByLabel('Phone', { exact: true }).fill('0312 5556677');
    await form.getByLabel('Opening balance (Rs.)').fill('12500');
    await form.getByLabel('Opening balance as of').fill('2026-06-30');
    await form.getByRole('button', { name: 'Save customer' }).click();
    await expect(form).toBeHidden();
    await page.getByLabel('Search customers').fill('Gul');
    await expect(page.getByText('Rs. 12,500').first()).toBeVisible();

    // Editing the customer shows the same opening balance (one row, changed in place).
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tradeflow_ledger_v2') || '[]').filter((l: { type: string }) => l.type === 'opening_balance'));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ referenceId: 'OB', description: 'Opening balance', debit: 12500, date: '2026-06-30' });
  });
});
