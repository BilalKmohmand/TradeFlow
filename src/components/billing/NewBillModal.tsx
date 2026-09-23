import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Printer, Save, UserPlus, Percent, SplitSquareHorizontal, Keyboard, Gift, Search, Truck } from 'lucide-react';
import { useTrading, BILL_PAYMENT_METHODS, CreateBillItemInput } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice, rs } from './ui';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { creditCheck } from '../../utils/credit';
import { BillCreditPanel } from './CreditLimit';
import { planBillStock, batchLines, stockByGodown } from '../../utils/inventory';
import { lineDiscountAmount, quotationLines } from '../../utils/salesDocs';
import { customerSnapshot, lastRateFor, resolveBillPayments, PaymentPart } from '../../utils/billing';
import { hasPack, formatPackQty, plural, baseToPacks } from '../../utils/packUnits';
import { QuickSelect, PickOption } from './QuickPick';
import { CodeBox } from './CodeBox';
import { ScanButton } from './purchasing/Barcodes';
import { ChequeFieldsInput, ChequeFields, emptyChequeFields } from './ChequeForms';
import { evaluateSchemes } from '../../utils/salesExtras';
import { CostCentreSelect } from '../finance/common';
import { isPendingApproval } from '../../context/controlActions';
import { BankSelect, bankOpt } from './BankSelect';
import { needsBank } from '../../utils/banks';
import { allCities, filterParties } from '../../utils/vouchers';
import { useBillingUI } from './BillingUI';

/** Bill line columns on wider screens: Code · Item · Qty · Price · Amount · remove. */
const LINE_COLS = 'sm:grid-cols-[6.5rem_minmax(10rem,1fr)_6.5rem_7.5rem_8rem_2.5rem]';

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
  /** Qty and price are typed per pack (e.g. per carton) instead of per base unit. */
  inPack: boolean;
  /** Where the price came from: the item's list price, the customer's agreed rate, or typed in. */
  priceFrom: 'list' | 'customer' | 'typed';
  /** Line discount, shown once the shopkeeper taps "Discount" on the line. */
  showDisc: boolean;
  discType: 'rs' | 'pct';
  disc: string;
}

const newRow = (patch: Partial<Row> = {}): Row => ({ key: Math.random().toString(36).slice(2), productId: '', qty: '1', price: '', inPack: false, priceFrom: 'list', showDisc: false, discType: 'rs', disc: '', ...patch });

/** Methods for the non-cash part of a split payment (the cheque has its own box). */
const BANK_METHODS = BILL_PAYMENT_METHODS.filter((m) => m !== 'Cash' && m !== 'Cheque');
const num4 = (n: number) => String(Math.round(n * 10000) / 10000);

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
 *
 * Keyboard (desktop): Enter moves customer → item → qty → price → next line; an empty item line
 * + Enter jumps to "Paid now". Ctrl+Enter or F9 saves; "+" or Alt+N adds a line. Item and
 * customer lists can be searched by typing a name or code.
 */
