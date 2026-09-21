-- Sarmaya v22 (controls): approval requests, deleted records bin, document number series,
-- branches, and the branch on bills / expenses / cash entries / payments / users.
-- Run ONCE after the earlier migrations. Safe to re-run (idempotent).
-- Like the other tables, RLS stays disabled: the app signs users in itself.

-- Documents waiting for a manager (only their input is stored; nothing is posted until approved).
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  rules JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT,
  reasons JSONB DEFAULT '[]'::jsonb,
  amount NUMERIC DEFAULT 0,
  payload JSONB,
  note TEXT,
  "requestedBy" TEXT,
  "requestedById" TEXT,
  "requestedAt" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TEXT,
  "decisionNote" TEXT,
  "resultRef" TEXT,
  "branchId" TEXT,
  "updatedAt" TEXT
);
ALTER TABLE approvals DISABLE ROW LEVEL SECURITY;

-- A copy of every deleted record, with who / when / why.
CREATE TABLE IF NOT EXISTS deleted_records (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  "recordId" TEXT,
  label TEXT,
  data JSONB,
  related JSONB,
  reason TEXT,
  "deletedBy" TEXT,
  "deletedAt" TEXT,
  "restoredAt" TEXT,
  "restoredBy" TEXT
);
ALTER TABLE deleted_records DISABLE ROW LEVEL SECURITY;

-- Shops / branches (the first one is the main branch).
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  "godownIds" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TEXT,
  "updatedAt" TEXT
);
ALTER TABLE branches DISABLE ROW LEVEL SECURITY;

-- Settings: approval rules, number series and their counters (never go down).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "approvalRules" JSONB;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "numberSeries" JSONB;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "docCounters" JSONB;

-- Branch of each record (empty = the main branch) and each user's default branch.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approval JSONB;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "branchId" TEXT;

CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals (status);
CREATE INDEX IF NOT EXISTS deleted_records_kind_idx ON deleted_records (kind);
