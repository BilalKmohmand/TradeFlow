-- ---------------------------------------------------------------------------
-- Sarmaya — Supabase setup. RUN THIS ONE FILE. Nothing else, in no particular order.
--
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run.
--
-- It works on a brand-new project and on one that is part way through: it creates
-- whatever is missing and adds whatever column is missing, then stops. Running it
-- again is safe and does nothing the second time.
--
-- It never deletes a table, never drops a column and never changes a value.
--
-- ONE THING IT DOES NOT DO: supabase/migrate_tons_to_kg.sql. That converts a very old
-- (pre-2026, tons-based) database and must be run once by hand, before this file.
-- If your project was created from this file or from schema.sql, ignore that.
-- ---------------------------------------------------------------------------

BEGIN;

-- ============================ 1. Tables ====================================
-- Creates any table this project does not have yet. Existing tables are left alone.

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
  description TEXT,
  unit TEXT,
  "costPricePerKg" NUMERIC,
  "trackBatches" BOOLEAN
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
  "createdBy" TEXT,
  "pairId" TEXT,
  "accountCode" TEXT
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
  "monthlyTargetRs" NUMERIC DEFAULT 0,
  "masterPin" TEXT,
  "appMode" TEXT,
  "openingBankBalance" NUMERIC DEFAULT 0,
  "companyEmail" TEXT,
  "companyLogo" TEXT,
  "booksLockedUntil" TEXT
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
  "costPerKg" NUMERIC,
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
  "billKind" TEXT,
  "issuedAt" TEXT,
  "creditOverride" JSONB
);

-- Bank reconciliation (migration v12): statement lines (+ in / − out) and one reconciliation per statement date.
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  reference TEXT,
  "importedAt" TEXT,
  "matchedMovementIds" JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'unmatched',
  "matchConfidence" TEXT,
  "createdEntryId" TEXT
);
CREATE INDEX IF NOT EXISTS bank_statement_lines_date_idx ON bank_statement_lines (date);

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id TEXT PRIMARY KEY,
  "statementDate" TEXT NOT NULL,
  "closingBalance" NUMERIC DEFAULT 0,
  "clearedMovementIds" JSONB DEFAULT '[]'::jsonb,
  "bookBalance" NUMERIC,
  difference NUMERIC,
  reconciled BOOLEAN DEFAULT FALSE,
  "createdAt" TEXT,
  "updatedAt" TEXT,
  "createdBy" TEXT
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
  kg NUMERIC,
  "sourceId" TEXT,
  method TEXT
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

-- Accounts (double-entry): manual journal entries and the accountant's own accounts.
-- Automatic postings are derived from bills, payments and expenses in the app and are not stored.
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  date TEXT,
  ref TEXT,
  memo TEXT,
  lines JSONB DEFAULT '[]'::jsonb,
  source TEXT DEFAULT 'manual',
  "sourceType" TEXT,
  "sourceId" TEXT,
  "billId" TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT,
  type TEXT,
  system BOOLEAN DEFAULT FALSE,
  parent TEXT,
  description TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON journal_entries (date);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_idx ON accounts (code);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (date);
CREATE INDEX IF NOT EXISTS dispatches_date_idx ON dispatches (date);
CREATE INDEX IF NOT EXISTS purchases_date_idx ON purchases (date);
CREATE INDEX IF NOT EXISTS price_history_product_idx ON price_history ("productId", date);

-- Inventory (v11): godowns, stock batches with expiry, transfers between godowns.
-- products."stockKg" stays the total; stock not in a stock_batches row is in the main godown.
CREATE TABLE IF NOT EXISTS godowns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  "isDefault" BOOLEAN DEFAULT FALSE,
  "createdAt" TEXT
);

