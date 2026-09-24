/**
 * Editing a saved bill (same number; stock, account, ledger and books as if it was made that way) and
 * opening (old khata) balances for customers and suppliers.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn, OPERATOR, MANAGER } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { ACC, accountTotals, buildJournal, combineJournal, mergeAccounts, trialBalance } from '../utils/accounting';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { ageLedger } from '../utils/finance';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

const setup = async (settings: Record<string, unknown> = {}, who = undefined as undefined | typeof OPERATOR) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  localStorage.clear();
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil Traders', cashOpeningBalance: 0, openingBankBalance: 0, cashOpeningDate: '2026-01-01', taxRatePct: 0, ...settings });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman Store', company: 'Zaman Store', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
    { id: 'c2', name: 'Bismillah Traders', company: 'Bismillah Traders', phone: '0345', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Iftikhar', company: 'Tajj Mill', phone: '0300', email: '', address: '', materialCategory: 'Ghee', totalOwed: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: 'Dalda 5L', category: 'Ghee', unit: 'tin', unitPricePerKg: 2000, costPricePerKg: 1500, stockKg: 100, minThresholdKg: 0, supplierId: null },
    { id: 'p2', name: 'Soya Oil 1L', category: 'Oil', unit: 'btl', unitPricePerKg: 500, costPricePerKg: 400, stockKg: 50, minThresholdKg: 0, supplierId: null },
  ]);
  ['tradeflow_ledger_v2', 'tradeflow_invoices_v1', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2', 'tradeflow_journal_entries_v1', 'tradeflow_accounts_v1', 'tradeflow_cheques_v1'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, who);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => { out = fn(); });
  return out!;
};
const journal = (h: Hook) => {
  const t = h.result.current;
  return combineJournal(buildJournal({ settings: t.settings, customers: t.customers, suppliers: t.suppliers, ledger: t.ledger, invoices: t.invoices, dispatches: t.dispatches, purchases: t.purchases, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, returns: t.returns, adjustments: t.adjustments }), t.manualJournals);
};
const expectBooks = (h: Hook) => {
  const t = h.result.current;
  const j = journal(h);
  const tb = trialBalance(j, mergeAccounts(t.customAccounts), today);
  expect(tb.balanced, `TB off by ${tb.difference}`).toBe(true);
  const tot = accountTotals(j, { to: today });
  expect(tot.get(ACC.RECEIVABLE)?.net ?? 0).toBeCloseTo(t.customers.reduce((a, c) => a + c.totalDue, 0), 2);
  // No balance is "unexplained": every customer's ledger adds up to what they owe.
  t.customers.forEach((c) => {
    const net = t.ledger.filter((l) => l.entityType === 'customer' && l.entityId === c.id).reduce((a, l) => a + l.debit - l.credit, 0);
    expect(net).toBeCloseTo(c.totalDue, 2);
  });
  expect(j.some((e) => e.sourceType === 'customer_opening' && e.id.startsWith('auto-open-cust'))).toBe(false);
  return tot;
};
const prod = (h: Hook, id: string) => h.result.current.products.find((p) => p.id === id)!;
const cust = (h: Hook, id: string) => h.result.current.customers.find((c) => c.id === id)!;

const makeBill = (h: Hook, extra: Record<string, unknown> = {}) =>
  run(() => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 10, unitPrice: 2000 }], payments: [{ method: 'Cash', amount: 5000 }], date: today, ...extra }));

describe('Edit a saved bill', () => {
  it('changes qty, price and lines under the same number; stock, balance, ledger and books follow', async () => {
    const h = await setup();
    const r = makeBill(h);
    expect(r.success).toBe(true);
    const inv = r.invoice!;
    expect(prod(h, 'p1').stockKg).toBe(90);
    expect(cust(h, 'c1').totalDue).toBe(15000);

    const e = run(() => h.result.current.editBill(inv.id, {
      customerId: 'c1',
      items: [
        { productId: 'p1', name: 'Dalda 5L', qty: 6, unitPrice: 2100, discountType: 'rs', discountValue: 100 },
        { productId: 'p2', name: 'Soya Oil 1L', qty: 4, unitPrice: 500 },
      ],
      freightCharges: 300,
      memoNo: 'B-77',
      date: today,
    }));
    expect(e.success, e.message).toBe(true);
    const t = h.result.current;
    expect(t.invoices).toHaveLength(1);
    const after = t.invoices[0];
    expect(after.id).toBe(inv.id);
    expect(after.invoiceNumber).toBe(inv.invoiceNumber);
    expect(after.createdAt).toBe(inv.createdAt);
    // 6 × 2100 − 100 + 4 × 500 + 300 freight
    expect(after.totalAmount).toBe(14800);
    expect(after.paidAmount).toBe(5000);
    expect(after.balanceDue).toBe(9800);
    expect(after.memoNo).toBe('B-77');
    expect(after.payments).toHaveLength(1);
    expect(after.editHistory).toHaveLength(1);
    expect(after.editHistory![0].before.totalAmount).toBe(20000);
    expect(prod(h, 'p1').stockKg).toBe(94);
    expect(prod(h, 'p2').stockKg).toBe(46);
    expect(cust(h, 'c1').totalDue).toBe(9800);
    const rows = t.ledger.filter((l) => l.sourceId === inv.id);
    expect(rows.filter((l) => l.type === 'bill_issued')).toHaveLength(1);
    expect(rows.find((l) => l.type === 'bill_issued')!.debit).toBe(14800);
    expect(rows.filter((l) => l.type === 'payment_received').map((l) => l.credit)).toEqual([5000]);
    expect(t.auditLogs.some((a) => /Bill .* edited:/.test(a.details || '') || /edited/.test(a.action || ''))).toBe(true);
    const tot = expectBooks(h);
    // Cost of goods: 6 × 1500 + 4 × 400 (the old 10 tins are fully reversed).
    expect(tot.get(ACC.COGS)?.net ?? 0).toBeCloseTo(10600, 2);
    expect(Math.abs(tot.get(ACC.SALES)?.net ?? 0)).toBeCloseTo(14600, 2);
  });

  it('moves the bill to another customer and keeps the payment with it', async () => {
    const h = await setup();
    const inv = makeBill(h).invoice!;
    const e = run(() => h.result.current.editBill(inv.id, { customerId: 'c2', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 10, unitPrice: 2000 }], date: today }));
    expect(e.success, e.message).toBe(true);
    expect(cust(h, 'c1').totalDue).toBe(0);
    expect(cust(h, 'c2').totalDue).toBe(15000);
    expect(h.result.current.ledger.every((l) => l.entityId === 'c2')).toBe(true);
    expectBooks(h);
  });

  it('applies the credit limit and stock checks to the edited bill', async () => {
    const h = await setup({ allowNegativeStock: false });
    const inv = makeBill(h).invoice!;
    run(() => h.result.current.updateCustomer('c1', { creditLimit: 20000 }));
    // 15,000 owed now; the new bill leaves 21,000 unpaid (limit 20,000).
    const over = run(() => h.result.current.editBill(inv.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 13, unitPrice: 2000 }], date: today }));
    expect(over.success).toBe(false);
    expect(over.message).toMatch(/credit limit/);
    // Its own 10 tins count as back: 100 in stock, so 100 fits and 101 does not.
    const fits = run(() => h.result.current.editBill(inv.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 12, unitPrice: 2000 }], date: today }));
    expect(fits.success, fits.message).toBe(true);
    run(() => h.result.current.updateCustomer('c1', { creditLimit: 0 }));
    const short = run(() => h.result.current.editBill(inv.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 101, unitPrice: 2000 }], date: today }));
    expect(short.success).toBe(false);
    expect(short.message).toMatch(/only 100/);
    const all = run(() => h.result.current.editBill(inv.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 100, unitPrice: 2000 }], date: today }));
    expect(all.success, all.message).toBe(true);
    expect(prod(h, 'p1').stockKg).toBe(0);
    // Less than already paid is refused.
    const low = run(() => h.result.current.editBill(inv.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 1, unitPrice: 2000 }], date: today }));
    expect(low.success).toBe(false);
    expect(low.message).toMatch(/already paid/);
  });

  it('refuses when the bill has returns, a cheque, is in a closed period, or the role may not', async () => {
    const h = await setup();
    const a = makeBill(h).invoice!;
    run(() => h.result.current.returnBillItems({ invoiceId: a.id, lines: [{ billLineId: a.items[0].id, qty: 1 }], settle: 'credit' } as never));
    const r1 = run(() => h.result.current.editBill(a.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 2, unitPrice: 2000 }], date: today }));
    expect(r1.success).toBe(false);
    expect(r1.message).toMatch(/returned/);

    const b = makeBill(h, { payments: [], cheque: { amount: 3000, chequeNumber: '778', bankName: 'HBL', chequeDate: today } }).invoice!;
    const r2 = run(() => h.result.current.editBill(b.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 2, unitPrice: 2000 }], date: today }));
    expect(r2.success).toBe(false);
    expect(r2.message).toMatch(/Cheque 778/);

    const old = makeBill(h, { date: shiftDate(today, -40) }).invoice!;
    run(() => h.result.current.updateSettings({ booksLockedUntil: shiftDate(today, -30) }));
    const r3 = run(() => h.result.current.editBill(old.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 2, unitPrice: 2000 }], date: today }));
    expect(r3.success).toBe(false);
    expect(r3.message).toMatch(/closed period/);
    expect(h.result.current.billEditBlock(old)).toMatch(/closed period/);
  });

  it('an operator (no delete right) cannot edit; a manager can', async () => {
    const h = await setup();
    const inv = makeBill(h).invoice!;
    await act(async () => { h.result.current.logout(); });
    await signIn(() => h.result.current, OPERATOR);
    const r = run(() => h.result.current.editBill(inv.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 2, unitPrice: 2000 }], date: today }));
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/permission/);
    await act(async () => { h.result.current.logout(); });
    await signIn(() => h.result.current, MANAGER);
    const m = run(() => h.result.current.editBill(inv.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda 5L', qty: 3, unitPrice: 2000 }], date: today }));
    expect(m.success, m.message).toBe(true);
    expect(prod(h, 'p1').stockKg).toBe(97);
  });
});

describe('Opening balances', () => {
  it('posts one Opening balance row against 3900, shows on the statement, can be edited, TB stays balanced', async () => {
    const h = await setup();
    // Opening stock already sits in 3900; the party openings come on top of it.
    const base = accountTotals(journal(h), { to: today }).get(ACC.OPENING_EQUITY)?.net ?? 0;
    const r = run(() => h.result.current.setOpeningBalance('customer', 'c1', 25000, '2026-01-01'));
    expect(r.success, r.message).toBe(true);
    run(() => h.result.current.setOpeningBalance('supplier', 's1', 40000, '2026-01-01'));
    const rows = () => h.result.current.ledger.filter((l) => l.type === 'opening_balance');
    expect(rows()).toHaveLength(2);
    const ob = rows().find((l) => l.entityId === 'c1')!;
    expect(ob.referenceId).toBe('OB');
    expect(ob.description).toBe('Opening balance');
    expect(ob.debit).toBe(25000);
    expect(cust(h, 'c1').totalDue).toBe(25000);
    expect(h.result.current.suppliers[0].totalOwed).toBe(40000);
    // Aging: the opening amount is old.
    const aging = ageLedger(h.result.current.ledger.filter((l) => l.entityType === 'customer' && l.entityId === 'c1'), today);
    expect(aging.total).toBeCloseTo(25000, 2);
    let tot = expectBooks(h);
    expect(tot.get(ACC.OPENING_EQUITY)?.net ?? 0).toBeCloseTo(base - 25000 + 40000, 2);
    expect(Math.abs(tot.get(ACC.PAYABLE)?.net ?? 0)).toBeCloseTo(40000, 2);

    // Edited later: the same row changes, no second row.
    run(() => h.result.current.setOpeningBalance('customer', 'c1', 18000));
    expect(rows().filter((l) => l.entityId === 'c1')).toHaveLength(1);
    expect(rows().find((l) => l.entityId === 'c1')!.debit).toBe(18000);
    expect(cust(h, 'c1').totalDue).toBe(18000);
    // A bill on top still adds up.
    makeBill(h);
    expect(cust(h, 'c1').totalDue).toBe(33000);
    tot = expectBooks(h);
    expect(tot.get(ACC.OPENING_EQUITY)?.net ?? 0).toBeCloseTo(base - 18000 + 40000, 2);

    // Negative = advance.
    run(() => h.result.current.setOpeningBalance('customer', 'c2', -5000, '2026-01-01'));
    const adv = rows().find((l) => l.entityId === 'c2')!;
    expect(adv.credit).toBe(5000);
    expect(cust(h, 'c2').totalDue).toBe(-5000);
    expectBooks(h);
    // 0 removes it.
    run(() => h.result.current.setOpeningBalance('customer', 'c2', 0));
    expect(rows().some((l) => l.entityId === 'c2')).toBe(false);
    expect(cust(h, 'c2').totalDue).toBe(0);
    expectBooks(h);
  });

  it('refuses an opening balance in a closed period', async () => {
    const h = await setup({ booksLockedUntil: '2026-03-31' });
    const r = run(() => h.result.current.setOpeningBalance('customer', 'c1', 1000, '2026-01-01'));
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/closed period/);
  });

  it('a new party added then given an opening balance in the same tick (as the CSV import does)', async () => {
    const h = await setup();
    run(() => {
      const c = h.result.current.addCustomer({ name: 'Imported Co', company: 'Imported Co', phone: '0311', email: '', address: '', creditLimit: 0 });
      h.result.current.setOpeningBalance('customer', c.id, 7000, c.createdAt);
      const s = h.result.current.addSupplier({ name: 'Mill', company: 'Mill', phone: '0312', email: '', address: '', materialCategory: 'Ghee' });
      h.result.current.setOpeningBalance('supplier', s.id, -2500, s.createdAt);
    });
    const c = h.result.current.customers.find((x) => x.name === 'Imported Co')!;
    expect(c.totalDue).toBe(7000);
    expect(h.result.current.ledger.filter((l) => l.entityId === c.id && l.type === 'opening_balance')).toHaveLength(1);
    const s = h.result.current.suppliers.find((x) => x.name === 'Mill')!;
    expect(s.totalOwed).toBe(-2500);
    expectBooks(h);
  });
});
