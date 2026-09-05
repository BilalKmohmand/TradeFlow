-- Migration v7: sync shared master PIN across devices via settings.
-- Run once; safe to re-run.

BEGIN;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS "masterPin" TEXT;

COMMIT;
