/**
 * Finance records that post to the books: fixed assets & depreciation, staff salaries & advances,
 * financial years and the year-end close.
 *
 * Money that actually moves is always an ordinary cash-book entry or expense row (so the Money
 * screen, the daily sheet and bank reconciliation see it); `buildJournal` in accounting.ts posts
 * those. What is posted here (`buildFinanceJournal`) is only what does not move money.
 *
 * Posting rules
 *  Fixed assets
 *   - bought, paid in cash / bank (cash entry out, accountCode 1500)   Dr Fixed assets 1500      Cr Cash 1000 / Bank 1010
 *   - bought on credit (here)                                           Dr Fixed assets 1500      Cr Creditors for fixed assets 2060
 *   - paying that creditor later (cash entry out, accountCode 2060)    Dr 2060                    Cr Cash / Bank
 *   - already owned when the books started (here)                       Dr Fixed assets 1500      Cr Opening balance equity 3900
 *       … with depreciation charged before the books started (here)     Dr Opening balance equity  Cr Accumulated depreciation 1510
 *   - Run depreciation, per asset per run (here)                        Dr Depreciation 6130       Cr Accumulated depreciation 1510
 *       A month is charged at most once per asset (idempotent): runs store the months they charged.
 *       Straight line: (cost − residual) ÷ (life × 12) a month. Reducing balance: book value × rate ÷ 12,
 *       never below the residual value. Charged from the month of purchase to the month before disposal.
 *   - sold / scrapped: proceeds (cash entry in, accountCode 1500)       Dr Cash / Bank             Cr Fixed assets 1500
 *       and the disposal (here)                                         Dr Accumulated depreciation (all of it)
 *                                                                       Cr Fixed assets 1500 (cost − proceeds)
 *                                                                       Cr Gain on sale 4910 / Dr Loss on sale 6960 (proceeds − book value)
 *       so the asset leaves both 1500 and 1510 at nil.
 *  Staff
 *   - advance given (cash entry out, accountCode 1160)                  Dr Staff advances 1160     Cr Cash / Bank
 *   - salaries paid: the net handed over (expense row, category salaries) Dr Salaries 6090         Cr Cash / Bank
 *       and advances recovered from salaries (here)                     Dr Salaries 6090           Cr Staff advances 1160
 *       so Salaries carries the full salary + bonus − deductions.
 *  Year-end close: a manual journal flagged `closing` (see closingEntry) that empties every income and
 *  expense account into Retained earnings 3200 (or Owner's capital 3000). P&L reports leave it out.
 */
import { AppSettings, DepreciationLine, DepreciationRun, FixedAsset, SalaryLine, SalaryRun, StaffAdvance, StaffMember, YearClose } from '../types';
import { ACC, Account, EntryBuilder, JournalEntry, JournalLine, accountTotals } from './accounting';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 0.005;

// ---------------------------------------------------------------------------
// Dates: months and financial years
// ---------------------------------------------------------------------------
export const isMonth = (m?: string | null) => Boolean(m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m));
export const monthOf = (date: string) => date.slice(0, 7);
export const addMonths = (month: string, n: number): string => {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};
export const monthStart = (month: string) => `${month}-01`;
export const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
};
/** Months from `from` to `to` inclusive (YYYY-MM). */
export const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 1200; m = addMonths(m, 1)) out.push(m);
  return out;
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (month: string) => (isMonth(month) ? `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` : month);

export const DEFAULT_FY_START = '07-01';
/** "MM-DD" the financial year starts on (1 July by default, as in Pakistan). */
export const fyStartOf = (settings: Pick<AppSettings, 'financialYearStart'>): string =>
  /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(settings.financialYearStart || '') ? settings.financialYearStart! : DEFAULT_FY_START;

export interface FinancialYear {
  /** "FY 2025-26" (or "FY 2026" when the year starts on 1 January). */
  label: string;
  start: string;
  end: string;
}

