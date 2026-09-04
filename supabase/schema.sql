-- Sarmaya / TradeFlow schema. Run in the Supabase SQL editor on a fresh project.
-- Column names mirror the TypeScript interfaces (camelCase). All quantities are in KILOGRAMS
-- and all unit prices are Rs. per kg. If you are upgrading from the older tons-based schema,
-- run migrate_tons_to_kg.sql instead of this file.

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  "totalDue" NUMERIC DEFAULT 0,
  "creditLimit" NUMERIC DEFAULT 0,
  "createdAt" TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  "materialCategory" TEXT,
  "totalOwed" NUMERIC DEFAULT 0,
  address TEXT,
  "createdAt" TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  "unitPricePerKg" NUMERIC DEFAULT 0,
  "stockKg" NUMERIC DEFAULT 0,
  "minThresholdKg" NUMERIC DEFAULT 0,
  "supplierId" TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  "bookingNumber" TEXT NOT NULL,
  "customerId" TEXT,
  "productId" TEXT,
  "totalKg" NUMERIC DEFAULT 0,
  "dispatchedKg" NUMERIC DEFAULT 0,
  "remainingKg" NUMERIC DEFAULT 0,
  "pricePerKg" NUMERIC DEFAULT 0,
  "totalAmount" NUMERIC DEFAULT 0,
  "paidAmount" NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
  "paymentStatus" TEXT DEFAULT 'unpaid',
  "createdAt" TEXT,
  "targetDeliveryDate" TEXT,
  notes TEXT,
  "cancelledAt" TEXT,
  "cancelReason" TEXT,
  "brokerName" TEXT,
  "brokerCommissionPerKg" NUMERIC DEFAULT 0,
  "quotationId" TEXT
);

CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY,
  "dispatchNumber" TEXT NOT NULL,
  "bookingId" TEXT,
  "customerId" TEXT,
  "productId" TEXT,
  kg NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  "truckNumber" TEXT,
  "driverPhone" TEXT,
  date TEXT,
  notes TEXT,
  "whatsappSent" BOOLEAN DEFAULT FALSE,
  "whatsappMessage" TEXT,
  "paymentReceivedImmediately" BOOLEAN DEFAULT FALSE,
  "truckId" TEXT,
  "grossKg" NUMERIC,
  "tareKg" NUMERIC,
  "freightCharge" NUMERIC DEFAULT 0,
  "taxRatePct" NUMERIC DEFAULT 0,
  "taxAmount" NUMERIC DEFAULT 0,
  "totalBilled" NUMERIC,
  status TEXT DEFAULT 'in_transit',
  "deliveredAt" TEXT,
  "receivedBy" TEXT,
  "podNote" TEXT
);

-- Incoming stock from suppliers (goods receipts)
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  "receiptNumber" TEXT NOT NULL,
  "supplierId" TEXT,
  "productId" TEXT,
  kg NUMERIC DEFAULT 0,
  "pricePerKg" NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  date TEXT,
  "truckNumber" TEXT,
  notes TEXT,
  "paymentMadeImmediately" BOOLEAN DEFAULT FALSE,
  "createdAt" TEXT,
  "grossKg" NUMERIC,
  "tareKg" NUMERIC,
  "purchaseOrderId" TEXT
);

-- Selling price observations per product over time
CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  "productId" TEXT,
  "pricePerKg" NUMERIC DEFAULT 0,
  date TEXT,
  source TEXT,
  note TEXT,
  "referenceId" TEXT
);

-- Operating expenses (transport, fuel, labour, rent...)
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TEXT,
  category TEXT,
  amount NUMERIC DEFAULT 0,
  description TEXT,
  "paidVia" TEXT,
  "truckId" TEXT,
  "dispatchId" TEXT,
  "referenceId" TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

-- Fleet / driver registry
CREATE TABLE IF NOT EXISTS trucks (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  "driverName" TEXT,
  "driverPhone" TEXT,
  "capacityKg" NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'available',
  notes TEXT,
  "createdAt" TEXT
);

-- Named users with their own PIN and role (admin / manager / operator)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'operator',
  pin TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  "createdAt" TEXT
);

-- Manual cash movements (capital, drawings, loans, bank charges) for the daily cash book
CREATE TABLE IF NOT EXISTS cash_entries (
  id TEXT PRIMARY KEY,
  date TEXT,
  direction TEXT,
  amount NUMERIC DEFAULT 0,
  description TEXT,
  method TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

-- Single-row app settings (opening cash balance)
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  "cashOpeningBalance" NUMERIC DEFAULT 0,
  "cashOpeningDate" TEXT,
  "taxRatePct" NUMERIC DEFAULT 0,
  "taxLabel" TEXT,
  "companyName" TEXT,
  "companyTagline" TEXT,
  "companyAddress" TEXT,
  "companyPhone" TEXT,
  "companyTaxId" TEXT,
  "monthlyTargetRs" NUMERIC DEFAULT 0
);

-- Customer quotations (convert to bookings)
CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  "quoteNumber" TEXT NOT NULL,
  "customerId" TEXT,
  "productId" TEXT,
  kg NUMERIC DEFAULT 0,
  "pricePerKg" NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  "validUntil" TEXT,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT,
  "bookingId" TEXT
);

-- Purchase orders to suppliers (fulfilled by stock receipts)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  "poNumber" TEXT NOT NULL,
  "supplierId" TEXT,
  "productId" TEXT,
  kg NUMERIC DEFAULT 0,
  "pricePerKg" NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  "expectedDate" TEXT,
  status TEXT DEFAULT 'open',
  "receivedKg" NUMERIC DEFAULT 0,
  notes TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

-- Sales returns (credit notes) and purchase returns (debit notes)
CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  "returnNumber" TEXT NOT NULL,
  kind TEXT,
  "customerId" TEXT,
  "supplierId" TEXT,
  "productId" TEXT,
  "dispatchId" TEXT,
  "purchaseId" TEXT,
  kg NUMERIC DEFAULT 0,
  "pricePerKg" NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  reason TEXT,
  date TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

-- Stock adjustments with reasons (count, wastage, moisture, damage...)
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id TEXT PRIMARY KEY,
  "productId" TEXT,
  "deltaKg" NUMERIC DEFAULT 0,
  reason TEXT,
  note TEXT,
  date TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

-- Follow-ups / to-dos attached to records
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  "dueDate" TEXT,
  status TEXT DEFAULT 'open',
  "linkType" TEXT,
  "linkId" TEXT,
  note TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT,
  "doneAt" TEXT
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  "entityType" TEXT,
  "entityId" TEXT,
  type TEXT,
  "referenceId" TEXT,
  date TEXT,
  description TEXT,
  debit NUMERIC DEFAULT 0,
  credit NUMERIC DEFAULT 0,
  "balanceAfter" NUMERIC DEFAULT 0,
  kg NUMERIC
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  type TEXT,
  "recipientName" TEXT,
  "recipientPhone" TEXT,
  "recipientType" TEXT,
  message TEXT,
  timestamp TEXT,
  status TEXT,
  "bookingId" TEXT,
  "dispatchId" TEXT
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (date);
CREATE INDEX IF NOT EXISTS dispatches_date_idx ON dispatches (date);
CREATE INDEX IF NOT EXISTS purchases_date_idx ON purchases (date);
CREATE INDEX IF NOT EXISTS price_history_product_idx ON price_history ("productId", date);

-- Internal tool: RLS disabled so the anon key can read/write. Keep the key private.
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE trucks DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE cash_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE quotations DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE returns DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages DISABLE ROW LEVEL SECURITY;
