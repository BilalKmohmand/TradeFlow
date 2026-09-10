import { test, expect, Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR || 'e2e/screenshots';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const vshot = async (page: Page, name: string) => { await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

/** Fresh billing-mode shop: two customers, three priced items, nothing sold yet. */
const seedBilling = () => {
  if (localStorage.getItem('e2e_billing_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_billing_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Amandarra, Alladand Road', companyPhone: '3410550055', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: today },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: today },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 45000, createdAt: today }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, stockKg: 800, minThresholdKg: 50 },
    { id: 'p2', name: '2.5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 1037.5, stockKg: 600, minThresholdKg: 50 },
    { id: 'p3', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 45, minThresholdKg: 50 },
  ]);
  set('tradeflow_invoices_v1', []);
  set('tradeflow_ledger_v2', []);
  set('tradeflow_expenses_v2', []);
  set('tradeflow_cash_entries_v2', []);
};

async function unlock(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Unlock Terminal/ })).toBeVisible();
  for (const d of '7860') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: /Unlock Terminal/ }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

const noOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(0);
};

test.describe('Simple billing', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seedBilling);
  });

  test('desktop: make bills, take payments, daily sheet, money, items, print', async ({ page }) => {
    await unlock(page);
    await noOverflow(page, 'home');
    await shot(page, 'billing-home-empty');

    // --- Bill 1: the client's sample invoice, paid in full by cash, save & print.
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Bill' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c1');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await expect(dialog.getByLabel('Price 1', { exact: true })).toHaveValue('2065');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('300');
    await dialog.getByRole('button', { name: 'Add another item' }).click();
    await dialog.getByLabel('Item 2', { exact: true }).selectOption('p2');
    await dialog.getByLabel('Quantity 2', { exact: true }).fill('300');
    await dialog.getByRole('button', { name: 'Add another item' }).click();
    await dialog.getByLabel('Item 3', { exact: true }).selectOption('p3');
    await dialog.getByLabel('Quantity 3', { exact: true }).fill('40');
    await expect(dialog.getByText('Rs. 1,192,150').first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Full' }).click();
    await expect(dialog.getByText('Fully paid')).toBeVisible();
    await shot(page, 'billing-new-bill');
    await dialog.getByRole('button', { name: 'Save & Print' }).click();
    await expect(page.locator('#print-root')).toContainText('INVOICE');
    await expect(page.locator('#print-root')).toContainText('Invoice #1');
    await expect(page.locator('#print-root')).toContainText('Zaman and Co BTK');
    await expect(page.locator('#print-root')).toContainText('1,192,150');
    await expect(page.locator('#print-root')).toContainText('PAID IN FULL');
    await shot(page, 'billing-print-invoice');
    await page.keyboard.press('Escape');
    await expect(page.locator('#print-root')).toHaveCount(0);

    // Home reflects it
    await expect(page.getByText('Rs. 1,192,150').first()).toBeVisible();
    await expect(page.getByText('1 bill', { exact: false }).first()).toBeVisible();

    // --- Bill 2: on credit with an edited price and a brand-new customer typed inline.
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    await dialog.getByRole('button', { name: 'New', exact: true }).click();
    await dialog.getByLabel('New customer name', { exact: true }).fill('Walk-in Gul Khan');
    await dialog.getByLabel('New customer phone', { exact: true }).fill('0311');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p3');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('2');
    await dialog.getByLabel('Price 1', { exact: true }).fill('6400');
    await dialog.getByLabel('Discount (Rs.)', { exact: true }).fill('300');
    await expect(dialog.getByText('Rs. 12,500 on credit')).toBeVisible();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    // --- Bills list: both there; open the credit one and take a part payment.
    await page.getByRole('button', { name: 'Bills' }).first().click();
    await expect(page.getByRole('heading', { name: 'Bills' })).toBeVisible();
    await expect(page.getByText('INV-2').first()).toBeVisible();
    await expect(page.getByText('Rs. 12,500 due').first()).toBeVisible();
    await shot(page, 'billing-bills');
    await page.getByRole('button', { name: /Walk-in Gul Khan/ }).first().click();
    const detail = page.getByRole('dialog', { name: 'Bill INV-2' });
    await expect(detail).toBeVisible();
    await detail.getByLabel('Amount', { exact: true }).fill('2500');
    await detail.getByLabel('Method', { exact: true }).selectOption('Easypaisa / JazzCash');
    await detail.getByRole('button', { name: 'Receive', exact: true }).click();
    await expect(detail.getByText(/10,000 still due/)).toBeVisible();
    await shot(page, 'billing-bill-detail');
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
    await page.getByRole('button', { name: 'Unpaid' }).click();
    await expect(page.getByText('INV-2').first()).toBeVisible();
    await expect(page.getByText('INV-1')).toHaveCount(0);

    // --- Daily sheet: bills, receipts, add an expense, print.
    await page.getByRole('button', { name: 'Daily Sheet' }).first().click();
    await expect(page.getByRole('heading', { name: 'Daily Sheet' })).toBeVisible();
    await expect(page.getByText('Bills (2)')).toBeVisible();
    await page.getByRole('button', { name: '+ Food & refreshments' }).click();
    const exp = page.getByRole('dialog', { name: 'Add expense' });
    await exp.getByLabel('What for', { exact: true }).fill('Lunch for staff');
    await exp.getByLabel('Amount (Rs.)', { exact: true }).fill('1200');
    await exp.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByText('Lunch for staff')).toBeVisible();
    // opening cash 20,000 + 1,192,150 cash − 1,200 = closing cash
    await expect(page.getByText('Rs. 1,210,950').first()).toBeVisible();
    await shot(page, 'billing-daily-sheet');
    await page.getByRole('button', { name: 'Print' }).click();
    await expect(page.locator('#print-root')).toContainText('DAILY SHEET');
    await expect(page.locator('#print-root')).toContainText('Lunch for staff');
    await shot(page, 'billing-print-daily-sheet');
    await page.keyboard.press('Escape');

    // --- Money: position, transfer cash to bank.
    await page.getByRole('button', { name: 'Money' }).first().click();
    await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible();
    await expect(page.getByText('Rs. 10,000').first()).toBeVisible(); // Gul Khan owes
    await expect(page.getByText('Rs. 45,000').first()).toBeVisible(); // supplier owed
    await page.getByRole('button', { name: 'Cash ↔ Bank' }).first().click();
    const tr = page.getByRole('dialog', { name: 'Cash ↔ Bank' });
    await tr.getByLabel('Amount (Rs.)', { exact: true }).fill('1000000');
    await tr.getByRole('button', { name: 'Record' }).click();
    await expect(tr).toBeHidden();
    await expect(page.getByText('Rs. 210,950').first()).toBeVisible(); // cash after deposit
    await page.getByRole('button', { name: 'Expense sheets' }).click();
    await expect(page.getByText('Food & refreshments sheet')).toBeVisible();
    await page.getByRole('button', { name: 'Cash book' }).click();
    await expect(page.getByText('Deposited cash to bank').first()).toBeVisible();
    await expect(page.getByText('Food & refreshments • Lunch for staff')).toBeVisible();
    await shot(page, 'billing-money');

    // --- Items: low stock warning after selling tins, add a new item.
    await page.getByRole('button', { name: 'Items & Prices' }).first().click();
    await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
    await expect(page.getByText('3 tin')).toBeVisible(); // 45 − 40 − 2
    await page.getByRole('button', { name: 'New item' }).click();
    const item = page.getByRole('dialog', { name: 'New item' });
    await item.getByLabel('Item name', { exact: true }).fill('1 kg Pouch');
    await item.getByLabel('Selling price (Rs.)', { exact: true }).fill('450');
    await item.getByLabel('Stock on hand', { exact: true }).fill('200');
    await item.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByText('1 kg Pouch')).toBeVisible();
    await shot(page, 'billing-items');

    // --- Admin: switching to the trading suite and back changes the navigation.
    await page.getByRole('button', { name: 'Admin' }).first().click();
    await page.getByRole('button', { name: /System & Backups/ }).click();
    await page.getByLabel('App mode', { exact: true }).selectOption('trading');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('button', { name: 'Bookings' }).first()).toBeVisible();
    await page.getByLabel('App mode', { exact: true }).selectOption('billing');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('button', { name: 'Daily Sheet' }).first()).toBeVisible();

    // Data survives a reload (local-first).
    await page.reload();
    await unlock(page);
    await page.getByRole('button', { name: 'Bills' }).first().click();
    await expect(page.getByText('INV-2').first()).toBeVisible();
  });
});

