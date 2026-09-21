import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { ACC, DEFAULT_ACCOUNTS, accountBalance, balanceSheet, buildJournal, combineJournal, mergeAccounts, profitAndLoss, trialBalance } from '../utils/accounting';
import { accountBalancesOn, collectCashMovements } from '../utils/finance';
import {
  addMonths,
  assetRegister,
  buildFinanceJournal,
  financialYearOf,
  financialYearsBetween,
  monthEnd,
  monthOf,
  monthlyCharge,
  planDepreciation,
  staffLedger,
  advanceBalance,
  salarySheetDraft,
} from '../utils/financeBooks';
import { budgetVsActual, cashFlowStatement, keyRatios, profitByCostCentre, UNTAGGED } from '../utils/financeReports';
import { amountFiguresPK, amountInWordsPK, numberToWordsPK, chequeLayoutOf, DEFAULT_CHEQUE_LAYOUT } from '../utils/chequePrint';
import { shiftDate, todayISO } from '../utils/stockFlow';
import { FixedAsset } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();
const thisMonth = monthOf(today);
const lastMonth = addMonths(thisMonth, -1);

const setup = async (as: 'admin' | 'operator' = 'admin') => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 500000, openingBankBalance: 1000000, cashOpeningDate: '2024-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Haji Karim', company: 'Karim Store', phone: '0300', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2024-01-01' }]);
  set('tradeflow_suppliers_v2', [{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '0301', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2024-01-01' }]);
  set('tradeflow_products_v2', []);
  set('tradeflow_invoices_v1', []);
  set('tradeflow_ledger_v2', []);
  set('tradeflow_expenses_v2', []);
  set('tradeflow_cash_entries_v2', []);
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, as === 'admin' ? undefined : OPERATOR);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;

const books = (h: Hook) => {
  const s = h.result.current;
  const auto = [
    ...buildJournal({ settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products }),
    ...buildFinanceJournal({ settings: s.settings, fixedAssets: s.fixedAssets, depreciationRuns: s.depreciationRuns, salaryRuns: s.salaryRuns }),
  ];
  return combineJournal(auto, s.manualJournals);
};
const accounts = (h: Hook) => mergeAccounts(h.result.current.customAccounts);
const money = (h: Hook) => {
  const s = h.result.current;
  return accountBalancesOn(collectCashMovements(s.ledger, s.expenses, s.cashEntries, s.customers, s.suppliers), s.settings, today);
};
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => { out = fn(); });
  return out!;
};
const balanced = (h: Hook) => expect(trialBalance(books(h), accounts(h), today).balanced).toBe(true);

beforeEach(() => localStorage.clear());

describe('amount in words (Pakistani style)', () => {
  it('uses lakh and crore', () => {
    expect(numberToWordsPK(0)).toBe('Zero');
    expect(numberToWordsPK(15)).toBe('Fifteen');
    expect(numberToWordsPK(1234)).toBe('One Thousand Two Hundred Thirty-Four');
    expect(numberToWordsPK(125000)).toBe('One Lakh Twenty-Five Thousand');
    expect(numberToWordsPK(12550000)).toBe('One Crore Twenty-Five Lakh Fifty Thousand');
    expect(numberToWordsPK(999999999)).toBe('Ninety-Nine Crore Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine');
    expect(amountInWordsPK(125000)).toBe('Rupees One Lakh Twenty-Five Thousand Only');
    expect(amountInWordsPK(500.5)).toBe('Rupees Five Hundred and Fifty Paisa Only');
    expect(amountFiguresPK(1250000)).toBe('12,50,000/-');
    expect(amountFiguresPK(999)).toBe('999/-');
    expect(amountFiguresPK(1500.25)).toBe('1,500.25');
  });
  it('fills a partial cheque layout with the defaults', () => {
    const l = chequeLayoutOf({ chequeLayout: { payee: { x: 30 } } as any });
    expect(l.payee).toEqual({ x: 30, y: DEFAULT_CHEQUE_LAYOUT.payee.y });
    expect(l.widthMm).toBe(DEFAULT_CHEQUE_LAYOUT.widthMm);
  });
});

