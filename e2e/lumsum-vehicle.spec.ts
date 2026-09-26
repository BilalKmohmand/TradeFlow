import { test, expect } from '@playwright/test';
import { signIn } from './helpers/login';
import { salesSeed } from './helpers/salesSeed';
import { goTo } from './helpers/nav';

/** The shop gives one lumsum discount per bill (no per-item discount) and charges vehicle charges on the bill. */
test('Sale Invoice: lumsum only by default, Vehicle Charges under it, in the total, saved and balanced', async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(() => localStorage.setItem('sarmaya_item_discount', '0'));
  await page.addInitScript(salesSeed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('F2');
  const d = page.getByRole('dialog', { name: 'New Bill' });
  await expect(d).toBeVisible();

  // No per-item discount: no Disc column, no header Disc %.
  await expect(d.getByLabel('Discount 1', { exact: true })).toHaveCount(0);
  await expect(d.getByLabel('Disc %', { exact: true })).toHaveCount(0);

  await d.getByLabel('Customer code', { exact: true }).fill('2');
  await d.getByLabel('Customer code', { exact: true }).press('Enter');
  await d.getByLabel('Code 1', { exact: true }).fill('101');
  await d.getByLabel('Code 1', { exact: true }).press('Enter');
  await d.getByLabel('Quantity 1', { exact: true }).fill('2');
  await d.getByLabel('Price 1', { exact: true }).fill('1000');
  await d.getByLabel('Price 1', { exact: true }).press('Enter');
  await expect(d.getByTestId('bill-line')).toHaveCount(1);

  await d.getByLabel('Carriage Expenses (Rs.)', { exact: true }).fill('100');
  await d.getByLabel('Vehicle Charges', { exact: true }).fill('250');
  await expect(d.getByTestId('bill-total')).toHaveText('Rs. 2,150');

  // The per-item discount can still be turned on.
  await d.getByLabel('Discount on each item too').check();
  await expect(d.getByLabel('Discount 2', { exact: true })).toBeVisible();
  await d.getByLabel('Discount on each item too').uncheck();

  await d.getByRole('button', { name: /^Save/ }).first().click();
  await expect.poll(async () => page.evaluate(() => {
    const inv = JSON.parse(localStorage.getItem('tradeflow_invoices_v1') || '[]').find((i: { customerId: string }) => i.customerId === 'c2');
    return inv ? [inv.totalAmount, inv.handlingCharges, inv.discount] : null;
  })).toEqual([2150, 250, 100]);

  if (await d.isVisible()) await page.keyboard.press('Escape');
  await goTo(page, 'Accounts');
  await page.getByRole('tab', { name: 'Trial balance', exact: true }).click();
  await expect(page.getByText('Balanced ✓').first()).toBeVisible();
});
