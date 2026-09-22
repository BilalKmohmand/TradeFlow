import React from 'react';
import { AppSettings, CashEntry, Customer, DocSeriesKey, Expense, LedgerEntry, Supplier } from '../types';
import { Account, JournalEntry, mergeAccounts } from '../utils/accounting';
import { BankAccount, MAIN_BANK_CODE, bankAccountsOf, bankLabel, nextBankCode } from '../utils/banks';
import { VoucherInput, VoucherType, cleanLines, validateVoucher, voucherEntry, voucherInputOf, voucherRecords, voucherTypeInfo, VoucherRecords } from '../utils/vouchers';
import { booksLockedFor } from '../utils/accounting';
import { formatCurrency, formatDate } from '../utils/formatters';

/**
 * Bank accounts, vouchers (CPV / CRV / BPV / BRV / JV) and the managed city list.
 * The accounting treatment is described in utils/vouchers.ts and utils/banks.ts.
 */

type Result = { success: boolean; message: string };
const ok = (message: string): Result => ({ success: true, message });
const fail = (message: string): Result => ({ success: false, message });
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A deleted voucher as kept in the bin: the entry and every record it had written. */
export interface VoucherSnapshot {
  voucher: JournalEntry;
  ledger: LedgerEntry[];
  cashEntries: CashEntry[];
  expenses: Expense[];
}

export interface VoucherApi {
  bankAccounts: BankAccount[];
  addBankAccount: (input: { bankName: string; accountTitle?: string; accountNumber?: string; openingBalance?: number }) => Result & { code?: string };
  updateBankAccount: (code: string, patch: { bankName?: string; accountTitle?: string; accountNumber?: string; openingBalance?: number }) => Result;
  deleteBankAccount: (code: string) => Result;
  /** Why a bank account can't be removed (null = it can). */
  bankInUse: (code: string) => string | null;

  vouchers: JournalEntry[];
  addVoucher: (input: VoucherInput) => Result & { voucher?: JournalEntry };
  updateVoucher: (id: string, input: VoucherInput) => Result & { voucher?: JournalEntry };
  deleteVoucher: (id: string) => Result;
  /** Why this voucher can't be edited (null = it can). */
  voucherEditBlock: (id: string) => string | null;
  previewVoucherNumber: (type: VoucherType, date?: string) => string;
  /** Problems with a voucher before it is saved (empty = fine). */
  validateVoucherInput: (input: VoucherInput) => string[];
  /** Records a voucher wrote (for the bin). */
  voucherSnapshot: (id: string) => VoucherSnapshot | null;
  /** Put a deleted voucher back exactly as it was (from the bin). */
  restoreVoucher: (snap: VoucherSnapshot) => Result;
  voucherRestoreBlock: (snap: VoucherSnapshot) => string | null;

  cities: string[];
  addCity: (name: string) => Result;
  removeCity: (name: string) => Result;
}

interface Deps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  customAccounts: Account[];
  setCustomAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  manualJournals: JournalEntry[];
  setManualJournals: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  cashEntries: CashEntry[];
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  cheques: { bankCode?: string }[];
  bankLines: { bankCode?: string }[];
  can: (p: string) => boolean;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: any) => void;
  uid: (prefix: string) => string;
  userName?: string;
  today: () => string;
  removeRemote: (table: any, ids: string[]) => void;
  nextDocNumber: (key: DocSeriesKey, date: string, existing: string[]) => string;
  previewDocNumber: (key: DocSeriesKey, date: string, existing: string[]) => string;
}

