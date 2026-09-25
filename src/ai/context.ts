/**
 * What the AI features send to /api/ai: small, relevant slices of the shop's data, built on the device.
 *
 * Everything here is pure and picks fields explicitly (never spreads a record), so a user's password hash,
 * the old master PIN or any other field a record may carry can never reach the request. Users without
 * finance rights get no profit, cost, cash or bank figures at all.
 */
import type { AppSettings, Cheque, Customer, Invoice, LedgerEntry, Product, Purchase, StockReturn, Supplier } from '../types';
import { billsOnly } from '../utils/billing';
import { billNetTotal } from '../utils/salesDocs';
import { openBills, daysFrom } from '../utils/reminders';
import { profitFromBills, overdueCustomers } from '../utils/stockReports';
import { chequesDueThisWeek } from '../utils/cheques';
import { shiftDate } from '../utils/stockFlow';
import { NAV_ENTRIES, NavAccess, entryAllowed } from '../utils/navMap';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface AiShopData {
  settings: Pick<AppSettings, 'companyName'>;
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  invoices: Invoice[];
  ledger: LedgerEntry[];
  cheques: Cheque[];
  returns?: StockReturn[];
  purchases?: Purchase[];
}

/** Money and profit figures, computed by the caller (owner snapshot); only used for users with finance rights. */
export interface AiFinanceFigures {
  cash?: number;
  bank?: number;
  profitToday?: number;
  profitMonth?: number;
}

/** Letters and digits only, lower case, doubled Latin letters squashed ("udhaar" = "udhar"). Urdu letters kept. */
export const normText = (s: string | undefined | null): string =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .replace(/([a-z])\1+/g, '$1')
    .trim();
const tokensOf = (s: string) => normText(s).split(' ').filter((t) => t.length >= 2);

/** How well a record's names match the question's words (0 = not mentioned). */
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const relevance = (qTokens: string[], names: (string | undefined | null)[], code?: string | null, qCodes: string[] = []): number => {
  if (!qTokens.length) return 0;
  let score = 0;
  const c = code ? compact(code) : '';
  if (c && (qTokens.includes(c) || qCodes.includes(c))) score += 10;
  const words = names.flatMap((n) => tokensOf(n || ''));
  for (const t of qTokens) {
    if (t.length < 3) continue;
    if (words.includes(t)) score += 5;
    else if (words.some((w) => w.length >= 3 && (w.startsWith(t) || t.startsWith(w)))) score += 2;
  }
  return score;
};

/** Screens the answer may point to (only those this user may open). */
export const AI_SCREEN_IDS = [
  'customers', 'suppliers', 'items', 'bills', 'daily-sheet', 'money', 'aging-customers', 'recovery', 'receive', 'owner',
  'cheques', 'reorder', 'rep-stock-in-hand', 'rep-low-stock', 'rep-daily-sale', 'rep-receivables', 'rep-payables', 'profit-by-item', 'acc-cash-book', 'expense-sheets',
];
export const aiScreens = (access?: NavAccess): { id: string; label: string }[] =>
  AI_SCREEN_IDS.map((id) => NAV_ENTRIES.find((e) => e.id === id))
    .filter((e): e is (typeof NAV_ENTRIES)[number] => Boolean(e) && (!access || entryAllowed(e!, access)))
    .map((e) => ({ id: e.id, label: e.label }));

export interface AskContextOptions {
  today: string;
  question: string;
  /** May see profit, cost, cash and bank (view_finance or finance:view_pnl). */
  canFinance: boolean;
  finance?: AiFinanceFigures;
  screens?: { id: string; label: string }[];
  /** Largest JSON size to send; lists are cut down until it fits. */
  maxChars?: number;
  limits?: Partial<AskLimits>;
}
export interface AskLimits {
  customers: number;
  suppliers: number;
  items: number;
  bills: number;
}
const DEFAULT_ASK_LIMITS: AskLimits = { customers: 30, suppliers: 12, items: 40, bills: 15 };

const lastPayments = (ledger: LedgerEntry[]): Map<string, { date: string; amount: number }> => {
  const m = new Map<string, { date: string; amount: number }>();
  ledger.forEach((l) => {
    if (l.entityType !== 'customer' || l.type !== 'payment_received' || !(l.credit > 0)) return;
    const cur = m.get(l.entityId);
    if (!cur || l.date > cur.date) m.set(l.entityId, { date: l.date, amount: round2(l.credit) });
  });
  return m;
};

