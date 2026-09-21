import React, { useMemo, useState } from 'react';
import { Printer, ClipboardList, Download } from 'lucide-react';
import { useTrading } from '../../../context/TradingContext';
import { Modal, Notice, inputCls, labelCls, primaryBtn, secondaryBtn, rs, moneyCls, EmptyState } from '../ui';
import { formatDate } from '../../../utils/formatters';
import { downloadCsvFile } from '../../../utils/listTools';
import { reorderReport } from '../../../utils/purchasing';
import { hasPack, formatPackQty } from '../../../utils/packUnits';
import { todayISO } from '../../../utils/stockFlow';

const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });

/**
 * Items at or below their re-order level with a suggested quantity and the last supplier and price.
 * Tick what to buy and "Make purchase orders": one order per supplier.
 */
export const ReorderModal: React.FC<{ isOpen: boolean; onClose: () => void; onMade?: (msg: string) => void }> = ({ isOpen, onClose, onMade }) => {
  const { products, purchases, purchaseOrders, suppliers, ordersFromReorder, setPrintRequest, can } = useTrading();
  const rows = useMemo(() => (isOpen ? reorderReport(products, purchases, purchaseOrders) : []), [isOpen, products, purchases, purchaseOrders]);
  const [pick, setPick] = useState<Record<string, { on: boolean; qty: string; rate: string; supplierId: string }>>({});
  const [expected, setExpected] = useState('');
  const [error, setError] = useState('');
  const canOrder = can('products:create') || can('stock:adjust');
  const state = (id: string) => {
    const r = rows.find((x) => x.product.id === id)!;
    return pick[id] || { on: r.suggested > 0, qty: r.suggested > 0 ? String(r.suggested) : '', rate: r.lastRate != null ? String(r.lastRate) : '', supplierId: r.lastSupplierId || '' };
  };
  const set = (id: string, patch: Partial<ReturnType<typeof state>>) => setPick((p) => ({ ...p, [id]: { ...state(id), ...patch } }));
  const chosen = rows.filter((r) => state(r.product.id).on && (parseFloat(state(r.product.id).qty) || 0) > 0);
  const supplierCount = new Set(chosen.map((r) => state(r.product.id).supplierId).filter(Boolean)).size;
  const total = chosen.reduce((a, r) => a + (parseFloat(state(r.product.id).qty) || 0) * (parseFloat(state(r.product.id).rate) || 0), 0);
  const supName = (id?: string | null) => {
    const s = suppliers.find((x) => x.id === id);
    return s ? s.company || s.name : '';
  };

  const make = () => {
    setError('');
    const r = ordersFromReorder(
      chosen.map((row) => {
        const s = state(row.product.id);
        return { productId: row.product.id, qty: parseFloat(s.qty) || 0, rate: parseFloat(s.rate) || 0, supplierId: s.supplierId };
      }),
      { expectedDate: expected || undefined }
    );
    if (!r.success) return setError(r.message);
    onMade?.(r.message);
    onClose();
  };
  const exportCsv = () =>
    downloadCsvFile(`sarmaya-reorder-${todayISO()}.csv`, ['Item', 'Unit', 'In stock', 'Re-order level', 'On order', 'Suggested', 'Last supplier', 'Last rate', 'Last bought'], rows.map((r) => [r.product.name, r.product.unit || 'pcs', r.stock, r.level, r.onOrder, r.suggested, supName(r.lastSupplierId), r.lastRate ?? '', r.lastDate || '']));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Re-order report" subtitle="Items at or below their re-order level. Tick what to buy; one purchase order is made for each supplier." wide
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {chosen.length > 0 && <span className="mr-auto text-sm">{chosen.length} item{chosen.length === 1 ? '' : 's'} • {supplierCount} supplier{supplierCount === 1 ? '' : 's'} • <strong className={moneyCls}>{rs(total)}</strong></span>}
          <button type="button" onClick={exportCsv} className={secondaryBtn} disabled={rows.length === 0}><Download className="w-4 h-4" /> CSV</button>
          <button type="button" onClick={() => setPrintRequest({ type: 'reorder_report' })} className={secondaryBtn} disabled={rows.length === 0}><Printer className="w-4 h-4" /> Print</button>
          {canOrder && <button type="button" onClick={make} className={primaryBtn} disabled={chosen.length === 0}><ClipboardList className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Make purchase order{supplierCount === 1 ? '' : 's'}</button>}
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Notice kind="error">{error}</Notice>}
        {rows.length === 0 ? (
          <EmptyState icon={<ClipboardList className="w-5 h-5" />} text="Nothing needs re-ordering. Set a re-order level on items (Items → Edit) to see them here when stock runs low." />
        ) : (
          <>
            <div className="max-w-xs">
              <label className={labelCls} htmlFor="ro-expected">Needed by (optional)</label>
              <input id="ro-expected" type="date" value={expected} min={todayISO()} onChange={(e) => setExpected(e.target.value)} className={inputCls} />
            </div>
            <ul className="space-y-2" aria-label="Items to re-order">
              {rows.map((r) => {
                const s = state(r.product.id);
                const p = r.product;
                return (
                  <li key={p.id} className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3 space-y-2" data-testid={`reorder-${p.id}`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={s.on} onChange={(e) => set(p.id, { on: e.target.checked })} className="mt-0.5 w-5 h-5 accent-teal-700 shrink-0" aria-label={`Order ${p.name}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-sm text-[#111827] dark:text-white">{p.name}</span>
                        <span className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                          In stock <strong className={p.stockKg <= 0 ? 'text-rose-700 dark:text-rose-300' : ''}>{hasPack(p) ? formatPackQty(r.stock, p, 'short') : `${num(r.stock)} ${p.unit || 'pcs'}`}</strong> • level {num(r.level)}
                          {r.onOrder > 0 ? ` • ${num(r.onOrder)} already on order` : ''}
                          {r.lastDate ? ` • last bought ${formatDate(r.lastDate)}${r.lastRate != null ? ` @ ${rs(r.lastRate)}` : ''}` : ''}
                        </span>
                      </span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-8">
                      <div className="col-span-2">
                        <label className={labelCls} htmlFor={`ro-sup-${p.id}`}>Supplier</label>
                        <select id={`ro-sup-${p.id}`} value={s.supplierId} onChange={(e) => set(p.id, { supplierId: e.target.value })} className={inputCls}>
                          <option value="">Pick supplier…</option>
                          {suppliers.map((x) => <option key={x.id} value={x.id}>{x.company || x.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls} htmlFor={`ro-qty-${p.id}`}>Qty ({p.unit || 'pcs'})</label>
                        <input id={`ro-qty-${p.id}`} type="number" inputMode="decimal" min="0" step="any" value={s.qty} onChange={(e) => set(p.id, { qty: e.target.value })} className={`${inputCls} tabular-nums`} />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor={`ro-rate-${p.id}`}>Rate</label>
                        <input id={`ro-rate-${p.id}`} type="number" inputMode="decimal" min="0" step="any" value={s.rate} onChange={(e) => set(p.id, { rate: e.target.value })} className={`${inputCls} tabular-nums`} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
};
