import { Customer, Dispatch, Expense, ExpenseCategory, LedgerEntry, Product, Purchase, Supplier } from '../types';

const round2 = (n: number) => Number(n.toFixed(2));
const pad = (n: number) => String(n).padStart(2, '0');

export const monthKey = (iso: string) => iso.slice(0, 7);
export const currentMonthKey = () => new Date().toISOString().slice(0, 7);
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-PK', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
export const shiftMonth = (key: string, delta: number) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

// ---------------------------------------------------------------------------
// Cost basis: weighted-average purchase cost per product up to a date.
// Falls back to the most recent purchase of any date, then to null (unknown).
// ---------------------------------------------------------------------------
export const costPerKgOn = (purchases: Purchase[], productId: string, date: string): number | null => {
  const upTo = purchases.filter((p) => p.productId === productId && p.date <= date);
  const pool = upTo.length > 0 ? upTo : purchases.filter((p) => p.productId === productId);
  if (pool.length === 0) return null;
  const kg = pool.reduce((a, p) => a + p.kg, 0);
  const amount = pool.reduce((a, p) => a + p.amount, 0);
  return kg > 0 ? amount / kg : null;
};

export interface ProductMargin {
  productId: string;
  productName: string;
  soldKg: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
  avgSellPerKg: number;
  avgCostPerKg: number | null;
}

export interface MonthlyPnL {
  month: string;
  label: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  expenses: number;
  expensesByCategory: Partial<Record<ExpenseCategory, number>>;
  netProfit: number;
  netMarginPct: number | null;
  dispatchCount: number;
  soldKg: number;
  purchasedKg: number;
  purchasedAmount: number;
  /** Dispatched kg for which no purchase cost exists (COGS understated). */
  uncostedKg: number;
  products: ProductMargin[];
}