CREATE TABLE IF NOT EXISTS stock_batches (
  id TEXT PRIMARY KEY,
  "productId" TEXT,
  "godownId" TEXT,
  "batchNo" TEXT DEFAULT '',
  "expiryDate" TEXT,
  qty NUMERIC DEFAULT 0,
  "receivedDate" TEXT,
  "costPrice" NUMERIC,
  "supplierId" TEXT,
  "purchaseId" TEXT,
  "createdAt" TEXT
);
CREATE INDEX IF NOT EXISTS stock_batches_product_idx ON stock_batches ("productId", "godownId");
CREATE INDEX IF NOT EXISTS stock_batches_expiry_idx ON stock_batches ("expiryDate");

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  "productId" TEXT,
  "fromGodownId" TEXT,
  "toGodownId" TEXT,
  qty NUMERIC DEFAULT 0,
  date TEXT,
  note TEXT,
  batches JSONB,
  "createdAt" TEXT,
  "createdBy" TEXT
);
CREATE INDEX IF NOT EXISTS stock_transfers_date_idx ON stock_transfers (date);

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
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations DISABLE ROW LEVEL SECURITY;
ALTER TABLE godowns DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;


-- ======================= 2. Columns on older tables =========================
-- Adds columns that later versions introduced, for tables that already existed.
-- On a brand-new database these all find the column already there and do nothing.


-- ----------------------- from migrate_v3_enterprise.sql -----------------------
-- Migration v3: enterprise features (expenses, fleet, users, booking cancellation, dispatch truck link).
-- Run ONCE in the Supabase SQL editor AFTER migrate_tons_to_kg.sql. Safe to re-run.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "cancelledAt" TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "truckId" TEXT;

-- Operating expenses (transport, fuel, labour, rent...)
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TEXT,
  category TEXT,
  amount NUMERIC DEFAULT 0,
  description TEXT,
  "paidVia" TEXT,
  "truckId" TEXT,
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

CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (date);

ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE trucks DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;


-- ----------------------- from migrate_v4_cashbook.sql -----------------------
-- Migration v4: daily cash book (manual cash entries + opening balance setting).
-- Run ONCE after migrate_v3_enterprise.sql. Safe to re-run.

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
  "cashOpeningDate" TEXT
);

ALTER TABLE cash_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;


-- ----------------------- from migrate_v5_dispatch_tax_delivery.sql -----------------------
-- Migration v5: weighbridge weights, freight, sales tax, delivery status/POD, trip expenses, company profile settings.
-- Run ONCE after migrate_v4_cashbook.sql. Safe to re-run.

ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "grossKg" NUMERIC;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "tareKg" NUMERIC;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "freightCharge" NUMERIC DEFAULT 0;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "taxRatePct" NUMERIC DEFAULT 0;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "taxAmount" NUMERIC DEFAULT 0;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "totalBilled" NUMERIC;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_transit';
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "deliveredAt" TEXT;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "receivedBy" TEXT;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "podNote" TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "grossKg" NUMERIC;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "tareKg" NUMERIC;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "dispatchId" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "taxRatePct" NUMERIC DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "taxLabel" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyTagline" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyAddress" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyPhone" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyTaxId" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "monthlyTargetRs" NUMERIC DEFAULT 0;


-- ----------------------- from migrate_v6_trade_documents.sql -----------------------
-- Migration v6: quotations, purchase orders, returns, stock adjustments, tasks, broker commission.
-- Run ONCE after migrate_v5_dispatch_tax_delivery.sql. Safe to re-run.

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


-- ----------------------- from migrate_v7_master_pin_sync.sql -----------------------
-- Migration v7: sync shared master PIN across devices via settings.
-- Run once; safe to re-run.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS "masterPin" TEXT;


-- ----------------------- from migrate_v8_simple_billing.sql -----------------------
-- Migration v8: simple billing (bills table, product units, app mode, opening bank balance).
-- Run ONCE after migrate_v7_master_pin_sync.sql. Safe to re-run.

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


-- ----------------------- from migrate_v9_billing_integrity.sql -----------------------
-- Migration v9: billing data integrity.
-- Run ONCE after migrate_v8_simple_billing.sql. Safe to re-run.

ALTER TABLE products ADD COLUMN IF NOT EXISTS "costPricePerKg" NUMERIC;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS "sourceId" TEXT;   -- id of the bill/payment that produced the row
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS method TEXT;       -- payment method (cash vs bank) without parsing text
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS "pairId" TEXT; -- both legs of a cash<->bank transfer share this
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyEmail" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyLogo" TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "issuedAt" TEXT;
CREATE INDEX IF NOT EXISTS invoices_number_idx ON invoices ("invoiceNumber");


