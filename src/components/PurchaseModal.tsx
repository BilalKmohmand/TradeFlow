import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, PackagePlus, CheckCircle, AlertCircle, Truck } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg } from '../utils/formatters';
import { todayISO } from '../utils/stockFlow';

interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedSupplierId?: string | null;
  preselectedProductId?: string | null;
  preselectedPurchaseOrderId?: string | null;
}

const inputCls =
  'w-full bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#111827] focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600';
const labelCls = 'block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest';

/** "Receive Stock": books incoming goods from a supplier, increases stock and the supplier payable. */
export const PurchaseModal: React.FC<PurchaseModalProps> = ({
  isOpen,
  onClose,
  preselectedSupplierId,
  preselectedProductId,
  preselectedPurchaseOrderId,
}) => {
  const { suppliers, products, addPurchase, purchaseOrders } = useTrading();
  const [poId, setPoId] = useState<string>('');
  const openPOs = purchaseOrders.filter((p) => p.status === 'open' || p.status === 'partial');
  const applyPO = (id: string) => {
    setPoId(id);
    const po = purchaseOrders.find((p) => p.id === id);
    if (po) {
      setSupplierId(po.supplierId);
      setProductId(po.productId);
      setPricePerKg(String(po.pricePerKg));
      setKg(String(Math.max(0, po.kg - po.receivedKg)));
    }
  };

  const [supplierId, setSupplierId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [kg, setKg] = useState<string>('20000');
  const [pricePerKg, setPricePerKg] = useState<string>('');
  const [date, setDate] = useState<string>(todayISO());
  const [truckNumber, setTruckNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [paid, setPaid] = useState<boolean>(false);
  const [grossKg, setGrossKg] = useState<string>('');
  const [tareKg, setTareKg] = useState<string>('');
  const applyWeights = (g: string, t: string) => {
    setGrossKg(g);
    setTareKg(t);
    const gv = parseFloat(g);
    const tv = parseFloat(t);
    if (!isNaN(gv) && !isNaN(tv) && gv > tv) setKg(String(Math.round((gv - tv) * 100) / 100));
  };
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form each time the modal opens, honouring preselections.
  useEffect(() => {
    if (!isOpen) return;
    const firstProduct = products.find((p) => p.id === preselectedProductId) || products[0];
    const supplierFromProduct = firstProduct?.supplierId ? suppliers.find((s) => s.id === firstProduct.supplierId) : undefined;
    const sup = suppliers.find((s) => s.id === preselectedSupplierId) || supplierFromProduct || suppliers[0];
    setSupplierId(sup?.id || '');
    setProductId(firstProduct?.id || '');
    setPricePerKg(firstProduct ? String(firstProduct.unitPricePerKg) : '');
    setKg('20000');
    setDate(todayISO());
    setTruckNumber('');
    setNotes('');
    setPaid(false);
    setGrossKg('');
    setTareKg('');
    setIsSuccess(false);
    setError(null);
    setPoId('');
    if (preselectedPurchaseOrderId) {
      const po = purchaseOrders.find((p) => p.id === preselectedPurchaseOrderId);
      if (po) {
        setPoId(po.id);
        setSupplierId(po.supplierId);
        setProductId(po.productId);
        setPricePerKg(String(po.pricePerKg));
        setKg(String(Math.max(0, po.kg - po.receivedKg)));
      }
    }
  }, [isOpen, preselectedSupplierId, preselectedProductId, products, suppliers]);

  const product = products.find((p) => p.id === productId);
  const supplier = suppliers.find((s) => s.id === supplierId);
  const parsedKg = Math.max(0, parseFloat(kg) || 0);
  const parsedPrice = Math.max(0, parseFloat(pricePerKg) || 0);
  const amount = parsedKg * parsedPrice;

  const handleProductChange = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setPricePerKg(String(p.unitPricePerKg));
      if (p.supplierId && suppliers.some((s) => s.id === p.supplierId)) setSupplierId(p.supplierId);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supplierId || !productId) {
      setError('Pick a supplier and a product.');
      return;
    }
    if (parsedKg <= 0 || parsedPrice <= 0) {
      setError('Quantity and price must be greater than zero.');
      return;
    }
    if (date > todayISO()) {
      setError('Receipt date cannot be in the future.');
      return;
    }
    try {
      addPurchase({
        supplierId,
        productId,
        kg: parsedKg,
        pricePerKg: parsedPrice,
        date,
        truckNumber: truckNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentMadeImmediately: paid,
        grossKg: grossKg ? parseFloat(grossKg) : null,
        tareKg: tareKg ? parseFloat(tareKg) : null,
        purchaseOrderId: poId || null,
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err?.message || 'Could not record the receipt.');
    }
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
          <div className="p-6 bg-[#111827] text-white flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                <PackagePlus className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h2 className="text-xl font-serif italic text-white">Receive Stock</h2>
                <p className="text-xs text-[#9CA3AF]">Incoming goods from a supplier. Stock and payables update instantly.</p>
              </div>
            </div>
            <button onClick={onClose} className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>

          {suppliers.length === 0 || products.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6B7280]">
              Add at least one supplier and one product before receiving stock.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {openPOs.length > 0 && (
                <div>
                  <label className={labelCls}>Against purchase order</label>
                  <select value={poId} onChange={(e) => applyPO(e.target.value)} className={inputCls}>
                    <option value="">— No PO —</option>
                    {openPOs.map((po) => <option key={po.id} value={po.id}>{po.poNumber} • {suppliers.find((s) => s.id === po.supplierId)?.company} • {formatKg(po.kg - po.receivedKg)} outstanding</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Supplier *</label>
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls} required>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.company} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Product *</label>
                  <select value={productId} onChange={(e) => handleProductChange(e.target.value)} className={inputCls} required>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.category}) — Stock: {formatKg(p.stockKg)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Quantity (kg) *</label>
                  <input type="number" step="1" min="1" value={kg} onChange={(e) => setKg(e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Cost (Rs./kg) *</label>
                  <input type="number" step="0.01" min="0.01" value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Receipt Date *</label>
                  <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Gross weight (kg)</label><input type="number" min="0" step="1" value={grossKg} onChange={(e) => applyWeights(e.target.value, tareKg)} placeholder="Weighbridge" className={inputCls} /></div>
                <div><label className={labelCls}>Tare weight (kg)</label><input type="number" min="0" step="1" value={tareKg} onChange={(e) => applyWeights(grossKg, e.target.value)} placeholder="Empty truck" className={inputCls} /></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Truck / Vehicle #</label>
                  <div className="relative">
                    <Truck className="w-3.5 h-3.5 text-[#8E9299] absolute left-3.5 top-3" />
                    <input value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} placeholder="Optional" className={`${inputCls} pl-9`} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Grade, moisture, bill no..." className={inputCls} />
                </div>
              </div>

              <div className="bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest block">Receipt Value</span>
                  <span className="text-2xl font-bold font-mono text-teal-800">{formatCurrency(amount)}</span>
                </div>
                <div className="text-right text-xs text-[#6B7280]">
                  <span className="font-mono text-[#111827] font-bold">{formatKg(parsedKg)}</span>
                  <span className="block text-[11px]">@ Rs. {parsedPrice}/kg</span>
                  {product && (
                    <span className="block text-[11px] text-teal-800 font-semibold mt-0.5">
                      Stock after: {formatKg(product.stockKg + parsedKg)}
                    </span>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="w-4 h-4 accent-teal-700" />
                <span className="text-xs text-[#374151]">
                  Paid {supplier ? supplier.company : 'the supplier'} on receipt (no payable added)
                </span>
              </label>

              {error && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-[#6B7280] hover:text-[#111827] bg-[#FAF9F6] hover:bg-[#F0F0EE] border border-[#E5E5E1] rounded-2xl">
                  Cancel
                </button>
                <button type="submit" disabled={isSuccess} className="px-6 py-2.5 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl shadow-xs flex items-center gap-2 active:scale-95 border border-[#111827]">
                  {isSuccess ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-teal-400" />
                      <span>Received!</span>
                    </>
                  ) : (
                    <>
                      <PackagePlus className="w-4 h-4 text-teal-400" />
                      <span>Confirm Receipt</span>
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
