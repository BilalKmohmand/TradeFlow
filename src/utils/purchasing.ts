/**
 * Purchasing helpers (billing mode): multi-line purchase orders, the three-way match (order →
 * goods received → supplier bill), the re-order report, supplier claims and item groups / brands.
 * Everything here is pure: the actions live in context/purchasingActions.ts.
 */
import {
  Product,
  Purchase,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  SupplierBill,
  SupplierClaim,
  Supplier,
} from '../types';
import type { ProfitRow } from './stockReports';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const EPS = 0.0001;

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

/** Lines of any order: multi-line orders have `items`; older single-item orders are one line. */
export const poLines = (po: PurchaseOrder): PurchaseOrderLine[] =>
  po.items && po.items.length
    ? po.items
    : [{ id: `${po.id}-l1`, productId: po.productId, qty: Number(po.kg) || 0, rate: Number(po.pricePerKg) || 0, receivedQty: Number(po.receivedKg) || 0 }];

/** Status from what has been received (a cancelled order stays cancelled). */
export const poStatusFromLines = (lines: PurchaseOrderLine[], current?: PurchaseOrderStatus): PurchaseOrderStatus => {
  if (current === 'cancelled') return 'cancelled';
  const anyIn = lines.some((l) => l.receivedQty > EPS);
  const allIn = lines.every((l) => l.receivedQty + EPS >= l.qty);
  return allIn && lines.length > 0 ? 'received' : anyIn ? 'partial' : 'open';
};

/** Keep the single-item summary fields (productId, kg, rate, amount, receivedKg, status) in step with the lines. */
export const withLineTotals = (po: PurchaseOrder, lines: PurchaseOrderLine[]): PurchaseOrder => {
  const kg = round4(lines.reduce((a, l) => a + l.qty, 0));
  const amount = round2(lines.reduce((a, l) => a + l.qty * l.rate, 0));
  return {
    ...po,
    items: lines,
    productId: lines[0]?.productId || po.productId,
    kg,
    amount,
    pricePerKg: kg > 0 ? round4(amount / kg) : lines[0]?.rate || 0,
    receivedKg: round4(lines.reduce((a, l) => a + l.receivedQty, 0)),
    status: poStatusFromLines(lines, po.status),
  };
};

/**
 * Record a receipt against an order line (or, without a line id, against the first line of that
 * item that still has something to come). Returns the updated order.
 */
export const receiveOnPo = (po: PurchaseOrder, productId: string, qty: number, poLineId?: string | null): PurchaseOrder => {
  if (!po.items?.length) {
    const receivedKg = round4((Number(po.receivedKg) || 0) + qty);
    return { ...po, receivedKg, status: po.status === 'cancelled' ? 'cancelled' : receivedKg + EPS >= po.kg ? 'received' : 'partial' };
  }
  const lines = po.items.map((l) => ({ ...l }));
  let target = poLineId ? lines.find((l) => l.id === poLineId && l.productId === productId) : undefined;
  if (!target) target = lines.find((l) => l.productId === productId && l.receivedQty + EPS < l.qty) || lines.find((l) => l.productId === productId);
  if (!target) return po;
  target.receivedQty = round4(target.receivedQty + qty);
  return withLineTotals(po, lines);
};

/** Undo a receipt on an order (a stock receipt was deleted). */
export const unreceiveOnPo = (po: PurchaseOrder, productId: string, qty: number, poLineId?: string | null): PurchaseOrder => {
  if (!po.items?.length) {
    const receivedKg = Math.max(0, round4((Number(po.receivedKg) || 0) - qty));
    return { ...po, receivedKg, status: po.status === 'cancelled' ? 'cancelled' : receivedKg <= EPS ? 'open' : receivedKg + EPS >= po.kg ? 'received' : 'partial' };
  }
  const lines = po.items.map((l) => ({ ...l }));
  const target = (poLineId && lines.find((l) => l.id === poLineId && l.productId === productId)) || lines.find((l) => l.productId === productId && l.receivedQty > EPS);
  if (!target) return po;
  target.receivedQty = Math.max(0, round4(target.receivedQty - qty));
  return withLineTotals(po, lines);
};

/** What is still to come on each line. */
export const poOutstanding = (po: PurchaseOrder) => poLines(po).map((l) => ({ ...l, remaining: Math.max(0, round4(l.qty - l.receivedQty)) }));

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  open: 'Open',
  partial: 'Partly received',
  received: 'Received',
  cancelled: 'Cancelled',
};

