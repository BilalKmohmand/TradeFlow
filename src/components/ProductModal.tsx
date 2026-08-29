import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, X, CheckCircle } from 'lucide-react';
import { useTrading } from '../context/TradingContext';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({ isOpen, onClose }) => {
  const { suppliers, addProduct } = useTrading();

  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('Construction & Cement');
  const [unitPricePerTon, setUnitPricePerTon] = useState<string>('150');
  const [stockTons, setStockTons] = useState<string>('500');
  const [minThresholdTons, setMinThresholdTons] = useState<string>('100');
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [description, setDescription] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!supplierId && suppliers.length > 0) {
      setSupplierId(suppliers[0].id);
    }
  }, [suppliers, supplierId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !unitPricePerTon || !stockTons) return;

    addProduct({
      name: name.trim(),
      category,
      unitPricePerTon: parseFloat(unitPricePerTon) || 0,
      stockTons: parseFloat(stockTons) || 0,
      minThresholdTons: parseFloat(minThresholdTons) || 0,
      supplierId: supplierId || undefined,
      description: description.trim(),
    });

    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 800);
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
          className="relative bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden z-10 my-8"
        >
          <div className="px-7 py-6 bg-[#111827] text-white flex items-center justify-between border-b border-[#262626]">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-teal-400">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif italic text-2xl font-normal text-white tracking-tight">Add Bulk Commodity</h3>
                <p className="text-xs text-[#9CA3AF]">Track inventory and trading pricing</p>
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
            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                Product / Commodity Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Copper Cathodes Grade A"
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:bg-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                >
                  <option value="Construction & Cement">Construction & Cement</option>
                  <option value="Agricultural Grains">Agricultural Grains</option>
                  <option value="Solid Fuels & Energy">Solid Fuels & Energy</option>
                  <option value="Metals & Alloys">Metals & Alloys</option>
                  <option value="Minerals & Aggregates">Minerals & Aggregates</option>
                  <option value="Chemicals & Fertilizers">Chemicals & Fertilizers</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">Supplier</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                >
                  <option value="">None / Direct</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.company}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Unit Price (Rs./Ton) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={unitPricePerTon}
                  onChange={(e) => setUnitPricePerTon(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Current Stock (Tons) *
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={stockTons}
                  onChange={(e) => setStockTons(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Quality specifications, moisture limit, packaging specs..."
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </div>

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
                    <span>Added!</span>
                  </>
                ) : (
                  <span>Save Commodity</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
