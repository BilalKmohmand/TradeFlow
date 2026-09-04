-- One-time migration: tons -> kilograms, plus the new purchases / price_history tables.
-- Run ONCE in the Supabase SQL editor on an existing project that used the old schema.
-- Quantities are multiplied by 1000 (1 ton = 1000 kg); unit prices are divided by 1000
-- (Rs./ton -> Rs./kg). Amounts in Rs. are unchanged. Safe to re-run: every step is guarded.

BEGIN;

-- products
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stockTons') THEN
    ALTER TABLE products RENAME COLUMN "stockTons" TO "stockKg";
    ALTER TABLE products RENAME COLUMN "minThresholdTons" TO "minThresholdKg";
    ALTER TABLE products RENAME COLUMN "unitPricePerTon" TO "unitPricePerKg";
    UPDATE products SET "stockKg" = "stockKg" * 1000, "minThresholdKg" = "minThresholdKg" * 1000, "unitPricePerKg" = "unitPricePerKg" / 1000;
  END IF;
END $$;

-- bookings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='totalTons') THEN
    ALTER TABLE bookings RENAME COLUMN "totalTons" TO "totalKg";
    ALTER TABLE bookings RENAME COLUMN "dispatchedTons" TO "dispatchedKg";
    ALTER TABLE bookings RENAME COLUMN "remainingTons" TO "remainingKg";
    ALTER TABLE bookings RENAME COLUMN "pricePerTon" TO "pricePerKg";
    UPDATE bookings SET "totalKg" = "totalKg" * 1000, "dispatchedKg" = "dispatchedKg" * 1000, "remainingKg" = "remainingKg" * 1000, "pricePerKg" = "pricePerKg" / 1000;
  END IF;
END $$;

-- dispatches
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dispatches' AND column_name='tons') THEN
    ALTER TABLE dispatches RENAME COLUMN tons TO kg;
    UPDATE dispatches SET kg = kg * 1000;
  END IF;
END $$;

-- ledger
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ledger' AND column_name='tons') THEN
    ALTER TABLE ledger RENAME COLUMN tons TO kg;
    UPDATE ledger SET kg = kg * 1000 WHERE kg IS NOT NULL;
  END IF;
END $$;

-- new tables
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  "receiptNumber" TEXT NOT NULL,
  "supplierId" TEXT,
  "productId" TEXT,
  kg NUMERIC DEFAULT 0,
  "pricePerKg" NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  date TEXT,
  "truckNumber" TEXT,
  notes TEXT,
  "paymentMadeImmediately" BOOLEAN DEFAULT FALSE,
  "createdAt" TEXT
);

CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  "productId" TEXT,
  "pricePerKg" NUMERIC DEFAULT 0,
  date TEXT,
  source TEXT,
  note TEXT,
  "referenceId" TEXT
);

CREATE INDEX IF NOT EXISTS dispatches_date_idx ON dispatches (date);
CREATE INDEX IF NOT EXISTS purchases_date_idx ON purchases (date);
CREATE INDEX IF NOT EXISTS price_history_product_idx ON price_history ("productId", date);

ALTER TABLE purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_history DISABLE ROW LEVEL SECURITY;

COMMIT;
