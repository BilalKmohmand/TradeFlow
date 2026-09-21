/**
 * Double-entry general ledger.
 *
 * The shop keeps working exactly as before (bills, payments, expenses, stock). Everything here is
 * DERIVED from those records: `buildJournal` turns them into balanced journal entries (source 'auto'),
 * and the accountant can add manual journal entries on top. Reports (trial balance, general ledger,
 * profit & loss, balance sheet) are computed from the combined journal.
 *
 * Posting rules (one entry per business event):
 *  - Opening balances (settings)      Dr Cash 1000 / Bank 1010            Cr Opening balance equity 3900
 *  - Bill (bill_issued ledger row)     Dr Receivable 1100 (total)          Cr Sales 4000 (subtotal)
 *                                      Dr Sales discounts 4010 (discount)  Cr Sales tax payable 2100 (tax)
 *                                      Cr Freight income 4100 (freight/handling charges, if any)
 *                                      Dr COGS 5000 / Cr Inventory 1200 at the item cost captured on the bill
 *  - Dispatch billed (trading)         Dr Receivable 1100                  Cr Sales 4000 / Freight 4100 / Tax 2100
 *                                      Dr COGS 5000 / Cr Inventory 1200 at weighted purchase cost
 *  - Customer payment                  Dr Cash 1000 or Bank 1010 (by method) Cr Receivable 1100
 *  - Sales return (credit note)        Dr Sales returns 4020               Cr Receivable 1100 (+ stock back at cost)
 *                                      Dr Sales tax payable 2100 for the tax part of a bill return
 *  - Refund paid for a return          Dr Receivable 1100                  Cr Cash 1000 / Bank 1010
 *  - Line discounts on a bill          Dr Sales discounts 4010 (with the bill-level discount)
 *  - Purchase / stock received         Dr Inventory 1200                   Cr Payable 2000
 *  - Supplier payment                  Dr Payable 2000                     Cr Cash / Bank
 *  - Purchase return (debit note)      Dr Payable 2000                     Cr Inventory 1200
 *  - Expense paid                      Dr expense account (6xxx) or Drawings 3100   Cr Cash / Bank
 *  - Expense on credit                 Dr expense account                  Cr Unpaid expenses 2010
 *  - Cash <-> bank transfer            Dr receiving side                   Cr giving side
 *  - Other cash entry in / out         Cash / Bank against Capital 3000 ("capital"), Drawings 3100 ("drawing")
 *                                      or Suspense 2900 for the accountant to reclassify
 *  - Stock adjustment                  Dr Stock losses 5100 / Cr Inventory (or the reverse) at cost
 *  - Opening stock                     Dr Inventory 1200                   Cr Opening balance equity 3900
 *  - Customer / supplier balances that are not explained by their history (opening dues typed in
 *    when the account was created) are posted against Opening balance equity so Receivable and
 *    Payable always equal the balances shown on the Customers and Suppliers screens.
 *
 * Money moved before the opening date is already inside the opening cash/bank figures, so the cash
 * side of anything dated before `cashOpeningDate` is posted to Opening balance equity instead. This
 * keeps the Cash and Bank accounts equal to the Money screen (`accountBalancesOn`).
 */
import {
  AppSettings,
  CashEntry,
  Customer,
  Dispatch,
  Expense,
  ExpenseCategory,
  Invoice,
  LedgerEntry,
  Product,
  Purchase,
  StockAdjustment,
  StockReturn,
  Supplier,
  isCashMethod,
} from '../types';
import { formatDate } from './formatters';
import { collectCashMovements, costPerKgOn } from './finance';

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface Account {
  /** Row id for storage (custom accounts); system accounts are identified by code. */
  id?: string;
  code: string;
  name: string;
  type: AccountType;
  /** System accounts are used by automatic postings and cannot be deleted. */
  system?: boolean;
  /** Code of a parent / group account (informational). */
  parent?: string;
  description?: string;
  createdAt?: string;
  createdBy?: string;
}

export interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  ref: string;
  memo: string;
  lines: JournalLine[];
  source: 'auto' | 'manual';
  /** What produced an auto entry: bill, dispatch, customer_payment, supplier_payment, purchase, expense, transfer, cash, ... */
  sourceType?: string;
  /** Id of the record that produced it (ledger row, expense, cash entry...). */
  sourceId?: string;
  /** Bill (invoice id) this entry belongs to, so screens can link straight back to it. */
  billId?: string;
  createdAt?: string;
  createdBy?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 0.005;

// ---------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------
export const ACC = {
  CASH: '1000',
  BANK: '1010',
  RECEIVABLE: '1100',
  INVENTORY: '1200',
  PAYABLE: '2000',
  UNPAID_EXPENSES: '2010',
  SALES_TAX: '2100',
  LOANS: '2200',
  SUSPENSE: '2900',
  CAPITAL: '3000',
  DRAWINGS: '3100',
  OPENING_EQUITY: '3900',
  SALES: '4000',
  SALES_DISCOUNTS: '4010',
  SALES_RETURNS: '4020',
  FREIGHT_INCOME: '4100',
  OTHER_INCOME: '4900',
  COGS: '5000',
  STOCK_LOSSES: '5100',
  OTHER_EXPENSES: '6800',
  BANK_CHARGES: '6900',
} as const;

