/**
 * Billing-mode reports built from the shop's own records (bills, stock received, returns,
 * adjustments, transfers): item stock history, purchase register, profit from bills and
 * "who owes for how long".
 */
import {
  Customer,
  Dispatch,
  Godown,
  Invoice,
  LedgerEntry,
  Product,
  Purchase,
  StockAdjustment,
  StockReturn,
  StockTransfer,
  Supplier,
  adjustmentReasonLabel,
} from '../types';
import { billLineUnitCost } from './accounting';
import { AgingBuckets, AgingRow, ageLedger } from './finance';
import { godownName, round2 } from './inventory';

const EPS = 0.005;

// ---------------------------------------------------------------------------
// Item stock history
// ---------------------------------------------------------------------------
export type HistoryKind = 'opening' | 'received' | 'sold' | 'returned_in' | 'returned_out' | 'adjusted' | 'transferred' | 'dispatched';

export interface HistoryRow {
  id: string;
  date: string;
  kind: HistoryKind;
  /** Plain-English description: "Sold on bill INV-12 to Zaman & Co". */
  label: string;
  /** Who: customer / supplier name, if any. */
  party?: string;
  ref?: string;
  /** + in, − out. 0 for moves between godowns (the total does not change). */
  change: number;
  /** Stock after this movement (all godowns). */
  balance: number;
  godown?: string;
  note?: string;
  /** Bill it came from, so the screen can open it. */
  invoiceId?: string;
  /** Adjustment id (lets an admin undo it). */
  adjustmentId?: string;
  returnId?: string;
}

export interface HistorySources {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  invoices: Invoice[];
  purchases: Purchase[];
  returns: StockReturn[];
  adjustments: StockAdjustment[];
  stockTransfers: StockTransfer[];
  dispatches?: Dispatch[];
  godowns: Godown[];
}

/**
 * Every movement of one item, oldest first, with a running balance that ends at today's stock.
 * Whatever the records can't explain is shown as an opening balance at the top.
 */
