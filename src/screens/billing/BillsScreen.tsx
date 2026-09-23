import React, { useMemo, useState } from 'react';
import { FilePlus2, Search, Printer, Download, FileText } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useWideLayout } from '../../hooks/useMediaQuery';
import { useBillingUI, useRequestedView, useCurrentView } from '../../components/billing/BillingUI';
import { cardCls, inputCls, primaryBtn, secondaryBtn, rs, moneyCls, PageHeader, EmptyState, RowAction, pillCls, thCls, tableCardCls } from '../../components/billing/ui';
import { filterBills } from '../../utils/billing';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { downloadCsvFile } from '../../utils/listTools';
import { billNetTotal } from '../../utils/salesDocs';
import { ReturnsList, QuotationsList } from '../../components/billing/SalesDocsLists';
import { useBranchScoped } from '../../hooks/useBranchScoped';
import { BranchFilter } from '../../components/control/BranchFilter';
import { ApprovalsTile } from '../../components/control/Approvals';
import { NumberNoticesBanner } from '../../components/control/NumberNotices';

type Period = 'today' | 'week' | 'month' | 'all';

/** Every bill, newest first, with search and quick period filters. Tap a row to open it. */
/** The Bills tabs (the nav map has an entry for each). */
export const BILLS_TABS = ['bills', 'returns', 'quotes'] as const;

