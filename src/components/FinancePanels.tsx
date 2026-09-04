import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Download, Receipt, Scale } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useTrading } from '../context/TradingContext';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency, formatKg, formatDate, formatNumber } from '../utils/formatters';
import { computeMonthlyPnL, pnlTrend, currentMonthKey, monthLabel, shiftMonth, receivablesAging, payablesAging, sumAging, AgingRow } from '../utils/finance';
import { todayISO } from '../utils/stockFlow';
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
  const { dispatches, purchases, expenses, products, setSelectedProductId } = useTrading();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [month, setMonth] = useState(currentMonthKey());

  const pnl = useMemo(() => computeMonthlyPnL(month, dispatches, purchases, expenses, products), [month, dispatches, purchases, expenses, products]);
  const trend = useMemo(() => pnlTrend(month, 6, dispatches, purchases, expenses, products), [month, dispatches, purchases, expenses, products]);
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
      <div className={`text-xl sm:text-2xl font-bold font-mono mt-1.5 truncate ${tone === 'good' ? 'text-teal-800 dark:text-teal-400' : tone === 'bad' ? 'text-rose-700 dark:text-rose-400' : 'text-[#111827] dark:text-white'}`}>{value}</div>
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
        {stat('Cost of goods', formatCurrency(pnl.cogs), pnl.uncostedKg > 0 ? `${formatKg(pnl.uncostedKg)} without cost data` : 'weighted avg purchase cost')}
        {stat('Gross profit', formatCurrency(pnl.grossProfit), pnl.grossMarginPct != null ? `${pnl.grossMarginPct}% margin` : undefined, pnl.grossProfit >= 0 ? 'good' : 'bad')}
        {stat('Expenses', formatCurrency(pnl.expenses), `${Object.keys(pnl.expensesByCategory).length} categor(ies)`)}
        {stat('Net profit', formatCurrency(pnl.netProfit), delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs ${prev.label}` : pnl.netMarginPct != null ? `${pnl.netMarginPct}% net margin` : undefined, pnl.netProfit >= 0 ? 'good' : 'bad')}
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
      <div className={`text-lg font-bold font-mono mt-1 truncate ${tone}`}>{formatCurrency(value)}</div>
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
          <div className="text-lg font-bold font-mono mt-1 truncate">{formatCurrency(totals.total)}</div>
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
