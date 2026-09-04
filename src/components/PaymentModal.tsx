import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CreditCard, X, CheckCircle, ArrowDownLeft, ArrowUpRight, DollarSign } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useEscape } from '../hooks/useEscape';
import { formatCurrency } from '../utils/formatters';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'customer' | 'supplier';
  preselectedEntityId?: string | null;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  entityType,
  preselectedEntityId,
}) => {
  const {
    customers,
    suppliers,
    recordCustomerPayment,
    recordSupplierPayment,
  } = useTrading();

  useEscape(isOpen, onClose);
  const [selectedId, setSelectedId] = useState<string>(
    preselectedEntityId || (entityType === 'customer' ? customers[0]?.id || '' : suppliers[0]?.id || '')
  );
  const [amount, setAmount] = useState<string>('5000');
  const [paymentMethod, setPaymentMethod] = useState<string>('Wire Transfer / RTGS');
  const [notes, setNotes] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedId) {
      if (entityType === 'customer' && customers.length > 0) {
        setSelectedId(preselectedEntityId || customers[0].id);
      } else if (entityType === 'supplier' && suppliers.length > 0) {
        setSelectedId(preselectedEntityId || suppliers[0].id);
      }
    }
  }, [customers, suppliers, entityType, preselectedEntityId, selectedId]);

  const activeCustomer = customers.find((c) => c.id === selectedId);
  const activeSupplier = suppliers.find((s) => s.id === selectedId);

  const currentOutstanding =
    entityType === 'customer'
      ? activeCustomer?.totalDue || 0
      : activeSupplier?.totalOwed || 0;

  const parsedAmount = Math.max(0, parseFloat(amount) || 0);
  const remainingBalanceAfter = Math.max(0, Number((currentOutstanding - parsedAmount).toFixed(2)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || parsedAmount <= 0) return;

    if (entityType === 'customer') {
      recordCustomerPayment(selectedId, parsedAmount, `${paymentMethod}${notes ? ` - ${notes}` : ''}`);
    } else {
      recordSupplierPayment(selectedId, parsedAmount, `${paymentMethod}${notes ? ` - ${notes}` : ''}`);
    }

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
          className="relative bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden z-10 my-8"
        >
          {/* Header */}
          <div className="px-7 py-6 bg-[#111827] text-white flex items-center justify-between border-b border-[#262626]">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-teal-400">
                {entityType === 'customer' ? (
                  <ArrowDownLeft className="w-5 h-5 text-teal-400" />
                ) : (
                  <ArrowUpRight className="w-5 h-5 text-indigo-300" />
                )}
              </div>
              <div>
                <h3 className="font-serif italic text-2xl font-normal text-white tracking-tight">
                  {entityType === 'customer' ? 'Receive Customer Payment' : 'Pay Supplier'}
                </h3>
                <p className="text-xs text-[#9CA3AF]">
                  Updates ledger & recalculates balance automatically
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

          <form onSubmit={handleSubmit} className="p-7 space-y-4">
            {/* Entity Select */}
            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                {entityType === 'customer' ? 'Select Customer *' : 'Select Supplier *'}
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                required
              >
                {entityType === 'customer'
                  ? customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.company} (Due: {formatCurrency(c.totalDue)})
                      </option>
                    ))
                  : suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.company} (Owed: {formatCurrency(s.totalOwed)})
                      </option>
                    ))}
              </select>
            </div>

            {/* Current Balance & Amount */}
            <div className="bg-[#FAF9F6] rounded-2xl p-4 border border-[#E5E5E1] space-y-2">
              <div className="flex justify-between text-xs text-[#6B7280]">
                <span>Current Outstanding:</span>
                <span className="font-bold text-[#111827] font-mono">
                  {formatCurrency(currentOutstanding)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-teal-800 font-bold pt-2 border-t border-[#E5E5E1]">
                <span>New Balance After Payment:</span>
                <span className="font-bold font-mono text-sm">
                  {formatCurrency(remainingBalanceAfter)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                Payment Amount (Rs.) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:bg-white pl-8"
                  required
                />
                <span className="absolute left-3.5 top-2.5 text-[#8E9299] font-bold text-xs">
                  Rs.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                >
                  <option value="Wire Transfer / RTGS">Wire Transfer</option>
                  <option value="Direct Deposit / ACH">Direct ACH</option>
                  <option value="Company Cheque">Cheque</option>
                  <option value="Letter of Credit (LC)">Letter of Credit</option>
                  <option value="Cash at Terminal">Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest">
                  Reference / Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Bank Ref #9921"
                  className="w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2 text-xs text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
              </div>
            </div>

            {/* Submit Buttons */}
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
                disabled={isSuccess || parsedAmount <= 0}
                className="px-6 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl shadow-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 border border-[#111827]"
              >
                {isSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-teal-400" />
                    <span>Recorded!</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 text-teal-400" />
                    <span>Record Payment ({formatCurrency(parsedAmount)})</span>
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