export const itemHistory = (productId: string, src: HistorySources): { rows: HistoryRow[]; opening: number; closing: number } => {
  const product = src.products.find((p) => p.id === productId);
  const unit = product?.unit || 'pcs';
  const custName = (id?: string | null) => src.customers.find((c) => c.id === id)?.name;
  const supName = (id?: string | null) => {
    const s = src.suppliers.find((x) => x.id === id);
    return s ? s.company || s.name : undefined;
  };
  type Raw = Omit<HistoryRow, 'balance'> & { sortKey: string };
  const raw: Raw[] = [];

  src.purchases.filter((p) => p.productId === productId).forEach((p) => {
    raw.push({ id: `pur-${p.id}`, date: p.date, sortKey: p.createdAt || p.date, kind: 'received', label: `Received from ${supName(p.supplierId) || 'supplier'}`, party: supName(p.supplierId), ref: p.receiptNumber, change: p.kg, note: p.notes });
  });
  src.invoices.forEach((inv) => {
    if (inv.status === 'cancelled') return;
    inv.items.forEach((it, idx) => {
      // Trading invoices carry no qty: their stock left with the truck dispatches listed below.
      if (it.productId !== productId || it.qty == null) return;
      raw.push({
        id: `inv-${inv.id}-${it.id || idx}`,
        date: inv.issueDate,
        sortKey: inv.issuedAt || inv.createdAt || inv.issueDate,
        kind: 'sold',
        label: `Sold on bill ${inv.invoiceNumber}`,
        party: inv.customerName || custName(inv.customerId),
        ref: inv.invoiceNumber,
        change: -(it.qty || 0),
        godown: it.godownId ? godownName(src.godowns, it.godownId) : undefined,
        note: it.batches?.length ? it.batches.map((b) => `batch ${b.batchNo} × ${b.qty}`).join(', ') : undefined,
        invoiceId: inv.id,
      });
    });
  });
  (src.dispatches || []).filter((d) => d.productId === productId).forEach((d) => {
    raw.push({ id: `dsp-${d.id}`, date: d.date, sortKey: d.date, kind: 'dispatched', label: `Dispatched ${d.dispatchNumber}`, party: custName(d.customerId), ref: d.dispatchNumber, change: -d.kg, note: d.truckNumber ? `truck ${d.truckNumber}` : undefined });
  });
  src.returns.filter((r) => r.productId === productId).forEach((r) => {
    const sales = r.kind === 'sales';
    raw.push({
      id: `ret-${r.id}`,
      date: r.date,
      sortKey: r.createdAt || r.date,
      kind: sales ? 'returned_in' : 'returned_out',
      label: sales ? `Returned by ${custName(r.customerId) || 'customer'} (${r.returnNumber})` : `Sent back to ${supName(r.supplierId) || 'supplier'} (${r.returnNumber})`,
      party: sales ? custName(r.customerId) : supName(r.supplierId),
      ref: r.returnNumber,
      change: sales ? r.kg : -r.kg,
      godown: r.godownId ? godownName(src.godowns, r.godownId) : undefined,
      note: r.reason,
      returnId: r.id,
    });
  });
  src.adjustments.filter((a) => a.productId === productId).forEach((a) => {
    const received = a.reason === 'received';
    raw.push({
      id: `adj-${a.id}`,
      date: a.date.slice(0, 10),
      sortKey: a.createdAt || a.date,
      kind: received ? 'received' : 'adjusted',
      label: received ? 'Received (no supplier bill)' : `Adjusted: ${adjustmentReasonLabel(a.reason)}`,
      ref: a.batchNo ? `Batch ${a.batchNo}` : undefined,
      change: a.deltaKg,
      godown: a.godownId ? godownName(src.godowns, a.godownId) : undefined,
      note: a.note,
      adjustmentId: a.id,
    });
  });
  src.stockTransfers.filter((t) => t.productId === productId).forEach((t) => {
    raw.push({ id: `xfr-${t.id}`, date: t.date, sortKey: t.createdAt || t.date, kind: 'transferred', label: `Moved ${t.qty} ${unit}: ${godownName(src.godowns, t.fromGodownId)} → ${godownName(src.godowns, t.toGodownId)}`, change: 0, note: t.note });
  });

  raw.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  const closing = round2(product?.stockKg ?? 0);
  const moved = round2(raw.reduce((s, r) => s + r.change, 0));
  const opening = round2(closing - moved);
  const rows: HistoryRow[] = [];
  let bal = opening;
  if (Math.abs(opening) > EPS || raw.length === 0) {
    rows.push({ id: 'opening', date: raw[0]?.date || '', kind: 'opening', label: raw.length ? 'Stock before these records' : 'Stock now', change: 0, balance: opening });
  }
  raw.forEach(({ sortKey, ...r }) => {
    void sortKey;
    bal = round2(bal + r.change);
    rows.push({ ...r, change: round2(r.change), balance: bal });
  });
  return { rows, opening, closing };
};

// ---------------------------------------------------------------------------
// Purchase register
// ---------------------------------------------------------------------------
export interface RegisterRow {
  id: string;
  date: string;
  ref: string;
  kind: 'purchase' | 'no_bill' | 'return';
  supplierId?: string | null;
  supplier: string;
  productId: string;
  item: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  note?: string;
}

export interface RegisterFilter {
  from?: string;
  to?: string;
  supplierId?: string;
  productId?: string;
  /** Show stock received without a supplier bill and goods sent back too (default true). */
  includeOther?: boolean;
}