export const createVoucherApi = (d: Deps): VoucherApi => {
  const banks = bankAccountsOf(d.settings, d.customAccounts);
  const bankCodes = banks.map((b) => b.code);
  const accounts = mergeAccounts(d.customAccounts);
  const vouchers = d.manualJournals.filter((j) => j.voucherType);
  const canManageBanks = () => d.can('finance:cashbook') || d.can('finance:view_pnl');

  // -------------------------------------------------------------------------
  // Bank accounts
  // -------------------------------------------------------------------------
  const bankInUse = (code: string): string | null => {
    if (code === MAIN_BANK_CODE) return 'The main bank account is always kept.';
    const used = d.ledger.some((l) => l.bankCode === code) || d.cashEntries.some((c) => c.bankCode === code) || d.expenses.some((e) => e.bankCode === code) || d.cheques.some((c) => c.bankCode === code) || d.bankLines.some((l) => l.bankCode === code);
    if (used) return 'Money has gone through this bank account, so it is kept. You can rename it.';
    if (d.manualJournals.some((j) => j.bankCode === code || j.lines.some((l) => l.accountCode === code))) return 'This bank account is used in vouchers or journal entries.';
    return null;
  };

  const addBankAccount: VoucherApi['addBankAccount'] = (input) => {
    if (!canManageBanks()) return fail('Only a manager or admin can add bank accounts.');
    const bankName = (input.bankName || '').trim();
    if (!bankName) return fail('Enter the bank name, e.g. HBL, UBL, Meezan.');
    const accountNumber = (input.accountNumber || '').trim();
    const name = bankLabel(bankName, accountNumber);
    if (banks.some((b) => b.name.toLowerCase() === name.toLowerCase())) return fail(`${name} is already there.`);
    const code = nextBankCode(accounts.map((a) => a.code));
    if (!code) return fail('No more bank account codes are free (1011 to 1099).');
    const opening = round2(Number(input.openingBalance) || 0);
    const account: Account = {
      id: `acc-${code}`,
      code,
      name,
      type: 'asset',
      system: false,
      parent: MAIN_BANK_CODE,
      isBank: true,
      bankName,
      ...(input.accountTitle?.trim() ? { accountTitle: input.accountTitle.trim() } : {}),
      ...(accountNumber ? { accountNumber } : {}),
      description: `Bank account${input.accountTitle?.trim() ? ` — ${input.accountTitle.trim()}` : ''}${accountNumber ? ` (${accountNumber})` : ''}`,
      createdAt: new Date().toISOString(),
      createdBy: d.userName,
    };
    d.setCustomAccounts((prev) => [...prev, account]);
    d.setSettings((prev) => ({ ...prev, bankOpenings: { ...(prev.bankOpenings || {}), [code]: opening } }));
    d.logAuditEvent('Bank Account Added', `${code} ${name}${opening ? `, opening ${formatCurrency(opening)}` : ''}`, 'info', 'data');
    return { success: true, message: `${name} added (account ${code}).`, code };
  };

  const updateBankAccount: VoucherApi['updateBankAccount'] = (code, patch) => {
    if (!canManageBanks()) return fail('Only a manager or admin can change bank accounts.');
    const bank = banks.find((b) => b.code === code);
    if (!bank) return fail('Bank account not found.');
    const opening = patch.openingBalance != null ? round2(Number(patch.openingBalance) || 0) : undefined;
    if (bank.isMain) {
      const name = (patch.bankName ?? bank.name).trim();
      d.setSettings((prev) => ({ ...prev, mainBankName: name || undefined, ...(opening != null ? { openingBankBalance: opening } : {}) }));
    } else {
      const bankName = (patch.bankName ?? bank.bankName).trim();
      if (!bankName) return fail('Enter the bank name.');
      const accountNumber = (patch.accountNumber ?? bank.accountNumber ?? '').trim();
      const accountTitle = (patch.accountTitle ?? bank.accountTitle ?? '').trim();
      const name = bankLabel(bankName, accountNumber);
      if (banks.some((b) => b.code !== code && b.name.toLowerCase() === name.toLowerCase())) return fail(`${name} is already there.`);
      d.setCustomAccounts((prev) => prev.map((a) => (a.code === code ? { ...a, name, bankName, accountNumber: accountNumber || undefined, accountTitle: accountTitle || undefined } : a)));
      if (opening != null) d.setSettings((prev) => ({ ...prev, bankOpenings: { ...(prev.bankOpenings || {}), [code]: opening } }));
    }
    d.logAuditEvent('Bank Account Changed', `${code} ${patch.bankName || bank.name}${opening != null ? `, opening ${formatCurrency(opening)}` : ''}`, 'info', 'data');
    return ok('Bank account saved.');
  };

  const deleteBankAccount: VoucherApi['deleteBankAccount'] = (code) => {
    if (!canManageBanks() || !d.can('delete_records')) return fail('Only a manager or admin can remove bank accounts.');
    const bank = banks.find((b) => b.code === code);
    if (!bank) return fail('Bank account not found.');
    const why = bankInUse(code);
    if (why) return fail(why);
    const acc = d.customAccounts.find((a) => a.code === code);
    d.setCustomAccounts((prev) => prev.filter((a) => a.code !== code));
    d.setSettings((prev) => {
      const next = { ...(prev.bankOpenings || {}) };
      delete next[code];
      return { ...prev, bankOpenings: next };
    });
    if (acc?.id) d.removeRemote('accounts', [acc.id]);
    d.logAuditEvent('Bank Account Removed', `${code} ${bank.name}`, 'warning', 'data');
    return ok(`${bank.name} removed.`);
  };

  // -------------------------------------------------------------------------
  // Vouchers
  // -------------------------------------------------------------------------
  const seriesOf = (type: VoucherType) => voucherTypeInfo(type).series;
  const existingNumbers = () => d.manualJournals.map((j) => j.ref);
  const previewVoucherNumber = (type: VoucherType, date = d.today()) => d.previewDocNumber(seriesOf(type), date, existingNumbers());

  const permissionFor = (type: VoucherType): string | null => {
    if (type === 'JV') return d.can('finance:view_pnl') ? null : 'Only a manager or admin can post journal vouchers.';
    return d.can('finance:record_payment') ? null : "You don't have permission to record payments. Ask a manager or admin.";
  };

  const ctxFor = (customers: Customer[], suppliers: Supplier[]) => ({ accounts, customers, suppliers, bankCodes, settings: d.settings, today: d.today() });

  /** Customers / suppliers with a voucher's balance changes applied (sign = +1) or undone (sign = −1). */
  const applyDelta = (delta: Map<string, number>, sign: 1 | -1) => {
    if (delta.size === 0) return;
    const get = (k: string) => (delta.get(k) || 0) * sign;
    d.setCustomers((prev) => prev.map((c) => (delta.has(`customer|${c.id}`) ? { ...c, totalDue: round2((c.totalDue || 0) + get(`customer|${c.id}`)) } : c)));
    d.setSuppliers((prev) => prev.map((s) => (delta.has(`supplier|${s.id}`) ? { ...s, totalOwed: round2((s.totalOwed || 0) + get(`supplier|${s.id}`)) } : s)));
  };

  const recordsOf = (voucherId: string) => ({
    ledger: d.ledger.filter((l) => l.voucherId === voucherId),
    cashEntries: d.cashEntries.filter((c) => c.voucherId === voucherId),
    expenses: d.expenses.filter((e) => e.voucherId === voucherId),
  });
  const deltaOf = (rows: LedgerEntry[]) => {
    const m = new Map<string, number>();
    rows.forEach((l) => {
      const k = `${l.entityType}|${l.entityId}`;
      m.set(k, round2((m.get(k) || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0)));
    });
    return m;
  };

  const writeRecords = (recs: Pick<VoucherRecords, 'ledger' | 'cashEntries' | 'expenses'>, removeIds?: { ledger: string[]; cash: string[]; exp: string[] }) => {
    const drop = <T extends { id: string }>(ids: string[] | undefined) => (rows: T[]) => (ids && ids.length ? rows.filter((r) => !ids.includes(r.id)) : rows);
    d.setLedger((prev) => [...recs.ledger, ...drop<LedgerEntry>(removeIds?.ledger)(prev)]);
    d.setCashEntries((prev) => [...recs.cashEntries, ...drop<CashEntry>(removeIds?.cash)(prev)]);
    d.setExpenses((prev) => [...recs.expenses, ...drop<Expense>(removeIds?.exp)(prev)]);
    if (removeIds) {
      d.removeRemote('ledger', removeIds.ledger);
      d.removeRemote('cash_entries', removeIds.cash);
      d.removeRemote('expenses', removeIds.exp);
    }
  };

  const total = (v: JournalEntry) => formatCurrency(round2(v.lines.reduce((a, l) => a + l.debit, 0)));

  const addVoucher: VoucherApi['addVoucher'] = (input) => {
    const denied = permissionFor(input.type);
    if (denied) return fail(denied);
    const errors = validateVoucher(input, ctxFor(d.customers, d.suppliers));
    if (errors.length) return fail(errors[0]);
    const clean: VoucherInput = { ...input, lines: cleanLines(input.lines), narration: input.narration.trim() };
    const number = d.nextDocNumber(seriesOf(input.type), input.date, existingNumbers());
    const entry = voucherEntry(clean, { id: d.uid('vch'), number, createdAt: new Date().toISOString(), createdBy: d.userName }, { customers: d.customers, suppliers: d.suppliers });
    const recs = voucherRecords(entry, { accounts, customers: d.customers, suppliers: d.suppliers, bankCodes, uid: d.uid, userName: d.userName });
    d.setManualJournals((prev) => [entry, ...prev]);
    writeRecords(recs);
    applyDelta(recs.partyDelta, 1);
    d.logAuditEvent('Voucher Posted', `${entry.ref} on ${formatDate(entry.date)}: ${entry.memo} (${total(entry)})`, 'info', 'data');
    return { success: true, message: `Voucher ${entry.ref} saved.`, voucher: entry };
  };

  const voucherEditBlock = (id: string): string | null => {
    const v = vouchers.find((x) => x.id === id);
    if (!v) return 'Voucher not found.';
    const locked = booksLockedFor(d.settings, v.date);
    if (locked) return `This voucher is in a closed period. ${locked}`;
    if (!d.can('finance:view_pnl')) return 'Only a manager or admin can change a saved voucher.';
    return null;
  };

  const updateVoucher: VoucherApi['updateVoucher'] = (id, input) => {
    const old = vouchers.find((x) => x.id === id);
    if (!old) return fail('Voucher not found.');
    const block = voucherEditBlock(id);
    if (block) return fail(block);
    if (input.type !== old.voucherType) return fail('The voucher type cannot be changed. Delete it and make a new one.');
    const denied = permissionFor(input.type);
    if (denied) return fail(denied);
    // Validate against the balances as they would be without this voucher.
    const oldRecs = recordsOf(id);
    const oldDelta = deltaOf(oldRecs.ledger);
    const undo = (k: string, v: number) => round2(v - (oldDelta.get(k) || 0));
    const customers = d.customers.map((c) => ({ ...c, totalDue: undo(`customer|${c.id}`, c.totalDue) }));
    const suppliers = d.suppliers.map((s) => ({ ...s, totalOwed: undo(`supplier|${s.id}`, s.totalOwed) }));
    const errors = validateVoucher(input, ctxFor(customers, suppliers));
    if (errors.length) return fail(errors[0]);
    const clean: VoucherInput = { ...input, lines: cleanLines(input.lines), narration: input.narration.trim() };
    const entry = voucherEntry(clean, { id, number: old.ref, createdAt: old.createdAt || new Date().toISOString(), createdBy: old.createdBy, updatedAt: new Date().toISOString(), updatedBy: d.userName }, { customers, suppliers });
    const recs = voucherRecords(entry, { accounts, customers, suppliers, bankCodes, uid: d.uid, userName: d.userName });
    d.setManualJournals((prev) => prev.map((j) => (j.id === id ? entry : j)));
    writeRecords(recs, { ledger: oldRecs.ledger.map((l) => l.id), cash: oldRecs.cashEntries.map((c) => c.id), exp: oldRecs.expenses.map((e) => e.id) });
    // New balance change minus the old one.
    const net = new Map<string, number>(recs.partyDelta);
    oldDelta.forEach((v, k) => net.set(k, round2((net.get(k) || 0) - v)));
    applyDelta(net, 1);
    d.logAuditEvent('Voucher Changed', `${entry.ref} on ${formatDate(entry.date)}: ${entry.memo} (${total(entry)}; was ${total(old)} on ${formatDate(old.date)})`, 'warning', 'data');
    return { success: true, message: `Voucher ${entry.ref} saved.`, voucher: entry };
  };

  const voucherSnapshot = (id: string): VoucherSnapshot | null => {
    const v = vouchers.find((x) => x.id === id);
    return v ? { voucher: v, ...recordsOf(id) } : null;
  };

  const deleteVoucher: VoucherApi['deleteVoucher'] = (id) => {
    const v = vouchers.find((x) => x.id === id);
    if (!v) return fail('Voucher not found.');
    if (!d.can('delete_records')) return fail("You don't have permission to delete records.");
    if (v.voucherType === 'JV' ? !d.can('finance:view_pnl') : !d.can('finance:record_payment')) return fail("You don't have permission to delete this voucher.");
    const locked = booksLockedFor(d.settings, v.date);
    if (locked) return fail(`This voucher is in a closed period. ${locked}`);
    const recs = recordsOf(id);
    d.setManualJournals((prev) => prev.filter((j) => j.id !== id));
    d.removeRemote('journal_entries', [id]);
    writeRecords({ ledger: [], cashEntries: [], expenses: [] }, { ledger: recs.ledger.map((l) => l.id), cash: recs.cashEntries.map((c) => c.id), exp: recs.expenses.map((e) => e.id) });
    applyDelta(deltaOf(recs.ledger), -1);
    d.logAuditEvent('Voucher Deleted', `${v.ref} on ${formatDate(v.date)}: ${v.memo} (${total(v)})`, 'danger', 'data');
    return ok(`Voucher ${v.ref} deleted. A copy is kept in Admin → Deleted records.`);
  };

  const voucherRestoreBlock = (snap: VoucherSnapshot): string | null => {
    const v = snap.voucher;
    if (d.manualJournals.some((j) => j.id === v.id)) return 'This voucher is already in the books.';
    if (d.manualJournals.some((j) => j.ref === v.ref)) return `The number ${v.ref} has been used again since. Enter the voucher again instead.`;
    const locked = booksLockedFor(d.settings, v.date);
    if (locked) return `The voucher date is in a closed period. ${locked}`;
    const missingParty = snap.ledger.find((l) => (l.entityType === 'customer' ? !d.customers.some((c) => c.id === l.entityId) : !d.suppliers.some((s) => s.id === l.entityId)));
    if (missingParty) return `A ${missingParty.entityType} on this voucher has been deleted.`;
    const known = new Set(accounts.map((a) => a.code));
    const missingAcc = v.lines.find((l) => !known.has(l.accountCode));
    if (missingAcc) return `Account ${missingAcc.accountCode} on this voucher has been deleted.`;
    return null;
  };

  const restoreVoucher: VoucherApi['restoreVoucher'] = (snap) => {
    const why = voucherRestoreBlock(snap);
    if (why) return fail(why);
    d.setManualJournals((prev) => [snap.voucher, ...prev]);
    writeRecords({ ledger: snap.ledger || [], cashEntries: snap.cashEntries || [], expenses: snap.expenses || [] });
    applyDelta(deltaOf(snap.ledger || []), 1);
    return ok(`Voucher ${snap.voucher.ref} is back in the books.`);
  };

  // -------------------------------------------------------------------------
  // Cities
  // -------------------------------------------------------------------------
  const cities = (d.settings.cities || []).slice().sort((a, b) => a.localeCompare(b));
  const addCity = (name: string): Result => {
    const c = name.trim().replace(/\s+/g, ' ');
    if (!c) return fail('Enter the city or town name.');
    if (cities.some((x) => x.toLowerCase() === c.toLowerCase())) return fail(`${c} is already in the list.`);
    d.setSettings((prev) => ({ ...prev, cities: [...(prev.cities || []), c] }));
    return ok(`${c} added.`);
  };
  const removeCity = (name: string): Result => {
    d.setSettings((prev) => ({ ...prev, cities: (prev.cities || []).filter((x) => x.toLowerCase() !== name.trim().toLowerCase()) }));
    return ok(`${name} removed from the list (customers and suppliers keep it).`);
  };

  return {
    bankAccounts: banks,
    addBankAccount,
    updateBankAccount,
    deleteBankAccount,
    bankInUse,
    vouchers,
    addVoucher,
    updateVoucher,
    deleteVoucher,
    voucherEditBlock,
    previewVoucherNumber,
    validateVoucherInput: (input) => permissionFor(input.type) ? [permissionFor(input.type)!] : validateVoucher(input, ctxFor(d.customers, d.suppliers)),
    voucherSnapshot,
    restoreVoucher,
    voucherRestoreBlock,
    cities,
    addCity,
    removeCity,
  };
};

export { voucherInputOf };
