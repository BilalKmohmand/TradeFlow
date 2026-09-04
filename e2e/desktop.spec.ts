import { test, expect, Page } from '@playwright/test';
import { seed } from './seed';

const SHOTS = 'e2e/screenshots/desktop';
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

test.use({ viewport: { width: 1366, height: 900 } });

test('desktop screens with data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(seed);
  await page.goto('/');
  for (const d of '7860') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trading Overview' })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await shot(page, '01-dashboard');

  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  await shot(page, '02-bookings');
  await page.getByRole('button', { name: /Quotations/ }).click();
  await page.getByRole('button', { name: 'New Quotation' }).click();
  await shot(page, '03-quotation-form');
  await page.getByRole('button', { name: 'Create quote' }).click();
  await expect(page.getByText(/QT-\d{4}-\d{3}/)).toBeVisible();
  await shot(page, '04-quotations');
  await page.getByRole('button', { name: /Returns/ }).click();
  await page.getByRole('button', { name: 'Sales return' }).click();
  await shot(page, '05-return-form');

  await page.getByRole('button', { name: 'Suppliers', exact: true }).click();
  await page.getByRole('button', { name: /Purchase Orders/ }).click();
  await page.getByRole('button', { name: 'New Purchase Order' }).click();
  await page.getByRole('button', { name: 'Create PO' }).click();
  await expect(page.getByText(/PO-\d{4}-\d{3}/)).toBeVisible();
  await shot(page, '06-purchase-orders');
  await page.getByRole('button', { name: /Receive against PO/ }).click();
  await expect(page.getByText('Against purchase order')).toBeVisible();
  await shot(page, '07-receive-against-po');
  await page.getByRole('button', { name: 'Cancel' }).last().click();

  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Adjust' }).first().click();
  await shot(page, '08-stock-adjust');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Ops/ }).first().click();
  await page.getByRole('button', { name: /Follow-ups/ }).click();
  await shot(page, '09-tasks');
  await page.getByRole('button', { name: /^Alerts/ }).click();
  await shot(page, '10-alerts');

  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await page.getByRole('button', { name: 'Cash Book' }).click();
  await shot(page, '11-cashbook');
  await page.getByRole('button', { name: 'Balance Sheet' }).click();
  await shot(page, '12-balance');
  await page.getByRole('button', { name: 'Profit & Loss' }).click();
  await shot(page, '13-pnl');

  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  await page.getByRole('button', { name: /^Orders/ }).click();
  await page.getByRole('button', { name: 'BK-2026-514' }).click();
  await shot(page, '14-booking-detail');
  await page.getByRole('button', { name: /Log Dispatch/ }).last().click();
  await shot(page, '15-dispatch-form');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await shot(page, '16-admin');
  expect(errors, errors.join('\n')).toEqual([]);
});
