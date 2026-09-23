import { AppSettings, BankMatchConfidence, BankStatementLine, isCashMethod } from '../types';
import { CashMovement, accountBalancesOn } from './finance';

/**
 * Bank reconciliation: compare what the bank statement says with the bank side of the cash book.
 * Everything here is pure so it can be unit tested without the app.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Bank-side movements
// ---------------------------------------------------------------------------

/** Movements that went through the bank (Bank Transfer, Cheque, Easypaisa / JazzCash, Card…). */
export const bankMovements = (movements: CashMovement[]): CashMovement[] => movements.filter((m) => !isCashMethod(m.method));

/** + money into the bank, − money out, the same sign convention as a bank statement. */
export const signedAmount = (m: Pick<CashMovement, 'direction' | 'amount'>) => (m.direction === 'in' ? m.amount : -m.amount);

// ---------------------------------------------------------------------------
// Parsing a bank statement
// ---------------------------------------------------------------------------

const isValidDate = (y: number, m: number, d: number) => {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Read a statement date. Accepts yyyy-mm-dd, yyyy/mm/dd, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy,
 * dd/mm/yy and "05 Sep 2026" / "05-Sep-26". Day comes before month (Pakistani banks). Returns ISO or null.
 */
export const parseStatementDate = (raw: string): string | null => {
  const s = (raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?: .*)?$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return isValidDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ,]+(\d{2}|\d{4})$/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    const d = Number(m[1]);
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return mo > 0 && isValidDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
};

/**
 * Read a money amount: "1,250.50", "Rs. 1,250", "(500)" or "-500" (out), "500 DR" (out), "500 CR" (in),
 * and the decimal-comma forms "1.250,50" / "1250,5" / "1.250.000".
 * Returns null for blank / unreadable cells.
 */
export const parseAmount = (raw: string): number | null => {
  let s = (raw || '').trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\bdr\.?$/i.test(s)) {
    sign = -sign;
    s = s.replace(/\bdr\.?$/i, '');
  } else if (/\bcr\.?$/i.test(s)) {
    s = s.replace(/\bcr\.?$/i, '');
  }
  s = s.replace(/pkr|rs\.?/gi, '').replace(/\s/g, '');
  // Decimal comma (files saved by Excel set to a European format, usually ";"-separated): "27.500,00" or "1250,5".
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot && (lastDot >= 0 || /^[-+(]?\d+,\d{1,2}[-)]?$/.test(s))) s = s.replace(/\./g, '').replace(',', '.');
  // Thousands dots with no decimals: "1.250.000".
  else if (lastComma < 0 && /^[-+]?\d{1,3}(\.\d{3}){2,}-?$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(/,/g, '');
  if (s.endsWith('-')) {
    sign = -sign;
    s = s.slice(0, -1);
  }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) {
    sign = -sign;
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? round2(sign * n) : null;
};

/** Which column holds what. -1 = not in the file. Use either `amount`, or `debit` and/or `credit`. */
export interface StatementMapping {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  reference: number;
}

const find = (headers: string[], patterns: RegExp[], taken: number[] = []) => {
  const h = headers.map((x) => x.trim().toLowerCase());
  for (const p of patterns) {
    const i = h.findIndex((x, idx) => !taken.includes(idx) && p.test(x));
    if (i >= 0) return i;
  }
  return -1;
};

/** Guess the column mapping from a header row. */
export const guessMapping = (headers: string[]): StatementMapping => {
  const date = find(headers, [/^(txn |transaction |value |posting |book )?date$/, /date/]);
  const debit = find(headers, [/^debit/, /withdraw/, /^dr\.?$/, /paid out|money out|^out$/], [date]);
  const credit = find(headers, [/^credit/, /deposit/, /^cr\.?$/, /paid in|money in|^in$/], [date, debit]);
  const amount = find(headers, [/^amount/, /amount/, /^value$/], [date, debit, credit]);
  const reference = find(headers, [/^ref/, /cheque|chq|instrument|reference/], [date, debit, credit, amount]);
  const description = find(headers, [/desc/, /narration/, /particular/, /detail/, /remark/, /memo/, /transaction/], [date, debit, credit, amount, reference]);
  return { date, description, amount, debit, credit, reference };
};

/** A mapping is usable when it has a date column and either an amount column or a debit/credit column. */
export const mappingIsUsable = (m: StatementMapping) => m.date >= 0 && (m.amount >= 0 || m.debit >= 0 || m.credit >= 0);

/** Does the first row look like a header (no parsable date in the date column)? */
export const looksLikeHeader = (row: string[]) => !row.some((c) => parseStatementDate(c) !== null);

export interface ParsedStatementLine {
  date: string;
  description: string;
  amount: number;
  reference?: string;
}

/**
 * Turn CSV rows into statement lines using a mapping. Debit columns are money out (−),
 * credit columns money in (+). Rows with no amount (e.g. opening/closing balance rows) are skipped.
 */
