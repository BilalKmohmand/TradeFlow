/**
 * v23 fixes: payment reminders, pack units on quotations / returns, branch balances, bill numbers
 * across devices, deleting a customer with cheques in hand, restoring bills / payments from the bin,
 * undoing interest runs and collection sheets, the depreciation reminder and the barcode fallback.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { ACC, DEFAULT_ACCOUNTS, accountTotals, buildJournal, trialBalance } from '../utils/accounting';
import { remindersDue, reminderMessage, reminderLink, openBills, cleanReminderSettings } from '../utils/reminders';
import { findNumberClashes, untaggedClashes, idTime } from '../utils/numberClash';
import { partyBalancesForBranch } from '../utils/control';
import { depreciationDue } from '../utils/financeBooks';
import { scanEngine } from '../lib/barcodeScan';
import { shiftDate, todayISO } from '../utils/stockFlow';
import { Customer, DeletedRecord, FixedAsset, Invoice, LedgerEntry } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();
const ago = (n: number) => shiftDate(today, -n);

const setup = async (opts: { as?: 'owner' | 'operator' } = {}) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil Traders', cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman Store', company: 'Zaman Store', phone: '0344 1234567', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
    { id: 'c2', name: 'Bismillah Traders', company: 'Bismillah Traders', phone: '0345 7654321', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ghee Mills', company: 'Ghee Mills', phone: '0333', email: '', address: '', totalOwed: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: 'Dalda 5L tin', category: 'Oil', unit: 'tin', packName: 'carton', packSize: 6, unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 120, minThresholdKg: 0 },
    { id: 'p2', name: 'Ghee 1kg', category: 'Ghee', unit: 'pack', unitPricePerKg: 500, costPricePerKg: 400, stockKg: 50, minThresholdKg: 0 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2', 'tradeflow_quotations_v2', 'tradeflow_agreed_rates_v1'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, opts.as === 'operator' ? OPERATOR : undefined);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => { out = fn(); });
  return out!;
};
const books = (h: Hook) => {
  const t = h.result.current;
  return buildJournal({ settings: t.settings, customers: t.customers, suppliers: t.suppliers, ledger: t.ledger, invoices: t.invoices, dispatches: t.dispatches, purchases: t.purchases, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, returns: t.returns, adjustments: t.adjustments });
};
const balanced = (h: Hook) => expect(trialBalance(books(h), DEFAULT_ACCOUNTS, today).balanced).toBe(true);
const cust = (h: Hook, id = 'c1') => h.result.current.customers.find((c) => c.id === id)!;
const makeBill = (h: Hook, input: Record<string, unknown> = {}) => {
  const r = run(() => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Ghee 1kg', qty: 10, unitPrice: 500 }], ...input } as any));
  expect(r.success, r.message).toBe(true);
  return r.invoice!;
};

beforeEach(() => localStorage.clear());

// ---------------------------------------------------------------------------------------------
describe('1. payment reminders', () => {
  const cst = (patch: Partial<Customer> = {}): Customer => ({ id: 'c1', name: 'Zaman Store', company: '', phone: '0344 1234567', email: '', address: '', totalDue: 5000, creditLimit: 0, createdAt: ago(100), ...patch });
  const bill = (patch: Partial<Invoice>): Invoice => ({ id: 'i1', invoiceNumber: 'INV-1', customerId: 'c1', customerName: 'Zaman Store', issueDate: ago(20), dueDate: ago(20), status: 'issued', paymentStatus: 'unpaid', items: [], subtotal: 5000, taxRatePct: 0, taxAmount: 0, totalAmount: 5000, paidAmount: 0, balanceDue: 5000, createdAt: ago(20), billKind: 'credit', ...patch });
  const on = { reminders: { enabled: true, daysAfterDue: 7, olderThanDays: 30, everyDays: 7 } };

  it('is off by default; with it on, lists customers past the rules and at most once every N days', () => {
    expect(remindersDue([cst()], [bill({})], {}, today)).toHaveLength(0);
    const rows = remindersDue([cst()], [bill({})], on, today);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 5000, reason: '20 days past due', oldest: { invoiceNumber: 'INV-1', days: 20 } });
    // Only 3 days past due: not yet.
    expect(remindersDue([cst()], [bill({ issueDate: ago(3), dueDate: ago(3) })], on, today)).toHaveLength(0);
    // Age rule alone.
    expect(remindersDue([cst()], [bill({ issueDate: ago(40), dueDate: ago(40) })], { reminders: { ...on.reminders, daysAfterDue: null } }, today)[0].reason).toBe('40 days old');
    // Reminded 2 days ago: not again before 7 days; 8 days ago: yes.
    expect(remindersDue([cst({ lastRemindedAt: `${ago(2)}T09:00:00.000Z` })], [bill({})], on, today)).toHaveLength(0);
    expect(remindersDue([cst({ lastRemindedAt: `${ago(8)}T09:00:00.000Z` })], [bill({})], on, today)).toHaveLength(1);
    // Nothing owed or no phone: never listed.
    expect(remindersDue([cst({ totalDue: 0 })], [bill({})], on, today)).toHaveLength(0);
    expect(remindersDue([cst({ phone: '' })], [bill({})], on, today)).toHaveLength(0);
  });

  it('money paid on account clears the oldest bills first', () => {
    const bills = [bill({ id: 'a', invoiceNumber: 'INV-1', issueDate: ago(60), dueDate: ago(60) }), bill({ id: 'b', invoiceNumber: 'INV-2', issueDate: ago(10), dueDate: ago(10) })];
    const open = openBills(cst({ totalDue: 6000 }), bills);
    expect(open.map((o) => [o.invoice.invoiceNumber, o.left])).toEqual([['INV-2', 5000], ['INV-1', 1000]]);
    expect(remindersDue([cst({ totalDue: 4000 })], bills, on, today)[0].oldest?.invoiceNumber).toBe('INV-2');
  });

  it('the WhatsApp message is polite and shows the amount, the oldest bill and the shop', () => {
    const row = remindersDue([cst()], [bill({})], on, today)[0];
    const text = reminderMessage(row, 'Madina Oil Traders');
    expect(text).toContain('Assalam-o-Alaikum Zaman Store');
    expect(text).toContain('Rs. 5,000');
    expect(text).toContain('INV-1');
    expect(text).toContain('Madina Oil Traders');
    expect(reminderLink(row, 'Madina Oil Traders')).toMatch(/^https:\/\/wa\.me\/923441234567\?text=/);
    expect(cleanReminderSettings({ enabled: true, daysAfterDue: null, olderThanDays: null, everyDays: 7 }).ok).toBe(false);
  });

  it('context: turning it on lists the customer; tapping send records "last reminded" and takes them off the list', async () => {
    const h = await setup();
    makeBill(h, { date: ago(15) });
    expect(h.result.current.reminderSettings.enabled).toBe(false);
    expect(h.result.current.remindersDue).toHaveLength(0);
    expect(run(() => h.result.current.updateReminderSettings({ enabled: true, daysAfterDue: 7 })).success).toBe(true);
    expect(h.result.current.remindersDue.map((r) => r.customer.id)).toEqual(['c1']);
    expect(run(() => h.result.current.markReminded(['c1'])).success).toBe(true);
    expect(cust(h).lastRemindedAt).toBeTruthy();
    expect(h.result.current.remindersDue).toHaveLength(0);
    expect(h.result.current.auditLogs.some((a) => a.action === 'Payment Reminder Sent')).toBe(true);
  });

  it('staff cannot change the reminder rules', async () => {
    const h = await setup({ as: 'operator' });
    expect(run(() => h.result.current.updateReminderSettings({ enabled: true })).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('2. pack units on quotations and returns', () => {
  it('a quotation typed per carton keeps base units, exact totals, and the pack for printing', async () => {
    const h = await setup();
    // 2 cartons at Rs. 5,999 a carton = 12 tins at 999.8333… each.
    const r = run(() => h.result.current.saveBillQuotation({ customerId: 'c1', validUntil: shiftDate(today, 7), items: [{ productId: 'p1', productName: 'Dalda 5L tin', qty: 12, unitPrice: 5999 / 6, unit: 'tin', packName: 'carton', packSize: 6, packPrice: 5999 }] }));
    expect(r.success, r.message).toBe(true);
    const line = r.quotation!.items![0];
    expect(line).toMatchObject({ qty: 12, packName: 'carton', packSize: 6, packPrice: 5999 });
    expect(r.quotation!.amount).toBe(11998);
  });

  it('a return carries the bill line pack so the credit note prints cartons', async () => {
    const h = await setup();
    const inv = makeBill(h, { items: [{ productId: 'p1', name: 'Dalda 5L tin', qty: 12, unitPrice: 1000, packPrice: 6000 }] });
    expect(inv.items[0]).toMatchObject({ packName: 'carton', packSize: 6 });
    const r = run(() => h.result.current.returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: inv.items[0].id, qty: 6 }], settle: 'credit', reason: 'dented' }));
    expect(r.success, r.message).toBe(true);
    expect(r.stockReturn!.items![0]).toMatchObject({ qty: 6, packName: 'carton', packSize: 6 });
    balanced(h);
  });
});

// ---------------------------------------------------------------------------------------------
describe('3. branch-wise receivables and payables', () => {
  const led = (p: Partial<LedgerEntry>): LedgerEntry => ({ id: Math.random().toString(36), entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'X', date: ago(5), description: '', debit: 0, credit: 0, balanceAfter: 0, ...p });
  const inv = (id: string, branchId: string | null, total: number): Invoice => ({ id, invoiceNumber: id, customerId: 'c1', customerName: 'A', issueDate: ago(5), dueDate: ago(5), status: 'issued', paymentStatus: 'unpaid', items: [], subtotal: total, taxRatePct: 0, taxAmount: 0, totalAmount: total, paidAmount: 0, balanceDue: total, createdAt: ago(5), billKind: 'credit', branchId });
  const src = () => ({
    invoices: [inv('inv-a', null, 1000), inv('inv-b', 'br-b', 500)],
    ledger: [
      led({ sourceId: 'inv-a', debit: 1000 }),
      led({ sourceId: 'inv-b', debit: 500 }),
      led({ type: 'payment_received', credit: 700, branchId: 'br-b' }),
      // Supplier rows: a debit is what the shop owes going up (a purchase), a credit is a payment.
      led({ entityType: 'supplier', entityId: 's1', type: 'purchase_received', debit: 3000 }),
      led({ entityType: 'supplier', entityId: 's1', type: 'payment_made', credit: 1000, branchId: 'br-b' }),
    ],
    expenses: [],
    cashEntries: [],
    returns: [],
    // 200 of the customer's balance is an opening balance (not explained by the ledger).
    customers: [{ id: 'c1', name: 'A', company: '', phone: '', email: '', address: '', totalDue: 1000, creditLimit: 0, createdAt: '2026-01-01' } as Customer],
    suppliers: [{ id: 's1', name: 'S', company: 'S', phone: '', email: '', address: '', materialCategory: '', totalOwed: 2000, createdAt: '2026-01-01' }],
  });

  it('balances come from branch rows; old rows and opening balances count as main; branches add up to the whole shop', () => {
    const s = src();
    const main = partyBalancesForBranch(s, 'br-main', 'br-main');
    const b = partyBalancesForBranch(s, 'br-b', 'br-main');
    expect(main.customers[0].totalDue).toBe(1200);
    expect(b.customers[0].totalDue).toBe(-200);
    expect(main.customers[0].totalDue + b.customers[0].totalDue).toBe(1000);
    expect(main.suppliers[0].totalOwed).toBe(3000);
    expect(b.suppliers[0].totalOwed).toBe(-1000);
    expect(partyBalancesForBranch(s, 'all', 'br-main').customers[0].totalDue).toBe(1000);
  });

  it('each branch trial balance balances and Receivable 1100 equals the branch balances', async () => {
    const h = await setup();
    const owner = h.result.current.currentUser!;
    const mainBr = run(() => h.result.current.addBranch({ name: 'Mingora' })).branch!;
    const other = run(() => h.result.current.addBranch({ name: 'Batkhela' })).branch!;
    makeBill(h); // main: 5,000 on credit
    run(() => h.result.current.setUserBranch(owner.id, other.id));
    makeBill(h, { customerId: 'c2', items: [{ productId: 'p2', name: 'Ghee 1kg', qty: 4, unitPrice: 500 }] }); // Batkhela: 2,000
    run(() => h.result.current.receiveMany({ rows: [{ customerId: 'c1', amount: 1500, method: 'Cash' }] })); // c1 pays at Batkhela
    const t = h.result.current;
    const all = { invoices: t.invoices, ledger: t.ledger, expenses: t.expenses, cashEntries: t.cashEntries, returns: t.returns, customers: t.customers, suppliers: t.suppliers };
    let sum = 0;
    for (const br of [mainBr, other]) {
      const scoped = partyBalancesForBranch(all, br.id, t.mainBranchId);
      const { scopeToBranch, settingsForBranch } = await import('../utils/control');
      const part = scopeToBranch(all, br.id, t.mainBranchId);
      const journal = buildJournal({ settings: settingsForBranch(t.settings, br.id, t.mainBranchId), customers: scoped.customers, suppliers: scoped.suppliers, ledger: part.ledger, invoices: part.invoices, expenses: part.expenses, cashEntries: part.cashEntries, returns: part.returns, products: t.products, purchases: t.purchases, adjustments: t.adjustments, branchPart: br.id === t.mainBranchId ? 'main' : 'other', stockInvoices: t.invoices, stockReturns: t.returns });
      expect(trialBalance(journal, DEFAULT_ACCOUNTS, today).balanced).toBe(true);
      const receivable = accountTotals(journal).get(ACC.RECEIVABLE)?.net ?? 0;
      expect(receivable).toBe(scoped.customers.reduce((a, c) => a + c.totalDue, 0));
      sum += receivable;
    }
    expect(sum).toBe(t.customers.reduce((a, c) => a + c.totalDue, 0));
    expect(sum).toBe(5000 + 2000 - 1500);
  });
});

// ---------------------------------------------------------------------------------------------
describe('4. bill numbers used on two devices', () => {
  const t0 = Date.UTC(2026, 8, 1, 10, 0, 0);
  const id = (ms: number) => `inv-${ms.toString(36)}0abcd`;

  it('pure: the bill made later is renumbered, only by the device that made it; untagged clashes are reported', () => {
    expect(idTime(id(t0))).toBe(t0);
    const mine = { id: id(t0 + 60000), invoiceNumber: 'INV-12', deviceId: 'AAA' };
    const theirs = { id: id(t0), invoiceNumber: 'INV-12', deviceId: 'BBB' };
    expect(findNumberClashes([mine], [theirs], 'AAA')).toEqual([{ invoiceId: mine.id, number: 'INV-12', keptId: theirs.id }]);
    // On the other device the earlier bill is its own: it keeps the number, nothing to do.
    expect(findNumberClashes([theirs], [mine], 'BBB')).toEqual([]);
    // Same bill on both sides is not a clash.
    expect(findNumberClashes([mine], [mine], 'AAA')).toEqual([]);
    expect(untaggedClashes([{ id: id(t0), invoiceNumber: 'INV-3' }], [{ id: id(t0 + 5), invoiceNumber: 'INV-3' }])).toEqual(['INV-3']);
  });

  it('context: a later bill from this device is renumbered, its ledger lines follow, the old number is kept and the user is told', async () => {
    const h = await setup();
    const inv = makeBill(h, { paidNow: 1000 });
    const old = inv.invoiceNumber;
    expect(inv.deviceId).toBe(h.result.current.deviceId);
    // Another device made the same number a minute earlier (already in the cloud).
    const cloud = [{ id: id(idTime(inv.id) - 60000), invoiceNumber: old, deviceId: 'OTHER' }, { id: inv.id, invoiceNumber: old, deviceId: inv.deviceId }];
    expect(run(() => h.result.current.resolveBillNumberClashes(cloud))).toBe(1);
    const now = h.result.current.invoices.find((i) => i.id === inv.id)!;
    expect(now.invoiceNumber).not.toBe(old);
    expect(now.renumberedFrom).toBe(old);
    expect(now.notes).toContain(`Renumbered from ${old}`);
    const rows = h.result.current.ledger.filter((l) => l.sourceId === inv.id);
    expect(rows.length).toBe(2);
    expect(rows.every((l) => l.referenceId === now.invoiceNumber && l.description.includes(now.invoiceNumber) && !l.description.includes(`Bill ${old}`))).toBe(true);
    expect(h.result.current.numberNotices[0].text).toContain(old);
    // The next bill never takes either number.
    const next = makeBill(h);
    expect([old, now.invoiceNumber]).not.toContain(next.invoiceNumber);
    // Checking again changes nothing.
    expect(run(() => h.result.current.resolveBillNumberClashes([...cloud, { id: inv.id, invoiceNumber: now.invoiceNumber, deviceId: inv.deviceId }]))).toBe(0);
    balanced(h);
  });
});

// ---------------------------------------------------------------------------------------------
describe('5. deleting a customer with cheques in hand', () => {
  it('is blocked with a clear message until the cheque is settled or cancelled', async () => {
    const h = await setup();
    const inv = makeBill(h, { cheque: { amount: 5000, bankName: 'HBL', chequeNumber: '100200', chequeDate: today } });
    expect(inv.paidAmount).toBe(5000);
    expect(h.result.current.customerDeleteBlock('c1')).toMatch(/100200.*Money → Cheques/);
    const r = run(() => h.result.current.deleteRecord('customer', 'c1', 'x'));
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/cheque/);
    expect(h.result.current.customers.some((c) => c.id === 'c1')).toBe(true);
    expect(run(() => h.result.current.deleteCustomer('c1')).blocked).toMatch(/cheque/);
    const chq = h.result.current.cheques[0];
    expect(run(() => h.result.current.cancelCheque(chq.id, { reason: 'returned to customer' })).success).toBe(true);
    expect(h.result.current.customerDeleteBlock('c1')).toBeNull();
    expect(run(() => h.result.current.deleteRecord('customer', 'c1', 'x')).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('6. restoring bills and payments from the bin', () => {
  it('a restored bill takes stock again and is refused as a duplicate, in a closed period, or with its customer gone', async () => {
    const h = await setup();
    const inv = makeBill(h, { paidNow: 2000 });
    expect(run(() => h.result.current.deleteRecord('bill', inv.id, 'wrong customer')).success).toBe(true);
    const rec = h.result.current.deletedRecords[0];
    // Closed period: view only, with the reason.
    run(() => h.result.current.updateSettings({ booksLockedUntil: today }));
    expect(h.result.current.canRestore(rec)).toBe(false);
    expect(h.result.current.restoreBlockReason(rec)).toMatch(/closed/);
    expect(run(() => h.result.current.restoreDeletedRecord(rec.id)).success).toBe(false);
    run(() => h.result.current.updateSettings({ booksLockedUntil: '' }));
    // Entered again by hand: the bin copy is now a likely duplicate.
    const again = makeBill(h, { paidNow: 2000 });
    expect(h.result.current.restoreBlockReason(rec)).toMatch(/already there/);
    run(() => h.result.current.deleteBill(again.id));
    const stockBefore = h.result.current.products.find((p) => p.id === 'p2')!.stockKg;
    const r = run(() => h.result.current.restoreDeletedRecord(rec.id));
    expect(r.success, r.message).toBe(true);
    expect(h.result.current.products.find((p) => p.id === 'p2')!.stockKg).toBe(stockBefore - 10);
    expect(cust(h).totalDue).toBe(3000);
    expect(h.result.current.auditLogs.some((a) => a.action === 'Deleted Record Restored')).toBe(true);
    balanced(h);
  });

  it('a deleted payment row is put back exactly (its delete never changed the balance); a cheque row stays view-only', async () => {
    const h = await setup();
    makeBill(h);
    const pay = run(() => h.result.current.recordCustomerPayment('c1', 1000, 'Cash', today))!;
    const due = cust(h).totalDue;
    run(() => h.result.current.deleteRecord('payment', pay.id, 'test'));
    expect(cust(h).totalDue).toBe(due);
    const rec = h.result.current.deletedRecords[0] as DeletedRecord;
    expect(h.result.current.canRestore(rec)).toBe(true);
    expect(run(() => h.result.current.restoreDeletedRecord(rec.id)).success).toBe(true);
    expect(h.result.current.ledger.some((l) => l.id === pay.id)).toBe(true);
    expect(cust(h).totalDue).toBe(due);
    balanced(h);
    const chequeRow: DeletedRecord = { ...rec, id: 'bin-x', restoredAt: null, data: { ...pay, id: 'led-x', type: 'cheque_received' } };
    expect(h.result.current.restoreBlockReason(chequeRow)).toMatch(/Only plain payments/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('7. undo an interest run or a collection sheet', () => {
  it('interest: one tap takes back every debit note of the run; permission and closed period are checked', async () => {
    const h = await setup();
    makeBill(h, { date: ago(45), items: [{ productId: 'p1', name: 'Dalda', qty: 30, unitPrice: 1000 }] });
    run(() => h.result.current.setCustomerSalesInfo('c1', { interestPctPerMonth: 2, interestAfterDays: 15 }));
    const before = cust(h).totalDue;
    expect(run(() => h.result.current.chargeInterest(today)).success).toBe(true);
    expect(cust(h).totalDue).toBe(before + 600);
    const runRow = h.result.current.interestRuns[0];
    expect(runRow).toMatchObject({ label: 'INT-1', total: 600, customers: 1 });
    run(() => h.result.current.updateSettings({ booksLockedUntil: today }));
    expect(run(() => h.result.current.undoInterestRun(runRow.id)).message).toMatch(/closed/);
    run(() => h.result.current.updateSettings({ booksLockedUntil: '' }));
    const r = run(() => h.result.current.undoInterestRun(runRow.id));
    expect(r.success, r.message).toBe(true);
    expect(cust(h).totalDue).toBe(before);
    expect(h.result.current.ledger.some((l) => l.type === 'interest_charge')).toBe(false);
    expect(h.result.current.auditLogs.some((a) => a.action === 'Interest Run Undone')).toBe(true);
    balanced(h);
    // The same interest can be charged again after the undo.
    expect(h.result.current.previewInterest(today)).toHaveLength(1);
  });

  it('collection sheet: one tap takes back all its payments; staff without the permission cannot', async () => {
    const h = await setup();
    makeBill(h);
    makeBill(h, { customerId: 'c2' });
    const r = run(() => h.result.current.receiveMany({ rows: [{ customerId: 'c1', amount: 2000, method: 'Cash' }, { customerId: 'c2', amount: 3000, method: 'Bank Transfer' }] }));
    expect(r.success).toBe(true);
    expect(h.result.current.collectionSheets[0]).toMatchObject({ id: 'CS-1', total: 5000, customers: 2 });
    const u = run(() => h.result.current.undoCollection('CS-1'));
    expect(u.success, u.message).toBe(true);
    expect(cust(h).totalDue).toBe(5000);
    expect(cust(h, 'c2').totalDue).toBe(5000);
    expect(h.result.current.collectionSheets).toHaveLength(0);
    expect(run(() => h.result.current.undoCollection('CS-1')).success).toBe(false);
    balanced(h);
  });

  it('operators cannot undo interest', async () => {
    const h = await setup({ as: 'operator' });
    expect(run(() => h.result.current.undoInterestRun('intrun-x')).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('8. monthly depreciation reminder', () => {
  const asset = (patch: Partial<FixedAsset> = {}): FixedAsset => ({ id: 'a1', name: 'Loader', category: 'vehicle', purchaseDate: '2025-01-10', cost: 120000, paidFrom: 'cash', usefulLifeYears: 5, residualValue: 0, method: 'straight_line', status: 'in_use', createdAt: '2025-01-10', ...patch } as FixedAsset);

  it('is due for last month when assets exist and it has not been run; not once it has', () => {
    const due = depreciationDue([asset()], [], '2026-09-22');
    expect(due).toEqual({ month: '2026-08', total: 2000, assets: 1 });
    const runs = [{ id: 'r', period: '2026-08', months: ['2026-08'], date: '2026-08-31', lines: [{ assetId: 'a1', amount: 2000, months: ['2026-08'] }], total: 2000, createdAt: '2026-09-01' }];
    expect(depreciationDue([asset()], runs, '2026-09-22')).toBeNull();
    expect(depreciationDue([], [], '2026-09-22')).toBeNull();
    // January looks back at December of the year before.
    expect(depreciationDue([asset()], [], '2027-01-05')?.month).toBe('2026-12');
    // Bought this month: nothing for last month.
    expect(depreciationDue([asset({ purchaseDate: '2026-09-02' })], [], '2026-09-22')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('9. barcode scanner fallback', () => {
  const nav = navigator as unknown as { mediaDevices?: unknown };
  const saved = nav.mediaDevices;
  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: saved, configurable: true });
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });

  it('uses the built-in detector when there is one, else the bundled decoder (iPhone Safari)', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    expect(scanEngine()).toBe('none');
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.resolve() }, configurable: true });
    expect(scanEngine()).toBe('zxing');
    (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = function Detector() {};
    expect(scanEngine()).toBe('native');
  });

  it('the decoder is a separate lazy chunk that loads and builds a reader', async () => {
    const mod = await import('@zxing/browser');
    expect(typeof mod.BrowserMultiFormatReader).toBe('function');
  });
});
