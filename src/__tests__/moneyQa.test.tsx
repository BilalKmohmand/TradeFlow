/**
 * QA of money, banks and vouchers (regressions for what a demanding shopkeeper found):
 *  - bank statement amounts written with a decimal comma ("27.500,00") were read 1000 times too small;
 *  - "Receive from many" always put bank transfers into the main bank;
 *  - opening balances (cash and each bank) could be changed inside a closed period;
 *  - customer / supplier / account pickers now take the code the old program's way (type it, press Enter).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderHook, act, render, screen, fireEvent } from '@testing-library/react';
import { seedTestUsers, signIn } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { ACC, accountTotals, buildJournal, combineJournal, mergeAccounts, trialBalance } from '../utils/accounting';
import { accountBalancesOn, collectCashMovements } from '../utils/finance';
import { parseAmount, statementLinesFromRows, guessMapping } from '../utils/bankRec';
import { shiftDate, todayISO } from '../utils/stockFlow';
import { PartyPick, customerParties } from '../components/billing/PartyPick';
import { AccountPicker } from '../components/accounting/AccountPicker';
import type { AccountOption } from '../utils/vouchers';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

const setup = async (settings: Record<string, unknown> = {}) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil Traders', cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0, ...settings });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: 'C001', name: 'Zaman Store', company: 'Zaman Store', phone: '0344', email: '', address: '', totalDue: 30000, creditLimit: 0, createdAt: '2026-01-01', city: 'Batkhela' },
    { id: 'c2', code: 'C002', name: 'Bismillah Traders', company: 'Bismillah Traders', phone: '0345', email: '', address: '', totalDue: 12000, creditLimit: 0, createdAt: '2026-01-01', city: 'Mardan' },
  ]);
  set('tradeflow_ledger_v2', [
    { id: 'o1', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'OLD-1', date: '2026-02-01', description: 'Old bill', debit: 30000, credit: 0, balanceAfter: 30000 },
    { id: 'o2', entityType: 'customer', entityId: 'c2', type: 'bill_issued', referenceId: 'OLD-2', date: '2026-02-01', description: 'Old bill', debit: 12000, credit: 0, balanceAfter: 12000 },
  ]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', []);
  ['tradeflow_invoices_v1', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2', 'tradeflow_journal_entries_v1', 'tradeflow_accounts_v1', 'tradeflow_cheques_v1'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
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
  Object.entries(bal.banks).forEach(([code, v]) => expect(tot.get(code)?.net ?? 0, `bank ${code}`).toBeCloseTo(v, 2));
};

beforeEach(() => localStorage.clear());

describe('bank statement amounts', () => {
  it('reads decimal-comma amounts from ";"-separated statements, and keeps the usual ones', () => {
    expect(parseAmount('27.500,00')).toBe(27500);
    expect(parseAmount('-1.234,56')).toBe(-1234.56);
    expect(parseAmount('1250,5')).toBe(1250.5);
    expect(parseAmount('1.250.000')).toBe(1250000);
    // Pakistani / English formats are unchanged.
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount('1,250')).toBe(1250);
    expect(parseAmount('Rs. 45,000,000')).toBe(45000000);
    expect(parseAmount('27.5')).toBe(27.5);
    expect(parseAmount('(500)')).toBe(-500);
    expect(parseAmount('500 DR')).toBe(-500);
    expect(parseAmount('abc')).toBeNull();
  });

  it('a semicolon statement row with "27.500,00" in Deposit is Rs. 27,500 in', () => {
    const head = ['Date', 'Narration', 'Withdrawal', 'Deposit'];
    const { lines, errors } = statementLinesFromRows([['13/09/2026', 'IBFT Shah Jee', '', '27.500,00'], ['14/09/2026', 'Charges', '350,00', '']], guessMapping(head));
    expect(errors).toEqual([]);
    expect(lines.map((l) => l.amount)).toEqual([27500, -350]);
  });
});

describe('receive from many into a chosen bank', () => {
  it('a bank transfer goes into the bank picked on its line, and the books stay balanced', async () => {
    const h = await setup();
    const hbl = run(() => h.result.current.addBankAccount({ bankName: 'HBL', accountNumber: '0012345678', openingBalance: 0 })).code!;
    const r = run(() => h.result.current.receiveMany({ date: today, rows: [
      { customerId: 'c1', amount: 10000, method: 'Bank Transfer', bankCode: hbl },
      { customerId: 'c2', amount: 2000.5, method: 'Cash', bankCode: hbl }, // cash ignores the bank
    ] }));
    expect(r.success, r.message).toBe(true);
    const bal = balances(h);
    expect(bal.banks[hbl]).toBe(10000);
    expect(bal.banks['1010']).toBe(50000);
    expect(bal.cash).toBe(12000.5);
    expect(h.result.current.ledger.find((l) => l.entityId === 'c2' && l.type === 'payment_received')?.bankCode).toBeUndefined();
    expectBalanced(h);
    // Undo takes it all back out of HBL too.
    run(() => h.result.current.undoCollection(r.sheetNo!));
    expect(balances(h).banks[hbl] || 0).toBe(0);
    expectBalanced(h);
  });
});

describe('opening balances in a closed period', () => {
  it("a bank's opening balance can't change once the books are closed after the opening date", async () => {
    const h = await setup({ booksLockedUntil: shiftDate(today, -5) });
    const add = run(() => h.result.current.addBankAccount({ bankName: 'UBL', openingBalance: 5000 }));
    expect(add.success).toBe(false);
    expect(add.message).toMatch(/opening balance can't be changed/i);
    // A new bank with nothing in it on the opening day is fine; renaming is fine.
    const ok = run(() => h.result.current.addBankAccount({ bankName: 'UBL', openingBalance: 0 }));
    expect(ok.success, ok.message).toBe(true);
    expect(run(() => h.result.current.updateBankAccount(ok.code!, { bankName: 'UBL Main' })).success).toBe(true);
    const edit = run(() => h.result.current.updateBankAccount('1010', { bankName: 'Meezan', openingBalance: 99999 }));
    expect(edit.success).toBe(false);
    expect(h.result.current.settings.openingBankBalance).toBe(50000);
  });

  it('with the period open, a bank opening balance can be set', async () => {
    const h = await setup();
    const r = run(() => h.result.current.updateBankAccount('1010', { openingBalance: 75000 }));
    expect(r.success, r.message).toBe(true);
    expect(balances(h).banks['1010']).toBe(75000);
  });
});

describe('pickers take the code', () => {
  const parties = customerParties([
    { id: 'c1', code: 'C001', name: 'Zaman Store', city: 'Batkhela', totalDue: 500 },
    { id: 'c2', code: 'C002', name: 'Bismillah Traders', city: 'Mardan', totalDue: 0 },
  ]);

  it('customer picker: type the code and press Enter; the list shows name, city and balance', () => {
    const onPick = vi.fn();
    render(<PartyPick id="p" label="Customer" parties={parties} value="" onPick={onPick} placeholder="Select customer…" />);
    const code = screen.getByLabelText('Code');
    fireEvent.change(code, { target: { value: 'c002' } });
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('c2');
    fireEvent.change(code, { target: { value: '1' } });
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith('c1');
    fireEvent.change(code, { target: { value: 'X9' } });
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('No code "X9"');
    // The name list leaves the code out (the Code box shows it).
    expect(screen.getByRole('option', { name: /^Zaman Store \(Batkhela\) — owes Rs\. 500$/ })).toBeTruthy();
    expect((screen.getByLabelText('Customer') as HTMLSelectElement).tagName).toBe('SELECT');
  });

  it('account picker (vouchers, ledger): a Code box before the list finds a party or an account by code', () => {
    const options: AccountOption[] = [
      { ref: 'cust:c1', code: '141454', name: 'Zaman Store', group: 'Customer' } as AccountOption,
      { ref: '6000', code: '6000', name: 'Day-to-day expenses', group: 'Expense' } as AccountOption,
    ];
    const onPick = vi.fn();
    render(<AccountPicker id="a" aria-label="Line 1 account" value="" options={options} onPick={onPick} />);
    const code = screen.getByLabelText('Code for Line 1 account');
    fireEvent.change(code, { target: { value: '141454' } });
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('cust:c1');
    fireEvent.change(code, { target: { value: '6000' } });
    fireEvent.blur(code);
    expect(onPick).toHaveBeenLastCalledWith('6000');
  });
});