describe('financial years', () => {
  it('runs 1 July to 30 June by default', () => {
    expect(financialYearOf('2026-03-15')).toEqual({ label: 'FY 2025-26', start: '2025-07-01', end: '2026-06-30' });
    expect(financialYearOf('2026-07-01')).toEqual({ label: 'FY 2026-27', start: '2026-07-01', end: '2027-06-30' });
    expect(financialYearOf('2026-03-15', '01-01')).toEqual({ label: 'FY 2026', start: '2026-01-01', end: '2026-12-31' });
    expect(financialYearsBetween('2024-08-01', '2026-03-01').map((f) => f.label)).toEqual(['FY 2025-26', 'FY 2024-25']);
  });
});

describe('fixed assets and depreciation', () => {
  const asset = (over: Partial<FixedAsset> = {}): FixedAsset => ({ id: 'a1', name: 'Generator', category: 'generator', purchaseDate: '2026-01-10', cost: 120000, paidFrom: 'cash', usefulLifeYears: 5, residualValue: 0, method: 'straight_line', status: 'in_use', createdAt: '2026-01-10', ...over });

  it('straight line and reducing balance monthly charges, never below residual', () => {
    expect(monthlyCharge(asset(), 120000)).toBe(2000);
    expect(monthlyCharge(asset({ residualValue: 12000 }), 120000)).toBe(1800);
    // Reducing balance 20% a year on book value 100,000 → 1,666.67 a month.
    expect(monthlyCharge(asset({ method: 'reducing_balance', ratePct: 20 }), 100000)).toBe(1666.67);
    expect(monthlyCharge(asset({ residualValue: 12000 }), 12500)).toBe(500);
    // A plan for Jan–Mar charges 3 months; a month already in a run is skipped.
    const plan = planDepreciation([asset()], [], ['2026-01', '2026-02', '2026-03'], '2026-06-01');
    expect(plan).toEqual([{ assetId: 'a1', amount: 6000, months: ['2026-01', '2026-02', '2026-03'] }]);
    const again = planDepreciation([asset()], [{ id: 'r', period: '2026-02', months: ['2026-02'], date: '2026-02-28', lines: [{ assetId: 'a1', amount: 2000, months: ['2026-02'] }], total: 2000, createdAt: '' }], ['2026-01', '2026-02', '2026-03'], '2026-06-01');
    expect(again[0].months).toEqual(['2026-01', '2026-03']);
  });

  it('buy for cash → run depreciation (idempotent) → balance sheet shows cost less depreciation → sell with gain', async () => {
    const h = await setup();
    const bought = shiftDate(monthEnd(addMonths(thisMonth, -3)), -5);
    const cashBefore = money(h).cash;
    const r = run(() => h.result.current.addFixedAsset({ name: 'Honda generator', category: 'generator', purchaseDate: bought, cost: 240000, paidFrom: 'cash', usefulLifeYears: 5, residualValue: 0, method: 'straight_line' }));
    expect(r.success).toBe(true);
    // Paid in cash: the Money screen shows it and the journal debits Fixed assets.
    expect(money(h).cash).toBe(cashBefore - 240000);
    expect(accountBalance(books(h), ACC.FIXED_ASSETS)).toBe(240000);
    expect(accountBalance(books(h), ACC.CASH)).toBe(money(h).cash);
    // The cash entry belongs to the asset: it can't be deleted on its own.
    const entryId = h.result.current.fixedAssets[0].purchaseEntryId!;
    expect(h.result.current.isFinanceRecord(entryId)).toBe(true);
    run(() => h.result.current.deleteCashEntry(entryId));
    expect(h.result.current.cashEntries.some((c) => c.id === entryId)).toBe(true);

    const m = monthOf(bought);
    const d1 = run(() => h.result.current.runDepreciation({ month: m }));
    expect(d1.success).toBe(true);
    expect(d1.run!.total).toBe(4000);
    // Running the same month again posts nothing.
    const d2 = run(() => h.result.current.runDepreciation({ month: m }));
    expect(d2.success).toBe(false);
    expect(d2.message).toMatch(/already been run/);
    expect(h.result.current.depreciationRuns).toHaveLength(1);
    // The year run charges the other months up to this month, not the first one again.
    const fy = financialYearOf(bought);
    const d3 = run(() => h.result.current.runDepreciation({ fyStartDate: fy.start }));
    const monthsExpected = [addMonths(m, 1), addMonths(m, 2), addMonths(m, 3)].filter((x) => x <= thisMonth && x <= monthOf(fy.end));
    expect(d3.success).toBe(monthsExpected.length > 0);
    const totalDep = 4000 * (1 + (d3.success ? monthsExpected.length : 0));
    const j = books(h);
    expect(accountBalance(j, ACC.DEPRECIATION)).toBe(totalDep);
    expect(accountBalance(j, ACC.ACCUM_DEPRECIATION)).toBe(-totalDep);
    const bs = balanceSheet(j, today, accounts(h));
    expect(bs.assets.find((a) => a.account.code === ACC.FIXED_ASSETS)!.amount).toBe(240000);
    expect(bs.assets.find((a) => a.account.code === ACC.ACCUM_DEPRECIATION)!.amount).toBe(-totalDep);
    expect(bs.balanced).toBe(true);
    balanced(h);
    const reg = assetRegister(h.result.current.fixedAssets, h.result.current.depreciationRuns, today);
    expect(reg.totalBookValue).toBe(240000 - totalDep);

    // Selling in a month already charged is refused; next month is fine.
    const early = run(() => h.result.current.disposeFixedAsset(h.result.current.fixedAssets[0].id, { date: bought, proceeds: 1000 }));
    expect(early.success).toBe(false);
    // Undo the year run, then sell this month (the months after the first are not charged).
    if (d3.success) expect(run(() => h.result.current.undoDepreciationRun(d3.run!.id)).success).toBe(true);
    const sellDate = monthOf(today) > m ? today : null;
    if (sellDate) {
      const sale = run(() => h.result.current.disposeFixedAsset(h.result.current.fixedAssets[0].id, { date: sellDate, proceeds: 250000, method: 'bank' }));
      expect(sale.success).toBe(true);
      // Book value 236,000 → gain 14,000.
      expect(sale.gain).toBe(14000);
      const j2 = books(h);
      expect(accountBalance(j2, ACC.FIXED_ASSETS)).toBe(0);
      expect(accountBalance(j2, ACC.ACCUM_DEPRECIATION)).toBe(0);
      expect(accountBalance(j2, ACC.ASSET_SALE_GAIN)).toBe(-14000);
      expect(accountBalance(j2, ACC.BANK)).toBe(money(h).bank);
      balanced(h);
      // Undo the sale puts it back.
      expect(run(() => h.result.current.undoDisposal(h.result.current.fixedAssets[0].id)).success).toBe(true);
      expect(accountBalance(books(h), ACC.FIXED_ASSETS)).toBe(240000);
    }
  });

  it('bought on credit, paid later; scrapped with a loss; owned asset as an opening balance', async () => {
    const h = await setup();
    const date = shiftDate(today, -40);
    const r = run(() => h.result.current.addFixedAsset({ name: 'Shop racks', category: 'fittings', purchaseDate: date, cost: 60000, paidFrom: 'credit', vendor: 'Ali Steel', usefulLifeYears: 10, method: 'straight_line' }));
    expect(r.success).toBe(true);
    expect(accountBalance(books(h), ACC.ASSET_CREDITORS)).toBe(-60000);
    expect(run(() => h.result.current.payAssetCreditor(r.asset!.id, { amount: 70000, method: 'Cash' })).success).toBe(false);
    expect(run(() => h.result.current.payAssetCreditor(r.asset!.id, { amount: 25000, method: 'Cash' })).success).toBe(true);
    expect(accountBalance(books(h), ACC.ASSET_CREDITORS)).toBe(-35000);
    balanced(h);
    // Written off for nothing: the whole book value is a loss.
    const w = run(() => h.result.current.disposeFixedAsset(r.asset!.id, { date: today, proceeds: 0 }));
    expect(w.success).toBe(true);
    expect(w.gain).toBe(-60000);
    expect(accountBalance(books(h), ACC.ASSET_SALE_LOSS)).toBe(60000);
    balanced(h);

    const o = run(() => h.result.current.addFixedAsset({ name: 'Shehzore truck', category: 'vehicle', purchaseDate: '2022-07-01', cost: 3000000, paidFrom: 'owned', usefulLifeYears: 10, residualValue: 500000, method: 'reducing_balance', ratePct: 15, openingAccumulated: 900000 }));
    expect(o.success).toBe(true);
    const j = books(h);
    expect(accountBalance(j, ACC.FIXED_ASSETS)).toBe(3000000);
    expect(accountBalance(j, ACC.ACCUM_DEPRECIATION)).toBe(-900000);
    // Reducing balance on book value 2,100,000 at 15% → 26,250 a month.
    const d = run(() => h.result.current.runDepreciation({ month: lastMonth }));
    expect(d.run!.lines.find((l) => l.assetId === o.asset!.id)!.amount).toBe(26250);
    balanced(h);
  });

  it('operators cannot add assets; a locked period refuses depreciation', async () => {
    const h = await setup('operator');
    expect(run(() => h.result.current.addFixedAsset({ name: 'X', category: 'other', purchaseDate: today, cost: 1, paidFrom: 'cash', usefulLifeYears: 1, method: 'straight_line' })).message).toMatch(/permission/);
    const a = await setup();
    run(() => a.result.current.addFixedAsset({ name: 'Scale', category: 'equipment', purchaseDate: shiftDate(today, -70), cost: 12000, paidFrom: 'owned', usefulLifeYears: 1, method: 'straight_line' }));
    run(() => a.result.current.updateSettings({ booksLockedUntil: monthEnd(lastMonth) }));
    expect(run(() => a.result.current.runDepreciation({ month: lastMonth })).message).toMatch(/closed/);
  });
});

