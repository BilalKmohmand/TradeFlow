import React, { useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  ArrowRight,
  Printer,
  ClipboardList,
  RotateCcw,
  CheckCircle2,
  Circle,
  CalendarClock,
  Link2,
  Scale,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate } from '../utils/formatters';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { ConfirmDialog } from './ConfirmDialog';
import { useEscape } from '../hooks/useEscape';
import { ADJUSTMENT_REASONS, AdjustmentReason, Quotation, PurchaseOrder, QuotationStatus, StockReturn, Task, TaskLinkType } from '../types';

const card = 'bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs';
const inputCls =
  'w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#111827] dark:text-white focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600';
const labelCls = 'block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest';
const pill = (cls: string, text: string) => <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>{text}</span>;

const QUOTE_STATUS: Record<QuotationStatus, string> = {
  draft: 'bg-[#FAF9F6] text-[#6B7280] border-[#E5E5E1]',
  sent: 'bg-blue-50 text-blue-900 border-blue-200',
  accepted: 'bg-teal-50 text-teal-900 border-teal-200',
  rejected: 'bg-rose-50 text-rose-900 border-rose-200',
  expired: 'bg-amber-50 text-amber-900 border-amber-200',
  converted: 'bg-emerald-50 text-emerald-900 border-emerald-200',
};