const salesIn = (bills: Invoice[], from: string, to: string) => {
  const rows = bills.filter((b) => b.issueDate >= from && b.issueDate <= to);
  return { amount: round2(rows.reduce((a, b) => a + billNetTotal(b), 0)), bills: rows.length };
};

/** Items sold in a range: qty and sales per item (no cost). */
const itemSales = (bills: Invoice[], from: string, to: string) => {
  const m = new Map<string, { qty: number; sales: number }>();
  bills.forEach((b) => {
    if (b.issueDate < from || b.issueDate > to) return;
    b.items.forEach((it) => {
      if (!it.productId) return;
      const r = m.get(it.productId) || { qty: 0, sales: 0 };
      r.qty += Number(it.qty ?? it.kg) || 0;
      r.sales += Number(it.amount) || 0;
      m.set(it.productId, r);
    });
  });
  return m;
};

const takeUnique = <T extends { id: string }>(lists: T[][], n: number): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists)
    for (const x of list) {
      if (out.length >= n) return out;
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      out.push(x);
    }
  return out;
};

/**
 * "Ask the shop": the data a question needs. Records the question names come first, then the most useful
 * ones (biggest debtors, low stock, best sellers, latest bills); lists shrink until the JSON fits `maxChars`.
 */
export const buildAskContext = (data: AiShopData, opts: AskContextOptions): Record<string, unknown> => {
  const maxChars = opts.maxChars ?? 30_000;
  let limits: AskLimits = { ...DEFAULT_ASK_LIMITS, ...(opts.limits || {}) };
  let ctx = askContextWith(data, opts, limits);
  for (let i = 0; i < 6 && JSON.stringify(ctx).length > maxChars; i++) {
    limits = { customers: Math.floor(limits.customers / 2), suppliers: Math.floor(limits.suppliers / 2), items: Math.floor(limits.items / 2), bills: Math.floor(limits.bills / 2) };
    ctx = askContextWith(data, opts, limits);
  }
  return ctx;
};

