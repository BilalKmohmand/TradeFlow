import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  User,
  Package,
  Truck,
  Calendar,
  Trash2,
  CreditCard,
  ArrowUpRight,
  Pencil,
  Ban,
  FileText,
  Printer,
  Layers,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate } from '../utils/formatters';
import { dispatchBilledTotal } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { useEscape } from '../hooks/useEscape';

interface BookingDetailModalProps {
  bookingId: string | null;
  highlightDispatchId?: string | null;
  onClose: () => void;
  onOpenDispatchForBooking?: (bookingId: string, bookingItemId?: string) => void;
}

/** Full booking view: multi-item contract, customer/product links, line-item fulfillment, every dispatch under it and the ledger rows it produced. */
export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({
  bookingId,
  highlightDispatchId,
  onClose,
  onOpenDispatchForBooking,
}) => {
  const {
    bookings,
    customers,
    products,
    dispatches,
    ledger,
    setSelectedCustomerId,
    setSelectedProductId,
    deleteBooking,
    deleteDispatch,
    cancelBooking,
    setEditRequest,
    setPrintRequest,
    can,
    markDelivered,
    reopenDispatch,
    expenses,
    isFieldVisible,
  } = useTrading();
  const showTax = isFieldVisible('tax_details');
  const [deliverId, setDeliverId] = useState<string | null>(null);
  const [receivedBy, setReceivedBy] = useState('');
  const [podNote, setPodNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pendingDispatchId, setPendingDispatchId] = useState<string | null>(null);
  useEscape(Boolean(bookingId) && !confirmDelete && !confirmCancel && !pendingDispatchId, onClose);

  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) return null;

  const customer = customers.find((c) => c.id === booking.customerId);
  const primaryProduct = products.find((p) => p.id === booking.productId);

  // Normalize multi-item list
  const bookingItems = (booking.items && booking.items.length > 0)
    ? booking.items
    : [
        {
          id: 'legacy-single-item',
          productId: booking.productId,
          productName: primaryProduct?.name,
          totalKg: booking.totalKg,
          dispatchedKg: booking.dispatchedKg,
          remainingKg: booking.remainingKg,
          pricePerKg: booking.pricePerKg,
          totalAmount: booking.totalAmount,
        },
      ];

  const bookingDispatches = dispatches
    .filter((d) => d.bookingId === booking.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const refs = new Set<string>([booking.bookingNumber, booking.id]);
  bookingDispatches.forEach((d) => {
    refs.add(d.dispatchNumber);
    refs.add(`PAY-${d.dispatchNumber}`);
  });
  const bookingLedger = ledger.filter((l) => refs.has(l.referenceId));
  const progress = booking.totalKg > 0 ? (booking.dispatchedKg / booking.totalKg) * 100 : 0;
  const balanceDue = Math.max(0, booking.totalAmount - booking.paidAmount);
  const pendingDispatch = pendingDispatchId ? bookingDispatches.find((d) => d.id === pendingDispatchId) : undefined;

  const go = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            className="relative bg-white dark:bg-[#101A26] rounded-3xl max-w-5xl w-full shadow-2xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden z-10 my-8 max-h-[92vh] flex flex-col"
          >
            {/* Header */}
            <div className="p-6 sm:p-7 bg-[#111827] dark:bg-[#0B131E] text-white flex items-start justify-between gap-4 shrink-0">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/10 text-teal-400 border border-white/10 uppercase tracking-widest">
                    Sales Contract
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      booking.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : booking.status === 'cancelled'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {booking.status}
                  </span>
                  <span className="text-xs text-[#9CA3AF] flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(booking.createdAt)}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-teal-950/60 border border-teal-800 text-teal-300">
                    {bookingItems.length} {bookingItems.length === 1 ? 'Commodity Item' : 'Commodity Items'}
                  </span>
                </div>

                <h2 className="text-xl sm:text-3xl font-serif italic text-white font-mono whitespace-nowrap">
                  {booking.bookingNumber}
                </h2>

                <div className="flex items-center gap-4 text-xs flex-wrap">
                  {customer && (
                    <button
                      onClick={() => go(() => setSelectedCustomerId(customer.id))}
                      className="text-[#D1D5DB] hover:text-white flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <User className="w-3.5 h-3.5 text-teal-400" /> {customer.name} • {customer.company}
                    </button>
                  )}

                  {/* List of distinct products */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {Array.from(new Set(bookingItems.map((it) => it.productId))).map((pId) => {
                      const prod = products.find((p) => p.id === pId);
                      return prod ? (
                        <button
                          key={pId}
                          onClick={() => go(() => setSelectedProductId(prod.id))}
                          className="text-[#D1D5DB] hover:text-white flex items-center gap-1 hover:underline cursor-pointer bg-white/5 px-2 py-0.5 rounded-lg border border-white/10"
                        >
                          <Package className="w-3 h-3 text-teal-400" /> {prod.name}
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setPrintRequest({ type: 'booking', bookingId: booking.id })}
                  title="Print Sales Contract"
                  className="text-[#9CA3AF] hover:text-teal-400 p-2 rounded-2xl hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Printer className="w-5 h-5" />
                </button>
                <button
                  onClick={() => go(() => setEditRequest({ type: 'booking', id: booking.id }))}
                  title="Edit booking & items"
                  className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Pencil className="w-5 h-5" />
                </button>
                {booking.status === 'active' && (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    title="Cancel booking"
                    className="text-[#9CA3AF] hover:text-amber-300 p-2 rounded-2xl hover:bg-amber-500/10 transition-colors cursor-pointer"
                  >
                    <Ban className="w-5 h-5" />
                  </button>
                )}
                {can('delete_records') && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    title="Delete booking (admin)"
                    className="text-[#9CA3AF] hover:text-rose-400 p-2 rounded-2xl hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6 bg-[#FAF9F6] dark:bg-[#0B131E]">
              {/* Overall Contract Quantities & Financial Card */}
              <div className="bg-white dark:bg-[#101A26] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-5 shadow-xs space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-[#8E9299] dark:text-[#94A3B8] uppercase tracking-wider font-bold">
                      Total Contract
                    </div>
                    <div className="text-sm font-bold text-[#111827] dark:text-white font-mono mt-0.5">
                      {formatKg(booking.totalKg)}
                    </div>
                  </div>
                  <div className="border-x border-[#E5E5E1] dark:border-[#203248]">
                    <div className="text-[10px] text-teal-800 dark:text-teal-300 uppercase tracking-wider font-bold">
                      Dispatched
                    </div>
                    <div className="text-sm font-bold text-teal-800 dark:text-teal-300 font-mono mt-0.5">
                      {formatKg(booking.dispatchedKg)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-amber-800 dark:text-amber-300 uppercase tracking-wider font-bold">
                      Remaining
                    </div>
                    <div className="text-sm font-bold text-amber-800 dark:text-amber-300 font-mono mt-0.5">
                      {formatKg(booking.remainingKg)}
                    </div>
                  </div>
                </div>

                <div className="w-full h-2 bg-[#E5E5E1] dark:bg-[#203248] rounded-full overflow-hidden">
                  <div className="h-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                  <div>
                    <span className="text-[#8E9299] dark:text-[#94A3B8] block text-[10px] uppercase font-bold tracking-wider">
                      Contract Value
                    </span>
                    <span className="font-mono font-bold text-[#111827] dark:text-white">
                      {formatCurrency(booking.totalAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8E9299] dark:text-[#94A3B8] block text-[10px] uppercase font-bold tracking-wider">
                      Total Paid
                    </span>
                    <span className="font-mono font-bold text-teal-800 dark:text-teal-300">
                      {formatCurrency(booking.paidAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8E9299] dark:text-[#94A3B8] block text-[10px] uppercase font-bold tracking-wider">
                      Balance Due
                    </span>
                    <span className="font-mono font-bold text-amber-800 dark:text-amber-300">
                      {formatCurrency(balanceDue)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8E9299] dark:text-[#94A3B8] block text-[10px] uppercase font-bold tracking-wider">
                      Fulfillment
                    </span>
                    <span className="font-mono font-bold text-[#111827] dark:text-white">
                      {progress.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {booking.notes && (
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] italic bg-[#FAF9F6] dark:bg-[#162436] p-3 rounded-xl border border-[#E5E5E1] dark:border-[#203248]">
                    "{booking.notes}"
                  </p>
                )}

                {booking.status === 'cancelled' && (
                  <p className="text-xs text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-900/60">
                    Cancelled{booking.cancelledAt ? ` on ${formatDate(booking.cancelledAt)}` : ''}
                    {booking.cancelReason ? `: ${booking.cancelReason}` : ''}. {formatKg(booking.remainingKg)} was never dispatched.
                  </p>
                )}

                {booking.brokerName && (
                  <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] font-mono">
                    Broker: {booking.brokerName}
                    {booking.brokerCommissionPerKg
                      ? ` @ Rs. ${booking.brokerCommissionPerKg}/kg (${formatCurrency(booking.dispatchedKg * booking.brokerCommissionPerKg)} accrued)`
                      : ''}
                  </p>
                )}

                {booking.targetDeliveryDate && (
                  <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] font-mono">
                    Target delivery: {formatDate(booking.targetDeliveryDate)}
                  </p>
                )}

                {booking.remainingKg > 0 && onOpenDispatchForBooking && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => go(() => onOpenDispatchForBooking(booking.id))}
                      className="px-4 py-2 bg-[#111827] hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      <Truck className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" />
                      Log Dispatch ({formatKg(booking.remainingKg)} remaining)
                    </button>
                  </div>
                )}
              </div>

              {/* Multi-Item Line Items Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#111827] dark:text-white uppercase tracking-widest flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    Contract Line Items ({bookingItems.length})
                  </h4>
                  <span className="text-[10px] text-[#8E9299] dark:text-[#94A3B8] font-mono">
                    Itemized fulfillment tracking
                  </span>
                </div>

                <div className="bg-white dark:bg-[#101A26] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF9F6] dark:bg-[#162436] border-b border-[#E5E5E1] dark:border-[#203248] text-[#8E9299] dark:text-[#94A3B8] uppercase tracking-widest font-bold text-[10px]">
                        <tr>
                          <th className="py-3 px-4">#</th>
                          <th className="py-3 px-4">Commodity / Item</th>
                          <th className="py-3 px-4 text-right">Booked</th>
                          <th className="py-3 px-4 text-right">Rate</th>
                          <th className="py-3 px-4 text-right">Total Amount</th>
                          <th className="py-3 px-4 text-right">Dispatched</th>
                          <th className="py-3 px-4 text-right">Remaining</th>
                          <th className="py-3 px-4 text-center">Status</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#FAF9F6] dark:divide-[#203248] font-mono">
                        {bookingItems.map((item, idx) => {
                          const prod = products.find((p) => p.id === item.productId);
                          const itemProgress = item.totalKg > 0 ? (item.dispatchedKg / item.totalKg) * 100 : 0;
                          const isItemComplete = item.remainingKg === 0;

                          return (
                            <tr key={item.id || idx} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                              <td className="py-3 px-4 font-bold text-[#8E9299]">{idx + 1}</td>
                              <td className="py-3 px-4 font-sans">
                                <div className="font-bold text-[#111827] dark:text-white flex items-center gap-1.5">
                                  {prod?.name || item.productName || 'Unknown Product'}
                                </div>
                                <div className="text-[10px] text-[#8E9299] dark:text-[#94A3B8]">
                                  {prod?.category || 'Bulk Commodity'}
                                  {item.rateOverrideReason ? ` • ${item.rateOverrideReason}` : ''}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-[#111827] dark:text-white">
                                {formatKg(item.totalKg)}
                              </td>
                              <td className="py-3 px-4 text-right text-teal-800 dark:text-teal-300 font-bold">
                                Rs. {item.pricePerKg}/kg
                              </td>
                              <td className="py-3 px-4 text-right text-[#111827] dark:text-white font-bold">
                                {formatCurrency(item.totalAmount || item.totalKg * item.pricePerKg)}
                              </td>
                              <td className="py-3 px-4 text-right text-teal-700 dark:text-teal-400">
                                {formatKg(item.dispatchedKg)}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-amber-800 dark:text-amber-300">
                                {formatKg(item.remainingKg)}
                              </td>
                              <td className="py-3 px-4 text-center font-sans">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                    isItemComplete
                                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                      : item.dispatchedKg > 0
                                      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                  }`}
                                >
                                  {isItemComplete ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3" /> Fulfilled
                                    </>
                                  ) : item.dispatchedKg > 0 ? (
                                    <>
                                      <Clock className="w-3 h-3" /> In Progress ({itemProgress.toFixed(0)}%)
                                    </>
                                  ) : (
                                    'Pending'
                                  )}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-sans">
                                {item.remainingKg > 0 && onOpenDispatchForBooking ? (
                                  <button
                                    onClick={() => go(() => onOpenDispatchForBooking(booking.id, item.id))}
                                    className="px-2.5 py-1 text-[11px] font-bold rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Truck className="w-3 h-3" />
                                    Dispatch Item
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-[#8E9299]">Completed</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Dispatches List */}
              <div>
                <h4 className="text-xs font-bold text-[#111827] dark:text-white uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                  Dispatches Under This Contract ({bookingDispatches.length})
                </h4>
                <div className="bg-white dark:bg-[#101A26] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF9F6] dark:bg-[#162436] border-b border-[#E5E5E1] dark:border-[#203248] text-[#8E9299] dark:text-[#94A3B8] uppercase tracking-widest font-bold text-[10px]">
                        <tr>
                          <th className="py-3 px-4 whitespace-nowrap">Dispatch #</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Item</th>
                          <th className="py-3 px-4">Truck</th>
                          <th className="py-3 px-4 text-right">kg</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                          <th className="py-3 px-4 text-right">Billed</th>
                          <th className="py-3 px-4 text-center">Paid</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#FAF9F6] dark:divide-[#203248] font-mono">
                        {bookingDispatches.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-8 text-center text-[#8E9299] font-sans">
                              No dispatches logged under this booking yet.
                            </td>
                          </tr>
                        ) : (
                          bookingDispatches.map((d) => {
                            const dProd = products.find((p) => p.id === d.productId);
                            return (
                              <tr
                                key={d.id}
                                className={`transition-colors ${
                                  d.id === highlightDispatchId
                                    ? 'bg-teal-50 dark:bg-teal-950/40 ring-1 ring-inset ring-teal-300'
                                    : 'hover:bg-[#FAF9F6] dark:hover:bg-[#162436]'
                                }`}
                              >
                                <td className="py-2.5 px-4 font-bold text-[#111827] dark:text-white whitespace-nowrap">
                                  {d.dispatchNumber}
                                </td>
                                <td className="py-2.5 px-4 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
                                  {formatDate(d.date)}
                                </td>
                                <td className="py-2.5 px-4 font-sans text-[#111827] dark:text-white whitespace-nowrap">
                                  {dProd?.name || primaryProduct?.name || 'Item'}
                                </td>
                                <td className="py-2.5 px-4 text-[#374151] dark:text-[#CBD5E1] whitespace-nowrap">
                                  {d.truckNumber}
                                  {d.driverPhone && (
                                    <span className="block text-[10px] text-[#8E9299]">{d.driverPhone}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-right font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap">
                                  {formatKg(d.kg)}
                                </td>
                                <td className="py-2.5 px-4 text-right text-[#111827] dark:text-white whitespace-nowrap">
                                  {formatCurrency(d.amount)}
                                </td>
                                <td className="py-2.5 px-4 text-right text-[#111827] dark:text-white whitespace-nowrap">
                                  {formatCurrency(dispatchBilledTotal(d))}
                                  {(d.taxAmount || 0) + (d.freightCharge || 0) > 0 && (
                                    <span className="block text-[10px] text-[#8E9299]">
                                      incl. {[(d.freightCharge || 0) > 0 ? 'freight' : '', (d.taxAmount || 0) > 0 ? 'tax' : ''].filter(Boolean).join(' + ')}
                                    </span>
                                  )}
                                  {(() => {
                                    const trip = expenses
                                      .filter((e) => e.dispatchId === d.id)
                                      .reduce((a, e) => a + e.amount, 0);
                                    return trip > 0 ? (
                                      <span className="block text-[10px] text-amber-700 dark:text-amber-400">
                                        trip cost {formatCurrency(trip)}
                                      </span>
                                    ) : null;
                                  })()}
                                </td>
                                <td className="py-2.5 px-4 text-center font-sans">
                                  {d.paymentReceivedImmediately ? (
                                    <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded-full">
                                      Yes
                                    </span>
                                  ) : (
                                    <span className="text-[#8E9299]">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 font-sans whitespace-nowrap">
                                  {(d.status ?? 'in_transit') === 'delivered' ? (
                                    <span className="inline-flex flex-col">
                                      <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded-full w-fit">
                                        Delivered
                                      </span>
                                      <span className="text-[10px] text-[#8E9299] mt-0.5">
                                        {d.deliveredAt ? formatDate(d.deliveredAt) : ''}
                                        {d.receivedBy ? ` • ${d.receivedBy}` : ''}
                                      </span>
                                      <button
                                        onClick={() => reopenDispatch(d.id)}
                                        className="text-[10px] text-[#8E9299] hover:text-amber-700 hover:underline text-left cursor-pointer"
                                      >
                                        reopen
                                      </button>
                                    </span>
                                  ) : (
                                    <span className="inline-flex flex-col gap-1">
                                      <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full w-fit">
                                        In transit
                                      </span>
                                      <button
                                        onClick={() => {
                                          setDeliverId(d.id);
                                          setReceivedBy('');
                                          setPodNote('');
                                        }}
                                        className="text-[10px] font-bold text-teal-800 dark:text-teal-400 hover:underline text-left cursor-pointer"
                                      >
                                        Mark delivered
                                      </button>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-right whitespace-nowrap">
                                  <button
                                    onClick={() => setPrintRequest({ type: 'invoice', dispatchId: d.id })}
                                    title="Print invoice"
                                    className="p-1.5 rounded-lg text-[#8E9299] hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setPrintRequest({ type: 'challan', dispatchId: d.id })}
                                    title="Print delivery challan"
                                    className="p-1.5 rounded-lg text-[#8E9299] hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                  {can('delete_records') && (
                                    <button
                                      onClick={() => setPendingDispatchId(d.id)}
                                      title="Delete dispatch (admin)"
                                      className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
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
              </div>

              {/* Ledger Entries */}
              <div>
                <h4 className="text-xs font-bold text-[#111827] dark:text-white uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  Ledger Entries ({bookingLedger.length})
                </h4>
                <div className="bg-white dark:bg-[#101A26] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF9F6] dark:bg-[#162436] border-b border-[#E5E5E1] dark:border-[#203248] text-[#8E9299] dark:text-[#94A3B8] uppercase tracking-widest font-bold text-[10px]">
                        <tr>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Description</th>
                          <th className="py-3 px-4 text-right">Debit</th>
                          <th className="py-3 px-4 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#FAF9F6] dark:divide-[#203248] font-mono">
                        {bookingLedger.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-[#8E9299] font-sans">
                              No ledger rows recorded for this contract.
                            </td>
                          </tr>
                        ) : (
                          bookingLedger.map((l) => (
                            <tr key={l.id} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                              <td className="py-2.5 px-4 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
                                {formatDate(l.date)}
                              </td>
                              <td className="py-2.5 px-4 font-sans text-[#111827] dark:text-white">
                                {l.description}
                              </td>
                              <td className="py-2.5 px-4 text-right text-[#111827] dark:text-white">
                                {l.debit > 0 ? formatCurrency(l.debit) : '—'}
                              </td>
                              <td className="py-2.5 px-4 text-right text-teal-700 dark:text-teal-400">
                                {l.credit > 0 ? formatCurrency(l.credit) : '—'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete booking ${booking.bookingNumber}?`}
        message="The booking contract will be permanently removed from this device and the cloud database."
        details={[
          `${bookingDispatches.length} dispatch(es) under this booking will be deleted.`,
          `${formatKg(booking.dispatchedKg)} of dispatched stock across all items returns to warehouse inventory.`,
          'Unpaid dispatch amounts are removed from the customer balance and ledger.',
        ]}
        confirmLabel="Delete Booking"
        requireText={bookingDispatches.length > 0 ? 'DELETE' : undefined}
        onConfirm={() => {
          setConfirmDelete(false);
          deleteBooking(booking.id);
          onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      {deliverId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div onClick={() => setDeliverId(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              markDelivered(deliverId, { receivedBy, podNote });
              setDeliverId(null);
            }}
            className="relative z-10 w-full max-w-md bg-white dark:bg-[#101A26] rounded-3xl border border-[#E5E5E1] dark:border-[#203248] shadow-2xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white">Confirm Delivery</h3>
              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1">
                Proof of delivery for {bookingDispatches.find((d) => d.id === deliverId)?.dispatchNumber}. The vehicle becomes available again.
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] dark:text-[#94A3B8] mb-1.5 uppercase tracking-widest">
                Received by
              </label>
              <input
                autoFocus
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Name at the customer site"
                className="w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs text-[#111827] dark:text-white focus:outline-hidden focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] dark:text-[#94A3B8] mb-1.5 uppercase tracking-widest">
                POD Note
              </label>
              <input
                value={podNote}
                onChange={(e) => setPodNote(e.target.value)}
                placeholder="Challan signed, shortage, remarks..."
                className="w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs text-[#111827] dark:text-white focus:outline-hidden focus:border-teal-600"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeliverId(null)}
                className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:bg-[#FAF9F6] dark:hover:bg-[#162436] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
              >
                Mark Delivered
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmCancel}
        title={`Cancel booking ${booking.bookingNumber}?`}
        message={`${formatKg(booking.remainingKg)} still undispatched across commodities will be released. Dispatches already made and invoices are kept.`}
        confirmLabel="Cancel Booking"
        onConfirm={() => {
          setConfirmCancel(false);
          cancelBooking(booking.id);
        }}
        onCancel={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDispatch)}
        title={`Delete dispatch ${pendingDispatch?.dispatchNumber ?? ''}?`}
        message="The dispatch will be permanently removed from this device and the cloud database."
        details={[
          `${formatKg(pendingDispatch?.kg ?? 0)} is returned to warehouse inventory and this item's remaining balance.`,
          pendingDispatch?.paymentReceivedImmediately
            ? 'The immediate payment recorded with it is reversed on the booking.'
            : `${formatCurrency(pendingDispatch?.amount ?? 0)} is removed from the customer's outstanding balance.`,
        ]}
        confirmLabel="Delete Dispatch"
        onConfirm={() => {
          if (pendingDispatchId) deleteDispatch(pendingDispatchId);
          setPendingDispatchId(null);
        }}
        onCancel={() => setPendingDispatchId(null)}
      />
    </>
  );
};
