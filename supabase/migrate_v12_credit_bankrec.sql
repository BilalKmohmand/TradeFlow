-- Migration v12: credit limits on bills + bank reconciliation.
-- Run ONCE after the earlier migrations (v9 and any v10/v11). Safe to re-run.
BEGIN;

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

COMMIT;
