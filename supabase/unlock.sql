-- ---------------------------------------------------------------------------
-- Sarmaya — UNDO the lock (rollback for supabase/lock.sql).
--
-- Use only if something went wrong after locking. It puts the database back the way it was
-- before lock.sql: row level security off and the anon key allowed to read and write every
-- table again (the old, open state).
--
-- It keeps: the Supabase logins, which user they belong to (sarmaya_private.auth_links) and the
-- private copy of the old password hashes. The updated app keeps working exactly as before the
-- lock, and lock.sql can be run again at any time.
--
-- It does NOT copy the old password hashes back into the users table: the updated app does not
-- need them. Only if you also go back to an OLD version of the app, run the optional block at
-- the end so staff can sign in on devices they have never used.
--
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run. Safe to run twice.
-- ---------------------------------------------------------------------------

BEGIN;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT c.relname AS name
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
            ORDER BY c.relname LOOP
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_staff ON public.%I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_staff_read ON public.%I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_staff_add ON public.%I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_staff_change ON public.%I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_admin_delete ON public.%I', t.name);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.name);
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated', t.name);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS sarmaya_users_guard ON public.users;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
-- ...except the owner/admin sign-in function, which stays for signed-in users only.
REVOKE EXECUTE ON FUNCTION public.sarmaya_admin_set_login(TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sarmaya_is_staff() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sarmaya_is_admin() FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

DELETE FROM sarmaya_private.config WHERE key = 'locked_at';

COMMIT;

-- ---------------------------------------------------------------------------
-- OPTIONAL — only if you are also going back to an OLD version of the app (one that signs in
-- from the password hashes in the users table). Remove the two dashes in front of each line
-- below and run just this part:
--
-- UPDATE public.users u
--    SET "passwordHash" = lc.password_hash, "passwordSalt" = lc.password_salt, "passwordIter" = lc.password_iter,
--        "pinHash" = lc.pin_hash, pin = coalesce(lc.pin, '')
--   FROM sarmaya_private.legacy_credentials lc
--  WHERE lc.app_user_id = u.id AND u."passwordHash" IS NULL;
-- ---------------------------------------------------------------------------
