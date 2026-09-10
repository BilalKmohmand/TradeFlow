import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading, nextBillNumber } from '../context/TradingContext';
import { collectCashMovements, accountBalancesOn, positionSummary } from '../utils/finance';
import { buildDailySheet, daySummary, filterBills } from '../utils/billing';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { Invoice } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;

const setup = () => {
  localStorage.setItem('tradeflow_customers_v2', JSON.stringify([{ id: 'c1', name: 'Zaman & Co', company: 'Zaman & Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]));
  localStorage.setItem('tradeflow_products_v2', JSON.stringify([
    { id: 'p1', name: '5 kg Can', category: 'General', unit: 'can', unitPricePerKg: 2065, stockKg: 500, minThresholdKg: 50 },
    { id: 'p2', name: '15.7 kg Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 100, minThresholdKg: 10 },
  ]));
  localStorage.setItem('tradeflow_invoices_v1', '[]');
  localStorage.setItem('tradeflow_ledger_v2', '[]');
  localStorage.setItem('tradeflow_expenses_v2', '[]');
  localStorage.setItem('tradeflow_cash_v2', '[]');
  const hook = renderHook(() => useTrading(), { wrapper });
  act(() => {
    hook.result.current.unlockAdmin('7860');
  });
  act(() => {
    hook.result.current.updateSettings({ cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  });
  return hook;
};

beforeEach(() => localStorage.clear());

describe('bill numbers', () => {
  it('continue from the highest existing number', () => {
    expect(nextBillNumber([])).toBe('INV-1');
    expect(nextBillNumber([{ invoiceNumber: 'INV-57' } as Invoice, { invoiceNumber: 'INV-2026-003' } as Invoice])).toBe('INV-58');
  });
});

describe('createBill', () => {
  it('matches the client sample: qty × price per line, subtotal, total; takes stock; credit goes on the customer', () => {
    const { result } = setup();
    let r: ReturnType<typeof result.current.createBill> | undefined;
    act(() => {
      r = result.current.createBill({
        customerId: 'c1',
        items: [
          { productId: 'p1', name: '5 kgs Can', qty: 300, unitPrice: 2065 },
          { productId: 'p1', name: '2.5 kgs can', qty: 300, unitPrice: 1037.5 },
          { productId: 'p2', name: '15.7 kgs Tin', qty: 40, unitPrice: 6535 },
        ],
        paidNow: 0,
      });
    });
    expect(r?.success).toBe(true);
    const inv = result.current.invoices.find((i) => i.id === r!.invoice!.id)!;
    expect(inv.items.map((i) => i.amount)).toEqual([619500, 311250, 261400]);
    expect(inv.subtotal).toBe(1192150);
    expect(inv.totalAmount).toBe(1192150);
    expect(inv.balanceDue).toBe(1192150);
    expect(inv.billKind).toBe('credit');
    expect(inv.invoiceNumber).toBe('INV-1');
    // stock: 500 − 600 (two lines of p1) → −100 is allowed (negative means oversold); p2 100 − 40
    expect(result.current.products.find((p) => p.id === 'p1')!.stockKg).toBe(-100);
    expect(result.current.products.find((p) => p.id === 'p2')!.stockKg).toBe(60);
    expect(result.current.customers[0].totalDue).toBe(1192150);
    const bill = result.current.ledger.find((l) => l.type === 'bill_issued')!;
    expect(bill.debit).toBe(1192150);
    expect(bill.referenceId).toBe('INV-1');
  });

  it('applies discount, records cash paid now into the cash book, and second bill gets the next number', () => {
    const { result } = setup();
    act(() => {
      result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: '5 kg Can', qty: 10, unitPrice: 2000 }], discount: 500, paidNow: 19500, paymentMethod: 'Cash' });
    });
    const inv = result.current.invoices[0];
    expect(inv.totalAmount).toBe(19500);
    expect(inv.paidAmount).toBe(19500);
    expect(inv.balanceDue).toBe(0);
    expect(inv.status).toBe('paid');
    expect(inv.billKind).toBe('cash');
    expect(result.current.customers[0].totalDue).toBe(0);
    const mv = collectCashMovements(result.current.ledger, result.current.expenses, result.current.cashEntries, result.current.customers, result.current.suppliers);
    const pay = mv.find((m) => m.source === 'customer_payment')!;
    expect(pay.amount).toBe(19500);
    expect(pay.method).toBe('Cash');
    const bal = accountBalancesOn(mv, result.current.settings, todayISO());
    expect(bal.cash).toBe(29500);
    expect(bal.bank).toBe(50000);
    act(() => {
      result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Tin', qty: 1, unitPrice: 6535 }], paidNow: 6535, paymentMethod: 'Bank Transfer' });
    });
    expect(result.current.invoices[0].invoiceNumber).toBe('INV-2');
    const mv2 = collectCashMovements(result.current.ledger, result.current.expenses, result.current.cashEntries, result.current.customers, result.current.suppliers);
    expect(accountBalancesOn(mv2, result.current.settings, todayISO()).bank).toBe(56535);
  });

  it('rejects an empty bill or an unknown customer', () => {
    const { result } = setup();
    let r1: any;
    let r2: any;
    act(() => {
      r1 = result.current.createBill({ customerId: 'nope', items: [{ productId: 'p1', name: 'x', qty: 1, unitPrice: 1 }] });
      r2 = result.current.createBill({ customerId: 'c1', items: [] });
    });
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
    expect(result.current.invoices.length).toBe(0);
  });
});

describe('payBill / deleteBill', () => {
  it('partial payments reduce the balance and the customer due; overpaying is refused; delete reverses everything', () => {
    const { result } = setup();
    act(() => {
      result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: '5 kg Can', qty: 5, unitPrice: 2000 }] });
    });
    const id = result.current.invoices[0].id;
    act(() => {
      expect(result.current.payBill(id, 4000, 'Cash').success).toBe(true);
    });
    expect(result.current.invoices[0].balanceDue).toBe(6000);
    expect(result.current.invoices[0].status).toBe('partial');
    expect(result.current.customers[0].totalDue).toBe(6000);
    act(() => {
      expect(result.current.payBill(id, 9000, 'Cash').success).toBe(false);
    });
    act(() => {
      expect(result.current.payBill(id, 6000, 'Easypaisa / JazzCash').success).toBe(true);
    });
    expect(result.current.invoices[0].status).toBe('paid');
    expect(result.current.invoices[0].payments?.length).toBe(2);
    expect(result.current.customers[0].totalDue).toBe(0);
    expect(result.current.ledger.filter((l) => l.referenceId === 'INV-1').length).toBe(3);

    act(() => {
      expect(result.current.deleteBill(id).success).toBe(true);
    });
    expect(result.current.invoices.length).toBe(0);
    expect(result.current.products.find((p) => p.id === 'p1')!.stockKg).toBe(500);
    expect(result.current.ledger.filter((l) => l.referenceId === 'INV-1').length).toBe(0);
    expect(result.current.customers[0].totalDue).toBe(0);
  });

  it('deleting an unpaid bill takes the credit back off the customer', () => {
    const { result } = setup();
    act(() => {
      result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 2, unitPrice: 1000 }] });
    });
    expect(result.current.customers[0].totalDue).toBe(2000);
    act(() => {
      result.current.deleteBill(result.current.invoices[0].id);
    });
    expect(result.current.customers[0].totalDue).toBe(0);
  });
});

