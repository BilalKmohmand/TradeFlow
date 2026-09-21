import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { setDeleteReason } from '../context/controlActions';
import { seedTestUsers, signIn, OPERATOR, MANAGER, OWNER, TestCredentials } from './helpers/auth';
import { DEFAULT_ROLES } from '../lib/auth';
import { billDiscountPct, formatDocNumber, planDocNumber, scopeToBranch, settingsForBranch, ownerSnapshot, stockValue, highestExisting } from '../utils/control';
import { memoryBackupStore, runDailyBackup, saveBackup, backupReminderDue, KEEP_AUTO_BACKUPS } from '../lib/autoBackup';
import { DEFAULT_SETTINGS, Invoice } from '../types';
import { todayISO } from '../utils/stockFlow';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
type Hook = ReturnType<typeof renderHook<ReturnType<typeof useTrading>, unknown>>;

/** Customer c1 (limit 10,000, owes 8,000), c2 open; item p1 (Rs. 1,000, cost 800, 500 in stock); supplier s1 (owed 300,000). */
const setup = async (who: TestCredentials = OWNER) => {
  localStorage.setItem('tradeflow_customers_v2', JSON.stringify([
    { id: 'c1', name: 'Limited Traders', company: 'Limited Traders', phone: '0300', email: '', address: '', totalDue: 8000, creditLimit: 10000, createdAt: '2026-01-01' },
    { id: 'c2', name: 'Open Account', company: 'Open Account', phone: '0301', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]));
  localStorage.setItem('tradeflow_suppliers_v2', JSON.stringify([{ id: 's1', name: 'Ghee Mills', company: 'Ghee Mills', phone: '0333', email: '', address: '', totalOwed: 300000, createdAt: '2026-01-01' }]));
  localStorage.setItem('tradeflow_products_v2', JSON.stringify([{ id: 'p1', name: 'Oil tin', category: 'General', unit: 'tin', unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 500, minThresholdKg: 0 }]));
  localStorage.setItem('tradeflow_invoices_v1', '[]');
  localStorage.setItem('tradeflow_ledger_v2', '[]');
  // Operators may adjust stock in this shop (so the stock-loss rule applies to them).
  localStorage.setItem('tradeflow_roles_v2', JSON.stringify(DEFAULT_ROLES.map((r) => (r.id === 'operator' ? { ...r, permissions: [...r.permissions, 'stock:adjust'] } : r))));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, OWNER);
  act(() => { hook.result.current.updateSettings({ taxRatePct: 0 }); });
  if (who !== OWNER) await switchTo(hook, who);
  return hook;
};
const switchTo = async (h: Hook, who: TestCredentials) => {
  act(() => { h.result.current.logout(); });
  await signIn(() => h.result.current, who);
};
const run = <T,>(h: Hook, fn: () => T): T => {
  let r!: T;
  act(() => { r = fn(); });
  return r;
};
const rules = (h: Hook, r: Parameters<ReturnType<typeof useTrading>['updateApprovalRules']>[0]) => run(h, () => h.result.current.updateApprovalRules(r));

beforeEach(() => localStorage.clear());

