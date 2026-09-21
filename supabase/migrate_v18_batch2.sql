-- Sarmaya v18 (batch 2): pack units on items, bill print size / footer / previous balance,
-- and the "allow bills when stock is short" switch.
-- Run ONCE after the earlier migrations (or just run setup.sql). Safe to re-run.

-- Items: optional second unit, e.g. base "tin" with "carton" = 6 tins. Stock stays in the base unit.
ALTER TABLE products ADD COLUMN IF NOT EXISTS "packName" TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "packSize" NUMERIC;
-- The shop's own item code, typed on New Bill to find the item.
ALTER TABLE products ADD COLUMN IF NOT EXISTS code TEXT;

-- Shop settings for bills.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "allowNegativeStock" BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "billPrintSize" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "billFooter" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "showPrevBalanceOnBill" BOOLEAN DEFAULT FALSE;
