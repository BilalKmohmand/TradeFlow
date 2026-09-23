/**
 * Sales extras: trade schemes (bonus qty), salesmen / areas (routes), commission, recovery list and
 * late-payment interest. Pure functions only — the actions live in context/salesExtrasActions.ts and
 * the postings in utils/accounting.ts (see the "Sales extras" block in its header).
 */
import { Customer, Expense, Invoice, LedgerEntry, SalesArea, Salesman, Scheme, StockReturn } from '../types';
import { balanceOn } from './stockReports';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 0.005;
const DAY = 86400000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Schemes
// ---------------------------------------------------------------------------

/** The scheme is on for this customer on this date. */
export const schemeApplies = (s: Scheme, customerId: string, date: string): boolean => {
  if (!s.active) return false;
  if (s.fromDate && date < s.fromDate) return false;
  if (s.toDate && date > s.toDate) return false;
  if (s.customerIds && s.customerIds.length > 0 && !s.customerIds.includes(customerId)) return false;
  return true;
};

/** Free qty a scheme gives for `qty` bought (0 for a % scheme or below the first step). */
export const schemeFreeQty = (s: Scheme, qty: number): number => {
  if (!(qty > 0)) return 0;
  if (s.kind === 'free_every') {
    const buy = Number(s.buyQty) || 0;
    const free = Number(s.freeQty) || 0;
    return buy > 0 && free > 0 ? Math.floor(qty / buy + 1e-9) * free : 0;
  }
  if (s.kind === 'free_slab') {
    const hit = [...(s.slabs || [])].filter((x) => x.minQty > 0 && x.freeQty > 0 && qty + 1e-9 >= x.minQty).sort((a, b) => b.minQty - a.minQty)[0];
    return hit ? hit.freeQty : 0;
  }
  return 0;
};

/** One-line description, e.g. "Buy 10 get 1 free" / "50+ → 3 free, 100+ → 7 free" / "5% off on 20+". */
export const schemeRule = (s: Scheme, unit = ''): string => {
  const u = unit ? ` ${unit}` : '';
  if (s.kind === 'free_every') return `Buy ${s.buyQty || 0}${u} get ${s.freeQty || 0} free`;
  if (s.kind === 'free_slab') return [...(s.slabs || [])].sort((a, b) => a.minQty - b.minQty).map((x) => `${x.minQty}+${u} → ${x.freeQty} free`).join(', ') || 'No slabs';
  return `${s.pctOff || 0}% off on ${s.minQty || 0}${u} or more`;
};

/** Check a scheme before saving; null = fine. */
export const validateScheme = (s: Partial<Scheme>): string | null => {
  if (!s.name?.trim()) return 'Give the scheme a name.';
  if (!s.productId) return 'Pick the item the scheme is on.';
  if (s.fromDate && s.toDate && s.toDate < s.fromDate) return 'The end date is before the start date.';
  if (s.kind === 'free_every') {
    if (!((Number(s.buyQty) || 0) > 0)) return 'Enter how many must be bought (e.g. 10).';
    if (!((Number(s.freeQty) || 0) > 0)) return 'Enter how many are free (e.g. 1).';
  } else if (s.kind === 'free_slab') {
    const slabs = (s.slabs || []).filter((x) => x.minQty > 0 || x.freeQty > 0);
    if (slabs.length === 0) return 'Add at least one slab (e.g. 50 or more → 3 free).';
    if (slabs.some((x) => !(x.minQty > 0) || !(x.freeQty > 0))) return 'Every slab needs a quantity and a free quantity.';
    if (new Set(slabs.map((x) => x.minQty)).size !== slabs.length) return 'Two slabs start at the same quantity.';
  } else if (s.kind === 'pct_off') {
    const p = Number(s.pctOff) || 0;
    if (!(p > 0 && p < 100)) return 'Enter the % off (between 0 and 100).';
    if (!((Number(s.minQty) || 0) > 0)) return 'Enter the quantity the discount starts at.';
  } else return 'Pick the kind of scheme.';
  return null;
};

