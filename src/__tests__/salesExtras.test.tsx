import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { ACC, DEFAULT_ACCOUNTS, EXPENSE_ACCOUNT, accountTotals, buildJournal, trialBalance } from '../utils/accounting';
import { collectCashMovements, accountBalancesOn } from '../utils/finance';
import { commissionReport, evaluateSchemes, interestPreview, openItems, recoveryList, salesByGroup, schemeFreeQty, schemeRule, validateScheme } from '../utils/salesExtras';
import { shiftDate, todayISO } from '../utils/stockFlow';
import { Customer, LedgerEntry, Scheme } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();
const ago = (n: number) => shiftDate(today, -n);

const setup = async (opts: { as?: 'owner' | 'operator'; taxRatePct?: number } = {}) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: opts.taxRatePct ?? 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman Store', company: 'Zaman Store', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
    { id: 'c2', name: 'Bismillah Traders', company: 'Bismillah Traders', phone: '0345', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', [
    { id: 'p1', name: 'Dalda 5L tin', category: 'Oil', unit: 'tin', unitPricePerKg: 2000, costPricePerKg: 1500, stockKg: 100, minThresholdKg: 0 },
    { id: 'p2', name: 'Ghee 1kg', category: 'Ghee', unit: 'pack', unitPricePerKg: 500, costPricePerKg: 400, stockKg: 50, minThresholdKg: 0 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2', 'tradeflow_quotations_v2', 'tradeflow_agreed_rates_v1'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, opts.as === 'operator' ? OPERATOR : undefined);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => { out = fn(); });
  return out!;
};
const books = (h: Hook) => {
  const t = h.result.current;
  return buildJournal({ settings: t.settings, customers: t.customers, suppliers: t.suppliers, ledger: t.ledger, invoices: t.invoices, dispatches: t.dispatches, purchases: t.purchases, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, returns: t.returns, adjustments: t.adjustments });
};
const net = (h: Hook, code: string) => accountTotals(books(h)).get(code)?.net ?? 0;
const balanced = (h: Hook) => expect(trialBalance(books(h), DEFAULT_ACCOUNTS, today).balanced).toBe(true);
const cust = (h: Hook, id = 'c1') => h.result.current.customers.find((c) => c.id === id)!;
const stock = (h: Hook, id: string) => h.result.current.products.find((p) => p.id === id)!.stockKg;
const money = (h: Hook) => {
  const t = h.result.current;
  return accountBalancesOn(collectCashMovements(t.ledger, t.expenses, t.cashEntries, t.customers, t.suppliers), t.settings, today);
};
const makeBill = (h: Hook, input: Record<string, unknown> = {}) => {
  const r = run(() => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L tin', qty: 10, unitPrice: 2000 }], ...input } as any));
  expect(r.success, r.message).toBe(true);
  return r.invoice!;
};

const scheme = (patch: Partial<Scheme>): Scheme => ({ id: 's', name: 'Bonus', productId: 'p1', kind: 'free_every', buyQty: 10, freeQty: 1, active: true, createdAt: '2026-01-01', ...patch });

beforeEach(() => localStorage.clear());

describe('scheme rules (pure)', () => {
  it('buy 10 get 1 repeats; slabs give the highest slab once; % off needs the minimum qty', () => {
    expect(schemeFreeQty(scheme({}), 9)).toBe(0);
    expect(schemeFreeQty(scheme({}), 10)).toBe(1);
    expect(schemeFreeQty(scheme({}), 25)).toBe(2);
    const slab = scheme({ kind: 'free_slab', slabs: [{ minQty: 50, freeQty: 3 }, { minQty: 100, freeQty: 7 }] });
    expect(schemeFreeQty(slab, 49)).toBe(0);
    expect(schemeFreeQty(slab, 60)).toBe(3);
    expect(schemeFreeQty(slab, 120)).toBe(7);
    expect(schemeRule(slab, 'tin')).toBe('50+ tin → 3 free, 100+ tin → 7 free');
    const pct = scheme({ id: 'pc', kind: 'pct_off', minQty: 20, pctOff: 5 });
    expect(evaluateSchemes([pct], [{ productId: 'p1', qty: 19 }], 'c1', today).pct.p1).toBeUndefined();
    expect(evaluateSchemes([pct], [{ productId: 'p1', qty: 12 }, { productId: 'p1', qty: 8 }], 'c1', today).pct.p1.pct).toBe(5);
  });

  it('respects dates, chosen customers, "off" and the other free item; lines of one item add up', () => {
    const s = scheme({ fromDate: ago(5), toDate: today, customerIds: ['c1'], freeProductId: 'p2' });
    expect(evaluateSchemes([s], [{ productId: 'p1', qty: 6 }, { productId: 'p1', qty: 4 }], 'c1', today).free).toEqual([{ key: 's|p2', schemeId: 's', schemeName: 'Bonus', forProductId: 'p1', productId: 'p2', qty: 1 }]);
    expect(evaluateSchemes([s], [{ productId: 'p1', qty: 10 }], 'c2', today).free).toHaveLength(0);
    expect(evaluateSchemes([s], [{ productId: 'p1', qty: 10 }], 'c1', ago(6)).free).toHaveLength(0);
    expect(evaluateSchemes([{ ...s, active: false }], [{ productId: 'p1', qty: 10 }], 'c1', today).free).toHaveLength(0);
    // Two schemes on one item: the customer gets the better one.
    const better = scheme({ id: 's2', name: 'Better', buyQty: 5, freeQty: 1 });
    expect(evaluateSchemes([scheme({}), better], [{ productId: 'p1', qty: 10 }], 'c1', today).free[0]).toMatchObject({ schemeId: 's2', qty: 2 });
  });

  it('validation explains what is missing', () => {
    expect(validateScheme({ name: '', productId: 'p1', kind: 'free_every' })).toMatch(/name/);
    expect(validateScheme({ name: 'x', productId: 'p1', kind: 'free_every', buyQty: 10 })).toMatch(/free/);
    expect(validateScheme({ name: 'x', productId: 'p1', kind: 'free_slab', slabs: [{ minQty: 5, freeQty: 1 }, { minQty: 5, freeQty: 2 }] })).toMatch(/same quantity/);
    expect(validateScheme({ name: 'x', productId: 'p1', kind: 'pct_off', minQty: 5, pctOff: 150 })).toMatch(/%/);
    expect(validateScheme({ name: 'x', productId: 'p1', kind: 'free_every', buyQty: 10, freeQty: 1, fromDate: today, toDate: ago(1) })).toMatch(/end date/);
    expect(validateScheme({ name: 'x', productId: 'p1', kind: 'free_every', buyQty: 10, freeQty: 1 })).toBeNull();
  });
});

describe('free goods on a bill', () => {
  it('free line takes stock at price 0; its cost goes to Scheme / free goods (not cost of sales); books balance', async () => {
    const h = await setup();
    const inv = makeBill(h, { items: [{ productId: 'p1', name: 'Dalda 5L tin', qty: 10, unitPrice: 2000 }, { productId: 'p1', name: 'Dalda 5L tin', qty: 1, unitPrice: 999, free: true, schemeId: 'sch1', schemeName: 'Buy 10 get 1' }] });
    expect(inv.totalAmount).toBe(20000);
    const free = inv.items.find((i) => i.free)!;
    expect(free).toMatchObject({ unitPrice: 0, amount: 0, qty: 1, schemeName: 'Buy 10 get 1' });
    expect(stock(h, 'p1')).toBe(89);
    expect(cust(h).totalDue).toBe(20000);
    expect(net(h, ACC.COGS)).toBe(15000);
    expect(net(h, ACC.SCHEME_GOODS)).toBe(1500);
    expect(net(h, ACC.SALES)).toBe(-20000);
    expect(DEFAULT_ACCOUNTS.find((a) => a.code === '5250')!.name).toBe('Scheme / free goods');
    balanced(h);
    expect(h.result.current.ledger.find((l) => l.type === 'bill_issued')!.description).toContain('(free)');
  });

  it('a bill of only free goods is refused; deleting the bill puts the free stock back', async () => {
    const h = await setup();
    const r = run(() => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'x', qty: 1, unitPrice: 0, free: true }] }));
    expect(r.success).toBe(false);
    const inv = makeBill(h, { items: [{ productId: 'p1', name: 'Dalda', qty: 10, unitPrice: 2000 }, { productId: 'p2', name: 'Ghee', qty: 2, unitPrice: 0, free: true }] });
    expect(stock(h, 'p2')).toBe(48);
    expect(run(() => h.result.current.deleteBill(inv.id)).success).toBe(true);
    expect(stock(h, 'p2')).toBe(50);
    expect(stock(h, 'p1')).toBe(100);
  });

  it('free goods returned with the bill come back at cost and reverse the scheme expense', async () => {
    const h = await setup();
    const inv = makeBill(h, { items: [{ productId: 'p1', name: 'Dalda', qty: 10, unitPrice: 2000 }, { productId: 'p1', name: 'Dalda', qty: 1, unitPrice: 0, free: true, schemeName: 'B' }] });
    const [paid, free] = inv.items;
    const r = run(() => h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: paid.id, qty: 10 }, { billLineId: free.id, qty: 1 }], settle: 'credit' }));
    expect(r.success, r.message).toBe(true);
    expect(stock(h, 'p1')).toBe(100);
    expect(net(h, ACC.SCHEME_GOODS)).toBe(0);
    expect(net(h, ACC.COGS)).toBe(0);
    balanced(h);
  });
});