export const purchaseRegister = (
  src: { purchases: Purchase[]; returns: StockReturn[]; adjustments: StockAdjustment[]; suppliers: Supplier[]; products: Product[] },
  f: RegisterFilter = {}
): { rows: RegisterRow[]; totalQtyByUnit: Record<string, number>; received: number; returned: number; net: number } => {
  const sup = (id?: string | null) => {
    const s = src.suppliers.find((x) => x.id === id);
    return s ? s.company || s.name : 'Supplier';
  };
  const prod = (id: string) => src.products.find((p) => p.id === id);
  const inRange = (d: string) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
  const withOther = f.includeOther !== false;
  const rows: RegisterRow[] = [];
  src.purchases.forEach((p) => {
    const pr = prod(p.productId);
    rows.push({ id: p.id, date: p.date, ref: p.receiptNumber, kind: 'purchase', supplierId: p.supplierId, supplier: sup(p.supplierId), productId: p.productId, item: pr?.name || 'Item', unit: pr?.unit || 'pcs', qty: p.kg, rate: p.pricePerKg, amount: p.amount, note: p.notes });
  });
  if (withOther) {
    src.adjustments.filter((a) => a.reason === 'received' && a.deltaKg > 0).forEach((a) => {
      const pr = prod(a.productId);
      const rate = a.costPerKg || 0;
      rows.push({ id: a.id, date: a.date.slice(0, 10), ref: 'No bill', kind: 'no_bill', supplierId: null, supplier: 'No supplier bill', productId: a.productId, item: pr?.name || 'Item', unit: pr?.unit || 'pcs', qty: a.deltaKg, rate, amount: round2(rate * a.deltaKg), note: a.note });
    });
    src.returns.filter((r) => r.kind === 'purchase').forEach((r) => {
      const pr = prod(r.productId);
      rows.push({ id: r.id, date: r.date, ref: r.returnNumber, kind: 'return', supplierId: r.supplierId, supplier: sup(r.supplierId), productId: r.productId, item: pr?.name || 'Item', unit: r.unit || pr?.unit || 'pcs', qty: -r.kg, rate: r.pricePerKg, amount: -r.amount, note: r.reason });
    });
  }
  const out = rows
    .filter((r) => inRange(r.date))
    .filter((r) => !f.supplierId || r.supplierId === f.supplierId)
    .filter((r) => !f.productId || r.productId === f.productId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.ref.localeCompare(b.ref)));
  const totalQtyByUnit: Record<string, number> = {};
  out.forEach((r) => (totalQtyByUnit[`${r.item}|${r.unit}`] = round2((totalQtyByUnit[`${r.item}|${r.unit}`] || 0) + r.qty)));
  const received = round2(out.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0));
  const returned = round2(-out.filter((r) => r.amount < 0).reduce((a, r) => a + r.amount, 0));
  return { rows: out, totalQtyByUnit, received, returned, net: round2(received - returned) };
};

// ---------------------------------------------------------------------------
// Profit from bills (item-wise and customer-wise)
// ---------------------------------------------------------------------------
export interface ProfitRow {
  key: string;
  name: string;
  /** Item rows: quantity sold (net of returns) and its unit. */
  qty?: number;
  unit?: string;
  /** Customer rows: number of bills. */
  bills?: number;
  sales: number;
  cost: number;
  profit: number;
  /** Profit as % of sales (null when there were no sales). */
  marginPct: number | null;
  /** Lines whose cost is unknown (profit overstated for those). */
  uncosted: number;
}

export interface ProfitReport {
  from: string;
  to: string;
  byItem: ProfitRow[];
  byCustomer: ProfitRow[];
  totals: { sales: number; cost: number; profit: number; marginPct: number | null; bills: number; uncosted: number };
}

/**
 * Profit from bills in a date range. Sales are the bill lines net of the bill's discount (shared
 * across its lines by amount); tax and delivery charges are not sales of an item. Cost is taken
 * exactly as the journal does (billLineUnitCost), so the total cost equals Cost of goods sold for
 * those bills. Customer returns (credit notes) in the range come off both sales and cost.
 */
