import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Package,
  Search,
  Plus,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Building,
  Trash2,
  PackagePlus,
  History,
  Pencil,
} from 'lucide-react';
import { Product } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg } from '../utils/formatters';
import { AnimatedNumber } from '../components/AnimatedNumber';

interface ProductsScreenProps {
  onOpenAddProduct: () => void;
  onOpenBooking: () => void;
  onReceiveStock: (productId?: string) => void;
}

export const ProductsScreen: React.FC<ProductsScreenProps> = ({
  onOpenAddProduct,
  onOpenBooking,
  onReceiveStock,
}) => {
  const { products, suppliers, updateProduct, bookings, dispatches, deleteProduct, setSelectedProductId, can, setEditRequest } = useTrading();
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const pendingBookings = pendingDelete ? bookings.filter((b) => b.productId === pendingDelete.id) : [];
  const pendingDispatches = pendingDelete ? dispatches.filter((d) => d.productId === pendingDelete.id) : [];
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [newStockVal, setNewStockVal] = useState<string>('');

  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category)))];

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const totalWarehouseKg = products.reduce((acc, p) => acc + p.stockKg, 0);
  const totalStockValue = products.reduce((acc, p) => acc + p.stockKg * p.unitPricePerKg, 0);

  const handleSaveStock = (productId: string) => {
    const val = parseFloat(newStockVal);
    if (!isNaN(val) && val >= 0) {
      updateProduct(productId, { stockKg: val });
    }
    setEditingStockId(null);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Metric Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-7 rounded-[32px] border border-[#E5E5E1] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">
              Bulk Commodity Inventory
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif italic font-normal tracking-tight text-[#111827] mt-1.5">Products</h2>
          <p className="text-xs text-[#6B7280] mt-1">
            Commodity catalog with live warehouse stock tracking and Rs./kg market pricing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#FAF9F6] px-5 py-2.5 rounded-2xl border border-[#E5E5E1] text-right">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#8E9299] block">
              Total Stock on Hand
            </span>
            <span className="text-xl font-bold font-mono text-teal-800">
              <AnimatedNumber value={totalWarehouseKg} format="kg" />
            </span>
          </div>

          <button
            onClick={() => onReceiveStock()}
            className="px-4 py-2.5 bg-[#FAF9F6] hover:bg-[#F4F3EF] text-[#111827] font-semibold text-xs rounded-2xl border border-[#E5E5E1] flex items-center gap-1.5 transition-colors"
          >
            <PackagePlus className="w-4 h-4 text-teal-700" />
            <span>Receive Stock</span>
          </button>
          <button
            onClick={onOpenAddProduct}
            className="px-5 py-2.5 bg-[#111827] hover:bg-black text-white font-bold text-xs rounded-2xl shadow-xs flex items-center gap-2 active:scale-95 transition-all border border-[#111827]"
          >
            <Plus className="w-4 h-4 text-teal-400" />
            <span>Add Commodity</span>
          </button>
        </div>
      </div>

      {/* Category Pills & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Category Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-[#111827] text-white shadow-xs font-bold'
                  : 'bg-white text-[#6B7280] hover:text-[#111827] hover:bg-[#FAF9F6] border border-[#E5E5E1]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#8E9299] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search commodities..."
            className="w-full bg-white border border-[#E5E5E1] rounded-2xl pl-10 pr-4 py-2.5 text-xs font-medium text-[#111827] placeholder-[#8E9299] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-xs"
          />
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
        {filteredProducts.map((prod) => {
          const supplier = suppliers.find((s) => s.id === prod.supplierId);
          const activeBookedKg = bookings
            .filter((b) => b.productId === prod.id && b.status === 'active')
            .reduce((acc, b) => acc + b.remainingKg, 0);

          const isLowStock = prod.stockKg <= prod.minThresholdKg;

          return (
            <motion.div
              key={prod.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-w-0 bg-white rounded-[28px] p-6 border border-[#E5E5E1] hover:border-teal-600/50 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#FAF9F6] text-[#6B7280] border border-[#E5E5E1] uppercase tracking-wider">
                      {prod.category}
                    </span>
                    <h3
                      onClick={() => setSelectedProductId(prod.id)}
                      title="Open price history & stock movements"
                      className="font-bold text-base text-[#111827] mt-2 cursor-pointer hover:text-teal-800 transition-colors"
                    >
                      {prod.name}
                    </h3>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                      isLowStock
                        ? 'bg-amber-50 text-amber-900 border-amber-200/80'
                        : 'bg-teal-50 text-teal-900 border-teal-200/80'
                    }`}
                  >
                    {isLowStock ? (
                      <>
                        <AlertTriangle className="w-3 h-3 text-amber-700" />
                        <span>Low Stock</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-teal-700" />
                        <span>In Stock</span>
                      </>
                    )}
                  </span>
                </div>

                {prod.description && (
                  <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">
                    {prod.description}
                  </p>
                )}

                {/* Price & Stock Stats Box */}
                <div className="bg-[#FAF9F6] p-4 rounded-2xl border border-[#E5E5E1] space-y-2.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-[#8E9299]">Market Trading Rate:</span>
                    <span className="text-base font-bold font-mono text-teal-800">
                      Rs. {prod.unitPricePerKg}/kg
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1.5 border-t border-[#E5E5E1] text-xs">
                    <span className="text-[#8E9299]">Warehouse Stock:</span>
                    {editingStockId === prod.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={newStockVal}
                          onChange={(e) => setNewStockVal(e.target.value)}
                          className="w-20 bg-white border border-teal-600 rounded-lg px-2 py-0.5 font-mono text-xs text-[#111827]"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveStock(prod.id)}
                          className="px-2.5 py-0.5 bg-[#111827] text-white rounded-lg text-[10px] font-bold"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-[#111827]">
                          {prod.stockKg.toLocaleString()} kg
                        </span>
                        <button
                          onClick={() => {
                            setEditingStockId(prod.id);
                            setNewStockVal(prod.stockKg.toString());
                          }}
                          className="text-[10px] text-teal-700 hover:text-teal-800 underline font-semibold"
                        >
                          Adjust
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between text-[11px] text-[#8E9299] pt-1">
                    <span>Committed in Active Orders:</span>
                    <span className="font-mono font-medium text-[#111827]">
                      {activeBookedKg} kg
                    </span>
                  </div>
                </div>

                {supplier && (
                  <div className="text-[11px] text-[#8E9299] flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-[#8E9299]" />
                    <span>Primary Supplier: {supplier.company}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[#F0F0EE] flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-[#8E9299] truncate">
                  Total Value: {formatCurrency(prod.stockKg * prod.unitPricePerKg)}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedProductId(prod.id)}
                    title="Price history & stock movements"
                    className="px-2.5 py-1.5 rounded-xl text-[#6B7280] hover:text-teal-800 hover:bg-teal-50 border border-[#E5E5E1] text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">History</span>
                  </button>
                  <button
                        type="button"
                        onClick={() => setEditRequest({ type: 'product', id: prod.id })}
                        title="Edit product"
                        className="p-1.5 rounded-xl text-[#8E9299] hover:text-teal-800 hover:bg-teal-50 border border-transparent hover:border-teal-200 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {can('delete_records') && (<button
                        type="button"
                        onClick={() => setPendingDelete(prod)}
                        title="Delete product (admin)"
                        className="p-1.5 rounded-xl text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>)}
                  <button
                    onClick={onOpenBooking}
                    className="px-3.5 py-1.5 bg-[#111827] hover:bg-black text-white font-bold text-xs rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-teal-400" />
                    <span>Book Order</span>
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name ?? 'product'}?`}
        message="This commodity will be permanently removed from this device and the cloud database."
        details={[
          `${pendingBookings.length} booking(s) and ${pendingDispatches.length} dispatch(es) for this product will be deleted.`,
          'Customer balances for unpaid dispatches of this product are reduced accordingly.',
        ]}
        confirmLabel="Delete Product"
        requireText={pendingBookings.length > 0 ? 'DELETE' : undefined}
        onConfirm={() => {
          if (pendingDelete) deleteProduct(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
