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
  /** The shop's own account code for this customer (e.g. from their old books). Optional, unique. */
  code?: string;
  /** Route / area the customer is in and the salesman who looks after them (defaults for new bills). */
  areaId?: string | null;
  salesmanId?: string | null;
  /** Late-payment charge: % per month on money overdue more than `interestAfterDays` days (0 / empty = off). */
  interestPctPerMonth?: number;
  interestAfterDays?: number;
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
  /** The shop's own account code for this supplier (e.g. from their old books). Optional, unique. */
  code?: string;
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
  /** Selling unit shown on bills (bag, piece, kg, ton, litre...). unitPricePerKg is the price per this unit. */
  unit?: string;
  /** Stock is received in batches with an expiry date; bills take the earliest-expiring batch first. */
  trackBatches?: boolean;
  /**
   * Optional second (bigger) unit, e.g. base unit "tin" with packName "carton" and packSize 6
   * (1 carton = 6 tins). Stock, prices and bill quantities are always kept in the base unit.
   */
  packName?: string;
  packSize?: number;
  /** The shop's own item code (typed on New Bill to find the item quickly). Optional. */
  code?: string;
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
  | 'debit_note'
  | 'bill_issued'
  /** Money handed back to a customer for goods they returned (customer debit, cash/bank out). */
  | 'refund_paid'
  /** Post-dated cheques (see Cheque below and the posting rules in utils/accounting.ts). */
  | 'cheque_received'
  | 'cheque_issued'
  | 'cheque_returned'
  | 'cheque_charge'
  /** Late-payment / interest charged on an overdue balance (a debit note to the customer). */
  | 'interest_charge';

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
  /** Id of the bill or payment that produced this row (used to reverse exactly this record). */
  sourceId?: string;
  /** Payment method for payment rows; decides cash in hand vs bank. */
  method?: string;
  /** Salesman / recovery man who collected this payment (for recovery commission). */
  salesmanId?: string | null;
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

export type ReportsTab = 'daily' | 'monthly' | 'flow' | 'pnl' | 'aging' | 'balance' | 'cashbook' | 'analytics';
export type OpsTab = 'fleet' | 'expenses' | 'alerts' | 'tasks';

export type ActiveScreen = 'dashboard' | 'customers' | 'suppliers' | 'products' | 'bookings' | 'billing' | 'reports' | 'ops' | 'admin' | 'bills' | 'daily' | 'money' | 'accounts';

/** Payment methods treated as cash in hand; everything else is the bank account. */
export const CASH_METHODS = ['Cash', 'Cash at Terminal'];
export const isCashMethod = (method?: string) => !method || CASH_METHODS.some((m) => method.toLowerCase().startsWith(m.toLowerCase()));

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
  /** Simple billing: quantity in the product's unit and the (editable) unit price. */
  qty?: number;
  unitPrice?: number;
  unit?: string;
  /** Godown the stock came from (absent = main godown). */
  godownId?: string;
  /** Batches this line took stock from (first-expiry-first-out). */
  batches?: BatchAllocation[];
  /** Line discount as typed on the bill: Rs. off the line, or % off the line. */
  discountType?: 'rs' | 'pct';
  discountValue?: number;
  /** Rs. taken off this line (amount = qty × unitPrice − discountAmount). Posted to Sales discounts 4010. */
  discountAmount?: number;
  /** The unit price came from the customer's agreed rate. */
  customerRate?: boolean;
  /** The item's pack unit at the time of the bill (qty stays in the base unit; used to print "2 ctn + 3 tins"). */
  packName?: string;
  packSize?: number;
  /** The line was typed in packs at this price per pack. */
  packPrice?: number;
  /** Free goods under a scheme (price 0): the stock leaves at cost and is booked as a scheme expense. */
  free?: boolean;
  schemeId?: string;
  schemeName?: string;
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
  /** Simple billing */
  paymentMethod?: string;
  billKind?: 'cash' | 'credit';
  /** Exact date-time the bill was made (printed under the number). */
  issuedAt?: string;
  /** Set when a bill was allowed over the customer's credit limit (who allowed it and why). */
  creditOverride?: CreditOverride;
  /** Sales returns against this bill: value credited (incl. tax) and the part paid back in money. */
  returnedAmount?: number;
  refundedAmount?: number;
  /** Quotation this bill was made from. */
  quotationId?: string | null;
  /** Salesman who made the sale and the area / route it went to (default: the customer's). */
  salesmanId?: string | null;
  areaId?: string | null;
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
  | 'daily'
  | 'employee'
  | 'food'
  | 'drawings'
  | 'bank_charges'
  | 'other'
  | 'salesman_commission';

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'daily', label: 'Day-to-day' },
  { id: 'employee', label: 'Employee expenses' },
  { id: 'food', label: 'Food & refreshments' },
  { id: 'drawings', label: 'Owner drawings' },
  { id: 'bank_charges', label: 'Bank charges' },
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
  { id: 'salesman_commission', label: 'Salesman commission' },
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
  /** Legacy 4–6 digit PIN (before username + password sign-in). Cleared once the user sets a password. */
  pin?: string;
  /** Legacy bcrypt-hashed PIN. Cleared once the user sets a password. */
  pinHash?: string | null;
  /** PBKDF2-SHA256 hash of the password, base64 (see src/lib/password.ts). Older records may hold a bcrypt hash with no salt. */
  passwordHash?: string | null;
  /** Random 16-byte salt for passwordHash, base64. */
  passwordSalt?: string | null;
  /** PBKDF2 iteration count used for passwordHash. */
  passwordIter?: number | null;
  /** True after an admin sets a temporary password or after a one-time sign-in with an old PIN: a new password must be chosen. */
  mustChangePassword?: boolean;
  /** Last change to the record (ISO); the newer copy wins when device and cloud disagree. */
  updatedAt?: string;
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
  /** Both legs of a cash<->bank transfer share one pairId and are deleted together. */
  pairId?: string;
  /** Ledger account the other side posts to (e.g. '2900' suspense). Set explicitly; never guessed from bank text. */
  accountCode?: string;
}

