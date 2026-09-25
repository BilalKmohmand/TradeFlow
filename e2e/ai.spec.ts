import { test, expect, Page, Route } from '@playwright/test';
import { signIn, OWNER } from './helpers/login';
import { goTo } from './helpers/nav';

/**
 * AI features with /api/ai mocked (page.route): the real API is never called. Ask the shop answering and
 * opening a customer, a bill filled from a pasted WhatsApp order (nothing saved), an AI payment reminder
 * sent through the WhatsApp link, the owner's AI summary, and the "AI not set up" state.
 */
const today = () => new Date().toISOString().slice(0, 10);

const seed = () => {
  if (localStorage.getItem('e2e_ai_seeded')) return;
  localStorage.setItem('e2e_ai_seeded', '1');
  const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil & Ghee Traders', companyAddress: 'Batkhela', cashOpeningBalance: 50000, openingBankBalance: 200000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: 'C-0001', name: 'Zaman and Co BTK', company: 'Zaman and Co BTK', phone: '03443838294', email: '', address: 'Batkhela', city: 'Batkhela', totalDue: 28000, creditLimit: 100000, createdAt: '2026-01-01' },
    { id: 'c2', code: 'C-0002', name: 'Haji Karim', company: 'Karim Store', phone: '03001234567', email: '', address: 'Mingora', city: 'Mingora', totalDue: 9600, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', [
    { id: 'p1', code: '101', name: '16 L Tin Dalda', category: 'Ghee', brand: 'Dalda', unit: 'tin', unitPricePerKg: 7000, costPricePerKg: 6000, stockKg: 40, minThresholdKg: 5 },
    { id: 'p2', code: '102', name: '5 L Can Habib', category: 'Oil', brand: 'Habib', unit: 'can', packName: 'carton', packSize: 4, unitPricePerKg: 2400, costPricePerKg: 2000, stockKg: 30, minThresholdKg: 10 },
  ]);
  const bill = (id: string, no: string, c: { id: string; name: string }, days: number, pid: string, name: string, qty: number, rate: number, unit: string) => {
    const items = [{ id: `${id}-0`, productId: pid, productName: name, kg: qty, ratePerKg: rate, amount: qty * rate, qty, unitPrice: rate, unit }];
    const total = qty * rate;
    return { id, invoiceNumber: no, customerId: c.id, customerName: c.name, issueDate: iso(days), dueDate: iso(days), status: 'issued', paymentStatus: 'unpaid', items, subtotal: total, taxRatePct: 0, taxAmount: 0, totalAmount: total, paidAmount: 0, balanceDue: total, createdAt: iso(days), billKind: 'credit', paymentMethod: 'Credit' };
  };
  const bills = [bill('inv-1', 'INV-1', { id: 'c1', name: 'Zaman and Co BTK' }, 40, 'p1', '16 L Tin Dalda', 4, 7000, 'tin'), bill('inv-2', 'INV-2', { id: 'c2', name: 'Haji Karim' }, 5, 'p2', '5 L Can Habib', 4, 2400, 'can')];
  set('tradeflow_invoices_v1', bills);
  set('tradeflow_ledger_v2', bills.map((b, i) => ({ id: `l${i}`, entityType: 'customer', entityId: b.customerId, type: 'bill_issued', referenceId: b.invoiceNumber, sourceId: b.id, date: b.issueDate, description: `Bill ${b.invoiceNumber}`, debit: b.totalAmount, credit: 0, balanceAfter: b.totalAmount })));
  ['tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2', 'tradeflow_journal_entries_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};

type AiBody = Record<string, unknown> & { task: string };
/** Answer /api/ai with `reply(body)`; every request body is kept for checks. */
async function mockAi(page: Page, reply: (body: AiBody) => { status?: number; json: unknown }) {
  const seen: AiBody[] = [];
  await page.route('**/api/ai', async (route: Route) => {
    const body = route.request().postDataJSON() as AiBody;
    seen.push(body);
    const r = reply(body);
    await route.fulfill({ status: r.status ?? 200, contentType: 'application/json', body: JSON.stringify(r.json) });
  });
  return seen;
}

async function open(page: Page) {
  await page.addInitScript(seed);
  await signIn(page, OWNER);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({ timeout: 10_000 });
}

test('Ask the shop: answers a Roman-Urdu question and opens the customer', async ({ page }) => {
  const seen = await mockAi(page, () => ({ json: { ok: true, task: 'ask', result: { answer: 'Haji Karim ka udhaar Rs. 9,600 hai.', open: { kind: 'customer', id: 'c2' } } } }));
  await open(page);
  // Ctrl+J opens it too; the header button is next to Find anything.
  await page.keyboard.press('Control+j');
  const dlg = page.getByRole('dialog', { name: 'Ask the shop' });
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await page.getByRole('button', { name: 'Ask the shop (AI)' }).click();
  await expect(dlg).toBeVisible();
  await dlg.getByLabel('Your question').fill('Haji Karim ka kitna udhaar hai?');
  await dlg.getByLabel('Your question').press('Enter');
  await expect(dlg.getByTestId('ai-answer')).toHaveText('Haji Karim ka udhaar Rs. 9,600 hai.');

  // What was sent: the question and a small context with the customer, never a password or key.
  expect(seen).toHaveLength(1);
  expect(seen[0].task).toBe('ask');
  expect(seen[0].question).toBe('Haji Karim ka kitna udhaar hai?');
  const ctx = seen[0].context as { customers: { id: string; owes: number }[]; shop: string };
  expect(ctx.shop).toBe('Madina Oil & Ghee Traders');
  expect(ctx.customers[0]).toMatchObject({ id: 'c2', owes: 9600 });
  expect(JSON.stringify(seen[0])).not.toMatch(/password|hash|Sarmaya@2026/i);

  await dlg.getByTestId('ai-open').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Haji Karim' })).toBeVisible();
});

test('Sale Invoice: AI fills the lines from a pasted WhatsApp order and saves nothing', async ({ page }) => {
  const seen = await mockAi(page, () => ({
    json: {
      ok: true,
      task: 'bill',
      result: {
        customerId: 'c2',
        customerNameGuess: 'Haji Karim',
        lines: [
          { productId: 'p1', nameAsWritten: 'Dalda 16 litre', qty: 2, unit: 'base', rate: null, confidence: 0.95 },
          { productId: 'p2', nameAsWritten: 'Habib peti', qty: 1, unit: 'pack', rate: null, confidence: 0.5 },
          { productId: null, nameAsWritten: 'Chini 10 kg', qty: 1, unit: 'base', rate: null, confidence: 0.2 },
        ],
        notes: '',
      },
    },
  }));
  await open(page);
  await page.getByRole('button', { name: 'Find anything' }).click();
  await page.getByRole('dialog', { name: 'Find anything' }).getByRole('combobox', { name: 'Search' }).fill('AI');
  await page.getByRole('dialog', { name: 'Find anything' }).getByRole('option', { name: /^AI: bill from photo \/ message/ }).first().click();
  const ai = page.getByRole('dialog', { name: 'AI: bill from photo / message' });
  await expect(ai).toBeVisible();
  await ai.getByLabel('Or paste the WhatsApp order').fill('Haji Karim\n2 Dalda 16 litre\n1 peti Habib\nChini 10 kg');
  await ai.getByRole('button', { name: 'Read order' }).click();
  await expect(ai).toHaveCount(0);

  expect(seen[0].task).toBe('bill');
  expect(seen[0].text).toContain('2 Dalda 16 litre');
  const catalog = seen[0].catalog as { customers: { id: string }[]; products: { id: string; price: number }[] };
  expect(catalog.products.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
  expect(JSON.stringify(catalog)).not.toMatch(/cost|6000/);

  const form = page.getByTestId('sale-invoice-form');
  await expect(form.getByTestId('bill-line')).toHaveCount(2);
  await expect(form.getByTestId('line-amount-1')).toHaveText('14,000.00');
  // 1 carton of 4 cans at Rs. 2,400 a can.
  await expect(form.getByTestId('line-amount-2')).toHaveText('9,600.00');
  await expect(form.getByTestId('ai-check-2')).toContainText('Habib peti');
  await expect(form.getByTestId('ai-check-1')).toHaveCount(0);
  await expect(form.getByTestId('ai-unmatched')).toContainText('Chini 10 kg');
  await expect(form.getByTestId('bill-party-balance')).toContainText('9,600');
  await expect(form.getByTestId('ai-filled')).toContainText('Nothing is saved');
  // Nothing saved: still the two seeded bills.
  const bills = await page.evaluate(() => JSON.parse(localStorage.getItem('tradeflow_invoices_v1') || '[]').length);
  expect(bills).toBe(2);
  // The unmatched line can be placed by hand.
  await form.getByLabel('Item for Chini 10 kg').selectOption('p1');
  await expect(form.getByTestId('bill-line')).toHaveCount(3);
  await expect(form.getByTestId('ai-unmatched')).toHaveCount(0);
});

test('AI payment reminder from the customer: written, editable, sent through WhatsApp', async ({ page }) => {
  const seen = await mockAi(page, (b) => ({ json: { ok: true, task: b.task, result: { message: 'Assalam-o-Alaikum Haji Karim sahib, aap ka baqaya Rs. 9,600 hai. Shukriya, Madina Oil & Ghee Traders' } } }));
  await open(page);
  await goTo(page, 'Customers');
  await page.getByRole('button', { name: /Haji Karim/ }).first().click();
  const cust = page.getByRole('dialog', { name: 'Haji Karim' });
  await cust.getByRole('button', { name: 'AI write reminder' }).click();
  const dlg = page.getByRole('dialog', { name: 'AI payment reminder' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel('Customer')).toHaveValue('c2');
  await expect(dlg.getByRole('button', { name: 'Roman Urdu' })).toHaveAttribute('aria-pressed', 'true');
  await dlg.getByRole('button', { name: 'English' }).click();
  await dlg.getByRole('button', { name: 'Write with AI' }).click();
  const text = dlg.getByLabel('Reminder message (you can change it)');
  await expect(text).toHaveValue(/Rs\. 9,600/);
  expect(seen[0]).toMatchObject({ task: 'reminder', language: 'english', facts: { customer: 'Haji Karim', amountDue: 9600, shop: 'Madina Oil & Ghee Traders' } });
  await text.fill('Salam Haji sahib, Rs. 9,600 baqaya hai. Shukriya');
  const link = dlg.getByTestId('ai-reminder-send');
  await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/923001234567\?text=/);
  expect(decodeURIComponent((await link.getAttribute('href'))!.split('text=')[1])).toBe('Salam Haji sahib, Rs. 9,600 baqaya hai. Shukriya');
});

test('Owner dashboard: AI summary for this week', async ({ page }) => {
  const seen = await mockAi(page, () => ({ json: { ok: true, task: 'summary', result: { headline: 'A steady week.', bullets: ['Sales Rs. 9,600 from 1 bill.', 'Zaman and Co BTK owes Rs. 28,000 for 40 days.'] } } }));
  await open(page);
  await goTo(page, 'Owner dashboard').catch(() => undefined);
  if (!(await page.getByTestId('owner-dashboard').isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Find anything' }).click();
    await page.getByRole('dialog', { name: 'Find anything' }).getByRole('combobox', { name: 'Search' }).fill('Owner dashboard');
    await page.getByRole('dialog', { name: 'Find anything' }).getByRole('option', { name: /^Owner dashboard/ }).first().click();
  }
  await page.getByTestId('owner-ai-summary').click();
  const dlg = page.getByRole('dialog', { name: 'AI business summary' });
  await dlg.getByRole('button', { name: 'This week' }).click();
  await dlg.getByRole('button', { name: 'Write summary' }).click();
  await expect(dlg.getByTestId('ai-summary')).toContainText('A steady week.');
  await expect(dlg.getByTestId('ai-summary').getByRole('listitem')).toHaveCount(2);
  expect(seen[0]).toMatchObject({ task: 'summary', period: 'week' });
  expect((seen[0].context as { period: { from: string; to: string } }).period.to).toBe(today());
});

test('"AI not set up": a friendly message, and the rest of the app keeps working', async ({ page }) => {
  await mockAi(page, () => ({ status: 503, json: { ok: false, code: 'not_configured', error: 'AI is not set up yet' } }));
  await open(page);
  await page.getByRole('button', { name: 'Ask the shop (AI)' }).click();
  const dlg = page.getByRole('dialog', { name: 'Ask the shop' });
  await dlg.getByRole('button', { name: 'aaj kitni sale hui?' }).click();
  await expect(dlg.getByTestId('ai-not-setup')).toContainText('AI not set up — ask the owner to add the key in Vercel');
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  // The reminder falls back to the standard message.
  await goTo(page, 'Customers');
  await page.getByRole('button', { name: /Haji Karim/ }).first().click();
  await page.getByRole('dialog', { name: 'Haji Karim' }).getByRole('button', { name: 'AI write reminder' }).click();
  const rem = page.getByRole('dialog', { name: 'AI payment reminder' });
  await rem.getByRole('button', { name: 'Write with AI' }).click();
  await expect(rem.getByTestId('ai-not-setup')).toBeVisible();
  await rem.getByRole('button', { name: 'Use the standard message instead' }).click();
  await expect(rem.getByLabel('Reminder message (you can change it)')).toHaveValue(/Haji Karim/);
  await page.keyboard.press('Escape');
  // Billing still works without AI.
  await page.keyboard.press('F2');
  await expect(page.getByTestId('sale-invoice-form')).toBeVisible();
});