describe('cash ↔ bank transfers and the daily sheet', () => {
  it('a deposit moves money from cash to bank without changing the total', () => {
    const { result } = setup();
    act(() => {
      expect(result.current.addCashTransfer({ amount: 4000, from: 'cash', note: 'HBL' }).success).toBe(true);
    });
    const mv = collectCashMovements(result.current.ledger, result.current.expenses, result.current.cashEntries, result.current.customers, result.current.suppliers);
    const bal = accountBalancesOn(mv, result.current.settings, todayISO());
    expect(bal.cash).toBe(6000);
    expect(bal.bank).toBe(54000);
    expect(bal.total).toBe(60000);
    act(() => {
      expect(result.current.addCashTransfer({ amount: 0, from: 'bank' }).success).toBe(false);
    });
  });

  it('daily sheet: opening/closing, bills, receipts, expenses by category, position', () => {
    const { result } = setup();
    const today = todayISO();
    act(() => {
      result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Can', qty: 3, unitPrice: 1000 }], paidNow: 1000, paymentMethod: 'Cash' });
      result.current.addExpense({ date: today, category: 'food', amount: 700, description: 'Lunch', paidVia: 'Cash', truckId: null, dispatchId: null });
      result.current.addExpense({ date: today, category: 'employee', amount: 2000, description: 'Advance to Rashid', paidVia: 'Bank Transfer', truckId: null, dispatchId: null });
      result.current.addExpense({ date: today, category: 'drawings', amount: 300, description: 'Owner', paidVia: 'Credit (unpaid)', truckId: null, dispatchId: null });
    });
    const sources = { invoices: result.current.invoices, ledger: result.current.ledger, expenses: result.current.expenses, cashEntries: result.current.cashEntries, customers: result.current.customers, suppliers: result.current.suppliers, settings: result.current.settings };
    const sheet = buildDailySheet(sources, today);
    expect(sheet.opening.cash).toBe(10000);
    expect(sheet.bills.length).toBe(1);
    expect(sheet.summary.sales).toBe(3000);
    expect(sheet.summary.received).toBe(1000);
    expect(sheet.summary.creditGiven).toBe(2000);
    expect(sheet.summary.expenses).toBe(2700); // the unpaid one is not cash out
    expect(sheet.expenses.map((g) => g.category)).toEqual(['employee', 'food', 'drawings']);
    expect(sheet.cashIn).toBe(1000);
    expect(sheet.cashOut).toBe(700);
    expect(sheet.bankOut).toBe(2000);
    expect(sheet.closing.cash).toBe(10300);
    expect(sheet.closing.bank).toBe(48000);
    const mv = collectCashMovements(result.current.ledger, result.current.expenses, result.current.cashEntries, result.current.customers, result.current.suppliers);
    const pos = positionSummary(result.current.customers, result.current.suppliers, result.current.expenses, accountBalancesOn(mv, result.current.settings, today));
    expect(pos.receivables).toBe(2000);
    expect(pos.unpaidExpenses).toBe(300);
    expect(pos.netPosition).toBe(58300 + 2000 - 300);
    // yesterday's sheet is empty but carries the opening balances
    const y = buildDailySheet(sources, shiftDate(today, -1));
    expect(y.bills.length).toBe(0);
    expect(y.closing.cash).toBe(10000);
    expect(daySummary(result.current.invoices, mv, shiftDate(today, -1)).sales).toBe(0);
  });

  it('filterBills searches by customer, number and item and honours the period', () => {
    const today = todayISO();
    const mk = (n: number, date: string, cust: string, bal = 0): Invoice => ({ id: `i${n}`, invoiceNumber: `INV-${n}`, customerId: 'c', customerName: cust, issueDate: date, dueDate: date, status: 'issued', paymentStatus: 'unpaid', items: [{ id: 'x', productId: 'p', productName: 'Tin', kg: 1, ratePerKg: 1, amount: 1 }], subtotal: 1, taxRatePct: 0, taxAmount: 0, totalAmount: 1, paidAmount: 0, balanceDue: bal, createdAt: date });
    const rows = [mk(1, today, 'Ali'), mk(2, shiftDate(today, -3), 'Zaman', 5), mk(3, shiftDate(today, -40), 'Ali')];
    expect(filterBills(rows, '', 'today', today).map((i) => i.id)).toEqual(['i1']);
    expect(filterBills(rows, '', 'week', today).map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(filterBills(rows, 'zam', 'all', today).map((i) => i.id)).toEqual(['i2']);
    expect(filterBills(rows, 'tin', 'all', today).length).toBe(3);
    expect(filterBills(rows, 'INV-3', 'all', today).map((i) => i.id)).toEqual(['i3']);
    expect(filterBills(rows, '', 'all', today, true).map((i) => i.id)).toEqual(['i2']);
  });
});