/** Where each expense category is posted. Owner drawings are equity, not an expense. */
export const EXPENSE_ACCOUNT: Record<ExpenseCategory, string> = {
  daily: '6000',
  employee: '6010',
  food: '6020',
  transport: '6030',
  fuel: '6040',
  labour: '6050',
  port_charges: '6060',
  rent: '6070',
  utilities: '6080',
  salaries: '6090',
  maintenance: '6100',
  tax: '6110',
  commission: '6120',
  other: ACC.OTHER_EXPENSES,
  bank_charges: ACC.BANK_CHARGES,
  drawings: ACC.DRAWINGS,
};

const sys = (code: string, name: string, type: AccountType, description?: string): Account => ({ code, name, type, system: true, description });

export const DEFAULT_ACCOUNTS: Account[] = [
  sys('1000', 'Cash in hand', 'asset', 'Cash payments (Cash, Cash at Terminal)'),
  sys('1010', 'Bank', 'asset', 'Bank transfers, cheques, cards and mobile wallets (Easypaisa / JazzCash)'),
  sys('1100', 'Accounts receivable (customers)', 'asset', 'What customers owe you'),
  sys('1200', 'Inventory (stock at cost)', 'asset'),
  sys('2000', 'Accounts payable (suppliers)', 'liability', 'What you owe suppliers'),
  sys('2010', 'Unpaid expenses', 'liability', 'Expenses recorded as "Credit (unpaid)"'),
  sys('2100', 'Sales tax payable', 'liability'),
  sys('2200', 'Loans payable', 'liability'),
  sys('2900', 'Suspense (to be classified)', 'liability', 'Cash entries the app cannot classify; move them with a journal entry'),
  sys('3000', "Owner's capital", 'equity'),
  sys('3100', 'Owner drawings', 'equity', 'Money the owner took out'),
  sys('3900', 'Opening balance equity', 'equity', 'Balances brought in when the books started'),
  sys('4000', 'Sales', 'income'),
  sys('4010', 'Sales discounts', 'income', 'Contra-income: reduces sales'),
  sys('4020', 'Sales returns', 'income', 'Contra-income: goods returned by customers'),
  sys('4100', 'Freight & other charges income', 'income'),
  sys('4900', 'Other income', 'income'),
  sys('5000', 'Cost of goods sold', 'expense'),
  sys('5100', 'Stock losses & adjustments', 'expense'),
  sys('6000', 'Day-to-day expenses', 'expense'),
  sys('6010', 'Employee expenses', 'expense'),
  sys('6020', 'Food & refreshments', 'expense'),
  sys('6030', 'Transport & freight', 'expense'),
  sys('6040', 'Fuel', 'expense'),
  sys('6050', 'Loading / labour', 'expense'),
  sys('6060', 'Port & terminal charges', 'expense'),
  sys('6070', 'Rent', 'expense'),
  sys('6080', 'Utilities', 'expense'),
  sys('6090', 'Salaries', 'expense'),
  sys('6100', 'Vehicle maintenance', 'expense'),
  sys('6110', 'Taxes & duties', 'expense'),
  sys('6120', 'Broker commission', 'expense'),
  sys('6800', 'Other expenses', 'expense'),
  sys('6900', 'Bank charges', 'expense'),
];

export const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: 'asset', label: 'Asset' },
  { id: 'liability', label: 'Liability' },
  { id: 'equity', label: 'Equity' },
  { id: 'income', label: 'Income' },
  { id: 'expense', label: 'Expense' },
];

/** System chart plus the accountant's own accounts, sorted by code. */
export const mergeAccounts = (custom: Account[] = []): Account[] => {
  const byCode = new Map<string, Account>();
  DEFAULT_ACCOUNTS.forEach((a) => byCode.set(a.code, a));
  custom.forEach((a) => {
    if (!byCode.has(a.code)) byCode.set(a.code, { ...a, system: false });
  });
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
};

/** Asset and expense accounts normally carry a debit balance; the rest a credit balance. */
export const isDebitNormal = (type: AccountType) => type === 'asset' || type === 'expense';

export const validateAccount = (acc: { code: string; name: string; type: string }, existing: Account[]): string | null => {
  const code = (acc.code || '').trim();
  if (!/^\d{3,6}$/.test(code)) return 'Account code must be 3 to 6 digits.';
  if (!acc.name.trim()) return 'Give the account a name.';
  if (!ACCOUNT_TYPES.some((t) => t.id === acc.type)) return 'Pick an account type.';
  if (existing.some((a) => a.code === code)) return `Account ${code} already exists.`;
  return null;
};

// ---------------------------------------------------------------------------
// Entry validation
// ---------------------------------------------------------------------------
export const entryTotals = (lines: JournalLine[]) => ({
  debit: round2(lines.reduce((a, l) => a + (Number(l.debit) || 0), 0)),
  credit: round2(lines.reduce((a, l) => a + (Number(l.credit) || 0), 0)),
});

