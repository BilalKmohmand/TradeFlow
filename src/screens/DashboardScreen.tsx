import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Truck,
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  MessageSquare,
  Clock,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Plus,
  ArrowRight,
  Package,
  PackagePlus,
  Building,
  User,
  Scale,
  Bell,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate, formatNumber } from '../utils/formatters';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { buildMovements, groupByDay, shiftDate } from '../utils/stockFlow';
import { computeMonthlyPnL, currentMonthKey } from '../utils/finance';
import { computeAlerts } from '../utils/alerts';

interface DashboardScreenProps {
  onOpenDispatch: (bookingId?: string) => void;
  onOpenBooking: () => void;
  onOpenCustomer: (customerId: string) => void;
  onOpenWhatsAppDrawer: () => void;
  onReceiveStock: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onOpenDispatch,
  onOpenBooking,
  onOpenCustomer,
  onOpenWhatsAppDrawer,
  onReceiveStock,
}) => {
  const {
    customers,
    suppliers,
    products,
    bookings,
    dispatches,
    purchases,
    whatsappMessages,
    openBooking,
    openReports,
    openOps,
    setSelectedSupplierId,
    setSelectedProductId,
    expenses,
    trucks,
    ledger,
    can,
    currentUser,
  } = useTrading();

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Today's dispatches
  const todayDispatches = dispatches.filter((d) => d.date === todayStr);
  const todayDispatchedKg = todayDispatches.reduce((acc, d) => acc + d.kg, 0);
  const todayDispatchedValue = todayDispatches.reduce((acc, d) => acc + d.amount, 0);

  // 2. Pending bookings (remaining kg)
  const activeBookings = bookings.filter((b) => b.status === 'active' && b.remainingKg > 0);
  const totalPendingKg = activeBookings.reduce((acc, b) => acc + b.remainingKg, 0);
  const totalPendingValue = activeBookings.reduce(
    (acc, b) => acc + b.remainingKg * b.pricePerKg,
    0
  );

  // 3. Receivables & Payables
  const totalReceivables = customers.reduce((acc, c) => acc + c.totalDue, 0);
  const totalPayables = suppliers.reduce((acc, s) => acc + s.totalOwed, 0);

  // 4. Stock movements: incoming purchases vs outgoing dispatches
  const movements = useMemo(
    () => buildMovements(purchases, dispatches, { customers, suppliers, products, bookings }),
    [purchases, dispatches, customers, suppliers, products, bookings]
  );
  const last7 = useMemo(() => groupByDay(movements, shiftDate(todayStr, -6), todayStr), [movements, todayStr]);
  const todayFlow = last7.find((d) => d.date === todayStr) || { inKg: 0, inAmount: 0, outKg: 0, outAmount: 0, netKg: 0, movements: [] };
  const recentMovements = movements.slice(0, 6);

  // Month-to-date P&L and live alerts
  const pnl = useMemo(() => computeMonthlyPnL(currentMonthKey(), dispatches, purchases, expenses, products), [dispatches, purchases, expenses, products]);
  const alerts = useMemo(() => computeAlerts({ products, customers, suppliers, bookings, trucks, ledger }, todayStr), [products, customers, suppliers, bookings, trucks, ledger, todayStr]);
  const topAlerts = alerts.slice(0, 3);
  const topCustomers = useMemo(() => {
    const m = new Map<string, number>();
    dispatches.filter((d) => d.date.startsWith(currentMonthKey())).forEach((d) => m.set(d.customerId, (m.get(d.customerId) || 0) + d.amount));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => ({ customer: customers.find((c) => c.id === id), value: v }));
  }, [dispatches, customers]);

  // Real last-7-day trend (oldest -> newest)
  const chartData = [...last7].reverse().map((d) => ({
    day: d.date === todayStr ? 'Today' : new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-PK', { weekday: 'short', timeZone: 'UTC' }),
    kg: d.outKg,
    inKg: d.inKg,
    sales: d.outAmount,
  }));

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner / Welcome with Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0 bg-white p-5 sm:p-6 lg:p-7 rounded-[32px] border border-[#E5E5E1] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Bulk Trading Operations
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif italic font-normal tracking-tight text-[#111827] mt-1.5">
            Trading Overview
          </h2>
          <p className="text-xs text-[#6B7280] mt-1">
            Automated balance calculations and instant WhatsApp confirmations active.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenBooking}
            className="px-4 py-2.5 bg-[#FAF9F6] hover:bg-[#F4F3EF] text-[#111827] font-semibold text-xs rounded-2xl border border-[#E5E5E1] flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#8E9299]" />
            <span>New Booking</span>
          </button>
          <button
            onClick={() => onOpenDispatch()}
            className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white font-bold text-xs rounded-2xl shadow-xs flex items-center gap-2 active:scale-95 transition-all border border-[#111827]"
          >
            <Truck className="w-4 h-4 text-teal-400" />
            <span>Log Dispatch</span>
          </button>
        </div>
      </div>

      {/* 4 Animated Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0">
        {/* Card 1: Today's Dispatches */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="bg-white p-6 rounded-[28px] border border-[#E5E5E1] shadow-xs hover:border-teal-600/40 transition-colors relative overflow-hidden min-w-0 flex flex-col justify-between"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Today's Dispatches
            </span>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold font-mono text-[#111827] tracking-tight">
                <AnimatedNumber value={todayDispatchedKg} format="kg" />
              </div>
              <div className="text-xs text-teal-800 font-medium font-mono mt-1.5 flex items-center gap-1">
                <span>Value:</span>
                <AnimatedNumber value={todayDispatchedValue} format="currency" />
                <span className="text-[#8E9299] font-sans font-normal">({todayDispatches.length} trucks)</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E5E5E1]/60 flex items-center justify-between">
            <span className="text-[11px] text-[#8E9299]">Daily Volume</span>
            <div className="w-8 h-8 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-teal-700 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
        </motion.div>

        {/* Card 2: Total Pending Bookings */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white p-6 rounded-[28px] border border-[#E5E5E1] shadow-xs hover:border-amber-600/40 transition-colors relative overflow-hidden min-w-0 flex flex-col justify-between"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Pending Bookings
            </span>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold font-mono text-[#111827] tracking-tight">
                <AnimatedNumber value={totalPendingKg} format="kg" />
              </div>
              <div className="text-xs text-amber-800 font-medium font-mono mt-1.5">
                <span>Contract value: </span>
                <AnimatedNumber value={totalPendingValue} format="currency" />
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E5E5E1]/60 flex items-center justify-between">
            <span className="text-[11px] text-[#8E9299]">Awaiting Haulage</span>
            <div className="w-8 h-8 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-amber-700 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
        </motion.div>

        {/* Card 3: Total Receivables */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="bg-white p-6 rounded-[28px] border border-[#E5E5E1] shadow-xs hover:border-teal-600/40 transition-colors relative overflow-hidden min-w-0 flex flex-col justify-between"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Total Receivables
            </span>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold font-mono text-teal-800 tracking-tight">
                <AnimatedNumber value={totalReceivables} format="currency" />
              </div>
              <div className="text-xs text-[#8E9299] font-medium mt-1.5">
                Across {customers.filter((c) => c.totalDue > 0).length} active customer accounts
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E5E5E1]/60 flex items-center justify-between">
            <span className="text-[11px] text-[#8E9299]">Outstanding Inflow</span>
            <div className="w-8 h-8 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-teal-700 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
        </motion.div>

        {/* Card 4: Total Payables (Owed to Suppliers) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-white p-6 rounded-[28px] border border-[#E5E5E1] shadow-xs hover:border-[#111827]/40 transition-colors relative overflow-hidden min-w-0 flex flex-col justify-between"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Total Payables (Owed)
            </span>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-bold font-mono text-[#111827] tracking-tight">
                <AnimatedNumber value={totalPayables} format="currency" />
              </div>
              <div className="text-xs text-[#8E9299] font-medium mt-1.5">
                Across {suppliers.length} primary source suppliers
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E5E5E1]/60 flex items-center justify-between">
            <span className="text-[11px] text-[#8E9299]">Mill & Plant Due</span>
            <div className="w-8 h-8 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-[#111827] flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Month-to-date finance KPIs + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-[32px] border border-[#E5E5E1] shadow-xs space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-serif italic font-normal text-2xl text-[#111827]">This Month at a Glance</h3>
              <p className="text-xs text-[#8E9299] mt-0.5">{pnl.label} • revenue, cost of goods, expenses and net profit to date</p>
            </div>
            {can('view_finance') && (
              <button onClick={() => openReports('pnl')} className="px-3.5 py-2 bg-[#FAF9F6] hover:bg-[#F4F3EF] text-[#111827] text-xs font-semibold rounded-2xl border border-[#E5E5E1] flex items-center gap-1.5 shrink-0">
                Full P&L <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-4 min-w-0">
              <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Revenue</div>
              <div className="text-lg font-bold font-mono text-[#111827] mt-1 truncate"><AnimatedNumber value={pnl.revenue} format="currency" /></div>
              <div className="text-[10px] text-[#8E9299] font-mono mt-0.5">{formatKg(pnl.soldKg)} sold</div>
            </div>
            {can('view_finance') ? (
              <>
                <div className="bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-4 min-w-0">
                  <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Gross profit</div>
                  <div className={`text-lg font-bold font-mono mt-1 truncate ${pnl.grossProfit >= 0 ? 'text-teal-800' : 'text-rose-700'}`}><AnimatedNumber value={pnl.grossProfit} format="currency" /></div>
                  <div className="text-[10px] text-[#8E9299] font-mono mt-0.5">{pnl.grossMarginPct != null ? `${pnl.grossMarginPct}% margin` : 'no sales yet'}</div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-4 min-w-0">
                  <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Expenses</div>
                  <div className="text-lg font-bold font-mono text-amber-800 mt-1 truncate"><AnimatedNumber value={pnl.expenses} format="currency" /></div>
                  <button onClick={() => openOps('expenses')} className="text-[10px] text-teal-700 font-semibold hover:underline mt-0.5">Record expense</button>
                </div>
                <div className={`rounded-2xl p-4 min-w-0 border ${pnl.netProfit >= 0 ? 'bg-[#111827] border-[#111827] text-white' : 'bg-rose-50 border-rose-200'}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-widest ${pnl.netProfit >= 0 ? 'text-[#9CA3AF]' : 'text-rose-700'}`}>Net profit</div>
                  <div className={`text-lg font-bold font-mono mt-1 truncate ${pnl.netProfit >= 0 ? 'text-teal-300' : 'text-rose-700'}`}><AnimatedNumber value={pnl.netProfit} format="currency" /></div>
                  <div className={`text-[10px] font-mono mt-0.5 ${pnl.netProfit >= 0 ? 'text-[#9CA3AF]' : 'text-rose-700'}`}>{pnl.netMarginPct != null ? `${pnl.netMarginPct}% net` : '—'}</div>
                </div>
              </>
            ) : (
              <div className="col-span-3 bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-4 text-xs text-[#6B7280] flex items-center gap-2"><Wallet className="w-4 h-4" /> Margin and profit figures are visible to managers and admins.</div>
            )}
          </div>
          {topCustomers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6B7280]">
              <span className="font-bold uppercase tracking-widest text-[10px] text-[#8E9299]">Top customers</span>
              {topCustomers.map((t, i) => t.customer && (
                <button key={t.customer.id} onClick={() => onOpenCustomer(t.customer!.id)} className="px-2.5 py-1 rounded-full bg-[#FAF9F6] border border-[#E5E5E1] hover:border-teal-600/50 font-semibold text-[#111827]">
                  {i + 1}. {t.customer.name} <span className="font-mono text-[#8E9299]">{formatCurrency(t.value)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`p-5 sm:p-6 rounded-[32px] border shadow-xs space-y-3 min-w-0 ${alerts.some((a) => a.severity === 'danger') ? 'bg-rose-50/60 border-rose-200' : 'bg-white border-[#E5E5E1]'}`}>
          <div className="flex items-center justify-between">
            <h3 className="font-serif italic font-normal text-2xl text-[#111827] flex items-center gap-2"><Bell className="w-5 h-5 text-rose-600" /> Needs Attention</h3>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${alerts.length > 0 ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-teal-50 text-teal-800 border-teal-200'}`}>{alerts.length}</span>
          </div>
          {topAlerts.length === 0 ? (
            <div className="text-xs text-[#6B7280] py-6 text-center flex flex-col items-center gap-1"><CheckCircle2 className="w-6 h-6 text-teal-600" /> All clear. Nothing overdue, late or short.</div>
          ) : (
            <div className="space-y-2">
              {topAlerts.map((a) => (
                <button key={a.id} onClick={() => openOps('alerts')} className="w-full text-left bg-white border border-[#E5E5E1] rounded-2xl p-3 hover:border-rose-300 transition-colors">
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${a.severity === 'danger' ? 'bg-rose-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-teal-500'}`} />
                    <span className="min-w-0"><span className="text-xs font-bold text-[#111827] block truncate">{a.title}</span><span className="text-[11px] text-[#6B7280] block line-clamp-2">{a.detail}</span></span>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => openOps('alerts')} className="w-full py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5">
            Open alerts centre <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
          </button>
        </div>
      </div>

      {/* Daily Incoming / Outgoing Tracker */}
      <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-[32px] border border-[#E5E5E1] shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-serif italic font-normal text-2xl text-[#111827]">Today's Stock Movement</h3>
            <p className="text-xs text-[#8E9299] mt-0.5">Incoming from suppliers vs outgoing to customers, updated as receipts and dispatches are logged</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onReceiveStock} className="px-4 py-2 bg-[#FAF9F6] hover:bg-[#F4F3EF] text-[#111827] font-semibold text-xs rounded-2xl border border-[#E5E5E1] flex items-center gap-1.5 transition-colors">
              <PackagePlus className="w-3.5 h-3.5 text-teal-700" /> Receive Stock
            </button>
            <button onClick={() => openReports('flow')} className="px-4 py-2 bg-[#111827] hover:bg-black text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-xs">
              Full Log <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-teal-50/60 border border-teal-200/70 rounded-2xl p-4">
            <div className="text-[10px] font-bold text-teal-900 uppercase tracking-widest flex items-center gap-1.5"><ArrowDownLeft className="w-3.5 h-3.5" /> Incoming today</div>
            <div className="text-xl font-bold font-mono text-teal-900 mt-1"><AnimatedNumber value={todayFlow.inKg} format="kg" /></div>
            <div className="text-[11px] text-teal-800/80 font-mono mt-0.5">{formatCurrency(todayFlow.inAmount)} • {todayFlow.movements.filter((m) => m.direction === 'in').length} receipt(s)</div>
          </div>
          <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-4">
            <div className="text-[10px] font-bold text-amber-900 uppercase tracking-widest flex items-center gap-1.5"><ArrowUpRight className="w-3.5 h-3.5" /> Outgoing today</div>
            <div className="text-xl font-bold font-mono text-amber-900 mt-1"><AnimatedNumber value={todayFlow.outKg} format="kg" /></div>
            <div className="text-[11px] text-amber-800/80 font-mono mt-0.5">{formatCurrency(todayFlow.outAmount)} • {todayFlow.movements.filter((m) => m.direction === 'out').length} dispatch(es)</div>
          </div>
          <div className="bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-4">
            <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" /> Net today</div>
            <div className={`text-xl font-bold font-mono mt-1 ${todayFlow.netKg >= 0 ? 'text-[#111827]' : 'text-rose-700'}`}>{todayFlow.netKg >= 0 ? '+' : '−'}{formatKg(Math.abs(todayFlow.netKg))}</div>
            <div className="text-[11px] text-[#6B7280] font-mono mt-0.5">Stock on hand: {formatKg(products.reduce((a, p) => a + p.stockKg, 0))}</div>
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest mb-2">Latest movements</div>
          {recentMovements.length === 0 ? (
            <div className="text-xs text-[#8E9299] bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-5 text-center">
              No stock movements yet. Log a dispatch or receive stock to start the daily log.
            </div>
          ) : (
            <div className="divide-y divide-[#F0F0EE] border border-[#E5E5E1] rounded-2xl overflow-hidden">
              {recentMovements.map((m) => (
                <div key={m.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs hover:bg-[#FAF9F6] transition-colors">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 w-fit ${m.direction === 'in' ? 'bg-teal-50 text-teal-900 border-teal-200' : 'bg-amber-50 text-amber-900 border-amber-200'}`}>
                    {m.direction === 'in' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                    {m.direction === 'in' ? 'IN' : 'OUT'}
                  </span>
                  <span className="font-mono text-[#8E9299] shrink-0 w-24">{formatDate(m.date)}</span>
                  <span className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {m.direction === 'out' && m.bookingId ? (
                      <button onClick={() => openBooking(m.bookingId!, m.dispatchId)} className="font-mono font-bold text-[#111827] hover:text-teal-800 hover:underline flex items-center gap-1"><ShoppingBag className="w-3 h-3 text-[#8E9299]" />{m.reference}</button>
                    ) : (
                      <span className="font-mono font-bold text-[#111827]">{m.reference}</span>
                    )}
                    {m.direction === 'in' && m.supplierId ? (
                      <button onClick={() => setSelectedSupplierId(m.supplierId!)} className="text-[#374151] hover:text-teal-800 hover:underline flex items-center gap-1"><Building className="w-3 h-3 text-[#8E9299]" />{m.supplierName}</button>
                    ) : m.customerId ? (
                      <button onClick={() => onOpenCustomer(m.customerId!)} className="text-[#374151] hover:text-teal-800 hover:underline flex items-center gap-1"><User className="w-3 h-3 text-[#8E9299]" />{m.customerName}</button>
                    ) : null}
                    <button onClick={() => setSelectedProductId(m.productId)} className="text-[#6B7280] hover:text-teal-800 hover:underline flex items-center gap-1"><Package className="w-3 h-3" />{m.productName}</button>
                  </span>
                  <span className="text-right font-mono shrink-0">
                    <span className={`font-bold ${m.direction === 'in' ? 'text-teal-800' : 'text-amber-800'}`}>{m.direction === 'in' ? '+' : '−'}{formatKg(m.kg)}</span>
                    <span className="block text-[10px] text-[#8E9299]">{formatCurrency(m.amount)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Quick Sales Chart + Active Bookings Quick Dispatch */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
        {/* Left 2 Cols: Minimal Clean Sales & Dispatch Chart */}
        <div className="lg:col-span-2 min-w-0 bg-white p-5 sm:p-6 lg:p-7 rounded-[32px] border border-[#E5E5E1] shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif italic font-normal text-2xl text-[#111827]">Last 7 Days: In vs Out</h3>
              <p className="text-xs text-[#8E9299] mt-0.5">Kilograms dispatched to customers and received from suppliers, with realised sales value</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-2 text-[#6B7280]">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-600" />
                Out (kg)
              </span>
              <span className="flex items-center gap-2 text-[#6B7280]">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                In (kg)
              </span>
            </div>
          </div>

          <div className="h-56 sm:h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={45}
                  tickFormatter={(v) => `${formatNumber(v)}kg`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#111827] text-white p-3 rounded-2xl shadow-xl text-xs space-y-1 border border-[#374151]">
                          <div className="font-bold text-gray-300">{label}</div>
                          <div className="text-teal-300 font-mono font-bold">
                            Out: {formatKg((payload[0]?.payload?.kg as number) || 0)}
                          </div>
                          <div className="text-amber-300 font-mono font-bold">
                            In: {formatKg((payload[0]?.payload?.inKg as number) || 0)}
                          </div>
                          <div className="text-gray-400 font-mono">
                            Sales: {formatCurrency((payload[0]?.payload?.sales as number) || 0)}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="inKg"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#amberGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="kg"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#tealGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right 1 Col: Smart WhatsApp Background Automation Activity */}
        <div className="min-w-0 bg-[#111827] text-white p-5 sm:p-6 lg:p-7 rounded-[32px] border border-[#1F2937] shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-900/50 text-teal-400 flex items-center justify-center border border-teal-700/40">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-teal-300">
                  Quiet Automation
                </span>
              </div>
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            </div>

            <h3 className="font-serif italic text-2xl text-white">Instant WhatsApp Triggers</h3>
            <p className="text-xs text-gray-300 leading-relaxed font-light">
              Every dispatch calculates remaining balance and sends an automated WhatsApp alert with invoice amount & polite settlement query.
            </p>

            {/* Mini Activity Peek */}
            <div className="space-y-2.5 pt-2">
              {whatsappMessages.slice(0, 2).map((m) => (
                <div
                  key={m.id}
                  className="bg-white/5 hover:bg-white/10 p-3.5 rounded-2xl border border-white/10 text-xs space-y-1 transition-colors"
                >
                  <div className="flex items-center justify-between text-teal-200 font-semibold">
                    <span>{m.recipientName}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{m.timestamp}</span>
                  </div>
                  <p className="text-[11px] text-gray-300 truncate font-mono">
                    {m.message.replace(/\n/g, ' ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={onOpenWhatsAppDrawer}
            className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-2xl shadow-xs flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <span>View Automation Activity</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Bookings Quick Dispatch Grid */}
      <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-[32px] border border-[#E5E5E1] shadow-xs space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif italic font-normal text-2xl text-[#111827]">Active Bookings Awaiting Dispatch</h3>
            <p className="text-xs text-[#8E9299] mt-0.5">
              Select any booking to immediately log a truck dispatch
            </p>
          </div>
          <span className="text-xs font-semibold text-teal-800 bg-[#FAF9F6] border border-[#E5E5E1] px-3 py-1.5 rounded-full">
            {activeBookings.length} Active Orders
          </span>
        </div>

        {activeBookings.length === 0 ? (
          <div className="text-center py-12 text-[#8E9299]">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-teal-600" />
            <p className="text-sm font-semibold text-[#111827]">All orders fully fulfilled!</p>
            <p className="text-xs text-[#8E9299] mt-1">Create a new booking to start shipping.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
            {activeBookings.map((b) => {
              const cust = customers.find((c) => c.id === b.customerId);
              const prod = products.find((p) => p.id === b.productId);
              const progress = (b.dispatchedKg / b.totalKg) * 100;

              return (
                <div
                  key={b.id}
                  className="min-w-0 bg-[#FAF9F6] hover:bg-white p-6 rounded-[28px] border border-[#E5E5E1] hover:border-teal-600/50 shadow-xs hover:shadow-sm transition-all space-y-4 flex flex-col justify-between group"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <button onClick={() => openBooking(b.id)} title="Open booking details" className="font-bold text-xs font-mono text-[#111827] hover:text-teal-800 hover:underline underline-offset-2 text-left">{b.bookingNumber}</button>
                      <span className="text-xs font-bold font-mono text-teal-800">
                        Rs. {b.pricePerKg}/kg
                      </span>
                    </div>

                    <div>
                      <div
                        onClick={() => cust && onOpenCustomer(cust.id)}
                        className="font-bold text-sm text-[#111827] group-hover:text-teal-800 cursor-pointer transition-colors"
                      >
                        {cust?.name}
                      </div>
                      <div className="text-xs text-[#8E9299]">{cust?.company}</div>
                    </div>

                    <div className="text-xs font-medium text-[#4B5563] flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-teal-700" />
                      <span>{prod?.name}</span>
                    </div>

                    {/* Progress Bar & Remaining kg */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-[#8E9299]">Remaining:</span>
                        <span className="font-mono font-bold text-amber-800">
                          {b.remainingKg} kg
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#E5E5E1] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-600 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-[#8E9299]">
                        <span>Dispatched: {b.dispatchedKg} kg</span>
                        <span>Total: {b.totalKg} kg</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenDispatch(b.id)}
                    className="w-full mt-2 bg-[#111827] hover:bg-black text-white font-bold text-xs py-2.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 border border-[#111827]"
                  >
                    <Truck className="w-3.5 h-3.5 text-teal-400" />
                    <span>Dispatch This Order</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
