import React from 'react';
import { AppSettings, BankStatementLine, BankReconciliation } from '../../types';
import { CashMovement } from '../../utils/finance';
import { reconciliationSummary } from '../../utils/bankRec';
import { formatDate } from '../../utils/formatters';

const money = (n: number) => new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Printable bank reconciliation statement (used by PrintDocument). */
export const bankRecPrintContent = (input: {
  statementDate: string;
  closingBalance: number;
  movements: CashMovement[];
  settings: AppSettings;
  lines: BankStatementLine[];
  reconciliations: BankReconciliation[];
}) => {
  const rec = input.reconciliations.find((r) => r.statementDate === input.statementDate);
  const cleared = input.reconciliations.flatMap((r) => r.clearedMovementIds);
  const s = reconciliationSummary({ movements: input.movements, settings: input.settings, lines: input.lines, statementDate: input.statementDate, closingBalance: input.closingBalance, clearedMovementIds: cleared });
  const row = (label: React.ReactNode, value: number | null, opts: { bold?: boolean; indent?: boolean; sign?: string } = {}) => (
    <tr className={`border-b border-gray-100 ${opts.bold ? 'font-bold' : ''}`}>
      <td className={`py-1.5 ${opts.indent ? 'pl-4 text-gray-600' : ''}`}>{label}</td>
      <td className="py-1.5 text-right font-mono whitespace-nowrap">{value === null ? '' : `${opts.sign || ''}${money(value)}`}</td>
    </tr>
  );
  return {
    title: 'BANK RECONCILIATION',
    number: `Statement to ${formatDate(input.statementDate)}`,
    date: input.statementDate,
    body: (
      <>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="border border-gray-300 rounded p-2"><div className="text-[10px] uppercase tracking-widest text-gray-500">Balance per bank statement</div><div className="font-mono font-bold text-sm">{money(s.closingBalance)}</div></div>
          <div className="border border-gray-300 rounded p-2"><div className="text-[10px] uppercase tracking-widest text-gray-500">Balance per books</div><div className="font-mono font-bold text-sm">{money(s.bookBalance)}</div></div>
          <div className={`border rounded p-2 ${s.reconciled ? 'border-teal-600' : 'border-rose-500'}`}><div className="text-[10px] uppercase tracking-widest text-gray-500">Difference</div><div className="font-mono font-bold text-sm">{s.reconciled ? 'Reconciled ✓' : money(s.difference)}</div></div>
        </div>
        <table className="w-full text-xs mt-6">
          <tbody>
            {row('Balance per books', s.bookBalance, { bold: true })}
            {row(`Less: money in the books not yet in the bank (${s.outstandingDeposits.length})`, s.outstandingDepositsTotal, { sign: '− ' })}
            {s.outstandingDeposits.map((m) => row(`${formatDate(m.date)} — ${m.counterparty ? `${m.counterparty}: ` : ''}${m.description} (${m.method})`, m.amount, { indent: true }))}
            {row(`Add: payments in the books not yet cleared (${s.outstandingPayments.length})`, s.outstandingPaymentsTotal, { sign: '+ ' })}
            {s.outstandingPayments.map((m) => row(`${formatDate(m.date)} — ${m.counterparty ? `${m.counterparty}: ` : ''}${m.description} (${m.method})`, m.amount, { indent: true }))}
            {row(`Add/less: bank items not yet in the books (${s.unrecorded.length})`, s.unrecordedTotal)}
            {s.unrecorded.map((l) => row(`${formatDate(l.date)} — ${l.description}${l.reference ? ` [${l.reference}]` : ''}`, l.amount, { indent: true }))}
            {row('Balance the statement should show', s.expectedStatementBalance, { bold: true })}
            {row('Balance per bank statement', s.closingBalance, { bold: true })}
            {row(s.reconciled ? 'Difference — Reconciled ✓' : 'Difference (not explained)', s.difference, { bold: true })}
          </tbody>
        </table>
        <div className="mt-4 text-[11px] text-gray-500">
          {s.clearedCount} book entr{s.clearedCount === 1 ? 'y' : 'ies'} cleared • {input.lines.filter((l) => l.status === 'matched' && l.date <= input.statementDate).length} statement line(s) matched • {input.lines.filter((l) => l.status === 'ignored').length} ignored
          {rec?.updatedAt || rec?.createdAt ? ` • saved ${formatDate((rec.updatedAt || rec.createdAt).slice(0, 10))}` : ''}
        </div>
        <div className="grid grid-cols-2 gap-10 mt-14 text-xs">
          <div className="border-t border-gray-900 pt-2">Prepared by</div>
          <div className="border-t border-gray-900 pt-2">Checked by</div>
        </div>
      </>
    ),
  };
};
