import React, { Fragment, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, AlertTriangle, PackagePlus, Warehouse, ArrowRightLeft, Scale, History } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { useStockUI } from '../../components/billing/StockUI';
import { cardCls, inputCls, primaryBtn, secondaryBtn, rs } from '../../components/billing/ui';
import { isExpired } from '../../utils/inventory';
import { todayISO } from '../../utils/stockFlow';
import { ItemStockDetails, ReceiveStockModal, GodownsModal, TransferStockModal } from '../../components/billing/InventoryUI';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Product } from '../../types';
import { liveBatches } from '../../utils/inventory';

/** Your price list: every item with its fixed price and how many are left. */
export const ItemsScreen: React.FC = () => {
  const { products, invoices, deleteProduct, can, godowns, stockBatches } = useTrading();
  const ui = useBillingUI();
  const stock = useStockUI();
  const canAdjust = can('stock:adjust');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Product | null>(null);
  // Stock dialogs (receive / godowns / move). The nonce remounts each dialog with fresh fields.
  const [stockUI, setStockUI] = useState<{ kind: 'receive' | 'godowns' | 'move' | null; productId?: string | null; n: number }>({ kind: null, n: 0 });
  const openStock = (kind: 'receive' | 'godowns' | 'move', productId?: string | null) => setStockUI((s) => ({ kind, productId, n: s.n + 1 }));
  const closeStock = () => setStockUI((s) => ({ ...s, kind: null }));
  const canStock = can('products:create') || can('stock:adjust');
  const canGodowns = can('stock:adjust');
  const rows = useMemo(() => products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [products, query]);
  const soldCount = (id: string) => invoices.reduce((a, i) => a + i.items.filter((it) => it.productId === id).reduce((x, it) => x + (it.qty ?? it.kg), 0), 0);
  const canDelete = can('delete_records');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-white">Items</h1>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{products.length} item{products.length === 1 ? '' : 's'} with fixed prices. Prices can still be changed on a bill line. Tap an item to see its stock history.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canStock && <button type="button" onClick={() => openStock('receive')} className={secondaryBtn}><PackagePlus className="w-4 h-4 text-teal-700" /> Receive stock</button>}
          {canGodowns && <button type="button" onClick={() => openStock('godowns')} className={secondaryBtn}><Warehouse className="w-4 h-4 text-indigo-600" /> Godowns{godowns.length > 1 ? ` (${godowns.length})` : ''}</button>}
          {godowns.length > 1 && canStock && <button type="button" onClick={() => openStock('move')} className={secondaryBtn}><ArrowRightLeft className="w-4 h-4 text-amber-600" /> Move stock</button>}
          {canAdjust && <button type="button" onClick={() => stock.adjustStock()} className={secondaryBtn}><Scale className="w-4 h-4 text-rose-600" /> Adjust stock</button>}
          <button type="button" onClick={() => ui.newItem()} className={primaryBtn}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New item</button>
        </div>
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
                  // Godown split / batch list: inside the item cell on wider screens, a full-width row below on phones.
                  const details = godowns.length > 1 || liveBatches(stockBatches, p.id).length > 0;
                  return (
                    <Fragment key={p.id}>
                    <tr className={`hover:bg-[#FAF9F6] dark:hover:bg-[#162436] ${details ? 'max-sm:border-b-0' : ''}`}>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => stock.itemHistory(p.id)} className="font-semibold text-left text-[#111827] dark:text-white hover:underline inline-flex items-center gap-1.5" aria-label={`History of ${p.name}`} title="Stock history">{p.name}<History className="w-3.5 h-3.5 text-[#9CA3AF]" /></button>
                        <div className="text-[11px] text-[#8E9299]">per {p.unit || 'pcs'}{p.costPricePerKg ? ` • cost ${rs(p.costPricePerKg)}` : ''}{p.trackBatches ? ' • batch & expiry' : ''}</div>
                        <div className="hidden sm:block"><ItemStockDetails product={p} /></div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#111827] dark:text-white">{rs(p.unitPricePerKg)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${low ? 'text-rose-700 dark:text-rose-300 font-bold' : 'text-[#374151] dark:text-[#CBD5E1]'}`}>{low && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}{p.stockKg.toLocaleString()} {p.unit || 'pcs'}{(() => {
                        // Expired batches are still counted in stock but can't be sold: say so next to the figure.
                        const expired = stockBatches.filter((b) => b.productId === p.id && b.qty > 0 && isExpired(b, todayISO())).reduce((a, b) => a + b.qty, 0);
                        return expired > 0 ? <span className="block text-[11px] font-sans font-semibold text-rose-700 dark:text-rose-300">{expired.toLocaleString()} expired, can't be sold</span> : null;
                      })()}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#6B7280] dark:text-[#94A3B8] hidden sm:table-cell">{soldCount(p.id).toLocaleString()}</td>
                      <td className="px-2 py-3 text-right whitespace-nowrap">
                        {canStock && <button type="button" onClick={() => openStock('receive', p.id)} aria-label={`Receive stock for ${p.name}`} title="Receive stock" className="p-2 rounded-xl text-[#9CA3AF] hover:text-teal-700"><PackagePlus className="w-4 h-4" /></button>}
                        {canAdjust && <button type="button" onClick={() => stock.adjustStock(p.id)} aria-label={`Adjust stock of ${p.name}`} title="Adjust stock" className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600"><Scale className="w-4 h-4" /></button>}
                        <button type="button" onClick={() => ui.editItem(p.id)} aria-label={`Edit ${p.name}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#111827] dark:hover:text-white"><Pencil className="w-4 h-4" /></button>
                        {canDelete && <button type="button" onClick={() => setPending(p)} aria-label={`Delete ${p.name}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
                      </td>
                    </tr>
                    {details && (
                      <tr className="sm:hidden">
                        <td colSpan={5} className="px-4 pb-3 pt-0"><ItemStockDetails product={p} /></td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ReceiveStockModal key={`rcv-${stockUI.n}`} isOpen={stockUI.kind === 'receive'} onClose={closeStock} productId={stockUI.productId} />
      <GodownsModal key={`gd-${stockUI.n}`} isOpen={stockUI.kind === 'godowns'} onClose={closeStock} onMoveStock={() => openStock('move')} />
      <TransferStockModal key={`mv-${stockUI.n}`} isOpen={stockUI.kind === 'move'} onClose={closeStock} productId={stockUI.productId} />
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
