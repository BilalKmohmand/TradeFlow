import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
  ArrowDownLeft,
  ArrowUpRight,
  PackagePlus,
  Trash2,
  Building,
  User,
  ShoppingBag,
  Plus,
  Tag,
  Pencil,
} from 'lucide-react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Bar,
  Legend,
} from 'recharts';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate } from '../utils/formatters';
import { buildMovements, priceSeries, yearOverYear, todayISO } from '../utils/stockFlow';
import { productSalesHistory, currentMonthKey } from '../utils/finance';
import { useEscape } from '../hooks/useEscape';
import { PriceSource } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface ProductDetailModalProps {
  productId: string | null;
  onClose: () => void;
  onReceiveStock: (productId: string) => void;
}

const SOURCE_LABEL: Record<PriceSource, string> = {
  product_created: 'Listed',
  price_update: 'Price change',
  manual: 'Manual entry',
  booking: 'Booking rate',
  purchase: 'Purchase cost',
};

const inputCls =
  'w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-3.5 py-2 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600';

const ChangeBadge: React.FC<{ change: number | null }> = ({ change }) => {
  if (change == null)
    return <span className="text-[10px] font-semibold text-[#8E9299] bg-[#FAF9F6] border border-[#E5E5E1] px-2 py-0.5 rounded-full">No data</span>;
  const up = change > 0.05;
  const down = change < -0.05;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const cls = up
    ? 'text-rose-700 bg-rose-50 border-rose-200'
    : down
    ? 'text-teal-800 bg-teal-50 border-teal-200'
    : 'text-[#6B7280] bg-[#FAF9F6] border-[#E5E5E1]';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className="w-3 h-3" />
      {up ? '+' : ''}
      {change.toFixed(1)}%
    </span>
  );
};

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ productId, onClose, onReceiveStock }) => {
  const {
    products,
    suppliers,
    customers,
    bookings,
    dispatches,
    purchases,
    priceHistory,
    updateProductPrice,
    addPricePoint,
    deletePricePoint,
    setSelectedSupplierId,
    setSelectedCustomerId,
    openBooking,
    setEditRequest,
    can,
  } = useTrading();

  const [tab, setTab] = useState<'price' | 'sales' | 'movements' | 'bookings'>('price');
  const [newPrice, setNewPrice] = useState('');
  const [newPriceNote, setNewPriceNote] = useState('');
  const [histDate, setHistDate] = useState(() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString().split('T')[0];
  });
  const [histPrice, setHistPrice] = useState('');
  const [histNote, setHistNote] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  useEscape(Boolean(productId) && !pendingDeleteId, onClose);

  const product = products.find((p) => p.id === productId);

  const entries = useMemo(() => priceHistory.filter((e) => e.productId === productId), [priceHistory, productId]);
  const series = useMemo(() => priceSeries(entries), [entries]);
  const yoy = useMemo(() => (product ? yearOverYear(entries, product.unitPricePerKg) : null), [entries, product]);
  const movements = useMemo(
    () =>
      buildMovements(
        purchases.filter((p) => p.productId === productId),
        dispatches.filter((d) => d.productId === productId),
        { customers, suppliers, products, bookings }
      ),
    [purchases, dispatches, productId, customers, suppliers, products, bookings]
  );
  const productBookings = useMemo(() => bookings.filter((b) => b.productId === productId), [bookings, productId]);
  const sales = useMemo(() => (productId ? productSalesHistory(dispatches, productId, currentMonthKey(), 12) : []), [dispatches, productId]);
  const salesTotals = useMemo(() => ({
    kg: sales.reduce((a, r) => a + r.kg, 0),
    revenue: sales.reduce((a, r) => a + r.revenue, 0),
    lastYearKg: sales.reduce((a, r) => a + r.lastYearKg, 0),
    lastYearRevenue: sales.reduce((a, r) => a + r.lastYearRevenue, 0),
    bestMonth: sales.reduce((best, r) => (r.kg > (best?.kg ?? -1) ? r : best), null as null | (typeof sales)[number]),
  }), [sales]);

  if (!product) return null;

  const supplier = suppliers.find((s) => s.id === product.supplierId);
  const last30 = (() => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const from = cutoff.toISOString().split('T')[0];
    const recent = movements.filter((m) => m.date >= from);
    return {
      inKg: recent.filter((m) => m.direction === 'in').reduce((a, m) => a + m.kg, 0),
      outKg: recent.filter((m) => m.direction === 'out').reduce((a, m) => a + m.kg, 0),
    };
  })();

  const submitNewPrice = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newPrice);
    if (!val || val <= 0) return;
    updateProductPrice(product.id, val, newPriceNote.trim() || undefined);
    setNewPrice('');
    setNewPriceNote('');
  };

  const submitHistorical = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(histPrice);
    if (!val || val <= 0 || !histDate || histDate > todayISO()) return;
    addPricePoint(product.id, val, histDate, histNote.trim() || undefined);
    setHistPrice('');
    setHistNote('');
  };

  const go = (fn: () => void) => {
    onClose();
    fn();
  };

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`py-3.5 border-b-2 transition-all ${tab === id ? 'border-teal-700 text-[#111827]' : 'border-transparent text-[#8E9299] hover:text-[#111827]'}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            className="relative bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden z-10 my-8 max-h-[92vh] flex flex-col"
          >
            {/* Header */}
            <div className="p-6 sm:p-7 bg-[#111827] text-white flex items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/10 text-teal-400 border border-white/10 uppercase tracking-widest">
                    {product.category}
                  </span>
                  {supplier && (
                    <button
                      onClick={() => go(() => setSelectedSupplierId(supplier.id))}
                      className="text-xs text-[#9CA3AF] hover:text-white flex items-center gap-1 underline-offset-2 hover:underline"
                    >
                      <Building className="w-3 h-3" /> {supplier.company}
                    </button>
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-serif italic font-normal tracking-tight text-white truncate">{product.name}</h2>
                <div className="flex items-center gap-4 text-xs text-[#9CA3AF] font-mono">
                  <span>
                    Price: <span className="text-teal-300 font-bold">Rs. {product.unitPricePerKg}/kg</span>
                  </span>
                  <span>
                    Stock: <span className="text-white font-bold">{formatKg(product.stockKg)}</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => go(() => setEditRequest({ type: 'product', id: product.id }))} title="Edit product" className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10">
                  <Pencil className="w-5 h-5" />
                </button>
                <button
                  onClick={() => go(() => onReceiveStock(product.id))}
                  className="hidden sm:flex px-3.5 py-2 bg-white text-[#111827] text-xs font-bold rounded-2xl items-center gap-1.5 hover:bg-slate-100"
                >
                  <PackagePlus className="w-3.5 h-3.5 text-teal-700" /> Receive Stock
                </button>
                <button onClick={onClose} className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 sm:px-7 border-b border-[#E5E5E1] flex gap-4 text-xs font-bold bg-white overflow-x-auto">
              {tabBtn('price', `Price History (${entries.length})`)}
              {tabBtn('sales', 'Sales by Month')}
              {tabBtn('movements', `Stock In / Out (${movements.length})`)}
              {tabBtn('bookings', `Bookings (${productBookings.length})`)}
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6 bg-[#FAF9F6]">
              {tab === 'price' && yoy && (
                <div className="space-y-6">
                  {/* YoY comparison cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-[#111827] text-white p-5 rounded-2xl">
                      <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Current Price</div>
                      <div className="text-2xl font-bold font-mono text-teal-300 mt-1">Rs. {product.unitPricePerKg}</div>
                      <div className="text-[11px] text-[#9CA3AF] mt-1">per kg, as of today</div>
                    </div>
                    {[
                      { title: `Same month last year`, sub: yoy.month.label, price: yoy.month.price, change: yoy.month.change },
                      { title: `Same quarter last year`, sub: yoy.quarter.label, price: yoy.quarter.price, change: yoy.quarter.change },
                      { title: `One year ago today`, sub: formatDate(yoy.sameDay.date), price: yoy.sameDay.price, change: yoy.sameDay.change },
                    ].map((c) => (
                      <div key={c.title} className="bg-white p-5 rounded-2xl border border-[#E5E5E1] shadow-xs">
                        <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">{c.title}</div>
                        <div className="flex items-baseline justify-between gap-2 mt-1">
                          <span className="text-xl font-bold font-mono text-[#111827]">{c.price != null ? `Rs. ${c.price.toFixed(2)}` : '—'}</span>
                          <ChangeBadge change={c.change} />
                        </div>
                        <div className="text-[11px] text-[#8E9299] mt-1">{c.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Chart */}
                  <div className="bg-white rounded-2xl border border-[#E5E5E1] p-5 shadow-xs">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                          <History className="w-4 h-4 text-teal-700" /> Price over time
                        </h4>
                        <p className="text-[11px] text-[#8E9299]">Listed price (line) and rates agreed in bookings (dots), Rs./kg</p>
                      </div>
                    </div>
                    {series.length === 0 ? (
                      <div className="h-40 flex items-center justify-center text-xs text-[#8E9299]">No price points yet. Add last year's prices below to enable comparisons.</div>
                    ) : (
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                            <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatDate(v)} minTickGap={30} />
                            <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={50} tickFormatter={(v) => `Rs.${v}`} domain={['auto', 'auto']} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const p: any = payload[0].payload;
                                return (
                                  <div className="bg-[#111827] text-white p-3 rounded-2xl shadow-xl text-xs space-y-1 border border-[#374151]">
                                    <div className="font-bold text-gray-300">{formatDate(p.date)}</div>
                                    <div className="text-teal-300 font-mono font-bold">Rs. {(p.listPrice ?? p.bookingPrice)?.toFixed(2)}/kg</div>
                                    <div className="text-gray-400">{SOURCE_LABEL[p.source as PriceSource]}{p.note ? ` • ${p.note}` : ''}</div>
                                  </div>
                                );
                              }}
                            />
                            <ReferenceLine y={product.unitPricePerKg} stroke="#0d9488" strokeDasharray="4 4" />
                            <Line type="stepAfter" dataKey="listPrice" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                            <Line type="monotone" dataKey="bookingPrice" stroke="#f59e0b" strokeWidth={0} dot={{ r: 4, fill: '#f59e0b' }} activeDot={{ r: 5 }} connectNulls={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Forms */}
                  {can('edit_prices') && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <form onSubmit={submitNewPrice} className="bg-white rounded-2xl border border-[#E5E5E1] p-5 shadow-xs space-y-3">
                      <h4 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                        <Tag className="w-4 h-4 text-teal-700" /> Set new current price
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" step="0.01" min="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Rs./kg" className={inputCls} required />
                        <input value={newPriceNote} onChange={(e) => setNewPriceNote(e.target.value)} placeholder="Reason (optional)" className={inputCls} />
                      </div>
                      <button type="submit" className="px-4 py-2 bg-[#111827] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-black">
                        <Plus className="w-3.5 h-3.5 text-teal-400" /> Apply price
                      </button>
                    </form>
                    <form onSubmit={submitHistorical} className="bg-white rounded-2xl border border-[#E5E5E1] p-5 shadow-xs space-y-3">
                      <h4 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                        <History className="w-4 h-4 text-amber-600" /> Add a past price point
                      </h4>
                      <p className="text-[11px] text-[#8E9299] -mt-1">Back-fill last year's prices so the comparisons above have something to compare against.</p>
                      <div className="grid grid-cols-3 gap-3">
                        <input type="date" value={histDate} max={todayISO()} onChange={(e) => setHistDate(e.target.value)} className={inputCls} required />
                        <input type="number" step="0.01" min="0.01" value={histPrice} onChange={(e) => setHistPrice(e.target.value)} placeholder="Rs./kg" className={inputCls} required />
                        <input value={histNote} onChange={(e) => setHistNote(e.target.value)} placeholder="Note" className={inputCls} />
                      </div>
                      <button type="submit" className="px-4 py-2 bg-[#FAF9F6] border border-[#E5E5E1] text-[#111827] text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-[#F0F0EE]">
                        <Plus className="w-3.5 h-3.5" /> Record point
                      </button>
                    </form>
                  </div>
                  )}

                  {/* Log */}
                  <div className="bg-white rounded-2xl border border-[#E5E5E1] overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#FAF9F6] border-b border-[#E5E5E1] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                          <tr>
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4 text-right">Rs./kg</th>
                            <th className="py-3 px-4">Source</th>
                            <th className="py-3 px-4">Note</th>
                            <th className="py-3 px-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#FAF9F6] font-mono">
                          {entries.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-[#8E9299] font-sans">No price history recorded.</td>
                            </tr>
                          ) : (
                            [...entries]
                              .sort((a, b) => (a.date < b.date ? 1 : -1))
                              .map((e) => (
                                <tr key={e.id} className="hover:bg-[#FAF9F6]">
                                  <td className="py-2.5 px-4 text-[#6B7280] whitespace-nowrap">{formatDate(e.date)}</td>
                                  <td className="py-2.5 px-4 text-right font-bold text-[#111827]">Rs. {e.pricePerKg}</td>
                                  <td className="py-2.5 px-4 font-sans">
                                    {e.source === 'booking' && e.referenceId ? (
                                      <button onClick={() => go(() => openBooking(e.referenceId!))} className="text-amber-700 font-semibold hover:underline">
                                        {SOURCE_LABEL[e.source]}
                                      </button>
                                    ) : (
                                      <span className="text-[#374151]">{SOURCE_LABEL[e.source]}</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 font-sans text-[#6B7280]">{e.note || '—'}</td>
                                  <td className="py-2.5 px-2 text-right">
                                    <button onClick={() => setPendingDeleteId(e.id)} title="Delete price point" className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'sales' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-[#111827] text-white p-4 rounded-2xl min-w-0">
                      <div className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Sold, last 12 months</div>
                      <div className="text-xl font-bold font-mono text-teal-300 mt-1 truncate">{formatKg(salesTotals.kg)}</div>
                      <div className="text-[11px] text-[#9CA3AF] font-mono truncate">{formatCurrency(salesTotals.revenue)}</div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-[#E5E5E1] shadow-xs min-w-0">
                      <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Same 12 months, year before</div>
                      <div className="text-xl font-bold font-mono text-[#111827] mt-1 truncate">{formatKg(salesTotals.lastYearKg)}</div>
                      <div className="text-[11px] text-[#8E9299] font-mono truncate">{formatCurrency(salesTotals.lastYearRevenue)}</div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-[#E5E5E1] shadow-xs min-w-0">
                      <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Volume vs year before</div>
                      <div className="mt-1.5"><ChangeBadge change={salesTotals.lastYearKg > 0 ? ((salesTotals.kg - salesTotals.lastYearKg) / salesTotals.lastYearKg) * 100 : null} /></div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-[#E5E5E1] shadow-xs min-w-0">
                      <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Best month</div>
                      <div className="text-xl font-bold font-mono text-[#111827] mt-1 truncate">{salesTotals.bestMonth && salesTotals.bestMonth.kg > 0 ? salesTotals.bestMonth.label : '—'}</div>
                      <div className="text-[11px] text-[#8E9299] font-mono truncate">{salesTotals.bestMonth && salesTotals.bestMonth.kg > 0 ? formatKg(salesTotals.bestMonth.kg) : 'no sales yet'}</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#E5E5E1] p-5 shadow-xs">
                    <h4 className="text-sm font-bold text-[#111827]">Kilograms sold per month</h4>
                    <p className="text-[11px] text-[#8E9299] mb-3">Last 12 months against the same month one year earlier</p>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={sales.map((r) => ({ label: r.label.split(' ')[0], 'This year': r.kg, 'Last year': r.lastYearKg, revenue: r.revenue }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={2}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                          <XAxis dataKey="label" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={55} tickFormatter={(v) => `${Number(v).toLocaleString()}kg`} />
                          <Tooltip cursor={{ fill: '#FAF9F6' }} contentStyle={{ borderRadius: 16, fontSize: 12 }} formatter={(v: number, name: string) => [`${Number(v).toLocaleString()} kg`, name]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="Last year" fill="#CBD5E1" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="This year" fill="#0d9488" radius={[6, 6, 0, 0]} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#E5E5E1] overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#FAF9F6] border-b border-[#E5E5E1] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                          <tr>
                            <th className="py-3 px-4">Month</th>
                            <th className="py-3 px-4 text-right">Sold (kg)</th>
                            <th className="py-3 px-4 text-right">Revenue</th>
                            <th className="py-3 px-4 text-right">Avg Rs./kg</th>
                            <th className="py-3 px-4 text-right">Dispatches</th>
                            <th className="py-3 px-4 text-right">Same month last year</th>
                            <th className="py-3 px-4 text-right">Change</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#FAF9F6] font-mono">
                          {[...sales].reverse().map((r) => (
                            <tr key={r.month} className={`hover:bg-[#FAF9F6] ${r.kg === 0 && r.lastYearKg === 0 ? 'opacity-50' : ''}`}>
                              <td className="py-2.5 px-4 font-sans font-semibold text-[#111827] whitespace-nowrap">{r.label}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-[#111827]">{r.kg > 0 ? formatKg(r.kg) : '—'}</td>
                              <td className="py-2.5 px-4 text-right text-[#111827]">{r.revenue > 0 ? formatCurrency(r.revenue) : '—'}</td>
                              <td className="py-2.5 px-4 text-right text-[#6B7280]">{r.avgPricePerKg != null ? `Rs. ${r.avgPricePerKg}` : '—'}</td>
                              <td className="py-2.5 px-4 text-right text-[#6B7280]">{r.dispatches || '—'}</td>
                              <td className="py-2.5 px-4 text-right text-[#6B7280]">{r.lastYearKg > 0 ? `${formatKg(r.lastYearKg)} • ${formatCurrency(r.lastYearRevenue)}` : '—'}</td>
                              <td className="py-2.5 px-4 text-right"><ChangeBadge change={r.kgChangePct} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'movements' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white p-4 rounded-2xl border border-[#E5E5E1] shadow-xs">
                      <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">On hand now</div>
                      <div className="text-xl font-bold font-mono text-[#111827] mt-1">{formatKg(product.stockKg)}</div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-[#E5E5E1] shadow-xs">
                      <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1"><ArrowDownLeft className="w-3 h-3 text-teal-700" /> Received, last 30 days</div>
                      <div className="text-xl font-bold font-mono text-teal-800 mt-1">{formatKg(last30.inKg)}</div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-[#E5E5E1] shadow-xs">
                      <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-amber-700" /> Dispatched, last 30 days</div>
                      <div className="text-xl font-bold font-mono text-amber-800 mt-1">{formatKg(last30.outKg)}</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#E5E5E1] overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#FAF9F6] border-b border-[#E5E5E1] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                          <tr>
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4">Type</th>
                            <th className="py-3 px-4">Reference</th>
                            <th className="py-3 px-4">Counterparty</th>
                            <th className="py-3 px-4 text-right">kg</th>
                            <th className="py-3 px-4 text-right">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#FAF9F6] font-mono">
                          {movements.length === 0 ? (
                            <tr><td colSpan={6} className="py-8 text-center text-[#8E9299] font-sans">No stock movements for this product yet.</td></tr>
                          ) : (
                            movements.map((m) => (
                              <tr key={m.id} className="hover:bg-[#FAF9F6]">
                                <td className="py-2.5 px-4 text-[#6B7280] whitespace-nowrap">{formatDate(m.date)}</td>
                                <td className="py-2.5 px-4 font-sans">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.direction === 'in' ? 'bg-teal-50 text-teal-900 border-teal-200' : 'bg-amber-50 text-amber-900 border-amber-200'}`}>
                                    {m.direction === 'in' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                    {m.direction === 'in' ? 'IN' : 'OUT'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 font-bold text-[#111827]">
                                  {m.direction === 'out' && m.bookingId ? (
                                    <button onClick={() => go(() => openBooking(m.bookingId!, m.dispatchId))} className="hover:text-teal-800 hover:underline">{m.reference}</button>
                                  ) : (
                                    m.reference
                                  )}
                                  {m.bookingNumber && <span className="block text-[10px] text-[#8E9299] font-normal">{m.bookingNumber}</span>}
                                </td>
                                <td className="py-2.5 px-4 font-sans">
                                  {m.direction === 'in' && m.supplierId ? (
                                    <button onClick={() => go(() => setSelectedSupplierId(m.supplierId!))} className="flex items-center gap-1 text-[#111827] hover:text-teal-800 hover:underline"><Building className="w-3 h-3 text-[#8E9299]" />{m.supplierName}</button>
                                  ) : m.customerId ? (
                                    <button onClick={() => go(() => setSelectedCustomerId(m.customerId!))} className="flex items-center gap-1 text-[#111827] hover:text-teal-800 hover:underline"><User className="w-3 h-3 text-[#8E9299]" />{m.customerName}</button>
                                  ) : '—'}
                                </td>
                                <td className={`py-2.5 px-4 text-right font-bold ${m.direction === 'in' ? 'text-teal-800' : 'text-amber-800'}`}>{m.direction === 'in' ? '+' : '−'}{formatKg(m.kg)}</td>
                                <td className="py-2.5 px-4 text-right text-[#111827]">{formatCurrency(m.amount)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'bookings' && (
                <div className="space-y-3">
                  {productBookings.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-[#E5E5E1] py-10 text-center text-xs text-[#8E9299]">No bookings for this product.</div>
                  ) : (
                    productBookings.map((b) => {
                      const cust = customers.find((c) => c.id === b.customerId);
                      const progress = b.totalKg > 0 ? (b.dispatchedKg / b.totalKg) * 100 : 0;
                      return (
                        <button key={b.id} onClick={() => go(() => openBooking(b.id))} className="w-full text-left bg-white p-4 rounded-2xl border border-[#E5E5E1] hover:border-teal-600/50 shadow-xs flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <ShoppingBag className="w-4 h-4 text-teal-700 shrink-0" />
                              <span className="text-sm font-bold font-mono text-[#111827]">{b.bookingNumber}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${b.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-100 text-teal-800'}`}>{b.status}</span>
                            </div>
                            <div className="text-xs text-[#6B7280] mt-0.5 truncate">{cust?.name} • {formatKg(b.totalKg)} @ Rs. {b.pricePerKg}/kg • {formatDate(b.createdAt)}</div>
                            <div className="w-40 h-1.5 bg-[#E5E5E1] rounded-full overflow-hidden mt-2"><div className="h-full bg-teal-600" style={{ width: `${progress}%` }} /></div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-mono font-bold text-[#111827]">{formatCurrency(b.totalAmount)}</div>
                            <div className="text-[11px] text-amber-800 font-mono">Rem: {formatKg(b.remainingKg)}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteId)}
        title="Delete this price point?"
        message="It will be removed from the history and from the year-over-year comparisons."
        confirmLabel="Delete Point"
        onConfirm={() => {
          if (pendingDeleteId) deletePricePoint(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
};
