/**
 * The classic "Apna Accountant" reports (pure). Every report is one function
 * `(data, filter) → ReportResult`: a title, the period, and one or more plain tables. The Reports
 * hub shows the result on screen, prints it in the classic style (shop name centred, title
 * underlined, one table) and turns it into CSV, all from the same result, so the three always agree.
 *
 * Money figures come from the same places as the rest of the app, so nothing disagrees:
 *  - accounts reports read the double-entry journal (utils/accounting.ts);
 *  - sales / purchase / profit reports read bills, stock receipts and returns (profit uses
 *    `profitFromBills`, whose cost equals Cost of goods sold in the journal);
 *  - stock reports read the item history (utils/stockReports.ts `itemHistory`).
 */
import {
  AppSettings,
  CashEntry,
  Customer,
  Expense,
  Godown,
  Invoice,
  LedgerEntry,
  Product,
  Purchase,
  PurchaseInvoice,
  StockAdjustment,
  StockBatch,
  StockReturn,
  StockTransfer,
  Supplier,
} from '../types';
import { Account, JournalEntry, accountTotals, balanceSheet, generalLedger, profitAndLoss, trialBalance } from './accounting';
import { billsOnly } from './billing';
import { costPerKgOn } from './finance';
import { fyStartOf, financialYearOf } from './financeBooks';
import { formatDate } from './formatters';
import { stockByGodown } from './inventory';
import { formatPackQty, hasPack } from './packUnits';
import { itemHistory, profitFromBills } from './stockReports';
import type { CsvTable } from './csvReports';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 0.005;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
export type Cell = string | number | null;

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Shown as money (Rs., two decimals at most). */
  money?: boolean;
}

export interface ReportRow {
  cells: Record<string, Cell>;
  /** heading = a group title across the table; subtotal / total = bold figures. */
  style?: 'heading' | 'subtotal' | 'total' | 'muted';
  /** Bill it came from (the screen opens it on a tap). */
  billId?: string;
}

export interface ReportSection {
  title?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Footer row (same keys as the columns). */
  totals?: Record<string, Cell>;
  /** Text when there are no rows. */
  empty?: string;
}

export interface ReportResult {
  title: string;
  /** "From 1 Jul 2026 to 22 Sep 2026" / "As at 22 Sep 2026". */
  period: string;
  sections: ReportSection[];
  /** Key figures shown above the tables (and printed under the title). */
  summary?: { label: string; value: Cell; money?: boolean }[];
  notes?: string[];
}

export interface ReportData {
  settings: AppSettings;
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  invoices: Invoice[];
  purchases: Purchase[];
  returns: StockReturn[];
  adjustments: StockAdjustment[];
  stockTransfers: StockTransfer[];
  stockBatches: StockBatch[];
  godowns: Godown[];
  ledger: LedgerEntry[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  purchaseInvoices: PurchaseInvoice[];
  /** Double-entry journal (auto + manual) and the chart of accounts; empty when books are not needed. */
  journal: JournalEntry[];
  accounts: Account[];
}

export interface ReportFilter {
  from: string;
  to: string;
  asOf: string;
  customerId?: string;
  supplierId?: string;
  productId?: string;
  godownId?: string;
  /** Pending delivery list: which bills. */
  status?: 'pending' | 'delivered' | 'all';
  /** Bank book: which bank account (default 1010). */
  accountCode?: string;
  /** Today (for "days waiting" and stock by godown). */
  today?: string;
}

export type ReportId =
  | 'cash-book'
  | 'bank-book'
  | 'day-book'
  | 'journal-book'
  | 'trial-balance'
  | 'trial-balance-period'
  | 'book-balances'
  | 'receivable-payable'
  | 'receivables'
  | 'payables'
  | 'profit-loss'
  | 'profit-loss-period'
  | 'balance-sheet'
  | 'balance-sheet-period'
  | 'daily-gross-profit'
  | 'daily-sale'
  | 'daily-purchase'
  | 'stock-in-hand'
  | 'party-sales'
  | 'party-purchases'
  | 'party-outstanding'
  | 'product-sales'
  | 'product-purchases'
  | 'rate-list'
  | 'stock-ledger'
  | 'godown-stock'
  | 'stock-value'
  | 'low-stock'
  | 'pending-delivery';

/** What a report asks for: a date range, one date ("as at"), one day, or nothing. */
export type DateMode = 'range' | 'asOf' | 'day' | 'none';
export type FilterKind = 'customer' | 'supplier' | 'product' | 'godown' | 'status' | 'bank';

export interface ReportDef {
  id: ReportId;
  title: string;
  dateMode: DateMode;
  filters?: FilterKind[];
  /** A filter the report cannot run without (e.g. the item of a stock ledger). */
  requires?: FilterKind;
  /** Needs the books (double-entry journal) and finance access. */
  books?: boolean;
  /** Shows cost / profit: needs finance access. */
  finance?: boolean;
  /** Default range: this month (default) or this financial year. */
  defaultRange?: 'month' | 'fy';
  help: string;
  build: (d: ReportData, f: ReportFilter) => ReportResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const rangeText = (f: ReportFilter) => `From ${formatDate(f.from)} to ${formatDate(f.to)}`;
const asOfText = (d: string) => `As at ${formatDate(d)}`;
const inRange = (date: string, f: ReportFilter) => date >= f.from && date <= f.to;
const dayBefore = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
/** Every day from `from` to `to` (at most ~3 years). */
export const daysBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 1200) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};
const accName = (d: ReportData, code: string) => d.accounts.find((a) => a.code === code)?.name || `Account ${code}`;
const custName = (d: ReportData, id?: string | null) => d.customers.find((c) => c.id === id)?.name || 'Customer';
const supName = (d: ReportData, id?: string | null) => {
  const s = d.suppliers.find((x) => x.id === id);
  return s ? s.company || s.name : 'Supplier';
};
const prod = (d: ReportData, id: string) => d.products.find((p) => p.id === id);
const qtyText = (qty: number, p?: Product) => (p && hasPack(p) ? formatPackQty(qty, p, 'short') : `${round2(qty).toLocaleString('en-PK', { maximumFractionDigits: 2 })} ${p?.unit || 'pcs'}`);
/** Cost of one unit on a date: what it was bought for up to then, else the item's cost price. */
const unitCostOn = (d: ReportData, p: Product, date: string) => costPerKgOn(d.purchases, p.id, date) ?? (p.costPricePerKg && p.costPricePerKg > 0 ? p.costPricePerKg : 0);
const sumCol = (rows: ReportRow[], key: string) => round2(rows.reduce((a, r) => a + (typeof r.cells[key] === 'number' ? (r.cells[key] as number) : 0), 0));
const signedDrCr = (net: number) => ({ dr: net > EPS ? round2(net) : null, cr: net < -EPS ? round2(-net) : null });

/** Plain-English name of what produced a journal entry (for the day book / journal book). */
export const DOC_LABEL: Record<string, string> = {
  bill: 'Sale invoice',
  customer_payment: 'Cash received',
  payment_received: 'Cash received',
  supplier_payment: 'Payment to supplier',
  payment_made: 'Payment to supplier',
  purchase: 'Purchase',
  purchase_received: 'Purchase',
  expense: 'Expense',
  transfer: 'Cash ↔ Bank',
  cash: 'Cash entry',
  sales_return: 'Sale return',
  purchase_return: 'Purchase return',
  supplier_bill: 'Supplier bill',
  supplier_claim: 'Supplier claim',
  stock_adjustment: 'Stock adjustment',
  cheque_received: 'Cheque received',
  cheque_issued: 'Cheque issued',
  cheque_cleared: 'Cheque cleared',
  cheque_bounced: 'Cheque returned',
  cheque_cancelled: 'Cheque cancelled',
  customer_refund: 'Refund',
  interest_charge: 'Interest',
  opening: 'Opening',
  opening_stock: 'Opening stock',
  customer_opening: 'Opening',
  supplier_opening: 'Opening',
};
const docLabel = (e: JournalEntry) => (e.source === 'manual' ? 'Journal voucher' : DOC_LABEL[e.sourceType || ''] || (e.sourceType || 'Entry').replace(/_/g, ' '));

/** Balance of a customer / supplier on a date: today's balance less everything posted after that date. */
export const partyBalanceOn = (current: number, ledger: LedgerEntry[], type: 'customer' | 'supplier', id: string, asOf: string) =>
  round2((Number(current) || 0) - ledger.filter((l) => l.entityType === type && l.entityId === id && l.date > asOf).reduce((a, l) => a + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0));

