-- Migration v20: purchasing — item groups / brands / photos / barcodes / re-order quantity,
-- multi-line purchase orders, supplier bills (three-way match) and supplier claims.
-- Run ONCE after setup.sql (or the earlier migrations). Safe to re-run: it only adds what is missing.
--
-- Postings use the existing ledger table (new "type" values purchase_variance and supplier_claim):
--   supplier bill: only the difference between the bill and the goods already received is posted;
--   accepted claim: a debit note that takes the accepted amount off the supplier.
BEGIN;

-- Items: brand, barcode, a small photo (JPEG data URL, ~60 KB max) and how much to re-order.
-- The item group is the existing "category" column; the re-order level is "minThresholdKg".
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS photo TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "reorderQty" NUMERIC;
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode);

-- Purchase orders: several items per order (JSON lines with their own rate and received qty).
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS "orderDate" TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS "cancelledAt" TEXT;

-- Stock receipts: the order line they were received against.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "poLineId" TEXT;

-- Supplier bills (the supplier's own invoice for goods received).
CREATE TABLE IF NOT EXISTS supplier_bills (
  id TEXT PRIMARY KEY,
  "billNumber" TEXT NOT NULL,
  "supplierId" TEXT,
  date TEXT,
  "purchaseOrderId" TEXT,
  "purchaseIds" JSONB,          -- stock receipts (purchases.id) the bill covers
  lines JSONB,                  -- [{ productId, productName, unit, qty, rate, amount }]
  "otherCharges" NUMERIC,
  amount NUMERIC NOT NULL DEFAULT 0,
  "receivedValue" NUMERIC DEFAULT 0,
  variance NUMERIC DEFAULT 0,   -- amount - receivedValue, posted as purchase_variance
  "ledgerId" TEXT,
  note TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS "billNumber" TEXT;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS "purchaseIds" JSONB;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS lines JSONB;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS "otherCharges" NUMERIC;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS "receivedValue" NUMERIC DEFAULT 0;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS variance NUMERIC DEFAULT 0;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS "ledgerId" TEXT;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS "createdAt" TEXT;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
CREATE INDEX IF NOT EXISTS supplier_bills_supplier_idx ON supplier_bills ("supplierId");

-- Supplier claims (leaked / damaged / short goods).
CREATE TABLE IF NOT EXISTS supplier_claims (
  id TEXT PRIMARY KEY,
  "claimNumber" TEXT NOT NULL,
  "supplierId" TEXT,
  "purchaseId" TEXT,            -- stock receipt the goods came on
  "productId" TEXT,
  qty NUMERIC DEFAULT 0,
  rate NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  reason TEXT,                  -- leaked | damaged | short | expired | wrong_item | other
  note TEXT,
  date TEXT,
  status TEXT DEFAULT 'open',   -- open | accepted | rejected | settled
  "acceptedAmount" NUMERIC,
  "decidedDate" TEXT,
  "settledDate" TEXT,
  "decisionNote" TEXT,
  "ledgerId" TEXT,              -- the debit note (ledger row) of an accepted claim
  "createdAt" TEXT,
  "createdBy" TEXT,
  "updatedAt" TEXT
);
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "claimNumber" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "purchaseId" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS qty NUMERIC DEFAULT 0;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS rate NUMERIC DEFAULT 0;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "acceptedAmount" NUMERIC;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "decidedDate" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "settledDate" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "decisionNote" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "ledgerId" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "createdAt" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE supplier_claims ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;
CREATE INDEX IF NOT EXISTS supplier_claims_supplier_idx ON supplier_claims ("supplierId");
CREATE INDEX IF NOT EXISTS supplier_claims_status_idx ON supplier_claims (status);

-- Internal tool: RLS disabled so the anon key can read/write (same as every other table).
ALTER TABLE supplier_bills DISABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_claims DISABLE ROW LEVEL SECURITY;

COMMIT;
