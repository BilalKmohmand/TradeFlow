-- Migration v6: quotations, purchase orders, returns, stock adjustments, tasks, broker commission.
-- Run ONCE after migrate_v5_dispatch_tax_delivery.sql. Safe to re-run.

BEGIN;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "brokerName" TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "brokerCommissionPerKg" NUMERIC DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "quotationId" TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;

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

ALTER TABLE quotations DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE returns DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;

COMMIT;
