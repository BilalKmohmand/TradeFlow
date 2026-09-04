import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3,
  Calendar,
  Download,
  Truck,
  DollarSign,
  TrendingUp,
  Package,
  Users,
  CheckCircle2,
  Trash2,
  FileSpreadsheet,
  Layers,
  ArrowUpRight,
  Activity,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useTrading } from '../context/TradingContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dispatch, ReportsTab } from '../types';
import { StockFlowPanel } from '../components/StockFlowPanel';
import { PnLPanel, AgingPanel, BalanceSheetPanel, CashBookPanel } from '../components/FinancePanels';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency, formatKg, formatDate, formatNumber } from '../utils/formatters';
import { AnimatedNumber } from '../components/AnimatedNumber';

interface ReportsScreenProps {
  onReceiveStock: () => void;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ onReceiveStock }) => {
  const {
    dispatches,
    ledger,
    bookings,
    customers,
    products,
    deleteDispatch,
    openBooking,
    setSelectedCustomerId,
    setSelectedProductId,
    requestedReportsTab,
    clearRequestedReportsTab,
    openOps,
    can,
  } = useTrading();
  const [pendingDispatch, setPendingDispatch] = useState<Dispatch | null>(null);
  const { resolvedTheme } = useTheme();

  const [reportTab, setReportTab] = useState<ReportsTab>(requestedReportsTab || 'daily');

  // Dashboard drill-downs can ask for a specific tab.
  useEffect(() => {
    if (requestedReportsTab) {
      setReportTab(requestedReportsTab);
      clearRequestedReportsTab();
    }
  }, [requestedReportsTab, clearRequestedReportsTab]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-08');
  const [chartMetric, setChartMetric] = useState<'volume' | 'revenue' | 'composite'>('composite');
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  // --- Daily Rollup ---
  const dailyDispatches = useMemo(
    () => dispatches.filter((d) => d.date === selectedDate),
    [dispatches, selectedDate]
  );
  const dailyKgDispatched = dailyDispatches.reduce((acc, d) => acc + d.kg, 0);
  const dailyRevenueBilled = dailyDispatches.reduce((acc, d) => acc + d.amount, 0);

  const dailyPaymentsCollected = ledger
    .filter(
      (l) =>
        l.entityType === 'customer' &&
        l.type === 'payment_received' &&
        l.date === selectedDate
    )
    .reduce((acc, l) => acc + l.credit, 0);

  // Daily Commodity Distribution
  const dailyProductMap: Record<string, number> = {};
  dailyDispatches.forEach((d) => {
    const prod = products.find((p) => p.id === d.productId);
    const name = prod?.name || 'Other';
    dailyProductMap[name] = (dailyProductMap[name] || 0) + d.kg;
  });

  const dailyChartData = Object.keys(dailyProductMap).map((name) => ({
    name: name.split(' ')[0],
    fullName: name,
    kg: dailyProductMap[name],
  }));

  // --- Monthly Rollup ---
  const monthlyDispatches = useMemo(
    () => dispatches.filter((d) => d.date.startsWith(selectedMonth)),
    [dispatches, selectedMonth]
  );
  const monthlyKgDispatched = monthlyDispatches.reduce((acc, d) => acc + d.kg, 0);
  const monthlyRevenueBilled = monthlyDispatches.reduce((acc, d) => acc + d.amount, 0);

  const monthlyPaymentsCollected = ledger
    .filter(
      (l) =>
        l.entityType === 'customer' &&
        l.type === 'payment_received' &&
        l.date.startsWith(selectedMonth)
    )
    .reduce((acc, l) => acc + l.credit, 0);

  const collectionRate =
    monthlyRevenueBilled > 0
      ? Math.min(100, (monthlyPaymentsCollected / monthlyRevenueBilled) * 100)
      : 100;

  // Monthly breakdown by commodity
  const monthlyCommodityData = products
    .map((prod) => {
      const kg = monthlyDispatches
        .filter((d) => d.productId === prod.id)
        .reduce((acc, d) => acc + d.kg, 0);
      return {
        name: prod.name.split(' ')[0],
        fullName: prod.name,
        kg,
        value: kg * prod.unitPricePerKg,
      };
    })
    .filter((c) => c.kg > 0);

  // --- Monthly Granular Daily Trend Data for Volume Line Chart with Rich Hover States ---
  const monthlyVolumeTrendData = useMemo(() => {
    // Parse year and month
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10) || 2026;
    const month = parseInt(monthStr, 10) || 8;
    const daysInMonth = new Date(year, month, 0).getDate();

    const dataPoints: {
      day: number;
      dateKey: string;
      displayDate: string;
      kg: number;
      revenue: number;
      trucksCount: number;
      avgPricePerKg: number;
      cumulativeKg: number;
      dispatches: typeof monthlyDispatches;
    }[] = [];

    let runningCumulativeKg = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayFormatted = d < 10 ? `0${d}` : `${d}`;
      const dateKey = `${selectedMonth}-${dayFormatted}`;

      const dayDispatches = monthlyDispatches.filter((disp) => disp.date === dateKey);
      const kg = dayDispatches.reduce((sum, item) => sum + item.kg, 0);
      const revenue = dayDispatches.reduce((sum, item) => sum + item.amount, 0);
      const trucksCount = dayDispatches.length;
      const avgPricePerKg = kg > 0 ? Number((revenue / kg).toFixed(2)) : 0;

      runningCumulativeKg += kg;

      // Only format nice date label
      const dateObj = new Date(year, month - 1, d);
      const shortDayName = dateObj.toLocaleDateString('en-PK', { weekday: 'short' });
      const displayDate = `${shortDayName}, ${monthStr}/${dayFormatted}`;

      dataPoints.push({
        day: d,
        dateKey,
        displayDate,
        kg,
        revenue,
        trucksCount,
        avgPricePerKg,
        cumulativeKg: runningCumulativeKg,
        dispatches: dayDispatches,
      });
    }

    return dataPoints;
  }, [monthlyDispatches, selectedMonth]);

  // Export CSV handler for Local Bookkeeping
  const handleDownloadReport = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (reportTab === 'daily') {
      csvContent += `SARMAYA DAILY TRADING & LOGISTICS REPORT\n`;
      csvContent += `Generated Date,${selectedDate}\n`;
      csvContent += `Timestamp,${new Date().toISOString()}\n\n`;

      csvContent += `--- SUMMARY FINANCIAL METRICS ---\n`;
      csvContent += `Total Metric kg Dispatched,${dailyKgDispatched}\n`;
      csvContent += `Total Gross Sales Invoiced (Rs.),${dailyRevenueBilled}\n`;
      csvContent += `Total Cash Payments Cleared (Rs.),${dailyPaymentsCollected}\n`;
      csvContent += `Net Daily Receivable Balance Change (Rs.),${dailyRevenueBilled - dailyPaymentsCollected}\n`;
      csvContent += `Total Truck Loads Delivered,${dailyDispatches.length}\n\n`;

      csvContent += `--- DISPATCH AUDIT TRAIL ---\n`;
      csvContent += `Dispatch #,Date,Customer Name,Customer Company,Commodity,Truck / Vehicle #,Driver Phone,Quantity (kg),Unit Price (Rs./kg),Gross Billed (Rs.),WhatsApp Sent Status\n`;

      dailyDispatches.forEach((d) => {
        const cust = customers.find((c) => c.id === d.customerId);
        const prod = products.find((p) => p.id === d.productId);
        const unitPrice = d.kg > 0 ? (d.amount / d.kg).toFixed(2) : '0';
        csvContent += `"${d.dispatchNumber}","${d.date}","${cust?.name || ''}","${cust?.company || ''}","${prod?.name || ''}","${d.truckNumber}","${d.driverPhone || 'N/A'}",${d.kg},${unitPrice},${d.amount},"${d.whatsappSent ? 'SENT' : 'PENDING'}"\n`;
      });
    } else {
      csvContent += `SARMAYA MONTHLY FINANCIAL & COMMODITY ROLLUP\n`;
      csvContent += `Accounting Month,${selectedMonth}\n`;
      csvContent += `Timestamp,${new Date().toISOString()}\n\n`;

      csvContent += `--- EXECUTIVE MONTHLY SUMMARY ---\n`;
      csvContent += `Total Monthly Volume Dispatched (kg),${monthlyKgDispatched}\n`;
      csvContent += `Total Gross Revenue Billed (Rs.),${monthlyRevenueBilled}\n`;
      csvContent += `Total Payments Cleared (Rs.),${monthlyPaymentsCollected}\n`;
      csvContent += `Collection Efficiency Rate,${collectionRate.toFixed(2)}%\n`;
      csvContent += `Total Truck Trips Executed,${monthlyDispatches.length}\n\n`;

      csvContent += `--- COMMODITY SUMMARY BREAKDOWN ---\n`;
      csvContent += `Commodity Name,Category,Dispatched kg,Gross Value (Rs.)\n`;
      products.forEach((p) => {
        const kg = monthlyDispatches
          .filter((d) => d.productId === p.id)
          .reduce((acc, d) => acc + d.kg, 0);
        if (kg > 0) {
          csvContent += `"${p.name}","${p.category}",${kg},${kg * p.unitPricePerKg}\n`;
        }
      });
      csvContent += `\n`;

      csvContent += `--- DETAILED DISPATCH RECORDS FOR ${selectedMonth} ---\n`;
      csvContent += `Date,Dispatch #,Customer,Company,Commodity,Truck #,Driver Phone,Quantity (kg),Gross Invoiced (Rs.)\n`;

      monthlyDispatches.forEach((d) => {
        const cust = customers.find((c) => c.id === d.customerId);
        const prod = products.find((p) => p.id === d.productId);
        csvContent += `"${d.date}","${d.dispatchNumber}","${cust?.name || ''}","${cust?.company || ''}","${prod?.name || ''}","${d.truckNumber}","${d.driverPhone || 'N/A'}",${d.kg},${d.amount}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const fileName = `Sarmaya_${reportTab.toUpperCase()}_Report_${
      reportTab === 'daily' ? selectedDate : selectedMonth
    }.csv`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Show instant success feedback
    setDownloadSuccessToast(fileName);
    setTimeout(() => setDownloadSuccessToast(null), 4000);
  };

  const isDark = resolvedTheme === 'dark';

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification upon downloading CSV */}
      <AnimatePresence>
        {downloadSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-50 bg-teal-800 dark:bg-teal-900 text-white px-5 py-3 rounded-2xl shadow-xl border border-teal-600 flex items-center gap-3 text-xs font-semibold"
          >
            <CheckCircle2 className="w-4 h-4 text-teal-300" />
            <div>
              <div className="font-bold">Report Downloaded Successfully</div>
              <div className="text-[11px] text-teal-200 font-mono">{downloadSuccessToast}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Main Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 min-w-0 bg-white dark:bg-[#101A26] p-6 sm:p-7 rounded-[32px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] dark:text-[#94A3B8]">
              Financial Ledger & Logistics Analytics
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif italic font-normal tracking-tight text-[#111827] dark:text-white mt-1.5">
            Reports
          </h2>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1">
            Auto-rolled up trading volumes, dispatches, revenue, and collection rates.
          </p>
        </div>

        {/* Tab Selector & Prominent Download Report Button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-[#FAF9F6] dark:bg-[#162436] p-1.5 rounded-3xl sm:rounded-full border border-[#E5E5E1] dark:border-[#203248] flex flex-wrap items-center gap-1 text-xs font-bold max-w-full">
            <button
              onClick={() => setReportTab('daily')}
              className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-all ${
                reportTab === 'daily'
                  ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                  : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
              }`}
            >
              Daily Report
            </button>
            <button
              onClick={() => setReportTab('monthly')}
              className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-all ${
                reportTab === 'monthly'
                  ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                  : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
              }`}
            >
              Monthly Report
            </button>
            <button
              onClick={() => setReportTab('flow')}
              className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-all ${
                reportTab === 'flow'
                  ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                  : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
              }`}
            >
              Stock Flow
            </button>
            {can('view_finance') && (
              <>
                <button
                  onClick={() => setReportTab('pnl')}
                  className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-all ${
                    reportTab === 'pnl'
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                      : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
                  }`}
                >
                  Profit & Loss
                </button>
                <button
                  onClick={() => setReportTab('aging')}
                  className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-all ${
                    reportTab === 'aging'
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                      : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
                  }`}
                >
                  Aging
                </button>
                <button
                  onClick={() => setReportTab('balance')}
                  className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-all ${
                    reportTab === 'balance'
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                      : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
                  }`}
                >
                  Balance Sheet
                </button>
                <button
                  onClick={() => setReportTab('cashbook')}
                  className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-all ${
                    reportTab === 'cashbook'
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                      : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
                  }`}
                >
                  Cash Book
                </button>
              </>
            )}
          </div>

          {/* Prominent Download Report Button */}
          {(reportTab === 'daily' || reportTab === 'monthly') && (
          <button
            onClick={handleDownloadReport}
            title="Download CSV for local bookkeeping"
            className="px-5 py-2.5 bg-[#111827] dark:bg-white hover:bg-black dark:hover:bg-slate-100 text-white dark:text-[#111827] font-bold text-xs rounded-2xl shadow-xs flex items-center gap-2 active:scale-95 transition-all border border-[#111827] dark:border-white group"
          >
            <Download className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700 group-hover:-translate-y-0.5 transition-transform" />
            <span>Download Report</span>
            <span className="text-[10px] font-mono opacity-70 bg-white/10 dark:bg-black/10 px-1.5 py-0.5 rounded">
              .CSV
            </span>
          </button>
          )}
        </div>
      </div>

      {/* Date / Month Picker Filter */}
      {(reportTab === 'daily' || reportTab === 'monthly') && (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0 bg-white dark:bg-[#101A26] p-4 px-6 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] shadow-xs transition-colors">
        <div className="flex items-center gap-3 text-xs font-semibold text-[#111827] dark:text-[#F1F5F9]">
          <Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          <span>
            {reportTab === 'daily' ? 'Select Operational Date:' : 'Select Accounting Month:'}
          </span>
          {reportTab === 'daily' ? (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-xl px-3 py-1.5 text-xs text-[#111827] dark:text-white font-mono focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
            />
          ) : (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-xl px-3 py-1.5 text-xs text-[#111827] dark:text-white font-mono focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
            />
          )}
        </div>

        <span className="text-xs text-[#8E9299] dark:text-[#64748B] font-mono flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          Real-time reconciliation • Filtered Dataset
        </span>
      </div>
      )}

      {reportTab === 'pnl' && (
        <PnLPanel
          onOpenExpenses={() => openOps('expenses')}
          onDownload={(fileName) => {
            setDownloadSuccessToast(fileName);
            setTimeout(() => setDownloadSuccessToast(null), 4000);
          }}
        />
      )}

      {reportTab === 'cashbook' && (
        <CashBookPanel
          onDownload={(fileName) => {
            setDownloadSuccessToast(fileName);
            setTimeout(() => setDownloadSuccessToast(null), 4000);
          }}
        />
      )}

      {reportTab === 'balance' && (
        <BalanceSheetPanel
          onDownload={(fileName) => {
            setDownloadSuccessToast(fileName);
            setTimeout(() => setDownloadSuccessToast(null), 4000);
          }}
        />
      )}

      {reportTab === 'aging' && (
        <AgingPanel
          onDownload={(fileName) => {
            setDownloadSuccessToast(fileName);
            setTimeout(() => setDownloadSuccessToast(null), 4000);
          }}
        />
      )}

      {/* STOCK FLOW VIEW */}
      {reportTab === 'flow' && (
        <StockFlowPanel
          onReceiveStock={onReceiveStock}
          onDownload={(fileName) => {
            setDownloadSuccessToast(fileName);
            setTimeout(() => setDownloadSuccessToast(null), 4000);
          }}
        />
      )}

      {reportTab === 'daily' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0">
            <div className="min-w-0 bg-white dark:bg-[#101A26] p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] dark:text-[#94A3B8]">
                Dispatched Today
              </span>
              <div className="text-3xl font-extrabold font-mono text-[#111827] dark:text-white mt-2">
                <AnimatedNumber value={dailyKgDispatched} format="kg" />
              </div>
              <div className="text-xs text-[#8E9299] dark:text-[#64748B] mt-1">
                {dailyDispatches.length} truck dispatches logged
              </div>
            </div>

            <div className="min-w-0 bg-white dark:bg-[#101A26] p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] dark:text-[#94A3B8]">
                Billed Sales Value
              </span>
              <div className="text-3xl font-extrabold font-mono text-teal-800 dark:text-teal-400 mt-2">
                <AnimatedNumber value={dailyRevenueBilled} format="currency" />
              </div>
              <div className="text-xs text-[#8E9299] dark:text-[#64748B] mt-1">
                Invoiced automatically upon dispatch
              </div>
            </div>

            <div className="min-w-0 bg-white dark:bg-[#101A26] p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] dark:text-[#94A3B8]">
                Payments Collected
              </span>
              <div className="text-3xl font-extrabold font-mono text-[#111827] dark:text-white mt-2">
                <AnimatedNumber value={dailyPaymentsCollected} format="currency" />
              </div>
              <div className="text-xs text-[#8E9299] dark:text-[#64748B] mt-1">
                Cleared to customer ledgers
              </div>
            </div>
          </div>

          {/* Daily Dispatches Table */}
          <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs overflow-hidden">
            <div className="p-6 border-b border-[#E5E5E1] dark:border-[#203248] flex items-center justify-between">
              <div>
                <h3 className="font-serif italic text-xl font-normal text-[#111827] dark:text-white">
                  Daily Dispatch Log ({formatDate(selectedDate)})
                </h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5">
                  Truck deliveries, drivers, and automated WhatsApp alert status
                </p>
              </div>
              <span className="text-xs font-semibold font-mono bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#111827] dark:text-[#F1F5F9] px-3 py-1 rounded-full">
                {dailyDispatches.length} Loads
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[#8E9299] dark:text-[#94A3B8] font-bold uppercase tracking-wider text-[10px] border-b border-[#E5E5E1] dark:border-[#203248]">
                  <tr>
                    <th className="py-3.5 px-6">Dispatch #</th>
                    <th className="py-3.5 px-6">Customer & Site</th>
                    <th className="py-3.5 px-6">Commodity</th>
                    <th className="py-3.5 px-6">Truck / Driver</th>
                    <th className="py-3.5 px-6 text-right">Quantity</th>
                    <th className="py-3.5 px-6 text-right">Amount</th>
                    <th className="py-3.5 px-6 text-center">Delivery</th>
                    <th className="py-3.5 px-6 text-center">WhatsApp Alert</th>
                    <th className="py-3.5 px-4 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0EE] dark:divide-[#1E2E40] font-mono">
                  {dailyDispatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#8E9299] dark:text-[#64748B] font-sans">
                        No dispatches logged for {selectedDate}.
                      </td>
                    </tr>
                  ) : (
                    dailyDispatches.map((d) => {
                      const cust = customers.find((c) => c.id === d.customerId);
                      const prod = products.find((p) => p.id === d.productId);
                      return (
                        <tr
                          key={d.id}
                          className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors"
                        >
                          <td className="py-3.5 px-6 font-bold text-[#111827] dark:text-white">
                            <button onClick={() => openBooking(d.bookingId, d.id)} title="Open booking" className="hover:text-teal-700 hover:underline underline-offset-2">
                              {d.dispatchNumber}
                            </button>
                          </td>
                          <td className="py-3.5 px-6 font-sans">
                            <button onClick={() => cust && setSelectedCustomerId(cust.id)} className="font-semibold text-[#111827] dark:text-white hover:text-teal-700 hover:underline underline-offset-2 text-left">
                              {cust?.name}
                            </button>
                            <div className="text-[11px] text-[#8E9299] dark:text-[#94A3B8]">
                              {cust?.company}
                            </div>
                          </td>
                          <td className="py-3.5 px-6 font-sans text-[#4B5563] dark:text-[#CBD5E1]">
                            <button onClick={() => prod && setSelectedProductId(prod.id)} className="hover:text-teal-700 hover:underline underline-offset-2 text-left">
                              {prod?.name}
                            </button>
                          </td>
                          <td className="py-3.5 px-6 text-[#4B5563] dark:text-[#CBD5E1]">
                            <div className="font-bold text-[#111827] dark:text-white">
                              {d.truckNumber}
                            </div>
                            {d.driverPhone && (
                              <div className="text-[10px] text-[#8E9299] dark:text-[#94A3B8]">
                                {d.driverPhone}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-6 text-right font-bold text-[#111827] dark:text-white">
                            {d.kg} kg
                          </td>
                          <td className="py-3.5 px-6 text-right font-bold text-teal-800 dark:text-teal-400">
                            {formatCurrency(d.amount)}
                          </td>
                          <td className="py-3.5 px-6 text-center font-sans">
                            {(d.status ?? 'in_transit') === 'delivered' ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-900 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 px-2.5 py-0.5 rounded-full border border-teal-200/80">Delivered</span>
                            ) : (
                              <button onClick={() => openBooking(d.bookingId, d.id)} className="text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 rounded-full border border-amber-200/80 hover:bg-amber-100">In transit</button>
                            )}
                          </td>
                          <td className="py-3.5 px-6 text-center font-sans">
                            {d.whatsappSent ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-teal-900 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 px-2.5 py-0.5 rounded-full border border-teal-200/80 dark:border-teal-800/60">
                                <CheckCircle2 className="w-3 h-3 text-teal-700 dark:text-teal-400" />
                                <span>Sent</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-[#8E9299]">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {can('delete_records') && (<button
                              type="button"
                              onClick={() => setPendingDispatch(d)}
                              title="Delete dispatch (admin)"
                              className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MONTHLY REPORT VIEW */}
      {reportTab === 'monthly' && (
        <div className="space-y-6">
          {/* 4 Key Monthly Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0">
            <div className="min-w-0 bg-white dark:bg-[#101A26] p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] dark:text-[#94A3B8]">
                Monthly Volume
              </span>
              <div className="text-3xl font-extrabold font-mono text-[#111827] dark:text-white mt-2">
                <AnimatedNumber value={monthlyKgDispatched} format="kg" />
              </div>
              <div className="text-xs text-[#8E9299] dark:text-[#64748B] mt-1">
                Across {monthlyDispatches.length} total dispatches
              </div>
            </div>

            <div className="min-w-0 bg-white dark:bg-[#101A26] p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] dark:text-[#94A3B8]">
                Monthly Gross Billed
              </span>
              <div className="text-3xl font-extrabold font-mono text-teal-800 dark:text-teal-400 mt-2">
                <AnimatedNumber value={monthlyRevenueBilled} format="currency" />
              </div>
              <div className="text-xs text-[#8E9299] dark:text-[#64748B] mt-1">
                Total recognized sales
              </div>
            </div>

            <div className="min-w-0 bg-white dark:bg-[#101A26] p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] dark:text-[#94A3B8]">
                Monthly Collections
              </span>
              <div className="text-3xl font-extrabold font-mono text-[#111827] dark:text-white mt-2">
                <AnimatedNumber value={monthlyPaymentsCollected} format="currency" />
              </div>
              <div className="text-xs text-[#8E9299] dark:text-[#64748B] mt-1">
                Deposits & cleared wires
              </div>
            </div>

            <div className="min-w-0 bg-white dark:bg-[#101A26] p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] dark:text-[#94A3B8]">
                Collection Efficiency
              </span>
              <div className="text-3xl font-extrabold font-mono text-teal-700 dark:text-teal-400 mt-2">
                {collectionRate.toFixed(1)}%
              </div>
              <div className="text-xs text-[#8E9299] dark:text-[#64748B] mt-1">
                Cashflow stability index
              </div>
            </div>
          </div>

          {/* ENHANCED MONTHLY TRADING VOLUME CHART WITH GRANULAR HOVER STATES */}
          <div className="min-w-0 bg-white dark:bg-[#101A26] p-6 sm:p-7 rounded-[32px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E5E5E1] dark:border-[#203248]">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] dark:text-[#94A3B8]">
                    Timeline Volumetric Analysis
                  </span>
                </div>
                <h3 className="font-serif italic text-2xl font-normal text-[#111827] dark:text-white mt-1">
                  Monthly Trading Volume & Revenue Progression
                </h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  Interactive hover inspection: Mouse over any point along the line to inspect granular volume, gross billing, average price per kg, and truck counts.
                </p>
              </div>

              {/* View Metric Toggles */}
              <div className="flex items-center gap-1.5 bg-[#FAF9F6] dark:bg-[#162436] p-1.5 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold self-start sm:self-auto">
                <button
                  onClick={() => setChartMetric('composite')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    chartMetric === 'composite'
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                      : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
                  }`}
                >
                  Volume & Revenue
                </button>
                <button
                  onClick={() => setChartMetric('volume')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    chartMetric === 'volume'
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                      : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
                  }`}
                >
                  kg Only
                </button>
                <button
                  onClick={() => setChartMetric('revenue')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    chartMetric === 'revenue'
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                      : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
                  }`}
                >
                  Revenue (Rs.)
                </button>
              </div>
            </div>

            {/* Interactive Line Chart Canvas */}
            <div className="h-80 sm:h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthlyVolumeTrendData}
                  margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="volumeTealGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="revenueBlueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#203248' : '#EAEAE6'}
                    vertical={false}
                  />

                  <XAxis
                    dataKey="day"
                    stroke={isDark ? '#94A3B8' : '#8E9299'}
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: isDark ? '#203248' : '#E5E5E1' }}
                    tickFormatter={(val) => `${val}`}
                  />

                  {/* Left YAxis: Volume (kg) */}
                  {(chartMetric === 'composite' || chartMetric === 'volume') && (
                    <YAxis
                      yAxisId="left"
                      stroke={isDark ? '#94A3B8' : '#8E9299'}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={45}
                      tickFormatter={(v) => `${formatNumber(v)}kg`}
                    />
                  )}

                  {/* Right YAxis: Revenue ($) */}
                  {(chartMetric === 'composite' || chartMetric === 'revenue') && (
                    <YAxis
                      yAxisId="right"
                      orientation={chartMetric === 'composite' ? 'right' : 'left'}
                      stroke={isDark ? '#94A3B8' : '#8E9299'}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                      tickFormatter={(v) => `Rs. ${(v / 1000).toFixed(0)}k`}
                    />
                  )}

                  {/* GRANULAR INTERACTIVE TOOLTIP */}
                  <Tooltip
                    cursor={{
                      stroke: '#0d9488',
                      strokeWidth: 1.5,
                      strokeDasharray: '4 4',
                    }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as (typeof monthlyVolumeTrendData)[0];
                        return (
                          <div className="bg-[#111827] dark:bg-[#090F17] text-white p-4 rounded-2xl shadow-2xl border border-[#374151] dark:border-[#203248] text-xs space-y-2.5 max-w-xs min-w-[240px]">
                            {/* Tooltip Header */}
                            <div className="flex items-center justify-between border-b border-gray-700/80 pb-2">
                              <span className="font-bold text-teal-300 font-mono text-sm">
                                {data.displayDate}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 bg-teal-900/60 text-teal-300 rounded-full border border-teal-700">
                                {data.trucksCount} {data.trucksCount === 1 ? 'Dispatch' : 'Dispatches'}
                              </span>
                            </div>

                            {/* Granular Metrics */}
                            <div className="space-y-1.5 font-mono">
                              <div className="flex items-center justify-between">
                                <span className="text-[#9CA3AF] flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full bg-teal-400 inline-block" />
                                  Daily Volume:
                                </span>
                                <span className="font-extrabold text-white text-sm">
                                  {data.kg} kg
                                </span>
                              </div>

                              <div className="flex items-center justify-between">
                                <span className="text-[#9CA3AF] flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                                  Gross Revenue:
                                </span>
                                <span className="font-extrabold text-teal-300">
                                  {formatCurrency(data.revenue)}
                                </span>
                              </div>

                              {data.kg > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-[#9CA3AF]">Average Rs./kg:</span>
                                  <span className="font-bold text-white">
                                    Rs. {data.avgPricePerKg}/kg
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center justify-between border-t border-gray-800 pt-1.5 text-[11px]">
                                <span className="text-[#9CA3AF]">Cumulative MTD:</span>
                                <span className="text-gray-300 font-bold">
                                  {data.cumulativeKg} kg
                                </span>
                              </div>
                            </div>

                            {/* Individual Loads if any */}
                            {data.dispatches.length > 0 && (
                              <div className="pt-2 border-t border-gray-800">
                                <div className="text-[10px] uppercase font-bold text-[#9CA3AF] mb-1">
                                  Logged Dispatches:
                                </div>
                                <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                                  {data.dispatches.map((disp) => {
                                    const cust = customers.find((c) => c.id === disp.customerId);
                                    const prod = products.find((p) => p.id === disp.productId);
                                    return (
                                      <div
                                        key={disp.id}
                                        className="text-[10px] bg-gray-800/80 px-2 py-1 rounded-lg flex items-center justify-between"
                                      >
                                        <span className="truncate max-w-[120px] text-gray-200">
                                          {disp.truckNumber} • {cust?.name}
                                        </span>
                                        <span className="text-teal-300 font-mono font-bold">
                                          {disp.kg}kg ({formatCurrency(disp.amount)})
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* Volume Area & Line */}
                  {(chartMetric === 'composite' || chartMetric === 'volume') && (
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="kg"
                      name="Daily Volume (kg)"
                      stroke="#0d9488"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#volumeTealGradient)"
                      activeDot={{
                        r: 7,
                        stroke: '#0d9488',
                        strokeWidth: 3,
                        fill: isDark ? '#101A26' : '#FFFFFF',
                      }}
                      dot={{
                        r: 3,
                        fill: '#0d9488',
                        stroke: isDark ? '#101A26' : '#FFFFFF',
                        strokeWidth: 1.5,
                      }}
                    />
                  )}

                  {/* Revenue Line */}
                  {(chartMetric === 'composite' || chartMetric === 'revenue') && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="revenue"
                      name="Gross Revenue (Rs.)"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={{
                        r: 6,
                        stroke: '#0284c7',
                        strokeWidth: 2,
                        fill: '#FFFFFF',
                      }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Commodity Volume Breakdown Chart & Customer Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
            <div className="bg-white dark:bg-[#101A26] p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs space-y-4">
              <div>
                <h3 className="font-serif italic text-xl font-normal text-[#111827] dark:text-white">
                  Monthly Commodity Volume Distribution
                </h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  Volume sold per commodity in kg
                </p>
              </div>

              {monthlyCommodityData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-[#8E9299] dark:text-[#64748B]">
                  No dispatch records in this month.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyCommodityData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="name"
                        stroke={isDark ? '#94A3B8' : '#8E9299'}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke={isDark ? '#94A3B8' : '#8E9299'}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={45}
                        tickFormatter={(v) => `${formatNumber(v)}kg`}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-[#111827] dark:bg-[#090F17] text-white p-3 rounded-2xl shadow-xl text-xs space-y-1 border border-[#374151] dark:border-[#203248]">
                                <div className="font-bold text-teal-300">
                                  {payload[0]?.payload?.fullName}
                                </div>
                                <div>kg: {payload[0]?.value} kg</div>
                                <div>Value: {formatCurrency((payload[0]?.payload?.value as number) || 0)}</div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="kg" fill="#0d9488" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Monthly Customer Volume Leaderboard */}
            <div className="bg-white dark:bg-[#101A26] p-6 rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs space-y-4">
              <div>
                <h3 className="font-serif italic text-xl font-normal text-[#111827] dark:text-white">
                  Customer Trading Activity
                </h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  Highest volume customers this month
                </p>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {customers.map((cust) => {
                  const custKg = monthlyDispatches
                    .filter((d) => d.customerId === cust.id)
                    .reduce((acc, d) => acc + d.kg, 0);
                  const custRevenue = monthlyDispatches
                    .filter((d) => d.customerId === cust.id)
                    .reduce((acc, d) => acc + d.amount, 0);

                  return (
                    <div
                      key={cust.id}
                      className="p-3.5 bg-[#FAF9F6] dark:bg-[#162436] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-[#111827] dark:text-white">{cust.name}</div>
                        <div className="text-[11px] text-[#8E9299] dark:text-[#94A3B8]">
                          {cust.company}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-bold text-teal-800 dark:text-teal-400">
                          {custKg} kg
                        </div>
                        <div className="text-[11px] text-[#8E9299] dark:text-[#94A3B8]">
                          {formatCurrency(custRevenue)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingDispatch)}
        title={`Delete dispatch ${pendingDispatch?.dispatchNumber ?? ''}?`}
        message="The dispatch will be permanently removed from this device and the cloud database."
        details={[
          `${pendingDispatch?.kg ?? 0} kg is returned to warehouse stock and to the booking's remaining balance.`,
          pendingDispatch?.paymentReceivedImmediately
            ? 'The immediate payment recorded with it is reversed on the booking.'
            : `${formatCurrency(pendingDispatch?.amount ?? 0)} is removed from the customer's outstanding balance.`,
          'Matching ledger rows and the WhatsApp alert are removed.',
        ]}
        confirmLabel="Delete Dispatch"
        onConfirm={() => {
          if (pendingDispatch) deleteDispatch(pendingDispatch.id);
          setPendingDispatch(null);
        }}
        onCancel={() => setPendingDispatch(null)}
      />
    </div>
  );
};
