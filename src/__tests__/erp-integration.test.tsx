import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { buildJournal, trialBalance, balanceSheet, accountBalance, mergeAccounts } from '../utils/accounting';
import { collectCashMovements, accountBalancesOn } from '../utils/finance';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';

/**
 * The three ERP features were built separately (accounting; batches/expiry/godowns; credit limits
 * + bank reconciliation). This drives all of them through one shop's day and checks the books
 * still hold together: every real action posts, and the ledger agrees with the operational screens.
 */
const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;

const setup = async () => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman & Co', company: 'Zaman & Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 50000, createdAt: '2026-01-01' },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '0300', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '0301', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, costPricePerKg: 1800, stockKg: 0, minThresholdKg: 0, trackBatches: true },
    { id: 'p2', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, costPricePerKg: 6000, stockKg: 100, minThresholdKg: 10 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2'].forEach((k) => localStorage.setItem(k, '[]'));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
  return hook;
};

beforeEach(() => localStorage.clear());

describe('all ERP features together', () => {
  it('batches, credit limits, bank reconciliation and manual journals keep the books balanced and in step', async () => {
    const { result } = await setup();
    const today = todayISO();

    // Inventory: two batches bought on credit from the supplier, the later one expiring first.
    act(() => {
      expect(result.current.receiveStock({ productId: 'p1', qty: 100, batchNo: 'B-LATE', expiryDate: shiftDate(today, 300), costPrice: 1800, supplierId: 's1' }).success).toBe(true);
    });
    act(() => {
      expect(result.current.receiveStock({ productId: 'p1', qty: 50, batchNo: 'B-SOON', expiryDate: shiftDate(today, 40), costPrice: 1800, supplierId: 's1' }).success).toBe(true);
    });
    expect(result.current.products.find((p) => p.id === 'p1')!.stockKg).toBe(150);
    expect(result.current.suppliers[0].totalOwed).toBe(270000);

    // Credit limit: Zaman's limit is 50,000. A 60-can credit bill (123,900) is refused without override…
    let r: any;
    act(() => {
      r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: '5 kgs Can', qty: 60, unitPrice: 2065 }] });
    });
    expect(r.success).toBe(false);
    expect(result.current.invoices.length).toBe(0);
    // …and allowed with a manager override and a reason. FEFO takes all 50 of B-SOON, then 10 of B-LATE.
    act(() => {
      r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: '5 kgs Can', qty: 60, unitPrice: 2065 }], paidNow: 20000, paymentMethod: 'Bank Transfer', allowOverLimit: true, overrideReason: 'Old customer, pays monthly' });
    });
    expect(r.success).toBe(true);
    const batches = r.invoice.items[0].batches.map((b: any) => `${b.batchNo}:${b.qty}`);
    expect(batches).toEqual(['B-SOON:50', 'B-LATE:10']);
    expect(r.invoice.creditOverride.reason).toBe('Old customer, pays monthly');

    // An ordinary cash bill for a plain (non-batch) item.
    act(() => {
      result.current.createBill({ customerId: 'c2', items: [{ productId: 'p2', name: 'Tin', qty: 2, unitPrice: 6535 }], paidNow: 13070, paymentMethod: 'Cash' });
    });

    // Pay the supplier part from the bank, deposit cash, record a bank-paid expense.
    act(() => {
      result.current.recordSupplierPayment('s1', 100000, 'Bank Transfer - part payment');
      result.current.addCashTransfer({ amount: 10000, from: 'cash' });
    });

    // Bank reconciliation: the statement has the customer's transfer, the deposit, and a bank charge not in the books.
    act(() => {
      result.current.addBankStatementLines([
        { date: today, description: 'IBFT Zaman & Co', amount: 20000 },
        { date: today, description: 'Cash deposit', amount: 10000 },
        { date: today, description: 'SMS alert charges', amount: -350 },
      ]);
    });
    const unmatched = result.current.bankStatementLines.filter((l) => l.status === 'unmatched');
    expect(unmatched.map((l) => l.description)).toEqual(['SMS alert charges']);
    act(() => {
      expect(result.current.createEntryFromBankLine(unmatched[0].id).success).toBe(true);
    });
    expect(result.current.bankStatementLines.every((l) => l.status === 'matched')).toBe(true);

    // The accountant reclassifies: owner put capital into the bank.
    act(() => {
      expect(result.current.addManualJournal({ date: today, memo: 'Owner capital introduced', lines: [{ accountCode: '1010', debit: 25000, credit: 0 }, { accountCode: '3000', debit: 0, credit: 25000 }] }).success).toBe(true);
    });

    // ---- The books ----
    const s = result.current;
    const auto = buildJournal({
      settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices,
      dispatches: s.dispatches, purchases: s.purchases, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products,
      returns: s.returns, adjustments: s.adjustments,
    });
    const journal = [...auto, ...s.manualJournals];
    const accounts = mergeAccounts(s.customAccounts);

    expect(trialBalance(journal, accounts, today).balanced).toBe(true);
    expect(balanceSheet(journal, today, accounts).balanced).toBe(true);

    // Receivable and payable in the ledger equal the Customers and Suppliers screens.
    expect(accountBalance(journal, '1100', today)).toBeCloseTo(s.customers.reduce((a, c) => a + c.totalDue, 0), 2);
    expect(-accountBalance(journal, '2000', today)).toBeCloseTo(s.suppliers.reduce((a, x) => a + x.totalOwed, 0), 2);

    // Cash and bank in the ledger equal the cash book (plus the capital the accountant posted to the bank).
    const cashBook = accountBalancesOn(collectCashMovements(s.ledger, s.expenses, s.cashEntries, s.customers, s.suppliers), s.settings, today);
    expect(accountBalance(journal, '1000', today)).toBeCloseTo(cashBook.cash, 2);
    expect(accountBalance(journal, '1010', today)).toBeCloseTo(cashBook.bank + 25000, 2);
    expect(cashBook.cash).toBe(20000 + 13070 - 10000);
    expect(cashBook.bank).toBe(100000 + 20000 - 100000 + 10000 - 350);

    // Stock in godowns/batches still totals the item's stock figure.
    const p1 = s.products.find((p) => p.id === 'p1')!;
    expect(p1.stockKg).toBe(90);
    expect(s.stockBatches.filter((b) => b.productId === 'p1').reduce((a, b) => a + b.qty, 0)).toBe(90);

    // Deleting the override bill reverses stock into the exact batches and removes its postings.
    act(() => {
      expect(result.current.deleteBill(r.invoice.id).success).toBe(true);
    });
    const after = result.current;
    expect(after.stockBatches.find((b) => b.batchNo === 'B-SOON')?.qty).toBe(50);
    expect(after.products.find((p) => p.id === 'p1')!.stockKg).toBe(150);
    const journal2 = [
      ...buildJournal({ settings: after.settings, customers: after.customers, suppliers: after.suppliers, ledger: after.ledger, invoices: after.invoices, dispatches: after.dispatches, purchases: after.purchases, expenses: after.expenses, cashEntries: after.cashEntries, products: after.products, returns: after.returns, adjustments: after.adjustments }),
      ...after.manualJournals,
    ];
    expect(trialBalance(journal2, accounts, today).balanced).toBe(true);
    expect(accountBalance(journal2, '1100', today)).toBeCloseTo(after.customers.reduce((a, c) => a + c.totalDue, 0), 2);
  });
});