export const isBalanced = (lines: JournalLine[]) => {
  const t = entryTotals(lines);
  return Math.abs(t.debit - t.credit) < EPS;
};

export const validateEntry = (entry: Pick<JournalEntry, 'date' | 'lines'>, accounts: Account[] = DEFAULT_ACCOUNTS): { ok: boolean; errors: string[] } => {
  const errors: string[] = [];
  const known = new Set(accounts.map((a) => a.code));
  if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) errors.push('Enter a valid date.');
  const lines = entry.lines || [];
  if (lines.length < 2) errors.push('A journal entry needs at least two lines.');
  lines.forEach((l, i) => {
    const d = Number(l.debit) || 0;
    const c = Number(l.credit) || 0;
    if (!l.accountCode) errors.push(`Line ${i + 1}: pick an account.`);
    else if (!known.has(l.accountCode)) errors.push(`Line ${i + 1}: unknown account ${l.accountCode}.`);
    if (d < 0 || c < 0) errors.push(`Line ${i + 1}: amounts cannot be negative.`);
    if (d > 0 && c > 0) errors.push(`Line ${i + 1}: use either debit or credit, not both.`);
    if (d === 0 && c === 0) errors.push(`Line ${i + 1}: enter a debit or a credit amount.`);
  });
  // One account on both sides moves nothing and is almost always a slip.
  const debited = new Set(lines.filter((l) => (Number(l.debit) || 0) > 0).map((l) => l.accountCode));
  const both = lines.find((l) => (Number(l.credit) || 0) > 0 && debited.has(l.accountCode));
  if (both) errors.push(`Account ${both.accountCode} is on both the debit and the credit side. Use two different accounts.`);
  const t = entryTotals(lines);
  if (t.debit <= 0) errors.push('The entry total must be more than zero.');
  if (Math.abs(t.debit - t.credit) >= EPS) errors.push(`Debits (${t.debit}) must equal credits (${t.credit}).`);
  return { ok: errors.length === 0, errors };
};