export interface SchemeFreeLine {
  /** Stable key: scheme + free item. */
  key: string;
  schemeId: string;
  schemeName: string;
  /** The item bought that earned it. */
  forProductId: string;
  productId: string;
  qty: number;
}

export interface SchemePct {
  schemeId: string;
  schemeName: string;
  pct: number;
}

export interface SchemeResult {
  free: SchemeFreeLine[];
  /** % off by item bought (applied to every line of that item). */
  pct: Record<string, SchemePct>;
}

/**
 * What the schemes give on a bill. Quantities of the same item on several lines count together.
 * When two schemes of one kind cover the same item, the one giving the customer more wins.
 */
export const evaluateSchemes = (schemes: Scheme[], lines: { productId: string; qty: number }[], customerId: string, date: string): SchemeResult => {
  const bought = new Map<string, number>();
  lines.forEach((l) => {
    if (l.productId && l.qty > 0) bought.set(l.productId, round2((bought.get(l.productId) || 0) + l.qty));
  });
  const free: SchemeFreeLine[] = [];
  const pct: Record<string, SchemePct> = {};
  bought.forEach((qty, productId) => {
    const on = schemes.filter((s) => s.productId === productId && schemeApplies(s, customerId, date));
    const bestFree = on
      .filter((s) => s.kind !== 'pct_off')
      .map((s) => ({ s, q: schemeFreeQty(s, qty) }))
      .filter((x) => x.q > 0)
      .sort((a, b) => b.q - a.q)[0];
    if (bestFree) {
      const freeProduct = bestFree.s.freeProductId || productId;
      free.push({ key: `${bestFree.s.id}|${freeProduct}`, schemeId: bestFree.s.id, schemeName: bestFree.s.name, forProductId: productId, productId: freeProduct, qty: round2(bestFree.q) });
    }
    const bestPct = on.filter((s) => s.kind === 'pct_off' && qty + 1e-9 >= (Number(s.minQty) || 0)).sort((a, b) => (b.pctOff || 0) - (a.pctOff || 0))[0];
    if (bestPct) pct[productId] = { schemeId: bestPct.id, schemeName: bestPct.name, pct: Number(bestPct.pctOff) || 0 };
  });
  return { free, pct };
};

// ---------------------------------------------------------------------------
// Sales by salesman / area
// ---------------------------------------------------------------------------
export type GroupBy = 'salesman' | 'area';

export interface SalesGroupRow {
  id: string;
  name: string;
  bills: number;
  /** Goods sold after line and bill discounts (before tax and freight). */
  sales: number;
  freight: number;
  tax: number;
  /** What was billed in all (sales + tax + freight). */
  billed: number;
  /** Goods returned on these bills in the period (before tax). */
  returns: number;
  /** sales − returns */
  net: number;
  /** Free goods given (qty, all items). */
  freeQty: number;
}

export const billNetSales = (inv: Pick<Invoice, 'subtotal' | 'discount'>) => round2((Number(inv.subtotal) || 0) - (Number(inv.discount) || 0));
const billFreight = (inv: Pick<Invoice, 'freightCharges' | 'handlingCharges'>) => round2((Number(inv.freightCharges) || 0) + (Number(inv.handlingCharges) || 0));

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
const NONE = '';

