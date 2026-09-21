import { ConfirmDialog } from '../ConfirmDialog';
import React, { useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, Plus, ArrowRight, Check, X } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice, cardCls } from './ui';
import { Product } from '../../types';
import { todayISO } from '../../utils/stockFlow';
import { expiryAlerts, expiryStatus, fmtExpiry, godownName, liveBatches, stockByGodown } from '../../utils/inventory';

const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });

/** Red = expired, amber = expires within 30 days. */
export const ExpiryBadge: React.FC<{ expiryDate?: string }> = ({ expiryDate }) => {
  const status = expiryStatus(expiryDate, todayISO());
  if (status === 'none') return <span className="text-[#8E9299]">no expiry</span>;
  const cls =
    status === 'expired'
      ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
      : status === 'soon'
        ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
        : 'bg-[#F4F3EF] dark:bg-[#1E2E40] text-[#374151] dark:text-[#CBD5E1]';
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-bold ${cls}`} data-expiry={status}>
      {status === 'expired' ? 'Expired ' : 'Exp '}
      {fmtExpiry(expiryDate)}
    </span>
  );
};

/** Under an item on the Items screen: stock per godown (only with 2+ godowns) and its live batches. */
export const ItemStockDetails: React.FC<{ product: Product }> = ({ product }) => {
  const { stockBatches, godowns } = useTrading();
  const batches = liveBatches(stockBatches, product.id);
  const multi = godowns.length > 1;
  const per = multi ? stockByGodown(product, stockBatches, godowns) : null;
  if (!per && batches.length === 0) return null;
  const unit = product.unit || 'pcs';
  return (
    <div className="mt-1.5 space-y-1 text-[11px]" data-testid={`stock-details-${product.id}`}>
      {per && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[#6B7280] dark:text-[#94A3B8]">
          {godowns.filter((g) => (per[g.id] || 0) !== 0).map((g) => (
            <span key={g.id} data-godown={g.name} className="whitespace-nowrap">{g.name}: <strong className="tabular-nums text-[#374151] dark:text-[#CBD5E1]">{num(per[g.id] || 0)}</strong></span>
          ))}
        </div>
      )}
      {batches.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Batches of ${product.name}`}>
          {batches.map((b) => (
            <li key={b.id} className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E5E5E1] dark:border-[#203248] px-2 py-1">
              <span className="font-bold text-[#111827] dark:text-white">{b.batchNo}</span>
              <ExpiryBadge expiryDate={b.expiryDate} />
              <span className="tabular-nums whitespace-nowrap">{num(b.qty)} {unit}</span>
              {multi && <span className="text-[#8E9299] whitespace-nowrap">{godownName(godowns, b.godownId)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Home "Needs attention": expired and expiring-soon batches. */
export const ExpiryAttention: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { stockBatches, products } = useTrading();
  const alerts = useMemo(() => expiryAlerts(stockBatches, products, todayISO()), [stockBatches, products]);
  if (alerts.length === 0) return null;
  const expired = alerts.filter((a) => a.status === 'expired').length;
  const soon = alerts.length - expired;
  return (
    <div className="space-y-1" data-testid="expiry-attention">
      <button type="button" onClick={onOpen} className="block w-full text-left text-sm text-[#374151] dark:text-[#CBD5E1] hover:text-[#111827] dark:hover:text-white">
        {expired > 0 && <span className="font-bold text-rose-700 dark:text-rose-300">{expired} expired batch{expired === 1 ? '' : 'es'}</span>}
        {expired > 0 && soon > 0 && ' • '}
        {soon > 0 && <span className="font-bold text-amber-700 dark:text-amber-300">{soon} expiring within 30 days</span>}
      </button>
      {alerts.slice(0, 4).map((a) => (
        <button key={a.batch.id} type="button" onClick={onOpen} className="block w-full text-left text-xs text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white">
          <strong className="text-[#374151] dark:text-[#CBD5E1]">{a.product.name}</strong> batch {a.batch.batchNo}: {num(a.batch.qty)} {a.product.unit || 'pcs'} —{' '}
          <span className={a.status === 'expired' ? 'text-rose-700 dark:text-rose-300 font-semibold' : 'text-amber-700 dark:text-amber-300 font-semibold'}>
            {a.status === 'expired' ? `expired ${fmtExpiry(a.batch.expiryDate)}` : a.days === 0 ? 'expires today' : `expires in ${a.days} day${a.days === 1 ? '' : 's'}`}
          </span>
        </button>
      ))}
    </div>
  );
};

interface ReceiveLine { key: number; pid: string; qty: string; cost: string; batchNo: string; expiry: string }
let lineSeq = 0;
const blankLine = (pid = ''): ReceiveLine => ({ key: ++lineSeq, pid, qty: '', cost: '', batchNo: '', expiry: '' });

/**
 * Receive stock into a godown: one or more items in one go (e.g. a supplier's whole delivery).
 * Batch-tracked items take a batch number and expiry per line.
 */
export const ReceiveStockModal: React.FC<{ isOpen: boolean; onClose: () => void; productId?: string | null; supplierId?: string | null }> = ({ isOpen, onClose, productId, supplierId: presetSupplier }) => {
  const { products, suppliers, godowns, receiveStock } = useTrading();
  const sorted = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const [lines, setLines] = useState<ReceiveLine[]>(() => [blankLine(productId || '')]);
  const [godownId, setGodownId] = useState(godowns[0]?.id || '');
  const [supplierId, setSupplierId] = useState(presetSupplier || '');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');
  const busy = useRef(false);
  const supplier = suppliers.find((x) => x.id === supplierId);

  const setLine = (key: number, patch: Partial<ReceiveLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const used = lines.filter((l) => l.pid || l.qty.trim());
  const total = used.reduce((a, l) => a + (parseFloat(l.qty) || 0) * (parseFloat(l.cost) || 0), 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    setError('');
    if (used.length === 0) return setError('Pick an item.');
    if (date > todayISO()) return setError('The date cannot be in the future.');
    // Check every line before saving anything, so a delivery is never half-saved.
    for (const [i, l] of used.entries()) {
      const p = products.find((x) => x.id === l.pid);
      const where = used.length > 1 ? `Line ${i + 1}: ` : '';
      if (!p) return setError(`${where}pick an item.`);
      if (!(parseFloat(l.qty) > 0)) return setError(`${where}enter the quantity of ${p.name}.`);
      if (supplierId && !(parseFloat(l.cost) > 0)) {
        return setError(`${where}enter the cost per ${p.unit || 'unit'} of ${p.name} so it is added to what you owe ${supplier?.company || supplier?.name || 'the supplier'} — or leave the supplier empty.`);
      }
      if (p.trackBatches && l.expiry && l.expiry < date) return setError(`${where}the expiry date of ${p.name} is before the date received.`);
    }
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 800);
    let owed = supplier?.totalOwed ?? 0;
    for (const l of used) {
      const p = products.find((x) => x.id === l.pid)!;
      const qty = parseFloat(l.qty) || 0;
      const cost = l.cost.trim() ? parseFloat(l.cost) : undefined;
      const r = receiveStock({
        productId: l.pid,
        godownId,
        qty,
        batchNo: p.trackBatches ? l.batchNo : undefined,
        expiryDate: p.trackBatches ? l.expiry || undefined : undefined,
        costPrice: cost,
        supplierId: supplierId || null,
        date,
        owedBefore: supplierId ? owed : undefined,
      });
      if (!r.success) return setError(r.message);
      if (supplierId && cost) owed += qty * cost;
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receive stock" subtitle="Add stock you bought or brought in — one item or a whole delivery. With a supplier and cost, it is also added to what you owe them.">
      <form onSubmit={submit} className="space-y-4" id="receive-stock-form">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls} htmlFor="rs-supplier">Supplier (optional)</label>
            <select id="rs-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
              <option value="">None</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code ? `${s.code} • ` : ''}{s.name}{s.company && s.company !== s.name ? ` • ${s.company}` : ''}</option>)}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls} htmlFor="rs-date">Date received</label>
            <input id="rs-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          {godowns.length > 1 && (
            <div className="col-span-2">
              <label className={labelCls} htmlFor="rs-godown">Into godown</label>
              <select id="rs-godown" value={godownId} onChange={(e) => setGodownId(e.target.value)} className={inputCls}>
                {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => {
            const p = products.find((x) => x.id === l.pid);
            const unit = p?.unit || 'unit';
            const id = (f: string) => (i === 0 ? `rs-${f}` : `rs-${f}-${i + 1}`);
            const amount = (parseFloat(l.qty) || 0) * (parseFloat(l.cost) || 0);
            return (
              <div key={l.key} className={`${cardCls} p-3 space-y-3`} data-testid="receive-line">
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className={labelCls} htmlFor={id('item')}>{lines.length > 1 ? `Item ${i + 1}` : 'Item'}</label>
                    <select id={id('item')} value={l.pid} onChange={(e) => setLine(l.key, { pid: e.target.value })} className={inputCls}>
                      <option value="">Select item…</option>
                      {sorted.map((x) => <option key={x.id} value={x.id}>{x.name}{x.trackBatches ? ' (batches)' : ''}</option>)}
                    </select>
                  </div>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-2xl text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label={`Remove item ${i + 1}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} htmlFor={id('qty')}>Quantity{p ? ` (${unit})` : ''}</label>
                    <input id={id('qty')} type="number" inputMode="decimal" min="0" step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor={id('cost')}>Cost per {unit}{supplierId ? '' : ' (optional)'}</label>
                    <input id={id('cost')} type="number" inputMode="decimal" min="0" step="any" value={l.cost} onChange={(e) => setLine(l.key, { cost: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="Rs." />
                  </div>
                  {p?.trackBatches && (
                    <>
                      <div>
                        <label className={labelCls} htmlFor={id('batch')}>Batch no.</label>
                        <input id={id('batch')} value={l.batchNo} onChange={(e) => setLine(l.key, { batchNo: e.target.value })} className={inputCls} placeholder="auto if empty" />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor={id('expiry')}>Expiry date</label>
                        <input id={id('expiry')} type="date" value={l.expiry} onChange={(e) => setLine(l.key, { expiry: e.target.value })} className={inputCls} />
                      </div>
                    </>
                  )}
                </div>
                {amount > 0 && <p className="text-xs text-right text-[#6B7280] dark:text-[#94A3B8]">Amount <strong className="tabular-nums text-[#111827] dark:text-white">Rs. {num(amount)}</strong></p>}
              </div>
            );
          })}
          <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 dark:text-teal-400 hover:underline">
            <Plus className="w-4 h-4" /> Add another item
          </button>
        </div>

        {supplierId && total > 0 && (
          <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Total <strong className="tabular-nums">Rs. {num(total)}</strong> will be added to what you owe {supplier?.company || supplier?.name}.</p>
        )}
        {!supplierId && total > 0 && <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Total value <strong className="tabular-nums">Rs. {num(total)}</strong></p>}
        {used.some((l) => { const p = products.find((x) => x.id === l.pid); return p && !p.trackBatches; }) && lines.length === 1 && (
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Want batch numbers and expiry dates? Edit the item and turn on “Track batch &amp; expiry”.</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>{used.length > 1 ? `Receive ${used.length} items` : 'Receive stock'}</button>
        </div>
      </form>
    </Modal>
  );
};

/** Move stock of one item from one godown to another. */
export const TransferStockModal: React.FC<{ isOpen: boolean; onClose: () => void; productId?: string | null }> = ({ isOpen, onClose, productId }) => {
  const { products, godowns, stockBatches, transferStock } = useTrading();
  const sorted = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const [pid, setPid] = useState(productId || '');
  const [from, setFrom] = useState(godowns[0]?.id || '');
  const [to, setTo] = useState(godowns[1]?.id || '');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const product = products.find((p) => p.id === pid);
  const per = product ? stockByGodown(product, stockBatches, godowns) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!product) return setError('Pick an item.');
    const r = transferStock({ productId: pid, fromGodownId: from, toGodownId: to, qty: parseFloat(qty) || 0, date, note });
    if (!r.success) return setError(r.message);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Move stock" subtitle="Move stock between godowns. Total stock does not change; batches keep their expiry.">
      <form onSubmit={submit} className="space-y-4" id="transfer-stock-form">
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <label className={labelCls} htmlFor="tr-item">Item</label>
          <select id="tr-item" value={pid} onChange={(e) => setPid(e.target.value)} className={inputCls}>
            <option value="">Select item…</option>
            {sorted.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="tr-from">From</label>
            <select id="tr-from" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}>
              {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}{per ? ` (${num(per[g.id] || 0)})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="tr-to">To</label>
            <select id="tr-to" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}>
              {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}{per ? ` (${num(per[g.id] || 0)})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="tr-qty">Quantity{product ? ` (${product.unit || 'pcs'})` : ''}</label>
            <input id="tr-qty" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
          </div>
          <div>
            <label className={labelCls} htmlFor="tr-date">Date</label>
            <input id="tr-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="tr-note">Note (optional)</label>
            <input id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="e.g. sent with Rashid's truck" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}><ArrowRight className="w-4 h-4" /> Move stock</button>
        </div>
      </form>
    </Modal>
  );
};

/** Add, rename and delete godowns; see recent stock moves. */
export const GodownsModal: React.FC<{ isOpen: boolean; onClose: () => void; onMoveStock: () => void }> = ({ isOpen, onClose, onMoveStock }) => {
  const { godowns, stockBatches, stockTransfers, products, addGodown, updateGodown, deleteGodown, can } = useTrading();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const canDelete = can('delete_records');
  const [confirmDel, setConfirmDel] = useState<{ title: string; message: string; label: string; action: () => void } | null>(null);

  // Cans, tins and bags can't be added together, so the list counts items that have stock here.
  const itemsIn = (gid: string) => products.filter((p) => (stockByGodown(p, stockBatches, godowns)[gid] || 0) > 0).length;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const r = addGodown(name, address);
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) { setName(''); setAddress(''); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Godowns" subtitle="Where your stock is kept. Bills and stock receipts can pick a godown once you have more than one.">
      <div className="space-y-5">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
          {godowns.map((g) => (
            <li key={g.id} className="flex items-center gap-2 px-3 py-2.5">
              {editing?.id === g.id ? (
                <>
                  <input aria-label="Godown name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} className={inputCls} autoFocus />
                  <button type="button" aria-label="Save name" onClick={() => { const r = updateGodown(g.id, { name: editing.name }); setMsg({ kind: r.success ? 'ok' : 'error', text: r.message }); if (r.success) setEditing(null); }} className="p-2 rounded-xl text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"><Check className="w-4 h-4" /></button>
                  <button type="button" aria-label="Cancel rename" onClick={() => setEditing(null)} className="p-2 rounded-xl text-[#9CA3AF]"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{g.name}{g.isDefault && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">main</span>}</div>
                    <div className="text-[11px] text-[#8E9299]">{itemsIn(g.id) === 0 ? 'Empty' : `${itemsIn(g.id)} item${itemsIn(g.id) === 1 ? '' : 's'} in stock`}{g.address ? ` • ${g.address}` : ''}</div>
                  </div>
                  <button type="button" aria-label={`Rename ${g.name}`} onClick={() => setEditing({ id: g.id, name: g.name })} className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#111827] dark:hover:text-white"><Pencil className="w-4 h-4" /></button>
                  {canDelete && !g.isDefault && (
                    <button type="button" aria-label={`Delete ${g.name}`} onClick={() => setConfirmDel({ title: `Delete ${g.name}?`, message: 'The godown is removed. Godowns that still hold stock cannot be deleted.', label: 'Delete godown', action: () => { const r = deleteGodown(g.id); setMsg({ kind: r.success ? 'ok' : 'error', text: r.message }); } })} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="gd-name">New godown</label>
            <input id="gd-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Batkhela godown" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="gd-address">Address (optional)</label>
            <input id="gd-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
          </div>
          <button type="submit" className={`${secondaryBtn} sm:col-span-1`}><Plus className="w-4 h-4" /> Add</button>
        </form>
        {godowns.length > 1 && (
          <button type="button" onClick={onMoveStock} className={`${primaryBtn} w-full`}><ArrowRight className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Move stock between godowns</button>
        )}
        {stockTransfers.length > 0 && (
          <div className={`${cardCls} p-4`}>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-2">Recent stock moves</h3>
            <ul className="space-y-1.5 text-xs text-[#374151] dark:text-[#CBD5E1]">
              {stockTransfers.slice(0, 8).map((t) => {
                const p = products.find((x) => x.id === t.productId);
                return (
                  <li key={t.id}>
                    <span className="tabular-nums text-[#8E9299]">{fmtExpiry(t.date)}</span> • <strong>{num(t.qty)} {p?.unit || 'pcs'} {p?.name || 'item'}</strong>: {godownName(godowns, t.fromGodownId)} → {godownName(godowns, t.toGodownId)}{t.note ? ` (${t.note})` : ''}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={secondaryBtn}>Done</button>
        </div>
      </div>
      <ConfirmDialog
        isOpen={Boolean(confirmDel)}
        title={confirmDel?.title || ''}
        message={confirmDel?.message || ''}
        confirmLabel={confirmDel?.label}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => { confirmDel?.action(); setConfirmDel(null); }}
      />
    </Modal>
  );
};

