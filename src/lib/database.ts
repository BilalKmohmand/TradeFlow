import { supabase } from './supabaseClient';
import {
  Customer,
  Supplier,
  Product,
  Booking,
  Dispatch,
  LedgerEntry,
  WhatsAppMessage,
} from '../types';

export interface AppData {
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  bookings: Booking[];
  dispatches: Dispatch[];
  ledger: LedgerEntry[];
  whatsappMessages: WhatsAppMessage[];
}

export const loadAllData = async (): Promise<AppData> => {
  const [customers, suppliers, products, bookings, dispatches, ledger, whatsappMessages] =
    await Promise.all([
      supabase.from('customers').select('*'),
      supabase.from('suppliers').select('*'),
      supabase.from('products').select('*'),
      supabase.from('bookings').select('*'),
      supabase.from('dispatches').select('*'),
      supabase.from('ledger').select('*'),
      supabase.from('whatsapp_messages').select('*'),
    ]);

  const maybeThrow = (result: { error?: { message: string } | null }, label: string) => {
    if (result.error) {
      throw new Error(`${label}: ${result.error.message}`);
    }
  };

  maybeThrow(customers, 'customers');
  maybeThrow(suppliers, 'suppliers');
  maybeThrow(products, 'products');
  maybeThrow(bookings, 'bookings');
  maybeThrow(dispatches, 'dispatches');
  maybeThrow(ledger, 'ledger');
  maybeThrow(whatsappMessages, 'whatsapp_messages');

  return {
    customers: (customers.data || []) as Customer[],
    suppliers: (suppliers.data || []) as Supplier[],
    products: (products.data || []) as Product[],
    bookings: (bookings.data || []) as Booking[],
    dispatches: (dispatches.data || []) as Dispatch[],
    ledger: (ledger.data || []) as LedgerEntry[],
    whatsappMessages: (whatsappMessages.data || []) as WhatsAppMessage[],
  };
};

export type TableName =
  | 'customers'
  | 'suppliers'
  | 'products'
  | 'bookings'
  | 'dispatches'
  | 'ledger'
  | 'whatsapp_messages';

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

export const ALL_TABLES: TableName[] = [
  'customers',
  'suppliers',
  'products',
  'bookings',
  'dispatches',
  'ledger',
  'whatsapp_messages',
];

export const clearAllTables = async (): Promise<void> => {
  await Promise.all(ALL_TABLES.map((t) => clearTable(t)));
};
