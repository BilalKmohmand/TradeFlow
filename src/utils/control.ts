/**
 * Controls (pure helpers): document number series, approval rule checks, branch scoping and the
 * owner's dashboard figures. State and actions live in context/controlActions.ts.
 */
import {
  AppSettings,
  ApprovalRuleKey,
  ApprovalRules,
  Branch,
  CashEntry,
  Cheque,
  Customer,
  DocSeriesConfig,
  DocSeriesKey,
  Expense,
  Invoice,
  LedgerEntry,
  Product,
  Purchase,
  StockReturn,
  Supplier,
} from '../types';
import { lineDiscountAmount, billNetTotal } from './salesDocs';
import { costPerKgOn, collectCashMovements, accountBalancesOn, positionSummary } from './finance';
import { billsOnly, buildDailySheet } from './billing';
import { profitFromBills, overdueCustomers } from './stockReports';
import { chequeTotals } from './cheques';
import { shiftDate } from './stockFlow';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Document number series
// ---------------------------------------------------------------------------
export const DOC_SERIES: { key: DocSeriesKey; label: string; example: string }[] = [
  { key: 'bill', label: 'Bills (invoices)', example: 'INV-' },
  { key: 'credit_note', label: 'Customer returns (credit notes)', example: 'CN-' },
  { key: 'debit_note', label: 'Goods sent back (debit notes)', example: 'DN-' },
  { key: 'quotation', label: 'Quotations', example: 'QT-' },
  { key: 'receipt', label: 'Payment receipts', example: 'PAY-' },
  { key: 'supplier_payment', label: 'Supplier payments', example: 'SUP-PAY-' },
  { key: 'po', label: 'Purchase orders', example: 'PO-' },
  { key: 'cpv', label: 'Cash payment vouchers (CPV)', example: 'CPV-' },
  { key: 'crv', label: 'Cash receipt vouchers (CRV)', example: 'CRV-' },
  { key: 'bpv', label: 'Bank payment vouchers (BPV)', example: 'BPV-' },
  { key: 'brv', label: 'Bank receipt vouchers (BRV)', example: 'BRV-' },
  { key: 'jv', label: 'Journal vouchers (JV)', example: 'JV-' },
];

/** Defaults keep the numbers the app always used (INV-1, CN-1, DN-1, QT-1, PO-1…). */
export const DEFAULT_SERIES: Record<DocSeriesKey, DocSeriesConfig> = {
  bill: { prefix: 'INV-', yearly: false, pad: 0 },
  credit_note: { prefix: 'CN-', yearly: false, pad: 0 },
  debit_note: { prefix: 'DN-', yearly: false, pad: 0 },
  quotation: { prefix: 'QT-', yearly: false, pad: 0 },
  receipt: { prefix: 'PAY-', yearly: false, pad: 0 },
  supplier_payment: { prefix: 'SUP-PAY-', yearly: false, pad: 0 },
  po: { prefix: 'PO-', yearly: false, pad: 0 },
  cpv: { prefix: 'CPV-', yearly: false, pad: 0 },
  crv: { prefix: 'CRV-', yearly: false, pad: 0 },
  bpv: { prefix: 'BPV-', yearly: false, pad: 0 },
  brv: { prefix: 'BRV-', yearly: false, pad: 0 },
  jv: { prefix: 'JV-', yearly: false, pad: 0 },
};

export const seriesConfig = (settings: Pick<AppSettings, 'numberSeries'>, key: DocSeriesKey): DocSeriesConfig => ({
  ...DEFAULT_SERIES[key],
  ...(settings.numberSeries?.[key] || {}),
});

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const formatDocNumber = (cfg: DocSeriesConfig, n: number, year: string): string => {
  const pad = cfg.yearly ? Math.max(1, cfg.pad ?? 4) : Math.max(0, cfg.pad ?? 0);
  const num = pad > 0 ? String(n).padStart(pad, '0') : String(n);
  return cfg.yearly ? `${cfg.prefix}${year}-${num}` : `${cfg.prefix}${num}`;
};