describe('freight on a bill', () => {
  it('is added to the total (no tax on it), owed by the customer and credited to Freight income 4100', async () => {
    const h = await setup({ taxRatePct: 10 });
    const inv = makeBill(h, { freightCharges: 500, paidNow: 1000, paymentMethod: 'Cash' });
    expect(inv.taxAmount).toBe(2000);
    expect(inv.freightCharges).toBe(500);
    expect(inv.totalAmount).toBe(22500);
    expect(inv.balanceDue).toBe(21500);
    expect(cust(h).totalDue).toBe(21500);
    expect(net(h, ACC.FREIGHT_INCOME)).toBe(-500);
    expect(net(h, ACC.SALES)).toBe(-20000);
    expect(net(h, ACC.SALES_TAX)).toBe(-2000);
    balanced(h);
    expect(run(() => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'x', qty: 1, unitPrice: 10 }], freightCharges: -5 })).success).toBe(false);
  });
});

describe('salesmen, areas and the bill', () => {
  it('bill takes the customer’s salesman and area unless the bill says otherwise; sales report groups them', async () => {
    const h = await setup();
    const rashid = run(() => h.result.current.saveSalesman({ name: 'Rashid', commissionPct: 2 })).salesman!;
    const kamran = run(() => h.result.current.saveSalesman({ name: 'Kamran', commissionPct: 1, commissionOn: 'recovery' })).salesman!;
    const saddar = run(() => h.result.current.saveArea({ name: 'Saddar' })).area!;
    expect(run(() => h.result.current.saveArea({ name: 'saddar ' })).success).toBe(false);
    expect(run(() => h.result.current.setCustomerSalesInfo('c1', { areaId: saddar.id, salesmanId: rashid.id })).success).toBe(true);
    const a = makeBill(h);
    expect(a).toMatchObject({ salesmanId: rashid.id, areaId: saddar.id });
    const b = makeBill(h, { salesmanId: kamran.id, areaId: null, items: [{ productId: 'p2', name: 'Ghee', qty: 4, unitPrice: 500 }] });
    expect(b.salesmanId).toBe(kamran.id);
    expect(b.areaId).toBeUndefined();
    const t = h.result.current;
    const bySm = salesByGroup(t.invoices, t.returns, today, today, 'salesman', { salesmen: t.salesmen, areas: t.areas });
    expect(bySm.rows.map((r) => [r.name, r.bills, r.net])).toEqual([['Rashid', 1, 20000], ['Kamran', 1, 2000]]);
    const byArea = salesByGroup(t.invoices, t.returns, today, today, 'area', { salesmen: t.salesmen, areas: t.areas });
    expect(byArea.rows.map((r) => r.name)).toEqual(['Saddar', 'No area']);
    expect(byArea.totals.net).toBe(22000);
    // A salesman on a bill is switched off, not deleted.
    const del = run(() => h.result.current.deleteSalesman(rashid.id));
    expect(del.message).toMatch(/switched off/);
    expect(h.result.current.salesmen.find((s) => s.id === rashid.id)!.active).toBe(false);
  });

  it('operators cannot change salesmen or charge interest', async () => {
    const h = await setup({ as: 'operator' });
    expect(run(() => h.result.current.saveSalesman({ name: 'X' })).success).toBe(false);
    expect(run(() => h.result.current.chargeInterest(today)).success).toBe(false);
  });
});

