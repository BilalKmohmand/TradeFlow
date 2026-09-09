import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag,
  X,
  CheckCircle,
  Package,
  User,
  History,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Tag,
  AlertTriangle,
  ShieldAlert,
  Plus,
  Trash2,
  Layers,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useEscape } from '../hooks/useEscape';
import { formatCurrency, formatKg } from '../utils/formatters';
import { creditExposure } from '../utils/finance';
import { uid } from '../utils/stockFlow';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedCustomerId?: string | null;
  /** When set, edits the existing booking (quantity, rate, date, notes) instead of creating one. */
  editBookingId?: string | null;
}

interface FormItem {
  id: string;
  productId: string;
  kg: string;
  pricePerKg: string;
  rateOverrideReason?: string;
  notes?: string;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  preselectedCustomerId,
  editBookingId,
}) => {
  const {
    customers,
    products,
    bookings,
    createBooking,
    updateBooking,
    can,
    logAuditEvent,
    customerAgreedRates,
    getCustomerAgreedRate,
    setCustomerAgreedRate,
  } = useTrading();

  const editing = editBookingId ? bookings.find((b) => b.id === editBookingId) : undefined;
  useEscape(isOpen, onClose);

  const [overrideCredit, setOverrideCredit] = useState<boolean>(false);
  const [customerId, setCustomerId] = useState<string>(
    preselectedCustomerId || (customers[0]?.id || '')
  );

  // Multi-item rows state
  const [items, setItems] = useState<FormItem[]>([
    {
      id: uid('fitem'),
      productId: products[0]?.id || '',
      kg: '50000',
      pricePerKg: (products[0]?.pricePerKg || 25).toString(),
      rateOverrideReason: '',
      notes: '',
    },
  ]);

  const [targetDeliveryDate, setTargetDeliveryDate] = useState<string>(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>('');
  const [brokerName, setBrokerName] = useState<string>('');
  const [brokerRate, setBrokerRate] = useState<string>('');
  const [rateOverrideReason, setRateOverrideReason] = useState<string>('');
  const [saveAsAgreedRate, setSaveAsAgreedRate] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Prefill when editing / reset when opening fresh
  useEffect(() => {
    if (!isOpen) return;
    setOverrideCredit(false);
    setIsSuccess(false);

    if (editing) {
      setCustomerId(editing.customerId);
      setTargetDeliveryDate(editing.targetDeliveryDate || '');
      setNotes(editing.notes || '');
      setBrokerName(editing.brokerName || '');
      setBrokerRate(editing.brokerCommissionPerKg ? String(editing.brokerCommissionPerKg) : '');
      setRateOverrideReason(editing.rateOverrideReason || '');
      setSaveAsAgreedRate(false);

      if (editing.items && editing.items.length > 0) {
        setItems(
          editing.items.map((it) => ({
            id: it.id || uid('fitem'),
            productId: it.productId,
            kg: String(it.totalKg),
            pricePerKg: String(it.pricePerKg),
            rateOverrideReason: it.rateOverrideReason || '',
            notes: it.notes || '',
          }))
        );
      } else {
        setItems([
          {
            id: uid('fitem'),
            productId: editing.productId,
            kg: String(editing.totalKg),
            pricePerKg: String(editing.pricePerKg),
            rateOverrideReason: editing.rateOverrideReason || '',
            notes: '',
          },
        ]);
      }
    } else {
      const defaultCust = preselectedCustomerId || customers[0]?.id || '';
      setCustomerId(defaultCust);
      const defaultProd = products[0]?.id || '';
      const agreed = defaultCust && defaultProd ? getCustomerAgreedRate(defaultCust, defaultProd) : null;
      const initialPrice = agreed != null
        ? agreed.toString()
        : (products[0]?.pricePerKg || 25).toString();

      setItems([
        {
          id: uid('fitem'),
          productId: defaultProd,
          kg: '50000',
          pricePerKg: initialPrice,
          rateOverrideReason: agreed != null ? 'Customer agreed special contract rate' : '',
          notes: '',
        },
      ]);
      setBrokerName('');
      setBrokerRate('');
      setNotes('');
      setRateOverrideReason('');
      setSaveAsAgreedRate(false);
    }
  }, [isOpen, editBookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle item operations
  const handleAddItem = () => {
    // Pick first product that isn't already used, or fallback to first product
    const usedProductIds = new Set(items.map((it) => it.productId));
    const nextProd = products.find((p) => !usedProductIds.has(p.id)) || products[0];
    const agreed = nextProd && customerId ? getCustomerAgreedRate(customerId, nextProd.id) : null;
    const initialRate = agreed != null
      ? agreed.toString()
      : (nextProd?.unitPricePerKg || nextProd?.pricePerKg || 25).toString();

    setItems((prev) => [
      ...prev,
      {
        id: uid('fitem'),
        productId: nextProd ? nextProd.id : '',
        kg: '25000',
        pricePerKg: initialRate,
        rateOverrideReason: agreed != null ? 'Customer agreed contract rate' : '',
        notes: '',
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleItemChange = (id: string, field: keyof FormItem, value: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: value };

        // If product changed, update default rate
        if (field === 'productId') {
          const prod = products.find((p) => p.id === value);
          const agreed = customerId ? getCustomerAgreedRate(customerId, value) : null;
          if (agreed != null) {
            updated.pricePerKg = agreed.toString();
            updated.rateOverrideReason = 'Customer agreed special contract rate';
          } else if (prod) {
            updated.pricePerKg = (prod.unitPricePerKg || prod.pricePerKg || 25).toString();
            updated.rateOverrideReason = '';
          }
        }
        return updated;
      })
    );
  };

  const handleCustomerChange = (custId: string) => {
    setCustomerId(custId);
    // Refresh agreed rates on existing items if they have special contract pricing
    setItems((prev) =>
      prev.map((it) => {
        const agreed = getCustomerAgreedRate(custId, it.productId);
        if (agreed != null) {
          return {
            ...it,
            pricePerKg: agreed.toString(),
            rateOverrideReason: 'Customer agreed special contract rate',
          };
        }
        return it;
      })
    );
  };

  // Aggregated calculations across all items
  const itemMetrics = useMemo(() => {
    return items.map((it) => {
      const prod = products.find((p) => p.id === it.productId);
      const parsedKg = Math.max(0, parseFloat(it.kg) || 0);
      const parsedPrice = Math.max(0, parseFloat(it.pricePerKg) || 0);
      const lineAmount = parsedKg * parsedPrice;
      const catalogRate = prod?.unitPricePerKg || prod?.pricePerKg || 0;
      const costRate = prod?.costPricePerKg || (catalogRate > 0 ? catalogRate * 0.85 : 0);
      const marginKg = parsedPrice - costRate;
      const lineMargin = marginKg * parsedKg;
      const marginPct = parsedPrice > 0 ? (marginKg / parsedPrice) * 100 : 0;
      const isCustom = Math.abs(parsedPrice - catalogRate) > 0.001;
      const agreedRate = customerId ? getCustomerAgreedRate(customerId, it.productId) : null;
      const isStockShort = Boolean(prod && parsedKg > prod.stockKg);

      return {
        item: it,
        product: prod,
        parsedKg,
        parsedPrice,
        lineAmount,
        catalogRate,
        costRate,
        marginKg,
        lineMargin,
        marginPct,
        isCustom,
        agreedRate,
        isStockShort,
      };
    });
  }, [items, products, customerId, getCustomerAgreedRate]);

  const totalContractKg = itemMetrics.reduce((acc, it) => acc + it.parsedKg, 0);
  const totalContractAmount = itemMetrics.reduce((acc, it) => acc + it.lineAmount, 0);
  const totalContractMargin = itemMetrics.reduce((acc, it) => acc + it.lineMargin, 0);
  const avgMarginPercentage = totalContractAmount > 0 ? (totalContractMargin / totalContractAmount) * 100 : 0;
  const hasAnyCustomRate = itemMetrics.some((it) => it.isCustom);
  const stockShortageItems = itemMetrics.filter((it) => it.isStockShort);

  // Credit control
  const exposure = selectedCustomer ? creditExposure(selectedCustomer, bookings.filter((b) => b.id !== editBookingId)) : null;
  const projected = exposure ? exposure.exposure + totalContractAmount : 0;
  const creditBreached = Boolean(exposure && exposure.limit > 0 && projected > exposure.limit);

  const minKg = editing ? editing.dispatchedKg : 0;
  const kgTooLow = editing ? totalContractKg < minKg : false;
  const anyInvalidRow = itemMetrics.some((it) => it.parsedKg <= 0 || it.parsedPrice <= 0);
  const blocked = (creditBreached && !(can('override_credit') && overrideCredit)) || kgTooLow || anyInvalidRow;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || items.length === 0 || anyInvalidRow || blocked) return;

    if (creditBreached && overrideCredit) {
      logAuditEvent(
        'Credit Limit Overridden',
        `${selectedCustomer?.name}: projected exposure ${formatCurrency(projected)} vs limit ${formatCurrency(exposure?.limit || 0)}.`,
        'warning'
      );
    }

    // Save as agreed rate for customer if requested
    if (saveAsAgreedRate && !editing) {
      items.forEach((it) => {
        const parsedPrice = parseFloat(it.pricePerKg) || 0;
        if (parsedPrice > 0) {
          setCustomerAgreedRate(
            customerId,
            it.productId,
            parsedPrice,
            it.rateOverrideReason || `Agreed during booking creation on ${new Date().toISOString().split('T')[0]}`
          );
        }
      });
    }

    if (editing) {
      // If editing an existing booking
      const formattedItems = itemMetrics.map((it) => {
        const existingItem = editing.items?.find((ei) => ei.id === it.item.id);
        const dispatched = existingItem?.dispatchedKg || 0;
        const remaining = Math.max(0, it.parsedKg - dispatched);
        return {
          id: it.item.id,
          productId: it.item.productId,
          productName: it.product?.name,
          totalKg: it.parsedKg,
          dispatchedKg: dispatched,
          remainingKg: remaining,
          pricePerKg: can('edit_prices') ? it.parsedPrice : (existingItem?.pricePerKg || it.parsedPrice),
          totalAmount: it.lineAmount,
          costPricePerKg: it.costRate,
          marginPerKg: it.marginKg,
          totalMargin: it.lineMargin,
          isCustomRate: it.isCustom,
          rateOverrideReason: it.item.rateOverrideReason,
          notes: it.item.notes,
        };
      });

      updateBooking(editing.id, {
        items: formattedItems,
        targetDeliveryDate: targetDeliveryDate || undefined,
        notes: notes.trim() || undefined,
        brokerName: brokerName.trim() || undefined,
        brokerCommissionPerKg: parseFloat(brokerRate) || undefined,
        rateOverrideReason: hasAnyCustomRate ? (rateOverrideReason || 'Rates amended on multi-item booking') : undefined,
      });

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 700);
      return;
    }

    // Creating new multi-item booking
    createBooking({
      customerId,
      items: itemMetrics.map((it) => ({
        productId: it.item.productId,
        totalKg: it.parsedKg,
        pricePerKg: it.parsedPrice,
        costPricePerKg: it.costRate,
        rateOverrideReason: it.item.rateOverrideReason,
        notes: it.item.notes,
      })),
      targetDeliveryDate,
      notes: notes.trim(),
      brokerName: brokerName.trim() || undefined,
      brokerCommissionPerKg: parseFloat(brokerRate) || undefined,
      rateOverrideReason: hasAnyCustomRate ? (rateOverrideReason || 'Rates customized on commodities') : undefined,
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="relative bg-white dark:bg-[#101A26] rounded-3xl max-w-3xl w-full shadow-2xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden z-10 my-6 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-5 bg-[#111827] dark:bg-[#0B131E] text-white flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-teal-400">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif italic text-2xl font-bold text-white tracking-tight">
                  {editing ? `Edit Booking ${editing.bookingNumber}` : 'New Multi-Commodity Sales Booking'}
                </h3>
                <p className="text-xs text-[#9CA3AF]">
                  Add single or multiple commodities under one contract with itemized margin analysis
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[#9CA3AF] hover:text-white p-2 rounded-2xl hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* Customer Selection */}
            <div>
              <label className="block text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                Customer Account *
              </label>
              <select
                value={customerId}
                disabled={Boolean(editing)}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50 transition-all"
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.company} (Current Outstanding: {formatCurrency(c.totalDue)})
                  </option>
                ))}
              </select>
            </div>

            {/* Booking Line Items (Multi-Item Support) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#111827] dark:text-white">
                    Order Commodities ({items.length} {items.length === 1 ? 'item' : 'items'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Item</span>
                </button>
              </div>

              {/* Items Card List */}
              <div className="space-y-3">
                {itemMetrics.map((m, idx) => (
                  <div
                    key={m.item.id}
                    className="p-4 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between border-b border-[#E5E5E1] dark:border-[#203248] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-[11px] font-bold font-mono flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-[#111827] dark:text-white">
                          {m.product?.name || 'Select Commodity'}
                        </span>
                        {m.product?.category && (
                          <span className="text-[10px] text-[#8E9299] dark:text-[#94A3B8] font-mono">
                            • {m.product.category}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {m.agreedRate != null && (
                          <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Tag className="w-3 h-3" /> Special Rate
                          </span>
                        )}
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(m.item.id)}
                            title="Remove this item"
                            className="p-1.5 rounded-xl text-[#9CA3AF] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inputs Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      {/* Commodity select */}
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] font-bold text-[#6B7280] dark:text-[#94A3B8] mb-1 uppercase tracking-wider">
                          Commodity *
                        </label>
                        <select
                          value={m.item.productId}
                          onChange={(e) => handleItemChange(m.item.id, 'productId', e.target.value)}
                          className="w-full bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] rounded-xl px-3 py-2 text-xs font-semibold text-[#111827] dark:text-white focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                          required
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatKg(p.stockKg)} stock)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity kg */}
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-[#6B7280] dark:text-[#94A3B8] mb-1 uppercase tracking-wider">
                          Quantity (kg) *
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={m.item.kg}
                          onChange={(e) => handleItemChange(m.item.id, 'kg', e.target.value)}
                          placeholder="50000"
                          className="w-full bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#111827] dark:text-white focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                          required
                        />
                      </div>

                      {/* Selling rate */}
                      <div className="sm:col-span-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wider">
                            Rate (Rs./kg) *
                          </label>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={m.item.pricePerKg}
                          onChange={(e) => handleItemChange(m.item.id, 'pricePerKg', e.target.value)}
                          placeholder="25.00"
                          className={`w-full bg-white dark:bg-[#101A26] border rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#111827] dark:text-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 ${
                            m.isCustom
                              ? 'border-amber-400 dark:border-amber-500/60 ring-1 ring-amber-400/20'
                              : 'border-[#E5E5E1] dark:border-[#203248]'
                          }`}
                          required
                        />
                      </div>
                    </div>

                    {/* Quick rate shortcuts & line metrics */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-[#8E9299] dark:text-[#64748B] uppercase">
                          Quick:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleItemChange(m.item.id, 'pricePerKg', m.catalogRate.toString())}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-[#4B5563] dark:text-[#94A3B8] hover:border-teal-500 transition-all cursor-pointer"
                        >
                          Catalog ({formatCurrency(m.catalogRate)})
                        </button>
                        {m.agreedRate != null && (
                          <button
                            type="button"
                            onClick={() => handleItemChange(m.item.id, 'pricePerKg', m.agreedRate!.toString())}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 hover:bg-teal-200 transition-all cursor-pointer"
                          >
                            Agreed ({formatCurrency(m.agreedRate)})
                          </button>
                        )}
                        {m.costRate > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const plusTen = Math.round(m.costRate * 1.1 * 100) / 100;
                              handleItemChange(m.item.id, 'pricePerKg', plusTen.toString());
                            }}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-[#4B5563] dark:text-[#94A3B8] hover:border-teal-500 transition-all cursor-pointer"
                          >
                            Cost +10% ({formatCurrency(m.costRate * 1.1)})
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-3 font-mono font-bold">
                        <span className="text-xs text-[#111827] dark:text-white">
                          Subtotal: {formatCurrency(m.lineAmount)}
                        </span>
                        <span
                          className={`text-[11px] ${
                            m.marginKg >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          (Margin: {m.marginKg >= 0 ? '+' : ''}{formatCurrency(m.marginKg)}/kg • {m.marginPct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Stock Alert if order exceeds available */}
                    {m.isStockShort && m.product && (
                      <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-200 dark:border-amber-900/60 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>
                          Current stock is {formatKg(m.product.stockKg)}; {formatKg(m.parsedKg - m.product.stockKg)} will need procurement.
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Total Contract Financial Summary Dashboard */}
            <div className="p-4 rounded-2xl bg-[#111827] dark:bg-[#0B131E] text-white space-y-3 shadow-sm border border-white/10">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF] block">
                    Combined Contract Value ({items.length} items)
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono text-white">
                      {formatCurrency(totalContractAmount)}
                    </span>
                    <span className="text-xs text-[#9CA3AF] font-mono">
                      ({formatKg(totalContractKg)} total)
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF] block">
                    Total Estimated Gross Margin
                  </span>
                  <div
                    className={`inline-flex items-center gap-1 font-mono font-bold text-lg ${
                      totalContractMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {totalContractMargin >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span>{formatCurrency(totalContractMargin)}</span>
                    <span className="text-xs opacity-80">({avgMarginPercentage.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Rate Override Notes & Save Default Rate */}
            {hasAnyCustomRate && (
              <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Special Rate Override Active (Audit Logged)
                  </span>
                </div>
                <div>
                  <input
                    type="text"
                    value={rateOverrideReason}
                    onChange={(e) => setRateOverrideReason(e.target.value)}
                    placeholder="Reason for rate override (e.g. Multi-item bulk bundle discount, client procurement tender)"
                    className="w-full bg-white dark:bg-[#101A26] border border-amber-200 dark:border-amber-800/80 rounded-xl px-3 py-2 text-xs text-[#111827] dark:text-white focus:outline-hidden"
                  />
                </div>

                {!editing && (
                  <label className="flex items-center gap-2 pt-1 text-[11px] font-semibold text-amber-900 dark:text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAsAgreedRate}
                      onChange={(e) => setSaveAsAgreedRate(e.target.checked)}
                      className="w-3.5 h-3.5 accent-amber-600 rounded"
                    />
                    <span>Save entered prices as customer's default agreed rates for these commodities</span>
                  </label>
                )}
              </div>
            )}

            {/* Credit Control Exposure */}
            {exposure && (
              <div
                className={`rounded-2xl p-3.5 border text-xs space-y-1.5 ${
                  creditBreached
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300'
                    : 'bg-[#FAF9F6] dark:bg-[#162436] border-[#E5E5E1] dark:border-[#203248]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-bold flex items-center gap-1.5 ${
                      creditBreached ? 'text-rose-800 dark:text-rose-300' : 'text-[#374151] dark:text-[#CBD5E1]'
                    }`}
                  >
                    {creditBreached ? <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> : null}
                    Credit Exposure After This Booking
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      creditBreached ? 'text-rose-800 dark:text-rose-300' : 'text-[#111827] dark:text-white'
                    }`}
                  >
                    {formatCurrency(projected)} / {exposure.limit > 0 ? formatCurrency(exposure.limit) : 'No Limit'}
                  </span>
                </div>
                <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] font-mono">
                  Outstanding {formatCurrency(exposure.outstanding)} + committed {formatCurrency(exposure.committed)} + contract {formatCurrency(totalContractAmount)}
                </div>
                {creditBreached &&
                  (can('override_credit') ? (
                    <label className="flex items-center gap-2 pt-1 cursor-pointer text-rose-900 dark:text-rose-200 font-semibold">
                      <input
                        type="checkbox"
                        checked={overrideCredit}
                        onChange={(e) => setOverrideCredit(e.target.checked)}
                        className="w-4 h-4 accent-rose-600 rounded"
                      />
                      Override credit limit (logged in system audit trail)
                    </label>
                  ) : (
                    <div className="text-rose-800 dark:text-rose-300 font-semibold pt-1">
                      Over credit limit. Ask an administrator to approve this booking.
                    </div>
                  ))}
              </div>
            )}

            {/* Target Date & Broker Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] mb-1.5 uppercase tracking-wider">
                  Broker / Agent Name
                </label>
                <input
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                  placeholder="Optional broker / agent"
                  className="w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs text-[#111827] dark:text-white focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] mb-1.5 uppercase tracking-wider">
                  Commission (Rs./kg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={brokerRate}
                  onChange={(e) => setBrokerRate(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#111827] dark:text-white focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] mb-1.5 uppercase tracking-wider">
                  Target Delivery Date
                </label>
                <input
                  type="date"
                  value={targetDeliveryDate}
                  onChange={(e) => setTargetDeliveryDate(e.target.value)}
                  className="w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs text-[#111827] dark:text-white font-mono focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] mb-1.5 uppercase tracking-wider">
                  Contract / Delivery Notes
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Bulk tipper delivery at berth 4"
                  className="w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs text-[#111827] dark:text-white focus:outline-hidden"
                />
              </div>
            </div>

            {/* Submit Bar */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E5E1] dark:border-[#203248]">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs font-bold text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white bg-[#FAF9F6] dark:bg-[#162436] hover:bg-[#F0F0EE] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSuccess || blocked}
                className="px-6 py-2.5 bg-[#111827] dark:bg-white hover:bg-black dark:hover:bg-slate-100 text-white dark:text-[#111827] text-xs font-bold rounded-2xl shadow-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                {isSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-teal-400 dark:text-teal-700" />
                    <span>{editing ? 'Booking Saved!' : 'Booking Created!'}</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4 text-teal-400 dark:text-teal-700" />
                    <span>{editing ? 'Save Changes' : `Confirm Contract (${items.length} Items)`}</span>
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
