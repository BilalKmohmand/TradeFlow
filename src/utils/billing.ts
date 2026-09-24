import { Invoice, Expense, CashEntry, LedgerEntry, Customer, Supplier, AppSettings, Cheque, EXPENSE_CATEGORIES, isCashMethod } from '../types';
import { ChequeEvent, chequeEventsOn } from './cheques';
import { collectCashMovements, accountBalancesOn, CashMovement, AccountBalances } from './finance';
import { shiftDate } from './stockFlow';
import { matcher } from './search';

const round2 = (n: number) => Number(n.toFixed(2));

/** Quantity and unit price of a bill line, falling back to the kg fields of older invoices. */
export const lineQty = (it: { qty?: number; kg: number }) => it.qty ?? it.kg;
export const linePrice = (it: { unitPrice?: number; ratePerKg: number }) => it.unitPrice ?? it.ratePerKg;

export interface DaySummary {
  date: string;
  billCount: number;
  sales: number;
  /** Cash + bank actually received today (bill payments, old dues, everything). */
  received: number;
  expenses: number;
  supplierPayments: number;
  creditGiven: number;
}

/** What happened on one day, in the numbers a shop owner asks for at closing time. */
/** Bills made on the billing screens (trading-suite invoices are handled by bookings/dispatches). */
export const billsOnly = (invoices: Invoice[]) => invoices.filter((i) => i.billKind && i.status !== 'cancelled');

export const daySummary = (invoices: Invoice[], movements: CashMovement[], date: string, allExpenses?: Expense[]): DaySummary => {
  // Expenses for the day include unpaid ones (they are still costs of that day).
  const expensesTotal = allExpenses ? round2(allExpenses.filter((e) => e.date === date).reduce((a, e) => a + e.amount, 0)) : round2(movements.filter((m) => m.date === date && m.source === 'expense').reduce((a, m) => a + m.amount, 0));
  const bills = billsOnly(invoices).filter((i) => i.issueDate === date);
  const todays = movements.filter((m) => m.date === date);
  const sales = round2(bills.reduce((a, b) => a + b.totalAmount, 0));
  const received = round2(todays.filter((m) => m.direction === 'in' && m.source === 'customer_payment').reduce((a, m) => a + m.amount, 0));
  const expenses = round2(todays.filter((m) => m.source === 'expense').reduce((a, m) => a + m.amount, 0));
  void expenses;
  const supplierPayments = round2(todays.filter((m) => m.source === 'supplier_payment').reduce((a, m) => a + m.amount, 0));
  const creditGiven = round2(bills.reduce((a, b) => a + (b.totalAmount - (b.payments || []).filter((p) => p.date === date).reduce((x, p) => x + p.amount, 0)), 0));
  return { date, billCount: bills.length, sales, received, expenses: expensesTotal, supplierPayments, creditGiven: Math.max(0, creditGiven) };
};

export interface ExpenseGroup {
  category: string;
  label: string;
  total: number;
  rows: Expense[];
}

