-- Migration v16: username + password sign-in (replaces PIN sign-in).
-- Run ONCE after the earlier migrations. Safe to re-run (every statement is idempotent).
--
-- The app hashes passwords in the browser with PBKDF2-SHA256 (WebCrypto, random 16-byte salt,
-- 210,000 iterations) and stores only passwordHash / passwordSalt / passwordIter here, so the
-- owner can sign in on another device. Plain-text passwords are never stored.
--
-- SECURITY NOTE: like every other table, users has RLS disabled and is reachable with the anon
-- key, so anyone holding that key can read or change these rows (including the hashes). Real
-- database security would additionally need Supabase Auth + Row Level Security policies; that is
-- not part of this migration.
BEGIN;

-- Sign-in identity
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Password (PBKDF2) and the forced "choose a new password" flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordSalt" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordIter" INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN DEFAULT FALSE;

-- Legacy PIN hash (cleared once each user sets a password)
ALTER TABLE users ADD COLUMN IF NOT EXISTS "pinHash" TEXT;

-- Failed-attempt lockout and bookkeeping
ALTER TABLE users ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lockedUntil" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastLoginAt" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;

-- Users without a PIN (new accounts) are allowed; the old column stays for the one-time PIN sign-in.
ALTER TABLE users ALTER COLUMN pin DROP NOT NULL;

CREATE INDEX IF NOT EXISTS users_username_idx ON users (lower(username));

-- The old shared master PIN is no longer used for sign-in; the app clears it once the owner has a password.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "masterPin" TEXT;

ALTER TABLE users DISABLE ROW LEVEL SECURITY;

COMMIT;
