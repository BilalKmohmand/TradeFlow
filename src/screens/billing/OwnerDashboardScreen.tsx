import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, TrendingUp, Banknote, Landmark, HandCoins, AlertTriangle, Boxes, CalendarClock, Wallet, X } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useTrading } from '../../context/TradingContext';
import { useBranchScoped } from '../../hooks/useBranchScoped';
import { Tile, PageHeader, cardCls, inputCls, primaryBtn, secondaryBtn, rs, moneyCls, EmptyState } from '../../components/billing/ui';
import { BranchFilter } from '../../components/control/BranchFilter';
import { ApprovalsTile } from '../../components/control/Approvals';
import { ownerSnapshot, dailyBusinessReport, OwnerSources } from '../../utils/control';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';

const compact = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

/** One screen for the owner: sales, profit, money, who owes what, stock, cheques, best customers & items, 30-day trend. */
export const OwnerDashboardScreen: React.FC = () => {
  const t = useTrading();
  const scoped = useBranchScoped();
  const today = todayISO();
  const [reportDate, setReportDate] = useState<string | null>(null);
  const src: OwnerSources = useMemo(
    () => ({
      invoices: scoped.invoices, ledger: scoped.ledger, expenses: scoped.expenses, cashEntries: scoped.cashEntries, returns: scoped.returns, settings: scoped.settings, customers: t.customers, suppliers: t.suppliers, products: t.products, purchases: t.purchases, cheques: t.cheques,
      // Stock is the whole shop's, valued as the books value it (same figure as Inventory in the balance sheet).
      valuation: { settings: t.settings, ledger: t.ledger, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, purchases: t.purchases, invoices: t.invoices, returns: t.returns, adjustments: t.adjustments, dispatches: t.dispatches },
    }),
    [scoped, t.customers, t.suppliers, t.products, t.purchases, t.cheques, t.settings, t.ledger, t.expenses, t.cashEntries, t.invoices, t.returns, t.adjustments, t.dispatches]
  );
  const snap = useMemo(() => ownerSnapshot(src, today), [src, today]);
  const allowed = t.can('finance:view_pnl') || t.can('view_finance');
  if (!allowed) {
    return <div className={cardCls}><EmptyState icon={<AlertTriangle className="w-5 h-5" />} text="The owner dashboard is for managers and admins." /></div>;
  }
  const trendMax = Math.max(...snap.trend.map((d) => d.sales));
  const trendTotal = snap.trend.reduce((a, d) => a + d.sales, 0);

  return (
    <div className="space-y-5" data-testid="owner-dashboard">
      <PageHeader title="Owner dashboard" subtitle={`${formatDate(today)} • the whole business on one screen`}>
        <BranchFilter />
        <button type="button" onClick={() => setReportDate(today)} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Daily business report</button>
      </PageHeader>

      <ApprovalsTile />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Sales today" value={rs(snap.salesToday)} hint={`${snap.billsToday} bill${snap.billsToday === 1 ? '' : 's'}`} icon={<TrendingUp className="w-4 h-4" />} onClick={() => t.setActiveScreen('bills')} />
        <Tile label="Sales this month" value={rs(snap.salesMonth)} hint={`${snap.billsMonth} bill${snap.billsMonth === 1 ? '' : 's'}`} />
        <Tile label="Gross profit today" value={rs(snap.profitToday)} tone={snap.profitToday < 0 ? 'bad' : 'good'} />
        <Tile label="Gross profit this month" value={rs(snap.profitMonth)} tone={snap.profitMonth < 0 ? 'bad' : 'good'} hint={snap.salesMonth > 0 ? `${Math.round((snap.profitMonth / snap.salesMonth) * 100)}% of sales` : undefined} />
        <Tile label="Cash in hand" value={rs(snap.cash)} icon={<Banknote className="w-4 h-4" />} onClick={() => t.setActiveScreen('money')} />
        <Tile label="In bank" value={rs(snap.bank)} icon={<Landmark className="w-4 h-4" />} onClick={() => t.setActiveScreen('money')} />
        <Tile label="Customers owe you" value={rs(snap.receivables)} tone="good" icon={<HandCoins className="w-4 h-4" />} hint={snap.overdue60 > 0 ? `${rs(snap.overdue60)} over 60 days (${snap.overdueCount})` : 'nothing over 60 days'} onClick={() => t.setActiveScreen('customers')} />
        <Tile label="You owe others" value={rs(snap.payables)} tone={snap.payables > 0 ? 'bad' : 'default'} icon={<Wallet className="w-4 h-4" />} onClick={() => t.setActiveScreen('suppliers')} />
        <Tile label="Stock value (at cost)" value={rs(snap.stockValue)} icon={<Boxes className="w-4 h-4" />} onClick={() => t.setActiveScreen('products')} />
        <Tile label="Cheques due this week" value={`${snap.chequesDue.count} • ${rs(snap.chequesDue.amount)}`} tone={snap.chequesDue.count ? 'warn' : 'default'} icon={<CalendarClock className="w-4 h-4" />} hint={snap.chequesDue.count ? `in ${rs(snap.chequesDue.received)} • out ${rs(snap.chequesDue.issued)}` : 'none in the next 7 days'} />
        <Tile label="Over 60 days" value={rs(snap.overdue60)} tone={snap.overdue60 > 0 ? 'bad' : 'default'} icon={<AlertTriangle className="w-4 h-4" />} hint={`${snap.overdueCount} customer${snap.overdueCount === 1 ? '' : 's'}`} />
      </div>

      <section className={`${cardCls} p-4 sm:p-5`} aria-label="Sales, last 30 days">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h2 className="font-bold text-[#111827] dark:text-white">Sales, last 30 days</h2>
          <span className={`${moneyCls} text-sm text-[#6B7280] dark:text-[#94A3B8]`}>{rs(trendTotal)}</span>
        </div>
        {trendMax <= 0 ? (
          <EmptyState compact text="No bills in the last 30 days." />
        ) : (
          <div className="h-56 text-teal-600 dark:text-teal-400" data-testid="sales-trend">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snap.trend} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="#8E9299" strokeOpacity={0.2} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={6} tick={{ fontSize: 11, fill: '#8E9299' }} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={compact} tick={{ fontSize: 11, fill: '#8E9299' }} />
                <Tooltip cursor={{ fill: '#8E9299', fillOpacity: 0.12 }} formatter={(v: number) => [rs(v), 'Sales']} labelFormatter={(_l, p) => (p?.[0]?.payload?.date ? formatDate(p[0].payload.date) : '')} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="sales" fill="currentColor" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {([['Top 5 customers this month', snap.topCustomers, 'customers'], ['Top 5 items this month', snap.topItems, 'items']] as const).map(([title, rows, key]) => (
          <section key={key} className={`${cardCls} overflow-hidden`} aria-label={title}>
            <h2 className="px-4 sm:px-5 py-3 font-bold text-[#111827] dark:text-white border-b border-[#E5E5E1] dark:border-[#203248]">{title}</h2>
            {rows.length === 0 ? <EmptyState compact text="No sales this month yet." /> : (
              <ol className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {rows.map((r, i) => (
                  <li key={r.key} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 text-sm">
                    <span className="w-5 text-xs font-bold text-[#9CA3AF]">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate font-semibold text-[#111827] dark:text-white">{r.name}{'qty' in r && r.qty != null ? <span className="text-[11px] font-normal text-[#6B7280] dark:text-[#8E9299]"> • {r.qty.toLocaleString()} {r.unit}</span> : null}</span>
                    <span className="text-right shrink-0"><span className={`${moneyCls} block font-bold text-[#111827] dark:text-white`}>{rs(r.sales)}</span><span className={`${moneyCls} block text-[11px] text-teal-700 dark:text-teal-300`}>profit {rs(r.profit)}</span></span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>

      {reportDate && <DailyBusinessReport date={reportDate} src={src} onDate={setReportDate} onClose={() => setReportDate(null)} />}
    </div>
  );
};

/** Printable one-page daily business analysis (AccountsPro style). */
export const DailyBusinessReport: React.FC<{ date: string; src: OwnerSources; onDate: (d: string) => void; onClose: () => void }> = ({ date, src, onDate, onClose }) => {
  const { settings, currentUser, branchesEnabled, branchView, branchName } = useTrading();
  const r = useMemo(() => dailyBusinessReport(src, date), [src, date]);
  const s = r.sheet;
  const Row: React.FC<{ label: string; value: number; strong?: boolean }> = ({ label, value, strong }) => (
    <tr className={strong ? 'font-bold border-t border-gray-300' : ''}><td className="py-0.5 pr-2">{label}</td><td className="py-0.5 text-right tabular-nums">{rs(value)}</td></tr>
  );
  const Box: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="border border-gray-300 rounded-lg p-2.5 break-inside-avoid">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{title}</div>
      <table className="w-full text-[11px]"><tbody>{children}</tbody></table>
    </div>
  );
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 sm:p-6 overflow-y-auto print:static print:p-0 print:block print:overflow-visible" role="dialog" aria-modal="true" aria-label="Daily business report">
      <div onClick={onClose} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs print:hidden" />
      <div className="relative z-10 w-full max-w-3xl my-4 print:my-0 print:max-w-none">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 print:hidden">
          <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && onDate(e.target.value)} className={`${inputCls} !w-auto`} aria-label="Report date" />
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className={`${secondaryBtn} bg-white`}><Printer className="w-4 h-4 text-teal-700" /> Print / Save PDF</button>
            <button type="button" onClick={onClose} aria-label="Close report" className="p-2.5 rounded-2xl bg-white/10 text-white hover:bg-white/20"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div id="print-root" className="bg-white text-gray-900 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-4 sm:p-8 text-xs" data-testid="daily-business-report">
          <div className="flex items-start justify-between border-b-2 border-gray-900 pb-2 mb-3">
            <div>
              <div className="font-bold text-lg leading-tight">{settings.companyName || 'Sarmaya'}</div>
              <div className="text-[10px] text-gray-500">{settings.companyAddress}{settings.companyPhone ? ` • ${settings.companyPhone}` : ''}</div>
            </div>
            <div className="text-right">
              <div className="font-extrabold tracking-widest">DAILY BUSINESS REPORT</div>
              <div className="text-[11px]">{formatDate(date)}{branchesEnabled ? ` • ${branchView === 'all' ? 'All branches' : branchName(branchView)}` : ''}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Box title="Sales">
              <tr><td className="py-0.5">Bills</td><td className="py-0.5 text-right">{s.bills.length}</td></tr>
              <Row label="Cash sales (fully paid)" value={r.cashSales} />
              <Row label="Credit sales" value={r.creditSales} />
              {r.returnsToday.length > 0 && <Row label="Customer returns" value={-r.returnsToday.reduce((a, x) => a + x.amount, 0)} />}
              <Row label="Total sales" value={s.summary.sales} strong />
            </Box>
            <Box title="Profit">
              <Row label="Sales (before tax)" value={r.profit.totals.sales} />
              <Row label="Cost of goods sold" value={-r.profit.totals.cost} />
              <Row label="Gross profit" value={r.profit.totals.profit} strong />
              <Row label="Expenses" value={-s.summary.expenses} />
              <Row label="Profit after expenses" value={r.profit.totals.profit - s.summary.expenses} strong />
            </Box>
            <Box title="Cash in hand">
              <Row label="Opening" value={s.opening.cash} />
              <Row label="Cash in" value={s.cashIn} />
              <Row label="Cash out" value={-s.cashOut} />
              <Row label="Closing" value={s.closing.cash} strong />
            </Box>
            <Box title="Bank">
              <Row label="Opening" value={s.opening.bank} />
              <Row label="Bank in" value={s.bankIn} />
              <Row label="Bank out" value={-s.bankOut} />
              <Row label="Closing" value={s.closing.bank} strong />
            </Box>
            <Box title="Money received & paid">
              <Row label="From customers" value={s.summary.received} />
              <Row label="To suppliers" value={-s.summary.supplierPayments} />
              {s.expenses.map((g) => <Row key={g.category} label={`Expense: ${g.label}`} value={-g.total} />)}
            </Box>
            <Box title="Position at close">
              <Row label="Customers owe you" value={r.snap.receivables} />
              <Row label="…of which over 60 days" value={r.snap.overdue60} />
              <Row label="You owe others" value={r.snap.payables} />
              <Row label="Stock value (at cost)" value={r.snap.stockValue} />
              <Row label={`Cheques due in 7 days (${r.snap.chequesDue.count})`} value={r.snap.chequesDue.amount} />
            </Box>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mt-2.5">
            <Box title="Items sold">
              {r.profit.byItem.length === 0 ? <tr><td className="text-gray-500">No sales</td></tr> : [...r.profit.byItem].sort((a, b) => b.sales - a.sales).slice(0, 8).map((it) => (
                <tr key={it.key}><td className="py-0.5 pr-2 truncate">{it.name} × {it.qty?.toLocaleString()} {it.unit}</td><td className="py-0.5 text-right tabular-nums">{rs(it.sales)}</td></tr>
              ))}
            </Box>
            <Box title="Bills">
              {s.bills.length === 0 ? <tr><td className="text-gray-500">No bills</td></tr> : s.bills.slice(0, 10).map((b) => (
                <tr key={b.id}><td className="py-0.5 pr-2 truncate">{b.invoiceNumber} {b.customerName}</td><td className="py-0.5 text-right tabular-nums">{rs(b.totalAmount)}{b.balanceDue > 0 ? '*' : ''}</td></tr>
              ))}
              {s.bills.length > 10 && <tr><td className="text-gray-500" colSpan={2}>…and {s.bills.length - 10} more</td></tr>}
            </Box>
          </div>
          <div className="mt-4 pt-2 border-t border-gray-200 flex justify-between text-[9px] text-gray-500">
            <span>* on credit. Printed {formatDate(todayISO())}{currentUser ? ` by ${currentUser.name}` : ''}.</span>
            <span>All amounts in PKR (Rs.)</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
