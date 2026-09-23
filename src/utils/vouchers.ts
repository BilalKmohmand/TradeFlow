/**
 * Vouchers, the way the shop's old desktop books ("Apna Accountant") did them:
 *
 *   CPV  cash payment    money goes out of the cash drawer      the Cash side (1000) is implied
 *   CRV  cash receipt    money comes into the cash drawer       the Cash side (1000) is implied
 *   BPV  bank payment    money goes out of a chosen bank        that bank's side is implied
 *   BRV  bank receipt    money comes into a chosen bank         that bank's side is implied
 *   JV   journal         no money side; debits must equal credits
 *
 * A voucher has a number from its own series (CPV-1063…), a date, a narration and any number of lines.
 * A line is one account — a customer, a supplier, a bank, cash, an expense, income or any other chart
 * account — with a debit or a credit and its own narration.
 *
 * Accounting treatment (one entry per voucher):
 *   The voucher itself is saved as a manual journal entry (source 'manual', `voucherType` set) whose lines
 *   are the voucher's lines, customer / supplier lines on the control accounts 1100 / 2000 (with the party
 *   on the line), plus — for cash and bank vouchers — one line for the implied cash / bank side:
 *     CPV / BPV   Dr each line …                  Cr Cash 1000 / the bank   (debits − credits of the lines)
 *     CRV / BRV   Dr Cash 1000 / the bank         Cr each line …            (credits − debits of the lines)
 *     JV          the lines as they are (must balance)
 *   So the trial balance always balances and every report built on the journal sees it.
 *
 *   To keep the everyday screens in step, the voucher also writes the plain records those screens read,
 *   each marked with `voucherId` (buildJournal skips them, so nothing is counted twice):
 *     - customer / supplier lines -> ledger rows (the party's balance, statement and ledger move):
 *         cash / bank voucher: customer Cr = payment_received, customer Dr = refund_paid,
 *                              supplier Dr = payment_made, supplier Cr = 'voucher' (money back from them)
 *         JV:                  'voucher' rows (no money)
 *     - money that moves (cash book, daily sheet, Money screen, bank reconciliation):
 *         the ledger rows above carry the method (Cash / Bank Transfer) and bank;
 *         expense (and owner drawings) debits in a CPV / BPV -> expense records (expense sheets);
 *         a line on cash or a bank in a cash / bank voucher -> a transfer (two paired cash entries);
 *         any other line -> a cash entry against that account;
 *         JV lines on cash or a bank -> cash entries.
 *   Deleting or editing a voucher removes / rewrites exactly those records and undoes the balance changes.
 */
import { AppSettings, CashEntry, Customer, DocSeriesKey, Expense, ExpenseCategory, LedgerEntry, Supplier } from '../types';
import { ACC, Account, EXPENSE_ACCOUNT, JournalEntry, JournalLine, booksLockedFor, generalLedger, drCr } from './accounting';
import { MAIN_BANK_CODE } from './finance';
import { matchesWords, searchHaystack, searchWords } from './search';

export type VoucherType = 'CPV' | 'CRV' | 'BPV' | 'BRV' | 'JV';

export const VOUCHER_TYPES: { id: VoucherType; label: string; short: string; series: DocSeriesKey; money: 'cash' | 'bank' | null; side: 'pay' | 'receive' | null }[] = [
  { id: 'CPV', label: 'Cash payment voucher', short: 'Cash payment', series: 'cpv', money: 'cash', side: 'pay' },
  { id: 'CRV', label: 'Cash receipt voucher', short: 'Cash receipt', series: 'crv', money: 'cash', side: 'receive' },
  { id: 'BPV', label: 'Bank payment voucher', short: 'Bank payment', series: 'bpv', money: 'bank', side: 'pay' },
  { id: 'BRV', label: 'Bank receipt voucher', short: 'Bank receipt', series: 'brv', money: 'bank', side: 'receive' },
  { id: 'JV', label: 'Journal voucher', short: 'Journal', series: 'jv', money: null, side: null },
];
export const voucherTypeInfo = (t: VoucherType) => VOUCHER_TYPES.find((x) => x.id === t)!;

