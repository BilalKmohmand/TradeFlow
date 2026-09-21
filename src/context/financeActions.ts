import React, { useEffect, useMemo, useState } from 'react';
import {
  AppSettings,
  AssetCategory,
  AssetPaidFrom,
  Budget,
  CashEntry,
  CostCentre,
  CostCentreKind,
  DepreciationMethod,
  DepreciationRun,
  Expense,
  FixedAsset,
  SalaryLine,
  SalaryRun,
  StaffAdvance,
  StaffMember,
  YearClose,
} from '../types';
import { ACC, Account, JournalEntry, booksLockedFor, trialBalance } from '../utils/accounting';
import {
  advanceBalance,
  buildFinanceJournal,
  chargedMonths,
  closingEntry,
  disposalResult,
  financialYearOf,
  fyStartOf,
  isMonth,
  latestClose,
  monthEnd,
  monthLabel,
  monthOf,
  monthsBetween,
  planDepreciation,
  round2,
  salaryNet,
  salaryTotals,
} from '../utils/financeBooks';
import { formatCurrency, formatDate } from '../utils/formatters';

/**
 * Finance: fixed assets & depreciation, staff & salaries, budgets, cost centres and the year-end close.
 * The accounting for each is described in utils/financeBooks.ts. Money that moves is always an
 * ordinary cash-book entry or expense (so the Money screen sees it); those rows belong to the finance
 * record and are changed through it, never deleted on their own.
 */

export const FINANCE_STORAGE_KEYS = {
  FIXED_ASSETS: 'tradeflow_fixed_assets_v1',
  DEPRECIATION_RUNS: 'tradeflow_depreciation_runs_v1',
  STAFF: 'tradeflow_staff_v1',
  STAFF_ADVANCES: 'tradeflow_staff_advances_v1',
  SALARY_RUNS: 'tradeflow_salary_runs_v1',
  BUDGETS: 'tradeflow_budgets_v1',
  COST_CENTRES: 'tradeflow_cost_centres_v1',
  YEAR_CLOSES: 'tradeflow_year_closes_v1',
};

/** Cloud tables (migrate_v21_finance.sql). */
export const FINANCE_TABLES = ['fixed_assets', 'depreciation_runs', 'staff', 'staff_advances', 'salary_runs', 'budgets', 'cost_centres', 'year_closes'] as const;
export type FinanceTable = (typeof FINANCE_TABLES)[number];

type Result<T = object> = { success: boolean; message: string } & Partial<T>;

export interface AddAssetInput {
  name: string;
  category: AssetCategory;
  purchaseDate: string;
  cost: number;
  paidFrom: AssetPaidFrom;
  vendor?: string;
  usefulLifeYears: number;
  residualValue?: number;
  method: DepreciationMethod;
  ratePct?: number;
  openingAccumulated?: number;
  costCentreId?: string | null;
  note?: string;
}

export interface StaffInput {
  name: string;
  role: string;
  monthlySalary: number;
  phone?: string;
  joinDate: string;
  cnic?: string;
  active?: boolean;
}

export interface FinanceApi {
  fixedAssets: FixedAsset[];
  depreciationRuns: DepreciationRun[];
  staff: StaffMember[];
  staffAdvances: StaffAdvance[];
  salaryRuns: SalaryRun[];
  budgets: Budget[];
  costCentres: CostCentre[];
  yearCloses: YearClose[];

  addFixedAsset: (input: AddAssetInput) => Result<{ asset: FixedAsset }>;
  updateFixedAsset: (id: string, patch: Partial<Pick<FixedAsset, 'name' | 'category' | 'note' | 'costCentreId' | 'usefulLifeYears' | 'residualValue' | 'method' | 'ratePct'>>) => Result;
  deleteFixedAsset: (id: string) => Result;
  payAssetCreditor: (id: string, input: { amount: number; method: string; date?: string }) => Result;
  /** Month "YYYY-MM" or a financial year label such as "FY 2025-26" (or its start date). */
  runDepreciation: (period: { month?: string; fyStartDate?: string }) => Result<{ run: DepreciationRun }>;
  undoDepreciationRun: (id: string) => Result;
  disposeFixedAsset: (id: string, input: { date: string; proceeds: number; method?: 'cash' | 'bank'; note?: string }) => Result<{ gain: number }>;
  undoDisposal: (id: string) => Result;

  addStaff: (input: StaffInput) => Result<{ member: StaffMember }>;
  updateStaff: (id: string, patch: Partial<StaffInput>) => Result;
  deleteStaff: (id: string) => Result;
  giveStaffAdvance: (input: { staffId: string; amount: number; method: string; date?: string; note?: string }) => Result<{ advance: StaffAdvance }>;
  deleteStaffAdvance: (id: string) => Result;
  paySalaries: (input: { month: string; date?: string; method: string; lines: SalaryLine[] }) => Result<{ run: SalaryRun }>;
  undoSalaryRun: (id: string) => Result;

  setBudget: (month: string, accountCode: string, amount: number) => Result;
  /** Copy one month's budget to other months (replacing theirs). */
  copyBudget: (fromMonth: string, toMonths: string[]) => Result;

  addCostCentre: (input: { name: string; kind: CostCentreKind }) => Result<{ centre: CostCentre }>;
  updateCostCentre: (id: string, patch: Partial<Pick<CostCentre, 'name' | 'kind' | 'active'>>) => Result;
  deleteCostCentre: (id: string) => Result;

