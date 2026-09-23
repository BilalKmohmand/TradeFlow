import React, { useMemo, useState } from 'react';
import { PackagePlus, Search, PackageOpen } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { PageHeader, EmptyState, inputCls, primaryBtn, pillCls, rs, moneyCls, tableCardCls, thCls } from '../../components/billing/ui';
import { CsvButton } from '../../components/billing/CsvButton';
import { matchesPurchaseInvoice } from '../../utils/purchaseInvoices';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';

type Period = 'month' | 'all';

/** Every purchase invoice, newest first; search by our number (P-…), the supplier's bill no., supplier or item. */
export const PurchasesScreen: React.FC = () => {
  const { purchaseInvoices, suppliers, can } = useTrading();
  const ui = useBillingUI();
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const today = todayISO();
  const rows = useMemo(
    () =>
      purchaseInvoices
        .filter((p) => period === 'all' || p.date >= `${today.slice(0, 7)}-01`)
        .filter((p) => matchesPurchaseInvoice(p, q, suppliers.find((s) => s.id === p.supplierId)))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt))),
    [purchaseInvoices, suppliers, q, period, today]
  );
  const total = rows.reduce((a, p) => a + p.totalAmount, 0);
  const canEnter = can('products:create') || can('stock:adjust');

  return (
    <div className="space-y-5">
      <PageHeader title="Purchase invoices" subtitle={<>{rows.length} invoice{rows.length === 1 ? '' : 's'} • <span className={moneyCls}>{rs(total)}</span></>}>
        <CsvButton fileName={`purchase-invoices-${today}.csv`} table={() => ({ headers: ['Invoice', 'Date', 'Memo No', 'Supplier', 'Items', 'Amount', 'Discount', 'Other charges', 'Total', 'Paid'], rows: rows.map((p) => [p.invoiceNumber, p.date, p.memoNo || '', p.supplierName, p.lines.map((l) => `${l.qty} ${l.unit} ${l.productName}`).join('; '), p.grossAmount, p.discountAmount, p.otherCharges, p.totalAmount, p.paidAmount]) })} />
        {canEnter && <button type="button" onClick={() => ui.newPurchaseInvoice()} className={`${primaryBtn} max-sm:flex-1`}><PackagePlus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Purchase Invoice</button>}
      </PageHeader>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input aria-label="Search purchase invoices" value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} pl-9`} placeholder="P-12, bill no., supplier name, code or city, or item" />
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setPeriod('month')} className={pillCls(period === 'month')}>This month</button>
          <button type="button" onClick={() => setPeriod('all')} className={pillCls(period === 'all')}>All</button>
        </div>
      </div>
      <div className={tableCardCls}>
        {rows.length === 0 ? (
          <EmptyState icon={<PackageOpen className="w-5 h-5" />} text={q ? 'No purchase invoice matches.' : 'No purchase invoices yet. Enter a supplier’s bill with “Purchase Invoice”.'} />
        ) : (
          // No overflow box around the table: it would become the sticky header's scroll box and the
          // header (offset by the page header's height) would sit on top of the first rows.
          // On a phone the memo no. goes under the invoice number and the date is short, so it fits 390px.
          <table className="w-full text-sm" data-testid="purchase-invoice-list">
            <thead>
              <tr>
                <th className={`${thCls} text-left !px-3 sm:!px-4`}>Invoice</th>
                <th className={`${thCls} text-left !px-3 sm:!px-4`}>Date</th>
                <th className={`${thCls} text-left hidden sm:table-cell`}>Memo No</th>
                <th className={`${thCls} text-left !px-3 sm:!px-4`}>Supplier</th>
                <th className={`${thCls} text-left hidden md:table-cell`}>Items</th>
                <th className={`${thCls} text-right !px-3 sm:!px-4`}>Total</th>
                <th className={`${thCls} text-right hidden sm:table-cell`}>Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {rows.map((p) => (
                <tr key={p.id} onClick={() => ui.openPurchaseInvoice(p.id)} className="cursor-pointer hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                  <td className="px-3 sm:px-4 py-2.5 font-bold text-[#111827] dark:text-white whitespace-nowrap">
                    <button type="button" className="hover:underline" onClick={(e) => { e.stopPropagation(); ui.openPurchaseInvoice(p.id); }}>{p.invoiceNumber}</button>
                    {p.memoNo && <div className="sm:hidden font-mono text-[11px] font-normal text-[#6B7280] dark:text-[#94A3B8]">{p.memoNo}</div>}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap">{formatDate(p.date)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs hidden sm:table-cell">{p.memoNo || '—'}</td>
                  <td className="px-3 sm:px-4 py-2.5 break-words">{p.supplierName}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-xs text-[#6B7280] dark:text-[#94A3B8] max-w-xs truncate">{p.lines.map((l) => `${l.productName} × ${l.qty}`).join(', ')}</td>
                  <td className={`px-3 sm:px-4 py-2.5 text-right font-bold whitespace-nowrap ${moneyCls}`}>{rs(p.totalAmount)}</td>
                  <td className={`px-4 py-2.5 text-right hidden sm:table-cell whitespace-nowrap ${moneyCls}`}>{p.paidAmount > 0 ? rs(p.paidAmount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
