/**
 * The old program's voucher screen (entry row → grid → Save / Search) and its Coding menu: Accounts
 * Opening Balances, Opening Stocks and the unit / group / manufacturer lists. Every posting keeps the
 * trial balance balanced and the party / cash / bank figures equal to the books.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { ACC, accountTotals, buildJournal, combineJournal, mergeAccounts, openingStock, openingStockQty, trialBalance } from '../utils/accounting';
import { accountBalancesOn, collectCashMovements } from '../utils/finance';
import { accountOptions } from '../utils/vouchers';
import { EMPTY_ENTRY, GridLine, commitEntry, entryOf, findVoucherByNumber, gridOf, gridTotals, optionByCode, removeLine, voucherInputFromGrid, voucherNarration, balanceText, VOUCHER_TITLES } from '../utils/voucherEntry';
import { voucherInputOf } from '../utils/vouchers';
import { openingRows, openingTotals, codingList, planOpeningStock } from '../utils/coding';
import { todayISO } from '../utils/stockFlow';
import { NAV_ENTRIES, navCheck } from '../utils/navMap';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

// 19 customers (the old screenshot's Cash Receipt has 19 lines) and the supplier 2224.
const CUSTOMERS = Array.from({ length: 19 }, (_, i) => ({
  id: `c${i + 1}`, code: String(141274 + i), name: `Customer ${i + 1}`, company: `Customer ${i + 1}`, phone: '', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01', city: i % 2 ? 'Dargai' : 'Batkhela',
}));

const setup = async () => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'GOHAR ZAMAN CO', cashOpeningBalance: 200000000, openingBankBalance: 5000000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', CUSTOMERS);
  set('tradeflow_suppliers_v2', [
    { id: 's1', code: '2224', name: 'MG Edible', company: 'MG EDIBLE OIL AND GHEE (PVT) LTD', phone: '', email: '', address: '', materialCategory: '', totalOwed: 0, createdAt: '2026-01-01', city: 'Peshawar' },
    { id: 's2', code: '2230', name: 'Dalda', company: 'Dalda Foods', phone: '', email: '', address: '', materialCategory: '', totalOwed: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_products_v2', [
    { id: 'p1', code: '101', name: 'Dalda 16 L Tin', category: 'Ghee', brand: 'Dalda', unit: 'tin', unitPricePerKg: 6000, costPricePerKg: 5500, stockKg: 0, minThresholdKg: 0 },
    { id: 'p2', code: '102', name: 'Habib 5 L Can', category: 'Cooking oil', brand: 'Habib', unit: 'can', unitPricePerKg: 2400, costPricePerKg: 2200, stockKg: 0, minThresholdKg: 0 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2', 'tradeflow_journal_entries_v1', 'tradeflow_accounts_v1', 'tradeflow_cheques_v1', 'tradeflow_godowns_v1', 'tradeflow_stock_batches_v1'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
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
const expectBalanced = (h: Hook) => {
  const t = h.result.current;
  const j = journal(h);
  const tb = trialBalance(j, mergeAccounts(t.customAccounts), today);
  expect(tb.balanced, `TB off by ${tb.difference}`).toBe(true);
  const tot = accountTotals(j, { to: today });
  expect(tot.get(ACC.RECEIVABLE)?.net ?? 0).toBeCloseTo(t.customers.reduce((a, c) => a + c.totalDue, 0), 2);
  expect(-(tot.get(ACC.PAYABLE)?.net ?? 0)).toBeCloseTo(t.suppliers.reduce((a, s) => a + s.totalOwed, 0), 2);
  const bal = accountBalancesOn(collectCashMovements(t.ledger, t.expenses, t.cashEntries, t.customers, t.suppliers), t.settings, today);
  expect(tot.get(ACC.CASH)?.net ?? 0).toBeCloseTo(bal.cash, 2);
  return tot;
};
const options = (h: Hook) => { const t = h.result.current; return accountOptions(mergeAccounts(t.customAccounts), t.customers, t.suppliers, { forVoucher: true }); };
/** Type a code, Enter, amount, Enter, narration, Enter — as the entry row does. */
const typeLine = (h: Hook, lines: GridLine[], code: string, amount: { debit?: number; credit?: number }, narration: string, editIndex: number | null = null) => {
  const o = optionByCode(options(h), code);
  expect(o, `code ${code}`).toBeTruthy();
  const r = commitEntry(lines, { ...EMPTY_ENTRY, account: o!.ref, debit: amount.debit ? String(amount.debit) : '', credit: amount.credit ? String(amount.credit) : '', narration }, editIndex);
  expect(r.ok, r.error).toBe(true);
  return r.lines;
};

