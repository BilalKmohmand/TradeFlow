import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { buildJournal, combineJournal, trialBalance, balanceSheet, accountBalance, mergeAccounts, ACC } from '../utils/accounting';
import { buildFinanceJournal } from '../utils/financeBooks';
import { collectCashMovements, accountBalancesOn } from '../utils/finance';
import { buildDailySheet } from '../utils/billing';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { toUserRow } from '../lib/password';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';

/**
 * QA: every money-moving feature in ONE shop, through the real context, in the order a shopkeeper would
 * use them. After each step the books must still hold together:
 *  - the trial balance and the balance sheet balance;
 *  - Accounts receivable / payable equal the customers' / suppliers' balances;
 *  - every party balance is explained by its ledger (no "unexplained opening" drift);
 *  - cash and bank in the books equal the cash book (Money screen) and the daily sheet's closing cash;
 *  - stock in batches equals the item's stock figure.
 */
const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
type Ctx = ReturnType<typeof useTrading>;

const today = todayISO();
const fyStartYear = Number(today.slice(5, 7)) >= 7 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
const prevFyStart = `${fyStartYear - 1}-07-01`;
const inPrevFy = `${fyStartYear}-03-10`;
const oldBillDate = shiftDate(today, -75);

/** Balances the shop brought in from its old books (not explained by any ledger row). */
const OPENING_CUSTOMER: Record<string, number> = { c1: 0, c2: 0, c3: 0 };
const OPENING_SUPPLIER: Record<string, number> = { s1: 0 };

const seed = () => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'QA Oil Traders', cashOpeningBalance: 50000, openingBankBalance: 200000, cashOpeningDate: prevFyStart, taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: 'C-01', name: 'Zaman and Co', company: 'Zaman and Co', phone: '0344', email: '', address: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: prevFyStart },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '0300', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: prevFyStart },
    // An old unpaid bill: 75 days overdue, for the late-payment interest.
    { id: 'c3', name: 'Old Khan Store', company: 'Old Khan Store', phone: '0301', email: '', address: 'Swat', totalDue: 30000, creditLimit: 0, createdAt: prevFyStart },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', code: 'S-01', name: 'Ahmed', company: 'Dalda Foods', phone: '0302', email: '', address: 'Karachi', totalOwed: 0, createdAt: prevFyStart }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: 'Dalda 16 L Tin', category: 'Ghee', brand: 'Dalda', unit: 'tin', unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 0, minThresholdKg: 5, packName: 'carton', packSize: 6 },
    { id: 'p2', name: 'Habib 5 L Can', category: 'Oil', brand: 'Habib', unit: 'can', unitPricePerKg: 2000, costPricePerKg: 1700, stockKg: 0, minThresholdKg: 0, trackBatches: true },
  ]);
  set('tradeflow_ledger_v2', [
    { id: 'old-bill', entityType: 'customer', entityId: 'c3', type: 'bill_issued', referenceId: 'OLD-1', date: oldBillDate, description: 'Old bill', debit: 30000, credit: 0, balanceAfter: 30000 },
  ]);
  // Last financial year: rent paid, commission earned (so the year close has something to carry).
  set('tradeflow_expenses_v2', [{ id: 'e-prev', date: inPrevFy, category: 'rent', amount: 30000, description: 'Shop rent', paidVia: 'Cash', createdAt: inPrevFy }]);
  set('tradeflow_cash_entries_v2', [{ id: 'x-prev', date: inPrevFy, direction: 'in', amount: 80000, description: 'Commission received', method: 'Cash', accountCode: '4900', createdAt: inPrevFy }]);
  ['tradeflow_invoices_v1', 'tradeflow_purchases_v2', 'tradeflow_cheques_v1', 'tradeflow_journal_entries_v1', 'tradeflow_returns_v2', 'tradeflow_stock_adjustments_v2'].forEach((k) => localStorage.setItem(k, '[]'));
  seedTestUsers();
};

const journalOf = (s: Ctx) =>
  combineJournal(
    [
      ...buildJournal({ settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices, dispatches: s.dispatches, purchases: s.purchases, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products, returns: s.returns, adjustments: s.adjustments }),
      ...buildFinanceJournal({ settings: s.settings, fixedAssets: s.fixedAssets, depreciationRuns: s.depreciationRuns, salaryRuns: s.salaryRuns }),
    ],
    s.manualJournals
  );

