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
  Layers,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTrading } from '../context/TradingContext';
import { useEscape } from '../hooks/useEscape';
import { Booking } from '../types';
import { formatCurrency, formatKg } from '../utils/formatters';

interface DispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedBookingId?: string | null;
  preselectedBookingItemId?: string | null;
}

export const DispatchModal: React.FC<DispatchModalProps> = ({
  isOpen,
  onClose,
  preselectedBookingId,
  preselectedBookingItemId,
}) => {
  const { bookings, customers, products, trucks, logDispatch, settings } = useTrading();
  useEscape(isOpen, onClose);

  const activeBookings = bookings.filter((b) => b.status === 'active' && b.remainingKg > 0);

  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
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

  // Track selected item inside current booking
  useEffect(() => {
    if (!currentBooking) return;
    const items = currentBooking.items;
    if (items && items.length > 0) {
      if (preselectedBookingItemId && items.some((it) => it.id === preselectedBookingItemId)) {
        setSelectedItemId(preselectedBookingItemId);
      } else {
        // Pick first item that has remainingKg > 0
        const firstActive = items.find((it) => it.remainingKg > 0) || items[0];
        setSelectedItemId(firstActive.id);
      }
    } else {
      setSelectedItemId('');
    }
  }, [currentBooking, preselectedBookingItemId]);

  const selectedItem = currentBooking?.items?.find((it) => it.id === selectedItemId) || currentBooking?.items?.[0];
  const effectiveProductId = selectedItem ? selectedItem.productId : currentBooking?.productId;
  const product = products.find((p) => p.id === effectiveProductId);
  const effectivePricePerKg = selectedItem ? selectedItem.pricePerKg : (currentBooking?.pricePerKg || 0);
  const effectiveItemRemainingKg = selectedItem ? selectedItem.remainingKg : (currentBooking?.remainingKg || 0);
  const effectiveItemTotalKg = selectedItem ? selectedItem.totalKg : (currentBooking?.totalKg || 0);
  const effectiveItemDispatchedKg = selectedItem ? selectedItem.dispatchedKg : (currentBooking?.dispatchedKg || 0);

  const dispatchKg = Math.max(0, parseFloat(kgInput) || 0);
  const remainingAfter = Math.max(0, Number((effectiveItemRemainingKg - dispatchKg).toFixed(2)));
  const dispatchAmount = dispatchKg * effectivePricePerKg;
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

  const progressPercentBefore = effectiveItemTotalKg > 0
    ? (effectiveItemDispatchedKg / effectiveItemTotalKg) * 100
    : 0;
  const progressPercentAfter = effectiveItemTotalKg > 0
    ? Math.min(100, ((effectiveItemDispatchedKg + dispatchKg) / effectiveItemTotalKg) * 100)
    : 0;

  const isKgValid =
    currentBooking &&
    dispatchKg > 0 &&
    dispatchKg <= effectiveItemRemainingKg;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBooking || !isKgValid) return;

    logDispatch({
      bookingId: currentBooking.id,
      bookingItemId: selectedItem?.id,
      productId: effectiveProductId,
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
          className="relative bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-[#E5E5E1] overflow-hidden z-10 my-8"
        >
          {/* Header */}
          <div className="px-7 py-6 bg-[#111827] text-white flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-teal-400">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif italic text-2xl font-bold text-white tracking-tight">
                  Log Truck Dispatch
                </h3>
                <p className="text-xs text-[#9CA3AF]">
                  Dispatch against booking with itemized stock fulfillment
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
            <div className="p-12 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-700 mx-auto" />
              <div className="text-sm font-bold text-[#111827]">No Active Bookings Available</div>
              <p className="text-xs text-[#8E9299]">
                Create a sales contract booking first before logging vehicle dispatches.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl text-xs font-semibold text-[#111827]"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-7 space-y-5">
              {/* Select Booking */}
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Select Booking Contract
                </label>
                <select
                  value={selectedBookingId}
                  onChange={(e) => setSelectedBookingId(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition-all"
                >
                  {activeBookings.map((b) => {
                    const cust = customers.find((c) => c.id === b.customerId);
                    const itemCount = b.items?.length || 1;
                    return (
                      <option key={b.id} value={b.id}>
                        {b.bookingNumber} • {cust?.name} ({cust?.company}) — {itemCount} item{itemCount > 1 ? 's' : ''} (Rem: {formatKg(b.remainingKg)})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Multi-Item Commodity Selection (When booking has multiple items) */}
              {currentBooking && currentBooking.items && currentBooking.items.length > 1 && (
                <div>
                  <label className="block text-[10px] font-bold text-teal-800 mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-teal-600" />
                    Select Commodity to Dispatch *
                  </label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => {
                      setSelectedItemId(e.target.value);
                      const chosen = currentBooking.items?.find((it) => it.id === e.target.value);
                      if (chosen && chosen.remainingKg > 0 && dispatchKg > chosen.remainingKg) {
                        setKgInput(String(chosen.remainingKg));
                      }
                    }}
                    className="w-full bg-teal-50/50 border border-teal-200 rounded-2xl px-4 py-2.5 text-xs font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition-all"
                  >
                    {currentBooking.items.map((it) => {
                      const itProd = products.find((p) => p.id === it.productId);
                      return (
                        <option key={it.id} value={it.id} disabled={it.remainingKg <= 0}>
                          {itProd?.name || 'Item'} — Remaining: {it.remainingKg.toLocaleString()} kg @ Rs. {it.pricePerKg}/kg {it.remainingKg <= 0 ? '(Fulfilled)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Dynamic Live Balance Transformation Box */}
              {currentBooking && customer && product && (
                <div className="bg-[#111827] rounded-[24px] p-5 text-white space-y-4 shadow-sm border border-[#262626]">
                  <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                    <span className="font-semibold text-teal-400 flex items-center gap-1.5 font-sans">
                      <Package className="w-3.5 h-3.5" />
                      {product.name}
                      {currentBooking.items && currentBooking.items.length > 1 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white font-mono">
                          Selected Item
                        </span>
                      )}
                    </span>
                    <span className="font-mono">Rate: {formatCurrency(effectivePricePerKg)}/kg</span>
                  </div>

                  {/* Visual Calculation Metric */}
                  <div className="grid grid-cols-3 gap-2 bg-white/5 p-3.5 rounded-2xl border border-white/10 text-center">
                    <div>
                      <div className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-wider">Item Booked</div>
                      <div className="text-sm font-bold text-white font-mono mt-0.5">
                        {effectiveItemTotalKg.toLocaleString()} kg
                      </div>
                    </div>
                    <div className="border-x border-white/10">
                      <div className="text-[10px] text-amber-300 uppercase font-bold tracking-wider">This Dispatch</div>
                      <div className="text-sm font-bold text-amber-300 font-mono mt-0.5">
                        +{(dispatchKg || 0).toLocaleString()} kg
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-teal-300 uppercase font-bold tracking-wider">New Remaining</div>
                      <div className="text-sm font-bold text-teal-300 font-mono mt-0.5">
                        {remainingAfter.toLocaleString()} kg
                      </div>
                    </div>
                  </div>

                  {/* Live Animated Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                      <span>Item Fulfillment</span>
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

              {/* Weighbridge shortcut */}
              <div className="p-3 bg-[#FAF9F6] rounded-2xl border border-[#E5E5E1] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#111827]">Weighbridge Calculator (optional)</span>
                  <span className="text-[10px] text-[#8E9299]">Gross − Tare = Net</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={grossKg}
                    onChange={(e) => applyWeights(e.target.value, tareKg)}
                    placeholder="Gross kg (loaded)"
                    className="bg-white border border-[#E5E5E1] rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden"
                  />
                  <input
                    type="number"
                    value={tareKg}
                    onChange={(e) => applyWeights(grossKg, e.target.value)}
                    placeholder="Tare kg (empty truck)"
                    className="bg-white border border-[#E5E5E1] rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Weight and Truck Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Net Weight (kg) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max={effectiveItemRemainingKg}
                    value={kgInput}
                    onChange={(e) => setKgInput(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    required
                  />
                  {dispatchKg > effectiveItemRemainingKg && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      Exceeds item remaining ({effectiveItemRemainingKg.toLocaleString()} kg)
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Truck / Vehicle #
                  </label>
                  <input
                    type="text"
                    value={truckNumber}
                    onChange={(e) => setTruckNumber(e.target.value)}
                    placeholder="e.g. TR-8942-LX"
                    className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 uppercase"
                    required
                  />
                </div>
              </div>

              {/* Saved fleet select */}
              {trucks.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Or select from registered fleet
                  </label>
                  <select
                    value={truckId}
                    onChange={(e) => {
                      setTruckId(e.target.value);
                      const t = trucks.find((x) => x.id === e.target.value);
                      if (t) {
                        setTruckNumber(t.plateNumber);
                        if (t.driverPhone) setDriverPhone(t.driverPhone);
                      }
                    }}
                    className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600"
                  >
                    <option value="">Custom truck</option>
                    {trucks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.plateNumber} ({t.driverName} • {t.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Driver phone & Freight */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Driver Phone
                  </label>
                  <input
                    type="tel"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="0300-1234567"
                    className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono text-[#111827] focus:outline-hidden focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                    Freight / Transport (Rs.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={freight}
                    onChange={(e) => setFreight(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Dispatch Notes / Challan remarks
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Weighbridge slip #4102, driver CNIC verified"
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600"
                />
              </div>

              {/* Immediate Payment & WhatsApp */}
              <div className="space-y-2 pt-2 border-t border-[#E5E5E1]">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={paymentReceivedImmediately}
                    onChange={(e) => setPaymentReceivedImmediately(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-[#E5E5E1] text-teal-800 focus:ring-teal-800 accent-teal-800"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-[#111827] block">
                      Paid on dispatch ({formatCurrency(totalBilled)})
                    </span>
                    <span className="text-[11px] text-[#8E9299]">
                      Automatically credits customer ledger so outstanding balance does not increase.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendWhatsApp}
                    onChange={(e) => setSendWhatsApp(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-[#E5E5E1] text-teal-800 focus:ring-teal-800 accent-teal-800"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-[#111827] flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
                      Queue WhatsApp dispatch alert
                    </span>
                    <span className="text-[11px] text-[#8E9299]">
                      Notifies {customer?.name} with vehicle number and remaining contract balance.
                    </span>
                  </div>
                </label>
              </div>

              {/* Total Summary */}
              <div className="flex items-center justify-between p-4 bg-[#FAF9F6] rounded-2xl border border-[#E5E5E1]">
                <span className="text-xs font-bold text-[#8E9299] uppercase tracking-wider">
                  Total Billable
                </span>
                <span className="text-xl font-bold font-mono text-[#111827]">
                  {formatCurrency(totalBilled)}
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-xs font-bold text-[#8E9299] hover:text-[#111827] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isKgValid || isSuccess}
                  className="px-6 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl shadow-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {isSuccess ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-teal-400" />
                      <span>Dispatched Successfully!</span>
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4 text-teal-400" />
                      <span>Confirm & Generate Challan</span>
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
