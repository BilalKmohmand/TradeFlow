/**
 * Management reports built from the journal: budget vs actual, profit & loss by cost centre,
 * the cash flow statement (direct method) and key ratios. Year-end closing entries are always left
 * out (they would empty the year's income and expenses).
 */
import { Budget, CostCentre } from '../types';
import { ACC, Account, JournalEntry, accountTotals, profitAndLoss, withoutClosing } from './accounting';
import { monthEnd, monthStart, round2 } from './financeBooks';

const EPS = 0.005;

// ---------------------------------------------------------------------------
// Budget vs actual
// ---------------------------------------------------------------------------
export interface BudgetRow {
  account: Account;
  budget: number;
  actual: number;
  /** Good (+) or bad (−): income above budget / expense below budget is good. */
  variance: number;
  /** actual ÷ budget × 100 (null when no budget). */
  pctUsed: number | null;
}

export interface BudgetReport {
  months: string[];
  income: BudgetRow[];
  expenses: BudgetRow[];
  totalIncome: { budget: number; actual: number };
  totalExpenses: { budget: number; actual: number };
}

/** Budget vs actual for the given months (income: credits; expenses: debits). */
export const budgetVsActual = (journal: JournalEntry[], budgets: Budget[], months: string[], accounts: Account[]): BudgetReport => {
  const sorted = [...months].sort();
  const from = monthStart(sorted[0]);
  const to = monthEnd(sorted[sorted.length - 1]);
  const totals = accountTotals(withoutClosing(journal), { from, to });
  const inMonths = new Set(sorted);
  const budgetBy = new Map<string, number>();
  budgets.filter((b) => inMonths.has(b.month)).forEach((b) => budgetBy.set(b.accountCode, round2((budgetBy.get(b.accountCode) || 0) + (Number(b.amount) || 0))));
  const income: BudgetRow[] = [];
  const expenses: BudgetRow[] = [];
  accounts.forEach((account) => {
    if (account.type !== 'income' && account.type !== 'expense') return;
    const net = totals.get(account.code)?.net ?? 0;
    const actual = round2(account.type === 'income' ? -net : net);
    const budget = budgetBy.get(account.code) || 0;
    if (Math.abs(actual) < EPS && budget === 0) return;
    const variance = round2(account.type === 'income' ? actual - budget : budget - actual);
    const row = { account, budget, actual, variance, pctUsed: budget > 0 ? round2((actual / budget) * 100) : null };
    (account.type === 'income' ? income : expenses).push(row);
  });
  const sum = (rows: BudgetRow[]) => ({ budget: round2(rows.reduce((a, r) => a + r.budget, 0)), actual: round2(rows.reduce((a, r) => a + r.actual, 0)) });
  return { months: sorted, income, expenses, totalIncome: sum(income), totalExpenses: sum(expenses) };
};

// ---------------------------------------------------------------------------
// Profit & loss by cost centre
// ---------------------------------------------------------------------------
export const UNTAGGED = '__none__';

export interface CentrePnl {
  id: string;
  name: string;
  income: number;
  costOfSales: number;
  expenses: number;
  profit: number;
  /** Per account, signed so income and expenses are both positive. */
  byAccount: Map<string, number>;
}

/**
 * P&L split by cost centre. A line's centre is its own tag (manual journals), else its entry's tag
 * (the bill or expense it came from). Untagged income and expenses make an "Not tagged" column.
 */
