/**
 * Multiple bank accounts, vouchers (CPV / CRV / BPV / BRV / JV), the account ledger for any account,
 * party city details and the receivable / payable reports, and the chart of accounts tree.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { ACC, accountTotals, buildJournal, combineJournal, mergeAccounts, trialBalance } from '../utils/accounting';
import { accountBalancesOn, collectCashMovements } from '../utils/finance';
import { scopeToBank, nextBankCode, needsBank } from '../utils/banks';
import { accountLedger, chartTree, custRef, suppRef, partyBalanceReport, filterParties, allCities, validateVoucher, suggestSubCode, searchAccounts, accountOptions } from '../utils/vouchers';
import { shiftDate, todayISO } from '../utils/stockFlow';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();
const ago = (n: number) => shiftDate(today, -n);

const setup = async (opts: { as?: typeof OPERATOR; settings?: Record<string, unknown> } = {}) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil Traders', cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0, ...(opts.settings || {}) });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: '141454', name: 'Zaman Store', company: 'Zaman Store', phone: '0344 1234567', email: '', address: '', totalDue: 1000, creditLimit: 0, createdAt: '2026-01-01', city: 'Peshawar' },
    { id: 'c2', code: '141455', name: 'Bismillah Traders', company: 'Bismillah Traders', phone: '0345 7654321', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01', city: 'Mardan' },
  ]);
  set('tradeflow_suppliers_v2', [
    { id: 's1', code: '241001', name: 'Ghee Mills', company: 'Ghee Mills', phone: '0333', email: '', address: '', materialCategory: '', totalOwed: 20000, createdAt: '2026-01-01', city: 'Lahore' },
    { id: 's2', name: 'Oil Co', company: 'Oil Co', phone: '0334', email: '', address: '', materialCategory: '', totalOwed: 5000, createdAt: '2026-01-01', city: 'peshawar' },
  ]);
  set('tradeflow_products_v2', [{ id: 'p1', name: 'Ghee 1kg', category: 'Ghee', unit: 'pack', unitPricePerKg: 500, costPricePerKg: 400, stockKg: 100, minThresholdKg: 0 }]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2', 'tradeflow_journal_entries_v1', 'tradeflow_accounts_v1', 'tradeflow_cheques_v1'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, opts.as);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => { out = fn(); });
  return out!;
};
const journal = (h: Hook) => {
  const t = h.result.current;
  return combineJournal(buildJournal({ settings: t.settings, customers: t.customers, suppliers: t.suppliers, ledger: t.ledger, invoices: t.invoices, dispatches: t.dispatches, purchases: t.purchases, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, returns: t.returns, adjustments: t.adjustments }), t.manualJournals);
};
const accounts = (h: Hook) => mergeAccounts(h.result.current.customAccounts);
const expectBalanced = (h: Hook) => {
  const tb = trialBalance(journal(h), accounts(h), today);
  expect(tb.balanced, `TB off by ${tb.difference}`).toBe(true);
  // Control accounts equal the balances shown on the Customers / Suppliers screens.
  const tot = accountTotals(journal(h), { to: today });
  const t = h.result.current;
  expect(tot.get(ACC.RECEIVABLE)?.net ?? 0).toBeCloseTo(t.customers.reduce((a, c) => a + c.totalDue, 0), 2);
  expect(-(tot.get(ACC.PAYABLE)?.net ?? 0)).toBeCloseTo(t.suppliers.reduce((a, s) => a + s.totalOwed, 0), 2);
  // Cash and every bank in the books equal the Money screen.
  const bal = balances(h);
  expect(tot.get(ACC.CASH)?.net ?? 0).toBeCloseTo(bal.cash, 2);
  Object.entries(bal.banks).forEach(([code, v]) => expect(tot.get(code)?.net ?? 0, `bank ${code}`).toBeCloseTo(v, 2));
};
const balances = (h: Hook) => {
  const t = h.result.current;
  return accountBalancesOn(collectCashMovements(t.ledger, t.expenses, t.cashEntries, t.customers, t.suppliers), t.settings, today);
};
const cust = (h: Hook, id: string) => h.result.current.customers.find((c) => c.id === id)!;
const supp = (h: Hook, id: string) => h.result.current.suppliers.find((s) => s.id === id)!;
const addBanks = (h: Hook) => {
  const a = run(() => h.result.current.addBankAccount({ bankName: 'HBL', accountTitle: 'Madina Oil Traders', accountNumber: '0012345678', openingBalance: 20000 }));
  expect(a.success, a.message).toBe(true);
  const b = run(() => h.result.current.addBankAccount({ bankName: 'UBL', accountNumber: '998877' }));
  expect(b.success, b.message).toBe(true);
  return { hbl: a.code!, ubl: b.code! };
};

beforeEach(() => localStorage.clear());

// ---------------------------------------------------------------------------------------------
describe('1. multiple bank accounts', () => {
  it('adds banks as 1011, 1012 under 1010; the main bank stays 1010', async () => {
    const h = await setup();
    const { hbl, ubl } = addBanks(h);
    expect([hbl, ubl]).toEqual(['1011', '1012']);
    const t = h.result.current;
    expect(t.bankAccounts.map((b) => b.code)).toEqual(['1010', '1011', '1012']);
    expect(t.bankAccounts[1]).toMatchObject({ name: 'HBL — 5678', openingBalance: 20000 });
    expect(t.customAccounts.find((a) => a.code === '1011')).toMatchObject({ parent: '1010', isBank: true, type: 'asset' });
    expect(nextBankCode(['1010', '1011', '1013'])).toBe('1012');
    expect(needsBank('Bank Transfer')).toBe(true);
    expect(needsBank('Cash')).toBe(false);
    expect(needsBank('Cheque')).toBe(false);
    // Duplicate names are refused.
    expect(run(() => h.result.current.addBankAccount({ bankName: 'HBL', accountNumber: '0012345678' })).success).toBe(false);
  });

  it('payments, bills, expenses, transfers and cheques go to the bank picked; per-bank balances and the journal agree', async () => {
    const h = await setup();
    const { hbl, ubl } = addBanks(h);
    // Customer pays into HBL; bill paid by bank transfer into UBL; expense from HBL.
    run(() => h.result.current.recordCustomerPayment('c1', 5000, 'Bank Transfer - slip 12', today, { bankCode: hbl }));
    const bill = run(() => h.result.current.createBill({ customerId: 'c2', items: [{ productId: 'p1', name: 'Ghee 1kg', qty: 6, unitPrice: 500 }], payments: [{ method: 'Bank Transfer', amount: 3000, bankCode: ubl }] } as any));
    expect(bill.success, bill.message).toBe(true);
    run(() => h.result.current.addExpense({ date: today, category: 'bank_charges', amount: 1000, description: 'HBL charges', paidVia: 'Bank Transfer', bankCode: hbl, truckId: null, dispatchId: null }));
    // Cash deposited into UBL; HBL -> UBL.
    expect(run(() => h.result.current.addCashTransfer({ amount: 2000, from: 'cash', bankCode: ubl })).success).toBe(true);
    expect(run(() => h.result.current.addCashTransfer({ amount: 500, from: 'bank', bankCode: hbl, toBankCode: ubl })).success).toBe(true);
    expect(run(() => h.result.current.addCashTransfer({ amount: 500, from: 'bank', bankCode: hbl, toBankCode: hbl })).success).toBe(false);
    // Supplier paid from UBL; a bill payment against the main bank (no bank picked) stays on 1010.
    run(() => h.result.current.recordSupplierPayment('s1', 4000, 'Bank Transfer', today, { bankCode: ubl }));
    run(() => h.result.current.recordSupplierPayment('s2', 1000, 'Bank Transfer', today));

    const bal = balances(h);
    expect(bal.banks[ACC.BANK]).toBe(50000 - 1000);
    expect(bal.banks[hbl]).toBe(20000 + 5000 - 1000 - 500);
    expect(bal.banks[ubl]).toBe(3000 + 2000 + 500 - 4000);
    expect(bal.bank).toBe(bal.banks['1010'] + bal.banks[hbl] + bal.banks[ubl]);
    expect(bal.cash).toBe(10000 - 2000);
    expectBalanced(h);

    // One bank's view (bank reconciliation / cash book filter).
    const t = h.result.current;
    const scoped = scopeToBank(collectCashMovements(t.ledger, t.expenses, t.cashEntries, t.customers, t.suppliers), t.settings, hbl);
    expect(scoped.movements.every((m) => m.bankCode === hbl)).toBe(true);
    expect(accountBalancesOn(scoped.movements, scoped.settings, today).bank).toBe(bal.banks[hbl]);

    // A customer's cheque deposited into HBL and cleared there.
    const chq = run(() => h.result.current.receiveCheque({ customerId: 'c1', amount: 700, bankName: 'MCB', chequeNumber: '555', chequeDate: today }));
    expect(chq.success, chq.message).toBe(true);
    const id = h.result.current.cheques[0].id;
    expect(run(() => h.result.current.depositCheque(id, today, hbl)).success).toBe(true);
    expect(run(() => h.result.current.clearCheque(id, today)).success).toBe(true);
    expect(balances(h).banks[hbl]).toBe(bal.banks[hbl] + 700);
    expectBalanced(h);

    // A bank with money through it can't be removed; an unused one can.
    expect(run(() => h.result.current.deleteBankAccount(hbl)).success).toBe(false);
    const c = run(() => h.result.current.addBankAccount({ bankName: 'MBL' }));
    expect(run(() => h.result.current.deleteBankAccount(c.code!)).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('2. vouchers', () => {
  it('CPV: many lines against suppliers, an expense, a customer refund and a bank deposit; cash side implied', async () => {
    const h = await setup();
    const { hbl } = addBanks(h);
    const cash0 = balances(h).cash;
    const r = run(() => h.result.current.addVoucher({
      type: 'CPV', date: today, narration: 'Payments of the day',
      lines: [
        { account: suppRef('s1'), debit: 3000, credit: 0, narration: 'On account' },
        { account: suppRef('s2'), debit: 1500, credit: 0 },
        { account: '6000', debit: 500, credit: 0, narration: 'Tea and lunch' },
        { account: custRef('c2'), debit: 200, credit: 0, narration: 'Refund' },
        { account: hbl, debit: 1000, credit: 0, narration: 'Cash deposited in HBL' },
      ],
    }));
    expect(r.success, r.message).toBe(true);
    const v = r.voucher!;
    expect(v.ref).toBe('CPV-1');
    expect(v.voucherType).toBe('CPV');
    // Implied cash side: Cr Cash with the total.
    expect(v.lines.at(-1)).toMatchObject({ accountCode: ACC.CASH, credit: 6200, moneySide: true });
    expect(supp(h, 's1').totalOwed).toBe(17000);
    expect(supp(h, 's2').totalOwed).toBe(3500);
    expect(cust(h, 'c2').totalDue).toBe(200);
    const t = h.result.current;
    // Records written for the everyday screens, all marked with the voucher.
    expect(t.ledger.filter((l) => l.voucherId === v.id).map((l) => l.type).sort()).toEqual(['payment_made', 'payment_made', 'refund_paid']);
    expect(t.expenses.find((e) => e.voucherId === v.id)).toMatchObject({ category: 'daily', amount: 500, paidVia: 'Cash' });
    expect(t.cashEntries.filter((c) => c.voucherId === v.id)).toHaveLength(2); // the deposit: cash out, HBL in
    const bal = balances(h);
    expect(bal.cash).toBe(cash0 - 6200);
    expect(bal.banks[hbl]).toBe(21000);
    expect(t.isLinkedRecord(t.expenses.find((e) => e.voucherId === v.id)!.id)).toBe(true);
    expectBalanced(h);
  });

  it('CRV, BPV, BRV and JV post to the right accounts; the trial balance stays balanced', async () => {
    const h = await setup();
    const { hbl, ubl } = addBanks(h);
    const crv = run(() => h.result.current.addVoucher({ type: 'CRV', date: today, narration: 'Received', lines: [{ account: custRef('c1'), debit: 0, credit: 800 }, { account: '4900', debit: 0, credit: 300, narration: 'Scrap sold' }] }));
    expect(crv.success, crv.message).toBe(true);
    expect(crv.voucher!.lines.at(-1)).toMatchObject({ accountCode: ACC.CASH, debit: 1100 });
    expect(cust(h, 'c1').totalDue).toBe(200);
    expectBalanced(h);

    const bpv = run(() => h.result.current.addVoucher({ type: 'BPV', date: today, bankCode: hbl, narration: 'Paid from HBL', lines: [{ account: suppRef('s1'), debit: 10000, credit: 0 }, { account: ACC.BANK_CHARGES, debit: 50, credit: 0 }] }));
    expect(bpv.success, bpv.message).toBe(true);
    expect(bpv.voucher!.lines.at(-1)).toMatchObject({ accountCode: hbl, credit: 10050 });
    expect(balances(h).banks[hbl]).toBe(20000 - 10050);
    expect(supp(h, 's1').totalOwed).toBe(10000);
    expectBalanced(h);

    // BRV into UBL: customer paid 700, the bank kept 20 as charges.
    const brv = run(() => h.result.current.addVoucher({ type: 'BRV', date: today, bankCode: ubl, narration: 'Online receipt', lines: [{ account: custRef('c2'), debit: 0, credit: 700 }, { account: ACC.BANK_CHARGES, debit: 20, credit: 0 }] }));
    expect(brv.success, brv.message).toBe(true);
    expect(brv.voucher!.lines.at(-1)).toMatchObject({ accountCode: ubl, debit: 680 });
    expect(balances(h).banks[ubl]).toBe(680);
    expect(cust(h, 'c2').totalDue).toBe(-700);
    expectBalanced(h);

    // JV: customer charged 1000 against other income; supplier set off against a customer.
    const jv = run(() => h.result.current.addVoucher({ type: 'JV', date: today, narration: 'Adjustments', lines: [
      { account: custRef('c1'), debit: 1000, credit: 0 }, { account: '4900', debit: 0, credit: 1000 },
      { account: suppRef('s2'), debit: 2000, credit: 0, narration: 'Set off' }, { account: custRef('c1'), debit: 0, credit: 2000, narration: 'Set off' },
    ] }));
    expect(jv.success, jv.message).toBe(true);
    expect(jv.voucher!.ref).toBe('JV-1');
    expect(cust(h, 'c1').totalDue).toBe(200 + 1000 - 2000);
    expect(supp(h, 's2').totalOwed).toBe(3000);
    expect(h.result.current.ledger.filter((l) => l.voucherId === jv.voucher!.id).every((l) => l.type === 'voucher' && !l.method)).toBe(true);
    expectBalanced(h);

    // An unbalanced JV and a CPV whose credits beat its debits are refused.
    expect(run(() => h.result.current.addVoucher({ type: 'JV', date: today, narration: 'x', lines: [{ account: '6000', debit: 10, credit: 0 }, { account: '4900', debit: 0, credit: 9 }] })).success).toBe(false);
    expect(run(() => h.result.current.addVoucher({ type: 'CPV', date: today, narration: 'x', lines: [{ account: '4900', debit: 0, credit: 9 }] })).success).toBe(false);
    // Control accounts and the implied side can't be picked.
    expect(run(() => h.result.current.addVoucher({ type: 'CPV', date: today, narration: 'x', lines: [{ account: ACC.RECEIVABLE, debit: 10, credit: 0 }] })).message).toMatch(/Pick the customer/);
    expect(run(() => h.result.current.addVoucher({ type: 'CPV', date: today, narration: 'x', lines: [{ account: ACC.CASH, debit: 10, credit: 0 }] })).message).toMatch(/added by itself/);
  });

  it('numbers run per type, are never reused after a delete, and can continue from the old program', async () => {
    const h = await setup();
    const pay = (n: number) => run(() => h.result.current.addVoucher({ type: 'CPV', date: today, narration: `Pay ${n}`, lines: [{ account: '6000', debit: n, credit: 0 }] }));
    expect(pay(10).voucher!.ref).toBe('CPV-1');
    const second = pay(20).voucher!;
    expect(second.ref).toBe('CPV-2');
    expect(run(() => h.result.current.addVoucher({ type: 'CRV', date: today, narration: 'r', lines: [{ account: '4900', debit: 0, credit: 5 }] })).voucher!.ref).toBe('CRV-1');
    expect(run(() => h.result.current.deleteRecord('voucher', second.id, 'typed twice')).success).toBe(true);
    expect(pay(30).voucher!.ref).toBe('CPV-3');
    // Continue from the desktop program: the last CPV there was 1063.
    expect(run(() => h.result.current.updateNumberSeries('cpv', { prefix: 'CPV-', startAt: 1064 })).success).toBe(true);
    expect(h.result.current.previewVoucherNumber('CPV')).toBe('CPV-1064');
    expect(pay(40).voucher!.ref).toBe('CPV-1064');
    expect(h.result.current.numberSeries.jv.prefix).toBe('JV-');
  });

  it('delete goes to the bin and undoes everything; restore puts it back; edit rewrites it; closed periods are refused', async () => {
    const h = await setup();
    const cash0 = balances(h).cash;
    const r = run(() => h.result.current.addVoucher({ type: 'CRV', date: ago(3), narration: 'From Zaman', lines: [{ account: custRef('c1'), debit: 0, credit: 600 }] }));
    const v = r.voucher!;
    expect(cust(h, 'c1').totalDue).toBe(400);
    // Its rows can't be deleted on their own.
    const row = h.result.current.ledger.find((l) => l.voucherId === v.id)!;
    run(() => h.result.current.deleteLedgerEntry(row.id));
    expect(h.result.current.ledger.some((l) => l.id === row.id)).toBe(true);
    expect(run(() => h.result.current.deleteManualJournal(v.id)).success).toBe(false);

    // Edit: 600 -> 900, and a narration.
    const e = run(() => h.result.current.updateVoucher(v.id, { type: 'CRV', date: ago(3), narration: 'From Zaman (corrected)', lines: [{ account: custRef('c1'), debit: 0, credit: 900 }] }));
    expect(e.success, e.message).toBe(true);
    expect(e.voucher!.ref).toBe(v.ref);
    expect(cust(h, 'c1').totalDue).toBe(100);
    expect(h.result.current.ledger.filter((l) => l.voucherId === v.id)).toHaveLength(1);
    expect(balances(h).cash).toBe(cash0 + 900);
    expectBalanced(h);

    // Delete (to the bin) and restore.
    expect(run(() => h.result.current.deleteRecord('voucher', v.id, 'wrong customer')).success).toBe(true);
    expect(cust(h, 'c1').totalDue).toBe(1000);
    expect(h.result.current.ledger.some((l) => l.voucherId === v.id)).toBe(false);
    expect(balances(h).cash).toBe(cash0);
    const bin = h.result.current.deletedRecords.find((x) => x.kind === 'voucher')!;
    expect(bin.reason).toBe('wrong customer');
    expect(h.result.current.canRestore(bin)).toBe(true);
    expect(run(() => h.result.current.restoreDeletedRecord(bin.id)).success).toBe(true);
    expect(cust(h, 'c1').totalDue).toBe(100);
    expectBalanced(h);

    // Period lock.
    run(() => h.result.current.updateSettings({ booksLockedUntil: ago(1) }));
    expect(run(() => h.result.current.addVoucher({ type: 'CPV', date: ago(2), narration: 'late', lines: [{ account: '6000', debit: 5, credit: 0 }] })).message).toMatch(/closed/);
    expect(run(() => h.result.current.deleteVoucher(v.id)).success).toBe(false);
    expect(h.result.current.voucherEditBlock(v.id)).toMatch(/closed period/);
  });

  it('a payment voucher paying suppliers over the approval limit goes to a manager; nothing is posted', async () => {
    const h = await setup({ as: OPERATOR, settings: { approvalRules: { supplierPaymentAbove: 5000 } } });
    const r = run(() => h.result.current.addVoucher({ type: 'CPV', date: today, narration: 'Big payment', lines: [{ account: suppRef('s1'), debit: 6000, credit: 0 }] }));
    expect(r.success, r.message).toBe(true);
    expect(r.message).toMatch(/Sent for approval/);
    expect(h.result.current.vouchers).toHaveLength(0);
    expect(supp(h, 's1').totalOwed).toBe(20000);
    const req = h.result.current.approvals.find((a) => a.kind === 'voucher')!;
    expect(req).toMatchObject({ status: 'pending', amount: 6000 });
    // Below the limit it posts straight away; a JV is for managers only.
    expect(run(() => h.result.current.addVoucher({ type: 'CPV', date: today, narration: 'Small', lines: [{ account: suppRef('s1'), debit: 100, credit: 0 }] })).success).toBe(true);
    expect(run(() => h.result.current.addVoucher({ type: 'JV', date: today, narration: 'x', lines: [{ account: '6000', debit: 1, credit: 0 }, { account: '4900', debit: 0, credit: 1 }] })).success).toBe(false);
    // Pure validation: a bank voucher needs a known bank.
    const errs = validateVoucher({ type: 'BPV', date: today, narration: 'x', bankCode: '1099', lines: [{ account: suppRef('s1'), debit: 6000, credit: 0 }] }, { accounts: accounts(h), customers: h.result.current.customers, suppliers: h.result.current.suppliers, bankCodes: ['1010'], settings: h.result.current.settings, today });
    expect(errs).toContain('Pick the bank account.');
  });

  it('the manager approves the held voucher and it posts', async () => {
    const h = await setup({ as: OPERATOR, settings: { approvalRules: { supplierPaymentAbove: 5000 } } });
    run(() => h.result.current.addVoucher({ type: 'CPV', date: today, narration: 'Big payment', lines: [{ account: suppRef('s1'), debit: 6000, credit: 0 }] }));
    const id = h.result.current.approvals[0].id;
    run(() => h.result.current.logout());
    await signIn(() => h.result.current);
    const r = run(() => h.result.current.approveRequest(id));
    expect(r.success, r.message).toBe(true);
    expect(h.result.current.vouchers[0].ref).toBe('CPV-1');
    expect(supp(h, 's1').totalOwed).toBe(14000);
    expectBalanced(h);
  });
});

// ---------------------------------------------------------------------------------------------
describe('3. account ledger (any account)', () => {
  it('customer ledger: OB, running Dr / Cr balance and grand total against a hand-worked example', async () => {
    const h = await setup();
    // Opening due 1000 (typed in on the account). Bill 10 days ago 3000; CRV 5 days ago 2000; JV 2 days ago Dr 300.
    const bill = run(() => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Ghee 1kg', qty: 6, unitPrice: 500 }], date: ago(10) } as any));
    expect(bill.success, bill.message).toBe(true);
    expect(run(() => h.result.current.addVoucher({ type: 'CRV', date: ago(5), narration: 'Cash from Zaman', lines: [{ account: custRef('c1'), debit: 0, credit: 2000 }] })).success).toBe(true);
    expect(run(() => h.result.current.addVoucher({ type: 'JV', date: ago(2), narration: 'Freight charged', lines: [{ account: custRef('c1'), debit: 300, credit: 0 }, { account: '4100', debit: 0, credit: 300 }] })).success).toBe(true);
    const t = h.result.current;
    const src = { journal: journal(h), accounts: accounts(h), customers: t.customers, suppliers: t.suppliers, ledger: t.ledger };
    const rep = accountLedger(custRef('c1'), ago(7), today, src);
    // By hand: OB = 1000 + 3000 = 4000 Dr; CRV Cr 2000 -> 2000 Dr; JV Dr 300 -> 2300 Dr.
    expect(rep.opening).toBe(4000);
    expect(rep.rows.map((r) => [r.ref, r.debit, r.credit, r.balance])).toEqual([
      ['CRV-1', 0, 2000, 2000],
      ['JV-1', 300, 0, 2300],
    ]);
    expect([rep.totalDebit, rep.totalCredit, rep.closing]).toEqual([300, 2000, 2300]);
    expect(rep.closing).toBe(cust(h, 'c1').totalDue);
    expect(rep.code).toBe('141454');

    // The whole period: OB is the opening due only.
    const all = accountLedger(custRef('c1'), '2026-01-01', today, src);
    expect(all.opening).toBe(1000);
    expect(all.rows.map((r) => r.balance)).toEqual([4000, 2000, 2300]);

    // Cash account (chart code): opening cash 10000, CRV +2000.
    const cash = accountLedger(ACC.CASH, ago(7), today, src);
    expect(cash.opening).toBe(10000);
    expect(cash.rows).toHaveLength(1);
    expect(cash.rows[0]).toMatchObject({ ref: 'CRV-1', debit: 2000, balance: 12000 });

    // A supplier's balance shows as a credit (the shop owes them).
    const sup = accountLedger(suppRef('s1'), ago(7), today, src);
    expect(sup.opening).toBe(-20000);
    expect(sup.closing).toBe(-20000);
  });
});

// ---------------------------------------------------------------------------------------------
describe('4. party details, city search and receivable / payable reports', () => {
  it('stores city, contact, sales tax # and fax; filters by city and ID; city-wise totals', async () => {
    const h = await setup();
    const c = run(() => h.result.current.addCustomer({ name: 'Khan Kiryana', company: '', phone: '0300 1112223', email: '', address: '', creditLimit: 0, city: 'Mardan', contactPerson: 'Imran', salesTaxNo: '32-77-8761-123-45', fax: '091-111' } as any));
    expect(h.result.current.customers.find((x) => x.id === c.id)).toMatchObject({ city: 'Mardan', contactPerson: 'Imran', salesTaxNo: '32-77-8761-123-45', fax: '091-111' });
    expect(run(() => h.result.current.addCity('Charsadda')).success).toBe(true);
    expect(run(() => h.result.current.addCity('charsadda')).success).toBe(false);
    const t = h.result.current;
    expect(allCities(t.settings, t.customers, t.suppliers)).toEqual(['Charsadda', 'Lahore', 'Mardan', 'Peshawar']);
    expect(filterParties(t.customers, '', 'mardan').map((x) => x.name).sort()).toEqual(['Bismillah Traders', 'Khan Kiryana']);
    expect(filterParties(t.customers, '141454', '').map((x) => x.name)).toEqual(['Zaman Store']);

    // Typed the way staff actually type: shop name, phone with a space, city, wrong case.
    const rows = [{ name: 'Haji Karim', company: 'Karim General Store', phone: '0300 1234567', code: 'C-0001', city: 'Mingora' }];
    expect(filterParties(rows, 'karim general', '')).toHaveLength(1);
    expect(filterParties(rows, '0300 123', '')).toHaveLength(1);
    expect(filterParties(rows, '03001234567', '')).toHaveLength(1);
    expect(filterParties(rows, 'mingora', '')).toHaveLength(1);
    expect(filterParties(rows, 'c-0001', '')).toHaveLength(1);
    expect(filterParties(rows, 'zzz', '')).toHaveLength(0);
    expect(filterParties(rows, '12', '')).toHaveLength(0); // too few digits to be a phone search
    run(() => h.result.current.updateCustomer('c2', { totalDue: 700 } as any));
    const both = partyBalanceReport(h.result.current.customers, h.result.current.suppliers, { kind: 'both', cityWise: true });
    expect(both.groups.map((g) => g.city)).toEqual(['Lahore', 'Mardan', 'Peshawar']);
    const pesh = both.groups.find((g) => g.city === 'Peshawar')!;
    expect(pesh.rows.map((r) => r.name).sort()).toEqual(['Oil Co', 'Zaman Store']); // "peshawar" and "Peshawar" are one city
    expect([pesh.receivable, pesh.payable]).toEqual([1000, 5000]);
    expect([both.receivable, both.payable]).toEqual([1700, 25000]);
    const rec = partyBalanceReport(h.result.current.customers, h.result.current.suppliers, { kind: 'receivable', cityWise: false });
    expect(rec.groups[0].rows.every((r) => r.balance > 0)).toBe(true);
    expect(rec.count).toBe(2);
    const pay = partyBalanceReport(h.result.current.customers, h.result.current.suppliers, { kind: 'payable', cityWise: false, city: 'Lahore' });
    expect(pay.groups[0].rows.map((r) => r.name)).toEqual(['Ghee Mills']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('6. cloud columns (supabase/migrate_v24_vouchers_banks.sql)', () => {
  it('every field the new features save has a column in setup.sql + v23 + v24', async () => {
    const h = await setup();
    const { hbl } = addBanks(h);
    run(() => h.result.current.addCity('Mardan'));
    run(() => h.result.current.updateCustomer('c1', { contactPerson: 'Zaman', salesTaxNo: '123', fax: '091' } as any));
    run(() => h.result.current.updateSupplier('s1', { contactPerson: 'Mills', salesTaxNo: '9', fax: '042' } as any));
    run(() => h.result.current.addVoucher({ type: 'BPV', date: today, bankCode: hbl, narration: 'x', lines: [{ account: suppRef('s1'), debit: 10, credit: 0 }, { account: '6000', debit: 5, credit: 0 }, { account: '4900', debit: 0, credit: 1 }, { account: ACC.CASH, debit: 3, credit: 0 }] }));
    const chq = run(() => h.result.current.receiveCheque({ customerId: 'c1', amount: 7, bankName: 'MCB', chequeNumber: '9', chequeDate: today }));
    expect(chq.success).toBe(true);
    run(() => h.result.current.depositCheque(h.result.current.cheques[0].id, today, hbl));
    run(() => h.result.current.addBankStatementLines([{ date: today, description: 'fee', amount: -5 }], hbl));
    const t = h.result.current;
    run(() => t.saveBankReconciliation({ statementDate: today, closingBalance: 1, clearedMovementIds: [], bankCode: hbl }));
    const s = h.result.current;
    const read = (f: string) => (existsSync(resolve(__dirname, `../../supabase/${f}`)) ? readFileSync(resolve(__dirname, `../../supabase/${f}`), 'utf8') : '');
    const sql = `${read('setup.sql')}\n${read('migrate_v23_fixes.sql')}\n${read('migrate_v24_vouchers_banks.sql')}`.replace(/--[^\n]*/g, '');
    const has = (table: string, col: string) =>
      new RegExp(`ALTER TABLE\\s+${table}\\s+ADD COLUMN\\s+(IF NOT EXISTS\\s+)?"?${col}"?\\s`).test(sql) ||
      new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(([^;]*?)\\n\\s*"?${col}"?\\s+[A-Z]`).test(sql);
    const rows: Record<string, unknown[]> = {
      ledger: s.ledger, cash_entries: s.cashEntries, expenses: s.expenses, journal_entries: s.manualJournals, accounts: s.customAccounts,
      settings: [s.settings], customers: s.customers, suppliers: s.suppliers, cheques: s.cheques, bank_statement_lines: s.bankStatementLines, bank_reconciliations: s.bankReconciliations,
    };
    const missing: string[] = [];
    Object.entries(rows).forEach(([table, list]) => new Set(list.flatMap((r) => Object.keys(r as object))).forEach((k) => { if (!has(table, k)) missing.push(`${table}.${k}`); }));
    expect(missing).toEqual([]);
    expect(s.bankStatementLines[0].bankCode).toBe(hbl);
    expect(s.bankReconciliations[0].bankCode).toBe(hbl);
  });
});

// ---------------------------------------------------------------------------------------------
describe('5. chart of accounts tree', () => {
  it('groups by type; parties under Receivable / Payable, banks under Bank; sub-accounts under a group', async () => {
    const h = await setup();
    addBanks(h);
    expect(suggestSubCode('6000', accounts(h).map((a) => a.code))).toBe('6001');
    const r = run(() => h.result.current.addAccount({ code: '6001', name: 'Tea', type: 'expense', parent: '6000' }));
    expect(r.success, r.message).toBe(true);
    expect(run(() => h.result.current.addAccount({ code: '6002', name: 'Wrong', type: 'income', parent: '6000' })).success).toBe(false);
    const tot = accountTotals(journal(h), { to: today });
    const t = h.result.current;
    const tree = chartTree(accounts(h), tot, t.customers, t.suppliers);
    expect(tree.map((n) => n.name)).toEqual(['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses']);
    const assets = tree[0];
    const bank = assets.children.find((n) => n.code === '1010')!;
    expect(bank.children.map((n) => n.code)).toEqual(['1011', '1012']);
    expect(bank.total).toBe(50000 + 20000);
    const rec = assets.children.find((n) => n.code === '1100')!;
    expect(rec.children.map((n) => n.name)).toEqual(['Bismillah Traders', 'Zaman Store']);
    expect(rec.total).toBe(1000); // parties are shown, not added again
    const exp = tree[4].children.find((n) => n.code === '6000')!;
    expect(exp.children.map((n) => n.code)).toEqual(['6001']);
    expect(assets.total).toBe(10000 + 70000 + 1000 + 100 * 400);
    // Account picker: code search finds the party first.
    const opts = accountOptions(accounts(h), t.customers, t.suppliers, { forVoucher: true });
    expect(searchAccounts(opts, '141454')[0].name).toBe('Zaman Store');
    expect(opts.some((o) => o.ref === '1100')).toBe(false);
  });
});
