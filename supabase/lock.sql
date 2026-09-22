-- ---------------------------------------------------------------------------
-- Sarmaya — LOCK the database (STEP 2 of "Locking the database" in README.md).
--
-- After this, only signed-in shop staff can read or change the shop's data. The public
-- "anon" key on its own can no longer read or write anything, and the password hashes are
-- no longer in the users table.
--
-- Before running it:
--   1. supabase/auth_setup.sql has been run (this file stops with a message if not);
--   2. the updated app is live and every device has reloaded it;
--   3. the owner (or the built-in admin) has signed in once on the updated app.
--      This file refuses to lock if no owner/admin can sign in yet.
--
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run.
-- Safe to run again (e.g. after re-running setup.sql, which switches RLS off on some tables):
-- it simply puts every lock back in place.
--
-- Undo: supabase/unlock.sql.
-- ---------------------------------------------------------------------------

BEGIN;

-- ============================ 0. Checks ======================================

DO $$
BEGIN
  IF to_regprocedure('public.sarmaya_is_staff()') IS NULL
     OR to_regprocedure('public.sarmaya_claim_account(text,text,text)') IS NULL
     OR to_regclass('sarmaya_private.auth_links') IS NULL THEN
    RAISE EXCEPTION 'Run supabase/auth_setup.sql first, then run this file again.';
  END IF;
END $$;

-- ============================ 1. Built-in admin ==============================
-- Creates the Supabase login admin / 1234 and links it, when the shop does not have one yet and the
-- built-in admin never set their own password (see sarmaya_private.ensure_default_admin in
-- auth_setup.sql). If admin already has a login, its password is left alone.
DO $$ BEGIN RAISE NOTICE '%', sarmaya_private.ensure_default_admin(); END $$;

-- Never lock the shop out: at least one active owner/admin must be able to sign in.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM sarmaya_private.auth_links l
      JOIN public.users u ON u.id = l.app_user_id
      JOIN auth.users a ON a.id = l.auth_user_id
     WHERE sarmaya_private.is_active(u.active, u.status)
       AND sarmaya_private.has_role(u.role, u.roles, ARRAY['admin', 'super_admin'])
  ) THEN
    RAISE EXCEPTION 'Nothing was locked: no owner/admin can sign in to Supabase yet. Open the updated app, sign in once as the owner (or admin), then run this file again. To see who is linked: SELECT * FROM sarmaya_private.login_report();';
  END IF;
END $$;

-- ============================ 2. Password hashes out of the users table =======
-- A private copy is kept (the app cannot read it) so that, during the grace period, a user who
-- has not signed in on the updated app yet can still link their account (sarmaya_claim_account).
INSERT INTO sarmaya_private.legacy_credentials AS lc (app_user_id, username, password_hash, password_salt, password_iter, pin, pin_hash)
SELECT id, lower(username), "passwordHash", "passwordSalt", "passwordIter", nullif(pin, ''), "pinHash"
  FROM public.users
 WHERE "passwordHash" IS NOT NULL OR "pinHash" IS NOT NULL OR coalesce(pin, '') <> ''
ON CONFLICT (app_user_id) DO UPDATE SET
  username      = coalesce(EXCLUDED.username, lc.username),
  password_hash = coalesce(EXCLUDED.password_hash, lc.password_hash),
  password_salt = coalesce(EXCLUDED.password_salt, lc.password_salt),
  password_iter = coalesce(EXCLUDED.password_iter, lc.password_iter),
  pin           = coalesce(EXCLUDED.pin, lc.pin),
  pin_hash      = coalesce(EXCLUDED.pin_hash, lc.pin_hash),
  saved_at      = now();

UPDATE public.users
   SET "passwordHash" = NULL, "passwordSalt" = NULL, "passwordIter" = NULL, "pinHash" = NULL, pin = ''
 WHERE "passwordHash" IS NOT NULL OR "passwordSalt" IS NOT NULL OR "passwordIter" IS NOT NULL
    OR "pinHash" IS NOT NULL OR coalesce(pin, '') <> '';

-- The old shared master PIN (plain text) is not used for anything any more.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'masterPin') THEN
    EXECUTE 'UPDATE public.settings SET "masterPin" = NULL WHERE "masterPin" IS NOT NULL';
  END IF;
END $$;