/** Accounts a voucher line may not use directly (their sub-ledgers are kept elsewhere). */
export const BLOCKED_LINE_ACCOUNTS: Record<string, string> = {
  [ACC.RECEIVABLE]: 'Pick the customer instead of the Receivable control account.',
  [ACC.PAYABLE]: 'Pick the supplier instead of the Payable control account.',
  [ACC.CHEQUES_IN_HAND]: 'Cheques in hand are kept by Money → Cheques.',
  [ACC.CHEQUES_ISSUED]: 'Cheques issued are kept by Money → Cheques.',
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 0.005;

// ---------------------------------------------------------------------------
// Account references: a chart code ("6000") or a party ("cust:<id>", "supp:<id>").
// ---------------------------------------------------------------------------
export type AccountRef = string;
export const custRef = (id: string) => `cust:${id}`;
export const suppRef = (id: string) => `supp:${id}`;
export const parseRef = (ref: string): { kind: 'customer'; id: string } | { kind: 'supplier'; id: string } | { kind: 'account'; code: string } =>
  ref.startsWith('cust:') ? { kind: 'customer', id: ref.slice(5) } : ref.startsWith('supp:') ? { kind: 'supplier', id: ref.slice(5) } : { kind: 'account', code: ref };

export interface AccountOption {
  ref: AccountRef;
  code: string;
  name: string;
  /** What kind of account (shown as a small tag in the picker). */
  group: 'Customer' | 'Supplier' | 'Bank' | 'Cash' | 'Expense' | 'Income' | 'Asset' | 'Liability' | 'Equity';
  city?: string;
  /** Debit-positive balance when known. */
  balance?: number;
}

/** Everything a voucher line or the account ledger can be pointed at, customers and suppliers included. */
export const accountOptions = (accounts: Account[], customers: Customer[], suppliers: Supplier[], opts: { forVoucher?: boolean } = {}): AccountOption[] => {
  const groupOf = (a: Account): AccountOption['group'] =>
    a.code === ACC.CASH ? 'Cash' : a.isBank || a.code === ACC.BANK ? 'Bank' : a.type === 'expense' ? 'Expense' : a.type === 'income' ? 'Income' : a.type === 'asset' ? 'Asset' : a.type === 'liability' ? 'Liability' : 'Equity';
  const gl = accounts
    .filter((a) => !opts.forVoucher || !BLOCKED_LINE_ACCOUNTS[a.code])
    .map((a) => ({ ref: a.code, code: a.code, name: a.name, group: groupOf(a) }));
  const cs = customers.map((c) => ({ ref: custRef(c.id), code: c.code || '', name: c.name, group: 'Customer' as const, city: c.city, balance: c.totalDue }));
  const ss = suppliers.map((s) => ({ ref: suppRef(s.id), code: s.code || '', name: s.company || s.name, group: 'Supplier' as const, city: s.city, balance: -s.totalOwed }));
  return [...gl, ...cs, ...ss];
};

/** Search the picker by code (exact code first) or by name / city. */
export const searchAccounts = (options: AccountOption[], query: string, limit = 30): AccountOption[] => {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);
  const exact = options.filter((o) => o.code && o.code.toLowerCase() === q);
  const starts = options.filter((o) => !exact.includes(o) && o.code && o.code.toLowerCase().startsWith(q));
  const words = q.split(/\s+/);
  const rest = options.filter((o) => !exact.includes(o) && !starts.includes(o) && words.every((w) => `${o.code} ${o.name} ${o.city || ''} ${o.group}`.toLowerCase().includes(w)));
  return [...exact, ...starts, ...rest].slice(0, limit);
};

// ---------------------------------------------------------------------------
// Input and validation
// ---------------------------------------------------------------------------
export interface VoucherLineInput {
  account: AccountRef;
  debit: number;
  credit: number;
  narration?: string;
}

export interface VoucherInput {
  type: VoucherType;
  date: string;
  narration: string;
  lines: VoucherLineInput[];
  /** Bank of a BPV / BRV (chart code); empty = the main bank. */
  bankCode?: string;
}

export interface VoucherContext {
  accounts: Account[];
  customers: Customer[];
  suppliers: Supplier[];
  bankCodes: string[];
  settings: Pick<AppSettings, 'booksLockedUntil' | 'cashOpeningDate'>;
  today: string;
}

const isMoneyCode = (code: string, bankCodes: string[]) => code === ACC.CASH || bankCodes.includes(code);

/** Clean lines: numbers rounded, empty lines dropped. */
export const cleanLines = (lines: VoucherLineInput[]): VoucherLineInput[] =>
  (lines || [])
    .map((l) => ({ account: (l.account || '').trim(), debit: round2(Math.max(0, Number(l.debit) || 0)), credit: round2(Math.max(0, Number(l.credit) || 0)), narration: (l.narration || '').trim() || undefined }))
    .filter((l) => l.account || l.debit > 0 || l.credit > 0);

export const voucherTotals = (lines: VoucherLineInput[]) => ({
  debit: round2(lines.reduce((a, l) => a + (Number(l.debit) || 0), 0)),
  credit: round2(lines.reduce((a, l) => a + (Number(l.credit) || 0), 0)),
});