export const salesByGroup = (
  invoices: Invoice[],
  returns: StockReturn[],
  from: string,
  to: string,
  by: GroupBy,
  names: { salesmen: Salesman[]; areas: SalesArea[] }
): { rows: SalesGroupRow[]; totals: SalesGroupRow } => {
  const list = by === 'salesman' ? names.salesmen : names.areas;
  const nameOf = (id: string) => (id ? list.find((x) => x.id === id)?.name || 'Removed' : by === 'salesman' ? 'No salesman' : 'No area');
  const rows = new Map<string, SalesGroupRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { id, name: nameOf(id), bills: 0, sales: 0, freight: 0, tax: 0, billed: 0, returns: 0, net: 0, freeQty: 0 };
      rows.set(id, r);
    }
    return r;
  };
  const bills = invoices.filter((i) => i.billKind && i.status !== 'cancelled');
  const keyOf = (i: Invoice) => (by === 'salesman' ? i.salesmanId : i.areaId) || NONE;
  bills.forEach((inv) => {
    if (!inRange(inv.issueDate, from, to)) return;
    const r = row(keyOf(inv));
    r.bills += 1;
    r.sales += billNetSales(inv);
    r.freight += billFreight(inv);
    r.tax += Number(inv.taxAmount) || 0;
    r.billed += Number(inv.totalAmount) || 0;
    r.freeQty += inv.items.filter((it) => it.free).reduce((a, it) => a + (it.qty ?? it.kg ?? 0), 0);
  });
  const byId = new Map(bills.map((i) => [i.id, i]));
  returns.forEach((ret) => {
    if (ret.kind !== 'sales' || !ret.invoiceId || !inRange(ret.date, from, to)) return;
    const inv = byId.get(ret.invoiceId);
    if (!inv) return;
    row(keyOf(inv)).returns += round2((Number(ret.amount) || 0) - (Number(ret.taxAmount) || 0));
  });
  const out = Array.from(rows.values()).map((r) => ({ ...r, sales: round2(r.sales), freight: round2(r.freight), tax: round2(r.tax), billed: round2(r.billed), returns: round2(r.returns), net: round2(r.sales - r.returns), freeQty: round2(r.freeQty) }));
  out.sort((a, b) => (a.id === NONE ? 1 : b.id === NONE ? -1 : b.net - a.net || a.name.localeCompare(b.name)));
  const sum = (k: keyof SalesGroupRow) => round2(out.reduce((a, r) => a + (r[k] as number), 0));
  return { rows: out, totals: { id: 'total', name: 'Total', bills: out.reduce((a, r) => a + r.bills, 0), sales: sum('sales'), freight: sum('freight'), tax: sum('tax'), billed: sum('billed'), returns: sum('returns'), net: sum('net'), freeQty: sum('freeQty') } };
};

// ---------------------------------------------------------------------------
// Open items (what is still owed, bill by bill, payments clearing the oldest first)
// ---------------------------------------------------------------------------
export interface OpenItem {
  date: string;
  amount: number;
  type: LedgerEntry['type'] | 'opening';
  ref: string;
}

/**
 * Customer's unpaid items as of a date. Payments and credits clear the oldest first. A balance on the
 * customer record that the history does not explain (opening dues) counts from the day the account was
 * made, exactly as the aging report does.
 */
export const openItems = (customer: Customer, ledger: LedgerEntry[], asOf: string): OpenItem[] => {
  const rows = ledger.filter((l) => l.entityType === 'customer' && l.entityId === customer.id && l.date <= asOf).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const net = round2(rows.reduce((a, l) => a + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0));
  const items: OpenItem[] = [];
  let credit = 0;
  // What they owed at the end of that day (today's balance less anything posted later).
  const diff = round2(balanceOn(customer.totalDue, ledger, 'customer', customer.id, asOf) - net);
  if (diff > EPS) {
    const created = (customer.createdAt || '').slice(0, 10);
    const first = rows[0]?.date;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(created) ? (first && first < created ? first : created) : first || asOf;
    items.push({ date, amount: diff, type: 'opening', ref: 'Opening balance' });
  } else if (diff < -EPS) credit += -diff;
  rows.forEach((l) => {
    if ((Number(l.debit) || 0) > 0) items.push({ date: l.date, amount: Number(l.debit), type: l.type, ref: l.referenceId || l.description });
    credit += Number(l.credit) || 0;
  });
  for (const it of items) {
    if (credit <= EPS) break;
    const used = Math.min(it.amount, credit);
    it.amount = round2(it.amount - used);
    credit = round2(credit - used);
  }
  return items.filter((i) => i.amount > EPS);
};

// ---------------------------------------------------------------------------
// Recovery list: who owes, by area or salesman, oldest bill first
// ---------------------------------------------------------------------------
export interface RecoveryRow {
  customer: Customer;
  due: number;
  oldestDate: string | null;
  oldestDays: number;
  lastPaymentDate: string | null;
}

export interface RecoveryGroup {
  id: string;
  name: string;
  rows: RecoveryRow[];
  total: number;
}