export const statementLinesFromRows = (rows: string[][], mapping: StatementMapping): { lines: ParsedStatementLine[]; errors: string[] } => {
  const lines: ParsedStatementLine[] = [];
  const errors: string[] = [];
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  rows.forEach((r, idx) => {
    const rowNo = idx + 1;
    const rawDate = cell(r, mapping.date);
    const date = parseStatementDate(rawDate);
    let amount: number | null = null;
    if (mapping.amount >= 0) amount = parseAmount(cell(r, mapping.amount));
    else {
      const dr = parseAmount(cell(r, mapping.debit));
      const cr = parseAmount(cell(r, mapping.credit));
      if (dr !== null || cr !== null) amount = round2((cr ? Math.abs(cr) : 0) - (dr ? Math.abs(dr) : 0));
    }
    if (!date) {
      if (rawDate || amount) errors.push(`Row ${rowNo}: can't read the date "${rawDate}"`);
      return;
    }
    if (amount === null || amount === 0) return;
    const reference = cell(r, mapping.reference);
    lines.push({ date, description: cell(r, mapping.description) || 'Bank entry', amount, reference: reference || undefined });
  });
  return { lines, errors };
};

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export const daysApart = (a: string, b: string) =>
  Math.round(Math.abs(new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / 86400000);

export const confidenceFor = (days: number): BankMatchConfidence => (days === 0 ? 'exact' : days <= 1 ? 'high' : 'medium');

export const CONFIDENCE_LABEL: Record<BankMatchConfidence, string> = {
  exact: 'Sure — same day',
  high: 'Very likely — 1 day apart',
  medium: 'Likely — 2–3 days apart, please check',
  manual: 'Matched by you',
};

export interface MatchProposal {
  lineId: string;
  movementId: string;
  daysApart: number;
  confidence: BankMatchConfidence;
}

/**
 * Propose matches for unmatched statement lines against bank movements:
 * same amount and sign (to the paisa), dates within ±windowDays, each line and each movement used once.
 * Greedy: the closest dates are paired first; ties go to the earliest statement line.
 * Movements already matched to another line are never proposed again.
 */
/** A matched line whose book records were all deleted since is really unmatched again. */
export const isLiveMatch = (l: BankStatementLine, movementIds: Set<string>) =>
  l.status === 'matched' && l.matchedMovementIds.length > 0 && l.matchedMovementIds.some((id) => movementIds.has(id));

export const autoMatch = (lines: BankStatementLine[], movements: CashMovement[], windowDays = 3): MatchProposal[] => {
  const ids = new Set(movements.map((m) => m.id));
  const used = new Set(lines.flatMap((l) => (isLiveMatch(l, ids) ? l.matchedMovementIds : [])));
  const open = lines.filter((l) => l.status === 'unmatched' || (l.status === 'matched' && !isLiveMatch(l, ids)));
  const pool = bankMovements(movements).filter((m) => !used.has(m.id));
  const candidates: MatchProposal[] = [];
  open.forEach((l) => {
    pool.forEach((m) => {
      if (Math.abs(signedAmount(m) - l.amount) >= 0.005) return;
      const d = daysApart(l.date, m.date);
      if (d > windowDays) return;
      candidates.push({ lineId: l.id, movementId: m.id, daysApart: d, confidence: confidenceFor(d) });
    });
  });
  const lineOrder = new Map(open.map((l, i) => [l.id, `${l.date}#${String(i).padStart(6, '0')}`]));
  candidates.sort((a, b) => a.daysApart - b.daysApart || (lineOrder.get(a.lineId)! < lineOrder.get(b.lineId)! ? -1 : lineOrder.get(a.lineId)! > lineOrder.get(b.lineId)! ? 1 : 0));
  const takenLines = new Set<string>();
  const takenMoves = new Set<string>();
  const out: MatchProposal[] = [];
  candidates.forEach((c) => {
    if (takenLines.has(c.lineId) || takenMoves.has(c.movementId)) return;
    takenLines.add(c.lineId);
    takenMoves.add(c.movementId);
    out.push(c);
  });
  return out;
};

/** Book movements a user could match to a statement line by hand, best guesses first. */
export const manualCandidates = (line: BankStatementLine, lines: BankStatementLine[], movements: CashMovement[]): CashMovement[] => {
  const used = new Set(lines.flatMap((l) => (l.id !== line.id && l.status === 'matched' ? l.matchedMovementIds : [])));
  return bankMovements(movements)
    .filter((m) => !used.has(m.id) && Math.sign(signedAmount(m)) === Math.sign(line.amount))
    .sort((a, b) => Math.abs(signedAmount(a) - line.amount) - Math.abs(signedAmount(b) - line.amount) || daysApart(a.date, line.date) - daysApart(b.date, line.date));
};

// ---------------------------------------------------------------------------
// Reconciliation summary
// ---------------------------------------------------------------------------

export interface ReconciliationSummary {
  statementDate: string;
  closingBalance: number;
  /** Bank balance according to the app's books on the statement date. */
  bookBalance: number;
  /** In the books but not yet on the statement. */
  outstandingDeposits: CashMovement[];
  outstandingPayments: CashMovement[];
  outstandingDepositsTotal: number;
  outstandingPaymentsTotal: number;
  /** On the statement but not in the books (unmatched, not ignored). */
  unrecorded: BankStatementLine[];
  unrecordedTotal: number;
  /** What the statement should show if the books are right: book − deposits in transit + payments not yet cleared + unrecorded items. */
  expectedStatementBalance: number;
  /** Statement closing balance − expected. 0 = reconciled. */
  difference: number;
  reconciled: boolean;
  clearedCount: number;
}

/**
 * Movement ids that are cleared AS OF the statement date: ticked by the user, or matched to a
 * statement line dated on/before the statement date. A cheque written on the 29th that reaches
 * the bank on the 2nd is still outstanding at month-end.
 */
export const clearedIdSet = (lines: BankStatementLine[], clearedMovementIds: string[], statementDate?: string) =>
  new Set([
    ...clearedMovementIds,
    ...lines.filter((l) => l.status === 'matched' && (!statementDate || l.date <= statementDate)).flatMap((l) => l.matchedMovementIds),
  ]);

export const reconciliationSummary = (input: {
  movements: CashMovement[];
  settings: AppSettings;
  lines: BankStatementLine[];
  statementDate: string;
  closingBalance: number;
  clearedMovementIds: string[];
}): ReconciliationSummary => {
  const { movements, settings, lines, statementDate, closingBalance } = input;
  const bookBalance = accountBalancesOn(movements, settings, statementDate).bank;
  const cleared = clearedIdSet(lines, input.clearedMovementIds, statementDate);
  const inBook = bankMovements(movements).filter((m) => m.date >= settings.cashOpeningDate && m.date <= statementDate);
  const byId = new Map(movements.map((m) => [m.id, m]));
  const ids = new Set(byId.keys());
  const outstanding = inBook.filter((m) => !cleared.has(m.id));
  const outstandingDeposits = outstanding.filter((m) => m.direction === 'in');
  const outstandingPayments = outstanding.filter((m) => m.direction === 'out');
  const outstandingDepositsTotal = round2(outstandingDeposits.reduce((a, m) => a + m.amount, 0));
  const outstandingPaymentsTotal = round2(outstandingPayments.reduce((a, m) => a + m.amount, 0));
  // On the statement by the statement date but not in the books by then: unmatched lines, lines whose
  // matched records were deleted, and lines matched to a book entry dated after the statement date.
  const unrecorded = lines.filter((l) => {
    if (l.date > statementDate || l.date < settings.cashOpeningDate || l.status === 'ignored') return false;
    if (l.status === 'unmatched' || !isLiveMatch(l, ids)) return true;
    return l.matchedMovementIds.every((id) => { const m = byId.get(id); return !m || m.date > statementDate; });
  });
  const unrecordedTotal = round2(unrecorded.reduce((a, l) => a + l.amount, 0));
  const expectedStatementBalance = round2(bookBalance - outstandingDepositsTotal + outstandingPaymentsTotal + unrecordedTotal);
  const difference = round2((Number(closingBalance) || 0) - expectedStatementBalance);
  return {
    statementDate,
    closingBalance: round2(Number(closingBalance) || 0),
    bookBalance,
    outstandingDeposits,
    outstandingPayments,
    outstandingDepositsTotal,
    outstandingPaymentsTotal,
    unrecorded,
    unrecordedTotal,
    expectedStatementBalance,
    difference,
    reconciled: Math.abs(difference) < 0.005,
    clearedCount: inBook.filter((m) => cleared.has(m.id)).length,
  };
};

const lineKey = (l: { date: string; amount: number; description: string; reference?: string }) =>
  `${l.date}|${round2(l.amount).toFixed(2)}|${l.description.trim().toLowerCase()}|${(l.reference || '').trim().toLowerCase()}`;

/**
 * Split incoming lines into new ones and ones already imported (same date, amount, description, reference).
 * Counted, so a statement with two identical Rs. 50 charges on one day keeps both.
 */
export const splitNewLines = <T extends ParsedStatementLine>(existing: Pick<BankStatementLine, 'date' | 'amount' | 'description' | 'reference'>[], incoming: T[]): { fresh: T[]; duplicates: T[] } => {
  const counts = new Map<string, number>();
  existing.forEach((e) => counts.set(lineKey(e), (counts.get(lineKey(e)) || 0) + 1));
  const fresh: T[] = [];
  const duplicates: T[] = [];
  incoming.forEach((l) => {
    const k = lineKey(l);
    const n = counts.get(k) || 0;
    if (n > 0) {
      counts.set(k, n - 1);
      duplicates.push(l);
    } else fresh.push(l);
  });
  return { fresh, duplicates };
};
