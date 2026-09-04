import { test, expect, Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR || 'e2e/screenshots';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function unlock(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Enter PIN to Open')).toBeVisible();
  for (const d of '7860') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trading Overview' })).toBeVisible({ timeout: 10_000 });
}

test.describe.serial('Sarmaya end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    // no console errors allowed
    page.on('pageerror', (e) => { throw e; });
  });

  test('full business flow', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} @ ${m.location()?.url || ''}`); });
    page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });

    await unlock(page);
    const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(desktopOverflow, 'desktop must not scroll horizontally').toBeLessThanOrEqual(0);
    // Header must fit at common laptop widths: the Lock button is the right-most control.
    for (const width of [1280, 1360, 1536]) {
      await page.setViewportSize({ width, height: 900 });
      const box = await page.getByRole('button', { name: /Lock/ }).first().boundingBox();
      expect(box, `lock button visible at ${width}`).not.toBeNull();
      expect(box!.x + box!.width, `lock button inside viewport at ${width}`).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: 1360, height: 900 });
    await shot(page, '01-dashboard-empty');

    // Wipe any cached data so the run is deterministic
    await page.getByRole('button', { name: 'Admin' }).first().click();
    await expect(page.getByRole('heading', { name: 'Admin Control Center' })).toBeVisible();
    await page.getByRole('button', { name: 'Factory Reset' }).click();
    await page.getByRole('textbox').last().fill('DELETE ALL');
    await page.getByRole('button', { name: 'Wipe Everything' }).click();

    // Add a named user (operator)
    await page.getByRole('button', { name: 'Add User' }).click();
    const userForm = page.locator('form').filter({ hasText: 'Role' }).first();
    await userForm.getByRole('textbox').first().fill('Bilal');
    await userForm.locator('select').selectOption('operator');
    await userForm.locator('input[type="password"]').fill('1234');
    await userForm.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Bilal added.')).toBeVisible();
    await shot(page, '02-admin-users');

    // Supplier
    await page.getByRole('button', { name: 'Suppliers' }).first().click();
    await page.getByRole('button', { name: 'Add Supplier' }).click();
    const supForm = page.locator('form').last();
    const supInputs = supForm.locator('input');
    await supInputs.nth(0).fill('Ahmed');
    await supInputs.nth(1).fill('Lucky Cement');
    await supInputs.nth(2).fill('+92 300 1111111');
    await supForm.getByRole('button', { name: /Create Supplier/ }).click();
    await expect(page.getByText('Lucky Cement')).toBeVisible();

    // Product
    await page.getByRole('button', { name: 'Products' }).first().click();
    await page.getByRole('button', { name: 'Add Commodity' }).click();
    const prodForm = page.locator('form').last();
    await prodForm.locator('input').first().fill('OPC Cement');
    await prodForm.getByRole('button', { name: /Save Commodity/ }).click();
    await expect(page.getByRole('heading', { name: 'OPC Cement' })).toBeVisible();
    await shot(page, '03-products');

    // Customer
    await page.getByRole('button', { name: 'Customers' }).first().click();
    await page.getByRole('button', { name: 'Add Customer' }).click();
    const custForm = page.locator('form').last();
    const ci = custForm.locator('input');
    await ci.nth(0).fill('Ali Raza');
    await ci.nth(1).fill('Raza Traders');
    await ci.nth(2).fill('+92 300 2222222');
    await ci.nth(3).fill('5000000');
    await custForm.getByRole('button', { name: /Create Account/ }).click();
    await expect(page.getByText('Raza Traders')).toBeVisible();

    // Fleet vehicle
    await page.getByRole('button', { name: /^Ops/ }).first().click();
    await page.getByRole('button', { name: 'Fleet' }).click();
    await page.getByRole('button', { name: 'Add Vehicle' }).click();
    const truckForm = page.locator('form').first();
    const ti = truckForm.locator('input');
    await ti.nth(0).fill('LES-8921');
    await ti.nth(1).fill('Rashid');
    await truckForm.getByRole('button', { name: 'Add vehicle' }).click();
    await expect(page.getByText('LES-8921')).toBeVisible();
    await shot(page, '04-fleet');

    // Booking
    await page.getByRole('button', { name: 'Bookings' }).first().click();
    await page.getByRole('button', { name: 'Create Booking' }).click();
    const bookForm = page.locator('form').last();
    await expect(bookForm.getByText('Credit exposure after this booking')).toBeVisible();
    await bookForm.getByRole('button', { name: 'Create Booking' }).click();
    await expect(page.getByText(/BK-\d{4}-\d{3}/).first()).toBeVisible();
    await shot(page, '05-booking');

    // Dispatch with fleet vehicle
    await page.getByRole('button', { name: /Log Dispatch/ }).first().click();
    const dispForm = page.locator('form').last();
    await dispForm.locator('select').last().selectOption({ index: 1 });
    await expect(dispForm.locator('input[value="LES-8921"]')).toBeVisible();
    await dispForm.getByRole('button', { name: /Confirm & Dispatch/ }).click();
    await expect(page.getByText(/20,000 kg/).first()).toBeVisible({ timeout: 10_000 });
    await shot(page, '06-after-dispatch');

    // Receive stock
    await page.getByRole('button', { name: 'Products' }).first().click();
    await page.getByRole('button', { name: 'Receive Stock' }).first().click();
    const recForm = page.locator('form').last();
    await recForm.getByRole('button', { name: 'Confirm Receipt' }).click();
    await expect(page.locator('span.font-bold.font-mono', { hasText: '500,000 kg' }).first()).toBeVisible({ timeout: 10_000 }); // 500000 - 20000 + 20000

    // Expense (dismiss any WhatsApp toast first)
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Ops/ }).first().click();
    await page.getByRole('button', { name: 'Expenses' }).click();
    const expForm = page.locator('form').first();
    await expForm.locator('input[type="number"]').fill('3000');
    await expForm.locator('input[placeholder="Diesel for LES-8921"]').fill('Diesel');
    await expForm.getByRole('button', { name: 'Add expense' }).click();
    await expect(page.getByText('Rs 3,000').first()).toBeVisible();
    await shot(page, '07-expenses');

    // Alerts tab renders
    await page.getByRole('button', { name: /^Alerts/ }).click();
    await expect(page.getByText('Critical')).toBeVisible();

    // Dashboard KPIs + stock movement
    await page.getByRole('button', { name: 'Dashboard' }).first().click();
    await expect(page.getByRole('heading', { name: "Today's Stock Movement" })).toBeVisible();
    await expect(page.getByText('This Month at a Glance')).toBeVisible();
    await shot(page, '08-dashboard');

    // Reports: P&L, Aging, Stock Flow
    await page.getByRole('button', { name: 'Reports' }).first().click();
    await page.getByRole('button', { name: 'Profit & Loss' }).click();
    await expect(page.getByText('Margin by product')).toBeVisible();
    await shot(page, '09-pnl');
    await page.getByRole('button', { name: 'Aging' }).click();
    await expect(page.getByText('Total open')).toBeVisible();
    await page.getByRole('button', { name: 'Stock Flow' }).click();
    await expect(page.getByText('Running daily log')).toBeVisible();
    await shot(page, '10-stock-flow');

    // Booking detail -> invoice preview
    await page.getByRole('button', { name: 'Bookings' }).first().click();
    await page.getByRole('button', { name: /BK-\d{4}-\d{3}/ }).first().click();
    await expect(page.getByText('Dispatches (1)')).toBeVisible();
    await page.getByTitle('Print invoice').click();
    await expect(page.getByText('TAX INVOICE')).toBeVisible();
    await shot(page, '11-invoice');

    // Product price history + monthly sales open
    await page.keyboard.press('Escape'); // close print preview only
    await expect(page.getByText('TAX INVOICE')).toHaveCount(0);
    await page.keyboard.press('Escape'); // close booking detail
    await page.getByRole('button', { name: 'Products' }).first().click();
    await page.getByRole('heading', { name: 'OPC Cement' }).click();
    await expect(page.getByText('Same month last year')).toBeVisible();
    await shot(page, '12-price-history');
    await page.getByRole('button', { name: 'Sales by Month' }).click();
    await expect(page.getByText('Kilograms sold per month')).toBeVisible();
    await expect(page.getByText('Sold, last 12 months')).toBeVisible();
    await shot(page, '12b-sales-by-month');
    await page.keyboard.press('Escape');

    expect(errors, `console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('operator sign-in hides admin and delete controls', async ({ page }) => {
    // Fresh browser profile per test: seed an operator user and one customer.
    await page.addInitScript(() => {
      localStorage.setItem('tradeflow_users_v2', JSON.stringify([{ id: 'u1', name: 'Bilal', role: 'operator', pin: '1234', active: true, createdAt: '2026-09-04' }]));
      localStorage.setItem('tradeflow_customers_v2', JSON.stringify([{ id: 'c1', name: 'Ali Raza', company: 'Raza Traders', phone: '+92 300 2222222', email: '', address: '', totalDue: 0, creditLimit: 100000, createdAt: '2026-09-04' }]));
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Bilal/ }).click();
    for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Trading Overview' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Customers' }).first().click();
    await expect(page.getByTitle('Delete customer (admin)')).toHaveCount(0);
    await expect(page.getByTitle('Edit customer')).toHaveCount(1);
    await shot(page, '13-operator-view');
  });

  test('mobile layout has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await unlock(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, '14-mobile-dashboard');
    await page.getByRole('button', { name: 'Ops' }).click();
    await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
    await shot(page, '15-mobile-ops');
    // Header/mobile Admin tab must open the admin screen
    await page.getByRole('button', { name: 'Admin' }).click();
    await expect(page.getByRole('heading', { name: 'Admin Control Center' })).toBeVisible();
    await shot(page, '16-mobile-admin');
  });
});