describe('receive from many', () => {
  const seedDues = (h: Hook) => {
    makeBill(h);
    makeBill(h, { customerId: 'c2', items: [{ productId: 'p2', name: 'Ghee', qty: 20, unitPrice: 500 }] });
  };

  it('one save → one ledger row per customer under one collection-sheet number; cash and bank split', async () => {
    const h = await setup();
    seedDues(h);
    const cashBefore = money(h).cash;
    const bankBefore = money(h).bank;
    const r = run(() => h.result.current.receiveMany({ rows: [{ customerId: 'c1', amount: 5000, method: 'Cash' }, { customerId: 'c2', amount: 10000, method: 'Bank Transfer' }], note: 'Tuesday round' }));
    expect(r.success, r.message).toBe(true);
    expect(r.sheetNo).toBe('CS-1');
    const rows = h.result.current.ledger.filter((l) => l.referenceId === 'CS-1');
    expect(rows).toHaveLength(2);
    expect(rows.every((l) => l.type === 'payment_received')).toBe(true);
    expect(cust(h).totalDue).toBe(15000);
    expect(cust(h, 'c2').totalDue).toBe(0);
    expect(money(h).cash).toBe(cashBefore + 5000);
    expect(money(h).bank).toBe(bankBefore + 10000);
    balanced(h);
    expect(run(() => h.result.current.receiveMany({ rows: [{ customerId: 'c1', amount: 1, method: 'Cash' }] })).sheetNo).toBe('CS-2');
  });

  it('refuses more than owed, cheques, a closed period and an empty list — and then records nothing', async () => {
    const h = await setup();
    seedDues(h);
    const before = h.result.current.ledger.length;
    expect(run(() => h.result.current.receiveMany({ rows: [{ customerId: 'c1', amount: 25000, method: 'Cash' }] })).message).toMatch(/owes only/);
    expect(run(() => h.result.current.receiveMany({ rows: [{ customerId: 'c1', amount: 100, method: 'Cheque' }] })).success).toBe(false);
    expect(run(() => h.result.current.receiveMany({ rows: [] })).success).toBe(false);
    run(() => h.result.current.updateSettings({ booksLockedUntil: today }));
    expect(run(() => h.result.current.receiveMany({ rows: [{ customerId: 'c1', amount: 100, method: 'Cash' }] })).message).toMatch(/closed/);
    expect(h.result.current.ledger.length).toBe(before);
  });
});

