/**
 * The shop's bank accounts.
 *
 * 1010 "Bank" stays the main bank account: every older record, and every new one where nobody picks a bank,
 * is the main bank. More accounts (HBL, UBL, MBL, ABL, BOP, BAFL…) are child accounts of 1010 in the chart
 * with the codes 1011, 1012 … 1099. Their opening balances live in `settings.bankOpenings` (by code) so the
 * Money screen and the journal read one figure; the main bank keeps `settings.openingBankBalance`.
 *
 * A money record says which bank it went through with `bankCode` (see types.ts); the cash book, the Money
 * screen, bank reconciliation and the journal all resolve it the same way (finance.ts `bankOfRecord`).
 */
import { AppSettings } from '../types';
import type { Account } from './accounting';
import { CashMovement, MAIN_BANK_CODE } from './finance';

export { MAIN_BANK_CODE };

export interface BankAccount {
  code: string;
  /** Short name shown in pickers, e.g. "HBL — 0123". */
  name: string;
  bankName: string;
  accountTitle?: string;
  accountNumber?: string;
  openingBalance: number;
  isMain: boolean;
}

const FIRST_EXTRA = 1011;
const LAST_EXTRA = 1099;

/** Custom chart accounts that are bank accounts (children of 1010). */
export const isBankAccount = (a: Pick<Account, 'code' | 'isBank' | 'parent'>) => Boolean(a.isBank) || a.code === MAIN_BANK_CODE;

export const bankLabel = (bankName: string, accountNumber?: string) => {
  const num = (accountNumber || '').trim();
  const tail = num.length > 4 ? num.slice(-4) : num;
  return tail ? `${bankName.trim()} — ${tail}` : bankName.trim();
};

/** Every bank account of the shop, main bank first. */
export const bankAccountsOf = (settings: Pick<AppSettings, 'openingBankBalance' | 'bankOpenings' | 'mainBankName'>, customAccounts: Account[]): BankAccount[] => {
  const main: BankAccount = {
    code: MAIN_BANK_CODE,
    name: settings.mainBankName?.trim() || 'Main bank',
    bankName: settings.mainBankName?.trim() || 'Main bank',
    openingBalance: Number(settings.openingBankBalance) || 0,
    isMain: true,
  };
  const extra = customAccounts
    .filter((a) => a.isBank && a.code !== MAIN_BANK_CODE)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((a) => ({
      code: a.code,
      name: a.name,
      bankName: a.bankName || a.name,
      accountTitle: a.accountTitle,
      accountNumber: a.accountNumber,
      openingBalance: Number(settings.bankOpenings?.[a.code]) || 0,
      isMain: false,
    }));
  return [main, ...extra];
};

/** Next free code for a new bank account (1011, 1012 … 1099), or null when the range is full. */
export const nextBankCode = (taken: string[]): string | null => {
  const used = new Set(taken);
  for (let n = FIRST_EXTRA; n <= LAST_EXTRA; n++) if (!used.has(String(n))) return String(n);
  return null;
};

/** Name of a bank account by code (the main bank when empty). */
export const bankNameOf = (banks: BankAccount[], code?: string | null) => banks.find((b) => b.code === (code || MAIN_BANK_CODE))?.name || 'Main bank';

/**
 * One bank's view of the money: that bank's movements only, and settings where the "bank" opening is that
 * bank's. Everything written for a single bank (bank reconciliation, the bank side of balances) then works
 * per bank without change.
 */
export const scopeToBank = (movements: CashMovement[], settings: AppSettings, code: string): { movements: CashMovement[]; settings: AppSettings } => {
  const bank = code || MAIN_BANK_CODE;
  const opening = bank === MAIN_BANK_CODE ? Number(settings.openingBankBalance) || 0 : Number(settings.bankOpenings?.[bank]) || 0;
  return {
    movements: movements.filter((m) => m.bankCode === bank),
    settings: { ...settings, cashOpeningBalance: 0, openingBankBalance: opening, bankOpenings: {} },
  };
};

/** Money methods that go through a bank (anything not cash): pick which bank for these. */
export const needsBank = (method?: string) => {
  const m = (method || '').toLowerCase();
  return Boolean(m) && !m.startsWith('cash') && !m.startsWith('credit') && !m.startsWith('cheque');
};
