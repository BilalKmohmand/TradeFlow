import { supabase } from './supabaseClient';
import {
  Customer,
  Supplier,
  Product,
  Booking,
  Dispatch,
  Purchase,
  PriceHistoryEntry,
  Expense,
  Truck,
  AppUser,
  CashEntry,
  AppSettings,
  Quotation,
  PurchaseOrder,
  StockReturn,
  StockAdjustment,
  Task,
  Invoice,
  LedgerEntry,
  WhatsAppMessage,
  BankStatementLine,
  BankReconciliation,
  Godown,
  StockBatch,
  StockTransfer,
  CustomerAgreedRate,
  Cheque,
  Salesman,
  SalesArea,
  Scheme,
  SupplierBill,
  SupplierClaim,
} from '../types';
import type { Account, JournalEntry } from '../utils/accounting';

/** Finance tables (migration v21): fixed assets, depreciation runs, staff, advances, salary sheets, budgets, cost centres, year closes. */
export const FINANCE_TABLE_NAMES = ['fixed_assets', 'depreciation_runs', 'staff', 'staff_advances', 'salary_runs', 'budgets', 'cost_centres', 'year_closes'] as const;
export type FinanceTableName = (typeof FINANCE_TABLE_NAMES)[number];

export interface AppData {
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  bookings: Booking[];
  dispatches: Dispatch[];
  purchases: Purchase[];
  priceHistory: PriceHistoryEntry[];
  expenses: Expense[];
  trucks: Truck[];
  users: AppUser[];
  cashEntries: CashEntry[];
  settings: AppSettings | null;
  quotations: Quotation[];
  purchaseOrders: PurchaseOrder[];
  returns: StockReturn[];
  adjustments: StockAdjustment[];
  tasks: Task[];
  /** null when the invoices table does not exist yet (migration v8 not run). */
  invoices: Invoice[] | null;
  ledger: LedgerEntry[];
  whatsappMessages: WhatsAppMessage[];
  /** null when the bank reconciliation tables do not exist yet (migration v12 not run). */
  bankStatementLines: BankStatementLine[] | null;
  bankReconciliations: BankReconciliation[] | null;
  /** Inventory (migration v11). null when the table does not exist yet. */
  godowns: Godown[] | null;
  stockBatches: StockBatch[] | null;
  stockTransfers: StockTransfer[] | null;
  /** Accounts: manual journal entries and custom accounts; null when the table does not exist yet (migration v10 not run). */
  journalEntries: JournalEntry[] | null;
  accounts: Account[] | null;
  /** Customer-specific item rates; null when the table does not exist yet (migration v13 not run). */
  customerAgreedRates: CustomerAgreedRate[] | null;
  /** Post-dated cheque register; null when the table does not exist yet (migration v14 not run). */
  cheques: Cheque[] | null;
  /** Sales team, routes and trade schemes; null when the table does not exist yet (migration v19 not run). */
  salesmen: Salesman[] | null;
  areas: SalesArea[] | null;
  schemes: Scheme[] | null;
  /** Supplier bills and claims; null when the tables do not exist yet (migration v20 not run). */
  supplierBills: SupplierBill[] | null;
  supplierClaims: SupplierClaim[] | null;
  /** Finance rows by table; a table missing in the cloud (migration v21 not run) is left out. */
  finance: Partial<Record<FinanceTableName, unknown[]>>;
}

export type TableName =
  | 'customers'
  | 'suppliers'
  | 'products'
  | 'bookings'
  | 'dispatches'
  | 'purchases'
  | 'price_history'
  | 'expenses'
  | 'trucks'
  | 'users'
  | 'cash_entries'
  | 'settings'
  | 'quotations'
  | 'purchase_orders'
  | 'returns'
  | 'stock_adjustments'
  | 'tasks'
  | 'invoices'
  | 'ledger'
  | 'whatsapp_messages'
  | 'bank_statement_lines'
  | 'bank_reconciliations'
  | 'godowns'
  | 'stock_batches'
  | 'stock_transfers'
  | 'journal_entries'
  | 'accounts'
  | 'customer_agreed_rates'
  | 'cheques'
  | 'salesmen'
  | 'areas'
  | 'schemes'
  | 'supplier_bills'
  | 'supplier_claims'
  | FinanceTableName;

