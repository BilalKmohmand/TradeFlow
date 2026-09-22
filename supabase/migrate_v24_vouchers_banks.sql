-- Sarmaya v24: multiple bank accounts, vouchers (CPV / CRV / BPV / BRV / JV), party city details.
-- Run ONCE after the earlier migrations. Safe to re-run (idempotent): only ADD COLUMN IF NOT EXISTS and
-- CREATE INDEX IF NOT EXISTS. No new tables, so row level security is not touched (see lock.sql).
--
-- What needs no column:
--   * a voucher is a row of journal_entries; its lines (with the customer / supplier on the line, the
--     line narration and the implied cash / bank side) live in the existing JSONB "lines";
--   * the voucher number series (cpv, crv, bpv, brv, jv) live in settings."numberSeries" / "docCounters" (v22).

-- Bank accounts: extra banks are accounts 1011, 1012 … under 1010 in the chart ...
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "isBank" BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "accountTitle" TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "accountNumber" TEXT;
-- ... their opening balances by code, the main bank's display name and the managed city list.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "bankOpenings" JSONB;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "mainBankName" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS cities JSONB;

-- The bank account each money record went through (empty = the main bank 1010) and the voucher that wrote it.
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS "bankCode" TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS "voucherId" TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "bankCode" TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "voucherId" TEXT;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS "bankCode" TEXT;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS "voucherId" TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS "bankCode" TEXT;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS "bankCode" TEXT;
ALTER TABLE bank_reconciliations ADD COLUMN IF NOT EXISTS "bankCode" TEXT;

-- Vouchers: type, bank of a BPV / BRV, and who changed it last.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "voucherType" TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "bankCode" TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "updatedBy" TEXT;

-- Customers and suppliers: City / Town, contact person, sales tax number, fax.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "salesTaxNo" TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS fax TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "salesTaxNo" TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS fax TEXT;

CREATE INDEX IF NOT EXISTS ledger_voucher_idx ON ledger ("voucherId");
CREATE INDEX IF NOT EXISTS cash_entries_voucher_idx ON cash_entries ("voucherId");
CREATE INDEX IF NOT EXISTS expenses_voucher_idx ON expenses ("voucherId");
CREATE INDEX IF NOT EXISTS journal_entries_voucher_idx ON journal_entries ("voucherType");
CREATE INDEX IF NOT EXISTS customers_city_idx ON customers (city);
CREATE INDEX IF NOT EXISTS suppliers_city_idx ON suppliers (city);
