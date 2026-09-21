import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn, OWNER, OPERATOR } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { stockByGodown } from '../utils/inventory';
import { buildJournal, trialBalance, accountTotals, DEFAULT_ACCOUNTS, ACC } from '../utils/accounting';
import { itemHistory, purchaseRegister, profitFromBills, billingReceivablesAging, overdueCustomers } from '../utils/stockReports';
import { Customer, LedgerEntry } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

const setup = async () => {
  localStorage.setItem('tradeflow_settings_v2', JSON.stringify({ id: 'default', appMode: 'billing', cashOpeningBalance: 0, cashOpeningDate: '2026-01-01', openingBankBalance: 0 }));
  localStorage.setItem('tradeflow_customers_v2', JSON.stringify([
    { id: 'c1', name: 'Zaman & Co', company: 'Zaman & Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
    { id: 'c2', name: 'Khan Store', company: 'Khan Store', phone: '0345', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]));
  localStorage.setItem('tradeflow_suppliers_v2', JSON.stringify([{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '0300', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' }]));
  localStorage.setItem('tradeflow_products_v2', JSON.stringify([
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, stockKg: 0, minThresholdKg: 0, trackBatches: true },
    { id: 'p2', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 0, minThresholdKg: 10 },
  ]));
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2'].forEach((k) => localStorage.setItem(k, '[]'));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const product = (h: Hook, id: string) => h.result.current.products.find((p) => p.id === id)!;
const journalOf = (h: Hook) => {
  const t = h.result.current;
  return buildJournal({ settings: t.settings, customers: t.customers, suppliers: t.suppliers, ledger: t.ledger, invoices: t.invoices, dispatches: t.dispatches, purchases: t.purchases, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, returns: t.returns, adjustments: t.adjustments });
};
const expectBalanced = (h: Hook) => {
  const tb = trialBalance(journalOf(h), DEFAULT_ACCOUNTS, '2099-12-31');
  expect(tb.balanced).toBe(true);
};
const expectConsistent = (h: Hook) => {
  const { products, stockBatches, godowns } = h.result.current;
  for (const p of products) {
    const sum = Object.values(stockByGodown(p, stockBatches, godowns)).reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100) / 100).toBe(p.stockKg);
  }
};
const receiveBatches = (h: Hook) => {
  act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 50, batchNo: 'LATE', expiryDate: shiftDate(today, 200), costPrice: 1800, supplierId: 's1' }); });
  act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 30, batchNo: 'EARLY', expiryDate: shiftDate(today, 20), costPrice: 1700, supplierId: 's1' }); });
  act(() => { h.result.current.receiveStock({ productId: 'p2', qty: 40, costPrice: 6000, supplierId: 's1' }); });
};

beforeEach(() => {
  localStorage.clear();
  (URL as any).createObjectURL = () => 'blob:test';
  (URL as any).revokeObjectURL = () => {};
});

