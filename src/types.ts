export type EntityType = 'customer' | 'supplier';

export interface Customer {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  totalDue: number;
  creditLimit: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  materialCategory: string;
  totalOwed: number;
  address: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  unitPricePerKg: number;
  costPricePerKg?: number; // Base procurement cost per kg
  stockKg: number;
  minThresholdKg: number;
  supplierId?: string | null;
  description?: string;
}

export type BookingStatus = 'active' | 'completed' | 'cancelled';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface BookingItem {
  id: string;
  productId: string;
  productName?: string;
  totalKg: number;
  pricePerKg: number;
  dispatchedKg: number;
  remainingKg: number;
  totalAmount: number;
  costPricePerKg?: number;
  marginPerKg?: number;
  totalMargin?: number;
  defaultProductPricePerKg?: number;
  isCustomRate?: boolean;
  rateOverrideReason?: string;
  notes?: string;
}

export interface Booking {
  id: string;
  bookingNumber: string;
  customerId: string;
  items?: BookingItem[];
  productId: string;
  totalKg: number;
  dispatchedKg: number;
  remainingKg: number;
  pricePerKg: number; // actual charged selling rate
  defaultProductPricePerKg?: number; // product default rate when booked
  costPricePerKg?: number; // product procurement cost per kg
  marginPerKg?: number; // selling rate - cost price
  totalMargin?: number; // margin per kg * total kg
  isCustomRate?: boolean; // true if differs from default product rate
  rateOverrideReason?: string;
  totalAmount: number;
  paidAmount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  targetDeliveryDate?: string;
  notes?: string;
  cancelledAt?: string;
  cancelReason?: string;
  /** Broker / agent who brought the deal and their commission per kg dispatched. */
  brokerName?: string;
  brokerCommissionPerKg?: number;
  quotationId?: string | null;
}

export interface Dispatch {
  id: string;
  dispatchNumber: string;
  bookingId: string;
  bookingItemId?: string;
  customerId: string;
  productId: string;
  kg: number;
  amount: number;
  truckNumber: string;
  driverPhone?: string;
  date: string;
  notes?: string;
  whatsappSent: boolean;
  whatsappMessage?: string;
  paymentReceivedImmediately?: boolean;
  truckId?: string | null;
  /** Weighbridge: gross and tare weights; kg is the net. */
  grossKg?: number | null;
  tareKg?: number | null;
  /** Freight billed to the customer on top of goods (Rs.). */
  freightCharge?: number;
  /** Sales tax applied at dispatch time. */
  taxRatePct?: number;
  taxAmount?: number;
  /** Goods + freight + tax: the invoice total that hits the customer ledger. */
  totalBilled?: number;
  status?: DispatchStatus;
  deliveredAt?: string | null;
  receivedBy?: string;
  podNote?: string;
}

export type DispatchStatus = 'in_transit' | 'delivered';

/** Invoice total for a dispatch (older rows have no totalBilled). */
export const dispatchBilledTotal = (d: { amount: number; freightCharge?: number; taxAmount?: number; totalBilled?: number }) =>
  d.totalBilled ?? Number((d.amount + (d.freightCharge || 0) + (d.taxAmount || 0)).toFixed(2));

export type TransactionType =
  | 'booking_invoice'
  | 'dispatch_billed'
  | 'payment_received'
  | 'payment_made'
  | 'purchase_received'
  | 'credit_note'
  | 'debit_note';

export interface LedgerEntry {
  id: string;
  entityType: EntityType;
  entityId: string;
  type: TransactionType;
  referenceId: string;
  date: string;
  description: string;
  debit: number;   // For customer: invoices increase debt
  credit: number;  // For customer: payments reduce debt
  balanceAfter: number;
  kg?: number;
}

export interface WhatsAppMessage {
  id: string;
  type: 'dispatch_alert' | 'payment_reminder' | 'booking_confirmation' | 'custom';
  recipientName: string;
  recipientPhone: string;
  recipientType: 'customer' | 'supplier';
  message: string;
  timestamp: string;
  status: 'sent' | 'delivered';
  bookingId?: string;
  dispatchId?: string;
}

