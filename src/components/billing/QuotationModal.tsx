import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, Printer } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, inputCls, numInputCls, labelCls, primaryBtn, secondaryBtn, Notice, rs, moneyCls } from './ui';
import { CodeBox } from './CodeBox';
import { QuickSelect, PickOption, findOption } from './QuickPick';
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
/** Same line columns as the bill: Code | Item | Qty | Price | Amount | remove (tablet and up). */
const LINE_COLS = 'md:grid-cols-[5.5rem_minmax(0,1fr)_6.5rem_8rem_minmax(8rem,max-content)_2.5rem]';

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
  const customerOptions: PickOption[] = useMemo(() => sortedCustomers.map((c) => ({ value: c.id, name: c.name, code: c.code, extra: [c.phone, c.city].filter(Boolean).join(' ') })), [sortedCustomers]);
  const productOptions: PickOption[] = useMemo(() => sortedProducts.map((p) => ({ value: p.id, name: p.name, code: p.code, barcode: p.barcode })), [sortedProducts]);
  const setRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const pickCustomer = (id: string) => {
    setCustomer(id);
    setRows((prev) => prev.map((r) => (r.productId ? { ...r, ...priceFor(r.productId, id, r.inPack) } : r)));
  };
  const pickProduct = (key: string, productId: string) =>
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const np = products.find((x) => x.id === productId);
      const inPack = r.inPack && hasPack(np);
      return { ...r, productId, inPack, ...priceFor(productId, customer, inPack) };
    }));
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
    const typedQty = Math.max(0, parseFloat(r.qty) || 0);
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
      wide="xl"
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
            <div className="flex gap-2">
              <CodeBox id="quote-customer-code" label="Customer code" items={customers} value={customer} onPick={pickCustomer} fallback={(t) => findOption(customerOptions, t)?.value} skipAutofocus className="w-24 sm:w-28 shrink-0" />
              <div className="flex-1 min-w-0">
                <QuickSelect id="quote-customer" value={customer} options={customerOptions} onPick={pickCustomer} className={inputCls} title="Type a name, code or phone to find the customer">
                  <option value="">Select customer…</option>
                  {sortedCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` • ${c.phone}` : ''}</option>)}
                </QuickSelect>
              </div>
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="quote-valid">Prices good until</label>
            <input id="quote-valid" type="date" value={validUntil} min={todayISO()} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="space-y-2">
          <div className={`hidden md:grid ${LINE_COLS} gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]`}>
            <div>Code</div>
            <div>Item</div>
            <div>Qty</div>
            <div>Price</div>
            <div className="text-right">Amount</div>
            <div />
          </div>
          {lines.map((l, idx) => {
            const p = l.product;
            const unitWord = p ? (l.pack > 1 ? p.packName || 'pack' : p.unit || 'pcs') : '';
            const remove = () => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== l.key) : prev));
            return (
              <div key={l.key} data-testid="quote-line" className={`grid grid-cols-12 ${LINE_COLS} gap-2 items-center rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-2 md:p-1 md:border-0`}>
                <CodeBox id={`quote-code-${idx + 1}`} label={`Quote code ${idx + 1}`} items={sortedProducts} value={l.productId} onPick={(v) => pickProduct(l.key, v)} fallback={(t) => findOption(productOptions, t)?.value} className="col-span-4 md:col-auto" />
                <div className="col-span-8 md:col-auto flex gap-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <QuickSelect aria-label={`Quote item ${idx + 1}`} value={l.productId} options={productOptions} onPick={(v) => pickProduct(l.key, v)} className={inputCls} title="Type the item name or code to find it">
                      <option value="">Select item…</option>
                      {sortedProducts.map((x) => <option key={x.id} value={x.id}>{x.name} — {rs(x.unitPricePerKg)}/{x.unit || 'pcs'}{x.code ? ` • ${x.code}` : ''}</option>)}
                    </QuickSelect>
                  </div>
                  <button type="button" onClick={remove} disabled={rows.length === 1} aria-label={`Remove quote item ${idx + 1}`} className="md:hidden shrink-0 p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="col-span-6 md:col-auto min-w-0">
                  <input aria-label={`Quote qty ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={rows[idx].qty} onChange={(e) => setRow(l.key, { qty: e.target.value })} className={numInputCls} placeholder={p ? `Qty (${unitWord})` : 'Qty'} />
                </div>
                <div className="col-span-6 md:col-auto min-w-0">
                  <input aria-label={`Quote price ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={rows[idx].price} onChange={(e) => setRow(l.key, { price: e.target.value, customerRate: false })} className={numInputCls} placeholder={p ? `per ${unitWord}` : 'Price'} />
                  {l.customerRate && <span className="block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Customer rate</span>}
                </div>
                <div className="col-span-full md:col-auto flex md:block items-baseline justify-between gap-2 text-right px-1 md:px-0">
                  <span className="md:hidden text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Amount</span>
                  <span className={`${moneyCls} font-bold text-sm text-[#111827] dark:text-white`}>{rs(l.amount)}</span>
                </div>
                <div className="hidden md:flex justify-end">
                  <button type="button" onClick={remove} disabled={rows.length === 1} aria-label={`Remove quote item ${idx + 1}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </div>
                {p && hasPack(p) && (
                  <div data-testid={`quote-line-info-${idx + 1}`} className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8] px-1">
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
