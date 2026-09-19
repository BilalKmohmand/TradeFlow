import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { CashMovement, collectCashMovements } from '../utils/finance';
import {
  autoMatch,
  bankMovements,
  guessMapping,
  parseAmount,
  parseStatementDate,
  reconciliationSummary,
  splitNewLines,
  statementLinesFromRows,
  looksLikeHeader,
} from '../utils/bankRec';
import { parseCsv } from '../components/admin/DataImportTab';
import { AppSettings, BankStatementLine, DEFAULT_SETTINGS } from '../types';

const mv = (id: string, date: string, direction: 'in' | 'out', amount: number, method = 'Bank Transfer'): CashMovement => ({
  id, date, direction, amount, method, description: id, source: 'manual', sourceId: id,
});
const line = (id: string, date: string, amount: number, extra: Partial<BankStatementLine> = {}): BankStatementLine => ({
  id, date, amount, description: id, importedAt: '2026-03-31', matchedMovementIds: [], status: 'unmatched', ...extra,
});
const settings: AppSettings = { ...DEFAULT_SETTINGS, cashOpeningBalance: 1000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01' };

describe('statement parsing', () => {
  it('reads dd/mm/yyyy, yyyy-mm-dd and friends', () => {
    expect(parseStatementDate('05/03/2026')).toBe('2026-03-05');
    expect(parseStatementDate('2026-03-05')).toBe('2026-03-05');
    expect(parseStatementDate('5-3-26')).toBe('2026-03-05');
    expect(parseStatementDate('05.03.2026')).toBe('2026-03-05');
    expect(parseStatementDate('05 Mar 2026')).toBe('2026-03-05');
    expect(parseStatementDate('31/02/2026')).toBeNull();
    expect(parseStatementDate('Opening balance')).toBeNull();
  });
  it('reads amounts with commas, brackets, DR/CR and currency', () => {
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount('Rs. 1,000')).toBe(1000);
    expect(parseAmount('(500)')).toBe(-500);
    expect(parseAmount('-500')).toBe(-500);
    expect(parseAmount('500 DR')).toBe(-500);
    expect(parseAmount('500 CR')).toBe(500);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
  it('maps a single amount column', () => {
    const rows = parseCsv('Date,Description,Amount\n05/03/2026,Deposit,"30,000"\n2026-03-06,Charges,-250\n,Closing balance,\n');
    expect(looksLikeHeader(rows[0])).toBe(true);
    const m = guessMapping(rows[0]);
    expect(m).toMatchObject({ date: 0, description: 1, amount: 2 });
    const { lines, errors } = statementLinesFromRows(rows.slice(1), m);
    expect(errors).toEqual([]);
    expect(lines).toEqual([
      { date: '2026-03-05', description: 'Deposit', amount: 30000, reference: undefined },
      { date: '2026-03-06', description: 'Charges', amount: -250, reference: undefined },
    ]);
  });
  it('maps separate debit / credit columns (debit = money out)', () => {
    const rows = parseCsv('Txn Date,Narration,Chq No,Withdrawal,Deposit,Balance\n01-03-2026,ATM,,"2,000",,98000\n02-03-2026,IBFT in,123,,5000,103000\nxx,bad row,,1,,\n');
    const m = guessMapping(rows[0]);
    expect(m).toMatchObject({ date: 0, description: 1, reference: 2, debit: 3, credit: 4, amount: -1 });
    const { lines, errors } = statementLinesFromRows(rows.slice(1), m);
    expect(lines.map((l) => l.amount)).toEqual([-2000, 5000]);
    expect(lines[1].reference).toBe('123');
    expect(errors).toHaveLength(1);
  });
  it('skips lines already imported, but keeps genuine same-day duplicates within a statement', () => {
    const existing = [line('a', '2026-03-05', -50, { description: 'SMS charges' })];
    const incoming = [
      { date: '2026-03-05', description: 'SMS charges', amount: -50 },
      { date: '2026-03-05', description: 'SMS charges', amount: -50 },
    ];
    const { fresh, duplicates } = splitNewLines(existing, incoming);
    expect(fresh).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });
});

describe('autoMatch', () => {
  it('matches exact amount on the same day with "exact" confidence', () => {
    const r = autoMatch([line('l1', '2026-03-05', 30000)], [mv('m1', '2026-03-05', 'in', 30000)]);
    expect(r).toEqual([{ lineId: 'l1', movementId: 'm1', daysApart: 0, confidence: 'exact' }]);
  });
  it('allows ±3 days, not 4, and never matches a different amount', () => {
    const moves = [mv('m1', '2026-03-02', 'in', 1000), mv('m2', '2026-03-10', 'in', 2000), mv('m3', '2026-03-05', 'in', 2999.99)];
    const r = autoMatch([line('l1', '2026-03-05', 1000), line('l2', '2026-03-06', 2000), line('l3', '2026-03-05', 3000)], moves);
    expect(r).toEqual([{ lineId: 'l1', movementId: 'm1', daysApart: 3, confidence: 'medium' }]);
  });
  it('respects the sign: money out on the statement only matches money out in the books', () => {
    const r = autoMatch([line('l1', '2026-03-05', -5000)], [mv('in', '2026-03-05', 'in', 5000), mv('out', '2026-03-06', 'out', 5000)]);
    expect(r).toEqual([{ lineId: 'l1', movementId: 'out', daysApart: 1, confidence: 'high' }]);
  });
  it('uses each movement once, pairing the closest dates first', () => {
    const moves = [mv('m1', '2026-03-01', 'out', 500), mv('m2', '2026-03-04', 'out', 500)];
    const lines = [line('l1', '2026-03-02', -500), line('l2', '2026-03-04', -500), line('l3', '2026-03-03', -500)];
    const r = autoMatch(lines, moves);
    expect(r).toHaveLength(2);
    expect(r).toContainEqual({ lineId: 'l2', movementId: 'm2', daysApart: 0, confidence: 'exact' });
    expect(r).toContainEqual({ lineId: 'l1', movementId: 'm1', daysApart: 1, confidence: 'high' });
    expect(new Set(r.map((p) => p.movementId)).size).toBe(2);
  });
  it('ignores cash movements and movements already matched to another line', () => {
    const moves = [mv('cash', '2026-03-05', 'in', 100, 'Cash'), mv('used', '2026-03-05', 'in', 100)];
    const lines = [line('done', '2026-03-05', 100, { status: 'matched', matchedMovementIds: ['used'] }), line('l1', '2026-03-05', 100)];
    expect(autoMatch(lines, moves)).toEqual([]);
  });
  it('matches the bank side of a cash ↔ bank transfer (both directions)', () => {
    const movements = collectCashMovements([], [], [
      { id: 'dep-c', date: '2026-03-05', direction: 'out', amount: 30000, description: 'Deposited cash to bank', method: 'Cash', createdAt: '', pairId: 'x1' },
      { id: 'dep-b', date: '2026-03-05', direction: 'in', amount: 30000, description: 'Deposited cash to bank', method: 'Bank Transfer', createdAt: '', pairId: 'x1' },
      { id: 'wd-b', date: '2026-03-08', direction: 'out', amount: 7000, description: 'Withdrew cash from bank', method: 'Bank Transfer', createdAt: '', pairId: 'x2' },
      { id: 'wd-c', date: '2026-03-08', direction: 'in', amount: 7000, description: 'Withdrew cash from bank', method: 'Cash', createdAt: '', pairId: 'x2' },
    ], [], []);
    expect(bankMovements(movements).map((m) => m.id).sort()).toEqual(['cm-dep-b', 'cm-wd-b']);
    const r = autoMatch([line('l1', '2026-03-06', 30000), line('l2', '2026-03-08', -7000)], movements);
    expect(r.map((p) => `${p.lineId}>${p.movementId}`).sort()).toEqual(['l1>cm-dep-b', 'l2>cm-wd-b']);
  });
});

describe('reconciliationSummary', () => {
  // Books: opening bank 100,000; +30,000 deposit; +15,000 cheque received; −5,000 rent; −8,000 cheque to supplier (not cleared).
  const moves = [
    mv('dep', '2026-03-02', 'in', 30000),
    mv('chq-in', '2026-03-03', 'in', 15000, 'Cheque'),
    mv('rent', '2026-03-04', 'out', 5000),
    mv('chq-out', '2026-03-06', 'out', 8000, 'Cheque'),
    mv('cash', '2026-03-04', 'in', 999, 'Cash'),
    mv('later', '2026-04-02', 'in', 1234),
  ];
  const lines = [
    line('l1', '2026-03-02', 30000, { status: 'matched', matchedMovementIds: ['dep'] }),
    line('l2', '2026-03-04', 15000, { status: 'matched', matchedMovementIds: ['chq-in'] }),
    line('l3', '2026-03-06', -5000, { status: 'matched', matchedMovementIds: ['rent'] }),
    line('l4', '2026-03-05', -250),
    line('l5', '2026-03-05', -99999, { status: 'ignored' }),
  ];

  it('explains the difference between books and statement', () => {
    const s = reconciliationSummary({ movements: moves, settings, lines, statementDate: '2026-03-31', closingBalance: 139750, clearedMovementIds: [] });
    expect(s.bookBalance).toBe(132000);
    expect(s.outstandingPayments.map((m) => m.id)).toEqual(['chq-out']);
    expect(s.outstandingPaymentsTotal).toBe(8000);
    expect(s.outstandingDepositsTotal).toBe(0);
    expect(s.unrecorded.map((l) => l.id)).toEqual(['l4']);
    expect(s.unrecordedTotal).toBe(-250);
    expect(s.expectedStatementBalance).toBe(139750);
    expect(s.difference).toBe(0);
    expect(s.reconciled).toBe(true);
    expect(s.clearedCount).toBe(3);
  });

  it('is not reconciled when the closing balance is off, and ticking cleared items changes the maths', () => {
    const off = reconciliationSummary({ movements: moves, settings, lines, statementDate: '2026-03-31', closingBalance: 131750, clearedMovementIds: [] });
    expect(off.reconciled).toBe(false);
    expect(off.difference).toBe(-8000);
    // The supplier cheque did clear after all → now the statement at 131,750 agrees.
    const ticked = reconciliationSummary({ movements: moves, settings, lines, statementDate: '2026-03-31', closingBalance: 131750, clearedMovementIds: ['chq-out'] });
    expect(ticked.outstandingPayments).toHaveLength(0);
    expect(ticked.reconciled).toBe(true);
  });

  it('only counts items up to the statement date', () => {
    const s = reconciliationSummary({ movements: moves, settings, lines, statementDate: '2026-03-03', closingBalance: 0, clearedMovementIds: [] });
    expect(s.bookBalance).toBe(145000);
    expect(s.unrecorded).toHaveLength(0);
    expect(s.outstandingPayments).toHaveLength(0);
  });
});

describe('bank reconciliation in the app', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('tradeflow_customers_v2', '[]');
    localStorage.setItem('tradeflow_ledger_v2', '[]');
    localStorage.setItem('tradeflow_expenses_v2', '[]');
    localStorage.setItem('tradeflow_cash_entries_v2', '[]');
  });

  it('imports, auto-matches, creates the missing expense, and saves a reconciliation', () => {
    const { result } = renderHook(() => useTrading(), { wrapper });
    act(() => { result.current.unlockAdmin('7860'); });
    act(() => { result.current.updateSettings({ cashOpeningBalance: 0, openingBankBalance: 100000, cashOpeningDate: '2026-01-01' }); });
    act(() => { result.current.addCashTransfer({ amount: 30000, from: 'cash', date: '2026-03-02' }); });
    let r: ReturnType<typeof result.current.addBankStatementLines> | undefined;
    act(() => {
      r = result.current.addBankStatementLines([
        { date: '2026-03-03', description: 'Cash deposit', amount: 30000 },
        { date: '2026-03-05', description: 'Bank charges', amount: -250 },
      ]);
    });
    expect(r).toEqual({ added: 2, duplicates: 0, matched: 1 });
    // Importing the same statement again adds nothing.
    act(() => { r = result.current.addBankStatementLines([{ date: '2026-03-03', description: 'Cash deposit', amount: 30000 }]); });
    expect(r).toEqual({ added: 0, duplicates: 1, matched: 0 });

    const charge = result.current.bankStatementLines.find((l) => l.amount === -250)!;
    expect(charge.status).toBe('unmatched');
    let c: { success: boolean; message: string } | undefined;
    act(() => { c = result.current.createEntryFromBankLine(charge.id); });
    expect(c?.success).toBe(true);
    const exp = result.current.expenses[0];
    expect(exp).toMatchObject({ amount: 250, category: 'bank_charges', paidVia: 'Bank Transfer', date: '2026-03-05' });
    const after = result.current.bankStatementLines.find((l) => l.id === charge.id)!;
    expect(after).toMatchObject({ status: 'matched', matchedMovementIds: [`cm-${exp.id}`], createdEntryId: exp.id });

    // Money received line → bank receipt cash entry.
    act(() => { result.current.addBankStatementLines([{ date: '2026-03-06', description: 'Profit credit', amount: 120 }]); });
    const profit = result.current.bankStatementLines.find((l) => l.amount === 120)!;
    act(() => { result.current.createEntryFromBankLine(profit.id); });
    const entry = result.current.cashEntries.find((e) => e.amount === 120)!;
    expect(entry).toMatchObject({ direction: 'in', method: 'Bank Transfer' });

    // Ignore / unignore / unmatch.
    act(() => { result.current.setBankLineIgnored(profit.id, true); });
    expect(result.current.bankStatementLines.find((l) => l.id === profit.id)!.status).toBe('ignored');
    act(() => { result.current.setBankLineIgnored(profit.id, false); });
    act(() => { result.current.matchBankLine(profit.id, [`cm-${entry.id}`]); });
    expect(result.current.bankStatementLines.find((l) => l.id === profit.id)!.matchConfidence).toBe('manual');

    const movements = collectCashMovements(result.current.ledger, result.current.expenses, result.current.cashEntries, result.current.customers, result.current.suppliers);
    const s = reconciliationSummary({ movements, settings: result.current.settings, lines: result.current.bankStatementLines, statementDate: '2026-03-31', closingBalance: 129870, clearedMovementIds: [] });
    expect(s.bookBalance).toBe(129870);
    expect(s.reconciled).toBe(true);
    act(() => { result.current.saveBankReconciliation({ statementDate: '2026-03-31', closingBalance: 129870, clearedMovementIds: [], bookBalance: s.bookBalance, difference: 0, reconciled: true }); });
    expect(result.current.bankReconciliations).toHaveLength(1);
    act(() => { result.current.saveBankReconciliation({ statementDate: '2026-03-31', closingBalance: 129870, clearedMovementIds: ['x'], reconciled: true }); });
    expect(result.current.bankReconciliations).toHaveLength(1);
    expect(result.current.bankReconciliations[0].clearedMovementIds).toEqual(['x']);
    expect(JSON.parse(localStorage.getItem('tradeflow_bank_statement_lines_v1') || '[]')).toHaveLength(3);
    expect(result.current.auditLogs.some((l) => l.action === 'Bank Reconciled')).toBe(true);
  });
});
