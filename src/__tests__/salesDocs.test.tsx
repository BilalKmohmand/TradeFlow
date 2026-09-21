import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn, OWNER, OPERATOR } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { buildJournal, trialBalance, accountTotals, DEFAULT_ACCOUNTS, ACC } from '../utils/accounting';
import { collectCashMovements, accountBalancesOn } from '../utils/finance';
import { buildDailySheet } from '../utils/billing';
import { buildMovements } from '../utils/stockFlow';
import { lineDiscountAmount, planReturn, returnableQty, maxRefund, billBalance, quotationLines, quotationStatusOn } from '../utils/salesDocs';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { Invoice, Quotation } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

const setup = async (opts: { taxRatePct?: number } = {}) => {
  localStorage.setItem('tradeflow_customers_v2', JSON.stringify([{ id: 'c1', name: 'Zaman & Co', company: 'Zaman & Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]));
  localStorage.setItem('tradeflow_suppliers_v2', JSON.stringify([{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '0300', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' }]));
  localStorage.setItem('tradeflow_products_v2', JSON.stringify([
    { id: 'p1', name: '5 kg Can', category: 'General', unit: 'can', unitPricePerKg: 2000, costPricePerKg: 1500, stockKg: 100, minThresholdKg: 0 },
    { id: 'p2', name: '16 kg Tin', category: 'General', unit: 'tin', unitPricePerKg: 6000, costPricePerKg: 5000, stockKg: 50, minThresholdKg: 0 },
    { id: 'p3', name: 'Ghee 1 kg', category: 'General', unit: 'pack', unitPricePerKg: 500, stockKg: 0, minThresholdKg: 0, trackBatches: true },
  ]));
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2', 'tradeflow_quotations_v2', 'tradeflow_agreed_rates_v1'].forEach((k) => localStorage.setItem(k, '[]'));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
  act(() => {
    hook.result.current.updateSettings({ cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: opts.taxRatePct ?? 0 });
  });
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;

const books = (h: Hook) => {
  const t = h.result.current;
  return buildJournal({ settings: t.settings, customers: t.customers, suppliers: t.suppliers, ledger: t.ledger, invoices: t.invoices, dispatches: t.dispatches, purchases: t.purchases, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, returns: t.returns, adjustments: t.adjustments });
};
const net = (h: Hook, code: string) => accountTotals(books(h)).get(code)?.net ?? 0;
const balanced = (h: Hook) => expect(trialBalance(books(h), DEFAULT_ACCOUNTS, today).balanced).toBe(true);
const bill = (h: Hook, id: string) => h.result.current.invoices.find((i) => i.id === id)!;
const stock = (h: Hook, id: string) => h.result.current.products.find((p) => p.id === id)!.stockKg;
const due = (h: Hook) => h.result.current.customers.find((c) => c.id === 'c1')!.totalDue;
const cash = (h: Hook) => {
  const t = h.result.current;
  return accountBalancesOn(collectCashMovements(t.ledger, t.expenses, t.cashEntries, t.customers, t.suppliers), t.settings, today).cash;
};

const makeBill = (h: Hook, input: Partial<Parameters<Hook['result']['current']['createBill']>[0]> = {}) => {
  let r: ReturnType<Hook['result']['current']['createBill']> | undefined;
  act(() => {
    r = h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: '5 kg Can', qty: 10, unitPrice: 2000 }], ...input } as any);
  });
  expect(r?.success, r?.message).toBe(true);
  return r!.invoice!;
};

beforeEach(() => {
  localStorage.clear();
  (URL as any).createObjectURL = () => 'blob:test';
  (URL as any).revokeObjectURL = () => {};
});

describe('line discounts', () => {
  it('works out Rs. and % discounts and never more than the line', async () => {
    expect(lineDiscountAmount(10, 2000, 'rs', 500)).toBe(500);
    expect(lineDiscountAmount(10, 2000, 'pct', 5)).toBe(1000);
    expect(lineDiscountAmount(1, 100, 'rs', 500)).toBe(100);
    expect(lineDiscountAmount(1, 100, 'pct', 150)).toBe(100);
    expect(lineDiscountAmount(1, 100, 'pct', 0)).toBe(0);
  });

  it('bill totals, line amounts and the journal (Sales gross, Discounts 4010 = line + bill discounts) agree', async () => {
    const h = await setup();
    const inv = makeBill(h, {
      items: [
        { productId: 'p1', name: '5 kg Can', qty: 10, unitPrice: 2000, discountType: 'pct', discountValue: 5 },
        { productId: 'p2', name: '16 kg Tin', qty: 2, unitPrice: 6000, discountType: 'rs', discountValue: 500 },
      ],
      discount: 300,
    });
    const saved = bill(h, inv.id);
    expect(saved.items.map((i) => i.amount)).toEqual([19000, 11500]);
    expect(saved.items.map((i) => i.discountAmount)).toEqual([1000, 500]);
    expect(saved.subtotal).toBe(30500);
    expect(saved.discount).toBe(300);
    expect(saved.totalAmount).toBe(30200);
    expect(due(h)).toBe(30200);
    // Sales at gross (32,000), discounts 1,500 line + 300 bill.
    expect(net(h, ACC.SALES)).toBe(-32000);
    expect(net(h, ACC.SALES_DISCOUNTS)).toBe(1800);
    expect(net(h, ACC.RECEIVABLE)).toBe(30200);
    balanced(h);
  });
});

describe('sales returns against a bill', () => {
  it('credit return: stock back, customer owes less, bill shows returned amount, journal balanced', async () => {
    const h = await setup();
    const inv = makeBill(h, { items: [{ productId: 'p1', name: '5 kg Can', qty: 10, unitPrice: 2000 }, { productId: 'p2', name: '16 kg Tin', qty: 2, unitPrice: 6000 }] });
    expect(stock(h, 'p1')).toBe(90);
    const line1 = bill(h, inv.id).items[0];
    let r: any;
    act(() => { r = h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: line1.id, qty: 3 }], settle: 'credit', reason: 'Dented cans' }); });
    expect(r.success, r.message).toBe(true);
    expect(r.stockReturn.returnNumber).toBe('CN-1');
    // Stock flow shows one movement per returned item.
    const flow = buildMovements(h.result.current.purchases, h.result.current.dispatches, { customers: h.result.current.customers, suppliers: [], products: h.result.current.products, bookings: [], returns: h.result.current.returns });
    expect(flow.filter((m) => m.kind === 'return').map((m) => [m.productId, m.kg])).toEqual([['p1', 3]]);
    expect(r.stockReturn.amount).toBe(6000);
    expect(stock(h, 'p1')).toBe(93);
    expect(due(h)).toBe(26000);
    const b = bill(h, inv.id);
    expect(b.returnedAmount).toBe(6000);
    expect(b.balanceDue).toBe(26000);
    expect(returnableQty(b, h.result.current.returns).get(line1.id)).toBe(7);
    // Journal: Dr Sales returns 6,000 / Cr AR; stock back at cost 3 × 1,500.
    expect(net(h, ACC.SALES_RETURNS)).toBe(6000);
    expect(net(h, ACC.RECEIVABLE)).toBe(26000);
    expect(net(h, ACC.COGS)).toBe(10 * 1500 + 2 * 5000 - 3 * 1500);
    balanced(h);

    // Cannot bring back more than was sold minus already returned.
    act(() => { r = h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: line1.id, qty: 8 }], settle: 'credit' }); });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/only 7/);
    // The bill cannot be deleted while it has a return; the return can, and undoes everything.
    let d: any;
    act(() => { d = h.result.current.deleteBill(inv.id); });
    expect(d.success).toBe(false);
    act(() => { d = h.result.current.deleteReturn(h.result.current.returns[0].id); });
    expect(d.success).toBe(true);
    expect(stock(h, 'p1')).toBe(90);
    expect(due(h)).toBe(32000);
    expect(bill(h, inv.id).balanceDue).toBe(32000);
    expect(bill(h, inv.id).returnedAmount).toBe(0);
    expect(h.result.current.ledger.some((l) => l.type === 'credit_note')).toBe(false);
    balanced(h);
  });

  it('refund return on a cash bill: money goes out of cash, customer balance unchanged, journal Cr Cash', async () => {
    const h = await setup();
    const inv = makeBill(h, { paidNow: 20000, paymentMethod: 'Cash' });
    expect(cash(h)).toBe(30000);
    let r: any;
    act(() => { r = h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: inv.items[0].id, qty: 2 }], settle: 'refund', refundMethod: 'Cash' }); });
    expect(r.success, r.message).toBe(true);
    expect(r.stockReturn.refundAmount).toBe(4000);
    expect(cash(h)).toBe(26000);
    expect(due(h)).toBe(0);
    const b = bill(h, inv.id);
    expect(b.balanceDue).toBe(0);
    expect(b.refundedAmount).toBe(4000);
    expect(h.result.current.ledger.find((l) => l.type === 'refund_paid')!.debit).toBe(4000);
    expect(net(h, ACC.CASH)).toBe(26000);
    // The refund shows on the daily sheet as money out.
    const t = h.result.current;
    const sheet = buildDailySheet({ invoices: t.invoices, ledger: t.ledger, expenses: t.expenses, cashEntries: t.cashEntries, customers: t.customers, suppliers: t.suppliers, settings: t.settings }, today);
    expect(sheet.other.map((m) => m.amount)).toContain(4000);
    expect(sheet.cashOut).toBe(4000);
    expect(net(h, ACC.SALES_RETURNS)).toBe(4000);
    expect(net(h, ACC.RECEIVABLE)).toBe(0);
    balanced(h);
    // Deleting the return puts the cash back too.
    act(() => { h.result.current.deleteReturn(r.stockReturn.id); });
    expect(cash(h)).toBe(30000);
    expect(bill(h, inv.id).refundedAmount).toBe(0);
    balanced(h);
  });

  it('refund is refused on an unpaid bill; partly paid bill refunds only what is over the new total', async () => {
    const h = await setup();
    const unpaid = makeBill(h);
    let r: any;
    act(() => { r = h.result.current.returnBillItems({ invoiceId: unpaid.id, lines: [{ billLineId: unpaid.items[0].id, qty: 1 }], settle: 'refund' }); });
    expect(r.success).toBe(false);
    const part = makeBill(h, { paidNow: 19000 });
    // 20,000 bill, 19,000 paid; return 2 cans (4,000) → new total 16,000 → refund 3,000, 1,000 off the balance.
    expect(maxRefund(bill(h, part.id), 4000)).toBe(3000);
    act(() => { r = h.result.current.returnBillItems({ invoiceId: part.id, lines: [{ billLineId: part.items[0].id, qty: 2 }], settle: 'refund' }); });
    expect(r.success, r.message).toBe(true);
    expect(r.stockReturn.refundAmount).toBe(3000);
    expect(bill(h, part.id).balanceDue).toBe(0);
    balanced(h);
  });

  it('shares out the bill discount and reverses tax to Sales tax payable; returning everything clears the bill exactly', async () => {
    const h = await setup({ taxRatePct: 17 });
    const inv = makeBill(h, { items: [{ productId: 'p1', name: '5 kg Can', qty: 3, unitPrice: 1000, discountType: 'rs', discountValue: 100 }], discount: 100 });
    const b0 = bill(h, inv.id);
    // subtotal 2,900, bill discount 100 → 2,800 + 17% = 3,276
    expect(b0.totalAmount).toBe(3276);
    const plan = planReturn(b0, [], [{ billLineId: b0.items[0].id, qty: 1 }]);
    expect(plan.goods).toBe(933.33);
    expect(plan.tax).toBe(158.67);
    let r: any;
    act(() => { r = h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: b0.items[0].id, qty: 1 }], settle: 'credit' }); });
    expect(r.success).toBe(true);
    act(() => { r = h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: b0.items[0].id, qty: 2 }], settle: 'credit' }); });
    expect(r.success).toBe(true);
    const b = bill(h, inv.id);
    expect(b.returnedAmount).toBe(3276);
    expect(billBalance(b)).toBe(0);
    expect(due(h)).toBe(0);
    expect(net(h, ACC.SALES_TAX)).toBe(0);
    expect(net(h, ACC.RECEIVABLE)).toBe(0);
    balanced(h);
  });

  it('batch items go back into the batch they were sold from', async () => {
    const h = await setup();
    act(() => { h.result.current.receiveStock({ productId: 'p3', qty: 10, batchNo: 'OLD', expiryDate: shiftDate(today, 30) }); });
    act(() => { h.result.current.receiveStock({ productId: 'p3', qty: 10, batchNo: 'NEW', expiryDate: shiftDate(today, 300) }); });
    const inv = makeBill(h, { items: [{ productId: 'p3', name: 'Ghee 1 kg', qty: 12, unitPrice: 500 }] });
    const batch = (no: string) => h.result.current.stockBatches.find((b) => b.batchNo === no)!.qty;
    expect(batch('OLD')).toBe(0);
    expect(batch('NEW')).toBe(8);
    act(() => { h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: inv.items[0].id, qty: 3 }], settle: 'credit' }); });
    // Latest batch first: the 2 from NEW, then 1 from OLD.
    expect(batch('NEW')).toBe(10);
    expect(batch('OLD')).toBe(1);
    expect(stock(h, 'p3')).toBe(11);
    act(() => { h.result.current.deleteReturn(h.result.current.returns[0].id); });
    expect(batch('NEW')).toBe(8);
    expect(batch('OLD')).toBe(0);
    expect(stock(h, 'p3')).toBe(8);
  });

  it('refuses a return dated inside a closed period', async () => {
    const h = await setup();
    const inv = makeBill(h, { date: shiftDate(today, -10) });
    act(() => { h.result.current.updateSettings({ booksLockedUntil: shiftDate(today, -5) }); });
    let r: any;
    act(() => { r = h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: inv.items[0].id, qty: 1 }], settle: 'credit', date: shiftDate(today, -7) }); });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/closed/);
    act(() => { r = h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: inv.items[0].id, qty: 1 }], settle: 'credit' }); });
    expect(r.success).toBe(true);
  });
});