/** Incoming stock from a supplier (a purchase / goods receipt). All quantities in kg. */
export interface Purchase {
  id: string;
  receiptNumber: string;
  supplierId: string;
  productId: string;
  kg: number;
  pricePerKg: number;
  amount: number;
  date: string;
  truckNumber?: string;
  notes?: string;
  paymentMadeImmediately?: boolean;
  createdAt: string;
  grossKg?: number | null;
  tareKg?: number | null;
  purchaseOrderId?: string | null;
}

export type PriceSource = 'product_created' | 'price_update' | 'manual' | 'booking' | 'purchase';

/** One observed selling price for a product on a date. Powers the Price History view. */
export interface PriceHistoryEntry {
  id: string;
  productId: string;
  pricePerKg: number;
  date: string;
  source: PriceSource;
  note?: string;
  referenceId?: string;
}

export type ReportsTab = 'daily' | 'monthly' | 'flow' | 'pnl' | 'aging' | 'balance' | 'cashbook';
export type OpsTab = 'fleet' | 'expenses' | 'alerts' | 'tasks';

export type ActiveScreen = 'dashboard' | 'customers' | 'suppliers' | 'products' | 'bookings' | 'billing' | 'reports' | 'ops' | 'admin';

export interface CustomerAgreedRate {
  id: string;
  customerId: string;
  productId: string;
  agreedRatePerKg: number;
  effectiveDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type InvoicePaymentStatus = 'paid' | 'partial' | 'unpaid';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partial' | 'cancelled';

export interface InvoiceItem {
  id: string;
  bookingId?: string;
  dispatchId?: string;
  productId: string;
  productName: string;
  description?: string;
  kg: number;
  ratePerKg: number; // actual charged rate
  costPricePerKg?: number;
  amount: number; // kg * ratePerKg
}

export interface InvoicePaymentRecord {
  id: string;
  date: string;
  amount: number;
  method: 'bank_transfer' | 'cash' | 'cheque' | 'online';
  referenceNumber?: string;
  notes?: string;
  recordedBy?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerCompany?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerNtn?: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  paymentStatus: InvoicePaymentStatus;
  items: InvoiceItem[];
  subtotal: number;
  freightCharges?: number;
  handlingCharges?: number;
  taxRatePct: number;
  taxAmount: number;
  discount?: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  payments?: InvoicePaymentRecord[];
  notes?: string;
  terms?: string;
  linkedBookingIds?: string[];
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}

export type AuditCategory = 'auth' | 'roles' | 'users' | 'visibility' | 'data' | 'system' | 'billing';
export type AuditSeverity = 'info' | 'warning' | 'danger';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  severity: AuditSeverity;
  /** Name of the signed-in user who performed the action. */
  user?: string;
  category?: AuditCategory;
  ip?: string;
}

// ---------------------------------------------------------------------------
// Enterprise: expenses, fleet, users & roles
// ---------------------------------------------------------------------------

export type ExpenseCategory =
  | 'transport'
  | 'fuel'
  | 'labour'
  | 'port_charges'
  | 'rent'
  | 'utilities'
  | 'salaries'
  | 'maintenance'
  | 'tax'
  | 'commission'
  | 'other';

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'transport', label: 'Transport & Freight' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'labour', label: 'Loading / Labour' },
  { id: 'port_charges', label: 'Port & Terminal Charges' },
  { id: 'rent', label: 'Warehouse Rent' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'salaries', label: 'Salaries' },
  { id: 'maintenance', label: 'Vehicle Maintenance' },
  { id: 'tax', label: 'Taxes & Duties' },
  { id: 'commission', label: 'Broker Commission' },
  { id: 'other', label: 'Other' },
];

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  paidVia?: string;
  truckId?: string | null;
  /** Trip cost tied to a specific dispatch (per-trip profitability). */
  dispatchId?: string | null;
  referenceId?: string;
  createdAt: string;
  createdBy?: string;
}

