import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';

/**
 * v23 fixes in the real app: payment reminders on Home (one-tap WhatsApp, "last reminded"), the
 * depreciation reminder, cartons on quotations and returns, a customer with a cheque in hand can't
 * be deleted, undo a collection sheet, a deleted bill comes back from the bin — desktop and phone.
 */
const seed = () => {
  if (localStorage.getItem('e2e_v23_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_v23_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().split('T')[0];
  set('tradeflow_settings_v2', {
    appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0,
    reminders: { enabled: true, daysAfterDue: 7, olderThanDays: 30, everyDays: 7 },
  });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 13070, creditLimit: 0, createdAt: day(120) },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: day(120) },
  ]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '16 L Tin Dalda', category: 'Oil', unit: 'tin', packName: 'carton', packSize: 6, unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 120, minThresholdKg: 0 },
    { id: 'p2', name: '5 kgs Can', category: 'Oil', unit: 'can', unitPricePerKg: 2000, costPricePerKg: 1700, stockKg: 50, minThresholdKg: 0 },
  ]);
  set('tradeflow_invoices_v1', [{
    id: 'inv-old', invoiceNumber: 'INV-OLD', customerId: 'c1', customerName: 'Zaman and Co BTK', issueDate: day(40), dueDate: day(40), status: 'issued', paymentStatus: 'unpaid',
    items: [{ id: 'bi-old', productId: 'p2', productName: '5 kgs Can', kg: 6.535, ratePerKg: 2000, amount: 13070, qty: 6.535, unitPrice: 2000, unit: 'can' }],
    subtotal: 13070, taxRatePct: 0, taxAmount: 0, totalAmount: 13070, paidAmount: 0, balanceDue: 13070, createdAt: day(40), billKind: 'credit', paymentMethod: 'Credit',
  }]);
  set('tradeflow_ledger_v2', [
    { id: 'g1', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV-OLD', sourceId: 'inv-old', date: day(40), description: 'Bill INV-OLD', debit: 13070, credit: 0, balanceAfter: 13070 },
  ]);
  set('tradeflow_fixed_assets_v1', [{ id: 'fa1', name: 'Loader rickshaw', category: 'vehicle', purchaseDate: '2025-01-10', cost: 120000, paidFrom: 'owner', usefulLifeYears: 5, residualValue: 0, method: 'straight_line', status: 'in_use', createdAt: '2025-01-10' }]);
  ['tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2', 'tradeflow_quotations_v2', 'tradeflow_depreciation_runs_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  // WhatsApp links open a new tab: answer them locally instead of going to the internet.
  await page.context().route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }));
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

async function noSideScroll(page: Page, label: string) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(r.sw, `${label}: page is wider than the screen`).toBeLessThanOrEqual(r.w);
}