beforeEach(() => localStorage.clear());

describe('voucher entry row → grid → posting', () => {
  it('each voucher menu option opens the old program’s window title', () => {
    (['CPV', 'CRV', 'BPV', 'BRV', 'JV'] as const).forEach((t) => {
      const e = NAV_ENTRIES.find((x) => x.target.kind === 'screen' && x.target.sub === `new:${t}`)!;
      expect(navCheck(e).dialog, t).toBe(VOUCHER_TITLES[t]);
    });
  });

  it('CPV: code 2224 + Enter, 1,750,000, narration; cash side automatic; books balance', async () => {
    const h = await setup();
    let lines: GridLine[] = [];
    lines = typeLine(h, lines, '2224', { debit: 1750000 }, 'BAHL- RAHMAT ALI PESHAWAR');
    lines = typeLine(h, lines, '6000', { debit: 1500 }, 'Tea and snacks');
    expect(gridTotals(lines)).toEqual({ debit: 1751500, credit: 0 });
    // The entry row refuses a line with no account, no amount or both sides.
    expect(commitEntry(lines, { ...EMPTY_ENTRY, debit: '5' }, null).ok).toBe(false);
    expect(commitEntry(lines, { ...EMPTY_ENTRY, account: 'supp:s1' }, null).ok).toBe(false);
    expect(commitEntry(lines, { ...EMPTY_ENTRY, account: 'supp:s1', debit: '5', credit: '5' }, null).ok).toBe(false);
    // Clicking a line loads it back; changing it replaces it in place.
    const back = entryOf(lines[1]);
    expect(back).toMatchObject({ account: '6000', debit: '1500', narration: 'Tea and snacks' });
    lines = typeLine(h, lines, '6000', { debit: 2000 }, 'Tea and snacks', 1);
    expect(lines).toHaveLength(2);
    expect(lines[1].debit).toBe(2000);
    // Delete removes a line.
    const three = typeLine(h, lines, '2230', { debit: 1 }, 'x');
    expect(removeLine(three, 2)).toEqual(lines);

    const cashBefore = accountTotals(journal(h), { to: today }).get(ACC.CASH)?.net ?? 0;
    const r = run(() => h.result.current.addVoucher(voucherInputFromGrid('CPV', today, lines)));
    expect(r.success, r.message).toBe(true);
    const v = r.voucher!;
    expect(v.memo).toBe('BAHL- RAHMAT ALI PESHAWAR + 1 more');
    expect(h.result.current.suppliers.find((s) => s.id === 's1')!.totalOwed).toBe(-1750000); // paid in advance
    const tot = expectBalanced(h);
    expect((tot.get(ACC.CASH)?.net ?? 0) - cashBefore).toBeCloseTo(-1752000, 2);
    expect(balanceText(-1750000)).toBe('1,750,000.00 Cr');
  });

  it('CRV: 19 customer lines with bill-number narrations, credits total, cash debited once', async () => {
    const h = await setup();
    // Customers owe first (opening balances), then pay in one cash receipt.
    CUSTOMERS.forEach((c, i) => run(() => h.result.current.setOpeningBalance('customer', c.id, 10000000 + i * 100000, '2026-01-01')));
    let lines: GridLine[] = [];
    let total = 0;
    CUSTOMERS.forEach((c, i) => {
      const amt = 8000000 + i * 50000 + (i === 18 ? 32350 : 0);
      total += amt;
      lines = typeLine(h, lines, c.code, { credit: amt }, `Bill # ${1200 + i}`);
    });
    expect(lines).toHaveLength(19);
    expect(gridTotals(lines).credit).toBe(total);
    const r = run(() => h.result.current.addVoucher(voucherInputFromGrid('CRV', today, lines)));
    expect(r.success, r.message).toBe(true);
    const v = r.voucher!;
    // Lines as entered + one automatic cash debit for the total.
    const cashLine = v.lines.find((l) => l.moneySide)!;
    expect(cashLine.accountCode).toBe(ACC.CASH);
    expect(cashLine.debit).toBe(total);
    expect(v.lines.filter((l) => !l.moneySide).map((l) => l.narration)).toEqual(CUSTOMERS.map((_, i) => `Bill # ${1200 + i}`));
    expect(h.result.current.customers.find((c) => c.id === 'c1')!.totalDue).toBe(10000000 - 8000000);
    expectBalanced(h);
  });

  it('Search by voucher number opens it; Save keeps the same number and re-posts', async () => {
    const h = await setup();
    const lines = typeLine(h, [], '2224', { debit: 50000 }, 'First');
    const a = run(() => h.result.current.addVoucher(voucherInputFromGrid('CPV', today, lines)));
    const b = run(() => h.result.current.addVoucher(voucherInputFromGrid('CPV', today, typeLine(h, [], '2230', { debit: 7000 }, 'Second'))));
    expect(a.success && b.success).toBe(true);
    const digits = b.voucher!.ref.replace(/\D/g, '');
    const vs = h.result.current.vouchers;
    expect(findVoucherByNumber(vs, 'CPV', digits)!.id).toBe(b.voucher!.id);
    expect(findVoucherByNumber(vs, 'CPV', b.voucher!.ref.toLowerCase())!.id).toBe(b.voucher!.id);
    expect(findVoucherByNumber(vs, 'CRV', digits)).toBeUndefined();
    expect(findVoucherByNumber(vs, 'CPV', '99999')).toBeUndefined();

    // Loaded into the grid, a line changed, saved again.
    const found = findVoucherByNumber(vs, 'CPV', a.voucher!.ref)!;
    let grid = gridOf(voucherInputOf(found));
    expect(grid).toEqual([{ account: 'supp:s1', debit: 50000, credit: 0, narration: 'First' }]);
    grid = typeLine(h, grid, '2224', { debit: 60000 }, 'First, corrected', 0);
    grid = typeLine(h, grid, '6000', { debit: 250 }, 'Rickshaw');
    const u = run(() => h.result.current.updateVoucher(found.id, voucherInputFromGrid('CPV', today, grid)));
    expect(u.success, u.message).toBe(true);
    expect(u.voucher!.ref).toBe(a.voucher!.ref);
    expect(h.result.current.vouchers.filter((v) => v.voucherType === 'CPV')).toHaveLength(2);
    expect(h.result.current.suppliers.find((s) => s.id === 's1')!.totalOwed).toBe(-60000);
    expect(voucherNarration('CPV', grid)).toBe('First, corrected + 1 more');
    expectBalanced(h);
  });
});