export const recoveryList = (
  customers: Customer[],
  ledger: LedgerEntry[],
  asOf: string,
  by: GroupBy,
  names: { salesmen: Salesman[]; areas: SalesArea[] },
  filterId?: string
): { groups: RecoveryGroup[]; total: number; count: number } => {
  const list = by === 'salesman' ? names.salesmen : names.areas;
  const groups = new Map<string, RecoveryGroup>();
  customers
    .map((c) => ({ c, due: balanceOn(c.totalDue, ledger, 'customer', c.id, asOf) }))
    .filter(({ due }) => due > EPS)
    .forEach(({ c, due }) => {
      const gid = (by === 'salesman' ? c.salesmanId : c.areaId) || NONE;
      if (filterId != null && filterId !== 'all' && gid !== filterId) return;
      const items = openItems(c, ledger, asOf);
      const oldest = items[0]?.date || null;
      const pays = ledger.filter((l) => l.entityType === 'customer' && l.entityId === c.id && l.date <= asOf && l.credit > 0 && (l.type === 'payment_received' || l.type === 'cheque_received')).map((l) => l.date).sort();
      let g = groups.get(gid);
      if (!g) {
        g = { id: gid, name: gid ? list.find((x) => x.id === gid)?.name || 'Removed' : by === 'salesman' ? 'No salesman' : 'No area', rows: [], total: 0 };
        groups.set(gid, g);
      }
      g.rows.push({ customer: c, due, oldestDate: oldest, oldestDays: oldest ? Math.max(0, daysBetween(oldest, asOf)) : 0, lastPaymentDate: pays.length ? pays[pays.length - 1] : null });
      g.total = round2(g.total + due);
    });
  const out = Array.from(groups.values());
  out.forEach((g) => g.rows.sort((a, b) => (a.oldestDate || '9999').localeCompare(b.oldestDate || '9999') || b.due - a.due));
  out.sort((a, b) => (a.id === NONE ? 1 : b.id === NONE ? -1 : a.name.localeCompare(b.name)));
  return { groups: out, total: round2(out.reduce((a, g) => a + g.total, 0)), count: out.reduce((a, g) => a + g.rows.length, 0) };
};

// ---------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------
export interface CommissionRow {
  salesman: Salesman;
  basis: 'sales' | 'recovery';
  pct: number;
  /** Sales (after returns) or cash recovered in the period. */
  base: number;
  earned: number;
  /** Everything earned up to the end of the period, minus everything paid up to then. */
  earnedToDate: number;
  paidToDate: number;
  owed: number;
}

/** Who collected a customer payment: the salesman on the row, else the bill's salesman, else the customer's. */
export const collectorOf = (l: LedgerEntry, invoices: Map<string, Invoice>, customers: Map<string, Customer>): string => {
  if (l.salesmanId) return l.salesmanId;
  const inv = l.sourceId ? invoices.get(l.sourceId) : undefined;
  if (inv?.salesmanId) return inv.salesmanId;
  return customers.get(l.entityId)?.salesmanId || '';
};

/** Commission paid to a salesman (expense rows the "Pay commission" button made). */
export const commissionPaid = (expenses: Expense[], salesmanId: string, to?: string) =>
  round2(expenses.filter((e) => e.category === 'salesman_commission' && e.referenceId === salesmanId && (!to || e.date <= to)).reduce((a, e) => a + (Number(e.amount) || 0), 0));

