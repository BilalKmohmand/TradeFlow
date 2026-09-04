import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Customer,
  Supplier,
  Product,
  Booking,
  BookingStatus,
  Dispatch,
  LedgerEntry,
  WhatsAppMessage,
  ActiveScreen,
  AuditLogEntry,
} from '../types';
import { formatCurrency } from '../utils/formatters';
import { loadAllData, deleteRows, clearTable, clearAllTables, TableName } from '../lib/database';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import {
  initialCustomers,
  initialSuppliers,
  initialProducts,
  initialBookings,
  initialDispatches,
  initialLedgerEntries,
  initialWhatsAppMessages,
} from '../data/initialData';

interface TradingContextType {
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  bookings: Booking[];
  dispatches: Dispatch[];
  ledger: LedgerEntry[];
  whatsappMessages: WhatsAppMessage[];
  activeScreen: ActiveScreen;
  setActiveScreen: (screen: ActiveScreen) => void;
  selectedCustomerId: string | null;
  setSelectedCustomerId: (id: string | null) => void;
  selectedSupplierId: string | null;
  setSelectedSupplierId: (id: string | null) => void;
  
  // Actions
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'totalDue'>) => Customer;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt' | 'totalOwed'>) => Supplier;
  updateSupplier: (id: string, data: Partial<Supplier>) => void;
  addProduct: (product: Omit<Product, 'id'>) => Product;
  updateProduct: (id: string, data: Partial<Product>) => void;
  updateBooking: (id: string, data: Partial<Booking>) => void;

  // Admin: destructive deletes (cascade + reverse ledger/stock effects, synced to Supabase)
  deleteCustomer: (id: string) => DeleteSummary;
  deleteSupplier: (id: string) => DeleteSummary;
  deleteProduct: (id: string) => DeleteSummary;
  deleteBooking: (id: string) => DeleteSummary;
  deleteDispatch: (id: string) => DeleteSummary;
  deleteLedgerEntry: (id: string) => void;
  deleteWhatsAppMessage: (id: string) => void;
  purgeTable: (table: TableName) => void;
  isCloudSyncEnabled: boolean;
  isCloudSyncReady: boolean;
  
  createBooking: (bookingData: {
    customerId: string;
    productId: string;
    totalTons: number;
    pricePerTon: number;
    targetDeliveryDate?: string;
    notes?: string;
  }) => Booking;
  
  logDispatch: (dispatchData: {
    bookingId: string;
    tons: number;
    truckNumber: string;
    driverPhone?: string;
    notes?: string;
    paymentReceivedImmediately?: boolean;
    sendWhatsApp?: boolean;
  }) => { dispatch: Dispatch; message?: WhatsAppMessage };
  
  recordCustomerPayment: (customerId: string, amount: number, notes?: string) => void;
  recordSupplierPayment: (supplierId: string, amount: number, notes?: string) => void;
  
  sendWhatsAppReminder: (customerId: string, customText?: string) => WhatsAppMessage;
  sendWhatsAppDirect: (phone: string, text: string) => void;
  
  // Automation trigger
  runAutomatedOverdueCheck: () => number;
  
  // Reset
  resetToSampleData: () => void;
  
  // Latest Alert notification state for UI popups
  recentWhatsAppAlert: WhatsAppMessage | null;
  clearRecentAlert: () => void;

  // Admin PIN & Security
  isAdminUnlocked: boolean;
  unlockAdmin: (pin: string) => boolean;
  lockAdmin: () => void;
  adminPin: string;
  changeAdminPin: (oldPin: string, newPin: string) => { success: boolean; message: string };
  resetAdminPinToDefault: () => void;
  auditLogs: AuditLogEntry[];
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger') => void;
  clearAuditLogs: () => void;
  exportSystemBackup: () => string;
  importSystemBackup: (jsonContent: string) => { success: boolean; message: string };
  factoryResetAllData: () => void;
}

export interface DeleteSummary {
  customers: number;
  suppliers: number;
  products: number;
  bookings: number;
  dispatches: number;
  ledger: number;
  whatsappMessages: number;
}

const emptySummary = (): DeleteSummary => ({
  customers: 0,
  suppliers: 0,
  products: 0,
  bookings: 0,
  dispatches: 0,
  ledger: 0,
  whatsappMessages: 0,
});

