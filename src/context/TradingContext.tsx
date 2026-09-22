import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { assignMissingCodes, CUSTOMER_CODE_PREFIX, SUPPLIER_CODE_PREFIX } from '../utils/partyCode';
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
  BankStatementLine,
  BankReconciliation,
  QuotationLine,
  ReturnLine,
  Cheque,
} from '../types';
import { lineDiscountAmount, planReturn, maxRefund, returnsForBill, billBalance, quotationTotal, ReturnPick } from '../utils/salesDocs';
import { creditCheck } from '../utils/credit';
import { collectCashMovements, costPerKgOn } from '../utils/finance';
import { BankRecApi, createBankRecApi } from './bankRecActions';
import { ChequeApi, createChequeApi } from './chequeActions';
import { SalesExtrasApi, SalesExtrasPrintRequest, useSalesExtrasStore } from './salesExtrasActions';
import { PurchasingApi, usePurchasingStore } from './purchasingActions';
import { receiveOnPo, unreceiveOnPo } from '../utils/purchasing';
import { FinanceApi, useFinanceStore } from './financeActions';
import { buildJournal, combineJournal } from '../utils/accounting';
import { ControlApi, createControlApi, useControlStore } from './controlActions';
import { ReminderApi, createReminderApi, computeRemindersDue } from './reminderActions';
import { NumberGuardApi, useNumberGuard } from './numberGuardActions';
import { chequesBlockingCustomerDelete } from '../utils/cheques';
import {
  DEFAULT_ROLES,
  DEFAULT_VISIBILITY_SETTINGS,
  DEFAULT_SECURITY_POLICY,
  hasPermission,
  isScreenVisibleForRoles,
  isFieldVisibleForRoles,
} from '../lib/auth';
import { mergeUsers, migrateLegacyUsers, toUserRow, isOwnerAccount } from '../lib/password';
import { useAuthStore, AuthApi } from './authStore';
import { formatCurrency, formatDate } from '../utils/formatters';
import { resolveBillPayments, paymentMethodLabel } from '../utils/billing';
import { hasPack, formatPackQty } from '../utils/packUnits';
import { shortStockLines } from '../utils/inventory';
import {
  AppData,
  isAccessDeniedError,
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
import { cloudAdminSetLogin, cloudSessionEmail } from '../lib/cloudAuth';
import { useInventoryStore, InventoryApi, INVENTORY_STORAGE_KEYS } from './inventoryStore';
import { createStockActions, StockActionsApi } from './stockActions';
import { Account, JournalEntry, mergeAccounts, validateEntry, validateAccount, booksLockedFor } from '../utils/accounting';
import {
  initialCustomers,
  initialSuppliers,
  initialProducts,
  initialBookings,
  initialDispatches,
  initialLedgerEntries,
  initialWhatsAppMessages,
} from '../data/initialData';

interface TradingContextType extends InventoryApi, StockActionsApi, ChequeApi, PurchasingApi, FinanceApi, AuthApi, SalesExtrasApi, ControlApi, ReminderApi, NumberGuardApi {
  /** Why this customer can't be deleted right now (cheques still in hand), or null. */
  customerDeleteBlock: (id: string) => string | null;
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
  updateUser: (id: string, data: Partial<Omit<AppUser, 'id' | 'createdAt'>>) => { success: boolean; message: string };
  deleteUser: (id: string) => void;
  can: (permission: Permission) => boolean;
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
  /** Sales return against a bill: goods back to stock, credit note, money back now or off what they owe. */
  returnBillItems: (input: ReturnBillInput) => { success: boolean; message: string; stockReturn?: StockReturn };
  /** Billing-mode quotation (several items); pass id to edit an existing one. */
  saveBillQuotation: (input: { id?: string; customerId: string; items: QuotationLine[]; validUntil: string; notes?: string }) => { success: boolean; message: string; quotation?: Quotation };
  quotations: Quotation[];
  setQuotationStatus: (id: string, status: QuotationStatus) => void;
  deleteQuotation: (id: string) => void;
  returns: StockReturn[];
  deleteReturn: (id: string) => { success: boolean; message: string };
  addCashTransfer: (input: { amount: number; from: 'cash' | 'bank'; date?: string; note?: string }) => { success: boolean; message: string };
  // Bank reconciliation (see bankRecActions.ts)
  bankStatementLines: BankRecApi['bankStatementLines'];
  bankReconciliations: BankRecApi['bankReconciliations'];
  addBankStatementLines: BankRecApi['addBankStatementLines'];
  deleteBankStatementLine: BankRecApi['deleteBankStatementLine'];
  autoMatchBankLines: BankRecApi['autoMatchBankLines'];
  matchBankLine: BankRecApi['matchBankLine'];
  unmatchBankLine: BankRecApi['unmatchBankLine'];
  setBankLineIgnored: BankRecApi['setBankLineIgnored'];
  createEntryFromBankLine: BankRecApi['createEntryFromBankLine'];
  saveBankReconciliation: BankRecApi['saveBankReconciliation'];
  deleteBankReconciliation: BankRecApi['deleteBankReconciliation'];
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
  
  recordCustomerPayment: (customerId: string, amount: number, notes?: string, date?: string) => LedgerEntry | undefined;
  recordSupplierPayment: (supplierId: string, amount: number, notes?: string, date?: string) => LedgerEntry | undefined;
  
  sendWhatsAppReminder: (customerId: string, customText?: string) => WhatsAppMessage;
  sendWhatsAppDirect: (phone: string, text: string) => void;
  
  // Automation trigger
  runAutomatedOverdueCheck: () => number;
  
  // Reset
  resetToSampleData: () => void;
  
  // Latest Alert notification state for UI popups
  recentWhatsAppAlert: WhatsAppMessage | null;
  clearRecentAlert: () => void;

  // Audit & backups (sign-in lives in AuthApi, see ./authStore.ts)
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
  unlockUserAccount: (id: string) => void;
  forceLogoutUser: (id: string) => void;

  // Accounts (double-entry): manual journals and custom accounts on top of the automatic postings
  manualJournals: JournalEntry[];
  customAccounts: Account[];
  addManualJournal: (entry: { date: string; ref?: string; memo: string; lines: JournalEntry['lines'] }) => { success: boolean; message: string; entry?: JournalEntry };
  deleteManualJournal: (id: string) => { success: boolean; message: string };
  addAccount: (acc: { code: string; name: string; type: Account['type']; parent?: string; description?: string }) => { success: boolean; message: string };
  deleteAccount: (code: string) => { success: boolean; message: string };
  /** An expense / cash entry owned by a cheque or a finance record (salary, asset, advance): not deletable on its own. */
  isLinkedRecord: (id: string) => boolean;
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
  /** Set when nothing was deleted on purpose, with the reason to show (e.g. cheques still in hand). */
  blocked?: string;
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
  | { type: 'bill_challan'; invoiceId: string; driver?: string; vehicle?: string }
  | { type: 'daily_sheet'; date: string }
  | { type: 'bank_reconciliation'; statementDate: string; closingBalance: number }
  | { type: 'trial_balance'; asOf: string }
  | { type: 'profit_loss'; from: string; to: string }
  | { type: 'balance_sheet'; asOf: string }
  | { type: 'billing_report'; report: 'aging'; side: 'customers' | 'suppliers'; asOf: string }
  | { type: 'billing_report'; report: 'purchase_register'; from: string; to: string; supplierId?: string; productId?: string }
  | { type: 'billing_report'; report: 'profit'; from: string; to: string }
  | { type: 'billing_report'; report: 'item_history'; productId: string }
  | { type: 'debit_note'; returnId: string }
  | { type: 'cheque_register'; view?: string }
  | SalesExtrasPrintRequest
  | { type: 'purchase_order'; purchaseOrderId: string }
  | { type: 'supplier_bill'; billId: string }
  | { type: 'supplier_claim'; claimId: string }
  | { type: 'reorder_report' }
  | { type: 'asset_register'; asOf: string }
  | { type: 'salary_sheet'; runId: string }
  | { type: 'payslip'; runId: string; staffId: string }
  | { type: 'staff_ledger'; staffId: string }
  | { type: 'cash_flow'; from: string; to: string }
  | { type: 'cheque_print'; chequeId: string };

/** Collision-safe id generator (Date.now() alone repeats when called in a tight loop). */
let idCounter = 0;
export const uid = (prefix: string): string => {
  idCounter = (idCounter + 1) % 100000;
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CreateBillItemInput {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  unit?: string;
  /** Discount on this line only: Rs. off the line, or % off the line. */
  discountType?: 'rs' | 'pct';
  discountValue?: number;
  /** The price is the customer's agreed rate for this item. */
  customerRate?: boolean;
  /** The line was typed in packs at this price per pack (qty and unitPrice are still per base unit). */
  packPrice?: number;
  /** Free goods under a scheme: always price 0; the stock is booked at cost as a scheme expense. */
  free?: boolean;
  schemeId?: string;
  schemeName?: string;
}

/** One part of "Paid now" on a bill (e.g. Rs. 5,000 cash + Rs. 20,000 bank transfer). */
export interface BillPaymentPart {
  method: string;
  amount: number;
}

/** A customer's cheque taken with the bill: goes into the cheque register (in hand), not the bank. */
export interface BillChequeInput {
  amount: number;
  bankName: string;
  chequeNumber: string;
  /** Date written on the cheque (may be in the future). */
  chequeDate: string;
}

export interface ReturnBillInput {
  invoiceId: string;
  lines: ReturnPick[];
  /** 'refund' = money back now (up to what they paid), 'credit' = take it off what they owe. */
  settle: 'refund' | 'credit';
  refundMethod?: string;
  reason?: string;
  date?: string;
}
export interface CreateBillInput {
  customerId: string;
  /** Create this customer on the spot (used when customerId is empty). */
  newCustomer?: { name: string; phone: string };
  items: CreateBillItemInput[];
  discount?: number;
  /** Paid now in one method (older callers). Ignored when `payments` is given. */
  paidNow?: number;
  paymentMethod?: string;
  /** Paid now split across methods (cash / bank / wallet). Cash over the total is change handed back. */
  payments?: BillPaymentPart[];
  /** Part paid by cheque (recorded in the cheque register, linked to this bill). */
  cheque?: BillChequeInput;
  notes?: string;
  date?: string;
  /** Allow this bill to take the customer over their credit limit (needs the override_credit permission). */
  allowOverLimit?: boolean;
  overrideReason?: string;
  /** Godown the stock is taken from (default: the main godown). */
  godownId?: string;
  /** Quotation this bill is made from (marked converted once the bill saves). */
  quotationId?: string | null;
  /** Freight / cartage / loading charged to the customer on top of the goods (Rs., no tax). */
  freightCharges?: number;
  /** Salesman and area on the bill; left out = the customer's defaults, '' / null = none. */
  salesmanId?: string | null;
  areaId?: string | null;
  /** Optional cost / profit centre (branch, area, vehicle) for the P&L by cost centre. */
  costCentreId?: string | null;
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

const initialAuditLogs: AuditLogEntry[] = [
  {
    id: 'log-init-1',
    timestamp: new Date(Date.now() - 3600000 * 4).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    action: 'System Security Armed',
    details: 'Sarmaya initialized with username and password sign-in.',
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


const initialCustomerAgreedRates: CustomerAgreedRate[] = [];

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
  AUDIT_LOGS: 'sarmaya_audit_logs_v1',
  ROLES: 'tradeflow_roles_v2',
  VISIBILITY: 'tradeflow_visibility_v2',
  SECURITY_POLICY: 'tradeflow_security_policy_v1',
  INVOICES: 'tradeflow_invoices_v1',
  AGREED_RATES: 'tradeflow_agreed_rates_v1',
  BANK_LINES: 'tradeflow_bank_statement_lines_v1',
  BANK_RECS: 'tradeflow_bank_reconciliations_v1',
  CHEQUES: 'tradeflow_cheques_v1',
  ...INVENTORY_STORAGE_KEYS,
  JOURNALS: 'tradeflow_journal_entries_v1',
  ACCOUNTS: 'tradeflow_accounts_v1',
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

/** Cloud columns found missing this session, per table (see syncToSupabase). */
const missingCloudColumns: Record<string, Set<string>> = {};

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
  // No built-in demo users: an empty device shows "Create your account" (see authStore.ts).
  const [users, setUsers] = useState<AppUser[]>(() => migrateLegacyUsers(loadLocal<AppUser>(STORAGE_KEYS.USERS, [])));
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
  // Sign-in state. The audit logger is defined further down, so it is reached through a ref.
  const [cloudSettled, setCloudSettled] = useState<boolean>(!isSupabaseConfigured);
  // Every customer and supplier gets an automatic ID (C-0001 / S-0001) — new ones from any screen,
  // and old ones that never had one. Waits for the cloud copy so all devices number the same way.
  useEffect(() => {
    if (!cloudSettled) return;
    setCustomers((prev) => assignMissingCodes(prev, CUSTOMER_CODE_PREFIX));
    setSuppliers((prev) => assignMissingCodes(prev, SUPPLIER_CODE_PREFIX));
  }, [cloudSettled, customers, suppliers]);
  // The cloud copy was read in this session / the cloud refused this device (locked database, no sign-in).
  const [cloudLoaded, setCloudLoaded] = useState<boolean>(false);
  const [cloudNeedsSignIn, setCloudNeedsSignIn] = useState<boolean>(false);
  const cloudLoadedRef = useRef(false);
  const cloudConnectRef = useRef<(opts?: { reload?: boolean }) => Promise<AppUser[] | null>>(async () => null);
  const auditLogRef = useRef<(action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: AuditCategory) => void>(() => {});
  const auth = useAuthStore({
    users,
    setUsers,
    roles,
    securityPolicy,
    settings,
    setSettings,
    cloudSettled,
    cloud: {
      enabled: isSupabaseConfigured,
      loaded: cloudLoaded,
      needsSignIn: cloudNeedsSignIn,
      connect: (opts) => cloudConnectRef.current(opts),
    },
    log: (...args) => auditLogRef.current(...args),
  });
  const currentUser = auth.currentUser;
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => loadLocal(STORAGE_KEYS.LEDGER, initialLedgerEntries, normalizeLedger));
  const [whatsappMessages, setWhatsappMessages] = useState<WhatsAppMessage[]>(() =>
    loadLocal(STORAGE_KEYS.MESSAGES, initialWhatsAppMessages)
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    loadLocal(STORAGE_KEYS.INVOICES, [])
  );
  const [manualJournals, setManualJournals] = useState<JournalEntry[]>(() => loadLocal(STORAGE_KEYS.JOURNALS, []));
  const [customAccounts, setCustomAccounts] = useState<Account[]>(() => loadLocal(STORAGE_KEYS.ACCOUNTS, []));
  // Mirror of invoices that updates synchronously, so two bills saved in one tick never share a number.
  const invoicesRef = useRef<Invoice[]>([]);
  useEffect(() => {
    invoicesRef.current = invoices;
  }, [invoices]);
  const [customerAgreedRates, setCustomerAgreedRates] = useState<CustomerAgreedRate[]>(() =>
    loadLocal(STORAGE_KEYS.AGREED_RATES, initialCustomerAgreedRates)
  );

  const [bankStatementLines, setBankStatementLines] = useState<BankStatementLine[]>(() => loadLocal(STORAGE_KEYS.BANK_LINES, []));
  const [bankReconciliations, setBankReconciliations] = useState<BankReconciliation[]>(() => loadLocal(STORAGE_KEYS.BANK_RECS, []));
  const [cheques, setCheques] = useState<Cheque[]>(() => loadLocal(STORAGE_KEYS.CHEQUES, []));

  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');
  // A different person signing in starts on the home screen (not on whatever the last user had open).
  const lastSignedInId = useRef<string | null>(currentUser?.id ?? null);
  useEffect(() => {
    if (!currentUser) return;
    if (lastSignedInId.current && lastSignedInId.current !== currentUser.id) setActiveScreen('dashboard');
    lastSignedInId.current = currentUser.id;
  }, [currentUser?.id]);
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

  /** Put a freshly read cloud copy into the app and turn cloud sync on. */
  const applyCloudData = (data: AppData) => {
    setCustomers(data.customers);
    setSuppliers(data.suppliers);
    setProducts(data.products);
    setBookings(data.bookings);
    setDispatches(data.dispatches);
    setPurchases(data.purchases);
    setPriceHistory(data.priceHistory);
    setExpenses(data.expenses);
    setTrucks(data.trucks);
    // Same id -> the newer copy wins; users only on this device are kept and uploaded.
    setUsers((prev) => migrateLegacyUsers(mergeUsers(prev, data.users || [])));
    setCashEntries(data.cashEntries);
    setQuotations(data.quotations);
    setPurchaseOrders(data.purchaseOrders);
    setReturns(data.returns);
    setAdjustments(data.adjustments);
    setTasks(data.tasks);
    if (data.settings) {
      const mergedSettings = { ...DEFAULT_SETTINGS, ...data.settings, id: 'default' as const };
      setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...mergedSettings, id: 'default' }));
    }
    setLedger(data.ledger);
    setWhatsappMessages(data.whatsappMessages);
    // Bills: only when the cloud table exists (migration v8); otherwise keep local copies.
    // A table that exists but is still empty (migration just run, nothing uploaded yet) must not
    // wipe what this device already has; the sync effects then upload the local rows.
    const cloudOrLocal = <T,>(cloud: T[]) => (prev: T[]) => (cloud.length > 0 || prev.length === 0 ? cloud : prev);
    if (data.invoices) setInvoices(data.invoices);
    // Bank reconciliation: only when the cloud tables exist (migration v12).
    if (data.bankStatementLines) setBankStatementLines(cloudOrLocal(data.bankStatementLines));
    if (data.bankReconciliations) setBankReconciliations(cloudOrLocal(data.bankReconciliations));
    // Cheque register: only when the cloud table exists (migration v14).
    if (data.cheques) setCheques(cloudOrLocal(data.cheques));
    // Salesmen / areas / schemes: only when the cloud tables exist (migration v19).
    salesExtras.hydrate({ salesmen: data.salesmen ?? undefined, areas: data.areas ?? undefined, schemes: data.schemes ?? undefined }, { keepLocalIfEmpty: true });
    // Godowns / batches / transfers: only when the cloud tables exist (migration v11).
    inventory.hydrate({ godowns: data.godowns, stockBatches: data.stockBatches, stockTransfers: data.stockTransfers }, { keepLocalIfEmpty: true });
    // Supplier bills and claims: only when the cloud tables exist (migration v20).
    purchasing.hydrate({ supplierBills: data.supplierBills, supplierClaims: data.supplierClaims }, { keepLocalIfEmpty: true });
    // Accounts: only when the cloud tables exist (migration v10); otherwise keep local copies.
    if (data.journalEntries) setManualJournals(cloudOrLocal(data.journalEntries));
    if (data.accounts) setCustomAccounts(cloudOrLocal(data.accounts));
    // Customer rates: only when the cloud table exists (migration v13).
    if (data.customerAgreedRates) setCustomerAgreedRates(cloudOrLocal(data.customerAgreedRates));
    // Finance (assets, staff, budgets, cost centres, year closes): only tables that exist (migration v21).
    finance.hydrate(data.finance || {}, { keepLocalIfEmpty: true });
    // Approvals, deleted records, branches: only when the cloud tables exist (migration v22).
    controlStore.hydrate({ approvals: data.approvals, deletedRecords: data.deletedRecords, branches: data.branches });
    cloudLoadedRef.current = true;
    setCloudLoaded(true);
    setCloudNeedsSignIn(false);
    setIsCloudSyncReady(true);
    setCloudSettled(true);
  };
  const applyCloudDataRef = useRef(applyCloudData);
  applyCloudDataRef.current = applyCloudData;

  /**
   * Read the cloud. A locked database (supabase/lock.sql) without a staff sign-in answers "permission denied";
   * a signed-in person who is not (or no longer) active staff sees no rows at all, not even their own user.
   * Either way nothing local is touched: the app keeps working on this device and asks for the password.
   */
  const readCloud = async (): Promise<AppData | 'denied'> => {
    const signedIn = Boolean(await cloudSessionEmail());
    try {
      const data = await loadAllData();
      if (signedIn && (data.users || []).length === 0) return 'denied';
      return data;
    } catch (err: any) {
      if (err?.name === 'CloudAccessDeniedError' || isAccessDeniedError(err)) return 'denied';
      throw err;
    }
  };

  // After a Supabase sign-in (authStore): read the cloud if this session has not yet (or on request) and
  // turn sync on. When the cloud was read earlier, sync simply resumes and pushes this device's changes.
  cloudConnectRef.current = async (opts) => {
    if (!isSupabaseConfigured) return null;
    if (cloudLoadedRef.current && !opts?.reload) {
      setCloudNeedsSignIn(false);
      setIsCloudSyncReady(true);
      return null;
    }
    try {
      const data = await readCloud();
      if (data === 'denied') {
        setCloudNeedsSignIn(true);
        return null;
      }
      applyCloudDataRef.current(data);
      return data.users || [];
    } catch (err: any) {
      console.warn('Supabase load failed:', err?.message || err);
      return null;
    }
  };

  // Load live data from Supabase on mount (falls back to localStorage/empty if no tables or network error)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    readCloud()
      .then((data) => {
        if (cancelled) return;
        if (data === 'denied') {
          console.warn('Supabase: the database is locked; sign in to sync. Working on this device meanwhile.');
          setCloudNeedsSignIn(true);
          setCloudSettled(true);
          return;
        }
        applyCloudDataRef.current(data);
      })
      .catch((err) => {
        console.warn('Supabase load failed; running in local-only mode:', err?.message || err);
        setCloudSettled(true);
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
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.JOURNALS, JSON.stringify(manualJournals)); }, [manualJournals]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(customAccounts)); }, [customAccounts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AGREED_RATES, JSON.stringify(customerAgreedRates));
  }, [customerAgreedRates]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.BANK_LINES, JSON.stringify(bankStatementLines)); }, [bankStatementLines]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.BANK_RECS, JSON.stringify(bankReconciliations)); }, [bankReconciliations]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.CHEQUES, JSON.stringify(cheques)); }, [cheques]);

  const syncToSupabase = async (table: string, rows: unknown[]) => {
    if (!isCloudSyncReady || rows.length === 0) return;
    try {
      // PostgREST bulk upserts need every row to carry the same keys; fill gaps with null.
      const skip = missingCloudColumns[table] || (missingCloudColumns[table] = new Set());
      // A column the cloud table doesn't have yet (setup.sql not re-run) is left out and the rest
      // still syncs, instead of the whole table failing. It is kept on this device as normal.
      for (let attempt = 0; attempt < 6; attempt++) {
        const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r as object)))).filter((k) => !skip.has(k));
        const uniform = rows.map((r) => Object.fromEntries(keys.map((k) => [k, (r as any)[k] ?? null])));
        const { error } = await supabase.from(table).upsert(uniform as any[], { onConflict: 'id' });
        if (!error) return;
        if (isAccessDeniedError(error)) {
          // The database was locked (or the sign-in ran out): pause sync until the person signs in again.
          // Nothing is lost: this device keeps its changes and pushes them once sync resumes.
          console.warn(`Supabase ${table}: not allowed without signing in; sync paused.`);
          setIsCloudSyncReady(false);
          setCloudNeedsSignIn(true);
          return;
        }
        const missing = /Could not find the '([^']+)' column/.exec(error.message || '')?.[1];
        if (!missing || skip.has(missing)) { console.warn(`Supabase ${table} upsert error:`, error.message); return; }
        skip.add(missing);
        console.warn(`Supabase ${table}: column "${missing}" is missing in the cloud — run supabase/setup.sql. Syncing the rest.`);
      }
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
  // Only the table's columns are sent. Password hashes stay on this device (Supabase Auth holds the real password).
  useEffect(() => { void syncToSupabase('users', users.map(toUserRow)); }, [users, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('cash_entries', cashEntries); }, [cashEntries, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('settings', [settings]); }, [settings, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('quotations', quotations); }, [quotations, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('purchase_orders', purchaseOrders); }, [purchaseOrders, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('returns', returns); }, [returns, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('stock_adjustments', adjustments); }, [adjustments, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('tasks', tasks); }, [tasks, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('ledger', ledger); }, [ledger, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('whatsapp_messages', whatsappMessages); }, [whatsappMessages, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('bank_statement_lines', bankStatementLines); }, [bankStatementLines, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('bank_reconciliations', bankReconciliations); }, [bankReconciliations, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('cheques', cheques); }, [cheques, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('journal_entries', manualJournals); }, [manualJournals, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('accounts', customAccounts); }, [customAccounts, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('customer_agreed_rates', customerAgreedRates); }, [customerAgreedRates, isCloudSyncReady]);

  /** Remote delete helper; only touches Supabase when cloud sync is live. */
  const removeRemote = (table: TableName, ids: string[]) => {
    if (!isCloudSyncReady) return;
    void deleteRows(table, ids);
  };

  // Approvals, deleted records bin, document numbers, branches, auto-backups (see controlActions.ts).
  const controlStore = useControlStore({ settings, setSettings, users, currentUserId: currentUser?.id, isCloudSyncReady, syncToSupabase });

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
    // Everything else is cleared too, so nothing from the old data leaks into the sample (old journals
    // in the trial balance, old batches on sample items, bank lines pointing at deleted records).
    setInvoices([]);
    setQuotations([]);
    setPurchaseOrders([]);
    setReturns([]);
    setAdjustments([]);
    setTasks([]);
    setBankStatementLines([]);
    setBankReconciliations([]);
    setCheques([]);
    setManualJournals([]);
    setCustomAccounts([]);
    inventory.reset();
    salesExtras.reset();
    purchasing.reset();
    finance.reset();
    controlStore.reset();
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
    poLineId = null,
    owedBefore,
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
    /** Line of a multi-line purchase order this receipt is against. */
    poLineId?: string | null;
    /** What the supplier was owed before this receipt, when several receipts are saved at once
     *  (the supplier list in this render does not include the earlier ones yet). */
    owedBefore?: number;
  }): Purchase => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    const product = products.find((p) => p.id === productId);
    if (!supplier || !product) throw new Error('Supplier or product not found');

    const onDate = date || todayISO();
    const amount = round2(kg * pricePerKg);
    const receiptNumber = `GRN-${new Date().getFullYear()}-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.floor(10 + Math.random() * 90)}`;
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
      ...(poLineId ? { poLineId } : {}),
    };

    if (purchaseOrderId) {
      // Multi-line orders track the received quantity per line (see utils/purchasing.ts).
      setPurchaseOrders((prev) => prev.map((po) => (po.id === purchaseOrderId ? receiveOnPo(po, productId, kg, poLineId) : po)));
    }

    // 1. Stock in
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, stockKg: round2(p.stockKg + kg) } : p)));

    // 2. Supplier payable
    const base = owedBefore ?? supplier.totalOwed;
    if (!paymentMadeImmediately) {
      // Add to the latest balance so several receipts saved together all count.
      setSuppliers((prev) => prev.map((s) => (s.id === supplierId ? { ...s, totalOwed: round2(s.totalOwed + amount) } : s)));
    }

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
        balanceAfter: round2(base + amount),
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
        balanceAfter: base,
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
    // A receipt on a supplier bill stays (delete the bill first, or the price difference would be wrong).
    if (purchasing.api.isBilledReceipt(id)) return summary;
    if (target.purchaseOrderId) setPurchaseOrders((prev) => prev.map((po) => (po.id === target.purchaseOrderId ? unreceiveOnPo(po, target.productId, target.kg, target.poLineId) : po)));
    const refs = new Set([target.receiptNumber, `PAY-${target.receiptNumber}`]);
    const ledgerIds = ledger.filter((l) => refs.has(l.referenceId)).map((l) => l.id);

    setProducts((prev) => prev.map((p) => (p.id === target.productId ? { ...p, stockKg: Math.max(0, round2(p.stockKg - target.kg)) } : p)));
    inventory.removePurchaseRows(id);
    if (!target.paymentMadeImmediately) {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === target.supplierId ? { ...s, totalOwed: round2(s.totalOwed - target.amount) } : s))
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
        dueDelta.has(c.id) ? { ...c, totalDue: round2(c.totalDue - (dueDelta.get(c.id) || 0)) } : c
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

  /** Cheques from this customer that are still in hand or at the bank: settle or cancel them before deleting. */
  const customerDeleteBlock = (id: string): string | null => {
    const c = customers.find((x) => x.id === id);
    const open = chequesBlockingCustomerDelete(cheques, id);
    if (!c || open.length === 0) return null;
    const list = open.slice(0, 3).map((q) => `${q.chequeNumber} (${q.bankName}, ${formatCurrency(q.amount)})`).join(', ');
    return `${c.name} has ${open.length} cheque${open.length === 1 ? '' : 's'} not yet settled: ${list}${open.length > 3 ? '…' : ''}. Clear, bounce or cancel ${open.length === 1 ? 'it' : 'them'} first in Money → Cheques, then delete the customer.`;
  };

  const deleteCustomer = (id: string): DeleteSummary => {
    const target = customers.find((c) => c.id === id);
    if (!target) return emptySummary();
    const chequeBlock = customerDeleteBlock(id);
    if (chequeBlock) {
      logAuditEvent('Customer Delete Blocked', chequeBlock, 'warning');
      return { ...emptySummary(), blocked: chequeBlock };
    }

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

    const custReturnIds = returns.filter((r) => r.kind === 'sales' && r.customerId === id).map((r) => r.id);
    setReturns((prev) => prev.filter((r) => !custReturnIds.includes(r.id)));
    removeRemote('returns', custReturnIds);
    const custRateIds = customerAgreedRates.filter((r) => r.customerId === id).map((r) => r.id);
    setCustomerAgreedRates((prev) => prev.filter((r) => r.customerId !== id));
    removeRemote('customer_agreed_rates', custRateIds);
    const custInvoiceIds = invoices.filter((i) => i.customerId === id).map((i) => i.id);
    setInvoices((prev) => prev.filter((i) => i.customerId !== id));
    removeRemote('invoices', custInvoiceIds);
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
    purchasing.removeForSupplier(id);
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
      bank_statement_lines: () => setBankStatementLines([]),
      bank_reconciliations: () => setBankReconciliations([]),
      ...inventory.purgeSetters,
      ...purchasing.purgeSetters,
      journal_entries: () => setManualJournals([]),
      accounts: () => setCustomAccounts([]),
      customer_agreed_rates: () => setCustomerAgreedRates([]),
      cheques: () => setCheques([]),
      ...salesExtras.purgeSetters,
      ...finance.purgeSetters,
      approvals: () => controlStore.setApprovals([]),
      deleted_records: () => controlStore.setDeletedRecords([]),
      branches: () => controlStore.setBranches([]),
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

  const recordCustomerPayment = (customerId: string, amount: number, notes?: string, date?: string): LedgerEntry | undefined => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return undefined;

    const today = date || new Date().toISOString().split('T')[0];
    // A payment bigger than what is owed is an advance: the balance goes negative, it is not lost.
    const newTotalDue = Number((customer.totalDue - amount).toFixed(2));
    const quiet = (settings.appMode || 'billing') === 'billing';

    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, totalDue: newTotalDue } : c))
    );

    const payRef = controlStore.nextDocNumber('receipt', today, ledger.filter((l) => l.type === 'payment_received').map((l) => l.referenceId));
    const newLedger: LedgerEntry = {
      id: uid('led'),
      entityType: 'customer',
      entityId: customerId,
      type: 'payment_received',
      referenceId: payRef,
      date: today,
      description: notes ? `Payment received: ${notes}` : `Payment received (${payRef})`,
      method: notes ? notes.split(' - ')[0].trim() : undefined,
      debit: 0,
      credit: amount,
      balanceAfter: newTotalDue,
      ...controlStore.branchStamp(),
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

    if (!quiet) {
      setWhatsappMessages((prev) => [waMsg, ...prev]);
      setRecentWhatsAppAlert(waMsg);
    }
    return newLedger;
  };

  const recordSupplierPayment = (supplierId: string, amount: number, notes?: string, date?: string): LedgerEntry | undefined => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) return undefined;

    const today = date || new Date().toISOString().split('T')[0];
    const newTotalOwed = Number((supplier.totalOwed - amount).toFixed(2));

    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplierId ? { ...s, totalOwed: newTotalOwed } : s))
    );

    const payRef = controlStore.nextDocNumber('supplier_payment', today, ledger.filter((l) => l.type === 'payment_made').map((l) => l.referenceId));
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
      ...controlStore.branchStamp(),
    };

    setLedger((prev) => [newLedger, ...prev]);
    return newLedger;
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
  auditLogRef.current = logAuditEvent;

  const clearAuditLogs = () => {
    setAuditLogs([]);
    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
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
  const updateUser = (
    id: string,
    data: Partial<Omit<AppUser, 'id' | 'createdAt'>> & { newPassword?: string }
  ): { success: boolean; message: string } => {
    const existing = users.find((u) => u.id === id);
    if (!existing) return { success: false, message: 'User not found.' };

    // Passwords are only ever set through changePassword / resetUserPassword (hashed there).
    const { newPassword: _ignored, pin: _pin, pinHash: _pinHash, passwordHash: _hash, passwordSalt: _salt, passwordIter: _iter, ...rest } = data as any;
    const updatePayload: Partial<AppUser> = { ...rest, updatedAt: new Date().toISOString() };
    if (rest.username !== undefined) {
      const uname = String(rest.username).trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(uname)) return { success: false, message: 'Username must be 2 to 32 letters, numbers, dot, dash or underscore (no spaces).' };
      if (users.some((u) => u.id !== id && (u.username || '').trim().toLowerCase() === uname)) return { success: false, message: `The username "${uname}" is already taken.` };
      updatePayload.username = uname;
    }
    const ownersLeft = users.filter((u) => u.id !== id && isOwnerAccount(u) && u.active !== false).length;
    const staysOwner = isOwnerAccount({ role: (updatePayload.role || existing.role) as UserRole, roles: updatePayload.roles || existing.roles }) && updatePayload.active !== false;
    if (isOwnerAccount(existing) && !staysOwner && ownersLeft === 0) {
      return { success: false, message: 'This is the only owner (super admin) account. Make someone else owner first.' };
    }

    if (data.roles && data.roles.length > 0) {
      updatePayload.roles = data.roles;
      updatePayload.role = (data.roles[0] as UserRole) || existing.role;
      logAuditEvent('Role Assigned', `Updated roles for "${existing.name}" to [${data.roles.join(', ')}].`, 'warning', 'roles');
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updatePayload } : u))
    );

    // The Supabase sign-in follows a username change (owner/admin only; checked by the server).
    if (isSupabaseConfigured && updatePayload.username && updatePayload.username !== (existing.username || '').trim().toLowerCase()) {
      const newName = updatePayload.username;
      void cloudAdminSetLogin(id, newName, null).then((res) => {
        if (!res.ok && res.status !== 'not_installed') {
          logAuditEvent('Sign-in Not Renamed', `@${newName} (${existing.name}): the cloud sign-in still uses the old username (${res.message}). Set a temporary password for them to fix it.`, 'warning', 'users');
        }
      });
    }

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
    const otherOwners = users.filter((u) => u.id !== id && isOwnerAccount(u) && u.active !== false).length;
    if (existing.id === currentUser?.id || (isOwnerAccount(existing) && otherOwners === 0)) {
      logAuditEvent('Action Denied', `Deleting ${existing.name} was blocked (your own account or the only owner).`, 'danger', 'system');
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
          ? { ...u, status: 'active', failedAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() }
          : u
      )
    );
    logAuditEvent('Account Unlocked', `Administrator lifted lockout on user account ID ${id}.`, 'info', 'auth');

    apiFetch(`/api/users/${id}/unlock`, { method: 'POST' }).catch(() => {});
  };

  const forceLogoutUser = (id: string) => {
    if (currentUser?.id === id) {
      auth.logout();
    }
    logAuditEvent('Force Logout', `Session terminated for user ID ${id}.`, 'warning', 'auth');
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
        prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
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
    removeRemote('customer_agreed_rates', [id]);
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

  /** Legacy name; same full reversal as deleteBill. */
  const deleteInvoice = (id: string) => {
    const r = deleteBill(id);
    return r;
  };

  /** Legacy signature kept for older callers; delegates to payBill. */
  const recordInvoicePayment = (
    invoiceId: string,
    amount: number,
    paymentMethod: 'bank_transfer' | 'cash' | 'cheque' | 'online' = 'bank_transfer',
    notes?: string
  ): { success: boolean; message: string } => {
    const label = paymentMethod === 'cash' ? 'Cash' : paymentMethod === 'cheque' ? 'Cheque' : paymentMethod === 'online' ? 'Easypaisa / JazzCash' : 'Bank Transfer';
    return payBill(invoiceId, amount, label, notes);
  };

  // ---------------------------------------------------------------------------
  // Simple billing: bills, payments, cash/bank transfers
  // ---------------------------------------------------------------------------
  const createBill = (input: CreateBillInput): { success: boolean; message: string; invoice?: Invoice } => {
    // Free (scheme) lines are always at price 0 with no discount.
    const items = (input.items || []).filter((it) => it.productId && it.qty > 0).map((it) => (it.free ? { ...it, unitPrice: 0, discountType: undefined, discountValue: undefined, customerRate: undefined, packPrice: undefined } : it));
    if (items.length === 0) return { success: false, message: 'Add at least one item with a quantity.' };
    if (items.every((it) => it.free)) return { success: false, message: 'A bill needs at least one item that is sold (not only free goods).' };
    const freight = round2(Number(input.freightCharges) || 0);
    if (freight < 0) return { success: false, message: 'Freight cannot be negative.' };
    if (items.some((it) => !(it.unitPrice >= 0))) return { success: false, message: 'A price cannot be negative.' };
    // Where the stock comes from (godown, batches first-expiry-first-out). Plain items are unchanged.
    // Expiry is judged against today (not the bill date), so a back-dated bill can't sell an expired batch.
    const stockPlan = inventory.planBill(items, input.godownId, todayISO());
    if (!stockPlan.ok) return { success: false, message: stockPlan.message || 'Not enough stock.' };
    // Stock short: allowed with a warning (as before) unless the shop turned it off in Settings.
    if (settings.allowNegativeStock === false) {
      const short = shortStockLines(items, products);
      if (short.length) return { success: false, message: `${short.map((s) => `${s.name}: only ${formatPackQty(s.have, s.product)} in stock (bill needs ${formatPackQty(s.need, s.product)})`).join('; ')}. Receive the stock first, or turn on "Allow bills when stock is short" in Settings.` };
    }
    let customer = customers.find((c) => c.id === input.customerId);
    // An inline new customer is only created once every check below has passed, so a refused
    // bill never leaves an orphan customer behind.
    let pendingNewCustomer: { name: string; phone: string } | null = null;
    if (!customer && input.newCustomer?.name.trim()) {
      const name = input.newCustomer.name.trim();
      const phone = input.newCustomer.phone.trim();
      // Reuse an existing customer with the same name (or phone) instead of creating a twin.
      customer = customers.find((c) => c.name.trim().toLowerCase() === name.toLowerCase() || (phone && c.phone.replace(/\D/g, '') === phone.replace(/\D/g, '')));
      if (!customer) {
        pendingNewCustomer = { name, phone };
        customer = { id: '', name, company: name, phone, email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: todayISO() };
      }
    }
    if (!customer) return { success: false, message: 'Pick a customer first.' };
    const date = input.date || todayISO();
    if (date > todayISO()) return { success: false, message: 'The bill date cannot be in the future.' };
    const closedBill = booksLockedFor(settings, date);
    if (closedBill) return { success: false, message: closedBill };
    // Line discounts come off each line first; subtotal is the sum of the lines after their own discounts.
    const lineDisc = items.map((it) => lineDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountValue));
    const subtotal = round2(items.reduce((a, it, i) => a + round2(it.qty * it.unitPrice) - lineDisc[i], 0));
    const discount = round2(Math.min(Math.max(0, input.discount || 0), subtotal));
    const taxRatePct = settings.taxRatePct ?? 0;
    const taxAmount = round2(((subtotal - discount) * taxRatePct) / 100);
    const totalAmount = round2(subtotal - discount + taxAmount + freight);
    if (totalAmount <= 0) return { success: false, message: 'The bill total must be more than zero.' };
    // Salesman / area: as picked on the bill, else the customer's defaults.
    const salesmanId = input.salesmanId !== undefined ? input.salesmanId || null : customer.salesmanId || null;
    const areaId = input.areaId !== undefined ? input.areaId || null : customer.areaId || null;
    if (salesmanId && !salesExtras.api.salesmen.some((s) => s.id === salesmanId)) return { success: false, message: 'The salesman on this bill was not found.' };
    if (areaId && !salesExtras.api.areas.some((a) => a.id === areaId)) return { success: false, message: 'The area on this bill was not found.' };
    // Paid now: one method (older callers) or split across cash / bank / wallet, plus a cheque.
    const partsIn: BillPaymentPart[] = input.payments ? input.payments : (input.paidNow || 0) > 0 ? [{ method: input.paymentMethod || 'Cash', amount: input.paidNow || 0 }] : [];
    const chequeIn = input.cheque && Number(input.cheque.amount) > 0 ? input.cheque : null;
    const pay = resolveBillPayments(totalAmount, partsIn, chequeIn?.amount || 0);
    if (pay.error) return { success: false, message: pay.error };
    if (chequeIn) {
      if (!can('finance:record_payment')) return { success: false, message: "You don't have permission to record cheques. Ask a manager or admin." };
      if (!String(chequeIn.chequeNumber || '').trim()) return { success: false, message: 'Enter the cheque number.' };
      if (!String(chequeIn.bankName || '').trim()) return { success: false, message: 'Enter the bank name of the cheque.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(chequeIn.chequeDate || '')) return { success: false, message: 'Enter the date written on the cheque.' };
      const dup = cheques.find((c) => c.direction === 'received' && c.status !== 'cancelled' && c.chequeNumber.trim().toLowerCase() === chequeIn.chequeNumber.trim().toLowerCase() && c.bankName.trim().toLowerCase() === chequeIn.bankName.trim().toLowerCase());
      if (dup) return { success: false, message: `Cheque ${dup.chequeNumber} of ${dup.bankName} is already in the register (${dup.partyName}).` };
    }
    const paidAmount = pay.paid;
    const balanceDue = round2(totalAmount - paidAmount);
    const method = paymentMethodLabel(pay.parts, pay.cheque, input.paymentMethod || 'Cash');
    // Credit limit: the unpaid part of this bill must fit under the customer's limit (0 = no limit).
    const credit = creditCheck(customer, balanceDue);
    let creditOverride: Invoice['creditOverride'];
    if (credit.over) {
      const msg = `${customer.name} would owe ${formatCurrency(credit.after)}, which is over their credit limit of ${formatCurrency(credit.limit)} (only ${formatCurrency(credit.available)} left).`;
      if (!input.allowOverLimit) return { success: false, message: `${msg} Take more payment now, or ask a manager to allow it.` };
      if (!can('override_credit')) return { success: false, message: `${msg} Only a manager or admin can allow a bill over the limit.` };
      const reason = (input.overrideReason || '').trim();
      if (!reason) return { success: false, message: 'Write a short reason for allowing this bill over the credit limit.' };
      creditOverride = { by: currentUser?.name || 'Unknown', reason, at: new Date().toISOString(), limit: credit.limit, dueAfter: credit.after };
    }
    if (pendingNewCustomer) customer = addCustomer({ name: pendingNewCustomer.name, company: pendingNewCustomer.name, phone: pendingNewCustomer.phone, email: '', address: '', creditLimit: 0 });
    const invoiceNumber = controlStore.nextDocNumber('bill', date, invoicesRef.current.map((i) => i.invoiceNumber));
    const invoiceItems: InvoiceItem[] = items.map((it, idx) => {
      const product = products.find((p) => p.id === it.productId);
      // Unit cost at the time of sale: the batches actually used (when they carry a cost), else the
      // purchase cost up to the bill date, else the item's cost price. Kept on the line for the ledger.
      const allocs = (stockPlan.lines[idx] as { batches?: { batchId: string; qty: number }[] })?.batches || [];
      const batchCosted = allocs.length > 0 && allocs.every((a) => (inventory.api.stockBatches.find((b) => b.id === a.batchId)?.costPrice || 0) > 0);
      const unitCost = batchCosted
        ? round2(allocs.reduce((a, x) => a + x.qty * (inventory.api.stockBatches.find((b) => b.id === x.batchId)!.costPrice || 0), 0) / allocs.reduce((a, x) => a + x.qty, 0))
        : costPerKgOn(purchases, it.productId, date) ?? (product?.costPricePerKg && product.costPricePerKg > 0 ? product.costPricePerKg : undefined);
      return {
        ...stockPlan.lines[idx],
        id: uid('bi'),
        productId: it.productId,
        productName: it.name || product?.name || 'Item',
        kg: it.qty,
        ratePerKg: round2(it.unitPrice),
        costPricePerKg: unitCost,
        amount: round2(round2(it.qty * it.unitPrice) - lineDisc[idx]),
        qty: it.qty,
        unitPrice: round2(it.unitPrice),
        unit: it.unit || product?.unit || 'pcs',
        ...(lineDisc[idx] > 0 ? { discountType: it.discountType === 'pct' ? 'pct' as const : 'rs' as const, discountValue: round2(Number(it.discountValue) || 0), discountAmount: lineDisc[idx] } : {}),
        ...(it.customerRate ? { customerRate: true } : {}),
        // Pack unit at the time of sale, so the bill can print "2 cartons + 3 tins".
        ...(hasPack(product) ? { packName: product!.packName, packSize: product!.packSize } : {}),
        ...(hasPack(product) && it.packPrice != null && it.packPrice >= 0 ? { packPrice: round2(it.packPrice) } : {}),
        ...(it.free ? { free: true, ...(it.schemeId ? { schemeId: it.schemeId } : {}), ...(it.schemeName ? { schemeName: it.schemeName } : {}) } : {}),
      };
    });
    const fromQuote = input.quotationId ? quotations.find((q) => q.id === input.quotationId) : undefined;
    const chequeId = chequeIn ? uid('chq') : '';
    const chequeLedgerId = chequeIn ? uid('led') : '';
    const chequeNo = chequeIn ? chequeIn.chequeNumber.trim() : '';
    const chequeBank = chequeIn ? chequeIn.bankName.trim() : '';
    const postDated = chequeIn && chequeIn.chequeDate > date ? `, dated ${formatDate(chequeIn.chequeDate)}` : '';
    const partLedgerIds = pay.parts.map(() => uid('led'));
    const payments: InvoicePaymentRecord[] = pay.parts.map((p) => ({ id: uid('pay'), date, amount: p.amount, method: invoiceMethod(p.method), notes: p.method, recordedBy: currentUser?.name }));
    if (chequeIn) payments.push({ id: `pay-${chequeId}`, date, amount: pay.cheque, method: 'cheque', referenceNumber: chequeNo, notes: `Cheque ${chequeNo} (${chequeBank})${postDated} - in hand`, recordedBy: currentUser?.name });
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
      ...(freight > 0 ? { freightCharges: freight } : {}),
      totalAmount,
      paidAmount,
      balanceDue,
      payments,
      notes: input.notes?.trim() || undefined,
      paymentMethod: method,
      billKind: balanceDue === 0 ? 'cash' : 'credit',
      issuedAt: date === todayISO() ? new Date().toISOString() : undefined,
      createdAt: todayISO(),
      createdBy: currentUser?.name,
      ...(creditOverride ? { creditOverride } : {}),
      ...(fromQuote ? { quotationId: fromQuote.id } : {}),
      ...(salesmanId ? { salesmanId } : {}),
      ...(areaId ? { areaId } : {}),
      ...(input.costCentreId ? { costCentreId: input.costCentreId } : {}),
      ...controlStore.branchStamp(),
      deviceId: numberGuard.deviceId,
    };
    invoicesRef.current = [invoice, ...invoicesRef.current];
    if (fromQuote) setQuotations((prev) => prev.map((q) => (q.id === fromQuote.id ? { ...q, status: 'converted', invoiceId: invoice.id } : q)));
    setInvoices((prev) => [invoice, ...prev]);

    // Stock comes off in the product's own unit.
    setProducts((prev) =>
      prev.map((p) => {
        const sold = items.filter((it) => it.productId === p.id).reduce((a, it) => a + it.qty, 0);
        return sold > 0 ? { ...p, stockKg: round2(p.stockKg - sold) } : p;
      })
    );
    inventory.applyBill(stockPlan);

    // Customer account: bill goes on, cash paid now comes off.
    const dueAfterBill = round2((customer.totalDue || 0) + totalAmount);
    const dueAfterPayment = round2(dueAfterBill - paidAmount);
    setCustomers((prev) => prev.map((c) => (c.id === customer!.id ? { ...c, totalDue: round2((c.totalDue || 0) + totalAmount - paidAmount) } : c)));
    const entries: LedgerEntry[] = [
      {
        id: uid('led'),
        entityType: 'customer',
        entityId: customer.id,
        type: 'bill_issued',
        referenceId: invoiceNumber,
        sourceId: invoice.id,
        date,
        description: `Bill ${invoiceNumber}: ${invoiceItems.map((it) => `${it.productName} × ${it.qty}${it.free ? ' (free)' : ''}`).join(', ')}${freight > 0 ? `, freight ${formatCurrency(freight)}` : ''}`,
        debit: totalAmount,
        credit: 0,
        balanceAfter: dueAfterBill,
      },
    ];
    // One ledger row per method, so cash goes to the drawer and bank money to the bank.
    let running = dueAfterBill;
    pay.parts.forEach((p, i) => {
      running = round2(running - p.amount);
      entries.push({
        id: partLedgerIds[i],
        entityType: 'customer',
        entityId: customer!.id,
        type: 'payment_received',
        referenceId: invoiceNumber,
        sourceId: invoice.id,
        method: p.method,
        date,
        description: `Payment received: ${p.method} - Bill ${invoiceNumber}`,
        debit: 0,
        credit: p.amount,
        balanceAfter: running,
      });
    });
    if (chequeIn) {
      // The cheque is not money yet: it sits in "Cheques in hand" until the bank clears it (Money → Cheques).
      running = round2(running - pay.cheque);
      entries.push({
        id: chequeLedgerId,
        entityType: 'customer',
        entityId: customer.id,
        type: 'cheque_received',
        referenceId: `CHQ-${chequeNo}`,
        sourceId: chequeId,
        method: 'Cheque',
        date,
        description: `Cheque received: ${chequeBank} #${chequeNo}${postDated} - Bill ${invoiceNumber}`,
        debit: 0,
        credit: pay.cheque,
        balanceAfter: running,
      });
      const cheque: Cheque = {
        id: chequeId,
        direction: 'received',
        customerId: customer.id,
        supplierId: null,
        partyName: customer.name,
        bankName: chequeBank,
        chequeNumber: chequeNo,
        amount: pay.cheque,
        chequeDate: chequeIn.chequeDate,
        entryDate: date,
        invoiceId: invoice.id,
        status: 'in_hand',
        ledgerId: chequeLedgerId,
        createdAt: todayISO(),
        createdBy: currentUser?.name,
      };
      setCheques((prev) => [cheque, ...prev]);
      logAuditEvent('Cheque Received', `Cheque ${chequeNo} (${chequeBank}) from ${customer.name}: ${formatCurrency(pay.cheque)}, dated ${formatDate(chequeIn.chequeDate)} against ${invoiceNumber}.`, 'info', 'billing');
    }
    void dueAfterPayment;
    setLedger((prev) => [...entries, ...prev]);
    if (creditOverride) logAuditEvent('Credit Limit Overridden', `${invoiceNumber} for ${customer.name}: owes ${formatCurrency(credit.after)} vs limit ${formatCurrency(credit.limit)}. Allowed by ${creditOverride.by}. Reason: ${creditOverride.reason}`, 'warning', 'billing');
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
    const closedPay = booksLockedFor(settings, when);
    if (closedPay) return { success: false, message: closedPay };
    const newPaid = round2(inv.paidAmount + payAmt);
    const newBalance = billBalance({ ...inv, paidAmount: newPaid });
    const record: InvoicePaymentRecord = { id: uid('pay'), date: when, amount: payAmt, method: invoiceMethod(method), notes: notes ? `${method} - ${notes}` : method, recordedBy: currentUser?.name };
    setInvoices((prev) =>
      prev.map((i) =>
        i.id === invoiceId
          ? { ...i, paidAmount: newPaid, balanceDue: newBalance, paymentStatus: newBalance === 0 ? 'paid' : 'partial', status: newBalance === 0 ? 'paid' : 'partial', billKind: newBalance === 0 ? 'cash' : 'credit', payments: [...(i.payments || []), record], updatedAt: todayISO() }
          : i
      )
    );
    const cust = customers.find((c) => c.id === inv.customerId);
    const dueAfter = round2((cust?.totalDue || 0) - payAmt);
    if (cust) setCustomers((prev) => prev.map((c) => (c.id === cust.id ? { ...c, totalDue: round2((c.totalDue || 0) - payAmt) } : c)));
    setLedger((prev) => [
      {
        id: uid('led'),
        entityType: 'customer',
        entityId: inv.customerId,
        type: 'payment_received',
        referenceId: inv.invoiceNumber,
        sourceId: inv.id,
        method,
        date: when,
        description: `Payment received: ${method} - Bill ${inv.invoiceNumber}${notes ? ` (${notes})` : ''}`,
        debit: 0,
        credit: payAmt,
        balanceAfter: dueAfter,
        ...controlStore.branchStamp(),
      },
      ...prev,
    ]);
    logAuditEvent('Bill Payment', `${formatCurrency(payAmt)} by ${method} against ${inv.invoiceNumber}. Left: ${formatCurrency(newBalance)}.`, 'info', 'billing');
    return { success: true, message: `${formatCurrency(payAmt)} received. ${newBalance === 0 ? 'Bill fully paid.' : `${formatCurrency(newBalance)} still due.`}` };
  };

  const deleteBill = (invoiceId: string): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'Bill not found.' };
    const closedDel = booksLockedFor(settings, [inv.issueDate, ...(inv.payments || []).map((p) => p.date)].sort()[0]);
    if (closedDel) return { success: false, message: `This bill is in a closed period. ${closedDel}` };
    const billReturns = returnsForBill(returns, inv.id);
    if (billReturns.length) return { success: false, message: `Goods were returned on this bill (${billReturns.map((r) => r.returnNumber).join(', ')}). Delete the return first.` };
    if (inv.quotationId) setQuotations((prev) => prev.map((q) => (q.id === inv.quotationId ? { ...q, status: 'accepted', invoiceId: null } : q)));
    const billCheque = cheques.find((c) => c.invoiceId === inv.id && c.status !== 'bounced' && c.status !== 'cancelled');
    if (billCheque) return { success: false, message: `Cheque ${billCheque.chequeNumber} was taken against this bill. ${billCheque.status === 'cleared' ? 'It has cleared, so the bill cannot be deleted.' : 'Cancel or bounce the cheque first (Money → Cheques).'}` };
    // Put stock back, take the unpaid part off the customer, drop the bill's ledger lines.
    setProducts((prev) =>
      prev.map((p) => {
        // Only bills made here consumed stock directly (trading invoices take stock via dispatches).
        const qty = inv.items.filter((it) => it.productId === p.id && it.qty != null).reduce((a, it) => a + (it.qty || 0), 0);
        return qty > 0 ? { ...p, stockKg: round2(p.stockKg + qty) } : p;
      })
    );
    inventory.restoreBill(inv);
    setCustomers((prev) => prev.map((c) => (c.id === inv.customerId ? { ...c, totalDue: round2(c.totalDue - inv.balanceDue) } : c)));
    const ledgerIds = ledger.filter((l) => l.entityType === 'customer' && (l.sourceId ? l.sourceId === inv.id : l.referenceId === inv.invoiceNumber && l.entityId === inv.customerId)).map((l) => l.id);
    setLedger((prev) => prev.filter((l) => !ledgerIds.includes(l.id)));
    removeRemote('ledger', ledgerIds);
    setInvoices((prev) => prev.filter((i) => i.id !== invoiceId));
    removeRemote('invoices', [invoiceId]);
    logAuditEvent('Bill Deleted', `${inv.invoiceNumber} (${formatCurrency(inv.totalAmount)}) for ${inv.customerName} removed; stock and account reversed.`, 'danger', 'billing');
    return { success: true, message: `Bill ${inv.invoiceNumber} deleted.` };
  };

  /** Bill status after its money, returns and refunds changed. */
  const billAfter = (inv: Invoice, patch: Partial<Invoice>): Invoice => {
    const next = { ...inv, ...patch };
    const balanceDue = billBalance(next);
    const kept = round2(next.paidAmount - (next.refundedAmount || 0));
    const paymentStatus: InvoicePaymentStatus = balanceDue === 0 ? 'paid' : kept > 0 ? 'partial' : 'unpaid';
    return { ...next, balanceDue, paymentStatus, status: paymentStatus === 'unpaid' ? 'issued' : paymentStatus, updatedAt: todayISO() };
  };

  const returnBillItems = (input: ReturnBillInput): { success: boolean; message: string; stockReturn?: StockReturn } => {
    const inv = invoices.find((i) => i.id === input.invoiceId);
    if (!inv) return { success: false, message: 'Bill not found.' };
    const date = input.date || todayISO();
    if (date > todayISO()) return { success: false, message: 'The return date cannot be in the future.' };
    if (date < inv.issueDate) return { success: false, message: 'The return date cannot be before the bill date.' };
    const closed = booksLockedFor(settings, date);
    if (closed) return { success: false, message: closed };
    const plan = planReturn(inv, returns, input.lines);
    if (!plan.ok) return { success: false, message: plan.message || 'Nothing to return.' };
    const refund = input.settle === 'refund' ? maxRefund(inv, plan.total) : 0;
    if (input.settle === 'refund' && refund <= 0) return { success: false, message: 'The customer has not paid enough on this bill to give money back. Choose "Take it off what they owe" instead.' };
    const method = input.refundMethod || 'Cash';
    const creditNoteNumber = controlStore.nextDocNumber('credit_note', date, returns.filter((x) => x.kind === 'sales').map((x) => x.returnNumber));
    const qty = round2(plan.lines.reduce((a, l) => a + l.qty, 0));
    const reason = (input.reason || '').trim() || 'Returned by customer';
    const r: StockReturn = {
      id: uid('ret'),
      returnNumber: creditNoteNumber,
      kind: 'sales',
      customerId: inv.customerId,
      supplierId: null,
      productId: plan.lines[0].productId,
      dispatchId: null,
      purchaseId: null,
      kg: qty,
      pricePerKg: qty > 0 ? round2(plan.total / qty) : 0,
      amount: plan.total,
      reason,
      date,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name,
      invoiceId: inv.id,
      items: plan.lines,
      taxAmount: plan.tax,
      refundAmount: refund,
      ...(refund > 0 ? { refundMethod: method } : {}),
    };
    // Goods back on the shelf: totals per item, and the batches / godown they left from.
    setProducts((prev) =>
      prev.map((p) => {
        const back = plan.lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
        return back > 0 ? { ...p, stockKg: round2(p.stockKg + back) } : p;
      })
    );
    inventory.restoreReturn(plan.lines);
    const customer = customers.find((c) => c.id === inv.customerId);
    const dueAfterCredit = round2((customer?.totalDue || 0) - plan.total);
    setCustomers((prev) => prev.map((c) => (c.id === inv.customerId ? { ...c, totalDue: round2((c.totalDue || 0) - plan.total + refund) } : c)));
    const what = plan.lines.map((l) => `${l.productName} × ${l.qty}`).join(', ');
    const rows: LedgerEntry[] = [
      { id: uid('led'), entityType: 'customer', entityId: inv.customerId, type: 'credit_note', referenceId: r.returnNumber, sourceId: r.id, date, description: `Credit note ${r.returnNumber} for bill ${inv.invoiceNumber}: ${what} returned — ${reason}`, debit: 0, credit: plan.total, balanceAfter: dueAfterCredit, kg: qty },
    ];
    if (refund > 0) {
      rows.push({ id: uid('led'), entityType: 'customer', entityId: inv.customerId, type: 'refund_paid', referenceId: r.returnNumber, sourceId: r.id, method, date, description: `Refund paid: ${method} - ${r.returnNumber} (bill ${inv.invoiceNumber})`, debit: refund, credit: 0, balanceAfter: round2(dueAfterCredit + refund) });
    }
    setLedger((prev) => [...rows, ...prev]);
    setInvoices((prev) => prev.map((i) => (i.id === inv.id ? billAfter(i, { returnedAmount: round2((i.returnedAmount || 0) + plan.total), refundedAmount: round2((i.refundedAmount || 0) + refund) }) : i)));
    setReturns((prev) => [r, ...prev]);
    logAuditEvent('Sales Return', `${r.returnNumber} on ${inv.invoiceNumber} for ${inv.customerName}: ${what} (${formatCurrency(plan.total)})${refund > 0 ? `, ${formatCurrency(refund)} paid back by ${method}` : ''}.`, 'warning', 'billing');
    const rest = round2(plan.total - refund);
    const message =
      refund > 0
        ? `Return ${r.returnNumber} saved. Give ${formatCurrency(refund)} back${rest > 0 ? `; ${formatCurrency(rest)} comes off what they owe` : ''}.`
        : `Return ${r.returnNumber} saved. ${formatCurrency(plan.total)} taken off what ${inv.customerName} owes.`;
    return { success: true, message, stockReturn: r };
  };

  const addCashTransfer = ({ amount, from, date, note }: { amount: number; from: 'cash' | 'bank'; date?: string; note?: string }): { success: boolean; message: string } => {
    const amt = round2(Math.max(0, amount));
    if (amt <= 0) return { success: false, message: 'Enter an amount greater than zero.' };
    const when = date || todayISO();
    const closedXfer = booksLockedFor(settings, when);
    if (closedXfer) return { success: false, message: closedXfer };
    const to = from === 'cash' ? 'bank' : 'cash';
    const label = from === 'cash' ? 'Deposited cash to bank' : 'Withdrew cash from bank';
    const description = `${label}${note ? ` - ${note}` : ''}`;
    const pairId = uid('xfer');
    const out: CashEntry = { ...controlStore.branchStamp(), id: uid('cash'), date: when, direction: 'out', amount: amt, description, method: from === 'cash' ? 'Cash' : 'Bank Transfer', createdAt: todayISO(), createdBy: currentUser?.name, pairId };
    const inn: CashEntry = { ...controlStore.branchStamp(), id: uid('cash'), date: when, direction: 'in', amount: amt, description, method: to === 'cash' ? 'Cash' : 'Bank Transfer', createdAt: todayISO(), createdBy: currentUser?.name, pairId };
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
      customerAddress: customer.address?.trim() || customer.city || undefined,
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
    const expense: Expense = { ...controlStore.branchStamp(), ...data, amount: round2(data.amount), id: uid('exp'), createdAt: todayISO(), createdBy: currentUser?.name };
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
    if (booksLockedFor(settings, existing.date)) return; // closed period: the screens hide the delete button too
    if (chequeApi.isChequeRecord(id)) return; // a bounced cheque's bank charge: changed through the cheque, not deleted
    if (finance.api.isFinanceRecord(id)) return; // a salary payment: undone from Accounts → Staff & salaries
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
    const entry: CashEntry = { ...controlStore.branchStamp(), ...data, amount: round2(data.amount), id: uid('cash'), createdAt: todayISO(), createdBy: currentUser?.name };
    setCashEntries((prev) => [entry, ...prev]);
    logAuditEvent('Cash Entry Recorded', `${data.direction === 'in' ? 'Cash in' : 'Cash out'} ${formatCurrency(entry.amount)} — ${data.description}`, 'info');
    return entry;
  };

  const deleteCashEntry = (id: string) => {
    const existing = cashEntries.find((e) => e.id === id);
    if (!existing) return;
    if (booksLockedFor(settings, existing.date)) return; // closed period: the screens hide the delete button too
    if (chequeApi.isChequeRecord(id)) return; // a cleared cheque: part of the cheque register, not a loose cash entry
    if (finance.api.isFinanceRecord(id)) return; // an asset purchase / sale or staff advance: changed from Accounts
    // A transfer has two legs; remove both so cash and bank stay in step.
    const ids = existing.pairId ? cashEntries.filter((e) => e.pairId === existing.pairId).map((e) => e.id) : [id];
    setCashEntries((prev) => prev.filter((e) => !ids.includes(e.id)));
    removeRemote('cash_entries', ids);
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

  /** Billing-mode quotation: a customer, several items at quoted prices, and a valid-until date. */
  const saveBillQuotation = (input: { id?: string; customerId: string; items: QuotationLine[]; validUntil: string; notes?: string }): { success: boolean; message: string; quotation?: Quotation } => {
    if (!customers.some((c) => c.id === input.customerId)) return { success: false, message: 'Pick a customer.' };
    // A line typed per pack keeps 4 decimals on the base price, so qty × price still comes to packs × pack price.
    const lines = (input.items || []).filter((l) => l.productId && l.qty > 0).map((l) => {
      const packed = l.packPrice != null && (Number(l.packSize) || 0) > 1;
      const clean = { ...l, qty: packed ? Math.round(l.qty * 10000) / 10000 : round2(l.qty), unitPrice: packed ? Math.round(l.unitPrice * 10000) / 10000 : round2(l.unitPrice) };
      if (packed) clean.packPrice = round2(l.packPrice as number);
      else delete clean.packPrice;
      if (!((Number(l.packSize) || 0) > 1 && l.packName)) { delete clean.packName; delete clean.packSize; }
      return clean;
    });
    if (lines.length === 0) return { success: false, message: 'Add at least one item with a quantity.' };
    if (lines.some((l) => !(l.unitPrice >= 0))) return { success: false, message: 'A price cannot be negative.' };
    if (!input.validUntil) return { success: false, message: 'Enter the date these prices are good until.' };
    const amount = quotationTotal(lines);
    if (amount <= 0) return { success: false, message: 'The quotation total must be more than zero.' };
    const kg = round2(lines.reduce((a, l) => a + l.qty, 0));
    const base = { customerId: input.customerId, productId: lines[0].productId, kg, pricePerKg: round2(amount / kg), amount, validUntil: input.validUntil, notes: input.notes?.trim() || undefined, items: lines };
    if (input.id) {
      const existing = quotations.find((q) => q.id === input.id);
      if (!existing) return { success: false, message: 'Quotation not found.' };
      if (existing.status === 'converted') return { success: false, message: 'This quotation is already a bill and cannot be changed.' };
      const updated: Quotation = { ...existing, ...base };
      setQuotations((prev) => prev.map((q) => (q.id === input.id ? updated : q)));
      logAuditEvent('Quotation Updated', `${existing.quoteNumber}: ${lines.length} item(s), ${formatCurrency(amount)}.`, 'info', 'billing');
      return { success: true, message: `Quotation ${existing.quoteNumber} saved.`, quotation: updated };
    }
    const quoteNumber = controlStore.nextDocNumber('quotation', todayISO(), quotations.map((x) => x.quoteNumber));
    const q: Quotation = { id: uid('quote'), quoteNumber, ...base, status: 'draft', createdAt: todayISO(), createdBy: currentUser?.name, bookingId: null, invoiceId: null };
    setQuotations((prev) => [q, ...prev]);
    logAuditEvent('Quotation Created', `${q.quoteNumber} for ${customers.find((c) => c.id === q.customerId)?.name || 'customer'}: ${lines.length} item(s), ${formatCurrency(amount)}.`, 'info', 'billing');
    return { success: true, message: `Quotation ${q.quoteNumber} saved.`, quotation: q };
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
      poNumber: controlStore.nextDocNumber('po', todayISO(), purchaseOrders.map((x) => x.poNumber)),
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
      setCustomers((prev) => prev.map((c) => (c.id === data.customerId ? { ...c, totalDue: round2(c.totalDue - amount) } : c)));
      setLedger((prev) => [
        { id: uid('led'), entityType: 'customer', entityId: data.customerId!, type: 'credit_note', referenceId: r.returnNumber, date: onDate, description: `Credit note ${r.returnNumber}: ${data.kg.toLocaleString()} kg ${product?.name || 'goods'} returned — ${r.reason}`, debit: 0, credit: amount, balanceAfter: Math.max(0, round2((customer?.totalDue || 0) - amount)), kg: data.kg },
        ...prev,
      ]);
    } else if (data.kind === 'purchase' && data.supplierId) {
      const supplier = suppliers.find((s) => s.id === data.supplierId);
      setProducts((prev) => prev.map((p) => (p.id === data.productId ? { ...p, stockKg: Math.max(0, round2(p.stockKg - data.kg)) } : p)));
      setSuppliers((prev) => prev.map((s) => (s.id === data.supplierId ? { ...s, totalOwed: round2(s.totalOwed - amount) } : s)));
      setLedger((prev) => [
        { id: uid('led'), entityType: 'supplier', entityId: data.supplierId!, type: 'debit_note', referenceId: r.returnNumber, date: onDate, description: `Debit note ${r.returnNumber}: ${data.kg.toLocaleString()} kg ${product?.name || 'goods'} returned — ${r.reason}`, debit: 0, credit: amount, balanceAfter: Math.max(0, round2((supplier?.totalOwed || 0) - amount)), kg: data.kg },
        ...prev,
      ]);
    }
    setReturns((prev) => [r, ...prev]);
    logAuditEvent(data.kind === 'sales' ? 'Sales Return' : 'Purchase Return', `${r.returnNumber}: ${data.kg.toLocaleString()} kg ${product?.name || ''} (${formatCurrency(amount)}) — ${r.reason}`, 'warning');
    return r;
  };

  const deleteReturn = (id: string): { success: boolean; message: string } => {
    const r = returns.find((x) => x.id === id);
    if (!r) return { success: false, message: 'Return not found.' };
    const ledgerIds = ledger.filter((l) => l.referenceId === r.returnNumber).map((l) => l.id);
    if (r.invoiceId && r.items?.length) {
      // Return against a bill: undo exactly what it did.
      const closedRet = booksLockedFor(settings, r.date);
      if (closedRet) return { success: false, message: `This return is in a closed period. ${closedRet}` };
      const items = r.items;
      const refund = r.refundAmount || 0;
      setProducts((prev) =>
        prev.map((p) => {
          const back = items.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
          return back > 0 ? { ...p, stockKg: round2(p.stockKg - back) } : p;
        })
      );
      inventory.takeBackReturn(items);
      setCustomers((prev) => prev.map((c) => (c.id === r.customerId ? { ...c, totalDue: round2(c.totalDue + r.amount - refund) } : c)));
      setInvoices((prev) => prev.map((i) => (i.id === r.invoiceId ? billAfter(i, { returnedAmount: Math.max(0, round2((i.returnedAmount || 0) - r.amount)), refundedAmount: Math.max(0, round2((i.refundedAmount || 0) - refund)) }) : i)));
    } else if (r.kind === 'sales' && r.customerId) {
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
    return { success: true, message: `Return ${r.returnNumber} deleted.` };
  };

  // ---------------------------------------------------------------------------
  // Stock adjustments
  // ---------------------------------------------------------------------------
  const adjustStock = (productId: string, newStockKg: number, reason: AdjustmentReason, note?: string): StockAdjustment | null => {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    const deltaKg = round2(newStockKg - product.stockKg);
    if (deltaKg === 0) return null;
    const cost = costPerKgOn(purchases, productId, todayISO()) ?? (product.costPricePerKg && product.costPricePerKg > 0 ? product.costPricePerKg : undefined);
    const adj: StockAdjustment = { id: uid('adj'), productId, deltaKg, reason, ...(cost ? { costPerKg: round2(cost) } : {}), note: note?.trim() || undefined, date: todayISO(), createdAt: todayISO(), createdBy: currentUser?.name };
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

  const bankRec = createBankRecApi({
    lines: bankStatementLines,
    setLines: setBankStatementLines,
    recs: bankReconciliations,
    setRecs: setBankReconciliations,
    getMovements: () => collectCashMovements(ledger, expenses, cashEntries, customers, suppliers),
    addExpense,
    addCashEntry,
    recordCustomerPayment,
    recordSupplierPayment,
    lockedFor: (d) => booksLockedFor(settings, d),
    canEdit: () => can('finance:cashbook'),
    logAuditEvent: (a, dt, sev) => logAuditEvent(a, dt, sev),
    removeRemote,
    uid,
    userName: currentUser?.name,
    today: todayISO,
  });
  // Post-dated cheque register (see chequeActions.ts for the accounting treatment).
  const chequeApi = createChequeApi({
    cheques,
    setCheques,
    customers,
    setCustomers,
    suppliers,
    setSuppliers,
    invoices,
    setInvoices,
    setLedger,
    setCashEntries,
    setExpenses,
    settings,
    can: (p) => can(p as Permission),
    logAuditEvent: (a, dt, sev) => logAuditEvent(a, dt, sev, 'billing'),
    uid,
    userName: currentUser?.name,
    today: todayISO,
  });
  // ---------------------------------------------------------------------------
  // Accounts (double-entry): manual journals, custom accounts, period lock
  // ---------------------------------------------------------------------------
  const addManualJournal = (input: { date: string; ref?: string; memo: string; lines: JournalEntry['lines'] }): { success: boolean; message: string; entry?: JournalEntry } => {
    const lines = (input.lines || [])
      .map((l) => ({ accountCode: l.accountCode, debit: round2(Number(l.debit) || 0), credit: round2(Number(l.credit) || 0), ...(l.memo?.trim() ? { memo: l.memo.trim() } : {}), ...(l.costCentreId ? { costCentreId: l.costCentreId } : {}) }))
      .filter((l) => l.accountCode || l.debit || l.credit);
    if (!can('finance:view_pnl')) return { success: false, message: 'Only a manager or admin can post journal entries.' };
    const check = validateEntry({ date: input.date, lines }, mergeAccounts(customAccounts));
    if (!check.ok) return { success: false, message: check.errors[0] };
    if (!input.memo.trim()) return { success: false, message: 'Write what this entry is for (narration).' };
    if (input.date > todayISO()) return { success: false, message: 'The date cannot be in the future.' };
    const closed = booksLockedFor(settings, input.date);
    if (closed) return { success: false, message: closed };
    const entry: JournalEntry = {
      id: uid('je'),
      date: input.date,
      ref: input.ref?.trim() || `JV-${manualJournals.reduce((m, j) => Math.max(m, parseInt((j.ref.match(/^JV-(\d+)$/) || [])[1] || '0', 10)), 0) + 1}`,
      memo: input.memo.trim(),
      lines,
      source: 'manual',
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name,
    };
    setManualJournals((prev) => [entry, ...prev]);
    logAuditEvent('Journal Entry Posted', `${entry.ref} on ${entry.date}: ${entry.memo} (${formatCurrency(lines.reduce((a, l) => a + l.debit, 0))})`, 'info', 'data');
    return { success: true, message: `Journal entry ${entry.ref} saved.`, entry };
  };

  const deleteManualJournal = (id: string): { success: boolean; message: string } => {
    const target = manualJournals.find((j) => j.id === id);
    if (!target) return { success: false, message: 'Journal entry not found.' };
    if (target.closing) return { success: false, message: 'This is a year-end closing entry. Reopen the year from Accounts → Year end instead.' };
    if (!can('finance:view_pnl') || !can('delete_records')) return { success: false, message: 'Only a manager or admin can delete journal entries.' };
    const closedDel = booksLockedFor(settings, target.date);
    if (closedDel) return { success: false, message: `This entry is in a closed period. ${closedDel}` };
    setManualJournals((prev) => prev.filter((j) => j.id !== id));
    removeRemote('journal_entries', [id]);
    logAuditEvent('Journal Entry Deleted', `${target.ref} on ${target.date}: ${target.memo}`, 'danger', 'data');
    return { success: true, message: `Journal entry ${target.ref} deleted.` };
  };

  const addAccount = (acc: { code: string; name: string; type: Account['type']; parent?: string; description?: string }): { success: boolean; message: string } => {
    if (!can('finance:view_pnl')) return { success: false, message: 'Only a manager or admin can add accounts.' };
    const error = validateAccount(acc, mergeAccounts(customAccounts));
    if (error) return { success: false, message: error };
    const code = acc.code.trim();
    const account: Account = {
      id: `acc-${code}`,
      code,
      name: acc.name.trim(),
      type: acc.type,
      system: false,
      parent: acc.parent || undefined,
      description: acc.description?.trim() || undefined,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name,
    };
    setCustomAccounts((prev) => [...prev, account]);
    logAuditEvent('Account Added', `${code} ${account.name} (${account.type})`, 'info', 'data');
    return { success: true, message: `Account ${code} ${account.name} added.` };
  };

  const deleteAccount = (code: string): { success: boolean; message: string } => {
    if (!can('finance:view_pnl') || !can('delete_records')) return { success: false, message: 'Only a manager or admin can delete accounts.' };
    const target = customAccounts.find((a) => a.code === code);
    if (!target) return { success: false, message: 'System accounts cannot be deleted.' };
    if (manualJournals.some((j) => j.lines.some((l) => l.accountCode === code))) {
      return { success: false, message: `Account ${code} is used in journal entries; delete those entries first.` };
    }
    setCustomAccounts((prev) => prev.filter((a) => a.code !== code));
    if (target.id) removeRemote('accounts', [target.id]);
    logAuditEvent('Account Deleted', `${code} ${target.name}`, 'warning', 'data');
    return { success: true, message: `Account ${code} deleted.` };
  };

  /** The full backup as JSON (used by "Download backup" and the automatic daily backups). */
  const buildSystemBackup = (): string => {
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
      bankStatementLines,
      bankReconciliations,
      cheques,
      ...inventory.backupData(),
      ...salesExtras.backupData(),
      ...purchasing.backupData(),
      manualJournals,
      customAccounts,
      customerAgreedRates,
      ...finance.backupData(),
      auditLogs,
      ...controlStore.backupData(),
    };
    return JSON.stringify(backupData, null, 2);
  };

  const exportSystemBackup = (): string => {
    const jsonString = buildSystemBackup();
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
      // Backup replaces the dataset, so rows missing from the backup must go from the cloud too —
      // and the wipe must finish before the restored rows are upserted, or the delete could win.
      const apply = () => {
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
        // An old backup's master PIN is not restored: sign-in is by username + password now.
        setSettings({ ...data.settings, masterPin: null, id: 'default' });
      }
      if (Array.isArray(data.ledger)) setLedger(data.ledger.map(normalizeLedger));
      if (Array.isArray(data.whatsappMessages)) setWhatsappMessages(data.whatsappMessages);
      if (Array.isArray(data.invoices)) setInvoices(data.invoices);
      if (Array.isArray(data.bankStatementLines)) setBankStatementLines(data.bankStatementLines);
      if (Array.isArray(data.bankReconciliations)) setBankReconciliations(data.bankReconciliations);
      if (Array.isArray(data.cheques)) setCheques(data.cheques);
      inventory.hydrate({ godowns: data.godowns ?? [], stockBatches: data.stockBatches ?? [], stockTransfers: data.stockTransfers ?? [] });
      salesExtras.hydrate({ salesmen: data.salesmen ?? [], areas: data.areas ?? [], schemes: data.schemes ?? [] });
      purchasing.hydrate({ supplierBills: data.supplierBills ?? [], supplierClaims: data.supplierClaims ?? [] });
      if (Array.isArray(data.manualJournals)) setManualJournals(data.manualJournals);
      if (Array.isArray(data.customAccounts)) setCustomAccounts(data.customAccounts);
      if (Array.isArray(data.customerAgreedRates)) setCustomerAgreedRates(data.customerAgreedRates);
      finance.restoreBackup(data);
      if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);
      controlStore.restoreFrom(data);
      logAuditEvent('Backup Restored', 'Full system database restored from JSON backup.', 'warning');
      };
      if (isCloudSyncReady) void clearAllTables().then(apply, apply);
      else apply();
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
    setBankStatementLines([]);
    setBankReconciliations([]);
    setCheques([]);
    inventory.reset();
    salesExtras.reset();
    purchasing.reset();
    finance.reset();
    controlStore.reset();
    localStorage.removeItem(STORAGE_KEYS.INVOICES);
    localStorage.removeItem(STORAGE_KEYS.CHEQUES);
    localStorage.removeItem(STORAGE_KEYS.BANK_LINES);
    localStorage.removeItem(STORAGE_KEYS.BANK_RECS);
    setManualJournals([]);
    setCustomAccounts([]);
    localStorage.removeItem(STORAGE_KEYS.INVOICES);
    localStorage.removeItem(STORAGE_KEYS.JOURNALS);
    localStorage.removeItem(STORAGE_KEYS.ACCOUNTS);
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

  const inventory = useInventoryStore({
    products, setProducts, suppliers, addPurchase, logAuditEvent, userName: currentUser?.name, isCloudSyncReady, syncToSupabase, removeRemote,
    // Stock received with no supplier bill is kept as a stock record (not a silent stock change).
    recordAdjustment: (a) => setAdjustments((prev) => [{ ...a, id: uid('adj'), createdAt: todayISO(), createdBy: currentUser?.name }, ...prev]),
    can: (p) => can(p as Permission),
  });
  // Salesmen, areas, schemes, receive-from-many, commission and interest (see salesExtrasActions.ts).
  // Bill numbers two devices both used: the later bill made here is renumbered (see numberGuardActions.ts).
  const numberGuard = useNumberGuard({
    invoices, setInvoices, setLedger, cheques, isCloudSyncReady, logAuditEvent,
    nextBillNumber: (date, existing) => controlStore.nextDocNumber('bill', date, existing),
  });
  // Payment reminders listed on Home (see reminderActions.ts / utils/reminders.ts).
  const reminderDay = todayISO();
  const dueReminders = useMemo(() => computeRemindersDue(customers, invoices, settings, reminderDay), [customers, invoices, settings, reminderDay]);
  const reminders = createReminderApi({
    customers, setCustomers, invoices, settings, setSettings, due: dueReminders, today: reminderDay,
    can: (p) => can(p as Permission),
    logAuditEvent: (a, dt, sev, cat) => logAuditEvent(a, dt, sev, cat),
  });
  const salesExtras = useSalesExtrasStore({
    customers, setCustomers, invoices, ledger, setLedger, addExpense, settings,
    can: (p) => can(p as Permission),
    logAuditEvent: (a, dt, sev) => logAuditEvent(a, dt, sev, 'billing'),
    uid, userName: currentUser?.name, today: todayISO, isCloudSyncReady, syncToSupabase, removeRemote,
    branchStamp: controlStore.branchStamp,
  });
  // Billing-mode stock adjustments and purchase returns (godown / batch aware), see stockActions.ts.
  const stockActions = createStockActions({
    products, setProducts, suppliers, setSuppliers, purchases, adjustments, setAdjustments, returns, setReturns, ledger, setLedger,
    godowns: inventory.storedGodowns, stockBatches: inventory.api.stockBatches, updateRows: inventory.updateRows,
    can: (p) => can(p as Permission),
    lockedFor: (d) => booksLockedFor(settings, d),
    logAuditEvent: (a, dt, sev) => logAuditEvent(a, dt, sev),
    removeRemote, uid, userName: currentUser?.name, today: todayISO,
    docNumber: (date: string) => controlStore.nextDocNumber('debit_note', date, returns.filter((x) => x.kind === 'purchase').map((x) => x.returnNumber)),
  });
  // Purchase orders, supplier bills (three-way match) and supplier claims, see purchasingActions.ts.
  const purchasing = usePurchasingStore({
    purchaseOrders, setPurchaseOrders, purchases, products, suppliers, setSuppliers, ledger, setLedger, settings,
    can: (p) => can(p as Permission),
    logAuditEvent: (a, dt, sev) => logAuditEvent(a, dt, sev),
    uid, userName: currentUser?.name, today: todayISO, isCloudSyncReady, syncToSupabase, removeRemote,
    docNumber: (existing) => controlStore.nextDocNumber('po', todayISO(), existing),
  });

  // Fixed assets, staff & salaries, budgets, cost centres, year-end close (see financeActions.ts / utils/financeBooks.ts).
  const finance = useFinanceStore({
    settings,
    updateSettings,
    can: (p) => can(p as Permission),
    logAuditEvent: (a, dt, sev) => logAuditEvent(a, dt, sev, 'data'),
    uid,
    userName: currentUser?.name,
    today: todayISO,
    addExpense,
    addCashEntry,
    setExpenses,
    setCashEntries,
    setManualJournals,
    getBaseJournal: () => combineJournal(buildJournal({ settings, customers, suppliers, ledger, invoices, dispatches, purchases, expenses, cashEntries, products, returns, adjustments }), manualJournals),
    accounts: mergeAccounts(customAccounts),
    isCloudSyncReady,
    syncToSupabase,
    removeRemote,
    centreInUse: (id) => invoices.some((i) => i.costCentreId === id) || expenses.some((e) => e.costCentreId === id) || manualJournals.some((j) => j.costCentreId === id || j.lines.some((l) => l.costCentreId === id)),
  });
  /** Expense / cash rows owned by a cheque or a finance record: changed from there, never deleted on their own. */
  const isLinkedRecord = (id: string) => chequeApi.isChequeRecord(id) || finance.api.isFinanceRecord(id);
  // Approval rules, deleted-records bin, number series, branches, backups (see controlActions.ts).
  const control = createControlApi({
    store: controlStore, settings, setSettings, currentUser, users, setUsers,
    can: (p) => can(p as Permission), logAuditEvent, uid,
    invoices, customers, suppliers, products, purchases, expenses, cashEntries, returns, adjustments, quotations, purchaseOrders, manualJournals, bookings, dispatches, ledger, cheques,
    stockBatches: inventory.api.stockBatches, godowns: inventory.api.godowns,
    setCustomers, setSuppliers, setProducts, setExpenses, setCashEntries, setInvoices, setLedger,
    isLinkedRecord, planBill: inventory.planBill, importSystemBackup, exportSystemBackup,
    createBill, recordSupplierPayment, issueCheque: chequeApi.issueCheque, adjustStockBy: stockActions.adjustStockBy,
    deleteBill, deleteInvoice, deleteCustomer, deleteSupplier, deleteProduct, deleteExpense, deleteCashEntry, deleteReturn,
    deletePurchaseReturn: stockActions.deletePurchaseReturn, undoStockAdjustment: stockActions.undoStockAdjustment, deleteAdjustment,
    deleteQuotation, deletePurchaseOrder, deletePurchase, deleteManualJournal, deleteBooking, deleteDispatch, deleteLedgerEntry,
    more: {
      supplierBills: purchasing.api.supplierBills, supplierClaims: purchasing.api.supplierClaims, fixedAssets: finance.api.fixedAssets, staff: finance.api.staff,
      staffAdvances: finance.api.staffAdvances, costCentres: finance.api.costCentres, salesmen: salesExtras.api.salesmen, areas: salesExtras.api.areas, schemes: salesExtras.api.schemes,
      deleteSupplierBill: purchasing.api.deleteSupplierBill, deleteSupplierClaim: purchasing.api.deleteSupplierClaim, removePurchaseOrder: purchasing.api.removePurchaseOrder,
      deleteFixedAsset: finance.api.deleteFixedAsset, deleteStaff: finance.api.deleteStaff, deleteStaffAdvance: finance.api.deleteStaffAdvance, deleteCostCentre: finance.api.deleteCostCentre,
      deleteSalesman: salesExtras.api.deleteSalesman, deleteArea: salesExtras.api.deleteArea, deleteScheme: salesExtras.api.deleteScheme, deleteGodown: inventory.api.deleteGodown,
    },
  });
  controlStore.backupBuilder.current = buildSystemBackup;

  return (
    <TradingContext.Provider
      value={{
        ...inventory.api,
        ...stockActions,
        ...chequeApi,
        ...salesExtras.api,
        ...purchasing.api,
        ...finance.api,
        ...auth,
        ...reminders,
        ...numberGuard,
        customerDeleteBlock,
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
        updateUser,
        deleteUser,
        can,
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
        unlockUserAccount,
        forceLogoutUser,
        invoices,
        addInvoice,
        updateInvoice,
        deleteInvoice,
        recordInvoicePayment,
        createBill,
        payBill,
        deleteBill,
        returnBillItems,
        saveBillQuotation,
        addCashTransfer,
        ...bankRec,
        generateInvoiceFromBookings,
        customerAgreedRates,
        setCustomerAgreedRate,
        deleteCustomerAgreedRate,
        getCustomerAgreedRate,
        isLinkedRecord,
        manualJournals,
        customAccounts,
        addManualJournal,
        deleteManualJournal,
        addAccount,
        deleteAccount,
        // Controls last: the rule-checked / bin-keeping versions replace the plain actions above.
        ...control.api,
        ...control.overrides,
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