export const profitFromBills = (
  src: { invoices: Invoice[]; returns: StockReturn[]; purchases: Purchase[]; products: Product[]; customers: Customer[] },
  from: string,
  to: string
): ProfitReport => {
  const items = new Map<string, ProfitRow>();
  const custs = new Map<string, ProfitRow & { billIds: Set<string> }>();
  const prod = (id: string) => src.products.find((p) => p.id === id);
  const itemRow = (productId: string, name: string, unit?: string) => {
    let r = items.get(productId);
    if (!r) {
      r = { key: productId, name: prod(productId)?.name || name, unit: unit || prod(productId)?.unit || 'pcs', qty: 0, sales: 0, cost: 0, profit: 0, marginPct: null, uncosted: 0 };
      items.set(productId, r);
    }
    return r;
  };
  const custRow = (customerId: string, name: string) => {
    let r = custs.get(customerId);
    if (!r) {
      r = { key: customerId, name, bills: 0, billIds: new Set(), sales: 0, cost: 0, profit: 0, marginPct: null, uncosted: 0 };
      custs.set(customerId, r);
    }
    return r;
  };
  const customerName = (id?: string | null) => src.customers.find((c) => c.id === id)?.name || 'Customer';

  src.invoices.forEach((inv) => {
    // Bills made in the app (simple billing). Trading invoices are profit on dispatches, not here.
    if (!inv.billKind || inv.status === 'cancelled') return;
    if (inv.issueDate < from || inv.issueDate > to) return;
    const lines = inv.items.filter((it) => it.qty != null || it.kg != null);
    const gross = lines.reduce((a, it) => a + (Number(it.amount) || 0), 0);
    const discount = Number(inv.discount) || 0;
    const c = custRow(inv.customerId, inv.customerName || customerName(inv.customerId));
    c.billIds.add(inv.id);
    lines.forEach((it) => {
      const qty = Number(it.qty ?? it.kg) || 0;
      const amount = Number(it.amount) || 0;
      const share = gross > 0 ? (amount / gross) * discount : 0;
      const sales = amount - share;
      const unitCost = billLineUnitCost(it, inv.issueDate, src.purchases, src.products);
      const cost = unitCost ? unitCost * qty : 0;
      const r = itemRow(it.productId, it.productName, it.unit);
      r.qty = (r.qty || 0) + qty;
      r.sales += sales;
      r.cost += cost;
      c.sales += sales;
      c.cost += cost;
      if (!unitCost && qty > 0) {
        r.uncosted += 1;
        c.uncosted += 1;
      }
    });
  });

  src.returns.forEach((ret) => {
    if (ret.kind !== 'sales' || !ret.customerId) return;
    if (ret.date < from || ret.date > to) return;
    const unitCost = billLineUnitCost({ productId: ret.productId }, ret.date, src.purchases, src.products);
    const cost = unitCost ? unitCost * ret.kg : 0;
    const r = itemRow(ret.productId, 'Item');
    r.qty = (r.qty || 0) - ret.kg;
    r.sales -= ret.amount;
    r.cost -= cost;
    const c = custRow(ret.customerId, customerName(ret.customerId));
    c.sales -= ret.amount;
    c.cost -= cost;
  });

  const finish = <T extends ProfitRow>(r: T): T => {
    r.sales = round2(r.sales);
    r.cost = round2(r.cost);
    r.profit = round2(r.sales - r.cost);
    r.marginPct = Math.abs(r.sales) > EPS ? Math.round((r.profit / r.sales) * 1000) / 10 : null;
    if (r.qty != null) r.qty = round2(r.qty);
    return r;
  };
  const byItem = Array.from(items.values()).map(finish).sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name));
  const byCustomer = Array.from(custs.values())
    .map(({ billIds, ...r }) => finish({ ...r, bills: billIds.size }))
    .sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name));
  const sales = round2(byItem.reduce((a, r) => a + r.sales, 0));
  const cost = round2(byItem.reduce((a, r) => a + r.cost, 0));
  const profit = round2(sales - cost);
  return {
    from,
    to,
    byItem,
    byCustomer,
    totals: { sales, cost, profit, marginPct: Math.abs(sales) > EPS ? Math.round((profit / sales) * 1000) / 10 : null, bills: byCustomer.reduce((a, r) => a + (r.bills || 0), 0), uncosted: byItem.reduce((a, r) => a + r.uncosted, 0) },
  };
};

