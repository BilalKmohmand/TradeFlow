import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Save, Printer, Search, Keyboard, Eye, X, MoreHorizontal } from 'lucide-react';
import { useTrading } from '../../../context/TradingContext';
import { PURCHASE_PAY_METHODS } from '../../../context/classicActions';
import { Modal, Notice, inputCls, numInputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn, rs } from '../ui';
import { QuickSelect, PickOption } from '../QuickPick';
import { CodeBox } from '../CodeBox';
import { ConfirmDialog } from '../../ConfirmDialog';
import { todayISO } from '../../../utils/stockFlow';
import { formatDate } from '../../../utils/formatters';
import { hasPack, formatPackQty } from '../../../utils/packUnits';
import { purchaseInvoiceTotals } from '../../../utils/purchaseInvoices';
import { godownName } from '../../../utils/inventory';
import { allCities } from '../../../utils/vouchers';
import { ACC, mergeAccounts } from '../../../utils/accounting';
import { loadPrintChoice, paperOf, savePrintChoice, PrintChoice } from '../../../utils/saleInvoice';
import { SearchPartyDialog } from './SearchPartyDialog';
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
  /** In the grid; the one line that is not is the entry row. */
  committed: boolean;
}
let seq = 0;
const blank = (patch: Partial<Line> = {}): Line => ({ key: ++seq, pid: '', qty: '', rate: '', inPack: false, batchNo: '', expiry: '', committed: false, ...patch });
const num = (s: string) => Math.max(0, parseFloat(s) || 0);
const round4 = (n: number) => Math.round(n * 10000) / 10000;
/** Code | Product Name | Unit | Packing Items | Qty | Rate | Amount */
const PI_COLS = 'lg:grid-cols-[6.5rem_minmax(8rem,1.4fr)_7rem_minmax(5rem,0.8fr)_7rem_8.5rem_minmax(7rem,max-content)]';
const PI_GRID_COLS = 'lg:grid-cols-[6.5rem_minmax(8rem,1.4fr)_7rem_minmax(5rem,0.8fr)_7rem_8.5rem_minmax(7rem,max-content)_2.25rem]';
const PRINT_OPTS: { id: PrintChoice; label: string; hint: string }[] = [
  { id: 'none', label: 'None', hint: 'Do not print' },
  { id: 'half', label: 'Half', hint: 'A5' },
  { id: 'full', label: 'Full', hint: 'A4' },
];

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

/** A saved invoice's lines as grid lines (per pack when it was entered in packs). */
const linesFrom = (inv: PurchaseInvoice): Line[] =>
  inv.lines.map((l) =>
    l.packs && (l.packSize || 0) > 1
      ? blank({ pid: l.productId, qty: String(round4(l.packs)), rate: String(round4(l.rate * l.packSize!)), inPack: true, batchNo: l.batchNo || '', expiry: l.expiryDate || '', committed: true })
      : blank({ pid: l.productId, qty: String(l.qty), rate: String(l.rate), batchNo: l.batchNo || '', expiry: l.expiryDate || '', committed: true })
  );

/**
 * Purchase Invoice, step for step as Apna Accountant SB: Computer # (with "…" to find a saved one), Computer
 * Date, Supplier [code][name] (Search Party By City), Purchase a/c, Store Name, Memo No (the supplier's bill no.),
 * Your Date. Lines go in through ONE entry row — Code | Product Name | Unit | Packing Items | Qty | Rate |
 * Amount — and Enter on Rate puts the line into the grid (click a grid line to change it, Delete removes it).
 * Remarks, Sub Total, Discount [%] = [amount], other charges, Net Total, Paid now; Print Invoice None / Half /
 * Full; Save / Delete / Search / Cancel / Preview. Saving receives the goods, owes the supplier the bill total
 * and records the payment (context/classicActions.ts). Search loads a saved invoice here to change or delete it.
 */
