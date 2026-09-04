import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ShoppingBag,
  Search,
  Plus,
  Truck,
  CheckCircle2,
  Clock,
  User,
  Package,
  Calendar,
  DollarSign,
  ArrowRight,
  Filter,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate } from '../utils/formatters';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { BookingStatus, Booking } from '../types';

interface BookingsScreenProps {
  onOpenNewBooking: () => void;
  onOpenDispatchForBooking: (bookingId: string) => void;
  onOpenCustomer: (customerId: string) => void;
}

export const BookingsScreen: React.FC<BookingsScreenProps> = ({
  onOpenNewBooking,
  onOpenDispatchForBooking,
  onOpenCustomer,
}) => {
  const { bookings, customers, products, dispatches, deleteBooking, openBooking, can } = useTrading();
  const [pendingDelete, setPendingDelete] = useState<Booking | null>(null);
  const pendingDispatches = pendingDelete ? dispatches.filter((d) => d.bookingId === pendingDelete.id) : [];
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');

  const filteredBookings = bookings.filter((b) => {
    const cust = customers.find((c) => c.id === b.customerId);
    const prod = products.find((p) => p.id === b.productId);

    const matchesSearch =
      b.bookingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cust?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cust?.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prod?.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalContractKg = bookings.reduce((acc, b) => acc + b.totalKg, 0);
  const totalDispatchedKg = bookings.reduce((acc, b) => acc + b.dispatchedKg, 0);
  const totalRemainingKg = bookings.reduce((acc, b) => acc + b.remainingKg, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Metric Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-7 rounded-[32px] border border-[#E5E5E1] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Bulk Contracts & Orders
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif italic font-normal tracking-tight text-[#111827] mt-1.5">Bookings</h2>
          <p className="text-xs text-[#6B7280] mt-1">
            Real-time live remaining balance tracking as bulk truck dispatches are logged.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-[#FAF9F6] px-5 py-2.5 rounded-2xl border border-[#E5E5E1] text-right flex-1 sm:flex-none min-w-[150px]">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#8E9299] block">
              Pending Remaining
            </span>
            <span className="text-xl font-bold font-mono text-amber-800">
              <AnimatedNumber value={totalRemainingKg} format="kg" />
            </span>
          </div>

          <button
            onClick={onOpenNewBooking}
            className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white font-bold text-xs rounded-2xl shadow-xs flex items-center justify-center gap-2 active:scale-95 transition-all border border-[#111827] flex-1 sm:flex-none whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-teal-400" />
            <span>Create Booking</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex items-center gap-1 bg-[#FAF9F6] p-1.5 rounded-full border border-[#E5E5E1] shadow-xs text-xs font-semibold">
          {(['all', 'active', 'completed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-1.5 rounded-full capitalize transition-colors ${
                statusFilter === status
                  ? 'bg-[#111827] text-white shadow-xs font-bold'
                  : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F4F3EF]'
              }`}
            >
              {status} Orders
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8E9299] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search booking #, customer, or product..."
            className="w-full bg-white border border-[#E5E5E1] rounded-2xl pl-10 pr-4 py-2.5 text-xs font-medium text-[#111827] placeholder-[#8E9299] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-xs"
          />
        </div>
      </div>

      {/* Bookings List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        {filteredBookings.length === 0 ? (
          <div className="col-span-full py-16 text-center text-[#8E9299] bg-white rounded-[32px] border border-[#E5E5E1]">
            <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-[#8E9299]" />
            <p className="text-sm font-semibold text-[#111827]">No bookings match criteria</p>
            <p className="text-xs text-[#8E9299] mt-1">Try resetting the filter or search.</p>
          </div>
        ) : (
          filteredBookings.map((b) => {
            const cust = customers.find((c) => c.id === b.customerId);
            const prod = products.find((p) => p.id === b.productId);
            const progress = (b.dispatchedKg / b.totalKg) * 100;
            const isFullyDispatched = b.remainingKg === 0;

            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="min-w-0 bg-white rounded-[28px] p-6 border border-[#E5E5E1] hover:border-teal-600/50 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3.5">
                  {/* Top Bar: Booking ID & Status */}
                  <div className="flex flex-wrap items-center justify-between gap-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => openBooking(b.id)}
                        title="Open booking details"
                        className="font-extrabold text-sm font-mono text-[#111827] hover:text-teal-800 hover:underline underline-offset-2 whitespace-nowrap"
                      >
                        {b.bookingNumber}
                      </button>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                          isFullyDispatched
                            ? 'bg-teal-50 text-teal-900 border-teal-200/80'
                            : 'bg-amber-50 text-amber-900 border-amber-200/80'
                        }`}
                      >
                        {isFullyDispatched ? 'Fulfilled' : b.status === 'cancelled' ? 'Cancelled' : 'In Progress'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#8E9299] font-medium font-mono">
                        {formatDate(b.createdAt)}
                      </span>
                      {can('delete_records') && (<button
                        type="button"
                        onClick={() => setPendingDelete(b)}
                        title="Delete booking (admin)"
                        className="p-1.5 rounded-xl text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>)}
                    </div>
                  </div>

                  {/* Customer and Commodity Details */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#8E9299] flex items-center gap-1 font-bold uppercase tracking-wider">
                        <User className="w-3 h-3 text-[#8E9299]" /> Customer
                      </span>
                      <div
                        onClick={() => cust && onOpenCustomer(cust.id)}
                        className="font-bold text-xs text-[#111827] hover:text-teal-800 cursor-pointer transition-colors"
                      >
                        {cust?.name}
                      </div>
                      <div className="text-[11px] text-[#8E9299] truncate">{cust?.company}</div>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#8E9299] flex items-center gap-1 font-bold uppercase tracking-wider">
                        <Package className="w-3 h-3 text-[#8E9299]" /> Commodity
                      </span>
                      <div className="font-bold text-xs text-[#111827]">{prod?.name}</div>
                      <div className="text-[11px] text-teal-800 font-mono font-semibold">
                        Rs. {b.pricePerKg}/kg
                      </div>
                    </div>
                  </div>

                  {/* Smart Real-time Progress Bar & kg Counter */}
                  <div className="bg-[#FAF9F6] p-4 rounded-2xl border border-[#E5E5E1] space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] text-[#8E9299] uppercase tracking-wider font-semibold">
                          Total Order
                        </div>
                        <div className="text-xs font-bold text-[#111827] font-mono mt-0.5">
                          {b.totalKg} kg
                        </div>
                      </div>
                      <div className="border-x border-[#E5E5E1]">
                        <div className="text-[10px] text-teal-800 uppercase tracking-wider font-semibold">
                          Dispatched
                        </div>
                        <div className="text-xs font-bold text-teal-800 font-mono mt-0.5">
                          {b.dispatchedKg} kg
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-amber-800 uppercase tracking-wider font-semibold">
                          Remaining
                        </div>
                        <div className="text-xs font-bold text-amber-800 font-mono mt-0.5">
                          {b.remainingKg} kg
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[#8E9299] font-medium">
                        <span>Dispatch Progress</span>
                        <span className="font-mono text-[#111827]">{progress.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-2 bg-[#E5E5E1] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-600 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {b.notes && (
                    <p className="text-xs text-[#6B7280] italic bg-[#FAF9F6] p-3 rounded-2xl border border-[#E5E5E1]">
                      "{b.notes}"
                    </p>
                  )}
                </div>

                {/* Footer Action */}
                <div className="pt-3 border-t border-[#F0F0EE] flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-[#8E9299] block text-[10px] uppercase tracking-wider font-bold">Total Contract</span>
                    <span className="font-bold font-mono text-[#111827]">
                      {formatCurrency(b.totalAmount)}
                    </span>
                  </div>

                  {b.remainingKg > 0 ? (
                    <button
                      onClick={() => onOpenDispatchForBooking(b.id)}
                      className="px-4 py-2 bg-[#111827] hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 active:scale-95 transition-all border border-[#111827]"
                    >
                      <Truck className="w-3.5 h-3.5 text-teal-400" />
                      <span>Log Dispatch ({b.remainingKg} kg left)</span>
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-teal-900 bg-teal-50 border border-teal-200/80 px-3 py-1 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                      <span>Completed</span>
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={`Delete booking ${pendingDelete?.bookingNumber ?? ''}?`}
        message="The booking will be permanently removed from this device and the cloud database."
        details={[
          `${pendingDispatches.length} dispatch(es) under this booking will be deleted.`,
          `${pendingDispatches.reduce((a, d) => a + d.kg, 0)} kg of dispatched stock goes back into the warehouse.`,
          'Unpaid dispatch amounts are removed from the customer balance and the ledger.',
        ]}
        confirmLabel="Delete Booking"
        requireText={pendingDispatches.length > 0 ? 'DELETE' : undefined}
        onConfirm={() => {
          if (pendingDelete) deleteBooking(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
