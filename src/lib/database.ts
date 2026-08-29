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
