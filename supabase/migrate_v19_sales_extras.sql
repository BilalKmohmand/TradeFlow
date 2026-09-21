-- Sarmaya v19 (sales extras): salesmen and areas (routes), trade schemes (bonus qty), salesman
-- commission, freight on bills, receive-from-many and late-payment interest.
-- Run ONCE after the earlier migrations (or just run setup.sql + this file). Safe to re-run: it only
-- creates what is missing.
--
-- Postings use the existing tables: free goods are bill lines inside invoices.items JSONB
-- (free / schemeId / schemeName), freight is invoices."freightCharges", interest is a ledger row of
-- type interest_charge, commission paid is an expense with category salesman_commission.
BEGIN;

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