-- ----------------------- from migrate_v10_accounting.sql -----------------------
-- Migration v10: double-entry accounts.
-- Run ONCE after migrate_v9_billing_integrity.sql. Safe to re-run.
-- Automatic journal postings are derived in the app from bills, payments, expenses and stock;
-- only the accountant's manual journal entries, custom accounts and the period lock are stored.

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  date TEXT,
  ref TEXT,
  memo TEXT,
  lines JSONB DEFAULT '[]'::jsonb,   -- [{ accountCode, debit, credit, memo? }]
  source TEXT DEFAULT 'manual',
  "sourceType" TEXT,
  "sourceId" TEXT,
  "billId" TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT,
  type TEXT,                          -- asset | liability | equity | income | expense
  system BOOLEAN DEFAULT FALSE,
  parent TEXT,
  description TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON journal_entries (date);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_idx ON accounts (code);

-- Period lock: manual journals dated on or before this date are refused.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "booksLockedUntil" TEXT;

-- Same convention as every other table in this project.
ALTER TABLE journal_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;


-- ----------------------- from migrate_v11_inventory.sql -----------------------
-- Migration v11: godowns (warehouses), stock batches with expiry dates, stock transfers.
-- Run ONCE after migrate_v9_billing_integrity.sql. Safe to re-run.
--
-- Existing data needs no conversion: every item keeps its "stockKg" (the total across godowns).
-- Stock that is not in a batch row is treated as sitting in the main godown, so existing items
-- start with all their stock in the main godown and no batches.

ALTER TABLE products ADD COLUMN IF NOT EXISTS "trackBatches" BOOLEAN;

CREATE TABLE IF NOT EXISTS godowns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  "isDefault" BOOLEAN DEFAULT FALSE,
  "createdAt" TEXT
);

-- One row = stock of one item in one godown: a batch (batchNo + optional expiry) or, with an
-- empty batchNo, plain stock kept in a godown other than the main one.
CREATE TABLE IF NOT EXISTS stock_batches (
  id TEXT PRIMARY KEY,
  "productId" TEXT,
  "godownId" TEXT,
  "batchNo" TEXT DEFAULT '',
  "expiryDate" TEXT,
  qty NUMERIC DEFAULT 0,
  "receivedDate" TEXT,
  "costPrice" NUMERIC,
  "supplierId" TEXT,
  "purchaseId" TEXT,
  "createdAt" TEXT
);
CREATE INDEX IF NOT EXISTS stock_batches_product_idx ON stock_batches ("productId", "godownId");
CREATE INDEX IF NOT EXISTS stock_batches_expiry_idx ON stock_batches ("expiryDate");

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  "productId" TEXT,
  "fromGodownId" TEXT,
  "toGodownId" TEXT,
  qty NUMERIC DEFAULT 0,
  date TEXT,
  note TEXT,
  batches JSONB,
  "createdAt" TEXT,
  "createdBy" TEXT
);
CREATE INDEX IF NOT EXISTS stock_transfers_date_idx ON stock_transfers (date);

-- Internal tool convention: RLS disabled so the anon key can read/write. Keep the key private.
ALTER TABLE godowns DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers DISABLE ROW LEVEL SECURITY;

-- Stock received without a supplier bill is recorded as an adjustment at its cost.
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS "costPerKg" NUMERIC;


-- ----------------------- from migrate_v12_credit_bankrec.sql -----------------------
-- Migration v12: credit limits on bills + bank reconciliation.
-- Run ONCE after the earlier migrations (v9 and any v10/v11). Safe to re-run.

-- Bills allowed over the customer's credit limit record who allowed it and why.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "creditOverride" JSONB;

-- Lines from an imported (or typed) bank statement. amount: + money in, − money out.
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  reference TEXT,
  "importedAt" TEXT,
  "matchedMovementIds" JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'unmatched',          -- unmatched | matched | ignored
  "matchConfidence" TEXT,                   -- exact | high | medium | manual
  "createdEntryId" TEXT                     -- expense / cash entry created from this line
);
CREATE INDEX IF NOT EXISTS bank_statement_lines_date_idx ON bank_statement_lines (date);

