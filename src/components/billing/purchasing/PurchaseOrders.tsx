import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Printer, MessageCircle, PackagePlus, Pencil, Ban, FileText, ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTrading } from '../../../context/TradingContext';
import { Modal, Notice, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn, rs, moneyCls, EmptyState, pillCls, RowAction } from '../ui';
import { QuickSelect, PickOption } from '../QuickPick';
import { ScanButton } from './Barcodes';
import { ConfirmDialog } from '../../ConfirmDialog';
import { formatDate } from '../../../utils/formatters';
import { todayISO } from '../../../utils/stockFlow';
import { hasPack, formatPackQty } from '../../../utils/packUnits';
import {
  MATCH_FLAG_LABEL,
  MATCH_STATUS_LABEL,
  MatchResult,
  PO_STATUS_LABEL,
  lastPurchaseOf,
  poOutstanding,
  poWhatsAppText,
  threeWayMatch,
  whatsappLink,
} from '../../../utils/purchasing';
import { PurchaseOrder, PurchaseOrderStatus } from '../../../types';

const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
let seq = 0;
interface Line { key: number; productId: string; qty: string; rate: string }
const blank = (productId = '', qty = '', rate = ''): Line => ({ key: ++seq, productId, qty, rate });

export const statusChip = (status: PurchaseOrderStatus) => {
  const tone =
    status === 'received'
      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
      : status === 'partial'
        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
        : status === 'cancelled'
          ? 'bg-[#F4F3EF] dark:bg-[#1E2E40] text-[#6B7280] dark:text-[#94A3B8] line-through'
          : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`} data-status={status}>{PO_STATUS_LABEL[status]}</span>;
};

export const matchChip = (m: MatchResult) => {
  const tone =
    m.status === 'matched'
      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
      : m.status === 'mismatch'
        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
        : 'bg-[#F4F3EF] dark:bg-[#1E2E40] text-[#6B7280] dark:text-[#94A3B8]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`} data-match={m.status}>
      {m.status === 'mismatch' ? <AlertTriangle className="w-3 h-3" /> : m.status === 'matched' ? <CheckCircle2 className="w-3 h-3" /> : null}
      {MATCH_STATUS_LABEL[m.status]}
    </span>
  );
};

