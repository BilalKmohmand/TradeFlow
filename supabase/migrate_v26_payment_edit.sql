-- Sarmaya v26: editable payments. Run ONCE after the earlier migrations. Safe to re-run (idempotent).
BEGIN;
-- Payments: the note typed with a payment, and the edit history of a saved payment (Edit payment).
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS edits JSONB;
COMMIT;