describe('stock adjustment with a reason (godown / batch aware)', () => {
  it('a leak taken from one batch lowers that batch and the total, and posts a stock loss at the batch cost', async () => {
    const h = await setup();
    receiveBatches(h);
    const early = h.result.current.stockBatches.find((b) => b.batchNo === 'EARLY')!;
    let r: any;
    act(() => { r = h.result.current.adjustStockBy({ productId: 'p1', deltaQty: -4, reason: 'leaked', batchId: early.id, note: 'tins leaking' }); });
    expect(r.success).toBe(true);
    expect(product(h, 'p1').stockKg).toBe(76);
    expect(h.result.current.stockBatches.find((b) => b.id === early.id)!.qty).toBe(26);
    const adj = h.result.current.adjustments[0];
    expect(adj).toMatchObject({ reason: 'leaked', deltaKg: -4, batchId: early.id, batchNo: 'EARLY', costPerKg: 1700 });
    const totals = accountTotals(journalOf(h));
    expect(totals.get(ACC.STOCK_LOSSES)!.net).toBe(6800);
    expectBalanced(h);
    expectConsistent(h);
  });

  it('count correction up in a second godown adds plain stock there; received free posts to other income', async () => {
    const h = await setup();
    receiveBatches(h);
    let gid = '';
    act(() => { gid = h.result.current.addGodown('Batkhela')!.godown!.id; });
    act(() => { h.result.current.adjustStockBy({ productId: 'p2', deltaQty: 3, reason: 'count', godownId: gid }); });
    expect(product(h, 'p2').stockKg).toBe(43);
    expect(stockByGodown(product(h, 'p2'), h.result.current.stockBatches, h.result.current.godowns)[gid]).toBe(3);
    act(() => { h.result.current.adjustStockBy({ productId: 'p2', deltaQty: 2, reason: 'free' }); });
    const totals = accountTotals(journalOf(h));
    expect(totals.get(ACC.OTHER_INCOME)!.net).toBe(-12000);
    expect(totals.get(ACC.STOCK_LOSSES)!.net).toBe(-18000);
    expectBalanced(h);
    expectConsistent(h);
  });

  it('refuses taking more than the godown holds, and dates in a closed period', async () => {
    const h = await setup();
    receiveBatches(h);
    let r: any;
    act(() => { r = h.result.current.adjustStockBy({ productId: 'p2', deltaQty: -41, reason: 'damage' }); });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/Only 40 tin/);
    act(() => { h.result.current.updateSettings({ booksLockedUntil: today }); });
    act(() => { r = h.result.current.adjustStockBy({ productId: 'p2', deltaQty: -1, reason: 'damage' }); });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/closed/);
    expect(product(h, 'p2').stockKg).toBe(40);
  });

  it('undo puts the stock back into the same batch', async () => {
    const h = await setup();
    receiveBatches(h);
    const late = h.result.current.stockBatches.find((b) => b.batchNo === 'LATE')!;
    act(() => { h.result.current.adjustStockBy({ productId: 'p1', deltaQty: -5, reason: 'expired', batchId: late.id }); });
    const id = h.result.current.adjustments[0].id;
    let r: any;
    act(() => { r = h.result.current.undoStockAdjustment(id); });
    expect(r.success).toBe(true);
    expect(h.result.current.stockBatches.find((b) => b.id === late.id)!.qty).toBe(50);
    expect(product(h, 'p1').stockKg).toBe(80);
    expect(h.result.current.adjustments.some((a) => a.id === id)).toBe(false);
    expectConsistent(h);
  });
});

describe('purchase return (debit note)', () => {
  it('takes stock out of the batch, lowers what you owe the supplier and posts Dr Payable / Cr Inventory', async () => {
    const h = await setup();
    receiveBatches(h);
    const owedBefore = h.result.current.suppliers[0].totalOwed;
    const early = h.result.current.stockBatches.find((b) => b.batchNo === 'EARLY')!;
    let r: any;
    act(() => { r = h.result.current.returnToSupplier({ supplierId: 's1', productId: 'p1', qty: 10, rate: 1700, reason: 'leaking', batchId: early.id }); });
    expect(r.success).toBe(true);
    const ret = r.stockReturn;
    expect(ret.returnNumber).toBe('DN-1');
    expect(ret.batches).toEqual([expect.objectContaining({ batchNo: 'EARLY', qty: 10 })]);
    expect(product(h, 'p1').stockKg).toBe(70);
    expect(h.result.current.stockBatches.find((b) => b.id === early.id)!.qty).toBe(20);
    expect(h.result.current.suppliers[0].totalOwed).toBe(owedBefore - 17000);
    expect(h.result.current.ledger.find((l) => l.type === 'debit_note')).toMatchObject({ credit: 17000, referenceId: 'DN-1' });
    const e = journalOf(h).find((j) => j.sourceType === 'purchase_return')!;
    expect(e.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: ACC.PAYABLE, debit: 17000 }), expect.objectContaining({ accountCode: ACC.INVENTORY, credit: 17000 })]));
    expectBalanced(h);
    expectConsistent(h);

    // Deleting the debit note puts everything back.
    act(() => { r = h.result.current.deletePurchaseReturn(ret.id); });
    expect(r.success).toBe(true);
    expect(product(h, 'p1').stockKg).toBe(80);
    expect(h.result.current.stockBatches.find((b) => b.id === early.id)!.qty).toBe(30);
    expect(h.result.current.suppliers[0].totalOwed).toBe(owedBefore);
    expect(h.result.current.ledger.some((l) => l.type === 'debit_note')).toBe(false);
    expectConsistent(h);
  });

  it('refuses to send back more than is in stock', async () => {
    const h = await setup();
    receiveBatches(h);
    let r: any;
    act(() => { r = h.result.current.returnToSupplier({ supplierId: 's1', productId: 'p2', qty: 50, rate: 6000, reason: 'wrong item' }); });
    expect(r.success).toBe(false);
    expect(h.result.current.returns).toHaveLength(0);
  });
});

