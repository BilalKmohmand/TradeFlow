import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Package, Truck, Calendar, Trash2, CreditCard, ArrowUpRight, Pencil, Ban, FileText, Printer } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate } from '../utils/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import { useEscape } from '../hooks/useEscape';

interface BookingDetailModalProps {
  bookingId: string | null;
  highlightDispatchId?: string | null;
  onClose: () => void;
  onOpenDispatchForBooking?: (bookingId: string) => void;
}

/** Full booking view: contract, customer/product links, every dispatch under it and the ledger rows it produced. */
export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({ bookingId, highlightDispatchId, onClose, onOpenDispatchForBooking }) => {
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
  } = useTrading();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pendingDispatchId, setPendingDispatchId] = useState<string | null>(null);
  useEscape(Boolean(bookingId) && !confirmDelete && !confirmCancel && !pendingDispatchId, onClose);

  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) return null;

  const customer = customers.find((c) => c.id === booking.customerId);
  const product = products.find((p) => p.id === booking.productId);
  const bookingDispatches = dispatches.filter((d) => d.bookingId === booking.id).sort((a, b) => (a.date < b.date ? 1 : -1));
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            className="relative bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden z-10 my-8 max-h-[92vh] flex flex-col"
          >
            <div className="p-6 sm:p-7 bg-[#111827] text-white flex items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/10 text-teal-400 border border-white/10 uppercase tracking-widest">Booking</span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${booking.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : booking.status === 'cancelled' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`}>
                    {booking.status}
                  </span>
                  <span className="text-xs text-[#9CA3AF] flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(booking.createdAt)}</span>
                </div>
                <h2 className="text-xl sm:text-3xl font-serif italic text-white font-mono whitespace-nowrap">{booking.bookingNumber}</h2>
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  {customer && (
                    <button onClick={() => go(() => setSelectedCustomerId(customer.id))} className="text-[#D1D5DB] hover:text-white flex items-center gap-1 hover:underline">
                      <User className="w-3.5 h-3.5 text-teal-400" /> {customer.name} • {customer.company}
                    </button>
                  )}
                  {product && (
                    <button onClick={() => go(() => setSelectedProductId(product.id))} className="text-[#D1D5DB] hover:text-white flex items-center gap-1 hover:underline">
                      <Package className="w-3.5 h-3.5 text-teal-400" /> {product.name}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => go(() => setEditRequest({ type: 'booking', id: booking.id }))} title="Edit booking" className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10">
                  <Pencil className="w-5 h-5" />
                </button>
                {booking.status === 'active' && (
                  <button onClick={() => setConfirmCancel(true)} title="Cancel booking" className="text-[#9CA3AF] hover:text-amber-300 p-2 rounded-2xl hover:bg-amber-500/10">
                    <Ban className="w-5 h-5" />
                  </button>
                )}
                {can('delete_records') && (
                <button onClick={() => setConfirmDelete(true)} title="Delete booking (admin)" className="text-[#9CA3AF] hover:text-rose-400 p-2 rounded-2xl hover:bg-rose-500/10">
                  <Trash2 className="w-5 h-5" />
                </button>
                )}
                <button onClick={onClose} className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6 bg-[#FAF9F6]">
              {/* Quantities */}
              <div className="bg-white rounded-2xl border border-[#E5E5E1] p-5 shadow-xs space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-[10px] text-[#8E9299] uppercase tracking-wider font-bold">Total Order</div><div className="text-sm font-bold text-[#111827] font-mono mt-0.5">{formatKg(booking.totalKg)}</div></div>
                  <div className="border-x border-[#E5E5E1]"><div className="text-[10px] text-teal-800 uppercase tracking-wider font-bold">Dispatched</div><div className="text-sm font-bold text-teal-800 font-mono mt-0.5">{formatKg(booking.dispatchedKg)}</div></div>
                  <div><div className="text-[10px] text-amber-800 uppercase tracking-wider font-bold">Remaining</div><div className="text-sm font-bold text-amber-800 font-mono mt-0.5">{formatKg(booking.remainingKg)}</div></div>
                </div>
                <div className="w-full h-2 bg-[#E5E5E1] rounded-full overflow-hidden"><div className="h-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} /></div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                  <div><span className="text-[#8E9299] block text-[10px] uppercase font-bold tracking-wider">Rate</span><span className="font-mono font-bold text-[#111827]">Rs. {booking.pricePerKg}/kg</span></div>
                  <div><span className="text-[#8E9299] block text-[10px] uppercase font-bold tracking-wider">Contract</span><span className="font-mono font-bold text-[#111827]">{formatCurrency(booking.totalAmount)}</span></div>
                  <div><span className="text-[#8E9299] block text-[10px] uppercase font-bold tracking-wider">Paid</span><span className="font-mono font-bold text-teal-800">{formatCurrency(booking.paidAmount)}</span></div>
                  <div><span className="text-[#8E9299] block text-[10px] uppercase font-bold tracking-wider">Balance</span><span className="font-mono font-bold text-amber-800">{formatCurrency(balanceDue)}</span></div>
                </div>
                {booking.notes && <p className="text-xs text-[#6B7280] italic bg-[#FAF9F6] p-3 rounded-xl border border-[#E5E5E1]">"{booking.notes}"</p>}
                {booking.status === 'cancelled' && (
                  <p className="text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200">
                    Cancelled{booking.cancelledAt ? ` on ${formatDate(booking.cancelledAt)}` : ''}{booking.cancelReason ? `: ${booking.cancelReason}` : ''}. {formatKg(booking.remainingKg)} was never dispatched.
                  </p>
                )}
                {booking.targetDeliveryDate && (
                  <p className="text-[11px] text-[#6B7280] font-mono">Target delivery: {formatDate(booking.targetDeliveryDate)}</p>
                )}
                {booking.remainingKg > 0 && onOpenDispatchForBooking && (
                  <div className="flex justify-end">
                    <button onClick={() => go(() => onOpenDispatchForBooking(booking.id))} className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-teal-400" /> Log Dispatch ({formatKg(booking.remainingKg)} left)
                    </button>
                  </div>
                )}
              </div>

              {/* Dispatches */}
              <div>
                <h4 className="text-xs font-bold text-[#111827] uppercase tracking-widest mb-2 flex items-center gap-1.5"><ArrowUpRight className="w-3.5 h-3.5 text-amber-700" /> Dispatches ({bookingDispatches.length})</h4>
                <div className="bg-white rounded-2xl border border-[#E5E5E1] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF9F6] border-b border-[#E5E5E1] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                        <tr>
                          <th className="py-3 px-4">Dispatch #</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Truck</th>
                          <th className="py-3 px-4 text-right">kg</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                          <th className="py-3 px-4 text-center">Paid</th>
                          <th className="py-3 px-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#FAF9F6] font-mono">
                        {bookingDispatches.length === 0 ? (
                          <tr><td colSpan={7} className="py-8 text-center text-[#8E9299] font-sans">No dispatches yet.</td></tr>
                        ) : (
                          bookingDispatches.map((d) => (
                            <tr key={d.id} className={`transition-colors ${d.id === highlightDispatchId ? 'bg-teal-50 ring-1 ring-inset ring-teal-300' : 'hover:bg-[#FAF9F6]'}`}>
                              <td className="py-2.5 px-4 font-bold text-[#111827]">{d.dispatchNumber}</td>
                              <td className="py-2.5 px-4 text-[#6B7280] whitespace-nowrap">{formatDate(d.date)}</td>
                              <td className="py-2.5 px-4 text-[#374151]">{d.truckNumber}{d.driverPhone && <span className="block text-[10px] text-[#8E9299]">{d.driverPhone}</span>}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-amber-800">{formatKg(d.kg)}</td>
                              <td className="py-2.5 px-4 text-right text-[#111827]">{formatCurrency(d.amount)}</td>
                              <td className="py-2.5 px-4 text-center font-sans">{d.paymentReceivedImmediately ? <span className="text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">Yes</span> : <span className="text-[#8E9299]">—</span>}</td>
                              <td className="py-2.5 px-2 text-right whitespace-nowrap">
                                <button onClick={() => setPrintRequest({ type: 'invoice', dispatchId: d.id })} title="Print invoice" className="p-1.5 rounded-lg text-[#8E9299] hover:text-teal-700 hover:bg-teal-50"><FileText className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setPrintRequest({ type: 'challan', dispatchId: d.id })} title="Print delivery challan" className="p-1.5 rounded-lg text-[#8E9299] hover:text-teal-700 hover:bg-teal-50"><Printer className="w-3.5 h-3.5" /></button>
                                {can('delete_records') && (
                                <button onClick={() => setPendingDispatchId(d.id)} title="Delete dispatch (admin)" className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Ledger */}
              <div>
                <h4 className="text-xs font-bold text-[#111827] uppercase tracking-widest mb-2 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-teal-700" /> Ledger entries ({bookingLedger.length})</h4>
                <div className="bg-white rounded-2xl border border-[#E5E5E1] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF9F6] border-b border-[#E5E5E1] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                        <tr><th className="py-3 px-4">Date</th><th className="py-3 px-4">Description</th><th className="py-3 px-4 text-right">Debit</th><th className="py-3 px-4 text-right">Credit</th></tr>
                      </thead>
                      <tbody className="divide-y divide-[#FAF9F6] font-mono">
                        {bookingLedger.length === 0 ? (
                          <tr><td colSpan={4} className="py-6 text-center text-[#8E9299] font-sans">No ledger rows for this booking.</td></tr>
                        ) : (
                          bookingLedger.map((l) => (
                            <tr key={l.id} className="hover:bg-[#FAF9F6]">
                              <td className="py-2.5 px-4 text-[#6B7280] whitespace-nowrap">{formatDate(l.date)}</td>
                              <td className="py-2.5 px-4 font-sans text-[#111827]">{l.description}</td>
                              <td className="py-2.5 px-4 text-right text-[#111827]">{l.debit > 0 ? formatCurrency(l.debit) : '—'}</td>
                              <td className="py-2.5 px-4 text-right text-teal-700">{l.credit > 0 ? formatCurrency(l.credit) : '—'}</td>
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
        message="The booking will be permanently removed from this device and the cloud database."
        details={[
          `${bookingDispatches.length} dispatch(es) under this booking will be deleted.`,
          `${formatKg(booking.dispatchedKg)} of dispatched stock goes back into the warehouse.`,
          'Unpaid dispatch amounts are removed from the customer balance and the ledger.',
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

      <ConfirmDialog
        isOpen={confirmCancel}
        title={`Cancel booking ${booking.bookingNumber}?`}
        message={`${formatKg(booking.remainingKg)} still undispatched will be released. Dispatches already made and their invoices are kept.`}
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
          `${formatKg(pendingDispatch?.kg ?? 0)} is returned to warehouse stock and to this booking's remaining balance.`,
          pendingDispatch?.paymentReceivedImmediately ? 'The immediate payment recorded with it is reversed on the booking.' : `${formatCurrency(pendingDispatch?.amount ?? 0)} is removed from the customer's outstanding balance.`,
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