describe('Coding › Accounts Opening Balances', () => {
  it('saves cash, bank, customers and suppliers from the grid; equity takes the difference', async () => {
    const h = await setup();
    const t = h.result.current;
    const rows = openingRows({ settings: t.settings, banks: t.bankAccounts, customers: t.customers, suppliers: t.suppliers, ledger: t.ledger });
    expect(rows.slice(0, 2).map((r) => r.ref)).toEqual(['cash', 'bank:1010']);
    expect(rows.filter((r) => r.kind === 'Customer')).toHaveLength(19);
    const r = run(() => h.result.current.saveAccountOpenings([
      { ref: 'cash', amount: 150000 },
      { ref: 'bank:1010', amount: 400000 },
      { ref: 'cust:c1', amount: 25000 },
      { ref: 'cust:c2', amount: -1000 }, // advance
      { ref: 'supp:s1', amount: -90000 }, // we owe them 90,000 (credit)
    ], '2026-01-01'));
    expect(r.success, r.message).toBe(true);
    const n = h.result.current;
    expect(n.settings.cashOpeningBalance).toBe(150000);
    expect(n.settings.openingBankBalance).toBe(400000);
    expect(n.customers.find((c) => c.id === 'c1')!.totalDue).toBe(25000);
    expect(n.customers.find((c) => c.id === 'c2')!.totalDue).toBe(-1000);
    expect(n.suppliers.find((s) => s.id === 's1')!.totalOwed).toBe(90000);
    const after = openingRows({ settings: n.settings, banks: n.bankAccounts, customers: n.customers, suppliers: n.suppliers, ledger: n.ledger });
    expect(after.find((x) => x.ref === 'supp:s1')!.amount).toBe(-90000);
    expect(openingTotals(after)).toEqual({ debit: 575000, credit: 91000, equity: 484000 });
    const tot = expectBalanced(h);
    expect(-(tot.get(ACC.OPENING_EQUITY)?.net ?? 0)).toBeCloseTo(484000, 2);
    // Changing one again moves only the difference; setting 0 removes it.
    run(() => h.result.current.saveAccountOpenings([{ ref: 'cust:c1', amount: 0 }]));
    expect(h.result.current.customers.find((c) => c.id === 'c1')!.totalDue).toBe(0);
    expect(h.result.current.ledger.some((l) => l.entityId === 'c1' && l.type === 'opening_balance')).toBe(false);
    expectBalanced(h);
  });

  it('refuses inside a closed period', async () => {
    const h = await setup();
    run(() => h.result.current.updateSettings({ booksLockedUntil: '2026-01-31' }));
    const r = run(() => h.result.current.saveAccountOpenings([{ ref: 'cash', amount: 1 }], '2026-01-01'));
    expect(r.success).toBe(false);
  });
});

