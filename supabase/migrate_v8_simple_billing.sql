-- Migration v8: simple billing (bills table, product units, app mode, opening bank balance).
-- Run ONCE after migrate_v7_master_pin_sync.sql. Safe to re-run.

BEGIN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "appMode" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "openingBankBalance" NUMERIC DEFAULT 0;

-- Bills / invoices (simple billing). Items are stored as JSON.
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  "invoiceNumber" TEXT NOT NULL,
  "customerId" TEXT,
  "customerName" TEXT,
  "customerCompany" TEXT,
  "customerPhone" TEXT,
  "customerAddress" TEXT,
  "customerNtn" TEXT,
  "issueDate" TEXT,
  "dueDate" TEXT,
  status TEXT DEFAULT 'issued',
  "paymentStatus" TEXT DEFAULT 'unpaid',
  items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC DEFAULT 0,
  "freightCharges" NUMERIC DEFAULT 0,
  "handlingCharges" NUMERIC DEFAULT 0,
  "taxRatePct" NUMERIC DEFAULT 0,
  "taxAmount" NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  "totalAmount" NUMERIC DEFAULT 0,
  "paidAmount" NUMERIC DEFAULT 0,
  "balanceDue" NUMERIC DEFAULT 0,
  payments JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  terms TEXT,
  "linkedBookingIds" JSONB,
  "createdAt" TEXT,
  "createdBy" TEXT,
  "updatedAt" TEXT,
  "paymentMethod" TEXT,
  "billKind" TEXT
);

ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;

COMMIT;
