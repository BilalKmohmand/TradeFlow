import React, { useMemo, useRef, useState } from 'react';
import { FileText, Printer, Trash2, Plus } from 'lucide-react';
import { useTrading } from '../../../context/TradingContext';
import { Modal, Notice, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs, moneyCls, EmptyState, RowAction } from '../ui';
import { ConfirmDialog } from '../../ConfirmDialog';
import { formatDate } from '../../../utils/formatters';
import { todayISO } from '../../../utils/stockFlow';
import { booksLockedFor } from '../../../utils/accounting';
import { MATCH_FLAG_LABEL, threeWayMatch, unbilledReceipts } from '../../../utils/purchasing';
import { matchChip } from './PurchaseOrders';
import { SupplierBill } from '../../../types';

const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Record the supplier's own bill for goods already received, and see at once whether it matches
 * the order and what came in. Only the difference from the goods received changes what you owe.
 */
export const SupplierBillModal: React.FC<{ isOpen: boolean; onClose: () => void; supplierId?: string | null; purchaseOrderId?: string | null; onSaved?: (msg: string) => void }> = ({ isOpen, onClose, supplierId: preSupplier, purchaseOrderId, onSaved }) => {
  const { suppliers, purchases, purchaseOrders, supplierBills, products, recordSupplierBill } = useTrading();
  const po = purchaseOrderId ? purchaseOrders.find((p) => p.id === purchaseOrderId) : undefined;
  const [supplierId, setSupplierId] = useState(po?.supplierId || preSupplier || '');
  const open = useMemo(() => unbilledReceipts(purchases, supplierBills, supplierId || '__none__').sort((a, b) => (a.date < b.date ? 1 : -1)), [purchases, supplierBills, supplierId]);
  const [picked, setPicked] = useState<string[]>(() => (po ? unbilledReceipts(purchases, supplierBills, po.supplierId).filter((r) => r.purchaseOrderId === po.id).map((r) => r.id) : []));
  // Typed values per item: qty and rate as on the supplier's paper (default = what was received).
  const [typed, setTyped] = useState<Record<string, { qty?: string; rate?: string }>>({});
  const [billNumber, setBillNumber] = useState('');
  const [date, setDate] = useState(todayISO());
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const busy = useRef(false);
  const selected = open.filter((r) => picked.includes(r.id));
  const received = useMemo(() => {
    const m = new Map<string, { qty: number; value: number }>();
    selected.forEach((r) => {
      const cur = m.get(r.productId) || { qty: 0, value: 0 };
      m.set(r.productId, { qty: cur.qty + r.kg, value: cur.value + r.amount });
    });
    return m;
  }, [selected]);
  const lines = Array.from(received.entries()).map(([productId, v]) => {
    const t = typed[productId] || {};
    const qty = t.qty != null ? parseFloat(t.qty) || 0 : r4(v.qty);
    const rate = t.rate != null ? parseFloat(t.rate) || 0 : v.qty > 0 ? r4(v.value / v.qty) : 0;
    return { productId, qty, rate, qtyText: t.qty ?? String(r4(v.qty)), rateText: t.rate ?? String(v.qty > 0 ? r4(v.value / v.qty) : 0) };
  });
  const orderOfReceipts = po || purchaseOrders.find((p) => selected.some((r) => r.purchaseOrderId === p.id));
  const draft: SupplierBill = {
    id: 'draft', billNumber: billNumber || 'draft', supplierId, date, purchaseIds: picked, receivedValue: 0, variance: 0, createdAt: '',
    lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate, amount: Math.round(l.qty * l.rate * 100) / 100 })),
    otherCharges: parseFloat(other) || 0,
    amount: 0,
  };
  const match = threeWayMatch({ po: orderOfReceipts, receipts: selected, bills: selected.length ? [draft] : [], products });
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    setError('');
    const r = recordSupplierBill({ supplierId, billNumber, date, purchaseOrderId: orderOfReceipts?.id || null, purchaseIds: picked, lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate })), otherCharges: parseFloat(other) || 0, note });
    if (!r.success) return setError(r.message);
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 800);
    onSaved?.(r.message);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record supplier bill" subtitle="Type the supplier's invoice for goods you have received. It is checked against the order and the goods received." wide
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm">Bill total <strong className={moneyCls}>{rs(match.billTotal)}</strong></span>
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" form="sbill-form" className={primaryBtn}>Save bill</button>
        </div>
      }
    >
      <form id="sbill-form" onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls} htmlFor="sb-supplier">Supplier</label>
            <select id="sb-supplier" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPicked([]); setTyped({}); }} className={inputCls} disabled={Boolean(po)}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company || s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="sb-number">Supplier's bill no.</label>
            <input id="sb-number" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className={inputCls} placeholder="e.g. 4471" autoComplete="off" />
          </div>
          <div>
            <label className={labelCls} htmlFor="sb-date">Bill date</label>
            <input id="sb-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <h3 className={labelCls}>Goods received on this bill</h3>
          {!supplierId ? <p className="text-sm text-[#8E9299]">Pick the supplier first.</p> : open.length === 0 ? (
            <p className="text-sm text-[#8E9299]">Nothing received from this supplier is waiting for a bill.</p>
          ) : (
            <ul className={`${cardCls} divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] max-h-56 overflow-y-auto`} aria-label="Receipts waiting for a bill">
              {open.map((r) => {
                const p = products.find((x) => x.id === r.productId);
                const orderNo = purchaseOrders.find((o) => o.id === r.purchaseOrderId)?.poNumber;
                return (
                  <li key={r.id}>
                    <label className="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} className="w-5 h-5 accent-teal-700 shrink-0" aria-label={`Receipt ${r.receiptNumber}`} />
                      <span className="flex-1 min-w-0"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{r.receiptNumber}</span>{formatDate(r.date)}{orderNo ? <span className="text-xs text-indigo-700 dark:text-indigo-300"> • {orderNo}</span> : ''}<span className="block text-[11px] text-[#8E9299] truncate">{num(r.kg)} {p?.unit || 'pcs'} {p?.name || 'item'} @ {rs(r.pricePerKg)}</span></span>
                      <span className={`${moneyCls} font-bold`}>{rs(r.amount)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="space-y-2">
            <h3 className={labelCls}>As on the supplier's bill</h3>
            {lines.map((l) => {
              const p = products.find((x) => x.id === l.productId);
              const m = match.lines.find((x) => x.productId === l.productId);
              return (
                <div key={l.productId} className={`${cardCls} p-3 grid grid-cols-12 gap-2 items-end`} data-testid="bill-line">
                  <div className="col-span-12 sm:col-span-5 text-sm font-semibold">{p?.name || 'Item'}<span className="block text-[11px] font-normal text-[#8E9299]">received {num(m?.received || 0)} @ {m?.receivedRate != null ? rs(m.receivedRate) : '—'}{m?.orderRate != null ? ` • ordered @ ${rs(m.orderRate)}` : ''}</span></div>
                  <div className="col-span-6 sm:col-span-3">
                    <label className={labelCls} htmlFor={`sb-qty-${l.productId}`}>Qty billed</label>
                    <input id={`sb-qty-${l.productId}`} type="number" inputMode="decimal" min="0" step="any" value={l.qtyText} onChange={(e) => setTyped((t) => ({ ...t, [l.productId]: { ...t[l.productId], qty: e.target.value } }))} className={`${inputCls} tabular-nums`} aria-label={`Qty billed for ${p?.name}`} />
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <label className={labelCls} htmlFor={`sb-rate-${l.productId}`}>Rate billed</label>
                    <input id={`sb-rate-${l.productId}`} type="number" inputMode="decimal" min="0" step="any" value={l.rateText} onChange={(e) => setTyped((t) => ({ ...t, [l.productId]: { ...t[l.productId], rate: e.target.value } }))} className={`${inputCls} tabular-nums`} aria-label={`Rate billed for ${p?.name}`} />
                  </div>
                  {m && m.flags.filter((f) => f !== 'short_received').length > 0 && <p className="col-span-12 text-[11px] font-semibold text-rose-700 dark:text-rose-300">{m.flags.filter((f) => f !== 'short_received').map((f) => MATCH_FLAG_LABEL[f]).join(' • ')}</p>}
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="sb-other">Freight / other charges on the bill</label>
                <input id="sb-other" type="number" inputMode="decimal" min="0" step="any" value={other} onChange={(e) => setOther(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
              </div>
              <div>
                <label className={labelCls} htmlFor="sb-note">Note (optional)</label>
                <input id="sb-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className={`rounded-2xl p-3 text-sm ${Math.abs(match.difference) < 0.01 ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'}`} data-testid="bill-difference">
              <div className="flex items-center gap-2 mb-1">{matchChip(match)}</div>
              Goods received <strong className={moneyCls}>{rs(match.receivedValue)}</strong> (already in what you owe) • bill <strong className={moneyCls}>{rs(match.billTotal)}</strong>.{' '}
              {Math.abs(match.difference) < 0.01 ? 'Nothing more changes.' : <>The difference <strong className={moneyCls}>{rs(Math.abs(match.difference))}</strong> will be {match.difference > 0 ? 'added to' : 'taken off'} what you owe (price difference).</>}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};

/** List of supplier bills with their match status (Suppliers → Supplier bills). */
export const SupplierBillsView: React.FC<{ onNew: () => void }> = ({ onNew }) => {
  const { supplierBills, suppliers, purchases, purchaseOrders, products, deleteSupplierBill, can, settings, setPrintRequest } = useTrading();
  const [pending, setPending] = useState<SupplierBill | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const waiting = unbilledReceipts(purchases, supplierBills).length;
  const rows = useMemo(() => [...supplierBills].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt))), [supplierBills]);
  const supName = (id: string) => {
    const s = suppliers.find((x) => x.id === id);
    return s ? s.company || s.name : 'Supplier';
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{waiting > 0 ? `${waiting} stock receipt${waiting === 1 ? ' is' : 's are'} waiting for the supplier's bill.` : 'Every receipt has its supplier bill.'}</p>
        {can('suppliers:edit') && <button type="button" onClick={onNew} className={`${primaryBtn} ml-auto`}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Record supplier bill</button>}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="w-5 h-5" />} text="No supplier bills recorded yet. When a supplier's invoice arrives, record it here to check it against what you ordered and received." />
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]" aria-label="Supplier bills">
            {rows.map((b) => {
              const receipts = purchases.filter((p) => b.purchaseIds.includes(p.id));
              const po = purchaseOrders.find((p) => p.id === b.purchaseOrderId);
              const m = threeWayMatch({ po, receipts, bills: [b], products });
              return (
                <li key={b.id} className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">Bill {b.billNumber} • {supName(b.supplierId)}</div>
                    <div className="text-[11px] text-[#8E9299] truncate">{formatDate(b.date)}{po ? ` • ${po.poNumber}` : ''} • {b.purchaseIds.length} receipt{b.purchaseIds.length === 1 ? '' : 's'}{Math.abs(b.variance) >= 0.01 ? ` • difference ${b.variance > 0 ? '+' : '−'}${rs(Math.abs(b.variance))}` : ''}</div>
                  </div>
                  {matchChip(m)}
                  <span className={`${moneyCls} font-bold text-sm w-28 text-right`}>{rs(b.amount)}</span>
                  <RowAction label={`Print bill ${b.billNumber} check`} text="Print" icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'supplier_bill', billId: b.id })} />
                  {can('delete_records') && can('suppliers:edit') && !booksLockedFor(settings, b.date) && <RowAction label={`Delete bill ${b.billNumber}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPending(b)} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={`Delete bill ${pending?.billNumber || ''}?`}
        message="The bill is removed and any price difference it added to (or took off) the supplier is reversed. The goods received stay."
        confirmLabel="Delete bill"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            const r = deleteSupplierBill(pending.id);
            setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
          }
          setPending(null);
        }}
      />
    </div>
  );
};