export const NewBillModal: React.FC<Props> = ({ isOpen, onClose, customerId, quotationId }) => {
  const { customers, products, settings, createBill, setPrintRequest, can, godowns, stockBatches, quotations, getCustomerAgreedRate, invoices, ledger, salesmen, areas, schemes, billApprovalReasons, approvalRules, canApprove, previewDocNumber } = useTrading();
  const ui = useBillingUI();
  // Apna Accountant fields: memo (book) no., delivery order, and Search for an old bill by number.
  const [memoNo, setMemoNo] = useState('');
  const [deliveryOrder, setDeliveryOrder] = useState(false);
  const [find, setFind] = useState('');
  /** Line whose item the "Stock in hand" box shows (the one being typed in). */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // Set once the bill was sent to a manager (approval rules): nothing is posted until approved.
  const [sentForApproval, setSentForApproval] = useState('');
  const quote = quotationId ? quotations.find((q) => q.id === quotationId) : undefined;
  const [godownId, setGodownId] = useState(godowns[0]?.id || '');
  const [customer, setCustomer] = useState(quote?.customerId || customerId || '');
  // Salesman and area on the bill start as the customer's defaults (can be changed per bill).
  const startCust = customers.find((c) => c.id === (quote?.customerId || customerId || ''));
  const [salesmanId, setSalesmanId] = useState(startCust?.salesmanId || '');
  const [areaId, setAreaId] = useState(startCust?.areaId || '');
  const [freight, setFreight] = useState('');
  // Scheme lines / scheme discounts the shopkeeper took off this bill.
  const [dropped, setDropped] = useState<Set<string>>(() => new Set());
  const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [date, setDate] = useState(todayISO());
  // A quotation fills the lines at the quoted prices; otherwise one empty line.
  const [rows, setRows] = useState<Row[]>(() =>
    quote
      ? quotationLines(quote, (id) => products.find((p) => p.id === id)?.name).map((l) =>
          // A line quoted per carton comes onto the bill per carton too.
          l.packPrice != null && (l.packSize || 0) > 1 && hasPack(products.find((p) => p.id === l.productId))
            ? newRow({ productId: l.productId, qty: num4(baseToPacks(l.qty, l.packSize!)), price: String(l.packPrice), inPack: true, priceFrom: 'typed' })
            : newRow({ productId: l.productId, qty: String(l.qty), price: String(l.unitPrice), priceFrom: 'typed' })
        )
      : [newRow()]
  );
  const [discount, setDiscount] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [method, setMethod] = useState('Cash');
  // Split payment: cash + bank/wallet + cheque on one bill.
  const [split, setSplit] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  const [splitBank, setSplitBank] = useState('');
  const [splitBankMethod, setSplitBankMethod] = useState(BANK_METHODS[0] || 'Bank Transfer');
  const [splitCheque, setSplitCheque] = useState('');
  // Bank account the bank part goes into (only asked when the shop has more than one bank).
  const [bank, setBank] = useState('');
  // "Search party by city": narrows the customer list.
  const [billCity, setBillCity] = useState('');
  const [cheque, setCheque] = useState<ChequeFields>(emptyChequeFields());
  const [notes, setNotes] = useState(quote ? `From quotation ${quote.quoteNumber}` : '');
  const [costCentre, setCostCentre] = useState('');
  const [error, setError] = useState('');
  const [allowOver, setAllowOver] = useState(false);
  const [overReason, setOverReason] = useState('');
  const busy = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  /** After adding a line from the keyboard, put the cursor in its item field. */
  const focusRow = useRef<string | null>(null);
  const allowNegative = settings.allowNegativeStock !== false;

  const cityList = useMemo(() => allCities(settings, customers, []), [settings, customers]);
  const sortedCustomers = useMemo(() => {
    const all = [...customers].sort((a, b) => a.name.localeCompare(b.name));
    return billCity ? all.filter((c) => c.id === customer || filterParties([c], '', billCity).length > 0) : all;
  }, [customers, billCity, customer]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const customerOptions: PickOption[] = useMemo(() => sortedCustomers.map((c) => ({ value: c.id, name: c.name, code: c.code, extra: [c.phone, c.city].filter(Boolean).join(' ') })), [sortedCustomers]);
  const productOptions: PickOption[] = useMemo(() => sortedProducts.map((p) => ({ value: p.id, name: p.name, code: p.code, barcode: p.barcode })), [sortedProducts]);

  const setRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
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
        return { ...r, productId, inPack, price: shownPrice(productId, base, inPack), priceFrom };
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
          qty: Number.isFinite(q) ? num4(toPack ? baseToPacks(q, p.packSize) : q * p.packSize) : r.qty,
          price: Number.isFinite(pr) ? num4(toPack ? pr * p.packSize : pr / p.packSize) : r.price,
        };
      })
    );
  /** A scanned item (camera or USB scanner): one more on its line, else the first empty line, else a new line. */
  const addScanned = (productId: string) => {
    const same = rows.find((r) => r.productId === productId);
    if (same) return setRow(same.key, { qty: num4((parseFloat(same.qty) || 0) + 1) });
    const empty = rows.find((r) => !r.productId);
    if (empty) return pickProduct(empty.key, productId);
    const { base, priceFrom } = priceFor(productId, newCustomer ? '' : customer);
    setRows((prev) => [...prev, newRow({ productId, price: shownPrice(productId, base, false), priceFrom })]);
  };
  const removeRow = (key: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  const addRow = () => {
    const row = newRow();
    focusRow.current = row.key;
    setRows((prev) => [...prev, row]);
  };
  useEffect(() => {
    if (!focusRow.current) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-row="${focusRow.current}"] [data-nav="item"]`);
    focusRow.current = null;
    el?.focus();
  }, [rows.length]);

  const baseLines = rows.map((r) => {
    const p = products.find((x) => x.id === r.productId);
    const pack = r.inPack && hasPack(p) ? p.packSize : 1;
    // What was typed (per pack or per unit) …
    const typedQty = parseFloat(r.qty) || 0;
    const typedPrice = parseFloat(r.price) || 0;
    // … and what is stored: always the base unit.
    const qty = typedQty * pack;
    const price = pack > 1 ? typedPrice / pack : typedPrice;
    const discValue = parseFloat(r.disc) || 0;
    const lineDisc = lineDiscountAmount(typedQty, typedPrice, r.discType, discValue);
    // rawQty / rawPrice are what the fields show; qty / price are per base unit.
    return { ...r, rawQty: r.qty, rawPrice: r.price, typedQty, typedPrice, pack, qty, price, discValue, lineDisc, amount: Math.round((typedQty * typedPrice - lineDisc) * 100) / 100, product: p, schemePct: null as null | { schemeId: string; schemeName: string; pct: number } };
  });
  // Schemes: free goods and "% off above a quantity", worked out from what is on the bill.
  const schemeCustomer = newCustomer ? '' : customer;
  const qtyKey = baseLines.map((l) => `${l.productId}:${l.qty}`).join('|');
  const schemeResult = useMemo(
    () => (schemes.length ? evaluateSchemes(schemes, baseLines.map((l) => ({ productId: l.productId, qty: l.qty })), schemeCustomer, date) : { free: [], pct: {} as Record<string, { schemeId: string; schemeName: string; pct: number }> }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schemes, schemeCustomer, date, qtyKey]
  );
  // A % scheme fills the line discount unless the shopkeeper typed their own discount on that line.
  const lines = baseLines.map((l) => {
    const sp = l.productId ? schemeResult.pct[l.productId] : undefined;
    if (!sp || l.discValue > 0 || dropped.has(`pct|${sp.schemeId}|${l.key}`)) return l;
    const lineDisc = lineDiscountAmount(l.typedQty, l.typedPrice, 'pct', sp.pct);
    return { ...l, discType: 'pct' as const, discValue: sp.pct, lineDisc, amount: Math.round((l.typedQty * l.typedPrice - lineDisc) * 100) / 100, schemePct: sp };
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
    // Stock short (all godowns): refused unless the shop allows bills to take stock below zero.
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
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const lineDiscTotal = lines.reduce((a, l) => a + l.lineDisc, 0);
  const disc = Math.min(Math.max(0, parseFloat(discount) || 0), subtotal);
  const taxRate = settings.taxRatePct ?? 0;
  const tax = ((subtotal - disc) * taxRate) / 100;
  const freightAmt = Math.max(0, parseFloat(freight) || 0);
  const total = Math.round((subtotal - disc + tax + freightAmt) * 100) / 100;

  // What was paid now: one method, or split across cash / bank / cheque.
  const amt = (s: string) => Math.max(0, parseFloat(s) || 0);
  const payParts: PaymentPart[] = split ? [{ method: 'Cash', amount: amt(splitCash) }, { method: splitBankMethod, amount: amt(splitBank), ...bankOpt(bank) }] : method === 'Cheque' ? [] : [{ method, amount: amt(paidNow), ...(needsBank(method) ? bankOpt(bank) : {}) }];
  const chequeAmount = split ? amt(splitCheque) : method === 'Cheque' ? amt(paidNow) : 0;
  const payment = resolveBillPayments(total, payParts, chequeAmount);
  const given = payParts.reduce((a, p) => a + p.amount, 0) + chequeAmount;
  const paid = payment.error ? Math.min(given, total) : payment.paid;
  const balance = Math.round((total - paid) * 100) / 100;
  const change = payment.error ? 0 : payment.change;
  const hasCheque = chequeAmount > 0;
  // A typed "new" customer that matches an existing one (same name or phone) is that customer, as on save.
  const typedMatch = newCustomer
    ? customers.find((c) => c.name.trim().toLowerCase() === newCustomer.name.trim().toLowerCase() || (newCustomer.phone.trim() && c.phone.replace(/\D/g, '') === newCustomer.phone.replace(/\D/g, '')))
    : undefined;
  const selected = newCustomer ? typedMatch : customers.find((c) => c.id === customer);
  const credit = creditCheck(newCustomer ? typedMatch || null : selected, balance);
  const canOverride = can('override_credit');
  // Approval rule "bill over credit limit": staff who can't allow it send the bill to a manager instead.
  const creditToApproval = Boolean(approvalRules.creditLimit) && !canOverride && !canApprove;
  const creditBlocked = credit.over && !creditToApproval && !(canOverride && allowOver && overReason.trim());
  const approvalWhy = billApprovalReasons({
    customerId: newCustomer ? '' : customer,
    newCustomer: newCustomer || undefined,
    items: lines.filter((l) => l.productId && l.qty > 0).map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.price, ...(l.lineDisc > 0 ? { discountType: l.discType, discountValue: l.discValue } : {}), ...(l.schemePct ? { schemeId: l.schemePct.schemeId } : {}) })),
    discount: disc,
    freightCharges: freightAmt,
    payments: payment.parts,
    ...(hasCheque ? { cheque: { amount: chequeAmount, ...cheque } } : {}),
    date,
  });
  // Stock the bill can't be made from (short stock, batches, expired stock, another godown): Save waits until it is fixed.
  // Free goods take stock too: when short stock is not allowed, the bill waits until the free qty fits.
  const freeShort = !allowNegative ? freeLines.find((f) => lines.filter((l) => l.product?.id === f.productId).reduce((a, l) => a + l.qty, 0) + freeLines.filter((x) => x.productId === f.productId).reduce((a, x) => a + x.qty, 0) > (f.product!.stockKg || 0) + 0.0001) : undefined;
  const stockBlocked = lines.some((l, idx) => stockNote(l, idx)?.block) || Boolean(freeShort);
  const saveBlocked = creditBlocked || stockBlocked || Boolean(sentForApproval);
  const blockedWhy = stockBlocked ? 'Not enough stock for this bill' : creditBlocked ? 'Over the credit limit' : undefined;
  const snapshot = useMemo(() => (selected ? customerSnapshot(selected.id, invoices, ledger) : null), [selected, invoices, ledger]);
  // Any change to the bill clears an old error message.
  React.useEffect(() => { setError(''); }, [customer, newCustomer, rows, discount, paidNow, method, godownId, allowOver, overReason, split, splitCash, splitBank, splitCheque, cheque, freight, salesmanId, areaId, dropped]);

  const submit = (print: boolean) => {
    if (busy.current) return; // a double tap must not make two bills
    setError('');
    if (newCustomer && !newCustomer.name.trim()) return setError('Enter the new customer name.');
    if (!newCustomer && !customer) return setError('Pick a customer (or add a new one).');
    if (lines.some((l) => l.productId && l.price < 0)) return setError('A price cannot be negative.');
    if (total <= 0) return setError('The bill total must be more than zero.');
    const items = lines.filter((l) => l.productId && l.qty > 0);
    if (items.length === 0) return setError('Add at least one item with a quantity.');
    if (payment.error) return setError(payment.error);
    if (hasCheque && (!cheque.chequeNumber.trim() || !cheque.bankName.trim())) return setError('Enter the cheque number and bank.');
    if (stockBlocked) return setError(lines.map((l, i) => stockNote(l, i)).find((n) => n?.block)?.text || (freeShort ? `Not enough ${freeShort.product!.name} in stock for the free goods. Receive the stock first, or remove the free line.` : 'Not enough stock.'));
    if (credit.over && !creditToApproval && !(canOverride && allowOver)) return setError(canOverride ? 'This bill is over the credit limit. Tick "Allow over limit" and give a reason, or take more payment now.' : 'This bill is over the customer\'s credit limit. Take more payment now, or ask a manager to allow it.');
    if (credit.over && !creditToApproval && !overReason.trim()) return setError('Write a short reason for allowing this bill over the credit limit.');
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
        ...(l.pack > 1 ? { packPrice: l.typedPrice } : {}),
        ...(l.schemePct ? { schemeId: l.schemePct.schemeId, schemeName: l.schemePct.schemeName } : {}),
      } as CreateBillItemInput)).concat(freeLines.map((f) => ({ productId: f.productId, name: f.product!.name, qty: f.qty, unitPrice: 0, unit: f.product!.unit, free: true, schemeId: f.schemeId, schemeName: f.schemeName }))),
      freightCharges: freightAmt,
      ...(salesmen.length ? { salesmanId: salesmanId || null } : {}),
      ...(areas.length ? { areaId: areaId || null } : {}),
      quotationId: quote?.id,
      discount: disc,
      payments: payment.parts,
      paymentMethod: split ? undefined : method,
      ...(hasCheque ? { cheque: { amount: chequeAmount, ...cheque } } : {}),
      notes,
      date,
      ...(credit.over ? { allowOverLimit: allowOver, overrideReason: overReason } : approvalWhy && overReason.trim() ? { overrideReason: overReason } : {}),
      godownId: godowns.length > 1 ? godownId : undefined,
      ...(costCentre ? { costCentreId: costCentre } : {}),
      ...(memoNo.trim() ? { memoNo: memoNo.trim() } : {}),
      ...(deliveryOrder ? { deliveryOrder: true } : {}),
    });
    if (!result.success) {
      busy.current = false;
      return setError(result.message);
    }
    // Waiting for approval: say so and keep the dialog (Save stays off, so it can't be sent twice).
    if (isPendingApproval(result)) return setSentForApproval(result.message);
    onClose();
    if (print && result.invoice) setPrintRequest({ type: 'bill', invoiceId: result.invoice.id });
  };

  /** Search: open an old bill by its number (the new bill is left). */
  const searchBill = () => {
    const hit = findBillByNumber(invoices, find);
    if (!hit) return setError(`No bill “${find.trim()}”. Type the bill number, e.g. ${invoices[0]?.invoiceNumber || 'INV-12'} or just its digits.`);
    onClose();
    ui.openBill(hit.id);
  };
  const computerNo = previewDocNumber('bill', date);
  const focused = lines.find((l) => l.key === focusKey && l.product) || lines.find((l) => l.product);
  const focusedPer = focused?.product && godowns.length > 1 ? stockByGodown(focused.product, stockBatches, godowns) : null;

  /** Enter → next field; Ctrl+Enter / F9 → save; "+" / Alt+N → new line. */
  const onKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const tag = t.tagName;
    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'F9') {
      e.preventDefault();
      submit(false);
      return;
    }
    const isNumber = tag === 'INPUT' && (t as HTMLInputElement).type === 'number';
    if ((e.altKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) || (e.key === '+' && (tag === 'SELECT' || isNumber))) {
      e.preventDefault();
      addRow();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || tag === 'TEXTAREA' || tag === 'BUTTON' || !box.current) return;
    const navs = (Array.from(box.current.querySelectorAll('[data-nav]')) as HTMLElement[]).filter((n) => n.offsetParent !== null || n === t);
    const at = navs.indexOf(t);
    if (at < 0) return;
    e.preventDefault();
    const nav = t.getAttribute('data-nav');
    const rowKey = t.closest('[data-row]')?.getAttribute('data-row');
    const rowIdx = rows.findIndex((r) => r.key === rowKey);
    const focus = (el?: HTMLElement | null) => {
      if (!el) return;
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
    };
    const paidField = () => box.current?.querySelector<HTMLElement>('[data-nav="paid"]');
    // An empty item line ends the item list: go to "Paid now".
    if (nav === 'item' && !(t as HTMLSelectElement).value && rows.some((r) => r.productId)) return focus(paidField());
    // Price on the last line: start a new line.
    if (nav === 'price' && rowIdx === rows.length - 1 && rows[rowIdx]?.productId) return addRow();
    focus(navs[at + 1]);
  };

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 text-sm">
        <span className="text-[#6B7280] dark:text-[#94A3B8]">Total </span>
        <span className="tabular-nums font-extrabold text-lg text-[#111827] dark:text-white">{rs(total)}</span>
        {balance > 0 && <span className="ml-2 text-xs font-bold text-amber-700 dark:text-amber-300">{rs(balance)} on credit</span>}
        {total > 0 && balance === 0 && <span className="ml-2 text-xs font-bold text-teal-700 dark:text-teal-300">Fully paid</span>}
        <span className="hidden lg:inline-flex items-center gap-1 ml-3 text-[10px] text-[#8E9299]" title="Enter: next field • Ctrl+Enter or F9: save • + or Alt+N: new line • type to search items"><Keyboard className="w-3 h-3" /> Enter next • F9 save • + line</span>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => submit(false)} disabled={saveBlocked} title={blockedWhy || 'Save (Ctrl+Enter or F9)'} className={secondaryBtn}><Save className="w-4 h-4" /> Save</button>
        <button type="button" onClick={() => submit(true)} disabled={saveBlocked} title={blockedWhy} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save &amp; Print</button>
      </div>
    </div>
  );

  const smallLabel = 'sm:hidden block text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Bill" subtitle={quote ? `From quotation ${quote.quoteNumber} — check the items and prices, then save.` : 'Pick the customer, add items, enter what was paid.'} wide="xl" footer={footer}>
      <div className="space-y-5" ref={box} onKeyDown={onKeys}>
        {error && <Notice kind="error">{error}</Notice>}
        {sentForApproval && <div data-testid="bill-sent-for-approval"><Notice kind="ok">{sentForApproval}</Notice></div>}
        {!sentForApproval && approvalWhy && (
          <div data-testid="bill-needs-approval" className="rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs space-y-2">
            <p className="font-bold text-amber-900 dark:text-amber-200">Needs a manager’s approval: {approvalWhy.join('; ')}.</p>
            <p className="text-amber-900/80 dark:text-amber-200/80">Saving sends the bill to Approvals. Nothing goes to the books or the stock until a manager approves it.</p>
            {(!credit.over || !canOverride) && <input aria-label="Note for the manager" value={overReason} onChange={(e) => setOverReason(e.target.value)} className={inputCls} placeholder="Note for the manager (optional)" />}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-2xl border border-dashed border-[#E5E5E1] dark:border-[#203248] px-3.5 py-2" data-testid="bill-computer-no">
          <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Computer # <strong className="tabular-nums text-sm text-[#111827] dark:text-white" title="Given automatically when you save" data-testid="bill-next-number">{computerNo}</strong></div>
          <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Computer date <strong className="text-[#111827] dark:text-white">{formatDate(todayISO())}</strong></div>
          <div className="flex-1 min-w-[12rem] flex gap-1.5 sm:justify-end">
            <label className="sr-only" htmlFor="bill-search">Search old bill</label>
            <input id="bill-search" data-skip-autofocus value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); searchBill(); } }} className={`${inputCls} !py-1.5 sm:max-w-[11rem]`} placeholder="Search bill #" />
            <button type="button" onClick={searchBill} className={`${secondaryBtn} !py-1.5 !px-3 shrink-0`} aria-label="Open old bill"><Search className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3">
            <label className={labelCls} htmlFor="bill-customer">Customer</label>
            {newCustomer ? (
              <div className="grid grid-cols-2 gap-2">
                <input autoFocus data-nav="customer" placeholder="Customer name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className={inputCls} aria-label="New customer name" />
                <input data-nav="customer-phone" placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={inputCls} aria-label="New customer phone" />
                <button type="button" onClick={() => setNewCustomer(null)} className="col-span-2 text-xs font-semibold text-[#6B7280] hover:text-[#111827] dark:hover:text-white text-left">← Choose an existing customer instead</button>
              </div>
            ) : (
              // Code box + name list on one line; the city filter and "New" wrap below them on a phone.
              <div className="flex flex-wrap gap-2">
                <CodeBox id="bill-customer-code" label="Customer code" items={sortedCustomers} value={customer} onPick={pickCustomer} pairId="bill-customer" nextId="bill-date" skipAutofocus className="w-24 sm:w-28 shrink-0" />
                <div className="flex-1 min-w-[10rem]">
                  <QuickSelect id="bill-customer" data-nav="customer" value={customer} options={customerOptions} onPick={pickCustomer} className={inputCls} title="Type a name, code or phone to find the customer">
                    <option value="">Select customer…</option>
                    {sortedCustomers.map((c) => (
                      <option key={c.id} value={c.id}>{c.code ? `${c.code} • ` : ''}{c.name}{c.phone ? ` • ${c.phone}` : ''}{c.totalDue > 0 ? ` (due ${rs(c.totalDue)})` : ''}</option>
                    ))}
                  </QuickSelect>
                </div>
                <div className="flex gap-2 max-sm:w-full">
                  {cityList.length > 0 && (
                    <select aria-label="Customer city" data-testid="bill-customer-city" value={billCity} onChange={(e) => setBillCity(e.target.value)} className={`${inputCls} sm:!w-36 max-sm:flex-1`} title="Search party by city">
                      <option value="">All cities</option>
                      {cityList.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <button type="button" onClick={() => setNewCustomer({ name: '', phone: '' })} className={`${secondaryBtn} shrink-0 px-3`} title="Add a new customer"><UserPlus className="w-4 h-4" /><span>New</span></button>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-date">Date</label>
            <input id="bill-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2 grid grid-cols-2 gap-3 items-end">
            <div>
              <label className={labelCls} htmlFor="bill-memo">Memo No</label>
              <input id="bill-memo" value={memoNo} onChange={(e) => setMemoNo(e.target.value)} className={inputCls} placeholder="book / ref. no." />
            </div>
            <label htmlFor="bill-delivery-order" className="flex items-center gap-2.5 min-h-11 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] px-3 cursor-pointer" title="Goods go out later. Stock is taken now; the bill waits in the Pending Delivery List.">
              <input id="bill-delivery-order" type="checkbox" checked={deliveryOrder} onChange={(e) => setDeliveryOrder(e.target.checked)} className="w-5 h-5 accent-teal-700" />
              <span className="text-sm font-semibold text-[#111827] dark:text-white inline-flex items-center gap-1.5"><Truck className="w-4 h-4 text-indigo-600" /> Delivery Order</span>
            </label>
          </div>
          {selected && snapshot && (
            <div data-testid="bill-customer-info" className="sm:col-span-3 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#162436] px-3.5 py-2.5 text-xs text-[#374151] dark:text-[#CBD5E1] space-y-1">
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
          {credit.hasLimit && (
            <div className="sm:col-span-3 sm:order-last">
              <BillCreditPanel check={credit} canOverride={canOverride} allow={allowOver} onAllow={setAllowOver} reason={overReason} onReason={setOverReason} />
            </div>
          )}
          {godowns.length > 1 && (
            <div className="sm:col-span-3">
              <label className={labelCls} htmlFor="bill-godown">From godown</label>
              <select id="bill-godown" value={godownId} onChange={(e) => setGodownId(e.target.value)} className={inputCls}>
                {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          {(salesmen.length > 0 || areas.length > 0) && (
            <div className="sm:col-span-3 grid grid-cols-2 gap-3">
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
        </div>

        <div>
          <div className={`hidden sm:grid ${LINE_COLS} gap-2 px-1 mb-1 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]`}>
            <div>Code</div>
            <div>Item</div>
            <div>Qty</div>
            <div>Price</div>
            <div className="text-right">Amount</div>
            <div />
          </div>
          <div className="space-y-2">
            {lines.map((l, idx) => {
              const p = l.product;
              const packable = hasPack(p);
              const unitWord = p ? (l.pack > 1 ? p.packName! : p.unit || 'pcs') : '';
              const last = p && selected ? lastRateFor(selected.id, p.id, invoices) : null;
              const note = stockNote(l, idx);
              return (
                <div key={l.key} data-row={l.key} onFocus={() => setFocusKey(l.key)} className={`grid grid-cols-12 ${LINE_COLS} gap-2 items-center rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-2 sm:p-1 sm:border-0`}>
                  <CodeBox id={`bill-code-${idx + 1}`} label={`Item code ${idx + 1}`} items={sortedProducts} value={l.productId} onPick={(v) => pickProduct(l.key, v)} nextId={`bill-qty-${idx + 1}`} className="col-span-4 sm:col-auto" />
                  <div className="col-span-7 sm:col-auto min-w-0">
                    <QuickSelect aria-label={`Item ${idx + 1}`} data-nav="item" value={l.productId} options={productOptions} onPick={(v) => pickProduct(l.key, v)} className={inputCls} title="Type the item name or code to find it">
                      <option value="">Select item…</option>
                      {sortedProducts.map((x) => (
                        <option key={x.id} value={x.id}>{x.code ? `${x.code} • ` : ''}{x.name} — {rs(x.unitPricePerKg)}/{x.unit || 'pcs'}</option>
                      ))}
                    </QuickSelect>
                  </div>
                  {/* Phones: the bin sits beside the item name; wider screens: its own last column. */}
                  <div className="col-span-1 flex justify-end sm:col-start-6 sm:row-start-1">
                    <button type="button" onClick={() => removeRow(l.key)} aria-label={`Remove item ${idx + 1}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30" disabled={rows.length === 1}><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="col-span-4 sm:col-auto">
                    <span className={smallLabel}>Qty{p ? ` (${plural(unitWord, 2)})` : ''}</span>
                    <input id={`bill-qty-${idx + 1}`} aria-label={`Quantity ${idx + 1}`} data-nav="qty" type="number" inputMode="decimal" min="0" step="any" value={l.rawQty} onChange={(e) => setRow(l.key, { qty: e.target.value })} className={`${inputCls} tabular-nums max-sm:!px-2.5`} placeholder="Qty" />
                  </div>
                  <div className="col-span-4 sm:col-auto">
                    <span className={smallLabel}>Price{p ? ` per ${unitWord}` : ''}</span>
                    <input aria-label={`Price ${idx + 1}`} data-nav="price" type="number" inputMode="decimal" min="0" step="any" value={l.rawPrice} onChange={(e) => setRow(l.key, { price: e.target.value, priceFrom: 'typed' })} className={`${inputCls} tabular-nums max-sm:!px-2.5`} placeholder="Price" />
                    {l.priceFrom === 'customer' && <span data-testid={`customer-rate-${idx + 1}`} className="block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Customer rate</span>}
                  </div>
                  <div className="col-span-4 sm:col-auto text-right tabular-nums font-bold text-sm text-[#111827] dark:text-white whitespace-nowrap"><span className={`${smallLabel} font-sans`}>Amount</span>{rs(l.amount)}</div>
                  {p && (
                    <div data-testid={`line-info-${idx + 1}`} className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8] px-1">
                      {packable && (
                        <span className="inline-flex rounded-xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden font-bold" role="group" aria-label={`Unit for item ${idx + 1}`}>
                          {[false, true].map((packMode) => (
                            <button key={String(packMode)} type="button" tabIndex={-1} aria-pressed={l.inPack === packMode} onClick={() => l.inPack !== packMode && togglePack(l.key)} className={`px-2 py-0.5 ${l.inPack === packMode ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : ''}`}>
                              {packMode ? `${p.packName} (${p.packSize})` : p.unit || 'pcs'}
                            </button>
                          ))}
                        </span>
                      )}
                      {l.pack > 1 && l.qty > 0 && <span className="font-semibold text-[#374151] dark:text-[#CBD5E1]">= {formatPackQty(l.qty, p)} • {rs(Math.round(l.price * 100) / 100)}/{p.unit || 'pcs'}</span>}
                      <span>Stock <strong className={`tabular-nums ${p.stockKg < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-[#374151] dark:text-[#CBD5E1]'}`}>{formatPackQty(p.stockKg, p, 'short')}</strong></span>
                      {last && (
                        <button type="button" tabIndex={-1} onClick={() => setRow(l.key, { price: shownPrice(p.id, last.rate, l.inPack), priceFrom: 'typed' })} className="hover:text-teal-700 dark:hover:text-teal-300" title="Use this rate">
                          Last rate <strong className="tabular-nums text-[#374151] dark:text-[#CBD5E1]">{rs(last.rate)}/{p.unit || 'pcs'}</strong> ({formatDate(last.date)})
                        </button>
                      )}
                    </div>
                  )}
                  {l.schemePct && (
                    <div data-testid={`scheme-pct-${idx + 1}`} className="col-span-full flex flex-wrap items-center gap-2 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                      <Gift className="w-3.5 h-3.5" /> Scheme “{l.schemePct.schemeName}”: {l.schemePct.pct}% off (− {rs(l.lineDisc)})
                      <button type="button" tabIndex={-1} onClick={() => drop(`pct|${l.schemePct!.schemeId}|${l.key}`)} className="underline text-[#6B7280] dark:text-[#94A3B8] hover:text-rose-600" aria-label={`Remove scheme discount on item ${idx + 1}`}>remove</button>
                    </div>
                  )}
                  {note && <div data-testid={`stock-note-${idx + 1}`} className={`col-span-full text-[11px] font-semibold ${note.block ? 'text-rose-700 dark:text-rose-300' : note.warn ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{note.text}</div>}
                  {l.showDisc ? (
                    <div className="col-span-full flex flex-wrap items-center gap-2">
                      <label htmlFor={`disc-${l.key}`} className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Discount on this item</label>
                      <div className="w-28"><input id={`disc-${l.key}`} aria-label={`Discount ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.disc} onChange={(e) => setRow(l.key, { disc: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="0" /></div>
                      <div className="inline-flex rounded-2xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden text-xs font-bold" role="group" aria-label={`Discount type ${idx + 1}`}>
                        {(['rs', 'pct'] as const).map((t) => (
                          <button key={t} type="button" aria-pressed={l.discType === t} onClick={() => setRow(l.key, { discType: t })} className={`px-3 py-2 ${l.discType === t ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : 'text-[#6B7280] dark:text-[#94A3B8]'}`}>{t === 'rs' ? 'Rs.' : '%'}</button>
                        ))}
                      </div>
                      {l.lineDisc > 0 && <span className="text-[11px] font-semibold text-[#6B7280] dark:text-[#94A3B8]">− {rs(l.lineDisc)}</span>}
                    </div>
                  ) : (
                    <div className="col-span-full -mt-1">
                      <button type="button" tabIndex={-1} onClick={() => setRow(l.key, { showDisc: true })} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-700" aria-label={`Add discount to item ${idx + 1}`}><Percent className="w-3 h-3" /> Discount</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={addRow} title="Add a line (+ or Alt+N)" className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 dark:text-teal-300 hover:underline"><Plus className="w-4 h-4" /> Add another item</button>
            <ScanButton onPick={(p) => addScanned(p.id)} keepOpen />
          </div>
          {focused?.product && (
            <div data-testid="bill-stock-in-hand" className="mt-2 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] px-3.5 py-2 text-xs text-[#374151] dark:text-[#CBD5E1] flex flex-wrap gap-x-4 gap-y-1">
              <span><span className="font-bold uppercase tracking-wider text-[10px] text-[#6B7280] dark:text-[#94A3B8]">Stock in hand</span> {focused.product.name}: <strong className={`tabular-nums ${focused.product.stockKg < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-[#111827] dark:text-white'}`}>{formatPackQty(focused.product.stockKg, focused.product)}</strong></span>
              {focusedPer && godowns.map((g) => <span key={g.id}>{g.name}: <strong className="tabular-nums">{formatPackQty(focusedPer[g.id] || 0, focused.product!, 'short')}</strong></span>)}
              {selected && <span>Party balance <strong className="tabular-nums">{rs(selected.totalDue)}</strong></span>}
            </div>
          )}
          {products.length === 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">No items yet. Add your products with their prices on the Items screen first.</p>}
          {freeLines.length > 0 && (
            <div className="mt-3 rounded-2xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 p-2.5 space-y-1.5" data-testid="bill-free-lines">
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
          {droppedCount > 0 && <button type="button" onClick={() => setDropped(new Set())} className="mt-2 text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline">Put back the removed scheme{droppedCount === 1 ? '' : 's'} ({droppedCount})</button>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="bill-discount">Discount (Rs.)</label>
              <input id="bill-discount" type="number" inputMode="decimal" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0 (on the whole bill)" />
            </div>
            <div>
              <label className={labelCls} htmlFor="bill-freight">Freight / loading (Rs.)</label>
              <input id="bill-freight" type="number" inputMode="decimal" min="0" step="any" value={freight} onChange={(e) => setFreight(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0 (cartage / loading charged)" />
            </div>
            <div>
              <label className={labelCls} htmlFor="bill-notes">Note (optional)</label>
              <input id="bill-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. delivered by Rashid" />
            </div>
            <CostCentreSelect id="bill-centre" value={costCentre} onChange={setCostCentre} />
          </div>
          <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] p-4 space-y-2 text-sm">
            {lineDiscTotal > 0 && (
              <>
                <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Items before discount</span><span className="tabular-nums">{rs(subtotal + lineDiscTotal)}</span></div>
                <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Item discounts</span><span className="tabular-nums">− {rs(lineDiscTotal)}</span></div>
              </>
            )}
            <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Subtotal</span><span className="tabular-nums">{rs(subtotal)}</span></div>
            {disc > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Discount</span><span className="tabular-nums">− {rs(disc)}</span></div>}
            {taxRate > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>{settings.taxLabel || 'Tax'} {taxRate}%</span><span className="tabular-nums">{rs(tax)}</span></div>}
            {freightAmt > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Freight / loading</span><span className="tabular-nums">{rs(freightAmt)}</span></div>}
            <div className="flex justify-between font-extrabold text-[#111827] dark:text-white border-t border-[#E5E5E1] dark:border-[#203248] pt-2"><span>Total</span><span className="tabular-nums">{rs(total)}</span></div>
            {split ? (
              <div className="space-y-2 pt-1" data-testid="bill-split">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls} htmlFor="bill-split-cash">Cash</label>
                    <input id="bill-split-cash" data-nav="paid" type="number" inputMode="decimal" min="0" step="any" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="bill-split-cheque">Cheque</label>
                    <input id="bill-split-cheque" data-nav="split-cheque" type="number" inputMode="decimal" min="0" step="any" value={splitCheque} onChange={(e) => setSplitCheque(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="bill-split-bank">Bank / wallet</label>
                    <input id="bill-split-bank" data-nav="split-bank" type="number" inputMode="decimal" min="0" step="any" value={splitBank} onChange={(e) => setSplitBank(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="bill-split-bank-method">Bank by</label>
                    <select id="bill-split-bank-method" value={splitBankMethod} onChange={(e) => setSplitBankMethod(e.target.value)} className={inputCls}>
                      {BANK_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <BankSelect id="bill-split-bank-account" className="col-span-2" label="Into bank" value={bank} onChange={setBank} />
                </div>
                <button type="button" onClick={() => { setSplit(false); setSplitCash(''); setSplitBank(''); setSplitCheque(''); }} className="text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-700">← One payment method</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className={labelCls} htmlFor="bill-paid">Paid now</label>
                    <div className="flex gap-1">
                      <input id="bill-paid" data-nav="paid" type="number" inputMode="decimal" min="0" step="any" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                      <button type="button" tabIndex={-1} onClick={() => setPaidNow(String(total))} className="shrink-0 px-2.5 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:bg-white dark:hover:bg-[#1E2E40]" title="Paid in full">Full</button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="bill-method">Method</label>
                    <select id="bill-method" data-nav="method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                      {BILL_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  {needsBank(method) && <BankSelect id="bill-bank" className="col-span-full" label="Into bank" value={bank} onChange={setBank} />}
                </div>
                <button type="button" onClick={() => { setSplit(true); if (method === 'Cheque') setSplitCheque(paidNow); else if (method === 'Cash') setSplitCash(paidNow); else { setSplitBankMethod(BANK_METHODS.includes(method) ? method : BANK_METHODS[0]); setSplitBank(paidNow); } setPaidNow(''); }} className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline"><SplitSquareHorizontal className="w-3 h-3" /> Split: cash + bank + cheque</button>
              </>
            )}
            {hasCheque && <div className="grid grid-cols-2 gap-2"><ChequeFieldsInput value={cheque} onChange={setCheque} idPrefix="bill-chq" /></div>}
            {payment.error && <p role="alert" className="text-[11px] font-bold text-rose-700 dark:text-rose-300">{payment.error}</p>}
            {split && payment.paid > 0 && !payment.error && <div className="flex justify-between text-xs text-[#6B7280] dark:text-[#94A3B8]"><span>Paid now</span><span className="tabular-nums">{rs(payment.paid)}</span></div>}
            <div className="flex justify-between text-xs font-bold pt-1 text-[#111827] dark:text-white"><span className={balance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}>{balance > 0 ? 'Balance (credit)' : 'Balance'}</span><span className="tabular-nums">{rs(balance)}</span></div>
            {change > 0 && <div className="flex justify-between text-xs font-bold text-indigo-700 dark:text-indigo-300"><span>Change to return</span><span className="tabular-nums">{rs(change)}</span></div>}
          </div>
        </div>
      </div>
    </Modal>
  );
};
