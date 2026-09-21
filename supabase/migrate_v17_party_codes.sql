-- Sarmaya v17: the shop's own customer / supplier IDs (codes from their old books or department).
-- Run ONCE after the earlier migrations (or just run setup.sql). Safe to re-run.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS code TEXT;
CREATE INDEX IF NOT EXISTS customers_code_idx ON customers (lower(code));
CREATE INDEX IF NOT EXISTS suppliers_code_idx ON suppliers (lower(code));