-- ============================ 3. Guard on the users table =====================
-- * password material can never be written into the shared table again (an old app version would try);
-- * signed-in staff who are not owner/admin cannot change anyone's role, switch accounts on/off or
--   rename them, and cannot add an owner/admin; only the owner can change an owner's row;
-- * nobody can delete their own user row from the app.
CREATE OR REPLACE FUNCTION sarmaya_private.users_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin BOOLEAN;
  v_owner BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Nobody can delete their own user row from the app (e.g. "empty the users table"): that would
    -- take away their own access and could leave the shop with no one able to sign in.
    IF auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM sarmaya_private.auth_links
                                           WHERE app_user_id = OLD.id AND auth_user_id = auth.uid()) THEN
      RETURN NULL;
    END IF;
    RETURN OLD;
  END IF;

  NEW."passwordHash" := NULL;
  NEW."passwordSalt" := NULL;
  NEW."passwordIter" := NULL;
  NEW."pinHash" := NULL;
  NEW.pin := '';

  -- Only requests from the app (a signed-in Supabase user) are checked; the SQL editor is not.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  v_admin := public.sarmaya_is_admin();
  v_owner := sarmaya_private.caller_is_owner();

  IF TG_OP = 'INSERT' THEN
    -- An upsert of an existing row continues as an UPDATE (checked below).
    IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN RETURN NEW; END IF;
    IF sarmaya_private.has_role(NEW.role, NEW.roles, ARRAY['super_admin']) AND NOT v_owner THEN RETURN NULL; END IF;
    IF sarmaya_private.has_role(NEW.role, NEW.roles, ARRAY['admin']) AND NOT v_admin THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;

  IF NOT v_admin
     OR (NOT v_owner AND (sarmaya_private.has_role(OLD.role, OLD.roles, ARRAY['super_admin'])
                          OR sarmaya_private.has_role(NEW.role, NEW.roles, ARRAY['super_admin']))) THEN
    NEW.role := OLD.role;
    NEW.roles := OLD.roles;
    NEW.active := OLD.active;
    NEW.username := OLD.username;
    IF coalesce(OLD.status, '') IN ('inactive', 'suspended') OR coalesce(NEW.status, '') IN ('inactive', 'suspended') THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sarmaya_private.users_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS sarmaya_users_guard ON public.users;
CREATE TRIGGER sarmaya_users_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION sarmaya_private.users_guard();

-- ============================ 4. Row level security on every table ============
-- Every table in the public schema: RLS on, one rule "signed-in, linked, active staff only".
-- The users table: staff may read and update (guarded above); only owner/admin may delete.
-- Any older policy on these tables is removed (its definition is kept in sarmaya_private.dropped_policies),
-- so nothing else can open a table again.
DO $$
DECLARE
  t RECORD;
  p RECORD;
BEGIN
  FOR t IN SELECT c.relname AS name
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
            ORDER BY c.relname LOOP
    FOR p IN SELECT policyname FROM pg_policies
              WHERE schemaname = 'public' AND tablename = t.name AND policyname NOT LIKE 'sarmaya\_%' LOOP
      INSERT INTO sarmaya_private.dropped_policies (table_name, policy_name, definition)
      SELECT t.name, p.policyname, to_jsonb(x) FROM pg_policies x
       WHERE x.schemaname = 'public' AND x.tablename = t.name AND x.policyname = p.policyname;
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t.name);
      RAISE NOTICE 'Removed old policy "%" on %', p.policyname, t.name;
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.name);
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_staff ON public.%I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_staff_read ON public.%I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_staff_add ON public.%I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_staff_change ON public.%I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS sarmaya_admin_delete ON public.%I', t.name);

    IF t.name = 'users' THEN
      EXECUTE 'CREATE POLICY sarmaya_staff_read ON public.users FOR SELECT TO authenticated USING ((SELECT public.sarmaya_is_staff()))';
      EXECUTE 'CREATE POLICY sarmaya_staff_add ON public.users FOR INSERT TO authenticated WITH CHECK ((SELECT public.sarmaya_is_staff()))';
      EXECUTE 'CREATE POLICY sarmaya_staff_change ON public.users FOR UPDATE TO authenticated USING ((SELECT public.sarmaya_is_staff())) WITH CHECK ((SELECT public.sarmaya_is_staff()))';
      EXECUTE 'CREATE POLICY sarmaya_admin_delete ON public.users FOR DELETE TO authenticated USING ((SELECT public.sarmaya_is_admin()))';
    ELSE
      EXECUTE format('CREATE POLICY sarmaya_staff ON public.%I FOR ALL TO authenticated USING ((SELECT public.sarmaya_is_staff())) WITH CHECK ((SELECT public.sarmaya_is_staff()))', t.name);
    END IF;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.name);
  END LOOP;
END $$;

-- Views and sequences: nothing for anon either.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Functions: anon may only call the first-sign-in function.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.sarmaya_claim_account(TEXT, TEXT, TEXT) TO anon;

-- Tables, sequences and functions created later (e.g. by a new setup.sql) are not given to anon either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

INSERT INTO sarmaya_private.config (key, value) VALUES ('locked_at', now()::text)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;

-- Who can sign in (MISSING = must sign in once on the updated app during the grace period, or the
-- owner sets them a temporary password under Admin -> Users):
SELECT * FROM sarmaya_private.login_report();