/** Amount of the implied cash / bank side (positive), or 0 for a JV. */
export const moneySideAmount = (type: VoucherType, lines: VoucherLineInput[]) => {
  const t = voucherTotals(lines);
  const info = voucherTypeInfo(type);
  if (!info.money) return 0;
  return round2(info.side === 'pay' ? t.debit - t.credit : t.credit - t.debit);
};

/** Chart code of the implied money side. */
export const moneySideCode = (type: VoucherType, bankCode?: string) => {
  const info = voucherTypeInfo(type);
  return info.money === 'cash' ? ACC.CASH : info.money === 'bank' ? bankCode || MAIN_BANK_CODE : null;
};

export const validateVoucher = (input: VoucherInput, ctx: VoucherContext): string[] => {
  const errors: string[] = [];
  const info = VOUCHER_TYPES.find((x) => x.id === input.type);
  if (!info) return ['Pick the voucher type.'];
  const lines = cleanLines(input.lines);
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.push('Enter a valid date.');
  else {
    if (input.date > ctx.today) errors.push('The date cannot be in the future.');
    const locked = booksLockedFor(ctx.settings, input.date);
    if (locked) errors.push(locked);
  }
  if (!input.narration.trim()) errors.push('Write the narration (what this voucher is for).');
  if (info.money === 'bank' && !ctx.bankCodes.includes(input.bankCode || MAIN_BANK_CODE)) errors.push('Pick the bank account.');
  if (lines.length < (info.money ? 1 : 2)) errors.push(info.money ? 'Add at least one line.' : 'A journal voucher needs at least two lines.');
  const known = new Set(ctx.accounts.map((a) => a.code));
  const side = moneySideCode(input.type, input.bankCode);
  let touchesMoney = Boolean(info.money);
  lines.forEach((l, i) => {
    const n = `Line ${i + 1}`;
    const r = parseRef(l.account);
    if (!l.account) errors.push(`${n}: pick an account.`);
    else if (r.kind === 'customer' && !ctx.customers.some((c) => c.id === r.id)) errors.push(`${n}: that customer no longer exists.`);
    else if (r.kind === 'supplier' && !ctx.suppliers.some((s) => s.id === r.id)) errors.push(`${n}: that supplier no longer exists.`);
    else if (r.kind === 'account') {
      if (!known.has(r.code)) errors.push(`${n}: unknown account ${r.code}.`);
      else if (BLOCKED_LINE_ACCOUNTS[r.code]) errors.push(`${n}: ${BLOCKED_LINE_ACCOUNTS[r.code]}`);
      else if (side && r.code === side) errors.push(`${n}: the ${info.money === 'cash' ? 'cash' : 'bank'} side is added by itself. Pick the other account.`);
      if (isMoneyCode(r.code, ctx.bankCodes)) touchesMoney = true;
    }
    if (l.debit > 0 && l.credit > 0) errors.push(`${n}: use either debit or credit, not both.`);
    if (l.debit <= 0 && l.credit <= 0) errors.push(`${n}: enter a debit or a credit amount.`);
  });
  const t = voucherTotals(lines);
  if (info.money) {
    const net = moneySideAmount(input.type, lines);
    if (lines.length && net <= 0) errors.push(info.side === 'pay' ? 'A payment voucher must pay out money: debits must be more than credits.' : 'A receipt voucher must bring money in: credits must be more than debits.');
  } else if (lines.length) {
    if (t.debit <= 0) errors.push('The voucher total must be more than zero.');
    if (Math.abs(t.debit - t.credit) >= EPS) errors.push(`Debits (${t.debit}) must equal credits (${t.credit}).`);
  }
  if (touchesMoney && input.date && ctx.settings.cashOpeningDate && input.date < ctx.settings.cashOpeningDate) {
    errors.push(`Cash and bank are counted from ${ctx.settings.cashOpeningDate}. A voucher that moves cash or bank must be on or after that date.`);
  }
  return errors;
};

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------
const partyName = (ctx: { customers: Customer[]; suppliers: Supplier[] }, ref: AccountRef) => {
  const r = parseRef(ref);
  if (r.kind === 'customer') return ctx.customers.find((c) => c.id === r.id)?.name || 'Customer';
  if (r.kind === 'supplier') {
    const s = ctx.suppliers.find((x) => x.id === r.id);
    return s ? s.company || s.name : 'Supplier';
  }
  return '';
};