describe('Coding › Opening Stocks', () => {
  it('sets opening qty and rate per store; the journal posts Dr Inventory / Cr 3900 at that rate', async () => {
    const h = await setup();
    const g = run(() => h.result.current.addGodown('Dargai godown'));
    expect(g.success, g.message).toBe(true);
    const main = h.result.current.godowns[0].id;
    const r1 = run(() => h.result.current.setOpeningStock({ productId: 'p1', godownId: main, qty: 100, rate: 5600 }));
    expect(r1.success, r1.message).toBe(true);
    const r2 = run(() => h.result.current.setOpeningStock({ productId: 'p1', godownId: g.godown!.id, qty: 40 }));
    expect(r2.success, r2.message).toBe(true);
    const r3 = run(() => h.result.current.setOpeningStock({ productId: 'p2', qty: 30, rate: 2250 }));
    expect(r3.success, r3.message).toBe(true);
    let t = h.result.current;
    const p1 = t.products.find((p) => p.id === 'p1')!;
    expect(p1.stockKg).toBe(140);
    expect(p1.costPricePerKg).toBe(5600);
    expect(p1.openingByGodown).toEqual({ [g.godown!.id]: 40 });
    expect(t.stockBatches.find((b) => b.productId === 'p1' && b.godownId === g.godown!.id)!.qty).toBe(40);
    const src = { settings: t.settings, ledger: t.ledger, expenses: t.expenses, cashEntries: t.cashEntries, adjustments: t.adjustments, purchases: t.purchases, products: t.products, invoices: t.invoices, dispatches: t.dispatches, returns: t.returns };
    expect(openingStockQty(src).qty.get('p1')).toBe(140);
    expect(openingStock(src).rows.map((r) => [r.product.id, r.qty, r.cost])).toEqual([['p1', 140, 5600], ['p2', 30, 2250]]);
    const tot = expectBalanced(h);
    expect(tot.get(ACC.INVENTORY)?.net ?? 0).toBeCloseTo(140 * 5600 + 30 * 2250, 2);

    // Lowering the main store's opening moves only that store; the other store keeps its 40.
    run(() => h.result.current.setOpeningStock({ productId: 'p1', godownId: main, qty: 90 }));
    t = h.result.current;
    expect(t.products.find((p) => p.id === 'p1')!.stockKg).toBe(130);
    expect(t.stockBatches.find((b) => b.productId === 'p1' && b.godownId === g.godown!.id)!.qty).toBe(40);
    expectBalanced(h);

    // Stock already sold can't be "un-opened": the item's stock would go below nothing.
    const plan = planOpeningStock({ ...t.products.find((p) => p.id === 'p2')!, stockKg: 5 }, 30, t.godowns, t.stockBatches, main, 0);
    expect(plan.ok).toBe(false);
    expect(run(() => h.result.current.setOpeningStock({ productId: 'p2', qty: -1 })).success).toBe(false);
  });
});

describe('Coding › unit / group / manufacturer lists', () => {
  it('lists what items use plus the kept list; add, rename (items follow), remove only when unused', async () => {
    const h = await setup();
    let t = h.result.current;
    expect(t.productUnits).toEqual(expect.arrayContaining(['tin', 'can', 'ctn', 'pcs']));
    expect(t.productGroups).toEqual(['Cooking oil', 'Ghee']);
    expect(t.manufacturers).toEqual(['Dalda', 'Habib']);
    expect(run(() => h.result.current.addCodingItem('manufacturer', 'Sufi')).success).toBe(true);
    expect(run(() => h.result.current.addCodingItem('manufacturer', 'sufi')).success).toBe(false);
    expect(run(() => h.result.current.addCodingItem('unit', 'qty')).success).toBe(true);
    expect(run(() => h.result.current.renameCodingItem('group', 'Ghee', 'Banaspati Ghee')).success).toBe(true);
    t = h.result.current;
    expect(t.manufacturers).toEqual(['Dalda', 'Habib', 'Sufi']);
    expect(t.productUnits).toContain('qty');
    expect(t.products.find((p) => p.id === 'p1')!.category).toBe('Banaspati Ghee');
    expect(t.productGroups).toEqual(['Banaspati Ghee', 'Cooking oil']);
    expect(run(() => h.result.current.removeCodingItem('manufacturer', 'Dalda')).success).toBe(false);
    expect(run(() => h.result.current.removeCodingItem('manufacturer', 'Sufi')).success).toBe(true);
    expect(codingList('manufacturer', h.result.current.settings, h.result.current.products)).toEqual(['Dalda', 'Habib']);
  });
});
