/**
 * Receive-from-many as a voucher table (per-line narration) and editing a saved payment:
 * balances, the bill's paid / balance, cash book, journal (trial balance) and the refusals.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { ACC, accountTotals, buildJournal, combineJournal, mergeAccounts, trialBalance } from '../utils/accounting';
import { accountBalancesOn, collectCashMovements } from '../utils/finance';
import { shiftDate, todayISO } from '../utils/stockFlow';
import { paymentNoteOf } from '../components/billing/EditPaymentModal';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();
const yesterday = shiftDate(today, -1);

const setup = async (settings: Record<string, unknown> = {}, who = undefined as typeof OPERATOR | undefined) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil Traders', cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0, ...settings });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: 'C001', name: 'Zaman Store', company: 'Zaman Store', phone: '0344', email: '', address: '', totalDue: 30000, creditLimit: 0, createdAt: '2026-01-01', city: 'Batkhela' },
    { id: 'c2', code: 'C002', name: 'Bismillah Traders', company: 'Bismillah Traders', phone: '0345', email: '', address: '', totalDue: 12000, creditLimit: 0, createdAt: '2026-01-01', city: 'Mardan' },
  ]);
  set('tradeflow_ledger_v2', [
    { id: 'o1', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'OLD-1', date: '2026-02-01', description: 'Old bill', debit: 30000, credit: 0, balanceAfter: 30000 },
    { id: 'o2', entityType: 'customer', entityId: 'c2', type: 'bill_issued', referenceId: 'OLD-2', date: '2026-02-01', description: 'Old bill', debit: 12000, credit: 0, balanceAfter: 12000 },
    { id: 'o3', entityType: 'supplier', entityId: 's1', type: 'purchase', referenceId: 'PUR-1', date: '2026-02-01', description: 'Old purchase', debit: 45000, credit: 0, balanceAfter: 45000 },
  ]);
  set('tradeflow_suppliers_v2', [
    { id: 's1', code: 'S001', name: 'Ahmed', company: 'Dalda Foods', phone: '0300', email: '', materialCategory: 'Oil', address: '', totalOwed: 45000, createdAt: '2026-01-01' },
    { id: 's2', code: 'S002', name: 'Imran', company: 'Seasons', phone: '0301', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_products_v2', [{ id: 'p1', name: '5 kg Can', category: 'General', unit: 'can', unitPricePerKg: 2000, costPricePerKg: 1800, stockKg: 500, minThresholdKg: 50 }]);
  ['tradeflow_invoices_v1', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2', 'tradeflow_journal_entries_v1', 'tradeflow_accounts_v1', 'tradeflow_cheques_v1'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, ...(who ? [who] : []));
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => { out = fn(); });
  return out!;
};
const balances = (h: Hook) => {
  const t = h.result.current;
  return accountBalancesOn(collectCashMovements(t.ledger, t.expenses, t.cashEntries, t.customers, t.suppliers), t.settings, today);
};
const expectBalanced = (h: Hook) => {
  const t = h.result.current;
  const j = combineJournal(buildJournal({ settings: t.settings, customers: t.customers, suppliers: t.suppliers, ledger: t.ledger, invoices: t.invoices, dispatches: t.dispatches, purchases: t.purchases, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, returns: t.returns, adjustments: t.adjustments }), t.manualJournals);
  const tb = trialBalance(j, mergeAccounts(t.customAccounts), today);
  expect(tb.balanced, `TB off by ${tb.difference}`).toBe(true);
  const tot = accountTotals(j, { to: today });
  expect(tot.get(ACC.RECEIVABLE)?.net ?? 0).toBeCloseTo(t.customers.reduce((a, c) => a + c.totalDue, 0), 2);
  const bal = balances(h);
  expect(tot.get(ACC.CASH)?.net ?? 0).toBeCloseTo(bal.cash, 2);
};
const due = (h: Hook, id: string) => h.result.current.customers.find((c) => c.id === id)!.totalDue;

beforeEach(() => localStorage.clear());

describe('receive from many (voucher table)', () => {
  it('posts one row per line under one CS number, with each line\'s narration', async () => {
    const h = await setup();
    const r = run(() => h.result.current.receiveMany({ date: today, note: 'Monday round', rows: [
      { customerId: 'c1', amount: 5000, method: 'Cash', note: 'by hand' },
      { customerId: 'c2', amount: 2000, method: 'Bank Transfer' },
    ] }));
    expect(r.success, r.message).toBe(true);
    const rows = h.result.current.ledger.filter((l) => l.referenceId === r.sheetNo);
    expect(rows).toHaveLength(2);
    const r1 = rows.find((l) => l.entityId === 'c1')!;
    expect(r1.description).toContain('(by hand)');
    expect(paymentNoteOf(r1)).toBe('by hand');
    expect(paymentNoteOf(rows.find((l) => l.entityId === 'c2')!)).toBe('Monday round');
    expect(due(h, 'c1')).toBe(25000);
    expect(due(h, 'c2')).toBe(10000);
    expectBalanced(h);
  });
});

describe('edit a saved payment', () => {
  it('a Receive-from-many line: amount, method and even the customer change; same number, books balanced', async () => {
    const h = await setup();
    const r = run(() => h.result.current.receiveMany({ date: today, rows: [{ customerId: 'c1', amount: 5000, method: 'Cash' }] }));
    const row = h.result.current.ledger.find((l) => l.referenceId === r.sheetNo)!;
    const cashBefore = balances(h).cash;
    const e = run(() => h.result.current.editPayment(row.id, { amount: 4000, method: 'Bank Transfer', entityId: 'c2', note: 'moved' }));
    expect(e.success, e.message).toBe(true);
    const after = h.result.current.ledger.find((l) => l.id === row.id)!;
    expect(after.referenceId).toBe(r.sheetNo);
    expect(after.entityId).toBe('c2');
    expect(after.credit).toBe(4000);
    expect(after.edits).toHaveLength(1);
    expect(after.edits![0].changes).toMatch(/customer Zaman Store → Bismillah Traders/);
    expect(due(h, 'c1')).toBe(30000);
    expect(due(h, 'c2')).toBe(8000);
    expect(balances(h).cash).toBe(cashBefore - 5000);
    expect(balances(h).banks['1010']).toBe(54000);
    expect(h.result.current.auditLogs.some((a) => /Payment CS-\d+ edited: .*amount/.test(a.details || ''))).toBe(true);
    expectBalanced(h);
  });

  it('a bill payment: the bill\'s paid and balance follow the edit', async () => {
    const h = await setup();
    const bill = run(() => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', qty: 5, unitPrice: 2000 }], paidNow: 3000, paymentMethod: 'Cash' }));
    expect(bill.success, bill.message).toBe(true);
    const inv = bill.invoice!;
    run(() => h.result.current.payBill(inv.id, 2000, 'Cash'));
    const payRow = h.result.current.ledger.find((l) => l.sourceId === inv.id && l.type === 'payment_received' && l.credit === 2000)!;
    const dueBefore = due(h, 'c1');
    const e = run(() => h.result.current.editPayment(payRow.id, { amount: 6000, date: yesterday < inv.issueDate ? today : yesterday }));
    expect(e.success, e.message).toBe(true);
    const b = h.result.current.invoices.find((i) => i.id === inv.id)!;
    expect(b.paidAmount).toBe(9000);
    expect(b.balanceDue).toBe(1000);
    expect(b.payments!.map((p) => p.amount).sort()).toEqual([3000, 6000]);
    expect(due(h, 'c1')).toBe(dueBefore - 4000);
    // More than the bill has left is refused; so is moving it to another customer.
    expect(run(() => h.result.current.editPayment(payRow.id, { amount: 8000 })).success).toBe(false);
    expect(run(() => h.result.current.editPayment(payRow.id, { entityId: 'c2' })).message).toMatch(/stays with/);
    // The payment taken with the bill can be edited too.
    const first = h.result.current.ledger.find((l) => l.sourceId === inv.id && l.type === 'payment_received' && l.credit === 3000)!;
    expect(run(() => h.result.current.editPayment(first.id, { amount: 4000 })).success).toBe(true);
    expect(h.result.current.invoices.find((i) => i.id === inv.id)!.balanceDue).toBe(0);
    expectBalanced(h);
  });

  it('a Receive payment receipt keeps its receipt number and note', async () => {
    const h = await setup();
    const row = run(() => h.result.current.recordCustomerPayment('c1', 1500, 'Cash - first', today))!;
    const e = run(() => h.result.current.editPayment(row.id, { amount: 1000, note: 'corrected' }));
    expect(e.success, e.message).toBe(true);
    const after = h.result.current.ledger.find((l) => l.id === row.id)!;
    expect(after.referenceId).toBe(row.referenceId);
    expect(after.description).toBe('Payment received: Cash - corrected');
    expect(due(h, 'c1')).toBe(29000);
    expectBalanced(h);
  });

  it('a supplier payment: amount and supplier change, the payable follows', async () => {
    const h = await setup();
    const row = run(() => h.result.current.recordSupplierPayment('s1', 10000, 'Cash', today))!;
    expect(h.result.current.suppliers.find((s) => s.id === 's1')!.totalOwed).toBe(35000);
    const e = run(() => h.result.current.editPayment(row.id, { amount: 7000 }));
    expect(e.success, e.message).toBe(true);
    expect(h.result.current.suppliers.find((s) => s.id === 's1')!.totalOwed).toBe(38000);
    const mv = run(() => h.result.current.editPayment(row.id, { entityId: 's2' }));
    expect(mv.success, mv.message).toBe(true);
    expect(h.result.current.suppliers.find((s) => s.id === 's1')!.totalOwed).toBe(45000);
    expect(h.result.current.suppliers.find((s) => s.id === 's2')!.totalOwed).toBe(-7000);
    expectBalanced(h);
  });

  it('refuses a closed period, a cheque, and a role without permission', async () => {
    const h = await setup({ booksLockedUntil: shiftDate(today, -3) });
    const row = run(() => h.result.current.recordCustomerPayment('c1', 1500, 'Cash', today))!;
    const locked = run(() => h.result.current.editPayment(row.id, { date: shiftDate(today, -10) }));
    expect(locked.success).toBe(false);
    expect(due(h, 'c1')).toBe(28500);
    const chq = run(() => h.result.current.receiveCheque({ customerId: 'c1', amount: 1000, chequeNumber: '123', bankName: 'HBL', chequeDate: today }));
    expect(chq.success, chq.message).toBe(true);
    const chqRow = h.result.current.ledger.find((l) => l.type === 'cheque_received')!;
    expect(run(() => h.result.current.editPayment(chqRow.id, { amount: 500 })).message).toMatch(/cheque/i);

    localStorage.clear();
    const op = await setup({}, OPERATOR);
    const p = run(() => op.result.current.recordCustomerPayment('c1', 1500, 'Cash', today))!;
    const denied = run(() => op.result.current.editPayment(p.id, { amount: 100 }));
    expect(denied.success).toBe(false);
    expect(denied.message).toMatch(/permission/i);
  });
});
