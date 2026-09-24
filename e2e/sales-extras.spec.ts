import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';

/**
 * Sales extras: salesmen & areas, schemes (free goods on New Bill), freight on a bill, receive from
 * many customers (collection sheet), recovery list and interest — desktop and a 390px phone.
 */
const seed = () => {
  if (localStorage.getItem('e2e_sx_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_sx_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().split('T')[0];
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', companyPhone: '3410550055', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: 'Z01', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', totalDue: 13070, creditLimit: 0, createdAt: day(120) },
    { id: 'c2', name: 'Old Khan Store', company: 'Old Khan Store', phone: '03001112223', email: '', address: 'Swat', totalDue: 8000, creditLimit: 0, createdAt: day(120) },
  ]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '16 L Tin Dalda', category: 'Oil', unit: 'tin', unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 100, minThresholdKg: 0 },
    { id: 'p2', name: '5 kgs Can', category: 'Oil', unit: 'can', unitPricePerKg: 2000, costPricePerKg: 1700, stockKg: 50, minThresholdKg: 0 },
  ]);
  set('tradeflow_ledger_v2', [
    { id: 'g1', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'OLD-1', date: day(70), description: 'Old bill', debit: 13070, credit: 0, balanceAfter: 13070 },
    { id: 'g2', entityType: 'customer', entityId: 'c2', type: 'bill_issued', referenceId: 'OLD-2', date: day(10), description: 'Old bill', debit: 8000, credit: 0, balanceAfter: 8000 },
  ]);
  set('tradeflow_schemes_v1', [{ id: 'sch1', name: 'Dalda bonus', productId: 'p1', kind: 'free_every', buyQty: 10, freeQty: 1, active: true, createdAt: day(5) }]);
  ['tradeflow_invoices_v1', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_cheques_v1', 'tradeflow_salesmen_v1', 'tradeflow_areas_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(seed);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

async function noSideScroll(page: Page, label: string) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(r.sw, `${label}: page is wider than the screen`).toBeLessThanOrEqual(r.w);
}

async function openHub(page: Page) {
  await goTo(page, 'Customers');
  await page.getByRole('main').getByRole('button', { name: 'Sales & recovery' }).click();
  const hub = page.getByRole('dialog', { name: 'Sales & recovery' });
  await expect(hub).toBeVisible();
  return hub;
}

async function addTeam(page: Page) {
  const hub = await openHub(page);
  await hub.getByRole('button', { name: /Salesmen & areas/ }).click();
  const team = page.getByRole('dialog', { name: 'Salesmen & areas' });
  await team.getByLabel('Name', { exact: true }).fill('Rashid');
  await team.getByLabel('Commission %').fill('2');
  await team.getByRole('button', { name: 'Add salesman' }).click();
  await expect(team.getByTestId('salesmen-list')).toContainText('2% on sales');
  await team.getByRole('tab', { name: /Areas/ }).click();
  await team.getByLabel('Area name').fill('Saddar');
  await team.getByRole('button', { name: 'Add area' }).click();
  await expect(team.getByTestId('areas-list')).toContainText('Saddar');
  await page.keyboard.press('Escape');
  await expect(team).toBeHidden();
  // The customer gets Saddar and Rashid as defaults.
  await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Zaman and Co BTK' });
  const panel = sheet.getByTestId('customer-sales-panel');
  await panel.getByLabel('Area', { exact: true }).selectOption({ label: 'Saddar' });
  await panel.getByLabel('Salesman', { exact: true }).selectOption({ label: 'Rashid' });
  await panel.getByRole('button', { name: 'Save area & salesman' }).click();
  await expect(panel).toContainText('Zaman and Co BTK saved.');
  await page.keyboard.press('Escape');
}

