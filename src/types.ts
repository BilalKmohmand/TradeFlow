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
  /** When a payment reminder was last sent to this customer (ISO date-time), so nobody is reminded twice too soon. */
  lastRemindedAt?: string | null;
  /** City / town (Search party by city; the city-wise receivable & payable reports). */
  city?: string;
  /** Person to talk to at the shop / firm. */
  contactPerson?: string;
  /** Sales tax registration number (STRN). */
  salesTaxNo?: string;
  fax?: string;
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
  /** City / town (Search party by city; the city-wise receivable & payable reports). */
  city?: string;
  /** Person to talk to at the shop / firm. */
  contactPerson?: string;
  /** Sales tax registration number (STRN). */
  salesTaxNo?: string;
  fax?: string;
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
  /** Item group is `category` (e.g. Ghee, Cooking oil). Brand, e.g. Dalda, Habib. Optional. */
  brand?: string;
  /** Barcode printed on the pack (EAN/UPC or the shop's own); a scan finds the item. Optional. */
  barcode?: string;
  /** Small photo as a JPEG data URL (resized on the device to a few tens of KB). Optional. */
  photo?: string;
  /**
   * Re-order: minThresholdKg is the re-order level (stock at or below it needs buying);
   * reorderQty is how much is normally ordered then (0 / empty = suggest enough for twice the level).
   */
  reorderQty?: number;
  /**
   * Coding › Opening Stocks: opening quantity entered for each store other than the main godown
   * (godown id → qty). The main godown's opening is the item's total opening minus these.
   */
  openingByGodown?: Record<string, number>;
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
  | 'interest_charge'
  /**
   * Supplier bill differs from the value of the goods received (booked at the receipt rate):
   * debit = the bill is more (owed more), credit = the bill is less. See purchasingActions.ts.
   */
  | 'purchase_variance'
  /** Accepted supplier claim (leaked / damaged / short goods): takes it off what is owed (debit note). */
  | 'supplier_claim'
  /** A line of a voucher (CPV / CRV / BPV / BRV / JV) on a party that is not a plain payment (see utils/vouchers.ts). */
  | 'voucher'
  /** Old khata balance brought over when the party was set up (customer: owes us; supplier: we owe). Negative = advance. */
  | 'opening_balance';

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
  /** Branch (shop) where the money moved; absent = the main branch. */
  branchId?: string | null;
  /** Bank account (chart code, e.g. 1010 main bank, 1011, 1012…) the money went through; empty = the main bank 1010. Ignored for cash. */
  bankCode?: string;
  /** Voucher (CPV / CRV / BPV / BRV / JV) this row was posted from: changed or deleted only through the voucher. */
  voucherId?: string;
  /** Payment rows: the note typed with the payment (kept apart so an edit can show it again). */
  note?: string;
  /** Payment rows: every change made after saving (Edit payment). */
  edits?: PaymentEdit[];
}

/** One change to a saved payment: when, who, and what changed ("amount Rs. 500 → Rs. 400"). */
export interface PaymentEdit {
  at: string;
  by?: string;
  changes: string;
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
  /** Line of the purchase order this receipt was received against (multi-line orders). */
  poLineId?: string | null;
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

/**
 * Every screen the app can show. `purchases` (purchase invoices) and `reports-hub` (the classic
 * Reports menu) belong to the "Apna Accountant" layer. A screen added later (vouchers, an
 * any-account ledger, a chart-of-accounts tree, bank accounts, a city-wise report) just adds its
 * id here: the classic menu and the Reports hub then open it instead of their fallback
 * (see utils/classicMenu.ts, PARTNER_SCREENS).
 */
export const ACTIVE_SCREENS = ['dashboard', 'customers', 'suppliers', 'products', 'bookings', 'billing', 'reports', 'ops', 'admin', 'bills', 'daily', 'money', 'accounts', 'owner', 'purchases', 'reports-hub', 'coding'] as const;
export type ActiveScreen = (typeof ACTIVE_SCREENS)[number];

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
  /** The customer ledger row this payment posted (links an edit of the payment back to the bill). */
  ledgerId?: string;
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
  /** Optional cost / profit centre tag (branch, area, vehicle) for the P&L by cost centre. */
  costCentreId?: string | null;
  /** Branch (shop) the bill was made in; absent = the main branch. */
  branchId?: string | null;
  /** Set when the bill needed a manager's approval before it was posted. */
  approval?: { requestId: string; requestedBy?: string; approvedBy?: string; approvedAt?: string; note?: string; rules?: string[] };
  /** Short tag of the device the bill was made on (used to settle a number two devices both used). */
  deviceId?: string;
  /** The number the bill had before it was renumbered because another device had already used it. */
  renumberedFrom?: string;
  /** Memo no.: the shop's own book / reference number written on the bill (printed and searchable). */
  memoNo?: string;
  /** Exact date-time the bill was typed in ("entered on"), whatever the bill date ("your date") is. */
  enteredAt?: string;
  /** Earlier versions of this bill, kept each time it was edited (newest last). */
  editHistory?: { editedAt: string; editedBy?: string; summary: string; before: Omit<Invoice, 'editHistory'> }[];
  /** Delivery order: the goods go out later. Stock is still taken when the bill is made. */
  delivery?: DeliveryInfo;
  /** "Sale a/c" picked on the bill (an income account code); absent = Sales 4000. The goods are credited here. */
  saleAccountCode?: string;
  /** Cash sale: the walk-in buyer's name typed on the bill (the bill itself is on the "Cash Sale" account). */
  walkInName?: string;
  /** Made on the Cash Sale Invoice screen (paid in full in cash). */
  cashSale?: boolean;
}