test.describe('Simple billing on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seedBilling);
  });

  test('bill, pay, daily sheet and money all fit and work', async ({ page }) => {
    await unlock(page);
    await noOverflow(page, 'home');
    await shot(page, 'billing-mobile-home');

    await page.getByRole('button', { name: 'New Bill' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Bill' });
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c2');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('4');
    await dialog.getByLabel('Paid now', { exact: true }).fill('5000');
    await expect(dialog.getByText('Rs. 3,260 on credit')).toBeVisible();
    await noOverflow(page, 'new bill');
    await vshot(page, 'billing-mobile-new-bill');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Rs. 8,260').first()).toBeVisible();

    for (const nav of ['Bills', 'Daily Sheet', 'Money', 'Customers', 'Items']) {
      await page.getByRole('button', { name: nav, exact: true }).first().click();
      await noOverflow(page, nav);
    }
    await page.getByRole('button', { name: 'Bills', exact: true }).first().click();
    await page.getByRole('button', { name: /Haji Karim/ }).first().click();
    const detail = page.getByRole('dialog', { name: 'Bill INV-1' });
    await expect(detail).toBeVisible();
    await noOverflow(page, 'bill detail');
    await vshot(page, 'billing-mobile-bill');
    await detail.getByRole('button', { name: 'Full' }).click();
    await detail.getByRole('button', { name: 'Receive', exact: true }).click();
    await expect(detail.getByText('Bill fully paid.')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Daily Sheet', exact: true }).first().click();
    await expect(page.getByText('Bills (1)')).toBeVisible();
    await shot(page, 'billing-mobile-daily');
    await page.getByRole('button', { name: 'Money', exact: true }).first().click();
    await expect(page.getByText('Rs. 28,260').first()).toBeVisible(); // cash 20,000 + 8,260
    await shot(page, 'billing-mobile-money');
  });
});
