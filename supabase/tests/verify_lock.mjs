#!/usr/bin/env node
/**
 * End-to-end check of supabase/auth_setup.sql, lock.sql and unlock.sql against a real Supabase stack
 * (supabase/postgres + GoTrue + PostgREST in Docker). Never touches a live project.
 *
 *   bash supabase/tests/start_stack.sh      # starts the three containers (see that file)
 *   node supabase/tests/verify_lock.mjs     # runs every check, prints PASS/FAIL, exits 1 on any failure
 *   bash supabase/tests/stop_stack.sh
 *
 * Scenario: a brand-new project (setup.sql + auth_setup.sql → admin / 1234), then a "live shop" with
 * existing users waji and waji2 (old PBKDF2 hashes in the users table), Phase 1 (unlocked) linking,
 * lock.sql twice, the locked behaviour for anon / staff / non-staff, unlock.sql, lock again, unlock again.
 */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(here, '..');
const DB = process.env.SARMAYA_TEST_DB || 'sarmaya-db';
const AUTH = process.env.SARMAYA_TEST_AUTH || 'http://localhost:59999';
const REST = process.env.SARMAYA_TEST_REST || 'http://localhost:53001';
const JWT_SECRET = process.env.SARMAYA_TEST_JWT_SECRET || 'sarmaya-test-jwt-secret-at-least-32-chars-long';

// ---------------------------------------------------------------- helpers
const b64url = (b) => Buffer.from(b).toString('base64url');
const signJwt = (payload) => {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')}`;
};
const ANON_KEY = signJwt({ role: 'anon', iss: 'supabase', iat: 1700000000, exp: 2000000000 });

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `\n      -> ${detail}` : ''}`);
};

const psql = (sql, { user = 'postgres', allowError = false } = {}) => {
  try {
    return execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=testpw', DB, 'psql', '-h', 'localhost', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|'], {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    if (allowError) return `ERROR: ${String(e.stderr || e.message)}`;
    throw new Error(`psql failed: ${e.stderr || e.message}`);
  }
};
const runFile = (name) => {
  const out = execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=testpw', DB, 'psql', '-h', 'localhost', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q'], {
    input: `\\set QUIET on\n${requireFile(name)}`,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  psql(`NOTIFY pgrst, 'reload schema';`);
  return out;
};
import { readFileSync } from 'node:fs';
const requireFile = (name) => readFileSync(path.join(SQL_DIR, name), 'utf8');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const signIn = async (username, password) => {
  const res = await fetch(`${AUTH}/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${username}@shop.sarmaya.local`, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, token: body.access_token || null, body };
};
const rest = async (method, pathAndQuery, token = null, body = undefined, extraHeaders = {}) => {
  const res = await fetch(`${REST}${pathAndQuery}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token || ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
};
const rpc = (fn, args, token = null) => rest('POST', `/rpc/${fn}`, token, args);
const rows = (r) => (Array.isArray(r.body) ? r.body : []);
const denied = (r) => r.status === 401 || r.status === 403 || (r.body && r.body.code === '42501');