export const profitByCostCentre = (journal: JournalEntry[], from: string, to: string, accounts: Account[], centres: CostCentre[]): CentrePnl[] => {
  const type = new Map(accounts.map((a) => [a.code, a.type]));
  const typeOf = (code: string) => type.get(code) || (code.startsWith('4') ? 'income' : code.startsWith('5') || code.startsWith('6') ? 'expense' : 'other');
  const map = new Map<string, CentrePnl>();
  const get = (id: string) => {
    let c = map.get(id);
    if (!c) {
      const name = id === UNTAGGED ? 'Not tagged' : centres.find((x) => x.id === id)?.name || 'Removed centre';
      c = { id, name, income: 0, costOfSales: 0, expenses: 0, profit: 0, byAccount: new Map() };
      map.set(id, c);
    }
    return c;
  };
  withoutClosing(journal).forEach((e) => {
    if (e.date < from || e.date > to) return;
    e.lines.forEach((l) => {
      const kind = typeOf(l.accountCode);
      if (kind !== 'income' && kind !== 'expense') return;
      const c = get(l.costCentreId || e.costCentreId || UNTAGGED);
      const net = (Number(l.debit) || 0) - (Number(l.credit) || 0);
      const amt = kind === 'income' ? -net : net;
      c.byAccount.set(l.accountCode, round2((c.byAccount.get(l.accountCode) || 0) + amt));
      if (kind === 'income') c.income = round2(c.income + amt);
      else if (l.accountCode.startsWith('5')) c.costOfSales = round2(c.costOfSales + amt);
      else c.expenses = round2(c.expenses + amt);
    });
  });
  const out = Array.from(map.values()).map((c) => ({ ...c, profit: round2(c.income - c.costOfSales - c.expenses) }));
  // Centres in their own order, "Not tagged" last.
  const order = new Map(centres.map((c, i) => [c.id, i]));
  return out.sort((a, b) => (a.id === UNTAGGED ? 1 : b.id === UNTAGGED ? -1 : (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999)));
};

// ---------------------------------------------------------------------------
// Cash flow statement (direct method)
// ---------------------------------------------------------------------------
export type CashFlowCategory = 'customers' | 'other_income' | 'suppliers' | 'expenses' | 'staff' | 'tax' | 'other' | 'assets' | 'owner' | 'loans' | 'opening';

export const CASH_FLOW_LINES: { id: CashFlowCategory; section: 'operating' | 'investing' | 'financing' | 'opening'; inLabel: string; outLabel: string }[] = [
  { id: 'customers', section: 'operating', inLabel: 'Cash received from customers', outLabel: 'Refunds paid to customers' },
  { id: 'other_income', section: 'operating', inLabel: 'Other income received', outLabel: 'Other income paid back' },
  { id: 'suppliers', section: 'operating', inLabel: 'Refunds from suppliers', outLabel: 'Cash paid to suppliers' },
  { id: 'expenses', section: 'operating', inLabel: 'Expense refunds', outLabel: 'Cash paid for expenses' },
  { id: 'staff', section: 'operating', inLabel: 'Staff advances repaid', outLabel: 'Salaries and staff advances paid' },
  { id: 'tax', section: 'operating', inLabel: 'Tax refunds', outLabel: 'Sales tax paid' },
  { id: 'other', section: 'operating', inLabel: 'Other money in (not classified)', outLabel: 'Other money out (not classified)' },
  { id: 'assets', section: 'investing', inLabel: 'Fixed assets sold', outLabel: 'Fixed assets bought' },
  { id: 'owner', section: 'financing', inLabel: 'Capital put in by the owner', outLabel: 'Taken out by the owner (drawings)' },
  { id: 'loans', section: 'financing', inLabel: 'Loans taken', outLabel: 'Loans repaid' },
  { id: 'opening', section: 'opening', inLabel: 'Opening cash & bank brought in', outLabel: 'Opening balances adjusted' },
];

const categoryOf = (code: string): CashFlowCategory => {
  if (code === ACC.RECEIVABLE || code === ACC.CHEQUES_IN_HAND) return 'customers';
  if (code === ACC.PAYABLE || code === ACC.CHEQUES_ISSUED || code === ACC.INVENTORY) return 'suppliers';
  if (code === ACC.STAFF_ADVANCES || code === '6090' || code === '6010') return 'staff';
  if (code === ACC.FIXED_ASSETS || code === ACC.ASSET_CREDITORS || code === ACC.ACCUM_DEPRECIATION) return 'assets';
  if (code === ACC.CAPITAL || code === ACC.DRAWINGS || code === ACC.RETAINED_EARNINGS) return 'owner';
  if (code === ACC.LOANS) return 'loans';
  if (code === ACC.OPENING_EQUITY) return 'opening';
  if (code === ACC.SALES_TAX) return 'tax';
  if (code.startsWith('4')) return code === ACC.SALES || code === ACC.SALES_DISCOUNTS || code === ACC.SALES_RETURNS || code === ACC.FREIGHT_INCOME ? 'customers' : 'other_income';
  if (code.startsWith('5') || code.startsWith('6') || code === ACC.UNPAID_EXPENSES) return 'expenses';
  return 'other';
};