/** Delivery of a bill marked "Delivery order": pending until someone marks it delivered. */
export interface DeliveryInfo {
  status: 'pending' | 'delivered';
  /** Date the goods were delivered. */
  deliveredOn?: string;
  /** Who delivered (driver / staff name). */
  deliveredBy?: string;
  vehicle?: string;
  note?: string;
  /** Signed-in user who marked it delivered, and when. */
  markedBy?: string;
  markedAt?: string;
}

/** One line of a purchase invoice. Quantities and rates are per base unit (can, tin, kg…). */
export interface PurchaseInvoiceLine {
  id: string;
  productId: string;
  productName: string;
  code?: string;
  unit: string;
  /** Pack (e.g. carton of 4) the line was typed in, if any: qty = packs × packSize. */
  packName?: string;
  packSize?: number;
  packs?: number;
  qty: number;
  /** Rate on the supplier's bill, per base unit. */
  rate: number;
  /** qty × rate (before the bill discount / other charges). */
  amount: number;
  /** Cost per base unit after the bill discount and other charges are spread over the lines. */
  landedRate: number;
  /** Stock receipt made for this line (Purchase id). */
  purchaseId?: string;
  batchNo?: string;
  expiryDate?: string;
}

/**
 * Purchase invoice ("Purchase Invoice" in Apna Accountant): the supplier's bill typed in as one
 * document. Saving it receives every line into stock (one Purchase per line, at the landed cost),
 * owes the supplier the bill total and records any amount paid now. See context/classicActions.ts.
 */
