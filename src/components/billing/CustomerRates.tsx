import React, { useMemo, useState } from 'react';
import { Trash2, Pencil, Plus } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { inputCls, secondaryBtn, rs } from './ui';

/**
 * A customer's own prices: when they have a rate for an item, new bills and quotations for them
 * start at that price instead of the item's normal price.
 */
export const CustomerRatesPanel: React.FC<{ customerId: string }> = ({ customerId }) => {
  const { customerAgreedRates, products, setCustomerAgreedRate, deleteCustomerAgreedRate, can } = useTrading();
  const canEdit = can('edit_prices') || can('products:edit_prices');
  const rates = useMemo(
    () =>
      customerAgreedRates
        .filter((r) => r.customerId === customerId)
        .map((r) => ({ r, p: products.find((p) => p.id === r.productId) }))
        .filter((x) => x.p)
        .sort((a, b) => a.p!.name.localeCompare(b.p!.name)),
    [customerAgreedRates, products, customerId]
  );
  const [productId, setProductId] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState('');
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(rate);
    if (!productId) return setError('Pick an item.');
    if (!(n > 0)) return setError('Enter a rate more than zero.');
    setCustomerAgreedRate(customerId, productId, n);
    setProductId('');
    setRate('');
    setError('');
  };

  if (!canEdit && rates.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Special rates for this customer</h3>
      {rates.length === 0 ? (
        <p className="text-sm text-[#8E9299] mb-2">None. Bills use each item's normal price.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248] mb-2">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">
              <tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Their rate</th><th className="text-right px-3 py-2 hidden sm:table-cell">Normal price</th>{canEdit && <th className="px-2 py-2" />}</tr>
            </thead>
            <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]" data-testid="customer-rates">
              {rates.map(({ r, p }) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-semibold text-[#111827] dark:text-white">{p!.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{rs(r.agreedRatePerKg)}<span className="text-[11px] font-sans font-normal text-[#8E9299]">/{p!.unit || 'pcs'}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#8E9299] hidden sm:table-cell">{rs(p!.unitPricePerKg)}</td>
                  {canEdit && (
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <button type="button" onClick={() => { setProductId(r.productId); setRate(String(r.agreedRatePerKg)); }} aria-label={`Change rate for ${p!.name}`} className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#111827] dark:hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => deleteCustomerAgreedRate(r.id)} aria-label={`Remove rate for ${p!.name}`} className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <form onSubmit={save} className="grid grid-cols-12 gap-2 items-center">
          <select aria-label="Rate item" value={productId} onChange={(e) => { setProductId(e.target.value); const ex = rates.find((x) => x.r.productId === e.target.value); setRate(ex ? String(ex.r.agreedRatePerKg) : ''); }} className={`${inputCls} col-span-12 sm:col-span-6`}>
            <option value="">Item…</option>
            {sortedProducts.map((p) => <option key={p.id} value={p.id}>{p.name} (normal {rs(p.unitPricePerKg)})</option>)}
          </select>
          <input aria-label="Their rate" type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Their rate" className={`${inputCls} tabular-nums col-span-7 sm:col-span-3`} />
          <button type="submit" className={`${secondaryBtn} col-span-5 sm:col-span-3`}><Plus className="w-4 h-4" /> Save rate</button>
          {error && <p className="col-span-12 text-xs font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
        </form>
      )}
    </div>
  );
};