/** Next number in a "PREFIX-n" series (highest existing + 1). */
export const nextNumber = (prefix: string, existing: string[]): string => {
  const re = new RegExp(`^${prefix}-(?:\\d{4}-)?(\\d+)$`);
  const max = existing.reduce((m, s) => {
    const n = parseInt((re.exec(s || '') || [])[1] || '0', 10);
    return Number.isFinite(n) && n > m && n < 10_000_000 ? n : m;
  }, 0);
  return `${prefix}-${max + 1}`;
};

/** Plain-text order for WhatsApp / SMS. */
export const poWhatsAppText = (po: PurchaseOrder, products: Product[], supplier: Supplier | undefined, shopName: string, fmtDate: (d: string) => string): string => {
  const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
  const lines = poLines(po).map((l, i) => {
    const p = products.find((x) => x.id === l.productId);
    return `${i + 1}. ${p?.name || l.productName || 'Item'} — ${money(l.qty)} ${p?.unit || l.unit || 'pcs'} @ Rs. ${money(l.rate)} = Rs. ${money(l.qty * l.rate)}`;
  });
  return [
    `*Purchase order ${po.poNumber}*`,
    `From: ${shopName}`,
    supplier ? `To: ${supplier.company || supplier.name}` : '',
    `Date: ${fmtDate(po.orderDate || po.createdAt.slice(0, 10))}${po.expectedDate ? ` • Needed by ${fmtDate(po.expectedDate)}` : ''}`,
    '',
    ...lines,
    '',
    `*Total: Rs. ${money(po.amount)}*`,
    po.notes ? `Note: ${po.notes}` : '',
    'Please confirm. Thank you.',
  ]
    .filter((x, i, arr) => x !== '' || (arr[i - 1] !== '' && i > 0))
    .join('\n');
};

/** wa.me link for a Pakistani mobile number (0300… → 92300…). Empty phone = let WhatsApp ask. */
export const whatsappLink = (phone: string | undefined, text: string): string => {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

// ---------------------------------------------------------------------------
// Three-way match: ordered vs received vs billed
// ---------------------------------------------------------------------------
export type MatchFlag = 'short_received' | 'over_received' | 'billed_more_than_received' | 'billed_less_than_received' | 'rate_differs' | 'not_billed' | 'not_ordered';

export interface MatchLine {
  productId: string;
  name: string;
  unit: string;
  ordered: number;
  orderRate: number | null;
  received: number;
  /** Average receipt rate (what the payable was booked at). */
  receivedRate: number | null;
  receivedValue: number;
  billed: number;
  billedRate: number | null;
  billedValue: number;
  flags: MatchFlag[];
}

export type MatchStatus = 'matched' | 'mismatch' | 'awaiting_goods' | 'awaiting_bill';

export interface MatchResult {
  lines: MatchLine[];
  status: MatchStatus;
  orderedValue: number;
  receivedValue: number;
  billedValue: number;
  /** Bill total incl. other charges. */
  billTotal: number;
  otherCharges: number;
  /** billTotal − receivedValue (the price difference posted). */
  difference: number;
}

export const MATCH_FLAG_LABEL: Record<MatchFlag, string> = {
  short_received: 'Less received than ordered',
  over_received: 'More received than ordered',
  billed_more_than_received: 'Billed for more than received',
  billed_less_than_received: 'Billed for less than received',
  rate_differs: 'Rate differs',
  not_billed: 'Not billed yet',
  not_ordered: 'Not on the order',
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  matched: 'Matched',
  mismatch: 'Mismatch',
  awaiting_goods: 'Waiting for goods',
  awaiting_bill: 'Waiting for bill',
};

/**
 * Compare an order (optional), the stock receipts and the supplier bills per item. Rates are
 * compared to the nearest rupee-paisa; a quantity difference below 0.001 is ignored.
 */
export const threeWayMatch = (input: {
  po?: PurchaseOrder | null;
  receipts: Purchase[];
  bills: SupplierBill[];
  products: Product[];
}): MatchResult => {
  const { po, receipts, bills, products } = input;
  const by = new Map<string, MatchLine>();
  const row = (productId: string, name?: string, unit?: string): MatchLine => {
    let r = by.get(productId);
    if (!r) {
      const p = products.find((x) => x.id === productId);
      r = { productId, name: p?.name || name || 'Item', unit: p?.unit || unit || 'pcs', ordered: 0, orderRate: null, received: 0, receivedRate: null, receivedValue: 0, billed: 0, billedRate: null, billedValue: 0, flags: [] };
      by.set(productId, r);
    }
    return r;
  };
  let orderedValue = 0;
  if (po && po.status !== 'cancelled') {
    poLines(po).forEach((l) => {
      const r = row(l.productId, l.productName, l.unit);
      const value = (r.orderRate ?? 0) * r.ordered + l.qty * l.rate;
      r.ordered = round4(r.ordered + l.qty);
      r.orderRate = r.ordered > 0 ? round4(value / r.ordered) : l.rate;
      orderedValue += l.qty * l.rate;
    });
  }
  receipts.forEach((p) => {
    const r = row(p.productId);
    r.received = round4(r.received + p.kg);
    r.receivedValue = round2(r.receivedValue + p.amount);
  });
  let otherCharges = 0;
  bills.forEach((b) => {
    otherCharges += Number(b.otherCharges) || 0;
    b.lines.forEach((l) => {
      const r = row(l.productId, l.productName, l.unit);
      r.billed = round4(r.billed + l.qty);
      r.billedValue = round2(r.billedValue + l.amount);
    });
  });
  const lines = Array.from(by.values()).map((r) => {
    r.receivedRate = r.received > EPS ? round4(r.receivedValue / r.received) : null;
    r.billedRate = r.billed > EPS ? round4(r.billedValue / r.billed) : null;
    const flags: MatchFlag[] = [];
    const q = (a: number, b: number) => Math.abs(a - b) > 0.001;
    const rate = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) >= 0.01;
    if (po) {
      if (r.ordered <= EPS && r.received > EPS) flags.push('not_ordered');
      else if (r.received > EPS && r.received + 0.001 < r.ordered) flags.push('short_received');
      else if (r.received > r.ordered + 0.001 && r.ordered > EPS) flags.push('over_received');
    }
    if (bills.length) {
      if (r.billed <= EPS && r.received > EPS) flags.push('not_billed');
      else if (q(r.billed, r.received)) flags.push(r.billed > r.received ? 'billed_more_than_received' : 'billed_less_than_received');
    }
    if (rate(r.billedRate, r.receivedRate) || rate(r.billedRate, r.orderRate) || rate(r.receivedRate, r.orderRate)) flags.push('rate_differs');
    r.flags = flags;
    return r;
  });
  const receivedValue = round2(lines.reduce((a, l) => a + l.receivedValue, 0));
  const billedValue = round2(lines.reduce((a, l) => a + l.billedValue, 0));
  const billTotal = round2(billedValue + otherCharges);
  let status: MatchStatus;
  if (receipts.length === 0) status = 'awaiting_goods';
  else if (bills.length === 0) status = 'awaiting_bill';
  else status = lines.some((l) => l.flags.some((f) => f !== 'short_received')) || Math.abs(billTotal - receivedValue) >= 0.01 ? 'mismatch' : 'matched';
  // An order still short of goods is "waiting for goods" unless the bill already disagrees.
  if (status === 'matched' && lines.some((l) => l.flags.includes('short_received'))) status = 'awaiting_goods';
  return { lines, status, orderedValue: round2(orderedValue), receivedValue, billedValue, billTotal, otherCharges: round2(otherCharges), difference: round2(billTotal - receivedValue) };
};

