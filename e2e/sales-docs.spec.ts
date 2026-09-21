import { test, expect, Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR || 'e2e/screenshots';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

/** Billing-mode shop with a customer who has an agreed rate on the 5 kg can. */
const seed = () => {
  if (localStorage.getItem('e2e_salesdocs_seeded')) return;
  localStorage.setItem('e2e_salesdocs_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const today = new Date().toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: today },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: today },
  ]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, costPricePerKg: 1800, stockKg: 800, minThresholdKg: 50 },
    { id: 'p2', name: '2.5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 1037.5, stockKg: 600, minThresholdKg: 50 },
    { id: 'p3', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 45, minThresholdKg: 5 },
  ]);
  set('tradeflow_agreed_rates_v1', [{ id: 'car-1', customerId: 'c1', productId: 'p1', agreedRatePerKg: 2000, createdAt: today }]);
  set('tradeflow_invoices_v1', []);
  set('tradeflow_ledger_v2', []);
  set('tradeflow_expenses_v2', []);
  set('tradeflow_cash_entries_v2', []);
  set('tradeflow_returns_v2', []);
  set('tradeflow_quotations_v2', []);
};

async function unlock(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Unlock/ })).toBeVisible();
  for (const d of '7860') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: /^Unlock/ }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

const noOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(0);
};

test.describe('Sales documents (billing mode)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seed);
  });

  test('customer rates, line discount, return with refund, credit note, challan, quotation to bill', async ({ page }) => {
    await unlock(page);

    // --- Customer rates: set one more from the customer screen.
    await page.getByRole('button', { name: 'Customers', exact: true }).first().click();
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    const cust = page.getByRole('dialog', { name: 'Zaman and Co BTK' });
    await expect(cust.getByText('Special rates for this customer')).toBeVisible();
    await expect(cust.getByTestId('customer-rates')).toContainText('5 kgs Can');
    await cust.getByLabel('Rate item', { exact: true }).selectOption('p2');
    await cust.getByLabel('Their rate', { exact: true }).fill('1000');
    await cust.getByRole('button', { name: 'Save rate' }).click();
    await expect(cust.getByTestId('customer-rates')).toContainText('2.5 kgs Can');
    await shot(page, 'sales-customer-rates');
    await page.keyboard.press('Escape');

    // --- New bill: customer rates fill in, a 10% discount on line 2, paid in full.
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    const bill = page.getByRole('dialog', { name: 'New Bill' });
    await bill.getByLabel('Customer', { exact: true }).selectOption('c1');
    await bill.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await expect(bill.getByLabel('Price 1', { exact: true })).toHaveValue('2000');
    await expect(bill.getByTestId('customer-rate-1')).toBeVisible();
    await bill.getByLabel('Quantity 1', { exact: true }).fill('10');
    await bill.getByRole('button', { name: 'Add another item' }).click();
    await bill.getByLabel('Item 2', { exact: true }).selectOption('p3');
    await expect(bill.getByLabel('Price 2', { exact: true })).toHaveValue('6535');
    await bill.getByLabel('Quantity 2', { exact: true }).fill('2');
    await bill.getByRole('button', { name: 'Add discount to item 2' }).click();
    await bill.getByLabel('Discount 2', { exact: true }).fill('10');
    await bill.getByRole('group', { name: 'Discount type 2' }).getByRole('button', { name: '%' }).click();
    // 10 × 2,000 + (2 × 6,535 − 10%) = 20,000 + 11,763 = 31,763
    await expect(bill.getByText('Rs. 31,763').first()).toBeVisible();
    await bill.getByRole('button', { name: 'Full' }).click();
    await shot(page, 'sales-new-bill-discount');
    await bill.getByRole('button', { name: 'Save & Print' }).click();
    const print = page.locator('#print-root');
    await expect(print).toContainText('INVOICE');
    await expect(print).toContainText('Item discounts');
    await expect(print).toContainText('1,307');
    await page.keyboard.press('Escape');

    // --- Return 3 cans; money goes back in cash; the credit note prints.
    await page.getByRole('button', { name: 'Bills', exact: true }).first().click();
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    const detail = page.getByRole('dialog', { name: 'Bill INV-1' });
    await detail.getByRole('button', { name: 'Return items' }).click();
    const ret = page.getByRole('dialog', { name: 'Return items — Bill INV-1' });
    await ret.getByLabel('Return qty 1', { exact: true }).fill('3');
    await expect(ret.getByTestId('return-total')).toHaveText('Rs. 6,000');
    await expect(ret.getByRole('radio', { name: /Give money back now/ })).toHaveAttribute('aria-checked', 'true');
    await ret.getByLabel('Why (optional)', { exact: true }).fill('Dented cans');
    await shot(page, 'sales-return');
    await ret.getByRole('button', { name: 'Save return' }).click();
    await expect(print).toContainText('CREDIT NOTE');
    await expect(print).toContainText('CN-1');
    await expect(print).toContainText('INV-1');
    await expect(print).toContainText('Paid back (Cash)');
    await expect(print).toContainText('Dented cans');
    await page.keyboard.press('Escape');
    const reopened = page.getByRole('dialog', { name: 'Bill INV-1' });
    await expect(reopened.getByTestId('bill-net-total')).toHaveText('Rs. 25,763');
    await expect(reopened.getByTestId('returned-qty').first()).toHaveText('3');
    await expect(reopened.getByText('CN-1')).toBeVisible();
    await expect(reopened.getByRole('button', { name: 'Delete bill' })).toHaveCount(0);

    // --- Delivery challan: quantities only, driver and a "received by" line.
    await reopened.getByRole('button', { name: 'Delivery challan' }).click();
    await reopened.getByLabel('Driver (optional)', { exact: true }).fill('Rashid');
    await reopened.getByLabel('Vehicle no. (optional)', { exact: true }).fill('LES-1234');
    await reopened.getByRole('button', { name: 'Print challan' }).click();
    await expect(print).toContainText('DELIVERY CHALLAN');
    await expect(print).toContainText('Rashid');
    await expect(print).toContainText('LES-1234');
    await expect(print).toContainText('Received by');
    await expect(print).toContainText('7 can'); // 10 sold − 3 returned
    await expect(print).not.toContainText('6,535');
    await shot(page, 'sales-challan');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // --- Returns tab lists the credit note.
    await page.getByRole('tab', { name: /Returns/ }).click();
    await expect(page.getByText(/CN-1 .* bill INV-1/)).toBeVisible();
    await expect(page.getByText('Rs. 6,000 given back')).toBeVisible();

    // --- Quotation for Haji Karim, then turn it into a bill.
    await page.getByRole('tab', { name: /Quotations/ }).click();
    await page.getByRole('button', { name: 'New Quotation' }).click();
    const q = page.getByRole('dialog', { name: 'New Quotation' });
    await q.getByLabel('Customer', { exact: true }).selectOption('c2');
    await q.getByLabel('Quote item 1', { exact: true }).selectOption('p3');
    await q.getByLabel('Quote qty 1', { exact: true }).fill('5');
    await q.getByLabel('Quote price 1', { exact: true }).fill('6400');
    await q.getByRole('button', { name: 'Save & Print' }).click();
    await expect(print).toContainText('QUOTATION');
    await expect(print).toContainText('QT-1');
    await expect(print).toContainText('32,000');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Not sent')).toBeVisible();
    await page.getByRole('button', { name: 'Make bill from QT-1' }).click();
    const fromQuote = page.getByRole('dialog', { name: 'New Bill' });
    await expect(fromQuote.getByLabel('Customer', { exact: true })).toHaveValue('c2');
    await expect(fromQuote.getByLabel('Quantity 1', { exact: true })).toHaveValue('5');
    await expect(fromQuote.getByLabel('Price 1', { exact: true })).toHaveValue('6400');
    await fromQuote.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(fromQuote).toBeHidden();
    await expect(page.getByText('Billed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bill INV-2' })).toBeVisible();
    await shot(page, 'sales-quotations');
  });
});