export const groupExpenses = (expenses: Expense[]): ExpenseGroup[] => {
  const map = new Map<string, ExpenseGroup>();
  expenses.forEach((e) => {
    const label = EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label || e.category;
    const g = map.get(e.category) || { category: e.category, label, total: 0, rows: [] };
    g.total = round2(g.total + e.amount);
    g.rows.push(e);
    map.set(e.category, g);
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
};

export interface DailySheet {
  date: string;
  opening: AccountBalances;
  closing: AccountBalances;
  summary: DaySummary;
  bills: Invoice[];
  receipts: CashMovement[];
  supplierPayments: CashMovement[];
  expenses: ExpenseGroup[];
  /** Manual cash entries and cash<->bank transfers. */
  other: CashMovement[];
  /** Cheques received, given, deposited, cleared, bounced or cancelled on the day (cleared ones are also in bank in/out). */
  cheques: ChequeEvent[];
  cashIn: number;
  cashOut: number;
  bankIn: number;
  bankOut: number;
}

export interface DailySheetSources {
  invoices: Invoice[];
  ledger: LedgerEntry[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  customers: Customer[];
  suppliers: Supplier[];
  settings: AppSettings;
  cheques?: Cheque[];
}

/** The whole day on one page: opening money, every bill, every rupee in and out, closing money. */
export const buildDailySheet = (src: DailySheetSources, date: string): DailySheet => {
  const movements = collectCashMovements(src.ledger, src.expenses, src.cashEntries, src.customers, src.suppliers);
  const todays = movements.filter((m) => m.date === date);
  const opening = accountBalancesOn(movements, src.settings, shiftDate(date, -1));
  const closing = accountBalancesOn(movements, src.settings, date);
  const bills = billsOnly(src.invoices).filter((i) => i.issueDate === date).sort((a, b) => (a.invoiceNumber < b.invoiceNumber ? -1 : 1));
  const sum = (rows: CashMovement[]) => round2(rows.reduce((a, m) => a + m.amount, 0));
  // A cleared cheque's bank entry is listed under Cheques, not again as a loose deposit.
  const chequeEntryIds = new Set((src.cheques || []).map((c) => c.clearedEntryId).filter(Boolean) as string[]);
  return {
    date,
    opening,
    closing,
    summary: daySummary(src.invoices, movements, date, src.expenses),
    bills,
    receipts: todays.filter((m) => m.direction === 'in' && m.source === 'customer_payment'),
    supplierPayments: todays.filter((m) => m.source === 'supplier_payment'),
    expenses: groupExpenses(src.expenses.filter((e) => e.date === date)),
    // A cash<->bank transfer has two legs; show it once (the "out" leg carries the direction in its text).
    cheques: chequeEventsOn(src.cheques || [], date),
    // Refunds for returned goods are listed here too (money out that is not an expense).
    other: todays.filter((m) => (m.source === 'manual' && !chequeEntryIds.has(m.sourceId)) || m.source === 'customer_refund').filter((m, _, arr) => {
      const entry = src.cashEntries.find((c) => c.id === m.sourceId);
      if (!entry?.pairId) return true;
      return m.direction === 'out' || !arr.some((o) => o.direction === 'out' && src.cashEntries.find((c) => c.id === o.sourceId)?.pairId === entry.pairId);
    }),
    cashIn: sum(todays.filter((m) => m.direction === 'in' && isCashMethod(m.method))),
    cashOut: sum(todays.filter((m) => m.direction === 'out' && isCashMethod(m.method))),
    bankIn: sum(todays.filter((m) => m.direction === 'in' && !isCashMethod(m.method))),
    bankOut: sum(todays.filter((m) => m.direction === 'out' && !isCashMethod(m.method))),
  };
};

/**
 * Bills grouped for the list screen: a quick text search plus a period filter. The search takes the bill
 * no., memo no., customer name / phone / code (C-0004, via `customerCodeOf`), an item name, or an amount
 * (12345 or 12,345.50 finds a bill with that total or balance).
 */
export const filterBills = (invoices: Invoice[], query: string, period: 'today' | 'week' | 'month' | 'all', today: string, unpaidOnly = false, customerCodeOf?: (customerId: string) => string | undefined): Invoice[] => {
  const q = query.trim().toLowerCase();
  const from = period === 'today' ? today : period === 'week' ? shiftDate(today, -6) : period === 'month' ? today.slice(0, 7) + '-01' : '0000-00-00';
  const money = /^rs\.?\s*/.test(q) || /^[\d,]+(\.\d+)?$/.test(q) ? parseFloat(q.replace(/^rs\.?\s*/, '').replace(/,/g, '')) : NaN;
  const m = matcher(query);
  const matches = (i: Invoice) =>
    m([i.invoiceNumber, i.memoNo, i.customerName, i.customerCompany, customerCodeOf?.(i.customerId), ...i.items.map((it) => it.productName)], [i.customerPhone]) ||
    (Number.isFinite(money) && money > 0 && (Math.abs(i.totalAmount - money) < 0.005 || Math.abs(i.balanceDue - money) < 0.005));
  return billsOnly(invoices)
    .filter((i) => i.issueDate >= from)
    .filter((i) => !unpaidOnly || i.balanceDue > 0)
    .filter((i) => !q || matches(i))
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : b.createdAt.localeCompare(a.createdAt)));
};

export interface PaymentPart {
  method: string;
  amount: number;
  /** Bank account (chart code) of a bank / wallet part; empty = the main bank. */
  bankCode?: string;
  /** Narration typed on the payment line. */
  note?: string;
}

export interface ResolvedBillPayment {
  /** Cash / bank / wallet parts actually booked (cash over the total already taken off as change). */
  parts: PaymentPart[];
  /** Part paid by cheque (goes to the cheque register). */
  cheque: number;
  /** Everything booked against the bill now (parts + cheque), never more than the total. */
  paid: number;
  /** Cash handed back because more cash was given than was due. */
  change: number;
  error?: string;
}

/**
 * Split "Paid now" across methods. Only cash can be more than what is due (the rest is change);
 * bank, wallet and cheque parts must fit inside the bill total. A single part on its own (older
 * callers: paidNow + paymentMethod) is simply capped at the total, as before.
 */
export const resolveBillPayments = (total: number, parts: PaymentPart[], chequeAmount = 0): ResolvedBillPayment => {
  const clean = parts.map((p) => ({ method: p.method || 'Cash', amount: round2(Math.max(0, Number(p.amount) || 0)), ...(p.bankCode && !isCashMethod(p.method) ? { bankCode: p.bankCode } : {}), ...(p.note?.trim() ? { note: p.note.trim() } : {}) })).filter((p) => p.amount > 0);
  const cheque = round2(Math.max(0, Number(chequeAmount) || 0));
  const fail = (error: string): ResolvedBillPayment => ({ parts: clean, cheque, paid: 0, change: 0, error });
  if (cheque > total + 0.005) return fail('The cheque is more than the bill total.');
  const nonCash = round2(clean.filter((p) => !isCashMethod(p.method)).reduce((a, p) => a + p.amount, 0));
  const single = clean.length === 1 && cheque === 0;
  if (!single && round2(nonCash + cheque) > total + 0.005) return fail('Bank and cheque payments come to more than the bill total. Only cash can be more (the change is handed back).');
  let excess = round2(clean.reduce((a, p) => a + p.amount, 0) + cheque - total);
  let change = 0;
  const out = clean.map((p) => ({ ...p }));
  // Take the excess off cash parts first (that is change), last part first.
  for (let i = out.length - 1; i >= 0 && excess > 0.005; i--) {
    if (!isCashMethod(out[i].method) && !single) continue;
    const cut = Math.min(out[i].amount, excess);
    out[i].amount = round2(out[i].amount - cut);
    excess = round2(excess - cut);
    if (isCashMethod(out[i].method)) change = round2(change + cut);
  }
  const kept = out.filter((p) => p.amount > 0);
  return { parts: kept, cheque, paid: round2(kept.reduce((a, p) => a + p.amount, 0) + cheque), change };
};

/** "Cash + Bank Transfer + Cheque" (what the bill was paid with). */
export const paymentMethodLabel = (parts: PaymentPart[], cheque: number, fallback = 'Cash'): string => {
  const names = Array.from(new Set(parts.map((p) => p.method)));
  if (cheque > 0) names.push('Cheque');
  return names.length ? names.join(' + ') : fallback;
};

/** A customer's recent history for the New Bill side panel: last bills, last payment, last rate per item. */
export interface CustomerSnapshot {
  lastBills: Invoice[];
  lastPayment?: { date: string; amount: number; method?: string };
}

export const customerSnapshot = (customerId: string, invoices: Invoice[], ledger: LedgerEntry[]): CustomerSnapshot => {
  const lastBills = billsOnly(invoices)
    .filter((i) => i.customerId === customerId)
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : b.createdAt.localeCompare(a.createdAt) || b.invoiceNumber.localeCompare(a.invoiceNumber)))
    .slice(0, 3);
  const pay = ledger
    .filter((l) => l.entityType === 'customer' && l.entityId === customerId && (l.type === 'payment_received' || l.type === 'cheque_received') && l.credit > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  return { lastBills, lastPayment: pay ? { date: pay.date, amount: pay.credit, method: pay.method } : undefined };
};

/** The price per base unit this customer was last billed for an item (newest bill first), with the bill date. */
export const lastRateFor = (customerId: string, productId: string, invoices: Invoice[]): { rate: number; date: string; invoiceNumber: string } | null => {
  let best: { rate: number; date: string; invoiceNumber: string; created: string } | null = null;
  for (const inv of invoices) {
    if (inv.customerId !== customerId || inv.status === 'cancelled' || !inv.billKind) continue;
    const line = inv.items.find((it) => it.productId === productId);
    if (!line) continue;
    if (!best || inv.issueDate > best.date || (inv.issueDate === best.date && inv.createdAt + inv.invoiceNumber > best.created)) {
      best = { rate: linePrice(line), date: inv.issueDate, invoiceNumber: inv.invoiceNumber, created: inv.createdAt + inv.invoiceNumber };
    }
  }
  return best ? { rate: best.rate, date: best.date, invoiceNumber: best.invoiceNumber } : null;
};