// ===========================================================================
// Quotations
// ===========================================================================
export const QuotationsPanel: React.FC = () => {
  const { quotations, customers, products, addQuotation, setQuotationStatus, convertQuotation, deleteQuotation, setSelectedCustomerId, openBooking, setPrintRequest, can } = useTrading();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customerId: '', productId: '', kg: '50000', pricePerKg: '', validUntil: shiftDate(todayISO(), 7), notes: '' });
  const [pending, setPending] = useState<Quotation | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const rows = useMemo(() => {
    const list = filter === 'open' ? quotations.filter((q) => q.status === 'draft' || q.status === 'sent' || q.status === 'accepted') : quotations;
    return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [quotations, filter]);

  const openForm = () => {
    const p = products[0];
    setForm({ customerId: customers[0]?.id || '', productId: p?.id || '', kg: '50000', pricePerKg: p ? String(p.unitPricePerKg) : '', validUntil: shiftDate(todayISO(), 7), notes: '' });
    setOpen(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kg = parseFloat(form.kg);
    const price = parseFloat(form.pricePerKg);
    if (!form.customerId || !form.productId || !kg || kg <= 0 || !price || price <= 0) return;
    addQuotation({ customerId: form.customerId, productId: form.productId, kg, pricePerKg: price, validUntil: form.validUntil, notes: form.notes });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-[#FAF9F6] p-1 rounded-full border border-[#E5E5E1] flex items-center gap-0.5 text-xs font-bold">
          {(['open', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 rounded-full capitalize ${filter === f ? 'bg-[#111827] text-white shadow-xs' : 'text-[#6B7280]'}`}>{f === 'open' ? 'Open quotes' : 'All'}</button>
          ))}
        </div>
        <button onClick={openForm} disabled={customers.length === 0 || products.length === 0} className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl flex items-center gap-1.5 disabled:opacity-40"><Plus className="w-3.5 h-3.5 text-teal-400" /> New Quotation</button>
      </div>

      {open && (
        <form onSubmit={submit} className={`${card} p-5 space-y-3`}>
          <h3 className="text-sm font-bold text-[#111827] flex items-center gap-1.5"><FileText className="w-4 h-4 text-teal-700" /> New quotation</h3>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="col-span-2"><label className={labelCls}>Customer</label><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className={inputCls}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.company}</option>)}</select></div>
            <div className="col-span-2"><label className={labelCls}>Product</label><select value={form.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setForm({ ...form, productId: e.target.value, pricePerKg: p ? String(p.unitPricePerKg) : form.pricePerKg }); }} className={inputCls}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className={labelCls}>Quantity (kg)</label><input type="number" min="1" step="1" value={form.kg} onChange={(e) => setForm({ ...form, kg: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Rate (Rs./kg)</label><input type="number" min="0.01" step="0.01" value={form.pricePerKg} onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Valid until</label><input type="date" min={todayISO()} value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={inputCls} required /></div>
            <div className="col-span-2 lg:col-span-5"><label className={labelCls}>Terms / notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery terms, payment terms, validity..." className={inputCls} /></div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#374151]">Total {formatCurrency((parseFloat(form.kg) || 0) * (parseFloat(form.pricePerKg) || 0))}</span>
            <div className="flex gap-2"><button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-xs font-semibold text-[#6B7280] rounded-2xl hover:bg-[#FAF9F6]">Cancel</button><button type="submit" className="px-5 py-2 bg-[#111827] text-white text-xs font-bold rounded-2xl">Create quote</button></div>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <div className={`${card} py-14 text-center`}><FileText className="w-10 h-10 mx-auto text-[#8E9299] mb-2" /><p className="text-sm font-semibold text-[#111827]">No quotations{filter === 'open' ? ' open' : ''}</p><p className="text-xs text-[#8E9299] mt-1">Quote a price to a customer, send it, and convert it to a booking when they accept.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((q) => {
            const cust = customers.find((c) => c.id === q.customerId);
            const prod = products.find((p) => p.id === q.productId);
            const expired = q.validUntil < todayISO() && (q.status === 'draft' || q.status === 'sent');
            return (
              <div key={q.id} className={`${card} p-5 space-y-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm font-mono text-[#111827]">{q.quoteNumber}</span>
                    {pill(QUOTE_STATUS[expired ? 'expired' : q.status], expired ? 'expired' : q.status)}
                  </div>
                  <span className="text-[11px] font-mono text-[#8E9299]">valid till {formatDate(q.validUntil)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-[10px] text-[#8E9299] font-bold uppercase tracking-wider block">Customer</span><button onClick={() => cust && setSelectedCustomerId(cust.id)} className="font-bold text-[#111827] hover:text-teal-800 hover:underline text-left">{cust?.name || '—'}</button><span className="block text-[11px] text-[#8E9299] truncate">{cust?.company}</span></div>
                  <div><span className="text-[10px] text-[#8E9299] font-bold uppercase tracking-wider block">Product</span><span className="font-bold text-[#111827]">{prod?.name || '—'}</span><span className="block text-[11px] text-teal-800 font-mono">{formatKg(q.kg)} @ Rs. {q.pricePerKg}/kg</span></div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-3 flex items-center justify-between text-xs"><span className="text-[#8E9299]">Quoted value</span><span className="font-mono font-bold text-[#111827]">{formatCurrency(q.amount)}</span></div>
                {q.notes && <p className="text-[11px] text-[#6B7280] italic">"{q.notes}"</p>}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#F0F0EE]">
                  <button onClick={() => setPrintRequest({ type: 'quotation', quotationId: q.id })} className="px-3 py-1.5 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-[11px] font-semibold text-[#374151] flex items-center gap-1"><Printer className="w-3 h-3" /> Print</button>
                  {q.status === 'draft' && <button onClick={() => setQuotationStatus(q.id, 'sent')} className="px-3 py-1.5 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-[11px] font-semibold text-[#374151]">Mark sent</button>}
                  {(q.status === 'draft' || q.status === 'sent') && <button onClick={() => setQuotationStatus(q.id, 'accepted')} className="px-3 py-1.5 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-[11px] font-semibold text-teal-800">Accepted</button>}
                  {(q.status === 'draft' || q.status === 'sent') && <button onClick={() => setQuotationStatus(q.id, 'rejected')} className="px-3 py-1.5 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-[11px] font-semibold text-rose-700">Rejected</button>}
                  {q.status !== 'converted' && q.status !== 'rejected' && (
                    <button onClick={() => { const b = convertQuotation(q.id); if (b) openBooking(b.id); }} className="ml-auto px-3.5 py-1.5 rounded-xl bg-[#111827] text-white text-[11px] font-bold flex items-center gap-1"><ArrowRight className="w-3 h-3 text-teal-400" /> Convert to booking</button>
                  )}
                  {q.status === 'converted' && q.bookingId && <button onClick={() => openBooking(q.bookingId!)} className="ml-auto text-[11px] font-bold text-teal-800 hover:underline">Open booking →</button>}
                  {can('delete_records') && <button onClick={() => setPending(q)} className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog isOpen={Boolean(pending)} title={`Delete ${pending?.quoteNumber}?`} message="The quotation is removed. A booking already created from it is kept." confirmLabel="Delete Quote" onConfirm={() => { if (pending) deleteQuotation(pending.id); setPending(null); }} onCancel={() => setPending(null)} />
    </div>
  );
};

// ===========================================================================
// Purchase orders
// ===========================================================================
const PO_STATUS = { open: 'bg-blue-50 text-blue-900 border-blue-200', partial: 'bg-amber-50 text-amber-900 border-amber-200', received: 'bg-teal-50 text-teal-900 border-teal-200', cancelled: 'bg-[#FAF9F6] text-[#6B7280] border-[#E5E5E1]' } as const;

export const PurchaseOrdersPanel: React.FC<{ onReceive: (opts: { supplierId?: string; productId?: string; purchaseOrderId?: string }) => void }> = ({ onReceive }) => {
  const { purchaseOrders, suppliers, products, purchases, addPurchaseOrder, cancelPurchaseOrder, deletePurchaseOrder, setSelectedSupplierId, setSelectedProductId, setPrintRequest, can } = useTrading();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplierId: '', productId: '', kg: '50000', pricePerKg: '', expectedDate: shiftDate(todayISO(), 3), notes: '' });
  const [pending, setPending] = useState<PurchaseOrder | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const rows = useMemo(() => [...(filter === 'open' ? purchaseOrders.filter((p) => p.status === 'open' || p.status === 'partial') : purchaseOrders)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [purchaseOrders, filter]);

  const openForm = () => {
    const p = products[0];
    setForm({ supplierId: p?.supplierId || suppliers[0]?.id || '', productId: p?.id || '', kg: '50000', pricePerKg: p ? String(p.unitPricePerKg) : '', expectedDate: shiftDate(todayISO(), 3), notes: '' });
    setOpen(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kg = parseFloat(form.kg);
    const price = parseFloat(form.pricePerKg);
    if (!form.supplierId || !form.productId || !kg || kg <= 0 || !price || price <= 0) return;
    addPurchaseOrder({ supplierId: form.supplierId, productId: form.productId, kg, pricePerKg: price, expectedDate: form.expectedDate || undefined, notes: form.notes });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-[#FAF9F6] p-1 rounded-full border border-[#E5E5E1] flex items-center gap-0.5 text-xs font-bold">
          {(['open', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 rounded-full capitalize ${filter === f ? 'bg-[#111827] text-white shadow-xs' : 'text-[#6B7280]'}`}>{f === 'open' ? 'Open orders' : 'All'}</button>
          ))}
        </div>
        <button onClick={openForm} disabled={suppliers.length === 0 || products.length === 0} className="px-4 py-2 bg-[#111827] hover:bg-black text-white text-xs font-bold rounded-2xl flex items-center gap-1.5 disabled:opacity-40"><Plus className="w-3.5 h-3.5 text-teal-400" /> New Purchase Order</button>
      </div>

      {open && (
        <form onSubmit={submit} className={`${card} p-5 space-y-3`}>
          <h3 className="text-sm font-bold text-[#111827] flex items-center gap-1.5"><ClipboardList className="w-4 h-4 text-teal-700" /> New purchase order</h3>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="col-span-2"><label className={labelCls}>Supplier</label><select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className={inputCls}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.company}</option>)}</select></div>
            <div className="col-span-2"><label className={labelCls}>Product</label><select value={form.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setForm({ ...form, productId: e.target.value, supplierId: p?.supplierId || form.supplierId, pricePerKg: p ? String(p.unitPricePerKg) : form.pricePerKg }); }} className={inputCls}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className={labelCls}>Quantity (kg)</label><input type="number" min="1" step="1" value={form.kg} onChange={(e) => setForm({ ...form, kg: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Agreed cost (Rs./kg)</label><input type="number" min="0.01" step="0.01" value={form.pricePerKg} onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Expected by</label><input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} className={inputCls} /></div>
            <div className="col-span-2 lg:col-span-5"><label className={labelCls}>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Grade, packing, delivery point..." className={inputCls} /></div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#374151]">Order value {formatCurrency((parseFloat(form.kg) || 0) * (parseFloat(form.pricePerKg) || 0))}</span>
            <div className="flex gap-2"><button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-xs font-semibold text-[#6B7280] rounded-2xl hover:bg-[#FAF9F6]">Cancel</button><button type="submit" className="px-5 py-2 bg-[#111827] text-white text-xs font-bold rounded-2xl">Create PO</button></div>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <div className={`${card} py-14 text-center`}><ClipboardList className="w-10 h-10 mx-auto text-[#8E9299] mb-2" /><p className="text-sm font-semibold text-[#111827]">No purchase orders{filter === 'open' ? ' open' : ''}</p><p className="text-xs text-[#8E9299] mt-1">Raise a PO to a supplier; each stock receipt against it fills the order.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((po) => {
            const sup = suppliers.find((s) => s.id === po.supplierId);
            const prod = products.find((p) => p.id === po.productId);
            const progress = po.kg > 0 ? Math.min(100, (po.receivedKg / po.kg) * 100) : 0;
            const receipts = purchases.filter((p) => p.purchaseOrderId === po.id);
            const overdue = (po.status === 'open' || po.status === 'partial') && po.expectedDate && po.expectedDate < todayISO();
            return (
              <div key={po.id} className={`${card} p-5 space-y-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-extrabold text-sm font-mono text-[#111827]">{po.poNumber}</span>{pill(PO_STATUS[po.status], po.status)}{overdue && pill('bg-rose-50 text-rose-900 border-rose-200', 'overdue')}</div>
                  <span className="text-[11px] font-mono text-[#8E9299]">{po.expectedDate ? `due ${formatDate(po.expectedDate)}` : formatDate(po.createdAt)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-[10px] text-[#8E9299] font-bold uppercase tracking-wider block">Supplier</span><button onClick={() => sup && setSelectedSupplierId(sup.id)} className="font-bold text-[#111827] hover:text-teal-800 hover:underline text-left">{sup?.company || '—'}</button></div>
                  <div><span className="text-[10px] text-[#8E9299] font-bold uppercase tracking-wider block">Product</span><button onClick={() => prod && setSelectedProductId(prod.id)} className="font-bold text-[#111827] hover:text-teal-800 hover:underline text-left">{prod?.name || '—'}</button><span className="block text-[11px] text-teal-800 font-mono">{formatKg(po.kg)} @ Rs. {po.pricePerKg}/kg</span></div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E5E1] rounded-2xl p-3 space-y-1.5">
                  <div className="flex justify-between text-[11px] text-[#8E9299]"><span>Received {formatKg(po.receivedKg)} of {formatKg(po.kg)} • {receipts.length} receipt(s)</span><span className="font-mono text-[#111827]">{progress.toFixed(0)}%</span></div>
                  <div className="w-full h-2 bg-[#E5E5E1] rounded-full overflow-hidden"><div className="h-full bg-teal-600" style={{ width: `${progress}%` }} /></div>
                  <div className="flex justify-between text-[11px]"><span className="text-[#8E9299]">Order value</span><span className="font-mono font-bold text-[#111827]">{formatCurrency(po.amount)}</span></div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#F0F0EE]">
                  <button onClick={() => setPrintRequest({ type: 'po', purchaseOrderId: po.id })} className="px-3 py-1.5 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-[11px] font-semibold text-[#374151] flex items-center gap-1"><Printer className="w-3 h-3" /> Print</button>
                  {(po.status === 'open' || po.status === 'partial') && <button onClick={() => cancelPurchaseOrder(po.id)} className="px-3 py-1.5 rounded-xl bg-[#FAF9F6] border border-[#E5E5E1] text-[11px] font-semibold text-rose-700">Cancel PO</button>}
                  {(po.status === 'open' || po.status === 'partial') && <button onClick={() => onReceive({ supplierId: po.supplierId, productId: po.productId, purchaseOrderId: po.id })} className="ml-auto px-3.5 py-1.5 rounded-xl bg-[#111827] text-white text-[11px] font-bold flex items-center gap-1"><ArrowRight className="w-3 h-3 text-teal-400" /> Receive against PO</button>}
                  {can('delete_records') && <button onClick={() => setPending(po)} className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog isOpen={Boolean(pending)} title={`Delete ${pending?.poNumber}?`} message="Stock receipts made against it are kept and simply unlinked." confirmLabel="Delete PO" onConfirm={() => { if (pending) deletePurchaseOrder(pending.id); setPending(null); }} onCancel={() => setPending(null)} />
    </div>
  );
};

// ===========================================================================
// Returns
// ===========================================================================
export const ReturnsPanel: React.FC = () => {
  const { returns, customers, suppliers, products, dispatches, purchases, addReturn, deleteReturn, setSelectedCustomerId, setSelectedSupplierId, setPrintRequest, openBooking, can } = useTrading();
  const [open, setOpen] = useState<null | 'sales' | 'purchase'>(null);
  const [form, setForm] = useState({ partyId: '', productId: '', sourceId: '', kg: '', pricePerKg: '', reason: '', date: todayISO() });
  const [pending, setPending] = useState<StockReturn | null>(null);
  const rows = useMemo(() => [...returns].sort((a, b) => (a.date < b.date ? 1 : -1)), [returns]);

  const startForm = (kind: 'sales' | 'purchase') => {
    const p = products[0];
    setForm({ partyId: kind === 'sales' ? customers[0]?.id || '' : suppliers[0]?.id || '', productId: p?.id || '', sourceId: '', kg: '', pricePerKg: p ? String(p.unitPricePerKg) : '', reason: '', date: todayISO() });
    setOpen(kind);
  };
  const sourceOptions = open === 'sales'
    ? dispatches.filter((d) => d.customerId === form.partyId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30)
    : purchases.filter((p) => p.supplierId === form.partyId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
  const pickSource = (id: string) => {
    if (open === 'sales') {
      const d = dispatches.find((x) => x.id === id);
      setForm({ ...form, sourceId: id, productId: d?.productId || form.productId, pricePerKg: d && d.kg > 0 ? String(Math.round((d.amount / d.kg) * 100) / 100) : form.pricePerKg });
    } else {
      const p = purchases.find((x) => x.id === id);
      setForm({ ...form, sourceId: id, productId: p?.productId || form.productId, pricePerKg: p ? String(p.pricePerKg) : form.pricePerKg });
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kg = parseFloat(form.kg);
    const price = parseFloat(form.pricePerKg);
    if (!open || !form.partyId || !form.productId || !kg || kg <= 0 || !price || price < 0 || !form.reason.trim()) return;
    addReturn({ kind: open, customerId: open === 'sales' ? form.partyId : undefined, supplierId: open === 'purchase' ? form.partyId : undefined, productId: form.productId, dispatchId: open === 'sales' ? form.sourceId || null : null, purchaseId: open === 'purchase' ? form.sourceId || null : null, kg, pricePerKg: price, reason: form.reason, date: form.date });
    setOpen(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#6B7280]">Sales returns put goods back in stock and issue a <b>credit note</b> to the customer. Purchase returns send goods back and raise a <b>debit note</b> against the supplier.</p>
        <div className="flex gap-2">
          <button onClick={() => startForm('sales')} disabled={customers.length === 0} className="px-4 py-2 bg-[#111827] text-white text-xs font-bold rounded-2xl flex items-center gap-1.5 disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5 text-teal-400" /> Sales return</button>
          <button onClick={() => startForm('purchase')} disabled={suppliers.length === 0} className="px-4 py-2 bg-[#FAF9F6] border border-[#E5E5E1] text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5 disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Purchase return</button>
        </div>
      </div>

      {open && (
        <form onSubmit={submit} className={`${card} p-5 space-y-3`}>
          <h3 className="text-sm font-bold text-[#111827]">{open === 'sales' ? 'Goods returned by customer' : 'Goods returned to supplier'}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="col-span-2"><label className={labelCls}>{open === 'sales' ? 'Customer' : 'Supplier'}</label><select value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value, sourceId: '' })} className={inputCls}>{(open === 'sales' ? customers.map((c) => ({ id: c.id, label: `${c.name} — ${c.company}` })) : suppliers.map((s) => ({ id: s.id, label: s.company }))).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
            <div className="col-span-2"><label className={labelCls}>Against {open === 'sales' ? 'dispatch' : 'receipt'} (optional)</label><select value={form.sourceId} onChange={(e) => pickSource(e.target.value)} className={inputCls}><option value="">—</option>{open === 'sales' ? (sourceOptions as typeof dispatches).map((d) => <option key={d.id} value={d.id}>{d.dispatchNumber} • {formatDate(d.date)} • {formatKg(d.kg)}</option>) : (sourceOptions as typeof purchases).map((p) => <option key={p.id} value={p.id}>{p.receiptNumber} • {formatDate(p.date)} • {formatKg(p.kg)}</option>)}</select></div>
            <div className="col-span-2"><label className={labelCls}>Product</label><select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className={inputCls}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className={labelCls}>Quantity (kg)</label><input type="number" min="1" step="1" value={form.kg} onChange={(e) => setForm({ ...form, kg: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Rate (Rs./kg)</label><input type="number" min="0" step="0.01" value={form.pricePerKg} onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Date</label><input type="date" max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} required /></div>
            <div className="col-span-2 lg:col-span-3"><label className={labelCls}>Reason *</label><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Quality rejected, wrong grade, moisture, shortage..." className={inputCls} required /></div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#374151]">{open === 'sales' ? 'Credit' : 'Debit'} note value {formatCurrency((parseFloat(form.kg) || 0) * (parseFloat(form.pricePerKg) || 0))}</span>
            <div className="flex gap-2"><button type="button" onClick={() => setOpen(null)} className="px-4 py-2 text-xs font-semibold text-[#6B7280] rounded-2xl hover:bg-[#FAF9F6]">Cancel</button><button type="submit" className="px-5 py-2 bg-[#111827] text-white text-xs font-bold rounded-2xl">Record return</button></div>
          </div>
        </form>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF9F6] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]"><tr><th className="py-3 px-4">Note #</th><th className="py-3 px-4">Date</th><th className="py-3 px-4">Party</th><th className="py-3 px-4">Product</th><th className="py-3 px-4 text-right">kg</th><th className="py-3 px-4 text-right">Value</th><th className="py-3 px-4">Reason</th><th className="py-3 px-2" /></tr></thead>
            <tbody className="divide-y divide-[#FAF9F6] font-mono">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-[#8E9299] font-sans">No returns recorded.</td></tr>
              ) : rows.map((r) => {
                const party = r.kind === 'sales' ? customers.find((c) => c.id === r.customerId) : suppliers.find((s) => s.id === r.supplierId);
                const prod = products.find((p) => p.id === r.productId);
                const src = r.dispatchId ? dispatches.find((d) => d.id === r.dispatchId) : null;
                return (
                  <tr key={r.id} className="hover:bg-[#FAF9F6]">
                    <td className="py-2.5 px-4 font-bold text-[#111827]">{r.returnNumber}<span className={`block text-[9px] uppercase tracking-wider font-sans ${r.kind === 'sales' ? 'text-teal-700' : 'text-amber-700'}`}>{r.kind === 'sales' ? 'credit note' : 'debit note'}</span></td>
                    <td className="py-2.5 px-4 text-[#6B7280] whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="py-2.5 px-4 font-sans"><button onClick={() => (r.kind === 'sales' ? setSelectedCustomerId(r.customerId!) : setSelectedSupplierId(r.supplierId!))} className="font-bold text-[#111827] hover:text-teal-800 hover:underline">{r.kind === 'sales' ? (party as any)?.name : (party as any)?.company}</button>{src && <button onClick={() => openBooking(src.bookingId, src.id)} className="block text-[10px] text-[#8E9299] hover:underline font-mono">{src.dispatchNumber}</button>}</td>
                    <td className="py-2.5 px-4 font-sans text-[#374151]">{prod?.name}</td>
                    <td className={`py-2.5 px-4 text-right font-bold ${r.kind === 'sales' ? 'text-teal-800' : 'text-amber-800'}`}>{r.kind === 'sales' ? '+' : '−'}{formatKg(r.kg)}</td>
                    <td className="py-2.5 px-4 text-right text-[#111827]">{formatCurrency(r.amount)}</td>
                    <td className="py-2.5 px-4 font-sans text-[#6B7280] max-w-[220px] truncate" title={r.reason}>{r.reason}</td>
                    <td className="py-2.5 px-2 text-right whitespace-nowrap"><button onClick={() => setPrintRequest({ type: 'note', returnId: r.id })} title="Print note" className="p-1.5 rounded-lg text-[#8E9299] hover:text-teal-700 hover:bg-teal-50"><Printer className="w-3.5 h-3.5" /></button>{can('delete_records') && <button onClick={() => setPending(r)} className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog isOpen={Boolean(pending)} title={`Delete ${pending?.returnNumber}?`} message="Stock and the customer/supplier balance are reversed and the note's ledger row is removed." confirmLabel="Delete Return" onConfirm={() => { if (pending) deleteReturn(pending.id); setPending(null); }} onCancel={() => setPending(null)} />
    </div>
  );
};

// ===========================================================================
// Tasks / follow-ups
// ===========================================================================
const LINK_LABEL: Record<TaskLinkType, string> = { customer: 'Customer', supplier: 'Supplier', booking: 'Booking', product: 'Product', truck: 'Vehicle' };

export const TasksPanel: React.FC<{ initialLink?: { type: TaskLinkType; id: string } | null }> = ({ initialLink }) => {
  const { tasks, customers, suppliers, bookings, products, trucks, addTask, completeTask, deleteTask, setSelectedCustomerId, setSelectedSupplierId, setSelectedProductId, openBooking, can } = useTrading();
  const [form, setForm] = useState<{ title: string; dueDate: string; linkType: TaskLinkType | ''; linkId: string; note: string }>({ title: '', dueDate: todayISO(), linkType: initialLink?.type || '', linkId: initialLink?.id || '', note: '' });
  const [showDone, setShowDone] = useState(false);
  const rows = useMemo(() => [...tasks].filter((t) => showDone || t.status === 'open').sort((a, b) => (a.status !== b.status ? (a.status === 'open' ? -1 : 1) : a.dueDate < b.dueDate ? -1 : 1)), [tasks, showDone]);
  const linkOptions = (t: TaskLinkType | '') => {
    switch (t) {
      case 'customer': return customers.map((c) => ({ id: c.id, label: c.name }));
      case 'supplier': return suppliers.map((s) => ({ id: s.id, label: s.company }));
      case 'booking': return bookings.map((b) => ({ id: b.id, label: b.bookingNumber }));
      case 'product': return products.map((p) => ({ id: p.id, label: p.name }));
      case 'truck': return trucks.map((v) => ({ id: v.id, label: v.number }));
      default: return [];
    }
  };
  const linkName = (t: Task) => linkOptions(t.linkType || '').find((o) => o.id === t.linkId)?.label;
  const openLink = (t: Task) => {
    if (!t.linkType || !t.linkId) return;
    if (t.linkType === 'customer') setSelectedCustomerId(t.linkId);
    if (t.linkType === 'supplier') setSelectedSupplierId(t.linkId);
    if (t.linkType === 'product') setSelectedProductId(t.linkId);
    if (t.linkType === 'booking') openBooking(t.linkId);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    addTask({ title: form.title, dueDate: form.dueDate, linkType: form.linkType || null, linkId: form.linkType ? form.linkId || null : null, note: form.note });
    setForm({ ...form, title: '', note: '' });
  };
  const today = todayISO();

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className={`${card} p-5 space-y-3`}>
        <h3 className="text-sm font-bold text-[#111827] flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-teal-700" /> New follow-up</h3>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="col-span-2"><label className={labelCls}>What needs doing</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Call Ali about overdue invoice" className={inputCls} required /></div>
          <div><label className={labelCls}>Due</label><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} required /></div>
          <div><label className={labelCls}>Attach to</label><select value={form.linkType} onChange={(e) => setForm({ ...form, linkType: e.target.value as TaskLinkType | '', linkId: '' })} className={inputCls}><option value="">—</option>{(Object.keys(LINK_LABEL) as TaskLinkType[]).map((k) => <option key={k} value={k}>{LINK_LABEL[k]}</option>)}</select></div>
          <div className="col-span-2"><label className={labelCls}>Record</label><select value={form.linkId} onChange={(e) => setForm({ ...form, linkId: e.target.value })} className={inputCls} disabled={!form.linkType}><option value="">—</option>{linkOptions(form.linkType).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
          <div className="col-span-2 lg:col-span-5"><label className={labelCls}>Note</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} /></div>
          <div className="flex items-end"><button type="submit" className="w-full px-4 py-2.5 bg-[#111827] text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5 text-teal-400" /> Add</button></div>
        </div>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[#6B7280]">{tasks.filter((t) => t.status === 'open').length} open • {tasks.filter((t) => t.status === 'open' && t.dueDate < today).length} overdue</span>
        <label className="flex items-center gap-2 text-xs text-[#6B7280] cursor-pointer"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-teal-700" /> Show completed</label>
      </div>

      <div className={`${card} overflow-hidden divide-y divide-[#F0F0EE]`}>
        {rows.length === 0 ? (
          <div className="py-12 text-center"><CheckCircle2 className="w-8 h-8 mx-auto text-teal-600 mb-2" /><p className="text-sm font-semibold text-[#111827]">Nothing to follow up</p></div>
        ) : rows.map((t) => {
          const overdue = t.status === 'open' && t.dueDate < today;
          const name = linkName(t);
          return (
            <div key={t.id} className={`px-4 py-3 flex items-start gap-3 ${t.status === 'done' ? 'opacity-60' : ''}`}>
              <button onClick={() => completeTask(t.id, t.status !== 'done')} className="mt-0.5 text-teal-700 shrink-0">{t.status === 'done' ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5 text-[#CBD5E1] hover:text-teal-600" />}</button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold text-[#111827] ${t.status === 'done' ? 'line-through' : ''}`}>{t.title}</div>
                <div className="text-[11px] text-[#6B7280] flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className={`font-mono ${overdue ? 'text-rose-700 font-bold' : ''}`}>{overdue ? 'Overdue • ' : ''}due {formatDate(t.dueDate)}</span>
                  {t.linkType && name && <button onClick={() => openLink(t)} className="flex items-center gap-1 text-teal-800 hover:underline"><Link2 className="w-3 h-3" />{LINK_LABEL[t.linkType]}: {name}</button>}
                  {t.createdBy && <span>by {t.createdBy}</span>}
                  {t.note && <span className="italic">{t.note}</span>}
                </div>
              </div>
              {can('delete_records') && <button onClick={() => deleteTask(t.id)} className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ===========================================================================
// Stock adjustment dialog
// ===========================================================================
export const StockAdjustDialog: React.FC<{ productId: string | null; onClose: () => void }> = ({ productId, onClose }) => {
  const { products, adjustStock } = useTrading();
  const product = products.find((p) => p.id === productId);
  useEscape(Boolean(productId), onClose);
  const [newStock, setNewStock] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('count');
  const [note, setNote] = useState('');
  React.useEffect(() => {
    if (product) {
      setNewStock(String(product.stockKg));
      setReason('count');
      setNote('');
    }
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!product) return null;
  const delta = (parseFloat(newStock) || 0) - product.stockKg;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div onClick={onClose} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const val = parseFloat(newStock);
          if (isNaN(val) || val < 0) return;
          adjustStock(product.id, val, reason, note);
          onClose();
        }}
        className="relative z-10 w-full max-w-md bg-white rounded-3xl border border-[#E5E5E1] shadow-2xl p-6 space-y-4"
      >
        <div>
          <h3 className="text-base font-bold text-[#111827] flex items-center gap-2"><Scale className="w-4 h-4 text-teal-700" /> Adjust stock: {product.name}</h3>
          <p className="text-xs text-[#6B7280] mt-1">Currently {formatKg(product.stockKg)}. Every adjustment is logged with a reason and shows in the stock flow.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>New stock (kg)</label><input autoFocus type="number" min="0" step="1" value={newStock} onChange={(e) => setNewStock(e.target.value)} className={inputCls} required /></div>
          <div><label className={labelCls}>Reason</label><select value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)} className={inputCls}>{ADJUSTMENT_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
        </div>
        <div><label className={labelCls}>Note</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Counted by Rashid, bay 3" className={inputCls} /></div>
        <div className={`text-xs font-mono rounded-2xl p-3 border ${delta === 0 ? 'bg-[#FAF9F6] border-[#E5E5E1] text-[#6B7280]' : delta > 0 ? 'bg-teal-50 border-teal-200 text-teal-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>Change: {delta > 0 ? '+' : ''}{delta.toLocaleString()} kg</div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-[#6B7280] hover:bg-[#FAF9F6]">Cancel</button>
          <button type="submit" disabled={delta === 0} className="px-5 py-2.5 rounded-2xl bg-[#111827] text-white text-xs font-bold disabled:opacity-40">Save adjustment</button>
        </div>
      </form>
    </div>
  );
};
