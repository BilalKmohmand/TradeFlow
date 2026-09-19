-- Migration v11: godowns (warehouses), stock batches with expiry dates, stock transfers.
-- Run ONCE after migrate_v9_billing_integrity.sql. Safe to re-run.
--
-- Existing data needs no conversion: every item keeps its "stockKg" (the total across godowns).
-- Stock that is not in a batch row is treated as sitting in the main godown, so existing items
-- start with all their stock in the main godown and no batches.
BEGIN;

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

COMMIT;
