import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Printer, Save, UserPlus, Keyboard, Gift, Search, Truck, Eye, X, FilePlus2, MoreHorizontal, Sparkles } from 'lucide-react';
import { useTrading, CreateBillItemInput } from '../../context/TradingContext';
import { Modal, inputCls, numInputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn, Notice, rs, moneyCls, bidi } from './ui';
import { BillFromAiDialog } from '../ai/BillFromAi';
import type { ParsedBill, ParsedBillLine } from '../../ai/parse';
import { CodeBox } from './CodeBox';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { creditCheck } from '../../utils/credit';
import { BillCreditPanel } from './CreditLimit';
import { planBillStock, batchLines, stockByGodown, restoreBillRows } from '../../utils/inventory';
import { lineDiscountAmount, quotationLines } from '../../utils/salesDocs';
import { customerSnapshot, lastRateFor, resolveBillPayments, PaymentPart } from '../../utils/billing';
import { hasPack, formatPackQty, baseToPacks } from '../../utils/packUnits';
import { QuickSelect, PickOption, findOption } from './QuickPick';
import { ScanButton } from './purchasing/Barcodes';
import { ChequeFieldsInput, ChequeFields, emptyChequeFields } from './ChequeForms';
import { evaluateSchemes } from '../../utils/salesExtras';
import { CostCentreSelect } from '../finance/common';
import { isPendingApproval } from '../../context/controlActions';
import { allCities } from '../../utils/vouchers';
import { useBillingUI } from './BillingUI';
import { ConfirmDialog } from '../ConfirmDialog';
import { SearchPartyDialog } from './classic/SearchPartyDialog';
import { ACC } from '../../utils/accounting';
import { LedgerGrid, LedgerColumn, TotalsLabel, fmt2, ledgerInputCls, ledgerNumCls, ledgerSelectCls } from './classic/LedgerGrid';
import { paymentNo } from '../../utils/paymentNumbers';
import { PRINT_CHOICES, PrintChoice, loadPrintChoice, paperOf, paymentAccounts, paymentsFromGrid, saleAccounts, savePrintChoice } from '../../utils/saleInvoice';

/** After Save, open the next new bill (the default). Automated tests written for the old behaviour turn it off. */
const openNextBillAfterSave = (): boolean => {
  try {
    return localStorage.getItem('sarmaya_bill_after_save') !== 'close';
  } catch {
    return true;
  }
};

/** Find an old bill by its number: exact (INV-12, S-14726) or just the digits (12). */
export const findBillByNumber = (bills: { id: string; invoiceNumber: string }[], typed: string): { id: string; invoiceNumber: string } | undefined => {
  const q = typed.trim().toLowerCase();
  if (!q) return undefined;
  return bills.find((b) => b.invoiceNumber.toLowerCase() === q) || (/^\d+$/.test(q) ? bills.find((b) => (b.invoiceNumber.match(/(\d+)\s*$/) || [])[1] === String(Number(q))) : undefined);
};

interface Row {
  key: string;
  productId: string;
  qty: string;
  price: string;
  /** Qty and price are typed per pack (e.g. per carton) instead of per base unit ("Unit" = the pack). */
  inPack: boolean;
  /** Where the price came from: the item's list price, the customer's agreed rate, or typed in. */
  priceFrom: 'list' | 'customer' | 'typed';
  discType: 'rs' | 'pct';
  disc: string;
  desc: string;
  /** In the grid (Enter on the entry row put it there). The one line that is not is the entry row. */
  committed: boolean;
  /** Filled by "AI: from photo / message": what was written, and whether the user should check it. */
  ai?: { written: string; check: boolean };
}
/** A change to the item, qty or price of an AI line means the user has looked at it. */
const aiSeen = (r: Row, patch: Partial<Row>): Partial<Row> => (r.ai?.check && ('productId' in patch || 'qty' in patch || 'price' in patch) ? { ai: { ...r.ai, check: false } } : {});

const newRow = (patch: Partial<Row> = {}): Row => ({ key: Math.random().toString(36).slice(2), productId: '', qty: '1', price: '', inPack: false, priceFrom: 'list', discType: 'rs', disc: '', desc: '', committed: false, ...patch });

interface PayRow {
  key: string;
  code: string;
  amount: string;
  note: string;
  committed: boolean;
}
const newPay = (patch: Partial<PayRow> = {}): PayRow => ({ key: Math.random().toString(36).slice(2), code: ACC.CASH, amount: '', note: '', committed: false, ...patch });

