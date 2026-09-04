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
  unitPricePerTon: number;
  stockTons: number;
  minThresholdTons: number;
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
  totalTons: number;
  dispatchedTons: number;
  remainingTons: number;
  pricePerTon: number;
  totalAmount: number;
  paidAmount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  targetDeliveryDate?: string;
  notes?: string;
}

export interface Dispatch {
  id: string;
  dispatchNumber: string;
  bookingId: string;
  customerId: string;
  productId: string;
  tons: number;
  amount: number;
  truckNumber: string;
  driverPhone?: string;
  date: string;
  notes?: string;
  whatsappSent: boolean;
  whatsappMessage?: string;
  paymentReceivedImmediately?: boolean;
}

export type TransactionType = 'booking_invoice' | 'dispatch_billed' | 'payment_received' | 'payment_made';

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
  tons?: number;
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

export type ActiveScreen = 'dashboard' | 'customers' | 'suppliers' | 'products' | 'bookings' | 'reports' | 'admin';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  severity: 'info' | 'warning' | 'danger';
}
