import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, X, CheckCircle, Calculator, Package, User } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useEscape } from '../hooks/useEscape';
import { formatCurrency, formatKg } from '../utils/formatters';
import { creditExposure } from '../utils/finance';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedCustomerId?: string | null;
  /** When set, edits the existing booking (quantity, rate, date, notes) instead of creating one. */
  editBookingId?: string | null;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  preselectedCustomerId,
  editBookingId,
}) => {
  const { customers, products, bookings, createBooking, updateBooking, can, logAuditEvent } = useTrading();
  const editing = editBookingId ? bookings.find((b) => b.id === editBookingId) : undefined;
  useEscape(isOpen, onClose);
  const [overrideCredit, setOverrideCredit] = useState<boolean>(false);

  const [customerId, setCustomerId] = useState<string>(
    preselectedCustomerId || (customers[0]?.id || '')
  );
  const [productId, setProductId] = useState<string>(products[0]?.id || '');
  const [kg, setKg] = useState<string>('50000');
  const [pricePerKg, setPricePerKg] = useState<string>(
    products[0]?.unitPricePerKg.toString() || '25'
  );
  const [targetDeliveryDate, setTargetDeliveryDate] = useState<string>(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>('');
  const [brokerName, setBrokerName] = useState<string>('');
  const [brokerRate, setBrokerRate] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!customerId && customers.length > 0) {
      setCustomerId(preselectedCustomerId || customers[0].id);
    }
  }, [customers, customerId, preselectedCustomerId]);

  useEffect(() => {
    if (!productId && products.length > 0) {
      setProductId(products[0].id);
      setPricePerKg(products[0].unitPricePerKg.toString());
    }
  }, [products, productId]);

  // Prefill when editing / reset when opening fresh
  useEffect(() => {
    if (!isOpen) return;
    setOverrideCredit(false);
    setIsSuccess(false);
    if (editing) {
      setCustomerId(editing.customerId);
      setProductId(editing.productId);
      setKg(String(editing.totalKg));
      setPricePerKg(String(editing.pricePerKg));
      setTargetDeliveryDate(editing.targetDeliveryDate || '');
      setNotes(editing.notes || '');
      setBrokerName(editing.brokerName || '');
      setBrokerRate(editing.brokerCommissionPerKg ? String(editing.brokerCommissionPerKg) : '');
    } else {
      setBrokerName('');
      setBrokerRate('');
    }
  }, [isOpen, editBookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProduct = products.find((p) => p.id === productId);
  const selectedCustomer = customers.find((c) => c.id === customerId);

  const handleProductChange = (prodId: string) => {
    setProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      setPricePerKg(prod.unitPricePerKg.toString());
    }
  };

  const parsedKg = Math.max(0, parseFloat(kg) || 0);
  const parsedPrice = Math.max(0, parseFloat(pricePerKg) || 0);
  const totalContractAmount = parsedKg * parsedPrice;

  // Credit control: outstanding + committed active bookings + this contract vs the customer's limit.
  const exposure = selectedCustomer ? creditExposure(selectedCustomer, bookings.filter((b) => b.id !== editBookingId)) : null;
  const projected = exposure ? exposure.exposure + totalContractAmount : 0;
  const creditBreached = Boolean(exposure && exposure.limit > 0 && projected > exposure.limit);
  const stockShort = Boolean(selectedProduct && parsedKg > selectedProduct.stockKg);
  const minKg = editing ? editing.dispatchedKg : 0;
  const kgTooLow = editing ? parsedKg < minKg : false;
  const blocked = (creditBreached && !(can('override_credit') && overrideCredit)) || kgTooLow;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !productId || parsedKg <= 0 || parsedPrice <= 0 || blocked) return;

    if (creditBreached && overrideCredit) {
      logAuditEvent('Credit Limit Overridden', `${selectedCustomer?.name}: projected exposure ${formatCurrency(projected)} vs limit ${formatCurrency(exposure?.limit || 0)}.`, 'warning');
    }

    if (editing) {
      updateBooking(editing.id, {
        totalKg: parsedKg,
        pricePerKg: can('edit_prices') ? parsedPrice : editing.pricePerKg,
        targetDeliveryDate: targetDeliveryDate || undefined,
        notes: notes.trim() || undefined,
        brokerName: brokerName.trim() || undefined,
        brokerCommissionPerKg: parseFloat(brokerRate) || undefined,
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 700);
      return;
    }

    createBooking({
      customerId,
      productId,
      totalKg: parsedKg,
      pricePerKg: parsedPrice,
      targetDeliveryDate,
      notes: notes.trim(),
      brokerName: brokerName.trim() || undefined,
      brokerCommissionPerKg: parseFloat(brokerRate) || undefined,
    });

    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1000);
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
          className="relative bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden z-10 my-8"
        >
          {/* Header */}
          <div className="px-7 py-6 bg-[#111827] text-white flex items-center justify-between border-b border-[#262626]">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-teal-400">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif italic text-2xl font-normal text-white tracking-tight">{editing ? `Edit ${editing.bookingNumber}` : 'New Bulk Booking'}</h3>
                <p className="text-xs text-[#9CA3AF]">Creates contract & starts live tracking</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-7 space-y-4">
            {/* Customer Select */}
            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#8E9299]" />
                Customer *
              </label>
              <select
                value={customerId} disabled={Boolean(editing)}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition-all"
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.company} (Due: {formatCurrency(c.totalDue)})
                  </option>
                ))}
              </select>
            </div>

            {/* Product Select */}
            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-[#8E9299]" />
                Commodity / Product *
              </label>
              <select
                value={productId} disabled={Boolean(editing)}
                onChange={(e) => handleProductChange(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition-all"
                required
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category}) — Stock: {p.stockKg} kg
                  </option>
                ))}
              </select>
            </div>

            {/* kg & Rate */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Total Order Quantity (kg) *
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={kg}
                  onChange={(e) => setKg(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Agreed Rate (Rs./kg) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={pricePerKg}
                  onChange={(e) => setPricePerKg(e.target.value)}
                  disabled={Boolean(editing) && !can('edit_prices')}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  required
                />
              </div>
            </div>

            {/* Smart Contract Value Highlight */}
            <div className="bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest block">
                  Total Booking Contract Value
                </span>
                <span className="text-2xl font-bold font-mono text-teal-800">
                  {formatCurrency(totalContractAmount)}
                </span>
              </div>
              <div className="text-right text-xs text-[#6B7280]">
                <span className="font-mono text-[#111827] font-bold">{parsedKg} kg</span>
                <span className="block text-[11px]">@ Rs. {parsedPrice}/kg</span>
              </div>
            </div>

            {/* Credit control & stock warnings */}
            {exposure && (
              <div className={`rounded-2xl p-3.5 border text-xs space-y-1.5 ${creditBreached ? 'bg-rose-50 border-rose-200' : 'bg-[#FAF9F6] border-[#E5E5E1]'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-bold flex items-center gap-1.5 ${creditBreached ? 'text-rose-800' : 'text-[#374151]'}`}>
                    {creditBreached ? <ShieldAlert className="w-3.5 h-3.5" /> : null}
                    Credit exposure after this booking
                  </span>
                  <span className={`font-mono font-bold ${creditBreached ? 'text-rose-800' : 'text-[#111827]'}`}>
                    {formatCurrency(projected)} / {exposure.limit > 0 ? formatCurrency(exposure.limit) : 'no limit'}
                  </span>
                </div>
                <div className="text-[11px] text-[#6B7280] font-mono">
                  Outstanding {formatCurrency(exposure.outstanding)} + committed {formatCurrency(exposure.committed)} + this {formatCurrency(totalContractAmount)}
                </div>
                {creditBreached && (
                  can('override_credit') ? (
                    <label className="flex items-center gap-2 pt-1 cursor-pointer text-rose-900 font-semibold">
                      <input type="checkbox" checked={overrideCredit} onChange={(e) => setOverrideCredit(e.target.checked)} className="w-4 h-4 accent-rose-600" />
                      Override the credit limit (logged in the audit trail)
                    </label>
                  ) : (
                    <div className="text-rose-800 font-semibold pt-1">Over the credit limit. Ask a manager or admin to approve this booking.</div>
                  )
                )}
              </div>
            )}
            {stockShort && selectedProduct && (
              <div className="rounded-2xl p-3 border bg-amber-50 border-amber-200 text-[11px] text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Only {formatKg(selectedProduct.stockKg)} in stock; {formatKg(parsedKg - selectedProduct.stockKg)} will need to be received before the order can be fully dispatched.
              </div>
            )}
            {kgTooLow && (
              <div className="rounded-2xl p-3 border bg-rose-50 border-rose-200 text-[11px] text-rose-900">
                Quantity cannot be below the {formatKg(minKg)} already dispatched.
              </div>
            )}

            {/* Broker / agent */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">Broker / agent</label>
                <input value={brokerName} onChange={(e) => setBrokerName(e.target.value)} placeholder="Optional" className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">Commission (Rs./kg)</label>
                <input type="number" min="0" step="0.01" value={brokerRate} onChange={(e) => setBrokerRate(e.target.value)} placeholder="0" className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600" />
                {parseFloat(brokerRate) > 0 && <p className="text-[10px] text-[#8E9299] mt-1 font-mono">≈ {formatCurrency(parsedKg * (parseFloat(brokerRate) || 0))} on the full order, accrued as dispatched</p>}
              </div>
            </div>

            {/* Target Date & Notes */}
            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                Target Delivery Date
              </label>
              <input
                type="date"
                value={targetDeliveryDate}
                onChange={(e) => setTargetDeliveryDate(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs text-[#111827] font-mono focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                Delivery / Logistics Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Delivery in 50-kg tipper trucks to central terminal berth."
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {/* Submit */}
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
                disabled={isSuccess || blocked}
                className="px-6 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl shadow-xs flex items-center gap-2 transition-all active:scale-95 border border-[#111827]"
              >
                {isSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-teal-400" />
                    <span>Booking Created!</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4 text-teal-400" />
                    <span>{editing ? 'Save Changes' : 'Create Booking'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