export const PurchaseInvoiceModal: React.FC<{ isOpen: boolean; onClose: () => void; supplierId?: string | null; editId?: string | null; onSaved: (id: string) => void; onOpen: (id: string) => void; onEdit?: (id: string) => void; onNew?: () => void }> = ({ isOpen, onClose, supplierId: preset, editId, onSaved, onOpen, onEdit, onNew }) => {
  const { products, suppliers, godowns, createPurchaseInvoice, editPurchaseInvoice, deletePurchaseInvoice, previewPurchaseInvoiceNumber, purchaseInvoices, setPrintRequest, purchases, settings, customAccounts, can, purchaseInvoiceEditBlock } = useTrading();
  const [editInv] = useState(() => (editId ? purchaseInvoices.find((p) => p.id === editId) : undefined));
  const [supplierId, setSupplierId] = useState(editInv?.supplierId || preset || '');
  const [date, setDate] = useState(editInv?.date || todayISO());
  const [memo, setMemo] = useState(editInv?.memoNo || '');
  const [godownId, setGodownId] = useState(editInv?.godownId || godowns[0]?.id || '');
  const [lines, setLines] = useState<Line[]>(() => [...(editInv ? linesFrom(editInv) : []), blank()]);
  const [activeKey, setActiveKey] = useState(() => lines[lines.length - 1].key);
  const [discPct, setDiscPct] = useState(editInv?.discountPct ? String(editInv.discountPct) : '');
  const [discAmt, setDiscAmt] = useState(editInv && !editInv.discountPct && editInv.discountAmount ? String(editInv.discountAmount) : '');
  const [charges, setCharges] = useState(editInv?.otherCharges ? String(editInv.otherCharges) : '');
  const [remarks, setRemarks] = useState(editInv?.remarks || '');
  const [paid, setPaid] = useState(editInv?.paidAmount ? String(editInv.paidAmount) : '');
  const [method, setMethod] = useState(editInv?.paidMethod || 'Cash');
  const [printChoice, setPrintChoiceState] = useState<PrintChoice>(() => {
    const c = loadPrintChoice('purchase');
    return c === 'mini' ? 'full' : c;
  });
  const setPrintChoice = (c: PrintChoice) => { setPrintChoiceState(c); savePrintChoice('purchase', c); };
  const [find, setFind] = useState('');
  const [partySearch, setPartySearch] = useState<{ text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);

  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const productOptions: PickOption[] = useMemo(() => sortedProducts.map((p) => ({ value: p.id, name: p.name, code: p.code, barcode: p.barcode })), [sortedProducts]);
  const sortedSuppliers = useMemo(() => [...suppliers].sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name)), [suppliers]);
  const supplierOptions: PickOption[] = useMemo(() => sortedSuppliers.map((s) => ({ value: s.id, name: s.company || s.name, code: s.code, extra: s.phone })), [sortedSuppliers]);
  const supplier = suppliers.find((s) => s.id === supplierId);
  const cities = useMemo(() => allCities(settings, [], suppliers), [settings, suppliers]);
  const purchaseAc = useMemo(() => mergeAccounts(customAccounts).find((a) => a.code === ACC.INVENTORY), [customAccounts]);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  /** A picked item fills the rate from its cost price (per pack when the line is in packs). */
  const pick = (key: number, pid: string) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const p = products.find((x) => x.id === pid);
        const inPack = Boolean(p && hasPack(p) && l.inPack);
        const suggest = (x: typeof p, packed: boolean) => {
          const base = x?.costPricePerKg && x.costPricePerKg > 0 ? x.costPricePerKg : 0;
          return base ? String(round4(packed && x && hasPack(x) ? base * x.packSize! : base)) : '';
        };
        // Another item picked on the line: its cost price replaces the one filled in for the old item
        // (a pouch's Rs. 450 must not stay on a 16 L tin). A rate the user typed is kept.
        const old = products.find((x) => x.id === l.pid);
        const autoRate = !l.rate || (old ? l.rate === suggest(old, l.inPack) : false);
        return { ...l, pid, inPack, rate: autoRate ? suggest(p, inPack) || l.rate : l.rate };
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
  const qtyTotal = round4(used.reduce((a, l) => a + l.typedQty, 0));
  const paidNow = num(paid);
  const balance = Math.round((totals.total - paidNow) * 100) / 100;
  const number = editInv ? editInv.invoiceNumber : previewPurchaseInvoiceNumber(date);

  const entryIdx = Math.max(0, calc.findIndex((l) => l.key === activeKey));
  const entry = calc[entryIdx] || calc[calc.length - 1];
  /** The entry row's fields as typed (calc's qty / rate are per base unit). */
  const entryRaw = lines.find((l) => l.key === entry.key) || lines[lines.length - 1];
  const n = entryIdx + 1;
  const editingLine = entry.committed;
  const newLineOf = (ls: Line[]) => ls.find((l) => !l.committed) || ls[ls.length - 1];
  useEffect(() => {
    if (!lines.some((l) => l.key === activeKey)) setActiveKey(newLineOf(lines).key);
  }, [lines, activeKey]);

  const submit = () => {
    if (busy.current) return;
    setError('');
    if (!supplierId) return setError('Pick the supplier.');
    if (used.length === 0) return setError('Add at least one item.');
    busy.current = true;
    const input = {
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
    };
    const r = editInv ? editPurchaseInvoice(editInv.id, input) : createPurchaseInvoice(input);
    if (!r.success || !r.invoice) {
      busy.current = false;
      return setError(r.message);
    }
    onSaved(r.invoice.id);
    const paper = paperOf(printChoice);
    if (paper && paper !== 'thermal80') setPrintRequest({ type: 'purchase_invoice', id: r.invoice.id, paper });
  };

  /** Search: load a saved purchase invoice into this form to change or delete it. */
  const search = () => {
    const hit = findPurchaseInvoice<PurchaseInvoice>(purchaseInvoices, find);
    if (!hit) return setError(`No purchase invoice “${find.trim()}”. Type our number (e.g. P-12) or the supplier’s bill no.`);
    // Can't be changed (a supplier bill on the goods, closed period, no permission): say why, stay here.
    const why = purchaseInvoiceEditBlock(hit.id);
    if (why) return setError(`${hit.invoiceNumber} cannot be opened for changes: ${why}`);
    if (onEdit) onEdit(hit.id);
    else onOpen(hit.id);
  };
  const doDelete = () => {
    if (!editInv) return;
    const r = deletePurchaseInvoice(editInv.id);
    setConfirmDelete(false);
    if (!r.success) return setError(r.message);
    onClose();
    onNew?.();
  };
  const doPreview = () => {
    if (editInv) setPrintRequest({ type: 'purchase_invoice', id: editInv.id, paper: paperOf(printChoice) === 'a5' ? 'a5' : 'a4' });
    else setPreview(true);
  };

  // ---- Keyboard: Enter moves to the next field, like the old desktop program and the sale invoice ----
  const box = useRef<HTMLDivElement>(null);
  /** A field to focus once it is on screen (a new line needs one render first). */
  const pendingFocus = useRef<string | null>(null);
  const focusSel = (sel: string) => {
    const el = box.current?.querySelector<HTMLElement>(sel);
    if (!el) return false;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return true;
  };
  const focusId = (fid: string) => focusSel(`#${fid}`);
  useEffect(() => {
    if (pendingFocus.current && focusSel(pendingFocus.current)) pendingFocus.current = null;
  });
  const focusSoon = (sel: string) => {
    pendingFocus.current = sel;
    setTimeout(() => { if (pendingFocus.current === sel && focusSel(sel)) pendingFocus.current = null; }, 0);
  };
  /** Enter on Rate: the entry row goes into the grid and clears (cursor back to Code). */
  const commitEntry = () => {
    if (!entry.pid) {
      if (editingLine) setActiveKey(newLineOf(lines).key);
      focusSoon('#pi-code');
      return false;
    }
    if (editingLine) setActiveKey(newLineOf(lines).key);
    else {
      const next = blank();
      setLines((ls) => [...ls.map((l) => (l.key === entry.key ? { ...l, committed: true } : l)), next]);
      setActiveKey(next.key);
    }
    focusSoon('#pi-code');
    return true;
  };
  const loadLine = (key: number) => {
    if (key === activeKey) return;
    if (!editingLine && entry.pid) setLines((ls) => [...ls.map((l) => (l.key === entry.key ? { ...l, committed: true } : l)), blank()]);
    setActiveKey(key);
    focusSoon('#pi-qty');
  };
  const removeLine = (key: number) =>
    setLines((ls) => {
      const left = ls.filter((l) => l.key !== key);
      return left.some((l) => !l.committed) ? left : [...left, blank()];
    });
  /** After the item lines: the discount. */
  const toTotals = () => focusId('pi-disc-pct');
  const lineCodeEnter = (r: 'found' | 'empty' | 'miss') => {
    if (r === 'found') return void focusId('pi-qty');
    if (r === 'empty') {
      // An empty code: pick by name instead, or (after the lines) finish the list.
      if (!entry.pid && lines.some((l) => l.committed && l.pid)) return void toTotals();
      return void focusId('pi-item');
    }
  };

  /** Enter → next field; Ctrl+Enter / F9 → save; "+" in Qty / Rate or Alt+N → line into the grid. */
  const onKeys = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'F9') {
      e.preventDefault();
      submit();
      return;
    }
    const t = e.target as HTMLElement;
    const tag = t.tagName;
    const isNumber = tag === 'INPUT' && (t as HTMLInputElement).type === 'number';
    if ((e.altKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) || (e.key === '+' && isNumber && t.closest('[data-pi-entry]'))) {
      e.preventDefault();
      commitEntry();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || tag === 'TEXTAREA' || tag === 'BUTTON' || !box.current) return;
    const nav = t.getAttribute('data-nav');
    if (!nav) return;
    const navs = (Array.from(box.current.querySelectorAll('[data-nav]')) as HTMLElement[]).filter((x) => x === t || (x.offsetParent !== null && !(x as HTMLInputElement).disabled));
    const at = navs.indexOf(t);
    if (at < 0) return;
    e.preventDefault();
    if (nav === 'item' && !(t as HTMLSelectElement).value && lines.some((l) => l.committed && l.pid)) return void toTotals();
    if (nav === 'rate' || nav === 'expiry') {
      // Enter on the rate puts the line in (a batch item's batch no. / expiry sit under the row; empty = automatic).
      commitEntry();
      return;
    }
    if (nav === 'method') return;
    const next = navs[at + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement) next.select();
    }
  };
  const partyKeys = (e: React.KeyboardEvent): boolean => {
    if (e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      setPartySearch({ text: '' });
      return true;
    }
    return false;
  };

  const footer = (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 flex-1 min-w-0">
        <div role="radiogroup" aria-label="Print Invoice" className="inline-flex items-center gap-1 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-1 text-xs font-bold">
          <span className="px-1.5 text-[10px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Print</span>
          {PRINT_OPTS.map((c) => (
            <label key={c.id} title={c.hint} className={`px-2.5 py-1.5 rounded-xl cursor-pointer ${printChoice === c.id ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : 'text-[#6B7280] dark:text-[#94A3B8]'}`}>
              <input type="radio" name="print-purchase" value={c.id} checked={printChoice === c.id} onChange={() => setPrintChoice(c.id)} className="sr-only" aria-label={c.label} />
              {c.label}
            </label>
          ))}
        </div>
        <span className="text-sm">
          <span className="text-[#6B7280] dark:text-[#94A3B8]">Net Total </span>
          <span className="tabular-nums font-extrabold text-lg text-[#111827] dark:text-white" data-testid="pi-total">{rs(totals.total)}</span>
        </span>
        <span className="hidden xl:inline-flex items-center gap-1 text-[10px] text-[#8E9299]" title="Enter: next field • Enter on Rate: line in • Ctrl+Enter or F9: save • F2 in Supplier: search party"><Keyboard className="w-3 h-3" /> Enter next • F9 save • F2 party</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={submit} className={primaryBtn}><Save className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save</button>
        <button type="button" onClick={() => setConfirmDelete(true)} disabled={!editInv || !can('delete_records')} className={dangerBtn} title={editInv ? `Delete ${editInv.invoiceNumber}` : 'Open a saved invoice (Search) to delete it'}><Trash2 className="w-4 h-4" /> Delete</button>
        <button type="button" onClick={() => focusId('pi-search')} className={secondaryBtn}><Search className="w-4 h-4" /> Search</button>
        <button type="button" onClick={onClose} className={secondaryBtn}><X className="w-4 h-4" /> Cancel</button>
        <button type="button" onClick={doPreview} className={secondaryBtn}><Eye className="w-4 h-4" /> Preview</button>
      </div>
    </div>
  );

  const readBox = 'rounded-2xl border border-dashed border-[#E5E5E1] dark:border-[#203248] px-3 py-2 text-sm min-h-11 flex items-center';
  const hdr = 'text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]';
  const small = 'block text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1';
  const ep = entry.p;
  const unitWord = ep ? (entry.pack > 1 ? ep.packName! : ep.unit || 'pcs') : '';
  const packing = (l: (typeof calc)[number]) => (l.p && hasPack(l.p) ? (l.pack > 1 ? `${l.p.packSize} ${l.p.unit || 'pcs'}/${l.p.packName}${l.typedQty > 0 ? ` = ${formatPackQty(l.qty, l.p, 'short')}` : ''}` : `${l.p.packSize}/${l.p.packName}`) : '');
  const lastBought = ep ? purchases.filter((x) => x.productId === ep.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0] : undefined;
  const committed = calc.map((l, i) => ({ l, i })).filter(({ l }) => l.committed);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={editInv ? `Purchase Invoice — change ${editInv.invoiceNumber}` : 'Purchase Invoice'} subtitle={editInv ? 'Change it and Save (same number), or Delete it.' : 'Enter the supplier’s bill: the goods go into stock and the supplier is owed the bill total.'} xwide footer={footer}>
        <div className="space-y-4" onKeyDown={onKeys} data-testid="purchase-invoice-form" ref={box}>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div>
              <span className={labelCls}>Computer #</span>
              <div className="flex gap-1">
                <div className={`${readBox} flex-1 font-bold tabular-nums text-[#111827] dark:text-white`} data-testid="pi-number" title="Given automatically when you save">{number}</div>
                <button type="button" onClick={() => focusId('pi-search')} className={`${secondaryBtn} !px-2.5 shrink-0`} aria-label="Find a saved purchase invoice"><MoreHorizontal className="w-4 h-4" /></button>
              </div>
            </div>
            <div>
              <span className={labelCls}>Computer Date</span>
              <div className={`${readBox} text-[#111827] dark:text-white`}>{formatDate(editInv ? editInv.createdAt.slice(0, 10) : todayISO())}</div>
            </div>
            <div className="col-span-2">
              <label className={labelCls} htmlFor="pi-search">Search old invoice</label>
              <div className="flex gap-2">
                <input id="pi-search" data-skip-autofocus value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); search(); } }} className={inputCls} placeholder="P-12 or supplier bill no." />
                <button type="button" onClick={search} className={`${secondaryBtn} shrink-0`} aria-label="Search purchase invoice"><Search className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelCls} htmlFor="pi-supplier">Supplier</label>
              <div className="flex flex-wrap gap-2">
                <CodeBox id="pi-supplier-code" label="Supplier code" items={sortedSuppliers} value={supplierId} onPick={setSupplierId} className="w-28 shrink-0" nav="supplier-code" onTypeName={(t) => setPartySearch({ text: t })} onKeyDownExtra={partyKeys} onEnterResult={(r) => { if (r === 'found') focusId(godowns.length > 1 ? 'pi-godown' : 'pi-memo'); else if (r === 'empty') focusId('pi-supplier'); }} />
                <div className="flex-1 min-w-[11rem]" onKeyDown={partyKeys}>
                  <QuickSelect id="pi-supplier" data-nav="supplier" value={supplierId} options={supplierOptions} onPick={setSupplierId} className={inputCls} title="Type a name or code to find the supplier (F2: search party by city)">
                    <option value="">Select supplier…</option>
                    {sortedSuppliers.map((s) => <option key={s.id} value={s.id}>{s.company || s.name}</option>)}
                  </QuickSelect>
                </div>
                <button type="button" onClick={() => setPartySearch({ text: '' })} className={`${secondaryBtn} shrink-0 !px-3`} aria-label="Search party by city" title="Search Party By City (F2)"><Search className="w-4 h-4" /></button>
              </div>
              {supplier && <p className="mt-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8]" data-testid="pi-supplier-balance">You owe them <strong className="tabular-nums">{rs(supplier.totalOwed)}</strong> now • <strong className="tabular-nums">{rs(supplier.totalOwed + balance - (editInv && editInv.supplierId === supplier.id ? editInv.totalAmount - editInv.paidAmount : 0))}</strong> after this bill</p>}
            </div>
            <div className="col-span-2">
              <span className={labelCls}>Purchase a/c</span>
              <div className="flex gap-2" title="Goods bought go into stock at cost; they reach cost of sales when sold">
                <div className={`${readBox} w-28 shrink-0 font-mono`} data-testid="pi-purchase-ac-code">{ACC.INVENTORY}</div>
                <div className={`${readBox} flex-1 min-w-0`}>{purchaseAc?.name || 'Inventory (stock at cost)'}</div>
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="pi-godown">Store Name</label>
              <select id="pi-godown" data-nav="godown" value={godownId} onChange={(e) => setGodownId(e.target.value)} className={inputCls} disabled={godowns.length < 2}>
                {godowns.length === 0 && <option value="">Main store</option>}
                {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="pi-memo" title="The supplier’s own bill number">Memo No</label>
              <input id="pi-memo" data-nav="memo" aria-label="Memo No (supplier bill no.)" value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} placeholder="e.g. 4471" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls} htmlFor="pi-date">Your Date</label>
              <input id="pi-date" data-skip-autofocus type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* ---- Entry row ---- */}
          <div>
            <div className={`hidden lg:grid ${PI_COLS} gap-2 px-1 mb-1 ${hdr}`}>
              <div>Code</div>
              <div>Product Name</div>
              <div>Unit</div>
              <div>Packing Items</div>
              <div>Qty</div>
              <div>Rate</div>
              <div className="text-right">Amount</div>
            </div>
            <div data-pi-entry data-testid="pi-entry" className={`grid grid-cols-12 ${PI_COLS} gap-2 items-start rounded-2xl border-2 ${editingLine ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20' : 'border-teal-200 dark:border-teal-900 bg-teal-50/30 dark:bg-teal-950/10'} p-2`}>
              <div className="col-span-4 sm:col-span-3 lg:col-auto min-w-0">
                <span className={`lg:hidden ${small}`}>Code</span>
                <CodeBox key={entry.key} id="pi-code" label={`Product code ${n}`} items={sortedProducts} value={entry.pid} onPick={(v) => pick(entry.key, v)} nav="code" onEnterResult={lineCodeEnter} />
              </div>
              <div className="col-span-8 sm:col-span-9 lg:col-auto min-w-0">
                <span className={`lg:hidden ${small}`}>Product Name</span>
                <QuickSelect id="pi-item" data-nav="item" aria-label={`Product ${n}`} value={entry.pid} options={productOptions} onPick={(v) => pick(entry.key, v)} className={inputCls} title={ep ? ep.name : 'Type the product name or code'}>
                  <option value="">Product…</option>
                  {sortedProducts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </QuickSelect>
              </div>
              <div className="col-span-6 sm:col-span-3 lg:col-auto min-w-0">
                <span className={`lg:hidden ${small}`}>Unit</span>
                <select id="pi-unit" aria-label={`Unit ${n}`} data-nav="unit" value={entry.inPack ? 'pack' : 'unit'} onChange={(e) => togglePack(entry.key, e.target.value === 'pack')} disabled={!ep || !hasPack(ep)} className={`${inputCls} !px-2`}>
                  <option value="unit">{ep ? ep.unit || 'pcs' : 'QTY'}</option>
                  {ep && hasPack(ep) && <option value="pack">{`${ep.packName} (${ep.packSize})`}</option>}
                </select>
              </div>
              <div className="col-span-6 sm:col-span-3 lg:col-auto min-w-0">
                <span className={`lg:hidden ${small}`}>Packing Items</span>
                <div className={`${readBox} !min-h-10 text-xs text-[#374151] dark:text-[#CBD5E1]`} data-testid="pi-packing">{packing(entry) || '—'}</div>
              </div>
              <div className="col-span-6 sm:col-span-3 lg:col-auto min-w-0">
                <label htmlFor="pi-qty" className={`lg:hidden ${small}`}>Qty{ep ? ` (${unitWord})` : ''}</label>
                <input id="pi-qty" data-nav="qty" aria-label={`Qty ${n}`} type="number" inputMode="decimal" min="0" step="any" value={entryRaw.qty} onChange={(e) => setLine(entry.key, { qty: e.target.value })} className={numInputCls} placeholder="Qty" />
              </div>
              <div className="col-span-6 sm:col-span-3 lg:col-auto min-w-0">
                <label htmlFor="pi-rate" className={`lg:hidden ${small}`}>Rate{ep ? ` per ${unitWord}` : ''}</label>
                <input id="pi-rate" data-nav="rate" aria-label={`Rate ${n}`} type="number" inputMode="decimal" min="0" step="any" value={entryRaw.rate} onChange={(e) => setLine(entry.key, { rate: e.target.value })} className={numInputCls} placeholder={ep ? `per ${unitWord}` : 'Rate'} />
              </div>
              <div className="col-span-12 sm:col-span-3 lg:col-auto min-w-0 flex items-baseline justify-between sm:justify-end gap-2 lg:block lg:text-right self-center">
                <span className={`lg:hidden ${small}`}>Amount</span>
                <span className="tabular-nums font-bold text-sm text-[#111827] dark:text-white break-all" data-testid={`pi-amount-${n}`}>{rs(entry.amount)}</span>
              </div>
              {ep?.trackBatches && (
                <div className="col-span-12 lg:col-span-full grid grid-cols-2 gap-2 min-w-0">
                  <input id="pi-batch" data-nav="batch" aria-label={`Batch no. ${n}`} value={entry.batchNo} onChange={(e) => setLine(entry.key, { batchNo: e.target.value })} className={`${inputCls} min-w-0`} placeholder="Batch no. (auto if empty)" />
                  <input id="pi-expiry" data-nav="expiry" aria-label={`Expiry ${n}`} type="date" value={entry.expiry} onChange={(e) => setLine(entry.key, { expiry: e.target.value })} className={`${inputCls} min-w-0`} />
                </div>
              )}
              {ep && (
                <div className="col-span-12 lg:col-span-full flex flex-wrap gap-x-3 text-[11px] text-[#6B7280] dark:text-[#94A3B8] px-1">
                  {entry.pack > 1 && entry.typedQty > 0 && <span>= {formatPackQty(entry.qty, ep)} at {rs(Math.round(entry.rate * 100) / 100)}/{ep.unit || 'pcs'}</span>}
                  <span>Stock in hand <strong className="tabular-nums">{formatPackQty(ep.stockKg, ep, 'short')}</strong></span>
                  {lastBought && <span>Last bought at <strong className="tabular-nums">{rs(lastBought.pricePerKg)}/{ep.unit || 'pcs'}</strong> ({formatDate(lastBought.date)})</span>}
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" onClick={commitEntry} title="Put the line in the grid (Enter on Rate, Alt+N, or + in Qty / Rate)" className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 dark:text-teal-300 hover:underline">{editingLine ? 'Update line' : 'Add another item'}</button>
              {editingLine && <button type="button" onClick={() => setActiveKey(newLineOf(lines).key)} className="text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:underline">Done with line {n}</button>}
            </div>
          </div>

          {/* ---- Grid ---- */}
          <div className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden" role="grid" aria-label="Purchase lines">
            <div role="row" className={`hidden lg:grid ${PI_GRID_COLS} gap-2 px-3 py-2 bg-[#FAF9F6] dark:bg-[#162436] ${hdr}`}>
              <div role="columnheader">Code</div>
              <div role="columnheader">Product Name</div>
              <div role="columnheader">Unit</div>
              <div role="columnheader">Packing Items</div>
              <div role="columnheader" className="text-right">Qty</div>
              <div role="columnheader" className="text-right">Rate</div>
              <div role="columnheader" className="text-right">Amount</div>
              <div />
            </div>
            {committed.length === 0 && <p className="px-3 py-3 text-xs text-[#6B7280] dark:text-[#94A3B8]">No lines yet. Type the code, Qty and Rate, then Enter.</p>}
            {committed.map(({ l, i }) => {
              const active = l.key === activeKey;
              return (
                <div
                  key={l.key}
                  role="row"
                  tabIndex={0}
                  data-testid="pi-line"
                  aria-selected={active}
                  aria-label={`Line ${i + 1}: ${l.p?.name || ''}`}
                  onClick={() => loadLine(l.key)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Delete') { e.preventDefault(); removeLine(l.key); }
                    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); loadLine(l.key); }
                  }}
                  className={`grid grid-cols-12 ${PI_GRID_COLS} gap-x-2 gap-y-0.5 items-center px-3 py-2 text-sm border-t border-[#F1F0EC] dark:border-[#1E2E40] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${active ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-[#FAF9F6] dark:hover:bg-[#162436]'}`}
                >
                  <div role="gridcell" className="col-span-3 lg:col-auto font-mono text-xs text-[#6B7280] dark:text-[#94A3B8]">{l.p?.code || '—'}</div>
                  <div role="gridcell" className="col-span-9 lg:col-auto font-semibold text-[#111827] dark:text-white truncate">{l.p?.name}{l.batchNo ? <span className="text-[11px] font-normal text-[#6B7280]"> • batch {l.batchNo}</span> : null}</div>
                  <div role="gridcell" className="col-span-3 lg:col-auto text-xs">{l.p ? (l.pack > 1 ? l.p.packName : l.p.unit || 'pcs') : ''}</div>
                  <div role="gridcell" className="col-span-9 lg:col-auto text-xs text-[#6B7280] dark:text-[#94A3B8] truncate">{packing(l)}</div>
                  <div role="gridcell" className="col-span-3 lg:col-auto text-right tabular-nums">{l.typedQty}</div>
                  <div role="gridcell" className="col-span-4 lg:col-auto text-right tabular-nums">{l.typedRate}</div>
                  <div role="gridcell" className="col-span-4 lg:col-auto text-right font-bold tabular-nums text-[#111827] dark:text-white" {...(active ? {} : { 'data-testid': `pi-amount-${i + 1}` })}>{rs(l.amount)}</div>
                  <div className="col-span-1 lg:col-auto flex justify-end">
                    <button type="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); removeLine(l.key); }} aria-label={`Remove line ${i + 1}`} className="p-1.5 rounded-xl text-[#9CA3AF] hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className={labelCls} htmlFor="pi-remarks">Remarks</label>
                <input id="pi-remarks" data-nav="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputCls} placeholder="optional" />
              </div>
              <div>
                <label className={labelCls} htmlFor="pi-charges">Other charges (Rs.)</label>
                <input id="pi-charges" data-nav="charges" type="number" inputMode="decimal" min="0" step="any" value={charges} onChange={(e) => setCharges(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0 (freight, loading on the bill)" />
              </div>
              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                <div>
                  <label className={labelCls} htmlFor="pi-paid">Paid now</label>
                  <div className="flex gap-1">
                    <input id="pi-paid" data-nav="paid" type="number" inputMode="decimal" min="0" step="any" value={paid} onChange={(e) => setPaid(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                    <button type="button" tabIndex={-1} onClick={() => setPaid(String(totals.total))} className="shrink-0 px-2.5 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-bold text-teal-700 dark:text-teal-300" title="Paid in full">Full</button>
                  </div>
                </div>
                <div>
                  <label className={labelCls} htmlFor="pi-method">Paid from</label>
                  <select id="pi-method" data-nav="method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                    {PURCHASE_PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] p-4 space-y-2 text-sm">
              <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Sub Total</span><span className="tabular-nums"><span data-testid="pi-qty-total">{qtyTotal}</span> • <span data-testid="pi-subtotal">{rs(totals.gross)}</span></span></div>
              <div className="grid grid-cols-[minmax(6.5rem,1fr)_auto_minmax(6.5rem,1.4fr)] gap-2 items-end">
                <div>
                  <label className={labelCls} htmlFor="pi-disc-pct">Discount %</label>
                  <input id="pi-disc-pct" data-nav="disc-pct" type="number" inputMode="decimal" min="0" max="100" step="any" value={discPct} onChange={(e) => { setDiscPct(e.target.value); if (e.target.value) setDiscAmt(''); }} className={`${inputCls} tabular-nums`} placeholder="0" />
                </div>
                <span className="pb-3 font-bold text-[#6B7280]">=</span>
                <div>
                  <label className={labelCls} htmlFor="pi-disc-amt">Discount (Rs.)</label>
                  <input id="pi-disc-amt" data-nav="disc-amt" type="number" inputMode="decimal" min="0" step="any" value={discPct ? String(totals.discount) : discAmt} readOnly={Boolean(discPct)} onChange={(e) => setDiscAmt(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                </div>
              </div>
              {totals.charges > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Other charges</span><span className="tabular-nums">{rs(totals.charges)}</span></div>}
              <div className="flex justify-between font-extrabold text-[#111827] dark:text-white border-t border-[#E5E5E1] dark:border-[#203248] pt-2"><span>Net Total</span><span className="tabular-nums" data-testid="pi-net-total">{rs(totals.total)}</span></div>
              <div className={`flex justify-between text-xs font-bold rounded-xl px-2.5 py-2 ${balance > 0 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200' : 'bg-teal-100 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200'}`}><span>Balance (owed to supplier)</span><span className="tabular-nums">{rs(balance)}</span></div>
              <p className="text-[10px] text-[#8E9299]">Discount and other charges are spread over the items, so stock is valued at what it really cost you. A cheque: save, then use Pay supplier.</p>
            </div>
          </div>
        </div>
      </Modal>
      <SearchPartyDialog
        isOpen={Boolean(partySearch)}
        parties={suppliers.map((s) => ({ id: s.id, code: s.code, name: s.company || s.name, city: s.city, phone: s.phone, company: s.company && s.company !== s.name ? s.name : undefined }))}
        cities={cities}
        initialText={partySearch?.text || ''}
        onClose={() => { setPartySearch(null); focusSoon('#pi-supplier-code'); }}
        onPick={(id) => { setSupplierId(id); setPartySearch(null); focusSoon('#pi-memo'); }}
      />
      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete purchase invoice ${editInv?.invoiceNumber || ''}?`}
        message="The goods come off the stock again, the supplier is owed that much less, and the payment made on it is taken back out of the cash book. The number is not used again."
        details={editInv ? [`Bill total ${rs(editInv.totalAmount)}`, `Supplier: ${editInv.supplierName}`] : []}
        confirmLabel="Delete invoice"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
      <Modal isOpen={preview} onClose={() => setPreview(false)} title="Purchase invoice preview" subtitle={`${number} • ${formatDate(date)} • not saved yet`} wide>
        <div className="space-y-3 text-sm" data-testid="pi-preview">
          <div className="flex justify-between"><span className="font-bold">{supplier ? supplier.company || supplier.name : '—'}</span><span>{memo ? `Bill no. ${memo}` : ''}</span></div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[#6B7280]"><th className="py-1">Product</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{used.map((l) => <tr key={l.key} className="border-t border-[#F1F0EC] dark:border-[#1E2E40]"><td className="py-1">{l.p?.name}</td><td className="text-right tabular-nums">{l.typedQty} {l.pack > 1 ? l.p?.packName : l.p?.unit}</td><td className="text-right tabular-nums">{l.typedRate}</td><td className="text-right tabular-nums font-bold">{rs(l.amount)}</td></tr>)}</tbody>
          </table>
          <div className="ml-auto max-w-xs space-y-1">
            <div className="flex justify-between"><span>Sub total</span><span className="tabular-nums">{rs(totals.gross)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">− {rs(totals.discount)}</span></div>}
            {totals.charges > 0 && <div className="flex justify-between"><span>Other charges</span><span className="tabular-nums">{rs(totals.charges)}</span></div>}
            <div className="flex justify-between font-bold"><span>Net total</span><span className="tabular-nums">{rs(totals.total)}</span></div>
          </div>
          <div className="flex justify-end"><button type="button" onClick={() => setPreview(false)} className={secondaryBtn}><Printer className="w-4 h-4" /> Back to the invoice</button></div>
        </div>
      </Modal>
    </>
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
              {inv.updatedAt ? ` • changed ${new Date(inv.updatedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}${inv.updatedBy ? ` by ${inv.updatedBy}` : ''}` : ''}
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