describe('staff, advances and salaries', () => {
  it('advance → salary sheet recovers it → expense and advance account post correctly', async () => {
    const h = await setup();
    const s = h.result.current;
    const ali = run(() => s.addStaff({ name: 'Ali', role: 'Salesman', monthlySalary: 30000, joinDate: '2025-01-01' })).member!;
    run(() => h.result.current.addStaff({ name: 'Bashir', role: 'Loader', monthlySalary: 20000, joinDate: '2025-01-01' }));
    const cashBefore = money(h).cash;
    const adv = run(() => h.result.current.giveStaffAdvance({ staffId: ali.id, amount: 10000, method: 'Cash', date: shiftDate(today, -3), note: 'Eid' }));
    expect(adv.success).toBe(true);
    expect(money(h).cash).toBe(cashBefore - 10000);
    expect(accountBalance(books(h), ACC.STAFF_ADVANCES)).toBe(10000);
    expect(advanceBalance(ali.id, h.result.current.staffAdvances, h.result.current.salaryRuns)).toBe(10000);

    const draft = salarySheetDraft(h.result.current.staff, h.result.current.staffAdvances, h.result.current.salaryRuns, lastMonth);
    expect(draft.map((l) => [l.name, l.advanceDeducted, l.net])).toEqual([['Ali', 10000, 20000], ['Bashir', 0, 20000]]);
    // Recover only 6,000 this month, and give Bashir a 2,000 bonus less a 500 deduction.
    const lines = draft.map((l) => (l.name === 'Ali' ? { ...l, advanceDeducted: 6000 } : { ...l, bonus: 2000, deductions: 500 }));
    const pay = run(() => h.result.current.paySalaries({ month: lastMonth, method: 'Cash', lines }));
    expect(pay.success).toBe(true);
    expect(pay.run!.totalGross).toBe(51500);
    expect(pay.run!.totalNet).toBe(45500);
    expect(money(h).cash).toBe(cashBefore - 10000 - 45500);
    const j = books(h);
    expect(accountBalance(j, '6090')).toBe(51500);
    expect(accountBalance(j, ACC.STAFF_ADVANCES)).toBe(4000);
    balanced(h);
    // Same month again is refused.
    expect(run(() => h.result.current.paySalaries({ month: lastMonth, method: 'Cash', lines })).message).toMatch(/already paid/);
    // Can't recover more than is owed.
    const over = run(() => h.result.current.paySalaries({ month: thisMonth, method: 'Cash', lines: [{ ...lines[0], advanceDeducted: 5000 }] }));
    expect(over.message).toMatch(/only owes/);
    // Staff ledger: advance 10,000, recovered 6,000 → owes 4,000.
    const led = staffLedger(ali.id, h.result.current.staffAdvances, h.result.current.salaryRuns);
    expect(led.map((r) => r.balance)).toEqual([10000, 4000]);
    // The salary expense can't be deleted on its own; undoing the sheet removes it.
    const expId = h.result.current.salaryRuns[0].expenseId!;
    run(() => h.result.current.deleteExpense(expId));
    expect(h.result.current.expenses.some((e) => e.id === expId)).toBe(true);
    // The advance can't be deleted while part of it was recovered.
    expect(run(() => h.result.current.deleteStaffAdvance(adv.advance!.id)).success).toBe(false);
    expect(run(() => h.result.current.undoSalaryRun(h.result.current.salaryRuns[0].id)).success).toBe(true);
    expect(h.result.current.expenses.some((e) => e.id === expId)).toBe(false);
    expect(accountBalance(books(h), ACC.STAFF_ADVANCES)).toBe(10000);
    expect(run(() => h.result.current.deleteStaffAdvance(adv.advance!.id)).success).toBe(true);
    expect(money(h).cash).toBe(cashBefore);
    balanced(h);
  });
});