// ---------------------------------------------------------------- scenario
const main = async () => {
  // Fresh start (idempotent): drop what earlier runs made.
  psql(`
    DROP SCHEMA IF EXISTS sarmaya_private CASCADE;
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t.tablename);
      END LOOP;
    END $$;
    DROP FUNCTION IF EXISTS public.sarmaya_is_staff(), public.sarmaya_is_admin(),
      public.sarmaya_claim_account(text,text,text), public.sarmaya_admin_set_login(text,text,text);
  `);
  psql(`DELETE FROM auth.users WHERE email LIKE '%@shop.sarmaya.local';`);

  console.log('\n== A. Brand-new project: setup.sql, then auth_setup.sql (twice)');
  runFile('setup.sql');
  const firstRun = runFile('auth_setup.sql');
  runFile('auth_setup.sql');
  check('auth_setup.sql runs twice without error', true);
  const adminRow = psql(`SELECT id, username, role FROM public.users WHERE username = 'admin';`);
  check('brand-new shop gets the built-in admin row', adminRow === 'user-default-admin|admin|super_admin', adminRow || firstRun);
  let admin = await signIn('admin', '1234');
  check('admin / 1234 signs in to Supabase Auth (real GoTrue) after the bootstrap', admin.status === 200 && Boolean(admin.token), JSON.stringify(admin.body));
  check('the bootstrap does not change an existing admin password on re-run', psql(`SELECT count(*) FROM auth.users WHERE email = 'admin@shop.sarmaya.local';`) === '1');

  console.log('\n== B. Live shop, Phase 1 (unlocked): existing users with old hashes');
  psql(`
    INSERT INTO public.users (id, name, username, role, roles, pin, active, status, "passwordHash", "passwordSalt", "passwordIter", "updatedAt", "createdAt") VALUES
      ('user-waji',  'Waji',  'waji',  'super_admin', '["super_admin"]', '', true, 'active', 'HASH-WAJI',  'SALT1', 210000, '2026-09-01T00:00:00Z', '2026-09-01'),
      ('user-waji2', 'Waji2', 'waji2', 'operator',    '["operator"]',    '', true, 'active', 'HASH-WAJI2', 'SALT2', 210000, '2026-09-01T00:00:00Z', '2026-09-01');
    INSERT INTO public.customers (id, name, company, phone) VALUES ('c1', 'Zaman', 'Zaman Traders', '0300');
  `);
  check('Phase 1: anon can still read customers (nothing locked yet)', rows(await rest('GET', '/customers?select=id')).length === 1);
  check('claim with the wrong hash is refused', (await rpc('sarmaya_claim_account', { p_username: 'waji2', p_password: 'waji2-pass-1', p_password_hash: 'WRONG' })).body === 'hash_mismatch');
  check('claim with the matching hash links waji2', (await rpc('sarmaya_claim_account', { p_username: 'waji2', p_password: 'waji2-pass-1', p_password_hash: 'HASH-WAJI2' })).body === 'linked');
  let waji2 = await signIn('waji2', 'waji2-pass-1');
  check('waji2 signs in to Supabase with the claimed password', waji2.status === 200, JSON.stringify(waji2.body));
  check('a second claim for waji2 reports already_linked (cannot take over)', (await rpc('sarmaya_claim_account', { p_username: 'waji2', p_password: 'attacker-pass', p_password_hash: 'HASH-WAJI2' })).body === 'already_linked');
  check('claim for an unknown username reports no_account', (await rpc('sarmaya_claim_account', { p_username: 'nobody', p_password: 'xxxxxxxx', p_password_hash: 'x' })).body === 'no_account');

  const anonAdmin = await rpc('sarmaya_admin_set_login', { p_user_id: 'user-x', p_username: 'x1', p_password: 'temp-pass-1' });
  check('admin RPC: anon cannot call it', anonAdmin.status >= 400, JSON.stringify(anonAdmin));
  const opAdmin = await rpc('sarmaya_admin_set_login', { p_user_id: 'user-x', p_username: 'x1', p_password: 'temp-pass-1' }, waji2.token);
  check('admin RPC: refuses a signed-in non-admin (operator waji2)', opAdmin.status >= 400 && /owner or an admin/.test(JSON.stringify(opAdmin.body)), JSON.stringify(opAdmin));
  const created = await rpc('sarmaya_admin_set_login', { p_user_id: 'user-sana', p_username: 'sana', p_password: 'sana-temp-1' }, admin.token);
  check('admin RPC: admin creates a login for new staff "sana"', created.status === 200 && created.body === 'created', JSON.stringify(created));
  psql(`INSERT INTO public.users (id, name, username, role, roles, pin, active, status, "createdAt") VALUES ('user-sana', 'Sana', 'sana', 'editor', '["editor"]', '', true, 'active', '2026-09-02');`);
  check('new staff signs in with the temporary password', (await signIn('sana', 'sana-temp-1')).status === 200);
  const reset = await rpc('sarmaya_admin_set_login', { p_user_id: 'user-waji2', p_username: 'waji2', p_password: 'waji2-reset-2' }, admin.token);
  check('admin RPC: password reset for waji2', reset.body === 'updated', JSON.stringify(reset));
  check('after reset the old password fails', (await signIn('waji2', 'waji2-pass-1')).status === 400);
  waji2 = await signIn('waji2', 'waji2-reset-2');
  check('after reset the new password works', waji2.status === 200);
  const renamed = await rpc('sarmaya_admin_set_login', { p_user_id: 'user-sana', p_username: 'sana.k', p_password: null }, admin.token);
  check('admin RPC: username change moves the login (sana -> sana.k)', renamed.body === 'renamed' && (await signIn('sana.k', 'sana-temp-1')).status === 200, JSON.stringify(renamed));
  psql(`UPDATE public.users SET username = 'sana.k' WHERE id = 'user-sana';`);
  const ownerByAdmin = await rpc('sarmaya_admin_set_login', { p_user_id: 'user-waji', p_username: 'waji', p_password: 'takeover-1' }, waji2.token);
  check('admin RPC: operator cannot reset the owner either', ownerByAdmin.status >= 400);

  console.log('\n== C. lock.sql (run twice)');
  runFile('lock.sql');
  runFile('lock.sql');
  check('lock.sql runs twice without error', true);
  await pause(300);

  const rlsOff = psql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;`);
  const tableCount = psql(`SELECT count(*) FROM pg_tables WHERE schemaname = 'public';`);
  check(`RLS is on for every public table (${tableCount} tables)`, rlsOff === '0', `tables without RLS: ${rlsOff}`);
  const anonGrants = psql(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'anon' AND table_schema = 'public';`);
  check('anon holds no privilege on any public table', anonGrants === '0', anonGrants);

  const anonCustomers = await rest('GET', '/customers?select=*');
  check('anon cannot read customers', denied(anonCustomers), JSON.stringify(anonCustomers));
  const anonUsers = await rest('GET', '/users?select=*');
  check('anon cannot read users', denied(anonUsers), JSON.stringify(anonUsers));
  const anonHash = await rest('GET', '/users?select=id,passwordHash,passwordSalt,passwordIter');
  check('anon cannot read the hash columns', denied(anonHash), JSON.stringify(anonHash));
  const anonWrite = await rest('POST', '/customers', null, { id: 'c-anon', name: 'x', company: 'x', phone: 'x' });
  check('anon cannot write customers', denied(anonWrite), JSON.stringify(anonWrite));
  const anonDelete = await rest('DELETE', '/customers?id=eq.c1');
  check('anon cannot delete customers', denied(anonDelete), JSON.stringify(anonDelete));
  check('customer c1 still there', psql(`SELECT count(*) FROM public.customers WHERE id = 'c1';`) === '1');

  admin = await signIn('admin', '1234');
  const staffRead = await rest('GET', '/customers?select=id,name', admin.token);
  check('signed-in staff (admin) can read customers', rows(staffRead).length === 1, JSON.stringify(staffRead));
  const staffWrite = await rest('POST', '/customers', admin.token, { id: 'c2', name: 'Bilal', company: 'Bilal & Co', phone: '0301' });
  check('signed-in staff can insert a customer', staffWrite.status === 201, JSON.stringify(staffWrite));
  const staffUpsert = await rest('POST', '/customers?on_conflict=id', waji2.token, [{ id: 'c2', name: 'Bilal Updated', company: 'Bilal & Co', phone: '0301' }], { Prefer: 'resolution=merge-duplicates,return=representation' });
  check('signed-in staff (operator) can upsert (the app\'s sync call)', staffUpsert.status === 200 || staffUpsert.status === 201, JSON.stringify(staffUpsert));
  const staffDelete = await rest('DELETE', '/customers?id=eq.c2', waji2.token);
  check('signed-in staff can delete a customer', staffDelete.status === 200 && rows(staffDelete).length === 1, JSON.stringify(staffDelete));
  const staffUsers = await rest('GET', '/users?select=id,username,passwordHash,passwordSalt,passwordIter,pin,pinHash', admin.token);
  check('staff read users: rows come back', rows(staffUsers).length >= 4, JSON.stringify(staffUsers));
  check('password hashes are gone from the users table (all NULL)', rows(staffUsers).every((u) => u.passwordHash === null && u.passwordSalt === null && u.passwordIter === null && u.pinHash === null && u.pin === ''), JSON.stringify(staffUsers.body));
  check('the old hashes are kept privately for the grace period', psql(`SELECT count(*) FROM sarmaya_private.legacy_credentials WHERE password_hash IS NOT NULL;`) === '2');
  const reupload = await rest('POST', '/users?on_conflict=id', admin.token, [{ id: 'user-waji2', name: 'Waji2', role: 'operator', pin: '9999', passwordHash: 'NEW-HASH', passwordSalt: 's', passwordIter: 1 }], { Prefer: 'resolution=merge-duplicates,return=representation' });
  check('an (old) app uploading a hash: stored as NULL by the guard', reupload.status < 300 && psql(`SELECT coalesce("passwordHash", 'null') || '|' || pin FROM public.users WHERE id = 'user-waji2';`) === 'null|', JSON.stringify(reupload));

  // Existing owner waji never signed in during Phase 1: links now (grace period), with the old hash.
  check('after the lock, waji (not linked yet) cannot sign in to Supabase', (await signIn('waji', 'waji-pass-1')).status === 400);
  check('after the lock, anon may still call only the claim RPC: waji links with the old hash', (await rpc('sarmaya_claim_account', { p_username: 'waji', p_password: 'waji-pass-1', p_password_hash: 'HASH-WAJI' })).body === 'linked');
  const waji = await signIn('waji', 'waji-pass-1');
  check('waji signs in and reads the data', waji.status === 200 && rows(await rest('GET', '/customers?select=id', waji.token)).length === 1);
  const anonOther = await rpc('sarmaya_is_admin', {});
  check('anon cannot call other functions (sarmaya_is_admin)', anonOther.status >= 400, JSON.stringify(anonOther));
  const anonAdmin2 = await rpc('sarmaya_admin_set_login', { p_user_id: 'user-y', p_username: 'y1', p_password: 'temp-pass-1' });
  check('anon cannot call the admin RPC after the lock', anonAdmin2.status >= 400);
  const opAdmin2 = await rpc('sarmaya_admin_set_login', { p_user_id: 'user-y', p_username: 'y1', p_password: 'temp-pass-1' }, waji2.token);
  check('the admin RPC refuses a non-admin after the lock', opAdmin2.status >= 400 && /owner or an admin/.test(JSON.stringify(opAdmin2.body)), JSON.stringify(opAdmin2));

  // Non-admin staff cannot promote themselves or switch accounts on/off.
  await rest('PATCH', '/users?id=eq.user-waji2', waji2.token, { role: 'super_admin', roles: ['super_admin'], name: 'Waji Two' });
  check('an operator cannot make themselves super_admin (role kept, name change allowed)', psql(`SELECT role || '|' || name FROM public.users WHERE id = 'user-waji2';`) === 'operator|Waji Two');
  await rest('POST', '/users', waji2.token, { id: 'user-evil', name: 'Evil', username: 'evil', role: 'admin', roles: ['admin'], pin: '', active: true });
  check('an operator cannot add an admin user', psql(`SELECT count(*) FROM public.users WHERE id = 'user-evil';`) === '0');
  const opDelUsers = await rest('DELETE', '/users?id=eq.user-waji', waji2.token);
  check('an operator cannot delete users', rows(opDelUsers).length === 0 && psql(`SELECT count(*) FROM public.users WHERE id = 'user-waji';`) === '1');

  // "Empty the users table" from the app cannot lock the person doing it out.
  psql(`CREATE TABLE IF NOT EXISTS public._users_backup AS SELECT * FROM public.users;`);
  await rest('DELETE', '/users?id=neq.__none__', admin.token);
  check('admin emptying the users table keeps their own row (no self-lock-out)', psql(`SELECT string_agg(id, ',') FROM public.users;`) === 'user-default-admin');
  check('...and the admin can still read the data', rows(await rest('GET', '/customers?select=id', admin.token)).length === 1);
  psql(`INSERT INTO public.users SELECT * FROM public._users_backup ON CONFLICT (id) DO NOTHING; DROP TABLE public._users_backup;`);

  // A Supabase login that is not linked to an app user (e.g. made in the dashboard) sees nothing.
  psql(`SELECT sarmaya_private.upsert_auth_user('stranger@shop.sarmaya.local', 'stranger-pass-1');`);
  const stranger = await signIn('stranger', 'stranger-pass-1');
  check('a signed-in but unlinked Supabase user reads no rows', stranger.status === 200 && rows(await rest('GET', '/customers?select=id', stranger.token)).length === 0);
  const strangerWrite = await rest('POST', '/customers', stranger.token, { id: 'c-str', name: 'x', company: 'x', phone: 'x' });
  check('...and cannot write', strangerWrite.status >= 400, JSON.stringify(strangerWrite));

  // Switching a user off in the app cuts their database access at once.
  await rest('PATCH', '/users?id=eq.user-waji2', admin.token, { active: false });
  check('a switched-off user (waji2) reads no rows any more', rows(await rest('GET', '/customers?select=id', waji2.token)).length === 0);
  await rest('PATCH', '/users?id=eq.user-waji2', admin.token, { active: true });
  check('switched back on: reads again', rows(await rest('GET', '/customers?select=id', waji2.token)).length === 1);

  // psql-level checks with SET ROLE + request.jwt.claims (how PostgREST runs requests).
  const adminUid = psql(`SELECT id FROM auth.users WHERE email = 'admin@shop.sarmaya.local';`);
  const waji2Uid = psql(`SELECT id FROM auth.users WHERE email = 'waji2@shop.sarmaya.local';`);
  const asRole = (role, uid, sql) =>
    psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claims', '${JSON.stringify(uid ? { sub: uid, role } : { role })}', true); ${sql}; ROLLBACK;`, { allowError: true });
  check('SET ROLE anon: SELECT customers -> permission denied', /permission denied/.test(asRole('anon', null, 'SELECT count(*) FROM public.customers')));
  check('SET ROLE anon: SELECT "passwordHash" FROM users -> permission denied', /permission denied/.test(asRole('anon', null, 'SELECT "passwordHash" FROM public.users')));
  check('SET ROLE authenticated (admin claims): SELECT customers -> 1 row', asRole('authenticated', adminUid, 'SELECT count(*) FROM public.customers').split('\n').pop() === '1');
  check('SET ROLE authenticated (no/unknown sub): SELECT customers -> 0 rows', asRole('authenticated', '00000000-0000-0000-0000-000000000001', 'SELECT count(*) FROM public.customers').split('\n').pop() === '0');
  check('SET ROLE authenticated (operator claims): admin RPC -> refused', /owner or an admin/.test(asRole('authenticated', waji2Uid, "SELECT public.sarmaya_admin_set_login('u', 'abc', 'longenough1')")));
  check('SET ROLE authenticated (admin claims): admin RPC -> ok', /created|linked/.test(asRole('authenticated', adminUid, "SELECT public.sarmaya_admin_set_login('user-psql', 'psqluser', 'longenough1')")));

  // Grace period over -> no more claims.
  psql(`SELECT sarmaya_private.set_claim_grace(0);`);
  check('grace period closed: claims are refused', (await rpc('sarmaya_claim_account', { p_username: 'sana.k', p_password: 'whatever-1', p_password_hash: 'x' })).body === 'grace_over');
  psql(`SELECT sarmaya_private.set_claim_grace(30);`);

  // The report the owner runs.
  const report = psql(`SELECT username || ':' || supabase_login FROM sarmaya_private.login_report() ORDER BY username;`);
  check('login report lists every user with linked / MISSING', /admin:linked/.test(report) && /waji:linked/.test(report) && /waji2:linked/.test(report), report);

  console.log('\n== D. unlock.sql, lock.sql again, unlock.sql again');
  runFile('unlock.sql');
  await pause(300);
  check('after unlock: anon can read customers again', rows(await rest('GET', '/customers?select=id')).length === 1);
  check('after unlock: anon can write again (old open behaviour)', (await rest('POST', '/customers', null, { id: 'c3', name: 'Open', company: 'Open', phone: '1' })).status === 201);
  check('after unlock: Supabase logins still work', (await signIn('waji', 'waji-pass-1')).status === 200);
  check('after unlock: RLS off on every table', psql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity;`) === '0');
  runFile('unlock.sql');
  check('unlock.sql runs twice without error', true);
  runFile('lock.sql');
  await pause(300);
  check('lock again: anon denied again', denied(await rest('GET', '/customers?select=id')));
  admin = await signIn('admin', '1234');
  const again = await rest('GET', '/customers?select=id', admin.token);
  check('lock again: staff still read', rows(again).length === 2, JSON.stringify(again) + ' admin=' + admin.status);
  runFile('unlock.sql');
  await pause(300);
  check('final unlock: open again', rows(await rest('GET', '/customers?select=id')).length === 2);

  console.log('\n== E. lock.sql refuses when no owner/admin can sign in');
  psql(`DELETE FROM sarmaya_private.auth_links; UPDATE public.users SET active = false WHERE id = 'user-default-admin';`);
  let refused = '';
  try {
    runFile('lock.sql');
  } catch (e) {
    refused = String(e.stderr || e.message);
  }
  check('lock.sql stops with a clear message and locks nothing', /Nothing was locked/.test(refused) && psql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity;`) === '0', refused.slice(0, 300));

  console.log('\n== F. Live shop whose admin already has a password on record (the real Sarmaya case)');
  psql(`
    DROP SCHEMA IF EXISTS sarmaya_private CASCADE;
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t.tablename);
      END LOOP;
    END $$;
    DELETE FROM auth.users WHERE email LIKE '%@shop.sarmaya.local';
  `);
  runFile('setup.sql');
  psql(`
    INSERT INTO public.users (id, name, username, role, roles, pin, active, status, "passwordHash", "passwordSalt", "passwordIter", "createdAt") VALUES
      ('user-default-admin', 'Admin', 'admin', 'super_admin', '["super_admin"]', '', true, 'active', 'HASH-ADMIN', 'S', 210000, '2026-09-01'),
      ('user-waji', 'Waji', 'waji', 'super_admin', '["super_admin"]', '', true, 'active', 'HASH-WAJI', 'S', 210000, '2026-09-01');
  `);
  runFile('auth_setup.sql');
  check('admin with its own password on record: no admin / 1234 login is created', psql(`SELECT count(*) FROM auth.users WHERE email = 'admin@shop.sarmaya.local';`) === '0');
  let refusedF = '';
  try {
    runFile('lock.sql');
  } catch (e) {
    refusedF = String(e.stderr || e.message);
  }
  check('lock.sql refuses while nobody who can manage the shop is linked', /Nothing was locked/.test(refusedF));
  check('admin links at first sign-in on the updated app (claim, old hash)', (await rpc('sarmaya_claim_account', { p_username: 'admin', p_password: '1234', p_password_hash: 'HASH-ADMIN' })).body === 'linked');
  check('admin / 1234 then works in Supabase', (await signIn('admin', '1234')).status === 200);
  runFile('lock.sql');
  check('now lock.sql locks', denied(await rest('GET', '/users?select=id')));
  const reportF = psql(`SELECT username || ':' || supabase_login FROM sarmaya_private.login_report() ORDER BY username;`);
  check('report: admin linked, waji MISSING (links in the grace period or by a reset)', reportF === 'waji:MISSING\nadmin:linked' || reportF === 'admin:linked\nwaji:MISSING', reportF);
  runFile('unlock.sql');

  psql(`
    DROP SCHEMA IF EXISTS sarmaya_private CASCADE;
    DELETE FROM public.users;
    DELETE FROM auth.users WHERE email LIKE '%@shop.sarmaya.local';
    INSERT INTO public.users (id, name, username, role, roles, pin, active, status, "createdAt") VALUES
      ('user-owner', 'Owner', 'owner', 'super_admin', '["super_admin"]', '', true, 'active', '2026-09-01');
  `);
  runFile('auth_setup.sql');
  check('shop that deleted "admin" and has its own owner: admin / 1234 is NOT brought back', psql(`SELECT count(*) FROM public.users WHERE username = 'admin';`) === '0' && psql(`SELECT count(*) FROM auth.users WHERE email = 'admin@shop.sarmaya.local';`) === '0');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
