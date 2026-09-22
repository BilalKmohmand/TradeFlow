-- Sarmaya v25 (Apna Accountant layer): memo no. and delivery orders on bills, purchase invoices,
-- and the "classic menu" switch.
-- Run ONCE after the earlier migrations (and after supabase/setup.sql). Safe to re-run (idempotent):
-- only CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS; nothing is dropped or changed.
--
-- Row level security: the new table follows the shop. If the database has been locked
-- (supabase/lock.sql), purchase_invoices is locked the same way (signed-in active staff only, nothing
-- for anon); if it has not been locked yet, RLS stays off like on every other table. Running lock.sql
-- again afterwards is also fine.

BEGIN;

-- ---------------------------------------------------------------------------
-- Bills (invoices): memo no., "entered on" time, delivery order
-- ---------------------------------------------------------------------------
-- The shop's own book / reference number written on the bill (printed, searchable).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "memoNo" TEXT;
-- Exact time the bill was typed in; the bill's own date ("your date") stays in "issueDate".
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "enteredAt" TEXT;
-- Delivery order: { status: 'pending' | 'delivered', deliveredOn, deliveredBy, vehicle, note, markedBy, markedAt }.
-- Stock is still taken when the bill is made (as in the old program); only the status is kept here.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery JSONB;
CREATE INDEX IF NOT EXISTS invoices_memo_idx ON invoices ("memoNo");

-- ---------------------------------------------------------------------------
-- Purchase invoices (the supplier's bill typed in as one document)
-- Each line is also a stock receipt in "purchases" (lines[].purchaseId), so stock, the supplier ledger
-- and the books work exactly as for Receive stock. Numbers: series "purchase_invoice" (default P-1) in
-- settings."numberSeries" / "docCounters" (v22 columns, nothing new needed).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id TEXT PRIMARY KEY,
  "invoiceNumber" TEXT NOT NULL,
  "memoNo" TEXT,
  date TEXT,
  "supplierId" TEXT,
  "supplierName" TEXT,
  "godownId" TEXT,
  lines JSONB,
  "grossAmount" NUMERIC DEFAULT 0,
  "discountPct" NUMERIC,
  "discountAmount" NUMERIC DEFAULT 0,
  "otherCharges" NUMERIC DEFAULT 0,
  "totalAmount" NUMERIC DEFAULT 0,
  "paidAmount" NUMERIC DEFAULT 0,
  "paidMethod" TEXT,
  "paymentLedgerId" TEXT,
  "roundingLedgerId" TEXT,
  remarks TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT,
  "branchId" TEXT
);
-- A table made by an earlier draft of this file gets any column it is missing.
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "memoNo" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "supplierName" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "godownId" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS lines JSONB;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "grossAmount" NUMERIC DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "discountPct" NUMERIC;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "discountAmount" NUMERIC DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "otherCharges" NUMERIC DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "totalAmount" NUMERIC DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "paidAmount" NUMERIC DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "paidMethod" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "paymentLedgerId" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "roundingLedgerId" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "createdAt" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS "branchId" TEXT;
CREATE INDEX IF NOT EXISTS purchase_invoices_number_idx ON purchase_invoices ("invoiceNumber");
CREATE INDEX IF NOT EXISTS purchase_invoices_supplier_idx ON purchase_invoices ("supplierId");

-- ---------------------------------------------------------------------------
-- Settings: show the classic menu (16 big buttons) on Home. Empty = on.
-- ---------------------------------------------------------------------------
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "classicMenu" BOOLEAN;

-- ---------------------------------------------------------------------------
-- Row level security for the new table: same as the rest of the shop.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  locked boolean := false;
BEGIN
  IF to_regclass('sarmaya_private.config') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM sarmaya_private.config WHERE key = ''locked_at'')' INTO locked;
  END IF;
  IF locked AND to_regprocedure('public.sarmaya_is_staff()') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS sarmaya_staff ON public.purchase_invoices';
    EXECUTE 'CREATE POLICY sarmaya_staff ON public.purchase_invoices FOR ALL TO authenticated USING ((SELECT public.sarmaya_is_staff())) WITH CHECK ((SELECT public.sarmaya_is_staff()))';
    EXECUTE 'REVOKE ALL ON public.purchase_invoices FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated';
  ELSE
    EXECUTE 'ALTER TABLE public.purchase_invoices DISABLE ROW LEVEL SECURITY';
  END IF;
END $$;

COMMIT;