// ---------------------------------------------------------------------------
// Aging ("who owes for how long")
// ---------------------------------------------------------------------------

/**
 * Age one account's ledger, then reconcile to the balance on the account record: money owed that
 * the history can't explain (an opening balance typed in when the account was made) counts from
 * the day the account was made; a balance lower than the history (e.g. written off) is taken off
 * the oldest amounts first.
 */
const ageToBalance = (entries: LedgerEntry[], recorded: number, openedOn: string, asOf: string): AgingBuckets => {
  const base = ageLedger(entries, asOf);
  const diff = round2(recorded - base.total);
  if (Math.abs(diff) < EPS) return base;
  const firstDate = [...entries].map((e) => e.date).sort()[0];
  const opened = /^\d{4}-\d{2}-\d{2}/.test(openedOn) ? openedOn.slice(0, 10) : asOf;
  const openingDate = firstDate && firstDate < opened ? firstDate : opened;
  if (diff > 0) {
    // Opening dues: an extra debit on the day the account was opened, before everything else.
    return ageLedger([{ id: 'opening', entityType: 'customer', entityId: '', type: 'bill_issued', referenceId: 'OPENING', date: openingDate, description: '', debit: diff, credit: 0, balanceAfter: 0 }, ...entries], asOf);
  }
  // Less is owed than the history says: treat the difference as an extra payment (oldest first).
  return ageLedger([...entries, { id: 'writeoff', entityType: 'customer', entityId: '', type: 'payment_received', referenceId: '', date: asOf, description: '', debit: 0, credit: -diff, balanceAfter: 0 }], asOf);
};

export const billingReceivablesAging = (customers: Customer[], ledger: LedgerEntry[], asOf: string): AgingRow[] =>
  customers
    .filter((c) => c.totalDue > EPS)
    .map((c) => ({
      entityId: c.id,
      name: c.name,
      company: c.company,
      phone: c.phone,
      recordedBalance: c.totalDue,
      ...ageToBalance(ledger.filter((l) => l.entityType === 'customer' && l.entityId === c.id && l.date <= asOf), c.totalDue, c.createdAt, asOf),
    }))
    .sort((a, b) => b.d90plus - a.d90plus || b.d61_90 - a.d61_90 || b.total - a.total);

export const billingPayablesAging = (suppliers: Supplier[], ledger: LedgerEntry[], asOf: string): AgingRow[] =>
  suppliers
    .filter((s) => s.totalOwed > EPS)
    .map((s) => ({
      entityId: s.id,
      name: s.company || s.name,
      company: s.company,
      phone: s.phone,
      recordedBalance: s.totalOwed,
      ...ageToBalance(ledger.filter((l) => l.entityType === 'supplier' && l.entityId === s.id && l.date <= asOf), s.totalOwed, s.createdAt, asOf),
    }))
    .sort((a, b) => b.d90plus - a.d90plus || b.d61_90 - a.d61_90 || b.total - a.total);

export interface OverdueCustomer {
  customer: Customer;
  /** Money owed that is more than 60 days old. */
  oldAmount: number;
  oldestDays: number;
  overLimit: boolean;
}

/** Customers over their credit limit, or with money owed for more than 60 days (worst first). */
export const overdueCustomers = (customers: Customer[], ledger: LedgerEntry[], asOf: string): OverdueCustomer[] => {
  const aging = new Map(billingReceivablesAging(customers, ledger, asOf).map((r) => [r.entityId, r]));
  return customers
    .map((c) => {
      const a = aging.get(c.id);
      const old = a ? round2(a.d61_90 + a.d90plus) : 0;
      const overLimit = c.creditLimit > 0 && c.totalDue > c.creditLimit + EPS;
      return { customer: c, oldAmount: old, oldestDays: a?.oldestDays || 0, overLimit };
    })
    .filter((x) => x.overLimit || x.oldAmount > EPS)
    .sort((a, b) => b.oldAmount - a.oldAmount || b.customer.totalDue - a.customer.totalDue);
};
