-- Migration v9: billing data integrity.
-- Run ONCE after migrate_v8_simple_billing.sql. Safe to re-run.
BEGIN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "costPricePerKg" NUMERIC;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS "sourceId" TEXT;   -- id of the bill/payment that produced the row
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS method TEXT;       -- payment method (cash vs bank) without parsing text
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS "pairId" TEXT; -- both legs of a cash<->bank transfer share this
CREATE INDEX IF NOT EXISTS invoices_number_idx ON invoices ("invoiceNumber");
COMMIT;
