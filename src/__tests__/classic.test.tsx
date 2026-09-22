/**
 * The "Apna Accountant" layer: purchase invoices (discount + other charges posting), delivery orders
 * and the pending delivery list, memo no. / search, automatic numbers, the classic menu and every new
 * report against hand-computed figures.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { ACC, accountBalance, buildJournal, trialBalance, mergeAccounts, balanceSheet } from '../utils/accounting';
import { landedPosting, purchaseInvoiceTotals, matchesPurchaseInvoice } from '../utils/purchaseInvoices';
import { REPORTS, ReportData, ReportFilter, ReportId, bookBalances, dailyGrossProfit, dailyPurchase, dailySale, deliveryBills, productTotals, rateList, receivablePayable, reportCsv, stockOn, trialBalanceBetween, defaultFilter } from '../utils/classicReports';
import { BOOKS_MENU, CLASSIC_BUTTONS, PARTNER_SCREENS, REPORTS_MENU, allMenuEntries, isSubmenu, resolveTarget, screenAvailable } from '../utils/classicMenu';
import { filterBills } from '../utils/billing';
import { findBillByNumber } from '../components/billing/NewBillModal';
import { findPurchaseInvoice } from '../components/billing/classic/PurchaseInvoiceModal';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();
const D1 = shiftDate(today, -2);
const D2 = shiftDate(today, -1);
const D3 = today;

const setup = async (who?: typeof OPERATOR) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 10000, openingBankBalance: 0, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', code: 'C-0001', name: 'Haji Karim', company: 'Karim Store', phone: '0300', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', code: 'S-0001', name: 'Ahmed', company: 'Dalda Foods', phone: '0300 1234567', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', code: '101', name: 'Dalda Ghee 16 kg tin', category: 'Ghee', unit: 'tin', unitPricePerKg: 7000, costPricePerKg: 6000, stockKg: 4, minThresholdKg: 10 },
    { id: 'p2', code: '102', name: 'Habib Cooking Oil 5 L', category: 'Oil', unit: 'can', unitPricePerKg: 2400, costPricePerKg: 2000, stockKg: 2, minThresholdKg: 6, packName: 'carton', packSize: 4 },
    { id: 'p3', code: '103', name: 'Salt 1 kg', category: 'General', unit: 'pcs', unitPricePerKg: 50, costPricePerKg: 40, stockKg: 100, minThresholdKg: 10 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_purchase_orders_v2'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, who);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => {
    out = fn();
  });
  return out!;
};
const ok = <T extends { success: boolean; message: string }>(r: T) => {
  if (!r.success) throw new Error(r.message);
  return r;
};
const journalOf = (s: ReturnType<typeof useTrading>) =>
  buildJournal({ settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices, purchases: s.purchases, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products, returns: s.returns, adjustments: s.adjustments });
const dataOf = (s: ReturnType<typeof useTrading>): ReportData => ({
  settings: s.settings, customers: s.customers, suppliers: s.suppliers, products: s.products, invoices: s.invoices, purchases: s.purchases, returns: s.returns, adjustments: s.adjustments,
  stockTransfers: s.stockTransfers, stockBatches: s.stockBatches, godowns: s.godowns, ledger: s.ledger, expenses: s.expenses, cashEntries: s.cashEntries, purchaseInvoices: s.purchaseInvoices,
  journal: journalOf(s), accounts: mergeAccounts(s.customAccounts),
});
const expectBalanced = (h: Hook) => {
  const s = h.result.current;
  const j = journalOf(s);
  expect(trialBalance(j, mergeAccounts(s.customAccounts), today).balanced).toBe(true);
  // Payable in the books equals the Suppliers screen, Receivable equals the Customers screen.
  expect(Math.round(-accountBalance(j, ACC.PAYABLE, today) * 100) / 100 + 0).toBe(Math.round(s.suppliers.reduce((a, x) => a + x.totalOwed, 0) * 100) / 100);
  expect(Math.round(accountBalance(j, ACC.RECEIVABLE, today) * 100) / 100 + 0).toBe(Math.round(s.customers.reduce((a, x) => a + x.totalDue, 0) * 100) / 100);
  return j;
};

beforeEach(() => localStorage.clear());

// ---------------------------------------------------------------------------
describe('purchase invoice arithmetic', () => {
  it('spreads discount and other charges over the lines by amount', () => {
    const lines = [{ qty: 10, rate: 6000 }, { qty: 8, rate: 2000 }];
    const t = purchaseInvoiceTotals(lines, { discountPct: 5, otherCharges: 1520 });
    expect(t).toEqual({ gross: 76000, discount: 3800, charges: 1520, total: 73720 });
    const p = landedPosting(lines, t);
    // 73,720 / 76,000 = 0.97 → 6000 → 5820, 2000 → 1940.
    expect(p.rates).toEqual([5820, 1940]);
    expect(p.posted).toBe(73720);
    expect(p.rounding).toBe(0);
  });
  it('an amount discount is capped at the gross; the paisa left over is the rounding', () => {
    expect(purchaseInvoiceTotals([{ qty: 1, rate: 100 }], { discountAmount: 500 }).total).toBe(0);
    const t = purchaseInvoiceTotals([{ qty: 3, rate: 1000 }], { discountAmount: 100 });
    const p = landedPosting([{ qty: 3, rate: 1000 }], t);
    expect(p.rates).toEqual([966.67]);
    expect(p.posted).toBe(2900.01);
    expect(p.rounding).toBe(-0.01);
  });
  it('search matches number, memo, supplier and item', () => {
    const inv = { invoiceNumber: 'P-12', memoNo: 'DF-4471', supplierName: 'Dalda Foods', lines: [{ productName: 'Dalda Ghee' }] };
    expect(matchesPurchaseInvoice(inv, 'p-12')).toBe(true);
    expect(matchesPurchaseInvoice(inv, '4471')).toBe(true);
    expect(matchesPurchaseInvoice(inv, 'ghee')).toBe(true);
    expect(matchesPurchaseInvoice(inv, 'habib')).toBe(false);
    const list = [{ id: 'a', invoiceNumber: 'P-12', memoNo: 'DF-4471' }, { id: 'b', invoiceNumber: 'P-120' }];
    expect(findPurchaseInvoice(list, '12')?.id).toBe('a');
    expect(findPurchaseInvoice(list, 'df-4471')?.id).toBe('a');
    expect(findPurchaseInvoice(list, 'P-120')?.id).toBe('b');
    expect(findPurchaseInvoice(list, '7')).toBeUndefined();
  });
});

describe('purchase invoice in the app', () => {
  it('discount + other charges + paid now: stock at landed cost, supplier owed the bill total, books balanced', async () => {
    const h = await setup();
    const r = () => h.result.current;
    expect(r().previewPurchaseInvoiceNumber()).toBe('P-1');
    const res = run(() => ok(r().createPurchaseInvoice({
      supplierId: 's1', date: D1, memoNo: 'DF-4471',
      lines: [{ productId: 'p1', qty: 10, rate: 6000 }, { productId: 'p2', qty: 8, rate: 2000, packs: 2 }],
      discountPct: 5, otherCharges: 1520, paidNow: 20000, paidMethod: 'Cash', remarks: 'Truck LES-12',
    })));
    const inv = res.invoice!;
    expect(inv.invoiceNumber).toBe('P-1');
    expect(inv.totalAmount).toBe(73720);
    expect(inv.discountAmount).toBe(3800);
    expect(inv.lines.map((l) => l.landedRate)).toEqual([5820, 1940]);
    expect(inv.lines[1]).toMatchObject({ packs: 2, packName: 'carton', packSize: 4 });
    // Stock in, at the landed cost.
    expect(r().products.find((p) => p.id === 'p1')!.stockKg).toBe(14);
    expect(r().products.find((p) => p.id === 'p2')!.stockKg).toBe(10);
    const buys = r().purchases.filter((p) => inv.lines.some((l) => l.purchaseId === p.id));
    expect(buys.map((b) => b.pricePerKg).sort()).toEqual([1940, 5820]);
    // Supplier: 73,720 owed, 20,000 paid.
    expect(r().suppliers[0].totalOwed).toBe(53720);
    const rows = r().ledger.filter((l) => l.entityId === 's1');
    expect(rows.filter((l) => l.type === 'purchase_received').every((l) => l.description.startsWith('Purchase invoice P-1 (bill DF-4471)'))).toBe(true);
    expect(rows.find((l) => l.type === 'payment_made')).toMatchObject({ credit: 20000, method: 'Cash', sourceId: inv.id });
    const j = expectBalanced(h);
    // Journal: Inventory debited with the bill total by the receipts, cash paid 20,000.
    const purchaseDr = j.filter((e) => e.sourceType === 'purchase').reduce((a, e) => a + e.lines.filter((l) => l.accountCode === ACC.INVENTORY).reduce((x, l) => x + l.debit, 0), 0);
    expect(Math.round(purchaseDr * 100) / 100).toBe(73720);
    expect(accountBalance(j, ACC.CASH, today)).toBe(10000 - 20000);
    // A second bill with the same supplier bill no. is refused.
    const dup = run(() => r().createPurchaseInvoice({ supplierId: 's1', memoNo: 'df-4471', lines: [{ productId: 'p3', qty: 1, rate: 40 }] }));
    expect(dup.success).toBe(false);
    expect(dup.message).toMatch(/already entered/);
  });

  it('paisa rounding goes to the supplier as a price difference, so the supplier is owed exactly the total', async () => {
    const h = await setup();
    const r = () => h.result.current;
    const inv = run(() => ok(r().createPurchaseInvoice({ supplierId: 's1', lines: [{ productId: 'p1', qty: 3, rate: 1000 }], discountAmount: 100 }))).invoice!;
    expect(inv.totalAmount).toBe(2900);
    expect(inv.roundingLedgerId).toBeTruthy();
    expect(r().ledger.find((l) => l.id === inv.roundingLedgerId)).toMatchObject({ type: 'purchase_variance', credit: 0.01 });
    expect(r().suppliers[0].totalOwed).toBe(2900);
    const j = expectBalanced(h);
    expect(accountBalance(j, ACC.PRICE_DIFFERENCES, today)).toBe(-0.01);
  });

  it('delete puts everything back and the number is never used again; admin can continue from the old program', async () => {
    const h = await setup();
    const r = () => h.result.current;
    run(() => ok(r().createPurchaseInvoice({ supplierId: 's1', lines: [{ productId: 'p3', qty: 10, rate: 40 }] })));
    const second = run(() => ok(r().createPurchaseInvoice({ supplierId: 's1', lines: [{ productId: 'p1', qty: 2, rate: 6000 }], otherCharges: 300, paidNow: 5000, paidMethod: 'Bank Transfer' }))).invoice!;
    expect(second.invoiceNumber).toBe('P-2');
    expect(r().suppliers[0].totalOwed).toBe(400 + 12300 - 5000);
    run(() => ok(r().deletePurchaseInvoice(second.id)));
    expect(r().purchaseInvoices.map((p) => p.invoiceNumber)).toEqual(['P-1']);
    expect(r().suppliers[0].totalOwed).toBe(400);
    expect(r().products.find((p) => p.id === 'p1')!.stockKg).toBe(4);
    expect(r().ledger.some((l) => l.sourceId === second.id)).toBe(false);
    expectBalanced(h);
    // Numbers never go back.
    expect(r().previewPurchaseInvoiceNumber()).toBe('P-3');
    // Continue from Apna Accountant: next purchase P-12696, next sale S-14727.
    run(() => ok(r().updateNumberSeries('purchase_invoice', { prefix: 'P-', yearly: false, pad: 0, startAt: 12696 })));
    run(() => ok(r().updateNumberSeries('bill', { prefix: 'S-', yearly: false, pad: 0, startAt: 14727 })));
    expect(r().previewPurchaseInvoiceNumber()).toBe('P-12696');
    expect(r().previewDocNumber('bill')).toBe('S-14727');
    const third = run(() => ok(r().createPurchaseInvoice({ supplierId: 's1', lines: [{ productId: 'p3', qty: 1, rate: 40 }] }))).invoice!;
    expect(third.invoiceNumber).toBe('P-12696');
    const bill = run(() => ok(r().createBill({ customerId: 'c1', items: [{ productId: 'p3', name: 'Salt', qty: 1, unitPrice: 50 }], paidNow: 50, paymentMethod: 'Cash' }))).invoice!;
    expect(bill.invoiceNumber).toBe('S-14727');
    expect(r().previewDocNumber('bill')).toBe('S-14728');
  });

  it('staff without stock rights cannot enter one; the cloud table has every column the app sends', async () => {
    const h = await setup(OPERATOR);
    const res = run(() => h.result.current.createPurchaseInvoice({ supplierId: 's1', lines: [{ productId: 'p3', qty: 1, rate: 40 }] }));
    expect(res.success).toBe(false);
    // Columns in migrate_v25 for purchase_invoices and the new invoice / settings columns.
    const sql = readFileSync(resolve(__dirname, '../../supabase/migrate_v25_invoices_reports.sql'), 'utf8');
    const cols = new Set(Array.from(sql.matchAll(/ADD COLUMN IF NOT EXISTS\s+"?([A-Za-z_]+)"?/g)).map((m) => m[1]));
    ['invoiceNumber', 'memoNo', 'date', 'supplierId', 'supplierName', 'godownId', 'lines', 'grossAmount', 'discountPct', 'discountAmount', 'otherCharges', 'totalAmount', 'paidAmount', 'paidMethod', 'paymentLedgerId', 'roundingLedgerId', 'remarks', 'createdAt', 'createdBy', 'branchId', 'enteredAt', 'delivery', 'classicMenu'].forEach((c) => expect(cols.has(c), c).toBe(true));
    expect(existsSync(resolve(__dirname, '../../supabase/migrate_v25_invoices_reports.sql'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('sale invoice: memo no., entered on, delivery order', () => {
  it('delivery order → pending list → delivered (stock taken on the bill)', async () => {
    const h = await setup();
    const r = () => h.result.current;
    const bill = run(() => ok(r().createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Tin', qty: 2, unitPrice: 7000 }], paidNow: 0, date: D2, memoNo: 'B-77', deliveryOrder: true }))).invoice!;
    expect(bill.memoNo).toBe('B-77');
    expect(bill.delivery).toEqual({ status: 'pending' });
    expect(bill.enteredAt && bill.enteredAt.length > 10).toBe(true);
    expect(bill.issueDate).toBe(D2);
    // Stock is taken on the bill, as in the old program.
    expect(r().products.find((p) => p.id === 'p1')!.stockKg).toBe(2);
    // Bills search finds the memo no.
    expect(filterBills(r().invoices, 'b-77', 'all', today).map((i) => i.id)).toEqual([bill.id]);
    expect(findBillByNumber(r().invoices, bill.invoiceNumber)?.id).toBe(bill.id);
    expect(findBillByNumber(r().invoices, bill.invoiceNumber.replace(/\D/g, ''))?.id).toBe(bill.id);
    // Pending delivery list.
    const f: ReportFilter = { from: D1, to: D3, asOf: D3, status: 'pending', today };
    let rep = REPORTS['pending-delivery'].build(dataOf(r()), f);
    expect(rep.sections[0].rows).toHaveLength(1);
    expect(rep.sections[0].rows[0].cells).toMatchObject({ bill: bill.invoiceNumber, memo: 'B-77', customer: 'Haji Karim', amount: 14000, status: 'Pending', days: 1 });
    // Cannot be delivered before the bill date; then delivered with who and vehicle.
    expect(run(() => r().markBillDelivered(bill.id, { date: D1 })).success).toBe(false);
    run(() => ok(r().markBillDelivered(bill.id, { date: D3, by: 'Rashid', vehicle: 'les-1234' })));
    expect(r().invoices.find((i) => i.id === bill.id)!.delivery).toMatchObject({ status: 'delivered', deliveredOn: D3, deliveredBy: 'Rashid', vehicle: 'LES-1234' });
    rep = REPORTS['pending-delivery'].build(dataOf(r()), f);
    expect(rep.sections[0].rows).toHaveLength(0);
    rep = REPORTS['pending-delivery'].build(dataOf(r()), { ...f, status: 'delivered' });
    expect(String(rep.sections[0].rows[0].cells.status)).toMatch(/Rashid \(LES-1234\)/);
    expect(deliveryBills(r().invoices, { ...f, status: 'all' })).toHaveLength(1);
    // Back to pending.
    run(() => ok(r().markBillDeliveryPending(bill.id)));
    expect(deliveryBills(r().invoices, f)).toHaveLength(1);
    // A normal bill is not a delivery order.
    const plain = run(() => ok(r().createBill({ customerId: 'c1', items: [{ productId: 'p3', name: 'Salt', qty: 1, unitPrice: 50 }], paidNow: 50, paymentMethod: 'Cash' }))).invoice!;
    expect(plain.delivery).toBeUndefined();
    expect(run(() => r().markBillDelivered(plain.id)).success).toBe(false);
    expectBalanced(h);
  });
});

// ---------------------------------------------------------------------------
describe('classic reports against hand-computed figures', () => {
  /**
   * D1: purchase invoice P-1: 10 tins @ 6,000 (60,000, unpaid).  Bill A: 2 tins @ 7,000 = 14,000 paid in cash.
   * D2: Bill B: 1 tin @ 7,000 + 10 salt @ 50 = 7,500; 2,500 cash, 5,000 on credit.  Expense 500 cash (food).
   * Opening cash 10,000 (1 Jan). Tins cost 6,000, salt 40.
   */
  const scenario = async () => {
    const h = await setup();
    const r = () => h.result.current;
    run(() => ok(r().createPurchaseInvoice({ supplierId: 's1', date: D1, memoNo: 'X-1', lines: [{ productId: 'p1', qty: 10, rate: 6000 }] })));
    run(() => ok(r().createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Tin', qty: 2, unitPrice: 7000 }], paidNow: 14000, paymentMethod: 'Cash', date: D1 })));
    run(() => ok(r().createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Tin', qty: 1, unitPrice: 7000 }, { productId: 'p3', name: 'Salt', qty: 10, unitPrice: 50 }], paidNow: 2500, paymentMethod: 'Cash', date: D2 })));
    run(() => r().addExpense({ date: D2, category: 'food', amount: 500, description: 'Tea', paidVia: 'Cash' } as any));
    expectBalanced(h);
    return { h, d: dataOf(r()) };
  };
  const range: ReportFilter = { from: D1, to: D3, asOf: D3, today };
  const build = (id: ReportId, d: ReportData, f: Partial<ReportFilter> = {}) => REPORTS[id].build(d, { ...range, ...f });

  it('Daily Sale, Daily Purchase, Daily Gross Profit', async () => {
    const { d } = await scenario();
    const s = dailySale(d, D1, D3);
    expect(s.rows).toEqual([
      { date: D1, bills: 1, sale: 14000, received: 14000, credit: 0, returns: 0, net: 14000 },
      { date: D2, bills: 1, sale: 7500, received: 2500, credit: 5000, returns: 0, net: 7500 },
    ]);
    expect(s.totals).toMatchObject({ bills: 2, sale: 21500, received: 16500, credit: 5000 });
    const p = dailyPurchase(d, D1, D3);
    expect(p.rows).toEqual([{ date: D1, docs: 1, purchase: 60000, returns: 0, net: 60000 }]);
    const g = dailyGrossProfit(d, D1, D3);
    expect(g.rows.map((x) => [x.date, x.sales, x.cost, x.profit])).toEqual([[D1, 14000, 12000, 2000], [D2, 7500, 6400, 1100]]);
    expect(g.totals).toMatchObject({ sales: 21500, cost: 18400, profit: 3100 });
    // The report tables carry the same totals.
    expect(build('daily-sale', d).sections[0].totals).toMatchObject({ sale: 21500, net: 21500 });
    expect(build('daily-gross-profit', d).sections[0].totals).toMatchObject({ profit: 3100 });
  });

  it('Cash Book, Day Book, Journal Book, Book Balances', async () => {
    const { d } = await scenario();
    const cb = build('cash-book', d);
    expect(cb.summary).toEqual([
      { label: 'Opening cash', value: 10000, money: true },
      { label: 'Receipts', value: 16500, money: true },
      { label: 'Payments', value: 500, money: true },
      { label: 'Closing cash', value: 26000, money: true },
    ]);
    // Day book of D1: purchase 60,000; bill 14,000 + cost 12,000; payment 14,000 → Dr = Cr = 100,000.
    const db = build('day-book', d, { asOf: D1 });
    expect(db.summary![0].value).toBe(3);
    expect(db.sections[0].totals).toMatchObject({ debit: 100000, credit: 100000 });
    expect(db.sections[0].rows.filter((x) => x.style === 'heading').map((x) => x.cells.doc)).toEqual(expect.arrayContaining(['Purchase', 'Sale invoice', 'Cash received']));
    // Journal book D1..D3 adds bill B (7,500 + cost 6,400), its payment 2,500 and the expense 500.
    const jb = build('journal-book', d);
    expect(jb.sections[0].totals).toMatchObject({ debit: 100000 + 7500 + 6400 + 2500 + 500, credit: 116900 });
    const bb = bookBalances(d.journal, d.accounts, D3);
    expect(bb.find((b) => b.code === '1000')!.balance).toBe(26000);
    expect(bb.find((b) => b.code === '1010')!.balance).toBe(0);
    expect(build('book-balances', d).sections[0].totals).toMatchObject({ balance: 26000 });
    // Bank book of 1010: nothing went through the bank.
    expect(build('bank-book', d, { accountCode: '1010' }).summary![3].value).toBe(0);
  });

  it('Trial Balance (as at and between dates), P&L between dates, Balance Sheet (as at and between dates)', async () => {
    const { d } = await scenario();
    const tb = build('trial-balance', d);
    expect(tb.sections[0].totals!.debit).toBe(tb.sections[0].totals!.credit);
    const tbp = trialBalanceBetween(d.journal, d.accounts, D1, D3);
    expect(tbp.balanced).toBe(true);
    const sales = tbp.rows.find((x) => x.code === '4000')!;
    expect(sales).toMatchObject({ openCr: null, cr: 21500, closeCr: 21500 });
    const cash = tbp.rows.find((x) => x.code === '1000')!;
    expect(cash).toMatchObject({ openDr: 10000, dr: 16500, cr: 500, closeDr: 26000 });
    // P&L D1..D3: sales 21,500 − COGS 18,400 − food 500 = 2,600.
    const pl = build('profit-loss-period', d);
    expect(pl.summary).toEqual([
      { label: 'Income', value: 21500, money: true },
      { label: 'Gross profit', value: 3100, money: true },
      { label: 'Net profit', value: 2600, money: true },
    ]);
    const bs = build('balance-sheet', d);
    expect(bs.summary![2].label).toBe('Balanced');
    const bsp = build('balance-sheet-period', d);
    expect(bsp.summary![2].label).toBe('Balanced');
    // Closing assets = the balance sheet on D3; the period movement is closing − opening.
    const real = balanceSheet(d.journal, D3, d.accounts);
    expect(bsp.summary![0].value).toBe(real.totalAssets);
    const inv = bsp.sections[0].rows.find((x) => x.cells.code === '1200')!;
    expect(inv.cells.movement).toBe(60000 - 12000 - 6400);
  });

  it('Receivable / Payable, party and product reports, rate list', async () => {
    const { d } = await scenario();
    const rp = receivablePayable(d, D3);
    expect(rp.receivable.map((x) => [x.name, x.amount])).toEqual([['Haji Karim', 5000]]);
    expect(rp.payable.map((x) => [x.name, x.amount])).toEqual([['Dalda Foods', 60000]]);
    // As at D1 the customer owed nothing (bill A was paid in full).
    expect(receivablePayable(d, D1).receivable).toEqual([]);
    expect(build('receivable-payable', d).summary).toEqual([
      { label: 'Receivable', value: 5000, money: true },
      { label: 'Payable', value: 60000, money: true },
      { label: 'Net', value: -55000, money: true },
    ]);
    const ps = build('party-sales', d).sections[0];
    expect(ps.rows[0].cells).toMatchObject({ name: 'Haji Karim', bills: 2, sale: 21500, net: 21500, received: 16500, balance: 5000 });
    const pp = build('party-purchases', d).sections[0];
    expect(pp.rows[0].cells).toMatchObject({ name: 'Dalda Foods', purchase: 60000, paid: 0, balance: 60000 });
    const po = build('party-outstanding', d);
    expect(po.sections[0].rows[0].cells).toMatchObject({ name: 'Haji Karim', lastDoc: D2, lastPay: D2, days: 1, amount: 5000 });
    const sold = productTotals(d, 'sale', range);
    expect(sold.map((x) => [x.name, x.qty, x.amount, x.avg])).toEqual([['Dalda Ghee 16 kg tin', 3, 21000, 7000], ['Salt 1 kg', 10, 500, 50]]);
    const bought = productTotals(d, 'purchase', range);
    expect(bought.map((x) => [x.name, x.qty, x.amount])).toEqual([['Dalda Ghee 16 kg tin', 10, 60000]]);
    const rl = rateList(d, D3);
    const tin = rl.find((x) => x.product.id === 'p1')!;
    expect(tin.lastSale).toEqual({ rate: 7000, date: D2 });
    expect(tin.lastPurchase).toEqual({ rate: 6000, date: D1 });
    expect(rl.find((x) => x.product.id === 'p2')!.lastSale).toBeNull();
  });

  it('Stock In Hand as at a date, stock ledger, stock value, godown-wise and low stock', async () => {
    const { d } = await scenario();
    // Tins: 4 at the start, +10 on D1, −2 on D1, −1 on D2.
    expect(stockOn(d, 'p1', D1)).toBe(12);
    expect(stockOn(d, 'p1', D3)).toBe(11);
    expect(stockOn(d, 'p1', shiftDate(D1, -1))).toBe(4);
    const sih = build('stock-in-hand', d, { asOf: D1 });
    const tinRow = sih.sections[0].rows.find((x) => x.cells.item === 'Dalda Ghee 16 kg tin')!;
    expect(tinRow.cells).toMatchObject({ qty: 12, rate: 6000, value: 72000 });
    // Salt 100 (at 40) until D2, then 90.
    const now = build('stock-in-hand', d);
    expect(now.sections[0].rows.find((x) => x.cells.item === 'Salt 1 kg')!.cells).toMatchObject({ qty: 90, value: 3600 });
    // Oil: 2 cans at 2,000 (cost price) = 4,000. Total = 66,000 + 4,000 + 3,600.
    expect(now.sections[0].totals!.value).toBe(66000 + 4000 + 3600);
    expect(build('stock-value', d).sections[0].totals!.value).toBe(73600);
    const sl = build('stock-ledger', d, { productId: 'p1' });
    expect(sl.sections[0].totals).toMatchObject({ in: 10, out: 3, balance: 11 });
    expect(sl.sections[0].rows[0].cells).toMatchObject({ particulars: 'Opening stock', balance: 4 });
    expect(build('stock-ledger', d).sections[0].rows).toHaveLength(0);
    expect(build('godown-stock', d).sections[0].rows.find((x) => x.cells.item === 'Salt 1 kg')!.cells.total).toBe(90);
    expect(build('low-stock', d).sections[0].rows.map((x) => x.cells.item)).toEqual(['Habib Cooking Oil 5 L']);
  });

  it('every report builds, prints its period and turns into CSV', async () => {
    const { d, h } = await scenario();
    (Object.keys(REPORTS) as ReportId[]).forEach((id) => {
      const f = { ...defaultFilter(REPORTS[id], today, h.result.current.settings), productId: 'p1' };
      const rep = REPORTS[id].build(d, f);
      expect(rep.title.length, id).toBeGreaterThan(0);
      expect(rep.period.length, id).toBeGreaterThan(0);
      const csv = reportCsv(rep);
      expect(csv.rows.length, id).toBeGreaterThan(1);
    });
  });
});

// ---------------------------------------------------------------------------
describe('classic menu', () => {
  it('has the 16 buttons of Apna Accountant, with their names, each opening something', () => {
    expect(CLASSIC_BUTTONS.map((b) => b.label)).toEqual([
      'Product Coding', 'Sale Invoice', 'Purchase Invoice', 'Product List', 'Daily Gross Profit', 'Daily Sale', 'Daily Purchase', 'Stock In Hand',
      'Accounts Coding', 'Account Ledger', 'Cheque Deposits Bank', 'Books', 'Vouchers', 'Trial Balances', 'Profit & Loss', 'Balance Sheet',
    ]);
    CLASSIC_BUTTONS.forEach((b) => {
      const t = resolveTarget(b.target);
      if (t.kind === 'report') expect(REPORTS[t.report], b.label).toBeTruthy();
      // Partner screens that do not exist yet open their fallback (never an unknown screen).
      if (t.kind === 'screen') expect(screenAvailable(t.screen), b.label).toBe(true);
    });
    expect(resolveTarget(CLASSIC_BUTTONS.find((b) => b.id === 'accounts-coding')!.target)).toEqual(screenAvailable(PARTNER_SCREENS.chartOfAccounts) ? { kind: 'screen', screen: 'chart-of-accounts', fallback: { kind: 'accounts', tab: 'coa' } } : { kind: 'accounts', tab: 'coa' });
  });
  it('the Reports menu is laid out like the old one and every entry opens a report or a screen', () => {
    expect(REPORTS_MENU.map((s) => s.label)).toEqual(['Accounts Reports', 'Inventory Reports', 'Pending Delivery']);
    expect(REPORTS_MENU[0].items.map((i) => i.label)).toEqual([
      'Chart of Accounts', 'Account Ledger', 'Accounts Reconciliation', 'Cash Book', 'Day Book', 'Journal Book', 'Trial Balance', 'Trial Balance Between Dates', 'Book Balances',
      'Receivable And Payable', 'Receivable And Payable CityWise', 'Receivable', 'Payable', 'Profit And Loss', 'Profit and Loss Between Dates', 'Balance Sheet', 'Balance Sheet Between Dates', 'Vouchers Printing',
    ]);
    expect(REPORTS_MENU[1].items.map((i) => (isSubmenu(i) ? `${i.label} ›` : i.label))).toEqual(['Daily Gross Profit', 'Party Reports ›', 'Product Reports ›', 'Stock Reports ›']);
    expect(REPORTS_MENU[0].items.find((i) => i.label === 'Cash Book')).toMatchObject({ key: 'F9' });
    [...allMenuEntries(), ...BOOKS_MENU].forEach((e) => {
      const t = resolveTarget(e.target);
      if (t.kind === 'report') expect(REPORTS[t.report], e.label).toBeTruthy();
      if (t.kind === 'screen') expect(screenAvailable(t.screen), e.label).toBe(true);
    });
  });
});
