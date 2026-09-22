-- Sarmaya v23 (fixes): payment reminders, bill numbers across devices.
-- Run ONCE after the earlier migrations. Safe to re-run (idempotent): only ADD COLUMN IF NOT EXISTS.
-- No new tables. Row level security is not touched here (see the security migration).
--
-- Nothing else needs a column:
--   * pack units on quotations and returns live inside the existing JSONB lines
--     (quotations.items[].packName / packSize / packPrice, returns.items[].packName / packSize);
--   * an interest run's id is the ledger row's existing "sourceId";
--   * collection sheets are grouped by the existing ledger "referenceId" (CS-n);
--   * branch balances are worked out from the existing "branchId" columns (v22).

-- Payment reminders: the shop's rules (off by default) ...
ALTER TABLE settings ADD COLUMN IF NOT EXISTS reminders JSONB;
-- ... and when each customer was last reminded, so nobody is reminded twice too soon.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "lastRemindedAt" TEXT;

-- Bill numbers used on two devices: the device each bill was made on, and the number a bill had
-- before it was renumbered because another device had used it first.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "renumberedFrom" TEXT;
CREATE INDEX IF NOT EXISTS invoices_number_idx ON invoices ("invoiceNumber");