describe('item history, purchase register and profit from bills', () => {
  const sellAndMove = (h: Hook) => {
    // Each step a second apart, as in real use, so the history order is well defined.
    const t0 = Date.now();
    let step = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    const tick = () => vi.setSystemTime(t0 + ++step * 1000);
    try {
      sellAndMoveSteps(h, tick);
    } finally {
      vi.useRealTimers();
    }
  };
  const sellAndMoveSteps = (h: Hook, tick: () => void) => {
    tick();
    receiveBatches(h);
    tick();
    act(() => { h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: '15.7 kgs Tin', qty: 10, unitPrice: 6535 }], paidNow: 0, discount: 350 }); });
    tick();
    act(() => { h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p2', name: '15.7 kgs Tin', qty: 5, unitPrice: 6600 }, { productId: 'p1', name: '5 kgs Can', qty: 6, unitPrice: 2065 }], paidNow: 0 }); });
    tick();
    act(() => { h.result.current.adjustStockBy({ productId: 'p2', deltaQty: -1, reason: 'damage' }); });
    tick();
    act(() => { h.result.current.returnToSupplier({ supplierId: 's1', productId: 'p2', qty: 2, rate: 6000, reason: 'dented' }); });
    let gid = '';
    tick();
    act(() => { gid = h.result.current.addGodown('Shop 2')!.godown!.id; });
    tick();
    act(() => { h.result.current.transferStock({ productId: 'p2', fromGodownId: h.result.current.godowns[0].id, toGodownId: gid, qty: 4 }); });
  };

  it('item history lists receipts, bill sales, adjustments, returns and moves with a running balance ending at the stock', async () => {
    const h = await setup();
    sellAndMove(h);
    const t = h.result.current;
    const hist = itemHistory('p2', { products: t.products, customers: t.customers, suppliers: t.suppliers, invoices: t.invoices, purchases: t.purchases, returns: t.returns, adjustments: t.adjustments, stockTransfers: t.stockTransfers, dispatches: t.dispatches, godowns: t.godowns });
    expect([...hist.rows.map((r) => r.kind)].sort()).toEqual(['adjusted', 'received', 'returned_out', 'sold', 'sold', 'transferred']);
    expect(hist.rows.slice(0, 3).map((r) => r.balance)).toEqual([40, 30, 25]);
    expect(hist.rows[1].label).toMatch(/^Sold on bill INV-1/);
    expect(hist.rows[1].party).toBe('Zaman & Co');
    // Each line's balance is the one before plus its change; the move between godowns changes nothing.
    hist.rows.forEach((r, i) => i > 0 && expect(r.balance).toBe(Math.round((hist.rows[i - 1].balance + r.change) * 100) / 100));
    expect(hist.rows.find((r) => r.kind === 'transferred')!.change).toBe(0);
    expect(hist.rows[hist.rows.length - 1].balance).toBe(22);
    expect(hist.closing).toBe(product(h, 'p2').stockKg);
    expect(hist.opening).toBe(0);
  });

  it('shows stock the records cannot explain as an opening line', async () => {
    const h = await setup();
    act(() => { h.result.current.updateProduct('p2', { stockKg: 12 }); });
    const t = h.result.current;
    const hist = itemHistory('p2', { products: t.products, customers: t.customers, suppliers: t.suppliers, invoices: t.invoices, purchases: t.purchases, returns: t.returns, adjustments: t.adjustments, stockTransfers: t.stockTransfers, godowns: t.godowns });
    expect(hist.rows[0]).toMatchObject({ kind: 'opening', balance: 12 });
  });

  it('purchase register lists receipts and returns with filters and totals', async () => {
    const h = await setup();
    sellAndMove(h);
    const t = h.result.current;
    const all = purchaseRegister(t, { from: today, to: today });
    expect(all.received).toBe(50 * 1800 + 30 * 1700 + 40 * 6000);
    expect(all.returned).toBe(12000);
    expect(all.net).toBe(all.received - 12000);
    const tins = purchaseRegister(t, { productId: 'p2' });
    expect(tins.rows.map((r) => [r.kind, r.qty])).toEqual(expect.arrayContaining([['purchase', 40], ['return', -2]]));
    expect(purchaseRegister(t, { from: shiftDate(today, 1), to: shiftDate(today, 2) }).rows).toHaveLength(0);
  });

  it('profit by item and by customer uses the same cost as the journal (COGS) and shares the bill discount', async () => {
    const h = await setup();
    sellAndMove(h);
    const t = h.result.current;
    const rep = profitFromBills(t, today, today);
    const tin = rep.byItem.find((r) => r.key === 'p2')!;
    // 10 × 6535 − 350 discount + 5 × 6600 = 98,000 sales; 15 tins at 6,000 cost.
    expect(tin.qty).toBe(15);
    expect(tin.sales).toBe(98000);
    expect(tin.cost).toBe(90000);
    expect(tin.profit).toBe(8000);
    const can = rep.byItem.find((r) => r.key === 'p1')!;
    expect(can.cost).toBe(6 * 1700); // earliest-expiry batch cost captured on the bill line
    const zaman = rep.byCustomer.find((r) => r.key === 'c1')!;
    expect(zaman).toMatchObject({ bills: 1, sales: 65000, cost: 60000, profit: 5000 });
    // The report's total cost equals Cost of goods sold in the accounts for these bills.
    const cogs = accountTotals(journalOf(h)).get(ACC.COGS)!.net;
    expect(rep.totals.cost).toBe(cogs);
    expect(rep.totals.bills).toBe(2);
    expectBalanced(h);
  });
});