describe('commission', () => {
  it('on sales (after returns) and on money recovered; paying books a Salesman commission expense', async () => {
    const h = await setup();
    const rashid = run(() => h.result.current.saveSalesman({ name: 'Rashid', commissionPct: 2 })).salesman!;
    const kamran = run(() => h.result.current.saveSalesman({ name: 'Kamran', commissionPct: 1, commissionOn: 'recovery' })).salesman!;
    const inv = makeBill(h, { salesmanId: rashid.id });
    run(() => h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: inv.items[0].id, qty: 1 }], settle: 'credit' }));
    run(() => h.result.current.receiveMany({ rows: [{ customerId: 'c1', amount: 8000, method: 'Cash' }], salesmanId: kamran.id }));
    const t = h.result.current;
    const rep = commissionReport({ salesmen: t.salesmen, invoices: t.invoices, returns: t.returns, ledger: t.ledger, customers: t.customers, expenses: t.expenses }, today, today);
    const r = rep.find((x) => x.salesman.id === rashid.id)!;
    expect(r.base).toBe(18000);
    expect(r.earned).toBe(360);
    const k = rep.find((x) => x.salesman.id === kamran.id)!;
    expect(k).toMatchObject({ basis: 'recovery', base: 8000, earned: 80 });
    const paid = run(() => h.result.current.payCommission({ salesmanId: rashid.id, amount: 300, paidVia: 'Cash' }));
    expect(paid.success, paid.message).toBe(true);
    expect(paid.expense!.category).toBe('salesman_commission');
    expect(EXPENSE_ACCOUNT.salesman_commission).toBe('6125');
    expect(net(h, ACC.SALESMAN_COMMISSION)).toBe(300);
    const t2 = h.result.current;
    const after = commissionReport({ salesmen: t2.salesmen, invoices: t2.invoices, returns: t2.returns, ledger: t2.ledger, customers: t2.customers, expenses: t2.expenses }, today, today).find((x) => x.salesman.id === rashid.id)!;
    expect(after).toMatchObject({ paidToDate: 300, owed: 60 });
    balanced(h);
  });
});

