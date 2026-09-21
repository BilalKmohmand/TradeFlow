/**
 * CSV layouts for the billing reports and lists (headers + rows). The screens pass these to the one
 * CSV helper, `downloadCsvFile` in utils/listTools.ts.
 */
import { Cheque, EXPENSE_CATEGORIES, Expense, isCashMethod } from '../types';
import type { DailySheet } from './billing';
import type { CashMovement } from './finance';
import type { TrialBalance, GeneralLedger, ProfitAndLoss, BalanceSheetGL } from './accounting';
import type { HistoryRow } from './stockReports';
import { chequeStatusLabel, CHEQUE_EVENT_LABEL } from './cheques';
import type { CsvCell } from './listTools';

export interface CsvTable {
  headers: string[];
  rows: CsvCell[][];
}

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Daily sheet: one row per bill, receipt, payment, expense, cheque and other entry, plus opening / closing money. */
export const dailySheetCsv = (sheet: DailySheet): CsvTable => {
  const rows: CsvCell[][] = [];
  rows.push(['Opening', '', 'Cash in hand', '', '', money(sheet.opening.cash), '']);
  rows.push(['Opening', '', 'Bank', '', '', money(sheet.opening.bank), '']);
  sheet.bills.forEach((b) => rows.push(['Bill', b.invoiceNumber, b.customerName, b.items.map((it) => `${it.productName} × ${it.qty ?? it.kg}`).join('; '), b.paymentMethod || '', money(b.totalAmount), b.balanceDue > 0 ? `${money(b.balanceDue)} on credit` : 'paid']));
  sheet.receipts.forEach((m) => rows.push(['Money in', m.reference || '', m.counterparty || '', m.description, m.method || 'Cash', money(m.amount), isCashMethod(m.method) ? 'cash' : 'bank']));
  sheet.supplierPayments.forEach((m) => rows.push(['Paid to supplier', m.reference || '', m.counterparty || '', m.description, m.method || 'Cash', -money(m.amount), isCashMethod(m.method) ? 'cash' : 'bank']));
  sheet.expenses.forEach((g) => g.rows.forEach((e) => rows.push([`Expense: ${g.label}`, '', '', e.description, e.paidVia || 'Cash', -money(e.amount), e.paidVia === 'Credit (unpaid)' ? 'unpaid' : isCashMethod(e.paidVia) ? 'cash' : 'bank'])));
  sheet.cheques.forEach((c) => rows.push([CHEQUE_EVENT_LABEL[c.kind] || 'Cheque', c.cheque.chequeNumber, c.cheque.partyName, `${c.cheque.bankName} dated ${c.cheque.chequeDate}`, 'Cheque', money(c.cheque.amount), chequeStatusLabel(c.cheque)]));
  sheet.other.forEach((m) => rows.push(['Other', m.reference || '', m.counterparty || '', m.description, m.method || 'Cash', m.direction === 'in' ? money(m.amount) : -money(m.amount), isCashMethod(m.method) ? 'cash' : 'bank']));
  rows.push(['Closing', '', 'Cash in hand', '', '', money(sheet.closing.cash), '']);
  rows.push(['Closing', '', 'Bank', '', '', money(sheet.closing.bank), '']);
  return { headers: ['Section', 'Ref', 'Party', 'Details', 'Method', 'Amount (Rs.)', 'Note'], rows };
};

/** Cash book: every movement of money in or out, oldest first. */
export const cashBookCsv = (moves: CashMovement[]): CsvTable => ({
  headers: ['Date', 'Direction', 'Party', 'Description', 'Method', 'Cash / Bank', 'In (Rs.)', 'Out (Rs.)', 'Ref'],
  rows: [...moves]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((m) => [m.date, m.direction === 'in' ? 'In' : 'Out', m.counterparty || '', m.description, m.method || 'Cash', isCashMethod(m.method) ? 'Cash' : 'Bank', m.direction === 'in' ? money(m.amount) : '', m.direction === 'out' ? money(m.amount) : '', m.reference || '']),
});

export const expensesCsv = (expenses: Expense[]): CsvTable => ({
  headers: ['Date', 'Sheet', 'Description', 'Paid from', 'Amount (Rs.)', 'Recorded by'],
  rows: [...expenses].sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => [e.date, EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label || e.category, e.description, e.paidVia || 'Cash', money(e.amount), e.createdBy || '']),
});