const dayBefore = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** The financial year a date falls in. */
export const financialYearOf = (date: string, fyStart = DEFAULT_FY_START): FinancialYear => {
  const y = Number(date.slice(0, 4));
  const startYear = date.slice(5) >= fyStart ? y : y - 1;
  const start = `${startYear}-${fyStart}`;
  const end = dayBefore(`${startYear + 1}-${fyStart}`);
  const label = fyStart === '01-01' ? `FY ${startYear}` : `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  return { label, start, end };
};

/** Financial years from the one holding `from` to the one holding `to`, newest first. */
export const financialYearsBetween = (from: string, to: string, fyStart = DEFAULT_FY_START): FinancialYear[] => {
  const out: FinancialYear[] = [];
  let fy = financialYearOf(to, fyStart);
  const first = financialYearOf(from < to ? from : to, fyStart);
  while (fy.start >= first.start && out.length < 100) {
    out.push(fy);
    fy = financialYearOf(dayBefore(fy.start), fyStart);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Fixed assets and depreciation
// ---------------------------------------------------------------------------
/** Reducing balance rate in % a year: what was typed, else double the straight-line rate. */
export const reducingRate = (a: Pick<FixedAsset, 'ratePct' | 'usefulLifeYears'>) =>
  a.ratePct && a.ratePct > 0 ? a.ratePct : round2(200 / Math.max(1, Number(a.usefulLifeYears) || 1));

/** Months already charged for an asset, by any run. */
export const chargedMonths = (assetId: string, runs: DepreciationRun[]): Set<string> => {
  const set = new Set<string>();
  runs.forEach((r) => r.lines.forEach((l) => { if (l.assetId === assetId) l.months.forEach((m) => set.add(m)); }));
  return set;
};

/** Depreciation charged on an asset up to a date (runs dated on or before it), including any opening amount. */
export const accumulatedDepreciation = (asset: FixedAsset, runs: DepreciationRun[], asOf?: string): number =>
  round2(
    (Number(asset.openingAccumulated) || 0) +
      runs.filter((r) => !asOf || r.date <= asOf).reduce((a, r) => a + r.lines.filter((l) => l.assetId === asset.id).reduce((x, l) => x + l.amount, 0), 0)
  );

/** One month's charge given the book value at the start of that month. */
export const monthlyCharge = (asset: FixedAsset, bookValue: number): number => {
  const residual = Number(asset.residualValue) || 0;
  const room = round2(bookValue - residual);
  if (room <= 0) return 0;
  const raw =
    asset.method === 'reducing_balance'
      ? (bookValue * reducingRate(asset)) / 100 / 12
      : (Math.max(0, (Number(asset.cost) || 0) - residual)) / (Math.max(1, Number(asset.usefulLifeYears) || 1) * 12);
  return round2(Math.min(raw, room));
};

/** Does the asset depreciate in this month? (From the month it was bought to the month before it was sold.) */
export const depreciatesIn = (asset: FixedAsset, month: string) =>
  month >= monthOf(asset.purchaseDate) && !(asset.disposalDate && month >= monthOf(asset.disposalDate));

/**
 * What "Run depreciation" would charge for these months: for each asset, each month not charged yet.
 * Months after `today`'s month are never charged.
 */
export const planDepreciation = (assets: FixedAsset[], runs: DepreciationRun[], months: string[], today: string): DepreciationLine[] => {
  const cur = monthOf(today);
  const sorted = [...months].filter((m) => m <= cur).sort();
  const out: DepreciationLine[] = [];
  assets.forEach((asset) => {
    const done = chargedMonths(asset.id, runs);
    let book = round2((Number(asset.cost) || 0) - accumulatedDepreciation(asset, runs));
    const line: DepreciationLine = { assetId: asset.id, amount: 0, months: [] };
    sorted.forEach((m) => {
      if (done.has(m) || !depreciatesIn(asset, m)) return;
      const charge = monthlyCharge(asset, book);
      if (charge <= 0) return;
      book = round2(book - charge);
      line.amount = round2(line.amount + charge);
      line.months.push(m);
    });
    if (line.amount > 0) out.push(line);
  });
  return out;
};

export interface AssetRegisterRow {
  asset: FixedAsset;
  cost: number;
  accumulated: number;
  bookValue: number;
  /** Charge for one month at today's book value (0 once fully depreciated or sold). */
  monthly: number;
  disposed: boolean;
}

/** Asset register on a date: cost, depreciation to date and book value of every asset bought by then. */
export const assetRegister = (assets: FixedAsset[], runs: DepreciationRun[], asOf: string): { rows: AssetRegisterRow[]; totalCost: number; totalAccumulated: number; totalBookValue: number } => {
  const rows = assets
    .filter((a) => a.purchaseDate <= asOf)
    .sort((a, b) => (a.purchaseDate < b.purchaseDate ? -1 : a.purchaseDate > b.purchaseDate ? 1 : a.name.localeCompare(b.name)))
    .map((asset) => {
      const disposed = Boolean(asset.status === 'disposed' && asset.disposalDate && asset.disposalDate <= asOf);
      const accumulated = accumulatedDepreciation(asset, runs, asOf);
      const cost = round2(Number(asset.cost) || 0);
      const bookValue = disposed ? 0 : round2(cost - accumulated);
      return { asset, cost, accumulated, bookValue, monthly: disposed ? 0 : monthlyCharge(asset, bookValue), disposed };
    });
  const live = rows.filter((r) => !r.disposed);
  return {
    rows,
    totalCost: round2(live.reduce((a, r) => a + r.cost, 0)),
    totalAccumulated: round2(live.reduce((a, r) => a + r.accumulated, 0)),
    totalBookValue: round2(live.reduce((a, r) => a + r.bookValue, 0)),
  };
};

/** Gain (+) or loss (−) when an asset is sold for `proceeds`, given its depreciation so far. */
export const disposalResult = (asset: FixedAsset, runs: DepreciationRun[], proceeds: number) => {
  const accumulated = accumulatedDepreciation(asset, runs);
  const bookValue = round2((Number(asset.cost) || 0) - accumulated);
  return { accumulated, bookValue, gain: round2(proceeds - bookValue) };
};

// ---------------------------------------------------------------------------
// Staff: advances and salary sheets
// ---------------------------------------------------------------------------
/** What a staff member still owes from advances (optionally up to a date). */
export const advanceBalance = (staffId: string, advances: StaffAdvance[], runs: SalaryRun[], asOf?: string): number =>
  round2(
    advances.filter((a) => a.staffId === staffId && (!asOf || a.date <= asOf)).reduce((s, a) => s + a.amount, 0) -
      runs.filter((r) => !asOf || r.date <= asOf).reduce((s, r) => s + r.lines.filter((l) => l.staffId === staffId).reduce((x, l) => x + (l.advanceDeducted || 0), 0), 0)
  );

/** Work out a salary line: net = salary + bonus − deductions − advance recovered. */
export const salaryNet = (l: Pick<SalaryLine, 'salary' | 'bonus' | 'deductions' | 'advanceDeducted'>) =>
  round2((Number(l.salary) || 0) + (Number(l.bonus) || 0) - (Number(l.deductions) || 0) - (Number(l.advanceDeducted) || 0));

/**
 * Starting salary sheet for a month: every active staff member who had joined by the month end, full
 * salary, and their outstanding advance recovered (up to what the salary allows).
 */
export const salarySheetDraft = (staff: StaffMember[], advances: StaffAdvance[], runs: SalaryRun[], month: string): SalaryLine[] =>
  staff
    .filter((s) => s.active && (!s.joinDate || s.joinDate <= monthEnd(month)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const salary = round2(Number(s.monthlySalary) || 0);
      const owed = Math.max(0, advanceBalance(s.id, advances, runs));
      const advanceDeducted = round2(Math.min(owed, salary));
      const line: SalaryLine = { staffId: s.id, name: s.name, role: s.role, salary, bonus: 0, deductions: 0, advanceDeducted, net: 0 };
      return { ...line, net: salaryNet(line) };
    });

export const salaryTotals = (lines: SalaryLine[]) => {
  const gross = round2(lines.reduce((a, l) => a + (Number(l.salary) || 0) + (Number(l.bonus) || 0) - (Number(l.deductions) || 0), 0));
  const advance = round2(lines.reduce((a, l) => a + (Number(l.advanceDeducted) || 0), 0));
  return { gross, advance, net: round2(gross - advance) };
};

export interface StaffLedgerRow {
  date: string;
  text: string;
  /** Advance given (they owe more). */
  advance: number;
  /** Advance recovered from salary (they owe less). */
  recovered: number;
  /** Salary handed over that month (for information; not part of the balance). */
  salaryPaid: number;
  balance: number;
}

/** A staff member's account: advances, recoveries and salaries paid, with what they still owe. */
export const staffLedger = (staffId: string, advances: StaffAdvance[], runs: SalaryRun[]): StaffLedgerRow[] => {
  type Ev = { date: string; order: number; text: string; advance: number; recovered: number; salaryPaid: number };
  const evs: Ev[] = [];
  advances.filter((a) => a.staffId === staffId).forEach((a) => evs.push({ date: a.date, order: 0, text: `Advance given${a.note ? ` — ${a.note}` : ''} (${a.method})`, advance: a.amount, recovered: 0, salaryPaid: 0 }));
  runs.forEach((r) =>
    r.lines.filter((l) => l.staffId === staffId).forEach((l) => {
      const extra = [l.bonus ? `bonus ${l.bonus}` : '', l.deductions ? `deductions ${l.deductions}` : ''].filter(Boolean).join(', ');
      evs.push({ date: r.date, order: 1, text: `Salary for ${monthLabel(r.month)}${extra ? ` (${extra})` : ''}`, advance: 0, recovered: l.advanceDeducted || 0, salaryPaid: l.net });
    })
  );
  evs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  let bal = 0;
  return evs.map((e) => {
    bal = round2(bal + e.advance - e.recovered);
    return { date: e.date, text: e.text, advance: e.advance, recovered: e.recovered, salaryPaid: e.salaryPaid, balance: bal };
  });
};

// ---------------------------------------------------------------------------
// The journal entries these records post
// ---------------------------------------------------------------------------
export interface FinanceJournalSources {
  settings: Pick<AppSettings, 'cashOpeningDate'>;
  fixedAssets?: FixedAsset[];
  depreciationRuns?: DepreciationRun[];
  salaryRuns?: SalaryRun[];
}

export const buildFinanceJournal = (src: FinanceJournalSources): JournalEntry[] => {
  const { fixedAssets = [], depreciationRuns = [], salaryRuns = [] } = src;
  const out: JournalEntry[] = [];
  const push = (e: Omit<JournalEntry, 'lines' | 'source'>, b: EntryBuilder) => {
    const lines = b.build();
    if (lines.length >= 2) out.push({ ...e, lines, source: 'auto' });
  };
  const byId = new Map(fixedAssets.map((a) => [a.id, a]));

  fixedAssets.forEach((a) => {
    const cost = round2(Number(a.cost) || 0);
    const centre = a.costCentreId ? { costCentreId: a.costCentreId } : {};
    if (a.paidFrom === 'credit') {
      push({ id: `auto-fa-buy-${a.id}`, date: a.purchaseDate, ref: 'ASSET', memo: `Fixed asset bought on credit: ${a.name}${a.vendor ? ` (${a.vendor})` : ''}`, sourceType: 'asset_purchase', sourceId: a.id, ...centre }, new EntryBuilder().dr(ACC.FIXED_ASSETS, cost, a.name).cr(ACC.ASSET_CREDITORS, cost, a.vendor));
    } else if (a.paidFrom === 'owned') {
      push({ id: `auto-fa-open-${a.id}`, date: a.purchaseDate, ref: 'OPENING', memo: `Fixed asset already owned: ${a.name}`, sourceType: 'asset_opening', sourceId: a.id, ...centre }, new EntryBuilder().dr(ACC.FIXED_ASSETS, cost, a.name).cr(ACC.OPENING_EQUITY, cost));
      const opening = round2(Number(a.openingAccumulated) || 0);
      if (opening > 0) push({ id: `auto-fa-opendep-${a.id}`, date: a.purchaseDate, ref: 'OPENING', memo: `Depreciation charged before the books started: ${a.name}`, sourceType: 'asset_opening', sourceId: a.id, ...centre }, new EntryBuilder().dr(ACC.OPENING_EQUITY, opening).cr(ACC.ACCUM_DEPRECIATION, opening, a.name));
    }
    if (a.status === 'disposed' && a.disposalDate) {
      const proceeds = round2(Number(a.disposalProceeds) || 0);
      const accumulated = accumulatedDepreciation(a, depreciationRuns);
      const gain = round2(proceeds - (cost - accumulated));
      const b = new EntryBuilder().dr(ACC.ACCUM_DEPRECIATION, accumulated, a.name).cr(ACC.FIXED_ASSETS, cost - proceeds, a.name);
      if (gain > 0) b.cr(ACC.ASSET_SALE_GAIN, gain, a.name);
      else b.dr(ACC.ASSET_SALE_LOSS, -gain, a.name);
      push({ id: `auto-fa-disp-${a.id}`, date: a.disposalDate, ref: 'ASSET SALE', memo: `${proceeds > 0 ? 'Sold' : 'Written off'}: ${a.name}${proceeds > 0 ? ` for ${proceeds}` : ''}`, sourceType: 'asset_disposal', sourceId: a.id, ...centre }, b);
    }
  });

  depreciationRuns.forEach((r) => {
    r.lines.forEach((l) => {
      const a = byId.get(l.assetId);
      const name = a?.name || 'Fixed asset';
      push(
        { id: `auto-dep-${r.id}-${l.assetId}`, date: r.date, ref: 'DEPRECIATION', memo: `Depreciation ${r.period} — ${name}`, sourceType: 'depreciation', sourceId: r.id, ...(a?.costCentreId ? { costCentreId: a.costCentreId } : {}) },
        new EntryBuilder().dr(ACC.DEPRECIATION, l.amount, name).cr(ACC.ACCUM_DEPRECIATION, l.amount, name)
      );
    });
  });

  salaryRuns.forEach((r) => {
    const adv = round2(r.lines.reduce((a, l) => a + (Number(l.advanceDeducted) || 0), 0));
    if (adv <= 0) return;
    push({ id: `auto-sal-adv-${r.id}`, date: r.date, ref: 'SALARY', memo: `Advances recovered from salaries, ${monthLabel(r.month)}`, sourceType: 'salary_advance_recovery', sourceId: r.id }, new EntryBuilder().dr('6090', adv).cr(ACC.STAFF_ADVANCES, adv));
  });
  return out;
};

// ---------------------------------------------------------------------------
// Year-end close
// ---------------------------------------------------------------------------
/**
 * The closing entry for a year: every income and expense account's balance up to the year end
 * (anything not closed before) reversed, the difference (the profit) to the equity account.
 */
export const closingEntry = (journal: JournalEntry[], end: string, accounts: Account[], toAccount: string = ACC.RETAINED_EARNINGS): { lines: JournalLine[]; profit: number } => {
  const totals = accountTotals(journal, { to: end });
  const type = new Map(accounts.map((a) => [a.code, a.type]));
  const typeOf = (code: string) => type.get(code) || (code.startsWith('4') ? 'income' : code.startsWith('5') || code.startsWith('6') ? 'expense' : 'other');
  const b = new EntryBuilder();
  let profit = 0;
  totals.forEach((t, code) => {
    const kind = typeOf(code);
    if (kind !== 'income' && kind !== 'expense') return;
    if (Math.abs(t.net) < EPS) return;
    // Debit balance → credit it away, and the reverse.
    if (t.net > 0) b.cr(code, t.net);
    else b.dr(code, -t.net);
    profit = round2(profit - t.net);
  });
  if (profit > 0) b.cr(toAccount, profit, 'Profit for the year');
  else if (profit < 0) b.dr(toAccount, -profit, 'Loss for the year');
  return { lines: b.build(), profit };
};

/** The latest year close (the only one that can be undone). */
export const latestClose = (closes: YearClose[]) => [...closes].sort((a, b) => (a.end < b.end ? 1 : -1))[0];
