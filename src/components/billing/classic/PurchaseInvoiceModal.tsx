import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, Printer, Search, Keyboard } from 'lucide-react';
import { useTrading } from '../../../context/TradingContext';
import { PURCHASE_PAY_METHODS } from '../../../context/classicActions';
import { Modal, Notice, inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn, rs } from '../ui';
import { QuickSelect, PickOption } from '../QuickPick';
import { CodeBox } from '../CodeBox';
import { ConfirmDialog } from '../../ConfirmDialog';
import { todayISO } from '../../../utils/stockFlow';
import { formatDate } from '../../../utils/formatters';
import { hasPack, formatPackQty } from '../../../utils/packUnits';
import { purchaseInvoiceTotals } from '../../../utils/purchaseInvoices';
import { godownName } from '../../../utils/inventory';
import type { PurchaseInvoice } from '../../../types';

interface Line {
  key: number;
  pid: string;
  qty: string;
  rate: string;
  /** Qty and rate typed per pack (carton) instead of per base unit. */
  inPack: boolean;
  batchNo: string;
  expiry: string;
}
let seq = 0;
const blank = (): Line => ({ key: ++seq, pid: '', qty: '', rate: '', inPack: false, batchNo: '', expiry: '' });
const num = (s: string) => Math.max(0, parseFloat(s) || 0);
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Find an old purchase invoice by our number (P-12, or just 12) or the supplier's bill number. */
export const findPurchaseInvoice = <T extends { invoiceNumber: string; memoNo?: string }>(list: T[], typed: string): T | undefined => {
  const q = typed.trim().toLowerCase();
  if (!q) return undefined;
  return (
    list.find((p) => p.invoiceNumber.toLowerCase() === q) ||
    (/^\d+$/.test(q) ? list.find((p) => (p.invoiceNumber.match(/(\d+)\s*$/) || [])[1] === String(Number(q))) : undefined) ||
    list.find((p) => (p.memoNo || '').trim().toLowerCase() === q)
  );
};

/**
 * Purchase Invoice (as in Apna Accountant): Computer #, date, supplier, memo no. (the supplier's bill no.),
 * store, lines of Code / Product / Unit / Packing / Qty / Rate / Amount, discount % or amount, other
 * charges, remarks and what was paid now. Saving receives the goods, owes the supplier the bill total
 * and records the payment (see context/classicActions.ts).
 */
