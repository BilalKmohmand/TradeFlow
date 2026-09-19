-- Migration v10: double-entry accounts.
-- Run ONCE after migrate_v9_billing_integrity.sql. Safe to re-run.
-- Automatic journal postings are derived in the app from bills, payments, expenses and stock;
-- only the accountant's manual journal entries, custom accounts and the period lock are stored.
BEGIN;

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

COMMIT;