export interface CashFlowStatement {
  from: string;
  to: string;
  opening: number;
  closing: number;
  /** Signed: + money in, − money out. */
  flows: Record<CashFlowCategory, { in: number; out: number }>;
  operating: number;
  investing: number;
  financing: number;
  openingBroughtIn: number;
  netChange: number;
  /** closing − opening − netChange (should be 0). */
  difference: number;
}

/** Where the shop's cash and bank money came from and went, between two dates (every bank account counts as money). */
export const cashFlowStatement = (journal: JournalEntry[], from: string, to: string, accounts: Account[] = []): CashFlowStatement => {
  const MONEY = new Set<string>([ACC.CASH, ACC.BANK, ...accounts.filter((a) => a.isBank).map((a) => a.code)]);
  const flows = Object.fromEntries(CASH_FLOW_LINES.map((l) => [l.id, { in: 0, out: 0 }])) as CashFlowStatement['flows'];
  let opening = 0;
  let closing = 0;
  journal.forEach((e) => {
    const moneyNet = e.lines.filter((l) => MONEY.has(l.accountCode)).reduce((a, l) => a + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
    if (e.date < from) opening += moneyNet;
    if (e.date <= to) closing += moneyNet;
    if (e.date < from || e.date > to || Math.abs(moneyNet) < EPS) return;
    // Share the money movement across the other side's accounts (cash <-> bank transfers net to nil).
    const others = e.lines.filter((l) => !MONEY.has(l.accountCode)).map((l) => ({ code: l.accountCode, signed: (Number(l.credit) || 0) - (Number(l.debit) || 0) }));
    const base = others.reduce((a, o) => a + o.signed, 0);
    if (Math.abs(base) < EPS) {
      const f = flows.other;
      if (moneyNet > 0) f.in += moneyNet;
      else f.out += -moneyNet;
      return;
    }
    others.forEach((o) => {
      const part = (moneyNet * o.signed) / base;
      const f = flows[categoryOf(o.code)];
      if (part > 0) f.in += part;
      else f.out += -part;
    });
  });
  (Object.keys(flows) as CashFlowCategory[]).forEach((k) => { flows[k].in = round2(flows[k].in); flows[k].out = round2(flows[k].out); });
  const net = (section: string) => round2(CASH_FLOW_LINES.filter((l) => l.section === section).reduce((a, l) => a + flows[l.id].in - flows[l.id].out, 0));
  const operating = net('operating');
  const investing = net('investing');
  const financing = net('financing');
  const openingBroughtIn = net('opening');
  const netChange = round2(operating + investing + financing + openingBroughtIn);
  opening = round2(opening);
  closing = round2(closing);
  return { from, to, opening, closing, flows, operating, investing, financing, openingBroughtIn, netChange, difference: round2(closing - opening - netChange) };
};

// ---------------------------------------------------------------------------
// Key ratios
// ---------------------------------------------------------------------------
export interface Ratio {
  id: string;
  label: string;
  /** null when it cannot be worked out (e.g. no sales). */
  value: number | null;
  unit: '%' | 'x' | 'days';
  explain: string;
  /** A plain-English reading of this shop's number. */
  reading: string;
}

const days = (from: string, to: string) => Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1);