/** Stock of an item at the end of a day, from its full history (today's stock with later moves undone). */
export const stockOn = (d: ReportData, productId: string, asOf: string): number => {
  const h = itemHistory(productId, { products: d.products, customers: d.customers, suppliers: d.suppliers, invoices: d.invoices, purchases: d.purchases, returns: d.returns, adjustments: d.adjustments, stockTransfers: d.stockTransfers, godowns: d.godowns });
  const later = h.rows.filter((r) => r.kind !== 'opening' && r.date > asOf).reduce((a, r) => a + r.change, 0);
  return round2(h.closing - later);
};

// ---------------------------------------------------------------------------
// Accounts reports
// ---------------------------------------------------------------------------
const moneyBook = (bank: boolean) => (d: ReportData, f: ReportFilter): ReportResult => {
  const code = bank ? f.accountCode || '1010' : '1000';
  const gl = generalLedger(d.journal, code, f.from, f.to);
  const rows: ReportRow[] = [{ cells: { date: '', ref: '', particulars: 'Opening balance', receipts: null, payments: null, balance: gl.opening }, style: 'muted' }];
  gl.lines.forEach((l) => rows.push({ cells: { date: l.date, ref: l.ref, particulars: l.memo, receipts: l.debit || null, payments: l.credit || null, balance: l.balance }, billId: l.billId }));
  const what = bank ? 'balance' : 'cash';
  return {
    title: bank ? 'Bank Book' : 'Cash Book',
    period: bank ? `${code} ${accName(d, code)} • ${rangeText(f)}` : rangeText(f),
    summary: [
      { label: `Opening ${what}`, value: gl.opening, money: true },
      { label: bank ? 'Deposits' : 'Receipts', value: gl.totalDebit, money: true },
      { label: bank ? 'Withdrawals' : 'Payments', value: gl.totalCredit, money: true },
      { label: `Closing ${what}`, value: gl.closing, money: true },
    ],
    sections: [
      {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'ref', label: 'Doc #' },
          { key: 'particulars', label: 'Particulars' },
          { key: 'receipts', label: 'Receipts', align: 'right', money: true },
          { key: 'payments', label: 'Payments', align: 'right', money: true },
          { key: 'balance', label: 'Balance', align: 'right', money: true },
        ],
        rows,
        totals: { date: '', ref: '', particulars: 'Total / closing', receipts: gl.totalDebit, payments: gl.totalCredit, balance: gl.closing },
        empty: bank ? 'Nothing went through this bank in these dates.' : 'No cash moved in these dates.',
      },
    ],
  };
};

/** Journal entries of a period listed voucher by voucher: heading row, then account lines. */
const journalListing = (d: ReportData, title: string, from: string, to: string, period: string, empty: string): ReportResult => {
  const entries = d.journal.filter((e) => e.date >= from && e.date <= to && !e.closing);
  const rows: ReportRow[] = [];
  let dr = 0;
  let cr = 0;
  entries.forEach((e) => {
    rows.push({ cells: { date: e.date, doc: docLabel(e), ref: e.ref, account: e.memo, debit: null, credit: null }, style: 'heading', billId: e.billId });
    e.lines.forEach((l) => {
      dr += Number(l.debit) || 0;
      cr += Number(l.credit) || 0;
      rows.push({ cells: { date: '', doc: '', ref: l.accountCode, account: accName(d, l.accountCode), debit: l.debit || null, credit: l.credit || null } });
    });
  });
  return {
    title,
    period,
    summary: [
      { label: 'Vouchers', value: entries.length },
      { label: 'Debit', value: round2(dr), money: true },
      { label: 'Credit', value: round2(cr), money: true },
    ],
    sections: [
      {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'doc', label: 'Voucher' },
          { key: 'ref', label: 'Doc # / A/c' },
          { key: 'account', label: 'Account / narration' },
          { key: 'debit', label: 'Debit', align: 'right', money: true },
          { key: 'credit', label: 'Credit', align: 'right', money: true },
        ],
        rows,
        totals: { date: '', doc: '', ref: '', account: 'Total', debit: round2(dr), credit: round2(cr) },
        empty,
      },
    ],
  };
};

const tbAsAt = (d: ReportData, f: ReportFilter): ReportResult => {
  const tb = trialBalance(d.journal, d.accounts, f.asOf);
  return {
    title: 'Trial Balance',
    period: asOfText(f.asOf),
    summary: [{ label: tb.balanced ? 'Balanced' : 'Difference', value: tb.balanced ? 'Debit = Credit' : tb.difference, money: !tb.balanced }],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'account', label: 'Account' },
          { key: 'debit', label: 'Debit', align: 'right', money: true },
          { key: 'credit', label: 'Credit', align: 'right', money: true },
        ],
        rows: tb.rows.map((r) => ({ cells: { code: r.account.code, account: r.account.name, debit: r.debit || null, credit: r.credit || null } })),
        totals: { code: '', account: 'Total', debit: tb.totalDebit, credit: tb.totalCredit },
        empty: 'No entries yet.',
      },
    ],
  };
};

/** Trial balance between dates: opening, the period's debits and credits, closing, per account. */
export const trialBalanceBetween = (journal: JournalEntry[], accounts: Account[], from: string, to: string) => {
  const opening = accountTotals(journal, { to: dayBefore(from) });
  const period = accountTotals(journal, { from, to });
  const codes = Array.from(new Set([...opening.keys(), ...period.keys()])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const rows = codes
    .map((code) => {
      const o = opening.get(code)?.net || 0;
      const p = period.get(code) || { debit: 0, credit: 0, net: 0 };
      const c = round2(o + p.net);
      return { code, name: accounts.find((a) => a.code === code)?.name || `Account ${code}`, openDr: signedDrCr(o).dr, openCr: signedDrCr(o).cr, dr: round2(p.debit), cr: round2(p.credit), closeDr: signedDrCr(c).dr, closeCr: signedDrCr(c).cr };
    })
    .filter((r) => r.openDr || r.openCr || r.dr || r.cr || r.closeDr || r.closeCr);
  const t = (k: keyof (typeof rows)[number]) => round2(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0));
  const totals = { openDr: t('openDr'), openCr: t('openCr'), dr: t('dr'), cr: t('cr'), closeDr: t('closeDr'), closeCr: t('closeCr') };
  return { rows, totals, balanced: Math.abs(totals.closeDr - totals.closeCr) < EPS && Math.abs(totals.dr - totals.cr) < EPS && Math.abs(totals.openDr - totals.openCr) < EPS };
};

const tbBetween = (d: ReportData, f: ReportFilter): ReportResult => {
  const r = trialBalanceBetween(d.journal, d.accounts, f.from, f.to);
  return {
    title: 'Trial Balance Between Dates',
    period: rangeText(f),
    summary: [{ label: r.balanced ? 'Balanced' : 'Not balanced', value: r.balanced ? 'Debit = Credit' : round2(r.totals.closeDr - r.totals.closeCr), money: !r.balanced }],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'account', label: 'Account' },
          { key: 'openDr', label: 'Opening Dr', align: 'right', money: true },
          { key: 'openCr', label: 'Opening Cr', align: 'right', money: true },
          { key: 'dr', label: 'Debit', align: 'right', money: true },
          { key: 'cr', label: 'Credit', align: 'right', money: true },
          { key: 'closeDr', label: 'Closing Dr', align: 'right', money: true },
          { key: 'closeCr', label: 'Closing Cr', align: 'right', money: true },
        ],
        rows: r.rows.map((x) => ({ cells: { code: x.code, account: x.name, openDr: x.openDr, openCr: x.openCr, dr: x.dr || null, cr: x.cr || null, closeDr: x.closeDr, closeCr: x.closeCr } })),
        totals: { code: '', account: 'Total', ...r.totals },
        empty: 'No entries in these dates.',
      },
    ],
  };
};

/** Cash and every bank account (asset accounts 1000–1099) on a date. */
export const bookBalances = (journal: JournalEntry[], accounts: Account[], asOf: string) => {
  const totals = accountTotals(journal, { to: asOf });
  const codes = new Set<string>([...accounts.filter((a) => a.type === 'asset' && /^10\d\d$/.test(a.code)).map((a) => a.code), ...Array.from(totals.keys()).filter((c) => /^10\d\d$/.test(c))]);
  return Array.from(codes)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((code) => ({ code, name: accounts.find((a) => a.code === code)?.name || `Account ${code}`, balance: round2(totals.get(code)?.net || 0) }));
};

const bookBalancesReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const rows = bookBalances(d.journal, d.accounts, f.asOf);
  const total = round2(rows.reduce((a, r) => a + r.balance, 0));
  return {
    title: 'Book Balances',
    period: asOfText(f.asOf),
    summary: [{ label: 'Cash + bank', value: total, money: true }],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'account', label: 'Cash / bank book' },
          { key: 'balance', label: 'Balance', align: 'right', money: true },
        ],
        rows: rows.map((r) => ({ cells: { code: r.code, account: r.name, balance: r.balance } })),
        totals: { code: '', account: 'Total', balance: total },
      },
    ],
  };
};

