-- Migration v3: enterprise features (expenses, fleet, users, booking cancellation, dispatch truck link).
-- Run ONCE in the Supabase SQL editor AFTER migrate_tons_to_kg.sql. Safe to re-run.

BEGIN;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "cancelledAt" TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS "truckId" TEXT;

-- Operating expenses (transport, fuel, labour, rent...)
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TEXT,
  category TEXT,
  amount NUMERIC DEFAULT 0,
  description TEXT,
  "paidVia" TEXT,
  "truckId" TEXT,
  "referenceId" TEXT,
  "createdAt" TEXT,
  "createdBy" TEXT
);

-- Fleet / driver registry
CREATE TABLE IF NOT EXISTS trucks (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  "driverName" TEXT,
  "driverPhone" TEXT,
  "capacityKg" NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'available',
  notes TEXT,
  "createdAt" TEXT
);

-- Named users with their own PIN and role (admin / manager / operator)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'operator',
  pin TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  "createdAt" TEXT
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (date);

ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE trucks DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

COMMIT;