export const computeMonthlyPnL = (
  month: string,
  dispatches: Dispatch[],
  purchases: Purchase[],
  expenses: Expense[],
  products: Product[]
): MonthlyPnL => {
  const inMonth = dispatches.filter((d) => monthKey(d.date) === month);
  const byProduct = new Map<string, ProductMargin>();
  let uncostedKg = 0;

  inMonth.forEach((d) => {
    const cost = costPerKgOn(purchases, d.productId, d.date);
    if (cost == null) uncostedKg += d.kg;
    const row =
      byProduct.get(d.productId) ||
      {
        productId: d.productId,
        productName: products.find((p) => p.id === d.productId)?.name || 'Unknown product',
        soldKg: 0,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        marginPct: null,
        avgSellPerKg: 0,
        avgCostPerKg: cost,
      };
    row.soldKg += d.kg;
    row.revenue += d.amount;
    row.cogs += cost != null ? cost * d.kg : 0;
    byProduct.set(d.productId, row);
  });

  const productRows = Array.from(byProduct.values()).map((r) => {
    const grossProfit = round2(r.revenue - r.cogs);
    return {
      ...r,
      revenue: round2(r.revenue),
      cogs: round2(r.cogs),
      grossProfit,
      marginPct: r.revenue > 0 ? round2((grossProfit / r.revenue) * 100) : null,
      avgSellPerKg: r.soldKg > 0 ? round2(r.revenue / r.soldKg) : 0,
      avgCostPerKg: r.soldKg > 0 && r.cogs > 0 ? round2(r.cogs / r.soldKg) : r.avgCostPerKg,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const revenue = round2(productRows.reduce((a, r) => a + r.revenue, 0));
  const cogs = round2(productRows.reduce((a, r) => a + r.cogs, 0));
  const grossProfit = round2(revenue - cogs);

  const monthExpenses = expenses.filter((e) => monthKey(e.date) === month);
  const expensesByCategory: Partial<Record<ExpenseCategory, number>> = {};
  monthExpenses.forEach((e) => {
    expensesByCategory[e.category] = round2((expensesByCategory[e.category] || 0) + e.amount);
  });
  const expenseTotal = round2(monthExpenses.reduce((a, e) => a + e.amount, 0));
  const netProfit = round2(grossProfit - expenseTotal);

  const monthPurchases = purchases.filter((p) => monthKey(p.date) === month);

  return {
    month,
    label: monthLabel(month),
    revenue,
    cogs,
    grossProfit,
    grossMarginPct: revenue > 0 ? round2((grossProfit / revenue) * 100) : null,
    expenses: expenseTotal,
    expensesByCategory,
    netProfit,
    netMarginPct: revenue > 0 ? round2((netProfit / revenue) * 100) : null,
    dispatchCount: inMonth.length,
    soldKg: inMonth.reduce((a, d) => a + d.kg, 0),
    purchasedKg: monthPurchases.reduce((a, p) => a + p.kg, 0),
    purchasedAmount: round2(monthPurchases.reduce((a, p) => a + p.amount, 0)),
    uncostedKg,
    products: productRows,
  };
};

export const pnlTrend = (
  endMonth: string,
  months: number,
  dispatches: Dispatch[],
  purchases: Purchase[],
  expenses: Expense[],
  products: Product[]
): MonthlyPnL[] => {
  const out: MonthlyPnL[] = [];
  for (let i = months - 1; i >= 0; i--) {
    out.push(computeMonthlyPnL(shiftMonth(endMonth, -i), dispatches, purchases, expenses, products));
  }
  return out;
};

// ---------------------------------------------------------------------------
// Aging: apply credits (payments) FIFO against debits (invoices) from the ledger,
// then bucket whatever is still open by age in days.
// ---------------------------------------------------------------------------
export interface AgingBuckets {
  current: number; // 0-30 days
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
  oldestOpenDate: string | null;
  oldestDays: number;
}

export interface AgingRow extends AgingBuckets {
  entityId: string;
  name: string;
  company: string;
  phone: string;
  /** Balance on the account record (may differ from ledger-derived total if manually adjusted). */
  recordedBalance: number;
}

const daysBetween = (fromISO: string, toISO: string) =>
  Math.floor((new Date(toISO + 'T00:00:00Z').getTime() - new Date(fromISO + 'T00:00:00Z').getTime()) / 86400000);

export const ageLedger = (entries: LedgerEntry[], asOf: string): AgingBuckets => {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const open: { date: string; amount: number }[] = [];
  let credit = 0;
  sorted.forEach((e) => {
    if (e.debit > 0) open.push({ date: e.date, amount: e.debit });
    if (e.credit > 0) credit += e.credit;
  });
  // Apply payments FIFO to the oldest invoices first
  for (const inv of open) {
    if (credit <= 0) break;
    const applied = Math.min(inv.amount, credit);
    inv.amount -= applied;
    credit -= applied;
  }
  const buckets: AgingBuckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0, oldestOpenDate: null, oldestDays: 0 };
  open.forEach((inv) => {
    if (inv.amount <= 0.005) return;
    const age = daysBetween(inv.date, asOf);
    if (age <= 30) buckets.current += inv.amount;
    else if (age <= 60) buckets.d31_60 += inv.amount;
    else if (age <= 90) buckets.d61_90 += inv.amount;
    else buckets.d90plus += inv.amount;
    buckets.total += inv.amount;
    if (!buckets.oldestOpenDate || inv.date < buckets.oldestOpenDate) {
      buckets.oldestOpenDate = inv.date;
      buckets.oldestDays = age;
    }
  });
  (['current', 'd31_60', 'd61_90', 'd90plus', 'total'] as const).forEach((k) => (buckets[k] = round2(buckets[k])));
  return buckets;
};

export const receivablesAging = (customers: Customer[], ledger: LedgerEntry[], asOf: string): AgingRow[] =>
  customers
    .map((c) => ({
      entityId: c.id,
      name: c.name,
      company: c.company,
      phone: c.phone,
      recordedBalance: c.totalDue,
      ...ageLedger(ledger.filter((l) => l.entityType === 'customer' && l.entityId === c.id), asOf),
    }))
    .filter((r) => r.total > 0 || r.recordedBalance > 0)
    .sort((a, b) => b.total - a.total);

export const payablesAging = (suppliers: Supplier[], ledger: LedgerEntry[], asOf: string): AgingRow[] =>
  suppliers
    .map((s) => ({
      entityId: s.id,
      name: s.name,
      company: s.company,
      phone: s.phone,
      recordedBalance: s.totalOwed,
      ...ageLedger(ledger.filter((l) => l.entityType === 'supplier' && l.entityId === s.id), asOf),
    }))
    .filter((r) => r.total > 0 || r.recordedBalance > 0)
    .sort((a, b) => b.total - a.total);

export const sumAging = (rows: AgingRow[]): AgingBuckets =>
  rows.reduce(
    (acc, r) => ({
      current: round2(acc.current + r.current),
      d31_60: round2(acc.d31_60 + r.d31_60),
      d61_90: round2(acc.d61_90 + r.d61_90),
      d90plus: round2(acc.d90plus + r.d90plus),
      total: round2(acc.total + r.total),
      oldestOpenDate: null,
      oldestDays: Math.max(acc.oldestDays, r.oldestDays),
    }),
    { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0, oldestOpenDate: null, oldestDays: 0 } as AgingBuckets
  );

// ---------------------------------------------------------------------------
// Credit exposure: what a customer would owe if every active booking were fully dispatched.
// ---------------------------------------------------------------------------
export const creditExposure = (customer: Customer, bookings: { customerId: string; status: string; remainingKg: number; pricePerKg: number }[]) => {
  const committed = bookings
    .filter((b) => b.customerId === customer.id && b.status === 'active')
    .reduce((a, b) => a + b.remainingKg * b.pricePerKg, 0);
  return { outstanding: customer.totalDue, committed: round2(committed), exposure: round2(customer.totalDue + committed), limit: customer.creditLimit };
};