/** The journal entry a voucher posts (its lines + the implied cash / bank line). */
export const voucherEntry = (
  input: VoucherInput,
  meta: { id: string; number: string; createdAt: string; createdBy?: string; updatedAt?: string; updatedBy?: string },
  ctx: { customers: Customer[]; suppliers: Supplier[] }
): JournalEntry => {
  const lines = cleanLines(input.lines);
  const out: JournalLine[] = lines.map((l) => {
    const r = parseRef(l.account);
    const code = r.kind === 'customer' ? ACC.RECEIVABLE : r.kind === 'supplier' ? ACC.PAYABLE : r.code;
    const who = r.kind === 'account' ? '' : partyName(ctx, l.account);
    const memo = [who, l.narration].filter(Boolean).join(' — ') || undefined;
    return {
      accountCode: code,
      debit: l.debit,
      credit: l.credit,
      ...(memo ? { memo } : {}),
      ...(l.narration ? { narration: l.narration } : {}),
      ...(r.kind !== 'account' ? { partyType: r.kind, partyId: r.id } : {}),
    };
  });
  const side = moneySideCode(input.type, input.bankCode);
  const amt = moneySideAmount(input.type, lines);
  if (side && amt > 0) {
    const info = voucherTypeInfo(input.type);
    out.push({ accountCode: side, debit: info.side === 'pay' ? 0 : amt, credit: info.side === 'pay' ? amt : 0, memo: input.narration.trim(), moneySide: true });
  }
  return {
    id: meta.id,
    date: input.date,
    ref: meta.number,
    memo: input.narration.trim(),
    lines: out,
    source: 'manual',
    voucherType: input.type,
    ...(voucherTypeInfo(input.type).money === 'bank' ? { bankCode: input.bankCode || MAIN_BANK_CODE } : {}),
    createdAt: meta.createdAt,
    ...(meta.createdBy ? { createdBy: meta.createdBy } : {}),
    ...(meta.updatedAt ? { updatedAt: meta.updatedAt } : {}),
    ...(meta.updatedBy ? { updatedBy: meta.updatedBy } : {}),
  };
};

/** The input a saved voucher was made from (for editing / copying). */
export const voucherInputOf = (v: JournalEntry): VoucherInput => {
  const lines = v.lines.filter((l) => !l.moneySide);
  return {
    type: v.voucherType || 'JV',
    date: v.date,
    narration: v.memo,
    bankCode: v.bankCode,
    lines: lines.map((l) => {
      const account = l.partyType === 'customer' && l.partyId ? custRef(l.partyId) : l.partyType === 'supplier' && l.partyId ? suppRef(l.partyId) : l.accountCode;
      return { account, debit: l.debit, credit: l.credit, narration: l.narration || undefined };
    }),
  };
};

/** Reverse map: expense account code -> expense category (for expense records made by a voucher). */
const CATEGORY_OF: Record<string, ExpenseCategory> = Object.fromEntries(Object.entries(EXPENSE_ACCOUNT).map(([cat, code]) => [code, cat as ExpenseCategory]));

export interface VoucherRecords {
  ledger: LedgerEntry[];
  cashEntries: CashEntry[];
  expenses: Expense[];
  /** Change to each party's balance: customers' totalDue / suppliers' totalOwed, key "customer|id" / "supplier|id". */
  partyDelta: Map<string, number>;
}

/**
 * The everyday records a voucher writes so the screens that read them (party balances and statements,
 * cash book, daily sheet, expense sheets, Money, bank reconciliation) agree with the journal.
 */
