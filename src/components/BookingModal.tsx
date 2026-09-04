import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, X, CheckCircle, Calculator, Package, User } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { formatCurrency } from '../utils/formatters';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedCustomerId?: string | null;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  preselectedCustomerId,
}) => {
  const { customers, products, createBooking } = useTrading();

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

  const selectedProduct = products.find((p) => p.id === productId);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !productId || parsedKg <= 0 || parsedPrice <= 0) return;

    createBooking({
      customerId,
      productId,
      totalKg: parsedKg,
      pricePerKg: parsedPrice,
      targetDeliveryDate,
      notes: notes.trim(),
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
                <h3 className="font-serif italic text-2xl font-normal text-white tracking-tight">New Bulk Booking</h3>
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
                value={customerId}
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
                value={productId}
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
                  step="0.5"
                  min="0.1"
                  value={pricePerKg}
                  onChange={(e) => setPricePerKg(e.target.value)}
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
                disabled={isSuccess}
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
                    <span>Create Booking</span>
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