const num4 = (n: number) => String(Math.round(n * 10000) / 10000);
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Code | Product Name | Unit | Description | Qty | Rate | Amount | Disc | Net Amount — entry row and grid alike. */
const ITEM_DISC_KEY = 'sarmaya_item_discount';
const LINE_COLUMNS: LedgerColumn[] = [
  { key: 'code', label: 'Code', width: '6rem' },
  { key: 'name', label: 'Product Name', width: 'minmax(10rem,1.6fr)' },
  { key: 'unit', label: 'Unit', width: '6.5rem' },
  { key: 'desc', label: 'Description', width: 'minmax(3rem,1fr)' },
  { key: 'qty', label: 'Qty', width: '6.75rem', numeric: true },
  { key: 'rate', label: 'Rate', width: '8rem', numeric: true },
  { key: 'amount', label: 'Amount', width: '7.25rem', numeric: true },
  { key: 'disc', label: 'Disc', width: '8.5rem', numeric: true },
  { key: 'net', label: 'Net Amount', width: '8rem', numeric: true },
  { key: 'act', label: <span className="sr-only">Remove</span>, width: '2.25rem', align: 'center' },
];
/** Payment Method: Code | Title | Debit | Narration against cash / bank accounts. */
const LINE_COLUMNS_NO_DISC = LINE_COLUMNS.filter((c) => c.key !== 'disc');
const PAY_COLUMNS: LedgerColumn[] = [
  { key: 'code', label: 'Code', width: '6rem' },
  { key: 'title', label: 'Title', width: 'minmax(10rem,1fr)' },
  { key: 'debit', label: 'Debit', width: '9rem', numeric: true },
  { key: 'narration', label: 'Narration', width: 'minmax(7rem,1fr)' },
  { key: 'act', label: <span className="sr-only">Remove</span>, width: '2.25rem', align: 'center' },
];
/** Money already received on a bill being edited, with its receipt number. */
const SAVED_PAY_COLUMNS: LedgerColumn[] = [
  { key: 'receipt', label: 'Receipt #', width: '6.5rem' },
  { key: 'code', label: 'Code', width: '4.5rem' },
  { key: 'title', label: 'Title', width: 'minmax(8rem,1fr)' },
  { key: 'debit', label: 'Debit', width: '8rem', numeric: true },
  { key: 'narration', label: 'Narration', width: 'minmax(6rem,1fr)' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-pick a customer (from the customer screen). */
  customerId?: string | null;
  /** Fill the bill from this quotation ("Convert to bill"). */
  quotationId?: string | null;
  /** Edit this saved bill (same number) instead of making a new one. */
  editInvoiceId?: string | null;
  /** After an edit is saved (the bill detail reopens). */
  onEdited?: (invoiceId: string) => void;
  /** 'cash' = the Cash Sale Invoice: walk-in customer allowed, paid in full in cash, no Payment Method grid. */
  mode?: 'sale' | 'cash';
  /** Open "AI: from photo / message" at once (menu option / Find anything "AI"). */
  startWithAi?: boolean;
}

/** A saved bill's sold lines as grid rows (per pack when it was sold per pack). */
const rowsFromBill = (items: import('../../types').InvoiceItem[]): Row[] =>
  items.filter((it) => !it.free && (it.qty ?? 0) > 0).map((it) => {
    const qty = it.qty ?? it.kg;
    const price = it.unitPrice ?? it.ratePerKg;
    const disc = (it.discountAmount || 0) > 0 && it.discountType ? { discType: it.discountType, disc: String(it.discountValue ?? '') } : {};
    const from: Row['priceFrom'] = it.customerRate ? 'customer' : 'typed';
    const desc = it.description || '';
    if (it.packPrice != null && (it.packSize || 0) > 1) return newRow({ productId: it.productId, qty: num4(baseToPacks(qty, it.packSize!)), price: String(it.packPrice), inPack: true, priceFrom: from, desc, committed: true, ...disc });
    return newRow({ productId: it.productId, qty: String(qty), price: String(price), priceFrom: from, desc, committed: true, ...disc });
  });

/**
 * Sale Invoice, step for step as Apna Accountant SB (our look): Computer # / date, Delivery Order, Customer
 * [code][name], Sale a/c, Store, Stock in Hand; Party Balance, Memo No, Your Date, Disc % on the right. Items go
 * in through ONE entry row (Code | Product | Unit | Description | Qty | Rate | Amount | Disc | Net); Enter moves
 * across it and Enter on Rate (or Disc) puts the line into the grid and clears the row for the next one. A grid
 * line clicked (or Enter on it) comes back into the entry row; Delete removes it. Payment Method grid below
 * (Code | Title | Debit | Narration against cash / bank accounts), totals, Print Invoice None / Half / Full /
 * Mini, and Save / Delete / Search / Preview / Close. Ctrl+Enter or F9 saves.
 *
 * The Cash Sale Invoice (mode 'cash') is the same screen for a walk-in: customer optional, a free-text name,
 * paid in full in cash, no Payment Method grid.
 */
export const NewBillModal: React.FC<Props> = ({ isOpen, onClose, customerId, quotationId, editInvoiceId, onEdited, mode = 'sale', startWithAi }) => {
  const { customers, products: liveProducts, settings, createBill, editBill, setPrintRequest, can, godowns, stockBatches: liveBatches, quotations, getCustomerAgreedRate, invoices, ledger, salesmen, areas, schemes, billApprovalReasons, approvalRules, canApprove, previewDocNumber, customAccounts, deleteBill, billDeleteNeedsApproval, billEditBlock, currentUser } = useTrading();
  const ui = useBillingUI();
  // Editing a saved bill: the form starts from it, and its own stock counts as back on the shelf.
  const [editInv] = useState(() => (editInvoiceId ? invoices.find((i) => i.id === editInvoiceId) : undefined));
  const cash = editInv ? Boolean(editInv.cashSale) : mode === 'cash';
  const products = useMemo(() => {
    if (!editInv) return liveProducts;
    return liveProducts.map((p) => {
      const q = editInv.items.filter((it) => it.productId === p.id && it.qty != null).reduce((a, it) => a + (it.qty || 0), 0);
      return q > 0 ? { ...p, stockKg: Math.round((p.stockKg + q) * 10000) / 10000 } : p;
    });
  }, [liveProducts, editInv]);
  const stockBatches = useMemo(() => (editInv ? restoreBillRows(liveBatches, editInv.items, godowns, todayISO()) : liveBatches), [liveBatches, editInv, godowns]);
  const [memoNo, setMemoNo] = useState(editInv?.memoNo || '');
  const [deliveryOrder, setDeliveryOrder] = useState(Boolean(editInv?.delivery));
  const [find, setFind] = useState('');
  // Set once the bill was sent to a manager (approval rules): nothing is posted until approved.
  const [sentForApproval, setSentForApproval] = useState('');
  const quote = quotationId ? quotations.find((q) => q.id === quotationId) : undefined;
  const [godownId, setGodownId] = useState(editInv?.items.find((it) => it.godownId)?.godownId || godowns[0]?.id || '');
  const walkInCustomer = editInv && editInv.cashSale && editInv.customerName === 'Cash Sale';
  const [customer, setCustomer] = useState(walkInCustomer ? '' : editInv?.customerId || quote?.customerId || customerId || '');
  const [walkIn, setWalkIn] = useState(editInv?.walkInName || '');
  // Salesman and area on the bill start as the customer's defaults (can be changed per bill).
  const startCust = customers.find((c) => c.id === (quote?.customerId || customerId || ''));
  const [salesmanId, setSalesmanId] = useState(editInv ? editInv.salesmanId || '' : startCust?.salesmanId || '');
  const [areaId, setAreaId] = useState(editInv ? editInv.areaId || '' : startCust?.areaId || '');
  const [freight, setFreight] = useState(editInv?.freightCharges ? String(editInv.freightCharges) : '');
  // Scheme lines / scheme discounts the shopkeeper took off this bill.
  const [dropped, setDropped] = useState<Set<string>>(() => new Set());
  const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [date, setDate] = useState(editInv?.issueDate || todayISO());
  const [saleAc, setSaleAc] = useState(editInv?.saleAccountCode || ACC.SALES);
  const [billPct, setBillPct] = useState('');
  // Grid lines plus the entry row (the one line not yet committed, always last).
  const [rows, setRows] = useState<Row[]>(() => [
    ...(editInv
      ? rowsFromBill(editInv.items)
      : quote
      ? quotationLines(quote, (id) => products.find((p) => p.id === id)?.name).map((l) =>
          // A line quoted per carton comes onto the bill per carton too.
          l.packPrice != null && (l.packSize || 0) > 1 && hasPack(products.find((p) => p.id === l.productId))
            ? newRow({ productId: l.productId, qty: num4(baseToPacks(l.qty, l.packSize!)), price: String(l.packPrice), inPack: true, priceFrom: 'typed', committed: true })
            : newRow({ productId: l.productId, qty: String(l.qty), price: String(l.unitPrice), priceFrom: 'typed', committed: true })
        )
      : []),
    newRow(),
  ]);
  /** The line shown in the entry row: the new line, or a grid line being changed. */
  const [activeKey, setActiveKey] = useState(() => rows[rows.length - 1].key);
  const [lumsumPct, setLumsumPct] = useState('');
  const [vehicle, setVehicle] = useState(editInv?.handlingCharges ? String(editInv.handlingCharges) : '');
  // This shop gives one lumsum discount on the bill, not a discount per item: the per-item Disc column and the
  // header Disc % stay hidden unless turned on here (remembered on this device) or the bill already uses them.
  const [itemDiscOn, setItemDiscOn] = useState(() => {
    try {
      return localStorage.getItem(ITEM_DISC_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [discount, setDiscount] = useState(editInv?.discount ? String(editInv.discount) : '');
  const [payRows, setPayRows] = useState<PayRow[]>(() => [newPay()]);
  const [activePay, setActivePay] = useState(() => payRows[0].key);
  const [cheque, setCheque] = useState<ChequeFields>(emptyChequeFields());
  const [notes, setNotes] = useState(editInv ? editInv.notes || '' : quote ? `From quotation ${quote.quoteNumber}` : '');
  const [costCentre, setCostCentre] = useState(editInv?.costCentreId || '');
  const [printChoice, setPrintChoiceState] = useState<PrintChoice>(() => loadPrintChoice(cash ? 'cash-sale' : 'sale'));
  const setPrintChoice = (c: PrintChoice) => { setPrintChoiceState(c); savePrintChoice(cash ? 'cash-sale' : 'sale', c); };
  const [partySearch, setPartySearch] = useState<{ text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [allowOver, setAllowOver] = useState(false);
  const [overReason, setOverReason] = useState('');
  // AI: from photo / message. Nothing is saved: the lines go into the grid for the user to check.
  const [aiOpen, setAiOpen] = useState(Boolean(startWithAi));
  const [aiUnmatched, setAiUnmatched] = useState<ParsedBillLine[]>([]);
  const [aiInfo, setAiInfo] = useState('');
  const busy = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const allowNegative = settings.allowNegativeStock !== false;

  const cityList = useMemo(() => allCities(settings, customers, []), [settings, customers]);
  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const customerOptions: PickOption[] = useMemo(() => sortedCustomers.map((c) => ({ value: c.id, name: c.name, code: c.code, extra: [c.phone, c.city].filter(Boolean).join(' ') })), [sortedCustomers]);
  const productOptions: PickOption[] = useMemo(() => sortedProducts.map((p) => ({ value: p.id, name: p.name, code: p.code, barcode: p.barcode })), [sortedProducts]);
  const saleAccs = useMemo(() => saleAccounts(customAccounts), [customAccounts]);
  const payAccs = useMemo(() => paymentAccounts(settings, customAccounts), [settings, customAccounts]);

  // ---- Focus after a change (a new line needs one render first) ----
  const pendingFocus = useRef<string | null>(null);
  const focusIn = (selector: string): boolean => {
    const el = box.current?.querySelector<HTMLElement>(selector);
    if (!el) return false;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return true;
  };
  useEffect(() => {
    if (pendingFocus.current && focusIn(pendingFocus.current)) pendingFocus.current = null;
  });
  const focusSoon = (selector: string) => {
    pendingFocus.current = selector;
    setTimeout(() => { if (pendingFocus.current === selector && focusIn(selector)) pendingFocus.current = null; }, 0);
  };

  const setRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, ...aiSeen(r, patch) } : r)));
  /** Price per base unit for an item: the customer's agreed rate when there is one, else the item's list price. */
  const priceFor = (productId: string, custId: string): { base: number | null; priceFrom: Row['priceFrom'] } => {
    const p = products.find((x) => x.id === productId);
    const agreed = custId && productId ? getCustomerAgreedRate(custId, productId) : null;
    if (agreed != null) return { base: agreed, priceFrom: 'customer' };
    return { base: p ? p.unitPricePerKg : null, priceFrom: 'list' };
  };
  /** The price shown on a line: per pack when the line is typed in packs (pack price = pack size × unit price). */
  const shownPrice = (productId: string, base: number | null, inPack: boolean): string => {
    if (base == null) return '';
    const p = products.find((x) => x.id === productId);
    return inPack && hasPack(p) ? num4(base * p.packSize) : String(base);
  };
  const pickProduct = (key: string, productId: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const p = products.find((x) => x.id === productId);
        const inPack = r.inPack && hasPack(p);
        const { base, priceFrom } = priceFor(productId, newCustomer ? '' : customer);
        return { ...r, productId, inPack, price: shownPrice(productId, base, inPack), priceFrom, ...aiSeen(r, { productId }) };
      })
    );
  // Changing the customer re-prices lines the shopkeeper has not typed a price into.
  const pickCustomer = (custId: string) => {
    setCustomer(custId);
    const c = customers.find((x) => x.id === custId);
    setSalesmanId(c?.salesmanId || '');
    setAreaId(c?.areaId || '');
    setRows((prev) => prev.map((r) => {
      if (!r.productId || r.priceFrom === 'typed') return r;
      const { base, priceFrom } = priceFor(r.productId, custId);
      return { ...r, price: shownPrice(r.productId, base, r.inPack), priceFrom };
    }));
  };
  /** Unit dropdown: the item's own unit or its pack (carton); qty and price are converted so the amount stays the same. */
  const setUnit = (key: string, toPack: boolean) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key || r.inPack === toPack) return r;
        const p = products.find((x) => x.id === r.productId);
        if (!hasPack(p)) return r;
        const q = parseFloat(r.qty);
        const pr = parseFloat(r.price);
        return {
          ...r,
          inPack: toPack,
          qty: Number.isFinite(q) ? num4(toPack ? baseToPacks(q, p.packSize) : q * p.packSize) : r.qty,
          price: Number.isFinite(pr) ? num4(toPack ? pr * p.packSize : pr / p.packSize) : r.price,
        };
      })
    );

  const entry = rows.find((r) => r.key === activeKey) || rows[rows.length - 1];
  const entryIdx = rows.indexOf(entry);
  /** Number the entry row's fields carry (Item 3, Quantity 3…): the line it is, or will become. */
  const n = entryIdx + 1;
  const editingLine = entry.committed;
  const newRowOf = (list: Row[]) => list.find((r) => !r.committed) || list[list.length - 1];

  /** Enter on the last field: the entry row goes into the grid and clears for the next line (focus back to Code). */
  const commitEntry = (focus: 'code' | 'item' = 'code') => {
    const r = entry;
    if (!r.productId) {
      if (editingLine) setActiveKey(newRowOf(rows).key);
      return false;
    }
    if (!((parseFloat(r.qty) || 0) > 0)) {
      setError(`Enter the quantity of ${products.find((p) => p.id === r.productId)?.name || 'the item'}.`);
      focusSoon('[data-entry] [data-nav="qty"]');
      return false;
    }
    let next: Row;
    if (editingLine) {
      next = newRowOf(rows);
      setActiveKey(next.key);
    } else {
      next = newRow();
      setRows((prev) => [...prev.map((x) => (x.key === r.key ? { ...x, committed: true } : x)), next]);
      setActiveKey(next.key);
    }
    focusSoon(focus === 'code' ? '[data-entry] [data-code]' : '[data-entry] [data-nav="item"]');
    return true;
  };
  /** A grid line back into the entry row (the line being typed goes into the grid first). */
  const loadLine = (key: string) => {
    if (key === activeKey) return;
    if (!editingLine && entry.productId && (parseFloat(entry.qty) || 0) > 0) {
      const next = newRow();
      setRows((prev) => [...prev.map((x) => (x.key === entry.key ? { ...x, committed: true } : x)), next]);
    }
    setActiveKey(key);
    focusSoon('[data-entry] [data-nav="qty"]');
  };
  const removeLine = (key: string) => {
    setRows((prev) => {
      const left = prev.filter((r) => r.key !== key);
      return left.some((r) => !r.committed) ? left : [...left, newRow()];
    });
    if (key === activeKey) setActiveKey(newRowOf(rows.filter((r) => r.key !== key))?.key || '');
  };
  // An entry row that was removed: point back at the new line.
  useEffect(() => {
    if (!rows.some((r) => r.key === activeKey)) setActiveKey(newRowOf(rows).key);
  }, [rows, activeKey]);

  /** A scanned item (camera or USB scanner): one more on its line, else into the entry row. */
  const addScanned = (productId: string) => {
    const same = rows.find((r) => r.productId === productId);
    if (same) return setRow(same.key, { qty: num4((parseFloat(same.qty) || 0) + 1) });
    if (!entry.productId) return pickProduct(entry.key, productId);
    const { base, priceFrom } = priceFor(productId, newCustomer ? '' : customer);
    const next = newRow();
    setRows((prev) => [...prev.map((x) => (x.key === entry.key ? { ...x, committed: true } : x)), newRow({ productId, price: shownPrice(productId, base, false), priceFrom, committed: true }), next]);
    setActiveKey(next.key);
  };

  /** A line read by the AI as a grid row: its rate when one was written, else the customer's / list price. */
  const aiRow = (l: { productId: string; qty: number; unit: 'base' | 'pack'; rate: number | null; nameAsWritten: string; needsCheck: boolean }, custId: string): Row => {
    const p = products.find((x) => x.id === l.productId);
    const inPack = l.unit === 'pack' && hasPack(p);
    if (l.rate != null) return newRow({ productId: l.productId, qty: num4(l.qty), price: String(l.rate), inPack, priceFrom: 'typed', committed: true, ai: { written: l.nameAsWritten, check: l.needsCheck } });
    const { base, priceFrom } = priceFor(l.productId, custId);
    return newRow({ productId: l.productId, qty: num4(l.qty), price: shownPrice(l.productId, base, inPack), inPack, priceFrom, committed: true, ai: { written: l.nameAsWritten, check: l.needsCheck } });
  };
  const applyAi = (bill: ParsedBill) => {
    setError('');
    let custId = newCustomer ? '' : customer;
    if (bill.customerId && !newCustomer && customers.some((c) => c.id === bill.customerId)) {
      pickCustomer(bill.customerId);
      custId = bill.customerId;
    }
    const matched = bill.lines.filter((l): l is ParsedBillLine & { productId: string } => Boolean(l.productId));
    const added = matched.map((l) => aiRow(l, custId));
    // Before the entry row (the line not yet in the grid stays last).
    setRows((prev) => [...prev.filter((r) => r.committed), ...added, ...prev.filter((r) => !r.committed)]);
    setAiUnmatched(bill.lines.filter((l) => !l.productId));
    const checks = matched.filter((l) => l.needsCheck).length;
    const who = bill.customerId ? '' : bill.customerNameGuess ? ` Customer written as “${bill.customerNameGuess}”: pick them above.` : '';
    setAiInfo(`AI filled ${added.length} line${added.length === 1 ? '' : 's'}${checks ? `; check the ${checks} highlighted` : ''}. Nothing is saved until you press Save.${who}${bill.notes ? ` Note: ${bill.notes}` : ''}`);
  };
  const addUnmatched = (i: number, productId: string) => {
    const l = aiUnmatched[i];
    if (!l || !productId) return;
    const row = aiRow({ ...l, productId, needsCheck: false }, newCustomer ? '' : customer);
    setRows((prev) => [...prev.filter((r) => r.committed), row, ...prev.filter((r) => !r.committed)]);
    setAiUnmatched((prev) => prev.filter((_, j) => j !== i));
  };

  /** Enter in the entry row's Code box: picked → Qty; empty → the payment (the bill has lines) or the item list. */
  const onLineCodeEnter = (picked: string | undefined, typed: string) => {
    if (picked) return focusSoon('[data-entry] [data-nav="qty"]');
    if (typed) return; // no such code: stay, the box says so
    if (rows.some((r) => r.committed && r.productId) || entry.productId) {
      if (entry.productId && commitEntry()) return;
      if (!cash && focusIn('[data-nav="paid"]')) return;
      focusIn('#bill-freight');
      return;
    }
    focusIn('[data-entry] [data-nav="item"]');
  };
  /** Enter in the customer Code box: picked → the entry row's Code box; empty → the customer list. */
  const onCustomerCodeEnter = (picked: string | undefined, typed: string) => {
    if (picked) return focusSoon('[data-entry] [data-code]');
    if (!typed) focusIn('#bill-customer');
  };
  const productByName = (typed: string) => findOption(productOptions, typed)?.value;
  const customerByName = (typed: string) => findOption(customerOptions, typed)?.value;
  const openPartySearch = (text = '') => setPartySearch({ text });
  const partyKeys = (e: React.KeyboardEvent): boolean => {
    if (e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      openPartySearch('');
      return true;
    }
    return false;
  };

  // ---- Figures ----
  const billPctNum = Math.min(100, Math.max(0, parseFloat(billPct) || 0));
  const baseLines = rows.map((r) => {
    const p = products.find((x) => x.id === r.productId);
    const pack = r.inPack && hasPack(p) ? p.packSize : 1;
    // A minus qty is refused on Save (returns go through Return items); until then it counts as 0, so the total
    // shown is never less than what would be saved.
    const typedQty = Math.max(0, parseFloat(r.qty) || 0);
    const typedPrice = parseFloat(r.price) || 0;
    // … and what is stored: always the base unit.
    const qty = typedQty * pack;
    const price = pack > 1 ? typedPrice / pack : typedPrice;
    const ownDisc = parseFloat(r.disc) || 0;
    const gross = round2(typedQty * typedPrice);
    const lineDisc = lineDiscountAmount(typedQty, typedPrice, r.discType, ownDisc);
    return { ...r, rawQty: r.qty, rawPrice: r.price, typedQty, typedPrice, pack, qty, price, discValue: ownDisc, lineDisc, gross, amount: round2(gross - lineDisc), product: p, schemePct: null as null | { schemeId: string; schemeName: string; pct: number }, fromBillPct: false };
  });
  // Schemes: free goods and "% off above a quantity", worked out from what is on the bill.
  const schemeCustomer = newCustomer ? '' : customer;
  const qtyKey = baseLines.map((l) => `${l.productId}:${l.qty}`).join('|');
  const schemeResult = useMemo(
    () => (schemes.length ? evaluateSchemes(schemes, baseLines.map((l) => ({ productId: l.productId, qty: l.qty })), schemeCustomer, date) : { free: [], pct: {} as Record<string, { schemeId: string; schemeName: string; pct: number }> }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schemes, schemeCustomer, date, qtyKey]
  );
  // A line's own discount wins; else a % scheme; else the bill's Disc %.
  const lines = baseLines.map((l) => {
    if (l.discValue > 0) return l;
    const sp = l.productId ? schemeResult.pct[l.productId] : undefined;
    if (sp && !dropped.has(`pct|${sp.schemeId}|${l.key}`)) {
      const lineDisc = lineDiscountAmount(l.typedQty, l.typedPrice, 'pct', sp.pct);
      return { ...l, discType: 'pct' as const, discValue: sp.pct, lineDisc, amount: round2(l.gross - lineDisc), schemePct: sp };
    }
    if (billPctNum > 0 && l.productId) {
      const lineDisc = lineDiscountAmount(l.typedQty, l.typedPrice, 'pct', billPctNum);
      return { ...l, discType: 'pct' as const, discValue: billPctNum, lineDisc, amount: round2(l.gross - lineDisc), fromBillPct: true };
    }
    return l;
  });
  const freeLines = schemeResult.free
    .filter((f) => !dropped.has(f.key))
    .map((f) => ({ ...f, product: products.find((x) => x.id === f.productId) }))
    .filter((f) => f.product);
  const droppedCount = schemeResult.free.filter((f) => dropped.has(f.key)).length + baseLines.filter((l) => l.productId && schemeResult.pct[l.productId] && !(l.discValue > 0) && dropped.has(`pct|${schemeResult.pct[l.productId].schemeId}|${l.key}`)).length;
  const drop = (key: string) => setDropped((prev) => new Set(prev).add(key));
  // Where each line's stock would come from (batch items, or a godown other than the main one).
  // Lines are planned together, in order, so two lines of the same item share the same stock, exactly
  // as saving the bill will. Expiry is judged against today, so a back-dated bill can't sell expired stock.
  const stockNote = (l: (typeof lines)[number], idx: number): { warn: boolean; block?: boolean; text: string } | null => {
    if (!l.product || l.qty <= 0) return null;
    const upToSame = lines.slice(0, idx + 1).filter((x) => x.product?.id === l.product!.id).reduce((a, x) => a + x.qty, 0);
    if (upToSame > l.product.stockKg + 0.0001) {
      const have = formatPackQty(l.product.stockKg, l.product);
      if (!allowNegative) return { warn: true, block: true, text: `Only ${have} of ${l.product.name} in stock. Receive the stock first, or turn on "Allow bills when stock is short" in Settings.` };
      if (!l.product.trackBatches && godowns.length < 2) return { warn: true, text: `Only ${have} of ${l.product.name} in stock — stock will go to ${formatPackQty(Math.round((l.product.stockKg - upToSame) * 100) / 100, l.product)}.` };
    }
    if (!l.product.trackBatches && godowns.length < 2) return null;
    const upTo = lines.slice(0, idx + 1).filter((x) => x.product && x.qty > 0).map((x) => ({ productId: x.product!.id, qty: x.qty }));
    const plan = planBillStock(products, stockBatches, godowns, upTo, godownId, todayISO());
    if (!plan.ok) return { warn: true, block: true, text: plan.message || 'Not enough stock.' };
    const from = batchLines({ ...plan.lines[plan.lines.length - 1] });
    if (from.length) return { warn: false, text: `From ${from.join(', ')}` };
    if (godowns.length > 1) {
      const have = stockByGodown(l.product, stockBatches, godowns)[godownId] ?? 0;
      if (l.qty > have) return { warn: true, text: `Only ${formatPackQty(have, l.product)} of ${l.product.name} in this godown — the bill will still save.` };
    }
    return null;
  };
  const used = lines.filter((l) => l.productId);
  const qtyTotal = Math.round(used.reduce((a, l) => a + l.typedQty, 0) * 10000) / 10000;
  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0));
  const itemDiscInUse = rows.some((r) => (parseFloat(r.disc) || 0) > 0) || (parseFloat(billPct) || 0) > 0;
  const showItemDisc = itemDiscOn || itemDiscInUse;
  const lumsumPctNum = Math.min(100, Math.max(0, parseFloat(lumsumPct) || 0));
  const disc = round2(Math.min(lumsumPctNum > 0 ? (subtotal * lumsumPctNum) / 100 : Math.max(0, parseFloat(discount) || 0), subtotal));
  const taxRate = settings.taxRatePct ?? 0;
  const tax = round2(((subtotal - disc) * taxRate) / 100);
  const freightAmt = Math.max(0, parseFloat(freight) || 0);
  const vehicleAmt = Math.max(0, parseFloat(vehicle) || 0);
  const total = round2(subtotal - disc + tax + freightAmt + vehicleAmt);

  // ---- Payment Method grid (the line being typed counts too) ----
  const payEntry = payRows.find((p) => p.key === activePay) || payRows[payRows.length - 1];
  const grid = paymentsFromGrid(payRows.map((p) => ({ code: p.code, amount: parseFloat(p.amount) || 0, note: p.note })), payAccs);
  const payParts: PaymentPart[] = cash ? [{ method: 'Cash', amount: total }] : grid.parts;
  const chequeAmount = cash ? 0 : grid.cheque;
  const payment = editInv ? resolveBillPayments(total, [], 0) : resolveBillPayments(total, payParts, chequeAmount);
  const given = round2(payParts.reduce((a, p) => a + p.amount, 0) + chequeAmount);
  const alreadyPaid = editInv ? editInv.paidAmount : 0;
  const paid = editInv ? alreadyPaid : payment.error ? Math.min(given, total) : payment.paid;
  const balance = round2(total - paid);
  const change = payment.error ? 0 : payment.change;
  const hasCheque = !editInv && chequeAmount > 0;
  const payError = grid.error || payment.error;
  const setPay = (key: string, patch: Partial<PayRow>) => setPayRows((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const commitPay = () => {
    const p = payEntry;
    if (!((parseFloat(p.amount) || 0) > 0)) {
      if (p.committed) setActivePay(payRows.find((x) => !x.committed)!.key);
      focusIn('#bill-freight');
      return;
    }
    if (p.committed) setActivePay(payRows.find((x) => !x.committed)!.key);
    else {
      const next = newPay();
      setPayRows((prev) => [...prev.map((x) => (x.key === p.key ? { ...x, committed: true } : x)), next]);
      setActivePay(next.key);
    }
    focusSoon('[data-pay-entry] [data-code]');
  };
  const removePay = (key: string) => {
    setPayRows((prev) => {
      const left = prev.filter((p) => p.key !== key);
      return left.some((p) => !p.committed) ? left : [...left, newPay()];
    });
  };
  useEffect(() => {
    if (!payRows.some((p) => p.key === activePay)) setActivePay(payRows.find((p) => !p.committed)?.key || payRows[0].key);
  }, [payRows, activePay]);
  const accName = (code: string) => payAccs.find((a) => a.code === code)?.name || `Account ${code}`;
  /** Editing: the money already received on the bill, as Payment Method lines (read-only). */
  const savedPays = useMemo(
    () =>
      (editInv?.payments || []).map((p) => {
        const row = p.ledgerId ? ledger.find((l) => l.id === p.ledgerId) : undefined;
        const code = p.method === 'cheque' ? '1150' : p.method === 'cash' ? ACC.CASH : row?.bankCode || '1010';
        return { id: p.id, code, amount: p.amount, note: row?.note || (p.method === 'cheque' ? p.notes || '' : ''), receiptNo: p.referenceNumber || (row ? paymentNo(row) : editInv!.invoiceNumber) };
      }),
    [editInv, ledger]
  );

  // A typed "new" customer that matches an existing one (same name or phone) is that customer, as on save.
  const typedMatch = newCustomer
    ? customers.find((c) => c.name.trim().toLowerCase() === newCustomer.name.trim().toLowerCase() || (newCustomer.phone.trim() && c.phone.replace(/\D/g, '') === newCustomer.phone.replace(/\D/g, '')))
    : undefined;
  const selected = newCustomer ? typedMatch : customers.find((c) => c.id === customer);
  // Editing: the old bill's unpaid part is already in what they owe.
  const creditParty = selected && editInv && editInv.customerId === selected.id ? { ...selected, totalDue: selected.totalDue - editInv.balanceDue } : selected;
  const credit = creditCheck(newCustomer ? typedMatch || null : creditParty || null, balance);
  const canOverride = can('override_credit');
  // Approval rule "bill over credit limit": staff who can't allow it send the bill to a manager instead.
  const creditToApproval = Boolean(approvalRules.creditLimit) && !canOverride && !canApprove;
  const creditBlocked = credit.over && !creditToApproval && !(canOverride && allowOver && overReason.trim());
  const cashParty = cash && !customer && !newCustomer ? { name: 'Cash Sale', phone: '' } : undefined;
  const approvalWhy = billApprovalReasons({
    customerId: newCustomer || cashParty ? '' : customer,
    newCustomer: newCustomer || cashParty,
    items: used.filter((l) => l.qty > 0).map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.price, ...(l.lineDisc > 0 ? { discountType: l.discType, discountValue: l.discValue } : {}), ...(l.schemePct ? { schemeId: l.schemePct.schemeId } : {}) })),
    discount: disc,
    freightCharges: freightAmt,
    vehicleCharges: vehicleAmt,
    payments: editInv ? [] : payment.parts,
    ...(hasCheque ? { cheque: { amount: chequeAmount, ...cheque } } : {}),
    date,
  });
  // Free goods take stock too: when short stock is not allowed, the bill waits until the free qty fits.
  const freeShort = !allowNegative ? freeLines.find((f) => lines.filter((l) => l.product?.id === f.productId).reduce((a, l) => a + l.qty, 0) + freeLines.filter((x) => x.productId === f.productId).reduce((a, x) => a + x.qty, 0) > (f.product!.stockKg || 0) + 0.0001) : undefined;
  const stockBlocked = lines.some((l, idx) => stockNote(l, idx)?.block) || Boolean(freeShort);
  const saveBlocked = creditBlocked || stockBlocked || Boolean(sentForApproval);
  const blockedWhy = stockBlocked ? 'Not enough stock for this bill' : creditBlocked ? 'Over the credit limit' : undefined;
  const snapshot = useMemo(() => (selected ? customerSnapshot(selected.id, invoices, ledger) : null), [selected, invoices, ledger]);
  // Any change to the bill clears an old error message.
  React.useEffect(() => { setError(''); }, [customer, newCustomer, rows, discount, lumsumPct, billPct, payRows, godownId, allowOver, overReason, cheque, freight, vehicle, salesmanId, areaId, dropped, saleAc]);

  const submit = (after: 'next' | 'stay' = 'next') => {
    if (busy.current) return; // a double tap must not make two bills
    setError('');
    if (newCustomer && !newCustomer.name.trim()) return setError('Enter the new customer name.');
    if (!cash && !newCustomer && !customer) return setError('Pick a customer (or add a new one).');
    if (lines.some((l) => l.productId && l.price < 0)) return setError('A price cannot be negative.');
    const minusAt = rows.findIndex((r) => r.productId && (parseFloat(r.qty) || 0) < 0);
    if (minusAt >= 0) return setError(`Line ${minusAt + 1}: the quantity cannot be below zero. For goods coming back, open the bill and use Return items.`);
    if (total <= 0) return setError('The bill total must be more than zero.');
    if (editInv && total + 0.005 < alreadyPaid) return setError(`${rs(alreadyPaid)} is already paid on this bill; the new total cannot be less than that.`);
    const items = lines.filter((l) => l.productId && l.qty > 0);
    if (items.length === 0) return setError('Add at least one item with a quantity.');
    if (!editInv && grid.error) return setError(grid.error);
    if (payment.error) return setError(payment.error);
    if (hasCheque && (!cheque.chequeNumber.trim() || !cheque.bankName.trim())) return setError('Enter the cheque number and bank.');
    if (stockBlocked) return setError(lines.map((l, i) => stockNote(l, i)).find((x) => x?.block)?.text || (freeShort ? `Not enough ${freeShort.product!.name} in stock for the free goods. Receive the stock first, or remove the free line.` : 'Not enough stock.'));
    if (credit.over && !creditToApproval && !(canOverride && allowOver)) return setError(canOverride ? 'This bill is over the credit limit. Tick "Allow over limit" and give a reason, or take more payment now.' : 'This bill is over the customer\'s credit limit. Take more payment now, or ask a manager to allow it.');
    if (credit.over && !creditToApproval && !overReason.trim()) return setError('Write a short reason for allowing this bill over the credit limit.');
    busy.current = true; // held until the dialog closes; released at once if the bill is refused
    const save = editInv ? (input: Parameters<typeof createBill>[0]) => editBill(editInv.id, input) : createBill;
    const paper = paperOf(printChoice);
    const result = save({
      customerId: newCustomer || cashParty ? '' : customer,
      newCustomer: newCustomer || cashParty,
      items: items.map((l) => ({
        productId: l.productId,
        name: l.product?.name || 'Item',
        qty: l.qty,
        unitPrice: l.price,
        unit: l.product?.unit,
        ...(l.desc.trim() ? { description: l.desc.trim() } : {}),
        ...(l.lineDisc > 0 ? { discountType: l.discType, discountValue: l.discValue } : {}),
        ...(l.priceFrom === 'customer' ? { customerRate: true } : {}),
        ...(l.pack > 1 ? { packPrice: l.typedPrice } : {}),
        ...(l.schemePct ? { schemeId: l.schemePct.schemeId, schemeName: l.schemePct.schemeName } : {}),
      } as CreateBillItemInput)).concat(freeLines.map((f) => ({ productId: f.productId, name: f.product!.name, qty: f.qty, unitPrice: 0, unit: f.product!.unit, free: true, schemeId: f.schemeId, schemeName: f.schemeName }))),
      freightCharges: freightAmt,
      vehicleCharges: vehicleAmt,
      ...(salesmen.length ? { salesmanId: salesmanId || null } : {}),
      ...(areas.length ? { areaId: areaId || null } : {}),
      quotationId: quote?.id,
      discount: disc,
      payments: payment.parts,
      paymentMethod: payment.parts.length === 1 && !hasCheque ? payment.parts[0].method : undefined,
      ...(hasCheque ? { cheque: { amount: chequeAmount, ...cheque } } : {}),
      notes,
      date,
      ...(credit.over ? { allowOverLimit: allowOver, overrideReason: overReason } : approvalWhy && overReason.trim() ? { overrideReason: overReason } : {}),
      godownId: godowns.length > 1 ? godownId : undefined,
      ...(costCentre ? { costCentreId: costCentre } : {}),
      ...(memoNo.trim() ? { memoNo: memoNo.trim() } : {}),
      ...(deliveryOrder ? { deliveryOrder: true } : editInv?.delivery ? { deliveryOrder: false } : {}),
      ...(saleAc && saleAc !== ACC.SALES ? { saleAccountCode: saleAc } : {}),
      ...(cash ? { cashSale: true, ...(walkIn.trim() ? { walkInName: walkIn.trim() } : {}) } : {}),
    });
    if (!result.success) {
      busy.current = false;
      return setError(result.message);
    }
    // Waiting for approval: say so and keep the dialog (Save stays off, so it can't be sent twice).
    if (isPendingApproval(result)) return setSentForApproval(result.message);
    onClose();
    const savedId = editInv ? editInv.id : result.invoice?.id;
    if (paper && savedId) setPrintRequest({ type: 'bill', invoiceId: savedId, paper });
    // An edit goes back to the bill (with its new figures).
    if (editInv) {
      if (!paper) onEdited?.(editInv.id);
      return;
    }
    // Counter work goes bill after bill: Save opens the next new bill straight away.
    if (after === 'next' && openNextBillAfterSave()) {
      if (cash) ui.newCashSale();
      else ui.newBill();
    }
  };

  /** Search: open a saved bill by its number in this same form, to change it (same number). */
  const searchBill = () => {
    const hit = findBillByNumber(invoices, find);
    if (!hit) return setError(`No bill “${find.trim()}”. Type the bill number, e.g. ${invoices[0]?.invoiceNumber || 'INV-12'} or just its digits.`);
    const inv = invoices.find((i) => i.id === hit.id)!;
    // Can't be changed (goods returned, a cheque on it, closed period, no permission): say why, stay here.
    const why = billEditBlock(inv);
    if (why) return setError(`${inv.invoiceNumber} cannot be opened for changes: ${why}`);
    ui.editBill(hit.id);
  };
  const doDelete = () => {
    if (!editInv) return;
    const r = deleteBill(editInv.id);
    setConfirmDelete(false);
    if (!r.success) return setError(r.message);
    onClose();
    if (cash) ui.newCashSale();
    else ui.newBill();
  };
  const canDelete = can('delete_records') || can('system:admin_screen') || can('admin_screen') || currentUser?.role === 'super_admin' || currentUser?.role === 'admin' || billDeleteNeedsApproval;
  const doPreview = () => {
    if (editInv) setPrintRequest({ type: 'bill', invoiceId: editInv.id, ...(paperOf(printChoice) ? { paper: paperOf(printChoice)! } : {}) });
    else setPreview(true);
  };
  const computerNo = editInv ? editInv.invoiceNumber : previewDocNumber('bill', date);
  const ep = entry.productId ? products.find((p) => p.id === entry.productId) : undefined;
  const epPer = ep && godowns.length > 1 ? stockByGodown(ep, stockBatches, godowns) : null;

  /** Enter → next field (entry row: Enter on Rate or Disc puts the line in the grid); Ctrl+Enter / F9 → save; "+" / Alt+N → line in. */
  const onKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const tag = t.tagName;
    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'F9') {
      e.preventDefault();
      submit();
      return;
    }
    const inEntry = Boolean(t.closest('[data-entry]'));
    const isNumber = tag === 'INPUT' && (t as HTMLInputElement).type === 'number';
    if ((e.altKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) || (e.key === '+' && inEntry && (tag === 'SELECT' || isNumber))) {
      e.preventDefault();
      commitEntry();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || tag === 'TEXTAREA' || tag === 'BUTTON' || !box.current) return;
    const nav = t.getAttribute('data-nav');
    if (!nav) return;
    e.preventDefault();
    if (inEntry) {
      // An empty Product box ends the item list: go to the payment.
      if (nav === 'item' && !(t as HTMLSelectElement).value) {
        if (rows.some((r) => r.committed && r.productId)) {
          if (!cash && focusIn('[data-nav="paid"]')) return;
          focusIn('#bill-freight');
        }
        return;
      }
      if (nav === 'price' || nav === 'disc') {
        commitEntry();
        return;
      }
    }
    if (t.closest('[data-pay-entry]')) {
      if (nav === 'pay-note') return commitPay();
    }
    const navs = (Array.from(box.current.querySelectorAll('[data-nav]')) as HTMLElement[]).filter((x) => x === t || (x.offsetParent !== null && !(x as HTMLInputElement).disabled));
    const at = navs.indexOf(t);
    const next = navs[at + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement) next.select();
    }
  };

  const footer = (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 flex-1 min-w-0">
        <div role="radiogroup" aria-label="Print Invoice" className="inline-flex items-center gap-1 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-1 text-xs font-bold">
          <span className="px-1.5 text-[10px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Print</span>
          {PRINT_CHOICES.map((c) => (
            <label key={c.id} className={`px-2.5 py-1.5 rounded-xl cursor-pointer ${printChoice === c.id ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : 'text-[#6B7280] dark:text-[#94A3B8]'}`} title={c.id === 'half' ? 'A5' : c.id === 'full' ? 'A4' : c.id === 'mini' ? '80 mm thermal' : 'Do not print'}>
              <input type="radio" name={`print-${cash ? 'cash' : 'sale'}`} value={c.id} checked={printChoice === c.id} onChange={() => setPrintChoice(c.id)} className="sr-only" aria-label={c.label} />
              {c.label}
            </label>
          ))}
        </div>
        <span className="text-sm">
          <span className="text-[#6B7280] dark:text-[#94A3B8]">Total </span>
          <span className="tabular-nums font-extrabold text-lg text-[#111827] dark:text-white">{rs(total)}</span>
          {!cash && balance > 0 && <span className="ml-2 text-xs font-bold text-amber-700 dark:text-amber-300">{rs(balance)} on credit</span>}
          {total > 0 && balance === 0 && <span className="ml-2 text-xs font-bold text-teal-700 dark:text-teal-300">Fully paid</span>}
        </span>
        <span className="hidden xl:inline-flex items-center gap-1 text-[10px] text-[#8E9299]" title="Enter: next field • Enter on Rate: line in • Ctrl+Enter or F9: save • F2 in Customer: search party"><Keyboard className="w-3 h-3" /> Enter next • F9 save • F2 party</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => submit()} disabled={saveBlocked} title={blockedWhy || 'Save (Ctrl+Enter or F9)'} className={primaryBtn}><Save className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save</button>
        {cash && (
          <button type="button" onClick={() => { onClose(); ui.newCashSale(); }} className={secondaryBtn} title="A new, empty cash sale (this one is not saved)"><FilePlus2 className="w-4 h-4" /> New</button>
        )}
        <button type="button" onClick={() => setConfirmDelete(true)} disabled={!editInv || !canDelete} className={dangerBtn} title={editInv ? `Delete ${editInv.invoiceNumber}` : 'Open a saved invoice (Search) to delete it'}><Trash2 className="w-4 h-4" /> Delete</button>
        <button type="button" onClick={() => focusIn('#bill-search')} className={secondaryBtn} title="Open a saved invoice by its number to change it"><Search className="w-4 h-4" /> Search</button>
        <button type="button" onClick={doPreview} className={secondaryBtn}><Eye className="w-4 h-4" /> Preview</button>
        <button type="button" onClick={onClose} className={secondaryBtn} aria-label="Close invoice"><X className="w-4 h-4" /> Close</button>
      </div>
    </div>
  );

  const small = 'block text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1';
  const hdr = 'text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]';
  const readBox = 'rounded-2xl border border-dashed border-[#E5E5E1] dark:border-[#203248] px-3 py-2 text-sm min-h-11 flex items-center';
  const title = editInv ? `Edit bill ${editInv.invoiceNumber}` : cash ? 'Cash Sale Invoice' : 'New Bill';
  const committed = lines.map((l, idx) => ({ l, idx })).filter(({ l }) => l.committed);
  const committedLines = committed.map(({ l }) => l);
  const entryLine = lines[entryIdx];
  const entryNote = entryLine ? stockNote(entryLine, entryIdx) : null;
  const last = ep && selected ? lastRateFor(selected.id, ep.id, invoices) : null;
  const unitWord = ep ? (entryLine.pack > 1 ? ep.packName! : ep.unit || 'pcs') : '';
  const payCommitted = payRows.filter((p) => p.committed);
  const payTotal = round2(payRows.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0));

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title} subtitle={editInv ? 'Sale Invoice — change it and Save; it keeps its number. Money already received stays on it.' : cash ? 'Walk-in sale, paid in cash. Customer is optional.' : quote ? `Sale Invoice from quotation ${quote.quoteNumber} — check the items and prices, then save.` : 'Sale Invoice'} xwide footer={footer}>
        <div className="space-y-4" ref={box} onKeyDown={onKeys} data-testid={cash ? 'cash-sale-form' : 'sale-invoice-form'}>
          {error && <Notice kind="error">{error}</Notice>}
          {sentForApproval && <div data-testid="bill-sent-for-approval"><Notice kind="ok">{sentForApproval}</Notice></div>}
          {!sentForApproval && approvalWhy && (
            <div data-testid="bill-needs-approval" className="rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs space-y-2">
              <p className="font-bold text-amber-900 dark:text-amber-200">Needs a manager’s approval: {approvalWhy.join('; ')}.</p>
              <p className="text-amber-900/80 dark:text-amber-200/80">Saving sends the bill to Approvals. Nothing goes to the books or the stock until a manager approves it.</p>
              {(!credit.over || !canOverride) && <input aria-label="Note for the manager" value={overReason} onChange={(e) => setOverReason(e.target.value)} className={inputCls} placeholder="Note for the manager (optional)" />}
            </div>
          )}

          {/* ---- Header: left block (the old program's left column) and right block ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_17rem] gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-[repeat(4,minmax(0,1fr))] gap-3 items-end">
              <div className="col-span-2 sm:col-span-1" data-testid="bill-computer-no">
                <span className={labelCls}>Computer #</span>
                <div className="flex gap-1">
                  <div className={`${readBox} flex-1 font-bold tabular-nums text-[#111827] dark:text-white`} title="Given automatically when you save" data-testid="bill-next-number">{computerNo}</div>
                  <button type="button" onClick={() => focusIn('#bill-search')} className={`${secondaryBtn} !px-2.5 shrink-0`} aria-label="Find a saved invoice" title="Search a saved invoice by its number"><MoreHorizontal className="w-4 h-4" /></button>
                </div>
              </div>
              <div>
                <span className={labelCls}>Computer Date</span>
                <div className={`${readBox} text-[#111827] dark:text-white`} data-testid="bill-computer-date">{formatDate(editInv ? (editInv.enteredAt || editInv.createdAt || todayISO()).slice(0, 10) : todayISO())}</div>
              </div>
              <label htmlFor="bill-delivery-order" className="flex items-center gap-2.5 min-h-11 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] px-3 cursor-pointer" title="Goods go out later. Stock is taken now; the bill waits in the Pending Delivery List.">
                <input id="bill-delivery-order" data-skip-autofocus type="checkbox" checked={deliveryOrder} onChange={(e) => setDeliveryOrder(e.target.checked)} className="w-5 h-5 accent-teal-700" />
                <span className="text-sm font-semibold text-[#111827] dark:text-white inline-flex items-center gap-1.5"><Truck className="w-4 h-4 text-indigo-600" /> Delivery Order</span>
              </label>
              <div>
                <label className="sr-only" htmlFor="bill-search">Search old bill</label>
                <span className={labelCls} aria-hidden="true">Search invoice</span>
                <div className="flex gap-1">
                  <input id="bill-search" data-skip-autofocus value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); searchBill(); } }} className={inputCls} placeholder="Bill #" />
                  <button type="button" onClick={searchBill} className={`${secondaryBtn} !px-2.5 shrink-0`} aria-label="Open old bill"><Search className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-4 min-w-0">
                <label className={labelCls} htmlFor="bill-customer">{cash ? 'Customer (optional)' : 'Customer'}</label>
                {newCustomer ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input autoFocus data-nav="customer" placeholder="Customer name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className={inputCls} aria-label="New customer name" />
                    <input data-nav="customer-phone" placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={inputCls} aria-label="New customer phone" />
                    <button type="button" onClick={() => setNewCustomer(null)} className="col-span-2 text-xs font-semibold text-[#6B7280] hover:text-[#111827] dark:hover:text-white text-left">← Choose an existing customer instead</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <CodeBox id="bill-customer-code" label="Customer code" items={customers} value={customer} onPick={pickCustomer} fallback={customerByName} onEnter={onCustomerCodeEnter} onTypeName={(t) => openPartySearch(t)} onKeyDownExtra={partyKeys} skipAutofocus className="w-24 sm:w-28 shrink-0" />
                    <div className="flex-1 min-w-[11rem]" onKeyDown={partyKeys}>
                      <QuickSelect id="bill-customer" data-nav="customer" value={customer} options={customerOptions} onPick={pickCustomer} className={inputCls} title="Type a name, code or phone to find the customer (F2: search party by city)">
                        <option value="">{cash ? 'Walk-in (cash sale)' : 'Select customer…'}</option>
                        {sortedCustomers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}{c.phone ? ` • ${c.phone}` : ''}{c.totalDue > 0 ? ` (due ${rs(c.totalDue)})` : ''}</option>
                        ))}
                      </QuickSelect>
                    </div>
                    <button type="button" onClick={() => openPartySearch('')} className={`${secondaryBtn} shrink-0 !px-3`} aria-label="Search party by city" title="Search Party By City (F2)"><Search className="w-4 h-4" /></button>
                    {!cash && <button type="button" onClick={() => setNewCustomer({ name: '', phone: '' })} className={`${secondaryBtn} shrink-0 px-3`} title="Add a new customer"><UserPlus className="w-4 h-4" /><span>New</span></button>}
                  </div>
                )}
              </div>

              <div className="col-span-2 min-w-0">
                <label className={labelCls} htmlFor="bill-sale-ac">Sale a/c</label>
                <div className="flex gap-2">
                  <CodeBox id="bill-sale-ac-code" label="Sale a/c code" items={saleAccs.map((a) => ({ id: a.code, code: a.code }))} value={saleAc} onPick={setSaleAc} className="w-24 shrink-0" skipAutofocus nextId="bill-godown" />
                  <select id="bill-sale-ac" value={saleAc} onChange={(e) => setSaleAc(e.target.value)} className={`${inputCls} flex-1 min-w-0`} title="The income account the goods are credited to">
                    {saleAccs.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="min-w-0">
                <label className={labelCls} htmlFor="bill-godown">Store Name</label>
                <select id="bill-godown" value={godownId} onChange={(e) => setGodownId(e.target.value)} className={inputCls} disabled={godowns.length < 2}>
                  {godowns.length === 0 && <option value="">Main store</option>}
                  {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <span className={labelCls}>{cash ? 'Product Balance/Unit' : 'Stock in Hand'}</span>
                <div className={`${readBox} tabular-nums font-bold ${ep && ep.stockKg < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-[#111827] dark:text-white'}`} data-testid="bill-stock-box" title={ep ? `${ep.name}: stock in hand` : 'Stock of the item in the entry row'}>
                  {ep ? formatPackQty(ep.stockKg, ep, 'short') : '—'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 content-start">
              <div className="col-span-2 lg:col-span-1">
                <span className={labelCls}>Party Balance</span>
                <div className={`${readBox} tabular-nums font-extrabold ${selected && selected.totalDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-[#111827] dark:text-white'}`} data-testid="bill-party-balance">{selected ? rs(selected.totalDue) : '—'}</div>
              </div>
              <div>
                <label className={labelCls} htmlFor="bill-memo">Memo No</label>
                <input id="bill-memo" value={memoNo} onChange={(e) => setMemoNo(e.target.value)} className={inputCls} placeholder="book / ref. no." />
              </div>
              <div>
                <label className={labelCls} htmlFor="bill-date">Your Date</label>
                <input id="bill-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
              {showItemDisc && <div className="col-span-2 lg:col-span-1">
                <label className={labelCls} htmlFor="bill-disc-pct">Disc %</label>
                <input id="bill-disc-pct" type="number" inputMode="decimal" min="0" max="100" step="any" value={billPct} onChange={(e) => setBillPct(e.target.value)} className={numInputCls} placeholder="0 (on every line)" title="A discount % on every line that has no discount of its own" />
              </div>}
            </div>
          </div>

          {selected && snapshot && (
            <div data-testid="bill-customer-info" className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#162436] px-3.5 py-2.5 text-xs text-[#374151] dark:text-[#CBD5E1] space-y-1">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>Balance <strong className={`tabular-nums ${selected.totalDue > 0 ? 'text-amber-700 dark:text-amber-300' : selected.totalDue < 0 ? 'text-teal-700 dark:text-teal-300' : ''}`}>{rs(selected.totalDue)}</strong>{selected.totalDue < 0 ? ' (advance)' : ''}</span>
                <span>Credit left <strong className="tabular-nums">{credit.hasLimit ? rs(credit.available) : 'no limit'}</strong></span>
                <span>Last payment {snapshot.lastPayment ? <strong className="tabular-nums">{rs(snapshot.lastPayment.amount)}</strong> : <strong>none</strong>}{snapshot.lastPayment ? ` on ${formatDate(snapshot.lastPayment.date)}${snapshot.lastPayment.method ? ` (${snapshot.lastPayment.method})` : ''}` : ''}</span>
              </div>
              {snapshot.lastBills.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                  <span className="font-bold uppercase tracking-wider text-[10px]">Last bills</span>
                  {snapshot.lastBills.map((b) => (
                    <span key={b.id} className="whitespace-nowrap">{b.invoiceNumber} • {formatDate(b.issueDate)} • <span className="tabular-nums">{rs(b.totalAmount)}</span>{b.balanceDue > 0 ? <span className="text-amber-700 dark:text-amber-300"> ({rs(b.balanceDue)} due)</span> : ''}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {credit.hasLimit && !cash && <BillCreditPanel check={credit} canOverride={canOverride} allow={allowOver} onAllow={setAllowOver} reason={overReason} onReason={setOverReason} />}
          {(salesmen.length > 0 || areas.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {salesmen.length > 0 && (
                <div>
                  <label className={labelCls} htmlFor="bill-salesman">Salesman</label>
                  <select id="bill-salesman" value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)} className={inputCls}>
                    <option value="">No salesman</option>
                    {salesmen.filter((x) => x.active || x.id === salesmanId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
              )}
              {areas.length > 0 && (
                <div>
                  <label className={labelCls} htmlFor="bill-area">Area</label>
                  <select id="bill-area" value={areaId} onChange={(e) => setAreaId(e.target.value)} className={inputCls}>
                    <option value="">No area</option>
                    {areas.filter((x) => x.active || x.id === areaId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {aiInfo && <div data-testid="ai-filled"><Notice kind="ok">{aiInfo}</Notice></div>}
          {aiUnmatched.length > 0 && (
            <div data-testid="ai-unmatched" className="rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs space-y-2">
              <p className="font-bold text-amber-900 dark:text-amber-200">AI could not match {aiUnmatched.length === 1 ? 'this item' : `these ${aiUnmatched.length} items`}. Pick the item, or remove it:</p>
              {aiUnmatched.map((l, i) => (
                <div key={`${i}-${l.nameAsWritten}`} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold text-[#111827] dark:text-white" dir="auto">“{l.nameAsWritten}” × {l.qty}{l.rate != null ? ` @ ${l.rate}` : ''}</span>
                  <select aria-label={`Item for ${l.nameAsWritten}`} defaultValue="" onChange={(e) => addUnmatched(i, e.target.value)} className={`${inputCls} !w-auto max-w-full`}>
                    <option value="">Pick item…</option>
                    {sortedProducts.map((x) => <option key={x.id} value={x.id}>{x.name}{x.code ? ` • ${x.code}` : ''}</option>)}
                  </select>
                  <button type="button" onClick={() => setAiUnmatched((prev) => prev.filter((_, j) => j !== i))} className={`${secondaryBtn} !px-2.5`} aria-label={`Remove ${l.nameAsWritten}`}><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}

          {/* ---- Entry row + grid: one ruled sheet ---- */}
          <div>
            <LedgerGrid
              ariaLabel="Invoice lines"
              testId="bill-grid"
              columns={showItemDisc ? LINE_COLUMNS : LINE_COLUMNS_NO_DISC}
              minWidth={1090}
              minRows={12}
              empty="No lines yet. Type the code (or pick the product), Qty and Rate, then Enter."
              entry={{
                editing: editingLine,
                props: { 'data-entry': true, 'data-row': entry.key, 'data-testid': 'bill-entry' },
                cells: {
                  code: <CodeBox key={entry.key} id="bill-entry-code" label={`Code ${n}`} items={sortedProducts} value={entry.productId} onPick={(v) => pickProduct(entry.key, v)} fallback={productByName} onEnter={onLineCodeEnter} inputClassName={ledgerInputCls} />,
                  name: (
                    <QuickSelect aria-label={`Item ${n}`} data-nav="item" value={entry.productId} options={productOptions} onPick={(v) => pickProduct(entry.key, v)} className={ledgerSelectCls} title="Type the item name or code to find it">
                      <option value="">Select item…</option>
                      {sortedProducts.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}{x.code ? ` • ${x.code}` : ''}</option>
                      ))}
                    </QuickSelect>
                  ),
                  unit: (
                    <select aria-label={`Unit ${n}`} data-nav="unit" value={entry.inPack ? 'pack' : 'unit'} onChange={(e) => setUnit(entry.key, e.target.value === 'pack')} disabled={!hasPack(ep)} className={ledgerSelectCls}>
                      <option value="unit">{ep ? ep.unit || 'pcs' : 'Unit'}</option>
                      {ep && hasPack(ep) && <option value="pack">{`${ep.packName} (${ep.packSize})`}</option>}
                    </select>
                  ),
                  desc: <input aria-label={`Description ${n}`} data-nav="desc" value={entry.desc} onChange={(e) => setRow(entry.key, { desc: e.target.value })} className={ledgerInputCls} placeholder="optional" />,
                  qty: <input aria-label={`Quantity ${n}`} data-nav="qty" type="number" inputMode="decimal" min="0" step="any" value={entry.qty} onChange={(e) => setRow(entry.key, { qty: e.target.value })} className={ledgerNumCls} placeholder="Qty" title={ep ? `Qty (${unitWord})` : 'Qty'} />,
                  rate: <input aria-label={`Price ${n}`} data-nav="price" type="number" inputMode="decimal" min="0" step="any" value={entry.price} onChange={(e) => setRow(entry.key, { price: e.target.value, priceFrom: 'typed' })} className={ledgerNumCls} placeholder={ep ? `per ${unitWord}` : 'Rate'} title={ep ? `Rate per ${unitWord}` : 'Rate'} />,
                  amount: <span className={`block leading-8 px-1 ${moneyCls} text-[#374151] dark:text-[#CBD5E1]`}><span data-testid="entry-amount">{fmt2(entryLine?.gross || 0)}</span></span>,
                  disc: (
                    <div className="flex gap-1">
                      <input id={`disc-${entry.key}`} aria-label={`Discount ${n}`} data-nav="disc" type="number" inputMode="decimal" min="0" step="any" value={entry.disc} onChange={(e) => setRow(entry.key, { disc: e.target.value })} className={`${ledgerNumCls} flex-1`} placeholder={entryLine?.fromBillPct || entryLine?.schemePct ? `${entryLine.discValue}%` : '0'} />
                      <span role="group" aria-label={`Discount type ${n}`} title="Rs. or % off this line" className="shrink-0 inline-flex flex-col rounded-md border border-[#D9D8D2] dark:border-[#2A3E57] overflow-hidden text-[9px] font-bold leading-none h-8">
                        {(['rs', 'pct'] as const).map((t) => (
                          <button key={t} type="button" tabIndex={-1} aria-pressed={entry.discType === t} onClick={() => setRow(entry.key, { discType: t })} className={`flex-1 px-1.5 ${entry.discType === t ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : 'text-[#6B7280] dark:text-[#94A3B8]'}`}>{t === 'rs' ? 'Rs.' : '%'}</button>
                        ))}
                      </span>
                    </div>
                  ),
                  net: <span className={`block leading-8 px-1 ${moneyCls} font-bold text-[#111827] dark:text-white`}><span data-testid={`line-amount-${n}`}>{fmt2(entryLine?.amount || 0)}</span></span>,
                  act: null,
                },
                below: (entry.priceFrom === 'customer' && entry.productId) || ep || entryLine?.schemePct || entryNote ? (
                  <>
                    {ep && (
                      <div data-testid={`line-info-${n}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                        {entry.priceFrom === 'customer' && entry.productId && <span data-testid={`customer-rate-${n}`} className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Customer rate</span>}
                        {entryLine.pack > 1 && entryLine.qty > 0 && <span className="font-semibold text-[#374151] dark:text-[#CBD5E1]">= {formatPackQty(entryLine.qty, ep)} • {rs(Math.round(entryLine.price * 100) / 100)}/{ep.unit || 'pcs'}</span>}
                        <span>Stock <strong className={`tabular-nums ${ep.stockKg < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-[#374151] dark:text-[#CBD5E1]'}`}>{formatPackQty(ep.stockKg, ep, 'short')}</strong></span>
                        {epPer && godowns.map((g) => <span key={g.id}>{g.name}: <strong className="tabular-nums">{formatPackQty(epPer[g.id] || 0, ep, 'short')}</strong></span>)}
                        {last && (
                          <button type="button" tabIndex={-1} onClick={() => setRow(entry.key, { price: shownPrice(ep.id, last.rate, entry.inPack), priceFrom: 'typed' })} className="hover:text-teal-700 dark:hover:text-teal-300" title="Use this rate">
                            Last rate <strong className="tabular-nums text-[#374151] dark:text-[#CBD5E1]">{rs(last.rate)}/{ep.unit || 'pcs'}</strong> ({formatDate(last.date)})
                          </button>
                        )}
                        {entryLine.lineDisc > 0 && <span>Disc − {rs(entryLine.lineDisc)}{entryLine.fromBillPct ? ` (bill ${entryLine.discValue}%)` : ''}</span>}
                      </div>
                    )}
                    {!ep && entry.priceFrom === 'customer' && entry.productId && <span data-testid={`customer-rate-${n}`} className="block text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Customer rate</span>}
                    {entryLine?.schemePct && (
                      <div data-testid={`scheme-pct-${n}`} className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                        <Gift className="w-3.5 h-3.5" /> Scheme “{entryLine.schemePct.schemeName}”: {entryLine.schemePct.pct}% off (− {rs(entryLine.lineDisc)})
                        <button type="button" tabIndex={-1} onClick={() => drop(`pct|${entryLine.schemePct!.schemeId}|${entryLine.key}`)} className="underline text-[#6B7280] dark:text-[#94A3B8] hover:text-rose-600" aria-label={`Remove scheme discount on item ${n}`}>remove</button>
                      </div>
                    )}
                    {entryNote && <div data-testid={`stock-note-${n}`} className={`text-[11px] font-semibold ${entryNote.block ? 'text-rose-700 dark:text-rose-300' : entryNote.warn ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{entryNote.text}</div>}
                  </>
                ) : undefined,
              }}
              rows={committed.map(({ l, idx }) => {
                const p = l.product;
                const active = l.key === activeKey;
                const note = active ? null : stockNote(l, idx);
                const uw = p ? (l.pack > 1 ? p.packName! : p.unit || 'pcs') : '';
                return {
                  key: l.key,
                  testId: 'bill-line',
                  label: `Line ${idx + 1}: ${p?.name || ''}`,
                  selected: active,
                  onActivate: () => loadLine(l.key),
                  onDelete: () => removeLine(l.key),
                  cells: {
                    code: <span className="text-[#6B7280] dark:text-[#94A3B8]">{p?.code || '—'}</span>,
                    name: <span className="font-semibold">{p?.name}</span>,
                    unit: <span className="text-xs">{uw}</span>,
                    desc: <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{l.desc}</span>,
                    qty: l.rawQty,
                    rate: fmt2(l.typedPrice),
                    amount: fmt2(l.gross),
                    disc: l.lineDisc > 0 ? <span className="text-xs">{fmt2(l.lineDisc)}{l.discType === 'pct' ? ` (${l.discValue}%)` : ''}</span> : '',
                    net: <span className="font-bold" {...(active ? {} : { 'data-testid': `line-amount-${idx + 1}` })}>{fmt2(l.amount)}</span>,
                    act: <button type="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); removeLine(l.key); }} aria-label={`Remove item ${idx + 1}`} className="inline-flex w-6 h-6 items-center justify-center rounded text-[#9CA3AF] hover:text-rose-600 align-middle"><Trash2 className="w-3.5 h-3.5" /></button>,
                  },
                  sub: (l.schemePct && !active) || note || (l.ai?.check && !active) ? (
                    <>
                      {l.ai?.check && !active && <div data-testid={`ai-check-${idx + 1}`} className="text-[11px] font-semibold leading-5 whitespace-normal text-amber-700 dark:text-amber-300">AI: check this line (written “{bidi(l.ai.written)}”)</div>}
                      {l.schemePct && !active && <div className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 leading-5">Scheme “{l.schemePct.schemeName}” {l.schemePct.pct}%</div>}
                      {note && <div data-testid={`stock-note-${idx + 1}`} className={`text-[11px] font-semibold leading-5 whitespace-normal ${note.block ? 'text-rose-700 dark:text-rose-300' : note.warn ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{note.text}</div>}
                    </>
                  ) : undefined,
                };
              })}
              totals={{
                testId: 'bill-grid-totals',
                cells: {
                  desc: <TotalsLabel />,
                  qty: Math.round(committedLines.reduce((a, l) => a + l.typedQty, 0) * 10000) / 10000,
                  amount: fmt2(round2(committedLines.reduce((a, l) => a + l.gross, 0))),
                  disc: fmt2(round2(committedLines.reduce((a, l) => a + l.lineDisc, 0))),
                  net: fmt2(round2(committedLines.reduce((a, l) => a + l.amount, 0))),
                },
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => commitEntry()} title="Put the line in the grid (Enter on Rate, + or Alt+N)" className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 dark:text-teal-300 hover:underline">{editingLine ? 'Update line' : 'Add another item'}</button>
              {editingLine && <button type="button" onClick={() => setActiveKey(newRowOf(rows).key)} className="text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:underline">Done with line {n}</button>}
              <ScanButton onPick={(p) => addScanned(p.id)} keepOpen />
              <button type="button" onClick={() => setAiOpen(true)} className={`${secondaryBtn} !py-1.5`} data-testid="bill-ai" title="Read a photo of a handwritten parchi or a pasted WhatsApp order into the lines (AI)"><Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-300" /> AI: from photo / message</button>
              {ep && (
                <span data-testid="bill-stock-in-hand" className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                  <span className="font-bold uppercase tracking-wider text-[10px]">Stock in hand</span> {ep.name}: <strong className="tabular-nums text-[#111827] dark:text-white">{formatPackQty(ep.stockKg, ep)}</strong>
                  {selected && <> • Party balance <strong className="tabular-nums">{rs(selected.totalDue)}</strong></>}
                </span>
              )}
            </div>
          </div>
          {products.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">No items yet. Add your products with their prices on the Items screen first.</p>}
          {freeLines.length > 0 && (
            <div className="rounded-2xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 p-2.5 space-y-1.5" data-testid="bill-free-lines">
              <div className="text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> Free goods (scheme)</div>
              {freeLines.map((f) => (
                <div key={f.key} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0"><span className="font-semibold text-[#111827] dark:text-white">{f.product!.name}</span> <span className="tabular-nums">× {formatPackQty(f.qty, f.product!)}</span><span className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{f.schemeName} • price 0 • stock goes out at cost</span></span>
                  <span className="text-xs font-bold text-teal-700 dark:text-teal-300">FREE</span>
                  <button type="button" onClick={() => drop(f.key)} aria-label={`Remove free ${f.product!.name}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {freeShort && <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">Not enough {freeShort.product!.name} in stock for the free goods.</p>}
            </div>
          )}
          {droppedCount > 0 && <button type="button" onClick={() => setDropped(new Set())} className="text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline">Put back the removed scheme{droppedCount === 1 ? '' : 's'} ({droppedCount})</button>}

          {/* ---- Payment Method (left) and totals (right) ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4">
            <div className="space-y-3 min-w-0">
              {editInv ? (
                <div data-testid="bill-payments-saved">
                  <div className={`${hdr} mb-1`}>Payment Method</div>
                  <LedgerGrid
                    ariaLabel="Payments on this bill"
                    columns={SAVED_PAY_COLUMNS}
                    minWidth={560}
                    minRows={4}
                    empty="Nothing received on this bill yet."
                    rows={savedPays.map((p) => ({
                      key: p.id,
                      testId: 'bill-saved-pay',
                      inert: true,
                      cells: {
                        receipt: <span className="text-[#6B7280] dark:text-[#94A3B8]" data-testid="bill-saved-pay-no">{p.receiptNo}</span>,
                        code: <span className="text-[#6B7280] dark:text-[#94A3B8]">{p.code}</span>,
                        title: accName(p.code),
                        debit: <span className="font-bold">{fmt2(p.amount)}</span>,
                        narration: <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{p.note}</span>,
                      },
                    }))}
                    totals={{ cells: { title: <TotalsLabel />, debit: fmt2(alreadyPaid) } }}
                  />
                  <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-[#6B7280] dark:text-[#94A3B8] px-1" data-testid="bill-edit-paid">
                    <span>Money already received stays on this bill (change a payment from the bill: Edit payment).</span>
                    <span>Received <strong className="tabular-nums text-[#111827] dark:text-white">{rs(alreadyPaid)}</strong></span>
                  </div>
                </div>
              ) : cash ? (
                <div className="rounded-2xl border border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/20 px-3.5 py-2.5 text-xs text-teal-900 dark:text-teal-200" data-testid="cash-sale-paid">Paid in cash: <strong className="tabular-nums">{rs(total)}</strong> goes into Cash in hand.</div>
              ) : (
                <div data-testid="bill-payments">
                  <div className={`${hdr} mb-1`}>Payment Method</div>
                  <LedgerGrid
                    ariaLabel="Payments"
                    columns={PAY_COLUMNS}
                    minWidth={560}
                    minRows={4}
                    entry={{
                      editing: payEntry.committed,
                      props: { 'data-pay-entry': true },
                      cells: {
                        code: <CodeBox key={payEntry.key} id="bill-pay-code" label="Payment code" items={payAccs.map((a) => ({ id: a.code, code: a.code }))} value={payEntry.code} onPick={(v) => setPay(payEntry.key, { code: v })} skipAutofocus nextId="bill-paid" inputClassName={ledgerInputCls} />,
                        title: (
                          <select id="bill-pay-account" aria-label="Payment account" data-nav="pay-title" value={payEntry.code} onChange={(e) => setPay(payEntry.key, { code: e.target.value })} className={ledgerSelectCls}>
                            {payAccs.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                          </select>
                        ),
                        debit: (
                          <div className="flex gap-1 min-w-0">
                            <input id="bill-paid" aria-label="Paid now" title="Debit: money received now into this account" data-nav="paid" type="number" inputMode="decimal" min="0" step="any" value={payEntry.amount} onChange={(e) => setPay(payEntry.key, { amount: e.target.value })} className={`${ledgerNumCls} flex-1`} placeholder="0" />
                            <button type="button" tabIndex={-1} onClick={() => setPay(payEntry.key, { amount: String(Math.max(0, round2(total - (payTotal - (parseFloat(payEntry.amount) || 0))))) })} className="shrink-0 h-8 px-1.5 rounded-md border border-[#D9D8D2] dark:border-[#2A3E57] text-[11px] font-bold text-teal-700 dark:text-teal-300" title="The rest of the bill">Full</button>
                          </div>
                        ),
                        narration: <input id="bill-pay-note" aria-label="Narration" data-nav="pay-note" value={payEntry.note} onChange={(e) => setPay(payEntry.key, { note: e.target.value })} className={ledgerInputCls} placeholder="optional" />,
                        act: null,
                      },
                    }}
                    rows={payCommitted.map((p) => ({
                      key: p.key,
                      testId: 'bill-pay-line',
                      selected: p.key === activePay,
                      label: `Payment ${accName(p.code)}`,
                      onActivate: () => { setActivePay(p.key); focusSoon('#bill-paid'); },
                      onDelete: () => removePay(p.key),
                      cells: {
                        code: <span className="text-[#6B7280] dark:text-[#94A3B8]">{p.code}</span>,
                        title: accName(p.code),
                        debit: <span className="font-bold">{fmt2(parseFloat(p.amount) || 0)}</span>,
                        narration: <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{p.note}</span>,
                        act: <button type="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); removePay(p.key); }} aria-label={`Remove payment ${accName(p.code)}`} className="inline-flex w-6 h-6 items-center justify-center rounded text-[#9CA3AF] hover:text-rose-600 align-middle"><Trash2 className="w-3.5 h-3.5" /></button>,
                      },
                    }))}
                    totals={{ cells: { title: <TotalsLabel>Total received</TotalsLabel>, debit: <span data-testid="bill-pay-total" title={rs(payTotal)}>{fmt2(payTotal)}</span> } }}
                  />
                  <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-[#6B7280] dark:text-[#94A3B8] px-1">
                    <button type="button" onClick={commitPay} className="font-bold text-teal-700 dark:text-teal-300 hover:underline">Add payment line</button>
                    <span>Enter on Narration puts the line in the grid.</span>
                  </div>
                  {hasCheque && <div className="mt-2 grid grid-cols-2 gap-2"><ChequeFieldsInput value={cheque} onChange={setCheque} idPrefix="bill-chq" narrow /></div>}
                  {payError && <p role="alert" className="mt-1 text-[11px] font-bold text-rose-700 dark:text-rose-300">{payError}</p>}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={cash ? '' : 'sm:col-span-2'}>
                  <label className={labelCls} htmlFor="bill-notes">Remarks</label>
                  <input id="bill-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="optional" />
                </div>
                {cash && (
                  <div>
                    <label className={labelCls} htmlFor="bill-walkin">Customer:</label>
                    <input id="bill-walkin" value={walkIn} onChange={(e) => setWalkIn(e.target.value)} className={inputCls} placeholder="Walk-in customer name (optional)" />
                  </div>
                )}
                <CostCentreSelect id="bill-centre" value={costCentre} onChange={setCostCentre} />
              </div>
            </div>
            <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className={small}>Qty total</span><div className="tabular-nums font-bold text-[#111827] dark:text-white" data-testid="bill-qty-total">{qtyTotal}</div></div>
                <div className="text-right"><span className={small}>Amount total</span><div className="tabular-nums font-bold text-[#111827] dark:text-white" data-testid="bill-amount-total">{rs(subtotal)}</div></div>
              </div>
              <div>
                <label className={small} htmlFor="bill-freight">Others Charges</label>
                <input id="bill-freight" type="number" inputMode="decimal" min="0" step="any" value={freight} onChange={(e) => setFreight(e.target.value)} className={numInputCls} placeholder="0 (freight / loading)" />
              </div>
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 items-end">
                <div>
                  <label className={small} htmlFor="bill-lumsum-pct">Carriage Exp %</label>
                  <input id="bill-lumsum-pct" type="number" inputMode="decimal" min="0" max="100" step="any" value={lumsumPct} onChange={(e) => { setLumsumPct(e.target.value); if (e.target.value) setDiscount(''); }} className={numInputCls} placeholder="%" />
                </div>
                <div>
                  <label className={small} htmlFor="bill-discount">Carriage Expenses (Rs.)</label>
                  <input id="bill-discount" type="number" inputMode="decimal" min="0" step="any" value={lumsumPctNum > 0 ? String(disc) : discount} readOnly={lumsumPctNum > 0} onChange={(e) => setDiscount(e.target.value)} className={numInputCls} placeholder="0" />
                </div>
              </div>
              <div>
                <label className={small} htmlFor="bill-vehicle">Vehicle Charges</label>
                <input id="bill-vehicle" type="number" inputMode="decimal" min="0" step="any" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={numInputCls} placeholder="0" />
              </div>
              <label className="flex items-center gap-2 text-xs text-[#6B7280] dark:text-[#94A3B8]">
                <input type="checkbox" checked={showItemDisc} disabled={itemDiscInUse} onChange={(e) => { setItemDiscOn(e.target.checked); try { localStorage.setItem(ITEM_DISC_KEY, e.target.checked ? '1' : '0'); } catch { /* private mode */ } }} />
                Discount on each item too
              </label>
              {taxRate > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>{settings.taxLabel || 'Tax'} {taxRate}%</span><span className="tabular-nums">{rs(tax)}</span></div>}
              <div className="flex justify-between font-extrabold text-[#111827] dark:text-white border-t border-[#E5E5E1] dark:border-[#203248] pt-2"><span>Bill Total</span><span className="tabular-nums" data-testid="bill-total">{rs(total)}</span></div>
              {!cash && <div className="flex justify-between text-xs text-[#6B7280] dark:text-[#94A3B8]"><span>{editInv ? 'Received' : 'Paid now'}</span><span className="tabular-nums">{rs(paid)}</span></div>}
              <div className={`flex justify-between font-extrabold rounded-xl px-2.5 py-2 ${balance > 0 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200' : 'bg-teal-100 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200'}`}><span>{balance > 0 ? 'Balance (credit)' : 'Balance'}</span><span className="tabular-nums" data-testid="bill-balance">{rs(balance)}</span></div>
              {change > 0 && <div className="flex justify-between text-xs font-bold text-indigo-700 dark:text-indigo-300"><span>Change to return</span><span className="tabular-nums">{rs(change)}</span></div>}
            </div>
          </div>
        </div>
      </Modal>
      <SearchPartyDialog
        isOpen={Boolean(partySearch)}
        parties={customers}
        cities={cityList}
        initialText={partySearch?.text || ''}
        onClose={() => { setPartySearch(null); focusSoon('#bill-customer-code'); }}
        onPick={(id) => { pickCustomer(id); setPartySearch(null); focusSoon('[data-entry] [data-code]'); }}
      />
      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete bill ${editInv?.invoiceNumber || ''}?`}
        message="The stock goes back, the customer's account and the books are reversed. This cannot be undone here (see Deleted records)."
        details={editInv ? [`Bill total ${rs(editInv.totalAmount)}`, `Customer: ${editInv.customerName}`] : []}
        confirmLabel={billDeleteNeedsApproval ? 'Delete bill (ask manager)' : 'Delete bill'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
      <BillFromAiDialog isOpen={isOpen && aiOpen} onClose={() => setAiOpen(false)} onApply={applyAi} customers={customers} products={products} invoices={invoices} />
      <Modal isOpen={preview} onClose={() => setPreview(false)} title="Invoice preview" subtitle={`${computerNo} • ${formatDate(date)} • not saved yet`} wide>
        <div className="space-y-3 text-sm" data-testid="bill-preview">
          <div className="flex justify-between"><span className="font-bold">{selected?.name || newCustomer?.name || (cash ? `Cash Sale${walkIn ? ` — ${walkIn}` : ''}` : '—')}</span><span>{memoNo ? `Memo ${memoNo}` : ''}</span></div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[#6B7280]"><th className="py-1">Product</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Disc</th><th className="text-right">Net</th></tr></thead>
            <tbody>
              {used.map((l) => <tr key={l.key} className="border-t border-[#F1F0EC] dark:border-[#1E2E40]"><td className="py-1">{l.product?.name}{l.desc ? ` — ${l.desc}` : ''}</td><td className="text-right tabular-nums">{l.rawQty} {l.pack > 1 ? l.product?.packName : l.product?.unit}</td><td className="text-right tabular-nums">{l.rawPrice}</td><td className="text-right tabular-nums">{l.lineDisc > 0 ? rs(l.lineDisc) : ''}</td><td className="text-right tabular-nums font-bold">{rs(l.amount)}</td></tr>)}
              {freeLines.map((f) => <tr key={f.key}><td className="py-1">{f.product!.name} (free)</td><td className="text-right tabular-nums">{f.qty}</td><td /><td /><td className="text-right">0</td></tr>)}
            </tbody>
          </table>
          <div className="ml-auto max-w-xs space-y-1">
            <div className="flex justify-between"><span>Amount</span><span className="tabular-nums">{rs(subtotal)}</span></div>
            {disc > 0 && <div className="flex justify-between"><span>Carriage expenses</span><span className="tabular-nums">− {rs(disc)}</span></div>}
            {freightAmt > 0 && <div className="flex justify-between"><span>Others charges</span><span className="tabular-nums">{rs(freightAmt)}</span></div>}
            {vehicleAmt > 0 && <div className="flex justify-between"><span>Vehicle charges</span><span className="tabular-nums">{rs(vehicleAmt)}</span></div>}
            <div className="flex justify-between font-bold"><span>Bill total</span><span className="tabular-nums">{rs(total)}</span></div>
            <div className="flex justify-between"><span>Paid</span><span className="tabular-nums">{rs(paid)}</span></div>
            <div className="flex justify-between font-bold"><span>Balance</span><span className="tabular-nums">{rs(balance)}</span></div>
          </div>
          <div className="flex justify-end"><button type="button" onClick={() => setPreview(false)} className={secondaryBtn}><Printer className="w-4 h-4" /> Back to the invoice</button></div>
        </div>
      </Modal>
    </>
  );
};