export interface PurchaseInvoice {
  id: string;
  /** Our number (series "purchase_invoice", default P-1, P-2…). */
  invoiceNumber: string;
  /** Memo no.: the supplier's own bill number. */
  memoNo?: string;
  date: string;
  supplierId: string;
  supplierName: string;
  godownId?: string | null;
  lines: PurchaseInvoiceLine[];
  /** Σ line amounts. */
  grossAmount: number;
  discountPct?: number;
  discountAmount: number;
  otherCharges: number;
  /** gross − discount + other charges: what is owed to the supplier for this bill. */
  totalAmount: number;
  paidAmount: number;
  paidMethod?: string;
  /** Ledger rows made with the invoice: the payment made now and the paisa rounding difference. */
  paymentLedgerId?: string | null;
  roundingLedgerId?: string | null;
  remarks?: string;
  createdAt: string;
  createdBy?: string;
  /** Last changed (Search → edit on the Purchase Invoice screen). */
  updatedAt?: string;
  updatedBy?: string;
  branchId?: string | null;
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
  /** Optional cost / profit centre tag (branch, area, vehicle) for the P&L by cost centre. */
  costCentreId?: string | null;
  /** Branch (shop) that paid it; absent = the main branch. */
  branchId?: string | null;
  /** Bank account (chart code, e.g. 1010 main bank, 1011, 1012…) the money went through; empty = the main bank 1010. Ignored for cash. */
  bankCode?: string;
  /** Voucher (CPV / CRV / BPV / BRV / JV) this row was posted from: changed or deleted only through the voucher. */
  voucherId?: string;
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
  /** PBKDF2-SHA256 hash of the password, base64 (see src/lib/password.ts). Older records may hold a bcrypt hash with no salt. Kept on the device only (not synced). */
  passwordHash?: string | null;
  /** Random 16-byte salt for passwordHash, base64. */
  passwordSalt?: string | null;
  /** PBKDF2 iteration count used for passwordHash. */
  passwordIter?: number | null;
  /** This device knows the user has a Supabase Auth login (set after a successful cloud sign-in). Device-only. */
  cloudLinked?: boolean;
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
  /** Default branch (shop) this user works in; bills, expenses and cash entries they make are recorded there. */
  branchId?: string | null;
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
  | 'system:company_settings'
  | 'approvals:approve';

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
  | 'manage_users'
  /** Worked out, never stored on a role: the user holds at least one right that changes data (not only "view"). */
  | 'data:write';

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
    'system:admin_screen', 'system:audit_view', 'approvals:approve',
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
  /** Branch (shop) of the drawer / account; absent = the main branch. */
  branchId?: string | null;
  /** Bank account (chart code, e.g. 1010 main bank, 1011, 1012…) the money went through; empty = the main bank 1010. Ignored for cash. */
  bankCode?: string;
  /** Voucher (CPV / CRV / BPV / BRV / JV) this row was posted from: changed or deleted only through the voucher. */
  voucherId?: string;
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
  /** First day of the financial year as "MM-DD" (default "07-01": 1 July, Pakistan). */
  financialYearStart?: string;
  /** Where each field is printed on the shop's bank cheque (see utils/chequePrint.ts). */
  chequeLayout?: ChequeLayout;
  /** Approval rules (see ApprovalRules): what staff without approval rights must send to a manager. */
  approvalRules?: ApprovalRules;
  /** Document number series: prefix, yearly reset and padding per kind of document. */
  numberSeries?: Partial<Record<DocSeriesKey, DocSeriesConfig>>;
  /** Last number used per series (key = series, or series:year for yearly series). Never goes down, so a deleted number is never reused. */
  docCounters?: Record<string, number>;
  /** Automatic payment reminders (off by default): who is listed on Home to be reminded on WhatsApp. */
  reminders?: ReminderSettings;
  /** Show the classic "Apna Accountant" menu (16 big buttons) on Home. On unless set to false. */
  classicMenu?: boolean;
  /** Opening balance of each extra bank account by chart code (1011, 1012…) on cashOpeningDate. The main bank (1010) uses openingBankBalance. */
  bankOpenings?: Record<string, number>;
  /** Name shown for the main bank account 1010 (e.g. "HBL current"); default "Main bank". */
  mainBankName?: string;
  /** Cities / towns offered when adding a customer or supplier (free text is allowed too). */
  cities?: string[];
  /** Coding › Product Unit Coding: units offered on items (tin, can, ctn…). Unset = the built-in list. */
  productUnits?: string[];
  /** Coding › Product Group Coding: item groups (kept on Product.category). */
  productGroups?: string[];
  /** Coding › Manufacturer Coding: brands / manufacturers (kept on Product.brand). */
  manufacturers?: string[];
}

/**
 * Payment reminders: a customer is listed when their oldest unpaid bill is `daysAfterDue` days past its
 * due date or `olderThanDays` days old (either rule may be off = null), at most once every `everyDays` days.
 */
export interface ReminderSettings {
  enabled: boolean;
  daysAfterDue: number | null;
  olderThanDays: number | null;
  everyDays: number;
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
  companyAddress: '',
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
  /** The item's pack at the time (qty stays in the base unit; prints "2 ctn + 3 tins"). */
  packName?: string;
  packSize?: number;
  /** The line was typed in packs at this price per pack. */
  packPrice?: number;
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
  /** Single-item orders (trading mode) use these; multi-line orders keep the first line / totals here. */
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
  /** Billing mode: several items per order, each with its own rate and received quantity. */
  items?: PurchaseOrderLine[];
  /** Date on the order (defaults to createdAt). */
  orderDate?: string;
  updatedAt?: string;
  cancelledAt?: string | null;
}