export type TruckStatus = 'available' | 'on_trip' | 'maintenance' | 'inactive';

export interface Truck {
  id: string;
  number: string;
  driverName: string;
  driverPhone: string;
  capacityKg: number;
  status: TruckStatus;
  notes?: string;
  createdAt: string;
}

export type StandardUserRole = 'super_admin' | 'admin' | 'manager' | 'editor' | 'viewer' | 'operator';
export type UserRole = StandardUserRole | string;

export type UserAccountStatus = 'active' | 'inactive' | 'suspended' | 'locked';

export interface AppUser {
  id: string;
  name: string;
  username?: string;
  email?: string;
  role: UserRole; // primary role for backwards compatibility
  roles?: UserRole[]; // supports assigning one or more roles to a user
  pin: string;
  pinHash?: string; // bcrypt-hashed PIN for secure storage
  passwordHash?: string; // bcrypt-hashed password
  active: boolean;
  status?: UserAccountStatus;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  failedAttempts?: number;
  lockedUntil?: string | null; // ISO timestamp
  lastLoginAt?: string | null;
  lastLoginIp?: string;
  passwordResetToken?: string | null;
  passwordResetExpires?: string | null;
  sessionToken?: string | null;
  createdAt: string;
}

export type GranularPermission =
  | 'users:view'
  | 'users:create'
  | 'users:edit'
  | 'users:delete'
  | 'users:manage_roles'
  | 'users:force_logout'
  | 'roles:view'
  | 'roles:manage'
  | 'roles:matrix_edit'
  | 'visibility:manage'
  | 'customers:view'
  | 'customers:create'
  | 'customers:edit'
  | 'customers:delete'
  | 'suppliers:view'
  | 'suppliers:create'
  | 'suppliers:edit'
  | 'suppliers:delete'
  | 'products:view'
  | 'products:create'
  | 'products:edit_prices'
  | 'products:delete'
  | 'stock:adjust'
  | 'bookings:view'
  | 'bookings:create'
  | 'bookings:edit'
  | 'bookings:cancel'
  | 'bookings:delete'
  | 'billing:view'
  | 'billing:create'
  | 'billing:edit'
  | 'billing:delete'
  | 'dispatches:view'
  | 'dispatches:create'
  | 'dispatches:edit'
  | 'dispatches:delete'
  | 'fleet:manage'
  | 'finance:view_ledger'
  | 'finance:record_payment'
  | 'finance:view_pnl'
  | 'finance:manage_expenses'
  | 'finance:cashbook'
  | 'reports:view'
  | 'reports:export'
  | 'system:admin_screen'
  | 'system:audit_view'
  | 'system:audit_clear'
  | 'system:backup_restore'
  | 'system:purge_data'
  | 'system:company_settings';

export type Permission =
  | GranularPermission
  | 'delete_records'
  | 'edit_prices'
  | 'override_credit'
  | 'view_finance'
  | 'manage_fleet'
  | 'manage_expenses'
  | 'admin_screen'
  | 'purge_data'
  | 'manage_users';

export interface RoleDefinition {
  id: string; // role identifier key, e.g. 'super_admin', 'admin', 'manager', 'editor', 'viewer'
  name: string;
  description: string;
  hierarchyLevel: number; // 100 = Super Admin, 80 = Admin, 50 = Manager, 30 = Editor, 10 = Viewer
  isSystem: boolean; // cannot be deleted
  permissions: Permission[];
  color?: string;
  badgeBg?: string;
}

export type SensitiveFieldKey =
  | 'profit_margins'
  | 'cash_balances'
  | 'purchase_costs'
  | 'credit_limits'
  | 'tax_details';

export interface RoleVisibilitySettings {
  hiddenScreens: ActiveScreen[];
  hiddenFields: SensitiveFieldKey[];
}

