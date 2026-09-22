/**
 * Supabase Auth for Sarmaya staff (see README → "Locking the database").
 *
 * Every app user (username + password) has a matching Supabase Auth user with a made-up email,
 * `<username>@shop.sarmaya.local`, and the same password. Signing in to Supabase gives the browser a
 * session (kept in localStorage by supabase-js), and once `supabase/lock.sql` has been run the
 * database only answers requests that carry such a session.
 *
 * The SQL side lives in `supabase/auth_setup.sql`:
 *   sarmaya_claim_account(username, password, legacy hash)  – links an existing app user the first time
 *       they sign in on an updated app (grace period only; the hash must match the one stored before).
 *   sarmaya_admin_set_login(user id, username, password)    – owner/admin only: creates the Supabase
 *       login for new staff, resets a password, or follows a username change.
 *
 * Every helper here is safe to call when Supabase is not configured (it reports 'unavailable'), and never
 * throws: sign-in on this device keeps working offline from the cached password hash.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { normalizeUsername } from './password';

/** Must match sarmaya_private.auth_email() in supabase/auth_setup.sql. */
export const AUTH_EMAIL_DOMAIN = 'shop.sarmaya.local';

export const authEmail = (username: string | null | undefined): string => `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;

/** How long to wait for Supabase before treating it as "no connection" and carrying on offline. */
export const CLOUD_TIMEOUT_MS = 8000;

export type CloudSignInResult =
  | { status: 'ok' }
  /** Supabase answered: wrong password, or no Supabase login exists for this username yet. */
  | { status: 'invalid' }
  /** No connection, Supabase not configured, or it did not answer in time. */
  | { status: 'unavailable'; reason?: string };

export type ClaimResult =
  | 'linked'
  | 'already_linked'
  | 'no_account'
  | 'inactive'
  | 'no_legacy_password'
  | 'hash_mismatch'
  | 'grace_over'
  | 'invalid_password'
  /** auth_setup.sql has not been run on this project. */
  | 'not_installed'
  | 'unavailable';

export interface AdminLoginResult {
  ok: boolean;
  /** Server status word when ok ('created' | 'linked' | 'updated' | 'renamed' | 'not_linked'), else why it failed. */
  status: string;
  message: string;
}

const auth = () => (isSupabaseConfigured ? (supabase as any).auth : undefined);

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const withTimeout = <T,>(p: Promise<T>, ms = CLOUD_TIMEOUT_MS): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });

/** True when Supabase Auth can be tried at all (configured, and the browser does not say it is offline). */
export const cloudAuthAvailable = (): boolean => Boolean(auth()) && !isOffline();

/** Supabase answered with "these credentials are wrong" (as opposed to a network or server problem). */
const isInvalidCredentials = (error: any): boolean => {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === 'invalid_credentials' || code === 'invalid_grant' || code === 'user_not_found') return true;
  const status = Number(error.status || 0);
  return status === 400 && /invalid (login )?credentials|invalid grant/i.test(String(error.message || ''));
};

/** Sign in to Supabase Auth as this app user. */
export const cloudSignIn = async (username: string, password: string): Promise<CloudSignInResult> => {
  const a = auth();
  if (!a) return { status: 'unavailable', reason: 'not configured' };
  if (isOffline()) return { status: 'unavailable', reason: 'offline' };
  try {
    const { error } = await withTimeout(a.signInWithPassword({ email: authEmail(username), password }) as Promise<{ error: any }>);
    if (!error) return { status: 'ok' };
    if (isInvalidCredentials(error)) return { status: 'invalid' };
    return { status: 'unavailable', reason: error.message };
  } catch (e: any) {
    return { status: 'unavailable', reason: e?.message || String(e) };
  }
};

/** Email of the Supabase session stored on this device, or null (no network needed). */
export const cloudSessionEmail = async (): Promise<string | null> => {
  const a = auth();
  if (!a) return null;
  try {
    const { data } = await a.getSession();
    return data?.session?.user?.email?.toLowerCase() || null;
  } catch {
    return null;
  }
};

/** True when this device holds a Supabase session for this username. */
export const hasCloudSessionFor = async (username: string | null | undefined): Promise<boolean> =>
  (await cloudSessionEmail()) === authEmail(username);

/** Forget the Supabase session on this device (logout). */
export const cloudSignOut = async (): Promise<void> => {
  const a = auth();
  if (!a) return;
  try {
    await withTimeout(a.signOut({ scope: 'local' }) as Promise<unknown>, 3000);
  } catch {
    /* the local session is removed by supabase-js even when the network call fails */
  }
};

/** Change the signed-in user's own Supabase password. */
export const cloudChangeOwnPassword = async (newPassword: string): Promise<{ ok: boolean; message?: string }> => {
  const a = auth();
  if (!a) return { ok: false, message: 'Supabase is not configured.' };
  if (isOffline()) return { ok: false, message: 'Connect to the internet to change your password.' };
  try {
    const { error } = await withTimeout(a.updateUser({ password: newPassword }) as Promise<{ error: any }>);
    if (!error) return { ok: true };
    return { ok: false, message: error.message || 'The server did not accept the new password.' };
  } catch (e: any) {
    return { ok: false, message: e?.message === 'timeout' ? 'No answer from the server. Check the internet and try again.' : e?.message || String(e) };
  }
};

const rpcMissing = (error: any): boolean => {
  const code = String(error?.code || '');
  return code === 'PGRST202' || code === '42883' || /could not find the function|function .* does not exist/i.test(String(error?.message || ''));
};

const rpc = async (fn: string, args: Record<string, unknown>): Promise<{ data: any; error: any }> => {
  const client = supabase as any;
  if (!isSupabaseConfigured || typeof client.rpc !== 'function') return { data: null, error: { message: 'Supabase not configured', code: 'unavailable' } };
  if (isOffline()) return { data: null, error: { message: 'offline', code: 'unavailable' } };
  try {
    return await withTimeout(client.rpc(fn, args) as Promise<{ data: any; error: any }>);
  } catch (e: any) {
    return { data: null, error: { message: e?.message || String(e), code: 'unavailable' } };
  }
};

/**
 * First sign-in of an existing user on the updated app: create their Supabase login with the password they
 * just typed. The server only allows it during the grace period, for a user with no Supabase login yet, and
 * when `legacyHash` (this device's stored PBKDF2 hash, which the typed password was just checked against)
 * matches the hash the shop's database held before the lock.
 */
export const cloudClaimAccount = async (username: string, password: string, legacyHash: string): Promise<ClaimResult> => {
  const { data, error } = await rpc('sarmaya_claim_account', { p_username: normalizeUsername(username), p_password: password, p_password_hash: legacyHash });
  if (error) return rpcMissing(error) ? 'not_installed' : 'unavailable';
  return (String(data || 'unavailable') as ClaimResult) || 'unavailable';
};

/**
 * Owner/admin only (checked by the server): create or update a staff member's Supabase login.
 * `password` null only follows a username change.
 */
export const cloudAdminSetLogin = async (appUserId: string, username: string, password: string | null): Promise<AdminLoginResult> => {
  const { data, error } = await rpc('sarmaya_admin_set_login', { p_user_id: appUserId, p_username: normalizeUsername(username), p_password: password });
  if (!error) return { ok: true, status: String(data || 'ok'), message: '' };
  if (rpcMissing(error)) return { ok: false, status: 'not_installed', message: 'The shop database is missing supabase/auth_setup.sql.' };
  if (error.code === 'unavailable') return { ok: false, status: 'unavailable', message: 'No internet connection. Connect and try again.' };
  if (error.code === '42501' || /not allowed|permission denied|only the owner/i.test(String(error.message || ''))) {
    return { ok: false, status: 'denied', message: 'The server did not accept this from your account. Sign out and sign in again, then retry.' };
  }
  return { ok: false, status: 'error', message: error.message || 'The server refused the change.' };
};