export const commissionReport = (src: { salesmen: Salesman[]; invoices: Invoice[]; returns: StockReturn[]; ledger: LedgerEntry[]; customers: Customer[]; expenses: Expense[] }, from: string, to: string): CommissionRow[] => {
  const bills = src.invoices.filter((i) => i.billKind && i.status !== 'cancelled');
  const invById = new Map(bills.map((i) => [i.id, i]));
  const custById = new Map(src.customers.map((c) => [c.id, c]));
  const baseFor = (s: Salesman, a: string, b: string): number => {
    if ((s.commissionOn || 'sales') === 'recovery') {
      // Money recovered: cash / bank payments and cheques taken, less cheques that bounced.
      return round2(src.ledger.filter((l) => l.entityType === 'customer' && l.date >= a && l.date <= b && (l.type === 'payment_received' || l.type === 'cheque_received' || l.type === 'cheque_returned') && collectorOf(l, invById, custById) === s.id)
        .reduce((acc, l) => acc + (l.type === 'cheque_returned' ? -(Number(l.debit) || 0) : Number(l.credit) || 0), 0));
    }
    const sales = bills.filter((i) => i.salesmanId === s.id && i.issueDate >= a && i.issueDate <= b).reduce((acc, i) => acc + billNetSales(i), 0);
    const rets = src.returns.filter((r) => r.kind === 'sales' && r.invoiceId && r.date >= a && r.date <= b && invById.get(r.invoiceId)?.salesmanId === s.id).reduce((acc, r) => acc + (Number(r.amount) || 0) - (Number(r.taxAmount) || 0), 0);
    return round2(sales - rets);
  };
  return src.salesmen
    .filter((s) => (Number(s.commissionPct) || 0) > 0 || commissionPaid(src.expenses, s.id) > 0)
    .map((s) => {
      const pct = Number(s.commissionPct) || 0;
      const base = baseFor(s, from, to);
      const earned = round2((base * pct) / 100);
      const earnedToDate = round2((baseFor(s, '0000-01-01', to) * pct) / 100);
      const paidToDate = commissionPaid(src.expenses, s.id, to);
      return { salesman: s, basis: (s.commissionOn || 'sales') as 'sales' | 'recovery', pct, base, earned, earnedToDate, paidToDate, owed: round2(earnedToDate - paidToDate) };
    })
    .sort((a, b) => b.earned - a.earned || a.salesman.name.localeCompare(b.salesman.name));
};

// ---------------------------------------------------------------------------
// Interest / late-payment charge
// ---------------------------------------------------------------------------
export interface InterestLine {
  ref: string;
  date: string;
  amount: number;
  /** Charged from … to (days). */
  from: string;
  days: number;
  interest: number;
}

export interface InterestRow {
  customer: Customer;
  pct: number;
  afterDays: number;
  overdue: number;
  lines: InterestLine[];
  interest: number;
  /** Interest already charged up to this date (the next run starts from here). */
  lastChargedOn: string | null;
}

/**
 * Interest due on each customer's overdue money, as of a date. Only customers with a rate set are
 * charged. Each unpaid item (bill, opening balance, bounced cheque …; not earlier interest) earns
 * `pct`% a month (pro rata by day, 30-day month) from `afterDays` days after its date, or from the
 * last interest run if that is later — so running twice never charges the same days twice.
 */
export const interestPreview = (customers: Customer[], ledger: LedgerEntry[], asOf: string): InterestRow[] =>
  customers
    .filter((c) => (Number(c.interestPctPerMonth) || 0) > 0 && (Number(c.totalDue) || 0) > EPS)
    .map((c) => {
      const pct = Number(c.interestPctPerMonth) || 0;
      const afterDays = Math.max(0, Math.round(Number(c.interestAfterDays) || 0));
      const charged = ledger.filter((l) => l.entityType === 'customer' && l.entityId === c.id && l.type === 'interest_charge' && l.date <= asOf).map((l) => l.date).sort();
      const lastChargedOn = charged.length ? charged[charged.length - 1] : null;
      const lines: InterestLine[] = [];
      openItems(c, ledger, asOf).forEach((it) => {
        if (it.type === 'interest_charge') return;
        const start = addDays(it.date, afterDays);
        const from = lastChargedOn && lastChargedOn > start ? lastChargedOn : start;
        const days = daysBetween(from, asOf);
        if (days <= 0) return;
        const interest = round2((it.amount * pct * days) / 100 / 30);
        if (interest <= 0) return;
        lines.push({ ref: it.ref, date: it.date, amount: it.amount, from, days, interest });
      });
      return { customer: c, pct, afterDays, overdue: round2(lines.reduce((a, l) => a + l.amount, 0)), lines, interest: round2(lines.reduce((a, l) => a + l.interest, 0)), lastChargedOn };
    })
    .filter((r) => r.interest >= 1)
    .sort((a, b) => b.interest - a.interest);