export const ALL_TABLES: TableName[] = [
  'customers',
  'suppliers',
  'products',
  'bookings',
  'dispatches',
  'purchases',
  'price_history',
  'expenses',
  'trucks',
  'users',
  'cash_entries',
  'settings',
  'quotations',
  'purchase_orders',
  'returns',
  'stock_adjustments',
  'tasks',
  'invoices',
  'ledger',
  'whatsapp_messages',
  'bank_statement_lines',
  'bank_reconciliations',
  'godowns',
  'stock_batches',
  'stock_transfers',
  'journal_entries',
  'accounts',
  'customer_agreed_rates',
  'cheques',
  'salesmen',
  'areas',
  'schemes',
  'supplier_bills',
  'supplier_claims',
  ...FINANCE_TABLE_NAMES,
];

// ---------------------------------------------------------------------------
// Legacy (tons) -> kg shim
// Rows written by the old schema carry *Tons / *PerTon columns. Until the SQL migration in
// supabase/migrate_tons_to_kg.sql has been run, normalise them on read so the UI never sees
// undefined quantities. 1 ton = 1000 kg; Rs./ton / 1000 = Rs./kg.
// ---------------------------------------------------------------------------
const KG_PER_TON = 1000;
const num = (v: unknown): number => (typeof v === 'number' && !isNaN(v) ? v : Number(v) || 0);

export const normalizeProduct = (r: any): Product => ({
  ...r,
  stockKg: r.stockKg ?? num(r.stockTons) * KG_PER_TON,
  minThresholdKg: r.minThresholdKg ?? num(r.minThresholdTons) * KG_PER_TON,
  unitPricePerKg: r.unitPricePerKg ?? num(r.unitPricePerTon) / KG_PER_TON,
});

export const normalizeBooking = (r: any): Booking => {
  const totalKg = r.totalKg ?? num(r.totalTons) * KG_PER_TON;
  const dispatchedKg = r.dispatchedKg ?? num(r.dispatchedTons) * KG_PER_TON;
  const remainingKg = r.remainingKg ?? num(r.remainingTons) * KG_PER_TON;
  const pricePerKg = r.pricePerKg ?? num(r.pricePerTon) / KG_PER_TON;

  let items = Array.isArray(r.items) && r.items.length > 0 ? r.items : undefined;
  if (!items && r.productId) {
    items = [
      {
        id: `${r.id || 'bki'}-item-1`,
        productId: r.productId,
        totalKg,
        pricePerKg,
        dispatchedKg,
        remainingKg,
        totalAmount: r.totalAmount ?? totalKg * pricePerKg,
        costPricePerKg: r.costPricePerKg,
        marginPerKg: r.marginPerKg,
        totalMargin: r.totalMargin,
        isCustomRate: r.isCustomRate,
        rateOverrideReason: r.rateOverrideReason,
      },
    ];
  }

  return {
    ...r,
    totalKg,
    dispatchedKg,
    remainingKg,
    pricePerKg,
    items: items || [],
  };
};

export const normalizeDispatch = (r: any): Dispatch => ({
  ...r,
  kg: r.kg ?? num(r.tons) * KG_PER_TON,
});

export const normalizeLedger = (r: any): LedgerEntry => ({
  ...r,
  kg: r.kg ?? (r.tons != null ? num(r.tons) * KG_PER_TON : undefined),
});

const stripLegacy = <T,>(rows: T[]): T[] =>
  rows.map((r) => {
    const { stockTons, minThresholdTons, unitPricePerTon, totalTons, dispatchedTons, remainingTons, pricePerTon, tons, ...rest } =
      r as any;
    return rest as T;
  });

/** Tables that may be missing on a project that has not run the migration yet. */
const OPTIONAL_TABLES: TableName[] = ['purchases', 'price_history', 'expenses', 'trucks', 'users', 'cash_entries', 'settings', 'quotations', 'purchase_orders', 'returns', 'stock_adjustments', 'tasks', 'invoices', 'bank_statement_lines', 'bank_reconciliations', 'godowns', 'stock_batches', 'stock_transfers', 'journal_entries', 'accounts', 'customer_agreed_rates', 'cheques', 'salesmen', 'areas', 'schemes', 'supplier_bills', 'supplier_claims', ...FINANCE_TABLE_NAMES];

/** Read a whole table in pages (PostgREST caps a single select at 1000 rows). */
const fetchAll = async (table: string): Promise<{ data: any[] | null; error: { message: string } | null }> => {
  const page = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + page - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return { data: rows, error: null };
};

