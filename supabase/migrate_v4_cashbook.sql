-- Migration v4: daily cash book (manual cash entries + opening balance setting).
-- Run ONCE after migrate_v3_enterprise.sql. Safe to re-run.

BEGIN;

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

COMMIT;