/** One line of a multi-line purchase order (quantities and rates in the item's base unit). */
export interface PurchaseOrderLine {
  id: string;
  productId: string;
  productName?: string;
  unit?: string;
  qty: number;
  rate: number;
  receivedQty: number;
}

/** One line of a supplier's invoice as typed from their paper (quantities in the item's base unit). */
export interface SupplierBillLine {
  productId: string;
  productName?: string;
  unit?: string;
  qty: number;
  rate: number;
  amount: number;
}

/**
 * The supplier's own invoice for goods already received (three-way match: order, receipt, bill).
 * The payable was booked at the receipt; only the difference (amount − receivedValue) is posted,
 * as a `purchase_variance` ledger row, so the supplier's balance ends at exactly the bill amount.
 */
export interface SupplierBill {
  id: string;
  /** The supplier's bill / invoice number. */
  billNumber: string;
  supplierId: string;
  date: string;
  purchaseOrderId?: string | null;
  /** Stock receipts (Purchase ids) this bill covers. */
  purchaseIds: string[];
  lines: SupplierBillLine[];
  /** Freight, loading or other charges on the bill. */
  otherCharges?: number;
  /** Bill total (lines + other charges). */
  amount: number;
  /** Value of the covered receipts at the receipt rates (what was already booked). */
  receivedValue: number;
  /** amount − receivedValue: posted as a price difference. */
  variance: number;
  ledgerId?: string | null;
  note?: string;
  createdAt: string;
  createdBy?: string;
}

export type SupplierClaimStatus = 'open' | 'accepted' | 'rejected' | 'settled';
export type SupplierClaimReason = 'leaked' | 'damaged' | 'short' | 'expired' | 'wrong_item' | 'other';
export const SUPPLIER_CLAIM_REASONS: { id: SupplierClaimReason; label: string }[] = [
  { id: 'leaked', label: 'Leaked' },
  { id: 'damaged', label: 'Damaged' },
  { id: 'short', label: 'Short (less than billed)' },
  { id: 'expired', label: 'Expired' },
  { id: 'wrong_item', label: 'Wrong item' },
  { id: 'other', label: 'Other' },
];

/** A claim against a supplier for leaked / damaged / short goods from a receipt. */
export interface SupplierClaim {
  id: string;
  claimNumber: string;
  supplierId: string;
  /** Stock receipt the goods came on. */
  purchaseId?: string | null;
  productId: string;
  qty: number;
  rate: number;
  /** Amount claimed. */
  amount: number;
  reason: SupplierClaimReason;
  note?: string;
  date: string;
  status: SupplierClaimStatus;
  /** Amount the supplier accepted (may be less than claimed); posted as a debit note. */
  acceptedAmount?: number;
  decidedDate?: string | null;
  settledDate?: string | null;
  decisionNote?: string;
  ledgerId?: string | null;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
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
  /** The item's pack on the bill (qty stays in the base unit; prints "1 ctn + 2 tins"). */
  packName?: string;
  packSize?: number;
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
  /** Bank account (chart code) this statement belongs to; empty = the main bank 1010. */
  bankCode?: string;
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
  /** Bank account (chart code) reconciled; empty = the main bank 1010. */
  bankCode?: string;
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
  /** The shop's bank account (chart code) it was deposited into / drawn on; empty = the main bank 1010. */
  bankCode?: string;
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

// ---------------------------------------------------------------------------
// Finance: fixed assets, staff & salaries, budgets, cost centres, year-end close, cheque printing.
// The journal postings for all of these are derived in utils/financeBooks.ts (see the notes there).
// ---------------------------------------------------------------------------
export type AssetCategory = 'vehicle' | 'generator' | 'fittings' | 'equipment' | 'computer' | 'building' | 'other';
export const ASSET_CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'generator', label: 'Generator / UPS' },
  { id: 'fittings', label: 'Shop fittings & furniture' },
  { id: 'equipment', label: 'Equipment / machinery' },
  { id: 'computer', label: 'Computer / phone' },
  { id: 'building', label: 'Building / shop' },
  { id: 'other', label: 'Other' },
];

export type DepreciationMethod = 'straight_line' | 'reducing_balance';