-- One reconciliation per statement end date.
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id TEXT PRIMARY KEY,
  "statementDate" TEXT NOT NULL,
  "closingBalance" NUMERIC DEFAULT 0,
  "clearedMovementIds" JSONB DEFAULT '[]'::jsonb,
  "bookBalance" NUMERIC,
  difference NUMERIC,
  reconciled BOOLEAN DEFAULT FALSE,
  "createdAt" TEXT,
  "updatedAt" TEXT,
  "createdBy" TEXT
);

-- Internal tool: RLS disabled so the anon key can read/write (same as every other table).
ALTER TABLE bank_statement_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations DISABLE ROW LEVEL SECURITY;

-- Bank-reconciliation receipts post to an explicit account (suspense) instead of guessing from bank text.
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS "accountCode" TEXT;


-- ----------------------- from migrate_v13_sales_docs.sql -----------------------
-- Migration v13: sales documents in billing mode.
--   * sales returns / credit notes linked to a bill (money back now, or off what the customer owes)
--   * line discounts on bills (stored inside invoices.items JSONB: discountType, discountValue, discountAmount)
--   * customer-specific item rates
--   * multi-item quotations that convert into a bill
--   * delivery challans are printed from the bill (nothing stored)
-- Run ONCE after the earlier migrations. Safe to re-run.

-- Returns against a bill: which bill, the returned lines (qty, value, cost, batches), the tax part,
-- and how much was paid back in money now.
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "taxAmount" NUMERIC DEFAULT 0;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "refundAmount" NUMERIC DEFAULT 0;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "refundMethod" TEXT;
CREATE INDEX IF NOT EXISTS returns_invoice_idx ON returns ("invoiceId");

-- Bills: value returned (incl. tax), money refunded, and the quotation the bill was made from.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "returnedAmount" NUMERIC DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "refundedAmount" NUMERIC DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "quotationId" TEXT;

-- Quotations: several items per quote, and the bill it became.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;

-- Customer-specific rates: one agreed price per customer and item.
CREATE TABLE IF NOT EXISTS customer_agreed_rates (
  id TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "agreedRatePerKg" NUMERIC NOT NULL DEFAULT 0,   -- price per the item's own unit (can, tin, ...)
  "effectiveDate" TEXT,
  notes TEXT,
  "createdAt" TEXT,
  "updatedAt" TEXT
);
CREATE INDEX IF NOT EXISTS customer_agreed_rates_customer_idx ON customer_agreed_rates ("customerId");

-- Internal tool: RLS disabled so the anon key can read/write (same as every other table).
ALTER TABLE customer_agreed_rates DISABLE ROW LEVEL SECURITY;

-- Ledger rows of type 'refund_paid' (money handed back for a return) use the existing columns.



-- ----------------------- from migrate_v14_cheques.sql -----------------------
-- Migration v14: post-dated cheque (PDC) register.
-- Run ONCE after setup.sql (or the earlier migrations). Safe to re-run: it only creates what is missing.
--
-- Nothing else changes in the database: cheque postings use the existing ledger table (new "type"
-- values cheque_received / cheque_issued / cheque_returned / cheque_charge), cash_entries (a cleared
-- cheque is a bank entry with "accountCode" 1150 or 2050) and expenses (bank charge on a bounce).

CREATE TABLE IF NOT EXISTS cheques (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL DEFAULT 'received',   -- received (from a customer) | issued (to a supplier)
  "customerId" TEXT,
  "supplierId" TEXT,
  "partyName" TEXT,
  "bankName" TEXT,
  "chequeNumber" TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  "chequeDate" TEXT,                              -- date written on the cheque (may be in the future)
  "entryDate" TEXT,                               -- day it was received / given
  "invoiceId" TEXT,
  status TEXT DEFAULT 'in_hand',                  -- in_hand | deposited | issued | cleared | bounced | cancelled
  "depositedDate" TEXT,
  "clearedDate" TEXT,
  "returnedDate" TEXT,                            -- bounced / cancelled on
  "returnReason" TEXT,
  "bankCharge" NUMERIC,
  "chargeTo" TEXT,                                -- customer | shop
  note TEXT,
  "ledgerId" TEXT,
  "reversalLedgerId" TEXT,
  "clearedEntryId" TEXT,
  "chargeExpenseId" TEXT,
  "chargeLedgerId" TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT,
  "updatedAt" TEXT
);

