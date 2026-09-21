import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';

/**
 * Purchasing (billing mode): item group / brand / barcode, re-order report → purchase orders,
 * receive against an order, supplier bill with a price difference (three-way match), supplier
 * claims, barcode scanning on New Bill and barcode labels.
 */
const seed = () => {
  if (localStorage.getItem('e2e_pur_seeded')) return;
  localStorage.setItem('e2e_pur_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 0, openingBankBalance: 0, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Zaman and Co', company: 'Zaman and Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: today }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 0, createdAt: today }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: 'Dalda Ghee Tin', category: 'Ghee', brand: 'Dalda', unit: 'tin', unitPricePerKg: 7000, costPricePerKg: 6000, stockKg: 3, minThresholdKg: 10, reorderQty: 20, supplierId: 's1', barcode: '8964000123456' },
    { id: 'p2', name: 'Habib Oil Can', category: 'Cooking oil', brand: 'Habib', unit: 'can', unitPricePerKg: 2400, costPricePerKg: 2000, stockKg: 50, minThresholdKg: 5 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_purchase_orders_v2'].forEach((k) => localStorage.setItem(k, '[]'));
};

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

test.describe('Purchasing (desktop)', () => {
  test('re-order → order → receive → supplier bill with a price difference → claim', async ({ page }) => {
    await open(page);
    await goTo(page, 'Items & Prices');

    // Groups and brands filter the list.
    await page.getByLabel('Filter by group').selectOption('Cooking oil');
    await expect(page.getByText('Habib Oil Can')).toBeVisible();
    await expect(page.getByText('Dalda Ghee Tin')).toHaveCount(0);
    await page.getByLabel('Filter by group').selectOption('');

    // Re-order report: Dalda is below its level, suggested 20 from Dalda Foods at the last cost.
    await page.getByRole('button', { name: /^Re-order/ }).click();
    const ro = page.getByRole('dialog', { name: 'Re-order report' });
    await expect(ro.getByTestId('reorder-p1')).toBeVisible();
    await expect(ro.getByLabel('Qty (tin)')).toHaveValue('20');
    await expect(ro.getByTestId('reorder-p2')).toHaveCount(0);
    await ro.getByLabel('Rate').fill('6000');
    await ro.getByRole('button', { name: /Make purchase order/ }).click();
    await expect(ro).toBeHidden();
    await expect(page.getByTestId('purchasing-toast')).toContainText('PO-1');

    // Suppliers → Orders: open the order and receive 18 of the 20 tins.
    await goTo(page, 'Suppliers');
    await page.getByRole('tab', { name: /^Orders/ }).click();
    await page.getByRole('button', { name: 'Open PO-1' }).click();
    const detail = page.getByRole('dialog', { name: 'Purchase order PO-1' });
    await expect(detail.getByTestId('po-match')).toContainText('Dalda Ghee Tin');
    await detail.getByRole('button', { name: 'Receive goods' }).click();
    const rcv = page.getByRole('dialog', { name: 'Receive goods for PO-1' });
    await expect(rcv.locator('#rs-qty')).toHaveValue('20');
    await expect(rcv.locator('#rs-cost')).toHaveValue('6000');
    await rcv.locator('#rs-qty').fill('18');
    await rcv.getByRole('button', { name: 'Receive stock' }).click();
    await expect(rcv).toBeHidden();
    await expect(page.getByText('Partly received')).toBeVisible();

    // Supplier bill at 6,100 a tin for the 18 received: 1,800 more than booked.
    await page.getByRole('tab', { name: 'Supplier bills' }).click();
    await page.getByRole('button', { name: 'Record supplier bill' }).click();
    const bill = page.getByRole('dialog', { name: 'Record supplier bill' });
    await bill.locator('#sb-supplier').selectOption('s1');
    await bill.getByRole('checkbox').first().check();
    await expect(bill.getByLabel('Qty billed for Dalda Ghee Tin')).toHaveValue('18');
    await bill.getByLabel('Rate billed for Dalda Ghee Tin').fill('6100');
    await bill.locator('#sb-number').fill('DF-4471');
    await expect(bill.getByTestId('bill-difference')).toContainText('Rs. 1,800 will be added');
    await expect(bill.getByTestId('bill-difference')).toContainText('Mismatch');
    await bill.getByRole('button', { name: 'Save bill' }).click();
    await expect(bill).toBeHidden();
    await expect(page.getByRole('list', { name: 'Supplier bills' })).toContainText('Bill DF-4471');

    // What we owe = the bill (108,000 at receipt + 1,800).
    await page.getByRole('tab', { name: 'Suppliers', exact: true }).click();
    await expect(page.getByText('Rs. 109,800').first()).toBeVisible();

    // Claim 2 leaked tins; the supplier accepts it.
    await page.getByRole('tab', { name: /^Claims/ }).click();
    await page.getByRole('button', { name: 'New claim' }).click();
    const claim = page.getByRole('dialog', { name: 'New supplier claim' });
    await claim.locator('#cl-supplier').selectOption('s1');
    await claim.locator('#cl-receipt').selectOption({ index: 1 });
    await claim.locator('#cl-qty').fill('2');
    await claim.getByRole('button', { name: 'Save claim' }).click();
    await expect(claim).toBeHidden();
    await page.getByRole('button', { name: 'Accept claim CLM-1' }).click();
    const accept = page.getByRole('dialog', { name: 'Supplier accepted CLM-1' });
    await expect(accept.locator('#cl-accept-amount')).toHaveValue('12000');
    await accept.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Claim CLM-1 accepted/)).toBeVisible();
    await page.getByRole('tab', { name: 'Suppliers', exact: true }).click();
    await expect(page.getByText('Rs. 97,800').first()).toBeVisible();
  });

  test('barcode: scan on New Bill (typed code and USB-scanner typing) and print labels', async ({ page }) => {
    await open(page);
    await page.keyboard.press('F2');
    const dialog = page.getByRole('dialog', { name: 'New Bill' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Scan barcode' }).click();
    const scan = page.getByRole('dialog', { name: 'Scan barcode' });
    await scan.getByLabel('Barcode or item code').fill('8964000123456');
    await scan.getByLabel('Barcode or item code').press('Enter');
    await expect(scan.getByText('Dalda Ghee Tin added.')).toBeVisible();
    await scan.getByLabel('Barcode or item code').fill('0000');
    await scan.getByLabel('Barcode or item code').press('Enter');
    await expect(scan.getByText(/No item has the code 0000/)).toBeVisible();
    await scan.getByRole('button', { name: 'Close scanner' }).click();
    await expect(scan).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Item 1', { exact: true })).toHaveValue('p1');
    // A USB scanner types the digits fast into the item box and presses Enter.
    await dialog.getByRole('button', { name: /Add another item/ }).click();
    const item2 = dialog.getByLabel('Item 2', { exact: true });
    await item2.focus();
    await page.keyboard.type('8964000123456', { delay: 5 });
    await expect(item2).toHaveValue('p1');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();

    await goTo(page, 'Items & Prices');
    await page.getByRole('button', { name: 'Labels' }).click();
    const labels = page.getByRole('dialog', { name: 'Print barcode labels' });
    await labels.getByLabel('Labels for Dalda Ghee Tin').fill('3');
    await labels.getByRole('button', { name: 'Preview labels' }).click();
    const sheet = page.getByTestId('label-preview');
    await expect(sheet.getByTestId('label')).toHaveCount(3);
    await expect(sheet.getByTestId('barcode').first()).toHaveAttribute('data-value', '8964000123456');
    await page.getByRole('button', { name: 'Close label preview' }).click();
  });
});

test.describe('Purchasing (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('orders, bills and claims tabs fit a phone', async ({ page }) => {
    await open(page);
    await goTo(page, 'Suppliers');
    await page.getByRole('tab', { name: /^Orders/ }).click();
    await expect(page.getByRole('button', { name: 'Re-order report' })).toBeVisible();
    await page.getByRole('button', { name: 'New order' }).first().click();
    const po = page.getByRole('dialog', { name: 'New purchase order' });
    await po.locator('#po-supplier').selectOption('s1');
    await po.locator('#po-item-1').selectOption('p2');
    await expect(po.locator('#po-rate-1')).toHaveValue('2000');
    await po.locator('#po-qty-1').fill('12');
    await po.getByRole('button', { name: 'Save purchase order' }).click();
    await expect(page.getByRole('dialog', { name: 'Purchase order PO-1' })).toBeVisible();
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noScroll).toBe(true);
  });
});
