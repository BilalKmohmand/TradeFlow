-- Run this in the Supabase SQL Editor to create tables matching the Sarmaya app types.
-- Column names mirror the TypeScript interfaces (camelCase).

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  "totalDue" NUMERIC DEFAULT 0,
  "creditLimit" NUMERIC DEFAULT 0,
  "createdAt" TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  "materialCategory" TEXT,
  "totalOwed" NUMERIC DEFAULT 0,
  address TEXT,
  "createdAt" TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  "unitPricePerTon" NUMERIC DEFAULT 0,
  "stockTons" NUMERIC DEFAULT 0,
  "minThresholdTons" NUMERIC DEFAULT 0,
  "supplierId" TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  "bookingNumber" TEXT NOT NULL,
  "customerId" TEXT,
  "productId" TEXT,
  "totalTons" NUMERIC DEFAULT 0,
  "dispatchedTons" NUMERIC DEFAULT 0,
  "remainingTons" NUMERIC DEFAULT 0,
  "pricePerTon" NUMERIC DEFAULT 0,
  "totalAmount" NUMERIC DEFAULT 0,
  "paidAmount" NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
  "paymentStatus" TEXT DEFAULT 'unpaid',
  "createdAt" TEXT,
  "targetDeliveryDate" TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY,
  "dispatchNumber" TEXT NOT NULL,
  "bookingId" TEXT,
  "customerId" TEXT,
  "productId" TEXT,
  tons NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  "truckNumber" TEXT,
  "driverPhone" TEXT,
  date TEXT,
  notes TEXT,
  "whatsappSent" BOOLEAN DEFAULT FALSE,
  "whatsappMessage" TEXT,
  "paymentReceivedImmediately" BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  "entityType" TEXT,
  "entityId" TEXT,
  type TEXT,
  "referenceId" TEXT,
  date TEXT,
  description TEXT,
  debit NUMERIC DEFAULT 0,
  credit NUMERIC DEFAULT 0,
  "balanceAfter" NUMERIC DEFAULT 0,
  tons NUMERIC
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  type TEXT,
  "recipientName" TEXT,
  "recipientPhone" TEXT,
  "recipientType" TEXT,
  message TEXT,
  timestamp TEXT,
  status TEXT,
  "bookingId" TEXT,
  "dispatchId" TEXT
);

-- Disable Row Level Security for the public/anon key so the app can read and write
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages DISABLE ROW LEVEL SECURITY;