/** How a fixed asset was paid for. 'owned' = already owned when the books started (opening balance). */
export type AssetPaidFrom = 'cash' | 'bank' | 'credit' | 'owned';

export interface AssetPayment {
  id: string;
  date: string;
  amount: number;
  method: string;
  /** Cash-book entry (accountCode 2060) that paid the creditor. */
  cashEntryId: string;
}

export interface FixedAsset {
  id: string;
  name: string;
  category: AssetCategory;
  purchaseDate: string;
  cost: number;
  paidFrom: AssetPaidFrom;
  /** Seller, for an asset bought on credit. */
  vendor?: string;
  usefulLifeYears: number;
  residualValue: number;
  method: DepreciationMethod;
  /** Reducing balance: % per year (default 2 ÷ life). */
  ratePct?: number;
  /** Depreciation already charged before the app (owned assets only). */
  openingAccumulated?: number;
  costCentreId?: string | null;
  note?: string;
  /** Cash-book entry (accountCode 1500) that paid for it (cash / bank purchases). */
  purchaseEntryId?: string | null;
  /** Payments made later to the seller of an asset bought on credit. */
  payments?: AssetPayment[];
  status: 'in_use' | 'disposed';
  disposalDate?: string | null;
  disposalProceeds?: number;
  disposalMethod?: 'cash' | 'bank' | null;
  disposalEntryId?: string | null;
  disposalNote?: string;
  createdAt: string;
  createdBy?: string;
}

export interface DepreciationLine {
  assetId: string;
  amount: number;
  /** Months (YYYY-MM) this line charges. */
  months: string[];
}

/** One "Run depreciation" for a month or a financial year. A month is never charged twice for an asset. */
export interface DepreciationRun {
  id: string;
  /** "2026-03" for a month, "FY 2025-26" for a year. */
  period: string;
  months: string[];
  date: string;
  lines: DepreciationLine[];
  total: number;
  createdAt: string;
  createdBy?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  monthlySalary: number;
  phone?: string;
  joinDate: string;
  active: boolean;
  cnic?: string;
  createdAt: string;
}

/** Money lent to a staff member (a receivable, account 1160), recovered through the salary sheet. */
export interface StaffAdvance {
  id: string;
  staffId: string;
  date: string;
  amount: number;
  method: string;
  note?: string;
  /** Cash-book entry (accountCode 1160) that paid it out. */
  cashEntryId: string;
  createdAt: string;
  createdBy?: string;
}

export interface SalaryLine {
  staffId: string;
  name: string;
  role?: string;
  salary: number;
  bonus: number;
  deductions: number;
  /** Part of the staff member's advance recovered from this salary. */
  advanceDeducted: number;
  /** salary + bonus − deductions − advanceDeducted: what is handed over. */
  net: number;
  note?: string;
}

/** One month's salary sheet, paid. */
export interface SalaryRun {
  id: string;
  /** YYYY-MM */
  month: string;
  /** Day the salaries were paid (the books date). */
  date: string;
  method: string;
  lines: SalaryLine[];
  /** salary + bonus − deductions for everyone: the salary expense. */
  totalGross: number;
  totalAdvance: number;
  totalNet: number;
  /** Expense row (category salaries) that paid the net amount; null when nothing was paid in money. */
  expenseId?: string | null;
  createdAt: string;
  createdBy?: string;
}

/** Budget for one income / expense account in one month. */
export interface Budget {
  id: string;
  /** YYYY-MM */
  month: string;
  accountCode: string;
  amount: number;
}

export type CostCentreKind = 'branch' | 'area' | 'vehicle' | 'other';
export interface CostCentre {
  id: string;
  name: string;
  kind: CostCentreKind;
  active: boolean;
  createdAt: string;
}

/** A closed financial year: profit carried to retained earnings / capital and books locked. */
export interface YearClose {
  id: string;
  label: string;
  start: string;
  end: string;
  profit: number;
  /** Equity account the profit went to (3200 retained earnings or 3000 capital). */
  toAccount: string;
  journalId: string;
  /** Lock date before this close (restored if the close is undone). */
  previousLock?: string | null;
  createdAt: string;
  createdBy?: string;
}

/** A field position on the cheque, in mm from the top-left corner of the cheque leaf. */
export interface ChequeFieldPos {
  x: number;
  y: number;
}