export const counterKey = (key: DocSeriesKey, cfg: DocSeriesConfig, year: string) => (cfg.yearly ? `${key}:${year}` : key);

/** Highest number already used in this series (so a new series continues after old documents). */
export const highestExisting = (existing: string[], cfg: DocSeriesConfig, year: string): number => {
  const re = cfg.yearly ? new RegExp(`^${escapeRe(cfg.prefix)}${year}-(\\d+)$`) : new RegExp(`^${escapeRe(cfg.prefix)}(\\d+)$`);
  return existing.reduce((m, x) => {
    const hit = re.exec((x || '').trim());
    const n = hit ? parseInt(hit[1], 10) : 0;
    return Number.isFinite(n) && n > m && n < 100_000_000 ? n : m;
  }, 0);
};

/**
 * Next number of a series. The stored counter never goes down, so a number is never reused after a
 * delete; the existing numbers are checked as well so a clash (e.g. an imported bill) is skipped.
 */
export const planDocNumber = (
  settings: Pick<AppSettings, 'numberSeries' | 'docCounters'>,
  key: DocSeriesKey,
  date: string,
  existing: string[]
): { number: string; counter: string; n: number } => {
  const cfg = seriesConfig(settings, key);
  const year = (date || new Date().toISOString()).slice(0, 4);
  const counter = counterKey(key, cfg, year);
  const stored = settings.docCounters?.[counter];
  const last = Math.max(stored ?? highestExisting(existing, cfg, year), (cfg.startAt ?? 0) > 0 ? (cfg.startAt as number) - 1 : 0);
  const used = new Set(existing.map((x) => (x || '').trim()));
  let n = last + 1;
  while (used.has(formatDocNumber(cfg, n, year))) n++;
  return { number: formatDocNumber(cfg, n, year), counter, n };
};

// ---------------------------------------------------------------------------
// Approval rules
// ---------------------------------------------------------------------------
export const RULE_LABEL: Record<ApprovalRuleKey, string> = {
  discount: 'Big discount',
  credit_limit: 'Over credit limit',
  supplier_payment: 'Big supplier payment',
  stock_loss: 'Big stock loss',
  delete_bill: 'Delete a bill',
};

export const anyRuleOn = (r?: ApprovalRules | null) =>
  Boolean(r && ((r.discountPctAbove ?? 0) > 0 || r.creditLimit || (r.supplierPaymentAbove ?? 0) > 0 || (r.stockLossAbove ?? 0) > 0 || r.deleteBills));

/** Discount on a bill as % of the items before any discount (line discounts + the bill discount). */
export const billDiscountPct = (
  items: { qty: number; unitPrice: number; discountType?: 'rs' | 'pct'; discountValue?: number }[],
  billDiscount = 0
): { gross: number; discount: number; pct: number } => {
  const lines = items.filter((it) => it.qty > 0);
  const gross = round2(lines.reduce((a, it) => a + round2(it.qty * it.unitPrice), 0));
  const lineDisc = round2(lines.reduce((a, it) => a + lineDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountValue), 0));
  const afterLines = round2(gross - lineDisc);
  const discount = round2(lineDisc + Math.min(Math.max(0, billDiscount || 0), afterLines));
  return { gross, discount, pct: gross > 0 ? round2((discount / gross) * 100) : 0 };
};