describe('budgets, cost centres, cash flow and ratios', () => {
  it('budget vs actual per account with variance and % used', async () => {
    const h = await setup();
    run(() => h.result.current.addExpense({ date: `${thisMonth}-01`, category: 'rent', amount: 45000, description: 'Shop rent', paidVia: 'Cash', truckId: null, dispatchId: null }));
    run(() => h.result.current.addExpense({ date: `${thisMonth}-01`, category: 'fuel', amount: 12000, description: 'Diesel', paidVia: 'Cash', truckId: null, dispatchId: null }));
    expect(run(() => h.result.current.setBudget(thisMonth, '6070', 40000)).success).toBe(true);
    expect(run(() => h.result.current.setBudget(thisMonth, '6040', 20000)).success).toBe(true);
    expect(run(() => h.result.current.setBudget(thisMonth, ACC.CASH, 1)).success).toBe(false);
    expect(run(() => h.result.current.copyBudget(thisMonth, [addMonths(thisMonth, 1), addMonths(thisMonth, 2)])).success).toBe(true);
    expect(h.result.current.budgets).toHaveLength(6);
    const rep = budgetVsActual(books(h), h.result.current.budgets, [thisMonth], accounts(h));
    const rent = rep.expenses.find((r) => r.account.code === '6070')!;
    expect(rent).toMatchObject({ budget: 40000, actual: 45000, variance: -5000, pctUsed: 112.5 });
    expect(rep.expenses.find((r) => r.account.code === '6040')).toMatchObject({ budget: 20000, actual: 12000, variance: 8000, pctUsed: 60 });
    // Setting a budget to 0 clears it.
    run(() => h.result.current.setBudget(thisMonth, '6040', 0));
    expect(h.result.current.budgets.some((b) => b.id === `bud-${thisMonth}-6040`)).toBe(false);
  });

  it('P&L by cost centre from tagged expenses, bills and journal lines', async () => {
    const h = await setup();
    const shop = run(() => h.result.current.addCostCentre({ name: 'Main shop', kind: 'branch' })).centre!;
    const truck = run(() => h.result.current.addCostCentre({ name: 'Shehzore', kind: 'vehicle' })).centre!;
    expect(run(() => h.result.current.addCostCentre({ name: 'main shop', kind: 'branch' })).success).toBe(false);
    run(() => h.result.current.addExpense({ date: today, category: 'fuel', amount: 8000, description: 'Diesel', paidVia: 'Cash', truckId: null, dispatchId: null, costCentreId: truck.id }));
    run(() => h.result.current.addExpense({ date: today, category: 'rent', amount: 30000, description: 'Rent', paidVia: 'Cash', truckId: null, dispatchId: null }));
    const jr = run(() => h.result.current.addManualJournal({ date: today, memo: 'Delivery charges earned', lines: [{ accountCode: ACC.CASH, debit: 5000, credit: 0 }, { accountCode: ACC.FREIGHT_INCOME, debit: 0, credit: 5000, costCentreId: truck.id }] }));
    expect(jr.success).toBe(true);
    expect(jr.entry!.lines[1].costCentreId).toBe(truck.id);
    const rep = profitByCostCentre(books(h), `${thisMonth}-01`, today, accounts(h), h.result.current.costCentres);
    const t = rep.find((c) => c.id === truck.id)!;
    expect(t).toMatchObject({ income: 5000, expenses: 8000, profit: -3000 });
    expect(rep.find((c) => c.id === UNTAGGED)!.expenses).toBe(30000);
    expect(rep[rep.length - 1].id).toBe(UNTAGGED);
    // A used centre can't be deleted; an unused one can.
    expect(run(() => h.result.current.deleteCostCentre(truck.id)).success).toBe(false);
    expect(run(() => h.result.current.deleteCostCentre(shop.id)).success).toBe(true);
  });

  it('cash flow statement reconciles to the change in cash + bank', async () => {
    const h = await setup();
    const from = shiftDate(today, -20);
    run(() => h.result.current.addExpense({ date: shiftDate(today, -2), category: 'rent', amount: 30000, description: 'Rent', paidVia: 'Cash', truckId: null, dispatchId: null }));
    run(() => h.result.current.addFixedAsset({ name: 'Laptop', category: 'computer', purchaseDate: shiftDate(today, -1), cost: 90000, paidFrom: 'bank', usefulLifeYears: 3, method: 'straight_line' }));
    run(() => h.result.current.addStaff({ name: 'Ali', role: 'Salesman', monthlySalary: 30000, joinDate: '2025-01-01' }));
    run(() => h.result.current.giveStaffAdvance({ staffId: h.result.current.staff[0].id, amount: 5000, method: 'Cash', date: today }));
    run(() => h.result.current.addCashEntry({ date: today, direction: 'in', amount: 100000, description: 'Capital put in by owner', method: 'Cash', accountCode: ACC.CAPITAL }));
    run(() => h.result.current.recordCustomerPayment('c1', 20000, 'REF', today));
    const cf = cashFlowStatement(books(h), from, today);
    expect(cf.flows.expenses.out).toBe(30000);
    expect(cf.flows.assets.out).toBe(90000);
    expect(cf.flows.staff.out).toBe(5000);
    expect(cf.flows.owner.in).toBe(100000);
    expect(cf.flows.customers.in).toBe(20000);
    expect(cf.opening).toBe(1500000);
    expect(cf.closing).toBe(1500000 - 30000 - 90000 - 5000 + 100000 + 20000);
    expect(cf.difference).toBe(0);
    expect(cf.investing).toBe(-90000);
    expect(cf.financing).toBe(100000);
  });

  it('key ratios with plain-English readings', async () => {
    const h = await setup();
    // A bill on credit: sales 100,000; cost 70,000 (dated purchase cost); rent 10,000.
    const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
    void set;
    const j = [
      { id: 'e1', date: today, ref: 'x', memo: 'bill', source: 'manual' as const, lines: [{ accountCode: ACC.RECEIVABLE, debit: 100000, credit: 0 }, { accountCode: ACC.SALES, debit: 0, credit: 100000 }] },
      { id: 'e2', date: today, ref: 'x', memo: 'cogs', source: 'manual' as const, lines: [{ accountCode: ACC.COGS, debit: 70000, credit: 0 }, { accountCode: ACC.INVENTORY, debit: 0, credit: 70000 }] },
      { id: 'e3', date: today, ref: 'x', memo: 'stock', source: 'manual' as const, lines: [{ accountCode: ACC.INVENTORY, debit: 140000, credit: 0 }, { accountCode: ACC.PAYABLE, debit: 0, credit: 140000 }] },
      { id: 'e4', date: today, ref: 'x', memo: 'rent', source: 'manual' as const, lines: [{ accountCode: '6070', debit: 10000, credit: 0 }, { accountCode: ACC.CASH, debit: 0, credit: 10000 }] },
      { id: 'e5', date: today, ref: 'x', memo: 'open', source: 'manual' as const, lines: [{ accountCode: ACC.CASH, debit: 50000, credit: 0 }, { accountCode: ACC.CAPITAL, debit: 0, credit: 50000 }] },
    ];
    const r = keyRatios(j, today, today, accounts(h));
    const get = (id: string) => r.find((x) => x.id === id)!;
    expect(get('gross_margin').value).toBe(30);
    expect(get('net_margin').value).toBe(20);
    // Current assets 100,000 + 70,000 + 40,000 = 210,000; current liabilities 140,000.
    expect(get('current_ratio').value).toBe(1.5);
    expect(get('debtor_days').value).toBe(1);
    expect(get('stock_days').value).toBe(1);
    expect(get('creditor_days').value).toBe(2);
    expect(get('gross_margin').reading).toContain('Rs. 30');
    expect(keyRatios([], today, today, DEFAULT_ACCOUNTS)[0].value).toBeNull();
  });
});

