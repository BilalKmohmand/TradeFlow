import React from 'react';
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
import { formatCurrency, formatTons, formatDate, formatNumber } from '../utils/formatters';
import { AnimatedNumber } from '../components/AnimatedNumber';

interface DashboardScreenProps {
  onOpenDispatch: (bookingId?: string) => void;
  onOpenBooking: () => void;
  onOpenCustomer: (customerId: string) => void;
  onOpenWhatsAppDrawer: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onOpenDispatch,
  onOpenBooking,
  onOpenCustomer,
  onOpenWhatsAppDrawer,
}) => {
  const {
    customers,
    suppliers,
    products,
    bookings,
    dispatches,
    whatsappMessages,
    sendWhatsAppDirect,
  } = useTrading();

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Today's dispatches
  const todayDispatches = dispatches.filter((d) => d.date === todayStr);
  const todayDispatchedTons = todayDispatches.reduce((acc, d) => acc + d.tons, 0);
  const todayDispatchedValue = todayDispatches.reduce((acc, d) => acc + d.amount, 0);

  // 2. Pending bookings (remaining tons)
  const activeBookings = bookings.filter((b) => b.status === 'active' && b.remainingTons > 0);
  const totalPendingTons = activeBookings.reduce((acc, b) => acc + b.remainingTons, 0);
  const totalPendingValue = activeBookings.reduce(
    (acc, b) => acc + b.remainingTons * b.pricePerTon,
    0
  );

  // 3. Receivables & Payables
  const totalReceivables = customers.reduce((acc, c) => acc + c.totalDue, 0);
  const totalPayables = suppliers.reduce((acc, s) => acc + s.totalOwed, 0);

  // 4. Quick sales trend chart data (last 7 days)
  const chartData = [
    { day: 'Mon', tons: 140, sales: 22400 },
    { day: 'Tue', tons: 190, sales: 31200 },
    { day: 'Wed', tons: 230, sales: 38900 },
    { day: 'Thu', tons: 160, sales: 25600 },
    { day: 'Fri', tons: 280, sales: 46200 },
    { day: 'Sat', tons: 110, sales: 18400 },
    {
      day: 'Today',
      tons: todayDispatchedTons > 0 ? todayDispatchedTons : 210,
      sales: todayDispatchedValue > 0 ? todayDispatchedValue : 34800,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner / Welcome with Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 lg:p-7 rounded-[32px] border border-[#E5E5E1] shadow-xs">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Dispatches */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="bg-white p-6 rounded-[28px] border border-[#E5E5E1] shadow-xs hover:border-teal-600/40 transition-colors relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Today's Dispatches
            </span>
            <div className="w-9 h-9 rounded-2xl bg-[#FAF9F6] border border-[#E5E5E1] text-teal-700 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#111827] tracking-tight">
              <AnimatedNumber value={todayDispatchedTons} format="tons" />
            </div>
            <div className="text-xs text-teal-800 font-medium font-mono mt-1.5 flex items-center gap-1">
              <span>Value:</span>
              <AnimatedNumber value={todayDispatchedValue} format="currency" />
              <span className="text-[#8E9299] font-sans font-normal">({todayDispatches.length} trucks)</span>
            </div>
          </div>
        </motion.div>

        {/* Card 2: Total Pending Bookings */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white p-6 rounded-[28px] border border-[#E5E5E1] shadow-xs hover:border-amber-600/40 transition-colors relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Pending Bookings
            </span>
            <div className="w-9 h-9 rounded-2xl bg-[#FAF9F6] border border-[#E5E5E1] text-amber-700 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#111827] tracking-tight">
              <AnimatedNumber value={totalPendingTons} format="tons" />
            </div>
            <div className="text-xs text-amber-800 font-medium font-mono mt-1.5">
              <span>Contract value: </span>
              <AnimatedNumber value={totalPendingValue} format="currency" />
            </div>
          </div>
        </motion.div>

        {/* Card 3: Total Receivables */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="bg-white p-6 rounded-[28px] border border-[#E5E5E1] shadow-xs hover:border-teal-600/40 transition-colors relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Total Receivables
            </span>
            <div className="w-9 h-9 rounded-2xl bg-[#FAF9F6] border border-[#E5E5E1] text-teal-700 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-teal-800 tracking-tight">
              <AnimatedNumber value={totalReceivables} format="currency" />
            </div>
            <div className="text-xs text-[#8E9299] font-medium mt-1.5">
              Across {customers.filter((c) => c.totalDue > 0).length} active customer accounts
            </div>
          </div>
        </motion.div>

        {/* Card 4: Total Payables (Owed to Suppliers) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-white p-6 rounded-[28px] border border-[#E5E5E1] shadow-xs hover:border-[#111827]/40 transition-colors relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Total Payables (Owed)
            </span>
            <div className="w-9 h-9 rounded-2xl bg-[#FAF9F6] border border-[#E5E5E1] text-[#111827] flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#111827] tracking-tight">
              <AnimatedNumber value={totalPayables} format="currency" />
            </div>
            <div className="text-xs text-[#8E9299] font-medium mt-1.5">
              Across {suppliers.length} primary source suppliers
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Grid: Quick Sales Chart + Active Bookings Quick Dispatch */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Minimal Clean Sales & Dispatch Chart */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 lg:p-7 rounded-[32px] border border-[#E5E5E1] shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif italic font-normal text-2xl text-[#111827]">Weekly Dispatch & Revenue Trend</h3>
              <p className="text-xs text-[#8E9299] mt-0.5">Daily tonnage dispatched & realized sales value</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-2 text-[#6B7280]">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-600" />
                Dispatched Tons
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
                  tickFormatter={(v) => `${formatNumber(v)}T`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#111827] text-white p-3 rounded-2xl shadow-xl text-xs space-y-1 border border-[#374151]">
                          <div className="font-bold text-gray-300">{label}</div>
                          <div className="text-teal-300 font-mono font-bold">
                            Tonnage: {payload[0]?.value} Tons
                          </div>
                          <div className="text-gray-400 font-mono">
                            Revenue: {formatCurrency((payload[0]?.payload?.sales as number) || 0)}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="tons"
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
        <div className="bg-[#111827] text-white p-5 sm:p-6 lg:p-7 rounded-[32px] border border-[#1F2937] shadow-sm flex flex-col justify-between space-y-4">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeBookings.map((b) => {
              const cust = customers.find((c) => c.id === b.customerId);
              const prod = products.find((p) => p.id === b.productId);
              const progress = (b.dispatchedTons / b.totalTons) * 100;

              return (
                <div
                  key={b.id}
                  className="bg-[#FAF9F6] hover:bg-white p-6 rounded-[28px] border border-[#E5E5E1] hover:border-teal-600/50 shadow-xs hover:shadow-sm transition-all space-y-4 flex flex-col justify-between group"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs font-mono text-[#111827]">
                        {b.bookingNumber}
                      </span>
                      <span className="text-xs font-bold font-mono text-teal-800">
                        Rs. {b.pricePerTon}/Ton
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

                    {/* Progress Bar & Remaining Tons */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-[#8E9299]">Remaining:</span>
                        <span className="font-mono font-bold text-amber-800">
                          {b.remainingTons} Tons
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#E5E5E1] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-600 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-[#8E9299]">
                        <span>Dispatched: {b.dispatchedTons} T</span>
                        <span>Total: {b.totalTons} T</span>
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
