import React from 'react';
import { BankReconciliation, BankStatementLine, CashEntry, Expense, ExpenseCategory, LedgerEntry } from '../types';
import { CashMovement } from '../utils/finance';
import { ParsedStatementLine, autoMatch, splitNewLines, confidenceFor, daysApart } from '../utils/bankRec';
import { formatCurrency } from '../utils/formatters';

/** Bank statement lines + reconciliations: everything the "Bank reconciliation" tab can do. */
export interface BankRecApi {
  bankStatementLines: BankStatementLine[];
  bankReconciliations: BankReconciliation[];
  /** Add statement lines (skips ones already imported) and auto-match them straight away. */
  addBankStatementLines: (lines: ParsedStatementLine[]) => { added: number; duplicates: number; matched: number };
  deleteBankStatementLine: (id: string) => void;
  /** Re-run auto-matching on every unmatched line. Returns how many were matched. */
  autoMatchBankLines: () => number;
  matchBankLine: (lineId: string, movementIds: string[]) => { success: boolean; message: string };
  unmatchBankLine: (lineId: string) => void;
  setBankLineIgnored: (lineId: string, ignored: boolean) => void;
  /** Create the missing record for an unmatched line (expense for money out, bank receipt for money in) and match it. */
  createEntryFromBankLine: (lineId: string, opts?: { category?: ExpenseCategory; description?: string; customerId?: string; supplierId?: string }) => { success: boolean; message: string };
  /** Create or update the reconciliation for a statement end date. */
  saveBankReconciliation: (data: Omit<BankReconciliation, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => BankReconciliation;
  deleteBankReconciliation: (id: string) => void;
}

interface Deps {
  lines: BankStatementLine[];
  setLines: React.Dispatch<React.SetStateAction<BankStatementLine[]>>;
  recs: BankReconciliation[];
  setRecs: React.Dispatch<React.SetStateAction<BankReconciliation[]>>;
  getMovements: () => CashMovement[];
  addExpense: (data: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => Expense;
  addCashEntry: (data: Omit<CashEntry, 'id' | 'createdAt' | 'createdBy'>) => CashEntry;
  lockedFor?: (date: string) => string | null;
  /** Whether the signed-in user may change bank reconciliation (cash book permission). */
  canEdit?: () => boolean;
  recordCustomerPayment?: (customerId: string, amount: number, notes?: string, date?: string) => LedgerEntry | undefined;
  recordSupplierPayment?: (supplierId: string, amount: number, notes?: string, date?: string) => LedgerEntry | undefined;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger') => void;
  removeRemote: (table: 'bank_statement_lines' | 'bank_reconciliations', ids: string[]) => void;
  uid: (prefix: string) => string;
  userName?: string;
  today: () => string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const createBankRecApi = (d: Deps): BankRecApi => {
  const applyProposals = (all: BankStatementLine[]): { lines: BankStatementLine[]; matched: number } => {
    const proposals = autoMatch(all, d.getMovements());
    if (proposals.length === 0) return { lines: all, matched: 0 };
    const byLine = new Map(proposals.map((p) => [p.lineId, p]));
    return {
      lines: all.map((l) => {
        const p = byLine.get(l.id);
        return p ? { ...l, status: 'matched' as const, matchedMovementIds: [p.movementId], matchConfidence: p.confidence } : l;
      }),
      matched: proposals.length,
    };
  };

  const addBankStatementLines: BankRecApi['addBankStatementLines'] = (incoming) => {
    if (d.canEdit && !d.canEdit()) return { added: 0, duplicates: 0, matched: 0 };
    const clean = incoming
      .filter((l) => l.date && Number.isFinite(l.amount) && Math.abs(l.amount) >= 0.005)
      .map((l) => ({ ...l, amount: round2(l.amount), description: (l.description || '').trim() || 'Bank entry', reference: l.reference?.trim() || undefined }));
    const { fresh, duplicates } = splitNewLines(d.lines, clean);
    const importedAt = new Date().toISOString();
    const rows: BankStatementLine[] = fresh.map((l) => ({ id: d.uid('bsl'), date: l.date, description: l.description, amount: l.amount, reference: l.reference, importedAt, matchedMovementIds: [], status: 'unmatched' }));
    const { lines, matched } = applyProposals([...d.lines, ...rows]);
    d.setLines(lines);
    if (rows.length > 0) d.logAuditEvent('Bank Statement Imported', `${rows.length} line(s) added${duplicates.length ? `, ${duplicates.length} already there skipped` : ''}; ${matched} matched automatically.`, 'info');
    return { added: rows.length, duplicates: duplicates.length, matched };
  };

  const deleteBankStatementLine = (id: string) => {
    const line = d.lines.find((l) => l.id === id);
    if (!line) return;
    d.setLines((prev) => prev.filter((l) => l.id !== id));
    d.removeRemote('bank_statement_lines', [id]);
    d.logAuditEvent('Bank Statement Line Deleted', `${line.date} ${line.description}: ${formatCurrency(line.amount)}`, 'warning');
  };

  const autoMatchBankLines = () => {
    if (d.canEdit && !d.canEdit()) return 0;
    const { lines, matched } = applyProposals(d.lines);
    if (matched > 0) d.setLines(lines);
    return matched;
  };

  const matchBankLine: BankRecApi['matchBankLine'] = (lineId, movementIds) => {
    if (d.canEdit && !d.canEdit()) return { success: false, message: 'You need cash book permission to change the bank reconciliation.' };
    const line = d.lines.find((l) => l.id === lineId);
    if (!line) return { success: false, message: 'Statement line not found.' };
    if (movementIds.length === 0) return { success: false, message: 'Pick the record that matches this line.' };
    const usedElsewhere = new Set(d.lines.filter((l) => l.id !== lineId && l.status === 'matched').flatMap((l) => l.matchedMovementIds));
    if (movementIds.some((m) => usedElsewhere.has(m))) return { success: false, message: 'That record is already matched to another statement line.' };
    const moves = d.getMovements().filter((m) => movementIds.includes(m.id));
    const total = round2(moves.reduce((a, m) => a + (m.direction === 'in' ? m.amount : -m.amount), 0));
    d.setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, status: 'matched', matchedMovementIds: movementIds, matchConfidence: 'manual' } : l)));
    const gap = round2(line.amount - total);
    return { success: true, message: Math.abs(gap) < 0.005 ? 'Matched.' : `Matched, but the amounts differ by ${formatCurrency(Math.abs(gap))}.` };
  };

  const unmatchBankLine = (lineId: string) => {
    if (d.canEdit && !d.canEdit()) return;
    d.setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, status: 'unmatched', matchedMovementIds: [], matchConfidence: undefined } : l)));
  };

  const setBankLineIgnored = (lineId: string, ignored: boolean) => {
    if (d.canEdit && !d.canEdit()) return;
    d.setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, status: ignored ? 'ignored' : 'unmatched', matchedMovementIds: [], matchConfidence: undefined } : l)));
  };

  const createEntryFromBankLine: BankRecApi['createEntryFromBankLine'] = (lineId, opts) => {
    if (d.canEdit && !d.canEdit()) return { success: false, message: 'You need cash book permission to change the bank reconciliation.' };
    const line = d.lines.find((l) => l.id === lineId);
    if (!line) return { success: false, message: 'Statement line not found.' };
    if (line.status === 'matched') return { success: false, message: 'This line is already matched.' };
    const closed = d.lockedFor?.(line.date);
    if (closed) return { success: false, message: closed };
    const amount = round2(Math.abs(line.amount));
    const description = (opts?.description || '').trim() || line.description || 'Bank entry';
    let movementId: string;
    let entryId: string;
    let message: string;
    if (line.amount > 0 && opts?.customerId && d.recordCustomerPayment) {
      // A customer's transfer: it reduces what they owe, exactly like taking a payment by bank.
      const row = d.recordCustomerPayment(opts.customerId, amount, `Bank Transfer - ${description}`, line.date);
      if (!row) return { success: false, message: 'Customer not found.' };
      entryId = row.id;
      movementId = `cm-${row.id}`;
      message = `${formatCurrency(amount)} received from the customer by bank, recorded and matched.`;
    } else if (line.amount < 0 && opts?.supplierId && d.recordSupplierPayment) {
      const row = d.recordSupplierPayment(opts.supplierId, amount, `Bank Transfer - ${description}`, line.date);
      if (!row) return { success: false, message: 'Supplier not found.' };
      entryId = row.id;
      movementId = `cm-${row.id}`;
      message = `${formatCurrency(amount)} paid to the supplier from the bank, recorded and matched.`;
    } else if (line.amount < 0) {
      const category = opts?.category || 'bank_charges';
      const exp = d.addExpense({ date: line.date, category, amount, description, paidVia: 'Bank Transfer', referenceId: line.reference });
      entryId = exp.id;
      movementId = `cm-${exp.id}`;
      message = `Expense of ${formatCurrency(amount)} added (paid from bank) and matched.`;
    } else {
      // Unknown source: parked in Suspense for the accountant, never guessed from the bank's narration.
      const entry = d.addCashEntry({ date: line.date, direction: 'in', amount, description, method: 'Bank Transfer', accountCode: '2900' });
      entryId = entry.id;
      movementId = `cm-${entry.id}`;
      message = `Money received into bank ${formatCurrency(amount)} added (for your accountant to classify) and matched.`;
    }
    d.setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, status: 'matched', matchedMovementIds: [movementId], matchConfidence: confidenceFor(daysApart(line.date, line.date)), createdEntryId: entryId } : l)));
    return { success: true, message };
  };

  const saveBankReconciliation: BankRecApi['saveBankReconciliation'] = (data) => {
    const existing = d.recs.find((r) => r.statementDate === data.statementDate);
    const now = new Date().toISOString();
    const rec: BankReconciliation = existing
      ? { ...existing, ...data, closingBalance: round2(data.closingBalance), updatedAt: now }
      : { ...data, closingBalance: round2(data.closingBalance), id: d.uid('brec'), createdAt: now, createdBy: d.userName };
    d.setRecs((prev) => (existing ? prev.map((r) => (r.id === existing.id ? rec : r)) : [rec, ...prev]));
    if (data.reconciled && !existing?.reconciled) d.logAuditEvent('Bank Reconciled', `Statement to ${data.statementDate}: closing ${formatCurrency(rec.closingBalance)} agrees with the books.`, 'info');
    return rec;
  };

  const deleteBankReconciliation = (id: string) => {
    d.setRecs((prev) => prev.filter((r) => r.id !== id));
    d.removeRemote('bank_reconciliations', [id]);
  };

  return {
    bankStatementLines: d.lines,
    bankReconciliations: d.recs,
    addBankStatementLines,
    deleteBankStatementLine,
    autoMatchBankLines,
    matchBankLine,
    unmatchBankLine,
    setBankLineIgnored,
    createEntryFromBankLine,
    saveBankReconciliation,
    deleteBankReconciliation,
  };
};
