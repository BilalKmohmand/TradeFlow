-- Sarmaya v21 (finance): fixed assets & depreciation, staff & salaries, budgets, cost centres,
-- financial years & year-end close, cheque printing layout.
-- Run ONCE after the earlier migrations. Safe to re-run (idempotent).
-- The journal postings for these records are derived in the app (src/utils/financeBooks.ts); only the
-- records themselves are stored. Money that moves is an ordinary cash_entries / expenses row.
BEGIN;

-- Fixed asset register.
CREATE TABLE IF NOT EXISTS fixed_assets (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  "purchaseDate" TEXT,
  cost DOUBLE PRECISION DEFAULT 0,
  "paidFrom" TEXT,                    -- cash | bank | credit | owned
  vendor TEXT,
  "usefulLifeYears" DOUBLE PRECISION,
  "residualValue" DOUBLE PRECISION DEFAULT 0,
  method TEXT,                        -- straight_line | reducing_balance
  "ratePct" DOUBLE PRECISION,
  "openingAccumulated" DOUBLE PRECISION,
  "costCentreId" TEXT,
  note TEXT,
  "purchaseEntryId" TEXT,
  payments JSONB DEFAULT '[]'::jsonb, -- [{ id, date, amount, method, cashEntryId }]
  status TEXT DEFAULT 'in_use',       -- in_use | disposed
  "disposalDate" TEXT,
  "disposalProceeds" DOUBLE PRECISION,
  "disposalMethod" TEXT,
  "disposalEntryId" TEXT,
  "disposalNote" TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

-- One "Run depreciation" per row; lines = [{ assetId, amount, months: ["YYYY-MM"] }].
CREATE TABLE IF NOT EXISTS depreciation_runs (
  id TEXT PRIMARY KEY,
  period TEXT,
  months JSONB DEFAULT '[]'::jsonb,
  date TEXT,
  lines JSONB DEFAULT '[]'::jsonb,
  total DOUBLE PRECISION DEFAULT 0,
  "createdAt" TEXT,
  "createdBy" TEXT
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  "monthlySalary" DOUBLE PRECISION DEFAULT 0,
  phone TEXT,
  cnic TEXT,
  "joinDate" TEXT,
  active BOOLEAN DEFAULT TRUE,
  "createdAt" TEXT
);

CREATE TABLE IF NOT EXISTS staff_advances (
  id TEXT PRIMARY KEY,
  "staffId" TEXT,
  date TEXT,
  amount DOUBLE PRECISION DEFAULT 0,
  method TEXT,
  note TEXT,
  "cashEntryId" TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

-- One paid salary sheet per month; lines = [{ staffId, name, role, salary, bonus, deductions, advanceDeducted, net, note }].
CREATE TABLE IF NOT EXISTS salary_runs (
  id TEXT PRIMARY KEY,
  month TEXT,
  date TEXT,
  method TEXT,
  lines JSONB DEFAULT '[]'::jsonb,
  "totalGross" DOUBLE PRECISION DEFAULT 0,
  "totalAdvance" DOUBLE PRECISION DEFAULT 0,
  "totalNet" DOUBLE PRECISION DEFAULT 0,
  "expenseId" TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

-- Monthly budget per income / expense account (id = bud-YYYY-MM-code).
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  month TEXT,
  "accountCode" TEXT,
  amount DOUBLE PRECISION DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cost_centres (
  id TEXT PRIMARY KEY,
  name TEXT,
  kind TEXT,                          -- branch | area | vehicle | other
  active BOOLEAN DEFAULT TRUE,
  "createdAt" TEXT
);

CREATE TABLE IF NOT EXISTS year_closes (
  id TEXT PRIMARY KEY,
  label TEXT,
  start TEXT,
  "end" TEXT,
  profit DOUBLE PRECISION DEFAULT 0,
  "toAccount" TEXT,
  "journalId" TEXT,
  "previousLock" TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

CREATE INDEX IF NOT EXISTS depreciation_runs_date_idx ON depreciation_runs (date);
CREATE INDEX IF NOT EXISTS staff_advances_staff_idx ON staff_advances ("staffId");
CREATE INDEX IF NOT EXISTS salary_runs_month_idx ON salary_runs (month);
CREATE INDEX IF NOT EXISTS budgets_month_idx ON budgets (month);

-- Cost / profit centre tags on bills and expenses (journal lines keep theirs inside "lines").
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "costCentreId" TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "costCentreId" TEXT;
-- Manual journals: entry-level cost centre and the year-end closing flag.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "costCentreId" TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS closing BOOLEAN DEFAULT FALSE;

-- Settings: financial year start ("MM-DD", default 07-01) and the cheque printing layout.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "financialYearStart" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "chequeLayout" JSONB;

-- Same convention as every other table in this project.
ALTER TABLE fixed_assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_advances DISABLE ROW LEVEL SECURITY;
ALTER TABLE salary_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE budgets DISABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centres DISABLE ROW LEVEL SECURITY;
ALTER TABLE year_closes DISABLE ROW LEVEL SECURITY;

COMMIT;