  closeYear: (input: { fyStartDate: string; toAccount?: string }) => Result<{ close: YearClose }>;
  undoYearClose: () => Result;

  /** True for an expense / cash entry a finance record created (change the record, don't delete the row). */
  isFinanceRecord: (id: string) => boolean;
}

interface Deps {
  settings: AppSettings;
  updateSettings: (data: Partial<Omit<AppSettings, 'id'>>) => void;
  can: (permission: string) => boolean;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger') => void;
  uid: (prefix: string) => string;
  userName?: string;
  today: () => string;
  addExpense: (data: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => Expense;
  addCashEntry: (data: Omit<CashEntry, 'id' | 'createdAt' | 'createdBy'>) => CashEntry;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  setManualJournals: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
  /** Journal of everything outside this store (auto + manual), oldest first. */
  getBaseJournal: () => JournalEntry[];
  accounts: Account[];
  isCloudSyncReady: boolean;
  syncToSupabase: (table: string, rows: unknown[]) => Promise<void>;
  removeRemote: (table: any, ids: string[]) => void;
  /** Invoices / expenses tagged with a cost centre (a used centre can't be deleted). */
  centreInUse: (id: string) => boolean;
}

const load = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const isDate = (d?: string | null) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
const fail = (message: string) => ({ success: false as const, message });
const moneyMethod = (m?: string) => (m === 'bank' ? 'Bank Transfer' : m === 'cash' ? 'Cash' : m || 'Cash');

export const useFinanceStore = (d: Deps) => {
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>(() => load(FINANCE_STORAGE_KEYS.FIXED_ASSETS));
  const [depreciationRuns, setDepreciationRuns] = useState<DepreciationRun[]>(() => load(FINANCE_STORAGE_KEYS.DEPRECIATION_RUNS));
  const [staff, setStaff] = useState<StaffMember[]>(() => load(FINANCE_STORAGE_KEYS.STAFF));
  const [staffAdvances, setStaffAdvances] = useState<StaffAdvance[]>(() => load(FINANCE_STORAGE_KEYS.STAFF_ADVANCES));
  const [salaryRuns, setSalaryRuns] = useState<SalaryRun[]>(() => load(FINANCE_STORAGE_KEYS.SALARY_RUNS));
  const [budgets, setBudgets] = useState<Budget[]>(() => load(FINANCE_STORAGE_KEYS.BUDGETS));
  const [costCentres, setCostCentres] = useState<CostCentre[]>(() => load(FINANCE_STORAGE_KEYS.COST_CENTRES));
  const [yearCloses, setYearCloses] = useState<YearClose[]>(() => load(FINANCE_STORAGE_KEYS.YEAR_CLOSES));

  const persist = <T,>(key: string, table: FinanceTable, rows: T[]) => {
    localStorage.setItem(key, JSON.stringify(rows));
    void d.syncToSupabase(table, rows);
  };
  useEffect(() => persist(FINANCE_STORAGE_KEYS.FIXED_ASSETS, 'fixed_assets', fixedAssets), [fixedAssets, d.isCloudSyncReady]);
  useEffect(() => persist(FINANCE_STORAGE_KEYS.DEPRECIATION_RUNS, 'depreciation_runs', depreciationRuns), [depreciationRuns, d.isCloudSyncReady]);
  useEffect(() => persist(FINANCE_STORAGE_KEYS.STAFF, 'staff', staff), [staff, d.isCloudSyncReady]);
  useEffect(() => persist(FINANCE_STORAGE_KEYS.STAFF_ADVANCES, 'staff_advances', staffAdvances), [staffAdvances, d.isCloudSyncReady]);
  useEffect(() => persist(FINANCE_STORAGE_KEYS.SALARY_RUNS, 'salary_runs', salaryRuns), [salaryRuns, d.isCloudSyncReady]);
  useEffect(() => persist(FINANCE_STORAGE_KEYS.BUDGETS, 'budgets', budgets), [budgets, d.isCloudSyncReady]);
  useEffect(() => persist(FINANCE_STORAGE_KEYS.COST_CENTRES, 'cost_centres', costCentres), [costCentres, d.isCloudSyncReady]);
  useEffect(() => persist(FINANCE_STORAGE_KEYS.YEAR_CLOSES, 'year_closes', yearCloses), [yearCloses, d.isCloudSyncReady]);

  const today = d.today();
  const who = d.userName;
  const NO = (what: string) => fail(`You don't have permission to ${what}. Ask a manager or admin.`);
  const canBooks = () => d.can('finance:view_pnl');
  const canCash = () => d.can('finance:cashbook');
  const canRemove = () => d.can('delete_records');
  /** Common checks for a books date. */
  const badDate = (date: string, what = 'date'): string | null => {
    if (!isDate(date)) return `Enter a valid ${what}.`;
    if (date > today) return `The ${what} cannot be in the future.`;
    return booksLockedFor(d.settings, date);
  };
  const dropExpense = (id?: string | null) => {
    if (!id) return;
    d.setExpenses((prev) => prev.filter((e) => e.id !== id));
    d.removeRemote('expenses', [id]);
  };
  const dropCash = (ids: (string | null | undefined)[]) => {
    const list = ids.filter(Boolean) as string[];
    if (!list.length) return;
    d.setCashEntries((prev) => prev.filter((c) => !list.includes(c.id)));
    d.removeRemote('cash_entries', list);
  };

  // ---------------------------------------------------------------------------
  // Fixed assets
  // ---------------------------------------------------------------------------
  const addFixedAsset: FinanceApi['addFixedAsset'] = (input) => {
    if (!canBooks()) return NO('add fixed assets');
    const name = (input.name || '').trim();
    if (!name) return fail('Give the asset a name (e.g. Suzuki pickup LES-1234).');
    const cost = round2(Number(input.cost) || 0);
    if (!(cost > 0)) return fail('Enter what the asset cost.');
    const life = Number(input.usefulLifeYears) || 0;
    if (!(life > 0 && life <= 100)) return fail('Enter how many years it will be used (useful life).');
    const residual = round2(Number(input.residualValue) || 0);
    if (residual < 0 || residual >= cost) return fail('The value at the end (residual value) must be less than the cost.');
    const opening = input.paidFrom === 'owned' ? round2(Number(input.openingAccumulated) || 0) : 0;
    if (opening < 0 || opening > cost - residual) return fail('Depreciation already charged cannot be more than cost less residual value.');
    if (input.method === 'reducing_balance' && input.ratePct != null && !(Number(input.ratePct) > 0 && Number(input.ratePct) < 100)) return fail('The reducing-balance rate must be between 0 and 100%.');
    if (!isDate(input.purchaseDate)) return fail('Enter the purchase date.');
    if (input.purchaseDate > today) return fail('The purchase date cannot be in the future.');
    // An asset already owned is an opening balance; it posts no money, so the lock does not apply to its old date.
    if (input.paidFrom !== 'owned') {
      const closed = booksLockedFor(d.settings, input.purchaseDate);
      if (closed) return fail(closed);
    }
    const id = d.uid('fa');
    let purchaseEntryId: string | null = null;
    if (input.paidFrom === 'cash' || input.paidFrom === 'bank') {
      const entry = d.addCashEntry({ date: input.purchaseDate, direction: 'out', amount: cost, method: moneyMethod(input.paidFrom), accountCode: ACC.FIXED_ASSETS, description: `Fixed asset bought: ${name}` });
      purchaseEntryId = entry.id;
    }
    const asset: FixedAsset = {
      id,
      name,
      category: input.category || 'other',
      purchaseDate: input.purchaseDate,
      cost,
      paidFrom: input.paidFrom,
      vendor: input.vendor?.trim() || undefined,
      usefulLifeYears: life,
      residualValue: residual,
      method: input.method === 'reducing_balance' ? 'reducing_balance' : 'straight_line',
      ratePct: input.method === 'reducing_balance' && input.ratePct ? round2(Number(input.ratePct)) : undefined,
      openingAccumulated: opening || undefined,
      costCentreId: input.costCentreId || null,
      note: input.note?.trim() || undefined,
      purchaseEntryId,
      payments: [],
      status: 'in_use',
      createdAt: today,
      createdBy: who,
    };
    setFixedAssets((prev) => [asset, ...prev]);
    d.logAuditEvent('Fixed Asset Added', `${name}: ${formatCurrency(cost)} (${input.paidFrom}), bought ${formatDate(input.purchaseDate)}.`, 'info');
    return { success: true, message: `${name} added to the asset register.`, asset };
  };

  const updateFixedAsset: FinanceApi['updateFixedAsset'] = (id, patch) => {
    if (!canBooks()) return NO('change fixed assets');
    const a = fixedAssets.find((x) => x.id === id);
    if (!a) return fail('Asset not found.');
    if (patch.name != null && !patch.name.trim()) return fail('Give the asset a name.');
    // Changing life / method later only affects months not charged yet (runs already posted stay as they are).
    setFixedAssets((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch, name: patch.name != null ? patch.name.trim() : x.name } : x)));
    return { success: true, message: 'Asset saved.' };
  };

  const deleteFixedAsset: FinanceApi['deleteFixedAsset'] = (id) => {
    if (!canBooks() || !canRemove()) return NO('delete fixed assets');
    const a = fixedAssets.find((x) => x.id === id);
    if (!a) return fail('Asset not found.');
    if (a.status === 'disposed') return fail('This asset was sold. Undo the sale first.');
    if (depreciationRuns.some((r) => r.lines.some((l) => l.assetId === id))) return fail('Depreciation has been charged on this asset. Undo those depreciation runs first, or record it as sold / scrapped.');
    if ((a.payments || []).length) return fail('Payments were made for this asset. It stays in the register.');
    const closed = a.paidFrom !== 'owned' && booksLockedFor(d.settings, a.purchaseDate);
    if (closed) return fail(closed);
    dropCash([a.purchaseEntryId]);
    setFixedAssets((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('fixed_assets', [id]);
    d.logAuditEvent('Fixed Asset Deleted', `${a.name}: ${formatCurrency(a.cost)}.`, 'danger');
    return { success: true, message: `${a.name} removed.` };
  };

  const assetCreditorOwed = (a: FixedAsset) => (a.paidFrom === 'credit' ? round2(a.cost - (a.payments || []).reduce((s, p) => s + p.amount, 0)) : 0);

  const payAssetCreditor: FinanceApi['payAssetCreditor'] = (id, input) => {
    if (!canCash()) return NO('record payments');
    const a = fixedAssets.find((x) => x.id === id);
    if (!a) return fail('Asset not found.');
    const owed = assetCreditorOwed(a);
    if (owed <= 0) return fail('Nothing is owed for this asset.');
    const amount = round2(Number(input.amount) || 0);
    if (!(amount > 0)) return fail('Enter the amount paid.');
    if (amount > owed + 0.005) return fail(`Only ${formatCurrency(owed)} is owed for ${a.name}.`);
    const date = input.date || today;
    const bad = badDate(date);
    if (bad) return fail(bad);
    if (date < a.purchaseDate) return fail('The payment cannot be before the asset was bought.');
    const entry = d.addCashEntry({ date, direction: 'out', amount, method: input.method || 'Cash', accountCode: ACC.ASSET_CREDITORS, description: `Paid for fixed asset: ${a.name}${a.vendor ? ` (${a.vendor})` : ''}` });
    setFixedAssets((prev) => prev.map((x) => (x.id === id ? { ...x, payments: [...(x.payments || []), { id: d.uid('fap'), date, amount, method: input.method || 'Cash', cashEntryId: entry.id }] } : x)));
    d.logAuditEvent('Asset Payment', `${a.name}: ${formatCurrency(amount)} paid.`, 'info');
    return { success: true, message: `${formatCurrency(amount)} paid for ${a.name}.` };
  };

  const runDepreciation: FinanceApi['runDepreciation'] = (period) => {
    if (!canBooks()) return NO('run depreciation');
    let months: string[];
    let label: string;
    if (period.month) {
      if (!isMonth(period.month)) return fail('Pick a month.');
      if (period.month > monthOf(today)) return fail('That month has not started yet.');
      months = [period.month];
      label = period.month;
    } else if (period.fyStartDate && isDate(period.fyStartDate)) {
      const fy = financialYearOf(period.fyStartDate, fyStartOf(d.settings));
      if (fy.start > today) return fail('That year has not started yet.');
      months = monthsBetween(monthOf(fy.start), monthOf(fy.end < today ? fy.end : today));
      label = fy.label;
    } else return fail('Pick a month or a year.');
    const lastMonth = months[months.length - 1];
    const date = monthEnd(lastMonth) < today ? monthEnd(lastMonth) : today;
    const closed = booksLockedFor(d.settings, date);
    if (closed) return fail(closed);
    const eligible = fixedAssets.filter((a) => a.purchaseDate <= date);
    const lines = planDepreciation(eligible, depreciationRuns, months, today);
    if (lines.length === 0) {
      const already = eligible.some((a) => months.some((m) => chargedMonths(a.id, depreciationRuns).has(m)));
      return fail(already ? `Depreciation for ${period.month ? monthLabel(label) : label} has already been run. Nothing more to charge.` : 'No asset has depreciation to charge for this period.');
    }
    // A month already covered for some assets is only charged for the others: a run never charges twice.
    const run: DepreciationRun = { id: d.uid('dep'), period: label, months, date, lines, total: round2(lines.reduce((a, l) => a + l.amount, 0)), createdAt: today, createdBy: who };
    setDepreciationRuns((prev) => [run, ...prev]);
    d.logAuditEvent('Depreciation Run', `${label}: ${formatCurrency(run.total)} on ${lines.length} asset(s).`, 'info');
    return { success: true, message: `Depreciation for ${period.month ? monthLabel(label) : label}: ${formatCurrency(run.total)} charged on ${lines.length} asset${lines.length === 1 ? '' : 's'}.`, run };
  };

  const undoDepreciationRun: FinanceApi['undoDepreciationRun'] = (id) => {
    if (!canBooks() || !canRemove()) return NO('undo depreciation');
    const r = depreciationRuns.find((x) => x.id === id);
    if (!r) return fail('Run not found.');
    const closed = booksLockedFor(d.settings, r.date);
    if (closed) return fail(`This run is in a closed period. ${closed}`);
    const sold = r.lines.map((l) => fixedAssets.find((a) => a.id === l.assetId)).find((a) => a?.status === 'disposed');
    if (sold) return fail(`${sold.name} has been sold since; its gain or loss used this depreciation. Undo the sale first.`);
    setDepreciationRuns((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('depreciation_runs', [id]);
    d.logAuditEvent('Depreciation Run Undone', `${r.period}: ${formatCurrency(r.total)}.`, 'warning');
    return { success: true, message: `Depreciation run ${r.period} undone.` };
  };

  const disposeFixedAsset: FinanceApi['disposeFixedAsset'] = (id, input) => {
    if (!canBooks()) return NO('record the sale of assets');
    const a = fixedAssets.find((x) => x.id === id);
    if (!a) return fail('Asset not found.');
    if (a.status === 'disposed') return fail('This asset is already sold / scrapped.');
    const bad = badDate(input.date, 'date of sale');
    if (bad) return fail(bad);
    if (input.date < a.purchaseDate) return fail('It cannot be sold before it was bought.');
    const sm = monthOf(input.date);
    if (Array.from(chargedMonths(a.id, depreciationRuns)).some((m) => m >= sm)) return fail(`Depreciation was already charged for ${monthLabel(sm)} or later. Undo that depreciation run first.`);
    const proceeds = round2(Number(input.proceeds) || 0);
    if (proceeds < 0) return fail('The sale price cannot be negative.');
    let disposalEntryId: string | null = null;
    if (proceeds > 0) {
      const entry = d.addCashEntry({ date: input.date, direction: 'in', amount: proceeds, method: moneyMethod(input.method || 'cash'), accountCode: ACC.FIXED_ASSETS, description: `Fixed asset sold: ${a.name}` });
      disposalEntryId = entry.id;
    }
    const { gain } = disposalResult(a, depreciationRuns, proceeds);
    setFixedAssets((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'disposed', disposalDate: input.date, disposalProceeds: proceeds, disposalMethod: proceeds > 0 ? input.method || 'cash' : null, disposalEntryId, disposalNote: input.note?.trim() || undefined } : x)));
    d.logAuditEvent('Fixed Asset Sold', `${a.name} for ${formatCurrency(proceeds)}: ${gain >= 0 ? 'gain' : 'loss'} ${formatCurrency(Math.abs(gain))}.`, 'warning');
    return { success: true, message: `${a.name} ${proceeds > 0 ? `sold for ${formatCurrency(proceeds)}` : 'written off'}: ${gain >= 0 ? 'gain' : 'loss'} of ${formatCurrency(Math.abs(gain))}.`, gain };
  };

  const undoDisposal: FinanceApi['undoDisposal'] = (id) => {
    if (!canBooks() || !canRemove()) return NO('undo the sale');
    const a = fixedAssets.find((x) => x.id === id);
    if (!a || a.status !== 'disposed') return fail('This asset is not sold.');
    const closed = a.disposalDate ? booksLockedFor(d.settings, a.disposalDate) : null;
    if (closed) return fail(closed);
    dropCash([a.disposalEntryId]);
    setFixedAssets((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'in_use', disposalDate: null, disposalProceeds: undefined, disposalMethod: null, disposalEntryId: null, disposalNote: undefined } : x)));
    d.logAuditEvent('Asset Sale Undone', a.name, 'warning');
    return { success: true, message: `Sale of ${a.name} undone.` };
  };

  // ---------------------------------------------------------------------------
  // Staff
  // ---------------------------------------------------------------------------
  const checkStaff = (input: Partial<StaffInput>, full: boolean): string | null => {
    if (full || input.name != null) if (!(input.name || '').trim()) return 'Enter the name.';
    if (full || input.monthlySalary != null) if (!(Number(input.monthlySalary) >= 0)) return 'Enter the monthly salary.';
    if (full || input.joinDate != null) if (!isDate(input.joinDate)) return 'Enter the joining date.';
    return null;
  };

  const addStaff: FinanceApi['addStaff'] = (input) => {
    if (!canCash()) return NO('manage staff');
    const bad = checkStaff(input, true);
    if (bad) return fail(bad);
    const member: StaffMember = { id: d.uid('stf'), name: input.name.trim(), role: (input.role || '').trim(), monthlySalary: round2(Number(input.monthlySalary) || 0), phone: input.phone?.trim() || undefined, cnic: input.cnic?.trim() || undefined, joinDate: input.joinDate, active: input.active !== false, createdAt: today };
    setStaff((prev) => [...prev, member]);
    d.logAuditEvent('Staff Added', `${member.name} (${member.role || 'staff'}), ${formatCurrency(member.monthlySalary)} a month.`, 'info');
    return { success: true, message: `${member.name} added.`, member };
  };

  const updateStaff: FinanceApi['updateStaff'] = (id, patch) => {
    if (!canCash()) return NO('manage staff');
    if (!staff.some((s) => s.id === id)) return fail('Staff member not found.');
    const bad = checkStaff(patch, false);
    if (bad) return fail(bad);
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, name: patch.name != null ? patch.name.trim() : s.name, monthlySalary: patch.monthlySalary != null ? round2(Number(patch.monthlySalary)) : s.monthlySalary } : s)));
    return { success: true, message: 'Saved.' };
  };

  const deleteStaff: FinanceApi['deleteStaff'] = (id) => {
    if (!canCash() || !canRemove()) return NO('remove staff');
    const s = staff.find((x) => x.id === id);
    if (!s) return fail('Staff member not found.');
    if (staffAdvances.some((a) => a.staffId === id) || salaryRuns.some((r) => r.lines.some((l) => l.staffId === id))) return fail(`${s.name} has salaries or advances on record. Mark them as left (inactive) instead.`);
    setStaff((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('staff', [id]);
    return { success: true, message: `${s.name} removed.` };
  };

  const giveStaffAdvance: FinanceApi['giveStaffAdvance'] = (input) => {
    if (!canCash()) return NO('give advances');
    const s = staff.find((x) => x.id === input.staffId);
    if (!s) return fail('Pick the staff member.');
    const amount = round2(Number(input.amount) || 0);
    if (!(amount > 0)) return fail('Enter the advance amount.');
    const date = input.date || today;
    const bad = badDate(date);
    if (bad) return fail(bad);
    const method = input.method || 'Cash';
    const entry = d.addCashEntry({ date, direction: 'out', amount, method, accountCode: ACC.STAFF_ADVANCES, description: `Advance to ${s.name}${input.note?.trim() ? ` — ${input.note.trim()}` : ''}` });
    const advance: StaffAdvance = { id: d.uid('adv'), staffId: s.id, date, amount, method, note: input.note?.trim() || undefined, cashEntryId: entry.id, createdAt: today, createdBy: who };
    setStaffAdvances((prev) => [advance, ...prev]);
    d.logAuditEvent('Staff Advance', `${s.name}: ${formatCurrency(amount)} (${method}).`, 'info');
    return { success: true, message: `Advance of ${formatCurrency(amount)} given to ${s.name}.`, advance };
  };

  const deleteStaffAdvance: FinanceApi['deleteStaffAdvance'] = (id) => {
    if (!canCash() || !canRemove()) return NO('delete advances');
    const a = staffAdvances.find((x) => x.id === id);
    if (!a) return fail('Advance not found.');
    const closed = booksLockedFor(d.settings, a.date);
    if (closed) return fail(closed);
    const rest = staffAdvances.filter((x) => x.id !== id);
    if (advanceBalance(a.staffId, rest, salaryRuns) < -0.005) return fail('Part of this advance has already been recovered from a salary. Undo that salary sheet first.');
    dropCash([a.cashEntryId]);
    setStaffAdvances(rest);
    d.removeRemote('staff_advances', [id]);
    d.logAuditEvent('Staff Advance Deleted', `${formatCurrency(a.amount)} on ${formatDate(a.date)}.`, 'danger');
    return { success: true, message: 'Advance deleted.' };
  };

  const paySalaries: FinanceApi['paySalaries'] = (input) => {
    if (!canCash()) return NO('pay salaries');
    if (!isMonth(input.month)) return fail('Pick the month.');
    if (input.month > monthOf(today)) return fail('That month has not started yet.');
    const dup = salaryRuns.find((r) => r.month === input.month);
    if (dup) return fail(`Salaries for ${monthLabel(input.month)} were already paid on ${formatDate(dup.date)}. Undo that sheet to pay again.`);
    const date = input.date || today;
    const bad = badDate(date, 'payment date');
    if (bad) return fail(bad);
    const lines: SalaryLine[] = [];
    for (const raw of input.lines || []) {
      const s = staff.find((x) => x.id === raw.staffId);
      if (!s) return fail('A staff member on the sheet no longer exists.');
      const l: SalaryLine = { staffId: s.id, name: s.name, role: s.role, salary: round2(Number(raw.salary) || 0), bonus: round2(Number(raw.bonus) || 0), deductions: round2(Number(raw.deductions) || 0), advanceDeducted: round2(Number(raw.advanceDeducted) || 0), net: 0, note: raw.note?.trim() || undefined };
      if (l.salary < 0 || l.bonus < 0 || l.deductions < 0 || l.advanceDeducted < 0) return fail(`${s.name}: amounts cannot be negative.`);
      const owed = Math.max(0, advanceBalance(s.id, staffAdvances, salaryRuns));
      if (l.advanceDeducted > owed + 0.005) return fail(`${s.name} only owes ${formatCurrency(owed)} in advances.`);
      l.net = salaryNet(l);
      if (l.net < 0) return fail(`${s.name}: deductions and advance are more than the salary.`);
      if (l.salary + l.bonus > 0 || l.advanceDeducted > 0) lines.push(l);
    }
    if (lines.length === 0) return fail('Nobody on the sheet has a salary to pay.');
    const t = salaryTotals(lines);
    const id = d.uid('sal');
    let expenseId: string | null = null;
    if (t.net > 0) {
      const exp = d.addExpense({ date, category: 'salaries', amount: t.net, description: `Salaries for ${monthLabel(input.month)} (${lines.length} staff)`, paidVia: input.method || 'Cash', truckId: null, dispatchId: null, referenceId: id });
      expenseId = exp.id;
    }
    const run: SalaryRun = { id, month: input.month, date, method: input.method || 'Cash', lines, totalGross: t.gross, totalAdvance: t.advance, totalNet: t.net, expenseId, createdAt: today, createdBy: who };
    setSalaryRuns((prev) => [run, ...prev]);
    d.logAuditEvent('Salaries Paid', `${monthLabel(input.month)}: ${formatCurrency(t.net)} paid (${formatCurrency(t.advance)} advances recovered).`, 'info');
    return { success: true, message: `Salaries for ${monthLabel(input.month)} paid: ${formatCurrency(t.net)}${t.advance ? ` (${formatCurrency(t.advance)} advances recovered)` : ''}.`, run };
  };

  const undoSalaryRun: FinanceApi['undoSalaryRun'] = (id) => {
    if (!canCash() || !canRemove()) return NO('undo salaries');
    const r = salaryRuns.find((x) => x.id === id);
    if (!r) return fail('Salary sheet not found.');
    const closed = booksLockedFor(d.settings, r.date);
    if (closed) return fail(closed);
    dropExpense(r.expenseId);
    setSalaryRuns((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('salary_runs', [id]);
    d.logAuditEvent('Salaries Undone', `${monthLabel(r.month)}: ${formatCurrency(r.totalNet)}.`, 'danger');
    return { success: true, message: `Salary sheet for ${monthLabel(r.month)} undone.` };
  };

  // ---------------------------------------------------------------------------
  // Budgets
  // ---------------------------------------------------------------------------
  const budgetable = (code: string) => d.accounts.find((a) => a.code === code && (a.type === 'income' || a.type === 'expense'));
  const setBudget: FinanceApi['setBudget'] = (month, accountCode, amount) => {
    if (!canBooks()) return NO('set budgets');
    if (!isMonth(month)) return fail('Pick a month.');
    if (!budgetable(accountCode)) return fail('Budgets are for income and expense accounts.');
    const value = round2(Number(amount) || 0);
    if (value < 0) return fail('A budget cannot be negative.');
    const id = `bud-${month}-${accountCode}`;
    if (value === 0) {
      if (budgets.some((b) => b.id === id)) {
        setBudgets((prev) => prev.filter((b) => b.id !== id));
        d.removeRemote('budgets', [id]);
      }
      return { success: true, message: 'Budget cleared.' };
    }
    setBudgets((prev) => [...prev.filter((b) => b.id !== id), { id, month, accountCode, amount: value }]);
    return { success: true, message: 'Budget saved.' };
  };

  const copyBudget: FinanceApi['copyBudget'] = (fromMonth, toMonths) => {
    if (!canBooks()) return NO('set budgets');
    const src = budgets.filter((b) => b.month === fromMonth);
    if (src.length === 0) return fail(`There is no budget for ${monthLabel(fromMonth)} to copy.`);
    const targets = toMonths.filter((m) => isMonth(m) && m !== fromMonth);
    const removed = budgets.filter((b) => targets.includes(b.month)).map((b) => b.id);
    const added = targets.flatMap((m) => src.map((b) => ({ id: `bud-${m}-${b.accountCode}`, month: m, accountCode: b.accountCode, amount: b.amount })));
    setBudgets((prev) => [...prev.filter((b) => !targets.includes(b.month)), ...added]);
    const gone = removed.filter((id) => !added.some((a) => a.id === id));
    if (gone.length) d.removeRemote('budgets', gone);
    return { success: true, message: `Budget copied to ${targets.length} month${targets.length === 1 ? '' : 's'}.` };
  };

  // ---------------------------------------------------------------------------
  // Cost centres
  // ---------------------------------------------------------------------------
  const addCostCentre: FinanceApi['addCostCentre'] = (input) => {
    if (!canBooks()) return NO('manage cost centres');
    const name = (input.name || '').trim();
    if (!name) return fail('Give the cost centre a name (e.g. Main shop, Mardan branch, Shehzore truck).');
    if (costCentres.some((c) => c.name.toLowerCase() === name.toLowerCase())) return fail('A cost centre with this name already exists.');
    const centre: CostCentre = { id: d.uid('cc'), name, kind: input.kind || 'branch', active: true, createdAt: today };
    setCostCentres((prev) => [...prev, centre]);
    d.logAuditEvent('Cost Centre Added', `${name} (${centre.kind})`, 'info');
    return { success: true, message: `${name} added.`, centre };
  };
  const updateCostCentre: FinanceApi['updateCostCentre'] = (id, patch) => {
    if (!canBooks()) return NO('manage cost centres');
    if (!costCentres.some((c) => c.id === id)) return fail('Cost centre not found.');
    if (patch.name != null) {
      const name = patch.name.trim();
      if (!name) return fail('Give the cost centre a name.');
      if (costCentres.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) return fail('A cost centre with this name already exists.');
    }
    setCostCentres((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, name: patch.name != null ? patch.name.trim() : c.name } : c)));
    return { success: true, message: 'Saved.' };
  };
  const deleteCostCentre: FinanceApi['deleteCostCentre'] = (id) => {
    if (!canBooks() || !canRemove()) return NO('delete cost centres');
    const c = costCentres.find((x) => x.id === id);
    if (!c) return fail('Cost centre not found.');
    if (d.centreInUse(id) || fixedAssets.some((a) => a.costCentreId === id)) return fail(`${c.name} is used on bills, expenses, journals or assets. Mark it inactive instead.`);
    setCostCentres((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('cost_centres', [id]);
    return { success: true, message: `${c.name} deleted.` };
  };

  // ---------------------------------------------------------------------------
  // Year-end close
  // ---------------------------------------------------------------------------
  const financeJournal = () => buildFinanceJournal({ settings: d.settings, fixedAssets, depreciationRuns, salaryRuns });
  const fullJournal = () => [...d.getBaseJournal(), ...financeJournal()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const closeYear: FinanceApi['closeYear'] = (input) => {
    if (!canBooks() || !d.can('admin_screen')) return fail('Only an admin can close the financial year.');
    if (!isDate(input.fyStartDate)) return fail('Pick the financial year.');
    const fy = financialYearOf(input.fyStartDate, fyStartOf(d.settings));
    if (fy.end >= today) return fail(`${fy.label} has not ended yet (it ends on ${formatDate(fy.end)}).`);
    if (yearCloses.some((c) => c.label === fy.label || c.end === fy.end)) return fail(`${fy.label} is already closed.`);
    const last = latestClose(yearCloses);
    if (last && last.end > fy.end) return fail(`A later year (${last.label}) is already closed.`);
    const toAccount = input.toAccount === ACC.CAPITAL ? ACC.CAPITAL : ACC.RETAINED_EARNINGS;
    const journal = fullJournal();
    const tb = trialBalance(journal, d.accounts, fy.end);
    if (!tb.balanced) return fail(`The trial balance at ${formatDate(fy.end)} is out by ${formatCurrency(Math.abs(tb.difference))}. Fix that before closing the year.`);
    const { lines, profit } = closingEntry(journal, fy.end, d.accounts, toAccount);
    const journalId = d.uid('je');
    if (lines.length >= 2) {
      const entry: JournalEntry = {
        id: journalId,
        date: fy.end,
        ref: `YE-${fy.label.replace(/^FY\s*/, '')}`,
        memo: `Year-end close ${fy.label}: ${profit >= 0 ? 'profit' : 'loss'} carried to ${toAccount === ACC.CAPITAL ? "owner's capital" : 'retained earnings'}`,
        lines,
        source: 'manual',
        sourceType: 'year_close',
        closing: true,
        createdAt: new Date().toISOString(),
        createdBy: who,
      };
      d.setManualJournals((prev) => [entry, ...prev]);
    }
    const previousLock = d.settings.booksLockedUntil || null;
    const close: YearClose = { id: d.uid('yc'), label: fy.label, start: fy.start, end: fy.end, profit, toAccount, journalId, previousLock, createdAt: today, createdBy: who };
    setYearCloses((prev) => [close, ...prev]);
    if (!previousLock || previousLock < fy.end) d.updateSettings({ booksLockedUntil: fy.end });
    d.logAuditEvent('Financial Year Closed', `${fy.label}: ${profit >= 0 ? 'profit' : 'loss'} ${formatCurrency(Math.abs(profit))} carried to ${toAccount}; books locked up to ${formatDate(fy.end)}.`, 'warning');
    return { success: true, message: `${fy.label} closed. ${profit >= 0 ? 'Profit' : 'Loss'} of ${formatCurrency(Math.abs(profit))} carried to ${toAccount === ACC.CAPITAL ? "owner's capital" : 'retained earnings'}, and the books are locked up to ${formatDate(fy.end)}.`, close };
  };

  const undoYearClose: FinanceApi['undoYearClose'] = () => {
    if (!canBooks() || !d.can('admin_screen')) return fail('Only an admin can reopen a closed year.');
    const last = latestClose(yearCloses);
    if (!last) return fail('No year has been closed.');
    d.setManualJournals((prev) => prev.filter((j) => j.id !== last.journalId));
    d.removeRemote('journal_entries', [last.journalId]);
    setYearCloses((prev) => prev.filter((c) => c.id !== last.id));
    d.removeRemote('year_closes', [last.id]);
    d.updateSettings({ booksLockedUntil: last.previousLock || undefined });
    d.logAuditEvent('Financial Year Reopened', `${last.label}: closing entry removed; lock back to ${last.previousLock ? formatDate(last.previousLock) : 'none'}.`, 'danger');
    return { success: true, message: `${last.label} reopened. The closing entry was removed${last.previousLock ? ` and the books are locked up to ${formatDate(last.previousLock)} again` : ' and the books are unlocked'}.` };
  };

  // ---------------------------------------------------------------------------
  const linked = useMemo(() => {
    const ids = new Set<string>();
    fixedAssets.forEach((a) => {
      if (a.purchaseEntryId) ids.add(a.purchaseEntryId);
      if (a.disposalEntryId) ids.add(a.disposalEntryId);
      (a.payments || []).forEach((p) => ids.add(p.cashEntryId));
    });
    staffAdvances.forEach((a) => ids.add(a.cashEntryId));
    salaryRuns.forEach((r) => { if (r.expenseId) ids.add(r.expenseId); });
    return ids;
  }, [fixedAssets, staffAdvances, salaryRuns]);

  const hydrate = (data: Partial<Record<FinanceTable, unknown>>, opts: { keepLocalIfEmpty?: boolean } = {}) => {
    const take = <T,>(v: unknown, set: React.Dispatch<React.SetStateAction<T[]>>) => {
      if (!Array.isArray(v)) return;
      if (opts.keepLocalIfEmpty && v.length === 0) return;
      set(v as T[]);
    };
    take<FixedAsset>(data.fixed_assets, setFixedAssets);
    take<DepreciationRun>(data.depreciation_runs, setDepreciationRuns);
    take<StaffMember>(data.staff, setStaff);
    take<StaffAdvance>(data.staff_advances, setStaffAdvances);
    take<SalaryRun>(data.salary_runs, setSalaryRuns);
    take<Budget>(data.budgets, setBudgets);
    take<CostCentre>(data.cost_centres, setCostCentres);
    take<YearClose>(data.year_closes, setYearCloses);
  };
  const backupData = () => ({ fixedAssets, depreciationRuns, staff, staffAdvances, salaryRuns, budgets, costCentres, yearCloses });
  /** Restore from a backup file (camelCase keys, as written by backupData). */
  const restoreBackup = (data: any) =>
    hydrate({ fixed_assets: data?.fixedAssets ?? [], depreciation_runs: data?.depreciationRuns ?? [], staff: data?.staff ?? [], staff_advances: data?.staffAdvances ?? [], salary_runs: data?.salaryRuns ?? [], budgets: data?.budgets ?? [], cost_centres: data?.costCentres ?? [], year_closes: data?.yearCloses ?? [] });
  const purgeSetters: Record<FinanceTable, () => void> = {
    fixed_assets: () => setFixedAssets([]),
    depreciation_runs: () => setDepreciationRuns([]),
    staff: () => setStaff([]),
    staff_advances: () => setStaffAdvances([]),
    salary_runs: () => setSalaryRuns([]),
    budgets: () => setBudgets([]),
    cost_centres: () => setCostCentres([]),
    year_closes: () => setYearCloses([]),
  };
  const reset = () => {
    Object.values(purgeSetters).forEach((f) => f());
    Object.values(FINANCE_STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  };

  const api: FinanceApi = {
    fixedAssets,
    depreciationRuns,
    staff,
    staffAdvances,
    salaryRuns,
    budgets,
    costCentres,
    yearCloses,
    addFixedAsset,
    updateFixedAsset,
    deleteFixedAsset,
    payAssetCreditor,
    runDepreciation,
    undoDepreciationRun,
    disposeFixedAsset,
    undoDisposal,
    addStaff,
    updateStaff,
    deleteStaff,
    giveStaffAdvance,
    deleteStaffAdvance,
    paySalaries,
    undoSalaryRun,
    setBudget,
    copyBudget,
    addCostCentre,
    updateCostCentre,
    deleteCostCentre,
    closeYear,
    undoYearClose,
    isFinanceRecord: (id) => linked.has(id),
  };
  return { api, hydrate, restoreBackup, backupData, reset, purgeSetters };
};

/** Months of the financial year holding `date` (for budgets). */
export const fyMonths = (date: string, fyStart: string) => {
  const fy = financialYearOf(date, fyStart);
  return monthsBetween(monthOf(fy.start), monthOf(fy.end));
};
