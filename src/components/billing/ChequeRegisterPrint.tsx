import React from 'react';
import { Cheque } from '../../types';
import { CHEQUE_VIEWS, ChequeView, chequeStatusLabel, chequeTotals, filterCheques } from '../../utils/cheques';
import { formatDate } from '../../utils/formatters';

const money = (n: number) => new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Printable cheque register: one list (or all cheques) with totals by status (used by PrintDocument). */
export const chequeRegisterPrintContent = (input: { cheques: Cheque[]; view?: string; today: string }) => {
  const view: ChequeView = CHEQUE_VIEWS.some((v) => v.id === input.view) ? (input.view as ChequeView) : 'all';
  const rows = filterCheques(input.cheques, view, input.today);
  const received = rows.filter((c) => c.direction === 'received');
  const issued = rows.filter((c) => c.direction === 'issued');
  const sum = (list: Cheque[]) => list.reduce((a, c) => a + c.amount, 0);
  const t = chequeTotals(input.cheques, input.today);
  const table = (title: string, list: Cheque[]) => (
    <>
      <div className="font-bold uppercase tracking-widest text-[10px] border-b-2 border-gray-900 pb-1 mb-1 mt-6">{title} ({list.length}) — Rs. {money(sum(list))}</div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-gray-600 border-b border-gray-300">
            <th className="text-left py-1.5">Cheque date</th>
            <th className="text-left py-1.5">Party</th>
            <th className="text-left py-1.5">Bank / No.</th>
            <th className="text-left py-1.5">Status</th>
            <th className="text-right py-1.5">Amount</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-500">None.</td></tr>}
          {list.map((c) => (
            <tr key={c.id} className="border-b border-gray-100 align-top">
              <td className="py-1.5 font-mono whitespace-nowrap">{formatDate(c.chequeDate)}</td>
              <td className="py-1.5">{c.partyName}<div className="text-[10px] text-gray-500">{c.direction === 'received' ? 'received' : 'given'} {formatDate(c.entryDate)}</div></td>
              <td className="py-1.5">{c.bankName}<div className="font-mono text-[10px] text-gray-600">#{c.chequeNumber}</div></td>
              <td className="py-1.5">{chequeStatusLabel(c)}{c.clearedDate ? ` ${formatDate(c.clearedDate)}` : c.returnedDate ? ` ${formatDate(c.returnedDate)}` : c.depositedDate ? ` ${formatDate(c.depositedDate)}` : ''}{c.returnReason ? <div className="text-[10px] text-gray-500">{c.returnReason}</div> : null}</td>
              <td className="py-1.5 text-right font-mono whitespace-nowrap">{money(c.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={4} className="pt-2 text-right font-bold text-[10px] uppercase tracking-widest text-gray-600">Total</td><td className="pt-2 text-right font-mono font-bold">{money(sum(list))}</td></tr>
        </tfoot>
      </table>
    </>
  );
  return {
    title: 'CHEQUE REGISTER',
    number: CHEQUE_VIEWS.find((v) => v.id === view)?.label || 'All',
    date: input.today,
    body: (
      <>
        <div className="grid grid-cols-4 gap-3 text-xs">
          {[
            ['In hand', t.inHand],
            ['Deposited', t.deposited],
            ['Issued, not cleared', t.issued],
            ['Bounced', t.bounced],
          ].map(([label, v]) => {
            const x = v as { count: number; amount: number };
            return (
              <div key={String(label)} className="border border-gray-300 rounded p-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">{String(label)}</div>
                <div className="font-mono font-bold text-sm">{money(x.amount)}</div>
                <div className="text-[10px] text-gray-500">{x.count} cheque{x.count === 1 ? '' : 's'}</div>
              </div>
            );
          })}
        </div>
        {(view !== 'issued' || received.length > 0) && table('Cheques received', received)}
        {(issued.length > 0 || view === 'issued' || view === 'all') && table('Cheques given', issued)}
        <div className="grid grid-cols-2 gap-10 mt-14 text-xs">
          <div className="border-t border-gray-900 pt-2">Prepared by</div>
          <div className="border-t border-gray-900 pt-2">Checked by</div>
        </div>
      </>
    ),
  };
};
