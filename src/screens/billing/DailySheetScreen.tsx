import { CsvButton } from '../../components/billing/CsvButton';
import { dailySheetCsv } from '../../utils/csvReports';
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer, Receipt, HandCoins, ArrowLeftRight, FilePlus2, Trash2 } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { Tile, cardCls, inputCls, primaryBtn, secondaryBtn, rs, moneyCls, PageHeader, RowAction } from '../../components/billing/ui';
import { buildDailySheet } from '../../utils/billing';
import { todayISO, shiftDate } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { booksLockedFor } from '../../utils/accounting';
import { EXPENSE_CATEGORIES } from '../../types';
import { CHEQUE_EVENT_LABEL } from '../../utils/cheques';
import { useBranchScoped } from '../../hooks/useBranchScoped';
import { BranchFilter } from '../../components/control/BranchFilter';
import { ConfirmDialog } from '../../components/ConfirmDialog';

/** One day on one page: bills, money in, money out (by category), cash & bank opening/closing. */
export const DailySheetScreen: React.FC = () => {
  const { customers, suppliers, setPrintRequest, deleteExpense, deleteCashEntry, can, cheques, isLinkedRecord } = useTrading();
  const { invoices, ledger, expenses, cashEntries, settings } = useBranchScoped();
  const [pendingDel, setPendingDel] = useState<{ kind: 'expense' | 'cash'; id: string; label: string } | null>(null);
  const ui = useBillingUI();
  const [date, setDate] = useState(todayISO());
  const sheet = useMemo(() => buildDailySheet({ invoices, ledger, expenses, cashEntries, customers, suppliers, settings, cheques }, date), [invoices, ledger, expenses, cashEntries, customers, suppliers, settings, cheques, date]);
  const isToday = date === todayISO();
  const canDelete = can('delete_records');

  const Section: React.FC<{ title: string; total?: number; action?: React.ReactNode; children: React.ReactNode }> = ({ title, total, action, children }) => (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
        <h2 className="font-bold text-[#111827] dark:text-white">{title}</h2>
        <div className="flex items-center gap-2">
          {total != null && <span className={`${moneyCls} font-bold text-sm text-[#111827] dark:text-white`}>{rs(total)}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
  const Empty: React.FC<{ text: string }> = ({ text }) => <div className="px-4 sm:px-5 py-5 text-sm text-[#6B7280] dark:text-[#94A3B8]">{text}</div>;

  return (
    <div className="space-y-5">
      <PageHeader title="Daily Sheet" subtitle={`Everything that happened on ${formatDate(date)}${isToday ? ' (today)' : ''}.`}>
        <BranchFilter />
        <CsvButton fileName={`daily-sheet-${date}.csv`} table={() => dailySheetCsv(sheet)} label="Download daily sheet CSV" />
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day" className={`${secondaryBtn} px-2.5 max-sm:min-w-11`}><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value > todayISO() ? todayISO() : e.target.value)} className={`${inputCls} flex-1 sm:flex-none sm:w-auto min-w-0`} aria-label="Sheet date" />
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} disabled={isToday} aria-label="Next day" className={`${secondaryBtn} px-2.5 max-sm:min-w-11`}><ChevronRight className="w-4 h-4" /></button>
          <button type="button" onClick={() => setPrintRequest({ type: 'daily_sheet', date })} className={`${primaryBtn} max-[400px]:px-3.5`}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> <span className="max-[400px]:sr-only">Print</span></button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Opening cash" value={rs(sheet.opening.cash)} hint={`bank ${rs(sheet.opening.bank)}`} />
        <Tile label="Cash in" value={rs(sheet.cashIn)} tone="good" hint={`bank in ${rs(sheet.bankIn)}`} />
        <Tile label="Cash out" value={rs(sheet.cashOut)} tone={sheet.cashOut > 0 ? 'bad' : 'default'} hint={`bank out ${rs(sheet.bankOut)}`} />
        <Tile label="Closing cash" value={rs(sheet.closing.cash)} hint={`bank ${rs(sheet.closing.bank)}`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button type="button" onClick={() => ui.newBill()} className={`${secondaryBtn} py-3`}><FilePlus2 className="w-4 h-4 text-teal-700 dark:text-teal-300" /> New bill</button>
        <button type="button" onClick={() => ui.addExpense({ date })} className={`${secondaryBtn} py-3`}><Receipt className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Add expense</button>
        <button type="button" onClick={() => ui.receive()} className={`${secondaryBtn} py-3`}><HandCoins className="w-4 h-4 text-teal-700 dark:text-teal-300" /> Receive payment</button>
        <button type="button" onClick={() => ui.transfer()} className={`${secondaryBtn} py-3`}><ArrowLeftRight className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /> Cash ↔ Bank</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title={`Bills (${sheet.bills.length})`} total={sheet.summary.sales}>
          {sheet.bills.length === 0 ? <Empty text="No bills on this day." /> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {sheet.bills.map((b) => (
                <li key={b.id}><button type="button" onClick={() => ui.openBill(b.id)} className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 text-left hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                  <span className="min-w-0"><span className="text-xs text-[#6B7280] dark:text-[#8E9299] mr-2">{b.invoiceNumber}</span><span className="font-semibold text-sm text-[#111827] dark:text-white">{b.customerName}</span></span>
                  <span className="text-right shrink-0"><span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(b.totalAmount)}</span><span className={`block text-[11px] font-bold ${b.balanceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{b.balanceDue > 0 ? `${rs(b.balanceDue)} credit` : `paid ${b.paymentMethod || ''}`}</span></span>
                </button></li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Money received" total={sheet.summary.received}>
          {sheet.receipts.length === 0 ? <Empty text="Nothing received." /> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {sheet.receipts.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5"><span className="min-w-0"><span className="font-semibold text-sm text-[#111827] dark:text-white">{m.counterparty}</span><span className="block text-[11px] text-[#8E9299] truncate">{m.method || 'Cash'}{m.reference ? ` • ${m.reference}` : ''}</span></span><span className="tabular-nums whitespace-nowrap font-bold text-sm text-teal-700 dark:text-teal-300">{rs(m.amount)}</span></li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Expenses" total={sheet.summary.expenses} action={<button type="button" onClick={() => ui.addExpense({ date })} aria-label="Add expense on this day" className="text-xs font-bold text-teal-700 dark:text-teal-300 min-h-9 px-2 -mr-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40">+ Add</button>}>
          {sheet.expenses.length === 0 ? <Empty text="No expenses." /> : (
            <div className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {sheet.expenses.map((g) => (
                <div key={g.category} className="px-4 sm:px-5 py-2.5">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]"><span>{g.label}</span><span className="tabular-nums whitespace-nowrap">{rs(g.total)}</span></div>
                  <ul className="mt-1 space-y-1">
                    {g.rows.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{e.description}<span className="text-[11px] text-[#8E9299]"> • {e.paidVia || 'Cash'}</span></span><span className="flex items-center gap-1 shrink-0"><span className="tabular-nums whitespace-nowrap">{rs(e.amount)}</span>{canDelete && !booksLockedFor(settings, e.date) && !isLinkedRecord(e.id) && <RowAction label={`Delete expense ${e.description}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPendingDel({ kind: 'expense', id: e.id, label: `${e.description} (${rs(e.amount)})` })} />}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 sm:px-5 py-2.5 border-t border-[#F1F0EC] dark:border-[#1E2E40] flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.slice(0, 5).map((c) => <button key={c.id} type="button" onClick={() => ui.addExpense({ date, category: c.id })} className="min-h-9 px-3 py-2 rounded-full text-[11px] font-semibold bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white">+ {c.label}</button>)}
          </div>
        </Section>

        <Section title="Suppliers paid, deposits & withdrawals" total={sheet.summary.supplierPayments}>
          {sheet.supplierPayments.length + sheet.other.length === 0 ? <Empty text="No supplier payments, deposits or withdrawals." /> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {sheet.supplierPayments.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5"><span className="min-w-0"><span className="font-semibold text-sm text-[#111827] dark:text-white">{m.counterparty}</span><span className="block text-[11px] text-[#8E9299]">{m.method || 'Cash'}</span></span><span className="tabular-nums whitespace-nowrap font-bold text-sm text-rose-700 dark:text-rose-300">− {rs(m.amount)}</span></li>
              ))}
              {sheet.other.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5"><span className="min-w-0"><span className="block font-semibold text-sm text-[#111827] dark:text-white">{m.description}</span><span className="block text-[11px] text-[#8E9299]">{m.description.startsWith('Deposited') ? 'cash → bank' : m.description.startsWith('Withdrew') ? 'bank → cash' : `${m.direction === 'in' ? 'into' : 'out of'} ${m.method || 'Cash'}`}</span></span><span className="flex items-center gap-1"><span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(m.amount)}</span>{canDelete && !booksLockedFor(settings, m.date) && !isLinkedRecord(m.sourceId) && <RowAction label={`Delete entry ${m.description}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPendingDel({ kind: 'cash', id: m.sourceId, label: `${m.description} (${rs(m.amount)})` })} />}</span></li>
              ))}
            </ul>
          )}
        </Section>

        {sheet.cheques.length > 0 && (
          <Section title={`Cheques (${sheet.cheques.length})`}>
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]" data-testid="daily-cheques">
              {sheet.cheques.map((ev) => {
                const c = ev.cheque;
                const out = c.direction === 'issued';
                return (
                  <li key={`${c.id}-${ev.kind}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5">
                    <span className="min-w-0"><span className="font-semibold text-sm text-[#111827] dark:text-white">{CHEQUE_EVENT_LABEL[ev.kind]}{out ? ' to' : ev.kind === 'received' ? ' from' : ' •'} {c.partyName}</span><span className="block text-[11px] text-[#8E9299] truncate">#{c.chequeNumber} {c.bankName} • dated {formatDate(c.chequeDate)}{ev.kind === 'cleared' ? (out ? ' • paid from bank' : ' • into bank') : ev.kind === 'received' || ev.kind === 'issued' ? ' • not in bank yet' : ''}{c.returnReason && (ev.kind === 'bounced' || ev.kind === 'cancelled') ? ` • ${c.returnReason}` : ''}</span></span>
                    <span className={`tabular-nums whitespace-nowrap font-bold text-sm ${ev.kind === 'bounced' ? 'text-rose-700 dark:text-rose-300' : 'text-[#111827] dark:text-white'}`}>{rs(c.amount)}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </div>
      <ConfirmDialog
        isOpen={Boolean(pendingDel)}
        title={pendingDel?.kind === 'cash' ? 'Delete this entry?' : 'Delete this expense?'}
        message={`${pendingDel?.label || ''} is taken out of the day. A copy is kept in Admin → Deleted records.`}
        confirmLabel="Delete"
        onCancel={() => setPendingDel(null)}
        onConfirm={() => {
          if (pendingDel?.kind === 'expense') deleteExpense(pendingDel.id);
          else if (pendingDel) deleteCashEntry(pendingDel.id);
          setPendingDel(null);
        }}
      />
    </div>
  );
};
