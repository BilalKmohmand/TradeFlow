import { test, expect, Page } from '@playwright/test';
import fs from 'fs';

/**
 * Real print output: renders the bill, daily sheet and statement through Chrome's print engine
 * (same path as "Print / Save PDF") and saves them to docs/samples. A blank page would be ~1.5 KB,
 * so each PDF must be substantially larger and contain text.
 */
const LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="14" fill="#5A2E0F"/><text x="60" y="58" font-family="Georgia" font-size="54" font-weight="bold" text-anchor="middle" fill="#F5E6C8">Z</text><text x="60" y="96" font-family="Arial" font-size="20" font-weight="bold" text-anchor="middle" fill="#F5E6C8" letter-spacing="2">ZAMAN</text></svg>');
const seed = (logo: string) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'ROHAIL ZAMAN TRADERS', companyAddress: 'Amandarra, Alladand Road', companyPhone: '3410550055', companyEmail: 'rohailxaman7@gmail.com', companyLogo: logo, cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'ZAMAN AND CO BTK', company: 'ZAMAN AND CO BTK', phone: '03443838294', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: today }]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, stockKg: 800, minThresholdKg: 50 },
    { id: 'p2', name: '2.5 kgs can', category: 'General', unit: 'can', unitPricePerKg: 1037.5, stockKg: 600, minThresholdKg: 50 },
    { id: 'p3', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 100, minThresholdKg: 10 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2'].forEach((k) => set(k, []));
};
const printPdf = async (page: Page, file: string) => {
  await page.waitForTimeout(400);
  await page.emulateMedia({ media: 'print' });
  // In print, the app layout is hidden and the document must start at the top of the page.
  const top = await page.evaluate(() => (document.querySelector('#print-root') as HTMLElement).getBoundingClientRect().top);
  expect(top, `${file}: document starts at the top of the printed page`).toBeLessThan(120);
  fs.mkdirSync('docs/samples', { recursive: true });
  const path = `docs/samples/${file}`;
  await page.pdf({ path, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  await page.emulateMedia({ media: 'screen' });
  expect(fs.statSync(path).size, `${file} is not blank`).toBeGreaterThan(15_000);
};
const sampleBill = async (page: Page, full: boolean) => {
  const dialog = page.getByRole('dialog', { name: 'New Bill' });
  await page.getByRole('button', { name: 'New Bill' }).first().click();
  await dialog.getByLabel('Customer', { exact: true }).selectOption('c1');
  await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1'); await dialog.getByLabel('Quantity 1', { exact: true }).fill('300');
  await dialog.getByRole('button', { name: 'Add another item' }).click();
  await dialog.getByLabel('Item 2', { exact: true }).selectOption('p2'); await dialog.getByLabel('Quantity 2', { exact: true }).fill('300');
  await dialog.getByRole('button', { name: 'Add another item' }).click();
  await dialog.getByLabel('Item 3', { exact: true }).selectOption('p3'); await dialog.getByLabel('Quantity 3', { exact: true }).fill('40');
  if (full) await dialog.getByRole('button', { name: 'Full' }).click();
  await dialog.getByRole('button', { name: 'Save & Print' }).click();
  await expect(page.locator('#print-root')).toContainText('1,192,150');
};

test('printed bill, daily sheet and statement come out as real documents', async ({ page }) => {
  await page.addInitScript(seed, LOGO);
  await page.goto('/');
  for (const d of '7860') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: /^Unlock/ }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });

  await sampleBill(page, false);
  const root = page.locator('#print-root');
  await expect(root).toContainText('ROHAIL ZAMAN TRADERS');
  await expect(root).toContainText('rohailxaman7@gmail.com');
  await expect(root).toContainText('Invoice #1');
  await expect(root).toContainText('Balance due');
  await expect(root.locator('img').first()).toBeVisible(); // the logo
  await printPdf(page, 'Printed-Bill-credit.pdf');
  await page.keyboard.press('Escape');

  await sampleBill(page, true);
  await expect(root).toContainText('PAID IN FULL');
  await expect(root).toContainText('Invoice #2');
  await printPdf(page, 'Printed-Bill-paid.pdf');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Add expense' }).first().click();
  const exp = page.getByRole('dialog', { name: 'Add expense' });
  await exp.getByLabel('What for', { exact: true }).fill('Lunch for staff');
  await exp.getByLabel('Amount (Rs.)', { exact: true }).fill('1200');
  await exp.getByLabel('Category', { exact: true }).selectOption('food');
  await exp.getByRole('button', { name: 'Save expense' }).click();
  await page.getByRole('button', { name: 'Daily Sheet' }).first().click();
  await page.getByRole('button', { name: 'Print' }).click();
  await expect(root).toContainText('DAILY SHEET');
  await expect(root).toContainText('Lunch for staff');
  await printPdf(page, 'Printed-Daily-Sheet.pdf');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Customers' }).first().click();
  await page.getByRole('button', { name: /ZAMAN AND CO BTK/ }).first().click();
  await page.getByRole('button', { name: 'Statement', exact: true }).click();
  await expect(root).toContainText('STATEMENT');
  await expect(root).toContainText('INV-1');
  await printPdf(page, 'Printed-Customer-Statement.pdf');
});
