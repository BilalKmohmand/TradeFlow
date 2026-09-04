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
  Purchase,
  PriceHistoryEntry,
  PriceSource,
  ReportsTab,
  OpsTab,
  Expense,
  Truck,
  AppUser,
  CashEntry,
  AppSettings,
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  SessionUser,
} from '../types';
import { formatCurrency } from '../utils/formatters';
import {
  loadAllData,
  deleteRows,
  clearTable,
  clearAllTables,
  TableName,
  normalizeProduct,
  normalizeBooking,
  normalizeDispatch,
  normalizeLedger,
} from '../lib/database';
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
  purchases: Purchase[];
  priceHistory: PriceHistoryEntry[];
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
  selectedBookingId: string | null;
  highlightDispatchId: string | null;
  openBooking: (bookingId: string | null, dispatchId?: string | null) => void;
  /** Navigate to Reports with a specific tab open (used by dashboard drill-downs). */
  openReports: (tab: ReportsTab) => void;
  requestedReportsTab: ReportsTab | null;
  clearRequestedReportsTab: () => void;
  openOps: (tab: OpsTab) => void;
  requestedOpsTab: OpsTab | null;
  /** Cross-cutting UI requests handled by App: which record to edit / which document to print. */
  editRequest: EditRequest | null;
  setEditRequest: (r: EditRequest | null) => void;
  printRequest: PrintRequestLike | null;
  setPrintRequest: (r: PrintRequestLike | null) => void;
  
  // Actions
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'totalDue'>) => Customer;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt' | 'totalOwed'>) => Supplier;
  updateSupplier: (id: string, data: Partial<Supplier>) => void;
  addProduct: (product: Omit<Product, 'id'>) => Product;
  updateProduct: (id: string, data: Partial<Product>) => void;
  updateBooking: (id: string, data: Partial<Booking>) => void;

  // Incoming stock (purchases from suppliers)
  addPurchase: (data: {
    supplierId: string;
    productId: string;
    kg: number;
    pricePerKg: number;
    date?: string;
    truckNumber?: string;
    notes?: string;
    paymentMadeImmediately?: boolean;
  }) => Purchase;
  deletePurchase: (id: string) => DeleteSummary;

  // Price history
  /** Set a new current selling price and record it in the history. */
  updateProductPrice: (productId: string, pricePerKg: number, note?: string) => void;
  /** Record a historical price point (e.g. back-filling last year's prices) without touching the current price. */
  addPricePoint: (productId: string, pricePerKg: number, date: string, note?: string) => PriceHistoryEntry;
  deletePricePoint: (id: string) => void;

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

  // Enterprise: expenses, fleet, users & roles
  expenses: Expense[];
  trucks: Truck[];
  users: AppUser[];
  addExpense: (data: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => Expense;
  updateExpense: (id: string, data: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addTruck: (data: Omit<Truck, 'id' | 'createdAt'>) => Truck;
  updateTruck: (id: string, data: Partial<Truck>) => void;
  deleteTruck: (id: string) => void;
  addUser: (data: { name: string; role: UserRole; pin: string }) => { success: boolean; message: string };
  updateUser: (id: string, data: Partial<Omit<AppUser, 'id' | 'createdAt'>>) => { success: boolean; message: string };
  deleteUser: (id: string) => void;
  currentUser: SessionUser | null;
  can: (permission: Permission) => boolean;
  unlockAsUser: (userId: string, pin: string) => boolean;
  cancelBooking: (id: string, reason?: string) => void;
  cashEntries: CashEntry[];
  addCashEntry: (data: Omit<CashEntry, 'id' | 'createdAt' | 'createdBy'>) => CashEntry;
  deleteCashEntry: (id: string) => void;
  settings: AppSettings;
  updateSettings: (data: Partial<Omit<AppSettings, 'id'>>) => void;
  
  createBooking: (bookingData: {
    customerId: string;
    productId: string;
    totalKg: number;
    pricePerKg: number;
    targetDeliveryDate?: string;
    notes?: string;
  }) => Booking;
  
  logDispatch: (dispatchData: {
    bookingId: string;
    kg: number;
    truckNumber: string;
    truckId?: string | null;
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
  purchases: number;
  priceHistory: number;
  ledger: number;
  whatsappMessages: number;
}

const emptySummary = (): DeleteSummary => ({
  customers: 0,
  suppliers: 0,
  products: 0,
  bookings: 0,
  dispatches: 0,
  purchases: 0,
  priceHistory: 0,
  ledger: 0,
  whatsappMessages: 0,
});

export const todayISO = () => new Date().toISOString().split('T')[0];

export type EditRequest = { type: 'customer' | 'supplier' | 'product' | 'booking'; id: string };
/** Mirrors PrintRequest in components/PrintDocument.tsx without importing a component into the context. */
export type PrintRequestLike =
  | { type: 'invoice'; dispatchId: string }
  | { type: 'challan'; dispatchId: string }
  | { type: 'statement'; customerId: string; from: string; to: string }
  | { type: 'supplier_statement'; supplierId: string; from: string; to: string };

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
    details: 'Calculated and balanced customer receivables against delivered volume.',
    severity: 'info',
  },
];

const STORAGE_KEYS = {
  CUSTOMERS: 'tradeflow_customers_v2',
  SUPPLIERS: 'tradeflow_suppliers_v2',
  PRODUCTS: 'tradeflow_products_v2',
  BOOKINGS: 'tradeflow_bookings_v2',
  DISPATCHES: 'tradeflow_dispatches_v2',
  PURCHASES: 'tradeflow_purchases_v2',
  PRICE_HISTORY: 'tradeflow_price_history_v2',
  EXPENSES: 'tradeflow_expenses_v2',
  TRUCKS: 'tradeflow_trucks_v2',
  USERS: 'tradeflow_users_v2',
  CASH: 'tradeflow_cash_entries_v2',
  SETTINGS: 'tradeflow_settings_v2',
  LEDGER: 'tradeflow_ledger_v2',
  MESSAGES: 'tradeflow_whatsapp_v2',
  ADMIN_PIN: 'sarmaya_admin_pin_v1',
  AUDIT_LOGS: 'sarmaya_audit_logs_v1',
};

/**
 * Read a v2 (kg) collection from localStorage. If only the old v1 (tons) snapshot exists,
 * convert it once via the given normaliser so nothing is lost on upgrade.
 */
const loadLocal = <T,>(key: string, fallback: T[], normalise?: (row: any) => T): T[] => {
  const current = localStorage.getItem(key);
  if (current) return safeParse(current, fallback);
  const legacyKey = key.replace('_v2', '_v1');
  const legacy = localStorage.getItem(legacyKey);
  if (!legacy) return fallback;
  const rows = safeParse<any[]>(legacy, []);
  return normalise ? rows.map(normalise) : (rows as T[]);
};

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminPin, setAdminPin] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEYS.ADMIN_PIN) || DEFAULT_ADMIN_PIN
  );
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS), initialAuditLogs)
  );
  const [customers, setCustomers] = useState<Customer[]>(() => loadLocal(STORAGE_KEYS.CUSTOMERS, initialCustomers));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadLocal(STORAGE_KEYS.SUPPLIERS, initialSuppliers));
  const [products, setProducts] = useState<Product[]>(() => loadLocal(STORAGE_KEYS.PRODUCTS, initialProducts, normalizeProduct));
  const [bookings, setBookings] = useState<Booking[]>(() => loadLocal(STORAGE_KEYS.BOOKINGS, initialBookings, normalizeBooking));
  const [dispatches, setDispatches] = useState<Dispatch[]>(() => loadLocal(STORAGE_KEYS.DISPATCHES, initialDispatches, normalizeDispatch));
  const [purchases, setPurchases] = useState<Purchase[]>(() => loadLocal(STORAGE_KEYS.PURCHASES, []));
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>(() => loadLocal(STORAGE_KEYS.PRICE_HISTORY, []));
  const [expenses, setExpenses] = useState<Expense[]>(() => loadLocal(STORAGE_KEYS.EXPENSES, []));
  const [trucks, setTrucks] = useState<Truck[]>(() => loadLocal(STORAGE_KEYS.TRUCKS, []));
  const [users, setUsers] = useState<AppUser[]>(() => loadLocal(STORAGE_KEYS.USERS, []));
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() => loadLocal(STORAGE_KEYS.CASH, []));
  const [settings, setSettings] = useState<AppSettings>(() =>
    safeParse<AppSettings>(localStorage.getItem(STORAGE_KEYS.SETTINGS), { id: 'default', cashOpeningBalance: 0, cashOpeningDate: todayISO() })
  );
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => loadLocal(STORAGE_KEYS.LEDGER, initialLedgerEntries, normalizeLedger));
  const [whatsappMessages, setWhatsappMessages] = useState<WhatsAppMessage[]>(() =>
    loadLocal(STORAGE_KEYS.MESSAGES, initialWhatsAppMessages)
  );

  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [highlightDispatchId, setHighlightDispatchId] = useState<string | null>(null);
  const [requestedReportsTab, setRequestedReportsTab] = useState<ReportsTab | null>(null);
  const [requestedOpsTab, setRequestedOpsTab] = useState<OpsTab | null>(null);
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null);
  const [printRequest, setPrintRequest] = useState<PrintRequestLike | null>(null);
  const openOps = (tab: OpsTab) => {
    setRequestedOpsTab(tab);
    setActiveScreen('ops');
  };

  const openBooking = (bookingId: string | null, dispatchId: string | null = null) => {
    setSelectedBookingId(bookingId);
    setHighlightDispatchId(bookingId ? dispatchId : null);
  };

  const openReports = (tab: ReportsTab) => {
    setRequestedReportsTab(tab);
    setActiveScreen('reports');
  };
  const clearRequestedReportsTab = () => setRequestedReportsTab(null);
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
        setPurchases(data.purchases);
        setPriceHistory(data.priceHistory);
        setExpenses(data.expenses);
        setTrucks(data.trucks);
        setUsers(data.users);
        setCashEntries(data.cashEntries);
        if (data.settings) setSettings({ ...data.settings, id: 'default' });
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
    localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(purchases));
  }, [purchases]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRICE_HISTORY, JSON.stringify(priceHistory));
  }, [priceHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TRUCKS, JSON.stringify(trucks));
  }, [trucks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CASH, JSON.stringify(cashEntries));
  }, [cashEntries]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

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
  useEffect(() => { void syncToSupabase('purchases', purchases); }, [purchases, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('price_history', priceHistory); }, [priceHistory, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('expenses', expenses); }, [expenses, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('trucks', trucks); }, [trucks, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('users', users); }, [users, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('cash_entries', cashEntries); }, [cashEntries, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('settings', [settings]); }, [settings, isCloudSyncReady]);
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
    setPurchases([]);
    setPriceHistory([]);
    setExpenses([]);
    setTrucks([]);
    setCashEntries([]);
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

  const recordPrice = (productId: string, pricePerKg: number, date: string, source: PriceSource, note?: string, referenceId?: string) => {
    const entry: PriceHistoryEntry = { id: uid('price'), productId, pricePerKg: round2(pricePerKg), date, source, note, referenceId };
    setPriceHistory((prev) => [entry, ...prev]);
    return entry;
  };

  const addProduct = (data: Omit<Product, 'id'>): Product => {
    const newProd: Product = {
      ...data,
      id: uid('prod'),
    };
    setProducts((prev) => [newProd, ...prev]);
    recordPrice(newProd.id, newProd.unitPricePerKg, todayISO(), 'product_created', 'Initial listed price');
    return newProd;
  };

  const updateProduct = (id: string, data: Partial<Product>) => {
    const existing = products.find((p) => p.id === id);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    if (existing && data.unitPricePerKg != null && round2(data.unitPricePerKg) !== round2(existing.unitPricePerKg)) {
      recordPrice(id, data.unitPricePerKg, todayISO(), 'price_update', `Changed from Rs. ${existing.unitPricePerKg}/kg`);
    }
  };

  const updateProductPrice = (productId: string, pricePerKg: number, note?: string) => {
    const existing = products.find((p) => p.id === productId);
    if (!existing) return;
    const clean = round2(pricePerKg);
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, unitPricePerKg: clean } : p)));
    recordPrice(productId, clean, todayISO(), 'price_update', note || `Changed from Rs. ${existing.unitPricePerKg}/kg`);
    logAuditEvent('Product Price Updated', `${existing.name}: Rs. ${existing.unitPricePerKg}/kg → Rs. ${clean}/kg`, 'info');
  };

  const addPricePoint = (productId: string, pricePerKg: number, date: string, note?: string): PriceHistoryEntry => {
    const entry = recordPrice(productId, pricePerKg, date, 'manual', note);
    logAuditEvent('Price Point Recorded', `${products.find((p) => p.id === productId)?.name || productId}: Rs. ${round2(pricePerKg)}/kg on ${date}`, 'info');
    return entry;
  };

  const deletePricePoint = (id: string) => {
    setPriceHistory((prev) => prev.filter((e) => e.id !== id));
    removeRemote('price_history', [id]);
  };

  // ---------------------------------------------------------------------------
  // Incoming stock (purchases)
  // ---------------------------------------------------------------------------

  const addPurchase = ({
    supplierId,
    productId,
    kg,
    pricePerKg,
    date,
    truckNumber,
    notes,
    paymentMadeImmediately = false,
  }: {
    supplierId: string;
    productId: string;
    kg: number;
    pricePerKg: number;
    date?: string;
    truckNumber?: string;
    notes?: string;
    paymentMadeImmediately?: boolean;
  }): Purchase => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    const product = products.find((p) => p.id === productId);
    if (!supplier || !product) throw new Error('Supplier or product not found');

    const onDate = date || todayISO();
    const amount = round2(kg * pricePerKg);
    const receiptNumber = `GRN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const purchase: Purchase = {
      id: uid('pur'),
      receiptNumber,
      supplierId,
      productId,
      kg: round2(kg),
      pricePerKg: round2(pricePerKg),
      amount,
      date: onDate,
      truckNumber: truckNumber?.toUpperCase() || undefined,
      notes,
      paymentMadeImmediately,
      createdAt: todayISO(),
    };

    // 1. Stock in
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, stockKg: round2(p.stockKg + kg) } : p)));

    // 2. Supplier payable
    const newOwed = paymentMadeImmediately ? supplier.totalOwed : round2(supplier.totalOwed + amount);
    setSuppliers((prev) => prev.map((s) => (s.id === supplierId ? { ...s, totalOwed: newOwed } : s)));

    // 3. Ledger
    const entries: LedgerEntry[] = [
      {
        id: uid('led'),
        entityType: 'supplier',
        entityId: supplierId,
        type: 'purchase_received',
        referenceId: receiptNumber,
        date: onDate,
        description: `Stock received ${receiptNumber}: ${kg.toLocaleString()} kg ${product.name}`,
        debit: amount,
        credit: 0,
        balanceAfter: round2(supplier.totalOwed + amount),
        kg,
      },
    ];
    if (paymentMadeImmediately) {
      entries.push({
        id: uid('led'),
        entityType: 'supplier',
        entityId: supplierId,
        type: 'payment_made',
        referenceId: `PAY-${receiptNumber}`,
        date: onDate,
        description: `Paid on receipt for ${receiptNumber}`,
        debit: 0,
        credit: amount,
        balanceAfter: supplier.totalOwed,
      });
    }
    setLedger((prev) => [...entries, ...prev]);
    setPurchases((prev) => [purchase, ...prev]);

    logAuditEvent('Stock Received', `${receiptNumber}: ${kg.toLocaleString()} kg ${product.name} from ${supplier.company} (${formatCurrency(amount)})`, 'info');
    return purchase;
  };

  const deletePurchase = (id: string): DeleteSummary => {
    const summary = emptySummary();
    const target = purchases.find((p) => p.id === id);
    if (!target) return summary;
    const refs = new Set([target.receiptNumber, `PAY-${target.receiptNumber}`]);
    const ledgerIds = ledger.filter((l) => refs.has(l.referenceId)).map((l) => l.id);

    setProducts((prev) => prev.map((p) => (p.id === target.productId ? { ...p, stockKg: Math.max(0, round2(p.stockKg - target.kg)) } : p)));
    if (!target.paymentMadeImmediately) {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === target.supplierId ? { ...s, totalOwed: Math.max(0, round2(s.totalOwed - target.amount)) } : s))
      );
    }
    setLedger((prev) => prev.filter((l) => !refs.has(l.referenceId)));
    setPurchases((prev) => prev.filter((p) => p.id !== id));
    removeRemote('ledger', ledgerIds);
    removeRemote('purchases', [id]);

    summary.purchases = 1;
    summary.ledger = ledgerIds.length;
    logAuditEvent('Stock Receipt Deleted', `${target.receiptNumber} (${target.kg.toLocaleString()} kg, ${formatCurrency(target.amount)}) removed; stock and supplier balance reversed.`, 'danger');
    return summary;
  };

  const updateBooking = (id: string, data: Partial<Booking>) => {
    setBookings((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const next = { ...b, ...data };
        if (data.totalKg != null || data.pricePerKg != null) {
          next.totalKg = Math.max(round2(next.totalKg), next.dispatchedKg);
          next.remainingKg = Math.max(0, round2(next.totalKg - next.dispatchedKg));
          next.totalAmount = round2(next.totalKg * next.pricePerKg);
          if (next.status !== 'cancelled') next.status = next.remainingKg === 0 ? 'completed' : 'active';
          next.paymentStatus = next.paidAmount <= 0 ? 'unpaid' : next.paidAmount >= next.totalAmount ? 'paid' : 'partial';
        }
        return next;
      })
    );
    const existing = bookings.find((b) => b.id === id);
    if (existing) logAuditEvent('Booking Updated', `${existing.bookingNumber}: ${Object.keys(data).join(', ')} changed.`, 'info');
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
    targets.forEach((d) => stockDelta.set(d.productId, (stockDelta.get(d.productId) || 0) + d.kg));
    setProducts((prev) =>
      prev.map((p) => (stockDelta.has(p.id) ? { ...p, stockKg: round2(p.stockKg + (stockDelta.get(p.id) || 0)) } : p))
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
          const kg = ds.reduce((a, d) => a + d.kg, 0);
          const paid = ds.filter((d) => d.paymentReceivedImmediately).reduce((a, d) => a + d.amount, 0);
          const dispatchedKg = Math.max(0, round2(b.dispatchedKg - kg));
          const remainingKg = Math.max(0, round2(b.totalKg - dispatchedKg));
          const paidAmount = Math.max(0, round2(b.paidAmount - paid));
          const paymentStatus = paidAmount <= 0 ? 'unpaid' : paidAmount >= b.totalAmount ? 'paid' : 'partial';
          return {
            ...b,
            dispatchedKg,
            remainingKg,
            paidAmount,
            paymentStatus,
            status: b.status === 'cancelled' ? 'cancelled' : remainingKg === 0 ? 'completed' : 'active',
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
      `${target.dispatchNumber} (${target.kg} kg, ${formatCurrency(target.amount)}) removed; stock, booking progress and customer balance reversed.`,
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
    if (selectedBookingId && bookingIds.has(selectedBookingId)) openBooking(null);

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

    const customerBookings = bookings.filter((b) => b.customerId === id);
    const removedBookingIds = new Set(customerBookings.map((b) => b.id));
    const summary = removeBookings(customerBookings);

    // Remaining rows that point at the customer directly (payments, reminders, dispatches whose booking is gone)
    const strayDispatchIds = dispatches.filter((d) => d.customerId === id && !removedBookingIds.has(d.bookingId)).map((d) => d.id);
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

    // Purchases from this supplier go too (stock stays as received; only the payable is written off).
    const purchaseIds = purchases.filter((p) => p.supplierId === id).map((p) => p.id);
    const purchaseRefs = new Set<string>();
    purchases.filter((p) => p.supplierId === id).forEach((p) => { purchaseRefs.add(p.receiptNumber); purchaseRefs.add(`PAY-${p.receiptNumber}`); });
    const purchaseLedgerIds = ledger.filter((l) => purchaseRefs.has(l.referenceId)).map((l) => l.id);
    setPurchases((prev) => prev.filter((p) => p.supplierId !== id));
    setLedger((prev) => prev.filter((l) => !purchaseRefs.has(l.referenceId)));
    removeRemote('purchases', purchaseIds);
    removeRemote('ledger', purchaseLedgerIds);
    summary.purchases = purchaseIds.length;

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

    const productBookings = bookings.filter((b) => b.productId === id);
    const removedBookingIds = new Set(productBookings.map((b) => b.id));
    const summary = removeBookings(productBookings);
    const strayDispatchIds = dispatches.filter((d) => d.productId === id && !removedBookingIds.has(d.bookingId)).map((d) => d.id);

    const purchaseIds = purchases.filter((p) => p.productId === id).map((p) => p.id);
    const priceIds = priceHistory.filter((e) => e.productId === id).map((e) => e.id);
    setDispatches((prev) => prev.filter((d) => d.productId !== id));
    setPurchases((prev) => prev.filter((p) => p.productId !== id));
    setPriceHistory((prev) => prev.filter((e) => e.productId !== id));
    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (selectedProductId === id) setSelectedProductId(null);
    removeRemote('dispatches', strayDispatchIds);
    removeRemote('purchases', purchaseIds);
    removeRemote('price_history', priceIds);
    removeRemote('products', [id]);

    summary.products = 1;
    summary.purchases = purchaseIds.length;
    summary.priceHistory = priceIds.length;
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
      purchases: () => setPurchases([]),
      price_history: () => setPriceHistory([]),
      expenses: () => setExpenses([]),
      trucks: () => setTrucks([]),
      users: () => setUsers([]),
      cash_entries: () => setCashEntries([]),
      settings: () => setSettings({ id: 'default', cashOpeningBalance: 0, cashOpeningDate: todayISO() }),
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
    totalKg,
    pricePerKg,
    targetDeliveryDate,
    notes,
  }: {
    customerId: string;
    productId: string;
    totalKg: number;
    pricePerKg: number;
    targetDeliveryDate?: string;
    notes?: string;
  }): Booking => {
    const bookingNum = `BK-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const totalAmount = totalKg * pricePerKg;
    const newBooking: Booking = {
      id: uid('book'),
      bookingNumber: bookingNum,
      customerId,
      productId,
      totalKg,
      dispatchedKg: 0,
      remainingKg: totalKg,
      pricePerKg,
      totalAmount,
      paidAmount: 0,
      status: 'active',
      paymentStatus: 'unpaid',
      createdAt: new Date().toISOString().split('T')[0],
      targetDeliveryDate,
      notes,
    };

    setBookings((prev) => [newBooking, ...prev]);
    recordPrice(productId, pricePerKg, newBooking.createdAt, 'booking', `Agreed in ${bookingNum}`, newBooking.id);

    // Send instant WhatsApp booking confirmation
    const customer = customers.find((c) => c.id === customerId);
    const product = products.find((p) => p.id === productId);
    if (customer && product) {
      const msgText = `📑 *Sarmaya Booking Confirmed*\n\nHello ${customer.name},\nYour booking *${bookingNum}* for *${totalKg.toLocaleString()} kg* of *${product.name}* has been scheduled at *${formatCurrency(pricePerKg)}/kg* (Total: *${formatCurrency(totalAmount)}*).\n\nDispatches will be notified automatically with truck & driver details upon release. Thank you for your business!`;

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
    kg,
    truckNumber,
    truckId = null,
    driverPhone,
    notes,
    paymentReceivedImmediately = false,
    sendWhatsApp = true,
  }: {
    bookingId: string;
    kg: number;
    truckNumber: string;
    truckId?: string | null;
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
    const dispatchAmount = kg * booking.pricePerKg;

    // Recalculate kg
    const newDispatchedKg = Number((booking.dispatchedKg + kg).toFixed(2));
    const newRemainingKg = Math.max(0, Number((booking.totalKg - newDispatchedKg).toFixed(2)));
    const newStatus: BookingStatus = newRemainingKg === 0 ? 'completed' : 'active';

    const dispatchNum = `DSP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    let generatedMessage = '';
    if (customer && product) {
      generatedMessage = `🚚 *Sarmaya Dispatch Alert*\n\nHello ${customer.name},\nTruck *${truckNumber.toUpperCase()}* carrying *${kg.toLocaleString()} kg* of *${product.name}* is on its way to your destination.\n\n📊 *Booking Status (${booking.bookingNumber})*:\n• Dispatched Now: ${kg.toLocaleString()} kg\n• Remaining Balance: ${newRemainingKg.toLocaleString()} kg\n• Invoice for this dispatch: *${formatCurrency(dispatchAmount)}*\n\n💳 Kindly confirm once payment has been initiated for this shipment.\nThank you for trading with us!`;
    }

    const newDispatch: Dispatch = {
      id: uid('disp'),
      dispatchNumber: dispatchNum,
      bookingId,
      customerId: booking.customerId,
      productId: booking.productId,
      kg,
      amount: dispatchAmount,
      truckNumber: truckNumber.toUpperCase(),
      truckId,
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
              dispatchedKg: newDispatchedKg,
              remainingKg: newRemainingKg,
              status: newStatus,
              paidAmount: paymentReceivedImmediately ? b.paidAmount + dispatchAmount : b.paidAmount,
              paymentStatus:
                paymentReceivedImmediately && newDispatchedKg >= b.totalKg
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
          ? { ...p, stockKg: Math.max(0, Number((p.stockKg - kg).toFixed(2))) }
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
      description: `Dispatch ${dispatchNum}: ${kg} kg ${product?.name || 'goods'}`,
      debit: dispatchAmount,
      credit: 0,
      balanceAfter: Number((currentCustomerDue + dispatchAmount).toFixed(2)),
      kg,
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
      user: currentUser?.name,
    };
    setAuditLogs((prev) => [newEntry, ...prev.slice(0, 99)]);
  };

  const clearAuditLogs = () => {
    setAuditLogs([]);
    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
  };

  const unlockAdmin = (pin: string): boolean => {
    if (pin.trim() === adminPin.trim()) {
      setCurrentUser({ id: 'master', name: 'Administrator', role: 'admin' });
      setIsAdminUnlocked(true);
      logAuditEvent('Session Unlocked', 'Master PIN verified (Administrator).', 'info');
      return true;
    }
    logAuditEvent('Invalid PIN Attempt', `Unsuccessful master PIN entry attempt.`, 'warning');
    return false;
  };

  const unlockAsUser = (userId: string, pin: string): boolean => {
    const user = users.find((u) => u.id === userId && u.active);
    if (user && pin.trim() === user.pin.trim()) {
      setCurrentUser({ id: user.id, name: user.name, role: user.role });
      setIsAdminUnlocked(true);
      setAuditLogs((prev) => [
        {
          id: uid('audit'),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          action: 'Session Unlocked',
          details: `${user.name} signed in as ${user.role}.`,
          severity: 'info',
          user: user.name,
        },
        ...prev.slice(0, 99),
      ]);
      return true;
    }
    logAuditEvent('Invalid PIN Attempt', `Unsuccessful PIN entry for user ${user?.name || userId}.`, 'warning');
    return false;
  };

  const can = (permission: Permission): boolean => {
    if (!currentUser) return false;
    return ROLE_PERMISSIONS[currentUser.role].includes(permission);
  };

  const lockAdmin = () => {
    logAuditEvent('Session Locked', `${currentUser?.name || 'Session'} locked the terminal.`, 'info');
    setIsAdminUnlocked(false);
    setCurrentUser(null);
  };

  // ---------------------------------------------------------------------------
  // Users & roles
  // ---------------------------------------------------------------------------
  const validPin = (pin: string) => /^\d{4,6}$/.test(pin.trim());

  const addUser = ({ name, role, pin }: { name: string; role: UserRole; pin: string }) => {
    const clean = name.trim();
    if (!clean) return { success: false, message: 'Name is required.' };
    if (!validPin(pin)) return { success: false, message: 'PIN must be 4 to 6 digits.' };
    if (users.some((u) => u.name.toLowerCase() === clean.toLowerCase())) return { success: false, message: 'A user with that name already exists.' };
    if (users.some((u) => u.pin === pin.trim() && u.active)) return { success: false, message: 'Another active user already uses that PIN. Pick a different one.' };
    const user: AppUser = { id: uid('user'), name: clean, role, pin: pin.trim(), active: true, createdAt: todayISO() };
    setUsers((prev) => [user, ...prev]);
    logAuditEvent('User Added', `${clean} created with role ${role}.`, 'warning');
    return { success: true, message: `${clean} added.` };
  };

  const updateUser = (id: string, data: Partial<Omit<AppUser, 'id' | 'createdAt'>>) => {
    const existing = users.find((u) => u.id === id);
    if (!existing) return { success: false, message: 'User not found.' };
    if (data.pin != null && !validPin(data.pin)) return { success: false, message: 'PIN must be 4 to 6 digits.' };
    if (data.pin != null && users.some((u) => u.id !== id && u.active && u.pin === data.pin!.trim())) return { success: false, message: 'Another active user already uses that PIN.' };
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data, pin: data.pin != null ? data.pin.trim() : u.pin } : u)));
    logAuditEvent('User Updated', `${existing.name}: ${Object.keys(data).filter((k) => k !== 'pin').join(', ') || 'PIN'} changed.`, 'warning');
    return { success: true, message: 'User updated.' };
  };

  const deleteUser = (id: string) => {
    const existing = users.find((u) => u.id === id);
    if (!existing) return;
    setUsers((prev) => prev.filter((u) => u.id !== id));
    removeRemote('users', [id]);
    logAuditEvent('User Removed', `${existing.name} (${existing.role}) removed.`, 'danger');
  };

  // ---------------------------------------------------------------------------
  // Expenses
  // ---------------------------------------------------------------------------
  const addExpense = (data: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>): Expense => {
    const expense: Expense = { ...data, amount: round2(data.amount), id: uid('exp'), createdAt: todayISO(), createdBy: currentUser?.name };
    setExpenses((prev) => [expense, ...prev]);
    logAuditEvent('Expense Recorded', `${data.category}: ${formatCurrency(expense.amount)} — ${data.description}`, 'info');
    return expense;
  };

  const updateExpense = (id: string, data: Partial<Expense>) => {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...data, amount: data.amount != null ? round2(data.amount) : e.amount } : e)));
  };

  const deleteExpense = (id: string) => {
    const existing = expenses.find((e) => e.id === id);
    if (!existing) return;
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    removeRemote('expenses', [id]);
    logAuditEvent('Expense Deleted', `${existing.category}: ${formatCurrency(existing.amount)} — ${existing.description}`, 'danger');
  };

  // ---------------------------------------------------------------------------
  // Fleet
  // ---------------------------------------------------------------------------
  const addTruck = (data: Omit<Truck, 'id' | 'createdAt'>): Truck => {
    const truck: Truck = { ...data, number: data.number.trim().toUpperCase(), id: uid('truck'), createdAt: todayISO() };
    setTrucks((prev) => [truck, ...prev]);
    logAuditEvent('Vehicle Added', `${truck.number} (${truck.driverName || 'no driver'}, ${truck.capacityKg.toLocaleString()} kg).`, 'info');
    return truck;
  };

  const updateTruck = (id: string, data: Partial<Truck>) => {
    setTrucks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data, number: data.number != null ? data.number.trim().toUpperCase() : t.number } : t)));
  };

  const deleteTruck = (id: string) => {
    const existing = trucks.find((t) => t.id === id);
    if (!existing) return;
    setTrucks((prev) => prev.filter((t) => t.id !== id));
    setDispatches((prev) => prev.map((d) => (d.truckId === id ? { ...d, truckId: null } : d)));
    setExpenses((prev) => prev.map((e) => (e.truckId === id ? { ...e, truckId: null } : e)));
    removeRemote('trucks', [id]);
    logAuditEvent('Vehicle Removed', `${existing.number} removed from the fleet; past dispatches keep the plate number.`, 'danger');
  };

  // ---------------------------------------------------------------------------
  // Cash book
  // ---------------------------------------------------------------------------
  const addCashEntry = (data: Omit<CashEntry, 'id' | 'createdAt' | 'createdBy'>): CashEntry => {
    const entry: CashEntry = { ...data, amount: round2(data.amount), id: uid('cash'), createdAt: todayISO(), createdBy: currentUser?.name };
    setCashEntries((prev) => [entry, ...prev]);
    logAuditEvent('Cash Entry Recorded', `${data.direction === 'in' ? 'Cash in' : 'Cash out'} ${formatCurrency(entry.amount)} — ${data.description}`, 'info');
    return entry;
  };

  const deleteCashEntry = (id: string) => {
    const existing = cashEntries.find((e) => e.id === id);
    if (!existing) return;
    setCashEntries((prev) => prev.filter((e) => e.id !== id));
    removeRemote('cash_entries', [id]);
    logAuditEvent('Cash Entry Deleted', `${existing.direction === 'in' ? 'Cash in' : 'Cash out'} ${formatCurrency(existing.amount)} — ${existing.description}`, 'danger');
  };

  const updateSettings = (data: Partial<Omit<AppSettings, 'id'>>) => {
    setSettings((prev) => ({ ...prev, ...data, id: 'default' }));
    logAuditEvent('Settings Updated', Object.keys(data).join(', '), 'warning');
  };

  // ---------------------------------------------------------------------------
  // Booking lifecycle
  // ---------------------------------------------------------------------------
  const cancelBooking = (id: string, reason?: string) => {
    const booking = bookings.find((b) => b.id === id);
    if (!booking || booking.status === 'cancelled') return;
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: 'cancelled', cancelledAt: todayISO(), cancelReason: reason?.trim() || undefined } : b))
    );
    logAuditEvent('Booking Cancelled', `${booking.bookingNumber} cancelled${reason ? `: ${reason}` : ''}. ${booking.remainingKg.toLocaleString()} kg undispatched.`, 'warning');
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
      purchases,
      priceHistory,
      expenses,
      trucks,
      users,
      cashEntries,
      settings,
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
      if (Array.isArray(data.products)) setProducts(data.products.map(normalizeProduct));
      if (Array.isArray(data.bookings)) setBookings(data.bookings.map(normalizeBooking));
      if (Array.isArray(data.dispatches)) setDispatches(data.dispatches.map(normalizeDispatch));
      if (Array.isArray(data.purchases)) setPurchases(data.purchases);
      if (Array.isArray(data.priceHistory)) setPriceHistory(data.priceHistory);
      if (Array.isArray(data.expenses)) setExpenses(data.expenses);
      if (Array.isArray(data.trucks)) setTrucks(data.trucks);
      if (Array.isArray(data.users)) setUsers(data.users);
      if (Array.isArray(data.cashEntries)) setCashEntries(data.cashEntries);
      if (data.settings && typeof data.settings === 'object') setSettings({ ...data.settings, id: 'default' });
      if (Array.isArray(data.ledger)) setLedger(data.ledger.map(normalizeLedger));
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
    setPurchases([]);
    setPriceHistory([]);
    setExpenses([]);
    setTrucks([]);
    setCashEntries([]);
    setLedger([]);
    setWhatsappMessages([]);
    localStorage.removeItem(STORAGE_KEYS.CASH);
    localStorage.removeItem(STORAGE_KEYS.EXPENSES);
    localStorage.removeItem(STORAGE_KEYS.TRUCKS);
    localStorage.removeItem(STORAGE_KEYS.PURCHASES);
    localStorage.removeItem(STORAGE_KEYS.PRICE_HISTORY);
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
        purchases,
        priceHistory,
        selectedProductId,
        setSelectedProductId,
        selectedBookingId,
        highlightDispatchId,
        openBooking,
        openReports,
        requestedReportsTab,
        clearRequestedReportsTab,
        openOps,
        requestedOpsTab,
        editRequest,
        setEditRequest,
        printRequest,
        setPrintRequest,
        addPurchase,
        deletePurchase,
        updateProductPrice,
        addPricePoint,
        deletePricePoint,
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
        expenses,
        trucks,
        users,
        addExpense,
        updateExpense,
        deleteExpense,
        addTruck,
        updateTruck,
        deleteTruck,
        addUser,
        updateUser,
        deleteUser,
        currentUser,
        can,
        unlockAsUser,
        cancelBooking,
        cashEntries,
        addCashEntry,
        deleteCashEntry,
        settings,
        updateSettings,
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
