import React, { useMemo, useRef, useState } from 'react';
import { Printer, PackageMinus, PackagePlus, Scale, Undo2, Truck } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Notice, inputCls, labelCls, primaryBtn, secondaryBtn, rs } from './ui';
import { BILLING_ADJUST_REASONS, AdjustmentReason, StockBatch } from '../../types';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { fmtExpiry, isExpired, stockByGodown } from '../../utils/inventory';
import { costPerKgOn } from '../../utils/finance';
import { itemHistory, HistoryKind } from '../../utils/stockReports';
import { booksLockedFor } from '../../utils/accounting';
import { ConfirmDialog } from '../ConfirmDialog';

const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });

/** Stock rows of one item in one godown that the user can pick (batches, and plain stock kept outside the main godown). */
const pickableRows = (rows: StockBatch[], productId: string, godownId: string) =>
  rows.filter((r) => r.productId === productId && r.godownId === godownId && r.qty > 0.0001 && r.batchNo);

const batchLabel = (b: StockBatch, unit: string, today: string) =>
  `Batch ${b.batchNo}${b.expiryDate ? ` • ${isExpired(b, today) ? 'expired' : 'exp'} ${fmtExpiry(b.expiryDate)}` : ''} • ${num(b.qty)} ${unit}`;

// ---------------------------------------------------------------------------
// Adjust stock with a reason
// ---------------------------------------------------------------------------
export const AdjustStockModal: React.FC<{ isOpen: boolean; onClose: () => void; productId?: string | null }> = ({ isOpen, onClose, productId }) => {
  const { products, godowns, stockBatches, adjustStockBy, purchases } = useTrading();
  const today = todayISO();
  const sorted = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const [pid, setPid] = useState(productId || '');
  const [reason, setReason] = useState<AdjustmentReason>('leaked');
  const [godownId, setGodownId] = useState(godowns[0]?.id || '');
  const [batchId, setBatchId] = useState('');
  const [way, setWay] = useState<'out' | 'in'>('out');
  const [qty, setQty] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const busy = useRef(false);

  const product = products.find((p) => p.id === pid);
  const unit = product?.unit || 'pcs';
  const meta = BILLING_ADJUST_REASONS.find((r) => r.id === reason)!;
  const direction = meta.direction === 'either' ? way : meta.direction;
  const isCount = reason === 'count';
  const batches = product ? pickableRows(stockBatches, product.id, godownId) : [];
  const batch = batches.find((b) => b.id === batchId);
  const here = product ? (batch ? batch.qty : stockByGodown(product, stockBatches, godowns)[godownId] ?? 0) : 0;
  const delta = isCount ? (counted.trim() === '' ? 0 : Math.round(((parseFloat(counted) || 0) - here) * 100) / 100) : (parseFloat(qty) || 0) * (direction === 'out' ? -1 : 1);
  const cost = product ? (batch?.costPrice || costPerKgOn(purchases, product.id, date) || product.costPricePerKg || 0) : 0;

  const pickReason = (r: AdjustmentReason) => {
    setReason(r);
    setError('');
    // Expired stock: point straight at the first expired batch in this godown.
    if (r === 'expired' && product) {
      const exp = pickableRows(stockBatches, product.id, godownId).find((b) => isExpired(b, today));
      if (exp) setBatchId(exp.id);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 800);
    setError('');
    if (!product) return setError('Pick an item.');
    if (isCount && counted.trim() === '') return setError(`Enter how many ${unit} you counted.`);
    if (!isCount && !(parseFloat(qty) > 0)) return setError('Enter the quantity.');
    if (Math.abs(delta) < 0.0001) return setError('The count matches the stock already — nothing to change.');
    const r = adjustStockBy({ productId: product.id, deltaQty: delta, reason, godownId, batchId: batchId || null, note, date });
    if (!r.success) return setError(r.message);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Adjust stock" subtitle="Take off stock that leaked, broke or expired, correct a count, or add stock received free. It is posted to your accounts.">
      <form onSubmit={submit} className="space-y-4" id="adjust-stock-form">
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <label className={labelCls} htmlFor="adj-item">Item</label>
          <select id="adj-item" value={pid} onChange={(e) => { setPid(e.target.value); setBatchId(''); }} className={inputCls}>
            <option value="">Select item…</option>
            {sorted.map((p) => <option key={p.id} value={p.id}>{p.name} ({num(p.stockKg)} {p.unit || 'pcs'})</option>)}
          </select>
        </div>
        <fieldset>
          <legend className={labelCls}>Reason</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Reason">
            {BILLING_ADJUST_REASONS.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} onClick={() => pickReason(r.id)} className={`px-3 py-2.5 rounded-2xl text-sm font-semibold border transition ${reason === r.id ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent' : 'bg-white dark:bg-[#162436] border-[#E5E5E1] dark:border-[#203248] text-[#374151] dark:text-[#CBD5E1]'}`}>{r.label}</button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          {godowns.length > 1 && (
            <div className={batches.length ? '' : 'col-span-2'}>
              <label className={labelCls} htmlFor="adj-godown">Godown</label>
              <select id="adj-godown" value={godownId} onChange={(e) => { setGodownId(e.target.value); setBatchId(''); }} className={inputCls}>
                {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}{product ? ` (${num(stockByGodown(product, stockBatches, godowns)[g.id] || 0)})` : ''}</option>)}
              </select>
            </div>
          )}
          {batches.length > 0 && (
            <div className={godowns.length > 1 ? '' : 'col-span-2'}>
              <label className={labelCls} htmlFor="adj-batch">Batch</label>
              <select id="adj-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} className={inputCls}>
                <option value="">{direction === 'out' ? 'Any (earliest expiry first)' : 'No batch'}</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b, unit, today)}</option>)}
              </select>
            </div>
          )}
          {meta.direction === 'either' && !isCount && (
            <div className="col-span-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Add or take off">
              <button type="button" role="radio" aria-checked={way === 'out'} onClick={() => setWay('out')} className={`${secondaryBtn} ${way === 'out' ? '!border-rose-400 !text-rose-700' : ''}`}><PackageMinus className="w-4 h-4" /> Take off</button>
              <button type="button" role="radio" aria-checked={way === 'in'} onClick={() => setWay('in')} className={`${secondaryBtn} ${way === 'in' ? '!border-teal-500 !text-teal-700' : ''}`}><PackagePlus className="w-4 h-4" /> Add</button>
            </div>
          )}
          {isCount ? (
            <div>
              <label className={labelCls} htmlFor="adj-counted">Counted ({unit})</label>
              <input id="adj-counted" type="number" inputMode="decimal" min="0" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} className={`${inputCls} tabular-nums`} placeholder={num(here)} />
            </div>
          ) : (
            <div>
              <label className={labelCls} htmlFor="adj-qty">{direction === 'out' ? 'Quantity lost' : 'Quantity added'} ({unit})</label>
              <input id="adj-qty" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
            </div>
          )}
          <div>
            <label className={labelCls} htmlFor="adj-date">Date</label>
            <input id="adj-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="adj-note">Note</label>
            <input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder={reason === 'leaked' ? 'e.g. 2 tins leaking in the back row' : 'optional'} />
          </div>
        </div>
        {product && (
          <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] px-4 py-3 text-sm space-y-0.5" data-testid="adjust-preview">
            <div className="flex justify-between"><span className="text-[#6B7280] dark:text-[#94A3B8]">{batch ? `In batch ${batch.batchNo}` : godowns.length > 1 ? 'In this godown' : 'In stock'} now</span><span className="tabular-nums font-bold">{num(here)} {unit}</span></div>
            <div className="flex justify-between"><span className="text-[#6B7280] dark:text-[#94A3B8]">Change</span><span className={`tabular-nums font-bold ${delta < 0 ? 'text-rose-700 dark:text-rose-300' : delta > 0 ? 'text-teal-700 dark:text-teal-300' : ''}`}>{delta > 0 ? '+' : ''}{num(delta)} {unit}</span></div>
            <div className="flex justify-between"><span className="text-[#6B7280] dark:text-[#94A3B8]">After</span><span className="tabular-nums font-bold">{num(Math.round((here + delta) * 100) / 100)} {unit}</span></div>
            {cost > 0 && Math.abs(delta) > 0 && (
              <div className="text-[11px] text-[#8E9299] pt-1">{delta < 0 ? `A loss of about ${rs(Math.round(-delta * cost))} at cost goes to “Stock losses”.` : reason === 'free' ? `About ${rs(Math.round(delta * cost))} at cost is added to stock as other income.` : `About ${rs(Math.round(delta * cost))} at cost is added back to stock.`}</div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}><Scale className="w-4 h-4" /> Save adjustment</button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Send goods back to a supplier (purchase return / debit note)
// ---------------------------------------------------------------------------
export const PurchaseReturnModal: React.FC<{ isOpen: boolean; onClose: () => void; supplierId?: string | null; productId?: string | null }> = ({ isOpen, onClose, supplierId, productId }) => {
  const { products, suppliers, godowns, stockBatches, purchases, returnToSupplier, setPrintRequest } = useTrading();
  const today = todayISO();
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const [sid, setSid] = useState(supplierId || '');
  const [pid, setPid] = useState(productId || '');
  const [godownId, setGodownId] = useState(godowns[0]?.id || '');
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: string; message: string } | null>(null);
  const busy = useRef(false);
  const product = products.find((p) => p.id === pid);
  const unit = product?.unit || 'pcs';
  const batches = product ? pickableRows(stockBatches, product.id, godownId) : [];
  const here = product ? (batches.find((b) => b.id === batchId)?.qty ?? stockByGodown(product, stockBatches, godowns)[godownId] ?? 0) : 0;
  const amount = (parseFloat(qty) || 0) * (parseFloat(rate) || 0);
  const supplier = suppliers.find((s) => s.id === sid);

  /** Default rate: what this supplier last charged for the item, else what it last cost. */
  const suggestRate = (supId: string, prodId: string) => {
    const bought = purchases.filter((p) => p.productId === prodId && (!supId || p.supplierId === supId)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const p = products.find((x) => x.id === prodId);
    const r = bought?.pricePerKg || p?.costPricePerKg || 0;
    setRate(r ? String(r) : '');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 800);
    setError('');
    const r = returnToSupplier({ supplierId: sid, productId: pid, qty: parseFloat(qty) || 0, rate: parseFloat(rate) || 0, reason, godownId, batchId: batchId || null, date });
    if (!r.success || !r.stockReturn) return setError(r.message);
    setDone({ id: r.stockReturn.id, message: r.message });
  };

  if (done) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Goods sent back" subtitle="The debit note is saved.">
        <div className="space-y-4">
          <Notice kind="ok">{done.message}</Notice>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setPrintRequest({ type: 'debit_note', returnId: done.id })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print debit note</button>
            <button type="button" onClick={onClose} className={primaryBtn}>Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Return goods to supplier" subtitle="Stock goes out and the amount is taken off what you owe the supplier. A debit note is made for them.">
      <form onSubmit={submit} className="space-y-4" id="purchase-return-form">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls} htmlFor="pr-supplier">Supplier</label>
            <select id="pr-supplier" value={sid} onChange={(e) => { setSid(e.target.value); if (pid) suggestRate(e.target.value, pid); }} className={inputCls}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company || s.name}{s.totalOwed ? ` (you owe ${rs(s.totalOwed)})` : ''}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="pr-item">Item</label>
            <select id="pr-item" value={pid} onChange={(e) => { setPid(e.target.value); setBatchId(''); suggestRate(sid, e.target.value); }} className={inputCls}>
              <option value="">Select item…</option>
              {sortedProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({num(p.stockKg)} {p.unit || 'pcs'})</option>)}
            </select>
          </div>
          {godowns.length > 1 && (
            <div className={batches.length ? '' : 'col-span-2'}>
              <label className={labelCls} htmlFor="pr-godown">From godown</label>
              <select id="pr-godown" value={godownId} onChange={(e) => { setGodownId(e.target.value); setBatchId(''); }} className={inputCls}>
                {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}{product ? ` (${num(stockByGodown(product, stockBatches, godowns)[g.id] || 0)})` : ''}</option>)}
              </select>
            </div>
          )}
          {batches.length > 0 && (
            <div className={godowns.length > 1 ? '' : 'col-span-2'}>
              <label className={labelCls} htmlFor="pr-batch">Batch</label>
              <select id="pr-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} className={inputCls}>
                <option value="">Any (earliest expiry first)</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b, unit, today)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls} htmlFor="pr-qty">Quantity ({unit})</label>
            <input id="pr-qty" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} tabular-nums`} placeholder={product ? `max ${num(here)}` : '0'} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pr-rate">Rate per {unit}</label>
            <input id="pr-rate" type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="Rs." />
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="pr-reason">Reason</label>
            <input id="pr-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. leaking tins, wrong item, expired" />
          </div>
          <div>
            <label className={labelCls} htmlFor="pr-date">Date</label>
            <input id="pr-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        {amount > 0 && (
          <p className="text-sm text-[#374151] dark:text-[#CBD5E1]" data-testid="return-amount">
            <strong className="tabular-nums">{rs(Math.round(amount * 100) / 100)}</strong> will be taken off what you owe {supplier ? supplier.company || supplier.name : 'the supplier'}.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}><Truck className="w-4 h-4" /> Send back</button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Item history: every movement with a running balance
// ---------------------------------------------------------------------------
const KIND_FILTERS: { id: 'all' | HistoryKind | 'returns'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sold', label: 'Sold' },
  { id: 'received', label: 'Received' },
  { id: 'returns', label: 'Returns' },
  { id: 'adjusted', label: 'Adjusted' },
  { id: 'transferred', label: 'Moved' },
];

export const ItemHistoryModal: React.FC<{
  productId: string | null;
  onClose: () => void;
  onAdjust?: (productId: string) => void;
  onReceive?: (productId: string) => void;
  onOpenBill?: (invoiceId: string) => void;
}> = ({ productId, onClose, onAdjust, onReceive, onOpenBill }) => {
  const { products, customers, suppliers, invoices, purchases, returns, adjustments, stockTransfers, dispatches, godowns, stockBatches, can, setPrintRequest, undoStockAdjustment, settings } = useTrading();
  const [filter, setFilter] = useState<(typeof KIND_FILTERS)[number]['id']>('all');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const product = products.find((p) => p.id === productId);
  const hist = useMemo(
    () => (productId ? itemHistory(productId, { products, customers, suppliers, invoices, purchases, returns, adjustments, stockTransfers, dispatches, godowns }) : { rows: [], opening: 0, closing: 0 }),
    [productId, products, customers, suppliers, invoices, purchases, returns, adjustments, stockTransfers, dispatches, godowns]
  );
  const unit = product?.unit || 'pcs';
  const shown = hist.rows
    .filter((r) => filter === 'all' || (filter === 'returns' ? r.kind === 'returned_in' || r.kind === 'returned_out' : filter === 'sold' ? r.kind === 'sold' || r.kind === 'dispatched' : r.kind === filter))
    .slice()
    .reverse();
  const canAdjust = can('stock:adjust');
  const canUndo = canAdjust && can('delete_records');
  const per = product && godowns.length > 1 ? stockByGodown(product, stockBatches, godowns) : null;

  return (
    <Modal isOpen={Boolean(product)} onClose={onClose} title={product ? `${product.name} — history` : 'History'} subtitle={product ? `In stock now: ${num(product.stockKg)} ${unit}` : undefined} wide
      footer={product && (
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={() => setPrintRequest({ type: 'billing_report', report: 'item_history', productId: product.id })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print</button>
          {onReceive && (can('products:create') || canAdjust) && <button type="button" onClick={() => onReceive(product.id)} className={secondaryBtn}><PackagePlus className="w-4 h-4 text-teal-700" /> Receive stock</button>}
          {onAdjust && canAdjust && <button type="button" onClick={() => onAdjust(product.id)} className={primaryBtn}><Scale className="w-4 h-4" /> Adjust stock</button>}
        </div>
      )}
    >
      {product && (
        <div className="space-y-3">
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
          {per && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6B7280] dark:text-[#94A3B8]">
              {godowns.map((g) => <span key={g.id}>{g.name}: <strong className="tabular-nums text-[#374151] dark:text-[#CBD5E1]">{num(per[g.id] || 0)}</strong></span>)}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Show">
            {KIND_FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`px-3 py-1.5 rounded-2xl text-xs font-bold border ${filter === f.id ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent' : 'bg-white dark:bg-[#101A26] border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]'}`}>{f.label}</button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-[#8E9299] py-6 text-center">Nothing here yet.</p>
          ) : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]" aria-label="Stock history" data-testid="item-history">
              {shown.map((r) => {
                const clickable = Boolean(r.invoiceId && onOpenBill);
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#111827] dark:text-white">{r.label}</span>
                      <span className="block text-[11px] text-[#8E9299]">
                        {r.date ? formatDate(r.date) : ''}{r.party && r.kind === 'sold' ? ` • ${r.party}` : ''}{r.godown ? ` • ${r.godown}` : ''}{r.ref && r.kind === 'adjusted' ? ` • ${r.ref}` : ''}{r.note ? ` • ${r.note}` : ''}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className={`block tabular-nums font-bold text-sm ${r.change > 0 ? 'text-teal-700 dark:text-teal-300' : r.change < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-[#8E9299]'}`}>{r.kind === 'opening' || r.kind === 'transferred' ? '—' : `${r.change > 0 ? '+' : '−'}${num(Math.abs(r.change))}`}</span>
                      <span className="block text-[11px] tabular-nums text-[#6B7280] dark:text-[#94A3B8]">bal {num(r.balance)}</span>
                    </span>
                  </>
                );
                return (
                  <li key={r.id} className="flex items-center gap-2 px-3 py-2.5" data-kind={r.kind}>
                    {clickable ? (
                      <button type="button" onClick={() => onOpenBill!(r.invoiceId!)} className="flex-1 min-w-0 flex items-center gap-3 text-left hover:opacity-80">{body}</button>
                    ) : (
                      <div className="flex-1 min-w-0 flex items-center gap-3">{body}</div>
                    )}
                    {r.adjustmentId && canUndo && !booksLockedFor(settings, r.date) && (
                      <button type="button" onClick={() => setUndoId(r.adjustmentId!)} aria-label={`Undo adjustment ${r.label}`} title="Undo this adjustment" className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600"><Undo2 className="w-4 h-4" /></button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog
        isOpen={Boolean(undoId)}
        title="Undo this adjustment?"
        message="The stock goes back to what it was before, and the accounts entry is removed."
        confirmLabel="Undo adjustment"
        onCancel={() => setUndoId(null)}
        onConfirm={() => {
          if (undoId) {
            const r = undoStockAdjustment(undoId);
            setNotice({ kind: r.success ? 'ok' : 'error', text: r.message });
          }
          setUndoId(null);
        }}
      />
    </Modal>
  );
};
