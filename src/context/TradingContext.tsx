import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Customer,
  Supplier,
  Product,
  Booking,
  BookingItem,
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
  DEFAULT_SETTINGS,
  dispatchBilledTotal,
  DispatchStatus,
  Quotation,
  QuotationStatus,
  PurchaseOrder,
  StockReturn,
  StockAdjustment,
  AdjustmentReason,
  Task,
  TaskLinkType,
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  SessionUser,
  RoleDefinition,
  RoleVisibilitySettings,
  SecurityPolicySettings,
  SensitiveFieldKey,
  AuditCategory,
  CustomerAgreedRate,
  Invoice,
  InvoiceItem,
  InvoicePaymentRecord,
  InvoicePaymentStatus,
  InvoiceStatus,
} from '../types';
import {
  DEFAULT_ROLES,
  DEFAULT_VISIBILITY_SETTINGS,
  DEFAULT_SECURITY_POLICY,
  INITIAL_DEMO_USERS,
  hasPermission,
  isScreenVisibleForRoles,
  isFieldVisibleForRoles,
  hashPassword,
  verifyPassword,
  hashPin,
  verifyPin,
  verifyTOTP,
  generateResetToken,
} from '../lib/auth';
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
  /** Bookings screen sub-view (orders / quotations / returns) and Suppliers sub-view (suppliers / purchase orders). */
  requestedBookingsView: 'orders' | 'quotations' | 'returns' | null;
  openBookingsView: (view: 'orders' | 'quotations' | 'returns') => void;
  requestedSuppliersView: 'suppliers' | 'orders' | null;
  openSuppliersView: (view: 'suppliers' | 'orders') => void;
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
    grossKg?: number | null;
    tareKg?: number | null;
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
  addUser: (data: { name: string; role: UserRole; pin: string; roles?: UserRole[]; email?: string; username?: string }) => { success: boolean; message: string };
  updateUser: (id: string, data: Partial<Omit<AppUser, 'id' | 'createdAt'>>) => { success: boolean; message: string };
  deleteUser: (id: string) => void;
  currentUser: SessionUser | null;
  can: (permission: Permission) => boolean;
  unlockAsUser: (userId: string, pin: string) => { success: boolean; error?: string; remainingMinutes?: number; attemptsLeft?: number; isLocked?: boolean };
  cancelBooking: (id: string, reason?: string) => void;
  cashEntries: CashEntry[];
  addCashEntry: (data: Omit<CashEntry, 'id' | 'createdAt' | 'createdBy'>) => CashEntry;
  deleteCashEntry: (id: string) => void;
  settings: AppSettings;
  updateSettings: (data: Partial<Omit<AppSettings, 'id'>>) => void;

  // Invoicing & Commercial Billing
  invoices: Invoice[];
  addInvoice: (data: Omit<Invoice, 'id' | 'createdAt' | 'invoiceNumber'>) => Invoice;
  updateInvoice: (id: string, data: Partial<Invoice>) => { success: boolean; message: string };
  deleteInvoice: (id: string) => { success: boolean; message: string };
  recordInvoicePayment: (
    invoiceId: string,
    payment: {
      amount: number;
      date: string;
      method: 'bank_transfer' | 'cash' | 'cheque' | 'online';
      referenceNumber?: string;
      notes?: string;
    }
  ) => { success: boolean; message: string };
  /** Simple billing: one call creates the bill, books the sale, takes stock and records any cash paid now. */
  createBill: (input: CreateBillInput) => { success: boolean; message: string; invoice?: Invoice };
  payBill: (invoiceId: string, amount: number, method: string, notes?: string, date?: string) => { success: boolean; message: string };
  deleteBill: (invoiceId: string) => { success: boolean; message: string };
  addCashTransfer: (input: { amount: number; from: 'cash' | 'bank'; date?: string; note?: string }) => { success: boolean; message: string };
  generateInvoiceFromBookings: (
    bookingIds: string[],
    customOptions?: {
      discount?: number;
      freightCharges?: number;
      handlingCharges?: number;
      taxRatePct?: number;
      notes?: string;
      terms?: string;
      dueDate?: string;
    }
  ) => Invoice;

  // Customer Agreed Rates
  customerAgreedRates: CustomerAgreedRate[];
  setCustomerAgreedRate: (customerId: string, productId: string, agreedRatePerKg: number, notes?: string) => CustomerAgreedRate;
  deleteCustomerAgreedRate: (id: string) => void;
  getCustomerAgreedRate: (customerId: string, productId: string) => number | null;
  
  createBooking: (bookingData: {
    customerId: string;
    items?: Array<{
      productId: string;
      totalKg: number;
      pricePerKg: number;
      costPricePerKg?: number;
      rateOverrideReason?: string;
      notes?: string;
    }>;
    productId?: string;
    totalKg?: number;
    pricePerKg?: number;
    targetDeliveryDate?: string;
    notes?: string;
    brokerName?: string;
    brokerCommissionPerKg?: number;
    quotationId?: string | null;
    rateOverrideReason?: string;
  }) => Booking;
  
  logDispatch: (dispatchData: {
    bookingId: string;
    bookingItemId?: string;
    productId?: string;
    kg: number;
    truckNumber: string;
    truckId?: string | null;
    driverPhone?: string;
    notes?: string;
    paymentReceivedImmediately?: boolean;
    sendWhatsApp?: boolean;
    grossKg?: number | null;
    tareKg?: number | null;
    freightCharge?: number;
  }) => { dispatch: Dispatch; message?: WhatsAppMessage };
  markDelivered: (dispatchId: string, data?: { receivedBy?: string; podNote?: string; deliveredAt?: string }) => void;
  reopenDispatch: (dispatchId: string) => void;
  
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

  // Admin PIN, Authentication & Security
  isAdminUnlocked: boolean;
  unlockAdmin: (pin: string) => boolean;
  lockAdmin: () => void;
  adminPin: string;
  changeAdminPin: (oldPin: string, newPin: string) => { success: boolean; message: string };
  resetAdminPinToDefault: () => void;
  auditLogs: AuditLogEntry[];
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: AuditCategory, ip?: string) => void;
  clearAuditLogs: () => void;
  exportSystemBackup: () => string;
  importSystemBackup: (jsonContent: string) => { success: boolean; message: string };
  factoryResetAllData: () => void;

  // RBAC Roles & Hierarchy Management
  roles: RoleDefinition[];
  createRole: (role: Omit<RoleDefinition, 'isSystem'>) => { success: boolean; message: string };
  updateRole: (id: string, role: Partial<RoleDefinition>) => { success: boolean; message: string };
  deleteRole: (id: string) => { success: boolean; message: string };
  updatePermissionsMatrix: (matrix: Record<string, Permission[]>) => { success: boolean; message: string };

  // Granular Permissions & Visibility Controls
  visibilitySettings: Record<string, RoleVisibilitySettings>;
  updateVisibilitySettings: (settings: Record<string, RoleVisibilitySettings>) => void;
  isScreenVisible: (screen: ActiveScreen) => boolean;
  isFieldVisible: (field: SensitiveFieldKey) => boolean;

  // Security Policies & Credentials Authentication
  securityPolicy: SecurityPolicySettings;
  updateSecurityPolicy: (policy: Partial<SecurityPolicySettings>) => void;
  loginWithCredentials: (identifier: string, password: string, otpCode?: string) => Promise<{ success: boolean; require2FA?: boolean; tempToken?: string; error?: string; remainingMinutes?: number; attemptsLeft?: number }>;
  verify2FACode: (tempToken: string, otpCode: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (emailOrUsername: string) => Promise<{ success: boolean; message: string; previewToken?: string; previewUrl?: string }>;
  resetPasswordWithToken: (token: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  unlockUserAccount: (id: string) => void;
  forceLogoutUser: (id: string) => void;
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

// ---------------------------------------------------------------------------
// Optional backend (server.ts). The production build is static and local-first, so the Express
// routes are only called from the Vite dev server, which mounts them. In production every call is
// skipped and the app works entirely from its own state and Supabase sync.
// ---------------------------------------------------------------------------
export const API_ENABLED = Boolean((import.meta as any).env?.DEV);
const apiFetch = (path: string, init?: RequestInit): Promise<Response> =>
  API_ENABLED ? fetch(path, init) : Promise.reject(new Error('Backend API not available in production'));


export type EditRequest = { type: 'customer' | 'supplier' | 'product' | 'booking'; id: string };
/** Mirrors PrintRequest in components/PrintDocument.tsx without importing a component into the context. */
export type PrintRequestLike =
  | { type: 'voucher'; ledgerId: string }
  | { type: 'quotation'; quotationId: string }
  | { type: 'po'; purchaseOrderId: string }
  | { type: 'note'; returnId: string }
  | { type: 'invoice'; dispatchId: string }
  | { type: 'challan'; dispatchId: string }
  | { type: 'booking'; bookingId: string }
  | { type: 'statement'; customerId: string; from: string; to: string }
  | { type: 'supplier_statement'; supplierId: string; from: string; to: string }
  | { type: 'bill'; invoiceId: string }
  | { type: 'daily_sheet'; date: string };

/** Collision-safe id generator (Date.now() alone repeats when called in a tight loop). */
let idCounter = 0;
export const uid = (prefix: string): string => {
  idCounter = (idCounter + 1) % 100000;
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

const round2 = (n: number) => Number(n.toFixed(2));

export interface CreateBillItemInput {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  unit?: string;
}
export interface CreateBillInput {
  customerId: string;
  /** Create this customer on the spot (used when customerId is empty). */
  newCustomer?: { name: string; phone: string };
  items: CreateBillItemInput[];
  discount?: number;
  paidNow?: number;
  paymentMethod?: string;
  notes?: string;
  date?: string;
}

/** Payment methods offered on bills. Anything starting with "Cash" counts as cash in hand. */
export const BILL_PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'Easypaisa / JazzCash', 'Card'];

/** Map a free-text method onto the invoice payment record enum. */
const invoiceMethod = (m: string): InvoicePaymentRecord['method'] => {
  const l = m.toLowerCase();
  if (l.startsWith('cash')) return 'cash';
  if (l.includes('cheque')) return 'cheque';
  if (l.includes('easypaisa') || l.includes('jazz') || l.includes('card') || l.includes('online')) return 'online';
  return 'bank_transfer';
};

/** Next sequential bill number: highest trailing number across all invoices + 1. */
export const nextBillNumber = (invoices: Invoice[]): string => {
  const max = invoices.reduce((m, i) => {
    const n = parseInt((i.invoiceNumber.match(/(\d+)\s*$/) || [])[1] || '0', 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `INV-${max + 1}`;
};

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

const initialInvoices: Invoice[] = [
  {
    id: 'inv-101',
    invoiceNumber: 'INV-2026-001',
    customerId: 'cust-1',
    customerName: 'Haji Tariq Mehmood',
    customerCompany: 'Indus Sugar & Textile Mills Ltd.',
    customerPhone: '+92 300 8472910',
    customerAddress: 'Plot 42, Industrial Area, Kot Lakhpat, Lahore',
    customerNtn: 'NTN-3829102-4',
    issueDate: '2026-09-01',
    dueDate: '2026-09-15',
    status: 'issued',
    paymentStatus: 'partial',
    items: [
      {
        id: 'item-1',
        bookingId: 'book-1',
        productId: 'prod-1',
        productName: 'Raw Cotton Bales (Pak Grade-1)',
        description: 'First delivery lot under contract BK-2026-101',
        kg: 10000,
        ratePerKg: 385,
        costPricePerKg: 310,
        amount: 3850000,
      },
    ],
    subtotal: 3850000,
    freightCharges: 45000,
    handlingCharges: 15000,
    taxRatePct: 0,
    taxAmount: 0,
    discount: 20000,
    totalAmount: 3890000,
    paidAmount: 2000000,
    balanceDue: 1890000,
    payments: [
      {
        id: 'pmt-1',
        date: '2026-09-02',
        amount: 2000000,
        method: 'bank_transfer',
        referenceNumber: 'HBL-FT-99214',
        notes: 'Initial advance payment received',
        recordedBy: 'Rashid Minhas',
      },
    ],
    notes: 'Goods inspected and dispatched via National Highway N-5.',
    terms: 'Payment due within 14 days of invoice date. 1.5% monthly surcharge applies thereafter.',
    linkedBookingIds: ['book-1'],
    createdAt: '2026-09-01T11:00:00.000Z',
    createdBy: 'Rashid Minhas',
  },
  {
    id: 'inv-102',
    invoiceNumber: 'INV-2026-002',
    customerId: 'cust-2',
    customerName: 'Malik Zeeshan',
    customerCompany: 'Chenab Feed & Grain Mills',
    customerPhone: '+92 321 9841203',
    customerAddress: 'Jhang Road, Industrial Estate, Multan',
    customerNtn: 'NTN-7419203-1',
    issueDate: '2026-09-03',
    dueDate: '2026-09-17',
    status: 'paid',
    paymentStatus: 'paid',
    items: [
      {
        id: 'item-2',
        bookingId: 'book-2',
        productId: 'prod-2',
        productName: 'Feed Grade Molasses (Bulk Tankers)',
        description: 'Tanker load dispatches under booking BK-2026-102',
        kg: 25000,
        ratePerKg: 78,
        costPricePerKg: 62,
        amount: 1950000,
      },
    ],
    subtotal: 1950000,
    freightCharges: 30000,
    handlingCharges: 5000,
    taxRatePct: 0,
    taxAmount: 0,
    discount: 0,
    totalAmount: 1985000,
    paidAmount: 1985000,
    balanceDue: 0,
    payments: [
      {
        id: 'pmt-2',
        date: '2026-09-04',
        amount: 1985000,
        method: 'bank_transfer',
        referenceNumber: 'MCB-OL-88412',
        notes: 'Full clearance received',
        recordedBy: 'Bilal Khan Mohmand',
      },
    ],
    notes: 'Thank you for your business.',
    terms: 'Standard commercial credit terms.',
    linkedBookingIds: ['book-2'],
    createdAt: '2026-09-03T14:30:00.000Z',
    createdBy: 'Bilal Khan Mohmand',
  },
];

const initialCustomerAgreedRates: CustomerAgreedRate[] = [
  {
    id: 'agr-1',
    customerId: 'cust-1',
    productId: 'prod-1',
    agreedRatePerKg: 385,
    effectiveDate: '2026-08-15',
    notes: 'Long-term bulk supply contract agreed rate',
    createdAt: '2026-08-15T10:00:00.000Z',
  },
  {
    id: 'agr-2',
    customerId: 'cust-2',
    productId: 'prod-2',
    agreedRatePerKg: 78,
    effectiveDate: '2026-08-20',
    notes: 'Seasonal volume commitment rate',
    createdAt: '2026-08-20T12:00:00.000Z',
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
  QUOTES: 'tradeflow_quotations_v2',
  POS: 'tradeflow_purchase_orders_v2',
  RETURNS: 'tradeflow_returns_v2',
  ADJUSTMENTS: 'tradeflow_adjustments_v2',
  TASKS: 'tradeflow_tasks_v2',
  LEDGER: 'tradeflow_ledger_v2',
  MESSAGES: 'tradeflow_whatsapp_v2',
  ADMIN_PIN: 'sarmaya_admin_pin_v1',
  AUDIT_LOGS: 'sarmaya_audit_logs_v1',
  ROLES: 'tradeflow_roles_v2',
  VISIBILITY: 'tradeflow_visibility_v2',
  SECURITY_POLICY: 'tradeflow_security_policy_v1',
  AUTH_TOKEN: 'sarmaya_jwt_token_v1',
  SESSION_USER: 'sarmaya_current_user_v1',
  INVOICES: 'tradeflow_invoices_v1',
  AGREED_RATES: 'tradeflow_agreed_rates_v1',
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

const readCachedSettings = (): Partial<AppSettings> =>
  safeParse<Partial<AppSettings>>(localStorage.getItem(STORAGE_KEYS.SETTINGS), {});

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminPin, setAdminPin] = useState<string>(() => {
    const localPin = localStorage.getItem(STORAGE_KEYS.ADMIN_PIN)?.trim();
    if (localPin) return localPin;
    const settingsPin = readCachedSettings().masterPin?.trim();
    return settingsPin || DEFAULT_ADMIN_PIN;
  });
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
  const [users, setUsers] = useState<AppUser[]>(() => {
    const loaded = loadLocal<AppUser>(STORAGE_KEYS.USERS, []);
    return loaded.length > 0 ? loaded : INITIAL_DEMO_USERS;
  });
  const [roles, setRoles] = useState<RoleDefinition[]>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.ROLES), DEFAULT_ROLES)
  );
  const [visibilitySettings, setVisibilitySettings] = useState<Record<string, RoleVisibilitySettings>>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.VISIBILITY), DEFAULT_VISIBILITY_SETTINGS)
  );
  const [securityPolicy, setSecurityPolicy] = useState<SecurityPolicySettings>(() =>
    safeParse(localStorage.getItem(STORAGE_KEYS.SECURITY_POLICY), DEFAULT_SECURITY_POLICY)
  );
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() => loadLocal(STORAGE_KEYS.CASH, []));
  const [quotations, setQuotations] = useState<Quotation[]>(() => loadLocal(STORAGE_KEYS.QUOTES, []));
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => loadLocal(STORAGE_KEYS.POS, []));
  const [returns, setReturns] = useState<StockReturn[]>(() => loadLocal(STORAGE_KEYS.RETURNS, []));
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>(() => loadLocal(STORAGE_KEYS.ADJUSTMENTS, []));
  const [tasks, setTasks] = useState<Task[]>(() => loadLocal(STORAGE_KEYS.TASKS, []));
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readCachedSettings(),
    id: 'default',
  }));
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SESSION_USER);
    return safeParse<SessionUser | null>(saved, null);
  });
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => loadLocal(STORAGE_KEYS.LEDGER, initialLedgerEntries, normalizeLedger));
  const [whatsappMessages, setWhatsappMessages] = useState<WhatsAppMessage[]>(() =>
    loadLocal(STORAGE_KEYS.MESSAGES, initialWhatsAppMessages)
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    loadLocal(STORAGE_KEYS.INVOICES, initialInvoices)
  );
  const [customerAgreedRates, setCustomerAgreedRates] = useState<CustomerAgreedRate[]>(() =>
    loadLocal(STORAGE_KEYS.AGREED_RATES, initialCustomerAgreedRates)
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
  const [requestedBookingsView, setRequestedBookingsView] = useState<'orders' | 'quotations' | 'returns' | null>(null);
  const openBookingsView = (view: 'orders' | 'quotations' | 'returns') => {
    setRequestedBookingsView(view);
    setActiveScreen('bookings');
  };
  const [requestedSuppliersView, setRequestedSuppliersView] = useState<'suppliers' | 'orders' | null>(null);
  const openSuppliersView = (view: 'suppliers' | 'orders') => {
    setRequestedSuppliersView(view);
    setActiveScreen('suppliers');
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
        setQuotations(data.quotations);
        setPurchaseOrders(data.purchaseOrders);
        setReturns(data.returns);
        setAdjustments(data.adjustments);
        setTasks(data.tasks);
        if (data.settings) {
          const mergedSettings = { ...DEFAULT_SETTINGS, ...data.settings, id: 'default' as const };
          setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...data.settings, id: 'default' }));
          if (mergedSettings.masterPin?.trim()) {
            setAdminPin(mergedSettings.masterPin.trim());
          }
        }
        setLedger(data.ledger);
        setWhatsappMessages(data.whatsappMessages);
        // Bills: keep local copies if the cloud table is empty (e.g. migration v8 not run yet).
        if (data.invoices.length > 0) setInvoices(data.invoices);
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
    localStorage.setItem(STORAGE_KEYS.ADMIN_PIN, adminPin);
  }, [adminPin]);
  useEffect(() => {
    if (!isCloudSyncReady) return;
    const settingsPin = settings.masterPin?.trim();
    const currentPin = adminPin.trim();
    // Prefer the shared cloud PIN when available; otherwise seed cloud once from a custom local PIN.
    if (settingsPin && settingsPin !== currentPin) {
      setAdminPin(settingsPin);
      return;
    }
    if (!settingsPin && currentPin && currentPin !== DEFAULT_ADMIN_PIN) {
      setSettings((prev) => ({ ...prev, id: 'default', masterPin: currentPin }));
    }
  }, [isCloudSyncReady, settings.masterPin, adminPin]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(quotations)); }, [quotations]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.POS, JSON.stringify(purchaseOrders)); }, [purchaseOrders]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.RETURNS, JSON.stringify(returns)); }, [returns]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.ADJUSTMENTS, JSON.stringify(adjustments)); }, [adjustments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks)); }, [tasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(ledger));
  }, [ledger]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(whatsappMessages));
  }, [whatsappMessages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AGREED_RATES, JSON.stringify(customerAgreedRates));
  }, [customerAgreedRates]);

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
  useEffect(() => { void syncToSupabase('invoices', invoices); }, [invoices, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('users', users); }, [users, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('cash_entries', cashEntries); }, [cashEntries, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('settings', [settings]); }, [settings, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('quotations', quotations); }, [quotations, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('purchase_orders', purchaseOrders); }, [purchaseOrders, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('returns', returns); }, [returns, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('stock_adjustments', adjustments); }, [adjustments, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('tasks', tasks); }, [tasks, isCloudSyncReady]);
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
    grossKg = null,
    tareKg = null,
    purchaseOrderId = null,
  }: {
    supplierId: string;
    productId: string;
    kg: number;
    pricePerKg: number;
    date?: string;
    truckNumber?: string;
    notes?: string;
    paymentMadeImmediately?: boolean;
    grossKg?: number | null;
    tareKg?: number | null;
    purchaseOrderId?: string | null;
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
      grossKg,
      tareKg,
      purchaseOrderId,
    };

    if (purchaseOrderId) {
      setPurchaseOrders((prev) =>
        prev.map((po) => {
          if (po.id !== purchaseOrderId) return po;
          const receivedKg = round2(po.receivedKg + kg);
          return { ...po, receivedKg, status: receivedKg >= po.kg ? 'received' : 'partial' };
        })
      );
    }

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
        if (data.items && Array.isArray(data.items)) {
          next.items = data.items;
          next.totalKg = round2(data.items.reduce((acc, it) => acc + it.totalKg, 0));
          next.dispatchedKg = round2(data.items.reduce((acc, it) => acc + (it.dispatchedKg || 0), 0));
          next.remainingKg = Math.max(0, round2(next.totalKg - next.dispatchedKg));
          next.totalAmount = round2(data.items.reduce((acc, it) => acc + (it.totalAmount || it.totalKg * it.pricePerKg), 0));
          next.pricePerKg = next.totalKg > 0 ? round2(next.totalAmount / next.totalKg) : (data.items[0]?.pricePerKg || next.pricePerKg);
          next.productId = data.items[0]?.productId || next.productId;
          if (next.status !== 'cancelled') next.status = next.remainingKg === 0 ? 'completed' : 'active';
          next.paymentStatus = next.paidAmount <= 0 ? 'unpaid' : next.paidAmount >= next.totalAmount ? 'paid' : 'partial';
        } else if (data.totalKg != null || data.pricePerKg != null) {
          next.totalKg = Math.max(round2(next.totalKg), next.dispatchedKg);
          next.remainingKg = Math.max(0, round2(next.totalKg - next.dispatchedKg));
          next.totalAmount = round2(next.totalKg * next.pricePerKg);
          if (next.items && next.items.length === 1) {
            next.items = [{
              ...next.items[0],
              totalKg: next.totalKg,
              remainingKg: next.remainingKg,
              pricePerKg: next.pricePerKg,
              totalAmount: next.totalAmount,
            }];
          }
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

    // Unpaid dispatch invoice totals come off the customer's outstanding balance
    const dueDelta = new Map<string, number>();
    targets
      .filter((d) => !d.paymentReceivedImmediately)
      .forEach((d) => dueDelta.set(d.customerId, (dueDelta.get(d.customerId) || 0) + dispatchBilledTotal(d)));
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

          const updatedItems = b.items?.map((it) => {
            const itemDispatches = ds.filter((d) => d.bookingItemId ? d.bookingItemId === it.id : d.productId === it.productId);
            const itemKg = itemDispatches.reduce((a, d) => a + d.kg, 0);
            const itemDispatched = Math.max(0, round2(it.dispatchedKg - itemKg));
            const itemRemaining = Math.max(0, round2(it.totalKg - itemDispatched));
            return {
              ...it,
              dispatchedKg: itemDispatched,
              remainingKg: itemRemaining,
            };
          });

          return {
            ...b,
            items: updatedItems || b.items,
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

  const markDelivered = (dispatchId: string, data: { receivedBy?: string; podNote?: string; deliveredAt?: string } = {}) => {
    const d = dispatches.find((x) => x.id === dispatchId);
    if (!d) return;
    const deliveredAt = data.deliveredAt || todayISO();
    setDispatches((prev) => prev.map((x) => (x.id === dispatchId ? { ...x, status: 'delivered' as DispatchStatus, deliveredAt, receivedBy: data.receivedBy?.trim() || undefined, podNote: data.podNote?.trim() || undefined } : x)));
    if (d.truckId) {
      const stillOut = dispatches.some((x) => x.id !== dispatchId && x.truckId === d.truckId && (x.status ?? 'in_transit') === 'in_transit');
      if (!stillOut) setTrucks((prev) => prev.map((t) => (t.id === d.truckId && t.status === 'on_trip' ? { ...t, status: 'available' } : t)));
    }
    logAuditEvent('Dispatch Delivered', `${d.dispatchNumber} delivered on ${deliveredAt}${data.receivedBy ? `, received by ${data.receivedBy}` : ''}.`, 'info');
  };

  const reopenDispatch = (dispatchId: string) => {
    const d = dispatches.find((x) => x.id === dispatchId);
    if (!d) return;
    setDispatches((prev) => prev.map((x) => (x.id === dispatchId ? { ...x, status: 'in_transit' as DispatchStatus, deliveredAt: null, receivedBy: undefined, podNote: undefined } : x)));
    logAuditEvent('Dispatch Reopened', `${d.dispatchNumber} marked back in transit.`, 'warning');
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
    const custQuoteIds = quotations.filter((q) => q.customerId === id).map((q) => q.id);
    setQuotations((prev) => prev.filter((q) => q.customerId !== id));
    removeRemote('quotations', custQuoteIds);
    setTasks((prev) => prev.filter((t) => !(t.linkType === 'customer' && t.linkId === id)));
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
    const supPoIds = purchaseOrders.filter((p) => p.supplierId === id).map((p) => p.id);
    setPurchaseOrders((prev) => prev.filter((p) => p.supplierId !== id));
    removeRemote('purchase_orders', supPoIds);
    setTasks((prev) => prev.filter((t) => !(t.linkType === 'supplier' && t.linkId === id)));
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
    const quoteIds = quotations.filter((q) => q.productId === id).map((q) => q.id);
    const poIds = purchaseOrders.filter((p) => p.productId === id).map((p) => p.id);
    const retIds = returns.filter((r) => r.productId === id).map((r) => r.id);
    const adjIds = adjustments.filter((a) => a.productId === id).map((a) => a.id);
    setQuotations((prev) => prev.filter((q) => q.productId !== id));
    setPurchaseOrders((prev) => prev.filter((p) => p.productId !== id));
    setReturns((prev) => prev.filter((r) => r.productId !== id));
    setAdjustments((prev) => prev.filter((a) => a.productId !== id));
    removeRemote('quotations', quoteIds);
    removeRemote('purchase_orders', poIds);
    removeRemote('returns', retIds);
    removeRemote('stock_adjustments', adjIds);
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
      quotations: () => setQuotations([]),
      purchase_orders: () => setPurchaseOrders([]),
      returns: () => setReturns([]),
      stock_adjustments: () => setAdjustments([]),
      tasks: () => setTasks([]),
      settings: () => setSettings({ ...DEFAULT_SETTINGS, cashOpeningDate: todayISO() }),
      ledger: () => setLedger([]),
      whatsapp_messages: () => setWhatsappMessages([]),
      invoices: () => setInvoices([]),
    };
    setters[table]();
    if (isCloudSyncReady) void clearTable(table);
    logAuditEvent('Table Purged', `Administrator emptied the "${table}" table.`, 'danger');
  };

  const createBooking = ({
    customerId,
    items,
    productId,
    totalKg,
    pricePerKg,
    targetDeliveryDate,
    notes,
    brokerName,
    brokerCommissionPerKg,
    quotationId = null,
    rateOverrideReason,
  }: {
    customerId: string;
    items?: Array<{
      productId: string;
      totalKg: number;
      pricePerKg: number;
      costPricePerKg?: number;
      rateOverrideReason?: string;
      notes?: string;
    }>;
    productId?: string;
    totalKg?: number;
    pricePerKg?: number;
    targetDeliveryDate?: string;
    notes?: string;
    brokerName?: string;
    brokerCommissionPerKg?: number;
    quotationId?: string | null;
    rateOverrideReason?: string;
  }): Booking => {
    const bookingNum = `BK-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    let builtItems: BookingItem[] = [];

    if (items && items.length > 0) {
      builtItems = items.map((it, idx) => {
        const prod = products.find((p) => p.id === it.productId);
        const defaultRate = prod?.pricePerKg || it.pricePerKg;
        const costRate = it.costPricePerKg ?? prod?.costPricePerKg;
        const itMarginPerKg = costRate != null ? round2(it.pricePerKg - costRate) : undefined;
        const itTotalMargin = itMarginPerKg != null ? round2(itMarginPerKg * it.totalKg) : undefined;
        const itCustom = Math.abs(defaultRate - it.pricePerKg) > 0.001;
        return {
          id: uid('bki'),
          productId: it.productId,
          productName: prod?.name,
          totalKg: round2(it.totalKg),
          dispatchedKg: 0,
          remainingKg: round2(it.totalKg),
          pricePerKg: round2(it.pricePerKg),
          totalAmount: round2(it.totalKg * it.pricePerKg),
          defaultProductPricePerKg: defaultRate,
          costPricePerKg: costRate,
          marginPerKg: itMarginPerKg,
          totalMargin: itTotalMargin,
          isCustomRate: itCustom,
          rateOverrideReason: itCustom ? (it.rateOverrideReason || 'Item selling rate configured') : undefined,
          notes: it.notes,
        };
      });
    } else {
      const fallbackProductId = productId || '';
      const fallbackKg = round2(totalKg || 0);
      const fallbackPrice = round2(pricePerKg || 0);
      const product = products.find((p) => p.id === fallbackProductId);
      const defaultProductPricePerKg = product?.pricePerKg || fallbackPrice;
      const costPricePerKg = product?.costPricePerKg;
      const marginPerKg = costPricePerKg != null ? round2(fallbackPrice - costPricePerKg) : undefined;
      const totalMargin = marginPerKg != null ? round2(marginPerKg * fallbackKg) : undefined;
      const isCustomRate = Math.abs(defaultProductPricePerKg - fallbackPrice) > 0.001;

      builtItems = [
        {
          id: uid('bki'),
          productId: fallbackProductId,
          productName: product?.name,
          totalKg: fallbackKg,
          dispatchedKg: 0,
          remainingKg: fallbackKg,
          pricePerKg: fallbackPrice,
          totalAmount: round2(fallbackKg * fallbackPrice),
          defaultProductPricePerKg,
          costPricePerKg,
          marginPerKg,
          totalMargin,
          isCustomRate,
          rateOverrideReason: isCustomRate ? (rateOverrideReason || 'Selling rate manually configured on booking') : undefined,
        },
      ];
    }

    const computedTotalKg = round2(builtItems.reduce((acc, it) => acc + it.totalKg, 0));
    const computedTotalAmount = round2(builtItems.reduce((acc, it) => acc + it.totalAmount, 0));
    const primaryProductId = builtItems[0]?.productId || '';
    const primaryProduct = products.find((p) => p.id === primaryProductId);
    const avgPricePerKg = computedTotalKg > 0 ? round2(computedTotalAmount / computedTotalKg) : (builtItems[0]?.pricePerKg || 0);
    const overallTotalMargin = builtItems.reduce((acc, it) => acc + (it.totalMargin || 0), 0);
    const overallMarginPerKg = computedTotalKg > 0 ? round2(overallTotalMargin / computedTotalKg) : undefined;
    const hasAnyCustomRate = builtItems.some((it) => it.isCustomRate);

    const newBooking: Booking = {
      id: uid('book'),
      bookingNumber: bookingNum,
      customerId,
      items: builtItems,
      productId: primaryProductId,
      totalKg: computedTotalKg,
      dispatchedKg: 0,
      remainingKg: computedTotalKg,
      pricePerKg: avgPricePerKg,
      defaultProductPricePerKg: builtItems[0]?.defaultProductPricePerKg,
      costPricePerKg: builtItems[0]?.costPricePerKg,
      marginPerKg: overallMarginPerKg,
      totalMargin: overallTotalMargin,
      isCustomRate: hasAnyCustomRate,
      rateOverrideReason: hasAnyCustomRate ? (rateOverrideReason || 'Rate configured on booking commodities') : undefined,
      totalAmount: computedTotalAmount,
      paidAmount: 0,
      status: 'active',
      paymentStatus: 'unpaid',
      createdAt: new Date().toISOString().split('T')[0],
      targetDeliveryDate,
      notes,
      brokerName: brokerName?.trim() || undefined,
      brokerCommissionPerKg: brokerCommissionPerKg && brokerCommissionPerKg > 0 ? round2(brokerCommissionPerKg) : undefined,
      quotationId,
    };

    setBookings((prev) => [newBooking, ...prev]);

    // Record price history for each item
    builtItems.forEach((it) => {
      recordPrice(it.productId, it.pricePerKg, newBooking.createdAt, 'booking', `Agreed in ${bookingNum}`, newBooking.id);
    });

    if (hasAnyCustomRate) {
      logAuditEvent(
        'Rate Override',
        `Booking ${bookingNum}: Contains customized rates across ${builtItems.length} commodity item(s). Total: ${formatCurrency(computedTotalAmount)}.`,
        'warning',
        'data'
      );
    }

    // Send instant WhatsApp booking confirmation
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      let itemsBreakdown = '';
      if (builtItems.length === 1 && primaryProduct) {
        itemsBreakdown = `for *${computedTotalKg.toLocaleString()} kg* of *${primaryProduct.name}* at *${formatCurrency(builtItems[0].pricePerKg)}/kg*`;
      } else {
        itemsBreakdown = `for *${builtItems.length} commodities* (${computedTotalKg.toLocaleString()} kg total):\n` +
          builtItems.map((it) => {
            const prod = products.find((p) => p.id === it.productId);
            return `• ${prod?.name || 'Item'}: ${it.totalKg.toLocaleString()} kg @ ${formatCurrency(it.pricePerKg)}/kg`;
          }).join('\n');
      }

      const msgText = `📑 *Sarmaya Booking Confirmed*\n\nHello ${customer.name},\nYour booking *${bookingNum}* ${itemsBreakdown}\n\n*Total Contract Value:* ${formatCurrency(computedTotalAmount)}\n\nDispatches will be notified automatically with truck & driver details upon release. Thank you for your business!`;

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
    bookingItemId,
    productId,
    kg,
    truckNumber,
    truckId = null,
    driverPhone,
    notes,
    paymentReceivedImmediately = false,
    sendWhatsApp = true,
    grossKg = null,
    tareKg = null,
    freightCharge = 0,
  }: {
    bookingId: string;
    bookingItemId?: string;
    productId?: string;
    kg: number;
    truckNumber: string;
    truckId?: string | null;
    driverPhone?: string;
    notes?: string;
    paymentReceivedImmediately?: boolean;
    sendWhatsApp?: boolean;
    grossKg?: number | null;
    tareKg?: number | null;
    freightCharge?: number;
  }) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) throw new Error('Booking not found');

    // Find the targeted item if multi-item booking
    let targetItem: BookingItem | undefined;
    if (booking.items && booking.items.length > 0) {
      if (bookingItemId) {
        targetItem = booking.items.find((it) => it.id === bookingItemId);
      } else if (productId) {
        targetItem = booking.items.find((it) => it.productId === productId && it.remainingKg > 0) ||
                     booking.items.find((it) => it.productId === productId);
      } else {
        targetItem = booking.items.find((it) => it.remainingKg > 0) || booking.items[0];
      }
    }

    const effectiveProductId = targetItem ? targetItem.productId : (productId || booking.productId);
    const effectivePricePerKg = targetItem ? targetItem.pricePerKg : booking.pricePerKg;

    const customer = customers.find((c) => c.id === booking.customerId);
    const product = products.find((p) => p.id === effectiveProductId);
    const today = new Date().toISOString().split('T')[0];
    const dispatchAmount = round2(kg * effectivePricePerKg);
    const taxRatePct = settings.taxRatePct || 0;
    const freight = round2(Math.max(0, freightCharge || 0));
    const taxAmount = round2(((dispatchAmount + freight) * taxRatePct) / 100);
    const totalBilled = round2(dispatchAmount + freight + taxAmount);

    // Update item quantities
    let updatedItems: BookingItem[] | undefined;
    if (booking.items && booking.items.length > 0) {
      updatedItems = booking.items.map((it) => {
        const isMatch = targetItem ? it.id === targetItem.id : it.productId === effectiveProductId;
        if (isMatch) {
          const itemDispatched = round2(it.dispatchedKg + kg);
          const itemRemaining = Math.max(0, round2(it.totalKg - itemDispatched));
          return {
            ...it,
            dispatchedKg: itemDispatched,
            remainingKg: itemRemaining,
          };
        }
        return it;
      });
    }

    const newDispatchedKg = updatedItems
      ? round2(updatedItems.reduce((acc, it) => acc + it.dispatchedKg, 0))
      : Number((booking.dispatchedKg + kg).toFixed(2));
    const newRemainingKg = updatedItems
      ? round2(updatedItems.reduce((acc, it) => acc + it.remainingKg, 0))
      : Math.max(0, Number((booking.totalKg - newDispatchedKg).toFixed(2)));
    const newStatus: BookingStatus = newRemainingKg === 0 ? 'completed' : 'active';

    const dispatchNum = `DSP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    let generatedMessage = '';
    if (customer && product) {
      generatedMessage = `🚚 *Sarmaya Dispatch Alert*\n\nHello ${customer.name},\nTruck *${truckNumber.toUpperCase()}* carrying *${kg.toLocaleString()} kg* of *${product.name}* is on its way to your destination.\n\n📊 *Booking Status (${booking.bookingNumber})*:\n• Dispatched Now: ${kg.toLocaleString()} kg of ${product.name}\n• Total Booking Balance: ${newRemainingKg.toLocaleString()} kg\n• Goods: ${formatCurrency(dispatchAmount)}${freight > 0 ? `\n• Freight: ${formatCurrency(freight)}` : ''}${taxAmount > 0 ? `\n• ${settings.taxLabel || 'Sales Tax'} (${taxRatePct}%): ${formatCurrency(taxAmount)}` : ''}\n• Invoice total: *${formatCurrency(totalBilled)}*\n\n💳 Kindly confirm once payment has been initiated for this shipment.\nThank you for trading with us!`;
    }

    const newDispatch: Dispatch = {
      id: uid('disp'),
      dispatchNumber: dispatchNum,
      bookingId,
      bookingItemId: targetItem?.id,
      customerId: booking.customerId,
      productId: effectiveProductId,
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
      grossKg,
      tareKg,
      freightCharge: freight,
      taxRatePct,
      taxAmount,
      totalBilled,
      status: 'in_transit',
      deliveredAt: null,
    };

    // 0. Vehicle goes on trip
    if (truckId) setTrucks((prev) => prev.map((t) => (t.id === truckId && t.status === 'available' ? { ...t, status: 'on_trip' } : t)));

    // 1. Update Booking
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              items: updatedItems || b.items,
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

    // 2. Update Product Stock for the dispatched commodity
    setProducts((prev) =>
      prev.map((p) =>
        p.id === effectiveProductId
          ? { ...p, stockKg: Math.max(0, Number((p.stockKg - kg).toFixed(2))) }
          : p
      )
    );

    // 3. Update Customer Total Due & Ledger (invoice total incl. freight and tax)
    const netDueChange = paymentReceivedImmediately ? 0 : totalBilled;
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
      description: `Dispatch ${dispatchNum}: ${kg} kg ${product?.name || 'goods'}${freight > 0 ? ` + freight ${formatCurrency(freight)}` : ''}${taxAmount > 0 ? ` + ${settings.taxLabel || 'tax'} ${formatCurrency(taxAmount)}` : ''}`,
      debit: totalBilled,
      credit: 0,
      balanceAfter: Number((currentCustomerDue + totalBilled).toFixed(2)),
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
        credit: totalBilled,
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
  }, [roles]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VISIBILITY, JSON.stringify(visibilitySettings));
  }, [visibilitySettings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SECURITY_POLICY, JSON.stringify(securityPolicy));
  }, [securityPolicy]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(STORAGE_KEYS.SESSION_USER, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION_USER);
    }
  }, [currentUser]);

  const logAuditEvent = (
    action: string,
    details: string,
    severity: 'info' | 'warning' | 'danger' = 'info',
    category: AuditCategory = 'system',
    ip?: string
  ) => {
    const newEntry: AuditLogEntry = {
      id: uid('audit'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action,
      details,
      severity,
      user: currentUser?.name || 'System',
      category,
      ip: ip || '127.0.0.1',
    };
    setAuditLogs((prev) => [newEntry, ...prev.slice(0, 199)]);
  };

  const clearAuditLogs = () => {
    setAuditLogs([]);
    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
  };

  const unlockAdmin = (pin: string): boolean => {
    if (pin.trim() === adminPin.trim()) {
      const adminSession: SessionUser = {
        id: 'master',
        name: 'Administrator',
        username: 'superadmin',
        email: 'admin@sarmaya.pk',
        role: 'super_admin',
        roles: ['super_admin', 'admin'],
      };
      setCurrentUser(adminSession);
      setIsAdminUnlocked(true);
      logAuditEvent('Session Unlocked', 'Master PIN verified (Administrator).', 'info', 'auth');
      return true;
    }
    logAuditEvent('Invalid PIN Attempt', 'Unsuccessful master PIN entry attempt.', 'warning', 'auth');
    return false;
  };

  const unlockAsUser = (
    userId: string,
    pin: string
  ): { success: boolean; error?: string; remainingMinutes?: number; attemptsLeft?: number; isLocked?: boolean } => {
    const user = users.find((u) => u.id === userId);
    if (!user) {
      logAuditEvent('Login Failed', 'Attempted PIN entry on non-existent user account.', 'warning', 'auth');
      return { success: false, error: 'User account not found.' };
    }

    if (!user.active || user.status === 'inactive' || user.status === 'suspended') {
      logAuditEvent('Login Blocked', `Suspended or inactive user ${user.name} attempted login.`, 'warning', 'auth');
      return { success: false, error: 'User account is inactive. Please contact Administrator.' };
    }

    // Check lockout
    if (user.status === 'locked' && user.lockedUntil) {
      const lockExpiry = new Date(user.lockedUntil).getTime();
      const now = Date.now();
      if (now < lockExpiry) {
        const remainingMinutes = Math.ceil((lockExpiry - now) / 60000);
        logAuditEvent('Locked Account Attempt', `User ${user.name} attempted PIN sign-in while locked out. ${remainingMinutes}m remaining.`, 'warning', 'auth');
        return {
          success: false,
          error: `Account is temporarily locked due to repeated failed attempts. Please try again in ${remainingMinutes} minute(s).`,
          isLocked: true,
          remainingMinutes,
        };
      } else {
        // Lockout expired
        user.lockedUntil = undefined;
        user.failedAttempts = 0;
        user.status = 'active';
      }
    }

    const cleanPin = pin.trim();
    const isMatch = verifyPin(cleanPin, user.pinHash || user.pin);

    if (!isMatch) {
      const newFailedAttempts = (user.failedAttempts || 0) + 1;
      const maxAttempts = securityPolicy.maxFailedAttempts || 5;
      const attemptsLeft = Math.max(0, maxAttempts - newFailedAttempts);
      const lockoutMinutes = securityPolicy.lockoutDurationMinutes || 15;
      const isNowLocked = newFailedAttempts >= maxAttempts;

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          if (isNowLocked) {
            return {
              ...u,
              failedAttempts: newFailedAttempts,
              status: 'locked',
              lockedUntil: new Date(Date.now() + lockoutMinutes * 60000).toISOString(),
            };
          }
          return { ...u, failedAttempts: newFailedAttempts };
        })
      );

      if (isNowLocked) {
        logAuditEvent(
          'Account Locked Out',
          `User ${user.name} exceeded ${maxAttempts} failed PIN attempts and is locked out for ${lockoutMinutes} minutes.`,
          'danger',
          'auth'
        );
        return {
          success: false,
          error: `Too many failed attempts. Account has been locked for ${lockoutMinutes} minutes.`,
          isLocked: true,
          remainingMinutes: lockoutMinutes,
        };
      }

      logAuditEvent(
        'Invalid PIN Attempt',
        `Unsuccessful PIN attempt for user ${user.name}. ${attemptsLeft} attempt(s) remaining.`,
        'warning',
        'auth'
      );
      return {
        success: false,
        error: `Incorrect PIN. ${attemptsLeft} attempt(s) remaining before account lockout.`,
        attemptsLeft,
      };
    }

    // Success! Update user hash if needed, clear lockouts
    const pinH = user.pinHash || hashPin(cleanPin);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              pinHash: pinH,
              failedAttempts: 0,
              lockedUntil: undefined,
              status: 'active',
              lastLogin: new Date().toISOString(),
            }
          : u
      )
    );

    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    const sessionUser: SessionUser = {
      id: user.id,
      name: user.name,
      username: user.username || user.name.toLowerCase().replace(/\s+/g, '_'),
      email: user.email,
      role: user.role,
      roles: userRoles,
    };

    const simulatedToken = `jwt_${user.id}_${Date.now()}`;
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, simulatedToken);
    setCurrentUser(sessionUser);
    setIsAdminUnlocked(true);
    logAuditEvent('User Login', `${user.name} signed in successfully via PIN (${user.role}).`, 'info', 'auth');

    // Notify backend if online
    apiFetch('/api/auth/pin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pin: cleanPin }),
    }).catch(() => {});

    return { success: true };
  };

  const can = (permission: Permission): boolean => {
    if (!currentUser) return false;
    return hasPermission(currentUser, permission, roles, securityPolicy.enableRoleHierarchy);
  };

  const isScreenVisible = (screen: ActiveScreen): boolean => {
    if (!currentUser) return true;
    const userRoles = currentUser.roles && currentUser.roles.length > 0 ? currentUser.roles : [currentUser.role];
    return isScreenVisibleForRoles(userRoles, screen, visibilitySettings);
  };

  const isFieldVisible = (field: SensitiveFieldKey): boolean => {
    if (!currentUser) return true;
    const userRoles = currentUser.roles && currentUser.roles.length > 0 ? currentUser.roles : [currentUser.role];
    return isFieldVisibleForRoles(userRoles, field, visibilitySettings);
  };

  const lockAdmin = () => {
    logAuditEvent('Session Locked', `${currentUser?.name || 'Session'} locked the terminal.`, 'info', 'auth');
    setIsAdminUnlocked(false);
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEYS.SESSION_USER);
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  };

  // ---------------------------------------------------------------------------
  // Credential-Based Authentication & 2FA
  // ---------------------------------------------------------------------------
  const loginWithCredentials = async (
    identifier: string,
    pass: string,
    otpCode?: string
  ): Promise<{ success: boolean; require2FA?: boolean; tempToken?: string; error?: string; remainingMinutes?: number; attemptsLeft?: number }> => {
    const trimmedId = identifier.trim();
    if (!trimmedId || !pass) {
      return { success: false, error: 'Username/Email and Password are required.' };
    }

    // Attempt backend API first
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: trimmedId, password: pass, otpCode }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.require2FA) {
          return { success: false, require2FA: true, tempToken: data.tempToken };
        }
        if (data.token && data.user) {
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, data.token);
          const sessionUser: SessionUser = {
            id: data.user.id,
            name: data.user.name,
            username: data.user.username,
            email: data.user.email,
            role: data.user.role,
            roles: data.user.roles || [data.user.role],
          };
          setCurrentUser(sessionUser);
          setIsAdminUnlocked(true);
          logAuditEvent('User Login', `${sessionUser.name} signed in via password.`, 'info', 'auth');
          return { success: true };
        }
      } else if (res.status === 401 || res.status === 403) {
        logAuditEvent('Login Failed', `Failed login attempt for ${trimmedId}: ${data.error}`, 'warning', 'auth');
        return {
          success: false,
          error: data.error,
          remainingMinutes: data.remainingMinutes,
          attemptsLeft: data.attemptsLeft,
        };
      }
    } catch {
      // Backend not running in this environment, seamlessly perform resilient client-side auth
    }

    // Client-side authentication fallback
    const userIndex = users.findIndex(
      (u) =>
        u.username?.toLowerCase() === trimmedId.toLowerCase() ||
        u.email?.toLowerCase() === trimmedId.toLowerCase() ||
        u.name?.toLowerCase() === trimmedId.toLowerCase()
    );

    if (userIndex === -1) {
      logAuditEvent('Login Failed', `Unknown user attempted login: ${trimmedId}`, 'warning', 'auth');
      return { success: false, error: 'Invalid username/email or password.' };
    }

    const user = users[userIndex];

    // Check account status and lockouts
    if (user.status === 'locked' && user.lockedUntil) {
      const lockExpiry = new Date(user.lockedUntil).getTime();
      const now = Date.now();
      if (now < lockExpiry) {
        const remainingMinutes = Math.ceil((lockExpiry - now) / 60000);
        logAuditEvent('Login Blocked', `Account locked for ${user.username || user.name}`, 'warning', 'auth');
        return {
          success: false,
          error: `Account is temporarily locked due to repeated failed attempts. Please try again in ${remainingMinutes} minute(s).`,
          remainingMinutes,
        };
      } else {
        // Unlock expired lockout
        user.status = 'active';
        user.failedAttempts = 0;
        user.lockedUntil = undefined;
      }
    }

    // Verify Password
    let passwordMatches = false;
    if (user.passwordHash) {
      passwordMatches = verifyPassword(pass, user.passwordHash);
    } else if (user.pin) {
      // Backward compatibility if only PIN was set
      passwordMatches = pass.trim() === user.pin.trim();
    }

    if (!passwordMatches) {
      const updatedAttempts = (user.failedAttempts || 0) + 1;
      const maxAllowed = securityPolicy.maxFailedAttempts || 5;
      const updatedUsers = [...users];

      if (updatedAttempts >= maxAllowed) {
        const lockDuration = securityPolicy.lockoutDurationMinutes || 15;
        const lockUntil = new Date(Date.now() + lockDuration * 60000).toISOString();
        updatedUsers[userIndex] = {
          ...user,
          failedAttempts: updatedAttempts,
          status: 'locked',
          lockedUntil: lockUntil,
        };
        setUsers(updatedUsers);
        logAuditEvent('Account Locked', `User ${user.username || user.name} locked out after ${updatedAttempts} failed attempts.`, 'danger', 'auth');
        return {
          success: false,
          error: `Too many failed attempts. Account has been locked for ${lockDuration} minutes.`,
          remainingMinutes: lockDuration,
        };
      } else {
        updatedUsers[userIndex] = { ...user, failedAttempts: updatedAttempts };
        setUsers(updatedUsers);
        const attemptsLeft = maxAllowed - updatedAttempts;
        logAuditEvent('Login Failed', `Incorrect password for ${user.username || user.name}. Attempts left: ${attemptsLeft}`, 'warning', 'auth');
        return {
          success: false,
          error: `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account lockout.`,
          attemptsLeft,
        };
      }
    }

    // 2FA check
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!otpCode) {
        const tempToken = `temp_2fa_${user.id}_${Date.now()}`;
        return { success: false, require2FA: true, tempToken };
      }
      const otpValid = verifyTOTP(user.twoFactorSecret, otpCode);
      if (!otpValid) {
        logAuditEvent('2FA Failed', `Invalid OTP submitted for ${user.username || user.name}`, 'warning', 'auth');
        return { success: false, error: 'Invalid 2FA Authenticator code.' };
      }
    }

    // Success: reset failed attempts
    const updatedUsers = [...users];
    updatedUsers[userIndex] = {
      ...user,
      failedAttempts: 0,
      lockedUntil: undefined,
      lastLogin: new Date().toISOString(),
    };
    setUsers(updatedUsers);

    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    const sessionUser: SessionUser = {
      id: user.id,
      name: user.name,
      username: user.username || user.name.toLowerCase().replace(/\s+/g, '_'),
      email: user.email,
      role: user.role,
      roles: userRoles,
    };

    const simulatedToken = `jwt_${user.id}_${Date.now()}`;
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, simulatedToken);
    setCurrentUser(sessionUser);
    setIsAdminUnlocked(true);
    logAuditEvent('User Login', `${sessionUser.name} signed in successfully.`, 'info', 'auth');
    return { success: true };
  };

  const verify2FACode = async (tempToken: string, otpCode: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiFetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, otpCode }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, data.token);
        const sessionUser: SessionUser = {
          id: data.user.id,
          name: data.user.name,
          username: data.user.username,
          email: data.user.email,
          role: data.user.role,
          roles: data.user.roles || [data.user.role],
        };
        setCurrentUser(sessionUser);
        setIsAdminUnlocked(true);
        logAuditEvent('2FA Verified', `${sessionUser.name} completed 2FA challenge.`, 'info', 'auth');
        return { success: true };
      }
      return { success: false, error: data.error || 'Invalid 2FA code.' };
    } catch {
      // Offline fallback
      const parts = tempToken.split('_');
      const userId = parts[2];
      const user = users.find((u) => u.id === userId);
      if (!user || !user.twoFactorSecret) {
        return { success: false, error: 'User or 2FA configuration not found.' };
      }
      if (verifyTOTP(user.twoFactorSecret, otpCode)) {
        const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
        const sessionUser: SessionUser = {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          roles: userRoles,
        };
        setCurrentUser(sessionUser);
        setIsAdminUnlocked(true);
        logAuditEvent('2FA Verified', `${sessionUser.name} completed 2FA challenge.`, 'info', 'auth');
        return { success: true };
      }
      return { success: false, error: 'Invalid 2FA Authenticator code.' };
    }
  };

  const requestPasswordReset = async (
    emailOrUsername: string
  ): Promise<{ success: boolean; message: string; previewToken?: string; previewUrl?: string }> => {
    const clean = emailOrUsername.trim().toLowerCase();
    if (!clean) return { success: false, message: 'Please enter your username or registered email.' };

    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        logAuditEvent('Password Reset Requested', `Reset requested for ${clean}`, 'info', 'auth');
        return {
          success: true,
          message: data.message,
          previewToken: data.previewToken,
          previewUrl: data.previewUrl,
        };
      }
    } catch {
      // Client-side fallback
    }

    const user = users.find(
      (u) => u.email?.toLowerCase() === clean || u.username?.toLowerCase() === clean
    );
    if (!user) {
      // Do not reveal non-existence for security
      return {
        success: true,
        message: 'If an account matches that email or username, password reset instructions have been generated.',
      };
    }

    const resetToken = generateResetToken();
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, resetPasswordToken: resetToken, resetPasswordExpires: tokenExpiry } : u))
    );

    logAuditEvent('Password Reset Requested', `Reset generated for ${user.username || user.name}`, 'info', 'auth');
    return {
      success: true,
      message: 'Password reset link and security verification token generated successfully.',
      previewToken: resetToken,
      previewUrl: `${window.location.origin}/#reset-token=${resetToken}`,
    };
  };

  const resetPasswordWithToken = async (
    token: string,
    newPass: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!token.trim()) return { success: false, message: 'Reset token is required.' };
    if (!newPass || newPass.length < 6) return { success: false, message: 'New password must be at least 6 characters.' };

    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: newPass }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        logAuditEvent('Password Changed', 'Password successfully reset via verification token.', 'warning', 'auth');
        return { success: true, message: data.message };
      }
    } catch {
      // Client-side fallback
    }

    const user = users.find(
      (u) => u.resetPasswordToken === token.trim() && u.resetPasswordExpires && new Date(u.resetPasswordExpires).getTime() > Date.now()
    );
    if (!user) {
      return { success: false, message: 'Invalid or expired password reset token.' };
    }

    const newHash = hashPassword(newPass);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? {
              ...u,
              passwordHash: newHash,
              resetPasswordToken: undefined,
              resetPasswordExpires: undefined,
              failedAttempts: 0,
              status: 'active',
            }
          : u
      )
    );

    logAuditEvent('Password Reset', `Password reset completed for ${user.username || user.name}`, 'warning', 'auth');
    return { success: true, message: 'Password has been successfully reset. You can now log in with your new password.' };
  };

  // ---------------------------------------------------------------------------
  // Role & Permissions Management
  // ---------------------------------------------------------------------------
  const createRole = (roleData: Omit<RoleDefinition, 'isSystem'>): { success: boolean; message: string } => {
    if (!can('roles:manage')) {
      return { success: false, message: 'You do not have permission to create roles.' };
    }

    const cleanName = roleData.name.trim();
    const cleanId = roleData.id.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanName || !cleanId) return { success: false, message: 'Role ID and Name are required.' };
    if (roles.some((r) => r.id === cleanId)) return { success: false, message: 'A role with this ID already exists.' };

    const newRole: RoleDefinition = {
      ...roleData,
      id: cleanId,
      name: cleanName,
      isSystem: false,
    };
    setRoles((prev) => [...prev, newRole]);
    setVisibilitySettings((prev) => ({
      ...prev,
      [cleanId]: prev[cleanId] || { hiddenScreens: [], hiddenFields: [] },
    }));
    logAuditEvent('Role Created', `Created custom role "${cleanName}" with ${newRole.permissions.length} permissions.`, 'warning', 'roles');

    // Notify backend if available
    apiFetch('/api/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRole),
    }).catch(() => {});

    return { success: true, message: `Role "${cleanName}" created successfully.` };
  };

  const updateRole = (id: string, roleData: Partial<RoleDefinition>): { success: boolean; message: string } => {
    if (!can('roles:manage')) {
      return { success: false, message: 'You do not have permission to update roles.' };
    }

    const existing = roles.find((r) => r.id === id);
    if (!existing) return { success: false, message: 'Role not found.' };

    if (id === 'super_admin' && roleData.permissions) {
      // Ensure super_admin always keeps core permissions
      if (!roleData.permissions.includes('system:admin_screen') || !roleData.permissions.includes('roles:manage')) {
        return { success: false, message: 'Super Admin must retain root administrative permissions.' };
      }
    }

    const updatedRole = { ...existing, ...roleData };
    setRoles((prev) => prev.map((r) => (r.id === id ? updatedRole : r)));
    logAuditEvent('Role Updated', `Updated role "${existing.name}" settings and permissions.`, 'warning', 'roles');

    apiFetch(`/api/roles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedRole),
    }).catch(() => {});

    return { success: true, message: `Role "${existing.name}" updated successfully.` };
  };

  const deleteRole = (id: string): { success: boolean; message: string } => {
    if (!can('roles:manage')) {
      return { success: false, message: 'You do not have permission to delete roles.' };
    }

    const existing = roles.find((r) => r.id === id);
    if (!existing) return { success: false, message: 'Role not found.' };
    if (existing.isSystem) return { success: false, message: 'System default roles cannot be deleted.' };

    // Check if any active user uses this role
    const usersWithRole = users.filter((u) => u.role === id || (u.roles && u.roles.includes(id)));
    if (usersWithRole.length > 0) {
      return { success: false, message: `Cannot delete role: ${usersWithRole.length} user(s) currently assigned to it.` };
    }

    setRoles((prev) => prev.filter((r) => r.id !== id));
    logAuditEvent('Role Deleted', `Removed custom role "${existing.name}".`, 'danger', 'roles');

    apiFetch(`/api/roles/${id}`, { method: 'DELETE' }).catch(() => {});

    return { success: true, message: `Role "${existing.name}" deleted.` };
  };

  const updatePermissionsMatrix = (matrix: Record<string, Permission[]>): { success: boolean; message: string } => {
    if (!can('roles:matrix_edit')) {
      return { success: false, message: 'You do not have permission to edit the permissions matrix.' };
    }

    setRoles((prev) =>
      prev.map((role) => {
        if (matrix[role.id]) {
          return { ...role, permissions: matrix[role.id] };
        }
        return role;
      })
    );
    logAuditEvent('Permissions Matrix Updated', 'Super-admin updated the global RBAC permissions matrix.', 'warning', 'roles');

    apiFetch('/api/roles/matrix', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(matrix),
    }).catch(() => {});

    return { success: true, message: 'Permissions matrix saved successfully.' };
  };

  const updateVisibilitySettings = (settingsMap: Record<string, RoleVisibilitySettings>) => {
    setVisibilitySettings(settingsMap);
    logAuditEvent('Visibility Rules Updated', 'Role-based screen and sensitive field visibility settings updated.', 'warning', 'visibility');

    apiFetch('/api/roles/visibility', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsMap),
    }).catch(() => {});
  };

  const updateSecurityPolicy = (policy: Partial<SecurityPolicySettings>) => {
    setSecurityPolicy((prev) => ({ ...prev, ...policy }));
    logAuditEvent('Security Policy Changed', 'Updated system password and lockout security parameters.', 'warning', 'system');

    apiFetch('/api/security/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...securityPolicy, ...policy }),
    }).catch(() => {});
  };

  // ---------------------------------------------------------------------------
  // Users Management
  // ---------------------------------------------------------------------------
  const validPin = (pin: string) => /^\d{4,6}$/.test(pin.trim());

  const addUser = (data: {
    name: string;
    role: UserRole;
    roles?: string[];
    pin?: string;
    email?: string;
    username?: string;
    password?: string;
    twoFactorEnabled?: boolean;
  }): { success: boolean; message: string } => {
    const cleanName = data.name.trim();
    if (!cleanName) return { success: false, message: 'User display name is required.' };

    const cleanPin = (data.pin || '1234').trim();
    if (!validPin(cleanPin)) {
      return { success: false, message: 'PIN must be 4 to 6 numeric digits.' };
    }

    const cleanUsername = (data.username || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')).trim();
    if (users.some((u) => u.username?.toLowerCase() === cleanUsername.toLowerCase())) {
      return { success: false, message: 'Username is already taken.' };
    }

    if (data.email && users.some((u) => u.email?.toLowerCase() === data.email!.trim().toLowerCase())) {
      return { success: false, message: 'An account with this email address already exists.' };
    }

    const assignedRoles = data.roles && data.roles.length > 0 ? data.roles : [data.role];
    const pinH = hashPin(cleanPin);

    const newUser: AppUser = {
      id: uid('user'),
      name: cleanName,
      username: cleanUsername,
      email: data.email?.trim() || `${cleanUsername}@sarmaya.pk`,
      role: data.role,
      roles: assignedRoles,
      pin: cleanPin,
      pinHash: pinH,
      passwordHash: hashPassword(data.password || 'Sarmaya@2026'),
      twoFactorEnabled: !!data.twoFactorEnabled,
      status: 'active',
      active: true,
      failedAttempts: 0,
      createdAt: todayISO(),
    };

    setUsers((prev) => [newUser, ...prev]);
    logAuditEvent('User Created', `Administrator created user "${cleanName}" with role [${assignedRoles.join(', ')}] and secure PIN.`, 'warning', 'users');

    apiFetch('/api/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    }).catch(() => {});

    return { success: true, message: `User "${cleanName}" successfully created.` };
  };

  const updateUser = (
    id: string,
    data: Partial<Omit<AppUser, 'id' | 'createdAt'>> & { newPassword?: string }
  ): { success: boolean; message: string } => {
    const existing = users.find((u) => u.id === id);
    if (!existing) return { success: false, message: 'User not found.' };

    const updatePayload: Partial<AppUser> = { ...data };

    if (data.pin != null && data.pin.trim() !== '') {
      if (!validPin(data.pin)) {
        return { success: false, message: 'PIN must be 4 to 6 numeric digits.' };
      }
      const cleanP = data.pin.trim();
      updatePayload.pin = cleanP;
      updatePayload.pinHash = hashPin(cleanP);
      updatePayload.failedAttempts = 0;
      updatePayload.lockedUntil = undefined;
      logAuditEvent('PIN Reset', `Administrator reset/updated the PIN for user "${existing.name}".`, 'warning', 'auth');
    }

    if (data.newPassword) {
      updatePayload.passwordHash = hashPassword(data.newPassword);
    }

    if (data.roles && data.roles.length > 0) {
      updatePayload.roles = data.roles;
      updatePayload.role = (data.roles[0] as UserRole) || existing.role;
      logAuditEvent('Role Assigned', `Updated roles for "${existing.name}" to [${data.roles.join(', ')}].`, 'warning', 'roles');
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updatePayload } : u))
    );

    logAuditEvent('User Updated', `${existing.name}: profile/settings modified by administrator.`, 'info', 'users');

    apiFetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    }).catch(() => {});

    return { success: true, message: 'User updated successfully.' };
  };

  const deleteUser = (id: string) => {
    const existing = users.find((u) => u.id === id);
    if (!existing) return;
    if (existing.username === 'superadmin' || existing.id === 'user-super-admin') {
      logAuditEvent('Action Denied', 'Attempted deletion of the primary Super Admin was blocked.', 'danger', 'system');
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    removeRemote('users', [id]);
    logAuditEvent('User Deleted', `${existing.name} (${existing.role}) removed from system.`, 'danger', 'users');

    apiFetch(`/api/users/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  const unlockUserAccount = (id: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, status: 'active', failedAttempts: 0, lockedUntil: undefined }
          : u
      )
    );
    logAuditEvent('Account Unlocked', `Administrator lifted lockout on user account ID ${id}.`, 'info', 'auth');

    apiFetch(`/api/users/${id}/unlock`, { method: 'POST' }).catch(() => {});
  };

  const forceLogoutUser = (id: string) => {
    if (currentUser?.id === id) {
      lockAdmin();
    }
    logAuditEvent('Force Logout', `Session terminated for user ID ${id}.`, 'warning', 'auth');
  };

  const resetUserPin = (userId: string, newPin: string): { success: boolean; message: string } => {
    const clean = newPin.trim();
    if (!validPin(clean)) {
      return { success: false, message: 'PIN must be 4 to 6 numeric digits.' };
    }
    const user = users.find((u) => u.id === userId);
    if (!user) return { success: false, message: 'User not found.' };

    const pinH = hashPin(clean);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              pin: clean,
              pinHash: pinH,
              failedAttempts: 0,
              lockedUntil: undefined,
              status: u.status === 'locked' ? 'active' : u.status,
            }
          : u
      )
    );

    logAuditEvent('PIN Reset', `Administrator reset PIN for user "${user.name}".`, 'warning', 'auth');
    return { success: true, message: `PIN for "${user.name}" has been successfully reset.` };
  };

  // ---------------------------------------------------------------------------
  // Customer-Specific Agreed Rates
  // ---------------------------------------------------------------------------
  const getCustomerAgreedRate = (customerId: string, productId: string): number | null => {
    const rateRecord = customerAgreedRates.find(
      (r) => r.customerId === customerId && r.productId === productId
    );
    return rateRecord ? rateRecord.agreedRatePerKg : null;
  };

  const setCustomerAgreedRate = (
    customerId: string,
    productId: string,
    agreedRatePerKg: number,
    notes?: string
  ): CustomerAgreedRate => {
    const existingIndex = customerAgreedRates.findIndex(
      (r) => r.customerId === customerId && r.productId === productId
    );
    const cust = customers.find((c) => c.id === customerId);
    const prod = products.find((p) => p.id === productId);

    let updatedRecord: CustomerAgreedRate;
    if (existingIndex >= 0) {
      updatedRecord = {
        ...customerAgreedRates[existingIndex],
        agreedRatePerKg: round2(agreedRatePerKg),
        notes: notes?.trim() || customerAgreedRates[existingIndex].notes,
        updatedAt: todayISO(),
      };
      setCustomerAgreedRates((prev) =>
        prev.map((r, i) => (i === existingIndex ? updatedRecord : r))
      );
    } else {
      updatedRecord = {
        id: uid('car'),
        customerId,
        productId,
        agreedRatePerKg: round2(agreedRatePerKg),
        notes: notes?.trim(),
        createdAt: todayISO(),
        updatedAt: todayISO(),
      };
      setCustomerAgreedRates((prev) => [updatedRecord, ...prev]);
    }

    logAuditEvent(
      'Agreed Rate Updated',
      `Set agreed rate for ${cust?.name || customerId} on ${prod?.name || productId} to ${formatCurrency(agreedRatePerKg)}/kg.`,
      'info',
      'data'
    );
    return updatedRecord;
  };

  const deleteCustomerAgreedRate = (id: string) => {
    setCustomerAgreedRates((prev) => prev.filter((r) => r.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Invoicing & Billing
  // ---------------------------------------------------------------------------
  const addInvoice = (data: Omit<Invoice, 'id' | 'createdAt'>): Invoice => {
    const newInvoice: Invoice = {
      ...data,
      id: uid('inv'),
      createdAt: todayISO(),
      createdBy: currentUser?.name,
    };
    setInvoices((prev) => [newInvoice, ...prev]);
    logAuditEvent(
      'Invoice Created',
      `Invoice ${newInvoice.invoiceNumber} created for ${newInvoice.customerName} (${formatCurrency(newInvoice.totalAmount)}). Status: ${newInvoice.paymentStatus}.`,
      'info',
      'billing'
    );
    return newInvoice;
  };

  const updateInvoice = (id: string, data: Partial<Invoice>): { success: boolean; message: string } => {
    const existing = invoices.find((inv) => inv.id === id);
    if (!existing) return { success: false, message: 'Invoice not found.' };

    const updated: Invoice = { ...existing, ...data };
    const subtotal = updated.subtotal || 0;
    const discount = updated.discount || 0;
    const taxable = Math.max(0, subtotal - discount);
    const tax = round2((taxable * (updated.taxRatePct || 0)) / 100);
    const freight = updated.freightCharges || 0;
    const handling = updated.handlingCharges || 0;
    const total = round2(taxable + tax + freight + handling);
    const balance = Math.max(0, round2(total - updated.paidAmount));
    updated.taxAmount = tax;
    updated.totalAmount = total;
    updated.balanceDue = balance;
    if (updated.paidAmount >= total && total > 0) {
      updated.paymentStatus = 'paid';
      updated.status = 'paid';
    } else if (updated.paidAmount > 0) {
      updated.paymentStatus = 'partial';
      updated.status = 'partial';
    } else {
      updated.paymentStatus = 'unpaid';
      if (updated.status === 'paid' || updated.status === 'partial') updated.status = 'issued';
    }

    setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
    logAuditEvent('Invoice Updated', `Invoice ${existing.invoiceNumber} updated. Total: ${formatCurrency(total)}.`, 'info', 'billing');
    return { success: true, message: 'Invoice updated successfully.' };
  };

  const deleteInvoice = (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    removeRemote('invoices', [id]);
    logAuditEvent('Invoice Deleted', `Invoice ${inv.invoiceNumber} removed from system.`, 'danger', 'billing');
  };

  const recordInvoicePayment = (
    invoiceId: string,
    amount: number,
    paymentMethod: 'bank_transfer' | 'cash' | 'cheque' | 'online' = 'bank_transfer',
    notes?: string
  ): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'Invoice not found.' };

    const payAmt = round2(Math.max(0, amount));
    if (payAmt <= 0) return { success: false, message: 'Payment amount must be greater than zero.' };

    const newPaid = round2(inv.paidAmount + payAmt);
    const newBalance = Math.max(0, round2(inv.totalAmount - newPaid));
    const newPaymentStatus: InvoicePaymentStatus = newBalance === 0 ? 'paid' : 'partial';
    const newStatus: InvoiceStatus = newBalance === 0 ? 'paid' : 'partial';

    const paymentRecord: InvoicePaymentRecord = {
      id: uid('pay'),
      date: todayISO(),
      amount: payAmt,
      method: paymentMethod,
      notes,
      recordedBy: currentUser?.name,
    };

    setInvoices((prev) =>
      prev.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              paidAmount: newPaid,
              balanceDue: newBalance,
              paymentStatus: newPaymentStatus,
              status: newStatus,
              payments: [...(i.payments || []), paymentRecord],
              updatedAt: todayISO(),
            }
          : i
      )
    );

    const cust = customers.find((c) => c.id === inv.customerId);
    if (cust) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === inv.customerId
            ? { ...c, totalDue: Math.max(0, round2(c.totalDue - payAmt)) }
            : c
        )
      );

      const newLedgerEntry: LedgerEntry = {
        id: uid('led'),
        entityType: 'customer',
        entityId: inv.customerId,
        type: 'payment_received',
        referenceId: inv.invoiceNumber,
        date: todayISO(),
        description: `Payment against Invoice ${inv.invoiceNumber}${notes ? ` (${notes})` : ''}`,
        debit: 0,
        credit: payAmt,
        balanceAfter: Math.max(0, round2((cust.totalDue || 0) - payAmt)),
      };
      setLedger((prev) => [newLedgerEntry, ...prev]);
    }

    logAuditEvent(
      'Invoice Payment',
      `Recorded ${formatCurrency(payAmt)} payment against ${inv.invoiceNumber}. New balance: ${formatCurrency(newBalance)}.`,
      'info',
      'billing'
    );

    return { success: true, message: `Payment of ${formatCurrency(payAmt)} recorded successfully.` };
  };

  // ---------------------------------------------------------------------------
  // Simple billing: bills, payments, cash/bank transfers
  // ---------------------------------------------------------------------------
  const createBill = (input: CreateBillInput): { success: boolean; message: string; invoice?: Invoice } => {
    const items = (input.items || []).filter((it) => it.productId && it.qty > 0);
    if (items.length === 0) return { success: false, message: 'Add at least one item with a quantity.' };
    let customer = customers.find((c) => c.id === input.customerId);
    if (!customer && input.newCustomer?.name.trim()) {
      const name = input.newCustomer.name.trim();
      customer = addCustomer({ name, company: name, phone: input.newCustomer.phone.trim(), email: '', address: '', creditLimit: 0 });
    }
    if (!customer) return { success: false, message: 'Pick a customer first.' };
    const date = input.date || todayISO();
    const subtotal = round2(items.reduce((a, it) => a + it.qty * it.unitPrice, 0));
    const discount = round2(Math.min(Math.max(0, input.discount || 0), subtotal));
    const taxRatePct = settings.taxRatePct ?? 0;
    const taxAmount = round2(((subtotal - discount) * taxRatePct) / 100);
    const totalAmount = round2(subtotal - discount + taxAmount);
    const paidAmount = round2(Math.min(Math.max(0, input.paidNow || 0), totalAmount));
    const balanceDue = round2(totalAmount - paidAmount);
    const method = input.paymentMethod || 'Cash';
    const invoiceNumber = nextBillNumber(invoices);
    const invoiceItems: InvoiceItem[] = items.map((it) => {
      const product = products.find((p) => p.id === it.productId);
      return {
        id: uid('bi'),
        productId: it.productId,
        productName: it.name || product?.name || 'Item',
        kg: it.qty,
        ratePerKg: round2(it.unitPrice),
        costPricePerKg: product?.costPricePerKg,
        amount: round2(it.qty * it.unitPrice),
        qty: it.qty,
        unitPrice: round2(it.unitPrice),
        unit: it.unit || product?.unit || 'pcs',
      };
    });
    const payments: InvoicePaymentRecord[] =
      paidAmount > 0 ? [{ id: uid('pay'), date, amount: paidAmount, method: invoiceMethod(method), notes: method, recordedBy: currentUser?.name }] : [];
    const invoice: Invoice = {
      id: uid('inv'),
      invoiceNumber,
      customerId: customer.id,
      customerName: customer.name,
      customerCompany: customer.company,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      issueDate: date,
      dueDate: date,
      status: balanceDue === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'issued',
      paymentStatus: balanceDue === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      items: invoiceItems,
      subtotal,
      taxRatePct,
      taxAmount,
      discount,
      totalAmount,
      paidAmount,
      balanceDue,
      payments,
      notes: input.notes?.trim() || undefined,
      paymentMethod: method,
      billKind: balanceDue === 0 ? 'cash' : 'credit',
      createdAt: todayISO(),
      createdBy: currentUser?.name,
    };
    setInvoices((prev) => [invoice, ...prev]);

    // Stock comes off in the product's own unit.
    setProducts((prev) =>
      prev.map((p) => {
        const sold = items.filter((it) => it.productId === p.id).reduce((a, it) => a + it.qty, 0);
        return sold > 0 ? { ...p, stockKg: round2(p.stockKg - sold) } : p;
      })
    );

    // Customer account: bill goes on, cash paid now comes off.
    const dueAfterBill = round2((customer.totalDue || 0) + totalAmount);
    const dueAfterPayment = round2(dueAfterBill - paidAmount);
    setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, totalDue: Math.max(0, dueAfterPayment) } : c)));
    const entries: LedgerEntry[] = [
      {
        id: uid('led'),
        entityType: 'customer',
        entityId: customer.id,
        type: 'bill_issued',
        referenceId: invoiceNumber,
        date,
        description: `Bill ${invoiceNumber}: ${invoiceItems.map((it) => `${it.productName} × ${it.qty}`).join(', ')}`,
        debit: totalAmount,
        credit: 0,
        balanceAfter: dueAfterBill,
      },
    ];
    if (paidAmount > 0) {
      entries.unshift({
        id: uid('led'),
        entityType: 'customer',
        entityId: customer.id,
        type: 'payment_received',
        referenceId: invoiceNumber,
        date,
        description: `Payment received: ${method} - Bill ${invoiceNumber}`,
        debit: 0,
        credit: paidAmount,
        balanceAfter: dueAfterPayment,
      });
    }
    setLedger((prev) => [...entries, ...prev]);
    logAuditEvent('Bill Created', `${invoiceNumber} for ${customer.name}: ${formatCurrency(totalAmount)} (${paidAmount > 0 ? `${formatCurrency(paidAmount)} paid by ${method}` : 'on credit'}).`, 'info', 'billing');
    return { success: true, message: `Bill ${invoiceNumber} saved.`, invoice };
  };

  const payBill = (invoiceId: string, amount: number, method: string, notes?: string, date?: string): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'Bill not found.' };
    const payAmt = round2(Math.max(0, amount));
    if (payAmt <= 0) return { success: false, message: 'Enter an amount greater than zero.' };
    if (payAmt > inv.balanceDue + 0.005) return { success: false, message: `Only ${formatCurrency(inv.balanceDue)} is left on this bill.` };
    const when = date || todayISO();
    const newPaid = round2(inv.paidAmount + payAmt);
    const newBalance = Math.max(0, round2(inv.totalAmount - newPaid));
    const record: InvoicePaymentRecord = { id: uid('pay'), date: when, amount: payAmt, method: invoiceMethod(method), notes: notes ? `${method} - ${notes}` : method, recordedBy: currentUser?.name };
    setInvoices((prev) =>
      prev.map((i) =>
        i.id === invoiceId
          ? { ...i, paidAmount: newPaid, balanceDue: newBalance, paymentStatus: newBalance === 0 ? 'paid' : 'partial', status: newBalance === 0 ? 'paid' : 'partial', billKind: newBalance === 0 ? 'cash' : 'credit', payments: [...(i.payments || []), record], updatedAt: todayISO() }
          : i
      )
    );
    const cust = customers.find((c) => c.id === inv.customerId);
    const dueAfter = Math.max(0, round2((cust?.totalDue || 0) - payAmt));
    if (cust) setCustomers((prev) => prev.map((c) => (c.id === cust.id ? { ...c, totalDue: dueAfter } : c)));
    setLedger((prev) => [
      {
        id: uid('led'),
        entityType: 'customer',
        entityId: inv.customerId,
        type: 'payment_received',
        referenceId: inv.invoiceNumber,
        date: when,
        description: `Payment received: ${method} - Bill ${inv.invoiceNumber}${notes ? ` (${notes})` : ''}`,
        debit: 0,
        credit: payAmt,
        balanceAfter: dueAfter,
      },
      ...prev,
    ]);
    logAuditEvent('Bill Payment', `${formatCurrency(payAmt)} by ${method} against ${inv.invoiceNumber}. Left: ${formatCurrency(newBalance)}.`, 'info', 'billing');
    return { success: true, message: `${formatCurrency(payAmt)} received. ${newBalance === 0 ? 'Bill fully paid.' : `${formatCurrency(newBalance)} still due.`}` };
  };

  const deleteBill = (invoiceId: string): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'Bill not found.' };
    // Put stock back, take the unpaid part off the customer, drop the bill's ledger lines.
    setProducts((prev) =>
      prev.map((p) => {
        const qty = inv.items.filter((it) => it.productId === p.id).reduce((a, it) => a + (it.qty ?? it.kg), 0);
        return qty > 0 ? { ...p, stockKg: round2(p.stockKg + qty) } : p;
      })
    );
    setCustomers((prev) => prev.map((c) => (c.id === inv.customerId ? { ...c, totalDue: Math.max(0, round2(c.totalDue - inv.balanceDue)) } : c)));
    const ledgerIds = ledger.filter((l) => l.referenceId === inv.invoiceNumber && l.entityType === 'customer').map((l) => l.id);
    setLedger((prev) => prev.filter((l) => !ledgerIds.includes(l.id)));
    removeRemote('ledger', ledgerIds);
    setInvoices((prev) => prev.filter((i) => i.id !== invoiceId));
    removeRemote('invoices', [invoiceId]);
    logAuditEvent('Bill Deleted', `${inv.invoiceNumber} (${formatCurrency(inv.totalAmount)}) for ${inv.customerName} removed; stock and account reversed.`, 'danger', 'billing');
    return { success: true, message: `Bill ${inv.invoiceNumber} deleted.` };
  };

  const addCashTransfer = ({ amount, from, date, note }: { amount: number; from: 'cash' | 'bank'; date?: string; note?: string }): { success: boolean; message: string } => {
    const amt = round2(Math.max(0, amount));
    if (amt <= 0) return { success: false, message: 'Enter an amount greater than zero.' };
    const when = date || todayISO();
    const to = from === 'cash' ? 'bank' : 'cash';
    const label = from === 'cash' ? 'Deposited cash to bank' : 'Withdrew cash from bank';
    const description = `${label}${note ? ` - ${note}` : ''}`;
    const out: CashEntry = { id: uid('cash'), date: when, direction: 'out', amount: amt, description, method: from === 'cash' ? 'Cash' : 'Bank Transfer', createdAt: todayISO(), createdBy: currentUser?.name };
    const inn: CashEntry = { id: uid('cash'), date: when, direction: 'in', amount: amt, description, method: to === 'cash' ? 'Cash' : 'Bank Transfer', createdAt: todayISO(), createdBy: currentUser?.name };
    setCashEntries((prev) => [inn, out, ...prev]);
    logAuditEvent('Cash Transfer', `${label}: ${formatCurrency(amt)}`, 'info');
    return { success: true, message: `${label}: ${formatCurrency(amt)}.` };
  };

  const generateInvoiceFromBookings = (
    bookingIds: string[],
    dueDate?: string,
    notes?: string
  ): Invoice | null => {
    if (bookingIds.length === 0) return null;
    const selectedBks = bookings.filter((b) => bookingIds.includes(b.id));
    if (selectedBks.length === 0) return null;

    const firstBk = selectedBks[0];
    const customer = customers.find((c) => c.id === firstBk.customerId);
    if (!customer) return null;

    const invNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const items: InvoiceItem[] = selectedBks.flatMap((bk) => {
      if (bk.items && bk.items.length > 0) {
        return bk.items.map((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const amount = round2(it.totalKg * it.pricePerKg);
          return {
            id: uid('item'),
            bookingId: bk.id,
            productId: it.productId,
            productName: prod?.name || it.productName || 'Bulk Commodity',
            description: `Booking ${bk.bookingNumber} - ${it.totalKg.toLocaleString()} kg of ${prod?.name || 'Goods'}${it.notes ? ` (${it.notes})` : ''}`,
            kg: it.totalKg,
            ratePerKg: it.pricePerKg,
            costPricePerKg: it.costPricePerKg,
            amount,
          };
        });
      }
      const prod = products.find((p) => p.id === bk.productId);
      const amount = round2(bk.totalKg * bk.pricePerKg);
      return [{
        id: uid('item'),
        bookingId: bk.id,
        productId: bk.productId,
        productName: prod?.name || 'Bulk Commodity',
        description: `Booking ${bk.bookingNumber} - ${bk.totalKg.toLocaleString()} kg of ${prod?.name || 'Goods'}${bk.notes ? ` (${bk.notes})` : ''}`,
        kg: bk.totalKg,
        ratePerKg: bk.pricePerKg,
        costPricePerKg: bk.costPricePerKg,
        amount,
      }];
    });

    const subtotal = round2(items.reduce((acc, it) => acc + it.amount, 0));
    const taxRate = settings.taxRatePct || 0;
    const taxAmount = round2((subtotal * taxRate) / 100);
    const totalAmount = round2(subtotal + taxAmount);

    const paidFromBookings = round2(
      selectedBks.reduce((acc, bk) => acc + (bk.paidAmount || 0), 0)
    );
    const balanceDue = Math.max(0, round2(totalAmount - paidFromBookings));
    const paymentStatus: InvoicePaymentStatus =
      balanceDue === 0 ? 'paid' : paidFromBookings > 0 ? 'partial' : 'unpaid';
    const status: InvoiceStatus = balanceDue === 0 ? 'paid' : 'issued';

    const invoice: Invoice = {
      id: uid('inv'),
      invoiceNumber: invNum,
      customerId: customer.id,
      customerName: customer.name,
      customerCompany: customer.company,
      customerPhone: customer.phone,
      customerAddress: customer.city ? `${customer.city}, Pakistan` : undefined,
      linkedBookingIds: bookingIds,
      items,
      subtotal,
      freightCharges: 0,
      handlingCharges: 0,
      taxRatePct: taxRate,
      taxAmount,
      discount: 0,
      totalAmount,
      paidAmount: paidFromBookings,
      balanceDue,
      paymentStatus,
      status,
      payments: [],
      issueDate: todayISO(),
      dueDate: dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      notes: notes?.trim() || `Generated for bookings: ${selectedBks.map((b) => b.bookingNumber).join(', ')}`,
      createdAt: todayISO(),
      createdBy: currentUser?.name,
    };

    setInvoices((prev) => [invoice, ...prev]);
    logAuditEvent(
      'Invoice Generated',
      `Invoice ${invNum} generated from ${selectedBks.length} booking(s) for ${customer.name}. Total: ${formatCurrency(totalAmount)}.`,
      'info',
      'billing'
    );
    return invoice;
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
  // Quotations
  // ---------------------------------------------------------------------------
  const addQuotation = (data: { customerId: string; productId: string; kg: number; pricePerKg: number; validUntil: string; notes?: string }): Quotation => {
    const q: Quotation = {
      id: uid('quote'),
      quoteNumber: `QT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      customerId: data.customerId,
      productId: data.productId,
      kg: round2(data.kg),
      pricePerKg: round2(data.pricePerKg),
      amount: round2(data.kg * data.pricePerKg),
      validUntil: data.validUntil,
      status: 'draft',
      notes: data.notes?.trim() || undefined,
      createdAt: todayISO(),
      createdBy: currentUser?.name,
      bookingId: null,
    };
    setQuotations((prev) => [q, ...prev]);
    logAuditEvent('Quotation Created', `${q.quoteNumber}: ${q.kg.toLocaleString()} kg @ Rs. ${q.pricePerKg}/kg (${formatCurrency(q.amount)}).`, 'info');
    return q;
  };

  const setQuotationStatus = (id: string, status: QuotationStatus) => {
    const q = quotations.find((x) => x.id === id);
    if (!q) return;
    setQuotations((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
    logAuditEvent('Quotation Updated', `${q.quoteNumber} marked ${status}.`, 'info');
  };

  const convertQuotation = (id: string, targetDeliveryDate?: string): Booking | null => {
    const q = quotations.find((x) => x.id === id);
    if (!q || q.status === 'converted') return null;
    const booking = createBooking({ customerId: q.customerId, productId: q.productId, totalKg: q.kg, pricePerKg: q.pricePerKg, targetDeliveryDate, notes: q.notes ? `From ${q.quoteNumber}: ${q.notes}` : `From ${q.quoteNumber}`, quotationId: q.id });
    setQuotations((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'converted', bookingId: booking.id } : x)));
    logAuditEvent('Quotation Converted', `${q.quoteNumber} became booking ${booking.bookingNumber}.`, 'info');
    return booking;
  };

  const deleteQuotation = (id: string) => {
    const q = quotations.find((x) => x.id === id);
    if (!q) return;
    setQuotations((prev) => prev.filter((x) => x.id !== id));
    removeRemote('quotations', [id]);
    logAuditEvent('Quotation Deleted', `${q.quoteNumber} removed.`, 'danger');
  };

  // ---------------------------------------------------------------------------
  // Purchase orders
  // ---------------------------------------------------------------------------
  const addPurchaseOrder = (data: { supplierId: string; productId: string; kg: number; pricePerKg: number; expectedDate?: string; notes?: string }): PurchaseOrder => {
    const po: PurchaseOrder = {
      id: uid('po'),
      poNumber: `PO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      supplierId: data.supplierId,
      productId: data.productId,
      kg: round2(data.kg),
      pricePerKg: round2(data.pricePerKg),
      amount: round2(data.kg * data.pricePerKg),
      expectedDate: data.expectedDate || undefined,
      status: 'open',
      receivedKg: 0,
      notes: data.notes?.trim() || undefined,
      createdAt: todayISO(),
      createdBy: currentUser?.name,
    };
    setPurchaseOrders((prev) => [po, ...prev]);
    logAuditEvent('Purchase Order Created', `${po.poNumber}: ${po.kg.toLocaleString()} kg @ Rs. ${po.pricePerKg}/kg from ${suppliers.find((s) => s.id === data.supplierId)?.company || 'supplier'}.`, 'info');
    return po;
  };

  const cancelPurchaseOrder = (id: string) => {
    const po = purchaseOrders.find((x) => x.id === id);
    if (!po) return;
    setPurchaseOrders((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)));
    logAuditEvent('Purchase Order Cancelled', `${po.poNumber} cancelled with ${(po.kg - po.receivedKg).toLocaleString()} kg outstanding.`, 'warning');
  };

  const deletePurchaseOrder = (id: string) => {
    const po = purchaseOrders.find((x) => x.id === id);
    if (!po) return;
    setPurchaseOrders((prev) => prev.filter((x) => x.id !== id));
    setPurchases((prev) => prev.map((p) => (p.purchaseOrderId === id ? { ...p, purchaseOrderId: null } : p)));
    removeRemote('purchase_orders', [id]);
    logAuditEvent('Purchase Order Deleted', `${po.poNumber} removed.`, 'danger');
  };

  // ---------------------------------------------------------------------------
  // Returns (sales -> credit note, purchase -> debit note)
  // ---------------------------------------------------------------------------
  const addReturn = (data: { kind: 'sales' | 'purchase'; customerId?: string; supplierId?: string; productId: string; dispatchId?: string | null; purchaseId?: string | null; kg: number; pricePerKg: number; reason: string; date?: string }): StockReturn => {
    const onDate = data.date || todayISO();
    const amount = round2(data.kg * data.pricePerKg);
    const product = products.find((p) => p.id === data.productId);
    const r: StockReturn = {
      id: uid('ret'),
      returnNumber: `${data.kind === 'sales' ? 'CN' : 'DN'}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      kind: data.kind,
      customerId: data.customerId || null,
      supplierId: data.supplierId || null,
      productId: data.productId,
      dispatchId: data.dispatchId || null,
      purchaseId: data.purchaseId || null,
      kg: round2(data.kg),
      pricePerKg: round2(data.pricePerKg),
      amount,
      reason: data.reason.trim(),
      date: onDate,
      createdAt: todayISO(),
      createdBy: currentUser?.name,
    };
    if (data.kind === 'sales' && data.customerId) {
      const customer = customers.find((c) => c.id === data.customerId);
      setProducts((prev) => prev.map((p) => (p.id === data.productId ? { ...p, stockKg: round2(p.stockKg + data.kg) } : p)));
      setCustomers((prev) => prev.map((c) => (c.id === data.customerId ? { ...c, totalDue: Math.max(0, round2(c.totalDue - amount)) } : c)));
      setLedger((prev) => [
        { id: uid('led'), entityType: 'customer', entityId: data.customerId!, type: 'credit_note', referenceId: r.returnNumber, date: onDate, description: `Credit note ${r.returnNumber}: ${data.kg.toLocaleString()} kg ${product?.name || 'goods'} returned — ${r.reason}`, debit: 0, credit: amount, balanceAfter: Math.max(0, round2((customer?.totalDue || 0) - amount)), kg: data.kg },
        ...prev,
      ]);
    } else if (data.kind === 'purchase' && data.supplierId) {
      const supplier = suppliers.find((s) => s.id === data.supplierId);
      setProducts((prev) => prev.map((p) => (p.id === data.productId ? { ...p, stockKg: Math.max(0, round2(p.stockKg - data.kg)) } : p)));
      setSuppliers((prev) => prev.map((s) => (s.id === data.supplierId ? { ...s, totalOwed: Math.max(0, round2(s.totalOwed - amount)) } : s)));
      setLedger((prev) => [
        { id: uid('led'), entityType: 'supplier', entityId: data.supplierId!, type: 'debit_note', referenceId: r.returnNumber, date: onDate, description: `Debit note ${r.returnNumber}: ${data.kg.toLocaleString()} kg ${product?.name || 'goods'} returned — ${r.reason}`, debit: 0, credit: amount, balanceAfter: Math.max(0, round2((supplier?.totalOwed || 0) - amount)), kg: data.kg },
        ...prev,
      ]);
    }
    setReturns((prev) => [r, ...prev]);
    logAuditEvent(data.kind === 'sales' ? 'Sales Return' : 'Purchase Return', `${r.returnNumber}: ${data.kg.toLocaleString()} kg ${product?.name || ''} (${formatCurrency(amount)}) — ${r.reason}`, 'warning');
    return r;
  };

  const deleteReturn = (id: string) => {
    const r = returns.find((x) => x.id === id);
    if (!r) return;
    const ledgerIds = ledger.filter((l) => l.referenceId === r.returnNumber).map((l) => l.id);
    if (r.kind === 'sales' && r.customerId) {
      setProducts((prev) => prev.map((p) => (p.id === r.productId ? { ...p, stockKg: Math.max(0, round2(p.stockKg - r.kg)) } : p)));
      setCustomers((prev) => prev.map((c) => (c.id === r.customerId ? { ...c, totalDue: round2(c.totalDue + r.amount) } : c)));
    } else if (r.kind === 'purchase' && r.supplierId) {
      setProducts((prev) => prev.map((p) => (p.id === r.productId ? { ...p, stockKg: round2(p.stockKg + r.kg) } : p)));
      setSuppliers((prev) => prev.map((s) => (s.id === r.supplierId ? { ...s, totalOwed: round2(s.totalOwed + r.amount) } : s)));
    }
    setLedger((prev) => prev.filter((l) => l.referenceId !== r.returnNumber));
    setReturns((prev) => prev.filter((x) => x.id !== id));
    removeRemote('ledger', ledgerIds);
    removeRemote('returns', [id]);
    logAuditEvent('Return Deleted', `${r.returnNumber} removed; stock and balance reversed.`, 'danger');
  };

  // ---------------------------------------------------------------------------
  // Stock adjustments
  // ---------------------------------------------------------------------------
  const adjustStock = (productId: string, newStockKg: number, reason: AdjustmentReason, note?: string): StockAdjustment | null => {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    const deltaKg = round2(newStockKg - product.stockKg);
    if (deltaKg === 0) return null;
    const adj: StockAdjustment = { id: uid('adj'), productId, deltaKg, reason, note: note?.trim() || undefined, date: todayISO(), createdAt: todayISO(), createdBy: currentUser?.name };
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, stockKg: Math.max(0, round2(newStockKg)) } : p)));
    setAdjustments((prev) => [adj, ...prev]);
    logAuditEvent('Stock Adjusted', `${product.name}: ${deltaKg > 0 ? '+' : ''}${deltaKg.toLocaleString()} kg (${reason})${note ? ` — ${note}` : ''}.`, 'warning');
    return adj;
  };

  const deleteAdjustment = (id: string) => {
    const adj = adjustments.find((a) => a.id === id);
    if (!adj) return;
    setProducts((prev) => prev.map((p) => (p.id === adj.productId ? { ...p, stockKg: Math.max(0, round2(p.stockKg - adj.deltaKg)) } : p)));
    setAdjustments((prev) => prev.filter((a) => a.id !== id));
    removeRemote('stock_adjustments', [id]);
    logAuditEvent('Stock Adjustment Deleted', `${adj.deltaKg > 0 ? '+' : ''}${adj.deltaKg.toLocaleString()} kg reversed.`, 'danger');
  };

  // ---------------------------------------------------------------------------
  // Tasks / follow-ups
  // ---------------------------------------------------------------------------
  const addTask = (data: { title: string; dueDate: string; linkType?: TaskLinkType | null; linkId?: string | null; note?: string }): Task => {
    const t: Task = { id: uid('task'), title: data.title.trim(), dueDate: data.dueDate, status: 'open', linkType: data.linkType || null, linkId: data.linkId || null, note: data.note?.trim() || undefined, createdAt: todayISO(), createdBy: currentUser?.name, doneAt: null };
    setTasks((prev) => [t, ...prev]);
    return t;
  };

  const completeTask = (id: string, done = true) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: done ? 'done' : 'open', doneAt: done ? todayISO() : null } : t)));
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    removeRemote('tasks', [id]);
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
    setSettings((prev) => ({ ...prev, id: 'default', masterPin: clean }));
    logAuditEvent('Master PIN Updated', 'Administrator established a new master PIN.', 'warning');
    return { success: true, message: 'Master PIN successfully updated.' };
  };

  const resetAdminPinToDefault = () => {
    setAdminPin(DEFAULT_ADMIN_PIN);
    setSettings((prev) => ({ ...prev, id: 'default', masterPin: DEFAULT_ADMIN_PIN }));
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
      quotations,
      purchaseOrders,
      returns,
      adjustments,
      tasks,
      ledger,
      whatsappMessages,
      invoices,
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
      if (Array.isArray(data.quotations)) setQuotations(data.quotations);
      if (Array.isArray(data.purchaseOrders)) setPurchaseOrders(data.purchaseOrders);
      if (Array.isArray(data.returns)) setReturns(data.returns);
      if (Array.isArray(data.adjustments)) setAdjustments(data.adjustments);
      if (Array.isArray(data.tasks)) setTasks(data.tasks);
      if (data.settings && typeof data.settings === 'object') {
        setSettings({ ...data.settings, id: 'default' });
        const importedPin = (data.settings as Partial<AppSettings>).masterPin;
        if (typeof importedPin === 'string' && /^\d{4,6}$/.test(importedPin.trim())) {
          setAdminPin(importedPin.trim());
        }
      } else if (typeof data.adminPin === 'string' && /^\d{4,6}$/.test(data.adminPin.trim())) {
        const importedPin = data.adminPin.trim();
        setAdminPin(importedPin);
        setSettings((prev) => ({ ...prev, id: 'default', masterPin: importedPin }));
      }
      if (Array.isArray(data.ledger)) setLedger(data.ledger.map(normalizeLedger));
      if (Array.isArray(data.whatsappMessages)) setWhatsappMessages(data.whatsappMessages);
      if (Array.isArray(data.invoices)) setInvoices(data.invoices);
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
    setQuotations([]);
    setPurchaseOrders([]);
    setReturns([]);
    setAdjustments([]);
    setTasks([]);
    setLedger([]);
    setWhatsappMessages([]);
    setInvoices([]);
    localStorage.removeItem(STORAGE_KEYS.INVOICES);
    [STORAGE_KEYS.QUOTES, STORAGE_KEYS.POS, STORAGE_KEYS.RETURNS, STORAGE_KEYS.ADJUSTMENTS, STORAGE_KEYS.TASKS].forEach((k) => localStorage.removeItem(k));
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
        requestedBookingsView,
        openBookingsView,
        requestedSuppliersView,
        openSuppliersView,
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
        markDelivered,
        reopenDispatch,
        cashEntries,
        addCashEntry,
        deleteCashEntry,
        settings,
        updateSettings,
        quotations,
        addQuotation,
        setQuotationStatus,
        convertQuotation,
        deleteQuotation,
        purchaseOrders,
        addPurchaseOrder,
        cancelPurchaseOrder,
        deletePurchaseOrder,
        returns,
        addReturn,
        deleteReturn,
        adjustments,
        adjustStock,
        deleteAdjustment,
        tasks,
        addTask,
        completeTask,
        deleteTask,
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
        roles,
        createRole,
        updateRole,
        deleteRole,
        updatePermissionsMatrix,
        visibilitySettings,
        updateVisibilitySettings,
        isScreenVisible,
        isFieldVisible,
        securityPolicy,
        updateSecurityPolicy,
        loginWithCredentials,
        verify2FACode,
        requestPasswordReset,
        resetPasswordWithToken,
        unlockUserAccount,
        forceLogoutUser,
        resetUserPin,
        invoices,
        addInvoice,
        updateInvoice,
        deleteInvoice,
        recordInvoicePayment,
        createBill,
        payBill,
        deleteBill,
        addCashTransfer,
        generateInvoiceFromBookings,
        customerAgreedRates,
        setCustomerAgreedRate,
        deleteCustomerAgreedRate,
        getCustomerAgreedRate,
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