/** Every consistency rule the owner relies on. */
const expectBooksInStep = (s: Ctx, step: string) => {
  const accounts = mergeAccounts(s.customAccounts);
  const journal = journalOf(s);
  const tb = trialBalance(journal, accounts, today);
  expect(tb.balanced, `${step}: trial balance out by ${tb.difference}`).toBe(true);
  expect(balanceSheet(journal, today, accounts).balanced, `${step}: balance sheet`).toBe(true);
  // Control accounts = party balances.
  expect(accountBalance(journal, ACC.RECEIVABLE, today), `${step}: receivable`).toBeCloseTo(s.customers.reduce((a, c) => a + c.totalDue, 0), 2);
  expect(-accountBalance(journal, ACC.PAYABLE, today), `${step}: payable`).toBeCloseTo(s.suppliers.reduce((a, x) => a + x.totalOwed, 0), 2);
  // Each balance is explained by its own statement (ledger), apart from what was brought in.
  s.customers.forEach((c) => {
    const net = s.ledger.filter((l) => l.entityType === 'customer' && l.entityId === c.id).reduce((a, l) => a + l.debit - l.credit, 0);
    expect(c.totalDue - net, `${step}: ${c.name} balance vs statement`).toBeCloseTo(OPENING_CUSTOMER[c.id] ?? 0, 2);
  });
  s.suppliers.forEach((x) => {
    const net = s.ledger.filter((l) => l.entityType === 'supplier' && l.entityId === x.id).reduce((a, l) => a + l.debit - l.credit, 0);
    expect(x.totalOwed - net, `${step}: ${x.company} balance vs statement`).toBeCloseTo(OPENING_SUPPLIER[x.id] ?? 0, 2);
  });
  // Cash and bank: books = cash book = daily sheet closing.
  const cashBook = accountBalancesOn(collectCashMovements(s.ledger, s.expenses, s.cashEntries, s.customers, s.suppliers), s.settings, today);
  expect(accountBalance(journal, ACC.CASH, today), `${step}: cash`).toBeCloseTo(cashBook.cash, 2);
  expect(accountBalance(journal, ACC.BANK, today), `${step}: bank`).toBeCloseTo(cashBook.bank, 2);
  const sheet = buildDailySheet({ invoices: s.invoices, ledger: s.ledger, expenses: s.expenses, cashEntries: s.cashEntries, customers: s.customers, suppliers: s.suppliers, settings: s.settings, cheques: s.cheques }, today);
  expect(sheet.closing.cash, `${step}: daily sheet closing cash`).toBeCloseTo(cashBook.cash, 2);
  expect(sheet.closing.bank, `${step}: daily sheet closing bank`).toBeCloseTo(cashBook.bank, 2);
  // Batches add up to the stock figure of a batch item.
  const p2 = s.products.find((p) => p.id === 'p2')!;
  expect(s.stockBatches.filter((b) => b.productId === 'p2').reduce((a, b) => a + b.qty, 0), `${step}: batches`).toBeCloseTo(p2.stockKg, 4);
  // Every bill's balance = its net total less what was kept (payments − refunds).
  s.invoices.forEach((i) => {
    const kept = (i.payments || []).reduce((a, p) => a + p.amount, 0) - (i.refundedAmount || 0);
    expect(i.paidAmount, `${step}: ${i.invoiceNumber} paid`).toBeCloseTo((i.payments || []).reduce((a, p) => a + p.amount, 0), 2);
    expect(i.balanceDue, `${step}: ${i.invoiceNumber} balance`).toBeCloseTo(Math.max(0, i.totalAmount - (i.returnedAmount || 0) - kept), 2);
  });
};

beforeEach(() => localStorage.clear());