/** Customers and suppliers with a balance on a date (advances are shown on the other side). */
export const receivablePayable = (d: Pick<ReportData, 'customers' | 'suppliers' | 'ledger'>, asOf: string) => {
  const cust = d.customers.map((c) => ({ id: c.id, code: c.code || '', name: c.name, phone: c.phone || '', kind: 'customer' as const, balance: partyBalanceOn(c.totalDue, d.ledger, 'customer', c.id, asOf) }));
  const sups = d.suppliers.map((s) => ({ id: s.id, code: s.code || '', name: s.company || s.name, phone: s.phone || '', kind: 'supplier' as const, balance: partyBalanceOn(s.totalOwed, d.ledger, 'supplier', s.id, asOf) }));
  const byAmount = (a: { amount: number; name: string }, b: { amount: number; name: string }) => b.amount - a.amount || a.name.localeCompare(b.name);
  const receivable = [
    ...cust.filter((c) => c.balance > EPS).map((c) => ({ ...c, amount: c.balance, note: '' })),
    ...sups.filter((s) => s.balance < -EPS).map((s) => ({ ...s, amount: -s.balance, note: 'supplier advance' })),
  ].sort(byAmount);
  const payable = [
    ...sups.filter((s) => s.balance > EPS).map((s) => ({ ...s, amount: s.balance, note: '' })),
    ...cust.filter((c) => c.balance < -EPS).map((c) => ({ ...c, amount: -c.balance, note: 'customer advance' })),
  ].sort(byAmount);
  return { receivable, payable, totalReceivable: round2(receivable.reduce((a, r) => a + r.amount, 0)), totalPayable: round2(payable.reduce((a, r) => a + r.amount, 0)) };
};

const partyCols: ReportColumn[] = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Account title' },
  { key: 'phone', label: 'Phone' },
  { key: 'amount', label: 'Balance', align: 'right', money: true },
];
const rpReport = (which: 'both' | 'receivable' | 'payable') => (d: ReportData, f: ReportFilter): ReportResult => {
  const r = receivablePayable(d, f.asOf);
  const section = (title: string, rows: typeof r.receivable, total: number): ReportSection => ({
    title,
    columns: partyCols,
    rows: rows.map((x) => ({ cells: { code: x.code, name: x.note ? `${x.name} (${x.note})` : x.name, phone: x.phone, amount: x.amount } })),
    totals: { code: '', name: 'Total', phone: '', amount: total },
    empty: 'Nothing outstanding.',
  });
  const sections: ReportSection[] = [];
  if (which !== 'payable') sections.push(section('Receivable (they owe you)', r.receivable, r.totalReceivable));
  if (which !== 'receivable') sections.push(section('Payable (you owe them)', r.payable, r.totalPayable));
  return {
    title: which === 'both' ? 'Receivable And Payable' : which === 'receivable' ? 'Receivable' : 'Payable',
    period: asOfText(f.asOf),
    summary: [
      ...(which !== 'payable' ? [{ label: 'Receivable', value: r.totalReceivable, money: true }] : []),
      ...(which !== 'receivable' ? [{ label: 'Payable', value: r.totalPayable, money: true }] : []),
      ...(which === 'both' ? [{ label: 'Net', value: round2(r.totalReceivable - r.totalPayable), money: true }] : []),
    ],
    sections,
  };
};

const plReport = (title: string) => (d: ReportData, f: ReportFilter): ReportResult => {
  const p = profitAndLoss(d.journal, f.from, f.to, d.accounts);
  const rows: ReportRow[] = [];
  const group = (heading: string, list: typeof p.income, total: number, totalLabel: string) => {
    rows.push({ cells: { code: '', account: heading, amount: null }, style: 'heading' });
    list.forEach((r) => rows.push({ cells: { code: r.account.code, account: r.account.name, amount: r.amount } }));
    rows.push({ cells: { code: '', account: totalLabel, amount: total }, style: 'subtotal' });
  };
  group('Income', p.income, p.totalIncome, 'Total income');
  group('Cost of sales', p.costOfSales, p.totalCostOfSales, 'Total cost of sales');
  rows.push({ cells: { code: '', account: 'Gross profit', amount: p.grossProfit }, style: 'total' });
  group('Expenses', p.expenses, p.totalExpenses, 'Total expenses');
  return {
    title,
    period: rangeText(f),
    summary: [
      { label: 'Income', value: p.totalIncome, money: true },
      { label: 'Gross profit', value: p.grossProfit, money: true },
      { label: p.netProfit >= 0 ? 'Net profit' : 'Net loss', value: p.netProfit, money: true },
    ],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'account', label: 'Account' },
          { key: 'amount', label: 'Amount', align: 'right', money: true },
        ],
        rows,
        totals: { code: '', account: p.netProfit >= 0 ? 'Net profit' : 'Net loss', amount: p.netProfit },
      },
    ],
  };
};

const bsAsAt = (d: ReportData, f: ReportFilter): ReportResult => {
  const b = balanceSheet(d.journal, f.asOf, d.accounts);
  const rows: ReportRow[] = [];
  const group = (heading: string, list: typeof b.assets, total: number) => {
    rows.push({ cells: { code: '', account: heading, amount: null }, style: 'heading' });
    list.forEach((r) => rows.push({ cells: { code: r.account.code, account: r.account.name, amount: r.amount } }));
    if (heading === 'Equity') rows.push({ cells: { code: '', account: 'Profit to date (not yet closed)', amount: b.profitToDate } });
    rows.push({ cells: { code: '', account: `Total ${heading.toLowerCase()}`, amount: total }, style: 'subtotal' });
  };
  group('Assets', b.assets, b.totalAssets);
  group('Liabilities', b.liabilities, b.totalLiabilities);
  group('Equity', b.equity, b.totalEquity);
  return {
    title: 'Balance Sheet',
    period: asOfText(f.asOf),
    summary: [
      { label: 'Assets', value: b.totalAssets, money: true },
      { label: 'Liabilities + equity', value: round2(b.totalLiabilities + b.totalEquity), money: true },
      { label: b.balanced ? 'Balanced' : 'Difference', value: b.balanced ? 'Assets = Liabilities + Equity' : b.difference, money: !b.balanced },
    ],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'account', label: 'Account' },
          { key: 'amount', label: 'Amount', align: 'right', money: true },
        ],
        rows,
        totals: { code: '', account: 'Liabilities + equity', amount: round2(b.totalLiabilities + b.totalEquity) },
      },
    ],
  };
};

/** Balance sheet between dates: each account at the start, the period's movement, and at the end. */
const bsBetween = (d: ReportData, f: ReportFilter): ReportResult => {
  const start = dayBefore(f.from);
  const a = balanceSheet(d.journal, start, d.accounts);
  const b = balanceSheet(d.journal, f.to, d.accounts);
  const rows: ReportRow[] = [];
  const group = (heading: string, key: 'assets' | 'liabilities' | 'equity', ta: number, tb: number) => {
    rows.push({ cells: { code: '', account: heading, opening: null, movement: null, closing: null }, style: 'heading' });
    const codes = Array.from(new Set([...a[key].map((r) => r.account.code), ...b[key].map((r) => r.account.code)])).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    codes.forEach((code) => {
      const o = a[key].find((r) => r.account.code === code)?.amount || 0;
      const c = b[key].find((r) => r.account.code === code)?.amount || 0;
      rows.push({ cells: { code, account: accName(d, code), opening: o, movement: round2(c - o), closing: c } });
    });
    if (key === 'equity') rows.push({ cells: { code: '', account: 'Profit to date (not yet closed)', opening: a.profitToDate, movement: round2(b.profitToDate - a.profitToDate), closing: b.profitToDate } });
    rows.push({ cells: { code: '', account: `Total ${heading.toLowerCase()}`, opening: ta, movement: round2(tb - ta), closing: tb }, style: 'subtotal' });
  };
  group('Assets', 'assets', a.totalAssets, b.totalAssets);
  group('Liabilities', 'liabilities', a.totalLiabilities, b.totalLiabilities);
  group('Equity', 'equity', a.totalEquity, b.totalEquity);
  const lea = round2(a.totalLiabilities + a.totalEquity);
  const leb = round2(b.totalLiabilities + b.totalEquity);
  return {
    title: 'Balance Sheet Between Dates',
    period: rangeText(f),
    summary: [
      { label: `Assets on ${formatDate(f.to)}`, value: b.totalAssets, money: true },
      { label: 'Change in the period', value: round2(b.totalAssets - a.totalAssets), money: true },
      { label: b.balanced && a.balanced ? 'Balanced' : 'Difference', value: b.balanced && a.balanced ? 'Assets = Liabilities + Equity' : b.difference, money: !(b.balanced && a.balanced) },
    ],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'account', label: 'Account' },
          { key: 'opening', label: `On ${formatDate(start)}`, align: 'right', money: true },
          { key: 'movement', label: 'Movement', align: 'right', money: true },
          { key: 'closing', label: `On ${formatDate(f.to)}`, align: 'right', money: true },
        ],
        rows,
        totals: { code: '', account: 'Liabilities + equity', opening: lea, movement: round2(leb - lea), closing: leb },
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// Daily sale / purchase / gross profit
// ---------------------------------------------------------------------------
const liveBills = (d: ReportData) => billsOnly(d.invoices);