export interface ChequeLayout {
  widthMm: number;
  heightMm: number;
  fontSizePt: number;
  date: ChequeFieldPos;
  /** Gap between date digits in mm (for cheques with DDMMYYYY boxes; 0 = print "21-09-2026"). */
  dateDigitGapMm: number;
  payee: ChequeFieldPos;
  words: ChequeFieldPos;
  /** Width of the amount-in-words line (wraps to a second line after this). */
  wordsWidthMm: number;
  figures: ChequeFieldPos;
  /** Print "A/C Payee Only" across the top-left corner. */
  acPayee: boolean;
}

// ---------------------------------------------------------------------------
// Controls: approvals, deleted records bin, document numbers, branches
// ---------------------------------------------------------------------------
/** Limits set by the admin. A rule that is null / false is off. */
export interface ApprovalRules {
  /** Bill discount (line + bill discounts, % of the items before discount) above this needs approval. */
  discountPctAbove?: number | null;
  /** A bill that takes the customer over their credit limit goes for approval instead of being refused. */
  creditLimit?: boolean;
  /** A payment (cash, bank or cheque) to a supplier above this amount needs approval. */
  supplierPaymentAbove?: number | null;
  /** Stock taken off (leaked, damaged, expired, count) worth more than this at cost needs approval. */
  stockLossAbove?: number | null;
  /** Deleting any bill needs approval. */
  deleteBills?: boolean;
}

export type ApprovalKind = 'bill' | 'supplier_payment' | 'supplier_cheque' | 'stock_loss' | 'delete_bill' | 'voucher';
export type ApprovalRuleKey = 'discount' | 'credit_limit' | 'supplier_payment' | 'stock_loss' | 'delete_bill';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** A document waiting for a manager: only its input is stored, so nothing is posted until it is approved. */
export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  rules: ApprovalRuleKey[];
  status: ApprovalStatus;
  /** One line, e.g. "Bill for Ali Traders — Rs. 12,000". */
  title: string;
  /** Why it needs approval, e.g. "Discount 15% (limit 10%)". */
  reasons: string[];
  amount: number;
  /** The original input (bill, payment, adjustment or the bill to delete). */
  payload: any;
  /** Note from the person asking (e.g. why the discount). */
  note?: string;
  requestedBy?: string;
  requestedById?: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  /** What approving created or removed (e.g. the bill number). */
  resultRef?: string;
  branchId?: string | null;
  updatedAt?: string;
}

export type DeletedKind =
  | 'bill' | 'customer' | 'supplier' | 'item' | 'expense' | 'cash_entry' | 'return' | 'debit_note' | 'quotation'
  | 'purchase_order' | 'stock_receipt' | 'stock_adjustment' | 'journal' | 'payment' | 'booking' | 'dispatch'
  | 'supplier_bill' | 'supplier_claim' | 'fixed_asset' | 'staff' | 'staff_advance' | 'cost_centre' | 'salesman' | 'area' | 'scheme' | 'godown' | 'voucher'
  | 'other';

/** A copy of a deleted record: who deleted it, when and why. */
export interface DeletedRecord {
  id: string;
  kind: DeletedKind;
  recordId: string;
  /** One line shown in the list, e.g. "Bill INV-12 • Ali Traders • Rs. 5,000". */
  label: string;
  data: any;
  /** Other rows removed with it (for reference only). */
  related?: any;
  reason?: string;
  deletedBy?: string;
  deletedAt: string;
  restoredAt?: string | null;
  restoredBy?: string | null;
}

export type DocSeriesKey = 'bill' | 'credit_note' | 'debit_note' | 'quotation' | 'receipt' | 'supplier_payment' | 'po' | 'purchase_invoice' | 'cpv' | 'crv' | 'bpv' | 'brv' | 'jv';

export interface DocSeriesConfig {
  prefix: string;
  /** Start again at 1 every calendar year: INV-2026-0001. */
  yearly?: boolean;
  /** Digits (zero padded), 0 = as is. */
  pad?: number;
  /** Next number to use when it should jump ahead (e.g. continue from the old desktop app). */
  startAt?: number | null;
}

/** A shop / branch. The first one is the main branch; rows with no branch belong to it. */
export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  /** Godowns that belong to this branch. */
  godownIds?: string[];
  createdAt: string;
  updatedAt?: string;
}
