import React, { useMemo, useState } from 'react';
import { FilePlus2, Search, Printer, Download } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { cardCls, inputCls, primaryBtn, secondaryBtn, rs } from '../../components/billing/ui';
import { filterBills } from '../../utils/billing';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { downloadCsvFile } from '../../utils/listTools';

type Period = 'today' | 'week' | 'month' | 'all';

/** Every bill, newest first, with search and quick period filters. Tap a row to open it. */
export const BillsScreen: React.FC = () => {
  const { invoices, setPrintRequest } = useTrading();
  const ui = useBillingUI();
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('today');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const today = todayISO();
  const rows = useMemo(() => filterBills(invoices.filter((i) => i.status !== 'cancelled'), query, period, today, unpaidOnly), [invoices, query, period, today, unpaidOnly]);
  const total = rows.reduce((a, i) => a + i.totalAmount, 0);
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-white">Bills</h1>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{rows.length} bill{rows.length === 1 ? '' : 's'} • {rs(total)}{due > 0 ? ` • ${rs(due)} still due` : ''}</p>
        </div>
        <button type="button" onClick={() => ui.newBill()} className={primaryBtn}><FilePlus2 className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New Bill</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bill no., customer, phone or item" className={`${inputCls} pl-10`} aria-label="Search bills" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {periods.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)} className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap border ${period === p.id ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent' : 'bg-white dark:bg-[#101A26] border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]'}`}>{p.label}</button>
          ))}
          <button type="button" onClick={() => setUnpaidOnly((v) => !v)} className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap border ${unpaidOnly ? 'bg-amber-600 text-white border-transparent' : 'bg-white dark:bg-[#101A26] border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]'}`}>Unpaid</button>
          <button type="button" onClick={exportCsv} className={`${secondaryBtn} px-3`} title="Download as CSV"><Download className="w-4 h-4" /></button>
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280] dark:text-[#94A3B8]">No bills here.</div>
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {rows.map((i) => (
              <li key={i.id} className="flex items-center gap-2 px-3 sm:px-5 py-3 hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                <button type="button" onClick={() => ui.openBill(i.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                  <div className="hidden sm:block w-20 font-mono text-xs text-[#6B7280] dark:text-[#94A3B8]">{i.invoiceNumber}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{i.customerName}</div>
                    <div className="text-[11px] text-[#8E9299] truncate"><span className="sm:hidden">{i.invoiceNumber} • </span>{formatDate(i.issueDate)} • {i.items.map((it) => `${it.productName} × ${it.qty ?? it.kg}`).join(', ')}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-sm text-[#111827] dark:text-white">{rs(i.totalAmount)}</div>
                    <div className={`text-[11px] font-bold ${i.balanceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{i.balanceDue > 0 ? `${rs(i.balanceDue)} due` : 'Paid'}</div>
                  </div>
                </button>
                <button type="button" onClick={() => setPrintRequest({ type: 'bill', invoiceId: i.id })} aria-label={`Print ${i.invoiceNumber}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#111827] dark:hover:text-white hover:bg-white dark:hover:bg-[#1E2E40]"><Printer className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