describe('recovery list and open items', () => {
  const led = (p: Partial<LedgerEntry>): LedgerEntry => ({ id: Math.random().toString(36), entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV', date: today, description: '', debit: 0, credit: 0, balanceAfter: 0, ...p });
  const c = (p: Partial<Customer>): Customer => ({ id: 'c1', name: 'A', company: '', phone: '', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01', ...p });

  it('payments clear the oldest bills first; an unexplained opening balance counts from the account date', () => {
    const ledger = [led({ date: ago(50), debit: 1000, referenceId: 'INV-1' }), led({ date: ago(20), debit: 2000, referenceId: 'INV-2' }), led({ date: ago(5), credit: 1500, type: 'payment_received' })];
    const items = openItems(c({ totalDue: 1500 }), ledger, today);
    expect(items).toEqual([{ date: ago(20), amount: 1500, type: 'bill_issued', ref: 'INV-2' }]);
    // Opening dues come first, so the payment clears them before INV-1.
    const withOpening = openItems(c({ totalDue: 2000, createdAt: ago(100) }), ledger, today);
    expect(withOpening).toEqual([{ date: ago(20), amount: 2000, type: 'bill_issued', ref: 'INV-2' }]);
    const unpaidOpening = openItems(c({ totalDue: 2500, createdAt: ago(100) }), [led({ date: ago(20), debit: 2000, referenceId: 'INV-2' })], today);
    expect(unpaidOpening[0]).toMatchObject({ date: ago(100), amount: 500, type: 'opening' });
  });

  it('groups who owes by area with the oldest unpaid bill', () => {
    const customers = [c({ id: 'c1', name: 'A', totalDue: 1500, areaId: 'a1' }), c({ id: 'c2', name: 'B', totalDue: 700 }), c({ id: 'c3', name: 'C', totalDue: 0, areaId: 'a1' })];
    const ledger = [led({ date: ago(50), debit: 1500 }), led({ entityId: 'c2', date: ago(3), debit: 700 })];
    const rep = recoveryList(customers, ledger, today, 'area', { salesmen: [], areas: [{ id: 'a1', name: 'Saddar', active: true, createdAt: '' }] });
    expect(rep.total).toBe(2200);
    expect(rep.groups.map((g) => [g.name, g.rows.map((r) => [r.customer.name, r.oldestDays])])).toEqual([['Saddar', [['A', 50]]], ['No area', [['B', 3]]]]);
    expect(recoveryList(customers, ledger, today, 'area', { salesmen: [], areas: [] }, 'a1').count).toBe(1);
  });
});

describe('interest on overdue balances', () => {
  const overdueSetup = async () => {
    const h = await setup();
    // A bill 45 days old of Rs. 30,000; rate 2% a month after 15 days → 30 days × 2%/30 × 30,000 = 600.
    run(() => h.result.current.createBill({ customerId: 'c1', date: ago(45), items: [{ productId: 'p1', name: 'Dalda', qty: 15, unitPrice: 2000 }] }));
    return h;
  };

  it('is off by default; with a rate it previews, posts debit notes to Interest income 4150, and never charges the same days twice', async () => {
    const h = await overdueSetup();
    expect(h.result.current.previewInterest(today)).toHaveLength(0);
    expect(run(() => h.result.current.setCustomerSalesInfo('c1', { interestPctPerMonth: 2, interestAfterDays: 15 })).success).toBe(true);
    const preview = h.result.current.previewInterest(today);
    expect(preview).toHaveLength(1);
    expect(preview[0].interest).toBe(600);
    expect(preview[0].lines[0]).toMatchObject({ amount: 30000, days: 30, from: ago(30) });
    const r = run(() => h.result.current.chargeInterest(today));
    expect(r.success, r.message).toBe(true);
    const row = h.result.current.ledger.find((l) => l.type === 'interest_charge')!;
    expect(row).toMatchObject({ entityId: 'c1', debit: 600, referenceId: 'INT-1', date: today });
    expect(cust(h).totalDue).toBe(30600);
    expect(net(h, ACC.INTEREST_INCOME)).toBe(-600);
    balanced(h);
    // Same day again: nothing new to charge (and interest itself never earns interest).
    expect(h.result.current.previewInterest(today)).toHaveLength(0);
    expect(run(() => h.result.current.chargeInterest(today)).success).toBe(false);
  });

  it('pure preview: part-paid bills are charged only on what is still unpaid, from after the grace days', () => {
    const cst: Customer = { id: 'c1', name: 'A', company: '', phone: '', email: '', address: '', totalDue: 6000, creditLimit: 0, createdAt: ago(200), interestPctPerMonth: 3, interestAfterDays: 30 };
    const ledger: LedgerEntry[] = [
      { id: '1', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV-1', date: ago(90), description: '', debit: 10000, credit: 0, balanceAfter: 10000 },
      { id: '2', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'P', date: ago(10), description: '', debit: 0, credit: 4000, balanceAfter: 6000 },
    ];
    const rows = interestPreview([cst], ledger, today);
    // 6,000 left of INV-1, overdue from day 60 ago: 60 days × 3%/30 × 6,000 = 360.
    expect(rows[0].interest).toBe(360);
  });
});
