import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Truck,
  X,
  CheckCircle,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  TrendingDown,
  DollarSign,
  Package,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTrading } from '../context/TradingContext';
import { Booking } from '../types';
import { formatCurrency, formatKg } from '../utils/formatters';

interface DispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedBookingId?: string | null;
}

export const DispatchModal: React.FC<DispatchModalProps> = ({
  isOpen,
  onClose,
  preselectedBookingId,
}) => {
  const { bookings, customers, products, trucks, logDispatch, settings } = useTrading();

  const activeBookings = bookings.filter((b) => b.status === 'active' && b.remainingKg > 0);

  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [kgInput, setKgInput] = useState<string>('20000');
  const [truckNumber, setTruckNumber] = useState<string>('');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [truckId, setTruckId] = useState<string>('');
  const [grossKg, setGrossKg] = useState<string>('');
  const [tareKg, setTareKg] = useState<string>('');
  const [freight, setFreight] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [paymentReceivedImmediately, setPaymentReceivedImmediately] = useState<boolean>(false);
  const [sendWhatsApp, setSendWhatsApp] = useState<boolean>(true);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (preselectedBookingId && activeBookings.some((b) => b.id === preselectedBookingId)) {
      setSelectedBookingId(preselectedBookingId);
    } else if (activeBookings.length > 0 && !selectedBookingId) {
      setSelectedBookingId(activeBookings[0].id);
    }
  }, [preselectedBookingId, activeBookings, selectedBookingId]);

  const currentBooking = bookings.find((b) => b.id === selectedBookingId);
  const customer = currentBooking ? customers.find((c) => c.id === currentBooking.customerId) : null;
  const product = currentBooking ? products.find((p) => p.id === currentBooking.productId) : null;

  const dispatchKg = Math.max(0, parseFloat(kgInput) || 0);
  const remainingAfter = currentBooking
    ? Math.max(0, Number((currentBooking.remainingKg - dispatchKg).toFixed(2)))
    : 0;
  const dispatchAmount = currentBooking ? dispatchKg * currentBooking.pricePerKg : 0;
  const freightAmount = Math.max(0, parseFloat(freight) || 0);
  const taxRate = settings.taxRatePct || 0;
  const taxAmount = ((dispatchAmount + freightAmount) * taxRate) / 100;
  const totalBilled = dispatchAmount + freightAmount + taxAmount;
  const applyWeights = (g: string, t: string) => {
    setGrossKg(g);
    setTareKg(t);
    const gv = parseFloat(g);
    const tv = parseFloat(t);
    if (!isNaN(gv) && !isNaN(tv) && gv > tv) setKgInput(String(Math.round((gv - tv) * 100) / 100));
  };
  const progressPercentBefore = currentBooking
    ? (currentBooking.dispatchedKg / currentBooking.totalKg) * 100
    : 0;
  const progressPercentAfter = currentBooking
    ? Math.min(100, ((currentBooking.dispatchedKg + dispatchKg) / currentBooking.totalKg) * 100)
    : 0;

  const isKgValid =
    currentBooking &&
    dispatchKg > 0 &&
    dispatchKg <= currentBooking.remainingKg;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBooking || !isKgValid) return;

    logDispatch({
      bookingId: currentBooking.id,
      kg: dispatchKg,
      truckNumber: truckNumber.trim() || 'TR-GENERIC',
      truckId: truckId || null,
      grossKg: grossKg ? parseFloat(grossKg) : null,
      tareKg: tareKg ? parseFloat(tareKg) : null,
      freightCharge: freightAmount,
      driverPhone: driverPhone.trim(),
      notes: notes.trim(),
      paymentReceivedImmediately,
      sendWhatsApp,
    });

    try {
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#059669', '#0d9488', '#0284c7'],
      });
    } catch {
      // ignore
    }

    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  if (!isOpen) return null;

  return (
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
          className="relative bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden z-10 my-8"
        >
          {/* Header */}
          <div className="px-7 py-6 bg-[#111827] text-white flex items-center justify-between border-b border-[#262626]">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-teal-400">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif italic text-2xl font-normal text-white tracking-tight">Log Bulk Dispatch</h3>
                <p className="text-xs text-[#9CA3AF]">
                  Instant balance recalculation & auto WhatsApp alert
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {activeBookings.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <AlertCircle className="w-12 h-12 text-amber-600 mx-auto" />
              <h4 className="font-serif italic text-xl text-[#111827]">No Active Bookings Available</h4>
              <p className="text-xs text-[#6B7280] max-w-xs mx-auto">
                All bookings are currently 100% fulfilled or closed. Create a new booking first to log dispatches.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-5 py-2.5 bg-[#111827] text-white text-xs font-bold rounded-2xl"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-7 space-y-5">
              {/* Select Booking */}
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Select Booking Order
                </label>
                <select
                  value={selectedBookingId}
                  onChange={(e) => setSelectedBookingId(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition-all"
                >
                  {activeBookings.map((b) => {
                    const cust = customers.find((c) => c.id === b.customerId);
                    const prod = products.find((p) => p.id === b.productId);
                    return (
                      <option key={b.id} value={b.id}>
                        {b.bookingNumber} • {cust?.name} ({cust?.company}) — {prod?.name} (Rem: {b.remainingKg} kg)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Dynamic Live Balance Transformation Box */}
              {currentBooking && customer && product && (
                <div className="bg-[#111827] rounded-[24px] p-5 text-white space-y-4 shadow-sm border border-[#262626]">
                  <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                    <span className="font-semibold text-teal-400 flex items-center gap-1.5 font-sans">
                      <Package className="w-3.5 h-3.5" />
                      {product.name}
                    </span>
                    <span className="font-mono">Rate: {formatCurrency(currentBooking.pricePerKg)}/kg</span>
                  </div>

                  {/* Visual Calculation Metric */}
                  <div className="grid grid-cols-3 gap-2 bg-white/5 p-3.5 rounded-2xl border border-white/10 text-center">
                    <div>
                      <div className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-wider">Total Booked</div>
                      <div className="text-sm font-bold text-white font-mono mt-0.5">
                        {currentBooking.totalKg} kg
                      </div>
                    </div>
                    <div className="border-x border-white/10">
                      <div className="text-[10px] text-amber-300 uppercase font-bold tracking-wider">This Dispatch</div>
                      <div className="text-sm font-bold text-amber-300 font-mono mt-0.5">
                        +{dispatchKg || 0} kg
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-teal-300 uppercase font-bold tracking-wider">New Remaining</div>
                      <div className="text-sm font-bold text-teal-300 font-mono mt-0.5">
                        {remainingAfter} kg
                      </div>
                    </div>
                  </div>

                  {/* Live Animated Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                      <span>Fulfillment Progress</span>
                      <span className="font-mono font-bold text-teal-300">
                        {progressPercentAfter.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${progressPercentBefore}%` }}
                        className="bg-white/30 h-full transition-all duration-300"
                        title="Previously dispatched"
                      />
                      <div
                        style={{
                          width: `${Math.min(100 - progressPercentBefore, progressPercentAfter - progressPercentBefore)}%`,
                        }}
                        className="bg-teal-400 h-full transition-all duration-300 animate-pulse"
                        title="This dispatch"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Dispatch Quantity (kg) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max={currentBooking?.remainingKg || undefined}
                      value={kgInput}
                      onChange={(e) => setKgInput(e.target.value)}
                      placeholder="e.g. 20000"
                      className={`w-full bg-[#FAF9F6] border rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:bg-white transition-all ${
                        !isKgValid ? 'border-amber-500 focus:ring-1 focus:ring-amber-500' : 'border-[#E5E5E1] focus:border-teal-600 focus:ring-1 focus:ring-teal-600'
                      }`}
                      required
                    />
                    <span className="absolute right-3.5 top-2.5 text-[10px] font-bold text-[#8E9299]">
                      KG
                    </span>
                  </div>
                  {currentBooking && dispatchKg > currentBooking.remainingKg && (
                    <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Cannot exceed remaining {currentBooking.remainingKg} kg
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Dispatch Value (Rs.)
                  </label>
                  <div className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-teal-800">
                    {formatCurrency(dispatchAmount)}
                  </div>
                </div>
              </div>

              {/* Weighbridge + freight + invoice preview */}
              <div className="p-4 bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">Gross (kg)</label>
                    <input type="number" min="0" step="1" value={grossKg} onChange={(e) => applyWeights(e.target.value, tareKg)} placeholder="Weighbridge" className="w-full bg-white border border-[#E5E5E1] rounded-2xl px-3 py-2 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">Tare (kg)</label>
                    <input type="number" min="0" step="1" value={tareKg} onChange={(e) => applyWeights(grossKg, e.target.value)} placeholder="Empty truck" className="w-full bg-white border border-[#E5E5E1] rounded-2xl px-3 py-2 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">Freight (Rs.)</label>
                    <input type="number" min="0" step="1" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="Billed to customer" className="w-full bg-white border border-[#E5E5E1] rounded-2xl px-3 py-2 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600" />
                  </div>
                </div>
                <div className="text-[11px] font-mono text-[#374151] space-y-0.5">
                  <div className="flex justify-between"><span>Goods ({dispatchKg.toLocaleString()} kg)</span><span>{formatCurrency(dispatchAmount)}</span></div>
                  {freightAmount > 0 && <div className="flex justify-between"><span>Freight</span><span>{formatCurrency(freightAmount)}</span></div>}
                  {taxRate > 0 && <div className="flex justify-between"><span>{settings.taxLabel || 'Sales Tax'} ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>}
                  <div className="flex justify-between font-bold text-[#111827] border-t border-[#E5E5E1] pt-1 mt-1"><span>Invoice total</span><span>{formatCurrency(totalBilled)}</span></div>
                </div>
              </div>

              {trucks.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Pick from fleet
                  </label>
                  <select
                    value={truckId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTruckId(id);
                      const t = trucks.find((x) => x.id === id);
                      if (t) {
                        setTruckNumber(t.number);
                        setDriverPhone(t.driverPhone || '');
                      }
                    }}
                    className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  >
                    <option value="">— Enter vehicle manually —</option>
                    {trucks
                      .filter((t) => t.status !== 'inactive')
                      .map((t) => (
                        <option key={t.id} value={t.id} disabled={t.status === 'maintenance'}>
                          {t.number} • {t.driverName || 'no driver'} • {t.capacityKg.toLocaleString()} kg{t.status === 'maintenance' ? ' (maintenance)' : t.status === 'on_trip' ? ' (on trip)' : ''}
                        </option>
                      ))}
                  </select>
                  {(() => {
                    const t = trucks.find((x) => x.id === truckId);
                    return t && t.capacityKg > 0 && dispatchKg > t.capacityKg ? (
                      <p className="text-[11px] text-amber-700 mt-1">This load exceeds {t.number}'s capacity of {t.capacityKg.toLocaleString()} kg.</p>
                    ) : null;
                  })()}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Truck / Vehicle Plate # *
                  </label>
                  <input
                    type="text"
                    value={truckNumber}
                    onChange={(e) => setTruckNumber(e.target.value)}
                    placeholder="e.g. TR-8921-A"
                    className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] uppercase focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Driver Phone #
                  </label>
                  <input
                    type="text"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="e.g. +92 300 1234567"
                    className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs text-[#111827] font-mono focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Automations and Options */}
              <div className="p-4 bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendWhatsApp}
                    onChange={(e) => setSendWhatsApp(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-700 focus:ring-teal-600 border-[#E5E5E1]"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-[#111827] flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
                      Auto-send WhatsApp dispatch alert & payment inquiry
                    </span>
                    <span className="text-[11px] text-[#6B7280] block mt-0.5">
                      Instantly alerts {customer?.name || 'customer'} with kg dispatched, remaining balance & polite payment request.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-[#E5E5E1]">
                  <input
                    type="checkbox"
                    checked={paymentReceivedImmediately}
                    onChange={(e) => setPaymentReceivedImmediately(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-700 focus:ring-teal-600 border-[#E5E5E1]"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-[#111827]">
                      Payment received upfront for this dispatch
                    </span>
                    <span className="text-[11px] text-[#6B7280] block mt-0.5">
                      Automatically logs credit to ledger with zero new debt added.
                    </span>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-xs font-bold text-[#6B7280] hover:text-[#111827] bg-[#FAF9F6] hover:bg-[#F0F0EE] border border-[#E5E5E1] rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isKgValid || isSuccess}
                  className="px-6 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all active:scale-95 border border-[#111827]"
                >
                  {isSuccess ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-teal-400" />
                      <span>Dispatched!</span>
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4 text-teal-400" />
                      <span>Confirm & Dispatch ({dispatchKg} kg)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
