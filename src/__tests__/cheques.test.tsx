import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { ACC, DEFAULT_ACCOUNTS, accountBalance, buildJournal, trialBalance } from '../utils/accounting';
import { collectCashMovements, accountBalancesOn } from '../utils/finance';
import { autoMatch } from '../utils/bankRec';
import { buildDailySheet } from '../utils/billing';
import { chequeEventsOn, chequeTotals, chequesDueThisWeek, filterCheques, unclearedChequeTotals } from '../utils/cheques';
import { shiftDate, todayISO } from '../utils/stockFlow';
import { BankStatementLine, Cheque } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();
const ago = (n: number) => shiftDate(today, -n);

/** Customer c1 owes 100,000 (one bill INV-1 of 60,000 + 40,000 old dues); supplier s1 is owed 80,000. */
const setup = (as: 'admin' | 'operator' = 'admin') => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Haji Karim', company: 'Karim Store', phone: '0300', email: '', address: '', totalDue: 100000, creditLimit: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '0301', email: '', materialCategory: 'Oil', address: '', totalOwed: 80000, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', []);
  set('tradeflow_invoices_v1', [{
    id: 'inv1', invoiceNumber: 'INV-1', customerId: 'c1', customerName: 'Haji Karim', issueDate: ago(20), dueDate: ago(20), status: 'issued', paymentStatus: 'unpaid',
    items: [{ id: 'it1', productId: 'p1', productName: 'Ghee tin', kg: 10, qty: 10, ratePerKg: 6000, unitPrice: 6000, amount: 60000 }],
    subtotal: 60000, taxRatePct: 0, taxAmount: 0, totalAmount: 60000, paidAmount: 0, balanceDue: 60000, payments: [], createdAt: ago(20), billKind: 'credit',
  }]);
  set('tradeflow_ledger_v2', [
    { id: 'l-bill', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV-1', sourceId: 'inv1', date: ago(20), description: 'Bill INV-1', debit: 60000, credit: 0, balanceAfter: 100000 },
  ]);
  set('tradeflow_expenses_v2', []);
  set('tradeflow_cash_entries_v2', []);
  const hook = renderHook(() => useTrading(), { wrapper });
  act(() => {
    if (as === 'admin') hook.result.current.unlockAdmin('7860');
    else expect(hook.result.current.unlockAsUser('user-operator', '9876').success).toBe(true);
  });
  return hook;
};

type Hook = ReturnType<typeof setup>;
const books = (h: Hook) => {
  const s = h.result.current;
  return buildJournal({ settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products });
};
const bank = (h: Hook) => {
  const s = h.result.current;
  return accountBalancesOn(collectCashMovements(s.ledger, s.expenses, s.cashEntries, s.customers, s.suppliers), s.settings, today).bank;
};
const cust = (h: Hook) => h.result.current.customers.find((c) => c.id === 'c1')!;
const chq = (h: Hook, id: string) => h.result.current.cheques.find((c) => c.id === id)!;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => { out = fn(); });
  return out!;
};
const receive = (h: Hook, extra: Partial<Parameters<Hook['result']['current']['receiveCheque']>[0]> = {}) =>
  run(() => h.result.current.receiveCheque({ customerId: 'c1', amount: 25000, bankName: 'HBL', chequeNumber: '100200', chequeDate: ago(3), date: ago(10), ...extra }));

beforeEach(() => localStorage.clear());

