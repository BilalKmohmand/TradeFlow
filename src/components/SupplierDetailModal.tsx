import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Trash2,
  PackagePlus,
  ArrowDownLeft,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Package,
  Layers,
  ArrowUpRight,
  Send,
  ExternalLink,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { ConfirmDialog } from './ConfirmDialog';
import { formatCurrency, formatDate, formatKg } from '../utils/formatters';
import { AnimatedNumber } from './AnimatedNumber';

interface SupplierDetailModalProps {
  supplierId: string | null;
  onClose: () => void;
  onOpenPayment?: (supplierId: string) => void;
  onReceiveStock?: (supplierId: string) => void;
}

export const SupplierDetailModal: React.FC<SupplierDetailModalProps> = ({
  supplierId,
  onClose,
  onOpenPayment,
  onReceiveStock,
}) => {
  const { suppliers, products, ledger, purchases, deleteSupplier, setSelectedProductId } = useTrading();
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  const supplier = suppliers.find((s) => s.id === supplierId);

  if (!supplier) return null;

  const supplierProducts = products.filter((p) => p.supplierId === supplier.id);
  const supplierLedger = ledger.filter(
    (l) => l.entityType === 'supplier' && l.entityId === supplier.id
  );
  const supplierPurchases = purchases
    .filter((p) => p.supplierId === supplier.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const receivedKg = supplierPurchases.reduce((a, p) => a + p.kg, 0);
  const receivedValue = supplierPurchases.reduce((a, p) => a + p.amount, 0);

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
          className="relative bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden z-10 my-8 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="p-7 bg-[#111827] text-white flex items-start justify-between border-b border-[#262626]">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/10 text-teal-400 border border-white/10 uppercase tracking-widest">
                  Commodity Supplier
                </span>
                <span className="text-xs text-[#9CA3AF]">Since {formatDate(supplier.createdAt)}</span>
              </div>
              <h2 className="text-3xl font-serif italic font-normal tracking-tight text-white">{supplier.name}</h2>
              <p className="text-xs text-[#9CA3AF] font-medium">{supplier.company}</p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete supplier (admin)"
                className="text-[#9CA3AF] hover:text-rose-400 p-2 rounded-2xl hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Metrics & Actions */}
          <div className="p-7 bg-[#FAF9F6] border-b border-[#E5E5E1] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E5E5E1] shadow-xs">
              <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">
                Total Payables Owed
              </div>
              <div className="text-2xl font-bold font-mono text-[#111827] mt-1.5">
                <AnimatedNumber value={supplier.totalOwed} format="currency" />
              </div>
              <div className="text-[11px] text-[#8E9299] mt-1">
                Category: {supplier.materialCategory}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E5E5E1] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Quick Actions</span>
                <button
                  onClick={() => {
                    const clean = supplier.phone.replace(/[^0-9]/g, '');
                    window.open(`https://wa.me/${clean}`, '_blank');
                  }}
                  className="text-xs text-teal-700 hover:text-teal-800 flex items-center gap-1 font-bold"
                >
                  <span>WhatsApp</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  onClick={() => onOpenPayment?.(supplier.id)}
                  className="w-full bg-[#111827] hover:bg-black text-white font-bold text-xs py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 shadow-xs transition-all border border-[#111827]"
                >
                  <CreditCard className="w-3.5 h-3.5 text-teal-400" />
                  <span>Pay ({formatCurrency(supplier.totalOwed)})</span>
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onReceiveStock?.(supplier.id);
                  }}
                  className="w-full bg-[#FAF9F6] hover:bg-[#F0F0EE] text-[#111827] font-bold text-xs py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 border border-[#E5E5E1] transition-colors"
                >
                  <PackagePlus className="w-3.5 h-3.5 text-teal-700" />
                  <span>Receive Stock</span>
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-7 space-y-6 bg-[#FAF9F6]">
            {/* Contact Details */}
            <div className="bg-white p-6 rounded-2xl border border-[#E5E5E1] shadow-xs space-y-3">
              <h4 className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">
                Supplier Profile & Contact
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="flex items-center gap-2.5 text-[#111827]">
                  <Phone className="w-4 h-4 text-teal-700 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold text-[#8E9299] uppercase tracking-wider block">Direct Line</span>
                    <span className="font-bold text-[#111827] font-mono">{supplier.phone}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 text-[#111827]">
                  <Mail className="w-4 h-4 text-teal-700 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold text-[#8E9299] uppercase tracking-wider block">Orders Email</span>
                    <span className="font-semibold text-[#111827]">{supplier.email}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 text-[#111827] sm:col-span-2">
                  <MapPin className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-bold text-[#8E9299] uppercase tracking-wider block">Terminal / Loading Berth</span>
                    <span className="font-medium text-[#111827]">{supplier.address}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Commodities Sourced */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">
                Supplied Commodities
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {supplierProducts.length === 0 && (
                  <div className="sm:col-span-2 text-xs text-[#8E9299] bg-white p-4 rounded-2xl border border-[#E5E5E1]">No products are linked to this supplier yet.</div>
                )}
                {supplierProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      onClose();
                      setSelectedProductId(p.id);
                    }}
                    title="Open product price history"
                    className="bg-white p-5 rounded-2xl border border-[#E5E5E1] shadow-xs space-y-1.5 cursor-pointer hover:border-teal-600/50 transition-colors"
                  >
                    <div className="font-bold text-xs text-[#111827]">{p.name}</div>
                    <div className="text-[11px] text-[#8E9299]">{p.category}</div>
                    <div className="flex items-center justify-between text-xs font-mono pt-1 text-teal-800 font-bold">
                      <span>Rs. {p.unitPricePerKg}/kg</span>
                      <span>Stock: {p.stockKg} kg</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stock received from this supplier */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1.5">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-teal-700" /> Stock Received ({supplierPurchases.length})
                </h4>
                <span className="text-[11px] font-mono text-[#6B7280]">{formatKg(receivedKg)} • {formatCurrency(receivedValue)}</span>
              </div>
              <div className="bg-white rounded-2xl border border-[#E5E5E1] overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF9F6] border-b border-[#E5E5E1] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Receipt #</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Product</th>
                        <th className="py-3 px-4 text-right">kg</th>
                        <th className="py-3 px-4 text-right">Rs./kg</th>
                        <th className="py-3 px-4 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#FAF9F6] font-mono">
                      {supplierPurchases.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-[#8E9299] font-sans">No stock received from this supplier yet.</td>
                        </tr>
                      ) : (
                        supplierPurchases.map((p) => {
                          const prod = products.find((x) => x.id === p.productId);
                          return (
                            <tr key={p.id} className="hover:bg-[#FAF9F6] transition-colors">
                              <td className="py-2.5 px-4 font-bold text-[#111827]">{p.receiptNumber}{p.truckNumber && <span className="block text-[10px] text-[#8E9299] font-normal">{p.truckNumber}</span>}</td>
                              <td className="py-2.5 px-4 text-[#6B7280] whitespace-nowrap">{formatDate(p.date)}</td>
                              <td className="py-2.5 px-4 font-sans">
                                <button onClick={() => { onClose(); setSelectedProductId(p.productId); }} className="text-[#111827] hover:text-teal-800 hover:underline">{prod?.name || 'Unknown'}</button>
                              </td>
                              <td className="py-2.5 px-4 text-right font-bold text-teal-800">+{formatKg(p.kg)}</td>
                              <td className="py-2.5 px-4 text-right text-[#374151]">{p.pricePerKg}</td>
                              <td className="py-2.5 px-4 text-right text-[#111827]">{formatCurrency(p.amount)}{p.paymentMadeImmediately && <span className="block text-[10px] text-teal-700 font-sans">paid</span>}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Ledger Transactions */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">
                Supplier Ledger & Settlements
              </h4>
              <div className="bg-white rounded-2xl border border-[#E5E5E1] overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9F6] border-b border-[#E5E5E1] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4 text-right">Debit</th>
                      <th className="py-3 px-4 text-right">Credit</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF9F6] font-mono">
                    {supplierLedger.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[#8E9299] font-sans">
                          No transaction history recorded yet.
                        </td>
                      </tr>
                    ) : (
                      supplierLedger.map((l) => (
                        <tr key={l.id} className="hover:bg-[#FAF9F6] transition-colors">
                          <td className="py-3 px-4 text-[#6B7280]">{formatDate(l.date)}</td>
                          <td className="py-3 px-4 font-sans font-medium text-[#111827]">
                            {l.description}
                          </td>
                          <td className="py-3 px-4 text-right text-[#111827] font-semibold">
                            {l.debit > 0 ? formatCurrency(l.debit) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right text-teal-700 font-semibold">
                            {l.credit > 0 ? formatCurrency(l.credit) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-[#111827]">
                            {formatCurrency(l.balanceAfter)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

    </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete ${supplier.name}?`}
        message={`${supplier.company} will be permanently removed from this device and the cloud database.`}
        details={[
          `${supplierProducts.length} product(s) will be kept but unlinked from this supplier.`,
          'Supplier ledger entries and WhatsApp logs are removed.',
          `Payable balance being written off: ${formatCurrency(supplier.totalOwed)}.`,
        ]}
        confirmLabel="Delete Supplier"
        onConfirm={() => {
          setConfirmDelete(false);
          deleteSupplier(supplier.id);
          onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
};
