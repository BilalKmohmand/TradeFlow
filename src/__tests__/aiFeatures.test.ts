/**
 * AI features, browser side: the data sent to /api/ai (trimmed, permission-filtered, never a secret), the
 * checks on what comes back, the catalog-matching fallback for bill lines, and the fetch wrapper.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Cheque, Customer, Invoice, LedgerEntry, Product, Supplier } from '../types';
import { AiShopData, buildAskContext, buildBillCatalog, buildSummaryContext, guessLanguage, periodRange, reminderFacts, aiScreens, normText } from '../ai/context';
import { bestMatch, matchProduct, nameScore, parseAskResult, parseBillResult, parseReminderResult, parseSummaryResult } from '../ai/parse';
import { AI_NOT_SET_UP, callAi } from '../ai/client';

const TODAY = '2026-09-25';

const cust = (id: string, name: string, extra: Partial<Customer> = {}): Customer => ({ id, name, company: name, phone: '03001234567', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01', ...extra });
const prod = (id: string, name: string, extra: Partial<Product> = {}): Product => ({ id, name, category: 'Ghee', unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 50, minThresholdKg: 5, unit: 'tin', ...extra });
const bill = (id: string, no: string, customerId: string, date: string, lines: [string, number, number][], due = 0): Invoice => {
  const items = lines.map(([pid, qty, rate], i) => ({ id: `${id}-${i}`, productId: pid, productName: pid, kg: qty, ratePerKg: rate, amount: qty * rate, qty, unitPrice: rate, costPricePerKg: rate * 0.8 }));
  const total = items.reduce((a, x) => a + x.amount, 0);
  return { id, invoiceNumber: no, customerId, customerName: customerId, issueDate: date, dueDate: date, status: 'issued', paymentStatus: due ? 'unpaid' : 'paid', items, subtotal: total, taxRatePct: 0, taxAmount: 0, totalAmount: total, paidAmount: total - due, balanceDue: due, createdAt: `${date}T10:00:00Z`, billKind: due ? 'credit' : 'cash' } as Invoice;
};

const shop = (): AiShopData => {
  const customers = [
    // A record carrying fields that must never be sent (as if an import left them there).
    { ...cust('c1', 'Haji Karim', { code: 'C-0001', city: 'Mingora', totalDue: 9600 }), passwordHash: 'pbkdf2$SECRET', masterPin: '7860' } as unknown as Customer,
    cust('c2', 'Zaman and Co', { code: 'C-0002', city: 'Batkhela', totalDue: 28000, creditLimit: 20000 }),
    cust('c3', 'Shah Jee Kiryana', { city: 'Thana' }),
  ];
  const products = [prod('p1', '16 L Tin Dalda', { code: '101', brand: 'Dalda' }), prod('p2', '5 L Can Habib', { code: '102', unit: 'can', packName: 'carton', packSize: 4, stockKg: 3, minThresholdKg: 10 }), prod('p3', 'Salt 1 kg', { code: '103', unit: 'pcs', unitPricePerKg: 60, costPricePerKg: 45 })];
  const suppliers: Supplier[] = [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '', email: '', materialCategory: 'Oil', totalOwed: 50000, address: '', createdAt: '2026-01-01' }];
  const invoices = [bill('b1', 'INV-1', 'c2', '2026-08-01', [['p1', 4, 7000]], 28000), bill('b2', 'INV-2', 'c1', '2026-09-20', [['p2', 4, 2400]], 9600), bill('b3', 'INV-3', 'c3', TODAY, [['p3', 10, 60]])];
  const ledger: LedgerEntry[] = [
    { id: 'l1', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'R-1', date: '2026-09-10', description: 'Payment', debit: 0, credit: 5000, balanceAfter: 0 },
    { id: 'l2', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'R-2', date: '2026-09-15', description: 'Payment', debit: 0, credit: 2000, balanceAfter: 0 },
  ];
  const cheques: Cheque[] = [];
  return { settings: { companyName: 'Madina Oil & Ghee', masterPin: '7860' } as never, customers, suppliers, products, invoices, ledger, cheques, returns: [], purchases: [] };
};

describe('Ask the shop: context', () => {
  it('puts the customer the question names first, with balance, city, code and last payment', () => {
    const ctx = buildAskContext(shop(), { today: TODAY, question: 'Haji Karim ka kitna udhaar hai?', canFinance: true });
    const customers = ctx.customers as { id: string; name: string; owes: number; city: string; code: string; lastPayment: { date: string; amount: number } }[];
    expect(customers[0]).toMatchObject({ id: 'c1', name: 'Haji Karim', owes: 9600, city: 'Mingora', code: 'C-0001', lastPayment: { date: '2026-09-15', amount: 2000 } });
    expect(ctx.shop).toBe('Madina Oil & Ghee');
    expect(ctx.today).toBe(TODAY);
    expect((ctx.sales as { today: { amount: number; bills: number } }).today).toEqual({ amount: 600, bills: 1 });
    expect(ctx.receivableTotal).toBe(37600);
    // Low stock and suppliers are there too.
    const items = ctx.items as { id: string; low?: boolean }[];
    expect(items.find((i) => i.id === 'p2')?.low).toBe(true);
    expect((ctx.suppliers as { youOwe: number }[])[0].youOwe).toBe(50000);
  });

  it('a bill number or a customer code in the question brings that bill / customer', () => {
    const ctx = buildAskContext(shop(), { today: TODAY, question: 'INV-1 kis ka hai?', canFinance: false });
    expect((ctx.recentBills as { id: string }[])[0].id).toBe('b1');
    const byCode = buildAskContext(shop(), { today: TODAY, question: 'C-0001 ka balance?', canFinance: false });
    expect((byCode.customers as { id: string }[])[0].id).toBe('c1');
  });

  it('never sends passwords, hashes, PINs or phone numbers', () => {
    const text = JSON.stringify(buildAskContext(shop(), { today: TODAY, question: 'sab batao', canFinance: true, finance: { cash: 1, bank: 2, profitToday: 3, profitMonth: 4 } }));
    expect(text).not.toMatch(/password|hash|SECRET|masterPin|7860|03001234567/i);
    const sum = JSON.stringify(buildSummaryContext(shop(), { today: TODAY, period: 'month', canFinance: true }));
    expect(sum).not.toMatch(/password|hash|SECRET|masterPin|7860/i);
  });

  it('a user without finance rights gets no profit, cost, cash or bank', () => {
    const ctx = buildAskContext(shop(), { today: TODAY, question: 'is mahine ka munafa?', canFinance: false, finance: { cash: 111, bank: 222, profitToday: 333, profitMonth: 444 } });
    const text = JSON.stringify(ctx);
    expect(ctx.money).toBeUndefined();
    expect(ctx.grossProfit).toBeUndefined();
    expect(text).not.toMatch(/"cost"|profit"|"money"/);
    expect(String(ctx.access)).toMatch(/may not see profit/);
    const full = buildAskContext(shop(), { today: TODAY, question: 'munafa', canFinance: true, finance: { cash: 111, bank: 222, profitToday: 333, profitMonth: 444 } });
    expect(full.money).toEqual({ cash: 111, bank: 222 });
    expect(full.grossProfit).toEqual({ today: 333, thisMonth: 444 });
    expect((full.items as { cost?: number }[]).some((i) => i.cost === 800)).toBe(true);
    // The summary follows the same rule.
    const s = buildSummaryContext(shop(), { today: TODAY, period: 'month', canFinance: false, finance: { cash: 1, bank: 2 } });
    expect(JSON.stringify(s)).not.toMatch(/profit|"money"/);
    expect(buildSummaryContext(shop(), { today: TODAY, period: 'month', canFinance: true }).grossProfit).toBeDefined();
  });

  it('a big shop is cut down to fit, keeping the named customer', () => {
    const big = shop();
    for (let i = 0; i < 400; i++) big.customers.push(cust(`x${i}`, `Customer number ${i} with a long shop name`, { totalDue: 1000 + i, city: 'Peshawar', code: `C-${1000 + i}` }));
    for (let i = 0; i < 400; i++) big.products.push(prod(`q${i}`, `Item ${i} cooking oil 5 litre`, { code: `${2000 + i}` }));
    const ctx = buildAskContext(big, { today: TODAY, question: 'Haji Karim ka udhaar', canFinance: true, maxChars: 8000 });
    expect(JSON.stringify(ctx).length).toBeLessThanOrEqual(8000);
    expect((ctx.customers as { id: string }[])[0].id).toBe('c1');
    expect((ctx.customers as unknown[]).length).toBeLessThan(30);
    const roomy = buildAskContext(big, { today: TODAY, question: 'x', canFinance: true, maxChars: 1_000_000 });
    expect((roomy.customers as unknown[]).length).toBe(30);
    expect((roomy.items as unknown[]).length).toBe(40);
  });

  it('screens are only those this user may open', () => {
    const all = aiScreens({ can: () => true }).map((s) => s.id);
    expect(all).toEqual(expect.arrayContaining(['customers', 'bills', 'owner', 'profit-by-item']));
    const none = aiScreens({ can: () => false }).map((s) => s.id);
    expect(none).not.toContain('owner');
    expect(none).not.toContain('profit-by-item');
    expect(none).toContain('customers');
  });
});

describe('Business summary & reminder context', () => {
  it('periods and the one before', () => {
    expect(periodRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY, prevFrom: '2026-09-24', prevTo: '2026-09-24' });
    expect(periodRange('week', TODAY)).toEqual({ from: '2026-09-19', to: TODAY, prevFrom: '2026-09-12', prevTo: '2026-09-18' });
    expect(periodRange('month', '2026-03-31')).toEqual({ from: '2026-03-01', to: '2026-03-31', prevFrom: '2026-02-01', prevTo: '2026-02-28' });
  });
  it('summary has sales against the previous period, top customers and items, reorder and overdue', () => {
    const s = buildSummaryContext(shop(), { today: TODAY, period: 'month', canFinance: true });
    expect(s.sales).toEqual({ amount: 10200, bills: 2 });
    expect((s.topCustomers as { name: string }[]).length).toBe(2);
    expect((s.stockToReorder as { name: string }[]).map((x) => x.name)).toEqual(['5 L Can Habib']);
    expect(s.moneyReceivedFromCustomers).toBe(7000);
  });
  it('reminder facts: amount, oldest unpaid bill, last payment; language from the name', () => {
    const d = shop();
    const f = reminderFacts({ customer: d.customers[0], invoices: d.invoices, ledger: d.ledger, shopName: 'Madina', today: TODAY });
    expect(f).toMatchObject({ shop: 'Madina', customer: 'Haji Karim', amountDue: 9600, oldestUnpaidBill: { no: 'INV-2', date: '2026-09-20', daysAgo: 5 }, lastPayment: { date: '2026-09-15', amount: 2000 } });
    expect(JSON.stringify(f)).not.toMatch(/hash|SECRET|7860/);
    expect(guessLanguage('حاجی کریم')).toBe('urdu');
    expect(guessLanguage('Haji Karim')).toBe('roman');
  });
});

describe('Bill from photo: catalog', () => {
  it('most recently billed first, capped, only the catalog fields', () => {
    const d = shop();
    const cat = buildBillCatalog(d.customers, d.products, d.invoices, 2);
    expect(cat.customers.map((c) => c.id)).toEqual(['c3', 'c1']);
    expect(cat.products.map((p) => p.id)).toEqual(['p3', 'p2']);
    expect(cat.products[1]).toEqual({ id: 'p2', code: '102', name: '5 L Can Habib', unit: 'can', packName: 'carton', packSize: 4, price: 1000 });
    expect(Object.keys(cat.customers[1]).sort()).toEqual(['city', 'code', 'id', 'name']);
    expect(JSON.stringify(cat)).not.toMatch(/cost|800|hash|phone/i);
  });
});

describe('AI answers: checking what came back', () => {
  const known = { navIds: new Set(['customers']), customerIds: new Set(['c1']), productIds: new Set(['p1']), billIds: new Set(['b1']) };
  it('ask: keeps an open target only when it exists', () => {
    expect(parseAskResult({ answer: 'Haji Karim owes Rs. 9,600', open: { kind: 'customer', id: 'c1' } }, known)).toEqual({ answer: 'Haji Karim owes Rs. 9,600', open: { kind: 'customer', id: 'c1' } });
    expect(parseAskResult({ answer: 'x', open: { kind: 'customer', id: 'nope' } }, known)?.open).toBeNull();
    expect(parseAskResult({ answer: 'x', open: { kind: 'nav', id: 'admin-danger' } }, known)?.open).toBeNull();
    expect(parseAskResult({ answer: 'x', open: { kind: 'weird', id: 'c1' } }, known)?.open).toBeNull();
    expect(parseAskResult({ answer: '   ', open: null }, known)).toBeNull();
    expect(parseAskResult('not json', known)).toBeNull();
  });
  it('reminder and summary', () => {
    expect(parseReminderResult({ message: ' Assalam-o-Alaikum ' })).toEqual({ message: 'Assalam-o-Alaikum' });
    expect(parseReminderResult({ message: '' })).toBeNull();
    expect(parseSummaryResult({ headline: 'Good day', bullets: ['a', '', 3, 'b'] })).toEqual({ headline: 'Good day', bullets: ['a', 'b'] });
    expect(parseSummaryResult({ bullets: [] })).toBeNull();
  });

  it('bill: unknown ids dropped, bad numbers fixed and flagged, units only when the item has a pack', () => {
    const d = shop();
    const cat = buildBillCatalog(d.customers, d.products, d.invoices);
    const r = parseBillResult(
      {
        customerId: 'c1',
        customerNameGuess: 'Haji Karim',
        notes: 'second line unclear',
        lines: [
          { productId: 'p1', nameAsWritten: 'Dalda 16L', qty: 2, unit: 'base', rate: null, confidence: 0.95 },
          { productId: 'p2', nameAsWritten: 'Habib peti', qty: 3, unit: 'pack', rate: 9200, confidence: 0.5 },
          { productId: 'p3', nameAsWritten: 'namak', qty: -4, unit: 'pack', rate: -1, confidence: 7 },
          { productId: 'ghost', nameAsWritten: 'zzz unknown thing', qty: 1, unit: 'base', rate: null, confidence: 0.9 },
        ],
      },
      cat
    )!;
    expect(r.customerId).toBe('c1');
    expect(r.customerMatchedBy).toBe('ai');
    expect(r.lines[0]).toMatchObject({ productId: 'p1', qty: 2, unit: 'base', rate: null, matchedBy: 'ai', needsCheck: false });
    expect(r.lines[1]).toMatchObject({ productId: 'p2', unit: 'pack', rate: 9200, needsCheck: true });
    expect(r.lines[2]).toMatchObject({ productId: 'p3', qty: 1, unit: 'base', rate: null, confidence: 1, needsCheck: true });
    expect(r.lines[3]).toMatchObject({ productId: null, matchedBy: null, needsCheck: true, nameAsWritten: 'zzz unknown thing' });
    expect(r.notes).toBe('second line unclear');
    expect(parseBillResult({ lines: 'x' }, cat)).toBeNull();
  });

  it('bill: catalog fallback matches by name / code when the AI gave no id, and flags it', () => {
    const d = shop();
    const cat = buildBillCatalog(d.customers, d.products, d.invoices);
    const r = parseBillResult(
      {
        customerId: null,
        customerNameGuess: 'zaman',
        notes: '',
        lines: [
          { productId: null, nameAsWritten: 'Dalda tin 16 L', qty: 2, unit: 'base', rate: null, confidence: 0.4 },
          { productId: null, nameAsWritten: '103', qty: 5, unit: 'base', rate: 55, confidence: 0.3 },
          { productId: null, nameAsWritten: 'Can', qty: 1, unit: 'base', rate: null, confidence: 0.3 },
        ],
      },
      cat
    )!;
    expect(r.customerId).toBe('c2');
    expect(r.customerMatchedBy).toBe('name');
    expect(r.lines[0]).toMatchObject({ productId: 'p1', matchedBy: 'name', needsCheck: true });
    expect(r.lines[0].confidence).toBeLessThanOrEqual(0.6);
    expect(r.lines[1]).toMatchObject({ productId: 'p3', rate: 55 });
    // The only can in the list: matched, but shown for checking.
    expect(r.lines[2]).toMatchObject({ productId: 'p2', matchedBy: 'name', needsCheck: true });
  });

  it('matching: sizes must agree, ties are not guessed', () => {
    const products = [
      { id: 'a', name: '16 L Tin Dalda', unit: 'tin', price: 1 },
      { id: 'b', name: '5 L Can Dalda', unit: 'can', price: 1 },
    ];
    expect(matchProduct('dalda 16 l', products)?.id).toBe('a');
    expect(matchProduct('dalda 5 l can', products)?.id).toBe('b');
    expect(matchProduct('dalda', products)).toBeNull();
    expect(nameScore('udhaar', 'Udhar')).toBe(1);
    expect(normText('Wasooli!!')).toBe('wasoli');
    expect(bestMatch('', products)).toBeNull();
  });
});

describe('callAi', () => {
  afterEach(() => vi.restoreAllMocks());
  const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  it('posts to the same-origin /api/ai with the task', async () => {
    const f = vi.fn(async () => res(200, { ok: true, task: 'reminder', result: { message: 'Hi' } }));
    const r = await callAi('reminder', { language: 'roman', facts: {} }, { fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, result: { message: 'Hi' } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({ task: 'reminder', language: 'roman' });
    expect(JSON.stringify(init)).not.toMatch(/sk-ant|x-api-key/i);
  });
  it('503 not_configured, a 404 or an HTML page → "AI not set up"', async () => {
    for (const r of [res(503, { ok: false, code: 'not_configured', error: 'AI is not set up yet' }), res(404, null), { ok: true, status: 200, json: async () => { throw new Error('html'); } } as unknown as Response]) {
      const out = await callAi('ask', {}, { fetchImpl: (async () => r) as unknown as typeof fetch });
      expect(out).toMatchObject({ ok: false, kind: 'not_setup', message: AI_NOT_SET_UP });
    }
  });
  it('errors carry the server message; a cancelled request says so', async () => {
    const e = await callAi('ask', {}, { fetchImpl: (async () => res(422, { ok: false, code: 'refused', error: 'The AI would not answer this one.' })) as unknown as typeof fetch });
    expect(e).toMatchObject({ ok: false, kind: 'error', code: 'refused', message: 'The AI would not answer this one.' });
    const ctrl = new AbortController();
    ctrl.abort();
    const c = await callAi('ask', {}, { signal: ctrl.signal, fetchImpl: (async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }) as unknown as typeof fetch });
    expect(c).toMatchObject({ ok: false, kind: 'cancelled' });
  });
});
