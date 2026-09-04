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
  LedgerEntry,
  WhatsAppMessage,
} from '../types';

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
  ledger: LedgerEntry[];
  whatsappMessages: WhatsAppMessage[];
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
  | 'ledger'
  | 'whatsapp_messages';

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
  'ledger',
  'whatsapp_messages',
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

export const normalizeBooking = (r: any): Booking => ({
  ...r,
  totalKg: r.totalKg ?? num(r.totalTons) * KG_PER_TON,
  dispatchedKg: r.dispatchedKg ?? num(r.dispatchedTons) * KG_PER_TON,
  remainingKg: r.remainingKg ?? num(r.remainingTons) * KG_PER_TON,
  pricePerKg: r.pricePerKg ?? num(r.pricePerTon) / KG_PER_TON,
});

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
const OPTIONAL_TABLES: TableName[] = ['purchases', 'price_history', 'expenses', 'trucks', 'users'];

export const loadAllData = async (): Promise<AppData> => {
  const [customers, suppliers, products, bookings, dispatches, purchases, priceHistory, expenses, trucks, users, ledger, whatsappMessages] =
    await Promise.all([
      supabase.from('customers').select('*'),
      supabase.from('suppliers').select('*'),
      supabase.from('products').select('*'),
      supabase.from('bookings').select('*'),
      supabase.from('dispatches').select('*'),
      supabase.from('purchases').select('*'),
      supabase.from('price_history').select('*'),
      supabase.from('expenses').select('*'),
      supabase.from('trucks').select('*'),
      supabase.from('users').select('*'),
      supabase.from('ledger').select('*'),
      supabase.from('whatsapp_messages').select('*'),
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
  maybeThrow(ledger, 'ledger');
  maybeThrow(whatsappMessages, 'whatsapp_messages');

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
    ledger: stripLegacy((ledger.data || []).map(normalizeLedger)),
    whatsappMessages: (whatsappMessages.data || []) as WhatsAppMessage[],
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
