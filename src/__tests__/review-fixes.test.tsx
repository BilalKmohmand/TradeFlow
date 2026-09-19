import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { buildJournal, trialBalance, accountBalance, mergeAccounts } from '../utils/accounting';
import { collectCashMovements, accountBalancesOn, positionSummary } from '../utils/finance';
import { todayISO, shiftDate } from '../utils/stockFlow';

/** One test per finding from the code review of the ERP merge, so none of them can quietly return. */
const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;

const setup = (opts: { trackBatches?: boolean; productCost?: number } = {}) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Zaman & Co', company: 'Zaman & Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '0301', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, ...(opts.productCost ? { costPricePerKg: opts.productCost } : {}), stockKg: 0, minThresholdKg: 0, ...(opts.trackBatches ? { trackBatches: true } : {}) },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_stock_adjustments_v2'].forEach((k) => localStorage.setItem(k, '[]'));
  const hook = renderHook(() => useTrading(), { wrapper });
  act(() => {
    hook.result.current.unlockAdmin('7860');
  });
  return hook;
};
type H = ReturnType<typeof setup>['result'];
const books = (result: H) => {
  const s = result.current;
  const auto = buildJournal({ settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices, dispatches: s.dispatches, purchases: s.purchases, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products, returns: s.returns, adjustments: s.adjustments });
  return [...auto, ...s.manualJournals];
};

beforeEach(() => localStorage.clear());

describe('review finding 2: cost of goods on bills', () => {
  it('posts cost of goods from the purchase cost when the item has no cost price', () => {
    const { result } = setup();
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 10, costPrice: 50, supplierId: 's1' }); });
    act(() => { result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 10, unitPrice: 80 }] }); });
    const j = books(result);
    expect(accountBalance(j, '5000', todayISO())).toBe(500); // COGS
    expect(accountBalance(j, '1200', todayISO())).toBe(0); // inventory empty again
    expect(result.current.invoices[0].items[0].costPricePerKg).toBe(50);
  });
  it('uses the cost of the batches actually sold', () => {
    const { result } = setup({ trackBatches: true });
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 10, batchNo: 'A', expiryDate: shiftDate(todayISO(), 30), costPrice: 40, supplierId: 's1' }); });
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 10, batchNo: 'B', expiryDate: shiftDate(todayISO(), 90), costPrice: 60, supplierId: 's1' }); });
    act(() => { result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 15, unitPrice: 80 }] }); });
    // 10 from A @40 + 5 from B @60 = 700 → 46.67 each
    expect(result.current.invoices[0].items[0].costPricePerKg).toBeCloseTo(46.67, 2);
    expect(accountBalance(books(result), '5000', todayISO())).toBeCloseTo(700, 0);
  });
});

describe('review finding 3a: stock that arrives with no supplier bill', () => {
  it('is kept as a stock record posted to Suspense, not hidden in opening equity', () => {
    const { result } = setup({ productCost: 30 });
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 20, costPrice: 30 }); });
    expect(result.current.adjustments[0].reason).toBe('received');
    expect(result.current.adjustments[0].costPerKg).toBe(30);
    const j = books(result);
    expect(accountBalance(j, '1200', todayISO())).toBe(600);
    expect(accountBalance(j, '2900', todayISO())).toBe(-600); // credit balance in Suspense
    expect(j.some((e) => e.sourceType === 'opening_stock')).toBe(false);
  });
  it('a stock figure changed on the item form becomes a stock-count record', () => {
    const { result } = setup({ productCost: 30 });
    act(() => { result.current.adjustStock('p1', 12, 'count', 'Changed on the item form'); });
    expect(result.current.adjustments[0].deltaKg).toBe(12);
    expect(result.current.adjustments[0].costPerKg).toBe(30);
  });
});

describe('review finding 3b: advances are kept, not turned into equity', () => {
  it('overpaying leaves a negative balance that shows as money the shop owes back', () => {
    const { result } = setup();
    act(() => { result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 1, unitPrice: 1000 }] }); });
    act(() => { result.current.recordCustomerPayment('c1', 1500, 'Cash'); });
    expect(result.current.customers[0].totalDue).toBe(-500);
    const s = result.current;
    const pos = positionSummary(s.customers, s.suppliers, s.expenses, accountBalancesOn(collectCashMovements(s.ledger, s.expenses, s.cashEntries, s.customers, s.suppliers), s.settings, todayISO()));
    expect(pos.customerAdvances).toBe(500);
    expect(pos.receivables).toBe(0);
    expect(pos.payables).toBe(500);
    const j = books(result);
    expect(accountBalance(j, '1100', todayISO())).toBe(-500);
    expect(trialBalance(j, mergeAccounts(s.customAccounts), todayISO()).balanced).toBe(true);
    expect(j.some((e) => e.lines.some((l) => l.accountCode === '3900') && e.memo.toLowerCase().includes('zaman'))).toBe(false);
  });
});