describe('year-end close', () => {
  it('closing entry carries the profit to retained earnings, locks the books, keeps P&L; undo reopens', async () => {
    const h = await setup();
    // A year that has ended: the previous financial year.
    const cur = financialYearOf(today);
    const prev = financialYearOf(shiftDate(cur.start, -1));
    const inPrev = shiftDate(prev.end, -30);
    run(() => h.result.current.addCashEntry({ date: inPrev, direction: 'in', amount: 80000, description: 'Commission received', method: 'Cash', accountCode: ACC.OTHER_INCOME }));
    run(() => h.result.current.addExpense({ date: inPrev, category: 'rent', amount: 30000, description: 'Rent', paidVia: 'Cash', truckId: null, dispatchId: null }));
    const pnlBefore = profitAndLoss(books(h), prev.start, prev.end, accounts(h));
    expect(pnlBefore.netProfit).toBe(50000);
    // Not an ended year → refused.
    expect(run(() => h.result.current.closeYear({ fyStartDate: cur.start })).success).toBe(false);
    const c = run(() => h.result.current.closeYear({ fyStartDate: prev.start }));
    expect(c.success).toBe(true);
    expect(c.close!.profit).toBe(50000);
    expect(h.result.current.settings.booksLockedUntil).toBe(prev.end);
    const j = books(h);
    const closing = j.find((e) => e.closing)!;
    expect(closing.date).toBe(prev.end);
    // Income and expense accounts are empty after the close; the profit sits in retained earnings.
    expect(accountBalance(j, ACC.OTHER_INCOME, prev.end)).toBe(0);
    expect(accountBalance(j, '6070', prev.end)).toBe(0);
    expect(accountBalance(j, ACC.RETAINED_EARNINGS)).toBe(-50000);
    // The P&L for the closed year still shows the year as traded.
    expect(profitAndLoss(j, prev.start, prev.end, accounts(h)).netProfit).toBe(50000);
    const bs = balanceSheet(j, prev.end, accounts(h));
    expect(bs.profitToDate).toBe(0);
    expect(bs.equity.find((r) => r.account.code === ACC.RETAINED_EARNINGS)!.amount).toBe(50000);
    expect(bs.balanced).toBe(true);
    balanced(h);
    // Closed twice → refused; the closing entry can't be deleted like a normal journal.
    expect(run(() => h.result.current.closeYear({ fyStartDate: prev.start })).message).toMatch(/already closed/);
    expect(run(() => h.result.current.deleteManualJournal(closing.id)).success).toBe(false);
    // Nothing can be added in the closed year now.
    expect(run(() => h.result.current.giveStaffAdvance({ staffId: 'x', amount: 1, method: 'Cash', date: inPrev })).success).toBe(false);
    // Undo.
    expect(run(() => h.result.current.undoYearClose()).success).toBe(true);
    expect(books(h).some((e) => e.closing)).toBe(false);
    expect(h.result.current.settings.booksLockedUntil).toBeUndefined();
  });

  it('only an admin can close a year', async () => {
    const h = await setup('operator');
    expect(run(() => h.result.current.closeYear({ fyStartDate: '2024-07-01' })).message).toMatch(/admin/);
  });
});