test.describe('Sales documents on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(seed);
  });

  test('return, quotation and customer rates fit at 390px', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: 'New Bill' }).first().click();
    const bill = page.getByRole('dialog', { name: 'New Bill' });
    await bill.getByLabel('Customer', { exact: true }).selectOption('c1');
    await bill.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await bill.getByLabel('Quantity 1', { exact: true }).fill('4');
    await bill.getByRole('button', { name: 'Add discount to item 1' }).click();
    await bill.getByLabel('Discount 1', { exact: true }).fill('100');
    await noOverflow(page, 'new bill with line discount');
    await bill.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bill).toBeHidden();

    await page.getByRole('button', { name: 'Bills', exact: true }).first().click();
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    const detail = page.getByRole('dialog', { name: 'Bill INV-1' });
    await detail.getByRole('button', { name: 'Return items' }).click();
    const ret = page.getByRole('dialog', { name: 'Return items — Bill INV-1' });
    await ret.getByLabel('Return qty 1', { exact: true }).fill('1');
    // Nothing was paid, so it comes off what they owe: 4 × 2,000 − 100 = 7,900 → 1,975 each.
    await expect(ret.getByTestId('return-total')).toHaveText('Rs. 1,975');
    await expect(ret.getByRole('radio', { name: /Take it off what they owe/ })).toHaveAttribute('aria-checked', 'true');
    await noOverflow(page, 'return items');
    await ret.getByLabel('Print the credit note after saving').uncheck();
    await ret.getByRole('button', { name: 'Save return' }).click();
    const again = page.getByRole('dialog', { name: 'Bill INV-1' });
    await expect(again.getByTestId('bill-net-total')).toHaveText('Rs. 5,925');
    await noOverflow(page, 'bill with return');
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: /Quotations/ }).click();
    await page.getByRole('button', { name: 'New Quotation' }).click();
    await noOverflow(page, 'new quotation');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Customers', exact: true }).first().click();
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    await expect(page.getByTestId('customer-rates')).toBeVisible();
    await noOverflow(page, 'customer rates');
  });
});