export const voucherRecords = (
  v: JournalEntry,
  ctx: { accounts: Account[]; customers: Customer[]; suppliers: Supplier[]; bankCodes: string[]; uid: (p: string) => string; userName?: string; stamp?: { branchId?: string } }
): VoucherRecords => {
  const type = v.voucherType || 'JV';
  const info = voucherTypeInfo(type);
  const input = voucherInputOf(v);
  const lines = cleanLines(input.lines);
  const method = info.money === 'cash' ? 'Cash' : 'Bank Transfer';
  const bank = info.money === 'bank' ? v.bankCode || MAIN_BANK_CODE : undefined;
  const ledger: LedgerEntry[] = [];
  const cashEntries: CashEntry[] = [];
  const expenses: Expense[] = [];
  const partyDelta = new Map<string, number>();
  const running = new Map<string, number>();
  const base = { voucherId: v.id, ...(ctx.stamp || {}) };
  const created = (v.createdAt || '').slice(0, 10) || v.date;
  const text = (l: VoucherLineInput) => `${v.ref}: ${l.narration || v.memo}`;
  const typeOfAccount = (code: string) => ctx.accounts.find((a) => a.code === code)?.type;
  const moneyOf = (code: string) => (code === ACC.CASH ? { method: 'Cash' } : { method: 'Bank Transfer', bankCode: code });

  const addParty = (kind: 'customer' | 'supplier', id: string, row: Omit<LedgerEntry, 'id' | 'entityType' | 'entityId' | 'balanceAfter' | 'referenceId' | 'date' | 'sourceId'>) => {
    const key = `${kind}|${id}`;
    const delta = round2((row.debit || 0) - (row.credit || 0));
    partyDelta.set(key, round2((partyDelta.get(key) || 0) + delta));
    const start = running.has(key)
      ? running.get(key)!
      : kind === 'customer'
        ? ctx.customers.find((c) => c.id === id)?.totalDue || 0
        : ctx.suppliers.find((s) => s.id === id)?.totalOwed || 0;
    const after = round2(start + delta);
    running.set(key, after);
    ledger.push({ id: ctx.uid('led'), entityType: kind, entityId: id, referenceId: v.ref, date: v.date, sourceId: v.id, balanceAfter: after, ...row, ...base });
  };
  const addCash = (direction: 'in' | 'out', amount: number, description: string, money: { method: string; bankCode?: string }, extra: Partial<CashEntry> = {}) => {
    cashEntries.push({ id: ctx.uid('cash'), date: v.date, direction, amount, description, method: money.method, ...(money.bankCode ? { bankCode: money.bankCode } : {}), createdAt: created, ...(ctx.userName ? { createdBy: ctx.userName } : {}), ...extra, ...base });
  };

  lines.forEach((l) => {
    const r = parseRef(l.account);
    const amount = l.debit > 0 ? l.debit : l.credit;
    const isDebit = l.debit > 0;
    if (info.money) {
      const money = { method, ...(bank ? { bankCode: bank } : {}) };
      if (r.kind === 'customer') {
        // Dr customer = money handed to them (refund); Cr customer = money received from them.
        addParty('customer', r.id, isDebit
          ? { type: 'refund_paid', description: text(l), debit: amount, credit: 0, ...money }
          : { type: 'payment_received', description: text(l), debit: 0, credit: amount, ...money });
      } else if (r.kind === 'supplier') {
        // Supplier ledger: debit = owed more. Dr supplier (paid them) = less owed; Cr supplier = money back from them.
        addParty('supplier', r.id, isDebit
          ? { type: 'payment_made', description: text(l), debit: 0, credit: amount, ...money }
          : { type: 'voucher', description: text(l), debit: amount, credit: 0, ...money });
      } else if (isMoneyCode(r.code, ctx.bankCodes)) {
        // Cash <-> bank inside a cash / bank voucher: a transfer with two legs.
        const pairId = ctx.uid('xfer');
        addCash(isDebit ? 'out' : 'in', amount, text(l), money, { pairId });
        addCash(isDebit ? 'in' : 'out', amount, text(l), moneyOf(r.code), { pairId });
      } else if (isDebit && (typeOfAccount(r.code) === 'expense' || CATEGORY_OF[r.code])) {
        expenses.push({
          id: ctx.uid('exp'),
          date: v.date,
          category: CATEGORY_OF[r.code] || 'other',
          amount,
          description: text(l),
          paidVia: method,
          ...(bank ? { bankCode: bank } : {}),
          truckId: null,
          dispatchId: null,
          createdAt: created,
          ...(ctx.userName ? { createdBy: ctx.userName } : {}),
          ...base,
        });
      } else {
        addCash(isDebit ? 'out' : 'in', amount, text(l), money, { accountCode: r.code });
      }
    } else {
      if (r.kind === 'customer') addParty('customer', r.id, { type: 'voucher', description: text(l), debit: l.debit, credit: l.credit });
      else if (r.kind === 'supplier') addParty('supplier', r.id, { type: 'voucher', description: text(l), debit: l.credit, credit: l.debit });
      else if (isMoneyCode(r.code, ctx.bankCodes)) addCash(isDebit ? 'in' : 'out', amount, text(l), moneyOf(r.code));
    }
  });
  return { ledger, cashEntries, expenses, partyDelta };
};

/** Total paid to suppliers by a payment voucher (for the "big supplier payment" approval rule). */
export const voucherSupplierPayments = (input: VoucherInput) =>
  voucherTypeInfo(input.type).side === 'pay' ? round2(cleanLines(input.lines).filter((l) => parseRef(l.account).kind === 'supplier').reduce((a, l) => a + l.debit - l.credit, 0)) : 0;

export const isVoucher = (e: Pick<JournalEntry, 'voucherType'>) => Boolean(e.voucherType);

// ---------------------------------------------------------------------------
// Account ledger (any account: a chart account, a customer or a supplier)
// ---------------------------------------------------------------------------
export interface AccountLedgerRow {
  date: string;
  ref: string;
  narration: string;
  debit: number;
  credit: number;
  /** Running balance, debit-positive. */
  balance: number;
}

