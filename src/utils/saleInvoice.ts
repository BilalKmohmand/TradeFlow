/**
 * Sale Invoice arithmetic and the "Payment Method" grid, as in Apna Accountant SB (pure; used by the form and
 * the tests).
 *
 *  - Each line: Qty × Rate = Amount, less Disc = Net Amount. The header's "Disc %" is a bill-wide percent that
 *    fills the Disc of every line that has no discount of its own (a scheme % or a typed discount wins).
 *  - Bottom right: Qty total and Amount total (the net amounts), "Others Charges" (freight / loading, charged to
 *    the customer), "Lumsum Disc%" + amount (a discount on the whole bill), Bill Total and Balance.
 *  - Payment Method grid: lines of Code | Title | Debit | Narration against any cash or bank account, or
 *    "Cheques in hand" for a customer's cheque (it goes to the cheque register). They map onto the bill's
 *    split payment: cash → method Cash, a bank → method Bank Transfer with that bank's code.
 */
import type { AppSettings } from '../types';
import type { Account } from './accounting';
import { ACC, mergeAccounts } from './accounting';
import { bankAccountsOf } from './banks';
import type { PaymentPart } from './billing';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PayAccountKind = 'cash' | 'bank' | 'cheque';
export interface PayAccount {
  code: string;
  name: string;
  kind: PayAccountKind;
}

export const CHEQUES_IN_HAND = '1150';

/** Accounts a sale can be paid into: cash in hand, every bank account, and cheques in hand. */
export const paymentAccounts = (settings: Pick<AppSettings, 'openingBankBalance' | 'bankOpenings' | 'mainBankName'>, customAccounts: Account[]): PayAccount[] => [
  { code: ACC.CASH, name: 'Cash in hand', kind: 'cash' },
  ...bankAccountsOf(settings, customAccounts).map((b) => ({ code: b.code, name: b.name, kind: 'bank' as const })),
  { code: CHEQUES_IN_HAND, name: 'Cheques in hand (customer cheque)', kind: 'cheque' },
];

/** Income accounts a bill can be credited to ("Sale a/c"): Sales first, never the discount / return contra accounts. */
export const saleAccounts = (customAccounts: Account[]): Account[] => {
  const all = mergeAccounts(customAccounts).filter((a) => a.type === 'income' && a.code !== ACC.SALES_DISCOUNTS && a.code !== ACC.SALES_RETURNS);
  return [...all.filter((a) => a.code === ACC.SALES), ...all.filter((a) => a.code !== ACC.SALES)];
};

export interface PayRow {
  code: string;
  amount: number;
  note?: string;
}

/** The Payment Method grid as the bill's payment parts (+ the cheque amount). Unknown codes are reported. */
export const paymentsFromGrid = (rows: PayRow[], accounts: PayAccount[]): { parts: (PaymentPart & { note?: string })[]; cheque: number; error?: string } => {
  const parts: (PaymentPart & { note?: string })[] = [];
  let cheque = 0;
  for (const r of rows) {
    const amount = round2(Math.max(0, Number(r.amount) || 0));
    if (!(amount > 0)) continue;
    const acc = accounts.find((a) => a.code === r.code);
    if (!acc) return { parts, cheque, error: `Account ${r.code || '(none)'} is not a cash or bank account.` };
    const note = r.note?.trim() ? { note: r.note.trim() } : {};
    if (acc.kind === 'cheque') cheque = round2(cheque + amount);
    else if (acc.kind === 'cash') parts.push({ method: 'Cash', amount, ...note });
    else parts.push({ method: 'Bank Transfer', amount, bankCode: acc.code, ...note });
  }
  return { parts, cheque };
};

export interface SaleLineIn {
  /** Qty as typed (per pack when the line is in packs). */
  qty: number;
  rate: number;
  /** The line's own discount (Rs. or %), 0 = none. */
  discType: 'rs' | 'pct';
  discValue: number;
}

/** Amount, Disc and Net Amount of one line; `billPct` (header Disc %) applies when the line has no discount of its own. */
export const saleLine = (l: SaleLineIn, billPct = 0): { amount: number; disc: number; net: number; pct: number | null } => {
  const amount = round2(Math.max(0, l.qty) * Math.max(0, l.rate));
  const own = Math.max(0, l.discValue || 0);
  const pct = own > 0 ? (l.discType === 'pct' ? own : null) : billPct > 0 ? billPct : null;
  const disc = own > 0 ? (l.discType === 'pct' ? round2((amount * Math.min(100, own)) / 100) : round2(Math.min(own, amount))) : billPct > 0 ? round2((amount * Math.min(100, billPct)) / 100) : 0;
  return { amount, disc, net: round2(amount - disc), pct };
};

export interface SaleTotalsIn {
  lines: { qty: number; net: number }[];
  /** Others Charges (freight / loading). */
  others?: number;
  /** Lumsum Disc % (wins over the amount when above 0) and amount. */
  lumsumPct?: number;
  lumsumAmount?: number;
  taxRatePct?: number;
  /** Paid now (the Payment Method grid). */
  paid?: number;
}

export interface SaleTotals {
  qtyTotal: number;
  amountTotal: number;
  lumsum: number;
  tax: number;
  others: number;
  billTotal: number;
  balance: number;
}

/** The bottom-right figures of the Sale Invoice. */
export const saleTotals = (t: SaleTotalsIn): SaleTotals => {
  const qtyTotal = Math.round(t.lines.reduce((a, l) => a + Math.max(0, l.qty || 0), 0) * 10000) / 10000;
  const amountTotal = round2(t.lines.reduce((a, l) => a + (l.net || 0), 0));
  const pct = Math.max(0, Number(t.lumsumPct) || 0);
  const lumsum = round2(Math.min(amountTotal, pct > 0 ? (amountTotal * Math.min(100, pct)) / 100 : Math.max(0, Number(t.lumsumAmount) || 0)));
  const tax = round2(((amountTotal - lumsum) * (Number(t.taxRatePct) || 0)) / 100);
  const others = round2(Math.max(0, Number(t.others) || 0));
  const billTotal = round2(amountTotal - lumsum + tax + others);
  return { qtyTotal, amountTotal, lumsum, tax, others, billTotal, balance: round2(billTotal - Math.max(0, Number(t.paid) || 0)) };
};

/** Print Invoice radio → paper: Half = A5, Full = A4, Mini = 80 mm thermal, None = no print. */
export type PrintChoice = 'none' | 'half' | 'full' | 'mini';
export const PRINT_CHOICES: { id: PrintChoice; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'half', label: 'Half' },
  { id: 'full', label: 'Full' },
  { id: 'mini', label: 'Mini' },
];
export const paperOf = (c: PrintChoice): 'a4' | 'a5' | 'thermal80' | null => (c === 'half' ? 'a5' : c === 'full' ? 'a4' : c === 'mini' ? 'thermal80' : null);

/** The Print Invoice choice is remembered on this device (per screen). */
export const loadPrintChoice = (key: string, fallback: PrintChoice = 'none'): PrintChoice => {
  try {
    const v = localStorage.getItem(`sarmaya_print_${key}`);
    return v === 'none' || v === 'half' || v === 'full' || v === 'mini' ? v : fallback;
  } catch {
    return fallback;
  }
};
export const savePrintChoice = (key: string, c: PrintChoice) => {
  try {
    localStorage.setItem(`sarmaya_print_${key}`, c);
  } catch {
    /* private window */
  }
};