describe('approval rules', () => {
  it('big discount: saved as waiting, nothing posted; a manager approves and it posts as the staff member’s bill', async () => {
    const h = await setup(OWNER);
    expect(rules(h, { discountPctAbove: 10 }).success).toBe(true);
    await switchTo(h, OPERATOR);
    expect(h.result.current.canApprove).toBe(false);
    const input = { customerId: 'c2', items: [{ productId: 'p1', name: 'Oil tin', qty: 10, unitPrice: 1000, discountType: 'pct' as const, discountValue: 5 }], discount: 1500, paidNow: 0 };
    expect(h.result.current.billApprovalReasons(input)?.[0]).toMatch(/Discount 20% .* over the 10% limit/);
    const r = run(h, () => h.result.current.createBill(input)) as any;
    expect(r.success).toBe(true);
    expect(r.pendingApproval).toBeTruthy();
    expect(r.invoice).toBeUndefined();
    expect(h.result.current.invoices).toHaveLength(0);
    expect(h.result.current.products[0].stockKg).toBe(500);
    expect(h.result.current.ledger).toHaveLength(0);
    expect(h.result.current.customers.find((c) => c.id === 'c2')!.totalDue).toBe(0);
    expect(h.result.current.approvals[0]).toMatchObject({ status: 'pending', kind: 'bill', rules: ['discount'], requestedBy: OPERATOR.name, amount: 8000 });
    // Staff can't approve their own request.
    expect(run(h, () => h.result.current.approveRequest(r.pendingApproval.id)).success).toBe(false);

    await switchTo(h, MANAGER);
    const ok = run(h, () => h.result.current.approveRequest(h.result.current.approvals[0].id, 'old customer'));
    expect(ok.success).toBe(true);
    const inv = h.result.current.invoices[0];
    expect(inv.totalAmount).toBe(8000);
    expect(inv.createdBy).toBe(OPERATOR.name);
    expect(inv.approval).toMatchObject({ approvedBy: MANAGER.name, note: 'old customer' });
    expect(h.result.current.products[0].stockKg).toBe(490);
    expect(h.result.current.approvals[0]).toMatchObject({ status: 'approved', resultRef: inv.invoiceNumber, decisionNote: 'old customer' });
    // Approving twice does nothing.
    expect(run(h, () => h.result.current.approveRequest(h.result.current.approvals[0].id)).success).toBe(false);
    expect(h.result.current.invoices).toHaveLength(1);
  });

  it('a manager is never stopped by the rules; a small discount posts at once', async () => {
    const h = await setup(MANAGER);
    act(() => { h.result.current.logout(); });
    await signIn(() => h.result.current, OWNER);
    rules(h, { discountPctAbove: 10 });
    await switchTo(h, MANAGER);
    const big = run(h, () => h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Oil tin', qty: 1, unitPrice: 1000 }], discount: 500, paidNow: 500 }));
    expect(big.invoice).toBeTruthy();
    await switchTo(h, OPERATOR);
    const small = run(h, () => h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Oil tin', qty: 1, unitPrice: 1000 }], discount: 100, paidNow: 900 }));
    expect(small.invoice).toBeTruthy();
    expect(h.result.current.approvals).toHaveLength(0);
  });

  it('bill over the credit limit goes for approval (instead of being refused) and posts with the override', async () => {
    const h = await setup(OPERATOR);
    const bill = { customerId: 'c1', items: [{ productId: 'p1', name: 'Oil tin', qty: 5, unitPrice: 1000 }], paidNow: 0 };
    expect(run(h, () => h.result.current.createBill(bill)).success).toBe(false); // rule off: refused as before
    await switchTo(h, OWNER);
    rules(h, { creditLimit: true });
    await switchTo(h, OPERATOR);
    const r = run(h, () => h.result.current.createBill({ ...bill, overrideReason: 'pays Friday' })) as any;
    expect(r.pendingApproval.reasons[0]).toMatch(/credit limit/);
    expect(r.pendingApproval.note).toBe('pays Friday');
    expect(h.result.current.customers.find((c) => c.id === 'c1')!.totalDue).toBe(8000);
    await switchTo(h, MANAGER);
    expect(run(h, () => h.result.current.approveRequest(r.pendingApproval.id)).success).toBe(true);
    const inv = h.result.current.invoices[0];
    expect(inv.creditOverride?.by).toBe(MANAGER.name);
    expect(h.result.current.customers.find((c) => c.id === 'c1')!.totalDue).toBe(13000);
  });

  it('supplier payment above the limit waits; reject needs a note and posts nothing; approve pays', async () => {
    const h = await setup(OWNER);
    rules(h, { supplierPaymentAbove: 100000 });
    await switchTo(h, OPERATOR);
    expect(h.result.current.supplierPaymentApproval(150000)).toMatch(/over the Rs\.? ?100,000 limit/);
    expect(h.result.current.supplierPaymentApproval(50000)).toBeNull();
    const led = run(h, () => h.result.current.recordSupplierPayment('s1', 150000, 'Bank Transfer - HBL'));
    expect(led).toBeUndefined();
    expect(h.result.current.suppliers[0].totalOwed).toBe(300000);
    expect(h.result.current.ledger).toHaveLength(0);
    // Cheques to suppliers follow the same rule.
    const chq = run(h, () => h.result.current.issueCheque({ supplierId: 's1', amount: 120000, bankName: 'MCB', chequeNumber: '777', chequeDate: todayISO() })) as any;
    expect(chq.pendingApproval).toBeTruthy();
    expect(h.result.current.cheques).toHaveLength(0);
    // Small payments go straight through.
    expect(run(h, () => h.result.current.recordSupplierPayment('s1', 1000, 'Cash'))).toBeTruthy();
    expect(h.result.current.suppliers[0].totalOwed).toBe(299000);

    await switchTo(h, MANAGER);
    const [cheque, pay] = h.result.current.approvals;
    expect(run(h, () => h.result.current.rejectRequest(pay.id, '')).success).toBe(false);
    expect(run(h, () => h.result.current.rejectRequest(pay.id, 'pay next week')).success).toBe(true);
    expect(h.result.current.approvals.find((a) => a.id === pay.id)).toMatchObject({ status: 'rejected', decisionNote: 'pay next week', decidedBy: MANAGER.name });
    expect(h.result.current.suppliers[0].totalOwed).toBe(299000);
    expect(run(h, () => h.result.current.approveRequest(cheque.id)).success).toBe(true);
    expect(h.result.current.cheques[0]).toMatchObject({ chequeNumber: '777', amount: 120000, status: 'issued' });
    expect(h.result.current.suppliers[0].totalOwed).toBe(179000);
  });

  it('stock loss above the limit waits; the stock changes only when approved', async () => {
    const h = await setup(OWNER);
    rules(h, { stockLossAbove: 5000 });
    await switchTo(h, OPERATOR);
    const big = run(h, () => h.result.current.adjustStockBy({ productId: 'p1', deltaQty: -10, reason: 'leaked', note: 'rats' })) as any;
    expect(big.pendingApproval.reasons[0]).toMatch(/Rs\.? ?8,000 is over the Rs\.? ?5,000 limit/);
    expect(h.result.current.products[0].stockKg).toBe(500);
    expect(h.result.current.adjustments).toHaveLength(0);
    const small = run(h, () => h.result.current.adjustStockBy({ productId: 'p1', deltaQty: -2, reason: 'leaked' }));
    expect(small.success).toBe(true);
    expect(h.result.current.products[0].stockKg).toBe(498);
    await switchTo(h, MANAGER);
    expect(run(h, () => h.result.current.approveRequest(big.pendingApproval.id)).success).toBe(true);
    expect(h.result.current.products[0].stockKg).toBe(488);
    expect(h.result.current.adjustments[0]).toMatchObject({ deltaKg: -10, note: 'rats' });
  });

  it('deleting a bill: staff can only ask; the approved delete lands in the bin with the reason', async () => {
    const h = await setup(OWNER);
    rules(h, { deleteBills: true });
    const bill = run(h, () => h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Oil tin', qty: 3, unitPrice: 1000 }], paidNow: 3000 }));
    await switchTo(h, OPERATOR);
    expect(h.result.current.billDeleteNeedsApproval).toBe(true);
    const ask = run(h, () => h.result.current.deleteRecord('bill', bill.invoice!.id, 'typed twice')) as any;
    expect(ask.success).toBe(false);
    expect(ask.message).toMatch(/must approve/);
    expect(h.result.current.invoices).toHaveLength(1);
    expect(run(h, () => h.result.current.deleteBill(bill.invoice!.id)).message).toMatch(/already waiting/);
    await switchTo(h, MANAGER);
    expect(run(h, () => h.result.current.approveRequest(h.result.current.approvals[0].id)).success).toBe(true);
    expect(h.result.current.invoices).toHaveLength(0);
    expect(h.result.current.products[0].stockKg).toBe(500);
    const binned = h.result.current.deletedRecords[0];
    expect(binned).toMatchObject({ kind: 'bill', recordId: bill.invoice!.id });
    expect(binned.reason).toMatch(/typed twice — approved by Rashid/);
  });
});

describe('deleted records bin', () => {
  it('keeps a copy with who / when / why for every delete; admins restore customers, items and expenses', async () => {
    const h = await setup(OWNER);
    const exp = run(h, () => h.result.current.addExpense({ date: todayISO(), category: 'food', amount: 450, description: 'Tea', paidVia: 'Cash' }));
    // Through a confirm dialog: the reason slot.
    act(() => { setDeleteReason('wrong day'); h.result.current.deleteExpense(exp.id); setDeleteReason(''); });
    expect(run(h, () => h.result.current.deleteRecord('customer', 'c2', 'duplicate')).success).toBe(true);
    expect(run(h, () => h.result.current.deleteRecord('item', 'p1', 'discontinued')).success).toBe(true);
    const bin = h.result.current.deletedRecords;
    expect(bin.map((b) => [b.kind, b.reason, b.deletedBy])).toEqual([
      ['item', 'discontinued', OWNER.name],
      ['customer', 'duplicate', OWNER.name],
      ['expense', 'wrong day', OWNER.name],
    ]);
    expect(h.result.current.expenses).toHaveLength(0);
    // A delete with no reason is still kept.
    const bill = run(h, () => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'nope', name: 'x', qty: 0, unitPrice: 1 }] }));
    expect(bill.success).toBe(false);
    for (const b of [...bin]) {
      if (b.kind === 'bill') continue;
      expect(h.result.current.canRestore(h.result.current.deletedRecords.find((x) => x.id === b.id)!)).toBe(true);
      expect(run(h, () => h.result.current.restoreDeletedRecord(b.id)).success).toBe(true);
    }
    expect(h.result.current.customers.find((c) => c.id === 'c2')).toBeTruthy();
    expect(h.result.current.products.find((p) => p.id === 'p1')!.stockKg).toBe(0);
    expect(h.result.current.expenses[0].description).toBe('Tea');
    expect(h.result.current.deletedRecords.every((b) => b.restoredBy === OWNER.name)).toBe(true);
    expect(run(h, () => h.result.current.restoreDeletedRecord(bin[0].id)).success).toBe(false); // only once
  });

  it('bills are kept for viewing but not restorable; managers cannot restore', async () => {
    const h = await setup(OWNER);
    const bill = run(h, () => h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Oil tin', qty: 1, unitPrice: 1000 }], paidNow: 1000 }));
    expect(run(h, () => h.result.current.deleteRecord('bill', bill.invoice!.id, 'test')).success).toBe(true);
    const rec = h.result.current.deletedRecords[0];
    expect((rec.data as Invoice).invoiceNumber).toBe(bill.invoice!.invoiceNumber);
    expect(h.result.current.canRestore(rec)).toBe(false);
    expect(run(h, () => h.result.current.restoreDeletedRecord(rec.id)).message).toMatch(/cannot be restored/);
    run(h, () => h.result.current.deleteRecord('customer', 'c1', 'x'));
    await switchTo(h, MANAGER);
    expect(h.result.current.canRestore(h.result.current.deletedRecords[0])).toBe(false);
  });
});