/** Receipts not yet covered by any supplier bill. */
export const unbilledReceipts = (purchases: Purchase[], bills: SupplierBill[], supplierId?: string): Purchase[] => {
  const billed = new Set(bills.flatMap((b) => b.purchaseIds));
  return purchases.filter((p) => !billed.has(p.id) && (!supplierId || p.supplierId === supplierId));
};

// ---------------------------------------------------------------------------
// Re-order report
// ---------------------------------------------------------------------------
export interface ReorderRow {
  product: Product;
  stock: number;
  level: number;
  /** Still to come on open orders. */
  onOrder: number;
  suggested: number;
  lastSupplierId: string | null;
  lastRate: number | null;
  lastDate: string | null;
}

/** Last stock receipt of an item (newest date, then newest created). */
export const lastPurchaseOf = (purchases: Purchase[], productId: string): Purchase | undefined =>
  purchases
    .filter((p) => p.productId === productId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || '').localeCompare(a.createdAt || '')))[0];

/**
 * Items at or below their re-order level. Suggested quantity: the item's re-order quantity, else
 * enough to bring stock up to twice the level; what is already on open orders is taken off.
 */
export const reorderReport = (products: Product[], purchases: Purchase[], orders: PurchaseOrder[]): ReorderRow[] => {
  const onOrder = new Map<string, number>();
  orders
    .filter((o) => o.status === 'open' || o.status === 'partial')
    .forEach((o) => poOutstanding(o).forEach((l) => onOrder.set(l.productId, (onOrder.get(l.productId) || 0) + l.remaining)));
  return products
    .filter((p) => (Number(p.minThresholdKg) || 0) > 0 && p.stockKg <= p.minThresholdKg)
    .map((p) => {
      const level = Number(p.minThresholdKg) || 0;
      const coming = round4(onOrder.get(p.id) || 0);
      const base = (Number(p.reorderQty) || 0) > 0 ? Number(p.reorderQty) : Math.max(level * 2 - p.stockKg, level);
      const pack = p.packName && (p.packSize || 0) > 1 ? p.packSize! : 1;
      let suggested = Math.max(0, base - coming);
      // Round up to whole packs (cartons) when the item has one.
      if (pack > 1 && suggested > 0) suggested = Math.ceil(suggested / pack - 1e-9) * pack;
      suggested = Math.ceil(suggested - 1e-9);
      const last = lastPurchaseOf(purchases, p.id);
      return {
        product: p,
        stock: p.stockKg,
        level,
        onOrder: coming,
        suggested,
        lastSupplierId: last?.supplierId || p.supplierId || null,
        lastRate: last ? last.pricePerKg : p.costPricePerKg ?? null,
        lastDate: last?.date || null,
      };
    })
    .sort((a, b) => a.stock / (a.level || 1) - b.stock / (b.level || 1) || a.product.name.localeCompare(b.product.name));
};

