import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, Printer } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice, rs } from './ui';
import { todayISO, shiftDate } from '../../utils/stockFlow';
import { quotationLines } from '../../utils/salesDocs';

interface Row {
  key: string;
  productId: string;
  qty: string;
  price: string;
  customerRate: boolean;
}
const newRow = (patch: Partial<Row> = {}): Row => ({ key: Math.random().toString(36).slice(2), productId: '', qty: '1', price: '', customerRate: false, ...patch });

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Edit this quotation instead of making a new one. */
  editId?: string | null;
  customerId?: string | null;
}

/** A price offer for a customer: items, prices, and how long the prices hold. */
export const QuotationModal: React.FC<Props> = ({ isOpen, onClose, editId, customerId }) => {
  const { customers, products, quotations, saveBillQuotation, getCustomerAgreedRate, setPrintRequest } = useTrading();
  const editing = editId ? quotations.find((q) => q.id === editId) : undefined;
  const [customer, setCustomer] = useState(editing?.customerId || customerId || '');
  const [validUntil, setValidUntil] = useState(editing?.validUntil || shiftDate(todayISO(), 7));
  const [notes, setNotes] = useState(editing?.notes || '');
  const [rows, setRows] = useState<Row[]>(() =>
    editing ? quotationLines(editing, (id) => products.find((p) => p.id === id)?.name).map((l) => newRow({ productId: l.productId, qty: String(l.qty), price: String(l.unitPrice) })) : [newRow()]
  );
  const [error, setError] = useState('');
  const busy = useRef(false);

  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const setRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const priceFor = (productId: string, custId: string) => {
    const agreed = custId ? getCustomerAgreedRate(custId, productId) : null;
    const p = products.find((x) => x.id === productId);
    return agreed != null ? { price: String(agreed), customerRate: true } : { price: p ? String(p.unitPricePerKg) : '', customerRate: false };
  };

  const lines = rows.map((r) => {
    const qty = parseFloat(r.qty) || 0;
    const price = parseFloat(r.price) || 0;
    return { ...r, qty, price, amount: Math.round(qty * price * 100) / 100, product: products.find((p) => p.id === r.productId) };
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
      items: lines.filter((l) => l.productId && l.qty > 0).map((l) => ({ productId: l.productId, productName: l.product?.name || 'Item', qty: l.qty, unitPrice: l.price, unit: l.product?.unit })),
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
                setRows((prev) => prev.map((r) => (r.productId ? { ...r, ...priceFor(r.productId, id) } : r)));
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
          {lines.map((l, idx) => (
            <div key={l.key} className="grid grid-cols-12 gap-2 items-center rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-2 sm:p-1 sm:border-0">
              <div className="col-span-12 sm:col-span-5">
                <select aria-label={`Quote item ${idx + 1}`} value={l.productId} onChange={(e) => setRow(l.key, { productId: e.target.value, ...priceFor(e.target.value, customer) })} className={inputCls}>
                  <option value="">Select item…</option>
                  {sortedProducts.map((p) => <option key={p.id} value={p.id}>{p.name} — {rs(p.unitPricePerKg)}/{p.unit || 'pcs'}</option>)}
                </select>
              </div>
              <div className="col-span-4 sm:col-span-2">
                <input aria-label={`Quote qty ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.qty} onChange={(e) => setRow(l.key, { qty: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="Qty" />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <input aria-label={`Quote price ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.price} onChange={(e) => setRow(l.key, { price: e.target.value, customerRate: false })} className={`${inputCls} tabular-nums`} placeholder="Price" />
                {l.customerRate && <span className="block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Customer rate</span>}
              </div>
              <div className="col-span-3 sm:col-span-2 text-right tabular-nums font-bold text-sm text-[#111827] dark:text-white">{rs(l.amount)}</div>
              <div className="col-span-1 flex justify-end">
                <button type="button" onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== l.key) : prev))} disabled={rows.length === 1} aria-label={`Remove quote item ${idx + 1}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
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