describe('review finding 5 and 6: godowns and purchases', () => {
  it('a plain item is not oversold from the main godown by eating another godown\'s stock', () => {
    const { result } = setup();
    let g2 = '';
    act(() => { g2 = result.current.addGodown('Godown B').godown!.id; });
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 10, godownId: g2, costPrice: 50, supplierId: 's1' }); });
    let r: any;
    act(() => { r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 5, unitPrice: 80 }] }); });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/Godown B/);
    expect(result.current.stockBatches.filter((b) => b.godownId === g2).reduce((a, b) => a + b.qty, 0)).toBe(10);
    act(() => { r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 5, unitPrice: 80 }], godownId: g2 }); });
    expect(r.success).toBe(true);
  });
  it('deleting a purchase removes the batch that purchase created', () => {
    const { result } = setup({ trackBatches: true });
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 10, batchNo: 'KEEP', expiryDate: shiftDate(todayISO(), 20), costPrice: 40, supplierId: 's1' }); });
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 10, batchNo: 'DROP', expiryDate: shiftDate(todayISO(), 90), costPrice: 40, supplierId: 's1' }); });
    const drop = result.current.stockBatches.find((b) => b.batchNo === 'DROP')!;
    act(() => { result.current.deletePurchase(drop.purchaseId!); });
    expect(result.current.stockBatches.map((b) => b.batchNo)).toEqual(['KEEP']);
    expect(result.current.products[0].stockKg).toBe(10);
  });
  it('stock returned to a deleted godown goes back to the main godown', () => {
    const { result } = setup();
    let g2 = '';
    act(() => { g2 = result.current.addGodown('Godown B').godown!.id; });
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 10, godownId: g2, costPrice: 50, supplierId: 's1' }); });
    let bill: any;
    act(() => { bill = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 10, unitPrice: 80 }], godownId: g2 }); });
    act(() => { expect(result.current.deleteGodown(g2).success).toBe(true); });
    act(() => { result.current.deleteBill(bill.invoice.id); });
    expect(result.current.stockBatches.some((b) => b.godownId === g2 && b.qty > 0)).toBe(false);
    expect(result.current.products[0].stockKg).toBe(10);
  });
  it('a back-dated bill cannot sell a batch that has already expired', () => {
    const { result } = setup({ trackBatches: true });
    // Received long ago, expired yesterday.
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 5, batchNo: 'OLD', expiryDate: shiftDate(todayISO(), -1), costPrice: 40, date: shiftDate(todayISO(), -30) }); });
    let r: any;
    act(() => { r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 1, unitPrice: 80 }], date: shiftDate(todayISO(), -10) }); });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/expired/);
  });
});

describe('review finding 7: bank receipts', () => {
  it('a statement receipt can be recorded as a customer payment, reducing what they owe', () => {
    const { result } = setup();
    act(() => { result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 1, unitPrice: 5000 }] }); });
    act(() => { result.current.addBankStatementLines([{ date: todayISO(), description: 'IBFT Zaman & Co', amount: 5000 }]); });
    act(() => { expect(result.current.createEntryFromBankLine(result.current.bankStatementLines[0].id, { customerId: 'c1' }).success).toBe(true); });
    expect(result.current.customers[0].totalDue).toBe(0);
    expect(result.current.bankStatementLines[0].status).toBe('matched');
    expect(accountBalance(books(result), '1100', todayISO())).toBe(0);
  });
  it('an unassigned receipt goes to Suspense even when the narration says "capital"', () => {
    const { result } = setup();
    act(() => { result.current.addBankStatementLines([{ date: todayISO(), description: 'IBFT from Faisal Capital Traders', amount: 7000 }]); });
    act(() => { result.current.createEntryFromBankLine(result.current.bankStatementLines[0].id); });
    const j = books(result);
    expect(accountBalance(j, '2900', todayISO())).toBe(-7000);
    expect(accountBalance(j, '3000', todayISO())).toBe(0);
  });
});

