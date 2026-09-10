import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Printer, Save, UserPlus } from 'lucide-react';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice, rs } from './ui';
import { todayISO } from '../../utils/stockFlow';

interface Row {
  key: string;
  productId: string;
  qty: string;
  price: string;
}

const newRow = (): Row => ({ key: Math.random().toString(36).slice(2), productId: '', qty: '1', price: '' });

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-pick a customer (from the customer screen). */
  customerId?: string | null;
}

/**
 * Make a bill in one screen: pick the customer, add item lines (price is filled from the item
 * but can be changed per line), enter what was paid now, save or save-and-print.
 */
export const NewBillModal: React.FC<Props> = ({ isOpen, onClose, customerId }) => {
  const { customers, products, settings, createBill, setPrintRequest } = useTrading();
  const [customer, setCustomer] = useState(customerId || '');
  const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [discount, setDiscount] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  const setRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const pickProduct = (key: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setRow(key, { productId, price: p ? String(p.unitPricePerKg) : '' });
  };
  const removeRow = (key: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const lines = rows.map((r) => {
    const qty = parseFloat(r.qty) || 0;
    const price = parseFloat(r.price) || 0;
    const p = products.find((x) => x.id === r.productId);
    return { ...r, qty, price, amount: qty * price, product: p };
  });
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const disc = Math.min(Math.max(0, parseFloat(discount) || 0), subtotal);
  const taxRate = settings.taxRatePct ?? 0;
  const tax = ((subtotal - disc) * taxRate) / 100;
  const total = Math.round((subtotal - disc + tax) * 100) / 100;
  const paid = Math.min(Math.max(0, parseFloat(paidNow) || 0), total);
  const balance = Math.round((total - paid) * 100) / 100;

  const submit = (print: boolean) => {
    setError('');
    if (newCustomer && !newCustomer.name.trim()) return setError('Enter the new customer name.');
    if (!newCustomer && !customer) return setError('Pick a customer (or add a new one).');
    const items = lines.filter((l) => l.productId && l.qty > 0);
    if (items.length === 0) return setError('Add at least one item with a quantity.');
    const result = createBill({
      customerId: newCustomer ? '' : customer,
      newCustomer: newCustomer || undefined,
      items: items.map((l) => ({ productId: l.productId, name: l.product?.name || 'Item', qty: l.qty, unitPrice: l.price, unit: l.product?.unit })),
      discount: disc,
      paidNow: paid,
      paymentMethod: method,
      notes,
      date,
    });
    if (!result.success) return setError(result.message);
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
        <button type="button" onClick={() => submit(false)} className={secondaryBtn}><Save className="w-4 h-4" /> Save</button>
        <button type="button" onClick={() => submit(true)} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save &amp; Print</button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Bill" subtitle="Pick the customer, add items, enter what was paid." wide footer={footer}>
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
                <select id="bill-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} className={inputCls}>
                  <option value="">Select customer…</option>
                  {sortedCustomers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` • ${c.phone}` : ''}{c.totalDue > 0 ? ` (due ${rs(c.totalDue)})` : ''}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setNewCustomer({ name: '', phone: '' })} className={`${secondaryBtn} shrink-0 px-3`} title="Add a new customer"><UserPlus className="w-4 h-4" /><span className="hidden sm:inline">New</span></button>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-date">Date</label>
            <input id="bill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
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
                  <input aria-label={`Quantity ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.qty} onChange={(e) => setRow(l.key, { qty: e.target.value })} className={`${inputCls} font-mono`} placeholder="Qty" />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input aria-label={`Price ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.price} onChange={(e) => setRow(l.key, { price: e.target.value })} className={`${inputCls} font-mono`} placeholder="Price" />
                </div>
                <div className="col-span-3 sm:col-span-2 text-right font-mono font-bold text-sm text-[#111827] dark:text-white">{rs(l.amount)}</div>
                <div className="col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeRow(l.key)} aria-label={`Remove item ${idx + 1}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30" disabled={rows.length === 1}><Trash2 className="w-4 h-4" /></button>
                </div>
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
              <input id="bill-discount" type="number" inputMode="decimal" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${inputCls} font-mono`} placeholder="0" />
            </div>
            <div>
              <label className={labelCls} htmlFor="bill-notes">Note (optional)</label>
              <input id="bill-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. delivered by Rashid" />
            </div>
          </div>
          <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] p-4 space-y-2 text-sm">
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
            <div className="flex justify-between text-xs font-bold pt-1"><span className={balance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}>{balance > 0 ? 'Balance (credit)' : 'Balance'}</span><span className="font-mono">{rs(balance)}</span></div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