/** Collision-safe id generator (Date.now() alone repeats when called in a tight loop). */
let idCounter = 0;
export const uid = (prefix: string): string => {
  idCounter = (idCounter + 1) % 100000;
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

const round2 = (n: number) => Number(n.toFixed(2));

const TradingContext = createContext<TradingContextType | undefined>(undefined);

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const DEFAULT_ADMIN_PIN = '7860';

const initialAuditLogs: AuditLogEntry[] = [
  {
    id: 'log-init-1',
    timestamp: new Date(Date.now() - 3600000 * 4).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    action: 'System Security Armed',
    details: 'Sarmaya Bulk Trading Engine initialized with Master PIN protection active.',
    severity: 'info',
  },
  {
    id: 'log-init-2',
    timestamp: new Date(Date.now() - 1800000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    action: 'Ledger Audit Verified',
    details: 'Calculated and balanced customer receivables against delivered tonnage.',
    severity: 'info',
  },
];

const STORAGE_KEYS = {
  CUSTOMERS: 'tradeflow_customers_v1',
  SUPPLIERS: 'tradeflow_suppliers_v1',
  PRODUCTS: 'tradeflow_products_v1',
  BOOKINGS: 'tradeflow_bookings_v1',
  DISPATCHES: 'tradeflow_dispatches_v1',
  LEDGER: 'tradeflow_ledger_v1',
  MESSAGES: 'tradeflow_whatsapp_v1',
  ADMIN_PIN: 'sarmaya_admin_pin_v1',
  AUDIT_LOGS: 'sarmaya_audit_logs_v1',
};

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminPin, setAdminPin] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEYS.ADMIN_PIN) || DEFAULT_ADMIN_PIN
  );
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS), initialAuditLogs)
  );
  const [customers, setCustomers] = useState<Customer[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.CUSTOMERS), initialCustomers)
  );

  const [suppliers, setSuppliers] = useState<Supplier[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.SUPPLIERS), initialSuppliers)
  );

  const [products, setProducts] = useState<Product[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.PRODUCTS), initialProducts)
  );

  const [bookings, setBookings] = useState<Booking[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.BOOKINGS), initialBookings)
  );

  const [dispatches, setDispatches] = useState<Dispatch[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.DISPATCHES), initialDispatches)
  );

  const [ledger, setLedger] = useState<LedgerEntry[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.LEDGER), initialLedgerEntries)
  );

  const [whatsappMessages, setWhatsappMessages] = useState<WhatsAppMessage[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.MESSAGES), initialWhatsAppMessages)
  );

  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [recentWhatsAppAlert, setRecentWhatsAppAlert] = useState<WhatsAppMessage | null>(null);

  // Cloud sync is only enabled once the initial Supabase load succeeds. Before that, pushing the
  // (possibly stale) localStorage snapshot up would resurrect rows that were deleted elsewhere.
  const [isCloudSyncReady, setIsCloudSyncReady] = useState<boolean>(false);

  // Load live data from Supabase on mount (falls back to localStorage/empty if no tables or network error)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    loadAllData()
      .then((data) => {
        if (cancelled) return;
        setCustomers(data.customers);
        setSuppliers(data.suppliers);
        setProducts(data.products);
        setBookings(data.bookings);
        setDispatches(data.dispatches);
        setLedger(data.ledger);
        setWhatsappMessages(data.whatsappMessages);
        setIsCloudSyncReady(true);
      })
      .catch((err) => {
        console.warn('Supabase load failed; running in local-only mode:', err?.message || err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persistence to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DISPATCHES, JSON.stringify(dispatches));
  }, [dispatches]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(ledger));
  }, [ledger]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(whatsappMessages));
  }, [whatsappMessages]);

  const syncToSupabase = async (table: string, rows: unknown[]) => {
    if (!isCloudSyncReady || rows.length === 0) return;
    try {
      const { error } = await supabase.from(table).upsert(rows as any[], { onConflict: 'id' });
      if (error) console.warn(`Supabase ${table} upsert error:`, error.message);
    } catch (err: any) {
      console.warn(`Supabase ${table} sync failed:`, err?.message || err);
    }
  };

  useEffect(() => { void syncToSupabase('customers', customers); }, [customers, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('suppliers', suppliers); }, [suppliers, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('products', products); }, [products, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('bookings', bookings); }, [bookings, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('dispatches', dispatches); }, [dispatches, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('ledger', ledger); }, [ledger, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('whatsapp_messages', whatsappMessages); }, [whatsappMessages, isCloudSyncReady]);

  /** Remote delete helper; only touches Supabase when cloud sync is live. */
  const removeRemote = (table: TableName, ids: string[]) => {
    if (!isCloudSyncReady) return;
    void deleteRows(table, ids);
  };

  const clearRecentAlert = () => setRecentWhatsAppAlert(null);

  const resetToSampleData = () => {
    if (isCloudSyncReady) void clearAllTables();
    setCustomers(initialCustomers);
    setSuppliers(initialSuppliers);
    setProducts(initialProducts);
    setBookings(initialBookings);
    setDispatches(initialDispatches);
    setLedger(initialLedgerEntries);
    setWhatsappMessages(initialWhatsAppMessages);
    logAuditEvent('Sample Data Loaded', 'All business data replaced with the built-in sample dataset.', 'warning');
  };

  const addCustomer = (data: Omit<Customer, 'id' | 'createdAt' | 'totalDue'>): Customer => {
    const newCust: Customer = {
      ...data,
      id: uid('cust'),
      totalDue: 0,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setCustomers((prev) => [newCust, ...prev]);
    return newCust;
  };

  const updateCustomer = (id: string, data: Partial<Customer>) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
  };

  const addSupplier = (data: Omit<Supplier, 'id' | 'createdAt' | 'totalOwed'>): Supplier => {
    const newSup: Supplier = {
      ...data,
      id: uid('sup'),
      totalOwed: 0,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setSuppliers((prev) => [newSup, ...prev]);
    return newSup;
  };

  const updateSupplier = (id: string, data: Partial<Supplier>) => {
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
  };

  const addProduct = (data: Omit<Product, 'id'>): Product => {
    const newProd: Product = {
      ...data,
      id: uid('prod'),
    };
    setProducts((prev) => [newProd, ...prev]);
    return newProd;
  };

  const updateProduct = (id: string, data: Partial<Product>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
  };

  const updateBooking = (id: string, data: Partial<Booking>) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)));
  };

  // ---------------------------------------------------------------------------
  // Admin deletes
  // ---------------------------------------------------------------------------

  /** Ledger references a dispatch by its dispatch number (billing + immediate payment rows). */
  const ledgerRefsForDispatch = (d: Dispatch) => new Set([d.dispatchNumber, `PAY-${d.dispatchNumber}`]);

  /**
   * Reverse the side effects of a set of dispatches (stock, customer dues, booking progress) and
   * remove every derived row (ledger + WhatsApp). Shared by deleteDispatch and deleteBooking.
   * Booking fields are only reversed when `reverseBookings` is true (deleteBooking removes them anyway).
   */
  const reverseDispatches = (targets: Dispatch[], reverseBookings: boolean): { ledgerIds: string[]; waIds: string[] } => {
    if (targets.length === 0) return { ledgerIds: [], waIds: [] };
    const dispatchIds = new Set(targets.map((d) => d.id));
    const refs = new Set<string>();
    targets.forEach((d) => ledgerRefsForDispatch(d).forEach((r) => refs.add(r)));

    const ledgerIds = ledger.filter((l) => refs.has(l.referenceId)).map((l) => l.id);
    const waIds = whatsappMessages.filter((m) => m.dispatchId && dispatchIds.has(m.dispatchId)).map((m) => m.id);

    // Stock back into the warehouse
    const stockDelta = new Map<string, number>();
    targets.forEach((d) => stockDelta.set(d.productId, (stockDelta.get(d.productId) || 0) + d.tons));
    setProducts((prev) =>
      prev.map((p) => (stockDelta.has(p.id) ? { ...p, stockTons: round2(p.stockTons + (stockDelta.get(p.id) || 0)) } : p))
    );

    // Unpaid dispatch amounts come off the customer's outstanding balance
    const dueDelta = new Map<string, number>();
    targets
      .filter((d) => !d.paymentReceivedImmediately)
      .forEach((d) => dueDelta.set(d.customerId, (dueDelta.get(d.customerId) || 0) + d.amount));
    setCustomers((prev) =>
      prev.map((c) =>
        dueDelta.has(c.id) ? { ...c, totalDue: Math.max(0, round2(c.totalDue - (dueDelta.get(c.id) || 0))) } : c
      )
    );

    if (reverseBookings) {
      const byBooking = new Map<string, Dispatch[]>();
      targets.forEach((d) => byBooking.set(d.bookingId, [...(byBooking.get(d.bookingId) || []), d]));
      setBookings((prev) =>
        prev.map((b) => {
          const ds = byBooking.get(b.id);
          if (!ds) return b;
          const tons = ds.reduce((a, d) => a + d.tons, 0);
          const paid = ds.filter((d) => d.paymentReceivedImmediately).reduce((a, d) => a + d.amount, 0);
          const dispatchedTons = Math.max(0, round2(b.dispatchedTons - tons));
          const remainingTons = Math.max(0, round2(b.totalTons - dispatchedTons));
          const paidAmount = Math.max(0, round2(b.paidAmount - paid));
          const paymentStatus = paidAmount <= 0 ? 'unpaid' : paidAmount >= b.totalAmount ? 'paid' : 'partial';
          return {
            ...b,
            dispatchedTons,
            remainingTons,
            paidAmount,
            paymentStatus,
            status: b.status === 'cancelled' ? 'cancelled' : remainingTons === 0 ? 'completed' : 'active',
          };
        })
      );
    }

    setLedger((prev) => prev.filter((l) => !refs.has(l.referenceId)));
    setWhatsappMessages((prev) => prev.filter((m) => !(m.dispatchId && dispatchIds.has(m.dispatchId))));
    setDispatches((prev) => prev.filter((d) => !dispatchIds.has(d.id)));

    removeRemote('ledger', ledgerIds);
    removeRemote('whatsapp_messages', waIds);
    removeRemote('dispatches', Array.from(dispatchIds));

    return { ledgerIds, waIds };
  };

  const deleteDispatch = (id: string): DeleteSummary => {
    const summary = emptySummary();
    const target = dispatches.find((d) => d.id === id);
    if (!target) return summary;
    const { ledgerIds, waIds } = reverseDispatches([target], true);
    summary.dispatches = 1;
    summary.ledger = ledgerIds.length;
    summary.whatsappMessages = waIds.length;
    logAuditEvent(
      'Dispatch Deleted',
      `${target.dispatchNumber} (${target.tons} T, ${formatCurrency(target.amount)}) removed; stock, booking progress and customer balance reversed.`,
      'danger'
    );
    return summary;
  };

  /** Removes bookings and everything hanging off them. Returns the summary of removed rows. */
  const removeBookings = (targets: Booking[]): DeleteSummary => {
    const summary = emptySummary();
    if (targets.length === 0) return summary;
    const bookingIds = new Set(targets.map((b) => b.id));
    const bookingNumbers = new Set(targets.map((b) => b.bookingNumber));

    const relatedDispatches = dispatches.filter((d) => bookingIds.has(d.bookingId));
    const rev = reverseDispatches(relatedDispatches, false);

    const bookingLedgerIds = ledger
      .filter((l) => bookingNumbers.has(l.referenceId) || bookingIds.has(l.referenceId))
      .map((l) => l.id);
    const bookingWaIds = whatsappMessages.filter((m) => m.bookingId && bookingIds.has(m.bookingId)).map((m) => m.id);

    setLedger((prev) => prev.filter((l) => !(bookingNumbers.has(l.referenceId) || bookingIds.has(l.referenceId))));
    setWhatsappMessages((prev) => prev.filter((m) => !(m.bookingId && bookingIds.has(m.bookingId))));
    setBookings((prev) => prev.filter((b) => !bookingIds.has(b.id)));

    removeRemote('ledger', bookingLedgerIds);
    removeRemote('whatsapp_messages', bookingWaIds);
    removeRemote('bookings', Array.from(bookingIds));

    summary.bookings = targets.length;
    summary.dispatches = relatedDispatches.length;
    summary.ledger = rev.ledgerIds.length + bookingLedgerIds.length;
    summary.whatsappMessages = rev.waIds.length + bookingWaIds.length;
    return summary;
  };

  const deleteBooking = (id: string): DeleteSummary => {
    const target = bookings.find((b) => b.id === id);
    if (!target) return emptySummary();
    const summary = removeBookings([target]);
    logAuditEvent(
      'Booking Deleted',
      `${target.bookingNumber} removed with ${summary.dispatches} dispatch(es) and ${summary.ledger} ledger row(s); stock and balances reversed.`,
      'danger'
    );
    return summary;
  };

  const deleteCustomer = (id: string): DeleteSummary => {
    const target = customers.find((c) => c.id === id);
    if (!target) return emptySummary();

    const summary = removeBookings(bookings.filter((b) => b.customerId === id));

    // Remaining rows that point at the customer directly (payments, reminders, stray dispatches)
    const strayDispatchIds = dispatches.filter((d) => d.customerId === id).map((d) => d.id);
    const ledgerIds = ledger.filter((l) => l.entityType === 'customer' && l.entityId === id).map((l) => l.id);
    const cleanPhone = target.phone.replace(/[^0-9]/g, '');
    const waIds = whatsappMessages
      .filter((m) => m.recipientType === 'customer' && m.recipientPhone.replace(/[^0-9]/g, '') === cleanPhone)
      .map((m) => m.id);

    setDispatches((prev) => prev.filter((d) => d.customerId !== id));
    setLedger((prev) => prev.filter((l) => !(l.entityType === 'customer' && l.entityId === id)));
    setWhatsappMessages((prev) => prev.filter((m) => !waIds.includes(m.id)));
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    if (selectedCustomerId === id) setSelectedCustomerId(null);

    removeRemote('dispatches', strayDispatchIds);
    removeRemote('ledger', ledgerIds);
    removeRemote('whatsapp_messages', waIds);
    removeRemote('customers', [id]);

    summary.customers = 1;
    summary.dispatches += strayDispatchIds.length;
    summary.ledger += ledgerIds.length;
    summary.whatsappMessages += waIds.length;
    logAuditEvent(
      'Customer Deleted',
      `${target.name} (${target.company}) removed with ${summary.bookings} booking(s), ${summary.dispatches} dispatch(es), ${summary.ledger} ledger row(s).`,
      'danger'
    );
    return summary;
  };

  const deleteSupplier = (id: string): DeleteSummary => {
    const summary = emptySummary();
    const target = suppliers.find((s) => s.id === id);
    if (!target) return summary;

    const ledgerIds = ledger.filter((l) => l.entityType === 'supplier' && l.entityId === id).map((l) => l.id);
    const cleanPhone = target.phone.replace(/[^0-9]/g, '');
    const waIds = whatsappMessages
      .filter((m) => m.recipientType === 'supplier' && m.recipientPhone.replace(/[^0-9]/g, '') === cleanPhone)
      .map((m) => m.id);

    // Products stay; they just lose their primary supplier link.
    setProducts((prev) => prev.map((p) => (p.supplierId === id ? { ...p, supplierId: null } : p)));
    setLedger((prev) => prev.filter((l) => !(l.entityType === 'supplier' && l.entityId === id)));
    setWhatsappMessages((prev) => prev.filter((m) => !waIds.includes(m.id)));
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
    if (selectedSupplierId === id) setSelectedSupplierId(null);

    removeRemote('ledger', ledgerIds);
    removeRemote('whatsapp_messages', waIds);
    removeRemote('suppliers', [id]);

    summary.suppliers = 1;
    summary.ledger = ledgerIds.length;
    summary.whatsappMessages = waIds.length;
    summary.products = products.filter((p) => p.supplierId === id).length;
    logAuditEvent(
      'Supplier Deleted',
      `${target.name} (${target.company}) removed; ${summary.products} product(s) unlinked, ${summary.ledger} ledger row(s) removed.`,
      'danger'
    );
    return summary;
  };

  const deleteProduct = (id: string): DeleteSummary => {
    const target = products.find((p) => p.id === id);
    if (!target) return emptySummary();

    const summary = removeBookings(bookings.filter((b) => b.productId === id));
    const strayDispatchIds = dispatches.filter((d) => d.productId === id).map((d) => d.id);

    setDispatches((prev) => prev.filter((d) => d.productId !== id));
    setProducts((prev) => prev.filter((p) => p.id !== id));
    removeRemote('dispatches', strayDispatchIds);
    removeRemote('products', [id]);

    summary.products = 1;
    summary.dispatches += strayDispatchIds.length;
    logAuditEvent(
      'Product Deleted',
      `${target.name} removed with ${summary.bookings} booking(s) and ${summary.dispatches} dispatch(es).`,
      'danger'
    );
    return summary;
  };

  const deleteLedgerEntry = (id: string) => {
    const target = ledger.find((l) => l.id === id);
    if (!target) return;
    setLedger((prev) => prev.filter((l) => l.id !== id));
    removeRemote('ledger', [id]);
    logAuditEvent('Ledger Entry Deleted', `${target.referenceId}: ${target.description}`, 'danger');
  };

  const deleteWhatsAppMessage = (id: string) => {
    const target = whatsappMessages.find((m) => m.id === id);
    if (!target) return;
    setWhatsappMessages((prev) => prev.filter((m) => m.id !== id));
    removeRemote('whatsapp_messages', [id]);
    logAuditEvent('WhatsApp Log Deleted', `${target.type} to ${target.recipientName} removed.`, 'warning');
  };

  /** Wipe a whole table (local + cloud) without any cascade or reversal. */
  const purgeTable = (table: TableName) => {
    const setters: Record<TableName, () => void> = {
      customers: () => setCustomers([]),
      suppliers: () => setSuppliers([]),
      products: () => setProducts([]),
      bookings: () => setBookings([]),
      dispatches: () => setDispatches([]),
      ledger: () => setLedger([]),
      whatsapp_messages: () => setWhatsappMessages([]),
    };
    setters[table]();
    if (isCloudSyncReady) void clearTable(table);
    logAuditEvent('Table Purged', `Administrator emptied the "${table}" table.`, 'danger');
  };

  const createBooking = ({
    customerId,
    productId,
    totalTons,
    pricePerTon,
    targetDeliveryDate,
    notes,
  }: {
    customerId: string;
    productId: string;
    totalTons: number;
    pricePerTon: number;
    targetDeliveryDate?: string;
    notes?: string;
  }): Booking => {
    const bookingNum = `BK-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const totalAmount = totalTons * pricePerTon;
    const newBooking: Booking = {
      id: uid('book'),
      bookingNumber: bookingNum,
      customerId,
      productId,
      totalTons,
      dispatchedTons: 0,
      remainingTons: totalTons,
      pricePerTon,
      totalAmount,
      paidAmount: 0,
      status: 'active',
      paymentStatus: 'unpaid',
      createdAt: new Date().toISOString().split('T')[0],
      targetDeliveryDate,
      notes,
    };

    setBookings((prev) => [newBooking, ...prev]);

    // Send instant WhatsApp booking confirmation
    const customer = customers.find((c) => c.id === customerId);
    const product = products.find((p) => p.id === productId);
    if (customer && product) {
      const msgText = `📑 *Sarmaya Booking Confirmed*\n\nHello ${customer.name},\nYour booking *${bookingNum}* for *${totalTons.toLocaleString()} Tons* of *${product.name}* has been scheduled at *${formatCurrency(pricePerTon)}/Ton* (Total: *${formatCurrency(totalAmount)}*).\n\nDispatches will be notified automatically with truck & driver details upon release. Thank you for your business!`;

      const waMsg: WhatsAppMessage = {
        id: uid('wa'),
        type: 'booking_confirmation',
        recipientName: customer.name,
        recipientPhone: customer.phone,
        recipientType: 'customer',
        message: msgText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'delivered',
        bookingId: newBooking.id,
      };

      setWhatsappMessages((prev) => [waMsg, ...prev]);
      setRecentWhatsAppAlert(waMsg);
    }

    return newBooking;
  };

  const logDispatch = ({
    bookingId,
    tons,
    truckNumber,
    driverPhone,
    notes,
    paymentReceivedImmediately = false,
    sendWhatsApp = true,
  }: {
    bookingId: string;
    tons: number;
    truckNumber: string;
    driverPhone?: string;
    notes?: string;
    paymentReceivedImmediately?: boolean;
    sendWhatsApp?: boolean;
  }) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) throw new Error('Booking not found');

    const customer = customers.find((c) => c.id === booking.customerId);
    const product = products.find((p) => p.id === booking.productId);
    const today = new Date().toISOString().split('T')[0];
    const dispatchAmount = tons * booking.pricePerTon;

    // Recalculate tons
    const newDispatchedTons = Number((booking.dispatchedTons + tons).toFixed(2));
    const newRemainingTons = Math.max(0, Number((booking.totalTons - newDispatchedTons).toFixed(2)));
    const newStatus: BookingStatus = newRemainingTons === 0 ? 'completed' : 'active';

    const dispatchNum = `DSP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    let generatedMessage = '';
    if (customer && product) {
      generatedMessage = `🚚 *Sarmaya Dispatch Alert*\n\nHello ${customer.name},\nTruck *${truckNumber.toUpperCase()}* carrying *${tons.toFixed(1)} Tons* of *${product.name}* is on its way to your destination.\n\n📊 *Booking Status (${booking.bookingNumber})*:\n• Dispatched Now: ${tons.toFixed(1)} Tons\n• Remaining Balance: ${newRemainingTons.toFixed(1)} Tons\n• Invoice for this dispatch: *${formatCurrency(dispatchAmount)}*\n\n💳 Kindly confirm once payment has been initiated for this shipment.\nThank you for trading with us!`;
    }

    const newDispatch: Dispatch = {
      id: uid('disp'),
      dispatchNumber: dispatchNum,
      bookingId,
      customerId: booking.customerId,
      productId: booking.productId,
      tons,
      amount: dispatchAmount,
      truckNumber: truckNumber.toUpperCase(),
      driverPhone,
      date: today,
      notes,
      whatsappSent: sendWhatsApp,
      whatsappMessage: generatedMessage,
      paymentReceivedImmediately,
    };

    // 1. Update Booking
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              dispatchedTons: newDispatchedTons,
              remainingTons: newRemainingTons,
              status: newStatus,
              paidAmount: paymentReceivedImmediately ? b.paidAmount + dispatchAmount : b.paidAmount,
              paymentStatus:
                paymentReceivedImmediately && newDispatchedTons >= b.totalTons
                  ? 'paid'
                  : paymentReceivedImmediately
                  ? 'partial'
                  : b.paymentStatus,
            }
          : b
      )
    );

    // 2. Update Product Stock
    setProducts((prev) =>
      prev.map((p) =>
        p.id === booking.productId
          ? { ...p, stockTons: Math.max(0, Number((p.stockTons - tons).toFixed(2))) }
          : p
      )
    );

    // 3. Update Customer Total Due & Ledger
    const netDueChange = paymentReceivedImmediately ? 0 : dispatchAmount;
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === booking.customerId
          ? { ...c, totalDue: Number((c.totalDue + netDueChange).toFixed(2)) }
          : c
      )
    );

    // 4. Create Ledger Entries
    const currentCustomerDue = customer ? customer.totalDue : 0;
    const billedLedger: LedgerEntry = {
      id: uid('led'),
      entityType: 'customer',
      entityId: booking.customerId,
      type: 'dispatch_billed',
      referenceId: dispatchNum,
      date: today,
      description: `Dispatch ${dispatchNum}: ${tons} tons ${product?.name || 'goods'}`,
      debit: dispatchAmount,
      credit: 0,
      balanceAfter: Number((currentCustomerDue + dispatchAmount).toFixed(2)),
      tons,
    };

    const newLedgerEntries = [billedLedger];

    if (paymentReceivedImmediately) {
      const paymentLedger: LedgerEntry = {
        id: uid('led'),
        entityType: 'customer',
        entityId: booking.customerId,
        type: 'payment_received',
        referenceId: `PAY-${dispatchNum}`,
        date: today,
        description: `Immediate payment received for ${dispatchNum}`,
        debit: 0,
        credit: dispatchAmount,
        balanceAfter: Number((currentCustomerDue).toFixed(2)),
      };
      newLedgerEntries.push(paymentLedger);
    }

    setLedger((prev) => [...newLedgerEntries, ...prev]);
    setDispatches((prev) => [newDispatch, ...prev]);

    // 5. Trigger WhatsApp Automation
    let waMessage: WhatsAppMessage | undefined;
    if (sendWhatsApp && customer) {
      waMessage = {
        id: uid('wa'),
        type: 'dispatch_alert',
        recipientName: customer.name,
        recipientPhone: customer.phone,
        recipientType: 'customer',
        message: generatedMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'delivered',
        bookingId,
        dispatchId: newDispatch.id,
      };

      setWhatsappMessages((prev) => [waMessage!, ...prev]);
      setRecentWhatsAppAlert(waMessage);
    }

    return { dispatch: newDispatch, message: waMessage };
  };

  const recordCustomerPayment = (customerId: string, amount: number, notes?: string) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;

    const today = new Date().toISOString().split('T')[0];
    const newTotalDue = Math.max(0, Number((customer.totalDue - amount).toFixed(2)));

    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, totalDue: newTotalDue } : c))
    );

    const payRef = `PAY-${Math.floor(1000 + Math.random() * 9000)}`;
    const newLedger: LedgerEntry = {
      id: uid('led'),
      entityType: 'customer',
      entityId: customerId,
      type: 'payment_received',
      referenceId: payRef,
      date: today,
      description: notes ? `Payment received: ${notes}` : `Payment received (${payRef})`,
      debit: 0,
      credit: amount,
      balanceAfter: newTotalDue,
    };

    setLedger((prev) => [newLedger, ...prev]);

    // WhatsApp Payment Receipt acknowledgment
    const msgText = `💳 *Payment Acknowledgment*\n\nHello ${customer.name},\nWe have successfully received your payment of *${formatCurrency(amount)}* (Ref: ${payRef}).\n\nYour current outstanding balance is: *${formatCurrency(newTotalDue)}*.\nThank you for your prompt settlement!`;

    const waMsg: WhatsAppMessage = {
      id: uid('wa'),
      type: 'payment_reminder',
      recipientName: customer.name,
      recipientPhone: customer.phone,
      recipientType: 'customer',
      message: msgText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'delivered',
    };

    setWhatsappMessages((prev) => [waMsg, ...prev]);
    setRecentWhatsAppAlert(waMsg);
  };

  const recordSupplierPayment = (supplierId: string, amount: number, notes?: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) return;

    const today = new Date().toISOString().split('T')[0];
    const newTotalOwed = Math.max(0, Number((supplier.totalOwed - amount).toFixed(2)));

    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplierId ? { ...s, totalOwed: newTotalOwed } : s))
    );

    const payRef = `SUP-PAY-${Math.floor(1000 + Math.random() * 9000)}`;
    const newLedger: LedgerEntry = {
      id: uid('led'),
      entityType: 'supplier',
      entityId: supplierId,
      type: 'payment_made',
      referenceId: payRef,
      date: today,
      description: notes ? `Supplier payment made: ${notes}` : `Supplier payment made (${payRef})`,
      debit: 0,
      credit: amount,
      balanceAfter: newTotalOwed,
    };

    setLedger((prev) => [newLedger, ...prev]);
  };

  const sendWhatsAppReminder = (customerId: string, customText?: string): WhatsAppMessage => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) throw new Error('Customer not found');

    const defaultMsg = `📋 *Sarmaya Statement & Gentle Reminder*\n\nHello ${customer.name},\nHope you are having a productive week!\nThis is a gentle update regarding your outstanding balance of *${formatCurrency(customer.totalDue)}* for recent bulk shipments.\n\nIf you have already processed this payment, please disregard this note or share the receipt with us. Thank you for your continued partnership!`;

    const messageContent = customText || defaultMsg;

    const waMsg: WhatsAppMessage = {
      id: uid('wa'),
      type: 'payment_reminder',
      recipientName: customer.name,
      recipientPhone: customer.phone,
      recipientType: 'customer',
      message: messageContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'delivered',
    };

    setWhatsappMessages((prev) => [waMsg, ...prev]);
    setRecentWhatsAppAlert(waMsg);
    return waMsg;
  };

  const sendWhatsAppDirect = (phone: string, text: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(text);
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const runAutomatedOverdueCheck = (): number => {
    const overdueCustomers = customers.filter((c) => c.totalDue > 0);
    let count = 0;

    overdueCustomers.forEach((cust) => {
      const msg = sendWhatsAppReminder(cust.id);
      if (msg) count++;
    });

    return count;
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
  }, [auditLogs]);

  const logAuditEvent = (action: string, details: string, severity: 'info' | 'warning' | 'danger' = 'info') => {
    const newEntry: AuditLogEntry = {
      id: uid('audit'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action,
      details,
      severity,
    };
    setAuditLogs((prev) => [newEntry, ...prev.slice(0, 99)]);
  };

  const clearAuditLogs = () => {
    setAuditLogs([]);
    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
  };

  const unlockAdmin = (pin: string): boolean => {
    if (pin.trim() === adminPin.trim()) {
      setIsAdminUnlocked(true);
      logAuditEvent('Admin Session Unlocked', 'Master PIN successfully verified.', 'info');
      return true;
    }
    logAuditEvent('Invalid PIN Attempt', `Unsuccessful PIN entry attempt.`, 'warning');
    return false;
  };

  const lockAdmin = () => {
    setIsAdminUnlocked(false);
    logAuditEvent('Admin Session Locked', 'Security session manually locked.', 'info');
  };

  const changeAdminPin = (oldPin: string, newPin: string): { success: boolean; message: string } => {
    if (oldPin.trim() !== adminPin.trim()) {
      logAuditEvent('PIN Change Rejected', 'Provided existing PIN did not match.', 'warning');
      return { success: false, message: 'Current PIN is incorrect.' };
    }
    const clean = newPin.trim();
    if (!/^\d{4,6}$/.test(clean)) {
      return { success: false, message: 'New PIN must be exactly 4 to 6 numeric digits.' };
    }
    setAdminPin(clean);
    localStorage.setItem(STORAGE_KEYS.ADMIN_PIN, clean);
    logAuditEvent('Master PIN Updated', 'Administrator established a new master PIN.', 'warning');
    return { success: true, message: 'Master PIN successfully updated.' };
  };

  const resetAdminPinToDefault = () => {
    setAdminPin(DEFAULT_ADMIN_PIN);
    localStorage.setItem(STORAGE_KEYS.ADMIN_PIN, DEFAULT_ADMIN_PIN);
    logAuditEvent('Master PIN Reset', 'Master PIN restored to factory default (7860).', 'warning');
  };

  const exportSystemBackup = (): string => {
    const backupData = {
      appName: 'Sarmaya - Pakistani Bulk Trading & Logistics',
      exportedAt: new Date().toISOString(),
      version: '1.0',
      customers,
      suppliers,
      products,
      bookings,
      dispatches,
      ledger,
      whatsappMessages,
      auditLogs,
    };
    const jsonString = JSON.stringify(backupData, null, 2);
    try {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sarmaya-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logAuditEvent('Backup Exported', 'Full system database exported to JSON file.', 'info');
    } catch (e) {
      console.error(e);
    }
    return jsonString;
  };

  const importSystemBackup = (jsonContent: string): { success: boolean; message: string } => {
    try {
      const data = JSON.parse(jsonContent);
      if (!data || typeof data !== 'object') {
        return { success: false, message: 'Invalid JSON backup format.' };
      }
      // Backup replaces the dataset, so rows missing from the backup must go from the cloud too.
      if (isCloudSyncReady) void clearAllTables();
      if (Array.isArray(data.customers)) setCustomers(data.customers);
      if (Array.isArray(data.suppliers)) setSuppliers(data.suppliers);
      if (Array.isArray(data.products)) setProducts(data.products);
      if (Array.isArray(data.bookings)) setBookings(data.bookings);
      if (Array.isArray(data.dispatches)) setDispatches(data.dispatches);
      if (Array.isArray(data.ledger)) setLedger(data.ledger);
      if (Array.isArray(data.whatsappMessages)) setWhatsappMessages(data.whatsappMessages);
      if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);

      logAuditEvent('Backup Restored', 'Full system database restored from JSON backup.', 'warning');
      return { success: true, message: 'Database successfully restored from backup.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to parse JSON backup file.' };
    }
  };

  const factoryResetAllData = () => {
    if (isCloudSyncReady) void clearAllTables();
    setCustomers([]);
    setSuppliers([]);
    setProducts([]);
    setBookings([]);
    setDispatches([]);
    setLedger([]);
    setWhatsappMessages([]);
    localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
    localStorage.removeItem(STORAGE_KEYS.SUPPLIERS);
    localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
    localStorage.removeItem(STORAGE_KEYS.BOOKINGS);
    localStorage.removeItem(STORAGE_KEYS.DISPATCHES);
    localStorage.removeItem(STORAGE_KEYS.LEDGER);
    localStorage.removeItem(STORAGE_KEYS.MESSAGES);
    logAuditEvent('Factory Data Purged', 'Administrator performed complete system wipe.', 'danger');
  };

  return (
    <TradingContext.Provider
      value={{
        customers,
        suppliers,
        products,
        bookings,
        dispatches,
        ledger,
        whatsappMessages,
        activeScreen,
        setActiveScreen,
        selectedCustomerId,
        setSelectedCustomerId,
        selectedSupplierId,
        setSelectedSupplierId,
        addCustomer,
        updateCustomer,
        addSupplier,
        updateSupplier,
        addProduct,
        updateProduct,
        updateBooking,
        deleteCustomer,
        deleteSupplier,
        deleteProduct,
        deleteBooking,
        deleteDispatch,
        deleteLedgerEntry,
        deleteWhatsAppMessage,
        purgeTable,
        isCloudSyncEnabled: isSupabaseConfigured,
        isCloudSyncReady,
        createBooking,
        logDispatch,
        recordCustomerPayment,
        recordSupplierPayment,
        sendWhatsAppReminder,
        sendWhatsAppDirect,
        runAutomatedOverdueCheck,
        resetToSampleData,
        recentWhatsAppAlert,
        clearRecentAlert,
        isAdminUnlocked,
        unlockAdmin,
        lockAdmin,
        adminPin,
        changeAdminPin,
        resetAdminPinToDefault,
        auditLogs,
        logAuditEvent,
        clearAuditLogs,
        exportSystemBackup,
        importSystemBackup,
        factoryResetAllData,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
};
