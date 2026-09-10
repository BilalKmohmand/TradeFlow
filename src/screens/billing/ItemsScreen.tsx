import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { cardCls, inputCls, primaryBtn, rs } from '../../components/billing/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Product } from '../../types';

/** Your price list: every item with its fixed price and how many are left. */
export const ItemsScreen: React.FC = () => {
  const { products, invoices, deleteProduct, can } = useTrading();
  const ui = useBillingUI();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Product | null>(null);
  const rows = useMemo(() => products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [products, query]);
  const soldCount = (id: string) => invoices.reduce((a, i) => a + i.items.filter((it) => it.productId === id).reduce((x, it) => x + (it.qty ?? it.kg), 0), 0);
  const canDelete = can('delete_records');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-white">Items</h1>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{products.length} item{products.length === 1 ? '' : 's'} with fixed prices. Prices can still be changed on a bill line.</p>
        </div>
        <button type="button" onClick={() => ui.newItem()} className={primaryBtn}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New item</button>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" className={`${inputCls} pl-10`} aria-label="Search items" />
      </div>
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280] dark:text-[#94A3B8]">No items yet. Add the things you sell with their prices.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">
                <tr><th className="text-left px-4 py-2.5">Item</th><th className="text-right px-4 py-2.5">Price</th><th className="text-right px-4 py-2.5">Stock</th><th className="text-right px-4 py-2.5 hidden sm:table-cell">Sold (all time)</th><th className="px-2 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {rows.map((p) => {
                  const low = p.minThresholdKg > 0 && p.stockKg <= p.minThresholdKg;
                  return (
                    <tr key={p.id} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#111827] dark:text-white">{p.name}</div>
                        <div className="text-[11px] text-[#8E9299]">per {p.unit || 'pcs'}{p.costPricePerKg ? ` • cost ${rs(p.costPricePerKg)}` : ''}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#111827] dark:text-white">{rs(p.unitPricePerKg)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${low ? 'text-rose-700 dark:text-rose-300 font-bold' : 'text-[#374151] dark:text-[#CBD5E1]'}`}>{low && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}{p.stockKg.toLocaleString()} {p.unit || 'pcs'}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#6B7280] dark:text-[#94A3B8] hidden sm:table-cell">{soldCount(p.id).toLocaleString()}</td>
                      <td className="px-2 py-3 text-right whitespace-nowrap">
                        <button type="button" onClick={() => ui.editItem(p.id)} aria-label={`Edit ${p.name}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#111827] dark:hover:text-white"><Pencil className="w-4 h-4" /></button>
                        {canDelete && <button type="button" onClick={() => setPending(p)} aria-label={`Delete ${p.name}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={`Delete ${pending?.name || ''}?`}
        message="The item is removed from the price list. Bills already made keep their lines."
        confirmLabel="Delete item"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) deleteProduct(pending.id);
          setPending(null);
        }}
      />
    </div>
  );
};
