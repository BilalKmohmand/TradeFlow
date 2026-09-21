import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Printer, Save, UserPlus, Percent } from 'lucide-react';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice, rs } from './ui';
import { todayISO } from '../../utils/stockFlow';
import { creditCheck } from '../../utils/credit';
import { BillCreditPanel } from './CreditLimit';
import { planBillStock, batchLines, stockByGodown } from '../../utils/inventory';
import { lineDiscountAmount, quotationLines } from '../../utils/salesDocs';

interface Row {
  key: string;
  productId: string;
  qty: string;
  price: string;
  /** Where the price came from: the item's list price, the customer's agreed rate, or typed in. */
  priceFrom: 'list' | 'customer' | 'typed';
  /** Line discount, shown once the shopkeeper taps "Discount" on the line. */
  showDisc: boolean;
  discType: 'rs' | 'pct';
  disc: string;
}

const newRow = (patch: Partial<Row> = {}): Row => ({ key: Math.random().toString(36).slice(2), productId: '', qty: '1', price: '', priceFrom: 'list', showDisc: false, discType: 'rs', disc: '', ...patch });

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-pick a customer (from the customer screen). */
  customerId?: string | null;
  /** Fill the bill from this quotation ("Convert to bill"). */
  quotationId?: string | null;
}

/**
 * Make a bill in one screen: pick the customer, add item lines (price is filled from the item
 * but can be changed per line), enter what was paid now, save or save-and-print.
 */