// ---------------------------------------------------------------------------
// Building the automatic journal
// ---------------------------------------------------------------------------
export interface JournalSources {
  settings: AppSettings;
  customers: Customer[];
  suppliers: Supplier[];
  ledger: LedgerEntry[];
  invoices?: Invoice[];
  dispatches?: Dispatch[];
  purchases?: Purchase[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  products?: Product[];
  returns?: StockReturn[];
  adjustments?: StockAdjustment[];
}

/** Collects lines for one entry, merging same-account lines and dropping zeros. */
class EntryBuilder {
  private lines: JournalLine[] = [];
  dr(code: string, amount: number, memo?: string) {
    this.add(code, amount, memo);
    return this;
  }
  cr(code: string, amount: number, memo?: string) {
    this.add(code, -amount, memo);
    return this;
  }
  /** Signed add: positive = debit, negative = credit. */
  private add(code: string, signed: number, memo?: string) {
    const amt = round2(signed);
    if (Math.abs(amt) < EPS) return;
    this.lines.push(amt > 0 ? { accountCode: code, debit: amt, credit: 0, memo } : { accountCode: code, debit: 0, credit: -amt, memo });
  }
  build(): JournalLine[] {
    // Net lines on the same account and side-less memo so the entry reads cleanly.
    const net = new Map<string, { signed: number; memo?: string }>();
    this.lines.forEach((l) => {
      const cur = net.get(l.accountCode) || { signed: 0, memo: l.memo };
      cur.signed = round2(cur.signed + l.debit - l.credit);
      net.set(l.accountCode, cur);
    });
    const out: JournalLine[] = [];
    net.forEach((v, code) => {
      if (Math.abs(v.signed) < EPS) return;
      out.push(v.signed > 0 ? { accountCode: code, debit: v.signed, credit: 0, memo: v.memo } : { accountCode: code, debit: 0, credit: -v.signed, memo: v.memo });
    });
    // Debits first, then credits (conventional layout).
    return out.sort((a, b) => (b.debit > 0 ? 1 : 0) - (a.debit > 0 ? 1 : 0));
  }
}

const cashDrawingRe = /drawing|personal|owner (took|withdrew)/i;
const cashCapitalRe = /capital|investment|owner (put|added|brought)/i;

/** Refusal text when a date falls inside a closed period (books locked up to that date), else null. */
export const booksLockedFor = (settings: Pick<AppSettings, 'booksLockedUntil'>, date: string): string | null =>
  settings.booksLockedUntil && date && date <= settings.booksLockedUntil
    ? `The books are closed up to ${formatDate(settings.booksLockedUntil)}. Use a later date, or ask an admin to reopen the period in Accounts.`
    : null;

export const buildJournal = (src: JournalSources): JournalEntry[] => {
  const {
    settings,
    customers,
    suppliers,
    ledger,
    invoices = [],
    dispatches = [],
    purchases = [],
    expenses,
    cashEntries,
    products = [],
    returns = [],
    adjustments = [],
  } = src;
  const openingDate = settings.cashOpeningDate || '1970-01-01';
  const out: JournalEntry[] = [];
  const push = (e: Omit<JournalEntry, 'lines' | 'source'> & { builder: EntryBuilder }) => {
    const lines = e.builder.build();
    if (lines.length < 2) return;
    const { builder, ...rest } = e;
    void builder;
    out.push({ ...rest, lines, source: 'auto' });
  };

  // Payment method of every money movement, resolved exactly as the Money screen does.
  const movements = collectCashMovements(ledger, expenses, cashEntries, customers, suppliers);
  const methodOf = new Map<string, string | undefined>();
  movements.forEach((m) => methodOf.set(m.sourceId, m.method));
  /** Cash or bank account for a movement; before the opening date it is already in the opening figures. */
  const moneyAccount = (method: string | undefined, date: string) => (date < openingDate ? ACC.OPENING_EQUITY : isCashMethod(method) ? ACC.CASH : ACC.BANK);

  /** Cost on a date: what it was bought for up to then; the item's current cost price only as a last resort. */
  const productCost = (productId: string, date: string): number | null => {
    const dated = costPerKgOn(purchases, productId, date);
    if (dated != null && dated > 0) return dated;
    const p = products.find((x) => x.id === productId);
    return p?.costPricePerKg != null && p.costPricePerKg > 0 ? p.costPricePerKg : null;
  };

  // --- 1. Opening cash and bank -------------------------------------------------------------
  {
    const b = new EntryBuilder();
    const cash = Number(settings.cashOpeningBalance) || 0;
    const bank = Number(settings.openingBankBalance) || 0;
    b.dr(ACC.CASH, cash, 'Opening cash in hand').dr(ACC.BANK, bank, 'Opening bank balance').cr(ACC.OPENING_EQUITY, cash + bank);
    push({ id: 'auto-opening-money', date: openingDate, ref: 'OPENING', memo: 'Opening cash and bank balances', sourceType: 'opening', builder: b });
  }

  // --- 2. Customer and supplier ledgers ----------------------------------------------------
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const invByNumber = new Map(invoices.map((i) => [`${i.customerId}|${i.invoiceNumber}`, i]));
  const dispByNumber = new Map(dispatches.map((d) => [d.dispatchNumber, d]));
  const returnByNumber = new Map(returns.map((r) => [r.returnNumber, r]));
  const custName = new Map(customers.map((c) => [c.id, c.name]));
  const supName = new Map(suppliers.map((s) => [s.id, s.company || s.name]));

  ledger.forEach((l) => {
    const debit = round2(Number(l.debit) || 0);
    const credit = round2(Number(l.credit) || 0);
    if (debit <= 0 && credit <= 0) return;
    const who = l.entityType === 'customer' ? custName.get(l.entityId) || 'Customer' : supName.get(l.entityId) || 'Supplier';
    const b = new EntryBuilder();
    let sourceType: string = l.type;
    let billId: string | undefined;
    let memo = l.description || l.type;

    if (l.entityType === 'customer') {
      if (debit > 0) {
        if (l.type === 'bill_issued') {
          const inv = (l.sourceId && invById.get(l.sourceId)) || invByNumber.get(`${l.entityId}|${l.referenceId}`);
          sourceType = 'bill';
          billId = inv?.id || l.sourceId;
          b.dr(ACC.RECEIVABLE, debit, who);
          if (inv) {
            // Bill-level discount plus each line's own discount: sales are posted gross, discounts separately.
            const discount = (Number(inv.discount) || 0) + inv.items.reduce((a, it) => a + (Number(it.discountAmount) || 0), 0);
            const tax = Number(inv.taxAmount) || 0;
            const charges = (Number(inv.freightCharges) || 0) + (Number(inv.handlingCharges) || 0);
            b.dr(ACC.SALES_DISCOUNTS, discount).cr(ACC.SALES_TAX, tax).cr(ACC.FREIGHT_INCOME, charges);
            // Sales takes whatever is left so the entry always balances with the ledger amount.
            b.cr(ACC.SALES, debit + discount - tax - charges);
            // Cost captured on the bill line (batch cost when batches were used); older bills fall back to the purchase cost then.
            const cogs = inv.items.reduce((a, it) => {
              const unitCost = it.costPricePerKg && it.costPricePerKg > 0 ? it.costPricePerKg : productCost(it.productId, inv.issueDate);
              return a + (unitCost ? unitCost * (it.qty ?? it.kg ?? 0) : 0);
            }, 0);
            b.dr(ACC.COGS, cogs, 'Cost of items sold').cr(ACC.INVENTORY, cogs);
          } else {
            b.cr(ACC.SALES, debit);
          }
          memo = `Bill ${l.referenceId} — ${who}`;
        } else if (l.type === 'dispatch_billed') {
          const d = dispByNumber.get(l.referenceId);
          sourceType = 'dispatch';
          b.dr(ACC.RECEIVABLE, debit, who);
          if (d) {
            const freight = Number(d.freightCharge) || 0;
            const tax = Number(d.taxAmount) || 0;
            b.cr(ACC.FREIGHT_INCOME, freight).cr(ACC.SALES_TAX, tax).cr(ACC.SALES, debit - freight - tax);
            const cost = productCost(d.productId, d.date);
            if (cost != null) b.dr(ACC.COGS, cost * d.kg, 'Cost of goods dispatched').cr(ACC.INVENTORY, cost * d.kg);
          } else {
            b.cr(ACC.SALES, debit);
          }
          memo = `Dispatch ${l.referenceId} billed — ${who}`;
        } else if (l.type === 'refund_paid') {
          sourceType = 'customer_refund';
          if (l.sourceId && invById.has(l.sourceId)) billId = l.sourceId;
          b.dr(ACC.RECEIVABLE, debit, who).cr(moneyAccount(methodOf.get(l.id) ?? l.method, l.date), debit);
          memo = `Refund to ${who}${l.referenceId ? ` (${l.referenceId})` : ''}`;
        } else {
          b.dr(ACC.RECEIVABLE, debit, who).cr(ACC.SALES, debit);
          memo = `${l.description || 'Invoice'} — ${who}`;
        }
      }
      if (credit > 0) {
        if (l.type === 'payment_received') {
          sourceType = debit > 0 ? sourceType : 'customer_payment';
          if (!billId && l.sourceId && invById.has(l.sourceId)) billId = l.sourceId;
          b.dr(moneyAccount(methodOf.get(l.id) ?? l.method, l.date), credit).cr(ACC.RECEIVABLE, credit, who);
          if (debit <= 0) memo = `Received from ${who}${l.referenceId ? ` (${l.referenceId})` : ''}`;
        } else if (l.type === 'credit_note') {
          sourceType = 'sales_return';
          const r = returnByNumber.get(l.referenceId);
          // Tax on a bill return is handed back too: it comes off Sales tax payable, not Sales returns.
          const tax = r?.items?.length ? Math.min(credit, round2(Number(r.taxAmount) || 0)) : 0;
          b.dr(ACC.SALES_RETURNS, credit - tax).dr(ACC.SALES_TAX, tax).cr(ACC.RECEIVABLE, credit, who);
          if (r?.invoiceId) billId = r.invoiceId;
          if (r?.items?.length) {
            // Bill return: stock comes back at the cost it left at (captured on the bill line).
            const value = r.items.reduce((a, it) => {
              const unitCost = it.costPricePerKg && it.costPricePerKg > 0 ? it.costPricePerKg : productCost(it.productId, r.date);
              return a + (unitCost ? unitCost * it.qty : 0);
            }, 0);
            b.dr(ACC.INVENTORY, value, 'Returned stock at cost').cr(ACC.COGS, value);
          } else if (r) {
            const cost = productCost(r.productId, r.date);
            if (cost != null) b.dr(ACC.INVENTORY, cost * r.kg, 'Returned stock at cost').cr(ACC.COGS, cost * r.kg);
          }
          memo = `Credit note ${l.referenceId} — ${who}`;
        } else {
          b.dr(ACC.SUSPENSE, credit).cr(ACC.RECEIVABLE, credit, who);
        }
      }
    } else {
      // Supplier ledger: debit = more owed to the supplier, credit = less owed.
      if (debit > 0) {
        sourceType = l.type === 'purchase_received' ? 'purchase' : l.type;
        b.dr(ACC.INVENTORY, debit, l.kg ? `${l.kg} received` : undefined).cr(ACC.PAYABLE, debit, who);
        memo = `${l.description || 'Purchase'} — ${who}`;
      }
      if (credit > 0) {
        if (l.type === 'payment_made') {
          sourceType = debit > 0 ? sourceType : 'supplier_payment';
          b.dr(ACC.PAYABLE, credit, who).cr(moneyAccount(methodOf.get(l.id) ?? l.method, l.date), credit);
          if (debit <= 0) memo = `Paid to ${who}${l.referenceId ? ` (${l.referenceId})` : ''}`;
        } else if (l.type === 'debit_note') {
          sourceType = 'purchase_return';
          b.dr(ACC.PAYABLE, credit, who).cr(ACC.INVENTORY, credit, 'Stock returned to supplier');
          memo = `Debit note ${l.referenceId} — ${who}`;
        } else {
          b.dr(ACC.PAYABLE, credit, who).cr(ACC.SUSPENSE, credit);
        }
      }
    }
    push({ id: `auto-led-${l.id}`, date: l.date, ref: l.referenceId || l.type, memo, sourceType, sourceId: l.id, billId, builder: b });
  });

  // --- 3. Opening dues not explained by history --------------------------------------------
  const netByEntity = new Map<string, number>();
  ledger.forEach((l) => {
    const k = `${l.entityType}|${l.entityId}`;
    netByEntity.set(k, (netByEntity.get(k) || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0));
  });
  const ledgerNet = (type: 'customer' | 'supplier', id: string) => round2(netByEntity.get(`${type}|${id}`) || 0);
  const startDate = (createdAt?: string) => {
    const d = (createdAt || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : openingDate;
  };
  customers.forEach((c) => {
    const diff = round2((Number(c.totalDue) || 0) - ledgerNet('customer', c.id));
    if (Math.abs(diff) < EPS) return;
    const b = new EntryBuilder();
    b.dr(ACC.RECEIVABLE, diff, c.name).cr(ACC.OPENING_EQUITY, diff);
    push({ id: `auto-open-cust-${c.id}`, date: startDate(c.createdAt), ref: 'OPENING', memo: `Opening / unexplained balance — ${c.name}`, sourceType: 'customer_opening', sourceId: c.id, builder: b });
  });
  suppliers.forEach((s) => {
    const diff = round2((Number(s.totalOwed) || 0) - ledgerNet('supplier', s.id));
    if (Math.abs(diff) < EPS) return;
    const b = new EntryBuilder();
    b.dr(ACC.OPENING_EQUITY, diff).cr(ACC.PAYABLE, diff, s.company || s.name);
    push({ id: `auto-open-sup-${s.id}`, date: startDate(s.createdAt), ref: 'OPENING', memo: `Opening / unexplained balance — ${s.company || s.name}`, sourceType: 'supplier_opening', sourceId: s.id, builder: b });
  });

  // --- 4. Expenses ----------------------------------------------------------------------------
  expenses.forEach((e) => {
    const amount = round2(Number(e.amount) || 0);
    if (amount <= 0) return;
    const account = EXPENSE_ACCOUNT[e.category] || ACC.OTHER_EXPENSES;
    const onCredit = e.paidVia === 'Credit (unpaid)';
    const b = new EntryBuilder();
    b.dr(account, amount, e.description).cr(onCredit ? ACC.UNPAID_EXPENSES : moneyAccount(methodOf.get(e.id) ?? e.paidVia, e.date), amount);
    push({ id: `auto-exp-${e.id}`, date: e.date, ref: e.category === 'drawings' ? 'DRAWINGS' : 'EXPENSE', memo: e.description || e.category, sourceType: 'expense', sourceId: e.id, builder: b });
  });

  // --- 5. Cash entries: transfers and other movements --------------------------------------
  const byPair = new Map<string, CashEntry[]>();
  cashEntries.forEach((c) => {
    if (c.pairId) byPair.set(c.pairId, [...(byPair.get(c.pairId) || []), c]);
  });
  const handled = new Set<string>();
  byPair.forEach((legs, pairId) => {
    const inn = legs.find((x) => x.direction === 'in');
    const outLeg = legs.find((x) => x.direction === 'out');
    if (!inn || !outLeg || legs.length !== 2 || Math.abs(inn.amount - outLeg.amount) >= EPS || inn.date !== outLeg.date) return;
    handled.add(inn.id);
    handled.add(outLeg.id);
    const b = new EntryBuilder();
    b.dr(moneyAccount(methodOf.get(inn.id) ?? inn.method, inn.date), inn.amount).cr(moneyAccount(methodOf.get(outLeg.id) ?? outLeg.method, outLeg.date), outLeg.amount);
    push({ id: `auto-xfer-${pairId}`, date: inn.date, ref: 'TRANSFER', memo: inn.description || 'Cash / bank transfer', sourceType: 'transfer', sourceId: inn.id, builder: b });
  });
  cashEntries.forEach((c) => {
    if (handled.has(c.id)) return;
    const amount = round2(Number(c.amount) || 0);
    if (amount <= 0) return;
    const money = moneyAccount(methodOf.get(c.id) ?? c.method, c.date);
    const b = new EntryBuilder();
    if (c.direction === 'in') {
      const other = c.accountCode || (cashCapitalRe.test(c.description || '') ? ACC.CAPITAL : ACC.SUSPENSE);
      b.dr(money, amount).cr(other, amount, c.description);
    } else {
      const other = c.accountCode || (cashDrawingRe.test(c.description || '') ? ACC.DRAWINGS : ACC.SUSPENSE);
      b.dr(other, amount, c.description).cr(money, amount);
    }
    push({ id: `auto-cash-${c.id}`, date: c.date, ref: c.direction === 'in' ? 'CASH IN' : 'CASH OUT', memo: c.description || 'Cash entry', sourceType: 'cash', sourceId: c.id, builder: b });
  });

  // --- 6. Stock: adjustments and opening stock ---------------------------------------------
  adjustments.forEach((a) => {
    const cost = a.costPerKg && a.costPerKg > 0 ? a.costPerKg : productCost(a.productId, a.date);
    if (cost == null || !a.deltaKg) return;
    const value = round2(Math.abs(a.deltaKg) * cost);
    const b = new EntryBuilder();
    // Stock that arrived with no supplier bill: where it came from is for the accountant to decide.
    if (a.reason === 'received' && a.deltaKg > 0) b.dr(ACC.INVENTORY, value).cr(ACC.SUSPENSE, value, a.note || 'Stock received without a supplier bill');
    else if (a.deltaKg < 0) b.dr(ACC.STOCK_LOSSES, value, a.note || a.reason).cr(ACC.INVENTORY, value);
    else b.dr(ACC.INVENTORY, value).cr(ACC.STOCK_LOSSES, value, a.note || a.reason);
    push({ id: `auto-adj-${a.id}`, date: a.date.slice(0, 10), ref: 'STOCK ADJ', memo: `Stock adjustment (${a.reason})`, sourceType: 'stock_adjustment', sourceId: a.id, builder: b });
  });

  // Opening stock = today's stock with every recorded movement undone, valued at cost.
  const earliest = [openingDate, ...ledger.map((l) => l.date), ...expenses.map((e) => e.date), ...cashEntries.map((c) => c.date), ...adjustments.map((a) => a.date.slice(0, 10))]
    .filter(Boolean)
    .sort()[0];
  // Net stock movement per product since the start: + came in, − went out.
  const movedIn = new Map<string, number>();
  const move = (productId: string, qty: number) => movedIn.set(productId, (movedIn.get(productId) || 0) + (Number(qty) || 0));
  purchases.forEach((x) => move(x.productId, x.kg));
  // Bills made in the app took stock item by item (trading invoices carry no qty: stock left via dispatches).
  invoices.forEach((i) => i.items.forEach((it) => { if (it.qty != null) move(it.productId, -(it.qty || 0)); }));
  dispatches.forEach((d) => move(d.productId, -d.kg));
  returns.forEach((r) => {
    if (r.items?.length) r.items.forEach((it) => move(it.productId, r.kind === 'sales' ? it.qty : -it.qty));
    else move(r.productId, r.kind === 'sales' ? r.kg : -r.kg);
  });
  adjustments.forEach((a) => move(a.productId, a.deltaKg));
  products.forEach((p) => {
    const cost = productCost(p.id, earliest);
    if (cost == null) return;
    const openingQty = round2((Number(p.stockKg) || 0) - (movedIn.get(p.id) || 0));
    if (openingQty <= 0) return;
    const b = new EntryBuilder();
    b.dr(ACC.INVENTORY, openingQty * cost, `${openingQty} ${p.unit || 'kg'} ${p.name}`).cr(ACC.OPENING_EQUITY, openingQty * cost);
    push({ id: `auto-open-stock-${p.id}`, date: earliest, ref: 'OPENING', memo: `Opening stock — ${p.name}`, sourceType: 'opening_stock', sourceId: p.id, builder: b });
  });

  return out;
};

/** Auto + manual entries, oldest first (stable by id within a day). */
export const combineJournal = (auto: JournalEntry[], manual: JournalEntry[]): JournalEntry[] =>
  [...auto, ...manual].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.source === b.source ? 0 : a.source === 'auto' ? -1 : 1));

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export interface AccountBalance {
  debit: number;
  credit: number;
  /** debit - credit */
  net: number;
}