export interface SecurityPolicySettings {
  maxFailedAttempts: number; // lockout threshold, default 5
  lockoutDurationMinutes: number; // lockout duration, default 15
  require2FAForAdmins: boolean;
  sessionTimeoutHours: number;
  enableRoleHierarchy: boolean;
}

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: [
    'users:view', 'users:create', 'users:edit', 'users:delete', 'users:manage_roles', 'users:force_logout',
    'roles:view', 'roles:manage', 'roles:matrix_edit', 'visibility:manage',
    'customers:view', 'customers:create', 'customers:edit', 'customers:delete',
    'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
    'products:view', 'products:create', 'products:edit_prices', 'products:delete', 'stock:adjust',
    'bookings:view', 'bookings:create', 'bookings:edit', 'bookings:cancel', 'bookings:delete',
    'dispatches:view', 'dispatches:create', 'dispatches:edit', 'dispatches:delete', 'fleet:manage',
    'finance:view_ledger', 'finance:record_payment', 'finance:view_pnl', 'finance:manage_expenses', 'finance:cashbook',
    'reports:view', 'reports:export',
    'system:admin_screen', 'system:audit_view', 'system:audit_clear', 'system:backup_restore', 'system:purge_data', 'system:company_settings',
    'delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen', 'purge_data', 'manage_users'
  ],
  admin: [
    'users:view', 'users:create', 'users:edit', 'users:delete', 'users:manage_roles', 'users:force_logout',
    'roles:view', 'roles:manage', 'roles:matrix_edit', 'visibility:manage',
    'customers:view', 'customers:create', 'customers:edit', 'customers:delete',
    'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
    'products:view', 'products:create', 'products:edit_prices', 'products:delete', 'stock:adjust',
    'bookings:view', 'bookings:create', 'bookings:edit', 'bookings:cancel', 'bookings:delete',
    'dispatches:view', 'dispatches:create', 'dispatches:edit', 'dispatches:delete', 'fleet:manage',
    'finance:view_ledger', 'finance:record_payment', 'finance:view_pnl', 'finance:manage_expenses', 'finance:cashbook',
    'reports:view', 'reports:export',
    'system:admin_screen', 'system:audit_view', 'system:backup_restore', 'system:purge_data', 'system:company_settings',
    'delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen', 'purge_data', 'manage_users'
  ],
  manager: [
    'users:view',
    'customers:view', 'customers:create', 'customers:edit', 'customers:delete',
    'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
    'products:view', 'products:create', 'products:edit_prices', 'products:delete', 'stock:adjust',
    'bookings:view', 'bookings:create', 'bookings:edit', 'bookings:cancel',
    'dispatches:view', 'dispatches:create', 'dispatches:edit', 'fleet:manage',
    'finance:view_ledger', 'finance:record_payment', 'finance:view_pnl', 'finance:manage_expenses', 'finance:cashbook',
    'reports:view', 'reports:export',
    'system:admin_screen', 'system:audit_view',
    'delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen'
  ],
  editor: [
    'customers:view', 'customers:create', 'customers:edit',
    'suppliers:view', 'suppliers:create', 'suppliers:edit',
    'products:view', 'products:create',
    'bookings:view', 'bookings:create', 'bookings:edit',
    'dispatches:view', 'dispatches:create', 'dispatches:edit', 'fleet:manage',
    'finance:view_ledger', 'finance:record_payment', 'finance:cashbook',
    'reports:view',
    'manage_fleet', 'manage_expenses'
  ],
  viewer: [
    'customers:view',
    'suppliers:view',
    'products:view',
    'bookings:view',
    'dispatches:view',
    'reports:view'
  ],
  operator: [
    'customers:view', 'customers:create',
    'suppliers:view',
    'products:view',
    'bookings:view', 'bookings:create',
    'dispatches:view', 'dispatches:create', 'fleet:manage',
    'finance:record_payment',
    'manage_fleet', 'manage_expenses'
  ],
};

export interface SessionUser {
  id: string;
  name: string;
  username?: string;
  email?: string;
  role: UserRole;
  roles?: UserRole[];
  permissions?: Permission[];
  sessionToken?: string;
}

