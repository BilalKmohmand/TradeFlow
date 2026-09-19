import React from 'react';
import { Books } from '../../hooks/useAccounting';
import { StatementRow, balanceSheet, profitAndLoss, trialBalance } from '../../utils/accounting';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';

export type AccountingPrintRequest =
  | { type: 'trial_balance'; asOf: string }
  | { type: 'profit_loss'; from: string; to: string }
  | { type: 'balance_sheet'; asOf: string };

export const isAccountingPrint = (r: { type: string } | null | undefined): r is AccountingPrintRequest =>
  !!r && (r.type === 'trial_balance' || r.type === 'profit_loss' || r.type === 'balance_sheet');

const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);

const Section: React.FC<{ title: string; rows: StatementRow[]; total: number; totalLabel: string }> = ({ title, rows, total, totalLabel }) => (
  <>
    <tr><td colSpan={2} className="pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</td></tr>
    {rows.length === 0 && <tr><td colSpan={2} className="py-1 text-gray-400">—</td></tr>}
    {rows.map((r) => (
      <tr key={r.account.code} className="border-b border-gray-100">
        <td className="py-1.5"><span className="font-mono text-gray-500 mr-2">{r.account.code}</span>{r.account.name}</td>
        <td className="py-1.5 text-right font-mono">{money(r.amount)}</td>
      </tr>
    ))}
    <tr className="font-bold border-b border-gray-300"><td className="py-1.5">{totalLabel}</td><td className="py-1.5 text-right font-mono">{money(total)}</td></tr>
  </>
);

/** Printable trial balance, profit & loss and balance sheet, laid out like the other documents. */
export const accountingPrintContent = (request: AccountingPrintRequest, books: Books): { title: string; number: string; date: string; body: React.ReactNode } => {
  const { journal, accounts } = books;
  if (request.type === 'trial_balance') {
    const tb = trialBalance(journal, accounts, request.asOf);
    return {
      title: 'TRIAL BALANCE',
      number: `As of ${formatDate(request.asOf)}`,
      date: todayISO(),
      body: (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-900 text-[10px] uppercase tracking-widest text-gray-600">
              <th className="text-left py-2">Code</th>
              <th className="text-left py-2">Account</th>
              <th className="text-right py-2">Debit</th>
              <th className="text-right py-2">Credit</th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.map((r) => (
              <tr key={r.account.code} className="border-b border-gray-100">
                <td className="py-1.5 font-mono">{r.account.code}</td>
                <td className="py-1.5">{r.account.name}</td>
                <td className="py-1.5 text-right font-mono">{r.debit ? money(r.debit) : ''}</td>
                <td className="py-1.5 text-right font-mono">{r.credit ? money(r.credit) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold border-t-2 border-gray-900">
              <td colSpan={2} className="pt-2">Total</td>
              <td className="pt-2 text-right font-mono">{money(tb.totalDebit)}</td>
              <td className="pt-2 text-right font-mono">{money(tb.totalCredit)}</td>
            </tr>
            <tr><td colSpan={4} className={`pt-2 text-right text-[11px] font-bold ${tb.balanced ? 'text-teal-700' : 'text-rose-700'}`}>{tb.balanced ? 'Balanced' : `Out of balance by ${money(Math.abs(tb.difference))}`}</td></tr>
          </tfoot>
        </table>
      ),
    };
  }
  if (request.type === 'profit_loss') {
    const p = profitAndLoss(journal, request.from, request.to, accounts);
    return {
      title: 'PROFIT & LOSS',
      number: `${formatDate(request.from)} – ${formatDate(request.to)}`,
      date: todayISO(),
      body: (
        <table className="w-full text-xs border-collapse">
          <tbody>
            <Section title="Income" rows={p.income} total={p.totalIncome} totalLabel="Total income" />
            <Section title="Cost of sales" rows={p.costOfSales} total={p.totalCostOfSales} totalLabel="Total cost of sales" />
            <tr className="font-bold"><td className="py-2">Gross profit</td><td className="py-2 text-right font-mono">{money(p.grossProfit)}</td></tr>
            <Section title="Expenses" rows={p.expenses} total={p.totalExpenses} totalLabel="Total expenses" />
            <tr className="font-extrabold border-t-2 border-gray-900"><td className="pt-3 text-sm">{p.netProfit >= 0 ? 'Net profit' : 'Net loss'}</td><td className="pt-3 text-right font-mono text-sm">{money(p.netProfit)}</td></tr>
          </tbody>
        </table>
      ),
    };
  }
  const bs = balanceSheet(journal, request.asOf, accounts);
  return {
    title: 'BALANCE SHEET',
    number: `As of ${formatDate(request.asOf)}`,
    date: todayISO(),
    body: (
      <table className="w-full text-xs border-collapse">
        <tbody>
          <Section title="Assets" rows={bs.assets} total={bs.totalAssets} totalLabel="Total assets" />
          <Section title="Liabilities" rows={bs.liabilities} total={bs.totalLiabilities} totalLabel="Total liabilities" />
          <Section title="Equity" rows={[...bs.equity, { account: { code: '', name: 'Profit to date (not yet closed)', type: 'equity' }, amount: bs.profitToDate }]} total={bs.totalEquity} totalLabel="Total equity" />
          <tr className="font-extrabold border-t-2 border-gray-900"><td className="pt-3">Liabilities + equity</td><td className="pt-3 text-right font-mono">{money(bs.totalLiabilities + bs.totalEquity)}</td></tr>
          <tr><td colSpan={2} className={`pt-2 text-right text-[11px] font-bold ${bs.balanced ? 'text-teal-700' : 'text-rose-700'}`}>{bs.balanced ? 'Assets = Liabilities + Equity' : `Out of balance by ${money(Math.abs(bs.difference))}`}</td></tr>
        </tbody>
      </table>
    ),
  };
};
