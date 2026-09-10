import { Invoice, Expense, CashEntry, LedgerEntry, Customer, Supplier, AppSettings, EXPENSE_CATEGORIES, isCashMethod } from '../types';
import { collectCashMovements, accountBalancesOn, CashMovement, AccountBalances } from './finance';
import { shiftDate } from './stockFlow';

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
export const daySummary = (invoices: Invoice[], movements: CashMovement[], date: string): DaySummary => {
  const bills = invoices.filter((i) => i.issueDate === date && i.status !== 'cancelled');
  const todays = movements.filter((m) => m.date === date);
  const sales = round2(bills.reduce((a, b) => a + b.totalAmount, 0));
  const received = round2(todays.filter((m) => m.direction === 'in' && m.source === 'customer_payment').reduce((a, m) => a + m.amount, 0));
  const expenses = round2(todays.filter((m) => m.source === 'expense').reduce((a, m) => a + m.amount, 0));
  const supplierPayments = round2(todays.filter((m) => m.source === 'supplier_payment').reduce((a, m) => a + m.amount, 0));
  const creditGiven = round2(bills.reduce((a, b) => a + (b.totalAmount - (b.payments || []).filter((p) => p.date === date).reduce((x, p) => x + p.amount, 0)), 0));
  return { date, billCount: bills.length, sales, received, expenses, supplierPayments, creditGiven: Math.max(0, creditGiven) };
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
}

/** The whole day on one page: opening money, every bill, every rupee in and out, closing money. */
export const buildDailySheet = (src: DailySheetSources, date: string): DailySheet => {
  const movements = collectCashMovements(src.ledger, src.expenses, src.cashEntries, src.customers, src.suppliers);
  const todays = movements.filter((m) => m.date === date);
  const opening = accountBalancesOn(movements, src.settings, shiftDate(date, -1));
  const closing = accountBalancesOn(movements, src.settings, date);
  const bills = src.invoices.filter((i) => i.issueDate === date && i.status !== 'cancelled').sort((a, b) => (a.invoiceNumber < b.invoiceNumber ? -1 : 1));
  const sum = (rows: CashMovement[]) => round2(rows.reduce((a, m) => a + m.amount, 0));
  return {
    date,
    opening,
    closing,
    summary: daySummary(src.invoices, movements, date),
    bills,
    receipts: todays.filter((m) => m.direction === 'in' && m.source === 'customer_payment'),
    supplierPayments: todays.filter((m) => m.source === 'supplier_payment'),
    expenses: groupExpenses(src.expenses.filter((e) => e.date === date)),
    other: todays.filter((m) => m.source === 'manual'),
    cashIn: sum(todays.filter((m) => m.direction === 'in' && isCashMethod(m.method))),
    cashOut: sum(todays.filter((m) => m.direction === 'out' && isCashMethod(m.method))),
    bankIn: sum(todays.filter((m) => m.direction === 'in' && !isCashMethod(m.method))),
    bankOut: sum(todays.filter((m) => m.direction === 'out' && !isCashMethod(m.method))),
  };
};

/** Bills grouped for the list screen: a quick text search plus a period filter. */
export const filterBills = (invoices: Invoice[], query: string, period: 'today' | 'week' | 'month' | 'all', today: string, unpaidOnly = false): Invoice[] => {
  const q = query.trim().toLowerCase();
  const from = period === 'today' ? today : period === 'week' ? shiftDate(today, -6) : period === 'month' ? today.slice(0, 7) + '-01' : '0000-00-00';
  return invoices
    .filter((i) => i.issueDate >= from)
    .filter((i) => !unpaidOnly || i.balanceDue > 0)
    .filter((i) => !q || i.invoiceNumber.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q) || (i.customerPhone || '').includes(q) || i.items.some((it) => it.productName.toLowerCase().includes(q)))
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : b.createdAt.localeCompare(a.createdAt)));
};