describe('aging in billing mode', () => {
  const led = (over: Partial<LedgerEntry>): LedgerEntry => ({ id: Math.random().toString(36), entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'INV', date: today, description: '', debit: 0, credit: 0, balanceAfter: 0, ...over });
  const cust = (over: Partial<Customer>): Customer => ({ id: 'c1', name: 'Zaman', company: '', phone: '', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01', ...over });

  it('buckets bills by age with payments clearing the oldest first, and ages an opening balance from the day the account was made', async () => {
    const asOf = '2026-09-21';
    const ledger = [
      led({ date: '2026-06-01', debit: 1000 }), // 112 days
      led({ date: '2026-08-01', debit: 500 }), // 51 days
      led({ date: '2026-09-15', debit: 300 }), // 6 days
      led({ type: 'payment_received', date: '2026-09-20', credit: 700 }),
    ];
    const rows = billingReceivablesAging([cust({ totalDue: 1100 + 200, createdAt: '2026-03-01' })], ledger, asOf);
    // 200 not explained by history → opening balance dated 2026-03-01, which the payment clears first.
    expect(rows[0]).toMatchObject({ d90plus: 500, d31_60: 500, current: 300, total: 1300 });
  });

  it('flags customers with money owed for over 60 days, or over their credit limit', async () => {
    const asOf = '2026-09-21';
    const customers = [cust({ id: 'c1', totalDue: 1000 }), cust({ id: 'c2', name: 'Khan', totalDue: 500, creditLimit: 400 }), cust({ id: 'c3', name: 'New', totalDue: 300 })];
    const ledger = [led({ entityId: 'c1', date: '2026-07-01', debit: 1000 }), led({ entityId: 'c2', date: '2026-09-10', debit: 500 }), led({ entityId: 'c3', date: '2026-09-01', debit: 300 })];
    const out = overdueCustomers(customers, ledger, asOf);
    expect(out.map((o) => o.customer.id)).toEqual(['c1', 'c2']);
    expect(out[0]).toMatchObject({ oldAmount: 1000, overLimit: false });
    expect(out[1]).toMatchObject({ oldAmount: 0, overLimit: true });
  });
});