export const NewBillModal: React.FC<Props> = ({ isOpen, onClose, customerId, quotationId }) => {
  const { customers, products, settings, createBill, setPrintRequest, can, godowns, stockBatches, quotations, getCustomerAgreedRate } = useTrading();
  const quote = quotationId ? quotations.find((q) => q.id === quotationId) : undefined;
  const [godownId, setGodownId] = useState(godowns[0]?.id || '');
  const [customer, setCustomer] = useState(quote?.customerId || customerId || '');
  const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [date, setDate] = useState(todayISO());
  // A quotation fills the lines at the quoted prices; otherwise one empty line.
  const [rows, setRows] = useState<Row[]>(() =>
    quote ? quotationLines(quote, (id) => products.find((p) => p.id === id)?.name).map((l) => newRow({ productId: l.productId, qty: String(l.qty), price: String(l.unitPrice), priceFrom: 'typed' })) : [newRow()]
  );
  const [discount, setDiscount] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState(quote ? `From quotation ${quote.quoteNumber}` : '');
  const [error, setError] = useState('');
  const [allowOver, setAllowOver] = useState(false);
  const [overReason, setOverReason] = useState('');
  const busy = useRef(false);

  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  const setRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  /** Price for an item: the customer's agreed rate when there is one, else the item's list price. */
  const priceFor = (productId: string, custId: string): { price: string; priceFrom: Row['priceFrom'] } => {
    const p = products.find((x) => x.id === productId);
    const agreed = custId && productId ? getCustomerAgreedRate(custId, productId) : null;
    if (agreed != null) return { price: String(agreed), priceFrom: 'customer' };
    return { price: p ? String(p.unitPricePerKg) : '', priceFrom: 'list' };
  };
  const pickProduct = (key: string, productId: string) => setRow(key, { productId, ...priceFor(productId, newCustomer ? '' : customer) });
  // Changing the customer re-prices lines the shopkeeper has not typed a price into.
  const pickCustomer = (custId: string) => {
    setCustomer(custId);
    setRows((prev) => prev.map((r) => (r.productId && r.priceFrom !== 'typed' ? { ...r, ...priceFor(r.productId, custId) } : r)));
  };
  const removeRow = (key: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const lines = rows.map((r) => {
    const qty = parseFloat(r.qty) || 0;
    const price = parseFloat(r.price) || 0;
    const p = products.find((x) => x.id === r.productId);
    const discValue = parseFloat(r.disc) || 0;
    const lineDisc = lineDiscountAmount(qty, price, r.discType, discValue);
    return { ...r, qty, price, discValue, lineDisc, amount: Math.round((qty * price - lineDisc) * 100) / 100, product: p };
  });
  // Where each line's stock would come from (batch items, or a godown other than the main one).
  // Lines are planned together, in order, so two lines of the same item share the same stock, exactly
  // as saving the bill will. Expiry is judged against today, so a back-dated bill can't sell expired stock.
  const stockNote = (l: (typeof lines)[number], idx: number): { warn: boolean; block?: boolean; text: string } | null => {
    if (!l.product || l.qty <= 0) return null;
    const unit = l.product.unit || 'pcs';
    if (!l.product.trackBatches && godowns.length < 2) {
      return l.qty > l.product.stockKg ? { warn: true, text: `Only ${l.product.stockKg} ${unit} of ${l.product.name} in stock — the bill will still save.` } : null;
    }
    const upTo = lines.slice(0, idx + 1).filter((x) => x.product && x.qty > 0).map((x) => ({ productId: x.product!.id, qty: x.qty }));
    const plan = planBillStock(products, stockBatches, godowns, upTo, godownId, todayISO());
    if (!plan.ok) return { warn: true, block: true, text: plan.message || 'Not enough stock.' };
    const from = batchLines({ ...plan.lines[plan.lines.length - 1] });
    if (from.length) return { warn: false, text: `From ${from.join(', ')}` };
    if (godowns.length > 1) {
      const have = stockByGodown(l.product, stockBatches, godowns)[godownId] ?? 0;
      if (l.qty > have) return { warn: true, text: `Only ${have} ${unit} of ${l.product.name} in this godown — the bill will still save.` };
    }
    return null;
  };
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const lineDiscTotal = lines.reduce((a, l) => a + l.lineDisc, 0);
  const disc = Math.min(Math.max(0, parseFloat(discount) || 0), subtotal);
  const taxRate = settings.taxRatePct ?? 0;
  const tax = ((subtotal - disc) * taxRate) / 100;
  const total = Math.round((subtotal - disc + tax) * 100) / 100;
  const given = Math.max(0, parseFloat(paidNow) || 0);
  const paid = Math.min(given, total);
  const balance = Math.round((total - paid) * 100) / 100;
  const change = Math.round((given - total) * 100) / 100;
  // A typed "new" customer that matches an existing one (same name or phone) is that customer, as on save.
  const typedMatch = newCustomer
    ? customers.find((c) => c.name.trim().toLowerCase() === newCustomer.name.trim().toLowerCase() || (newCustomer.phone.trim() && c.phone.replace(/\D/g, '') === newCustomer.phone.replace(/\D/g, '')))
    : undefined;
  const credit = creditCheck(newCustomer ? typedMatch || null : customers.find((c) => c.id === customer), balance);
  const canOverride = can('override_credit');
  const creditBlocked = credit.over && !(canOverride && allowOver && overReason.trim());
  // Stock the bill can't be made from (batches, expired stock, another godown): Save waits until it is fixed.
  const stockBlocked = lines.some((l, idx) => stockNote(l, idx)?.block);
  const saveBlocked = creditBlocked || stockBlocked;
  const blockedWhy = stockBlocked ? 'Not enough stock for this bill' : creditBlocked ? 'Over the credit limit' : undefined;
  // Any change to the bill clears an old error message.
  React.useEffect(() => { setError(''); }, [customer, newCustomer, rows, discount, paidNow, method, godownId, allowOver, overReason]);

  const submit = (print: boolean) => {
    if (busy.current) return; // a double tap must not make two bills
    setError('');
    if (newCustomer && !newCustomer.name.trim()) return setError('Enter the new customer name.');
    if (!newCustomer && !customer) return setError('Pick a customer (or add a new one).');
    if (lines.some((l) => l.productId && l.price < 0)) return setError('A price cannot be negative.');
    if (total <= 0) return setError('The bill total must be more than zero.');
    const items = lines.filter((l) => l.productId && l.qty > 0);
    if (items.length === 0) return setError('Add at least one item with a quantity.');
    if (credit.over && !(canOverride && allowOver)) return setError(canOverride ? 'This bill is over the credit limit. Tick "Allow over limit" and give a reason, or take more payment now.' : 'This bill is over the customer\'s credit limit. Take more payment now, or ask a manager to allow it.');
    if (credit.over && !overReason.trim()) return setError('Write a short reason for allowing this bill over the credit limit.');
    busy.current = true; // held until the dialog closes; released at once if the bill is refused
    const result = createBill({
      customerId: newCustomer ? '' : customer,
      newCustomer: newCustomer || undefined,
      items: items.map((l) => ({
        productId: l.productId,
        name: l.product?.name || 'Item',
        qty: l.qty,
        unitPrice: l.price,
        unit: l.product?.unit,
        ...(l.lineDisc > 0 ? { discountType: l.discType, discountValue: l.discValue } : {}),
        ...(l.priceFrom === 'customer' ? { customerRate: true } : {}),
      })),
      quotationId: quote?.id,
      discount: disc,
      paidNow: paid,
      paymentMethod: method,
      notes,
      date,
      ...(credit.over ? { allowOverLimit: allowOver, overrideReason: overReason } : {}),
      godownId: godowns.length > 1 ? godownId : undefined,
    });
    if (!result.success) {
      busy.current = false;
      return setError(result.message);
    }
    onClose();
    if (print && result.invoice) setPrintRequest({ type: 'bill', invoiceId: result.invoice.id });
  };

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 text-sm">
        <span className="text-[#6B7280] dark:text-[#94A3B8]">Total </span>
        <span className="font-mono font-extrabold text-lg text-[#111827] dark:text-white">{rs(total)}</span>
        {balance > 0 && <span className="ml-2 text-xs font-bold text-amber-700 dark:text-amber-300">{rs(balance)} on credit</span>}
        {total > 0 && balance === 0 && <span className="ml-2 text-xs font-bold text-teal-700 dark:text-teal-300">Fully paid</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => submit(false)} disabled={saveBlocked} title={blockedWhy} className={secondaryBtn}><Save className="w-4 h-4" /> Save</button>
        <button type="button" onClick={() => submit(true)} disabled={saveBlocked} title={blockedWhy} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save &amp; Print</button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Bill" subtitle={quote ? `From quotation ${quote.quoteNumber} — check the items and prices, then save.` : 'Pick the customer, add items, enter what was paid.'} wide footer={footer}>
      <div className="space-y-5">
        {error && <Notice kind="error">{error}</Notice>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="bill-customer">Customer</label>
            {newCustomer ? (
              <div className="grid grid-cols-2 gap-2">
                <input autoFocus placeholder="Customer name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className={inputCls} aria-label="New customer name" />
                <input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={inputCls} aria-label="New customer phone" />
                <button type="button" onClick={() => setNewCustomer(null)} className="col-span-2 text-xs font-semibold text-[#6B7280] hover:text-[#111827] dark:hover:text-white text-left">← Choose an existing customer instead</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select id="bill-customer" value={customer} onChange={(e) => pickCustomer(e.target.value)} className={inputCls}>
                  <option value="">Select customer…</option>
                  {sortedCustomers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` • ${c.phone}` : ''}{c.totalDue > 0 ? ` (due ${rs(c.totalDue)})` : ''}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setNewCustomer({ name: '', phone: '' })} className={`${secondaryBtn} shrink-0 px-3`} title="Add a new customer"><UserPlus className="w-4 h-4" /><span>New</span></button>
              </div>
            )}
          </div>
          {credit.hasLimit && (
            <div className="sm:col-span-3 sm:order-last">
              <BillCreditPanel check={credit} canOverride={canOverride} allow={allowOver} onAllow={setAllowOver} reason={overReason} onReason={setOverReason} />
            </div>
          )}
          <div>
            <label className={labelCls} htmlFor="bill-date">Date</label>
            <input id="bill-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          {godowns.length > 1 && (
            <div className="sm:col-span-3">
              <label className={labelCls} htmlFor="bill-godown">From godown</label>
              <select id="bill-godown" value={godownId} onChange={(e) => setGodownId(e.target.value)} className={inputCls}>
                {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <div className="hidden sm:grid grid-cols-12 gap-2 px-1 mb-1 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">
            <div className="col-span-5">Item</div>
            <div className="col-span-2">Qty</div>
            <div className="col-span-2">Price</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-1" />
          </div>
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={l.key} className="grid grid-cols-12 gap-2 items-center rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-2 sm:p-1 sm:border-0">
                <div className="col-span-12 sm:col-span-5">
                  <select aria-label={`Item ${idx + 1}`} value={l.productId} onChange={(e) => pickProduct(l.key, e.target.value)} className={inputCls}>
                    <option value="">Select item…</option>
                    {sortedProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {rs(p.unitPricePerKg)}/{p.unit || 'pcs'}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1">Qty</span>
                  <input aria-label={`Quantity ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.qty} onChange={(e) => setRow(l.key, { qty: e.target.value })} className={`${inputCls} font-mono`} placeholder="Qty" />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1">Price</span>
                  <input aria-label={`Price ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.price} onChange={(e) => setRow(l.key, { price: e.target.value, priceFrom: 'typed' })} className={`${inputCls} font-mono`} placeholder="Price" />
                  {l.priceFrom === 'customer' && <span data-testid={`customer-rate-${idx + 1}`} className="block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Customer rate</span>}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right font-mono font-bold text-sm text-[#111827] dark:text-white"><span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1 font-sans">Amount</span>{rs(l.amount)}</div>
                {(() => {
                  const note = stockNote(l, idx);
                  return note ? <div data-testid={`stock-note-${idx + 1}`} className={`col-span-12 text-[11px] font-semibold ${note.warn ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{note.text}</div> : null;
                })()}
                <div className="col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeRow(l.key)} aria-label={`Remove item ${idx + 1}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30" disabled={rows.length === 1}><Trash2 className="w-4 h-4" /></button>
                </div>
                {l.showDisc ? (
                  <div className="col-span-12 flex flex-wrap items-center gap-2">
                    <label htmlFor={`disc-${l.key}`} className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Discount on this item</label>
                    <div className="w-28"><input id={`disc-${l.key}`} aria-label={`Discount ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.disc} onChange={(e) => setRow(l.key, { disc: e.target.value })} className={`${inputCls} font-mono`} placeholder="0" /></div>
                    <div className="inline-flex rounded-2xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden text-xs font-bold" role="group" aria-label={`Discount type ${idx + 1}`}>
                      {(['rs', 'pct'] as const).map((t) => (
                        <button key={t} type="button" aria-pressed={l.discType === t} onClick={() => setRow(l.key, { discType: t })} className={`px-3 py-2 ${l.discType === t ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : 'text-[#6B7280] dark:text-[#94A3B8]'}`}>{t === 'rs' ? 'Rs.' : '%'}</button>
                      ))}
                    </div>
                    {l.lineDisc > 0 && <span className="text-[11px] font-semibold text-[#6B7280] dark:text-[#94A3B8]">− {rs(l.lineDisc)}</span>}
                  </div>
                ) : (
                  <div className="col-span-12 -mt-1">
                    <button type="button" onClick={() => setRow(l.key, { showDisc: true })} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-700" aria-label={`Add discount to item ${idx + 1}`}><Percent className="w-3 h-3" /> Discount</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setRows((prev) => [...prev, newRow()])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 dark:text-teal-300 hover:underline"><Plus className="w-4 h-4" /> Add another item</button>
          {products.length === 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">No items yet. Add your products with their prices on the Items screen first.</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="bill-discount">Discount (Rs.)</label>
              <input id="bill-discount" type="number" inputMode="decimal" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${inputCls} font-mono`} placeholder="0 (on the whole bill)" />
            </div>
            <div>
              <label className={labelCls} htmlFor="bill-notes">Note (optional)</label>
              <input id="bill-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. delivered by Rashid" />
            </div>
          </div>
          <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] p-4 space-y-2 text-sm">
            {lineDiscTotal > 0 && (
              <>
                <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Items before discount</span><span className="font-mono">{rs(subtotal + lineDiscTotal)}</span></div>
                <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Item discounts</span><span className="font-mono">− {rs(lineDiscTotal)}</span></div>
              </>
            )}
            <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Subtotal</span><span className="font-mono">{rs(subtotal)}</span></div>
            {disc > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Discount</span><span className="font-mono">− {rs(disc)}</span></div>}
            {taxRate > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>{settings.taxLabel || 'Tax'} {taxRate}%</span><span className="font-mono">{rs(tax)}</span></div>}
            <div className="flex justify-between font-extrabold text-[#111827] dark:text-white border-t border-[#E5E5E1] dark:border-[#203248] pt-2"><span>Total</span><span className="font-mono">{rs(total)}</span></div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className={labelCls} htmlFor="bill-paid">Paid now</label>
                <div className="flex gap-1">
                  <input id="bill-paid" type="number" inputMode="decimal" min="0" step="any" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} className={`${inputCls} font-mono`} placeholder="0" />
                  <button type="button" onClick={() => setPaidNow(String(total))} className="shrink-0 px-2.5 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:bg-white dark:hover:bg-[#1E2E40]" title="Paid in full">Full</button>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="bill-method">Method</label>
                <select id="bill-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                  {BILL_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-between text-xs font-bold pt-1 text-[#111827] dark:text-white"><span className={balance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}>{balance > 0 ? 'Balance (credit)' : 'Balance'}</span><span className="font-mono">{rs(balance)}</span></div>
            {change > 0 && <div className="flex justify-between text-xs font-bold text-indigo-700 dark:text-indigo-300"><span>Change to return</span><span className="font-mono">{rs(change)}</span></div>}
          </div>
        </div>
      </div>
    </Modal>
  );
};
