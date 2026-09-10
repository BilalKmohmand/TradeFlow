import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer, Receipt, HandCoins, ArrowLeftRight, FilePlus2 } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { Tile, cardCls, inputCls, primaryBtn, secondaryBtn, rs } from '../../components/billing/ui';
import { buildDailySheet } from '../../utils/billing';
import { todayISO, shiftDate } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { EXPENSE_CATEGORIES } from '../../types';

/** One day on one page: bills, money in, money out (by category), cash & bank opening/closing. */
export const DailySheetScreen: React.FC = () => {
  const { invoices, ledger, expenses, cashEntries, customers, suppliers, settings, setPrintRequest, deleteExpense, deleteCashEntry, can } = useTrading();
  const ui = useBillingUI();
  const [date, setDate] = useState(todayISO());
  const sheet = useMemo(() => buildDailySheet({ invoices, ledger, expenses, cashEntries, customers, suppliers, settings }, date), [invoices, ledger, expenses, cashEntries, customers, suppliers, settings, date]);
  const isToday = date === todayISO();
  const canDelete = can('delete_records');

  const Section: React.FC<{ title: string; total?: number; action?: React.ReactNode; children: React.ReactNode }> = ({ title, total, action, children }) => (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
        <h2 className="font-bold text-[#111827] dark:text-white">{title}</h2>
        <div className="flex items-center gap-2">
          {total != null && <span className="font-mono font-bold text-sm text-[#111827] dark:text-white">{rs(total)}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
  const Empty: React.FC<{ text: string }> = ({ text }) => <div className="px-5 py-5 text-sm text-[#8E9299]">{text}</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-white">Daily Sheet</h1>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Everything that happened on {formatDate(date)}{isToday ? ' (today)' : ''}.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day" className={`${secondaryBtn} px-2.5`}><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} className={`${inputCls} w-auto`} aria-label="Sheet date" />
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} disabled={isToday} aria-label="Next day" className={`${secondaryBtn} px-2.5`}><ChevronRight className="w-4 h-4" /></button>
          <button type="button" onClick={() => setPrintRequest({ type: 'daily_sheet', date })} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Print</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Opening cash" value={rs(sheet.opening.cash)} hint={`bank ${rs(sheet.opening.bank)}`} />
        <Tile label="Cash in" value={rs(sheet.cashIn)} tone="good" hint={`bank in ${rs(sheet.bankIn)}`} />
        <Tile label="Cash out" value={rs(sheet.cashOut)} tone={sheet.cashOut > 0 ? 'bad' : 'default'} hint={`bank out ${rs(sheet.bankOut)}`} />
        <Tile label="Closing cash" value={rs(sheet.closing.cash)} hint={`bank ${rs(sheet.closing.bank)}`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button type="button" onClick={() => ui.newBill()} className={`${secondaryBtn} py-3`}><FilePlus2 className="w-4 h-4 text-teal-700" /> New bill</button>
        <button type="button" onClick={() => ui.addExpense({ date })} className={`${secondaryBtn} py-3`}><Receipt className="w-4 h-4 text-rose-600" /> Add expense</button>
        <button type="button" onClick={() => ui.receive()} className={`${secondaryBtn} py-3`}><HandCoins className="w-4 h-4 text-teal-700" /> Receive payment</button>
        <button type="button" onClick={() => ui.transfer()} className={`${secondaryBtn} py-3`}><ArrowLeftRight className="w-4 h-4 text-indigo-600" /> Cash ↔ Bank</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title={`Bills (${sheet.bills.length})`} total={sheet.summary.sales}>
          {sheet.bills.length === 0 ? <Empty text="No bills on this day." /> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {sheet.bills.map((b) => (
                <li key={b.id}><button type="button" onClick={() => ui.openBill(b.id)} className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                  <span className="min-w-0"><span className="font-mono text-xs text-[#8E9299] mr-2">{b.invoiceNumber}</span><span className="font-semibold text-sm text-[#111827] dark:text-white">{b.customerName}</span></span>
                  <span className="text-right shrink-0"><span className="font-mono font-bold text-sm text-[#111827] dark:text-white">{rs(b.totalAmount)}</span><span className={`block text-[11px] font-bold ${b.balanceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{b.balanceDue > 0 ? `${rs(b.balanceDue)} credit` : `paid ${b.paymentMethod || ''}`}</span></span>
                </button></li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Money received" total={sheet.summary.received}>
          {sheet.receipts.length === 0 ? <Empty text="Nothing received." /> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {sheet.receipts.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5"><span className="min-w-0"><span className="font-semibold text-sm text-[#111827] dark:text-white">{m.counterparty}</span><span className="block text-[11px] text-[#8E9299] truncate">{m.method || 'Cash'}{m.reference ? ` • ${m.reference}` : ''}</span></span><span className="font-mono font-bold text-sm text-teal-700 dark:text-teal-300">{rs(m.amount)}</span></li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Expenses" total={sheet.summary.expenses} action={<button type="button" onClick={() => ui.addExpense({ date })} className="text-xs font-bold text-teal-700 dark:text-teal-300">+ Add</button>}>
          {sheet.expenses.length === 0 ? <Empty text="No expenses." /> : (
            <div className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {sheet.expenses.map((g) => (
                <div key={g.category} className="px-5 py-2.5">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]"><span>{g.label}</span><span className="font-mono">{rs(g.total)}</span></div>
                  <ul className="mt-1 space-y-1">
                    {g.rows.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{e.description}<span className="text-[11px] text-[#8E9299]"> • {e.paidVia || 'Cash'}</span></span><span className="flex items-center gap-1 shrink-0"><span className="font-mono">{rs(e.amount)}</span>{canDelete && <button type="button" onClick={() => deleteExpense(e.id)} aria-label={`Delete expense ${e.description}`} className="text-[#9CA3AF] hover:text-rose-600 text-xs px-1">✕</button>}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div className="px-5 py-2 border-t border-[#F1F0EC] dark:border-[#1E2E40] flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.slice(0, 5).map((c) => <button key={c.id} type="button" onClick={() => ui.addExpense({ date, category: c.id })} className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white">+ {c.label}</button>)}
          </div>
        </Section>

        <Section title="Suppliers paid & other" total={sheet.summary.supplierPayments + sheet.other.reduce((a, m) => a + (m.direction === 'out' ? m.amount : -m.amount), 0)}>
          {sheet.supplierPayments.length + sheet.other.length === 0 ? <Empty text="No supplier payments, deposits or withdrawals." /> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {sheet.supplierPayments.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5"><span className="min-w-0"><span className="font-semibold text-sm text-[#111827] dark:text-white">{m.counterparty}</span><span className="block text-[11px] text-[#8E9299]">{m.method || 'Cash'}</span></span><span className="font-mono font-bold text-sm text-rose-700 dark:text-rose-300">− {rs(m.amount)}</span></li>
              ))}
              {sheet.other.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5"><span className="min-w-0"><span className="font-semibold text-sm text-[#111827] dark:text-white">{m.description}</span><span className="block text-[11px] text-[#8E9299]">{m.direction === 'in' ? 'into' : 'out of'} {m.method || 'Cash'}</span></span><span className="flex items-center gap-1"><span className={`font-mono font-bold text-sm ${m.direction === 'in' ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>{m.direction === 'in' ? '+' : '−'} {rs(m.amount)}</span>{canDelete && <button type="button" onClick={() => deleteCashEntry(m.sourceId)} aria-label={`Delete entry ${m.description}`} className="text-[#9CA3AF] hover:text-rose-600 text-xs px-1">✕</button>}</span></li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
};
