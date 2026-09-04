import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, X, CheckCircle } from 'lucide-react';
import { useTrading } from '../context/TradingContext';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  editId?: string | null;
}

export const SupplierModal: React.FC<SupplierModalProps> = ({ isOpen, onClose, editId }) => {
  const { addSupplier, updateSupplier, suppliers } = useTrading();
  const editing = editId ? suppliers.find((s) => s.id === editId) : undefined;

  const [name, setName] = useState<string>('');
  const [company, setCompany] = useState<string>('');
  const [phone, setPhone] = useState<string>('+92 300 ');
  const [email, setEmail] = useState<string>('');
  const [materialCategory, setMaterialCategory] = useState<string>('Cement & Building Materials');
  const [address, setAddress] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [dupError, setDupError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(editing?.name || '');
    setCompany(editing?.company || '');
    setPhone(editing?.phone || '+92 300 ');
    setEmail(editing?.email || '');
    setMaterialCategory(editing?.materialCategory || 'Cement & Building Materials');
    setAddress(editing?.address || '');
    setIsSuccess(false);
  }, [isOpen, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !company || !phone) return;
    const digits = phone.replace(/[^0-9]/g, '');
    const dup = suppliers.find((s) => s.id !== editId && s.phone.replace(/[^0-9]/g, '') === digits);
    if (dup) {
      setDupError(`${dup.company} already uses this phone number.`);
      return;
    }
    setDupError(null);

    if (editing) {
      updateSupplier(editing.id, { name: name.trim(), company: company.trim(), phone: phone.trim(), email: email.trim(), materialCategory, address: address.trim() });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 600);
      return;
    }

    addSupplier({
      name: name.trim(),
      company: company.trim(),
      phone: phone.trim(),
      email: email.trim() || `orders@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.pk`,
      materialCategory,
      address: address.trim() || 'Port Qasim, Karachi',
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
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif italic text-2xl font-normal text-white tracking-tight">Add Commodity Supplier</h3>
                <p className="text-xs text-[#9CA3AF]">Manage supplier accounts & purchase ledgers</p>
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
                Contact Person Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Muhammad Aslam"
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                Supplier Company Name *
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Lucky Cement"
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:bg-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Phone / WhatsApp # *
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 300 1234567"
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs font-mono text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Material Category
                </label>
                <select
                  value={materialCategory}
                  onChange={(e) => setMaterialCategory(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                >
                  <option value="Cement & Building Materials">Cement & Materials</option>
                  <option value="Agricultural Commodities">Agricultural Grains</option>
                  <option value="Energy & Solid Fuels">Solid Fuels & Coal</option>
                  <option value="Metals & Alloys">Metals & Steel</option>
                  <option value="Minerals & Aggregates">Minerals & Aggregates</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                Orders Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="orders@luckycement.com.pk"
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                Loading Berth / Terminal Address
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Port Qasim / Gadani Terminal..."
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {dupError && <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">{dupError}</div>}
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
                    <span>Supplier Created!</span>
                  </>
                ) : (
                  <span>{editing ? 'Save Changes' : 'Create Supplier'}</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