const askContextWith = (data: AiShopData, opts: AskContextOptions, limits: AskLimits): Record<string, unknown> => {
  const { today, canFinance } = opts;
  const q = tokensOf(opts.question);
  // Codes as typed ("C-0001", "101"), without their punctuation.
  const qc = opts.question.split(/\s+/).map(compact).filter(Boolean);
  const monthStart = `${today.slice(0, 7)}-01`;
  const bills = billsOnly(data.invoices);
  const paid = lastPayments(data.ledger);
  const custById = new Map(data.customers.map((c) => [c.id, c]));

  // Customers: named in the question, then who owes the most, then everyone else by name.
  const custScore = (c: Customer) => relevance(q, [c.name, c.company, c.city], c.code, qc);
  const namedCust = data.customers.map((c) => ({ c, s: custScore(c) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c);
  const debtors = [...data.customers].filter((c) => c.totalDue > 0).sort((a, b) => b.totalDue - a.totalDue);
  const customers = takeUnique([namedCust, debtors, [...data.customers].sort((a, b) => a.name.localeCompare(b.name))], limits.customers);

  const supScore = (s: Supplier) => relevance(q, [s.name, s.company, s.city], s.code, qc);
  const namedSup = data.suppliers.map((s) => ({ s, v: supScore(s) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).map((x) => x.s);
  const owedSup = [...data.suppliers].filter((s) => s.totalOwed > 0).sort((a, b) => b.totalOwed - a.totalOwed);
  const suppliers = takeUnique([namedSup, owedSup], limits.suppliers);

  const monthItems = itemSales(bills, monthStart, today);
  const itemScore = (p: Product) => relevance(q, [p.name, p.category, p.brand], p.code, qc);
  const namedItems = data.products.map((p) => ({ p, s: itemScore(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.p);
  const low = data.products.filter((p) => (Number(p.minThresholdKg) || 0) > 0 && p.stockKg <= p.minThresholdKg).sort((a, b) => a.stockKg - b.stockKg);
  const sellers = [...data.products].filter((p) => monthItems.has(p.id)).sort((a, b) => (monthItems.get(b.id)!.sales - monthItems.get(a.id)!.sales));
  const items = takeUnique([namedItems, low, sellers, [...data.products].sort((a, b) => a.name.localeCompare(b.name))], limits.items);

  // Bills: numbers typed in the question, the named customers' latest, then the latest overall.
  const byDate = [...bills].sort((a, b) => (b.issueDate + (b.createdAt || '')).localeCompare(a.issueDate + (a.createdAt || '')));
  const billNo = (no: string) => no.toLowerCase().replace(/[^a-z0-9]/g, '');
  // "INV-12", "inv 12", "S-14726" or just "12" in the question.
  const refs = (opts.question.match(/[a-z]{0,6}[-\s]?\d+/gi) || []).map(billNo);
  const namedBills = byDate.filter((b) => refs.some((t) => t === billNo(b.invoiceNumber) || (b.memoNo && t === billNo(b.memoNo)) || (/^\d+$/.test(t) && (b.invoiceNumber.match(/(\d+)\s*$/) || [])[1] === String(Number(t)))));
  const custBills = byDate.filter((b) => namedCust.slice(0, 3).some((c) => c.id === b.customerId));
  const recent = takeUnique([namedBills, custBills.slice(0, 5), byDate], limits.bills);

  const overdue = overdueCustomers(data.customers, data.ledger, today).slice(0, 10);
  const due = chequesDueThisWeek(data.cheques, today).slice(0, 10);

  const ctx: Record<string, unknown> = {
    shop: data.settings.companyName || 'Our shop',
    today,
    access: canFinance ? 'full' : 'This user may not see profit, cost, cash or bank figures: if asked, say they need the owner.',
    sales: {
      today: salesIn(bills, today, today),
      yesterday: salesIn(bills, shiftDate(today, -1), shiftDate(today, -1)),
      thisMonth: salesIn(bills, monthStart, today),
    },
    receivableTotal: round2(data.customers.reduce((a, c) => a + Math.max(0, c.totalDue), 0)),
    payableTotal: round2(data.suppliers.reduce((a, s) => a + Math.max(0, s.totalOwed), 0)),
    customers: customers.map((c) => {
      const open = openBills(c, data.invoices);
      const oldest = open[open.length - 1];
      return {
        id: c.id,
        ...(c.code ? { code: c.code } : {}),
        name: c.name,
        ...(c.city ? { city: c.city } : {}),
        owes: round2(c.totalDue),
        ...(c.creditLimit > 0 ? { creditLimit: c.creditLimit } : {}),
        lastPayment: paid.get(c.id) || null,
        ...(oldest ? { oldestUnpaidBill: { no: oldest.invoice.invoiceNumber, date: oldest.invoice.issueDate, days: daysFrom(oldest.invoice.issueDate, today) } } : {}),
      };
    }),
    customersCount: data.customers.length,
    overdueCustomers: overdue.map((o) => ({ id: o.customer.id, name: o.customer.name, owes: round2(o.customer.totalDue), over60Days: o.oldAmount, overLimit: o.overLimit })),
    suppliers: suppliers.map((s) => ({ id: s.id, ...(s.code ? { code: s.code } : {}), name: s.company || s.name, ...(s.city ? { city: s.city } : {}), youOwe: round2(s.totalOwed) })),
    items: items.map((p) => {
      const sold = monthItems.get(p.id);
      return {
        id: p.id,
        ...(p.code ? { code: p.code } : {}),
        name: p.name,
        unit: p.unit || 'pcs',
        ...(p.packName && (p.packSize || 0) > 1 ? { pack: `${p.packName} of ${p.packSize}` } : {}),
        stock: round2(p.stockKg),
        price: round2(p.unitPricePerKg),
        ...(canFinance && p.costPricePerKg ? { cost: round2(p.costPricePerKg) } : {}),
        reorderLevel: Number(p.minThresholdKg) || 0,
        ...((Number(p.minThresholdKg) || 0) > 0 && p.stockKg <= p.minThresholdKg ? { low: true } : {}),
        ...(sold ? { soldThisMonth: { qty: round2(sold.qty), amount: round2(sold.sales) } } : {}),
      };
    }),
    itemsCount: data.products.length,
    lowStockCount: low.length,
    recentBills: recent.map((b) => ({ id: b.id, no: b.invoiceNumber, date: b.issueDate, customerId: b.customerId, customer: b.walkInName || custById.get(b.customerId)?.name || b.customerName, total: round2(billNetTotal(b)), due: round2(b.balanceDue) })),
    chequesDueThisWeek: due.map((c) => ({ party: c.partyName, amount: round2(c.amount), date: c.chequeDate, direction: c.direction, status: c.status })),
    screens: opts.screens || [],
  };
  if (canFinance && opts.finance) {
    const f = opts.finance;
    if (f.cash != null || f.bank != null) ctx.money = { cash: round2(f.cash || 0), bank: round2(f.bank || 0) };
    if (f.profitToday != null || f.profitMonth != null) ctx.grossProfit = { today: round2(f.profitToday || 0), thisMonth: round2(f.profitMonth || 0) };
  }
  return ctx;
};

// ---------------------------------------------------------------------------------------------------------
// Business summary
// ---------------------------------------------------------------------------------------------------------
export type SummaryPeriod = 'today' | 'week' | 'month';

/** The period and the one before it, as YYYY-MM-DD ranges. */
export const periodRange = (period: SummaryPeriod, today: string): { from: string; to: string; prevFrom: string; prevTo: string } => {
  if (period === 'today') return { from: today, to: today, prevFrom: shiftDate(today, -1), prevTo: shiftDate(today, -1) };
  if (period === 'week') return { from: shiftDate(today, -6), to: today, prevFrom: shiftDate(today, -13), prevTo: shiftDate(today, -7) };
  const from = `${today.slice(0, 7)}-01`;
  const prevTo = shiftDate(from, -1);
  const prevFrom = `${prevTo.slice(0, 7)}-01`;
  // Same number of days into last month (so a month in progress is compared fairly).
  const day = Number(today.slice(8, 10));
  const lastDay = Number(prevTo.slice(8, 10));
  const sameDay = `${prevTo.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  return { from, to: today, prevFrom, prevTo: sameDay };
};

export const buildSummaryContext = (data: AiShopData, opts: { today: string; period: SummaryPeriod; canFinance: boolean; finance?: AiFinanceFigures }): Record<string, unknown> => {
  const { today, period, canFinance } = opts;
  const r = periodRange(period, today);
  const bills = billsOnly(data.invoices);
  const src = { invoices: data.invoices, returns: data.returns || [], purchases: data.purchases || [], products: data.products, customers: data.customers };
  const now = profitFromBills(src, r.from, r.to);
  const before = profitFromBills(src, r.prevFrom, r.prevTo);
  const received = (from: string, to: string) => round2(data.ledger.filter((l) => l.entityType === 'customer' && l.type === 'payment_received' && l.date >= from && l.date <= to).reduce((a, l) => a + (Number(l.credit) || 0), 0));
  const low = data.products.filter((p) => (Number(p.minThresholdKg) || 0) > 0 && p.stockKg <= p.minThresholdKg).sort((a, b) => a.stockKg - b.stockKg).slice(0, 10);
  const overdue = overdueCustomers(data.customers, data.ledger, today).slice(0, 8);
  const due = chequesDueThisWeek(data.cheques, today);
  const ctx: Record<string, unknown> = {
    shop: data.settings.companyName || 'Our shop',
    today,
    period: { name: period, from: r.from, to: r.to },
    previousPeriod: { from: r.prevFrom, to: r.prevTo },
    sales: salesIn(bills, r.from, r.to),
    previousSales: salesIn(bills, r.prevFrom, r.prevTo),
    moneyReceivedFromCustomers: received(r.from, r.to),
    previousMoneyReceived: received(r.prevFrom, r.prevTo),
    topCustomers: [...now.byCustomer].sort((a, b) => b.sales - a.sales).slice(0, 5).map((x) => ({ name: x.name, sales: round2(x.sales), ...(canFinance ? { profit: round2(x.profit) } : {}) })),
    topItems: [...now.byItem].sort((a, b) => b.sales - a.sales).slice(0, 5).map((x) => ({ name: x.name, qty: round2(x.qty || 0), unit: x.unit, sales: round2(x.sales), ...(canFinance ? { profit: round2(x.profit) } : {}) })),
    customersOwe: round2(data.customers.reduce((a, c) => a + Math.max(0, c.totalDue), 0)),
    overdueCustomers: overdue.map((o) => ({ name: o.customer.name, owes: round2(o.customer.totalDue), over60Days: o.oldAmount, oldestDays: o.oldestDays, overLimit: o.overLimit })),
    stockToReorder: low.map((p) => ({ name: p.name, stock: round2(p.stockKg), reorderLevel: Number(p.minThresholdKg) || 0, unit: p.unit || 'pcs' })),
    chequesDueThisWeek: { count: due.length, amount: round2(due.reduce((a, c) => a + c.amount, 0)) },
  };
  if (canFinance) {
    ctx.grossProfit = { period: round2(now.totals.profit), previous: round2(before.totals.profit) };
    if (opts.finance && (opts.finance.cash != null || opts.finance.bank != null)) ctx.money = { cash: round2(opts.finance.cash || 0), bank: round2(opts.finance.bank || 0) };
  }
  return ctx;
};

// ---------------------------------------------------------------------------------------------------------
// Bill from a photo / message: the catalog to match against
// ---------------------------------------------------------------------------------------------------------
export interface CatalogCustomer {
  id: string;
  code?: string;
  name: string;
  city?: string;
}
export interface CatalogProduct {
  id: string;
  code?: string;
  name: string;
  unit: string;
  packName?: string;
  packSize?: number;
  price: number;
}
export interface BillCatalog {
  customers: CatalogCustomer[];
  products: CatalogProduct[];
}

/** Customers and items to match an order against: the most recently billed first, at most `max` of each. */
export const buildBillCatalog = (customers: Customer[], products: Product[], invoices: Invoice[], max = 300): BillCatalog => {
  const lastCust = new Map<string, string>();
  const lastProd = new Map<string, string>();
  billsOnly(invoices).forEach((b) => {
    const d = b.issueDate || '';
    if ((lastCust.get(b.customerId) || '') < d) lastCust.set(b.customerId, d);
    b.items.forEach((it) => {
      if (it.productId && (lastProd.get(it.productId) || '') < d) lastProd.set(it.productId, d);
    });
  });
  const byRecency = <T extends { id: string; name: string }>(list: T[], last: Map<string, string>) =>
    [...list].sort((a, b) => (last.get(b.id) || '').localeCompare(last.get(a.id) || '') || a.name.localeCompare(b.name)).slice(0, max);
  return {
    customers: byRecency(customers, lastCust).map((c) => ({ id: c.id, ...(c.code ? { code: c.code } : {}), name: c.name, ...(c.city ? { city: c.city } : {}) })),
    products: byRecency(products, lastProd).map((p) => ({
      id: p.id,
      ...(p.code ? { code: p.code } : {}),
      name: p.name,
      unit: p.unit || 'pcs',
      ...(p.packName && (p.packSize || 0) > 1 ? { packName: p.packName, packSize: p.packSize } : {}),
      price: round2(p.unitPricePerKg),
    })),
  };
};

// ---------------------------------------------------------------------------------------------------------
// Payment reminder
// ---------------------------------------------------------------------------------------------------------
export type ReminderLanguage = 'urdu' | 'roman' | 'english';

/** Urdu-script name → Urdu; otherwise Roman Urdu (how most customers type on WhatsApp). */
export const guessLanguage = (name: string | undefined | null): ReminderLanguage => (/[؀-ۿ]/.test(name || '') ? 'urdu' : 'roman');

export const reminderFacts = (opts: { customer: Customer; invoices: Invoice[]; ledger: LedgerEntry[]; shopName?: string; shopPhone?: string; today: string }): Record<string, unknown> => {
  const { customer: c, today } = opts;
  const open = openBills(c, opts.invoices);
  const oldest = open[open.length - 1];
  const last = lastPayments(opts.ledger).get(c.id);
  return {
    shop: (opts.shopName || '').trim() || 'our shop',
    ...(opts.shopPhone ? { shopPhone: opts.shopPhone } : {}),
    customer: c.name,
    amountDue: round2(c.totalDue),
    unpaidBills: open.length,
    ...(oldest ? { oldestUnpaidBill: { no: oldest.invoice.invoiceNumber, date: oldest.invoice.issueDate, daysAgo: daysFrom(oldest.invoice.issueDate, today) } } : {}),
    ...(last ? { lastPayment: last } : {}),
    today,
  };
};