export const fmtPct = (n: number) => `${Number.isInteger(round2(n)) ? round2(n) : round2(n).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
export const mainBranchId = (branches: Branch[]): string | null => (branches.length ? [...branches].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0].id : null);

/** Branch features only show once the shop has two or more branches. */
export const branchesOn = (branches: Branch[]) => branches.length >= 2;

export interface BranchSources {
  invoices: Invoice[];
  ledger: LedgerEntry[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  returns: StockReturn[];
}

/** Rows of one branch. Rows with no branch belong to the main branch. Ledger rows follow their bill / return. */
export const scopeToBranch = <T extends BranchSources>(src: T, branchId: string | null | undefined, main: string | null): T => {
  if (!branchId || branchId === 'all') return src;
  const of = (b?: string | null) => b || main;
  const invBranch = new Map(src.invoices.map((i) => [i.id, of(i.branchId)]));
  const retBranch = new Map(src.returns.map((r) => [r.id, r.invoiceId ? invBranch.get(r.invoiceId) || main : main]));
  const ledgerBranch = (l: LedgerEntry) => l.branchId || (l.sourceId ? invBranch.get(l.sourceId) || retBranch.get(l.sourceId) : undefined) || main;
  return {
    ...src,
    invoices: src.invoices.filter((i) => of(i.branchId) === branchId),
    ledger: src.ledger.filter((l) => ledgerBranch(l) === branchId),
    expenses: src.expenses.filter((e) => of(e.branchId) === branchId),
    cashEntries: src.cashEntries.filter((c) => of(c.branchId) === branchId),
    returns: src.returns.filter((r) => retBranch.get(r.id) === branchId),
  };
};

/**
 * Customer and supplier balances as one branch sees them (the whole-shop figures when 'all').
 *
 * A balance is the branch's own ledger rows: bills made there (rows follow their bill), payments
 * received / made there (stamped with the branch), returns on its bills. Rows with no branch, and
 * the opening / unexplained part of a balance (what the ledger does not explain), count as the main
 * branch. So the branch figures always add up to the whole-shop balance, and the per-branch trial
 * balance stays balanced (the journal's "opening / unexplained" plug uses these same figures).
 * A customer who buys in one branch and pays in another owes one branch and is in advance at the
 * other; together they come to what the customer really owes.
 */
export const partyBalancesForBranch = <T extends BranchSources & { customers: Customer[]; suppliers: Supplier[] }>(
  src: T,
  branchId: string | null | undefined,
  main: string | null
): { customers: Customer[]; suppliers: Supplier[] } => {
  if (!branchId || branchId === 'all') return { customers: src.customers, suppliers: src.suppliers };
  const scoped = scopeToBranch(src, branchId, main);
  const net = (rows: LedgerEntry[]) => {
    const m = new Map<string, number>();
    rows.forEach((l) => {
      const k = `${l.entityType}|${l.entityId}`;
      m.set(k, (m.get(k) || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0));
    });
    return m;
  };
  const whole = net(src.ledger);
  const here = net(scoped.ledger);
  const isMain = branchId === main;
  const balance = (type: 'customer' | 'supplier', id: string, recorded: number) => {
    const k = `${type}|${id}`;
    const unexplained = round2((Number(recorded) || 0) - (whole.get(k) || 0));
    return round2((here.get(k) || 0) + (isMain ? unexplained : 0));
  };
  return {
    customers: src.customers.map((c) => ({ ...c, totalDue: balance('customer', c.id, c.totalDue) })),
    suppliers: src.suppliers.map((x) => ({ ...x, totalOwed: balance('supplier', x.id, x.totalOwed) })),
  };
};

/** Opening cash / bank balances belong to the main branch. */
export const settingsForBranch = (settings: AppSettings, branchId: string | null | undefined, main: string | null): AppSettings =>
  !branchId || branchId === 'all' || branchId === main ? settings : { ...settings, cashOpeningBalance: 0, openingBankBalance: 0, bankOpenings: {} };

// ---------------------------------------------------------------------------
// Owner dashboard
// ---------------------------------------------------------------------------
export interface OwnerSources {
  invoices: Invoice[];
  ledger: LedgerEntry[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  purchases: Purchase[];
  returns: StockReturn[];
  cheques: Cheque[];
  settings: AppSettings;
}

export const stockValue = (products: Product[], purchases: Purchase[], today: string): number =>
  round2(
    products.reduce((a, p) => {
      const qty = Math.max(0, Number(p.stockKg) || 0);
      if (!qty) return a;
      const cost = costPerKgOn(purchases, p.id, today) ?? (p.costPricePerKg && p.costPricePerKg > 0 ? p.costPricePerKg : 0);
      return a + qty * cost;
    }, 0)
  );

export interface OwnerSnapshot {
  today: string;
  salesToday: number;
  billsToday: number;
  salesMonth: number;
  billsMonth: number;
  profitToday: number;
  profitMonth: number;
  cash: number;
  bank: number;
  receivables: number;
  overdue60: number;
  overdueCount: number;
  payables: number;
  stockValue: number;
  chequesDue: { count: number; amount: number; received: number; issued: number };
  topCustomers: { key: string; name: string; sales: number; profit: number }[];
  topItems: { key: string; name: string; sales: number; qty?: number; unit?: string; profit: number }[];
  trend: { date: string; label: string; sales: number }[];
}

export const ownerSnapshot = (src: OwnerSources, today: string): OwnerSnapshot => {
  const monthStart = `${today.slice(0, 7)}-01`;
  const bills = billsOnly(src.invoices);
  const inRange = (from: string, to: string) => bills.filter((b) => b.issueDate >= from && b.issueDate <= to);
  const sum = (rows: Invoice[]) => round2(rows.reduce((a, b) => a + billNetTotal(b), 0));
  const profitSrc = { invoices: src.invoices, returns: src.returns, purchases: src.purchases, products: src.products, customers: src.customers };
  const pToday = profitFromBills(profitSrc, today, today);
  const pMonth = profitFromBills(profitSrc, monthStart, today);
  const movements = collectCashMovements(src.ledger, src.expenses, src.cashEntries, src.customers, src.suppliers);
  const balances = accountBalancesOn(movements, src.settings, today);
  const position = positionSummary(src.customers, src.suppliers, src.expenses, balances);
  const overdue = overdueCustomers(src.customers, src.ledger, today).filter((o) => o.oldAmount > 0);
  const trend: OwnerSnapshot['trend'] = [];
  for (let i = 29; i >= 0; i--) {
    const d = shiftDate(today, -i);
    trend.push({ date: d, label: `${d.slice(8, 10)}/${d.slice(5, 7)}`, sales: sum(inRange(d, d)) });
  }
  return {
    today,
    salesToday: sum(inRange(today, today)),
    billsToday: inRange(today, today).length,
    salesMonth: sum(inRange(monthStart, today)),
    billsMonth: inRange(monthStart, today).length,
    profitToday: pToday.totals.profit,
    profitMonth: pMonth.totals.profit,
    cash: balances.cash,
    bank: balances.bank,
    receivables: position.receivables,
    overdue60: round2(overdue.reduce((a, o) => a + o.oldAmount, 0)),
    overdueCount: overdue.length,
    payables: position.payables,
    stockValue: stockValue(src.products, src.purchases, today),
    chequesDue: chequeTotals(src.cheques, today).dueThisWeek,
    topCustomers: [...pMonth.byCustomer].sort((a, b) => b.sales - a.sales).slice(0, 5).map((r) => ({ key: r.key, name: r.name, sales: r.sales, profit: r.profit })),
    topItems: [...pMonth.byItem].sort((a, b) => b.sales - a.sales).slice(0, 5).map((r) => ({ key: r.key, name: r.name, sales: r.sales, qty: r.qty, unit: r.unit, profit: r.profit })),
    trend,
  };
};

/** Everything on the printed one-page "Daily business report" for a date. */
export const dailyBusinessReport = (src: OwnerSources, date: string) => {
  const sheet = buildDailySheet({ invoices: src.invoices, ledger: src.ledger, expenses: src.expenses, cashEntries: src.cashEntries, customers: src.customers, suppliers: src.suppliers, settings: src.settings, cheques: src.cheques }, date);
  const profit = profitFromBills({ invoices: src.invoices, returns: src.returns, purchases: src.purchases, products: src.products, customers: src.customers }, date, date);
  const snap = ownerSnapshot(src, date);
  const cashSales = round2(sheet.bills.filter((b) => b.balanceDue === 0).reduce((a, b) => a + b.totalAmount, 0));
  return {
    date,
    sheet,
    profit,
    snap,
    cashSales,
    creditSales: round2(sheet.summary.sales - cashSales),
    returnsToday: src.returns.filter((r) => r.kind === 'sales' && r.date === date),
  };
};