describe('cheques received from customers', () => {
  it('in hand: customer balance goes down, the money sits in Cheques in hand (not the bank), books balance', () => {
    const h = setup();
    const bankBefore = bank(h);
    const r = receive(h);
    expect(r.success).toBe(true);
    expect(cust(h).totalDue).toBe(75000);
    const row = h.result.current.ledger.find((l) => l.type === 'cheque_received')!;
    expect(row).toMatchObject({ entityId: 'c1', credit: 25000, sourceId: r.cheque!.id, date: ago(10) });
    expect(row.description).toContain('100200');
    // Not money yet: the cash book / bank balance does not move.
    expect(bank(h)).toBe(bankBefore);
    const j = books(h);
    expect(accountBalance(j, ACC.CHEQUES_IN_HAND)).toBe(25000);
    expect(accountBalance(j, ACC.RECEIVABLE)).toBe(75000);
    expect(trialBalance(j, DEFAULT_ACCOUNTS, today).balanced).toBe(true);
    expect(DEFAULT_ACCOUNTS.find((a) => a.code === '1150')!.name).toBe('Cheques in hand');
  });

  it('refuses bad input and duplicates', () => {
    const h = setup();
    expect(receive(h, { chequeNumber: ' ' }).message).toMatch(/cheque number/);
    expect(receive(h, { amount: 0 }).message).toMatch(/amount/);
    expect(receive(h, { date: shiftDate(today, 2) }).message).toMatch(/future/);
    expect(receive(h).success).toBe(true);
    expect(receive(h).message).toMatch(/already in the register/);
    expect(receive(h, { invoiceId: 'inv1', chequeNumber: '9', amount: 70000 }).message).toMatch(/Only Rs/);
  });

  it('a post-dated cheque cannot be deposited or cleared before its date', () => {
    const h = setup();
    const r = receive(h, { chequeDate: shiftDate(today, 5), date: today });
    expect(r.success).toBe(true);
    expect(run(() => h.result.current.depositCheque(r.cheque!.id)).message).toMatch(/won't take it before/);
    expect(chequesDueThisWeek(h.result.current.cheques, today)).toHaveLength(1);
  });

  it('deposit → clear: money moves from Cheques in hand to the bank, as a bank entry bank reconciliation can match', () => {
    const h = setup();
    const bankBefore = bank(h);
    const r = receive(h);
    expect(run(() => h.result.current.depositCheque(r.cheque!.id, ago(2))).success).toBe(true);
    expect(chq(h, r.cheque!.id).status).toBe('deposited');
    expect(bank(h)).toBe(bankBefore); // deposited is still not money
    expect(run(() => h.result.current.clearCheque(r.cheque!.id, ago(3))).message).toMatch(/deposited on/);
    expect(run(() => h.result.current.clearCheque(r.cheque!.id, ago(1))).success).toBe(true);
    const c = chq(h, r.cheque!.id);
    expect(c.status).toBe('cleared');
    expect(bank(h)).toBe(bankBefore + 25000);
    const j = books(h);
    expect(accountBalance(j, ACC.CHEQUES_IN_HAND)).toBe(0);
    expect(trialBalance(j, DEFAULT_ACCOUNTS, today).balanced).toBe(true);
    expect(j.find((e) => e.sourceId === c.clearedEntryId)!.sourceType).toBe('cheque_cleared');
    // The cleared cheque is an ordinary bank movement: a statement line for it matches automatically.
    const s = h.result.current;
    const moves = collectCashMovements(s.ledger, s.expenses, s.cashEntries, s.customers, s.suppliers);
    const line: BankStatementLine = { id: 'bsl1', date: ago(1), amount: 25000, description: 'CLEARING CHQ 100200', importedAt: today, matchedMovementIds: [], status: 'unmatched' };
    expect(autoMatch([line], moves)).toEqual([expect.objectContaining({ lineId: 'bsl1', movementId: `cm-${c.clearedEntryId}` })]);
    // The bank entry belongs to the cheque: it cannot be deleted on its own.
    act(() => h.result.current.deleteCashEntry(c.clearedEntryId!));
    expect(h.result.current.cashEntries.some((e) => e.id === c.clearedEntryId)).toBe(true);
    // Cannot bounce or cancel once cleared.
    expect(run(() => h.result.current.bounceCheque(c.id, { reason: 'x' })).success).toBe(false);
  });

  it('bounce with the bank charge passed to the customer: owes the cheque + charge again, shop bears nothing', () => {
    const h = setup();
    const bankBefore = bank(h);
    const r = receive(h);
    act(() => { h.result.current.depositCheque(r.cheque!.id, ago(2)); });
    expect(run(() => h.result.current.bounceCheque(r.cheque!.id, { reason: '' })).message).toMatch(/why it bounced/);
    const b = run(() => h.result.current.bounceCheque(r.cheque!.id, { reason: 'Insufficient funds', date: ago(1), bankCharge: 500, chargeTo: 'customer' }));
    expect(b.success).toBe(true);
    expect(cust(h).totalDue).toBe(100500);
    const c = chq(h, r.cheque!.id);
    expect(c).toMatchObject({ status: 'bounced', returnReason: 'Insufficient funds', bankCharge: 500, chargeTo: 'customer' });
    const rows = h.result.current.ledger.filter((l) => l.sourceId === c.id);
    expect(rows.map((l) => l.type).sort()).toEqual(['cheque_charge', 'cheque_received', 'cheque_returned']);
    expect(rows.find((l) => l.type === 'cheque_returned')!.description).toMatch(/bounced.*Insufficient funds/);
    // The bank took its fee.
    expect(bank(h)).toBe(bankBefore - 500);
    const exp = h.result.current.expenses.find((e) => e.id === c.chargeExpenseId)!;
    expect(exp).toMatchObject({ category: 'bank_charges', amount: 500 });
    const j = books(h);
    expect(accountBalance(j, ACC.CHEQUES_IN_HAND)).toBe(0);
    expect(accountBalance(j, ACC.BANK_CHARGES)).toBe(0); // recovered from the customer
    expect(accountBalance(j, ACC.RECEIVABLE)).toBe(100500);
    expect(trialBalance(j, DEFAULT_ACCOUNTS, today).balanced).toBe(true);
    // The charge expense is part of the cheque: not deletable on its own.
    act(() => h.result.current.deleteExpense(exp.id));
    expect(h.result.current.expenses.some((e) => e.id === exp.id)).toBe(true);
    expect(h.result.current.isChequeRecord(exp.id)).toBe(true);
  });

  it('bounce with the charge kept by the shop is a bank-charges expense', () => {
    const h = setup();
    const r = receive(h);
    act(() => { h.result.current.bounceCheque(r.cheque!.id, { reason: 'Signature differs', bankCharge: 300, chargeTo: 'shop' }); });
    expect(cust(h).totalDue).toBe(100000);
    const j = books(h);
    expect(accountBalance(j, ACC.BANK_CHARGES)).toBe(300);
    expect(trialBalance(j, DEFAULT_ACCOUNTS, today).balanced).toBe(true);
  });

  it('a cheque against a bill pays the bill while in hand; a bounce makes the bill due again', () => {
    const h = setup();
    const r = receive(h, { invoiceId: 'inv1', amount: 60000 });
    expect(r.success).toBe(true);
    let inv = h.result.current.invoices.find((i) => i.id === 'inv1')!;
    expect(inv).toMatchObject({ paidAmount: 60000, balanceDue: 0, paymentStatus: 'paid' });
    expect(inv.payments![0]).toMatchObject({ method: 'cheque', referenceNumber: '100200' });
    // The bill can't be deleted from under a live cheque.
    expect(run(() => h.result.current.deleteBill('inv1')).message).toMatch(/Cheque 100200/);
    act(() => { h.result.current.bounceCheque(r.cheque!.id, { reason: 'Payment stopped' }); });
    inv = h.result.current.invoices.find((i) => i.id === 'inv1')!;
    expect(inv).toMatchObject({ paidAmount: 0, balanceDue: 60000, paymentStatus: 'unpaid' });
    expect(inv.payments).toHaveLength(0);
    expect(cust(h).totalDue).toBe(100000);
  });

  it('returned to the customer while in hand (cancel)', () => {
    const h = setup();
    const r = receive(h);
    const x = run(() => h.result.current.cancelCheque(r.cheque!.id, { reason: 'Customer paid cash instead' }));
    expect(x.success).toBe(true);
    expect(chq(h, r.cheque!.id).status).toBe('cancelled');
    expect(cust(h).totalDue).toBe(100000);
    expect(trialBalance(books(h), DEFAULT_ACCOUNTS, today).balanced).toBe(true);
    // A cancelled cheque number can be entered again.
    expect(receive(h).success).toBe(true);
  });
});

describe('cheques issued to suppliers', () => {
  it('issue → clear / cancel: supplier balance, Cheques issued liability, then the bank', () => {
    const h = setup();
    const bankBefore = bank(h);
    const a = run(() => h.result.current.issueCheque({ supplierId: 's1', amount: 30000, bankName: 'MCB', chequeNumber: '555', chequeDate: ago(2), date: ago(5) }));
    const b = run(() => h.result.current.issueCheque({ supplierId: 's1', amount: 20000, bankName: 'MCB', chequeNumber: '556', chequeDate: shiftDate(today, 10), date: today }));
    expect(a.success && b.success).toBe(true);
    expect(h.result.current.suppliers[0].totalOwed).toBe(30000);
    let j = books(h);
    expect(accountBalance(j, ACC.CHEQUES_ISSUED)).toBe(-50000);
    expect(bank(h)).toBe(bankBefore);
    expect(h.result.current.depositCheque(a.cheque!.id).success).toBe(false);
    expect(run(() => h.result.current.clearCheque(b.cheque!.id)).message).toMatch(/can't clear it before/);
    expect(run(() => h.result.current.clearCheque(a.cheque!.id, ago(1))).success).toBe(true);
    expect(bank(h)).toBe(bankBefore - 30000);
    expect(run(() => h.result.current.cancelCheque(b.cheque!.id, { reason: 'Paid cash' })).success).toBe(true);
    expect(h.result.current.suppliers[0].totalOwed).toBe(50000);
    j = books(h);
    expect(accountBalance(j, ACC.CHEQUES_ISSUED)).toBe(0);
    expect(accountBalance(j, ACC.PAYABLE)).toBe(-50000);
    expect(trialBalance(j, DEFAULT_ACCOUNTS, today).balanced).toBe(true);
  });
});

describe('permissions and closed periods', () => {
  it('operators record and deposit cheques; clearing, bouncing and cancelling need a manager', () => {
    const h = setup('operator');
    const r = receive(h);
    expect(r.success).toBe(true);
    expect(run(() => h.result.current.depositCheque(r.cheque!.id, ago(2))).success).toBe(true);
    expect(run(() => h.result.current.bounceCheque(r.cheque!.id, { reason: 'x' })).message).toMatch(/permission/);
    expect(run(() => h.result.current.clearCheque(r.cheque!.id)).message).toMatch(/permission/);
    expect(run(() => h.result.current.cancelCheque(r.cheque!.id)).message).toMatch(/permission/);
  });

  it('dates inside a closed period are refused', () => {
    const h = setup();
    const r = receive(h);
    act(() => h.result.current.updateSettings({ booksLockedUntil: ago(4) }));
    expect(receive(h, { chequeNumber: '777', date: ago(6) }).message).toMatch(/books are closed/);
    expect(run(() => h.result.current.bounceCheque(r.cheque!.id, { reason: 'x', date: ago(5) })).message).toMatch(/books are closed/);
    expect(run(() => h.result.current.bounceCheque(r.cheque!.id, { reason: 'x', date: ago(1) })).success).toBe(true);
  });
});

describe('register helpers and daily sheet', () => {
  const mk = (id: string, extra: Partial<Cheque>): Cheque => ({ id, direction: 'received', partyName: id, bankName: 'HBL', chequeNumber: id, amount: 1000, chequeDate: today, entryDate: today, status: 'in_hand', createdAt: today, ...extra });
  const list = [
    mk('a', { chequeDate: shiftDate(today, 3) }),
    mk('b', { chequeDate: shiftDate(today, 9) }),
    mk('c', { chequeDate: ago(2), status: 'deposited', depositedDate: today }),
    mk('d', { direction: 'issued', status: 'issued', amount: 400, chequeDate: shiftDate(today, 1) }),
    mk('e', { status: 'bounced', returnedDate: today }),
    mk('f', { status: 'cleared', clearedDate: ago(1), entryDate: ago(5) }),
  ];
  it('due this week, lists and totals', () => {
    expect(chequesDueThisWeek(list, today).map((c) => c.id)).toEqual(['c', 'd', 'a']);
    const t = chequeTotals(list, today);
    expect(t.dueThisWeek).toEqual({ count: 3, amount: 2400, received: 2000, issued: 400 });
    expect(t.inHand).toEqual({ count: 2, amount: 2000 });
    expect(filterCheques(list, 'bounced', today).map((c) => c.id)).toEqual(['e']);
    expect(filterCheques(list, 'issued', today).map((c) => c.id)).toEqual(['d']);
    expect(filterCheques(list, 'all', today, 'hbl')).toHaveLength(6);
    expect(unclearedChequeTotals(list)).toEqual({ receivable: 3000, payable: 400 });
    expect(chequeEventsOn(list, today).map((e) => `${e.cheque.id}:${e.kind}`).sort()).toEqual(['a:received', 'b:received', 'c:deposited', 'c:received', 'd:issued', 'e:bounced', 'e:received']);
  });

  it('the daily sheet lists cheques received and cleared on the day, and the cleared one counts as bank in', () => {
    const h = setup();
    const r = receive(h, { date: ago(1), chequeDate: ago(1) });
    act(() => { h.result.current.clearCheque(r.cheque!.id, today); });
    const s = h.result.current;
    const src = { invoices: s.invoices, ledger: s.ledger, expenses: s.expenses, cashEntries: s.cashEntries, customers: s.customers, suppliers: s.suppliers, settings: s.settings, cheques: s.cheques };
    const day = buildDailySheet(src, today);
    expect(day.cheques.map((e) => e.kind)).toEqual(['cleared']);
    expect(day.bankIn).toBe(25000);
    expect(day.other).toHaveLength(0); // not listed twice
    expect(buildDailySheet(src, ago(1)).cheques.map((e) => e.kind)).toEqual(['received']);
  });
});
