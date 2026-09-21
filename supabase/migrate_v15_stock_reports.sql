-- Migration v15: stock adjustments per godown / batch, and purchase returns (debit notes) in billing mode.
-- Run ONCE after setup.sql (or after v12 on an older database). Safe to re-run.
BEGIN;

-- Stock adjustments (leaked, damaged, expired, count correction, received free...) remember the
-- godown and batch they were made in, so undoing one puts the stock back in the same place.
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS "costPerKg" NUMERIC;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS "godownId" TEXT;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS "batchId" TEXT;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS "batchNo" TEXT;

-- Goods sent back to a supplier: which godown and batches they left from, and the item's unit
-- (bag, tin, can...) printed on the debit note.
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "godownId" TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS batches JSONB;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS unit TEXT;

-- Item history and the purchase register look records up by item and date.
CREATE INDEX IF NOT EXISTS stock_adjustments_product_idx ON stock_adjustments ("productId");
CREATE INDEX IF NOT EXISTS returns_product_idx ON returns ("productId");
CREATE INDEX IF NOT EXISTS purchases_date_idx ON purchases (date);

COMMIT;
