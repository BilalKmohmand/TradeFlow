import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, AlertTriangle, PackagePlus, Warehouse, ArrowRightLeft, Scale, History, Tag } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useWideLayout } from '../../hooks/useMediaQuery';
import { useBillingUI } from '../../components/billing/BillingUI';
import { useStockUI } from '../../components/billing/StockUI';
import { cardCls, inputCls, primaryBtn, secondaryBtn, rs, moneyCls, PageHeader, EmptyState, RowAction, thCls, tableCardCls } from '../../components/billing/ui';
import { isExpired } from '../../utils/inventory';
import { todayISO } from '../../utils/stockFlow';
import { ItemStockDetails, ReceiveStockModal, GodownsModal, TransferStockModal } from '../../components/billing/InventoryUI';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Product } from '../../types';

/** Your price list: every item with its fixed price and how many are left. */
export const ItemsScreen: React.FC = () => {
  const { products, deleteProduct, can, godowns, stockBatches } = useTrading();
  const ui = useBillingUI();
  const wide = useWideLayout();
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
  const canDelete = can('delete_records');
  const today = todayISO();
  const isLow = (p: Product) => p.minThresholdKg > 0 && p.stockKg <= p.minThresholdKg;
  // Expired batches are still counted in stock but can't be sold: say so next to the figure.
  const expiredQty = (id: string) => stockBatches.filter((b) => b.productId === id && b.qty > 0 && isExpired(b, today)).reduce((a, b) => a + b.qty, 0);
  const valueOf = (p: Product) => Math.max(0, p.stockKg) * (p.costPricePerKg || p.unitPricePerKg || 0);
  const stockValue = products.reduce((a, p) => a + valueOf(p), 0);
  const lowCount = products.filter(isLow).length;
  const actions = (p: Product) => (
    <>
      {canStock && <RowAction label={`Receive stock for ${p.name}`} text="Receive" alwaysText tone="teal" icon={<PackagePlus className="w-4 h-4" />} onClick={() => openStock('receive', p.id)} />}
      {canAdjust && <RowAction label={`Adjust stock of ${p.name}`} text="Adjust" alwaysText icon={<Scale className="w-4 h-4" />} onClick={() => stock.adjustStock(p.id)} />}
      <RowAction label={`Edit ${p.name}`} text="Edit" alwaysText icon={<Pencil className="w-4 h-4" />} onClick={() => ui.editItem(p.id)} />
      {canDelete && <RowAction label={`Delete ${p.name}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPending(p)} />}
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Items & Prices" subtitle={<>{products.length} item{products.length === 1 ? '' : 's'}{stockValue > 0 ? <> • stock worth <span className={moneyCls}>{rs(stockValue)}</span></> : ''}{lowCount > 0 ? ` • ${lowCount} low` : ''}</>}>
        {canStock && <button type="button" onClick={() => openStock('receive')} className={secondaryBtn}><PackagePlus className="w-4 h-4 text-teal-700 dark:text-teal-300" /> Receive stock</button>}
        {canGodowns && <button type="button" onClick={() => openStock('godowns')} className={secondaryBtn}><Warehouse className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /> Godowns{godowns.length > 1 ? ` (${godowns.length})` : ''}</button>}
        {godowns.length > 1 && canStock && <button type="button" onClick={() => openStock('move')} className={secondaryBtn}><ArrowRightLeft className="w-4 h-4 text-amber-600 dark:text-amber-300" /> Move stock</button>}
        {canAdjust && <button type="button" onClick={() => stock.adjustStock()} className={secondaryBtn}><Scale className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Adjust stock</button>}
        <button type="button" onClick={() => ui.newItem()} className={primaryBtn}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New item</button>
      </PageHeader>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" className={`${inputCls} pl-10`} aria-label="Search items" />
      </div>
      {rows.length === 0 ? (
        <div className={cardCls}>
          <EmptyState
            icon={<Tag className="w-5 h-5" />}
            text={query ? 'No item matches that search.' : 'No items yet. Add the things you sell with their prices.'}
            action={!query && <button type="button" onClick={() => ui.newItem()} className={secondaryBtn}><Plus className="w-4 h-4" /> New item</button>}
          />
        </div>
      ) : (
        <>
          {/* Phones: one card per item. */}
          {!wide && <ul className={`${cardCls} overflow-hidden divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]`}>
            {rows.map((p) => {
              const low = isLow(p);
              const expired = expiredQty(p.id);
              return (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => stock.itemHistory(p.id)} className="flex-1 min-w-0 text-left" aria-label={`History of ${p.name}`} title="Stock history">
                      <span className="flex items-center gap-1.5 font-semibold text-sm text-[#111827] dark:text-white"><span className="truncate">{p.name}</span><History className="w-3.5 h-3.5 shrink-0 text-[#9CA3AF]" /></span>
                      <span className="block text-[11px] text-[#6B7280] dark:text-[#8E9299]">per {p.unit || 'pcs'}{p.costPricePerKg ? ` • cost ${rs(p.costPricePerKg)}` : ''}{p.trackBatches ? ' • batch & expiry' : ''}</span>
                    </button>
                    <div className={`${moneyCls} font-bold text-sm text-[#111827] dark:text-white shrink-0`}>{rs(p.unitPricePerKg)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                    <StockChip id={p.id} qty={p.stockKg} unit={p.unit || 'pcs'} low={low} />
                    {expired > 0 && <span className="font-semibold text-rose-700 dark:text-rose-300">{expired.toLocaleString()} expired, can't be sold</span>}
                    <span className="text-[#6B7280] dark:text-[#94A3B8]">worth <span className={`${moneyCls} font-semibold text-[#374151] dark:text-[#CBD5E1]`}>{rs(valueOf(p))}</span></span>
                  </div>
                  <ItemStockDetails product={p} />
                  <div className="mt-1.5 -mb-1 -mr-2 flex justify-end gap-0.5">{actions(p)}</div>
                </li>
              );
            })}
          </ul>}

          {/* Tablet & desktop: a table with a sticky header and a stock value total. */}
          {wide && <div className={tableCardCls}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className={`${thCls} text-left`}>Item</th>
                  <th scope="col" className={`${thCls} text-right`}>Price</th>
                  <th scope="col" className={`${thCls} text-right`}>In stock</th>
                  <th scope="col" className={`${thCls} text-right`} title="Stock × cost price (sale price when no cost is set)">Stock value</th>
                  <th scope="col" className={thCls}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {rows.map((p) => {
                  const low = isLow(p);
                  const expired = expiredQty(p.id);
                  return (
                    <tr key={p.id} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors align-top">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => stock.itemHistory(p.id)} className="font-semibold text-left text-[#111827] dark:text-white hover:underline inline-flex items-center gap-1.5" aria-label={`History of ${p.name}`} title="Stock history">{p.name}<History className="w-3.5 h-3.5 text-[#9CA3AF]" /></button>
                        <div className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">per {p.unit || 'pcs'}{p.costPricePerKg ? ` • cost ${rs(p.costPricePerKg)}` : ''}{p.trackBatches ? ' • batch & expiry' : ''}</div>
                        <ItemStockDetails product={p} />
                      </td>
                      <td className={`px-4 py-3 text-right font-bold text-[#111827] dark:text-white ${moneyCls}`}>{rs(p.unitPricePerKg)}</td>
                      <td className="px-4 py-3 text-right">
                        <StockChip id={p.id} qty={p.stockKg} unit={p.unit || 'pcs'} low={low} />
                        {expired > 0 && <span className="block mt-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">{expired.toLocaleString()} expired, can't be sold</span>}
                      </td>
                      <td className={`px-4 py-3 text-right text-[#374151] dark:text-[#CBD5E1] ${moneyCls}`}>{rs(valueOf(p))}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{actions(p)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#0D1520]">
                  <th scope="row" colSpan={3} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Total stock value • {rows.length} item{rows.length === 1 ? '' : 's'}</th>
                  <td className={`px-4 py-3 text-right font-extrabold text-[#111827] dark:text-white ${moneyCls}`}>{rs(rows.reduce((a, p) => a + valueOf(p), 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>}
        </>
      )}
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

/** Stock figure; a clear red "Low" chip when at or under the re-order level. */
const StockChip: React.FC<{ id: string; qty: number; unit: string; low: boolean }> = ({ id, qty, unit, low }) =>
  low ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-bold whitespace-nowrap tabular-nums">
      <AlertTriangle className="w-3 h-3" /> <span data-testid={`item-stock-${id}`}>{qty.toLocaleString()} {unit}</span> <span className="uppercase tracking-wide text-[10px]">low</span>
    </span>
  ) : (
    <span data-testid={`item-stock-${id}`} className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1] whitespace-nowrap tabular-nums">{qty.toLocaleString()} {unit}</span>
  );
