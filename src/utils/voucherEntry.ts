/**
 * The voucher screen of Apna Accountant SB ("Cash Payment -- [Debit Voucher]" …): one entry row
 * (Code · Title · Debit · Credit · Narration) above a grid of committed lines. Enter on Narration puts the
 * entry row into the grid; clicking a grid line brings it back into the entry row to change it.
 * Pure functions only (the screen is components/accounting/VoucherForm.tsx; posting is utils/vouchers.ts).
 */
import type { JournalEntry } from './accounting';
import { AccountOption, VoucherInput, VoucherLineInput, VoucherType, voucherTypeInfo } from './vouchers';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The old program's window titles. */
export const VOUCHER_TITLES: Record<VoucherType, string> = {
  CPV: 'Cash Payment -- [Debit Voucher]',
  CRV: 'Cash Receipt -- [Credit Voucher]',
  BPV: 'Bank Payment -- [Debit Voucher]',
  BRV: 'Bank Receipt -- [Credit Voucher]',
  JV: 'Journal Voucher',
};

export interface GridLine {
  account: string;
  debit: number;
  credit: number;
  narration: string;
}

export interface EntryRow {
  account: string;
  debit: string;
  credit: string;
  narration: string;
}
export const EMPTY_ENTRY: EntryRow = { account: '', debit: '', credit: '', narration: '' };

/** The amount column the lines of this voucher usually go in (payments debit, receipts credit). */
export const mainSide = (type: VoucherType): 'debit' | 'credit' => (voucherTypeInfo(type).side === 'receive' ? 'credit' : 'debit');

const num = (s: string) => {
  const v = parseFloat(String(s).replace(/,/g, ''));
  return Number.isFinite(v) ? round2(v) : 0;
};

/** Something typed in the entry row (so Save must deal with it first). */
export const entryTouched = (e: EntryRow) => Boolean(e.account || e.debit.trim() || e.credit.trim() || e.narration.trim());

/**
 * Put the entry row into the grid: a new line at the end, or the line being changed (editIndex) in place.
 * The account and exactly one amount are needed.
 */
export const commitEntry = (lines: GridLine[], entry: EntryRow, editIndex: number | null): { ok: boolean; lines: GridLine[]; error: string } => {
  if (!entry.account) return { ok: false, lines, error: 'Type the account code (or press F1 to search by title).' };
  const debit = num(entry.debit);
  const credit = num(entry.credit);
  if (debit < 0 || credit < 0) return { ok: false, lines, error: 'Amounts cannot be less than 0.' };
  if (debit > 0 && credit > 0) return { ok: false, lines, error: 'Enter either a debit or a credit, not both.' };
  if (debit <= 0 && credit <= 0) return { ok: false, lines, error: 'Enter the amount (debit or credit).' };
  const line: GridLine = { account: entry.account, debit, credit, narration: entry.narration.trim() };
  if (editIndex != null && editIndex >= 0 && editIndex < lines.length) return { ok: true, lines: lines.map((l, i) => (i === editIndex ? line : l)), error: '' };
  return { ok: true, lines: [...lines, line], error: '' };
};

/** A grid line back in the entry row. */
export const entryOf = (l: GridLine): EntryRow => ({ account: l.account, debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '', narration: l.narration || '' });

export const removeLine = (lines: GridLine[], i: number): GridLine[] => lines.filter((_, k) => k !== i);

export const gridTotals = (lines: GridLine[]) => ({
  debit: round2(lines.reduce((a, l) => a + (l.debit || 0), 0)),
  credit: round2(lines.reduce((a, l) => a + (l.credit || 0), 0)),
});

/**
 * The voucher's own narration (the old screen only has line narrations): the one narration all lines share,
 * else the first line's with "+ n more", else the voucher kind.
 */
export const voucherNarration = (type: VoucherType, lines: GridLine[]): string => {
  const ns = lines.map((l) => l.narration.trim()).filter(Boolean);
  const label = voucherTypeInfo(type).label;
  if (ns.length === 0) return lines.length > 1 ? `${label} (${lines.length} lines)` : label;
  const uniq = Array.from(new Set(ns));
  if (uniq.length === 1) return uniq[0];
  return `${uniq[0]} + ${uniq.length - 1} more`;
};

/** What the grid saves as. */
export const voucherInputFromGrid = (type: VoucherType, date: string, lines: GridLine[], bankCode?: string): VoucherInput => ({
  type,
  date,
  narration: voucherNarration(type, lines),
  lines: lines.map((l): VoucherLineInput => ({ account: l.account, debit: l.debit, credit: l.credit, narration: l.narration || undefined })),
  ...(voucherTypeInfo(type).money === 'bank' ? { bankCode } : {}),
});

/** The saved voucher's lines as grid lines (the automatic cash / bank side left out). */
export const gridOf = (v: Pick<VoucherInput, 'lines'>): GridLine[] => v.lines.map((l) => ({ account: l.account, debit: round2(l.debit || 0), credit: round2(l.credit || 0), narration: l.narration || '' }));

/** Find an account by the code typed in the Code box (exact, ignoring case and spaces). */
export const optionByCode = (options: AccountOption[], code: string): AccountOption | undefined => {
  const k = code.trim().toLowerCase().replace(/\s+/g, '');
  if (!k) return undefined;
  return options.find((o) => o.code && o.code.toLowerCase().replace(/\s+/g, '') === k);
};

/**
 * Search: a saved voucher of this type by the number typed — the full number ("CPV-1066") or just its
 * digits ("1066"). Newest first when the digits match more than one (numbers restart each year).
 */
export const findVoucherByNumber = (vouchers: JournalEntry[], type: VoucherType, typed: string): JournalEntry | undefined => {
  const q = typed.trim().toLowerCase();
  if (!q) return undefined;
  const mine = vouchers.filter((v) => v.voucherType === type).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const exact = mine.find((v) => v.ref.toLowerCase() === q);
  if (exact) return exact;
  const digits = q.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return undefined;
  return mine.find((v) => {
    const m = v.ref.match(/(\d+)\D*$/);
    return m ? m[1].replace(/^0+/, '') === digits : false;
  });
};

/** "1,750,000.00 Dr" — the A/C Balance box (debit-positive balance). */
export const balanceText = (balance: number | undefined): string => {
  if (balance == null || !Number.isFinite(balance)) return '';
  const v = round2(balance);
  const s = Math.abs(v).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v === 0 ? '0.00' : `${s} ${v > 0 ? 'Dr' : 'Cr'}`;
};
