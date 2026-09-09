import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Download, Receipt, Scale, Landmark, Wallet, ChevronDown, ChevronRight, Plus, Trash2, ArrowDownLeft, ArrowUpRight, Settings2, Printer } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { useTrading } from '../context/TradingContext';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency, formatKg, formatDate, formatNumber } from '../utils/formatters';
import { computeMonthlyPnL, pnlTrend, currentMonthKey, monthLabel, shiftMonth, receivablesAging, payablesAging, sumAging, AgingRow, computeBalanceSheet, collectCashMovements, buildCashBook, CashMovement } from '../utils/finance';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { ConfirmDialog } from './ConfirmDialog';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../types';

const card = 'bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs';

const downloadCsv = (name: string, csv: string, onDone?: (f: string) => void) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  onDone?.(name);
};

// ===========================================================================
// Profit & Loss
// ===========================================================================
export const PnLPanel: React.FC<{ onDownload?: (f: string) => void; onOpenExpenses: () => void }> = ({ onDownload, onOpenExpenses }) => {
  const { dispatches, purchases, expenses, products, bookings, setSelectedProductId, isFieldVisible } = useTrading();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [month, setMonth] = useState(currentMonthKey());

  const showMargins = isFieldVisible('profit_margins');
  const showCosts = isFieldVisible('purchase_costs');

  const pnl = useMemo(() => computeMonthlyPnL(month, dispatches, purchases, expenses, products, bookings), [month, dispatches, purchases, expenses, products, bookings]);
  const trend = useMemo(() => pnlTrend(month, 6, dispatches, purchases, expenses, products, bookings), [month, dispatches, purchases, expenses, products, bookings]);
  const prev = trend[trend.length - 2];
  const delta = prev && prev.netProfit !== 0 ? ((pnl.netProfit - prev.netProfit) / Math.abs(prev.netProfit)) * 100 : null;

  const exportCsv = () => {
    let csv = `Profit & Loss,${pnl.label}\n\nRevenue (dispatches),${pnl.revenue}\nCost of goods sold,${pnl.cogs}\nGross profit,${pnl.grossProfit}\nGross margin %,${pnl.grossMarginPct ?? ''}\nOperating expenses,${pnl.expenses}\nNet profit,${pnl.netProfit}\nNet margin %,${pnl.netMarginPct ?? ''}\n\n`;
    csv += `Expenses by category\n`;
    (Object.keys(pnl.expensesByCategory) as ExpenseCategory[]).forEach((k) => (csv += `${EXPENSE_CATEGORIES.find((c) => c.id === k)?.label || k},${pnl.expensesByCategory[k]}\n`));
    csv += `\nProduct,Sold (kg),Revenue,Avg sell Rs./kg,Avg cost Rs./kg,COGS,Gross profit,Margin %\n`;
    pnl.products.forEach((p) => (csv += `"${p.productName}",${p.soldKg},${p.revenue},${p.avgSellPerKg},${p.avgCostPerKg ?? ''},${p.cogs},${p.grossProfit},${p.marginPct ?? ''}\n`));
    downloadCsv(`sarmaya-pnl-${month}.csv`, csv, onDownload);
  };

  const stat = (label: string, value: string, sub?: string, tone: 'default' | 'good' | 'bad' = 'default') => (
    <div className={`${card} p-5 min-w-0`}>
      <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">{label}</div>
      <div className={`text-base sm:text-2xl font-bold font-mono mt-1.5 break-words ${tone === 'good' ? 'text-teal-800 dark:text-teal-400' : tone === 'bad' ? 'text-rose-700 dark:text-rose-400' : 'text-[#111827] dark:text-white'}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] mt-1 font-mono truncate">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-3 py-1.5 rounded-xl border border-[#E5E5E1] dark:border-[#203248] text-xs bg-white dark:bg-[#162436] text-[#111827] dark:text-white">‹</button>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-white dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-xl px-3 py-1.5 text-xs font-mono text-[#111827] dark:text-white" />
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="px-3 py-1.5 rounded-xl border border-[#E5E5E1] dark:border-[#203248] text-xs bg-white dark:bg-[#162436] text-[#111827] dark:text-white">›</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenExpenses} className="px-4 py-2 bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold rounded-2xl flex items-center gap-1.5 text-[#111827] dark:text-white"><Receipt className="w-3.5 h-3.5" /> Manage expenses</button>
          <button onClick={exportCsv} className="px-4 py-2 bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5"><Download className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Export P&L</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stat('Revenue', formatCurrency(pnl.revenue), `${pnl.dispatchCount} dispatch(es) • ${formatKg(pnl.soldKg)}`)}
        {stat('Cost of goods', showCosts ? formatCurrency(pnl.cogs) : '••••••', pnl.uncostedKg > 0 ? `${formatKg(pnl.uncostedKg)} without cost data` : 'weighted avg purchase cost')}
        {stat('Gross profit', showMargins ? formatCurrency(pnl.grossProfit) : '••••••', showMargins && pnl.grossMarginPct != null ? `${pnl.grossMarginPct}% margin` : (showMargins ? undefined : 'Restricted'), pnl.grossProfit >= 0 ? 'good' : 'bad')}
        {stat('Expenses', formatCurrency(pnl.expenses), `${Object.keys(pnl.expensesByCategory).length} categor(ies)`)}
        {stat(
          'Net profit',
          showMargins ? formatCurrency(pnl.netProfit) : '••••••',
          showMargins
            ? (delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs ${prev.label}` : pnl.netMarginPct != null ? `${pnl.netMarginPct}% net margin` : undefined)
            : 'Restricted',
          pnl.netProfit >= 0 ? 'good' : 'bad'
        )}
      </div>

      {pnl.uncostedKg > 0 && (
        <div className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-2xl p-3.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{formatKg(pnl.uncostedKg)} dispatched this month has no purchase record, so its cost is counted as zero and gross profit is overstated. Use "Receive Stock" to log purchases with their cost.</span>
        </div>
      )}

      <div className={`${card} p-5 sm:p-6`}>
        <h3 className="text-sm font-bold text-[#111827] dark:text-white">Six-month trend</h3>
        <p className="text-[11px] text-[#8E9299] mb-3">Revenue and expenses as bars, net profit as a line</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend.map((t) => ({ label: t.label, Revenue: t.revenue, Expenses: t.expenses + t.cogs, Net: t.netProfit }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E2E40' : '#eee'} vertical={false} />
              <XAxis dataKey="label" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => `${formatNumber(v / 1000)}k`} />
              <Tooltip cursor={{ fill: isDark ? '#162436' : '#FAF9F6' }} formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 16, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Revenue" fill="#0d9488" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Expenses" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="Net" stroke="#111827" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${card} overflow-hidden lg:col-span-2`}>
          <div className="p-5 border-b border-[#E5E5E1] dark:border-[#203248]"><h3 className="text-sm font-bold text-[#111827] dark:text-white">Margin by product</h3><p className="text-[11px] text-[#8E9299]">Average sell price vs weighted average purchase cost</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                <tr><th className="py-3 px-4">Product</th><th className="py-3 px-4 text-right">Sold</th><th className="py-3 px-4 text-right">Sell /kg</th><th className="py-3 px-4 text-right">Cost /kg</th><th className="py-3 px-4 text-right">Revenue</th><th className="py-3 px-4 text-right">Gross</th><th className="py-3 px-4 text-right">Margin</th></tr>
              </thead>
              <tbody className="divide-y divide-[#FAF9F6] dark:divide-[#1E2E40] font-mono">
                {pnl.products.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-[#8E9299] font-sans">No dispatches in {pnl.label}.</td></tr>
                ) : (
                  pnl.products.map((p) => (
                    <tr key={p.productId} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                      <td className="py-2.5 px-4 font-sans"><button onClick={() => setSelectedProductId(p.productId)} className="font-bold text-[#111827] dark:text-white hover:text-teal-800 hover:underline">{p.productName}</button></td>
                      <td className="py-2.5 px-4 text-right text-[#374151] dark:text-[#CBD5E1]">{formatKg(p.soldKg)}</td>
                      <td className="py-2.5 px-4 text-right text-[#111827] dark:text-white">Rs. {p.avgSellPerKg}</td>
                      <td className="py-2.5 px-4 text-right text-[#6B7280]">{p.avgCostPerKg != null ? `Rs. ${p.avgCostPerKg}` : <span className="text-amber-600">n/a</span>}</td>
                      <td className="py-2.5 px-4 text-right text-[#111827] dark:text-white">{formatCurrency(p.revenue)}</td>
                      <td className={`py-2.5 px-4 text-right font-bold ${p.grossProfit >= 0 ? 'text-teal-800 dark:text-teal-400' : 'text-rose-700'}`}>{formatCurrency(p.grossProfit)}</td>
                      <td className="py-2.5 px-4 text-right">{p.marginPct != null ? <span className={`inline-flex items-center gap-1 font-bold ${p.marginPct >= 0 ? 'text-teal-800 dark:text-teal-400' : 'text-rose-700'}`}>{p.marginPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{p.marginPct}%</span> : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <h3 className="text-sm font-bold text-[#111827] dark:text-white">Expenses by category</h3>
          <p className="text-[11px] text-[#8E9299] mb-3">{pnl.label}</p>
          {Object.keys(pnl.expensesByCategory).length === 0 ? (
            <div className="text-xs text-[#8E9299] py-6 text-center">No expenses recorded.</div>
          ) : (
            <div className="space-y-2.5">
              {(Object.entries(pnl.expensesByCategory) as [ExpenseCategory, number][]).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between text-xs"><span className="text-[#374151] dark:text-[#CBD5E1]">{EXPENSE_CATEGORIES.find((c) => c.id === k)?.label}</span><span className="font-mono font-bold text-[#111827] dark:text-white">{formatCurrency(v)}</span></div>
                  <div className="w-full h-1.5 bg-[#E5E5E1] dark:bg-[#203248] rounded-full mt-1 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${pnl.expenses > 0 ? (v / pnl.expenses) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-[#E5E5E1] dark:border-[#203248] text-xs text-[#6B7280] dark:text-[#94A3B8] font-mono flex items-center justify-between"><span>Purchases this month</span><span>{formatCurrency(pnl.purchasedAmount)} • {formatKg(pnl.purchasedKg)}</span></div>
        </div>
      </div>
    </div>
  );
};

// ===========================================================================
// Aging
// ===========================================================================
export const AgingPanel: React.FC<{ onDownload?: (f: string) => void }> = ({ onDownload }) => {
  const { customers, suppliers, ledger, setSelectedCustomerId, setSelectedSupplierId, sendWhatsAppReminder } = useTrading();
  const [side, setSide] = useState<'receivables' | 'payables'>('receivables');
  const asOf = todayISO();
  const rows = useMemo(() => (side === 'receivables' ? receivablesAging(customers, ledger, asOf) : payablesAging(suppliers, ledger, asOf)), [side, customers, suppliers, ledger, asOf]);
  const totals = useMemo(() => sumAging(rows), [rows]);

  const exportCsv = () => {
    let csv = `${side === 'receivables' ? 'Receivables' : 'Payables'} aging as of ${asOf}\nName,Company,Phone,Current (0-30),31-60,61-90,90+,Total open,Recorded balance,Oldest open date,Oldest days\n`;
    rows.forEach((r) => (csv += `"${r.name}","${r.company}","${r.phone}",${r.current},${r.d31_60},${r.d61_90},${r.d90plus},${r.total},${r.recordedBalance},"${r.oldestOpenDate || ''}",${r.oldestDays}\n`));
    csv += `Totals,,,${totals.current},${totals.d31_60},${totals.d61_90},${totals.d90plus},${totals.total}\n`;
    downloadCsv(`sarmaya-${side}-aging-${asOf}.csv`, csv, onDownload);
  };

  const bucket = (label: string, value: number, tone: string) => (
    <div className={`${card} p-4 min-w-0`}>
      <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">{label}</div>
      <div className={`text-sm sm:text-lg font-bold font-mono mt-1 break-words ${tone}`}>{formatCurrency(value)}</div>
      <div className="text-[10px] text-[#8E9299] font-mono">{totals.total > 0 ? `${((value / totals.total) * 100).toFixed(0)}%` : '0%'}</div>
    </div>
  );

  const open = (r: AgingRow) => (side === 'receivables' ? setSelectedCustomerId(r.entityId) : setSelectedSupplierId(r.entityId));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="bg-[#FAF9F6] dark:bg-[#162436] p-1 rounded-full border border-[#E5E5E1] dark:border-[#203248] flex items-center gap-0.5 text-xs font-bold w-fit">
          {(['receivables', 'payables'] as const).map((s) => (
            <button key={s} onClick={() => setSide(s)} className={`px-4 py-1.5 rounded-full capitalize ${side === s ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs' : 'text-[#6B7280] dark:text-[#94A3B8]'}`}>{s}</button>
          ))}
        </div>
        <button onClick={exportCsv} className="px-4 py-2 bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5 w-fit"><Download className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Export aging</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {bucket('Current (0-30)', totals.current, 'text-[#111827] dark:text-white')}
        {bucket('31-60 days', totals.d31_60, 'text-amber-700')}
        {bucket('61-90 days', totals.d61_90, 'text-orange-700')}
        {bucket('Over 90 days', totals.d90plus, 'text-rose-700')}
        <div className={`${card} p-4 bg-[#111827] dark:bg-white text-white dark:text-[#111827] min-w-0`}>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 flex items-center gap-1"><Scale className="w-3 h-3" /> Total open</div>
          <div className="text-sm sm:text-lg font-bold font-mono mt-1 break-words">{formatCurrency(totals.total)}</div>
          <div className="text-[10px] opacity-70 font-mono">{rows.length} account(s)</div>
        </div>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
              <tr><th className="py-3 px-4">{side === 'receivables' ? 'Customer' : 'Supplier'}</th><th className="py-3 px-4 text-right">Current</th><th className="py-3 px-4 text-right">31-60</th><th className="py-3 px-4 text-right">61-90</th><th className="py-3 px-4 text-right">90+</th><th className="py-3 px-4 text-right">Total</th><th className="py-3 px-4">Oldest</th><th className="py-3 px-4" /></tr>
            </thead>
            <tbody className="divide-y divide-[#FAF9F6] dark:divide-[#1E2E40] font-mono">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-[#8E9299] font-sans">Nothing outstanding. 🎉</td></tr>
              ) : (
                rows.map((r) => {
                  const mismatch = Math.abs(r.total - r.recordedBalance) > 1;
                  return (
                    <tr key={r.entityId} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                      <td className="py-3 px-4 font-sans">
                        <button onClick={() => open(r)} className="font-bold text-[#111827] dark:text-white hover:text-teal-800 hover:underline text-left">{r.name}</button>
                        <span className="block text-[10px] text-[#8E9299]">{r.company}</span>
                        {mismatch && <span className="block text-[10px] text-amber-700 mt-0.5" title="Ledger-derived total differs from the recorded balance (manual adjustment or deleted rows).">Recorded balance {formatCurrency(r.recordedBalance)}</span>}
                      </td>
                      <td className="py-3 px-4 text-right text-[#374151] dark:text-[#CBD5E1]">{r.current > 0 ? formatCurrency(r.current) : '—'}</td>
                      <td className="py-3 px-4 text-right text-amber-700">{r.d31_60 > 0 ? formatCurrency(r.d31_60) : '—'}</td>
                      <td className="py-3 px-4 text-right text-orange-700">{r.d61_90 > 0 ? formatCurrency(r.d61_90) : '—'}</td>
                      <td className="py-3 px-4 text-right text-rose-700 font-bold">{r.d90plus > 0 ? formatCurrency(r.d90plus) : '—'}</td>
                      <td className="py-3 px-4 text-right font-bold text-[#111827] dark:text-white">{formatCurrency(r.total)}</td>
                      <td className="py-3 px-4 text-[#6B7280] whitespace-nowrap">{r.oldestOpenDate ? `${formatDate(r.oldestOpenDate)} (${r.oldestDays}d)` : '—'}</td>
                      <td className="py-3 px-4 text-right font-sans">
                        {side === 'receivables' && r.total > 0 && (
                          <button onClick={() => sendWhatsAppReminder(r.entityId)} className="text-[11px] font-bold text-teal-700 hover:underline whitespace-nowrap">Send reminder</button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-[#8E9299]">Open amounts are computed from the ledger by applying payments to the oldest invoices first. Manual balance adjustments and deleted ledger rows are flagged where the recorded balance differs.</p>
    </div>
  );
};

// ===========================================================================
// Balance sheet
// ===========================================================================
export const BalanceSheetPanel: React.FC<{ onDownload?: (f: string) => void }> = ({ onDownload }) => {
  const { products, purchases, customers, suppliers, ledger, expenses, cashEntries, settings, setSelectedProductId } = useTrading();
  const [asOf, setAsOf] = useState(todayISO());
  const bs = useMemo(() => computeBalanceSheet({ products, purchases, customers, suppliers, ledger, expenses, cashEntries, settings }, asOf), [products, purchases, customers, suppliers, ledger, expenses, cashEntries, settings, asOf]);

  const exportCsv = () => {
    let csv = `Balance sheet as at ${bs.asOf}\n\nASSETS\nInventory at cost,${bs.inventory.atCost}\nReceivables,${bs.receivables}\nCash & bank (net movements),${bs.cashNet.net}\nTotal assets,${bs.totalAssets}\n\nLIABILITIES\nPayables,${bs.payables}\nAccrued expenses,${bs.accruedExpenses}\nTotal liabilities,${bs.totalLiabilities}\n\nEQUITY,${bs.equity}\n\nInventory detail\nProduct,kg,Cost Rs./kg,Value\n`;
    bs.inventory.lines.forEach((l) => (csv += `"${l.name}",${l.kg},${l.costPerKg ?? ''},${l.value}\n`));
    downloadCsv(`sarmaya-balance-sheet-${asOf}.csv`, csv, onDownload);
  };

  const row = (label: string, value: number, opts: { bold?: boolean; sub?: string; tone?: string } = {}) => (
    <div className={`flex items-start justify-between gap-3 py-2.5 ${opts.bold ? 'border-t-2 border-[#111827] dark:border-white mt-1 pt-3' : 'border-b border-[#F0F0EE] dark:border-[#1E2E40]'}`}>
      <span className="min-w-0">
        <span className={`text-xs ${opts.bold ? 'font-extrabold uppercase tracking-widest text-[#111827] dark:text-white' : 'font-semibold text-[#374151] dark:text-[#CBD5E1]'}`}>{label}</span>
        {opts.sub && <span className="block text-[10px] text-[#8E9299] mt-0.5">{opts.sub}</span>}
      </span>
      <span className={`font-mono text-right shrink-0 ${opts.bold ? 'text-sm sm:text-base font-extrabold' : 'text-xs sm:text-sm font-bold'} ${opts.tone || 'text-[#111827] dark:text-white'}`}>{formatCurrency(value)}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-[#111827] dark:text-white">As at</span>
          <input type="date" value={asOf} max={todayISO()} onChange={(e) => setAsOf(e.target.value)} className="bg-white dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-xl px-3 py-1.5 font-mono text-[#111827] dark:text-white" />
        </div>
        <button onClick={exportCsv} className="px-4 py-2 bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5 w-fit"><Download className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Export balance sheet</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={`${card} p-4 min-w-0`}><div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Total assets</div><div className="text-base sm:text-xl font-bold font-mono text-[#111827] dark:text-white mt-1 break-words">{formatCurrency(bs.totalAssets)}</div></div>
        <div className={`${card} p-4 min-w-0`}><div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Total liabilities</div><div className="text-base sm:text-xl font-bold font-mono text-rose-700 mt-1 break-words">{formatCurrency(bs.totalLiabilities)}</div></div>
        <div className="rounded-[28px] border border-[#111827] dark:border-white shadow-xs p-4 min-w-0 bg-[#111827] dark:bg-white text-white dark:text-[#111827]"><div className="text-[10px] font-bold uppercase tracking-widest opacity-70 flex items-center gap-1"><Landmark className="w-3 h-3" /> Owner's equity</div><div className={`text-base sm:text-xl font-bold font-mono mt-1 break-words ${bs.equity >= 0 ? 'text-teal-300 dark:text-teal-700' : 'text-rose-400'}`}>{formatCurrency(bs.equity)}</div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`${card} p-5 sm:p-6`}>
          <h3 className="text-sm font-bold text-[#111827] dark:text-white mb-2">Assets</h3>
          {row('Inventory at cost', bs.inventory.atCost, { sub: `${formatKg(bs.inventory.kg)} on hand • ${formatCurrency(bs.inventory.atSellingPrice)} at selling price${bs.inventory.uncostedKg > 0 ? ` • ${formatKg(bs.inventory.uncostedKg)} without purchase cost` : ''}` })}
          {row('Receivables from customers', bs.receivables, { sub: `${customers.filter((c) => c.totalDue > 0).length} customer(s) owing` })}
          {row('Cash & bank (per cash book)', bs.cashNet.net, { sub: `Opening ${formatCurrency(settings.cashOpeningBalance)} + received ${formatCurrency(bs.cashNet.received)} − paid suppliers ${formatCurrency(bs.cashNet.paidToSuppliers)} − expenses ${formatCurrency(bs.cashNet.expensesPaid)} ± manual entries`, tone: bs.cashNet.net >= 0 ? 'text-[#111827] dark:text-white' : 'text-rose-700' })}
          {row('Total assets', bs.totalAssets, { bold: true })}
        </div>
        <div className="space-y-6">
          <div className={`${card} p-5 sm:p-6`}>
            <h3 className="text-sm font-bold text-[#111827] dark:text-white mb-2">Liabilities</h3>
            {row('Payables to suppliers', bs.payables, { sub: `${suppliers.filter((s) => s.totalOwed > 0).length} supplier(s) owed` })}
            {row('Accrued expenses (unpaid)', bs.accruedExpenses, { sub: 'Expenses recorded as "Credit (unpaid)"' })}
            {row('Total liabilities', bs.totalLiabilities, { bold: true })}
          </div>
          <div className={`${card} p-5 sm:p-6`}>
            <h3 className="text-sm font-bold text-[#111827] dark:text-white mb-2">Equity</h3>
            {row("Owner's equity (assets − liabilities)", bs.equity, { bold: true, tone: bs.equity >= 0 ? 'text-teal-800 dark:text-teal-400' : 'text-rose-700' })}
          </div>
        </div>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="p-5 border-b border-[#E5E5E1] dark:border-[#203248]"><h3 className="text-sm font-bold text-[#111827] dark:text-white">Inventory valuation</h3><p className="text-[11px] text-[#8E9299]">Stock on hand at weighted-average purchase cost</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]"><tr><th className="py-3 px-4">Product</th><th className="py-3 px-4 text-right">On hand</th><th className="py-3 px-4 text-right">Cost /kg</th><th className="py-3 px-4 text-right">Value</th></tr></thead>
            <tbody className="divide-y divide-[#FAF9F6] dark:divide-[#1E2E40] font-mono">
              {bs.inventory.lines.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-[#8E9299] font-sans">No products.</td></tr>
              ) : (
                bs.inventory.lines.map((l) => (
                  <tr key={l.productId} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                    <td className="py-2.5 px-4 font-sans"><button onClick={() => setSelectedProductId(l.productId)} className="font-bold text-[#111827] dark:text-white hover:text-teal-800 hover:underline">{l.name}</button></td>
                    <td className="py-2.5 px-4 text-right text-[#374151] dark:text-[#CBD5E1]">{formatKg(l.kg)}</td>
                    <td className="py-2.5 px-4 text-right text-[#6B7280]">{l.costPerKg != null ? `Rs. ${l.costPerKg}` : <span className="text-amber-600">n/a</span>}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-[#111827] dark:text-white">{formatCurrency(l.value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-[#8E9299]">Simplified management balance sheet built from the app's records. Cash has no opening balance and reflects only payments and expenses recorded here; fixed assets, loans and tax are not tracked.</p>
    </div>
  );
};

// ===========================================================================
// Daily cash book
// ===========================================================================
const SOURCE_LABEL: Record<CashMovement['source'], string> = {
  customer_payment: 'Customer payment',
  supplier_payment: 'Supplier payment',
  expense: 'Expense',
  manual: 'Manual entry',
};

export const CashBookPanel: React.FC<{ onDownload?: (f: string) => void }> = ({ onDownload }) => {
  const { ledger, expenses, cashEntries, customers, suppliers, settings, updateSettings, addCashEntry, deleteCashEntry, deleteExpense, deleteLedgerEntry, setSelectedCustomerId, setSelectedSupplierId, setPrintRequest, can } = useTrading();
  const [range, setRange] = useState<'7' | '30' | 'month' | 'custom'>('7');
  const [customFrom, setCustomFrom] = useState(shiftDate(todayISO(), -6));
  const [customTo, setCustomTo] = useState(todayISO());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([todayISO()]));
  const [showSettings, setShowSettings] = useState(false);
  const [openingInput, setOpeningInput] = useState(String(settings.cashOpeningBalance));
  const [openingDate, setOpeningDate] = useState(settings.cashOpeningDate);
  const [entry, setEntry] = useState<{ direction: 'in' | 'out'; date: string; amount: string; description: string; method: string }>({ direction: 'in', date: todayISO(), amount: '', description: '', method: 'Cash' });
  const [pending, setPending] = useState<CashMovement | null>(null);

  const to = range === 'custom' ? customTo : todayISO();
  const from = range === 'custom' ? customFrom : range === 'month' ? `${currentMonthKey()}-01` : shiftDate(todayISO(), -(Number(range) - 1));
  const movements = useMemo(() => collectCashMovements(ledger, expenses, cashEntries, customers, suppliers), [ledger, expenses, cashEntries, customers, suppliers]);
  const book = useMemo(() => buildCashBook(movements, settings, from, to), [movements, settings, from, to]);
  const byMethod = useMemo(() => {
    const m = new Map<string, number>();
    book.days.forEach((d) => d.movements.forEach((mv) => m.set(mv.method || 'Unspecified', (m.get(mv.method || 'Unspecified') || 0) + (mv.direction === 'in' ? mv.amount : -mv.amount))));
    return Array.from(m.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }, [book]);

  const toggle = (d: string) => setExpanded((p) => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n; });

  const submitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(entry.amount);
    if (!amount || amount <= 0 || !entry.description.trim()) return;
    addCashEntry({ direction: entry.direction, date: entry.date, amount, description: entry.description.trim(), method: entry.method });
    setEntry((f) => ({ ...f, amount: '', description: '' }));
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({ cashOpeningBalance: parseFloat(openingInput) || 0, cashOpeningDate: openingDate });
    setShowSettings(false);
  };

  const exportCsv = () => {
    let csv = `Cash book ${book.from} to ${book.to}\nOpening balance,${book.openingBalance}\n\nDate,Type,Counterparty,Description,Reference,Method,Receipt,Payment,Balance\n`;
    [...book.days].reverse().forEach((d) => {
      let run = d.opening;
      d.movements.forEach((m) => {
        run = m.direction === 'in' ? run + m.amount : run - m.amount;
        csv += `"${m.date}","${SOURCE_LABEL[m.source]}","${m.counterparty || ''}","${m.description.replace(/"/g, '""')}","${m.reference || ''}","${m.method || ''}",${m.direction === 'in' ? m.amount : ''},${m.direction === 'out' ? m.amount : ''},${run.toFixed(2)}\n`;
      });
    });
    csv += `\nTotal receipts,${book.totalReceipts}\nTotal payments,${book.totalPayments}\nClosing balance,${book.closingBalance}\n`;
    downloadCsv(`sarmaya-cashbook-${book.from}-to-${book.to}.csv`, csv, onDownload);
  };

  const removeMovement = (m: CashMovement) => {
    if (m.source === 'manual') deleteCashEntry(m.sourceId);
    else if (m.source === 'expense') deleteExpense(m.sourceId);
    else deleteLedgerEntry(m.sourceId);
  };

  const rangeBtn = (k: typeof range, label: string) => (
    <button onClick={() => setRange(k)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${range === k ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs' : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'}`}>{label}</button>
  );
  const inputCls = 'w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#111827] dark:text-white focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600';
  const labelCls = 'block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-[#FAF9F6] dark:bg-[#162436] p-1 rounded-full border border-[#E5E5E1] dark:border-[#203248] flex flex-wrap items-center gap-0.5">
            {rangeBtn('7', '7 days')}
            {rangeBtn('30', '30 days')}
            {rangeBtn('month', 'This month')}
            {rangeBtn('custom', 'Custom')}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="bg-white dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-xl px-3 py-1.5 font-mono text-[#111827] dark:text-white" />
              <span className="text-[#8E9299]">to</span>
              <input type="date" value={customTo} min={customFrom} max={todayISO()} onChange={(e) => setCustomTo(e.target.value)} className="bg-white dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-xl px-3 py-1.5 font-mono text-[#111827] dark:text-white" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setOpeningInput(String(settings.cashOpeningBalance)); setOpeningDate(settings.cashOpeningDate); setShowSettings((v) => !v); }} className="px-3.5 py-2 bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold rounded-2xl flex items-center gap-1.5 text-[#111827] dark:text-white"><Settings2 className="w-3.5 h-3.5" /> Opening balance</button>
          <button onClick={exportCsv} className="px-4 py-2 bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5"><Download className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Export</button>
        </div>
      </div>

      {showSettings && (
        <form onSubmit={saveSettings} className={`${card} p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end`}>
          <div><label className={labelCls}>Opening cash & bank balance (Rs.)</label><input type="number" step="0.01" value={openingInput} onChange={(e) => setOpeningInput(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Counting from</label><input type="date" value={openingDate} max={todayISO()} onChange={(e) => setOpeningDate(e.target.value)} className={inputCls} /></div>
          <div className="flex gap-2"><button type="submit" className="px-4 py-2.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold">Save</button><button type="button" onClick={() => setShowSettings(false)} className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-[#6B7280]">Cancel</button></div>
          <p className="sm:col-span-3 text-[11px] text-[#8E9299]">Movements dated before the "counting from" date are ignored; the opening balance is the cash and bank total on that date.</p>
        </form>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`${card} p-4 min-w-0`}><div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Opening</div><div className="text-sm sm:text-xl font-bold font-mono text-[#111827] dark:text-white mt-1 break-words">{formatCurrency(book.openingBalance)}</div><div className="text-[10px] text-[#8E9299] font-mono">{formatDate(book.from)}</div></div>
        <div className={`${card} p-4 min-w-0`}><div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1"><ArrowDownLeft className="w-3 h-3 text-teal-600" /> Receipts</div><div className="text-sm sm:text-xl font-bold font-mono text-teal-800 dark:text-teal-400 mt-1 break-words">{formatCurrency(book.totalReceipts)}</div></div>
        <div className={`${card} p-4 min-w-0`}><div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-amber-600" /> Payments</div><div className="text-sm sm:text-xl font-bold font-mono text-amber-800 dark:text-amber-400 mt-1 break-words">{formatCurrency(book.totalPayments)}</div></div>
        <div className="rounded-[28px] border border-[#111827] dark:border-white shadow-xs p-4 min-w-0 bg-[#111827] dark:bg-white text-white dark:text-[#111827]"><div className="text-[10px] font-bold uppercase tracking-widest opacity-70 flex items-center gap-1"><Wallet className="w-3 h-3" /> Closing</div><div className={`text-sm sm:text-xl font-bold font-mono mt-1 break-words ${book.closingBalance >= 0 ? 'text-teal-300 dark:text-teal-700' : 'text-rose-400'}`}>{formatCurrency(book.closingBalance)}</div><div className="text-[10px] opacity-70 font-mono">{formatDate(book.to)}</div></div>
      </div>

      {byMethod.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="font-bold uppercase tracking-widest text-[10px] text-[#8E9299] self-center">Net by method</span>
          {byMethod.map(([m, v]) => (
            <span key={m} className="px-2.5 py-1 rounded-full bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] font-mono text-[#374151] dark:text-[#CBD5E1]">{m}: <span className={v >= 0 ? 'text-teal-800 dark:text-teal-400' : 'text-rose-700'}>{v >= 0 ? '+' : '−'}{formatCurrency(Math.abs(v))}</span></span>
          ))}
        </div>
      )}

      {can('manage_expenses') && (
        <form onSubmit={submitEntry} className={`${card} p-5 space-y-3`}>
          <h3 className="text-sm font-bold text-[#111827] dark:text-white flex items-center gap-1.5"><Plus className="w-4 h-4 text-teal-700" /> Manual cash entry</h3>
          <p className="text-[11px] text-[#8E9299] -mt-1">For money that is not a customer payment, supplier payment or expense: owner capital, drawings, loans, bank charges, interest.</p>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div><label className={labelCls}>Direction</label><select value={entry.direction} onChange={(e) => setEntry({ ...entry, direction: e.target.value as 'in' | 'out' })} className={inputCls}><option value="in">Cash in</option><option value="out">Cash out</option></select></div>
            <div><label className={labelCls}>Date</label><input type="date" value={entry.date} max={todayISO()} onChange={(e) => setEntry({ ...entry, date: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Amount (Rs.)</label><input type="number" min="1" step="0.01" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} className={inputCls} required /></div>
            <div className="col-span-2 lg:col-span-2"><label className={labelCls}>Description</label><input value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} className={inputCls} placeholder="Owner capital injection" required /></div>
            <div><label className={labelCls}>Method</label><select value={entry.method} onChange={(e) => setEntry({ ...entry, method: e.target.value })} className={inputCls}>{['Cash', 'Bank Transfer', 'Cheque', 'Card'].map((m) => <option key={m}>{m}</option>)}</select></div>
          </div>
          <div className="flex justify-end"><button type="submit" className="px-5 py-2 bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold rounded-2xl">Add entry</button></div>
        </form>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="p-5 sm:p-6 border-b border-[#E5E5E1] dark:border-[#203248]"><h3 className="text-sm font-bold text-[#111827] dark:text-white">Daily cash book</h3><p className="text-[11px] text-[#8E9299]">Newest day first. Expand a day for each receipt and payment with a running balance.</p></div>
        <div className="divide-y divide-[#F0F0EE] dark:divide-[#1E2E40]">
          {book.days.map((d) => {
            const isOpen = expanded.has(d.date);
            const quiet = d.movements.length === 0;
            let run = d.opening;
            return (
              <div key={d.date}>
                <button onClick={() => !quiet && toggle(d.date)} className={`w-full px-5 sm:px-6 py-3 grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_repeat(3,minmax(0,130px))] items-center gap-3 text-left ${quiet ? 'opacity-50 cursor-default' : 'hover:bg-[#FAF9F6] dark:hover:bg-[#162436]'}`}>
                  <span className="text-[#8E9299]">{quiet ? <span className="w-4 h-4 block" /> : isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
                  <span className="min-w-0"><span className="text-xs font-bold text-[#111827] dark:text-white">{formatDate(d.date)}</span><span className="block text-[10px] text-[#8E9299] font-mono">{d.date === todayISO() ? 'Today • ' : ''}{d.movements.length} entr{d.movements.length === 1 ? 'y' : 'ies'}</span></span>
                  <span className="hidden sm:block text-right font-mono text-xs text-teal-800 dark:text-teal-400 font-bold">{d.receipts > 0 ? `+${formatCurrency(d.receipts)}` : '—'}</span>
                  <span className="hidden sm:block text-right font-mono text-xs text-amber-800 dark:text-amber-400 font-bold">{d.payments > 0 ? `−${formatCurrency(d.payments)}` : '—'}</span>
                  <span className="text-right font-mono text-xs"><span className={`font-bold ${d.closing >= 0 ? 'text-[#111827] dark:text-white' : 'text-rose-700'}`}>{formatCurrency(d.closing)}</span><span className="block text-[10px] text-[#8E9299]">closing</span></span>
                </button>
                {isOpen && !quiet && (
                  <div className="px-5 sm:px-6 pb-4 space-y-2 bg-[#FAF9F6]/60 dark:bg-[#0D1520]/40">
                    <div className="text-[10px] font-mono text-[#8E9299] pt-1">Opening {formatCurrency(d.opening)}</div>
                    {d.movements.map((m) => {
                      run = m.direction === 'in' ? run + m.amount : run - m.amount;
                      return (
                        <div key={m.id} className="bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 w-fit ${m.direction === 'in' ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-300 border-teal-200 dark:border-teal-800' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'}`}>{m.direction === 'in' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}{m.direction === 'in' ? 'RECEIPT' : 'PAYMENT'}</span>
                          <span className="flex-1 min-w-0 text-xs">
                            {m.link ? (
                              <button onClick={() => (m.link!.type === 'customer' ? setSelectedCustomerId(m.link!.id) : setSelectedSupplierId(m.link!.id))} className="font-bold text-[#111827] dark:text-white hover:text-teal-800 hover:underline">{m.counterparty}</button>
                            ) : (
                              <span className="font-bold text-[#111827] dark:text-white">{SOURCE_LABEL[m.source]}{m.counterparty ? ` • ${m.counterparty}` : ''}</span>
                            )}
                            <span className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8] truncate">{m.description}</span>
                            <span className="block text-[10px] text-[#8E9299] font-mono">{[m.reference, m.method, m.recordedBy ? `by ${m.recordedBy}` : ''].filter(Boolean).join(' • ')}</span>
                          </span>
                          <span className="text-right font-mono shrink-0"><span className={`font-bold ${m.direction === 'in' ? 'text-teal-800 dark:text-teal-400' : 'text-amber-800 dark:text-amber-400'}`}>{m.direction === 'in' ? '+' : '−'}{formatCurrency(m.amount)}</span><span className="block text-[10px] text-[#8E9299]">bal {formatCurrency(run)}</span></span>
                          {(m.source === 'customer_payment' || m.source === 'supplier_payment') && (<button onClick={() => setPrintRequest({ type: 'voucher', ledgerId: m.sourceId })} title="Print voucher" className="p-1.5 rounded-lg text-[#8E9299] hover:text-teal-700 hover:bg-teal-50 shrink-0 self-end sm:self-center"><Printer className="w-3.5 h-3.5" /></button>)}
                          {can('delete_records') && (<button onClick={() => setPending(m)} title="Delete entry (admin)" className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 shrink-0 self-end sm:self-center"><Trash2 className="w-3.5 h-3.5" /></button>)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pending)}
        title="Delete this cash book entry?"
        message={pending ? `${SOURCE_LABEL[pending.source]}: ${formatCurrency(pending.amount)} — ${pending.description}` : ''}
        details={pending?.source === 'customer_payment' || pending?.source === 'supplier_payment' ? ['Only the ledger row is removed; the customer/supplier balance is not recalculated.'] : undefined}
        confirmLabel="Delete Entry"
        onConfirm={() => { if (pending) removeMovement(pending); setPending(null); }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
};

// ===========================================================================
// Sales analytics
// ===========================================================================
const PALETTE = ['#0d9488', '#f59e0b', '#6366f1', '#ef4444', '#0ea5e9', '#84cc16', '#a855f7', '#f97316'];

export const SalesAnalyticsPanel: React.FC<{ onDownload?: (f: string) => void }> = ({ onDownload }) => {
  const { dispatches, customers, products, purchases, bookings, setSelectedCustomerId, setSelectedProductId } = useTrading();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [range, setRange] = useState<'month' | 'quarter' | 'year' | 'all'>('month');
  const today = todayISO();
  const from = useMemo(() => {
    if (range === 'all') return '0000-01-01';
    const d = new Date(today + 'T00:00:00Z');
    if (range === 'month') d.setUTCMonth(d.getUTCMonth() - 1);
    if (range === 'quarter') d.setUTCMonth(d.getUTCMonth() - 3);
    if (range === 'year') d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString().split('T')[0];
  }, [range, today]);
  const inRange = useMemo(() => dispatches.filter((d) => d.date >= from && d.date <= today), [dispatches, from, today]);
  const byCustomer = useMemo(() => {
    const m = new Map<string, { kg: number; revenue: number; trips: number }>();
    inRange.forEach((d) => { const r = m.get(d.customerId) || { kg: 0, revenue: 0, trips: 0 }; r.kg += d.kg; r.revenue += d.amount + (d.freightCharge || 0); r.trips += 1; m.set(d.customerId, r); });
    return Array.from(m.entries()).map(([id, r]) => ({ id, name: customers.find((c) => c.id === id)?.name || 'Unknown', ...r })).sort((a, b) => b.revenue - a.revenue);
  }, [inRange, customers]);
  const byProduct = useMemo(() => {
    const m = new Map<string, { kg: number; revenue: number }>();
    inRange.forEach((d) => { const r = m.get(d.productId) || { kg: 0, revenue: 0 }; r.kg += d.kg; r.revenue += d.amount; m.set(d.productId, r); });
    return Array.from(m.entries()).map(([id, r]) => ({ id, name: products.find((p) => p.id === id)?.name || 'Unknown', ...r })).sort((a, b) => b.revenue - a.revenue);
  }, [inRange, products]);
  const totals = useMemo(() => ({ revenue: inRange.reduce((a, d) => a + d.amount + (d.freightCharge || 0), 0), kg: inRange.reduce((a, d) => a + d.kg, 0), trips: inRange.length, customers: byCustomer.length }), [inRange, byCustomer]);
  const avgPrice = totals.kg > 0 ? totals.revenue / totals.kg : 0;
  const monthly = useMemo(() => pnlTrend(currentMonthKey(), 12, dispatches, purchases, [], products, bookings).map((m) => ({ label: m.label.split(' ')[0], Revenue: m.revenue, 'Gross profit': m.grossProfit, kg: m.soldKg })), [dispatches, purchases, products, bookings]);
  const thisYear = monthly.reduce((a, m) => a + m.Revenue, 0);

  const exportCsv = () => {
    let csv = `Sales analytics ${from === '0000-01-01' ? 'all time' : from} to ${today}\n\nCustomer,Trips,kg,Revenue,Share %\n`;
    byCustomer.forEach((c) => (csv += `"${c.name}",${c.trips},${c.kg},${c.revenue.toFixed(2)},${totals.revenue > 0 ? ((c.revenue / totals.revenue) * 100).toFixed(1) : 0}\n`));
    csv += `\nProduct,kg,Revenue,Avg Rs./kg\n`;
    byProduct.forEach((p) => (csv += `"${p.name}",${p.kg},${p.revenue.toFixed(2)},${p.kg > 0 ? (p.revenue / p.kg).toFixed(2) : ''}\n`));
    downloadCsv(`sarmaya-sales-analytics-${today}.csv`, csv, onDownload);
  };

  const rangeBtn = (k: typeof range, label: string) => (
    <button onClick={() => setRange(k)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${range === k ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs' : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'}`}>{label}</button>
  );
  const kpi = (label: string, value: string, sub?: string) => (
    <div className={`${card} p-4 min-w-0`}><div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">{label}</div><div className="text-base sm:text-xl font-bold font-mono text-[#111827] dark:text-white mt-1 break-words">{value}</div>{sub && <div className="text-[10px] text-[#8E9299] font-mono mt-0.5">{sub}</div>}</div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="bg-[#FAF9F6] dark:bg-[#162436] p-1 rounded-full border border-[#E5E5E1] dark:border-[#203248] flex flex-wrap items-center gap-0.5 w-fit">
          {rangeBtn('month', 'Last 30 days')}{rangeBtn('quarter', 'Last quarter')}{rangeBtn('year', 'Last 12 months')}{rangeBtn('all', 'All time')}
        </div>
        <button onClick={exportCsv} className="px-4 py-2 bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5 w-fit"><Download className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Export analytics</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpi('Revenue', formatCurrency(totals.revenue), `${totals.trips} dispatch(es)`)}
        {kpi('Volume sold', formatKg(totals.kg))}
        {kpi('Average price', `Rs. ${avgPrice.toFixed(2)}/kg`)}
        {kpi('Active customers', String(totals.customers), 'bought in this period')}
        {kpi('Top customer', byCustomer[0]?.name || '—', byCustomer[0] ? `${((byCustomer[0].revenue / Math.max(1, totals.revenue)) * 100).toFixed(0)}% of revenue` : undefined)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${card} p-5 sm:p-6 lg:col-span-2`}>
          <h3 className="text-sm font-bold text-[#111827] dark:text-white">Revenue & gross profit, last 12 months</h3>
          <p className="text-[11px] text-[#8E9299] mb-3">{formatCurrency(thisYear)} revenue over the period</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E2E40' : '#eee'} vertical={false} />
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => `${formatNumber(v / 1000)}k`} />
                <Tooltip cursor={{ fill: isDark ? '#162436' : '#FAF9F6' }} formatter={(v: number, n: string) => (n === 'kg' ? formatKg(v) : formatCurrency(v))} contentStyle={{ borderRadius: 16, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Revenue" fill="#0d9488" radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="Gross profit" stroke="#111827" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={`${card} p-5 sm:p-6`}>
          <h3 className="text-sm font-bold text-[#111827] dark:text-white">Revenue by product</h3>
          <p className="text-[11px] text-[#8E9299] mb-2">Share of goods value in the period</p>
          {byProduct.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-[#8E9299]">No sales in this period.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byProduct.slice(0, 8)} dataKey="revenue" nameKey="name" isAnimationActive={false} innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {byProduct.slice(0, 8).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 16, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-1 mt-2">
            {byProduct.slice(0, 5).map((p, i) => (
              <button key={p.id} onClick={() => setSelectedProductId(p.id)} className="w-full flex items-center justify-between text-xs hover:text-teal-800">
                <span className="flex items-center gap-2 truncate"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />{p.name}</span>
                <span className="font-mono text-[#374151] dark:text-[#CBD5E1] shrink-0">{formatCurrency(p.revenue)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="p-5 border-b border-[#E5E5E1] dark:border-[#203248]"><h3 className="text-sm font-bold text-[#111827] dark:text-white">Customers ranked by revenue</h3><p className="text-[11px] text-[#8E9299]">Click a customer to open their account</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]"><tr><th className="py-3 px-4">#</th><th className="py-3 px-4">Customer</th><th className="py-3 px-4 text-right">Dispatches</th><th className="py-3 px-4 text-right">Volume</th><th className="py-3 px-4 text-right">Revenue</th><th className="py-3 px-4">Share</th></tr></thead>
            <tbody className="divide-y divide-[#FAF9F6] dark:divide-[#1E2E40] font-mono">
              {byCustomer.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-[#8E9299] font-sans">No sales in this period.</td></tr>
              ) : byCustomer.map((c, i) => {
                const share = totals.revenue > 0 ? (c.revenue / totals.revenue) * 100 : 0;
                return (
                  <tr key={c.id} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                    <td className="py-2.5 px-4 text-[#8E9299]">{i + 1}</td>
                    <td className="py-2.5 px-4 font-sans"><button onClick={() => setSelectedCustomerId(c.id)} className="font-bold text-[#111827] dark:text-white hover:text-teal-800 hover:underline">{c.name}</button></td>
                    <td className="py-2.5 px-4 text-right text-[#374151] dark:text-[#CBD5E1]">{c.trips}</td>
                    <td className="py-2.5 px-4 text-right text-[#374151] dark:text-[#CBD5E1]">{formatKg(c.kg)}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-[#111827] dark:text-white">{formatCurrency(c.revenue)}</td>
                    <td className="py-2.5 px-4 w-40"><div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-[#E5E5E1] dark:bg-[#203248] rounded-full overflow-hidden"><div className="h-full bg-teal-600" style={{ width: `${share}%` }} /></div><span className="text-[10px] text-[#6B7280]">{share.toFixed(0)}%</span></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
