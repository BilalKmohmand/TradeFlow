-- Migration v5: weighbridge weights, freight, sales tax, delivery status/POD, trip expenses, company profile settings.
-- Run ONCE after migrate_v4_cashbook.sql. Safe to re-run.

BEGIN;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "grossKg" NUMERIC;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "tareKg" NUMERIC;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "freightCharge" NUMERIC DEFAULT 0;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "taxRatePct" NUMERIC DEFAULT 0;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "taxAmount" NUMERIC DEFAULT 0;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "totalBilled" NUMERIC;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_transit';
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "deliveredAt" TEXT;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "receivedBy" TEXT;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "podNote" TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "grossKg" NUMERIC;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "tareKg" NUMERIC;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "dispatchId" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "taxRatePct" NUMERIC DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "taxLabel" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyTagline" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyAddress" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyPhone" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "companyTaxId" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "monthlyTargetRs" NUMERIC DEFAULT 0;

COMMIT;