/** Gross margin, net margin, current ratio, debtor / creditor / stock days for a period (balances at its end). */
export const keyRatios = (journal: JournalEntry[], from: string, to: string, accounts: Account[]): Ratio[] => {
  const pnl = profitAndLoss(journal, from, to, accounts);
  const bal = accountTotals(journal, { to });
  const net = (code: string) => bal.get(code)?.net ?? 0;
  const sales = pnl.totalIncome;
  const cogs = round2(accountTotals(withoutClosing(journal), { from, to }).get(ACC.COGS)?.net ?? 0);
  const n = days(from, to);
  const type = new Map(accounts.map((a) => [a.code, a.type]));
  let currentAssets = 0;
  let currentLiabilities = 0;
  bal.forEach((t, code) => {
    const kind = type.get(code) || (code.startsWith('1') ? 'asset' : code.startsWith('2') ? 'liability' : 'other');
    // Fixed assets (15xx and above) are not current; long-term loans (2200) are not due this year.
    if (kind === 'asset' && Number(code) < 1500) currentAssets += t.net;
    if (kind === 'liability' && code !== ACC.LOANS) currentLiabilities -= t.net;
  });
  const receivable = net(ACC.RECEIVABLE) + net(ACC.CHEQUES_IN_HAND);
  const payable = -(net(ACC.PAYABLE) + net(ACC.CHEQUES_ISSUED));
  const stock = net(ACC.INVENTORY);
  const pct = (a: number, b: number) => (Math.abs(b) < EPS ? null : round2((a / b) * 100));
  const ratio = (a: number, b: number) => (Math.abs(b) < EPS ? null : round2(a / b));
  const dayCount = (a: number, b: number) => (Math.abs(b) < EPS ? null : Math.round((a / b) * n));
  const gm = pct(pnl.grossProfit, sales);
  const nm = pct(pnl.netProfit, sales);
  const cr = ratio(currentAssets, currentLiabilities);
  const dd = dayCount(receivable, sales);
  const cd = dayCount(payable, cogs);
  const sd = dayCount(stock, cogs);
  const f = (v: number | null, u: string) => (v == null ? '—' : `${v}${u}`);
  return [
    { id: 'gross_margin', label: 'Gross margin', value: gm, unit: '%', explain: 'Out of every Rs. 100 of sales, how much is left after paying for the goods sold.', reading: gm == null ? 'No sales in this period.' : `On every Rs. 100 sold you kept Rs. ${gm} after the cost of the goods.` },
    { id: 'net_margin', label: 'Net margin', value: nm, unit: '%', explain: 'Out of every Rs. 100 of sales, how much is real profit after all expenses (rent, salaries, fuel…).', reading: nm == null ? 'No sales in this period.' : nm >= 0 ? `Rs. ${nm} of every Rs. 100 sold was profit after all expenses.` : `You lost Rs. ${Math.abs(nm)} on every Rs. 100 sold.` },
    { id: 'current_ratio', label: 'Current ratio', value: cr, unit: 'x', explain: 'Cash, bank, stock and money customers owe, compared with what you owe in the short run. Above 1.5 is comfortable; below 1 means bills may be hard to pay.', reading: cr == null ? 'You owe nothing in the short run.' : `You have Rs. ${cr} of short-term assets for every Rs. 1 you owe. ${cr >= 1.5 ? 'Comfortable.' : cr >= 1 ? 'Tight but OK.' : 'Watch out: you owe more than you can quickly pay.'}` },
    { id: 'debtor_days', label: 'Debtor days', value: dd, unit: 'days', explain: 'How many days of sales are still unpaid by customers. Lower is better: money comes in faster.', reading: dd == null ? 'No sales in this period.' : `Customers take about ${f(dd, '')} days to pay you.` },
    { id: 'creditor_days', label: 'Creditor days', value: cd, unit: 'days', explain: 'How many days of purchases (at cost of goods sold) you still owe suppliers. Higher means suppliers are giving you more time.', reading: cd == null ? 'No goods sold in this period.' : `You take about ${f(cd, '')} days to pay suppliers.` },
    { id: 'stock_days', label: 'Stock days', value: sd, unit: 'days', explain: 'How many days your current stock would last at this rate of selling. Too high means money stuck in stock.', reading: sd == null ? 'No goods sold in this period.' : `Your stock would last about ${f(sd, '')} days of sales.` },
  ];
};