test.describe('Sales extras (desktop)', () => {
  test('salesman & area default onto a bill; scheme adds a free line; freight; print shows them', async ({ page }) => {
    await open(page);
    await addTeam(page);

    await goTo(page, 'Home');
    await page.getByRole('main').getByRole('button', { name: 'New Bill', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Bill' });
    await dialog.getByLabel('Customer', { exact: true }).selectOption('c1');
    await expect(dialog.getByLabel('Salesman', { exact: true })).toHaveValue(/sm-/);
    await expect(dialog.getByLabel('Area', { exact: true })).not.toHaveValue('');
    await dialog.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('9');
    await expect(dialog.getByTestId('bill-free-lines')).toHaveCount(0);
    await dialog.getByLabel('Quantity 1', { exact: true }).fill('20');
    const free = dialog.getByTestId('bill-free-lines');
    await expect(free).toContainText('16 L Tin Dalda');
    await expect(free).toContainText('× 2');
    // Remove, then put it back.
    await free.getByRole('button', { name: 'Remove free 16 L Tin Dalda' }).click();
    await expect(dialog.getByTestId('bill-free-lines')).toHaveCount(0);
    await dialog.getByRole('button', { name: /Put back the removed scheme/ }).click();
    await expect(dialog.getByTestId('bill-free-lines')).toBeVisible();
    await dialog.getByLabel('Freight / loading (Rs.)').fill('500');
    await expect(dialog).toContainText('Rs. 20,500');
    await dialog.getByRole('button', { name: 'Save & Print' }).click();
    await expect(dialog).toBeHidden();
    const root = page.locator('#print-root');
    await expect(root).toContainText('INVOICE');
    await expect(root.getByTestId('print-free-line')).toContainText('FREE — Dalda bonus');
    await expect(root.getByTestId('print-freight')).toContainText('500');
    await expect(root.getByTestId('print-bill-salesman')).toContainText('Salesman: Rashid · Area: Saddar');
    await page.getByRole('button', { name: 'Close preview' }).click();

    // Stock: 20 sold + 2 free.
    await goTo(page, 'Items & Prices');
    await expect(page.getByRole('main')).toContainText('78');

    // Sales by salesman shows the bill; recovery list groups by area and prints.
    const hub = await openHub(page);
    await hub.getByRole('button', { name: /Sales by salesman/ }).click();
    const rep = page.getByRole('dialog', { name: 'Sales reports' });
    await expect(rep.getByTestId('sales-by-table')).toContainText('Rashid');
    await expect(rep.getByTestId('sales-by-table')).toContainText('Rs. 20,000');
    await rep.getByRole('tab', { name: 'Recovery list' }).click();
    await rep.getByRole('tab', { name: 'By area' }).click();
    const list = rep.getByTestId('recovery-list');
    await expect(list).toContainText('Saddar');
    await expect(list).toContainText('No area');
    await expect(list).toContainText('Old Khan Store');
    await rep.getByRole('button', { name: 'Print' }).click();
    await expect(page.locator('#print-root').getByTestId('print-recovery')).toContainText('Received');
    await page.getByRole('button', { name: 'Close preview' }).click();

    // Commission: 2% of Rs. 20,000; paying it books the expense and clears what is owed.
    await rep.getByRole('tab', { name: 'Commission' }).click();
    const com = rep.getByTestId('commission-list');
    await expect(com).toContainText('Rashid');
    await expect(com).toContainText('still owed Rs. 400');
    await com.getByRole('button', { name: 'Pay commission' }).click();
    await rep.getByTestId('pay-commission-form').getByRole('button', { name: 'Pay', exact: true }).click();
    await expect(rep).toContainText(/400 commission paid to Rashid/);
    await expect(com).toContainText('still owed Rs. 0');
  });

  test('receive from many is a voucher table: no customer list; code + Enter fills the line; same customer twice is refused', async ({ page }) => {
    await open(page);
    await goTo(page, 'Money');
    await page.getByRole('main').getByRole('button', { name: 'Receive from many' }).click();
    const dlg = page.getByRole('dialog', { name: 'Receive from many' });
    await expect(dlg.getByTestId('receive-many-row')).toHaveCount(1); // one empty line, nobody listed
    await expect(dlg.getByRole('checkbox')).toHaveCount(0);
    await dlg.getByLabel('Line 1 code').fill('z01'); // any case
    await dlg.getByLabel('Line 1 code').press('Enter');
    await expect(dlg.getByLabel('Line 1 customer')).toHaveValue('c1');
    await expect(dlg.getByTestId('rm-balance-1')).toHaveText('Rs. 13,070');
    await expect(dlg.getByLabel('Line 1 amount')).toBeFocused();
    await page.keyboard.type('1000');
    await page.keyboard.press('Enter');
    await expect(dlg.getByTestId('receive-many-row')).toHaveCount(2);
    await expect(dlg.getByLabel('Line 2 code')).toBeFocused();
    await page.keyboard.type('Z01');
    await page.keyboard.press('Enter');
    await expect(dlg.getByText(/Zaman and Co BTK is already on line 1/)).toBeVisible();
    await expect(dlg.getByLabel('Line 2 customer')).toHaveValue('');
    // The name list shows names without the code.
    await expect(dlg.getByLabel('Line 2 customer').locator('option', { hasText: 'Zaman and Co BTK' })).not.toContainText('Z01');
  });

  test('receive from many: tick customers, one save, collection sheet prints; interest preview and post', async ({ page }) => {
    await open(page);
    await goTo(page, 'Money');
    await page.getByRole('main').getByRole('button', { name: 'Receive from many' }).click();
    const dlg = page.getByRole('dialog', { name: 'Receive from many' });
    await expect(dlg.getByTestId('rm-next-number')).toHaveText('CS-1'); // shown before saving
    await dlg.getByLabel('Line 1 code').fill('Z01');
    await dlg.getByLabel('Line 1 code').press('Enter');
    await dlg.getByLabel('Line 1 amount').fill('5000');
    await dlg.getByRole('button', { name: 'Add row' }).click();
    await dlg.getByLabel('Line 2 customer').selectOption('c2');
    await expect(dlg.getByTestId('rm-balance-2')).toHaveText('Rs. 8,000');
    await dlg.getByLabel('Line 2 amount').fill('8000');
    await dlg.getByLabel('Line 2 method').selectOption('Bank Transfer');
    await expect(dlg.getByTestId('receive-many-count')).toContainText('2 customer(s)');
    await expect(dlg.getByTestId('receive-many-total')).toHaveText('Rs. 13,000');
    await dlg.getByRole('button', { name: 'Save & Print' }).click();
    const sheet = page.locator('#print-root').getByTestId('print-collection');
    await expect(sheet).toContainText('Zaman and Co BTK');
    await expect(sheet).toContainText('Old Khan Store');
    await expect(sheet).toContainText('Rs. 13,000');
    await expect(page.locator('#print-root')).toContainText('CS-1');
    await page.getByRole('button', { name: 'Close preview' }).click();
    const done = page.getByRole('dialog', { name: 'Money received' });
    await expect(done).toContainText(/13,000 received from 2 customers \(CS-1\)/);
    await done.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('main')).toContainText('Rs. 8,070');

    // Interest: off until a rate is set on the customer.
    const hub = await openHub(page);
    await hub.getByRole('button', { name: /Charge interest/ }).click();
    const run = page.getByRole('dialog', { name: 'Charge interest' });
    await expect(run).toContainText('Interest is off for every customer');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    const panel = page.getByRole('dialog', { name: 'Zaman and Co BTK' }).getByTestId('customer-sales-panel');
    await panel.getByLabel('Interest % a month').fill('2');
    await panel.getByLabel('After how many days').fill('30');
    await panel.getByRole('button', { name: 'Save area & salesman' }).click();
    await expect(panel).toContainText('saved');
    await page.keyboard.press('Escape');
    const hub2 = await openHub(page);
    await hub2.getByRole('button', { name: /Charge interest/ }).click();
    const run2 = page.getByRole('dialog', { name: 'Charge interest' });
    const preview = run2.getByTestId('interest-preview');
    await expect(preview).toContainText('Zaman and Co BTK');
    await run2.getByRole('button', { name: 'Post interest' }).click();
    await expect(run2).toContainText('charged to 1 customer');
    await expect(run2.getByTestId('interest-preview')).toHaveCount(0);
  });
});

test.describe('Edit a saved payment', () => {
  test('a Receive-from-many line is edited from the customer; same CS number, balance and cash book follow', async ({ page }) => {
    await open(page);
    await goTo(page, 'Money');
    await page.getByRole('main').getByRole('button', { name: 'Receive from many' }).click();
    const dlg = page.getByRole('dialog', { name: 'Receive from many' });
    await dlg.getByLabel('Line 1 code').fill('Z01');
    await dlg.getByLabel('Line 1 code').press('Enter');
    await expect(dlg.getByLabel('Line 1 amount')).toBeFocused();
    await dlg.getByLabel('Line 1 amount').fill('1000');
    await dlg.getByLabel('Line 1 narration').fill('first round');
    await expect(dlg.getByTestId('receive-many-total')).toHaveText('Rs. 1,000');
    await dlg.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('dialog', { name: 'Money received' }).getByRole('button', { name: 'Done' }).click();

    await goTo(page, 'Customers');
    await page.getByRole('button', { name: /Zaman and Co BTK/ }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Zaman and Co BTK' });
    await sheet.getByRole('button', { name: 'Edit payment CS-1' }).click();
    const ed = page.getByRole('dialog', { name: 'Edit payment CS-1' });
    await expect(ed.getByLabel('Amount')).toHaveValue('1000');
    await expect(ed.getByLabel('Note')).toHaveValue('first round');
    await ed.getByLabel('Amount').fill('1500');
    await ed.getByLabel('Method').selectOption('Bank Transfer');
    await ed.getByRole('button', { name: 'Save changes' }).click();
    await expect(ed).toBeHidden();
    await expect(sheet).toContainText('Rs. 11,570'); // 13,070 − 1,500
    await expect(sheet).toContainText('edited');
    await page.keyboard.press('Escape');

    // The cash book shows the new amount and method, under the same number, with its own Edit.
    await goTo(page, 'Money');
    await page.getByRole('button', { name: 'Cash book', exact: true }).click();
    const main = page.getByRole('main');
    await expect(main.getByRole('button', { name: 'Edit payment CS-1' }).first()).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tradeflow_ledger_v2') || '[]'));
    const row = stored.find((l: { referenceId: string }) => l.referenceId === 'CS-1');
    expect(row.credit).toBe(1500);
    expect(row.method).toBe('Bank Transfer');
    expect(row.edits).toHaveLength(1);
  });
});

test.describe('Sales extras on a 390px phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('hub, receive from many and a bill with a free line fit the screen', async ({ page }) => {
    await open(page);
    const hub = await openHub(page);
    await noSideScroll(page, 'hub');
    await hub.getByRole('button', { name: /Receive from many/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Receive from many' });
    await dlg.getByLabel('Line 1 customer').selectOption('c2');
    await dlg.getByLabel('Line 1 amount').fill('500');
    await dlg.getByLabel('Line 1 amount').press('Enter');
    await expect(dlg.getByTestId('receive-many-row')).toHaveCount(2);
    await page.waitForTimeout(300);
    await noSideScroll(page, 'receive from many');
    await page.keyboard.press('Escape');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New bill' }).click();
    const bill = page.getByRole('dialog', { name: 'New Bill' });
    await bill.getByLabel('Customer', { exact: true }).selectOption('c2');
    await bill.getByLabel('Item 1', { exact: true }).selectOption('p1');
    await bill.getByLabel('Quantity 1', { exact: true }).fill('10');
    await expect(bill.getByTestId('bill-free-lines')).toContainText('Dalda bonus');
    await page.waitForTimeout(300);
    await noSideScroll(page, 'new bill with a free line');
  });
});
