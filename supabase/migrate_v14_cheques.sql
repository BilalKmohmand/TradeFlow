-- Migration v14: post-dated cheque (PDC) register.
-- Run ONCE after setup.sql (or the earlier migrations). Safe to re-run: it only creates what is missing.
--
-- Nothing else changes in the database: cheque postings use the existing ledger table (new "type"
-- values cheque_received / cheque_issued / cheque_returned / cheque_charge), cash_entries (a cleared
-- cheque is a bank entry with "accountCode" 1150 or 2050) and expenses (bank charge on a bounce).
BEGIN;

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

COMMIT;