export const accountTotals = (entries: JournalEntry[], opts: { from?: string; to?: string } = {}): Map<string, AccountBalance> => {
  const map = new Map<string, AccountBalance>();
  entries.forEach((e) => {
    if (opts.from && e.date < opts.from) return;
    if (opts.to && e.date > opts.to) return;
    e.lines.forEach((l) => {
      const cur = map.get(l.accountCode) || { debit: 0, credit: 0, net: 0 };
      cur.debit = round2(cur.debit + (Number(l.debit) || 0));
      cur.credit = round2(cur.credit + (Number(l.credit) || 0));
      cur.net = round2(cur.debit - cur.credit);
      map.set(l.accountCode, cur);
    });
  });
  return map;
};

/** Balance of one account as of a date, debit-positive. */
export const accountBalance = (entries: JournalEntry[], code: string, asOf?: string) => accountTotals(entries, { to: asOf }).get(code)?.net ?? 0;

const unknownAccount = (code: string): Account => ({ code, name: `Unknown account ${code}`, type: code.startsWith('1') ? 'asset' : code.startsWith('2') ? 'liability' : code.startsWith('3') ? 'equity' : code.startsWith('4') ? 'income' : 'expense' });
const accountFor = (accounts: Account[], code: string) => accounts.find((a) => a.code === code) || unknownAccount(code);

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  difference: number;
}