export interface AccountLedgerReport {
  ref: AccountRef;
  code: string;
  title: string;
  from: string;
  to: string;
  opening: number;
  rows: AccountLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

/**
 * The old program's "Account Ledger": opening balance (OB), then every posting in the period with a running
 * Dr / Cr balance, and the grand total. Chart accounts come from the journal; a customer or supplier from
 * their own ledger rows (what their statement shows), in accounting terms: a supplier's bill is a credit.
 */
export const accountLedger = (
  ref: AccountRef,
  from: string,
  to: string,
  src: { journal: JournalEntry[]; accounts: Account[]; customers: Customer[]; suppliers: Supplier[]; ledger: LedgerEntry[] }
): AccountLedgerReport => {
  const r = parseRef(ref);
  if (r.kind === 'account') {
    const gl = generalLedger(src.journal, r.code, from, to);
    const acc = src.accounts.find((a) => a.code === r.code);
    return {
      ref,
      code: r.code,
      title: acc?.name || `Account ${r.code}`,
      from,
      to,
      opening: gl.opening,
      rows: gl.lines.map((l) => ({ date: l.date, ref: l.ref, narration: l.memo, debit: l.debit, credit: l.credit, balance: l.balance })),
      totalDebit: gl.totalDebit,
      totalCredit: gl.totalCredit,
      closing: gl.closing,
    };
  }
  const isCust = r.kind === 'customer';
  const party = isCust ? src.customers.find((c) => c.id === r.id) : src.suppliers.find((s) => s.id === r.id);
  const rows = src.ledger.filter((l) => l.entityType === r.kind && l.entityId === r.id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Debit-positive amounts: customer rows as they are; a supplier's "owed more" (ledger debit) is a credit.
  const dr = (l: LedgerEntry) => round2(isCust ? Number(l.debit) || 0 : Number(l.credit) || 0);
  const cr = (l: LedgerEntry) => round2(isCust ? Number(l.credit) || 0 : Number(l.debit) || 0);
  const recorded = party ? (isCust ? (party as Customer).totalDue : -(party as Supplier).totalOwed) : 0;
  const net = round2(rows.reduce((a, l) => a + dr(l) - cr(l), 0));
  // Opening dues typed in when the account was made (not explained by any row) count from the start.
  let running = round2(recorded - net);
  const out: AccountLedgerRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  rows.forEach((l) => {
    if (l.date > to) return;
    running = round2(running + dr(l) - cr(l));
    if (l.date < from) return;
    totalDebit = round2(totalDebit + dr(l));
    totalCredit = round2(totalCredit + cr(l));
    out.push({ date: l.date, ref: l.referenceId, narration: l.description, debit: dr(l), credit: cr(l), balance: running });
  });
  const opening = round2(running - totalDebit + totalCredit);
  const title = party ? (isCust ? party.name : (party as Supplier).company || party.name) : isCust ? 'Customer' : 'Supplier';
  return { ref, code: party?.code || '', title, from, to, opening, rows: out, totalDebit, totalCredit, closing: running };
};

export const ledgerCsv = (rep: AccountLedgerReport) => ({
  headers: ['Date', 'VchNo', 'Narration', 'Debit', 'Credit', 'Balance', 'Dr/Cr'],
  rows: [
    [rep.from, 'OB', 'Opening balance', '', '', Math.abs(rep.opening), rep.opening > 0 ? 'Dr' : rep.opening < 0 ? 'Cr' : ''],
    ...rep.rows.map((x) => [x.date, x.ref, x.narration, x.debit || '', x.credit || '', Math.abs(x.balance), x.balance > 0 ? 'Dr' : x.balance < 0 ? 'Cr' : '']),
    ['', '', 'Grand Total', rep.totalDebit, rep.totalCredit, Math.abs(rep.closing), rep.closing > 0 ? 'Dr' : rep.closing < 0 ? 'Cr' : ''],
  ] as (string | number)[][],
});

export { drCr };

// ---------------------------------------------------------------------------
// Receivable & payable reports (by city)
// ---------------------------------------------------------------------------
export type PartyReportKind = 'both' | 'receivable' | 'payable';

export interface PartyBalanceRow {
  ref: AccountRef;
  type: 'Customer' | 'Supplier';
  code: string;
  name: string;
  city: string;
  phone: string;
  /** Debit-positive: + receivable (they owe the shop), − payable (the shop owes them). */
  balance: number;
}

export interface PartyBalanceGroup {
  city: string;
  rows: PartyBalanceRow[];
  receivable: number;
  payable: number;
}

export interface PartyBalanceReport {
  kind: PartyReportKind;
  cityWise: boolean;
  groups: PartyBalanceGroup[];
  receivable: number;
  payable: number;
  count: number;
}

export const NO_CITY = '(No city)';
export const cityOf = (p: { city?: string }) => (p.city || '').trim();
const cityKey = (c: string) => c.trim().toLowerCase();

/** Receivable and / or payable balances, optionally grouped by city with subtotals, and a grand total. */
export const partyBalanceReport = (
  customers: Customer[],
  suppliers: Supplier[],
  opts: { kind: PartyReportKind; cityWise: boolean; city?: string }
): PartyBalanceReport => {
  const all: PartyBalanceRow[] = [
    ...customers.map((c) => ({ ref: custRef(c.id), type: 'Customer' as const, code: c.code || '', name: c.name, city: cityOf(c), phone: c.phone || '', balance: round2(Number(c.totalDue) || 0) })),
    ...suppliers.map((s) => ({ ref: suppRef(s.id), type: 'Supplier' as const, code: s.code || '', name: s.company || s.name, city: cityOf(s), phone: s.phone || '', balance: round2(-(Number(s.totalOwed) || 0)) })),
  ];
  const want = all.filter((r) => (opts.kind === 'receivable' ? r.balance > EPS : opts.kind === 'payable' ? r.balance < -EPS : Math.abs(r.balance) > EPS)).filter((r) => !opts.city || cityKey(r.city) === cityKey(opts.city));
  const sortRows = (rows: PartyBalanceRow[]) => rows.sort((a, b) => a.name.localeCompare(b.name));
  const sum = (rows: PartyBalanceRow[]) => ({
    receivable: round2(rows.filter((r) => r.balance > 0).reduce((a, r) => a + r.balance, 0)),
    payable: round2(rows.filter((r) => r.balance < 0).reduce((a, r) => a - r.balance, 0)),
  });
  let groups: PartyBalanceGroup[];
  if (opts.cityWise) {
    const by = new Map<string, { city: string; rows: PartyBalanceRow[] }>();
    want.forEach((r) => {
      const k = cityKey(r.city) || '~';
      const g = by.get(k) || { city: r.city || NO_CITY, rows: [] };
      g.rows.push(r);
      by.set(k, g);
    });
    groups = Array.from(by.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, g]) => ({ city: g.city, rows: sortRows(g.rows), ...sum(g.rows) }));
  } else groups = want.length ? [{ city: '', rows: sortRows(want), ...sum(want) }] : [];
  const t = sum(want);
  return { kind: opts.kind, cityWise: opts.cityWise, groups, receivable: t.receivable, payable: t.payable, count: want.length };
};

