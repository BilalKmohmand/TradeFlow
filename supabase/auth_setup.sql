-- ---------------------------------------------------------------------------
-- Sarmaya — Supabase sign-ins for staff (STEP 1 of "Locking the database").
--
-- Run this ONCE, BEFORE the app update that signs staff in to Supabase is published.
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run.
--
-- It is SAFE on a live shop: it does not lock anything, does not change any table the app
-- uses and does not change any value in them. Running it again is safe and changes nothing.
--
-- What it adds:
--   * a private schema, sarmaya_private, that the app cannot read (not exposed by the API):
--       config              – the "grace period" date for first sign-ins (below)
--       auth_links          – which Supabase login belongs to which app user
--       legacy_credentials  – filled by lock.sql: the old password hashes, moved out of the users table
--   * sarmaya_is_staff() / sarmaya_is_admin() – used by the lock (lock.sql) to decide who may use the data
--   * sarmaya_claim_account(...)   – an existing user's first sign-in on the updated app creates their
--                                    Supabase login (grace period only, old password hash must match)
--   * sarmaya_admin_set_login(...) – owner/admin only: new staff, password resets, username changes
--   * the built-in admin: if the shop has no Supabase login for "admin" yet and the admin has never
--     set their own password, a login admin / 1234 is created and linked (the same as the app's
--     built-in admin). If the admin already has their own password, nothing is created: the admin's
--     next sign-in on the updated app links it with that password.
--
-- Every app user signs in to Supabase as <username>@shop.sarmaya.local with their app password.
-- The email is never shown and never receives mail.
--
-- lock.sql (STEP 2) and unlock.sql (undo) are separate files. See README -> "Locking the database".
-- ---------------------------------------------------------------------------

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- The users table columns these functions read (all already created by setup.sql; repeated so this
-- file also works on a project that is part way through).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS roles JSONB;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "passwordSalt" TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "passwordIter" INTEGER;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "pinHash" TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;

-- ============================ 1. Private schema ==============================

CREATE SCHEMA IF NOT EXISTS sarmaya_private;
REVOKE ALL ON SCHEMA sarmaya_private FROM PUBLIC;
REVOKE ALL ON SCHEMA sarmaya_private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS sarmaya_private.config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- First sign-ins of existing users may create their Supabase login until this date (30 days from the
-- first run of this file). Change it with: SELECT sarmaya_private.set_claim_grace(<days>);
INSERT INTO sarmaya_private.config (key, value)
VALUES ('claim_grace_until', (now() + interval '30 days')::text)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS sarmaya_private.auth_links (
  app_user_id TEXT PRIMARY KEY,
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_by TEXT
);