/** Manual cash movement not tied to a customer, supplier or expense (capital, drawings, loans, bank charges). */
export interface CashEntry {
  id: string;
  date: string;
  direction: 'in' | 'out';
  amount: number;
  description: string;
  method?: string;
  createdAt: string;
  createdBy?: string;
}

export interface AppSettings {
  id: 'default';
  cashOpeningBalance: number;
  cashOpeningDate: string;
  /** Shared master PIN stored in cloud settings for multi-device unlock consistency. */
  masterPin?: string;
  /** Sales tax % applied to new dispatches (0 = none). */
  taxRatePct?: number;
  taxLabel?: string;
  /** Company profile printed on documents. */
  companyName?: string;
  companyTagline?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxId?: string;
  /** Monthly sales target in Rs. shown on the dashboard (0 = off). */
  monthlyTargetRs?: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  cashOpeningBalance: 0,
  cashOpeningDate: new Date().toISOString().split('T')[0],
  taxRatePct: 0,
  taxLabel: 'Sales Tax',
  companyName: 'Sarmaya',
  companyTagline: 'Pakistani Bulk Commodity Trading & Logistics',
  companyAddress: 'Karachi, Pakistan',
  companyPhone: '',
  companyTaxId: '',
  monthlyTargetRs: 0,
};

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface Quotation {
  id: string;
  quoteNumber: string;
  customerId: string;
  productId: string;
  kg: number;
  pricePerKg: number;
  amount: number;
  validUntil: string;
  status: QuotationStatus;
  notes?: string;
  createdAt: string;
  createdBy?: string;
  bookingId?: string | null;
}

export type PurchaseOrderStatus = 'open' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  productId: string;
  kg: number;
  pricePerKg: number;
  amount: number;
  expectedDate?: string;
  status: PurchaseOrderStatus;
  receivedKg: number;
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

export type ReturnKind = 'sales' | 'purchase';

/** Goods returned by a customer (sales return, credit note) or to a supplier (purchase return, debit note). */
export interface StockReturn {
  id: string;
  returnNumber: string;
  kind: ReturnKind;
  customerId?: string | null;
  supplierId?: string | null;
  productId: string;
  dispatchId?: string | null;
  purchaseId?: string | null;
  kg: number;
  pricePerKg: number;
  amount: number;
  reason: string;
  date: string;
  createdAt: string;
  createdBy?: string;
}

export type AdjustmentReason = 'count' | 'wastage' | 'moisture' | 'damage' | 'theft' | 'other';
export const ADJUSTMENT_REASONS: { id: AdjustmentReason; label: string }[] = [
  { id: 'count', label: 'Physical count correction' },
  { id: 'wastage', label: 'Handling wastage' },
  { id: 'moisture', label: 'Moisture loss / gain' },
  { id: 'damage', label: 'Damaged / unsaleable' },
  { id: 'theft', label: 'Shortage / theft' },
  { id: 'other', label: 'Other' },
];

export interface StockAdjustment {
  id: string;
  productId: string;
  deltaKg: number;
  reason: AdjustmentReason;
  note?: string;
  date: string;
  createdAt: string;
  createdBy?: string;
}

export type TaskLinkType = 'customer' | 'supplier' | 'booking' | 'product' | 'truck';

/** Follow-up / to-do, optionally attached to a record. */
export interface Task {
  id: string;
  title: string;
  dueDate: string;
  status: 'open' | 'done';
  linkType?: TaskLinkType | null;
  linkId?: string | null;
  note?: string;
  createdAt: string;
  createdBy?: string;
  doneAt?: string | null;
}

export type AlertKind = 'low_stock' | 'overdue_receivable' | 'overdue_payable' | 'late_delivery' | 'credit_exceeded' | 'truck_maintenance' | 'undelivered' | 'task_due' | 'quote_expiring' | 'po_overdue';

export interface AppAlert {
  id: string;
  kind: AlertKind;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  detail: string;
  /** Click-through target */
  link?: { type: 'customer' | 'supplier' | 'product' | 'booking' | 'truck' | 'task' | 'quotation' | 'po'; id: string; dispatchId?: string };
}