/** New or changed purchase order: supplier, items with quantity and rate, expected date. */
export const PurchaseOrderModal: React.FC<{ isOpen: boolean; onClose: () => void; editId?: string | null; supplierId?: string | null; lines?: { productId: string; qty: number; rate: number }[]; onSaved?: (po: PurchaseOrder) => void }> = ({ isOpen, onClose, editId, supplierId: presetSupplier, lines: presetLines, onSaved }) => {
  const { products, suppliers, purchases, purchaseOrders, createPurchaseOrder, updatePurchaseOrder } = useTrading();
  const editing = editId ? purchaseOrders.find((p) => p.id === editId) : undefined;
  const sorted = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const options: PickOption[] = useMemo(() => sorted.map((p) => ({ value: p.id, name: p.name, code: p.code, barcode: p.barcode })), [sorted]);
  const [supplierId, setSupplierId] = useState(editing?.supplierId || presetSupplier || '');
  const [orderDate, setOrderDate] = useState(editing?.orderDate || editing?.createdAt?.slice(0, 10) || todayISO());
  const [expected, setExpected] = useState(editing?.expectedDate || '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [lines, setLines] = useState<Line[]>(() => {
    if (editing) return (editing.items?.length ? editing.items : [{ productId: editing.productId, qty: editing.kg, rate: editing.pricePerKg }]).map((l) => blank(l.productId, String(l.qty), String(l.rate)));
    if (presetLines?.length) return presetLines.map((l) => blank(l.productId, String(l.qty), String(l.rate)));
    return [blank()];
  });
  const [error, setError] = useState('');
  const busy = useRef(false);
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  /** Rate to suggest: this supplier's last price for the item, else its last price from anyone, else the cost price. */
  const suggestRate = (productId: string) => {
    const fromSupplier = purchases.filter((p) => p.productId === productId && p.supplierId === supplierId).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const last = fromSupplier || lastPurchaseOf(purchases, productId);
    const p = products.find((x) => x.id === productId);
    const r = last?.pricePerKg ?? p?.costPricePerKg;
    return r != null && r > 0 ? String(r) : '';
  };
  const pickItem = (key: number, productId: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, productId, rate: l.rate || suggestRate(productId) } : l)));
  const addScanned = (productId: string) =>
    setLines((ls) => {
      const same = ls.find((l) => l.productId === productId);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: String((parseFloat(l.qty) || 0) + 1) } : l));
      const empty = ls.find((l) => !l.productId);
      if (empty) return ls.map((l) => (l === empty ? { ...l, productId, qty: l.qty || '1', rate: suggestRate(productId) } : l));
      return [...ls, blank(productId, '1', suggestRate(productId))];
    });
  const used = lines.filter((l) => l.productId || l.qty.trim());
  const total = used.reduce((a, l) => a + (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0), 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    setError('');
    const input = { supplierId, orderDate, expectedDate: expected || undefined, notes, lines: used.map((l) => ({ productId: l.productId, qty: parseFloat(l.qty) || 0, rate: parseFloat(l.rate) || 0 })) };
    const r = editing ? updatePurchaseOrder(editing.id, input) : createPurchaseOrder(input);
    if (!r.success) return setError(r.message);
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 800);
    onClose();
    if (r.order) onSaved?.(r.order);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? `Change ${editing.poNumber}` : 'New purchase order'} subtitle="What you are ordering from a supplier. Nothing changes in stock or accounts until the goods are received." wide
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm text-[#374151] dark:text-[#CBD5E1]">Total <strong className={moneyCls}>{rs(total)}</strong></span>
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" form="po-form" className={primaryBtn}>{editing ? 'Save order' : 'Save purchase order'}</button>
        </div>
      }
    >
      <form id="po-form" onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls} htmlFor="po-supplier">Supplier</label>
            <select id="po-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls} disabled={Boolean(editing && editing.receivedKg > 0)}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code ? `${s.code} • ` : ''}{s.company || s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="po-date">Order date</label>
            <input id="po-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="po-expected">Expected by</label>
            <input id="po-expected" type="date" value={expected} min={orderDate} onChange={(e) => setExpected(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const p = products.find((x) => x.id === l.productId);
            const received = editing?.items?.find((x) => x.productId === l.productId)?.receivedQty || 0;
            const amount = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0);
            return (
              <div key={l.key} className={`${cardCls} p-3 grid grid-cols-12 gap-2 items-end`} data-testid="po-line">
                <div className="col-span-12 sm:col-span-6">
                  <label className={labelCls} htmlFor={`po-item-${i + 1}`}>{lines.length > 1 ? `Item ${i + 1}` : 'Item'}</label>
                  <QuickSelect id={`po-item-${i + 1}`} value={l.productId} options={options} onPick={(v) => pickItem(l.key, v)} className={inputCls}>
                    <option value="">Select item…</option>
                    {sorted.map((x) => <option key={x.id} value={x.id}>{x.code ? `${x.code} • ` : ''}{x.name} ({x.stockKg.toLocaleString()} {x.unit || 'pcs'} in stock)</option>)}
                  </QuickSelect>
                </div>
                <div className="col-span-5 sm:col-span-2">
                  <label className={labelCls} htmlFor={`po-qty-${i + 1}`}>Qty{p ? ` (${p.unit || 'pcs'})` : ''}</label>
                  <input id={`po-qty-${i + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="0" />
                </div>
                <div className="col-span-5 sm:col-span-3">
                  <label className={labelCls} htmlFor={`po-rate-${i + 1}`}>Rate (Rs.)</label>
                  <input id={`po-rate-${i + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="per unit" />
                </div>
                <div className="col-span-2 sm:col-span-1 flex justify-end">
                  <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))} className="h-11 w-11 inline-flex items-center justify-center rounded-2xl text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label={`Remove item ${i + 1}`}><Trash2 className="w-4 h-4" /></button>
                </div>
                {p && (
                  <div className="col-span-12 flex flex-wrap gap-x-3 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                    {hasPack(p) && (parseFloat(l.qty) || 0) > 0 && <span>= {formatPackQty(parseFloat(l.qty) || 0, p)}</span>}
                    {received > 0 && <span className="font-semibold text-amber-700 dark:text-amber-300">{num(received)} already received</span>}
                    {amount > 0 && <span className="ml-auto font-semibold text-[#111827] dark:text-white">{rs(amount)}</span>}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className={secondaryBtn}><Plus className="w-4 h-4" /> Add item</button>
            <ScanButton onPick={(p) => addScanned(p.id)} keepOpen />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="po-notes">Note (optional)</label>
          <input id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. deliver to Batkhela godown" />
        </div>
      </form>
    </Modal>
  );
};

/** One order: lines ordered / received / still to come, the three-way match and what to do next. */
export const PurchaseOrderDetail: React.FC<{ orderId: string | null; onClose: () => void; onEdit: (id: string) => void; onReceive: (id: string) => void; onBill: (id: string) => void }> = ({ orderId, onClose, onEdit, onReceive, onBill }) => {
  const { purchaseOrders, purchases, products, suppliers, supplierBills, settings, setPrintRequest, cancelOrder, removePurchaseOrder, can } = useTrading();
  const po = purchaseOrders.find((p) => p.id === orderId);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const receipts = useMemo(() => (po ? purchases.filter((p) => p.purchaseOrderId === po.id) : []), [po, purchases]);
  const bills = useMemo(() => (po ? supplierBills.filter((b) => b.purchaseOrderId === po.id) : []), [po, supplierBills]);
  const match = useMemo(() => (po ? threeWayMatch({ po, receipts, bills, products }) : null), [po, receipts, bills, products]);
  if (!po || !match) return null;
  const supplier = suppliers.find((s) => s.id === po.supplierId);
  const open = po.status === 'open' || po.status === 'partial';
  const canOrder = can('products:create') || can('stock:adjust');
  const whatsapp = () => window.open(whatsappLink(supplier?.phone, poWhatsAppText(po, products, supplier, settings.companyName || 'Sarmaya', formatDate)), '_blank', 'noopener');

  return (
    <Modal isOpen onClose={onClose} title={`Purchase order ${po.poNumber}`} subtitle={`${supplier?.company || supplier?.name || 'Supplier'} • ${formatDate(po.orderDate || po.createdAt.slice(0, 10))}${po.expectedDate ? ` • expected ${formatDate(po.expectedDate)}` : ''}`} wide
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          {open && canOrder && <button type="button" onClick={() => onReceive(po.id)} className={`${primaryBtn} col-span-2`}><PackagePlus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Receive goods</button>}
          {receipts.length > 0 && can('suppliers:edit') && <button type="button" onClick={() => onBill(po.id)} className={secondaryBtn}><FileText className="w-4 h-4" /> Supplier bill</button>}
          <button type="button" onClick={() => setPrintRequest({ type: 'purchase_order', purchaseOrderId: po.id })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print</button>
          <button type="button" onClick={whatsapp} className={secondaryBtn}><MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp</button>
          {open && canOrder && <button type="button" onClick={() => onEdit(po.id)} className={secondaryBtn}><Pencil className="w-4 h-4" /> Change</button>}
          {open && canOrder && <button type="button" onClick={() => setConfirm('cancel')} className={dangerBtn}><Ban className="w-4 h-4" /> Cancel order</button>}
          {can('delete_records') && po.receivedKg === 0 && receipts.length === 0 && <button type="button" onClick={() => setConfirm('delete')} className={dangerBtn}><Trash2 className="w-4 h-4" /> Delete</button>}
        </div>
      }
    >
      <div className="space-y-4">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="flex flex-wrap items-center gap-2">{statusChip(po.status)}{(receipts.length > 0 || bills.length > 0) && matchChip(match)}<span className={`ml-auto font-extrabold ${moneyCls}`}>{rs(po.amount)}</span></div>
        <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
          <table className="w-full min-w-[560px] text-sm" data-testid="po-match">
            <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[10px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">
              <tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Billed</th><th className="px-3 py-2 text-right">Rates (order / recv / bill)</th></tr>
            </thead>
            <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {match.lines.map((l) => (
                <tr key={l.productId} className={l.flags.some((f) => f !== 'short_received' && f !== 'not_billed') ? 'bg-rose-50/60 dark:bg-rose-950/20' : ''}>
                  <td className="px-3 py-2"><span className="font-semibold">{l.name}</span>{l.flags.length > 0 && <span className="block text-[11px] font-semibold text-rose-700 dark:text-rose-300">{l.flags.map((f) => MATCH_FLAG_LABEL[f]).join(' • ')}</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{num(l.ordered)} {l.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{num(l.received)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{bills.length ? num(l.billed) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-xs">{l.orderRate != null ? num(l.orderRate) : '—'} / {l.receivedRate != null ? num(l.receivedRate) : '—'} / {l.billedRate != null ? num(l.billedRate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Ordered</div><div className={`${moneyCls} font-extrabold`}>{rs(match.orderedValue)}</div></div>
          <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Received</div><div className={`${moneyCls} font-extrabold`}>{rs(match.receivedValue)}</div></div>
          <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Billed</div><div className={`${moneyCls} font-extrabold`}>{bills.length ? rs(match.billTotal) : '—'}</div></div>
        </div>
        {receipts.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Goods received</h3>
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-sm">
              {receipts.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0 truncate"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{r.receiptNumber}</span>{formatDate(r.date)} • {num(r.kg)} {products.find((p) => p.id === r.productId)?.name || 'item'} @ {rs(r.pricePerKg)}</span><span className={`${moneyCls} font-bold`}>{rs(r.amount)}</span></li>
              ))}
            </ul>
          </div>
        )}
        {bills.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Supplier bills</h3>
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-sm">
              {bills.map((b) => (
                <li key={b.id} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0 truncate">Bill {b.billNumber} • {formatDate(b.date)}{Math.abs(b.variance) >= 0.01 ? ` • difference ${b.variance > 0 ? '+' : '−'}${rs(Math.abs(b.variance))}` : ''}</span><span className={`${moneyCls} font-bold`}>{rs(b.amount)}</span></li>
              ))}
            </ul>
          </div>
        )}
        {po.notes && <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Note: {po.notes}</p>}
      </div>
      <ConfirmDialog
        isOpen={Boolean(confirm)}
        title={confirm === 'delete' ? `Delete ${po.poNumber}?` : `Cancel ${po.poNumber}?`}
        message={confirm === 'delete' ? 'The order is removed. Nothing was received on it.' : 'Whatever is still to come is cancelled. Goods already received stay in stock and on the supplier account.'}
        confirmLabel={confirm === 'delete' ? 'Delete order' : 'Cancel order'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const r = confirm === 'delete' ? removePurchaseOrder(po.id) : cancelOrder(po.id);
          setConfirm(null);
          if (confirm === 'delete' && r.success) onClose();
          else setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
        }}
      />
    </Modal>
  );
};

type Filter = 'active' | 'all' | PurchaseOrderStatus;

/** Purchase orders list (Suppliers → Orders). */
export const PurchaseOrdersView: React.FC<{ onNew: () => void; onOpen: (id: string) => void; onReceive: (id: string) => void; onReorder: () => void }> = ({ onNew, onOpen, onReceive, onReorder }) => {
  const { purchaseOrders, suppliers, purchases, supplierBills, products, can } = useTrading();
  const [filter, setFilter] = useState<Filter>('active');
  const today = todayISO();
  const canOrder = can('products:create') || can('stock:adjust');
  const rows = useMemo(
    () =>
      purchaseOrders
        .filter((p) => (filter === 'all' ? true : filter === 'active' ? p.status === 'open' || p.status === 'partial' : p.status === filter))
        .sort((a, b) => ((b.orderDate || b.createdAt) > (a.orderDate || a.createdAt) ? 1 : (b.orderDate || b.createdAt) < (a.orderDate || a.createdAt) ? -1 : b.poNumber.localeCompare(a.poNumber))),
    [purchaseOrders, filter]
  );
  const supName = (id: string) => {
    const s = suppliers.find((x) => x.id === id);
    return s ? s.company || s.name : 'Supplier';
  };
  const count = (f: Filter) => purchaseOrders.filter((p) => (f === 'all' ? true : f === 'active' ? p.status === 'open' || p.status === 'partial' : p.status === f)).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Order status" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {(['active', 'received', 'cancelled', 'all'] as Filter[]).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={pillCls(filter === f)}>
              {f === 'active' ? 'Open' : f === 'all' ? 'All' : PO_STATUS_LABEL[f as PurchaseOrderStatus]} ({count(f)})
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <button type="button" onClick={onReorder} className={secondaryBtn}><ClipboardList className="w-4 h-4 text-amber-600" /> Re-order report</button>
          {canOrder && <button type="button" onClick={onNew} className={primaryBtn}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New order</button>}
        </div>
      </div>
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <EmptyState icon={<ClipboardList className="w-5 h-5" />} text={filter === 'active' ? 'No open purchase orders. Make one to order stock from a supplier, or use the re-order report.' : 'No orders here.'} action={canOrder && filter === 'active' && <button type="button" onClick={onNew} className={secondaryBtn}><Plus className="w-4 h-4" /> New order</button>} />
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]" aria-label="Purchase orders">
            {rows.map((po) => {
              const lines = poOutstanding(po);
              const late = (po.status === 'open' || po.status === 'partial') && po.expectedDate && po.expectedDate < today;
              const receipts = purchases.filter((p) => p.purchaseOrderId === po.id);
              const bills = supplierBills.filter((b) => b.purchaseOrderId === po.id);
              const m = receipts.length || bills.length ? threeWayMatch({ po, receipts, bills, products }) : null;
              return (
                <li key={po.id} className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                  <button type="button" onClick={() => onOpen(po.id)} className="flex-1 min-w-0 text-left" aria-label={`Open ${po.poNumber}`}>
                    <span className="flex items-center gap-2 min-w-0 font-semibold text-sm text-[#111827] dark:text-white"><span className="tabular-nums text-xs text-[#8E9299]">{po.poNumber}</span><span className="truncate">{supName(po.supplierId)}</span></span>
                    <span className="block text-[11px] text-[#6B7280] dark:text-[#8E9299] truncate">
                      {formatDate(po.orderDate || po.createdAt.slice(0, 10))} • {lines.length} item{lines.length === 1 ? '' : 's'}
                      {po.status === 'partial' ? ` • ${lines.filter((l) => l.remaining > 0).length} still to come` : ''}
                      {po.expectedDate ? <span className={late ? 'text-rose-700 dark:text-rose-300 font-semibold' : ''}> • {late ? 'late, was due' : 'due'} {formatDate(po.expectedDate)}</span> : ''}
                    </span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">{statusChip(po.status)}{m && matchChip(m)}</div>
                  <span className={`${moneyCls} font-bold text-sm w-28 text-right shrink-0`}>{rs(po.amount)}</span>
                  {(po.status === 'open' || po.status === 'partial') && canOrder && <RowAction label={`Receive goods for ${po.poNumber}`} text="Receive" alwaysText tone="teal" icon={<PackagePlus className="w-4 h-4" />} onClick={() => onReceive(po.id)} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