-- Older partial copies of the table get any column they are missing.
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'received';
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "partyName" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "chequeNumber" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "chequeDate" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "entryDate" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_hand';
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "depositedDate" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "clearedDate" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "returnedDate" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "returnReason" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "bankCharge" NUMERIC;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "chargeTo" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "ledgerId" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "reversalLedgerId" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "clearedEntryId" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "chargeExpenseId" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "chargeLedgerId" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "createdAt" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;

CREATE INDEX IF NOT EXISTS cheques_status_date_idx ON cheques (status, "chequeDate");
CREATE INDEX IF NOT EXISTS cheques_customer_idx ON cheques ("customerId");
CREATE INDEX IF NOT EXISTS cheques_supplier_idx ON cheques ("supplierId");

-- Internal tool: RLS disabled so the anon key can read/write (same as every other table).
ALTER TABLE cheques DISABLE ROW LEVEL SECURITY;



-- ----------------------- from migrate_v15_stock_reports.sql -----------------------
-- Migration v15: stock adjustments per godown / batch, and purchase returns (debit notes) in billing mode.
-- Run ONCE after setup.sql (or after v12 on an older database). Safe to re-run.

-- Stock adjustments (leaked, damaged, expired, count correction, received free...) remember the
-- godown and batch they were made in, so undoing one puts the stock back in the same place.
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS "costPerKg" NUMERIC;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS "godownId" TEXT;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS "batchId" TEXT;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS "batchNo" TEXT;

-- Goods sent back to a supplier: which godown and batches they left from, and the item's unit
-- (bag, tin, can...) printed on the debit note.
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "godownId" TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS batches JSONB;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS unit TEXT;

-- Item history and the purchase register look records up by item and date.
CREATE INDEX IF NOT EXISTS stock_adjustments_product_idx ON stock_adjustments ("productId");
CREATE INDEX IF NOT EXISTS returns_product_idx ON returns ("productId");
CREATE INDEX IF NOT EXISTS purchases_date_idx ON purchases (date);



-- ----------------------- from migrate_v16_passwords.sql -----------------------
-- Migration v16: username + password sign-in (replaces PIN sign-in).
-- Run ONCE after the earlier migrations. Safe to re-run (every statement is idempotent).
--
-- The app hashes passwords in the browser with PBKDF2-SHA256 (WebCrypto, random 16-byte salt,
-- 210,000 iterations) and stores only passwordHash / passwordSalt / passwordIter here, so the
-- owner can sign in on another device. Plain-text passwords are never stored.
--
-- SECURITY NOTE: like every other table, users has RLS disabled and is reachable with the anon
-- key, so anyone holding that key can read or change these rows (including the hashes). Real
-- database security would additionally need Supabase Auth + Row Level Security policies; that is
-- not part of this migration.

-- Sign-in identity
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Password (PBKDF2) and the forced "choose a new password" flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordSalt" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordIter" INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN DEFAULT FALSE;

-- Legacy PIN hash (cleared once each user sets a password)
ALTER TABLE users ADD COLUMN IF NOT EXISTS "pinHash" TEXT;

-- Failed-attempt lockout and bookkeeping
ALTER TABLE users ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lockedUntil" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastLoginAt" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;

-- Users without a PIN (new accounts) are allowed; the old column stays for the one-time PIN sign-in.
ALTER TABLE users ALTER COLUMN pin DROP NOT NULL;

CREATE INDEX IF NOT EXISTS users_username_idx ON users (lower(username));

-- The old shared master PIN is no longer used for sign-in; the app clears it once the owner has a password.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "masterPin" TEXT;

ALTER TABLE users DISABLE ROW LEVEL SECURITY;



-- ----------------------- from migrate_v17_party_codes.sql -----------------------
-- Sarmaya v17: the shop's own customer / supplier IDs (codes from their old books or department).
-- Run ONCE after the earlier migrations (or just run setup.sql). Safe to re-run.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS code TEXT;
CREATE INDEX IF NOT EXISTS customers_code_idx ON customers (lower(code));
CREATE INDEX IF NOT EXISTS suppliers_code_idx ON suppliers (lower(code));



