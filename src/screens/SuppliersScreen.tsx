import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Layers,
  Search,
  Plus,
  Phone,
  Building,
  CreditCard,
  ArrowRight,
  ExternalLink,
  Trash2,
  Pencil,
} from 'lucide-react';
import { Supplier } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PurchaseOrdersPanel } from '../components/TradeDocsPanels';
import { useTrading } from '../context/TradingContext';
import { formatCurrency } from '../utils/formatters';
import { AnimatedNumber } from '../components/AnimatedNumber';

interface SuppliersScreenProps {
  onSelectSupplier: (supplierId: string) => void;
  onOpenAddSupplier: () => void;
  onOpenPayment: (supplierId: string) => void;
  onReceiveStock: (opts: { supplierId?: string; productId?: string; purchaseOrderId?: string }) => void;
}

export const SuppliersScreen: React.FC<SuppliersScreenProps> = ({
  onSelectSupplier,
  onOpenAddSupplier,
  onOpenPayment,
  onReceiveStock,
}) => {
  const { suppliers, products, deleteSupplier, can, setEditRequest, purchaseOrders, requestedSuppliersView } = useTrading();
  const [view, setView] = React.useState<'suppliers' | 'orders'>(requestedSuppliersView || 'suppliers');
  React.useEffect(() => {
    if (requestedSuppliersView) setView(requestedSuppliersView);
  }, [requestedSuppliersView]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);
  const pendingProducts = pendingDelete ? products.filter((p) => p.supplierId === pendingDelete.id) : [];

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.materialCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.includes(searchQuery)
  );

  const totalPayables = suppliers.reduce((acc, s) => acc + s.totalOwed, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Metric Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-7 rounded-[32px] border border-[#E5E5E1] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Accounts Payable
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif italic font-normal tracking-tight text-[#111827] mt-1.5">Suppliers</h2>
          <p className="text-xs text-[#6B7280] mt-1">
            Bulk material suppliers, loading terminal details, and outstanding payables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-[#FAF9F6] px-5 py-2.5 rounded-2xl border border-[#E5E5E1] text-right flex-1 sm:flex-none min-w-[150px]">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#8E9299] block">Total Owed</span>
            <span className="text-xl font-bold font-mono text-[#111827]">
              <AnimatedNumber value={totalPayables} format="currency" />
            </span>
          </div>

          <button
            onClick={onOpenAddSupplier}
            className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white font-bold text-xs rounded-2xl shadow-xs flex items-center justify-center gap-2 active:scale-95 transition-all border border-[#111827] flex-1 sm:flex-none whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-teal-400" />
            <span>Add Supplier</span>
          </button>
        </div>
      </div>

      <div className="bg-[#FAF9F6] p-1.5 rounded-full border border-[#E5E5E1] shadow-xs text-xs font-semibold flex flex-wrap items-center gap-1 w-fit max-w-full">
        {([['suppliers', `Suppliers (${suppliers.length})`], ['orders', `Purchase Orders (${purchaseOrders.filter((p) => p.status === 'open' || p.status === 'partial').length} open)`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-colors ${view === id ? 'bg-[#111827] text-white shadow-xs font-bold' : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F4F3EF]'}`}>{label}</button>
        ))}
      </div>

      {view === 'orders' && <PurchaseOrdersPanel onReceive={onReceiveStock} />}

      {view === 'suppliers' && (<>
      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#8E9299] absolute left-4 top-3.5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search suppliers by name, company, or commodity category..."
          className="w-full bg-white border border-[#E5E5E1] rounded-2xl pl-11 pr-4 py-3 text-xs font-medium text-[#111827] placeholder-[#8E9299] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-xs"
        />
      </div>

      {/* Suppliers Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
        {filteredSuppliers.length === 0 ? (
          <div className="col-span-full py-16 text-center text-[#8E9299] bg-white rounded-[32px] border border-[#E5E5E1]">
            <Layers className="w-10 h-10 mx-auto mb-2 text-[#8E9299]" />
            <p className="text-sm font-semibold text-[#111827]">No suppliers found</p>
            <p className="text-xs text-[#8E9299] mt-1">Try adjusting your search criteria.</p>
          </div>
        ) : (
          filteredSuppliers.map((sup) => {
            const suppliedProducts = products.filter((p) => p.supplierId === sup.id);

            return (
              <motion.div
                key={sup.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="min-w-0 bg-white rounded-[28px] p-6 border border-[#E5E5E1] hover:border-teal-600/50 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3
                        onClick={() => onSelectSupplier(sup.id)}
                        className="font-bold text-base text-[#111827] group-hover:text-teal-800 cursor-pointer transition-colors"
                      >
                        {sup.name}
                      </h3>
                      <p className="text-xs font-medium text-[#8E9299] flex items-center gap-1 mt-0.5">
                        <Building className="w-3.5 h-3.5 text-[#8E9299]" />
                        {sup.company}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#FAF9F6] text-[#111827] border border-[#E5E5E1] uppercase tracking-wider">
                        {sup.materialCategory.split('&')[0]}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditRequest({ type: 'supplier', id: sup.id })}
                        title="Edit supplier"
                        className="p-1.5 rounded-xl text-[#8E9299] hover:text-teal-800 hover:bg-teal-50 border border-transparent hover:border-teal-200 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {can('delete_records') && (<button
                        type="button"
                        onClick={() => setPendingDelete(sup)}
                        title="Delete supplier (admin)"
                        className="p-1.5 rounded-xl text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>)}
                    </div>
                  </div>

                  <div className="bg-[#FAF9F6] p-4 rounded-2xl border border-[#E5E5E1] space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-[#8E9299]">Total Owed by Us:</span>
                      <span className="text-lg font-bold font-mono text-[#111827]">
                        <AnimatedNumber value={sup.totalOwed} format="currency" />
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-[#8E9299] pt-1.5 border-t border-[#E5E5E1]">
                      <span>Products Sourced: {suppliedProducts.length}</span>
                      <span className="truncate max-w-[150px]">{sup.address.split(',')[0]}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#4B5563]">
                    <span className="flex items-center gap-1.5 font-mono">
                      <Phone className="w-3.5 h-3.5 text-teal-700" />
                      {sup.phone}
                    </span>
                    <button
                      onClick={() => {
                        const clean = sup.phone.replace(/[^0-9]/g, '');
                        window.open(`https://wa.me/${clean}`, '_blank');
                      }}
                      className="text-[11px] text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1"
                    >
                      <span>WhatsApp</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#F0F0EE]">
                  <button
                    onClick={() => onOpenPayment(sup.id)}
                    className="w-full bg-[#FAF9F6] hover:bg-[#F4F3EF] text-[#111827] border border-[#E5E5E1] font-semibold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1 transition-colors"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-[#8E9299]" />
                    <span>Pay</span>
                  </button>

                  <button
                    onClick={() => onSelectSupplier(sup.id)}
                    className="w-full bg-[#111827] hover:bg-black text-white font-bold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1 shadow-xs transition-colors"
                  >
                    <span>Ledger</span>
                    <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      </>)}

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name ?? 'supplier'}?`}
        message={`${pendingDelete?.company ?? ''} will be permanently removed from this device and the cloud database.`}
        details={[
          `${pendingProducts.length} product(s) will be kept but unlinked from this supplier.`,
          'Supplier ledger entries and WhatsApp logs are removed.',
          `Payable balance being written off: ${formatCurrency(pendingDelete?.totalOwed ?? 0)}.`,
        ]}
        confirmLabel="Delete Supplier"
        onConfirm={() => {
          if (pendingDelete) deleteSupplier(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