export const loadAllData = async (): Promise<AppData> => {
  const [customers, suppliers, products, bookings, dispatches, purchases, priceHistory, expenses, trucks, users, cashEntries, settings, quotations, purchaseOrders, returns, adjustments, tasks, invoices, ledger, whatsappMessages, bankStatementLines, bankReconciliations, godowns, stockBatches, stockTransfers, journalEntries, accounts, agreedRates, cheques, salesmen, areas, schemes, supplierBills, supplierClaims] =
    await Promise.all([
      fetchAll('customers'),
      fetchAll('suppliers'),
      fetchAll('products'),
      fetchAll('bookings'),
      fetchAll('dispatches'),
      fetchAll('purchases'),
      fetchAll('price_history'),
      fetchAll('expenses'),
      fetchAll('trucks'),
      fetchAll('users'),
      fetchAll('cash_entries'),
      fetchAll('settings'),
      fetchAll('quotations'),
      fetchAll('purchase_orders'),
      fetchAll('returns'),
      fetchAll('stock_adjustments'),
      fetchAll('tasks'),
      fetchAll('invoices'),
      fetchAll('ledger'),
      fetchAll('whatsapp_messages'),
      fetchAll('bank_statement_lines'),
      fetchAll('bank_reconciliations'),
      fetchAll('godowns'),
      fetchAll('stock_batches'),
      fetchAll('stock_transfers'),
      fetchAll('journal_entries'),
      fetchAll('accounts'),
      fetchAll('customer_agreed_rates'),
      fetchAll('cheques'),
      fetchAll('salesmen'),
      fetchAll('areas'),
      fetchAll('schemes'),
      fetchAll('supplier_bills'),
      fetchAll('supplier_claims'),
    ]);

  const maybeThrow = (result: { error?: { message: string } | null }, label: TableName) => {
    if (result.error) {
      if (OPTIONAL_TABLES.includes(label)) {
        console.warn(`Supabase table "${label}" unavailable (run the SQL files in supabase/):`, result.error.message);
        return;
      }
      throw new Error(`${label}: ${result.error.message}`);
    }
  };

  maybeThrow(customers, 'customers');
  maybeThrow(suppliers, 'suppliers');
  maybeThrow(products, 'products');
  maybeThrow(bookings, 'bookings');
  maybeThrow(dispatches, 'dispatches');
  maybeThrow(purchases, 'purchases');
  maybeThrow(priceHistory, 'price_history');
  maybeThrow(expenses, 'expenses');
  maybeThrow(trucks, 'trucks');
  maybeThrow(users, 'users');
  maybeThrow(cashEntries, 'cash_entries');
  maybeThrow(settings, 'settings');
  maybeThrow(quotations, 'quotations');
  maybeThrow(purchaseOrders, 'purchase_orders');
  maybeThrow(returns, 'returns');
  maybeThrow(adjustments, 'stock_adjustments');
  maybeThrow(tasks, 'tasks');
  maybeThrow(invoices, 'invoices');
  maybeThrow(ledger, 'ledger');
  maybeThrow(whatsappMessages, 'whatsapp_messages');
  maybeThrow(bankStatementLines, 'bank_statement_lines');
  maybeThrow(bankReconciliations, 'bank_reconciliations');
  maybeThrow(godowns, 'godowns');
  maybeThrow(stockBatches, 'stock_batches');
  maybeThrow(stockTransfers, 'stock_transfers');
  maybeThrow(journalEntries, 'journal_entries');
  maybeThrow(accounts, 'accounts');
  maybeThrow(agreedRates, 'customer_agreed_rates');
  maybeThrow(cheques, 'cheques');
  maybeThrow(salesmen, 'salesmen');
  maybeThrow(areas, 'areas');
  maybeThrow(schemes, 'schemes');
  maybeThrow(supplierBills, 'supplier_bills');
  maybeThrow(supplierClaims, 'supplier_claims');

  // Finance tables are all optional: a missing table just keeps this device's rows.
  const financeResults = await Promise.all(FINANCE_TABLE_NAMES.map((t) => fetchAll(t)));
  const finance: Partial<Record<FinanceTableName, unknown[]>> = {};
  FINANCE_TABLE_NAMES.forEach((t, i) => {
    const r = financeResults[i];
    if (r.error) console.warn(`Supabase table "${t}" unavailable (run supabase/migrate_v21_finance.sql):`, r.error.message);
    else finance[t] = r.data || [];
  });

  return {
    customers: (customers.data || []) as Customer[],
    suppliers: (suppliers.data || []) as Supplier[],
    products: stripLegacy((products.data || []).map(normalizeProduct)),
    bookings: stripLegacy((bookings.data || []).map(normalizeBooking)),
    dispatches: stripLegacy((dispatches.data || []).map(normalizeDispatch)),
    purchases: (purchases.data || []) as Purchase[],
    priceHistory: (priceHistory.data || []) as PriceHistoryEntry[],
    expenses: (expenses.data || []) as Expense[],
    trucks: (trucks.data || []) as Truck[],
    users: (users.data || []) as AppUser[],
    cashEntries: (cashEntries.data || []) as CashEntry[],
    settings: ((settings.data || []) as AppSettings[]).find((s) => s.id === 'default') || null,
    quotations: (quotations.data || []) as Quotation[],
    purchaseOrders: (purchaseOrders.data || []) as PurchaseOrder[],
    returns: (returns.data || []) as StockReturn[],
    adjustments: (adjustments.data || []) as StockAdjustment[],
    tasks: (tasks.data || []) as Task[],
    invoices: invoices.error ? null : ((invoices.data || []) as Invoice[]),
    ledger: stripLegacy((ledger.data || []).map(normalizeLedger)),
    whatsappMessages: (whatsappMessages.data || []) as WhatsAppMessage[],
    bankStatementLines: bankStatementLines.error ? null : ((bankStatementLines.data || []) as BankStatementLine[]),
    bankReconciliations: bankReconciliations.error ? null : ((bankReconciliations.data || []) as BankReconciliation[]),
    godowns: godowns.error ? null : ((godowns.data || []) as Godown[]),
    stockBatches: stockBatches.error ? null : ((stockBatches.data || []).map((r: any) => ({ ...r, qty: num(r.qty) })) as StockBatch[]),
    stockTransfers: stockTransfers.error ? null : ((stockTransfers.data || []) as StockTransfer[]),
    journalEntries: journalEntries.error ? null : ((journalEntries.data || []) as JournalEntry[]),
    accounts: accounts.error ? null : ((accounts.data || []) as Account[]),
    customerAgreedRates: agreedRates.error ? null : ((agreedRates.data || []).map((r: any) => ({ ...r, agreedRatePerKg: num(r.agreedRatePerKg) })) as CustomerAgreedRate[]),
    cheques: cheques.error ? null : ((cheques.data || []).map((r: any) => ({ ...r, amount: num(r.amount), bankCharge: r.bankCharge == null ? undefined : num(r.bankCharge) })) as Cheque[]),
    salesmen: salesmen.error ? null : ((salesmen.data || []).map((r: any) => ({ ...r, commissionPct: r.commissionPct == null ? undefined : num(r.commissionPct) })) as Salesman[]),
    areas: areas.error ? null : ((areas.data || []) as SalesArea[]),
    schemes: schemes.error ? null : ((schemes.data || []).map((r: any) => ({ ...r, buyQty: r.buyQty == null ? undefined : num(r.buyQty), freeQty: r.freeQty == null ? undefined : num(r.freeQty), minQty: r.minQty == null ? undefined : num(r.minQty), pctOff: r.pctOff == null ? undefined : num(r.pctOff) })) as Scheme[]),
    supplierBills: supplierBills.error
      ? null
      : ((supplierBills.data || []).map((r: any) => ({ ...r, amount: num(r.amount), receivedValue: num(r.receivedValue), variance: num(r.variance), otherCharges: r.otherCharges == null ? undefined : num(r.otherCharges), purchaseIds: Array.isArray(r.purchaseIds) ? r.purchaseIds : [], lines: Array.isArray(r.lines) ? r.lines : [] })) as SupplierBill[]),
    supplierClaims: supplierClaims.error
      ? null
      : ((supplierClaims.data || []).map((r: any) => ({ ...r, qty: num(r.qty), rate: num(r.rate), amount: num(r.amount), acceptedAmount: r.acceptedAmount == null ? undefined : num(r.acceptedAmount) })) as SupplierClaim[]),
    finance,
  };
};

/** Delete rows by id from a Supabase table. Silently no-ops when Supabase is not configured. */
export const deleteRows = async (table: TableName, ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  try {
    const { error } = await supabase.from(table).delete().in('id', ids);
    if (error) console.warn(`Supabase ${table} delete error:`, error.message);
  } catch (err: any) {
    console.warn(`Supabase ${table} delete failed:`, err?.message || err);
  }
};

/** Remove every row from a Supabase table. Silently no-ops when Supabase is not configured. */
export const clearTable = async (table: TableName): Promise<void> => {
  try {
    const { error } = await supabase.from(table).delete().neq('id', '');
    if (error) console.warn(`Supabase ${table} clear error:`, error.message);
  } catch (err: any) {
    console.warn(`Supabase ${table} clear failed:`, err?.message || err);
  }
};

export const clearAllTables = async (): Promise<void> => {
  await Promise.all(ALL_TABLES.map((t) => clearTable(t)));
};
