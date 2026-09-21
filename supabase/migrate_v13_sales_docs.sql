-- Migration v13: sales documents in billing mode.
--   * sales returns / credit notes linked to a bill (money back now, or off what the customer owes)
--   * line discounts on bills (stored inside invoices.items JSONB: discountType, discountValue, discountAmount)
--   * customer-specific item rates
--   * multi-item quotations that convert into a bill
--   * delivery challans are printed from the bill (nothing stored)
-- Run ONCE after the earlier migrations. Safe to re-run.
BEGIN;

-- Returns against a bill: which bill, the returned lines (qty, value, cost, batches), the tax part,
-- and how much was paid back in money now.
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "taxAmount" NUMERIC DEFAULT 0;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "refundAmount" NUMERIC DEFAULT 0;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS "refundMethod" TEXT;
CREATE INDEX IF NOT EXISTS returns_invoice_idx ON returns ("invoiceId");

-- Bills: value returned (incl. tax), money refunded, and the quotation the bill was made from.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "returnedAmount" NUMERIC DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "refundedAmount" NUMERIC DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "quotationId" TEXT;

-- Quotations: several items per quote, and the bill it became.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;

-- Customer-specific rates: one agreed price per customer and item.
CREATE TABLE IF NOT EXISTS customer_agreed_rates (
  id TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "agreedRatePerKg" NUMERIC NOT NULL DEFAULT 0,   -- price per the item's own unit (can, tin, ...)
  "effectiveDate" TEXT,
  notes TEXT,
  "createdAt" TEXT,
  "updatedAt" TEXT
);
CREATE INDEX IF NOT EXISTS customer_agreed_rates_customer_idx ON customer_agreed_rates ("customerId");

-- Internal tool: RLS disabled so the anon key can read/write (same as every other table).
ALTER TABLE customer_agreed_rates DISABLE ROW LEVEL SECURITY;

-- Ledger rows of type 'refund_paid' (money handed back for a return) use the existing columns.

COMMIT;