describe('quotations', () => {
  it('saves a multi-item quote, converts to a bill, and deleting the bill frees the quote again', async () => {
    const h = await setup();
    let q: any;
    act(() => {
      q = h.result.current.saveBillQuotation({ customerId: 'c1', items: [{ productId: 'p1', productName: '5 kg Can', qty: 20, unitPrice: 1950, unit: 'can' }, { productId: 'p2', productName: '16 kg Tin', qty: 5, unitPrice: 5900, unit: 'tin' }], validUntil: shiftDate(today, 7) });
    });
    expect(q.success, q.message).toBe(true);
    expect(q.quotation.quoteNumber).toBe('QT-1');
    expect(q.quotation.amount).toBe(20 * 1950 + 5 * 5900);
    const inv = makeBill(h, { items: [{ productId: 'p1', name: '5 kg Can', qty: 20, unitPrice: 1950 }], quotationId: q.quotation.id });
    let saved = h.result.current.quotations.find((x) => x.id === q.quotation.id)!;
    expect(saved.status).toBe('converted');
    expect(saved.invoiceId).toBe(inv.id);
    expect(bill(h, inv.id).quotationId).toBe(q.quotation.id);
    act(() => { h.result.current.deleteBill(inv.id); });
    saved = h.result.current.quotations.find((x) => x.id === q.quotation.id)!;
    expect(saved.status).toBe('accepted');
    // Validation
    let bad: any;
    act(() => { bad = h.result.current.saveBillQuotation({ customerId: 'c1', items: [], validUntil: today }); });
    expect(bad.success).toBe(false);
  });

  it('older single-item quotes read as one line; past valid-until shows as expired', async () => {
    const old = { id: 'q', quoteNumber: 'QT-2026-1', customerId: 'c1', productId: 'p1', kg: 5, pricePerKg: 10, amount: 50, validUntil: '2026-01-01', status: 'sent', createdAt: '2026-01-01' } as Quotation;
    expect(quotationLines(old, () => 'Can')).toEqual([{ productId: 'p1', productName: 'Can', qty: 5, unitPrice: 10 }]);
    expect(quotationStatusOn(old, '2026-02-01')).toBe('expired');
    expect(quotationStatusOn({ ...old, status: 'converted' }, '2026-02-01')).toBe('converted');
  });
});

describe('customer rates', () => {
  it('stores one rate per customer and item, editable, and marks bill lines made at that rate', async () => {
    const h = await setup();
    act(() => { h.result.current.setCustomerAgreedRate('c1', 'p1', 1900); });
    act(() => { h.result.current.setCustomerAgreedRate('c1', 'p1', 1880); });
    expect(h.result.current.customerAgreedRates.filter((r) => r.customerId === 'c1')).toHaveLength(1);
    expect(h.result.current.getCustomerAgreedRate('c1', 'p1')).toBe(1880);
    expect(h.result.current.getCustomerAgreedRate('c1', 'p2')).toBeNull();
    const inv = makeBill(h, { items: [{ productId: 'p1', name: '5 kg Can', qty: 1, unitPrice: 1880, customerRate: true }] });
    expect(bill(h, inv.id).items[0].customerRate).toBe(true);
    act(() => { h.result.current.deleteCustomerAgreedRate(h.result.current.customerAgreedRates.find((r) => r.customerId === 'c1')!.id); });
    expect(h.result.current.getCustomerAgreedRate('c1', 'p1')).toBeNull();
  });
});

// Keep the Invoice import used for type-only helpers.
export type _Inv = Invoice;