export interface AppSettings {
  id: 'default';
  cashOpeningBalance: number;
  cashOpeningDate: string;
  /** @deprecated Old shared master PIN. Only read once so the owner can sign in and set a password; then cleared. */
  masterPin?: string | null;
  /** Sales tax % applied to new dispatches (0 = none). */
  taxRatePct?: number;
  taxLabel?: string;
  /** Company profile printed on documents. */
  companyName?: string;
  companyTagline?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxId?: string;
  companyEmail?: string;
  /** Logo printed on bills, stored as a small data URL. */
  companyLogo?: string;
  /** Monthly sales target in Rs. shown on the dashboard (0 = off). */
  monthlyTargetRs?: number;
  /** 'billing' = simple billing screens (default); 'trading' = full commodity/logistics suite. */
  appMode?: 'billing' | 'trading';
  /** Opening bank balance counted from cashOpeningDate (cashOpeningBalance is cash in hand). */
  openingBankBalance?: number;
  /** Accounts: manual journal entries dated on or before this date are refused (period lock). */
  booksLockedUntil?: string;
  /** Bills may take an item's stock below zero (with a warning). Off = a bill short of stock is refused. */
  allowNegativeStock?: boolean;
  /** Paper for bills and receipts. Default A4. */
  billPrintSize?: BillPrintSize;
  /** Footer / terms printed at the bottom of every bill and receipt. */
  billFooter?: string;
  /** Print the customer's balance before this bill and the total owed after it. */
  showPrevBalanceOnBill?: boolean;
}