export const itemHistoryCsv = (rows: HistoryRow[], opening: number, unit: string): CsvTable => ({
  headers: ['Date', 'What', 'Party', 'Ref', 'Godown', `In/Out (${unit})`, `Stock after (${unit})`, 'Note'],
  rows: [['', 'Opening stock', '', '', '', '', opening, ''], ...rows.map((r) => [r.date, r.label, r.party || '', r.ref || '', r.godown || '', r.change, r.balance, r.note || ''])],
});

export const trialBalanceCsv = (tb: TrialBalance): CsvTable => ({
  headers: ['Code', 'Account', 'Debit (Rs.)', 'Credit (Rs.)'],
  rows: [...tb.rows.map((r) => [r.account.code, r.account.name, r.debit ? money(r.debit) : '', r.credit ? money(r.credit) : '']), ['', 'Total', money(tb.totalDebit), money(tb.totalCredit)]],
});

export const generalLedgerCsv = (gl: GeneralLedger, accountName: string): CsvTable => ({
  headers: ['Date', 'Ref', 'Narration', 'Debit (Rs.)', 'Credit (Rs.)', 'Balance (Rs., + = Dr)'],
  rows: [
    [gl.from, '', `Opening balance — ${gl.code} ${accountName}`, '', '', money(gl.opening)],
    ...gl.lines.map((l) => [l.date, l.ref, l.memo, l.debit ? money(l.debit) : '', l.credit ? money(l.credit) : '', money(l.balance)]),
    [gl.to, '', 'Closing balance', money(gl.totalDebit), money(gl.totalCredit), money(gl.closing)],
  ],
});

export const profitLossCsv = (p: ProfitAndLoss): CsvTable => {
  const rows: CsvCell[][] = [];
  const section = (title: string, list: ProfitAndLoss['income'], total: number) => {
    list.forEach((r) => rows.push([title, r.account.code, r.account.name, money(r.amount)]));
    rows.push([title, '', `Total ${title.toLowerCase()}`, money(total)]);
  };
  section('Income', p.income, p.totalIncome);
  section('Cost of sales', p.costOfSales, p.totalCostOfSales);
  rows.push(['', '', 'Gross profit', money(p.grossProfit)]);
  section('Expenses', p.expenses, p.totalExpenses);
  rows.push(['', '', p.netProfit >= 0 ? 'Net profit' : 'Net loss', money(p.netProfit)]);
  return { headers: ['Section', 'Code', 'Account', 'Amount (Rs.)'], rows };
};

export const balanceSheetCsv = (b: BalanceSheetGL): CsvTable => {
  const rows: CsvCell[][] = [];
  b.assets.forEach((r) => rows.push(['Assets', r.account.code, r.account.name, money(r.amount)]));
  rows.push(['Assets', '', 'Total assets', money(b.totalAssets)]);
  b.liabilities.forEach((r) => rows.push(['Liabilities', r.account.code, r.account.name, money(r.amount)]));
  rows.push(['Liabilities', '', 'Total liabilities', money(b.totalLiabilities)]);
  b.equity.forEach((r) => rows.push(['Equity', r.account.code, r.account.name, money(r.amount)]));
  rows.push(['Equity', '', 'Profit to date (not yet closed)', money(b.profitToDate)]);
  rows.push(['Equity', '', 'Total equity', money(b.totalEquity)]);
  return { headers: ['Section', 'Code', 'Account', 'Amount (Rs.)'], rows };
};

export const chequesCsv = (cheques: Cheque[]): CsvTable => ({
  headers: ['Direction', 'Cheque no.', 'Bank', 'Party', 'Amount (Rs.)', 'Date on cheque', 'Received / given', 'Status', 'Deposited', 'Cleared', 'Returned', 'Reason'],
  rows: cheques.map((c) => [c.direction === 'received' ? 'Received' : 'Given', c.chequeNumber, c.bankName, c.partyName, money(c.amount), c.chequeDate, c.entryDate, chequeStatusLabel(c), c.depositedDate || '', c.clearedDate || '', c.returnedDate || '', c.returnReason || '']),
});