CREATE TABLE IF NOT EXISTS sarmaya_private.legacy_credentials (
  app_user_id TEXT PRIMARY KEY,
  username TEXT,
  password_hash TEXT,
  password_salt TEXT,
  password_iter INTEGER,
  pin TEXT,
  pin_hash TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sarmaya_private.dropped_policies (
  table_name TEXT,
  policy_name TEXT,
  definition JSONB,
  dropped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON ALL TABLES IN SCHEMA sarmaya_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA sarmaya_private FROM anon, authenticated;

-- ============================ 2. Helpers =====================================

CREATE OR REPLACE FUNCTION sarmaya_private.auth_email(p_username TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  -- Must match AUTH_EMAIL_DOMAIN in src/lib/cloudAuth.ts
  SELECT lower(btrim(p_username)) || '@shop.sarmaya.local'
$$;

CREATE OR REPLACE FUNCTION sarmaya_private.has_role(p_role TEXT, p_roles JSONB, p_wanted TEXT[])
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(p_role = ANY (p_wanted), false)
      OR coalesce(jsonb_typeof(p_roles) = 'array' AND p_roles ?| p_wanted, false)
      OR coalesce(jsonb_typeof(p_roles) = 'string' AND (p_roles #>> '{}') = ANY (p_wanted), false)
$$;

CREATE OR REPLACE FUNCTION sarmaya_private.is_active(p_active BOOLEAN, p_status TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(p_active, true) AND coalesce(p_status, 'active') NOT IN ('inactive', 'suspended')
$$;

CREATE OR REPLACE FUNCTION sarmaya_private.set_claim_grace(p_days INTEGER)
RETURNS TEXT LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO sarmaya_private.config (key, value)
  VALUES ('claim_grace_until', (now() + make_interval(days => greatest(p_days, 0)))::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  RETURNING 'First sign-ins may link until ' || value;
$$;

CREATE OR REPLACE FUNCTION sarmaya_private.claim_grace_open()
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce((SELECT value::timestamptz > now() FROM sarmaya_private.config WHERE key = 'claim_grace_until'), false)
$$;

-- Create a Supabase login (confirmed email + bcrypt password), or set a new password on an existing one.
CREATE OR REPLACE FUNCTION sarmaya_private.upsert_auth_user(p_email TEXT, p_password TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, pg_temp AS $$
DECLARE
  v_id UUID;
  v_col TEXT;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(p_email) ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE auth.users
       SET encrypted_password = crypt(p_password, gen_salt('bf', 10)),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           banned_until = NULL,
           updated_at = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(p_email),
          crypt(p_password, gen_salt('bf', 10)), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

  -- Supabase Auth cannot read NULL in these text columns ("Database error querying schema"):
  -- give them '' like a normal sign-up does. Only columns this project's Auth version has.
  FOREACH v_col IN ARRAY ARRAY['confirmation_token', 'recovery_token', 'email_change_token_new',
                               'email_change_token_current', 'email_change', 'phone_change',
                               'phone_change_token', 'reauthentication_token'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = v_col) THEN
      EXECUTE format('UPDATE auth.users SET %1$I = coalesce(%1$I, '''') WHERE id = $1', v_col) USING v_id;
    END IF;
  END LOOP;

  -- The email identity (newer Auth versions have provider_id; older ones use id = user id).
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id') THEN
    EXECUTE 'INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
             VALUES ($1::text, $1, $2, ''email'', now(), now(), now())'
      USING v_id, jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true);
  ELSE
    EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
             VALUES ($1::text, $1, $2, ''email'', now(), now(), now())'
      USING v_id, jsonb_build_object('sub', v_id::text, 'email', lower(p_email));
  END IF;
  RETURN v_id;
END $$;

-- Point a Supabase login at a new email (username change). Refuses if that email is someone else's.
CREATE OR REPLACE FUNCTION sarmaya_private.set_auth_email(p_auth_id UUID, p_email TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_other UUID;
BEGIN
  SELECT id INTO v_other FROM auth.users WHERE lower(email) = lower(p_email) AND id <> p_auth_id LIMIT 1;
  IF v_other IS NOT NULL THEN
    -- A login left behind by a deleted user may be removed; one that still belongs to a user may not.
    IF EXISTS (SELECT 1 FROM sarmaya_private.auth_links l JOIN public.users u ON u.id = l.app_user_id
                WHERE l.auth_user_id = v_other) THEN
      RAISE EXCEPTION 'The username in % is already used by another account.', p_email USING ERRCODE = '23505';
    END IF;
    DELETE FROM auth.users WHERE id = v_other;
  END IF;
  UPDATE auth.users SET email = lower(p_email), updated_at = now() WHERE id = p_auth_id AND lower(email) IS DISTINCT FROM lower(p_email);
  UPDATE auth.identities SET identity_data = identity_data || jsonb_build_object('email', lower(p_email)), updated_at = now()
   WHERE user_id = p_auth_id AND provider = 'email';
END $$;

CREATE OR REPLACE FUNCTION sarmaya_private.link(p_app_user_id TEXT, p_auth_id UUID, p_by TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM sarmaya_private.auth_links WHERE auth_user_id = p_auth_id AND app_user_id <> p_app_user_id;
  INSERT INTO sarmaya_private.auth_links (app_user_id, auth_user_id, linked_by)
  VALUES (p_app_user_id, p_auth_id, p_by)
  ON CONFLICT (app_user_id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id, linked_at = now(), linked_by = EXCLUDED.linked_by;
$$;

-- The app user behind the caller's Supabase session (NULL for anon / unlinked / switched-off users).
CREATE OR REPLACE FUNCTION sarmaya_private.caller()
RETURNS public.users LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.* FROM sarmaya_private.auth_links l
    JOIN public.users u ON u.id = l.app_user_id
   WHERE l.auth_user_id = auth.uid() AND sarmaya_private.is_active(u.active, u.status)
   LIMIT 1
$$;

-- ============================ 3. Checks used by the lock ======================

CREATE OR REPLACE FUNCTION public.sarmaya_is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT c.id IS NOT NULL FROM sarmaya_private.caller() c), false)
$$;

CREATE OR REPLACE FUNCTION public.sarmaya_is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT sarmaya_private.has_role(c.role, c.roles, ARRAY['admin', 'super_admin'])
                     FROM sarmaya_private.caller() c WHERE c.id IS NOT NULL), false)
$$;

CREATE OR REPLACE FUNCTION sarmaya_private.caller_is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT sarmaya_private.has_role(c.role, c.roles, ARRAY['super_admin'])
                     FROM sarmaya_private.caller() c WHERE c.id IS NOT NULL), false)
$$;

-- ============================ 4. First sign-in (grace period) =================
-- Called by the app BEFORE the user has a Supabase session, right after the typed password matched the
-- password hash stored on the device. Creates the Supabase login only when:
--   * the grace period is open (sarmaya_private.config.claim_grace_until),
--   * the username belongs to an active app user who has no Supabase login yet, and
--   * the device's hash equals the hash the shop's database held for that user (kept privately by lock.sql).
-- Returns a status word; never reveals any stored data.
CREATE OR REPLACE FUNCTION public.sarmaya_claim_account(p_username TEXT, p_password TEXT, p_password_hash TEXT)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username TEXT := lower(btrim(coalesce(p_username, '')));
  v_user public.users;
  v_stored TEXT;
  v_auth UUID;
BEGIN
  IF NOT sarmaya_private.claim_grace_open() THEN RETURN 'grace_over'; END IF;
  IF p_password IS NULL OR length(p_password) < 4 OR length(p_password) > 128 THEN RETURN 'invalid_password'; END IF;
  IF v_username = '' OR p_password_hash IS NULL OR p_password_hash = '' THEN RETURN 'hash_mismatch'; END IF;

  SELECT * INTO v_user FROM public.users WHERE lower(username) = v_username ORDER BY "updatedAt" DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN 'no_account'; END IF;
  IF NOT sarmaya_private.is_active(v_user.active, v_user.status) THEN RETURN 'inactive'; END IF;

  IF EXISTS (SELECT 1 FROM sarmaya_private.auth_links WHERE app_user_id = v_user.id)
     OR EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = sarmaya_private.auth_email(v_username)) THEN
    RETURN 'already_linked';
  END IF;

  SELECT coalesce(lc.password_hash, v_user."passwordHash") INTO v_stored
    FROM (SELECT 1) one LEFT JOIN sarmaya_private.legacy_credentials lc ON lc.app_user_id = v_user.id;
  IF v_stored IS NULL THEN RETURN 'no_legacy_password'; END IF;
  IF v_stored IS DISTINCT FROM p_password_hash THEN RETURN 'hash_mismatch'; END IF;

  v_auth := sarmaya_private.upsert_auth_user(sarmaya_private.auth_email(v_username), p_password);
  PERFORM sarmaya_private.link(v_user.id, v_auth, 'claim');
  RETURN 'linked';
END $$;

-- ============================ 5. Owner / admin: staff logins ==================
-- New staff (with their temporary password), password resets, and username changes (p_password NULL).
-- Only a signed-in, linked, active app user with the admin or super_admin role may call it, and only a
-- super_admin may change another super_admin's login.
CREATE OR REPLACE FUNCTION public.sarmaya_admin_set_login(p_user_id TEXT, p_username TEXT, p_password TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username TEXT := lower(btrim(coalesce(p_username, '')));
  v_email TEXT;
  v_target public.users;
  v_linked UUID;
  v_by_email UUID;
  v_auth UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.sarmaya_is_admin() THEN
    RAISE EXCEPTION 'Only the owner or an admin can change sign-ins.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'Missing user id.' USING ERRCODE = '22023';
  END IF;
  IF v_username !~ '^[a-z0-9][a-z0-9._-]{1,31}$' THEN
    RAISE EXCEPTION 'Username must be 2 to 32 letters, numbers, dot, dash or underscore.' USING ERRCODE = '22023';
  END IF;
  IF p_password IS NOT NULL AND (length(p_password) < 8 OR length(p_password) > 128) THEN
    RAISE EXCEPTION 'Password must be 8 to 128 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id;
  IF FOUND AND sarmaya_private.has_role(v_target.role, v_target.roles, ARRAY['super_admin'])
     AND NOT sarmaya_private.caller_is_owner() THEN
    RAISE EXCEPTION 'Only the owner can change the owner''s sign-in.' USING ERRCODE = '42501';
  END IF;

  v_email := sarmaya_private.auth_email(v_username);
  SELECT auth_user_id INTO v_linked FROM sarmaya_private.auth_links WHERE app_user_id = p_user_id;

  IF p_password IS NULL THEN
    IF v_linked IS NULL THEN RETURN 'not_linked'; END IF;
    PERFORM sarmaya_private.set_auth_email(v_linked, v_email);
    RETURN 'renamed';
  END IF;

  IF v_linked IS NOT NULL THEN
    PERFORM sarmaya_private.set_auth_email(v_linked, v_email);
    PERFORM sarmaya_private.upsert_auth_user(v_email, p_password); -- finds the linked login by its email
    RETURN 'updated';
  END IF;

  SELECT id INTO v_by_email FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_by_email IS NOT NULL AND EXISTS (
       SELECT 1 FROM sarmaya_private.auth_links l JOIN public.users u ON u.id = l.app_user_id
        WHERE l.auth_user_id = v_by_email AND l.app_user_id <> p_user_id) THEN
    RAISE EXCEPTION 'The username "%" is already used by another account.', v_username USING ERRCODE = '23505';
  END IF;
  v_auth := sarmaya_private.upsert_auth_user(v_email, p_password);
  PERFORM sarmaya_private.link(p_user_id, v_auth, 'admin:' || coalesce((sarmaya_private.caller()).id, '?'));
  RETURN CASE WHEN v_by_email IS NULL THEN 'created' ELSE 'linked' END;
END $$;

-- ============================ 6. Built-in admin ===============================
-- admin / 1234 (the app's built-in super admin). Idempotent:
--   * a Supabase login for admin already exists  -> only make sure it is linked; the password is NOT changed
--   * the admin has their own password (an old hash is on record) -> nothing is created; the admin's next
--     sign-in on the updated app links it with that password (sarmaya_claim_account)
--   * the built-in admin is switched off or was renamed, or the shop has no "admin" user but has its own
--     owner/admin -> nothing is created
--   * otherwise -> the users row is added if missing (brand-new shop), and the login admin / 1234 is
--     created and linked
CREATE OR REPLACE FUNCTION sarmaya_private.ensure_default_admin()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email TEXT := sarmaya_private.auth_email('admin');
  v_auth UUID;
  v_user public.users;
  v_now TEXT := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  SELECT * INTO v_user FROM public.users WHERE lower(username) = 'admin' ORDER BY "updatedAt" DESC NULLS LAST LIMIT 1;
  SELECT id INTO v_auth FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_auth IS NOT NULL THEN
    IF v_user.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sarmaya_private.auth_links WHERE app_user_id = v_user.id) THEN
      PERFORM sarmaya_private.link(v_user.id, v_auth, 'bootstrap');
      RETURN 'admin: existing Supabase login linked';
    END IF;
    RETURN 'admin: already set up (password unchanged)';
  END IF;

  IF v_user.id IS NOT NULL THEN
    IF NOT sarmaya_private.is_active(v_user.active, v_user.status) THEN
      RETURN 'admin: switched off in the app, no login created';
    END IF;
    IF coalesce((SELECT password_hash FROM sarmaya_private.legacy_credentials WHERE app_user_id = v_user.id), v_user."passwordHash") IS NOT NULL THEN
      RETURN 'admin: has its own password - sign in once as admin on the updated app to link it';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.users WHERE id = 'user-default-admin') THEN
      RETURN 'admin: the built-in admin was renamed, no login created';
    END IF;
    -- Only a brand-new shop gets the built-in admin row. A shop that already has an owner/admin and
    -- deleted "admin" on purpose must not get admin / 1234 back.
    IF EXISTS (SELECT 1 FROM public.users WHERE sarmaya_private.has_role(role, roles, ARRAY['admin', 'super_admin'])) THEN
      RETURN 'admin: this shop has no "admin" user (it has its own owner), no login created';
    END IF;
    INSERT INTO public.users (id, name, username, role, roles, pin, active, status, "mustChangePassword", "failedAttempts", "createdAt", "updatedAt")
    VALUES ('user-default-admin', 'Admin', 'admin', 'super_admin', '["super_admin"]'::jsonb, '', true, 'active', false, 0, left(v_now, 10), v_now)
    RETURNING * INTO v_user;
  END IF;

  v_auth := sarmaya_private.upsert_auth_user(v_email, '1234');
  PERFORM sarmaya_private.link(v_user.id, v_auth, 'bootstrap');
  RETURN 'admin: Supabase login admin / 1234 created and linked';
END $$;

-- Who can sign in to Supabase yet (run: SELECT * FROM sarmaya_private.login_report();)
CREATE OR REPLACE FUNCTION sarmaya_private.login_report()
RETURNS TABLE (username TEXT, name TEXT, role TEXT, active BOOLEAN, supabase_login TEXT, old_password_on_record BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.username, u.name, u.role, sarmaya_private.is_active(u.active, u.status),
         CASE WHEN l.auth_user_id IS NOT NULL THEN 'linked' ELSE 'MISSING' END,
         coalesce(lc.password_hash, u."passwordHash") IS NOT NULL
    FROM public.users u
    LEFT JOIN sarmaya_private.auth_links l ON l.app_user_id = u.id
    LEFT JOIN sarmaya_private.legacy_credentials lc ON lc.app_user_id = u.id
   ORDER BY (l.auth_user_id IS NULL) DESC, u.username
$$;

-- ============================ 7. Who may call what ============================

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sarmaya_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sarmaya_private FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.sarmaya_is_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sarmaya_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sarmaya_admin_set_login(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sarmaya_claim_account(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sarmaya_is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sarmaya_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sarmaya_admin_set_login(TEXT, TEXT, TEXT) TO authenticated;
-- The only thing the sign-in screen may call before signing in:
GRANT EXECUTE ON FUNCTION public.sarmaya_claim_account(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================ 8. Built-in admin now ===========================
DO $$ BEGIN RAISE NOTICE '%', sarmaya_private.ensure_default_admin(); END $$;

COMMIT;

-- Who can already sign in to Supabase (MISSING = links at their next sign-in on the updated app):
SELECT * FROM sarmaya_private.login_report();
