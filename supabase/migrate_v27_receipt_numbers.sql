-- Sarmaya v27: receipt numbers on bill payments. Run ONCE after the earlier migrations. Safe to re-run (idempotent).
BEGIN;
-- A payment taken on a bill (Bill detail -> Receive payment) gets its own receipt number, shown before saving,
-- on every payment list, the cash book and the printed receipt. referenceId stays the bill number.
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS "receiptNo" TEXT;
COMMIT;
