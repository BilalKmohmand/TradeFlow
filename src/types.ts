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
  stockKg: number;
  minThresholdKg: number;
  supplierId?: string | null;
  description?: string;
}

export type BookingStatus = 'active' | 'completed' | 'cancelled';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface Booking {
  id: string;
  bookingNumber: string;
  customerId: string;
  productId: string;
  totalKg: number;
  dispatchedKg: number;
  remainingKg: number;
  pricePerKg: number;
  totalAmount: number;
  paidAmount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  targetDeliveryDate?: string;
  notes?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface Dispatch {
  id: string;
  dispatchNumber: string;
  bookingId: string;
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
}

export type TransactionType =
  | 'booking_invoice'
  | 'dispatch_billed'
  | 'payment_received'
  | 'payment_made'
  | 'purchase_received';

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
export type OpsTab = 'fleet' | 'expenses' | 'alerts';

export type ActiveScreen = 'dashboard' | 'customers' | 'suppliers' | 'products' | 'bookings' | 'reports' | 'ops' | 'admin';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  severity: 'info' | 'warning' | 'danger';
  /** Name of the signed-in user who performed the action. */
  user?: string;
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

export type UserRole = 'admin' | 'manager' | 'operator';

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  active: boolean;
  createdAt: string;
}

export type Permission =
  | 'delete_records'
  | 'edit_prices'
  | 'override_credit'
  | 'view_finance'
  | 'manage_fleet'
  | 'manage_expenses'
  | 'admin_screen'
  | 'purge_data'
  | 'manage_users';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ['delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen', 'purge_data', 'manage_users'],
  manager: ['delete_records', 'edit_prices', 'override_credit', 'view_finance', 'manage_fleet', 'manage_expenses', 'admin_screen'],
  operator: ['manage_fleet', 'manage_expenses'],
};

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
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
}

export type AlertKind = 'low_stock' | 'overdue_receivable' | 'overdue_payable' | 'late_delivery' | 'credit_exceeded' | 'truck_maintenance';

export interface AppAlert {
  id: string;
  kind: AlertKind;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  detail: string;
  /** Click-through target */
  link?: { type: 'customer' | 'supplier' | 'product' | 'booking' | 'truck'; id: string };
}