// ---------------------------------------------------------------------------
// Supplier claims
// ---------------------------------------------------------------------------
export const CLAIM_STATUS_LABEL: Record<SupplierClaim['status'], string> = {
  open: 'Open',
  accepted: 'Accepted',
  rejected: 'Rejected',
  settled: 'Settled',
};

// ---------------------------------------------------------------------------
// Item groups and brands
// ---------------------------------------------------------------------------
/** The item's group (stored in `category`); "General" / empty counts as no group. */
export const itemGroup = (p: Pick<Product, 'category'> | undefined): string => {
  const g = (p?.category || '').trim();
  return g && g.toLowerCase() !== 'general' ? g : '';
};

/** Distinct non-empty values, sorted, case-insensitively unique (first spelling wins). */
export const distinctValues = (values: (string | undefined)[]): string[] => {
  const seen = new Map<string, string>();
  values.forEach((v) => {
    const t = (v || '').trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
};

export const itemGroups = (products: Product[]) => distinctValues(products.map(itemGroup));
export const itemBrands = (products: Product[]) => distinctValues(products.map((p) => p.brand));

/**
 * Roll the profit-by-item rows up by group or by brand. Items without one are under "No group" /
 * "No brand". Sums of sales and cost equal the item totals, so the report still ties to the books.
 */
export const profitByAttribute = (byItem: ProfitRow[], products: Product[], by: 'group' | 'brand'): ProfitRow[] => {
  const out = new Map<string, ProfitRow & { items: number }>();
  const none = by === 'group' ? 'No group' : 'No brand';
  byItem.forEach((r) => {
    const p = products.find((x) => x.id === r.key);
    const label = (by === 'group' ? itemGroup(p) : (p?.brand || '').trim()) || none;
    const key = label.toLowerCase();
    const cur = out.get(key) || { key, name: label, sales: 0, cost: 0, profit: 0, marginPct: null, uncosted: 0, items: 0, bills: 0 };
    cur.sales += r.sales;
    cur.cost += r.cost;
    cur.uncosted += r.uncosted;
    cur.items += 1;
    out.set(key, cur);
  });
  return Array.from(out.values())
    .map(({ items, ...r }) => {
      const sales = round2(r.sales);
      const cost = round2(r.cost);
      const profit = round2(sales - cost);
      return { ...r, sales, cost, profit, bills: items, marginPct: Math.abs(sales) > 0.005 ? Math.round((profit / sales) * 1000) / 10 : null };
    })
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
};

// ---------------------------------------------------------------------------
// Barcodes
// ---------------------------------------------------------------------------
/** Item whose barcode (or, failing that, item code) is exactly what was scanned / typed. */
export const findByBarcode = (products: Product[], scanned: string): Product | undefined => {
  const q = scanned.trim();
  if (!q) return undefined;
  const lower = q.toLowerCase();
  return products.find((p) => (p.barcode || '').trim() === q) || products.find((p) => (p.code || '').trim().toLowerCase() === lower);
};

/** A shop-internal barcode number (starts with 2, the in-store range; 13 digits with an EAN check digit). */
export const makeInternalBarcode = (existing: string[], seed = Date.now()): string => {
  const taken = new Set(existing);
  for (let i = 0; i < 1000; i++) {
    const body = `2${String(seed + i * 7919).slice(-11).padStart(11, '0')}`;
    const code = body + ean13CheckDigit(body);
    if (!taken.has(code)) return code;
  }
  return `2${String(seed).slice(-12)}`;
};

/** EAN-13 check digit for 12 digits. */
export const ean13CheckDigit = (twelve: string): string => {
  const sum = twelve
    .split('')
    .map(Number)
    .reduce((a, d, i) => a + d * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
};