describe('review finding 9: the period lock covers everything dated', () => {
  it('bills, payments, deletions, transfers and bank entries in a closed period are refused', () => {
    const { result } = setup();
    let bill: any;
    act(() => { bill = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 1, unitPrice: 1000 }], date: shiftDate(todayISO(), -5) }); });
    act(() => { result.current.updateSettings({ booksLockedUntil: shiftDate(todayISO(), -1) }); });
    let r: any;
    act(() => { r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 1, unitPrice: 1000 }], date: shiftDate(todayISO(), -2) }); });
    expect(r.success).toBe(false);
    act(() => { r = result.current.payBill(bill.invoice.id, 100, 'Cash', undefined, shiftDate(todayISO(), -3)); });
    expect(r.success).toBe(false);
    act(() => { r = result.current.deleteBill(bill.invoice.id); });
    expect(r.success).toBe(false);
    act(() => { r = result.current.addCashTransfer({ amount: 100, from: 'cash', date: shiftDate(todayISO(), -1) }); });
    expect(r.success).toBe(false);
    act(() => { result.current.addBankStatementLines([{ date: shiftDate(todayISO(), -1), description: 'charges', amount: -50 }]); });
    act(() => { r = result.current.createEntryFromBankLine(result.current.bankStatementLines[0].id); });
    expect(r.success).toBe(false);
    // Today is still open.
    act(() => { r = result.current.payBill(bill.invoice.id, 100, 'Cash'); });
    expect(r.success).toBe(true);
  });
});

describe('review finding 11: permissions', () => {
  it('an operator cannot post journals, add accounts or change the bank reconciliation', () => {
    const { result } = setup();
    act(() => { result.current.addUser({ name: 'Zahid Op', role: 'operator', pin: '4321' }); });
    act(() => { result.current.lockAdmin(); });
    const id = result.current.users.find((u) => u.name === 'Zahid Op')!.id;
    act(() => { result.current.unlockAsUser(id, '4321'); });
    let r: any;
    act(() => { r = result.current.addManualJournal({ date: todayISO(), memo: 'x', lines: [{ accountCode: '1000', debit: 10, credit: 0 }, { accountCode: '3000', debit: 0, credit: 10 }] }); });
    expect(r.success).toBe(false);
    act(() => { r = result.current.addAccount({ code: '7777', name: 'Test', type: 'expense' }); });
    expect(r.success).toBe(false);
    act(() => { r = result.current.addBankStatementLines([{ date: todayISO(), description: 'x', amount: 10 }]); });
    expect(r.added).toBe(0);
  });
});

describe('review finding 12 and low items', () => {
  it('loading the sample data clears journals, bank lines, batches and bills too', () => {
    const { result } = setup({ trackBatches: true });
    act(() => { result.current.receiveStock({ productId: 'p1', qty: 5, batchNo: 'X', expiryDate: shiftDate(todayISO(), 30), costPrice: 10 }); });
    act(() => { result.current.addManualJournal({ date: todayISO(), memo: 'capital', lines: [{ accountCode: '1000', debit: 10, credit: 0 }, { accountCode: '3000', debit: 0, credit: 10 }] }); });
    act(() => { result.current.addBankStatementLines([{ date: todayISO(), description: 'x', amount: 10 }]); });
    act(() => { result.current.resetToSampleData(); });
    expect(result.current.manualJournals).toEqual([]);
    expect(result.current.bankStatementLines).toEqual([]);
    expect(result.current.stockBatches).toEqual([]);
    expect(result.current.invoices).toEqual([]);
  });
  it('journal numbers never repeat after a deletion', () => {
    const { result } = setup();
    const post = () => act(() => { result.current.addManualJournal({ date: todayISO(), memo: 'x', lines: [{ accountCode: '1000', debit: 10, credit: 0 }, { accountCode: '3000', debit: 0, credit: 10 }] }); });
    post(); post(); post();
    const first = result.current.manualJournals.find((j) => j.ref === 'JV-1')!;
    act(() => { result.current.deleteManualJournal(first.id); });
    post();
    const refs = result.current.manualJournals.map((j) => j.ref).sort();
    expect(refs).toEqual(['JV-2', 'JV-3', 'JV-4']);
  });
});