export const PurchaseInvoiceModal: React.FC<{ isOpen: boolean; onClose: () => void; supplierId?: string | null; onSaved: (id: string) => void; onOpen: (id: string) => void }> = ({ isOpen, onClose, supplierId: preset, onSaved, onOpen }) => {
  const { products, suppliers, godowns, createPurchaseInvoice, previewPurchaseInvoiceNumber, purchaseInvoices, setPrintRequest, purchases } = useTrading();
  const [supplierId, setSupplierId] = useState(preset || '');
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState('');
  const [godownId, setGodownId] = useState(godowns[0]?.id || '');
  const [lines, setLines] = useState<Line[]>(() => [blank()]);
  const [discPct, setDiscPct] = useState('');
  const [discAmt, setDiscAmt] = useState('');
  const [charges, setCharges] = useState('');
  const [remarks, setRemarks] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState('Cash');
  const [paper, setPaper] = useState<'a4' | 'a5'>('a4');
  const [find, setFind] = useState('');
  const [error, setError] = useState('');
  const busy = useRef(false);

  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const productOptions: PickOption[] = useMemo(() => sortedProducts.map((p) => ({ value: p.id, name: p.name, code: p.code, barcode: p.barcode })), [sortedProducts]);
  const sortedSuppliers = useMemo(() => [...suppliers].sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name)), [suppliers]);
  const supplierOptions: PickOption[] = useMemo(() => sortedSuppliers.map((s) => ({ value: s.id, name: s.company || s.name, code: s.code, extra: s.phone })), [sortedSuppliers]);
  const supplier = suppliers.find((s) => s.id === supplierId);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  /** A picked item fills the rate from its cost price (per pack when the line is in packs). */
  const pick = (key: number, pid: string) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const p = products.find((x) => x.id === pid);
        const inPack = Boolean(p && hasPack(p) && l.inPack);
        const base = p?.costPricePerKg && p.costPricePerKg > 0 ? p.costPricePerKg : 0;
        return { ...l, pid, inPack, rate: l.rate || !base ? l.rate : String(round4(inPack && p ? base * p.packSize! : base)) };
      })
    );
  const togglePack = (key: number, toPack: boolean) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key || l.inPack === toPack) return l;
        const p = products.find((x) => x.id === l.pid);
        if (!p || !hasPack(p)) return l;
        const q = parseFloat(l.qty);
        const r = parseFloat(l.rate);
        return { ...l, inPack: toPack, qty: Number.isFinite(q) ? String(round4(toPack ? q / p.packSize! : q * p.packSize!)) : l.qty, rate: Number.isFinite(r) ? String(round4(toPack ? r * p.packSize! : r / p.packSize!)) : l.rate };
      })
    );

  const calc = lines.map((l) => {
    const p = products.find((x) => x.id === l.pid);
    const pack = l.inPack && p && hasPack(p) ? p.packSize! : 1;
    const typedQty = num(l.qty);
    const typedRate = num(l.rate);
    return { ...l, p, pack, typedQty, typedRate, qty: round4(typedQty * pack), rate: pack > 1 ? typedRate / pack : typedRate, amount: Math.round(typedQty * typedRate * 100) / 100 };
  });
  const used = calc.filter((l) => l.pid);
  const totals = purchaseInvoiceTotals(used.map((l) => ({ qty: l.qty, rate: l.rate })), { discountPct: num(discPct), discountAmount: num(discAmt), otherCharges: num(charges) });
  const paidNow = num(paid);
  const balance = Math.round((totals.total - paidNow) * 100) / 100;
  const number = previewPurchaseInvoiceNumber(date);

  const submit = (print: boolean) => {
    if (busy.current) return;
    setError('');
    if (!supplierId) return setError('Pick the supplier.');
    if (used.length === 0) return setError('Add at least one item.');
    busy.current = true;
    const r = createPurchaseInvoice({
      supplierId,
      date,
      memoNo: memo,
      godownId: godowns.length > 1 ? godownId : undefined,
      lines: used.map((l) => ({ productId: l.pid, qty: l.qty, rate: l.rate, ...(l.pack > 1 ? { packs: l.typedQty } : {}), batchNo: l.batchNo || undefined, expiryDate: l.expiry || undefined })),
      discountPct: num(discPct),
      discountAmount: num(discAmt),
      otherCharges: num(charges),
      paidNow,
      paidMethod: method,
      remarks,
    });
    if (!r.success || !r.invoice) {
      busy.current = false;
      return setError(r.message);
    }
    onSaved(r.invoice.id);
    if (print) setPrintRequest({ type: 'purchase_invoice', id: r.invoice.id, paper });
  };

  const search = () => {
    const hit = findPurchaseInvoice<PurchaseInvoice>(purchaseInvoices, find);
    if (!hit) return setError(`No purchase invoice “${find.trim()}”. Type our number (e.g. P-12) or the supplier’s bill no.`);
    onOpen(hit.id);
  };

  /** Ctrl+Enter or F9 saves, as on the sale invoice. */
  const onKeys = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'F9') {
      e.preventDefault();
      submit(false);
    }
  };

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 text-sm">
        <span className="text-[#6B7280] dark:text-[#94A3B8]">Bill total </span>
        <span className="tabular-nums font-extrabold text-lg text-[#111827] dark:text-white" data-testid="pi-total">{rs(totals.total)}</span>
        <span className="hidden lg:inline-flex items-center gap-1 ml-3 text-[10px] text-[#8E9299]"><Keyboard className="w-3 h-3" /> F9 save</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="pi-paper">Print on</label>
        <select id="pi-paper" value={paper} onChange={(e) => setPaper(e.target.value as 'a4' | 'a5')} className={`${inputCls} !w-auto min-w-[5.5rem]`} title="Paper for Save & Print">
          <option value="a4">A4</option>
          <option value="a5">A5</option>
        </select>
        <button type="button" onClick={() => submit(false)} className={secondaryBtn}><Save className="w-4 h-4" /> Save</button>
        <button type="button" onClick={() => submit(true)} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save &amp; Print</button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Purchase Invoice" subtitle="Enter the supplier’s bill: the goods go into stock and the supplier is owed the bill total." wide footer={footer}>
      <div className="space-y-5" onKeyDown={onKeys} data-testid="purchase-invoice-form">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <span className={labelCls}>Computer #</span>
            <div className="rounded-2xl border border-dashed border-[#E5E5E1] dark:border-[#203248] px-3.5 py-2.5 text-sm font-bold tabular-nums text-[#111827] dark:text-white" data-testid="pi-number" title="Given automatically when you save">{number}</div>
          </div>
          <div>
            <label className={labelCls} htmlFor="pi-date">Date (your date)</label>
            <input id="pi-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="pi-supplier">Supplier</label>
            <div className="flex gap-2">
              <CodeBox id="pi-supplier-code" label="Supplier code" items={sortedSuppliers} value={supplierId} onPick={setSupplierId} className="w-28 shrink-0" />
              <div className="flex-1 min-w-0">
                <QuickSelect id="pi-supplier" value={supplierId} options={supplierOptions} onPick={setSupplierId} className={inputCls} title="Type a name or code to find the supplier">
                  <option value="">Select supplier…</option>
                  {sortedSuppliers.map((s) => <option key={s.id} value={s.id}>{s.code ? `${s.code} • ` : ''}{s.company || s.name}</option>)}
                </QuickSelect>
              </div>
            </div>
            {supplier && <p className="mt-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8]" data-testid="pi-supplier-balance">You owe them <strong className="tabular-nums">{rs(supplier.totalOwed)}</strong> now • <strong className="tabular-nums">{rs(supplier.totalOwed + balance)}</strong> after this bill</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="pi-memo">Memo No (supplier bill no.)</label>
            <input id="pi-memo" value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} placeholder="e.g. 4471" />
          </div>
          {godowns.length > 1 && (
            <div>
              <label className={labelCls} htmlFor="pi-godown">Store name</label>
              <select id="pi-godown" value={godownId} onChange={(e) => setGodownId(e.target.value)} className={inputCls}>
                {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          <div className={godowns.length > 1 ? 'col-span-2' : 'col-span-2 sm:col-span-3'}>
            <label className={labelCls} htmlFor="pi-search">Search old invoice</label>
            <div className="flex gap-2">
              <input id="pi-search" data-skip-autofocus value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} className={inputCls} placeholder="P-12 or supplier bill no." />
              <button type="button" onClick={search} className={`${secondaryBtn} shrink-0`} aria-label="Search purchase invoice"><Search className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        <div>
          <div className="hidden md:grid md:grid-cols-[7rem_minmax(11rem,1fr)_8.5rem_7rem_8rem_8.5rem] gap-2 px-1 mb-1 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">
            <div>Code</div>
            <div>Product name</div>
            <div>Unit / packing</div>
            <div>Qty</div>
            <div>Rate</div>
            <div className="text-right">Amount</div>
          </div>
          <div className="space-y-2">
            {calc.map((l, i) => {
              const p = l.p;
              const id = (f: string) => (i === 0 ? `pi-${f}` : `pi-${f}-${i + 1}`);
              const unitWord = p ? (l.pack > 1 ? p.packName! : p.unit || 'pcs') : '';
              return (
                <div key={l.key} data-testid="pi-line" className="grid grid-cols-12 md:grid-cols-[7rem_minmax(11rem,1fr)_8.5rem_7rem_8rem_8.5rem] gap-2 items-center rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-2 md:p-1 md:border-0">
                  <CodeBox id={id('code')} label={`Product code ${i + 1}`} items={sortedProducts} value={l.pid} onPick={(v) => pick(l.key, v)} className="col-span-4 md:col-auto" />
                  <div className="col-span-8 md:col-auto flex gap-1">
                    <div className="flex-1 min-w-0">
                      <QuickSelect id={id('item')} aria-label={`Product ${i + 1}`} value={l.pid} options={productOptions} onPick={(v) => pick(l.key, v)} className={inputCls} title="Type the product name or code">
                        <option value="">Product…</option>
                        {sortedProducts.map((x) => <option key={x.id} value={x.id}>{x.code ? `${x.code} • ` : ''}{x.name}</option>)}
                      </QuickSelect>
                    </div>
                    <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`} className="md:hidden shrink-0 p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="col-span-12 md:col-auto text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                    {p && hasPack(p) ? (
                      <span className="inline-flex rounded-xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden font-bold" role="group" aria-label={`Unit for line ${i + 1}`}>
                        {[false, true].map((packMode) => (
                          <button key={String(packMode)} type="button" aria-pressed={l.inPack === packMode} onClick={() => togglePack(l.key, packMode)} className={`px-2 py-1 ${l.inPack === packMode ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : ''}`}>
                            {packMode ? `${p.packName} (${p.packSize})` : p.unit || 'pcs'}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span className="font-semibold">{p ? p.unit || 'pcs' : ''}</span>
                    )}
                  </div>
                  <div className="col-span-4 md:col-auto">
                    <input id={id('qty')} aria-label={`Qty ${i + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="Qty" />
                  </div>
                  <div className="col-span-4 md:col-auto">
                    <input id={id('rate')} aria-label={`Rate ${i + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} className={`${inputCls} tabular-nums`} placeholder={p ? `per ${unitWord}` : 'Rate'} />
                  </div>
                  <div className="col-span-4 md:col-auto flex items-center justify-end gap-1">
                    <span className="tabular-nums font-bold text-sm text-[#111827] dark:text-white" data-testid={`pi-amount-${i + 1}`}>{rs(l.amount)}</span>
                    <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`} className="hidden md:inline-flex p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {p && (
                    <div className="col-span-12 md:col-span-full flex flex-wrap gap-x-3 text-[11px] text-[#6B7280] dark:text-[#94A3B8] px-1">
                      {l.pack > 1 && l.typedQty > 0 && <span>= {formatPackQty(l.qty, p)} at {rs(Math.round(l.rate * 100) / 100)}/{p.unit || 'pcs'}</span>}
                      <span>Stock in hand <strong className="tabular-nums">{formatPackQty(p.stockKg, p, 'short')}</strong></span>
                      {(() => {
                        const last = purchases.filter((x) => x.productId === p.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
                        return last ? <span>Last bought at <strong className="tabular-nums">{rs(last.pricePerKg)}/{p.unit || 'pcs'}</strong> ({formatDate(last.date)})</span> : null;
                      })()}
                    </div>
                  )}
                  {p?.trackBatches && (
                    <div className="col-span-12 md:col-span-full grid grid-cols-2 gap-2">
                      <input aria-label={`Batch no. ${i + 1}`} value={l.batchNo} onChange={(e) => setLine(l.key, { batchNo: e.target.value })} className={inputCls} placeholder="Batch no. (auto if empty)" />
                      <input aria-label={`Expiry ${i + 1}`} type="date" value={l.expiry} onChange={(e) => setLine(l.key, { expiry: e.target.value })} className={inputCls} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 dark:text-teal-300 hover:underline"><Plus className="w-4 h-4" /> Add another item</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls} htmlFor="pi-disc-pct">Discount %</label>
                <input id="pi-disc-pct" type="number" inputMode="decimal" min="0" max="100" step="any" value={discPct} onChange={(e) => { setDiscPct(e.target.value); if (e.target.value) setDiscAmt(''); }} className={`${inputCls} tabular-nums`} placeholder="0" />
              </div>
              <div>
                <label className={labelCls} htmlFor="pi-disc-amt">Discount (Rs.)</label>
                <input id="pi-disc-amt" type="number" inputMode="decimal" min="0" step="any" value={discPct ? String(totals.discount) : discAmt} readOnly={Boolean(discPct)} onChange={(e) => setDiscAmt(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="pi-charges">Other charges (Rs.)</label>
              <input id="pi-charges" type="number" inputMode="decimal" min="0" step="any" value={charges} onChange={(e) => setCharges(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0 (freight, loading on the bill)" />
            </div>
            <div>
              <label className={labelCls} htmlFor="pi-remarks">Remarks</label>
              <input id="pi-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputCls} placeholder="optional" />
            </div>
          </div>
          <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] p-4 space-y-2 text-sm">
            <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Amount</span><span className="tabular-nums">{rs(totals.gross)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Discount{num(discPct) > 0 ? ` ${num(discPct)}%` : ''}</span><span className="tabular-nums">− {rs(totals.discount)}</span></div>}
            {totals.charges > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Other charges</span><span className="tabular-nums">{rs(totals.charges)}</span></div>}
            <div className="flex justify-between font-extrabold text-[#111827] dark:text-white border-t border-[#E5E5E1] dark:border-[#203248] pt-2"><span>Bill total</span><span className="tabular-nums">{rs(totals.total)}</span></div>
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 pt-1">
              <div>
                <label className={labelCls} htmlFor="pi-paid">Paid now</label>
                <div className="flex gap-1">
                  <input id="pi-paid" type="number" inputMode="decimal" min="0" step="any" value={paid} onChange={(e) => setPaid(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                  <button type="button" tabIndex={-1} onClick={() => setPaid(String(totals.total))} className="shrink-0 px-2.5 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-bold text-teal-700 dark:text-teal-300" title="Paid in full">Full</button>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="pi-method">Paid from</label>
                <select id="pi-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                  {PURCHASE_PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-between text-xs font-bold pt-1"><span className={balance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}>Balance (owed to supplier)</span><span className="tabular-nums text-[#111827] dark:text-white">{rs(balance)}</span></div>
            <p className="text-[10px] text-[#8E9299]">Discount and other charges are spread over the items, so stock is valued at what it really cost you. A cheque: save, then use Pay supplier.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

/** A saved purchase invoice: lines, totals, print (A4 / A5) and delete. */
export const PurchaseInvoiceDetail: React.FC<{ id: string | null; onClose: () => void }> = ({ id, onClose }) => {
  const { purchaseInvoices, deletePurchaseInvoice, setPrintRequest, can, godowns } = useTrading();
  const inv = purchaseInvoices.find((p) => p.id === id) || null;
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  return (
    <>
      <Modal
        isOpen={Boolean(inv)}
        onClose={onClose}
        title={inv ? `Purchase Invoice ${inv.invoiceNumber}` : 'Purchase Invoice'}
        subtitle={inv ? `${inv.supplierName} • ${formatDate(inv.date)}${inv.memoNo ? ` • bill no. ${inv.memoNo}` : ''}` : undefined}
        wide
        footer={
          inv && (
            <div className="flex flex-wrap gap-2 justify-between">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPrintRequest({ type: 'purchase_invoice', id: inv.id, paper: 'a4' })} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Print A4</button>
                <button type="button" onClick={() => setPrintRequest({ type: 'purchase_invoice', id: inv.id, paper: 'a5' })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print A5</button>
              </div>
              {can('delete_records') && <button type="button" onClick={() => setConfirm(true)} className={dangerBtn}><Trash2 className="w-4 h-4" /> Delete</button>}
            </div>
          )
        }
      >
        {inv && (
          <div className="space-y-4" data-testid="purchase-invoice-detail">
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
              <table className="w-full text-sm">
                <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">
                  <tr><th className="text-left px-3 py-2">Code</th><th className="text-left px-3 py-2">Product</th><th className="text-left px-3 py-2">Unit</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Rate</th><th className="text-right px-3 py-2">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 font-mono text-xs">{l.code || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-[#111827] dark:text-white">{l.productName}{l.batchNo ? <div className="text-[11px] font-normal text-[#6B7280]">Batch {l.batchNo}{l.expiryDate ? ` • exp ${formatDate(l.expiryDate)}` : ''}</div> : null}</td>
                      <td className="px-3 py-2 text-xs">{l.unit}{l.packs ? <div className="text-[11px] text-[#6B7280]">{l.packs} {l.packName}{l.packs === 1 ? '' : 's'} of {l.packSize}</div> : null}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rs(l.rate)}{Math.abs(l.landedRate - l.rate) >= 0.01 && <div className="text-[11px] text-[#6B7280]">landed {rs(l.landedRate)}</div>}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{rs(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Amount</div><div className="tabular-nums font-extrabold">{rs(inv.grossAmount)}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Discount / charges</div><div className="tabular-nums font-extrabold">− {rs(inv.discountAmount)} / + {rs(inv.otherCharges)}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Bill total</div><div className="tabular-nums font-extrabold" data-testid="pid-total">{rs(inv.totalAmount)}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Paid now</div><div className="tabular-nums font-extrabold">{rs(inv.paidAmount)}{inv.paidMethod ? <span className="text-[11px] font-semibold text-[#6B7280]"> {inv.paidMethod}</span> : null}</div></div>
            </div>
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
              Entered on {new Date(inv.createdAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}{inv.createdBy ? ` by ${inv.createdBy}` : ''}
              {inv.godownId && godowns.length > 1 ? ` • into ${godownName(godowns, inv.godownId)}` : ''}
              {inv.remarks ? ` • ${inv.remarks}` : ''}
            </p>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={confirm}
        title={`Delete purchase invoice ${inv?.invoiceNumber || ''}?`}
        message="The goods come off the stock again, the supplier is owed that much less, and the payment made on it is taken back out of the cash book. The number is not used again."
        details={inv ? [`Bill total ${rs(inv.totalAmount)}`, `Supplier: ${inv.supplierName}`] : []}
        confirmLabel="Delete invoice"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          if (!inv) return;
          const r = deletePurchaseInvoice(inv.id);
          setConfirm(false);
          if (!r.success) return setMsg({ kind: 'error', text: r.message });
          onClose();
        }}
      />
    </>
  );
};