export type BillPrintSize = 'a4' | 'a5' | 'thermal80';
export const BILL_PRINT_SIZES: { id: BillPrintSize; label: string }[] = [
  { id: 'a4', label: 'A4 (full page)' },
  { id: 'a5', label: 'A5 (half page)' },
  { id: 'thermal80', label: 'Thermal 80 mm (receipt printer)' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  cashOpeningBalance: 0,
  cashOpeningDate: new Date().toISOString().split('T')[0],
  taxRatePct: 0,
  taxLabel: 'Sales Tax',
  companyName: 'Sarmaya',
  companyTagline: '',
  companyAddress: 'Karachi, Pakistan',
  companyPhone: '',
  companyTaxId: '',
  companyEmail: '',
  companyLogo: '',
  monthlyTargetRs: 0,
  appMode: 'billing',
  openingBankBalance: 0,
};

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

/** One line of a billing-mode quotation (qty in the item's own unit). */
export interface QuotationLine {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  unit?: string;
}

export interface Quotation {
  id: string;
  quoteNumber: string;
  customerId: string;
  /** First line's item (older single-item quotes only have these). */
  productId: string;
  kg: number;
  pricePerKg: number;
  /** Quotation total. */
  amount: number;
  validUntil: string;
  status: QuotationStatus;
  notes?: string;
  createdAt: string;
  createdBy?: string;
  bookingId?: string | null;
  /** Billing mode: several items per quotation. */
  items?: QuotationLine[];
  /** Bill made from this quotation. */
  invoiceId?: string | null;
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
  /** Billing purchase returns: godown and batches the goods left from, and the item's unit. */
  godownId?: string | null;
  batches?: BatchAllocation[];
  unit?: string;
  /** Billing mode: the bill these goods were sold on, and the lines returned. */
  invoiceId?: string | null;
  items?: ReturnLine[];
  /** Part of `amount` that is sales tax being reversed. */
  taxAmount?: number;
  /** Part of `amount` paid back to the customer in money now (the rest reduces what they owe). */
  refundAmount?: number;
  refundMethod?: string;
}

/** One returned line of a bill. */
export interface ReturnLine {
  /** InvoiceItem.id this line came from. */
  billLineId: string;
  productId: string;
  productName: string;
  unit?: string;
  qty: number;
  /** Value per unit credited, after line and bill discounts, before tax. */
  unitPrice: number;
  /** qty × unitPrice (before tax). */
  amount: number;
  /** Cost per unit when it was sold, so stock comes back at the same value. */
  costPricePerKg?: number;
  /** Where the stock went back to. */
  godownId?: string;
  batches?: BatchAllocation[];
}

export type AdjustmentReason = 'count' | 'wastage' | 'moisture' | 'damage' | 'theft' | 'other' | 'received' | 'leaked' | 'expired' | 'free';
export const ADJUSTMENT_REASONS: { id: AdjustmentReason; label: string }[] = [
  { id: 'count', label: 'Physical count correction' },
  { id: 'wastage', label: 'Handling wastage' },
  { id: 'moisture', label: 'Moisture loss / gain' },
  { id: 'damage', label: 'Damaged / unsaleable' },
  { id: 'theft', label: 'Shortage / theft' },
  { id: 'other', label: 'Other' },
  { id: 'received', label: 'Stock received (no supplier bill)' },
  { id: 'leaked', label: 'Leaked' },
  { id: 'expired', label: 'Expired' },
  { id: 'free', label: 'Received free' },
];

/** The reasons offered on the simple (billing) stock adjustment form. */
export const BILLING_ADJUST_REASONS: { id: AdjustmentReason; label: string; direction: 'out' | 'in' | 'either' }[] = [
  { id: 'leaked', label: 'Leaked', direction: 'out' },
  { id: 'damage', label: 'Damaged', direction: 'out' },
  { id: 'expired', label: 'Expired', direction: 'out' },
  { id: 'count', label: 'Count correction', direction: 'either' },
  { id: 'free', label: 'Received free', direction: 'in' },
  { id: 'other', label: 'Other', direction: 'either' },
];

export const adjustmentReasonLabel = (reason: string): string =>
  BILLING_ADJUST_REASONS.find((r) => r.id === reason)?.label || ADJUSTMENT_REASONS.find((r) => r.id === reason)?.label || reason;

export interface StockAdjustment {
  id: string;
  productId: string;
  deltaKg: number;
  reason: AdjustmentReason;
  /** Cost per unit at the time, so the ledger values it at what it cost then, not today's price. */
  costPerKg?: number;
  note?: string;
  date: string;
  createdAt: string;
  createdBy?: string;
  /** Godown / batch the adjustment was made in (absent = plain stock in the main godown). */
  godownId?: string | null;
  batchId?: string | null;
  batchNo?: string;
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

// ---------------------------------------------------------------------------
// Credit limits on bills
// ---------------------------------------------------------------------------
export interface CreditOverride {
  by: string;
  reason: string;
  at?: string;
  /** Credit limit and what the customer owed after this bill, at the time it was allowed. */
  limit?: number;
  dueAfter?: number;
}

// ---------------------------------------------------------------------------
// Bank reconciliation
// ---------------------------------------------------------------------------
export type BankLineStatus = 'unmatched' | 'matched' | 'ignored';
export type BankMatchConfidence = 'exact' | 'high' | 'medium' | 'manual';

/** One line of a bank statement: + money into the bank, − money out. */
export interface BankStatementLine {
  id: string;
  date: string;
  description: string;
  amount: number;
  reference?: string;
  importedAt: string;
  /** Cash-book movement ids (CashMovement.id, e.g. "cm-exp-…") this line was matched to. */
  matchedMovementIds: string[];
  status: BankLineStatus;
  matchConfidence?: BankMatchConfidence;
  /** Expense / cash entry created from this line ("add missing record"). */
  createdEntryId?: string;
}

/** A reconciliation for one statement end date. */
export interface BankReconciliation {
  id: string;
  statementDate: string;
  closingBalance: number;
  /** Book movements the user ticked as cleared (shown on the bank statement). */
  clearedMovementIds: string[];
  bookBalance?: number;
  difference?: number;
  reconciled?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Inventory: godowns (warehouses), stock batches with expiry, transfers between godowns.
// Product.stockKg stays the TOTAL across godowns. Stock in the main godown that is not in any
// batch row is implied: stockKg − sum of all StockBatch rows of the item.
// ---------------------------------------------------------------------------

export interface Godown {
  id: string;
  name: string;
  address?: string;
  isDefault: boolean;
  createdAt?: string;
}

/**
 * Stock of one item in one godown. A row with an empty batchNo is plain (untracked) stock kept
 * in a godown other than the main one.
 */
export interface StockBatch {
  id: string;
  productId: string;
  godownId: string;
  batchNo: string;
  expiryDate?: string;
  qty: number;
  receivedDate: string;
  costPrice?: number;
  supplierId?: string | null;
  purchaseId?: string | null;
  createdAt?: string;
}

export interface BatchAllocation {
  batchId: string;
  batchNo: string;
  expiryDate?: string;
  qty: number;
  godownId?: string;
}

export interface StockTransfer {
  id: string;
  productId: string;
  fromGodownId: string;
  toGodownId: string;
  qty: number;
  date: string;
  note?: string;
  batches?: BatchAllocation[];
  createdAt: string;
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Post-dated cheques (PDC register)
// ---------------------------------------------------------------------------
/**
 * received: from a customer → in_hand → deposited → cleared, or bounced / cancelled (given back).
 * issued:   to a supplier   → issued → cleared, or cancelled.
 */
export type ChequeDirection = 'received' | 'issued';
export type ChequeStatus = 'in_hand' | 'deposited' | 'issued' | 'cleared' | 'bounced' | 'cancelled';

export interface Cheque {
  id: string;
  direction: ChequeDirection;
  customerId?: string | null;
  supplierId?: string | null;
  /** Customer / supplier name at the time (kept for the register if the party is renamed or deleted). */
  partyName: string;
  bankName: string;
  chequeNumber: string;
  amount: number;
  /** Date written on the cheque: may be in the future (post-dated). */
  chequeDate: string;
  /** Day the cheque was received from the customer / handed to the supplier (the books date). */
  entryDate: string;
  /** Bill this cheque pays (received cheques only). */
  invoiceId?: string | null;
  status: ChequeStatus;
  depositedDate?: string | null;
  clearedDate?: string | null;
  /** Bounced or cancelled on this date. */
  returnedDate?: string | null;
  returnReason?: string;
  /** Bank's charge for the bounced cheque and who carries it. */
  bankCharge?: number;
  chargeTo?: 'customer' | 'shop' | null;
  note?: string;
  /** Records this cheque created, so it can be reversed exactly and they can't be deleted on their own. */
  ledgerId?: string | null;
  reversalLedgerId?: string | null;
  clearedEntryId?: string | null;
  chargeExpenseId?: string | null;
  chargeLedgerId?: string | null;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Sales team, routes and trade schemes (see context/salesExtrasActions.ts)
// ---------------------------------------------------------------------------
/** What a salesman's commission is worked out on: the bills they made, or the cash they recovered. */
export type CommissionBasis = 'sales' | 'recovery';

export interface Salesman {
  id: string;
  name: string;
  phone?: string;
  /** Commission % (0 / empty = no commission). */
  commissionPct?: number;
  commissionOn?: CommissionBasis;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** A route / area the shop sells into (e.g. "Saddar", "Korangi route"). */
export interface SalesArea {
  id: string;
  name: string;
  note?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

/**
 * free_every: every `buyQty` bought gives `freeQty` free (buy 10 get 1).
 * free_slab:  the highest slab reached gives its free qty once (50+ → 3 free, 100+ → 7 free).
 * pct_off:    `pctOff` % off the line when at least `minQty` is bought.
 */
export type SchemeKind = 'free_every' | 'free_slab' | 'pct_off';

export interface SchemeSlab {
  minQty: number;
  freeQty: number;
}

export interface Scheme {
  id: string;
  name: string;
  productId: string;
  kind: SchemeKind;
  buyQty?: number;
  freeQty?: number;
  slabs?: SchemeSlab[];
  minQty?: number;
  pctOff?: number;
  /** Item given free (default: the same item). */
  freeProductId?: string | null;
  /** Valid from / to (inclusive); empty = open-ended. */
  fromDate?: string;
  toDate?: string;
  /** Only for these customers (empty = everyone). */
  customerIds?: string[];
  active: boolean;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}