describe('QA: one shop, every feature, books always in step', () => {
  it('bill with scheme + freight + split cheque, return, bounce, supplier bill variance, claim, depreciation, salary with advance, interest, commission, year close', async () => {
    seed();
    const hook = renderHook(() => useTrading(), { wrapper });
    await signIn(() => hook.result.current);
    const r = () => hook.result.current;
    const ok = (res: { success: boolean; message: string }, what: string) => expect(res.success, `${what}: ${res.message}`).toBe(true);
    expectBooksInStep(r(), 'start');

    // --- Set-up: salesman, area, cost centre, a "10 + 1 free" scheme.
    let salesmanId = '';
    let areaId = '';
    let centreId = '';
    act(() => { const x = r().saveSalesman({ name: 'Rashid', commissionPct: 2 }); ok(x, 'salesman'); salesmanId = x.salesman!.id; });
    act(() => { const x = r().saveArea({ name: 'Saddar' }); ok(x, 'area'); areaId = x.area!.id; });
    act(() => { const x = r().addCostCentre({ name: 'Main shop', kind: 'branch' }); ok(x, 'cost centre'); centreId = x.centre!.id; });
    act(() => ok(r().saveScheme({ name: 'Dalda 10+1', productId: 'p1', kind: 'free_every', buyQty: 10, freeQty: 1, active: true } as any), 'scheme'));

    // --- Purchase order → receive against it (on credit) → batches for the can.
    let poId = '';
    act(() => { const x = r().createPurchaseOrder({ supplierId: 's1', lines: [{ productId: 'p1', qty: 100, rate: 800 }] }); ok(x, 'PO'); poId = x.order!.id; });
    const poLine = r().purchaseOrders.find((p) => p.id === poId)!.items![0];
    act(() => ok(r().receiveStock({ productId: 'p1', qty: 100, costPrice: 800, supplierId: 's1', purchaseOrderId: poId, poLineId: poLine.id }), 'receive p1'));
    act(() => ok(r().receiveStock({ productId: 'p2', qty: 40, costPrice: 1700, supplierId: 's1', batchNo: 'H-1', expiryDate: shiftDate(today, 200) }), 'receive p2'));
    expect(r().purchaseOrders.find((p) => p.id === poId)!.status).toBe('received');
    expect(r().suppliers[0].totalOwed).toBe(80000 + 68000);
    expectBooksInStep(r(), 'stock received');

    // --- The big bill: 20 tins + 2 free (scheme), freight 500, salesman / area / cost centre,
    //     paid Rs. 5,000 cash + Rs. 3,000 bank + a Rs. 10,000 cheque; the rest on credit.
    let billId = '';
    act(() => {
      const x = r().createBill({
        customerId: 'c1',
        items: [
          { productId: 'p1', name: 'Dalda 16 L Tin', qty: 20, unitPrice: 1000, unit: 'tin' },
          { productId: 'p2', name: 'Habib 5 L Can', qty: 5, unitPrice: 2000, unit: 'can', discountType: 'pct', discountValue: 10 },
          { productId: 'p1', name: 'Dalda 16 L Tin', qty: 2, unitPrice: 0, unit: 'tin', free: true, schemeId: 'x', schemeName: 'Dalda 10+1' },
        ],
        freightCharges: 500,
        salesmanId,
        areaId,
        costCentreId: centreId,
        payments: [{ method: 'Cash', amount: 5000 }, { method: 'Bank Transfer', amount: 3000 }],
        cheque: { amount: 10000, bankName: 'HBL', chequeNumber: '111', chequeDate: today },
      });
      ok(x, 'bill');
      billId = x.invoice!.id;
    });
    const bill = r().invoices.find((i) => i.id === billId)!;
    // 20,000 + (10,000 − 10%) + 500 freight = 29,500
    expect(bill.totalAmount).toBe(29500);
    expect(bill.paidAmount).toBe(18000);
    expect(bill.balanceDue).toBe(11500);
    expect(bill.costCentreId).toBe(centreId);
    expect(r().customers.find((c) => c.id === 'c1')!.totalDue).toBe(11500);
    expect(r().products.find((p) => p.id === 'p1')!.stockKg).toBe(78);
    expectBooksInStep(r(), 'bill');

    // --- Customer brings 2 tins back: taken off what they owe.
    const tinLine = bill.items.find((it) => it.productId === 'p1' && !it.free)!;
    act(() => ok(r().returnBillItems({ invoiceId: billId, lines: [{ billLineId: tinLine.id, qty: 2 }], settle: 'credit', reason: 'Dented' }), 'return'));
    expect(r().customers.find((c) => c.id === 'c1')!.totalDue).toBe(9500);
    expect(r().products.find((p) => p.id === 'p1')!.stockKg).toBe(80);
    expectBooksInStep(r(), 'return');

    // --- The cheque bounces; the bank's Rs. 300 charge is passed on to the customer.
    const chq = r().cheques.find((c) => c.chequeNumber === '111')!;
    act(() => ok(r().depositCheque(chq.id), 'deposit'));
    act(() => ok(r().bounceCheque(chq.id, { reason: 'Insufficient funds', bankCharge: 300, chargeTo: 'customer' }), 'bounce'));
    expect(r().customers.find((c) => c.id === 'c1')!.totalDue).toBe(19800);
    // The bill owes its net total (29,500 − 2,000 returned) less the 8,000 kept: 19,500.
    expect(r().invoices.find((i) => i.id === billId)!.balanceDue).toBe(19500);
    expectBooksInStep(r(), 'bounce');

    // --- The customer pays by a second cheque, which clears; and pays the bill in cash.
    act(() => ok(r().receiveCheque({ customerId: 'c1', amount: 5000, bankName: 'MCB', chequeNumber: '222', chequeDate: today, invoiceId: billId }), 'cheque 2'));
    const chq2 = r().cheques.find((c) => c.chequeNumber === '222')!;
    act(() => ok(r().clearCheque(chq2.id), 'clear'));
    act(() => ok(r().payBill(billId, 4400, 'Cash'), 'pay later'));
    expect(r().invoices.find((i) => i.id === billId)!.balanceDue).toBe(10100);
    expectBooksInStep(r(), 'cheque cleared + pay later');

    // --- Supplier bill: Rs. 820 a tin billed for goods received at 800 → Rs. 2,000 more owed.
    const receipt = r().purchases.find((p) => p.productId === 'p1')!;
    act(() => ok(r().recordSupplierBill({ supplierId: 's1', billNumber: 'DF-1', purchaseIds: [receipt.id], lines: [{ productId: 'p1', qty: 100, rate: 820 }] }), 'supplier bill'));
    expect(r().suppliers[0].totalOwed).toBe(150000);
    expectBooksInStep(r(), 'supplier bill');

    // --- 3 tins leaked: stock loss, then a claim the supplier accepts.
    act(() => ok(r().adjustStockBy({ productId: 'p1', deltaQty: -3, reason: 'leaked', note: 'back row' }), 'adjust'));
    let claimId = '';
    act(() => { const x = r().addSupplierClaim({ supplierId: 's1', purchaseId: receipt.id, productId: 'p1', qty: 3, rate: 820, reason: 'leaked' }); ok(x, 'claim'); claimId = x.claim!.id; });
    act(() => ok(r().acceptSupplierClaim(claimId), 'accept claim'));
    expect(r().suppliers[0].totalOwed).toBe(150000 - 2460);
    // Send 5 cans back (debit note).
    act(() => ok(r().returnToSupplier({ supplierId: 's1', productId: 'p2', qty: 5, rate: 1700, reason: 'Leaking' }), 'purchase return'));
    expect(r().suppliers[0].totalOwed).toBe(150000 - 2460 - 8500);
    // Pay the supplier part by bank, part by cheque.
    act(() => { expect(r().recordSupplierPayment('s1', 50000, 'Bank Transfer - part')).toBeTruthy(); });
    act(() => ok(r().issueCheque({ supplierId: 's1', amount: 20000, bankName: 'Meezan', chequeNumber: '900', chequeDate: today }), 'issue cheque'));
    expectBooksInStep(r(), 'purchasing');

    // --- Receive from many (collection sheet) and move cash to the bank.
    act(() => ok(r().receiveMany({ rows: [{ customerId: 'c3', amount: 5000, method: 'Cash' }, { customerId: 'c1', amount: 1000, method: 'Bank Transfer' }] }), 'receive many'));
    act(() => ok(r().addCashTransfer({ amount: 2000, from: 'cash' }), 'transfer'));
    act(() => { r().addExpense({ date: today, category: 'food', amount: 700, description: 'Tea', paidVia: 'Cash', costCentreId: centreId } as any); });
    expectBooksInStep(r(), 'collection + transfer + expense');

    // --- Fixed asset → depreciation for this month.
    act(() => ok(r().addFixedAsset({ name: 'Honda generator', category: 'generator' as any, purchaseDate: today, cost: 120000, paidFrom: 'bank', usefulLifeYears: 5, method: 'straight_line' }), 'asset'));
    act(() => ok(r().runDepreciation({ month: today.slice(0, 7) }), 'depreciation'));
    expectBooksInStep(r(), 'depreciation');

    // --- Staff: advance, then the salary sheet recovers it.
    let staffId = '';
    act(() => { const x = r().addStaff({ name: 'Ali Khan', role: 'Salesman', monthlySalary: 30000, joinDate: prevFyStart }); ok(x, 'staff'); staffId = x.member!.id; });
    act(() => ok(r().giveStaffAdvance({ staffId, amount: 5000, method: 'Cash' }), 'advance'));
    act(() => ok(r().paySalaries({ month: today.slice(0, 7), method: 'Cash', lines: [{ staffId, name: 'Ali Khan', role: 'Salesman', salary: 30000, bonus: 0, deductions: 0, advanceDeducted: 5000, net: 25000 }] }), 'salaries'));
    expect(r().expenses.find((e) => e.category === 'salaries')!.amount).toBe(25000);
    expectBooksInStep(r(), 'salaries');

    // --- Late-payment interest on the old bill; commission paid to the salesman.
    act(() => ok(r().setCustomerSalesInfo('c3', { interestPctPerMonth: 2, interestAfterDays: 30 }), 'interest setting'));
    expect(r().previewInterest(today).length).toBe(1);
    act(() => ok(r().chargeInterest(today), 'interest'));
    act(() => ok(r().payCommission({ salesmanId, amount: 400, paidVia: 'Cash' }), 'commission'));
    expectBooksInStep(r(), 'interest + commission');

    // --- Manual journal, then close last financial year (profit 80,000 − 30,000 = 50,000).
    act(() => ok(r().addManualJournal({ date: today, memo: 'Owner put money in the bank', lines: [{ accountCode: '1010', debit: 10000, credit: 0 }, { accountCode: '3000', debit: 0, credit: 10000 }] }), 'journal'));
    act(() => ok(r().closeYear({ fyStartDate: prevFyStart }), 'year close'));
    expect(r().yearCloses[0].profit).toBe(50000);
    expect(r().settings.booksLockedUntil).toBe(`${fyStartYear}-06-30`);
    // Bank in the books = cash book + the 10,000 journal; check the rest of the rules with it removed from the comparison.
    const s = r();
    const journal = journalOf(s);
    const accounts = mergeAccounts(s.customAccounts);
    expect(trialBalance(journal, accounts, today).balanced).toBe(true);
    expect(balanceSheet(journal, today, accounts).balanced).toBe(true);
    expect(trialBalance(journal, accounts, `${fyStartYear}-06-30`).balanced).toBe(true);
    // A bill in the closed year is refused.
    let refused: any;
    act(() => { refused = r().createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Tin', qty: 1, unitPrice: 1000 }], date: inPrevFy }); });
    expect(refused.success).toBe(false);

    // --- Every table the app syncs has every column it sends (supabase/setup.sql).
    const rowsByTable: Record<string, unknown[]> = {
      customers: s.customers, suppliers: s.suppliers, products: s.products, bookings: s.bookings, dispatches: s.dispatches, purchases: s.purchases,
      price_history: s.priceHistory, expenses: s.expenses, trucks: s.trucks, invoices: s.invoices, users: s.users.map(toUserRow), cash_entries: s.cashEntries,
      settings: [s.settings], quotations: s.quotations, purchase_orders: s.purchaseOrders, returns: s.returns, stock_adjustments: s.adjustments, tasks: s.tasks,
      ledger: s.ledger, whatsapp_messages: s.whatsappMessages, bank_statement_lines: s.bankStatementLines, bank_reconciliations: s.bankReconciliations,
      cheques: s.cheques, journal_entries: s.manualJournals, accounts: s.customAccounts, customer_agreed_rates: s.customerAgreedRates,
      godowns: s.godowns, stock_batches: s.stockBatches, stock_transfers: s.stockTransfers, salesmen: s.salesmen, areas: s.areas, schemes: s.schemes,
      supplier_bills: s.supplierBills, supplier_claims: s.supplierClaims, fixed_assets: s.fixedAssets, depreciation_runs: s.depreciationRuns, staff: s.staff,
      staff_advances: s.staffAdvances, salary_runs: s.salaryRuns, budgets: s.budgets, cost_centres: s.costCentres, year_closes: s.yearCloses,
      approvals: s.approvals, deleted_records: s.deletedRecords, branches: s.branches,
    };
    const missing = missingCloudColumns(rowsByTable);
    expect(missing).toEqual([]);
  });

  it('approval rules keep freight, split payment, schemes and cost centre on a bill sent by staff', async () => {
    seed();
    const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
    const settings = JSON.parse(localStorage.getItem('tradeflow_settings_v2')!);
    set('tradeflow_settings_v2', { ...settings, approvalRules: { discountPctAbove: 5, creditLimit: true } });
    set('tradeflow_products_v2', [{ id: 'p1', name: 'Dalda 16 L Tin', category: 'Ghee', unit: 'tin', unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 100, minThresholdKg: 0 }]);
    set('tradeflow_customers_v2', [{ id: 'c1', name: 'Zaman and Co', company: 'Zaman and Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 1000, createdAt: prevFyStart }]);
    const hook = renderHook(() => useTrading(), { wrapper });
    await signIn(() => hook.result.current, OPERATOR);
    const r = () => hook.result.current;

    // Paid in full by bank including the freight: nothing is over any rule, so it posts straight away.
    let res: any;
    act(() => { res = r().createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Tin', qty: 10, unitPrice: 1000 }], freightCharges: 500, payments: [{ method: 'Bank Transfer', amount: 10500 }] }); });
    expect(res.success, res.message).toBe(true);
    expect(res.pendingApproval).toBeUndefined();
    expect(r().invoices[0].totalAmount).toBe(10500);

    // A scheme's automatic % off is the shop's own offer, not a discount that needs approval.
    act(() => { res = r().createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Tin', qty: 10, unitPrice: 1000, discountType: 'pct', discountValue: 10, schemeId: 'sch-1', schemeName: '10% on 10' }], payments: [{ method: 'Cash', amount: 9000 }] }); });
    expect(res.success, res.message).toBe(true);
    expect(res.pendingApproval).toBeUndefined();

    // Over the credit limit only because of the freight: sent for approval (not posted), with the freight kept.
    act(() => { res = r().createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Tin', qty: 1, unitPrice: 900 }], freightCharges: 400, costCentreId: 'cc-x', payments: [] }); });
    expect(res.success, res.message).toBe(true);
    expect(res.pendingApproval).toBeTruthy();
    expect(res.pendingApproval.amount).toBe(1300);
    expect(res.pendingApproval.payload.freightCharges).toBe(400);
    expect(res.pendingApproval.payload.costCentreId).toBe('cc-x');
    expect(r().invoices.length).toBe(2);
  });

  it('the deleted-records bin keeps a copy of supplier bills, claims, orders, assets, staff, cost centres, salesmen, schemes and godowns', async () => {
    seed();
    const hook = renderHook(() => useTrading(), { wrapper });
    await signIn(() => hook.result.current);
    const r = () => hook.result.current;
    const ok = (res: { success: boolean; message: string }, what: string) => expect(res.success, `${what}: ${res.message}`).toBe(true);
    let poId = '';
    act(() => { const x = r().createPurchaseOrder({ supplierId: 's1', lines: [{ productId: 'p1', qty: 10, rate: 800 }] }); ok(x, 'po'); poId = x.order!.id; });
    act(() => ok(r().receiveStock({ productId: 'p1', qty: 10, costPrice: 800, supplierId: 's1' }), 'receive'));
    const receipt = r().purchases[0];
    let billId = '';
    act(() => { const x = r().recordSupplierBill({ supplierId: 's1', billNumber: 'B-9', purchaseIds: [receipt.id], lines: [{ productId: 'p1', qty: 10, rate: 810 }] }); ok(x, 'bill'); billId = x.bill!.id; });
    let claimId = '';
    act(() => { const x = r().addSupplierClaim({ supplierId: 's1', productId: 'p1', qty: 1, rate: 800, reason: 'damaged' }); ok(x, 'claim'); claimId = x.claim!.id; });
    let assetId = '';
    act(() => { const x = r().addFixedAsset({ name: 'Scale', category: 'other' as any, purchaseDate: today, cost: 5000, paidFrom: 'cash', usefulLifeYears: 2, method: 'straight_line' }); ok(x, 'asset'); assetId = x.asset!.id; });
    let staffId = '';
    act(() => { const x = r().addStaff({ name: 'Bashir', role: 'Helper', monthlySalary: 15000, joinDate: today }); ok(x, 'staff'); staffId = x.member!.id; });
    let advId = '';
    act(() => { const x = r().giveStaffAdvance({ staffId, amount: 1000, method: 'Cash' }); ok(x, 'advance'); advId = x.advance!.id; });
    let centreId = '';
    act(() => { const x = r().addCostCentre({ name: 'Truck', kind: 'vehicle' }); ok(x, 'centre'); centreId = x.centre!.id; });
    let smId = '';
    act(() => { const x = r().saveSalesman({ name: 'Rashid' }); ok(x, 'salesman'); smId = x.salesman!.id; });
    let areaId = '';
    act(() => { const x = r().saveArea({ name: 'Saddar' }); ok(x, 'area'); areaId = x.area!.id; });
    let schemeId = '';
    act(() => { const x = r().saveScheme({ name: '10+1', productId: 'p1', kind: 'free_every', buyQty: 10, freeQty: 1, active: true } as any); ok(x, 'scheme'); schemeId = x.scheme!.id; });
    let godownId = '';
    act(() => { const x = r().addGodown('Back store'); ok(x, 'godown'); godownId = x.godown!.id; });

    const del: [string, () => { success: boolean; message: string }][] = [
      ['supplier bill', () => r().deleteSupplierBill(billId)],
      ['claim', () => r().deleteSupplierClaim(claimId)],
      ['purchase order', () => r().removePurchaseOrder(poId)],
      ['asset', () => r().deleteFixedAsset(assetId)],
      ['advance', () => r().deleteStaffAdvance(advId)],
      ['staff', () => r().deleteStaff(staffId)],
      ['cost centre', () => r().deleteCostCentre(centreId)],
      ['salesman', () => r().deleteSalesman(smId)],
      ['area', () => r().deleteArea(areaId)],
      ['scheme', () => r().deleteScheme(schemeId)],
      ['godown', () => r().deleteGodown(godownId)],
    ];
    for (const [what, fn] of del) act(() => ok(fn(), `delete ${what}`));
    const labels = r().deletedRecords.map((x) => x.label).join(' | ');
    for (const text of ['B-9', 'CLM-', 'PO-', 'Scale', 'Advance', 'Bashir', 'Truck', 'Rashid', 'Saddar', '10+1', 'Back store']) expect(labels).toContain(text);
    expect(r().deletedRecords.length).toBe(del.length);
    // A refused delete leaves nothing in the bin.
    act(() => { expect(r().deleteSupplierBill('nope').success).toBe(false); });
    expect(r().deletedRecords.length).toBe(del.length);
  });

  it('a salary payment or an asset purchase cannot be "deleted" from the expense / cash lists, and nothing lands in the bin', async () => {
    seed();
    const hook = renderHook(() => useTrading(), { wrapper });
    await signIn(() => hook.result.current);
    const r = () => hook.result.current;
    let staffId = '';
    act(() => { staffId = r().addStaff({ name: 'Ali', role: '', monthlySalary: 10000, joinDate: today }).member!.id; });
    act(() => { r().paySalaries({ month: today.slice(0, 7), method: 'Cash', lines: [{ staffId, name: 'Ali', role: '', salary: 10000, bonus: 0, deductions: 0, advanceDeducted: 0, net: 10000 }] }); });
    act(() => { r().addFixedAsset({ name: 'Fan', category: 'other' as any, purchaseDate: today, cost: 5000, paidFrom: 'cash', usefulLifeYears: 2, method: 'straight_line' }); });
    const salary = r().expenses.find((e) => e.category === 'salaries')!;
    const asset = r().cashEntries.find((c) => c.description.includes('Fan'))!;
    expect(r().isLinkedRecord(salary.id)).toBe(true);
    expect(r().isLinkedRecord(asset.id)).toBe(true);
    act(() => r().deleteExpense(salary.id));
    act(() => r().deleteCashEntry(asset.id));
    expect(r().expenses.some((e) => e.id === salary.id)).toBe(true);
    expect(r().cashEntries.some((c) => c.id === asset.id)).toBe(true);
    expect(r().deletedRecords.length).toBe(0);
  });

  it('money collected with "Receive from many" lands in the cash of the branch that collected it', async () => {
    seed();
    const hook = renderHook(() => useTrading(), { wrapper });
    await signIn(() => hook.result.current);
    const r = () => hook.result.current;
    let second = '';
    act(() => { r().addBranch({ name: 'Batkhela shop' }); });
    act(() => { second = r().addBranch({ name: 'Mingora shop' }).branch!.id; });
    act(() => { expect(r().setUserBranch('user-superadmin', second).success).toBe(true); });
    act(() => { expect(r().receiveMany({ rows: [{ customerId: 'c3', amount: 4000, method: 'Cash' }] }).success).toBe(true); });
    const row = r().ledger.find((l) => l.type === 'payment_received' && l.entityId === 'c3')!;
    expect(row.branchId).toBe(second);
    act(() => r().setBranchView(second));
    const s = r();
    const { scopeToBranch } = await import('../utils/control');
    const scoped = scopeToBranch({ invoices: s.invoices, ledger: s.ledger, expenses: s.expenses, cashEntries: s.cashEntries, returns: s.returns }, second, s.mainBranchId);
    const cash = accountBalancesOn(collectCashMovements(scoped.ledger, scoped.expenses, scoped.cashEntries, s.customers, s.suppliers), { ...s.settings, cashOpeningBalance: 0, openingBankBalance: 0 }, today).cash;
    expect(cash).toBe(4000);
  });

  it('purchase orders follow the number series set in Admin', async () => {
    seed();
    const hook = renderHook(() => useTrading(), { wrapper });
    await signIn(() => hook.result.current);
    const r = () => hook.result.current;
    let res: any;
    act(() => { res = r().createPurchaseOrder({ supplierId: 's1', lines: [{ productId: 'p1', qty: 1, rate: 1 }] }); });
    expect(res.order.poNumber).toBe('PO-1');
    act(() => { expect(r().updateNumberSeries('po', { prefix: 'DF/', yearly: false, pad: 3 }).success).toBe(true); });
    act(() => { res = r().createPurchaseOrder({ supplierId: 's1', lines: [{ productId: 'p1', qty: 1, rate: 1 }] }); });
    // The counter never goes back, so the new prefix carries on from PO-1.
    expect(res.order.poNumber).toBe('DF/002');
    act(() => { res = r().ordersFromReorder([{ supplierId: 's1', productId: 'p1', qty: 5, rate: 800 }]); });
    expect(res.orders[0].poNumber).toBe('DF/003');
  });
});

/** Columns in supabase/setup.sql (CREATE TABLE + ALTER TABLE … ADD COLUMN), by table. */
const cloudColumns = (): Map<string, Set<string>> => {
  const sql = readFileSync(resolve(__dirname, '../../supabase/setup.sql'), 'utf8').replace(/--[^\n]*/g, '');
  const cols = new Map<string, Set<string>>();
  const add = (t: string, c: string) => { if (!cols.has(t)) cols.set(t, new Set()); cols.get(t)!.add(c); };
  const create = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/g;
  let m: RegExpExecArray | null;
  while ((m = create.exec(sql))) {
    m[2].split('\n').forEach((line) => {
      const hit = /^\s*("?)([A-Za-z_][A-Za-z0-9_]*)\1\s+[A-Z]/.exec(line);
      if (hit && !/^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK)$/i.test(hit[2])) add(m![1], hit[2]);
    });
  }
  const alter = /ALTER TABLE\s+(\w+)([\s\S]*?);/g;
  while ((m = alter.exec(sql))) {
    const re = /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?("?)([A-Za-z_][A-Za-z0-9_]*)\1/g;
    let c: RegExpExecArray | null;
    while ((c = re.exec(m[2]))) add(m[1], c[2]);
  }
  return cols;
};

const missingCloudColumns = (rowsByTable: Record<string, unknown[]>): string[] => {
  const cols = cloudColumns();
  const out: string[] = [];
  Object.entries(rowsByTable).forEach(([table, rows]) => {
    const have = cols.get(table);
    if (!have) { out.push(`${table}: table missing`); return; }
    const keys = new Set(rows.flatMap((row) => Object.keys(row as object)));
    keys.forEach((k) => { if (!have.has(k)) out.push(`${table}.${k}`); });
  });
  return out;
};