export const trialBalance = (entries: JournalEntry[], accounts: Account[], asOf: string): TrialBalance => {
  const totals = accountTotals(entries, { to: asOf });
  const rows: TrialBalanceRow[] = [];
  totals.forEach((t, code) => {
    if (Math.abs(t.net) < EPS) return;
    rows.push({ account: accountFor(accounts, code), debit: t.net > 0 ? t.net : 0, credit: t.net < 0 ? -t.net : 0 });
  });
  rows.sort((a, b) => a.account.code.localeCompare(b.account.code, undefined, { numeric: true }));
  const totalDebit = round2(rows.reduce((a, r) => a + r.debit, 0));
  const totalCredit = round2(rows.reduce((a, r) => a + r.credit, 0));
  const difference = round2(totalDebit - totalCredit);
  return { asOf, rows, totalDebit, totalCredit, balanced: Math.abs(difference) < EPS, difference };
};

export interface GeneralLedgerLine {
  entryId: string;
  date: string;
  ref: string;
  memo: string;
  debit: number;
  credit: number;
  /** Running balance, debit-positive. */
  balance: number;
  source: 'auto' | 'manual';
  sourceType?: string;
  billId?: string;
}

export interface GeneralLedger {
  code: string;
  from: string;
  to: string;
  opening: number;
  lines: GeneralLedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

export const generalLedger = (entries: JournalEntry[], code: string, from: string, to: string): GeneralLedger => {
  let running = 0;
  const lines: GeneralLedgerLine[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  sorted.forEach((e) => {
    if (e.date > to) return;
    e.lines.forEach((l) => {
      if (l.accountCode !== code) return;
      const d = Number(l.debit) || 0;
      const c = Number(l.credit) || 0;
      running = round2(running + d - c);
      if (e.date < from) return;
      totalDebit = round2(totalDebit + d);
      totalCredit = round2(totalCredit + c);
      lines.push({ entryId: e.id, date: e.date, ref: e.ref, memo: l.memo && !e.memo.includes(l.memo) ? `${e.memo} · ${l.memo}` : e.memo, debit: d, credit: c, balance: running, source: e.source, sourceType: e.sourceType, billId: e.billId });
    });
  });
  const opening = round2(running - totalDebit + totalCredit);
  return { code, from, to, opening, lines, totalDebit, totalCredit, closing: running };
};

export interface StatementRow {
  account: Account;
  amount: number;
}

export interface ProfitAndLoss {
  from: string;
  to: string;
  income: StatementRow[];
  totalIncome: number;
  costOfSales: StatementRow[];
  totalCostOfSales: number;
  grossProfit: number;
  expenses: StatementRow[];
  totalExpenses: number;
  netProfit: number;
}

/** Cost-of-sales accounts are the 5xxx expense range; operating expenses are the rest. */
const isCostOfSales = (a: Account) => a.type === 'expense' && a.code.startsWith('5');

export const profitAndLoss = (entries: JournalEntry[], from: string, to: string, accounts: Account[] = DEFAULT_ACCOUNTS): ProfitAndLoss => {
  const totals = accountTotals(entries, { from, to });
  const income: StatementRow[] = [];
  const costOfSales: StatementRow[] = [];
  const expenses: StatementRow[] = [];
  totals.forEach((t, code) => {
    const account = accountFor(accounts, code);
    if (Math.abs(t.net) < EPS) return;
    if (account.type === 'income') income.push({ account, amount: round2(-t.net) });
    else if (account.type === 'expense') (isCostOfSales(account) ? costOfSales : expenses).push({ account, amount: t.net });
  });
  const byCode = (a: StatementRow, b: StatementRow) => a.account.code.localeCompare(b.account.code, undefined, { numeric: true });
  income.sort(byCode);
  costOfSales.sort(byCode);
  expenses.sort(byCode);
  const totalIncome = round2(income.reduce((a, r) => a + r.amount, 0));
  const totalCostOfSales = round2(costOfSales.reduce((a, r) => a + r.amount, 0));
  const totalExpenses = round2(expenses.reduce((a, r) => a + r.amount, 0));
  const grossProfit = round2(totalIncome - totalCostOfSales);
  return { from, to, income, totalIncome, costOfSales, totalCostOfSales, grossProfit, expenses, totalExpenses, netProfit: round2(grossProfit - totalExpenses) };
};

export interface BalanceSheetGL {
  asOf: string;
  assets: StatementRow[];
  totalAssets: number;
  liabilities: StatementRow[];
  totalLiabilities: number;
  equity: StatementRow[];
  /** Income minus expenses to date: not yet closed into capital. */
  profitToDate: number;
  totalEquity: number;
  balanced: boolean;
  difference: number;
}

export const balanceSheet = (entries: JournalEntry[], asOf: string, accounts: Account[] = DEFAULT_ACCOUNTS): BalanceSheetGL => {
  const totals = accountTotals(entries, { to: asOf });
  const assets: StatementRow[] = [];
  const liabilities: StatementRow[] = [];
  const equity: StatementRow[] = [];
  let profitToDate = 0;
  totals.forEach((t, code) => {
    const account = accountFor(accounts, code);
    if (account.type === 'income' || account.type === 'expense') {
      profitToDate = round2(profitToDate - t.net);
      return;
    }
    if (Math.abs(t.net) < EPS) return;
    if (account.type === 'asset') assets.push({ account, amount: t.net });
    else if (account.type === 'liability') liabilities.push({ account, amount: round2(-t.net) });
    else equity.push({ account, amount: round2(-t.net) });
  });
  const byCode = (a: StatementRow, b: StatementRow) => a.account.code.localeCompare(b.account.code, undefined, { numeric: true });
  assets.sort(byCode);
  liabilities.sort(byCode);
  equity.sort(byCode);
  const totalAssets = round2(assets.reduce((a, r) => a + r.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((a, r) => a + r.amount, 0));
  const totalEquity = round2(equity.reduce((a, r) => a + r.amount, 0) + profitToDate);
  const difference = round2(totalAssets - totalLiabilities - totalEquity);
  return { asOf, assets, totalAssets, liabilities, totalLiabilities, equity, profitToDate, totalEquity, balanced: Math.abs(difference) < EPS, difference };
};

/** "Rs. 1,000 Dr" style label for a debit-positive balance. */
export const drCr = (n: number) => (Math.abs(n) < EPS ? '0' : `${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`);