describe('document number series', () => {
  it('pure: formats, continues after old numbers, never reuses', () => {
    expect(formatDocNumber({ prefix: 'INV-', yearly: true, pad: 4 }, 7, '2026')).toBe('INV-2026-0007');
    expect(formatDocNumber({ prefix: 'INV-' }, 7, '2026')).toBe('INV-7');
    expect(highestExisting(['INV-3', 'INV-12', 'CN-40', 'INV-2026-001'], { prefix: 'INV-' }, '2026')).toBe(12);
    expect(planDocNumber({ docCounters: {} }, 'bill', '2026-05-01', ['INV-3']).number).toBe('INV-4');
    // Counter ahead of the list (the last bill was deleted): keeps going.
    expect(planDocNumber({ docCounters: { bill: 9 } }, 'bill', '2026-05-01', ['INV-3']).number).toBe('INV-10');
    // Yearly: a new year starts at 1.
    const s = { numberSeries: { bill: { prefix: 'INV-', yearly: true, pad: 4 } }, docCounters: { 'bill:2025': 88 } };
    expect(planDocNumber(s, 'bill', '2025-12-31', []).number).toBe('INV-2025-0089');
    expect(planDocNumber(s, 'bill', '2026-01-01', []).number).toBe('INV-2026-0001');
  });

  it('bills follow the series; a deleted number is not reused; next number only moves forward', async () => {
    const h = await setup(OWNER);
    const make = () => run(h, () => h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Oil tin', qty: 1, unitPrice: 1000 }], paidNow: 1000 })).invoice!;
    expect(make().invoiceNumber).toBe('INV-1');
    const second = make();
    expect(second.invoiceNumber).toBe('INV-2');
    run(h, () => h.result.current.deleteBill(second.id));
    expect(make().invoiceNumber).toBe('INV-3');
    const year = todayISO().slice(0, 4);
    expect(run(h, () => h.result.current.updateNumberSeries('bill', { prefix: 'SB-', yearly: true, pad: 4 })).success).toBe(true);
    expect(h.result.current.previewDocNumber('bill')).toBe(`SB-${year}-0001`);
    expect(make().invoiceNumber).toBe(`SB-${year}-0001`);
    expect(run(h, () => h.result.current.updateNumberSeries('bill', { prefix: 'SB-', yearly: true, pad: 4, startAt: 1 })).success).toBe(false);
    expect(run(h, () => h.result.current.updateNumberSeries('bill', { prefix: 'SB-', yearly: true, pad: 4, startAt: 50 })).success).toBe(true);
    expect(make().invoiceNumber).toBe(`SB-${year}-0050`);
    expect(run(h, () => h.result.current.updateNumberSeries('quotation', { prefix: 'SB-' })).message).toMatch(/already use/);
    // Credit notes and receipts have their own series.
    expect(run(h, () => h.result.current.updateNumberSeries('receipt', { prefix: 'RCPT-', pad: 5 })).success).toBe(true);
    const led = run(h, () => h.result.current.recordCustomerPayment('c1', 500, 'Cash'));
    expect(led!.referenceId).toBe('RCPT-00001');
    // Staff can't change numbering.
    await switchTo(h, OPERATOR);
    expect(run(h, () => h.result.current.updateNumberSeries('bill', { prefix: 'X-' })).success).toBe(false);
  });
});

describe('branches', () => {
  it('single branch: nothing is stamped; two branches: bills, expenses and cash record the user’s branch and filter', async () => {
    const h = await setup(OWNER);
    const add = (name: string) => run(h, () => h.result.current.addBranch({ name })).branch!;
    const main = add('Batkhela shop');
    run(h, () => h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Oil tin', qty: 1, unitPrice: 1000 }], paidNow: 1000 }));
    expect(h.result.current.branchesEnabled).toBe(false);
    expect(h.result.current.invoices[0].branchId).toBeUndefined();
    const second = add('Mingora shop');
    expect(h.result.current.branchesEnabled).toBe(true);
    const op = h.result.current.users.find((u) => u.username === OPERATOR.username)!;
    expect(run(h, () => h.result.current.setUserBranch(op.id, second.id)).success).toBe(true);
    expect(run(h, () => h.result.current.setGodownBranch(h.result.current.godowns[0].id, main.id)).success).toBe(true);
    await switchTo(h, OPERATOR);
    expect(h.result.current.currentBranchId).toBe(second.id);
    run(h, () => h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Oil tin', qty: 2, unitPrice: 1000 }], paidNow: 2000 }));
    run(h, () => h.result.current.addExpense({ date: todayISO(), category: 'food', amount: 100, description: 'Tea', paidVia: 'Cash' }));
    run(h, () => h.result.current.addCashTransfer({ amount: 500, from: 'cash' }));
    expect(h.result.current.invoices[0].branchId).toBe(second.id);
    expect(h.result.current.expenses[0].branchId).toBe(second.id);
    expect(h.result.current.cashEntries.every((c) => c.branchId === second.id)).toBe(true);

    const t = h.result.current;
    const src = { invoices: t.invoices, ledger: t.ledger, expenses: t.expenses, cashEntries: t.cashEntries, returns: t.returns };
    const mingora = scopeToBranch(src, second.id, t.mainBranchId);
    const batkhela = scopeToBranch(src, main.id, t.mainBranchId);
    expect(mingora.invoices.map((i) => i.totalAmount)).toEqual([2000]);
    expect(batkhela.invoices.map((i) => i.totalAmount)).toEqual([1000]); // the old bill belongs to the main branch
    expect(mingora.ledger.filter((l) => l.type === 'payment_received').map((l) => l.credit)).toEqual([2000]);
    expect(mingora.expenses).toHaveLength(1);
    expect(batkhela.expenses).toHaveLength(0);
    expect(settingsForBranch({ ...DEFAULT_SETTINGS, cashOpeningBalance: 5000 }, second.id, t.mainBranchId).cashOpeningBalance).toBe(0);
    expect(scopeToBranch(src, 'all', t.mainBranchId)).toBe(src);
    // A branch with records cannot be removed.
    await switchTo(h, OWNER);
    expect(run(h, () => h.result.current.deleteBranch(second.id)).success).toBe(false);
  });
});

describe('owner dashboard figures', () => {
  it('sales, profit, stock value and top lists from bills', async () => {
    const h = await setup(OWNER);
    run(h, () => h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Oil tin', qty: 10, unitPrice: 1000 }], paidNow: 10000 }));
    run(h, () => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Oil tin', qty: 1, unitPrice: 1000 }], paidNow: 1000 }));
    const t = h.result.current;
    const snap = ownerSnapshot({ invoices: t.invoices, ledger: t.ledger, expenses: t.expenses, cashEntries: t.cashEntries, customers: t.customers, suppliers: t.suppliers, products: t.products, purchases: t.purchases, returns: t.returns, cheques: t.cheques, settings: t.settings }, todayISO());
    expect(snap.salesToday).toBe(11000);
    expect(snap.billsToday).toBe(2);
    expect(snap.profitToday).toBe(2200);
    expect(snap.stockValue).toBe(489 * 800);
    expect(snap.topCustomers[0]).toMatchObject({ name: 'Open Account', sales: 10000 });
    expect(snap.topItems[0]).toMatchObject({ name: 'Oil tin', qty: 11 });
    expect(snap.trend).toHaveLength(30);
    expect(snap.trend[29]).toMatchObject({ date: todayISO(), sales: 11000 });
    expect(stockValue([{ id: 'x', name: 'x', stockKg: -5, costPricePerKg: 10 } as any], [], todayISO())).toBe(0);
    expect(billDiscountPct([{ qty: 2, unitPrice: 500 }], 250).pct).toBe(25);
  });
});

describe('automatic backups', () => {
  it('one per day, newest 14 kept, and a reminder after 7 days without a download', async () => {
    const store = memoryBackupStore();
    let n = 0;
    const build = () => JSON.stringify({ invoices: new Array(++n).fill({}) });
    expect(await runDailyBackup(store, build, '2026-09-01')).toBeTruthy();
    expect(await runDailyBackup(store, build, '2026-09-01')).toBeNull();
    for (let d = 2; d <= 20; d++) await runDailyBackup(store, build, `2026-09-${String(d).padStart(2, '0')}`);
    const list = await store.list();
    expect(list).toHaveLength(KEEP_AUTO_BACKUPS);
    expect(list.map((b) => b.date)).toContain('2026-09-20');
    expect(list.map((b) => b.date)).not.toContain('2026-09-01');
    await saveBackup(store, build(), '2026-09-20', 'manual');
    expect((await store.list()).filter((b) => b.kind === 'manual')).toHaveLength(1);
    const latest = await store.get(list[0].id);
    expect(JSON.parse(latest!.json).invoices.length).toBeGreaterThan(0);
    const now = new Date('2026-09-21T10:00:00Z');
    expect(backupReminderDue(null, now)).toBe(true);
    expect(backupReminderDue('2026-09-18T10:00:00Z', now)).toBe(false);
    expect(backupReminderDue('2026-09-10T10:00:00Z', now)).toBe(true);
  });

  it('the full backup carries approvals, the bin and branches, and restoring brings them back', async () => {
    const h = await setup(OWNER);
    run(h, () => h.result.current.addBranch({ name: 'Batkhela shop' }));
    run(h, () => h.result.current.deleteRecord('customer', 'c2', 'dup'));
    let json = '';
    act(() => { json = h.result.current.exportSystemBackup(); });
    const data = JSON.parse(json);
    expect(data.branches).toHaveLength(1);
    expect(data.deletedRecords).toHaveLength(1);
    expect(h.result.current.lastBackupDownloadAt).toBeTruthy();
    expect(h.result.current.backupReminderDue).toBe(false);
    act(() => { h.result.current.factoryResetAllData(); });
    expect(h.result.current.branches).toHaveLength(0);
    act(() => { h.result.current.importSystemBackup(json); });
    expect(h.result.current.branches[0].name).toBe('Batkhela shop');
    expect(h.result.current.deletedRecords[0].reason).toBe('dup');
  });
});
