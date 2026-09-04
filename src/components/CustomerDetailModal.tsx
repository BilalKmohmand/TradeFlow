import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  CreditCard,
  Truck,
  FileText,
  Calendar,
  DollarSign,
  Package,
  Clock,
  Send,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Pencil,
  Printer,
} from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate } from '../utils/formatters';
import { AnimatedNumber } from './AnimatedNumber';

interface CustomerDetailModalProps {
  customerId: string | null;
  onClose: () => void;
  onOpenDispatchForBooking?: (bookingId: string) => void;
  onOpenPayment?: (customerId: string) => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  customerId,
  onClose,
  onOpenDispatchForBooking,
  onOpenPayment,
}) => {
  const {
    customers,
    bookings,
    ledger,
    products,
    sendWhatsAppReminder,
    dispatches,
    deleteCustomer,
    deleteLedgerEntry,
    openBooking,
    setEditRequest,
    setPrintRequest,
    can,
  } = useTrading();

  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'bookings'>('overview');
  const [reminderSent, setReminderSent] = useState<boolean>(false);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState<boolean>(false);
  const [pendingLedgerId, setPendingLedgerId] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId);

  if (!customer) return null;

  const customerBookings = bookings.filter((b) => b.customerId === customer.id);
  const customerLedger = ledger.filter(
    (l) => l.entityType === 'customer' && l.entityId === customer.id
  );

  const customerDispatches = dispatches.filter((d) => d.customerId === customer.id);
  const pendingLedger = pendingLedgerId ? customerLedger.find((l) => l.id === pendingLedgerId) : undefined;

  const handleSendReminder = () => {
    sendWhatsAppReminder(customer.id);
    setReminderSent(true);
    setTimeout(() => setReminderSent(false), 3000);
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
          className="relative bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden z-10 my-8 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="p-7 bg-[#111827] text-white flex items-start justify-between border-b border-[#262626]">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/10 text-teal-400 border border-white/10 uppercase tracking-widest">
                  Customer Account
                </span>
                <span className="text-xs text-[#9CA3AF]">Since {formatDate(customer.createdAt)}</span>
              </div>
              <h2 className="text-3xl font-serif italic font-normal tracking-tight text-white">{customer.name}</h2>
              <p className="text-xs text-[#9CA3AF] font-medium">{customer.company}</p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onClose();
                  setEditRequest({ type: 'customer', id: customer.id });
                }}
                title="Edit customer"
                className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors"
              >
                <Pencil className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  const to = new Date().toISOString().split('T')[0];
                  const fromD = new Date();
                  fromD.setUTCMonth(fromD.getUTCMonth() - 3);
                  setPrintRequest({ type: 'statement', customerId: customer.id, from: fromD.toISOString().split('T')[0], to });
                }}
                title="Print statement of account (last 3 months)"
                className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors"
              >
                <Printer className="w-5 h-5" />
              </button>
              {can('delete_records') && (
              <button
                onClick={() => setConfirmDeleteCustomer(true)}
                title="Delete customer (admin)"
                className="text-[#9CA3AF] hover:text-rose-400 p-2 rounded-2xl hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              )}
              <button
                onClick={onClose}
                className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="p-7 bg-[#FAF9F6] border-b border-[#E5E5E1] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E5E5E1] shadow-xs">
              <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">
                Total Outstanding Due
              </div>
              <div className="text-2xl font-bold font-mono text-[#111827] mt-1.5 flex items-baseline gap-1">
                <AnimatedNumber value={customer.totalDue} format="currency" />
              </div>
              <div className="text-[11px] text-[#8E9299] mt-1 font-mono">
                Credit Limit: {formatCurrency(customer.creditLimit)}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E5E5E1] shadow-xs">
              <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">
                Active Bookings
              </div>
              <div className="text-2xl font-bold font-mono text-teal-800 mt-1.5">
                {customerBookings.filter((b) => b.status === 'active').length} Orders
              </div>
              <div className="text-[11px] text-[#8E9299] mt-1 font-mono">
                {customerBookings.reduce((acc, b) => acc + b.remainingKg, 0)} kg pending dispatch
              </div>
            </div>

            {/* Quick Actions in Metric Bar */}
            <div className="bg-white p-4 rounded-2xl border border-[#E5E5E1] shadow-xs flex flex-col justify-center gap-2.5">
              <button
                onClick={() => onOpenPayment?.(customer.id)}
                className="w-full bg-[#111827] hover:bg-black active:scale-98 text-white font-bold text-xs py-2 px-3 rounded-2xl flex items-center justify-center gap-1.5 shadow-xs transition-all border border-[#111827]"
              >
                <CreditCard className="w-3.5 h-3.5 text-teal-400" />
                <span>Receive Payment</span>
              </button>

              <button
                onClick={handleSendReminder}
                disabled={customer.totalDue === 0}
                className="w-full bg-[#FAF9F6] hover:bg-[#F0F0EE] disabled:opacity-40 text-[#111827] font-bold text-xs py-2 px-3 rounded-2xl flex items-center justify-center gap-1.5 border border-[#E5E5E1] transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
                <span>{reminderSent ? 'WhatsApp Sent!' : 'Send WhatsApp Reminder'}</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="px-7 border-b border-[#E5E5E1] flex items-center justify-between bg-white">
            <div className="flex gap-4 text-xs font-bold">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3.5 border-b-2 transition-all ${
                  activeTab === 'overview'
                    ? 'border-teal-700 text-[#111827]'
                    : 'border-transparent text-[#8E9299] hover:text-[#111827]'
                }`}
              >
                Overview & Info
              </button>
              <button
                onClick={() => setActiveTab('bookings')}
                className={`py-3.5 border-b-2 transition-all ${
                  activeTab === 'bookings'
                    ? 'border-teal-700 text-[#111827]'
                    : 'border-transparent text-[#8E9299] hover:text-[#111827]'
                }`}
              >
                Bookings ({customerBookings.length})
              </button>
              <button
                onClick={() => setActiveTab('ledger')}
                className={`py-3.5 border-b-2 transition-all ${
                  activeTab === 'ledger'
                    ? 'border-teal-700 text-[#111827]'
                    : 'border-transparent text-[#8E9299] hover:text-[#111827]'
                }`}
              >
                Account Ledger ({customerLedger.length})
              </button>
            </div>

            <button
              onClick={() => {
                const clean = customer.phone.replace(/[^0-9]/g, '');
                window.open(`https://wa.me/${clean}`, '_blank');
              }}
              className="text-xs text-teal-700 hover:text-teal-800 flex items-center gap-1 font-bold"
            >
              <span>Direct WhatsApp</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-7 space-y-6 bg-[#FAF9F6]">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Contact Card */}
                <div className="bg-white p-6 rounded-2xl border border-[#E5E5E1] shadow-xs space-y-3">
                  <h4 className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">
                    Contact & Logistics Address
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="flex items-center gap-2.5 text-[#111827]">
                      <Phone className="w-4 h-4 text-teal-700 shrink-0" />
                      <div>
                        <span className="text-[10px] font-bold text-[#8E9299] uppercase tracking-wider block">Phone</span>
                        <span className="font-bold text-[#111827] font-mono">{customer.phone}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 text-[#111827]">
                      <Mail className="w-4 h-4 text-teal-700 shrink-0" />
                      <div>
                        <span className="text-[10px] font-bold text-[#8E9299] uppercase tracking-wider block">Email</span>
                        <span className="font-semibold text-[#111827]">{customer.email}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-[#111827] sm:col-span-2">
                      <MapPin className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold text-[#8E9299] uppercase tracking-wider block">Delivery Site / Facility</span>
                        <span className="font-medium text-[#111827]">{customer.address}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Active Bookings Quick Peek */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">
                      Recent Orders
                    </h4>
                    <button
                      onClick={() => setActiveTab('bookings')}
                      className="text-xs font-bold text-teal-700 hover:underline"
                    >
                      View All
                    </button>
                  </div>

                  {customerBookings.length === 0 ? (
                    <p className="text-xs text-[#8E9299] py-4 text-center">No bookings on record.</p>
                  ) : (
                    <div className="space-y-3">
                      {customerBookings.slice(0, 3).map((b) => {
                        const prod = products.find((p) => p.id === b.productId);
                        const progress = (b.dispatchedKg / b.totalKg) * 100;
                        return (
                          <div
                            key={b.id}
                            className="bg-white p-5 rounded-2xl border border-[#E5E5E1] shadow-xs flex items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-[#111827]">
                                  {b.bookingNumber}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                    b.status === 'completed'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-teal-100 text-teal-800'
                                  }`}
                                >
                                  {b.status}
                                </span>
                              </div>
                              <div className="text-xs text-[#6B7280]">
                                {prod?.name} • {b.totalKg} kg (@ Rs. {b.pricePerKg}/kg)
                              </div>
                              <div className="w-36 h-1.5 bg-[#E5E5E1] rounded-full overflow-hidden mt-1">
                                <div
                                  className="h-full bg-teal-600 rounded-full"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>

                            <div className="text-right flex flex-col items-end gap-1.5">
                              <div className="text-xs font-mono font-bold text-[#111827]">
                                Rem: {b.remainingKg} kg
                              </div>
                              {b.remainingKg > 0 && onOpenDispatchForBooking && (
                                <button
                                  onClick={() => {
                                    onClose();
                                    onOpenDispatchForBooking(b.id);
                                  }}
                                  className="px-3 py-1 bg-[#111827] hover:bg-black text-white text-[11px] font-bold rounded-xl flex items-center gap-1 shadow-xs border border-[#111827]"
                                >
                                  <Truck className="w-3 h-3 text-teal-400" />
                                  <span>Dispatch</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'bookings' && (
              <div className="space-y-3">
                {customerBookings.map((b) => {
                  const prod = products.find((p) => p.id === b.productId);
                  const progress = (b.dispatchedKg / b.totalKg) * 100;
                  return (
                    <div
                      key={b.id}
                      className="bg-white p-6 rounded-2xl border border-[#E5E5E1] shadow-xs space-y-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] flex items-center justify-center text-teal-700 font-bold text-xs">
                            <Package className="w-4 h-4" />
                          </div>
                          <div>
                            <button onClick={() => { onClose(); openBooking(b.id); }} title="Open booking details" className="text-sm font-bold text-[#111827] hover:text-teal-800 hover:underline underline-offset-2">{b.bookingNumber}</button>
                            <span className="text-xs text-[#8E9299] block font-mono">
                              Booked on {formatDate(b.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold font-mono text-[#111827]">
                            {formatCurrency(b.totalAmount)}
                          </span>
                          <span className="text-[11px] text-[#8E9299] block font-mono">
                            Rs. {b.pricePerKg}/kg
                          </span>
                        </div>
                      </div>

                      <div className="bg-[#FAF9F6] p-3.5 rounded-2xl border border-[#E5E5E1] grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-wider">Total Booked</div>
                          <div className="font-bold text-[#111827] font-mono mt-0.5">{b.totalKg} kg</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">Dispatched</div>
                          <div className="font-bold text-teal-800 font-mono mt-0.5">{b.dispatchedKg} kg</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Remaining</div>
                          <div className="font-bold text-amber-800 font-mono mt-0.5">{b.remainingKg} kg</div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-[#8E9299]">
                          <span>Delivery Fulfillment</span>
                          <span className="font-mono font-bold text-[#111827]">{progress.toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-2 bg-[#E5E5E1] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-600 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {b.notes && (
                        <p className="text-xs text-[#6B7280] bg-[#FAF9F6] p-3 rounded-xl border border-[#E5E5E1] italic">
                          "{b.notes}"
                        </p>
                      )}

                      {b.remainingKg > 0 && onOpenDispatchForBooking && (
                        <div className="pt-1 flex justify-end">
                          <button
                            onClick={() => {
                              onClose();
                              onOpenDispatchForBooking(b.id);
                            }}
                            className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl flex items-center gap-1.5 shadow-xs border border-[#111827]"
                          >
                            <Truck className="w-3.5 h-3.5 text-teal-400" />
                            <span>Log Dispatch for this Booking</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'ledger' && (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl border border-[#E5E5E1] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF9F6] border-b border-[#E5E5E1] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                        <tr>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Description / Ref</th>
                          <th className="py-3 px-4 text-right">Debit (+)</th>
                          <th className="py-3 px-4 text-right">Credit (-)</th>
                          <th className="py-3 px-4 text-right">Balance</th>
                          <th className="py-3 px-4 text-right"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#FAF9F6] font-mono">
                        {customerLedger.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-[#8E9299] font-sans">
                              No ledger entries for this customer.
                            </td>
                          </tr>
                        ) : (
                          customerLedger.map((item) => (
                            <tr key={item.id} className="hover:bg-[#FAF9F6] transition-colors">
                              <td className="py-3 px-4 text-[#6B7280] whitespace-nowrap">
                                {formatDate(item.date)}
                              </td>
                              <td className="py-3 px-4 font-sans font-medium text-[#111827]">
                                {item.description}
                                {item.kg && (
                                  <span className="ml-1 text-[10px] text-teal-700 font-mono font-bold">
                                    ({item.kg} kg)
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right text-[#111827] font-semibold">
                                {item.debit > 0 ? formatCurrency(item.debit) : '—'}
                              </td>
                              <td className="py-3 px-4 text-right text-teal-700 font-semibold">
                                {item.credit > 0 ? formatCurrency(item.credit) : '—'}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-[#111827]">
                                {formatCurrency(item.balanceAfter)}
                              </td>
                              <td className="py-3 px-2 text-right">
                                {can('delete_records') && (
                                <button
                                  type="button"
                                  onClick={() => setPendingLedgerId(item.id)}
                                  title="Delete ledger entry (admin)"
                                  className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
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
            )}
          </div>
        </motion.div>
      </div>

    </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmDeleteCustomer}
        title={`Delete ${customer.name}?`}
        message={`${customer.company} will be permanently removed from this device and the cloud database.`}
        details={[
          `${customerBookings.length} booking(s) and ${customerDispatches.length} dispatch(es) will be deleted.`,
          'Dispatched stock is returned to the warehouse and the ledger rows are removed.',
          `Outstanding balance being written off: ${formatCurrency(customer.totalDue)}.`,
        ]}
        confirmLabel="Delete Customer"
        requireText={customerBookings.length > 0 ? 'DELETE' : undefined}
        onConfirm={() => {
          setConfirmDeleteCustomer(false);
          deleteCustomer(customer.id);
          onClose();
        }}
        onCancel={() => setConfirmDeleteCustomer(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingLedger)}
        title="Delete this ledger entry?"
        message={pendingLedger ? `${pendingLedger.referenceId}: ${pendingLedger.description}` : ''}
        details={['Only the entry is removed. The customer balance is not recalculated; adjust it manually if needed.']}
        confirmLabel="Delete Entry"
        onConfirm={() => {
          if (pendingLedgerId) deleteLedgerEntry(pendingLedgerId);
          setPendingLedgerId(null);
        }}
        onCancel={() => setPendingLedgerId(null)}
      />
    </>
  );
};