test('reminders, depreciation, cartons on quotations and returns, undo collection, restore a bill', async ({ page }) => {
  await open(page);

  // --- Home: send the reminder by WhatsApp; the customer is then marked reminded.
  const panel = page.getByTestId('send-reminders');
  await expect(panel).toContainText('Zaman and Co BTK');
  await expect(panel).toContainText('INV-OLD');
  const wa = panel.getByRole('link', { name: 'Send WhatsApp reminder to Zaman and Co BTK' });
  await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/923443838294\?text=.*Rohail%20Zaman%20Traders/);
  const [chat] = await Promise.all([page.context().waitForEvent('page'), wa.click()]);
  await chat.close();
  await page.bringToFront(); // the app tab was left in the background: animations pause there
  await expect(panel).toContainText('All reminders for today are done.');
  await goTo(page, 'Customers');
  await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
  await expect(page.getByTestId('last-reminded')).toContainText('(WhatsApp)');
  await page.keyboard.press('Escape');

  // --- Home: last month's depreciation has not been run → one tap runs it.
  await goTo(page, 'Home');
  const dep = page.getByTestId('depreciation-due');
  await expect(dep).toContainText('has not been run');
  await dep.getByRole('button', { name: /^Run for / }).click();
  await expect(page.getByText(/Depreciation for .* charged on 1 asset/)).toBeVisible();
  await expect(page.getByTestId('depreciation-due')).toHaveCount(0);

  // --- Quotation typed in cartons: saved in tins, printed with cartons.
  await goTo(page, 'Bills');
  await page.getByRole('tab', { name: /Quotations/ }).click();
  await page.getByRole('button', { name: 'New Quotation' }).click();
  const q = page.getByRole('dialog', { name: 'New Quotation' });
  await q.getByLabel('Customer', { exact: true }).selectOption('c2');
  await q.getByLabel('Quote item 1', { exact: true }).selectOption('p1');
  await q.getByRole('group', { name: 'Unit for quote item 1' }).getByRole('button', { name: 'carton (6)' }).click();
  await expect(q.getByLabel('Quote price 1', { exact: true })).toHaveValue('6000');
  await q.getByLabel('Quote qty 1', { exact: true }).fill('2');
  await expect(q.getByTestId('quote-line-info-1')).toContainText('= 2 cartons');
  await q.getByRole('button', { name: 'Save & Print' }).click();
  const print = page.locator('#print-root');
  await expect(print).toContainText('QUOTATION');
  await expect(print).toContainText('12 tins (2 ctn)');
  await expect(print).toContainText('6,000/ctn');
  await expect(print).toContainText('12,000');
  await page.keyboard.press('Escape');

  // --- Make the bill from it (still in cartons), then return one carton.
  await page.getByRole('button', { name: /Make bill from QT-/ }).click();
  const bill = page.getByRole('dialog', { name: 'New Bill' });
  await expect(bill.getByLabel('Quantity 1', { exact: true })).toHaveValue('2');
  await expect(bill.getByLabel('Price 1', { exact: true })).toHaveValue('6000');
  await bill.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bill).toBeHidden();
  await page.getByRole('tab', { name: 'Bills' }).click();
  await page.getByRole('button', { name: /Haji Karim/ }).first().click();
  const detail = page.getByRole('dialog', { name: /^Bill INV-/ });
  await detail.getByRole('button', { name: 'Return items' }).click();
  const ret = page.getByRole('dialog', { name: /^Return items — Bill INV-/ });
  await ret.getByRole('group', { name: 'Unit for return 1' }).getByRole('button', { name: 'carton (6)' }).click();
  await ret.getByLabel('Return qty 1', { exact: true }).fill('1');
  await expect(ret.getByTestId('return-total')).toHaveText('Rs. 6,000');
  await ret.getByRole('radio', { name: /Take it off what they owe/ }).click();
  await ret.getByRole('button', { name: 'Save return' }).click();
  await expect(print).toContainText('CREDIT NOTE');
  await expect(print).toContainText('6 tins (1 ctn)');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await goTo(page, 'Money');

  // --- Receive from many, then undo the whole sheet in one tap.
  await page.getByRole('button', { name: 'Receive from many' }).click();
  const many = page.getByRole('dialog', { name: 'Receive from many' });
  await many.getByLabel('Line 1 customer').selectOption('c1');
  await many.getByLabel('Line 1 amount').fill('3070');
  await many.getByRole('button', { name: 'Save', exact: true }).click();
  const done = page.getByRole('dialog', { name: 'Money received' });
  await done.getByTestId('undo-collection').getByRole('button', { name: /Undo collection CS-1/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Undo collection' }).click();
  await expect(done.getByText(/Collection CS-1 undone/)).toBeVisible();
  await done.getByRole('button', { name: 'Done' }).click();

  // --- Delete a bill, then bring it back from the bin (made again like a new bill).
  await goTo(page, 'Bills');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
  const last = page.getByRole('dialog', { name: 'Bill INV-OLD' });
  const oldNo = 'INV-OLD';
  await last.getByRole('button', { name: 'Delete bill' }).click();
  await page.getByRole('alertdialog').getByLabel(/Why\?/).fill('made twice');
  await page.getByRole('alertdialog').getByRole('button', { name: /Delete/ }).click();
  await goTo(page, 'Admin');
  await page.getByRole('button', { name: /Deleted records/ }).click();
  await page.getByTestId('deleted-record').filter({ hasText: `Bill ${oldNo}` }).getByRole('button', { name: /Restore/ }).click();
  await expect(page.getByText(new RegExp(`Bill ${oldNo} is back as INV-`))).toBeVisible();
});

test('customer with a cheque in hand: delete is blocked with the reason', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'New Bill' }).first().click();
  const b = page.getByRole('dialog', { name: 'New Bill' });
  await b.getByLabel('Customer', { exact: true }).selectOption('c2');
  await b.getByLabel('Item 1', { exact: true }).selectOption('p2');
  await b.getByLabel('Quantity 1', { exact: true }).fill('3');
  await b.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(b).toBeHidden();
  // A cheque from the customer is sitting in hand (as if taken at the counter).
  await page.evaluate(() => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('tradeflow_cheques_v1', JSON.stringify([{ id: 'chq-1', direction: 'received', customerId: 'c2', supplierId: null, partyName: 'Haji Karim', bankName: 'HBL', chequeNumber: '445566', amount: 1000, chequeDate: today, entryDate: today, status: 'in_hand', createdAt: today }]));
  });
  await page.reload();
  await goTo(page, 'Customers');
  await page.getByRole('button', { name: /Haji Karim/ }).first().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/445566.*Money → Cheques/)).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('reminders panel and quotation cartons fit a phone', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('send-reminders')).toBeVisible();
    await noSideScroll(page, 'home with reminders');
    await goTo(page, 'Bills');
    await page.getByRole('tab', { name: /Quotations/ }).click();
    await page.getByRole('button', { name: 'New Quotation' }).click();
    const q = page.getByRole('dialog', { name: 'New Quotation' });
    await q.getByLabel('Quote item 1', { exact: true }).selectOption('p1');
    await expect(q.getByRole('group', { name: 'Unit for quote item 1' })).toBeVisible();
    await noSideScroll(page, 'quotation with cartons');
  });
});
