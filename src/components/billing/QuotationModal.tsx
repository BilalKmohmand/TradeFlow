import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, Printer } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice, rs } from './ui';
import { todayISO, shiftDate } from '../../utils/stockFlow';
import { quotationLines } from '../../utils/salesDocs';
import { hasPack, formatPackQty, baseToPacks } from '../../utils/packUnits';

interface Row {
  key: string;
  productId: string;
  qty: string;
  price: string;
  customerRate: boolean;
  /** Qty and price are typed per pack (e.g. per carton) instead of per base unit. */
  inPack: boolean;
}
const newRow = (patch: Partial<Row> = {}): Row => ({ key: Math.random().toString(36).slice(2), productId: '', qty: '1', price: '', customerRate: false, inPack: false, ...patch });
const num4 = (n: number) => String(Math.round(n * 10000) / 10000);

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Edit this quotation instead of making a new one. */
  editId?: string | null;
  customerId?: string | null;
}

/**
 * A price offer for a customer: items, prices, and how long the prices hold. Items with a pack
 * (carton of 6 tins) can be quoted per pack; quantities are still saved in the base unit.
 */
export const QuotationModal: React.FC<Props> = ({ isOpen, onClose, editId, customerId }) => {
  const { customers, products, quotations, saveBillQuotation, getCustomerAgreedRate, setPrintRequest } = useTrading();
  const editing = editId ? quotations.find((q) => q.id === editId) : undefined;
  const [customer, setCustomer] = useState(editing?.customerId || customerId || '');
  const [validUntil, setValidUntil] = useState(editing?.validUntil || shiftDate(todayISO(), 7));
  const [notes, setNotes] = useState(editing?.notes || '');
  const [rows, setRows] = useState<Row[]>(() =>
    editing
      ? quotationLines(editing, (id) => products.find((p) => p.id === id)?.name).map((l) =>
          l.packPrice != null && (l.packSize || 0) > 1
            ? newRow({ productId: l.productId, qty: num4(baseToPacks(l.qty, l.packSize!)), price: String(l.packPrice), inPack: true })
            : newRow({ productId: l.productId, qty: String(l.qty), price: String(l.unitPrice) })
        )
      : [newRow()]
  );
  const [error, setError] = useState('');
  const busy = useRef(false);

  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const setRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  /** Price shown on a line: the customer's agreed rate or the list price, per pack when the line is in packs. */
  const priceFor = (productId: string, custId: string, inPack: boolean) => {
    const agreed = custId ? getCustomerAgreedRate(custId, productId) : null;
    const p = products.find((x) => x.id === productId);
    const base = agreed != null ? agreed : p ? p.unitPricePerKg : null;
    const mult = inPack && hasPack(p) ? p!.packSize! : 1;
    return { price: base == null ? '' : num4(base * mult), customerRate: agreed != null };
  };
  /** Switch a line between packs and base units; qty and price are converted so the amount stays the same. */
  const togglePack = (key: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const p = products.find((x) => x.id === r.productId);
        if (!hasPack(p)) return r;
        const q = parseFloat(r.qty);
        const pr = parseFloat(r.price);
        const toPack = !r.inPack;
        return {
          ...r,
          inPack: toPack,
          qty: Number.isFinite(q) ? num4(toPack ? baseToPacks(q, p!.packSize!) : q * p!.packSize!) : r.qty,
          price: Number.isFinite(pr) ? num4(toPack ? pr * p!.packSize! : pr / p!.packSize!) : r.price,
        };
      })
    );

  const lines = rows.map((r) => {
    const product = products.find((p) => p.id === r.productId);
    const pack = r.inPack && hasPack(product) ? product!.packSize! : 1;
    const typedQty = parseFloat(r.qty) || 0;
    const typedPrice = parseFloat(r.price) || 0;
    return { ...r, typedQty, typedPrice, pack, qty: Math.round(typedQty * pack * 10000) / 10000, price: pack > 1 ? typedPrice / pack : typedPrice, amount: Math.round(typedQty * typedPrice * 100) / 100, product };
  });
  const total = lines.reduce((a, l) => a + l.amount, 0);

  const submit = (print: boolean) => {
    if (busy.current) return;
    setError('');
    busy.current = true;
    const r = saveBillQuotation({
      id: editing?.id,
      customerId: customer,
      validUntil,
      notes,
      items: lines
        .filter((l) => l.productId && l.qty > 0)
        .map((l) => ({
          productId: l.productId,
          productName: l.product?.name || 'Item',
          qty: l.qty,
          unitPrice: l.price,
          unit: l.product?.unit,
          // The pack at the time, so the printed quotation reads "2 cartons + 3 tins".
          ...(hasPack(l.product) ? { packName: l.product!.packName, packSize: l.product!.packSize } : {}),
          ...(l.pack > 1 ? { packPrice: l.typedPrice } : {}),
        })),
    });
    if (!r.success) {
      busy.current = false;
      return setError(r.message);
    }
    onClose();
    if (print && r.quotation) setPrintRequest({ type: 'quotation', quotationId: r.quotation.id });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? `Quotation ${editing.quoteNumber}` : 'New Quotation'}
      subtitle="A price offer for a customer. Turn it into a bill when they agree."
      wide
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 text-sm"><span className="text-[#6B7280] dark:text-[#94A3B8]">Total </span><span className="tabular-nums font-extrabold text-lg text-[#111827] dark:text-white">{rs(total)}</span></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => submit(false)} className={secondaryBtn}><Save className="w-4 h-4" /> Save</button>
            <button type="button" onClick={() => submit(true)} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save &amp; Print</button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="quote-customer">Customer</label>
            <select
              id="quote-customer"
              value={customer}
              onChange={(e) => {
                const id = e.target.value;
                setCustomer(id);
                setRows((prev) => prev.map((r) => (r.productId ? { ...r, ...priceFor(r.productId, id, r.inPack) } : r)));
              }}
              className={inputCls}
            >
              <option value="">Select customer…</option>
              {sortedCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` • ${c.phone}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="quote-valid">Prices good until</label>
            <input id="quote-valid" type="date" value={validUntil} min={todayISO()} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="space-y-2">
          {lines.map((l, idx) => {
            const p = l.product;
            return (
              <div key={l.key} className="grid grid-cols-12 gap-2 items-center rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-2 sm:p-1 sm:border-0">
                <div className="col-span-12 sm:col-span-5">
                  <select
                    aria-label={`Quote item ${idx + 1}`}
                    value={l.productId}
                    onChange={(e) => {
                      const np = products.find((x) => x.id === e.target.value);
                      const inPack = l.inPack && hasPack(np);
                      setRow(l.key, { productId: e.target.value, inPack, ...priceFor(e.target.value, customer, inPack) });
                    }}
                    className={inputCls}
                  >
                    <option value="">Select item…</option>
                    {sortedProducts.map((x) => <option key={x.id} value={x.id}>{x.name} — {rs(x.unitPricePerKg)}/{x.unit || 'pcs'}</option>)}
                  </select>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input aria-label={`Quote qty ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={rows[idx].qty} onChange={(e) => setRow(l.key, { qty: e.target.value })} className={`${inputCls} tabular-nums`} placeholder={l.pack > 1 ? p?.packName || 'Packs' : 'Qty'} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input aria-label={`Quote price ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={rows[idx].price} onChange={(e) => setRow(l.key, { price: e.target.value, customerRate: false })} className={`${inputCls} tabular-nums`} placeholder={l.pack > 1 ? `Per ${p?.packName}` : 'Price'} />
                  {l.customerRate && <span className="block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Customer rate</span>}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right tabular-nums font-bold text-sm text-[#111827] dark:text-white">{rs(l.amount)}</div>
                <div className="col-span-1 flex justify-end">
                  <button type="button" onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== l.key) : prev))} disabled={rows.length === 1} aria-label={`Remove quote item ${idx + 1}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </div>
                {p && hasPack(p) && (
                  <div data-testid={`quote-line-info-${idx + 1}`} className="col-span-12 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8] px-1">
                    <span className="inline-flex rounded-xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden font-bold" role="group" aria-label={`Unit for quote item ${idx + 1}`}>
                      {[false, true].map((packMode) => (
                        <button key={String(packMode)} type="button" aria-pressed={l.inPack === packMode} onClick={() => l.inPack !== packMode && togglePack(l.key)} className={`px-2 py-1 min-h-8 ${l.inPack === packMode ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : ''}`}>
                          {packMode ? `${p.packName} (${p.packSize})` : p.unit || 'pcs'}
                        </button>
                      ))}
                    </span>
                    {l.qty > 0 && <span className="font-semibold text-[#374151] dark:text-[#CBD5E1]">= {formatPackQty(l.qty, p)}{l.pack > 1 ? ` • ${rs(Math.round(l.price * 100) / 100)}/${p.unit || 'pcs'}` : ''}</span>}
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => setRows((prev) => [...prev, newRow()])} className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 dark:text-teal-300 hover:underline"><Plus className="w-4 h-4" /> Add another item</button>
        </div>

        <div>
          <label className={labelCls} htmlFor="quote-notes">Note (optional)</label>
          <input id="quote-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. delivery included" />
        </div>
      </div>
    </Modal>
  );
};