export const BillsScreen: React.FC = () => {
  const { setPrintRequest, returns, quotations, customers } = useTrading();
  const { invoices } = useBranchScoped();
  const ui = useBillingUI();
  const wide = useWideLayout();
  const [tab, setTab] = useState<'bills' | 'returns' | 'quotes'>(() => { const v = ui.peekView('bills'); return v === 'returns' || v === 'quotes' ? v : 'bills'; });
  useRequestedView('bills', (v) => { if (v === 'bills' || v === 'returns' || v === 'quotes') setTab(v); });
  useCurrentView('bills', tab);
  const billReturnCount = returns.filter((r) => r.kind === 'sales' && r.invoiceId).length;
  const openQuoteCount = quotations.filter((q) => q.items?.length && q.status !== 'converted' && q.status !== 'rejected').length;
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('today');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const today = todayISO();
  const rows = useMemo(() => filterBills(invoices, query, period, today, unpaidOnly, customers), [invoices, query, period, today, unpaidOnly, customers]);
  const total = rows.reduce((a, i) => a + billNetTotal(i), 0);
  const due = rows.reduce((a, i) => a + i.balanceDue, 0);

  const exportCsv = () =>
    downloadCsvFile(
      `bills-${period}-${today}.csv`,
      ['Bill', 'Date', 'Customer', 'Phone', 'Items', 'Total', 'Paid', 'Balance', 'Method'],
      rows.map((i) => [i.invoiceNumber, i.issueDate, i.customerName, i.customerPhone || '', i.items.map((it) => `${it.qty ?? it.kg} ${it.unit || ''} ${it.productName}`).join('; '), i.totalAmount, i.paidAmount, i.balanceDue, i.paymentMethod || ''])
    );

  const periods: { id: Period; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: '7 days' },
    { id: 'month', label: 'This month' },
    { id: 'all', label: 'All' },
  ];

  const itemsText = (i: (typeof rows)[number]) => i.items.map((it) => `${it.productName} × ${it.qty ?? it.kg}`).join(', ');
  const status = (i: (typeof rows)[number]) =>
    i.balanceDue > 0 ? <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{rs(i.balanceDue)} due</span> : <span className="text-xs font-bold text-teal-700 dark:text-teal-300">Paid</span>;

  return (
    <div className="space-y-5">
      <PageHeader title="Bills" subtitle={<>{rows.length} bill{rows.length === 1 ? '' : 's'} • <span className={moneyCls}>{rs(total)}</span>{due > 0 ? <> • <span className={moneyCls}>{rs(due)}</span> still due</> : ''}</>}>
        <BranchFilter />
        {tab === 'quotes' && <button type="button" onClick={() => ui.newQuote()} className={secondaryBtn}><FileText className="w-4 h-4" /> New Quotation</button>}
        <button type="button" onClick={() => ui.newBill()} className={`${primaryBtn} max-sm:flex-1`}><FilePlus2 className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New Bill</button>
      </PageHeader>
      <NumberNoticesBanner />

      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]" role="tablist" aria-label="Bills, returns and quotations">
        {([['bills', 'Bills'], ['returns', `Returns${billReturnCount ? ` (${billReturnCount})` : ''}`], ['quotes', `Quotations${openQuoteCount ? ` (${openQuoteCount})` : ''}`]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`${pillCls(tab === id, 'teal')} px-4 text-sm`}>{label}</button>
        ))}
      </div>

      <ApprovalsTile />
      {tab === 'returns' && <ReturnsList />}
      {tab === 'quotes' && <QuotationsList />}
      {tab === 'bills' && (<>

      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bill no., memo no., customer, phone or item" className={`${inputCls} pl-10`} aria-label="Search bills" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {periods.map((p) => (
            <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} className={pillCls(period === p.id)}>{p.label}</button>
          ))}
          <button type="button" aria-pressed={unpaidOnly} onClick={() => setUnpaidOnly((v) => !v)} className={pillCls(unpaidOnly, 'amber')}>Unpaid</button>
          <button type="button" onClick={exportCsv} className={`${secondaryBtn} min-h-11 sm:min-h-9 py-0 px-3 shrink-0`} aria-label="Download as CSV" title="Download as CSV"><Download className="w-4 h-4" /><span className="hidden sm:inline text-xs font-bold">CSV</span></button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={cardCls}>
          <EmptyState
            icon={<FileText className="w-5 h-5" />}
            text={query || unpaidOnly || period !== 'all' ? 'No bills match. Try another period or clear the search.' : 'No bills yet.'}
            action={<button type="button" onClick={() => ui.newBill()} className={secondaryBtn}><FilePlus2 className="w-4 h-4 text-teal-700 dark:text-teal-300" /> New bill</button>}
          />
        </div>
      ) : (
        <>
          {/* Phones: one card per bill. */}
          {!wide && <ul className={`${cardCls} overflow-hidden divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]`}>
            {rows.map((i) => (
              <li key={i.id} className="flex items-center gap-1 pl-4 pr-1.5 py-1.5">
                <button type="button" onClick={() => ui.openBill(i.id)} className="flex-1 min-w-0 flex items-center gap-3 py-1.5 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{i.customerName}</div>
                    <div className="text-[11px] text-[#6B7280] dark:text-[#8E9299] truncate">{i.invoiceNumber}{i.memoNo ? ` (memo ${i.memoNo})` : ''} • {formatDate(i.issueDate)}{i.delivery?.status === 'pending' ? ' • to deliver' : ''} • {itemsText(i)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`${moneyCls} font-bold text-sm text-[#111827] dark:text-white`}>{rs(billNetTotal(i))}</div>
                    {(i.returnedAmount || 0) > 0 && <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">{rs(i.returnedAmount || 0)} returned</div>}
                    {status(i)}
                  </div>
                </button>
                <RowAction label={`Print ${i.invoiceNumber}`} icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'bill', invoiceId: i.id })} />
              </li>
            ))}
          </ul>}

          {/* Tablet & desktop: a table with a sticky header and a totals row. */}
          {wide && <div className={tableCardCls}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className={`${thCls} text-left w-28`}>Bill</th>
                  <th scope="col" className={`${thCls} text-left w-32`}>Date</th>
                  <th scope="col" className={`${thCls} text-left`}>Customer & items</th>
                  <th scope="col" className={`${thCls} text-right`}>Total</th>
                  <th scope="col" className={`${thCls} text-right`}>Balance</th>
                  <th scope="col" className={`${thCls} w-24`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                    <td className="px-4 py-3 text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">{i.invoiceNumber}{i.memoNo && <div className="text-[10px] font-normal">Memo {i.memoNo}</div>}{i.delivery?.status === 'pending' && <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300">To deliver</div>}</td>
                    <td className="px-4 py-3 text-[#374151] dark:text-[#CBD5E1] whitespace-nowrap">{formatDate(i.issueDate)}</td>
                    <td className="px-4 py-2.5 max-w-0 w-full">
                      <button type="button" onClick={() => ui.openBill(i.id)} className="block w-full text-left group">
                        <span className="block font-semibold text-[#111827] dark:text-white truncate group-hover:underline">{i.customerName}</span>
                        <span className="block text-[11px] text-[#6B7280] dark:text-[#8E9299] truncate">{itemsText(i)}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`${moneyCls} font-bold text-[#111827] dark:text-white`}>{rs(billNetTotal(i))}</div>
                      {(i.returnedAmount || 0) > 0 && <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">{rs(i.returnedAmount || 0)} returned</div>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{status(i)}</td>
                    <td className="px-2 py-2 text-right">
                      <RowAction label={`Print ${i.invoiceNumber}`} text="Print" icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'bill', invoiceId: i.id })} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#0D1520]">
                  <th scope="row" colSpan={3} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Total • {rows.length} bill{rows.length === 1 ? '' : 's'}</th>
                  <td className={`px-4 py-3 text-right font-extrabold text-[#111827] dark:text-white ${moneyCls}`}>{rs(total)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${due > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-[#6B7280] dark:text-[#94A3B8]'} ${moneyCls}`}>{due > 0 ? `${rs(due)} due` : '—'}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>}
        </>
      )}
      </>)}
    </div>
  );
};