/** Per day: bills, sale (bill totals), received on the bill that day, credit, returns and net sale. */
export const dailySale = (d: Pick<ReportData, 'invoices' | 'returns'>, from: string, to: string) => {
  const bills = billsOnly(d.invoices).filter((i) => i.issueDate >= from && i.issueDate <= to);
  const rets = d.returns.filter((r) => r.kind === 'sales' && r.date >= from && r.date <= to);
  const days = new Map<string, { date: string; bills: number; sale: number; received: number; credit: number; returns: number }>();
  const day = (date: string) => {
    let r = days.get(date);
    if (!r) days.set(date, (r = { date, bills: 0, sale: 0, received: 0, credit: 0, returns: 0 }));
    return r;
  };
  bills.forEach((i) => {
    const r = day(i.issueDate);
    const paidThatDay = (i.payments || []).filter((p) => p.date === i.issueDate).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const received = Math.min(i.totalAmount, paidThatDay);
    r.bills += 1;
    r.sale += i.totalAmount;
    r.received += received;
    r.credit += i.totalAmount - received;
  });
  rets.forEach((x) => (day(x.date).returns += Number(x.amount) || 0));
  const rows = Array.from(days.values())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => ({ ...r, sale: round2(r.sale), received: round2(r.received), credit: round2(r.credit), returns: round2(r.returns), net: round2(r.sale - r.returns) }));
  const t = (k: 'bills' | 'sale' | 'received' | 'credit' | 'returns' | 'net') => round2(rows.reduce((a, r) => a + r[k], 0));
  return { rows, totals: { bills: t('bills'), sale: t('sale'), received: t('received'), credit: t('credit'), returns: t('returns'), net: t('net') } };
};

const dailySaleReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const r = dailySale(d, f.from, f.to);
  return {
    title: 'Daily Sale',
    period: rangeText(f),
    summary: [
      { label: 'Bills', value: r.totals.bills },
      { label: 'Sale', value: r.totals.sale, money: true },
      { label: 'Net sale', value: r.totals.net, money: true },
    ],
    sections: [
      {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'bills', label: 'Bills', align: 'right' },
          { key: 'sale', label: 'Sale', align: 'right', money: true },
          { key: 'received', label: 'Cash / bank recd.', align: 'right', money: true },
          { key: 'credit', label: 'Credit', align: 'right', money: true },
          { key: 'returns', label: 'Returns', align: 'right', money: true },
          { key: 'net', label: 'Net sale', align: 'right', money: true },
        ],
        rows: r.rows.map((x) => ({ cells: { ...x, returns: x.returns || null } })),
        totals: { date: 'Total', ...r.totals },
        empty: 'No bills in these dates.',
      },
    ],
  };
};

/** Per day: documents, goods received (at cost), goods sent back, net purchase. */
export const dailyPurchase = (d: Pick<ReportData, 'purchases' | 'returns' | 'purchaseInvoices' | 'ledger'>, from: string, to: string) => {
  const days = new Map<string, { date: string; docs: Set<string>; purchase: number; returns: number }>();
  const day = (date: string) => {
    let r = days.get(date);
    if (!r) days.set(date, (r = { date, docs: new Set(), purchase: 0, returns: 0 }));
    return r;
  };
  const invoiceOf = new Map<string, string>();
  d.purchaseInvoices.forEach((p) => p.lines.forEach((l) => l.purchaseId && invoiceOf.set(l.purchaseId, p.invoiceNumber)));
  d.purchases.filter((p) => p.date >= from && p.date <= to).forEach((p) => {
    const r = day(p.date);
    r.docs.add(invoiceOf.get(p.id) || p.receiptNumber);
    r.purchase += Number(p.amount) || 0;
  });
  // Paisa rounding of purchase invoices (so a day's purchase equals the invoices' totals).
  const invNumbers = new Set(d.purchaseInvoices.map((p) => p.invoiceNumber));
  d.ledger.filter((l) => l.entityType === 'supplier' && l.type === 'purchase_variance' && invNumbers.has(l.referenceId) && l.date >= from && l.date <= to).forEach((l) => (day(l.date).purchase += (Number(l.debit) || 0) - (Number(l.credit) || 0)));
  d.returns.filter((x) => x.kind === 'purchase' && x.date >= from && x.date <= to).forEach((x) => (day(x.date).returns += Number(x.amount) || 0));
  const rows = Array.from(days.values())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => ({ date: r.date, docs: r.docs.size, purchase: round2(r.purchase), returns: round2(r.returns), net: round2(r.purchase - r.returns) }));
  const t = (k: 'docs' | 'purchase' | 'returns' | 'net') => round2(rows.reduce((a, r) => a + r[k], 0));
  return { rows, totals: { docs: t('docs'), purchase: t('purchase'), returns: t('returns'), net: t('net') } };
};

const dailyPurchaseReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const r = dailyPurchase(d, f.from, f.to);
  return {
    title: 'Daily Purchase',
    period: rangeText(f),
    summary: [
      { label: 'Purchase', value: r.totals.purchase, money: true },
      { label: 'Returned', value: r.totals.returns, money: true },
      { label: 'Net purchase', value: r.totals.net, money: true },
    ],
    sections: [
      {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'docs', label: 'Invoices / receipts', align: 'right' },
          { key: 'purchase', label: 'Purchase', align: 'right', money: true },
          { key: 'returns', label: 'Returned', align: 'right', money: true },
          { key: 'net', label: 'Net purchase', align: 'right', money: true },
        ],
        rows: r.rows.map((x) => ({ cells: { ...x, returns: x.returns || null } })),
        totals: { date: 'Total', ...r.totals },
        empty: 'Nothing bought in these dates.',
      },
    ],
    notes: ['Purchases are at cost: a purchase invoice counts at its total (after discount and other charges).'],
  };
};

/** Per day: sales (net of discounts, before tax and freight), their cost and the gross profit. */
export const dailyGrossProfit = (d: Pick<ReportData, 'invoices' | 'returns' | 'purchases' | 'products' | 'customers'>, from: string, to: string) => {
  const src = { invoices: d.invoices, returns: d.returns, purchases: d.purchases, products: d.products, customers: d.customers };
  const active = new Set<string>([...billsOnly(d.invoices).map((i) => i.issueDate), ...d.returns.filter((r) => r.kind === 'sales').map((r) => r.date)].filter((x) => x >= from && x <= to));
  const rows = Array.from(active)
    .sort()
    .map((date) => {
      const p = profitFromBills(src, date, date);
      return { date, bills: p.totals.bills, sales: p.totals.sales, cost: p.totals.cost, profit: p.totals.profit, margin: p.totals.marginPct };
    });
  const sales = round2(rows.reduce((a, r) => a + r.sales, 0));
  const cost = round2(rows.reduce((a, r) => a + r.cost, 0));
  const profit = round2(sales - cost);
  return { rows, totals: { bills: rows.reduce((a, r) => a + r.bills, 0), sales, cost, profit, margin: Math.abs(sales) > EPS ? Math.round((profit / sales) * 1000) / 10 : null } };
};

const dailyGrossProfitReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const r = dailyGrossProfit(d, f.from, f.to);
  return {
    title: 'Daily Gross Profit',
    period: rangeText(f),
    summary: [
      { label: 'Sales', value: r.totals.sales, money: true },
      { label: 'Cost', value: r.totals.cost, money: true },
      { label: 'Gross profit', value: r.totals.profit, money: true },
    ],
    sections: [
      {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'bills', label: 'Bills', align: 'right' },
          { key: 'sales', label: 'Sales', align: 'right', money: true },
          { key: 'cost', label: 'Cost', align: 'right', money: true },
          { key: 'profit', label: 'Gross profit', align: 'right', money: true },
          { key: 'margin', label: 'Margin %', align: 'right' },
        ],
        rows: r.rows.map((x) => ({ cells: { ...x, margin: x.margin == null ? '' : `${x.margin}%` } })),
        totals: { date: 'Total', bills: r.totals.bills, sales: r.totals.sales, cost: r.totals.cost, profit: r.totals.profit, margin: r.totals.margin == null ? '' : `${r.totals.margin}%` },
        empty: 'No bills in these dates.',
      },
    ],
    notes: ['Sales are bill lines after discounts, without sales tax and freight. Cost is what the goods cost you (the same figure as Cost of goods sold in the books). Returns come off both.'],
  };
};

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------
/** Qty and value of every item on a date (value at cost: what it was bought for up to then). */
export const stockInHand = (d: ReportData, asOf: string) =>
  [...d.products]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const qty = stockOn(d, p.id, asOf);
      const rate = round2(unitCostOn(d, p, asOf));
      return { product: p, qty, rate, value: round2(qty * rate) };
    });

const stockInHandReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const today = f.today || f.asOf;
  const byGodown = d.godowns.length > 1 && f.asOf >= today;
  const g = f.godownId && byGodown ? d.godowns.find((x) => x.id === f.godownId) : undefined;
  const rows = stockInHand(d, f.asOf)
    .map((r) => {
      const qty = g ? round2(stockByGodown(r.product, d.stockBatches, d.godowns)[g.id] || 0) : r.qty;
      return { ...r, qty, value: round2(qty * r.rate) };
    })
    .filter((r) => Math.abs(r.qty) > EPS || !g);
  const total = round2(rows.reduce((a, r) => a + r.value, 0));
  const cols: ReportColumn[] = [
    { key: 'code', label: 'Code' },
    { key: 'item', label: 'Product name' },
    { key: 'unit', label: 'Unit' },
    { key: 'qty', label: 'Qty', align: 'right' },
    { key: 'packs', label: 'In packs', align: 'right' },
    { key: 'rate', label: 'Cost rate', align: 'right', money: true },
    { key: 'value', label: 'Value', align: 'right', money: true },
  ];
  const godownCols: ReportColumn[] = byGodown && !g ? d.godowns.map((x) => ({ key: `g_${x.id}`, label: x.name, align: 'right' as const })) : [];
  return {
    title: 'Stock In Hand',
    period: `${asOfText(f.asOf)}${g ? ` • ${g.name}` : ''}`,
    summary: [
      { label: 'Items', value: rows.filter((r) => Math.abs(r.qty) > EPS).length },
      { label: 'Stock value', value: total, money: true },
    ],
    sections: [
      {
        columns: [...cols.slice(0, 5), ...godownCols, ...cols.slice(5)],
        rows: rows.map((r) => {
          const per = byGodown && !g ? stockByGodown(r.product, d.stockBatches, d.godowns) : {};
          return {
            cells: {
              code: r.product.code || '',
              item: r.product.name,
              unit: r.product.unit || 'pcs',
              qty: r.qty,
              packs: hasPack(r.product) ? formatPackQty(r.qty, r.product, 'short') : '',
              ...Object.fromEntries(godownCols.map((c) => [c.key, round2(per[c.key.slice(2)] || 0)])),
              rate: r.rate || null,
              value: r.value,
            },
            ...(r.qty < -EPS ? { style: 'muted' as const } : {}),
          };
        }),
        totals: { code: '', item: 'Total', value: total },
        empty: 'No items yet.',
      },
    ],
    notes: [
      ...(d.godowns.length > 1 && !byGodown ? ['Godown-wise stock is shown for today only; on an earlier date the total of all godowns is shown.'] : []),
      'Value at cost: what each item was bought for up to that date (else its cost price).',
    ],
  };
};

const stockValueReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const rows = stockInHand(d, f.asOf).filter((r) => Math.abs(r.qty) > EPS);
  const groups = new Map<string, typeof rows>();
  rows.forEach((r) => {
    const k = r.product.category || 'Other';
    groups.set(k, [...(groups.get(k) || []), r]);
  });
  const out: ReportRow[] = [];
  Array.from(groups.keys())
    .sort()
    .forEach((k) => {
      const list = groups.get(k)!;
      out.push({ cells: { item: k, qty: null, rate: null, value: null }, style: 'heading' });
      list.forEach((r) => out.push({ cells: { item: r.product.name, qty: qtyText(r.qty, r.product), rate: r.rate || null, value: r.value } }));
      out.push({ cells: { item: `Total ${k}`, qty: '', rate: null, value: round2(list.reduce((a, r) => a + r.value, 0)) }, style: 'subtotal' });
    });
  const total = round2(rows.reduce((a, r) => a + r.value, 0));
  return {
    title: 'Stock Value',
    period: asOfText(f.asOf),
    summary: [{ label: 'Stock value', value: total, money: true }],
    sections: [
      {
        columns: [
          { key: 'item', label: 'Category / product' },
          { key: 'qty', label: 'Qty', align: 'right' },
          { key: 'rate', label: 'Cost rate', align: 'right', money: true },
          { key: 'value', label: 'Value', align: 'right', money: true },
        ],
        rows: out,
        totals: { item: 'Total stock value', qty: '', rate: null, value: total },
        empty: 'No stock on this date.',
      },
    ],
  };
};

const godownStockReport = (d: ReportData): ReportResult => {
  const cols: ReportColumn[] = [
    { key: 'code', label: 'Code' },
    { key: 'item', label: 'Product name' },
    { key: 'unit', label: 'Unit' },
    ...d.godowns.map((g) => ({ key: `g_${g.id}`, label: g.name, align: 'right' as const })),
    { key: 'total', label: 'Total', align: 'right' },
  ];
  const rows: ReportRow[] = [...d.products]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const per = stockByGodown(p, d.stockBatches, d.godowns);
      return { cells: { code: p.code || '', item: p.name, unit: p.unit || 'pcs', ...Object.fromEntries(d.godowns.map((g) => [`g_${g.id}`, round2(per[g.id] || 0)])), total: round2(p.stockKg) } };
    });
  return { title: 'Godown-wise Stock', period: 'Stock now', sections: [{ columns: cols, rows, empty: 'No items yet.' }] };
};

const lowStockReport = (d: ReportData): ReportResult => {
  const rows = d.products
    .filter((p) => p.minThresholdKg > 0 && p.stockKg <= p.minThresholdKg)
    .sort((a, b) => a.stockKg - a.minThresholdKg - (b.stockKg - b.minThresholdKg))
    .map((p) => ({ cells: { code: p.code || '', item: p.name, stock: qtyText(p.stockKg, p), min: qtyText(p.minThresholdKg, p), short: round2(p.minThresholdKg - p.stockKg), reorder: p.reorderQty ? qtyText(p.reorderQty, p) : '', supplier: p.supplierId ? supName(d, p.supplierId) : '' } }));
  return {
    title: 'Low Stock',
    period: 'Stock now',
    summary: [{ label: 'Items at or below their low-stock level', value: rows.length }],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'item', label: 'Product name' },
          { key: 'stock', label: 'In stock', align: 'right' },
          { key: 'min', label: 'Low-stock level', align: 'right' },
          { key: 'short', label: 'Short by', align: 'right' },
          { key: 'reorder', label: 'Reorder qty', align: 'right' },
          { key: 'supplier', label: 'Supplier' },
        ],
        rows,
        empty: 'Nothing is low. Set a low-stock level on an item to watch it.',
      },
    ],
  };
};

const stockLedgerReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const p = f.productId ? prod(d, f.productId) : undefined;
  if (!p) return { title: 'Stock Ledger', period: rangeText(f), sections: [{ columns: [{ key: 'x', label: '' }], rows: [], empty: 'Pick an item to see its stock ledger.' }] };
  const h = itemHistory(p.id, { products: d.products, customers: d.customers, suppliers: d.suppliers, invoices: d.invoices, purchases: d.purchases, returns: d.returns, adjustments: d.adjustments, stockTransfers: d.stockTransfers, godowns: d.godowns });
  const moves = h.rows.filter((r) => r.kind !== 'opening');
  const opening = round2(h.opening + moves.filter((r) => r.date < f.from).reduce((a, r) => a + r.change, 0));
  const inRangeRows = moves.filter((r) => inRange(r.date, f));
  let bal = opening;
  const rows: ReportRow[] = [{ cells: { date: '', ref: '', particulars: 'Opening stock', party: '', in: null, out: null, balance: opening }, style: 'muted' }];
  inRangeRows.forEach((r) => {
    bal = round2(bal + r.change);
    rows.push({ cells: { date: r.date, ref: r.ref || '', particulars: r.label, party: r.party || '', in: r.change > 0 ? r.change : null, out: r.change < 0 ? -r.change : null, balance: bal }, billId: r.invoiceId });
  });
  const tin = round2(inRangeRows.filter((r) => r.change > 0).reduce((a, r) => a + r.change, 0));
  const tout = round2(inRangeRows.filter((r) => r.change < 0).reduce((a, r) => a - r.change, 0));
  return {
    title: 'Stock Ledger',
    period: `${p.code ? `${p.code} • ` : ''}${p.name} (${p.unit || 'pcs'}) • ${rangeText(f)}`,
    summary: [
      { label: 'Opening', value: qtyText(opening, p) },
      { label: 'In', value: qtyText(tin, p) },
      { label: 'Out', value: qtyText(tout, p) },
      { label: 'Closing', value: qtyText(bal, p) },
    ],
    sections: [
      {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'ref', label: 'Doc #' },
          { key: 'particulars', label: 'Particulars' },
          { key: 'party', label: 'Party' },
          { key: 'in', label: 'In', align: 'right' },
          { key: 'out', label: 'Out', align: 'right' },
          { key: 'balance', label: 'Balance', align: 'right' },
        ],
        rows,
        totals: { date: '', ref: '', particulars: 'Total / closing', party: '', in: tin, out: tout, balance: bal },
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// Party and product reports
// ---------------------------------------------------------------------------
/** Sales returns as (productId, qty, value) lines, whether the return has line items or not. */
const returnLines = (r: StockReturn): { productId: string; qty: number; value: number }[] =>
  r.items?.length ? r.items.map((it) => ({ productId: it.productId, qty: Number(it.qty) || 0, value: round2((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)) })) : [{ productId: r.productId, qty: Number(r.kg) || 0, value: Number(r.amount) || 0 }];

const partySalesReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const map = new Map<string, { id: string; bills: number; sale: number; returns: number; received: number }>();
  const row = (id: string) => {
    let r = map.get(id);
    if (!r) map.set(id, (r = { id, bills: 0, sale: 0, returns: 0, received: 0 }));
    return r;
  };
  liveBills(d).filter((i) => inRange(i.issueDate, f) && (!f.customerId || i.customerId === f.customerId)).forEach((i) => {
    const r = row(i.customerId);
    r.bills += 1;
    r.sale += i.totalAmount;
  });
  d.returns.filter((x) => x.kind === 'sales' && x.customerId && inRange(x.date, f) && (!f.customerId || x.customerId === f.customerId)).forEach((x) => (row(x.customerId!).returns += Number(x.amount) || 0));
  d.ledger.filter((l) => l.entityType === 'customer' && (l.type === 'payment_received' || l.type === 'cheque_received') && inRange(l.date, f) && (!f.customerId || l.entityId === f.customerId)).forEach((l) => (row(l.entityId).received += Number(l.credit) || 0));
  const rows = Array.from(map.values())
    .map((r) => {
      const c = d.customers.find((x) => x.id === r.id);
      return { code: c?.code || '', name: custName(d, r.id), bills: r.bills, sale: round2(r.sale), returns: round2(r.returns), net: round2(r.sale - r.returns), received: round2(r.received), balance: c ? partyBalanceOn(c.totalDue, d.ledger, 'customer', c.id, f.to) : 0 };
    })
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  const rr = rows.map((r) => ({ cells: r as unknown as Record<string, Cell> }));
  return {
    title: 'Party-wise Sale',
    period: rangeText(f),
    summary: [
      { label: 'Net sale', value: sumCol(rr, 'net'), money: true },
      { label: 'Received', value: sumCol(rr, 'received'), money: true },
    ],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Customer' },
          { key: 'bills', label: 'Bills', align: 'right' },
          { key: 'sale', label: 'Sale', align: 'right', money: true },
          { key: 'returns', label: 'Returns', align: 'right', money: true },
          { key: 'net', label: 'Net sale', align: 'right', money: true },
          { key: 'received', label: 'Received', align: 'right', money: true },
          { key: 'balance', label: `Balance on ${formatDate(f.to)}`, align: 'right', money: true },
        ],
        rows: rr,
        totals: { code: '', name: 'Total', bills: sumCol(rr, 'bills'), sale: sumCol(rr, 'sale'), returns: sumCol(rr, 'returns'), net: sumCol(rr, 'net'), received: sumCol(rr, 'received'), balance: sumCol(rr, 'balance') },
        empty: 'No sales in these dates.',
      },
    ],
  };
};

const partyPurchasesReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const map = new Map<string, { id: string; purchase: number; returns: number; paid: number }>();
  const row = (id: string) => {
    let r = map.get(id);
    if (!r) map.set(id, (r = { id, purchase: 0, returns: 0, paid: 0 }));
    return r;
  };
  const want = (id?: string | null) => !f.supplierId || id === f.supplierId;
  d.purchases.filter((p) => inRange(p.date, f) && want(p.supplierId)).forEach((p) => (row(p.supplierId).purchase += Number(p.amount) || 0));
  d.ledger.filter((l) => l.entityType === 'supplier' && l.type === 'purchase_variance' && inRange(l.date, f) && want(l.entityId)).forEach((l) => (row(l.entityId).purchase += (Number(l.debit) || 0) - (Number(l.credit) || 0)));
  d.returns.filter((x) => x.kind === 'purchase' && x.supplierId && inRange(x.date, f) && want(x.supplierId)).forEach((x) => (row(x.supplierId!).returns += Number(x.amount) || 0));
  d.ledger.filter((l) => l.entityType === 'supplier' && (l.type === 'payment_made' || l.type === 'cheque_issued') && inRange(l.date, f) && want(l.entityId)).forEach((l) => (row(l.entityId).paid += Number(l.credit) || 0));
  const rows = Array.from(map.values())
    .map((r) => {
      const s = d.suppliers.find((x) => x.id === r.id);
      return { code: s?.code || '', name: supName(d, r.id), purchase: round2(r.purchase), returns: round2(r.returns), net: round2(r.purchase - r.returns), paid: round2(r.paid), balance: s ? partyBalanceOn(s.totalOwed, d.ledger, 'supplier', s.id, f.to) : 0 };
    })
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  const rr = rows.map((r) => ({ cells: r as unknown as Record<string, Cell> }));
  return {
    title: 'Party-wise Purchase',
    period: rangeText(f),
    summary: [
      { label: 'Net purchase', value: sumCol(rr, 'net'), money: true },
      { label: 'Paid', value: sumCol(rr, 'paid'), money: true },
    ],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Supplier' },
          { key: 'purchase', label: 'Purchase', align: 'right', money: true },
          { key: 'returns', label: 'Returned', align: 'right', money: true },
          { key: 'net', label: 'Net purchase', align: 'right', money: true },
          { key: 'paid', label: 'Paid', align: 'right', money: true },
          { key: 'balance', label: `Balance on ${formatDate(f.to)}`, align: 'right', money: true },
        ],
        rows: rr,
        totals: { code: '', name: 'Total', purchase: sumCol(rr, 'purchase'), returns: sumCol(rr, 'returns'), net: sumCol(rr, 'net'), paid: sumCol(rr, 'paid'), balance: sumCol(rr, 'balance') },
        empty: 'Nothing bought in these dates.',
      },
    ],
  };
};

const partyOutstandingReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const r = receivablePayable(d, f.asOf);
  const lastOf = (type: 'customer' | 'supplier', id: string, types: string[]) =>
    d.ledger.filter((l) => l.entityType === type && l.entityId === id && types.includes(l.type) && l.date <= f.asOf).reduce((m, l) => (l.date > m ? l.date : m), '');
  const days = (date: string) => (date ? Math.round((Date.parse(`${f.asOf}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000) : null);
  const section = (title: string, list: typeof r.receivable, total: number): ReportSection => ({
    title,
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Party' },
      { key: 'lastDoc', label: 'Last bill' },
      { key: 'lastPay', label: 'Last payment' },
      { key: 'days', label: 'Days since paid', align: 'right' },
      { key: 'amount', label: 'Outstanding', align: 'right', money: true },
    ],
    rows: list.map((x) => {
      const lastDoc = lastOf(x.kind, x.id, x.kind === 'customer' ? ['bill_issued'] : ['purchase_received']);
      const lastPay = lastOf(x.kind, x.id, x.kind === 'customer' ? ['payment_received', 'cheque_received'] : ['payment_made', 'cheque_issued']);
      return { cells: { code: x.code, name: x.note ? `${x.name} (${x.note})` : x.name, lastDoc, lastPay, days: days(lastPay || lastDoc), amount: x.amount } };
    }),
    totals: { code: '', name: 'Total', lastDoc: '', lastPay: '', days: null, amount: total },
    empty: 'Nothing outstanding.',
  });
  return {
    title: 'Party Outstanding',
    period: asOfText(f.asOf),
    summary: [
      { label: 'Receivable', value: r.totalReceivable, money: true },
      { label: 'Payable', value: r.totalPayable, money: true },
    ],
    sections: [section('Customers (receivable)', r.receivable, r.totalReceivable), section('Suppliers (payable)', r.payable, r.totalPayable)],
  };
};

/** Qty and value per product: sold (net of returns) or bought (net of goods sent back). */
export const productTotals = (d: Pick<ReportData, 'invoices' | 'returns' | 'purchases' | 'products'>, side: 'sale' | 'purchase', f: Pick<ReportFilter, 'from' | 'to' | 'customerId' | 'supplierId'>) => {
  const map = new Map<string, { productId: string; qty: number; amount: number; docs: Set<string> }>();
  const row = (id: string) => {
    let r = map.get(id);
    if (!r) map.set(id, (r = { productId: id, qty: 0, amount: 0, docs: new Set() }));
    return r;
  };
  const ok = (date: string) => date >= f.from && date <= f.to;
  if (side === 'sale') {
    billsOnly(d.invoices).filter((i) => ok(i.issueDate) && (!f.customerId || i.customerId === f.customerId)).forEach((i) => {
      const gross = i.items.reduce((a, it) => a + (Number(it.amount) || 0), 0);
      i.items.forEach((it) => {
        const r = row(it.productId);
        const amount = Number(it.amount) || 0;
        // The bill discount is shared over the lines by amount (as in profit by item).
        const share = gross > 0 ? (amount / gross) * (Number(i.discount) || 0) : 0;
        r.qty += Number(it.qty ?? it.kg) || 0;
        r.amount += amount - share;
        r.docs.add(i.id);
      });
    });
    d.returns.filter((x) => x.kind === 'sales' && ok(x.date) && (!f.customerId || x.customerId === f.customerId)).forEach((x) =>
      returnLines(x).forEach((l) => {
        const r = row(l.productId);
        r.qty -= l.qty;
        r.amount -= l.value;
      })
    );
  } else {
    d.purchases.filter((p) => ok(p.date) && (!f.supplierId || p.supplierId === f.supplierId)).forEach((p) => {
      const r = row(p.productId);
      r.qty += Number(p.kg) || 0;
      r.amount += Number(p.amount) || 0;
      r.docs.add(p.id);
    });
    d.returns.filter((x) => x.kind === 'purchase' && ok(x.date) && (!f.supplierId || x.supplierId === f.supplierId)).forEach((x) => {
      const r = row(x.productId);
      r.qty -= Number(x.kg) || 0;
      r.amount -= Number(x.amount) || 0;
    });
  }
  return Array.from(map.values())
    .map((r) => {
      const p = d.products.find((x) => x.id === r.productId);
      const qty = round2(r.qty);
      const amount = round2(r.amount);
      return { product: p, productId: r.productId, name: p?.name || 'Item', code: p?.code || '', unit: p?.unit || 'pcs', qty, amount, avg: Math.abs(qty) > EPS ? round2(amount / qty) : 0, docs: r.docs.size };
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
};

const productReport = (side: 'sale' | 'purchase') => (d: ReportData, f: ReportFilter): ReportResult => {
  const rows = productTotals(d, side, f);
  const total = round2(rows.reduce((a, r) => a + r.amount, 0));
  const who = side === 'sale' ? (f.customerId ? custName(d, f.customerId) : '') : f.supplierId ? supName(d, f.supplierId) : '';
  return {
    title: side === 'sale' ? 'Product-wise Sale' : 'Product-wise Purchase',
    period: `${rangeText(f)}${who ? ` • ${who}` : ''}`,
    summary: [{ label: side === 'sale' ? 'Net sale' : 'Net purchase', value: total, money: true }],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Product name' },
          { key: 'unit', label: 'Unit' },
          { key: 'qty', label: 'Qty', align: 'right' },
          { key: 'packs', label: 'In packs', align: 'right' },
          { key: 'avg', label: 'Avg. rate', align: 'right', money: true },
          { key: 'amount', label: 'Amount', align: 'right', money: true },
        ],
        rows: rows.map((r) => ({ cells: { code: r.code, name: r.name, unit: r.unit, qty: r.qty, packs: r.product && hasPack(r.product) ? formatPackQty(r.qty, r.product, 'short') : '', avg: r.avg || null, amount: r.amount } })),
        totals: { code: '', name: 'Total', unit: '', qty: null, packs: '', avg: null, amount: total },
        empty: side === 'sale' ? 'Nothing sold in these dates.' : 'Nothing bought in these dates.',
      },
    ],
    notes: side === 'sale' ? ['Amounts are after line and bill discounts, without sales tax and freight; returns are taken off.'] : ['Amounts at cost (after purchase-invoice discount and charges); goods sent back are taken off.'],
  };
};

/** Price list with the last sale and last purchase rate of every item (the classic "Product List"). */
export const rateList = (d: Pick<ReportData, 'products' | 'invoices' | 'purchases'>, asOf: string) => {
  const bills = billsOnly(d.invoices).filter((i) => i.issueDate <= asOf);
  return [...d.products]
    .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }) || a.name.localeCompare(b.name))
    .map((p) => {
      // Latest sold line of the item: by bill date, then by when the bill was entered.
      let lastSale: { rate: number; date: string; key: string } | null = null;
      bills.forEach((i) =>
        i.items.forEach((it) => {
          if (it.productId !== p.id || it.free) return;
          const key = `${i.issueDate}|${i.enteredAt || i.issuedAt || i.createdAt || ''}`;
          if (!lastSale || key > lastSale.key) lastSale = { rate: Number(it.unitPrice ?? it.ratePerKg) || 0, date: i.issueDate, key };
        })
      );
      const buys = d.purchases.filter((x) => x.productId === p.id && x.date <= asOf).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || '').localeCompare(b.createdAt || '')));
      const lastBuy = buys.length ? { rate: buys[buys.length - 1].pricePerKg, date: buys[buys.length - 1].date } : null;
      const ls = lastSale as { rate: number; date: string } | null;
      return { product: p, saleRate: p.unitPricePerKg, lastSale: ls ? { rate: ls.rate, date: ls.date } : null, lastPurchase: lastBuy };
    });
};

const rateListReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const rows = rateList(d, f.asOf);
  return {
    title: 'Product List / Rate List',
    period: asOfText(f.asOf),
    summary: [{ label: 'Items', value: rows.length }],
    sections: [
      {
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Product name' },
          { key: 'unit', label: 'Unit' },
          { key: 'pack', label: 'Packing' },
          { key: 'price', label: 'Sale price', align: 'right', money: true },
          { key: 'lastSale', label: 'Last sale rate', align: 'right', money: true },
          { key: 'lastSaleOn', label: 'On' },
          { key: 'lastBuy', label: 'Last purchase rate', align: 'right', money: true },
          { key: 'lastBuyOn', label: 'On' },
          { key: 'stock', label: 'Stock', align: 'right' },
        ],
        rows: rows.map((r) => ({
          cells: {
            code: r.product.code || '',
            name: r.product.name,
            unit: r.product.unit || 'pcs',
            pack: hasPack(r.product) ? `${r.product.packName} of ${r.product.packSize}` : '',
            price: r.saleRate,
            lastSale: r.lastSale?.rate ?? null,
            lastSaleOn: r.lastSale?.date || '',
            lastBuy: r.lastPurchase?.rate ?? null,
            lastBuyOn: r.lastPurchase?.date || '',
            stock: qtyText(r.product.stockKg, r.product),
          },
        })),
        empty: 'No items yet.',
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// Pending delivery list
// ---------------------------------------------------------------------------
export const deliveryBills = (invoices: Invoice[], f: Pick<ReportFilter, 'from' | 'to' | 'customerId' | 'status'>) =>
  billsOnly(invoices)
    .filter((i) => i.delivery)
    .filter((i) => (f.status || 'pending') === 'all' || i.delivery!.status === (f.status || 'pending'))
    .filter((i) => i.issueDate >= f.from && i.issueDate <= f.to)
    .filter((i) => !f.customerId || i.customerId === f.customerId)
    .sort((a, b) => (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true })));

const pendingDeliveryReport = (d: ReportData, f: ReportFilter): ReportResult => {
  const today = f.today || f.to;
  const list = deliveryBills(d.invoices, f);
  const status = f.status || 'pending';
  const days = (date: string) => Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000));
  return {
    title: status === 'delivered' ? 'Delivered Orders' : status === 'all' ? 'Delivery Orders' : 'Pending Delivery List',
    period: rangeText(f),
    summary: [
      { label: status === 'pending' ? 'Waiting for delivery' : 'Delivery orders', value: list.length },
      { label: 'Amount', value: round2(list.reduce((a, i) => a + i.totalAmount, 0)), money: true },
    ],
    sections: [
      {
        columns: [
          { key: 'bill', label: 'Bill #' },
          { key: 'date', label: 'Date' },
          { key: 'memo', label: 'Memo #' },
          { key: 'customer', label: 'Customer' },
          { key: 'items', label: 'Items' },
          { key: 'amount', label: 'Amount', align: 'right', money: true },
          { key: 'status', label: 'Status' },
          { key: 'days', label: 'Days', align: 'right' },
        ],
        rows: list.map((i) => ({
          billId: i.id,
          cells: {
            bill: i.invoiceNumber,
            date: i.issueDate,
            memo: i.memoNo || '',
            customer: i.customerName,
            items: i.items.map((it) => `${it.productName} × ${it.qty ?? it.kg}${it.unit && it.unit !== 'pcs' ? ` ${it.unit}` : ''}`).join(', '),
            amount: i.totalAmount,
            status: i.delivery!.status === 'delivered' ? `Delivered ${formatDate(i.delivery!.deliveredOn || '')}${i.delivery!.deliveredBy ? ` by ${i.delivery!.deliveredBy}` : ''}${i.delivery!.vehicle ? ` (${i.delivery!.vehicle})` : ''}` : 'Pending',
            days: i.delivery!.status === 'delivered' ? null : days(i.issueDate),
          },
        })),
        totals: { bill: 'Total', date: '', memo: '', customer: `${list.length} bill${list.length === 1 ? '' : 's'}`, items: '', amount: round2(list.reduce((a, i) => a + i.totalAmount, 0)), status: '', days: null },
        empty: status === 'pending' ? 'Nothing is waiting for delivery.' : 'No delivery orders in these dates.',
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const REPORTS: Record<ReportId, ReportDef> = {
  'cash-book': { id: 'cash-book', title: 'Cash Book', dateMode: 'range', books: true, help: 'Cash in hand: every receipt and payment with the running balance (F9).', build: moneyBook(false) },
  'bank-book': { id: 'bank-book', title: 'Bank Book', dateMode: 'range', books: true, filters: ['bank'], help: 'One bank account: every deposit and withdrawal with the running balance.', build: moneyBook(true) },
  'day-book': { id: 'day-book', title: 'Day Book', dateMode: 'day', books: true, help: 'Every entry of one day, voucher by voucher.', build: (d, f) => journalListing(d, 'Day Book', f.asOf, f.asOf, `Date: ${formatDate(f.asOf)}`, 'Nothing was entered on this day.') },
  'journal-book': { id: 'journal-book', title: 'Journal Book', dateMode: 'range', books: true, help: 'All journal entries in a date range, with their debit and credit lines.', build: (d, f) => journalListing(d, 'Journal Book', f.from, f.to, rangeText(f), 'No entries in these dates.') },
  'trial-balance': { id: 'trial-balance', title: 'Trial Balance', dateMode: 'asOf', books: true, help: 'Balance of every account on a date. Debit must equal credit.', build: tbAsAt },
  'trial-balance-period': { id: 'trial-balance-period', title: 'Trial Balance Between Dates', dateMode: 'range', books: true, defaultRange: 'fy', help: 'Opening balance, the period’s debits and credits, and the closing balance of every account.', build: tbBetween },
  'book-balances': { id: 'book-balances', title: 'Book Balances', dateMode: 'asOf', books: true, help: 'Cash in hand and each bank on a date.', build: bookBalancesReport },
  'receivable-payable': { id: 'receivable-payable', title: 'Receivable And Payable', dateMode: 'asOf', books: true, help: 'Who owes you and whom you owe, on a date.', build: rpReport('both') },
  receivables: { id: 'receivables', title: 'Receivable', dateMode: 'asOf', books: true, help: 'Customers who owe you, on a date.', build: rpReport('receivable') },
  payables: { id: 'payables', title: 'Payable', dateMode: 'asOf', books: true, help: 'Suppliers you owe, on a date.', build: rpReport('payable') },
  'profit-loss': { id: 'profit-loss', title: 'Profit And Loss', dateMode: 'range', books: true, defaultRange: 'fy', help: 'Income, cost of sales and expenses for this financial year to date.', build: plReport('Profit And Loss') },
  'profit-loss-period': { id: 'profit-loss-period', title: 'Profit and Loss Between Dates', dateMode: 'range', books: true, help: 'Profit and loss for any period you pick.', build: plReport('Profit and Loss Between Dates') },
  'balance-sheet': { id: 'balance-sheet', title: 'Balance Sheet', dateMode: 'asOf', books: true, help: 'What the business owns and owes on a date.', build: bsAsAt },
  'balance-sheet-period': { id: 'balance-sheet-period', title: 'Balance Sheet Between Dates', dateMode: 'range', books: true, defaultRange: 'fy', help: 'Every balance at the start and end of a period, with the movement in between.', build: bsBetween },
  'daily-gross-profit': { id: 'daily-gross-profit', title: 'Daily Gross Profit', dateMode: 'range', finance: true, help: 'Sales, their cost and the gross profit, day by day.', build: dailyGrossProfitReport },
  'daily-sale': { id: 'daily-sale', title: 'Daily Sale', dateMode: 'range', help: 'Bills, cash and credit sale and returns, day by day.', build: dailySaleReport },
  'daily-purchase': { id: 'daily-purchase', title: 'Daily Purchase', dateMode: 'range', help: 'Goods bought and sent back, day by day.', build: dailyPurchaseReport },
  'stock-in-hand': { id: 'stock-in-hand', title: 'Stock In Hand', dateMode: 'asOf', filters: ['godown'], help: 'Quantity and value of every item (and godown) on a date.', build: stockInHandReport },
  'party-sales': { id: 'party-sales', title: 'Party-wise Sale', dateMode: 'range', filters: ['customer'], help: 'Sale, returns, money received and balance per customer.', build: partySalesReport },
  'party-purchases': { id: 'party-purchases', title: 'Party-wise Purchase', dateMode: 'range', filters: ['supplier'], help: 'Purchase, returns, payments and balance per supplier.', build: partyPurchasesReport },
  'party-outstanding': { id: 'party-outstanding', title: 'Party Outstanding', dateMode: 'asOf', help: 'Every customer and supplier with a balance, their last bill and last payment.', build: partyOutstandingReport },
  'product-sales': { id: 'product-sales', title: 'Product-wise Sale', dateMode: 'range', filters: ['customer'], help: 'Quantity and amount sold of each product.', build: productReport('sale') },
  'product-purchases': { id: 'product-purchases', title: 'Product-wise Purchase', dateMode: 'range', filters: ['supplier'], help: 'Quantity and amount bought of each product.', build: productReport('purchase') },
  'rate-list': { id: 'rate-list', title: 'Product List / Rate List', dateMode: 'asOf', help: 'Codes, sale prices, last sale rate and last purchase rate of every product.', build: rateListReport },
  'stock-ledger': { id: 'stock-ledger', title: 'Stock Ledger', dateMode: 'range', filters: ['product'], requires: 'product', help: 'Every movement of one item with the running stock.', build: stockLedgerReport },
  'godown-stock': { id: 'godown-stock', title: 'Godown-wise Stock', dateMode: 'none', help: 'Stock of every item in each godown, now.', build: (d) => godownStockReport(d) },
  'stock-value': { id: 'stock-value', title: 'Stock Value', dateMode: 'asOf', finance: true, help: 'Value of the stock at cost, category by category.', build: stockValueReport },
  'low-stock': { id: 'low-stock', title: 'Low Stock', dateMode: 'none', help: 'Items at or below their low-stock level.', build: (d) => lowStockReport(d) },
  'pending-delivery': { id: 'pending-delivery', title: 'Pending Delivery List', dateMode: 'range', filters: ['customer', 'status'], defaultRange: 'fy', help: 'Delivery-order bills waiting to go out (or already delivered).', build: pendingDeliveryReport },
};

/** Default filter of a report on a given day. */
export const defaultFilter = (def: Pick<ReportDef, 'defaultRange'>, today: string, settings: Pick<AppSettings, 'financialYearStart'>): ReportFilter => {
  const from = def.defaultRange === 'fy' ? financialYearOf(today, fyStartOf(settings)).start : `${today.slice(0, 7)}-01`;
  return { from, to: today, asOf: today, status: 'pending', today };
};

/** Report as CSV: section title rows, the header, the rows and the totals of every section. */
export const reportCsv = (r: ReportResult): CsvTable => {
  const width = Math.max(...r.sections.map((s) => s.columns.length), 1);
  const rows: (string | number)[][] = [[r.title], [r.period]];
  r.sections.forEach((s) => {
    rows.push([]);
    if (s.title) rows.push([s.title]);
    rows.push(s.columns.map((c) => c.label));
    s.rows.forEach((row) => rows.push(s.columns.map((c) => row.cells[c.key] ?? '')));
    if (s.totals) rows.push(s.columns.map((c) => s.totals![c.key] ?? ''));
  });
  return { headers: Array.from({ length: width }, (_, i) => (i === 0 ? r.title : '')), rows: rows.slice(1) };
};