-- ----------------------- from migrate_v18_batch2.sql -----------------------
-- Sarmaya v18 (batch 2): pack units on items, bill print size / footer / previous balance,
-- and the "allow bills when stock is short" switch.
-- Run ONCE after the earlier migrations (or just run setup.sql). Safe to re-run.

-- Items: optional second unit, e.g. base "tin" with "carton" = 6 tins. Stock stays in the base unit.
ALTER TABLE products ADD COLUMN IF NOT EXISTS "packName" TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "packSize" NUMERIC;
-- The shop's own item code, typed on New Bill to find the item.
ALTER TABLE products ADD COLUMN IF NOT EXISTS code TEXT;

-- Shop settings for bills.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "allowNegativeStock" BOOLEAN DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "billPrintSize" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "billFooter" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "showPrevBalanceOnBill" BOOLEAN DEFAULT FALSE;

-- ----------------------- from migrate_v19_sales_extras.sql -----------------------
-- Sarmaya v19 (sales extras): salesmen and areas (routes), trade schemes (bonus qty), salesman
-- commission, freight on bills, receive-from-many and late-payment interest.
-- Run ONCE after the earlier migrations (or just run setup.sql + this file). Safe to re-run: it only
-- creates what is missing.
--
-- Postings use the existing tables: free goods are bill lines inside invoices.items JSONB
-- (free / schemeId / schemeName), freight is invoices."freightCharges", interest is a ledger row of
-- type interest_charge, commission paid is an expense with category salesman_commission.

-- Salesmen (commission % on sales or on cash recovered).
CREATE TABLE IF NOT EXISTS salesmen (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  "commissionPct" NUMERIC,
  "commissionOn" TEXT DEFAULT 'sales',            -- sales | recovery
  active BOOLEAN DEFAULT TRUE,
  "createdAt" TEXT,
  "updatedAt" TEXT
);
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS "commissionPct" NUMERIC;
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS "commissionOn" TEXT DEFAULT 'sales';
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS "createdAt" TEXT;
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;

-- Areas / routes.
CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT,
  active BOOLEAN DEFAULT TRUE,
  "createdAt" TEXT,
  "updatedAt" TEXT
);
ALTER TABLE areas ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS "createdAt" TEXT;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;

-- Trade schemes per item: buy N get M free, slabs, or % off above a quantity.
CREATE TABLE IF NOT EXISTS schemes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "productId" TEXT,
  kind TEXT NOT NULL DEFAULT 'free_every',        -- free_every | free_slab | pct_off
  "buyQty" NUMERIC,
  "freeQty" NUMERIC,
  slabs JSONB,                                     -- [{ "minQty": 50, "freeQty": 3 }, ...]
  "minQty" NUMERIC,
  "pctOff" NUMERIC,
  "freeProductId" TEXT,
  "fromDate" TEXT,
  "toDate" TEXT,
  "customerIds" JSONB,                             -- empty = every customer
  active BOOLEAN DEFAULT TRUE,
  "createdAt" TEXT,
  "createdBy" TEXT,
  "updatedAt" TEXT
);
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'free_every';
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "buyQty" NUMERIC;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "freeQty" NUMERIC;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS slabs JSONB;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "minQty" NUMERIC;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "pctOff" NUMERIC;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "freeProductId" TEXT;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "fromDate" TEXT;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "toDate" TEXT;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "customerIds" JSONB;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "createdAt" TEXT;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;
CREATE INDEX IF NOT EXISTS schemes_product_idx ON schemes ("productId");

-- Customers: default area and salesman, late-payment interest (off unless a % is set).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "areaId" TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "salesmanId" TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "interestPctPerMonth" NUMERIC;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "interestAfterDays" INTEGER;

-- Bills: salesman and area (freight already lives in "freightCharges").
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "salesmanId" TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "areaId" TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "freightCharges" NUMERIC DEFAULT 0;

-- Ledger: who collected a payment (recovery commission).
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS "salesmanId" TEXT;

-- Internal tool: RLS disabled so the anon key can read/write (same as every other table).
ALTER TABLE salesmen DISABLE ROW LEVEL SECURITY;
ALTER TABLE areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE schemes DISABLE ROW LEVEL SECURITY;



COMMIT;
