import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  ChevronDown,
  ChevronRight,
  Download,
  PackagePlus,
  Building,
  User,
  Package,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useTrading } from '../context/TradingContext';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency, formatKg, formatDate, formatNumber } from '../utils/formatters';
import { buildMovements, groupByDay, shiftDate, todayISO, StockMovement } from '../utils/stockFlow';
import { ConfirmDialog } from './ConfirmDialog';

interface StockFlowPanelProps {
  onReceiveStock: () => void;
  onDownload?: (fileName: string) => void;
}

type RangeKey = '7' | '30' | '90' | 'custom';

/** Daily incoming (purchases) vs outgoing (dispatches) tracker with a running per-day log. */
export const StockFlowPanel: React.FC<StockFlowPanelProps> = ({ onReceiveStock, onDownload }) => {
  const {
    purchases,
    dispatches,
    customers,
    suppliers,
    products,
    bookings,
    openBooking,
    setSelectedCustomerId,
    setSelectedSupplierId,
    setSelectedProductId,
    deletePurchase,
    deleteDispatch,
  } = useTrading();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(shiftDate(todayISO(), -29));
  const [customTo, setCustomTo] = useState(todayISO());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([todayISO()]));
  const [pending, setPending] = useState<StockMovement | null>(null);

  const to = range === 'custom' ? customTo : todayISO();
  const from = range === 'custom' ? customFrom : shiftDate(todayISO(), -(Number(range) - 1));

  const movements = useMemo(
    () => buildMovements(purchases, dispatches, { customers, suppliers, products, bookings }),
    [purchases, dispatches, customers, suppliers, products, bookings]
  );
  const days = useMemo(() => groupByDay(movements, from, to), [movements, from, to]);

  const totals = useMemo(() => {
    const t = { inKg: 0, inAmount: 0, outKg: 0, outAmount: 0, inCount: 0, outCount: 0 };
    days.forEach((d) => {
      t.inKg += d.inKg;
      t.inAmount += d.inAmount;
      t.outKg += d.outKg;
      t.outAmount += d.outAmount;
      d.movements.forEach((m) => (m.direction === 'in' ? t.inCount++ : t.outCount++));
    });
    return t;
  }, [days]);

  const stockOnHand = products.reduce((a, p) => a + p.stockKg, 0);
  const chartData = useMemo(() => [...days].reverse().map((d) => ({ date: d.date, label: formatDate(d.date), In: d.inKg, Out: d.outKg })), [days]);

  const toggle = (date: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const exportCsv = () => {
    let csv = `Stock Flow ${from} to ${to}\n`;
    csv += `Date,Direction,Reference,Booking,Counterparty,Product,Truck,Quantity (kg),Rate (Rs./kg),Value (Rs.)\n`;
    days.forEach((d) =>
      d.movements.forEach((m) => {
        csv += `"${m.date}","${m.direction.toUpperCase()}","${m.reference}","${m.bookingNumber || ''}","${m.direction === 'in' ? m.supplierName : m.customerName}","${m.productName}","${m.truckNumber || ''}",${m.kg},${m.pricePerKg.toFixed(2)},${m.amount}\n`;
      })
    );
    csv += `\nTotals\nIncoming (kg),${totals.inKg}\nIncoming value (Rs.),${totals.inAmount}\nOutgoing (kg),${totals.outKg}\nOutgoing value (Rs.),${totals.outAmount}\nNet (kg),${totals.inKg - totals.outKg}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileName = `sarmaya-stock-flow-${from}-to-${to}.csv`;
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onDownload?.(fileName);
  };

  const card = 'bg-white dark:bg-[#101A26] p-5 rounded-[24px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs min-w-0';
  const rangeBtn = (k: RangeKey, label: string) => (
    <button
      onClick={() => setRange(k)}
      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${range === k ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs' : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-[#FAF9F6] dark:bg-[#162436] p-1 rounded-full border border-[#E5E5E1] dark:border-[#203248] flex items-center gap-0.5">
            {rangeBtn('7', '7 days')}
            {rangeBtn('30', '30 days')}
            {rangeBtn('90', '90 days')}
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
          <button onClick={exportCsv} className="px-4 py-2 bg-[#FAF9F6] dark:bg-[#162436] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] text-[#111827] dark:text-white text-xs font-semibold rounded-2xl border border-[#E5E5E1] dark:border-[#203248] flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={onReceiveStock} className="px-4 py-2 bg-[#111827] dark:bg-white hover:bg-black text-white dark:text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5 shadow-xs">
            <PackagePlus className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Receive Stock
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={card}>
          <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1.5"><ArrowDownLeft className="w-3.5 h-3.5 text-teal-600" /> Incoming</div>
          <div className="text-2xl font-bold font-mono text-teal-800 dark:text-teal-400 mt-1.5">{formatKg(totals.inKg)}</div>
          <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] mt-1 font-mono">{formatCurrency(totals.inAmount)} • {totals.inCount} receipt(s)</div>
        </div>
        <div className={card}>
          <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1.5"><ArrowUpRight className="w-3.5 h-3.5 text-amber-600" /> Outgoing</div>
          <div className="text-2xl font-bold font-mono text-amber-800 dark:text-amber-400 mt-1.5">{formatKg(totals.outKg)}</div>
          <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] mt-1 font-mono">{formatCurrency(totals.outAmount)} • {totals.outCount} dispatch(es)</div>
        </div>
        <div className={card}>
          <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1.5"><Scale className="w-3.5 h-3.5 text-[#6B7280]" /> Net movement</div>
          <div className={`text-2xl font-bold font-mono mt-1.5 ${totals.inKg - totals.outKg >= 0 ? 'text-teal-800 dark:text-teal-400' : 'text-rose-700 dark:text-rose-400'}`}>
            {totals.inKg - totals.outKg >= 0 ? '+' : '−'}{formatKg(Math.abs(totals.inKg - totals.outKg))}
          </div>
          <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] mt-1 font-mono">Margin on flow: {formatCurrency(totals.outAmount - totals.inAmount)}</div>
        </div>
        <div className={card}>
          <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-[#6B7280]" /> Stock on hand now</div>
          <div className="text-2xl font-bold font-mono text-[#111827] dark:text-white mt-1.5">{formatKg(stockOnHand)}</div>
          <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] mt-1 font-mono">{products.length} product(s)</div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-[#101A26] p-5 sm:p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-bold text-[#111827] dark:text-white">Daily in vs out</h3>
            <p className="text-[11px] text-[#8E9299] dark:text-[#94A3B8]">Kilograms received from suppliers against kilograms dispatched to customers</p>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E2E40' : '#eee'} vertical={false} />
              <XAxis dataKey="label" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={55} tickFormatter={(v) => `${formatNumber(v)}kg`} />
              <Tooltip
                cursor={{ fill: isDark ? '#162436' : '#FAF9F6' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const inKg = Number(payload.find((p) => p.dataKey === 'In')?.value || 0);
                  const outKg = Number(payload.find((p) => p.dataKey === 'Out')?.value || 0);
                  return (
                    <div className="bg-[#111827] text-white p-3 rounded-2xl shadow-xl text-xs space-y-1 border border-[#374151]">
                      <div className="font-bold text-gray-300">{label}</div>
                      <div className="text-teal-300 font-mono">In: {formatKg(inKg)}</div>
                      <div className="text-amber-300 font-mono">Out: {formatKg(outKg)}</div>
                      <div className="text-gray-400 font-mono">Net: {inKg - outKg >= 0 ? '+' : '−'}{formatKg(Math.abs(inKg - outKg))}</div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="In" fill="#0d9488" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Out" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Running daily log */}
      <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-[#E5E5E1] dark:border-[#203248] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#111827] dark:text-white">Running daily log</h3>
            <p className="text-[11px] text-[#8E9299] dark:text-[#94A3B8]">Newest day first. Expand a day to see every receipt and dispatch with links to the source record.</p>
          </div>
          <span className="text-xs font-mono text-[#6B7280] dark:text-[#94A3B8] bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] px-3 py-1 rounded-full">{days.length} days</span>
        </div>
        <div className="divide-y divide-[#F0F0EE] dark:divide-[#1E2E40]">
          {days.map((d) => {
            const isOpen = expanded.has(d.date);
            const quiet = d.movements.length === 0;
            return (
              <div key={d.date}>
                <button
                  onClick={() => !quiet && toggle(d.date)}
                  className={`w-full px-5 sm:px-6 py-3 grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_repeat(3,minmax(0,140px))] items-center gap-3 text-left ${quiet ? 'opacity-50 cursor-default' : 'hover:bg-[#FAF9F6] dark:hover:bg-[#162436]'}`}
                >
                  <span className="text-[#8E9299]">{quiet ? <span className="w-4 h-4 block" /> : isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
                  <span className="min-w-0">
                    <span className="text-xs font-bold text-[#111827] dark:text-white">{formatDate(d.date)}</span>
                    <span className="block text-[10px] text-[#8E9299] font-mono">{d.date === todayISO() ? 'Today • ' : ''}{d.movements.length} movement(s)</span>
                  </span>
                  <span className="hidden sm:block text-right font-mono text-xs">
                    <span className="text-teal-800 dark:text-teal-400 font-bold">+{formatKg(d.inKg)}</span>
                    <span className="block text-[10px] text-[#8E9299]">{formatCurrency(d.inAmount)}</span>
                  </span>
                  <span className="hidden sm:block text-right font-mono text-xs">
                    <span className="text-amber-800 dark:text-amber-400 font-bold">−{formatKg(d.outKg)}</span>
                    <span className="block text-[10px] text-[#8E9299]">{formatCurrency(d.outAmount)}</span>
                  </span>
                  <span className="text-right font-mono text-xs">
                    <span className={`font-bold ${d.netKg >= 0 ? 'text-[#111827] dark:text-white' : 'text-rose-700 dark:text-rose-400'}`}>{d.netKg >= 0 ? '+' : '−'}{formatKg(Math.abs(d.netKg))}</span>
                    <span className="block text-[10px] text-[#8E9299]">net</span>
                  </span>
                </button>

                {isOpen && !quiet && (
                  <div className="px-5 sm:px-6 pb-4 space-y-2 bg-[#FAF9F6]/60 dark:bg-[#0D1520]/40">
                    {d.movements.map((m) => (
                      <div key={m.id} className="bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center gap-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 w-fit ${m.direction === 'in' ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-300 border-teal-200 dark:border-teal-800' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'}`}>
                          {m.direction === 'in' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {m.direction === 'in' ? 'IN' : 'OUT'}
                        </span>
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                          <div className="min-w-0">
                            {m.direction === 'out' && m.bookingId ? (
                              <button onClick={() => openBooking(m.bookingId!, m.dispatchId)} className="font-mono font-bold text-[#111827] dark:text-white hover:text-teal-800 hover:underline flex items-center gap-1">
                                <ShoppingBag className="w-3 h-3 text-[#8E9299]" />{m.reference}
                              </button>
                            ) : (
                              <span className="font-mono font-bold text-[#111827] dark:text-white">{m.reference}</span>
                            )}
                            {m.bookingNumber && (
                              <button onClick={() => openBooking(m.bookingId!)} className="block text-[10px] text-[#8E9299] hover:text-teal-800 hover:underline font-mono">{m.bookingNumber}</button>
                            )}
                            {m.truckNumber && <span className="block text-[10px] text-[#8E9299] font-mono">{m.truckNumber}</span>}
                          </div>
                          <div className="min-w-0">
                            {m.direction === 'in' && m.supplierId ? (
                              <button onClick={() => setSelectedSupplierId(m.supplierId!)} className="flex items-center gap-1 text-[#111827] dark:text-white hover:text-teal-800 hover:underline truncate"><Building className="w-3 h-3 text-[#8E9299] shrink-0" />{m.supplierName}</button>
                            ) : m.customerId ? (
                              <button onClick={() => setSelectedCustomerId(m.customerId!)} className="flex items-center gap-1 text-[#111827] dark:text-white hover:text-teal-800 hover:underline truncate"><User className="w-3 h-3 text-[#8E9299] shrink-0" />{m.customerName}</button>
                            ) : null}
                            <button onClick={() => setSelectedProductId(m.productId)} className="flex items-center gap-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-800 hover:underline truncate mt-0.5"><Package className="w-3 h-3 shrink-0" />{m.productName}</button>
                          </div>
                          <div className="text-right font-mono">
                            <span className={`font-bold ${m.direction === 'in' ? 'text-teal-800 dark:text-teal-400' : 'text-amber-800 dark:text-amber-400'}`}>{m.direction === 'in' ? '+' : '−'}{formatKg(m.kg)}</span>
                            <span className="block text-[11px] text-[#111827] dark:text-white">{formatCurrency(m.amount)}</span>
                            <span className="block text-[10px] text-[#8E9299]">@ Rs. {m.pricePerKg.toFixed(2)}/kg</span>
                          </div>
                        </div>
                        <button onClick={() => setPending(m)} title={m.direction === 'in' ? 'Delete receipt (admin)' : 'Delete dispatch (admin)'} className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0 self-end md:self-center">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={`Delete ${pending?.reference ?? ''}?`}
        message={pending?.direction === 'in' ? 'The stock receipt will be removed; the received kg comes off stock and the supplier payable is reversed.' : 'The dispatch will be removed; stock, booking progress and the customer balance are reversed.'}
        confirmLabel={pending?.direction === 'in' ? 'Delete Receipt' : 'Delete Dispatch'}
        onConfirm={() => {
          if (pending?.direction === 'in' && pending.purchaseId) deletePurchase(pending.purchaseId);
          if (pending?.direction === 'out' && pending.dispatchId) deleteDispatch(pending.dispatchId);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
};
