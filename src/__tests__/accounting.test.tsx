import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { useAccounting } from '../hooks/useAccounting';
import { collectCashMovements, accountBalancesOn } from '../utils/finance';
import {
  ACC,
  DEFAULT_ACCOUNTS,
  EXPENSE_ACCOUNT,
  JournalEntry,
  accountBalance,
  balanceSheet,
  buildJournal,
  combineJournal,
  entryTotals,
  generalLedger,
  isBalanced,
  mergeAccounts,
  profitAndLoss,
  trialBalance,
  validateEntry,
  JournalSources,
} from '../utils/accounting';
import { todayISO } from '../utils/stockFlow';
import { AppSettings, DEFAULT_SETTINGS, EXPENSE_CATEGORIES, LedgerEntry } from '../types';

const settings: AppSettings = { ...DEFAULT_SETTINGS, cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0 };

/** A small but realistic month: bills (cash, credit, with tax + discount), payments, purchase, expenses, transfer, returns. */
const dataset = (): JournalSources => {
  const ledger: LedgerEntry[] = [
    // Bill 1: 1000 cash sale, paid in full by cash
    { id: 'l1', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV-1', sourceId: 'i1', date: '2026-02-01', description: 'Bill INV-1', debit: 1000, credit: 0, balanceAfter: 1000 },
    { id: 'l2', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'INV-1', sourceId: 'i1', method: 'Cash', date: '2026-02-01', description: 'Payment received: Cash - Bill INV-1', debit: 0, credit: 1000, balanceAfter: 0 },
    // Bill 2: subtotal 2000, discount 100, tax 17% on 1900 = 323 -> 2223, on credit; later 1000 by bank
    { id: 'l3', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV-2', sourceId: 'i2', date: '2026-02-02', description: 'Bill INV-2', debit: 2223, credit: 0, balanceAfter: 2223 },
    { id: 'l4', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'INV-2', sourceId: 'i2', method: 'Bank Transfer', date: '2026-02-05', description: 'Payment received: Bank Transfer - Bill INV-2', debit: 0, credit: 1000, balanceAfter: 1223 },
    // Account payment with method only in the description (older rows)
    { id: 'l5', entityType: 'customer', entityId: 'c2', type: 'payment_received', referenceId: 'PAY-1', date: '2026-02-06', description: 'Payment received: Easypaisa / JazzCash - ref 55', debit: 0, credit: 500, balanceAfter: 1500 },
    // Sales return 200
    { id: 'l6', entityType: 'customer', entityId: 'c1', type: 'credit_note', referenceId: 'CN-1', date: '2026-02-07', description: 'Credit note', debit: 0, credit: 200, balanceAfter: 1023 },
    // Supplier: purchase 5000 on credit, pay 3000 by cheque, return 400
    { id: 'l7', entityType: 'supplier', entityId: 's1', type: 'purchase_received', referenceId: 'GRN-1', date: '2026-02-03', description: 'Stock received', debit: 5000, credit: 0, balanceAfter: 5000, kg: 100 },
    { id: 'l8', entityType: 'supplier', entityId: 's1', type: 'payment_made', referenceId: 'SUP-PAY-1', date: '2026-02-04', description: 'Supplier payment made: Cheque - 123', debit: 0, credit: 3000, balanceAfter: 2000 },
    { id: 'l9', entityType: 'supplier', entityId: 's1', type: 'debit_note', referenceId: 'DN-1', date: '2026-02-08', description: 'Debit note', debit: 0, credit: 400, balanceAfter: 1600 },
    // Trading dispatch: goods 3000 + freight 200 + tax 100, paid on the spot in cash
    { id: 'l10', entityType: 'customer', entityId: 'c2', type: 'dispatch_billed', referenceId: 'DSP-1', date: '2026-02-09', description: 'Dispatch', debit: 3300, credit: 0, balanceAfter: 4800 },
    { id: 'l11', entityType: 'customer', entityId: 'c2', type: 'payment_received', referenceId: 'PAY-DSP-1', date: '2026-02-09', description: 'Paid on dispatch: Cash', debit: 0, credit: 3300, balanceAfter: 1500 },
    // Something from before the books started (already inside the opening cash figure)
    { id: 'l12', entityType: 'customer', entityId: 'c2', type: 'payment_received', referenceId: 'PAY-0', method: 'Cash', date: '2025-12-20', description: 'Old payment', debit: 0, credit: 700, balanceAfter: 2000 },
  ];
  return {
    settings,
    customers: [
      // c1: 2223 - 1000 - 200 = 1023 (ledger explains everything)
      { id: 'c1', name: 'Zaman', company: 'Zaman', phone: '', email: '', address: '', totalDue: 1023, creditLimit: 0, createdAt: '2026-01-01' },
      // c2: opened with 2700 due (no ledger row), -700 -500 +3300 -3300 => 1500
      { id: 'c2', name: 'Karim', company: 'Karim', phone: '', email: '', address: '', totalDue: 1500, creditLimit: 0, createdAt: '2025-12-01' },
    ],
    suppliers: [
      // s1: 5000 - 3000 - 400 = 1600, plus 45000 old balance typed in
      { id: 's1', name: 'Ahmed', company: 'Dalda', phone: '', email: '', materialCategory: '', address: '', totalOwed: 46600, createdAt: '2026-01-01' },
    ],
    ledger,
    invoices: [
      { id: 'i1', invoiceNumber: 'INV-1', customerId: 'c1', customerName: 'Zaman', issueDate: '2026-02-01', dueDate: '2026-02-01', status: 'paid', paymentStatus: 'paid', items: [{ id: 'a', productId: 'p1', productName: 'Can', kg: 10, qty: 10, ratePerKg: 100, unitPrice: 100, costPricePerKg: 60, amount: 1000 }], subtotal: 1000, taxRatePct: 0, taxAmount: 0, discount: 0, totalAmount: 1000, paidAmount: 1000, balanceDue: 0, payments: [{ id: 'x', date: '2026-02-01', amount: 1000, method: 'cash' }], createdAt: '2026-02-01' },
      { id: 'i2', invoiceNumber: 'INV-2', customerId: 'c1', customerName: 'Zaman', issueDate: '2026-02-02', dueDate: '2026-02-02', status: 'partial', paymentStatus: 'partial', items: [{ id: 'b', productId: 'p1', productName: 'Can', kg: 20, qty: 20, ratePerKg: 100, unitPrice: 100, costPricePerKg: 60, amount: 2000 }], subtotal: 2000, taxRatePct: 17, taxAmount: 323, discount: 100, totalAmount: 2223, paidAmount: 1000, balanceDue: 1223, createdAt: '2026-02-02' },
      // Trading invoice generated from bookings: no ledger row, must NOT be posted
      { id: 'i3', invoiceNumber: 'INV-2026-9999', customerId: 'c2', customerName: 'Karim', issueDate: '2026-02-09', dueDate: '2026-02-20', status: 'issued', paymentStatus: 'unpaid', items: [{ id: 'c', productId: 'p2', productName: 'Coal', kg: 100, ratePerKg: 30, amount: 3000 }], subtotal: 3000, taxRatePct: 0, taxAmount: 0, totalAmount: 3000, paidAmount: 0, balanceDue: 3000, createdAt: '2026-02-09' },
    ],
    dispatches: [{ id: 'd1', dispatchNumber: 'DSP-1', bookingId: 'b1', customerId: 'c2', productId: 'p2', kg: 100, amount: 3000, freightCharge: 200, taxAmount: 100, totalBilled: 3300, truckNumber: 'X', date: '2026-02-09', whatsappSent: false, paymentReceivedImmediately: true }],
    purchases: [{ id: 'pu1', receiptNumber: 'GRN-1', supplierId: 's1', productId: 'p2', kg: 100, pricePerKg: 50, amount: 5000, date: '2026-02-03', createdAt: '2026-02-03' }],
    expenses: [
      { id: 'e1', date: '2026-02-10', category: 'fuel', amount: 800, description: 'diesel', paidVia: 'Cash', createdAt: '2026-02-10' },
      { id: 'e2', date: '2026-02-11', category: 'rent', amount: 5000, description: 'shop rent', paidVia: 'Bank Transfer', createdAt: '2026-02-11' },
      { id: 'e3', date: '2026-02-12', category: 'utilities', amount: 1200, description: 'electricity', paidVia: 'Credit (unpaid)', createdAt: '2026-02-12' },
      { id: 'e4', date: '2026-02-13', category: 'drawings', amount: 2000, description: 'home', paidVia: 'Cash', createdAt: '2026-02-13' },
      { id: 'e5', date: '2026-02-14', category: 'bank_charges', amount: 50, description: 'SMS fee', paidVia: 'Bank Transfer', createdAt: '2026-02-14' },
    ],
    cashEntries: [
      { id: 'x1', date: '2026-02-15', direction: 'out', amount: 4000, description: 'Deposited cash to bank', method: 'Cash', createdAt: '2026-02-15', pairId: 'p1' },
      { id: 'x2', date: '2026-02-15', direction: 'in', amount: 4000, description: 'Deposited cash to bank', method: 'Bank Transfer', createdAt: '2026-02-15', pairId: 'p1' },
      { id: 'x3', date: '2026-02-16', direction: 'in', amount: 20000, description: 'Capital introduced by owner', method: 'Bank Transfer', createdAt: '2026-02-16' },
      { id: 'x4', date: '2026-02-17', direction: 'out', amount: 300, description: 'Tea for guests', method: 'Cash', createdAt: '2026-02-17' },
    ],
    products: [
      { id: 'p1', name: 'Can', category: 'x', unit: 'can', unitPricePerKg: 100, costPricePerKg: 60, stockKg: 70, minThresholdKg: 0 },
      { id: 'p2', name: 'Coal', category: 'x', unitPricePerKg: 30, stockKg: 0, minThresholdKg: 0 },
    ],
    returns: [{ id: 'r1', returnNumber: 'CN-1', kind: 'sales', customerId: 'c1', productId: 'p1', kg: 2, pricePerKg: 100, amount: 200, reason: 'damaged', date: '2026-02-07', createdAt: '2026-02-07' }],
    adjustments: [{ id: 'a1', productId: 'p1', deltaKg: -2, reason: 'damage', date: '2026-02-18', createdAt: '2026-02-18' }],
  };
};

const lineOf = (e: JournalEntry, code: string) => e.lines.find((l) => l.accountCode === code);

describe('chart of accounts', () => {
  it('has unique codes, maps every expense category, and drawings go to equity', () => {
    const codes = DEFAULT_ACCOUNTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    EXPENSE_CATEGORIES.forEach((c) => expect(codes).toContain(EXPENSE_ACCOUNT[c.id]));
    expect(DEFAULT_ACCOUNTS.find((a) => a.code === EXPENSE_ACCOUNT.drawings)!.type).toBe('equity');
    expect(DEFAULT_ACCOUNTS.every((a) => a.system)).toBe(true);
  });
  it('merges custom accounts without letting them replace system ones', () => {
    const merged = mergeAccounts([{ code: '1000', name: 'Hijack', type: 'expense' }, { code: '1020', name: 'Meezan Bank', type: 'asset' }]);
    expect(merged.find((a) => a.code === '1000')!.name).toBe('Cash in hand');
    expect(merged.find((a) => a.code === '1020')!.system).toBe(false);
  });
});

describe('validateEntry', () => {
  it('accepts a balanced entry and rejects the rest', () => {
    const ok = validateEntry({ date: '2026-02-01', lines: [{ accountCode: '6070', debit: 100, credit: 0 }, { accountCode: '1000', debit: 0, credit: 100 }] });
    expect(ok.ok).toBe(true);
    expect(validateEntry({ date: '2026-02-01', lines: [{ accountCode: '6070', debit: 100, credit: 0 }, { accountCode: '1000', debit: 0, credit: 90 }] }).ok).toBe(false);
    expect(validateEntry({ date: '2026-02-01', lines: [{ accountCode: '6070', debit: 100, credit: 0 }] }).ok).toBe(false);
    expect(validateEntry({ date: '2026-02-01', lines: [{ accountCode: '6070', debit: -100, credit: 0 }, { accountCode: '1000', debit: 0, credit: -100 }] }).ok).toBe(false);
    expect(validateEntry({ date: '2026-02-01', lines: [{ accountCode: '9999', debit: 100, credit: 0 }, { accountCode: '1000', debit: 0, credit: 100 }] }).errors.join()).toMatch(/unknown account/);
    expect(validateEntry({ date: '', lines: [{ accountCode: '6070', debit: 100, credit: 0 }, { accountCode: '1000', debit: 0, credit: 100 }] }).ok).toBe(false);
  });
});

describe('buildJournal on a realistic dataset', () => {
  const src = dataset();
  const journal = buildJournal(src);
  const asOf = '2026-12-31';

  it('every automatic entry is balanced, has two or more lines and no negative amounts', () => {
    expect(journal.length).toBeGreaterThan(15);
    journal.forEach((e) => {
      expect(e.source).toBe('auto');
      expect(isBalanced(e.lines), e.id).toBe(true);
      expect(validateEntry(e).ok, `${e.id}: ${validateEntry(e).errors.join('; ')}`).toBe(true);
    });
  });

  it('entry ids are unique', () => {
    expect(new Set(journal.map((e) => e.id)).size).toBe(journal.length);
  });

  it('total debits equal total credits and the trial balance balances', () => {
    const all = journal.flatMap((e) => e.lines);
    expect(entryTotals(all).debit).toBe(entryTotals(all).credit);
    const tb = trialBalance(journal, DEFAULT_ACCOUNTS, asOf);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('a bill posts receivable, sales, discount, tax and cost of goods; its payment is posted once, from the ledger', () => {
    const bill = journal.find((e) => e.id === 'auto-led-l3')!;
    expect(bill.billId).toBe('i2');
    expect(lineOf(bill, ACC.RECEIVABLE)!.debit).toBe(2223);
    expect(lineOf(bill, ACC.SALES)!.credit).toBe(2000);
    expect(lineOf(bill, ACC.SALES_DISCOUNTS)!.debit).toBe(100);
    expect(lineOf(bill, ACC.SALES_TAX)!.credit).toBe(323);
    expect(lineOf(bill, ACC.COGS)!.debit).toBe(1200);
    expect(lineOf(bill, ACC.INVENTORY)!.credit).toBe(1200);
    // invoice.payments exists on INV-1 but only the ledger row is posted
    const inv1Receipts = journal.filter((e) => e.billId === 'i1' && lineOf(e, ACC.CASH)?.debit);
    expect(inv1Receipts).toHaveLength(1);
    // trading invoice from bookings is not posted (its dispatches carry the revenue)
    expect(journal.some((e) => e.ref === 'INV-2026-9999')).toBe(false);
  });

  it('dispatch billing splits goods, freight and tax, with cost of goods at purchase cost', () => {
    const d = journal.find((e) => e.id === 'auto-led-l10')!;
    expect(lineOf(d, ACC.SALES)!.credit).toBe(3000);
    expect(lineOf(d, ACC.FREIGHT_INCOME)!.credit).toBe(200);
    expect(lineOf(d, ACC.SALES_TAX)!.credit).toBe(100);
    expect(lineOf(d, ACC.COGS)!.debit).toBe(5000);
  });

  it('expenses: category account, drawings to equity, credit expenses to unpaid expenses', () => {
    expect(lineOf(journal.find((e) => e.id === 'auto-exp-e1')!, '6040')!.debit).toBe(800);
    expect(lineOf(journal.find((e) => e.id === 'auto-exp-e2')!, ACC.BANK)!.credit).toBe(5000);
    expect(lineOf(journal.find((e) => e.id === 'auto-exp-e3')!, ACC.UNPAID_EXPENSES)!.credit).toBe(1200);
    expect(lineOf(journal.find((e) => e.id === 'auto-exp-e4')!, ACC.DRAWINGS)!.debit).toBe(2000);
    expect(lineOf(journal.find((e) => e.id === 'auto-exp-e5')!, ACC.BANK_CHARGES)!.debit).toBe(50);
  });

  it('a cash to bank transfer is one entry; capital and unclassified cash entries are posted sensibly', () => {
    const xfers = journal.filter((e) => e.sourceType === 'transfer');
    expect(xfers).toHaveLength(1);
    expect(lineOf(xfers[0], ACC.BANK)!.debit).toBe(4000);
    expect(lineOf(xfers[0], ACC.CASH)!.credit).toBe(4000);
    expect(lineOf(journal.find((e) => e.id === 'auto-cash-x3')!, ACC.CAPITAL)!.credit).toBe(20000);
    expect(lineOf(journal.find((e) => e.id === 'auto-cash-x4')!, ACC.SUSPENSE)!.debit).toBe(300);
  });

  it('cash and bank in the ledger equal the Money screen (accountBalancesOn)', () => {
    const moves = collectCashMovements(src.ledger, src.expenses, src.cashEntries, src.customers, src.suppliers);
    for (const day of ['2026-01-01', '2026-02-05', '2026-02-15', asOf]) {
      const money = accountBalancesOn(moves, settings, day);
      expect(accountBalance(journal, ACC.CASH, day), `cash ${day}`).toBe(money.cash);
      expect(accountBalance(journal, ACC.BANK, day), `bank ${day}`).toBe(money.bank);
    }
  });

  it('receivable equals what customers owe and payable equals what suppliers are owed', () => {
    expect(accountBalance(journal, ACC.RECEIVABLE)).toBe(src.customers.reduce((a, c) => a + c.totalDue, 0));
    expect(-accountBalance(journal, ACC.PAYABLE)).toBe(src.suppliers.reduce((a, s) => a + s.totalOwed, 0));
    expect(-accountBalance(journal, ACC.UNPAID_EXPENSES)).toBe(1200);
  });

  it('profit & loss and balance sheet agree, and the balance sheet balances', () => {
    const pnl = profitAndLoss(journal, '2026-01-01', asOf);
    // Sales 1000 + 2000 + 3000 - discount 100 - returns 200 + freight 200
    expect(pnl.totalIncome).toBe(5900);
    expect(pnl.expenses.find((r) => r.account.code === ACC.DRAWINGS)).toBeUndefined();
    expect(pnl.netProfit).toBe(round(pnl.grossProfit - pnl.totalExpenses));
    const bs = balanceSheet(journal, asOf);
    expect(bs.balanced).toBe(true);
    expect(bs.totalAssets).toBe(round(bs.totalLiabilities + bs.totalEquity));
    // All-time profit = P&L from the very first entry
    expect(bs.profitToDate).toBe(profitAndLoss(journal, '1900-01-01', asOf).netProfit);
  });

  it('general ledger gives opening, running and closing balances for an account', () => {
    const gl = generalLedger(journal, ACC.CASH, '2026-02-02', '2026-02-28');
    expect(gl.opening).toBe(accountBalance(journal, ACC.CASH, '2026-02-01'));
    expect(gl.closing).toBe(accountBalance(journal, ACC.CASH, '2026-02-28'));
    expect(gl.lines.every((l) => l.date >= '2026-02-02')).toBe(true);
    const last = gl.lines[gl.lines.length - 1];
    expect(last.balance).toBe(gl.closing);
    expect(round(gl.opening + gl.totalDebit - gl.totalCredit)).toBe(gl.closing);
  });

  it('opening stock is today\'s stock with recorded movements undone, at cost', () => {
    // p1: 70 on hand + 30 sold on bills − 2 returned + 2 written off = 100 × 60
    expect(lineOf(journal.find((e) => e.id === 'auto-open-stock-p1')!, ACC.INVENTORY)!.debit).toBe(6000);
    // p2: everything bought was dispatched, nothing was there before
    expect(journal.find((e) => e.id === 'auto-open-stock-p2')).toBeUndefined();
    expect(lineOf(journal.find((e) => e.id === 'auto-adj-a1')!, ACC.STOCK_LOSSES)!.debit).toBe(120);
  });

  it('pre-opening money movements hit opening equity, not cash', () => {
    const old = journal.find((e) => e.id === 'auto-led-l12')!;
    expect(lineOf(old, ACC.OPENING_EQUITY)!.debit).toBe(700);
    expect(lineOf(old, ACC.CASH)).toBeUndefined();
  });

  it('manual entries join the books and keep them balanced', () => {
    const manual: JournalEntry = { id: 'm1', date: '2026-02-20', ref: 'JV-1', memo: 'Tea was actually staff food', source: 'manual', lines: [{ accountCode: '6020', debit: 300, credit: 0 }, { accountCode: ACC.SUSPENSE, debit: 0, credit: 300 }] };
    const books = combineJournal(journal, [manual]);
    expect(accountBalance(books, ACC.SUSPENSE)).toBe(0);
    expect(trialBalance(books, DEFAULT_ACCOUNTS, asOf).balanced).toBe(true);
    expect(balanceSheet(books, asOf).balanced).toBe(true);
  });

  it('deleting a bill removes its postings', () => {
    const without = { ...src, ledger: src.ledger.filter((l) => l.sourceId !== 'i2'), invoices: src.invoices!.filter((i) => i.id !== 'i2'), customers: src.customers.map((c) => (c.id === 'c1' ? { ...c, totalDue: 0 } : c)) };
    const j2 = buildJournal(without);
    expect(j2.some((e) => e.billId === 'i2')).toBe(false);
    expect(accountBalance(j2, ACC.SALES_TAX)).toBe(-100);
    expect(trialBalance(j2, DEFAULT_ACCOUNTS, asOf).balanced).toBe(true);
    expect(accountBalance(j2, ACC.RECEIVABLE)).toBe(without.customers.reduce((a, c) => a + c.totalDue, 0));
  });
});

const round = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Through the real app state: the shopkeeper's actions post automatically.
// ---------------------------------------------------------------------------
const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;

const setupApp = () => {
  localStorage.setItem('tradeflow_customers_v2', JSON.stringify([
    { id: 'c1', name: 'Zaman & Co', company: 'Zaman & Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '0300', email: '', address: '', totalDue: 7000, creditLimit: 0, createdAt: '2026-01-01' },
  ]));
  localStorage.setItem('tradeflow_suppliers_v2', JSON.stringify([{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '0300', email: '', materialCategory: 'Oil', address: '', totalOwed: 45000, createdAt: '2026-01-01' }]));
  localStorage.setItem('tradeflow_products_v2', JSON.stringify([
    { id: 'p1', name: '5 kg Can', category: 'General', unit: 'can', unitPricePerKg: 2065, costPricePerKg: 1800, stockKg: 500, minThresholdKg: 50 },
    { id: 'p2', name: '15.7 kg Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 100, minThresholdKg: 10 },
  ]));
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_dispatches_v2', 'tradeflow_bookings_v2'].forEach((k) => localStorage.setItem(k, '[]'));
  const hook = renderHook(() => ({ t: useTrading(), books: useAccounting() }), { wrapper });
  act(() => {
    hook.result.current.t.unlockAdmin('7860');
  });
  act(() => {
    hook.result.current.t.updateSettings({ cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  });
  return hook;
};

beforeEach(() => localStorage.clear());

describe('automatic posting from app actions', () => {
  it('bills, payments, expenses, purchases and transfers keep the books balanced and in step with the app', () => {
    const { result } = setupApp();
    const t = () => result.current.t;
    let billId = '';
    act(() => { billId = t().createBill({ customerId: 'c1', items: [{ productId: 'p1', qty: 10, unitPrice: 2065 }], discount: 650, paidNow: 5000, paymentMethod: 'Cash' }).invoice!.id; });
    act(() => { t().createBill({ customerId: 'c2', items: [{ productId: 'p2', qty: 2, unitPrice: 6535 }], paidNow: 0 }); });
    act(() => { t().payBill(billId, 3000, 'Bank Transfer'); });
    act(() => { t().recordCustomerPayment('c2', 2500, 'Easypaisa / JazzCash - ref 9'); });
    act(() => { t().addExpense({ date: todayISO(), category: 'food', amount: 450, description: 'lunch', paidVia: 'Cash', truckId: null, dispatchId: null }); });
    act(() => { t().addExpense({ date: todayISO(), category: 'rent', amount: 15000, description: 'rent', paidVia: 'Credit (unpaid)', truckId: null, dispatchId: null }); });
    act(() => { t().addExpense({ date: todayISO(), category: 'drawings', amount: 1000, description: 'home', paidVia: 'Cash', truckId: null, dispatchId: null }); });
    act(() => { t().addCashTransfer({ amount: 2000, from: 'cash' }); });
    act(() => { t().addPurchase({ supplierId: 's1', productId: 'p2', kg: 10, pricePerKg: 5000 }); });
    act(() => { t().recordSupplierPayment('s1', 20000, 'Bank Transfer - chq 1'); });

    const { journal, accounts } = result.current.books;
    const today = todayISO();
    journal.forEach((e) => expect(validateEntry(e, accounts).ok, e.id).toBe(true));
    expect(trialBalance(journal, accounts, today).balanced).toBe(true);
    expect(balanceSheet(journal, today, accounts).balanced).toBe(true);

    const moves = collectCashMovements(t().ledger, t().expenses, t().cashEntries, t().customers, t().suppliers);
    const money = accountBalancesOn(moves, t().settings, today);
    expect(accountBalance(journal, ACC.CASH, today)).toBe(money.cash);
    expect(accountBalance(journal, ACC.BANK, today)).toBe(money.bank);
    expect(accountBalance(journal, ACC.RECEIVABLE, today)).toBe(round(t().customers.reduce((a, c) => a + c.totalDue, 0)));
    expect(-accountBalance(journal, ACC.PAYABLE, today)).toBe(round(t().suppliers.reduce((a, s) => a + s.totalOwed, 0)));
    // Bill 1: 20650 - 650 discount; cost 10 × 1800
    const bill = journal.find((e) => e.billId === billId && e.sourceType === 'bill')!;
    expect(lineOf(bill, ACC.SALES_DISCOUNTS)!.debit).toBe(650);
    expect(lineOf(bill, ACC.COGS)!.debit).toBe(18000);

    // Deleting the bill takes its postings with it and the books still balance
    act(() => { t().deleteBill(billId); });
    const after = result.current.books.journal;
    expect(after.some((e) => e.billId === billId)).toBe(false);
    expect(trialBalance(after, result.current.books.accounts, today).balanced).toBe(true);
    expect(accountBalance(after, ACC.RECEIVABLE, today)).toBe(round(t().customers.reduce((a, c) => a + c.totalDue, 0)));
  });

  it('manual journals: balanced ones save, unbalanced and locked-period ones are refused; accounts can be added, system ones not deleted', () => {
    const { result } = setupApp();
    const t = () => result.current.t;
    let r: { success: boolean; message: string } = { success: false, message: '' };
    act(() => { r = t().addManualJournal({ date: '2026-03-01', memo: 'Unbalanced', lines: [{ accountCode: '6070', debit: 100, credit: 0 }, { accountCode: '1000', debit: 0, credit: 90 }] }); });
    expect(r.success).toBe(false);
    expect(t().manualJournals).toHaveLength(0);

    act(() => { r = t().addAccount({ code: '1020', name: 'Meezan Bank', type: 'asset' }); });
    expect(r.success).toBe(true);
    act(() => { r = t().addAccount({ code: '1020', name: 'Dup', type: 'asset' }); });
    expect(r.success).toBe(false);
    act(() => { r = t().addManualJournal({ date: '2026-03-01', memo: 'Move money to Meezan', lines: [{ accountCode: '1020', debit: 5000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 5000 }] }); });
    expect(r.success).toBe(true);
    expect(t().manualJournals).toHaveLength(1);
    expect(accountBalance(result.current.books.journal, '1020')).toBe(5000);
    expect(trialBalance(result.current.books.journal, result.current.books.accounts, todayISO()).balanced).toBe(true);

    act(() => { r = t().deleteAccount('1000'); });
    expect(r.success).toBe(false);
    act(() => { r = t().deleteAccount('1020'); });
    expect(r.success).toBe(false); // in use

    act(() => { t().updateSettings({ booksLockedUntil: '2026-03-31' }); });
    act(() => { r = t().addManualJournal({ date: '2026-03-15', memo: 'Late', lines: [{ accountCode: '6070', debit: 100, credit: 0 }, { accountCode: '1000', debit: 0, credit: 100 }] }); });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/locked/);
    act(() => { r = t().deleteManualJournal(t().manualJournals[0].id); });
    expect(r.success).toBe(false);
    act(() => { t().updateSettings({ booksLockedUntil: undefined }); });
    act(() => { r = t().deleteManualJournal(t().manualJournals[0].id); });
    expect(r.success).toBe(true);
    act(() => { r = t().deleteAccount('1020'); });
    expect(r.success).toBe(true);
  });

  it('journals and accounts survive a backup round trip', () => {
    const { result } = setupApp();
    act(() => { result.current.t.addAccount({ code: '7000', name: 'Donations', type: 'expense' }); });
    act(() => { result.current.t.addManualJournal({ date: '2026-03-01', memo: 'Zakat', lines: [{ accountCode: '7000', debit: 100, credit: 0 }, { accountCode: '1000', debit: 0, credit: 100 }] }); });
    let json = '';
    act(() => { json = result.current.t.exportSystemBackup(); });
    const parsed = JSON.parse(json);
    expect(parsed.manualJournals).toHaveLength(1);
    expect(parsed.customAccounts).toHaveLength(1);
    act(() => { result.current.t.purgeTable('journal_entries'); result.current.t.purgeTable('accounts'); });
    expect(result.current.t.manualJournals).toHaveLength(0);
    act(() => { result.current.t.importSystemBackup(json); });
    expect(result.current.t.manualJournals).toHaveLength(1);
    expect(result.current.t.customAccounts[0].code).toBe('7000');
  });
});