export const partyReportTitle = (kind: PartyReportKind, cityWise: boolean) =>
  `${kind === 'both' ? 'Receivable and Payable' : kind === 'receivable' ? 'Receivable' : 'Payable'}${cityWise ? ' City-wise' : ''}`;

export const partyReportCsv = (rep: PartyBalanceReport) => {
  const rows: (string | number)[][] = [];
  rep.groups.forEach((g) => {
    g.rows.forEach((r) => rows.push([r.code, r.name, r.type, r.city, r.phone, Math.abs(r.balance), r.balance > 0 ? 'Dr' : 'Cr']));
    if (rep.cityWise) rows.push(['', `Subtotal ${g.city}`, '', '', '', `Dr ${g.receivable} / Cr ${g.payable}`, '']);
  });
  rows.push(['', 'Grand total receivable', '', '', '', rep.receivable, 'Dr']);
  rows.push(['', 'Grand total payable', '', '', '', rep.payable, 'Cr']);
  return { headers: ['Code', 'Name', 'Type', 'City', 'Phone', 'Balance', 'Dr/Cr'], rows };
};

/** Every city used on a customer or supplier plus the managed list, sorted, without duplicates. */
export const allCities = (settings: Pick<AppSettings, 'cities'>, customers: { city?: string }[], suppliers: { city?: string }[]) => {
  const seen = new Map<string, string>();
  [...(settings.cities || []), ...customers.map(cityOf), ...suppliers.map(cityOf)].forEach((c) => {
    const t = (c || '').trim();
    if (t && !seen.has(cityKey(t))) seen.set(cityKey(t), t);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
};

/**
 * Search parties by city (exact, case-insensitive; '' = any) and by ID / name / shop / city / contact person /
 * phone. Every word must match (any order); Urdu typed on an Arabic keyboard still finds Urdu names.
 */
export const filterParties = <T extends { name: string; code?: string; phone?: string; city?: string; company?: string; contactPerson?: string }>(rows: T[], query: string, city: string): T[] => {
  const c = cityKey(city || '');
  const words = searchWords(query);
  const qDigits = query.replace(/[^0-9]/g, '');
  return rows.filter(
    (r) =>
      (!c || cityKey(r.city || '') === c) &&
      (words.length === 0 ||
        // The phone takes part only when the search has 3+ digits, so a code like "Z01" is not also
        // matched by every phone number containing "01".
        matchesWords(words, searchHaystack([r.name, r.code, r.company, r.city, r.contactPerson, qDigits.length >= 3 ? (r.phone || '').replace(/[^0-9]/g, '') : ''])) ||
        // A phone typed with spaces or dashes still matches: "0300 123" → 0300123.
        Boolean(qDigits.length >= 3 && (r.phone || '').replace(/[^0-9]/g, '').includes(qDigits)))
  );
};

// ---------------------------------------------------------------------------
// Chart of accounts as a tree
// ---------------------------------------------------------------------------
export interface ChartNode {
  key: string;
  code: string;
  name: string;
  kind: 'group' | 'account' | 'party';
  type?: Account['type'];
  /** This account's own postings (debit-positive). */
  balance: number;
  /** Own + sub-accounts (parties are shown, not added: the control account already holds them). */
  total: number;
  children: ChartNode[];
  system?: boolean;
  isBank?: boolean;
  ref?: AccountRef;
}

const ROOTS: { type: Account['type']; code: string; name: string }[] = [
  { type: 'asset', code: '1', name: 'Assets' },
  { type: 'liability', code: '2', name: 'Liabilities' },
  { type: 'equity', code: '3', name: 'Equity' },
  { type: 'income', code: '4', name: 'Income' },
  { type: 'expense', code: '5', name: 'Expenses' },
];

export const chartTree = (accounts: Account[], balances: Map<string, { net: number }>, customers: Customer[], suppliers: Supplier[]): ChartNode[] => {
  const nodes = new Map<string, ChartNode>();
  accounts.forEach((a) => nodes.set(a.code, { key: a.code, code: a.code, name: a.name, kind: 'account', type: a.type, balance: balances.get(a.code)?.net ?? 0, total: 0, children: [], system: a.system, isBank: a.isBank || a.code === ACC.BANK, ref: a.code }));
  const roots = ROOTS.map((r) => ({ key: `root-${r.type}`, code: r.code, name: r.name, kind: 'group' as const, type: r.type, balance: 0, total: 0, children: [] as ChartNode[] }));
  accounts.forEach((a) => {
    const n = nodes.get(a.code)!;
    const parent = a.parent && a.parent !== a.code ? nodes.get(a.parent) : undefined;
    if (parent) parent.children.push(n);
    else (roots.find((r) => r.type === a.type) || roots[0]).children.push(n);
  });
  const rec = nodes.get(ACC.RECEIVABLE);
  if (rec) rec.children.push(...[...customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ key: `c-${c.id}`, code: c.code || '', name: c.name, kind: 'party' as const, balance: round2(c.totalDue), total: round2(c.totalDue), children: [], ref: custRef(c.id) })));
  const pay = nodes.get(ACC.PAYABLE);
  if (pay) pay.children.push(...[...suppliers].sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name)).map((s) => ({ key: `s-${s.id}`, code: s.code || '', name: s.company || s.name, kind: 'party' as const, balance: round2(-s.totalOwed), total: round2(-s.totalOwed), children: [], ref: suppRef(s.id) })));
  const sortTree = (n: ChartNode) => {
    n.children.sort((a, b) => (a.kind === 'party') === (b.kind === 'party') ? (a.kind === 'party' ? 0 : a.code.localeCompare(b.code, undefined, { numeric: true })) : a.kind === 'party' ? 1 : -1);
    n.children.forEach(sortTree);
  };
  const totals = (n: ChartNode): number => {
    const sub = n.children.filter((c) => c.kind !== 'party').reduce((a, c) => a + totals(c), 0);
    n.children.filter((c) => c.kind === 'party').forEach((c) => totals(c));
    n.total = round2(n.balance + sub);
    return n.total;
  };
  roots.forEach((r) => { sortTree(r); totals(r); });
  return roots;
};

/** First free code under a parent account (same thousand), e.g. 6000 -> 6001, 1010 -> 1011. */
export const suggestSubCode = (parentCode: string, taken: string[]): string | null => {
  const p = parseInt(parentCode, 10);
  if (!Number.isFinite(p)) return null;
  const used = new Set(taken);
  const top = Math.floor(p / 1000) * 1000 + 999;
  for (let n = p + 1; n <= top; n++) if (!used.has(String(n))) return String(n);
  return null;
};

export { round2 as roundVoucher };
