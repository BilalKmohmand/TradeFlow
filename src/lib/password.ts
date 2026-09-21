/**
 * Username + password sign-in: hashing, verification, legacy-PIN migration and lockout rules.
 *
 * Passwords are never stored in plain text. Each user record carries
 *   passwordHash  – base64 of a 32-byte PBKDF2-SHA256 derived key
 *   passwordSalt  – base64 of a random 16-byte salt
 *   passwordIter  – PBKDF2 iteration count (new hashes use PASSWORD_ITERATIONS)
 * computed with WebCrypto (crypto.subtle), so the same record verifies on any device.
 *
 * SECURITY NOTE: this protects passwords at rest, but the app is local-first and syncs through
 * Supabase with the anon key and RLS disabled. Anyone holding that key can read or change the
 * users table (including these hashes), so true database security would additionally need
 * Supabase Auth + Row Level Security policies. That is deliberately not implemented here.
 */
import bcrypt from 'bcryptjs';
import { AppUser, SecurityPolicySettings } from '../types';

export const PASSWORD_ITERATIONS = 210_000;
export const MIN_PASSWORD_LENGTH = 8;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export interface PasswordRecord {
  passwordHash: string;
  passwordSalt: string;
  passwordIter: number;
}

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error('This browser cannot hash passwords securely. Open the app over https (or localhost) in an up-to-date browser.');
  }
  return c.subtle;
};

const derive = async (password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> => {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, KEY_BYTES * 8);
  return new Uint8Array(bits);
};

/** Compare without stopping at the first different byte (constant time for equal lengths). */
export const timingSafeEqual = (a: Uint8Array | string, b: Uint8Array | string): boolean => {
  const x = typeof a === 'string' ? new TextEncoder().encode(a) : a;
  const y = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  if (x.length !== y.length) return false; // hashes are fixed length, so only the content matters
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
};

/** Hash a new password with a fresh random salt. */
export const hashPassword = async (password: string, iterations = PASSWORD_ITERATIONS): Promise<PasswordRecord> => {
  const salt = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(salt);
  const key = await derive(password, salt, iterations);
  return { passwordHash: toB64(key), passwordSalt: toB64(salt), passwordIter: iterations };
};

/** True when `password` matches the stored PBKDF2 record. Never throws on a malformed record. */
export const verifyPassword = async (
  password: string,
  rec: { passwordHash?: string | null; passwordSalt?: string | null; passwordIter?: number | null }
): Promise<boolean> => {
  if (!password || !rec.passwordHash || !rec.passwordSalt || !rec.passwordIter) return false;
  try {
    const key = await derive(password, fromB64(rec.passwordSalt), Number(rec.passwordIter));
    return timingSafeEqual(key, fromB64(rec.passwordHash));
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Usernames
// ---------------------------------------------------------------------------

export const normalizeUsername = (s: string | null | undefined): string => (s || '').trim().toLowerCase();

/** 2–32 characters: lowercase letters, digits, dot, dash or underscore; starts with a letter or digit. */
export const validateUsername = (raw: string): string | null => {
  const u = normalizeUsername(raw);
  if (!u) return 'Choose a username.';
  if (u.length < 2 || u.length > 32) return 'Username must be 2 to 32 characters.';
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(u)) return 'Username can only use letters, numbers, dot, dash and underscore (no spaces).';
  return null;
};

export const validateNewPassword = (password: string, confirm?: string, policy?: Partial<SecurityPolicySettings> & { passwordMinLength?: number }): string | null => {
  const min = Math.max(MIN_PASSWORD_LENGTH, Number(policy?.passwordMinLength) || 0);
  if (!password || password.length < min) return `Password must be at least ${min} characters.`;
  if (password.length > 128) return 'Password is too long (128 characters at most).';
  if (confirm !== undefined && password !== confirm) return 'The two passwords do not match.';
  return null;
};

/** First name, lowercased, letters/digits only; made unique with 2, 3, … */
export const deriveUsername = (name: string, taken: Set<string>): string => {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  let base = first
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (base.length < 2) base = `user${base}`;
  base = base.slice(0, 28);
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}${n}`;
  return candidate;
};

// ---------------------------------------------------------------------------
// Credentials: new passwords vs legacy PINs
// ---------------------------------------------------------------------------

export const hasPassword = (u: Pick<AppUser, 'passwordHash' | 'passwordSalt' | 'passwordIter'>): boolean =>
  Boolean(u.passwordHash && u.passwordSalt && u.passwordIter);

const isBcrypt = (h?: string | null) => Boolean(h && /^\$2[aby]\$/.test(h));

/** A pre-password user who can still sign in once with their old PIN (or old bcrypt password). */
export const hasLegacyCredential = (u: AppUser): boolean =>
  !hasPassword(u) && Boolean((u.pin && u.pin.trim()) || isBcrypt(u.pinHash) || isBcrypt(u.passwordHash));

export const canSignIn = (u: AppUser): boolean => hasPassword(u) || hasLegacyCredential(u);

export const isOwnerAccount = (u: Pick<AppUser, 'role' | 'roles'>): boolean =>
  u.role === 'super_admin' || Boolean(u.roles?.includes('super_admin'));

/**
 * One-time sign-in for a user who has not set a password yet: the old PIN (plain or bcrypt), an old
 * bcrypt password, or — for the owner (super admin) only — the old shared master PIN.
 */
export const matchesLegacyCredential = (user: AppUser, password: string, legacyMasterPin?: string | null): boolean => {
  if (hasPassword(user)) return false;
  const typed = (password || '').trim();
  if (!typed) return false;
  let ok = false;
  if (user.pin && user.pin.trim() && timingSafeEqual(typed, user.pin.trim())) ok = true;
  const tryBcrypt = (hash?: string | null, value = typed) => {
    if (!isBcrypt(hash)) return false;
    try {
      return bcrypt.compareSync(value, hash as string);
    } catch {
      return false;
    }
  };
  if (!ok && tryBcrypt(user.pinHash)) ok = true;
  if (!ok && tryBcrypt(user.passwordHash, password)) ok = true;
  if (!ok && legacyMasterPin && legacyMasterPin.trim() && isOwnerAccount(user) && timingSafeEqual(typed, legacyMasterPin.trim())) ok = true;
  return ok;
};

// ---------------------------------------------------------------------------
// Migration of existing (PIN) users
// ---------------------------------------------------------------------------

/** A PIN-era user that has not been given a username / forced-change flag yet. */
export const needsMigration = (u: AppUser): boolean => !hasPassword(u) && hasLegacyCredential(u) && !u.mustChangePassword;

/**
 * Give every PIN-era user a username derived from their first name ("Bilal Khan Mohmand" → "bilal")
 * and mark them to choose a password at their next sign-in (they sign in once with the old PIN).
 * Deterministic, so every device derives the same usernames. Users that already have a password,
 * or were already migrated, are left untouched.
 */
export const migrateLegacyUsers = (users: AppUser[]): AppUser[] => {
  if (!users.some(needsMigration)) return users;
  const taken = new Set(users.filter((u) => !needsMigration(u)).map((u) => normalizeUsername(u.username)).filter(Boolean));
  return users.map((u) => {
    if (!needsMigration(u)) return u;
    const username = deriveUsername(u.name, taken);
    taken.add(username);
    return { ...u, username, mustChangePassword: true };
  });
};

/**
 * Combine this device's users with the cloud copy: same id → the newer `updatedAt` wins (cloud on a tie),
 * users only on one side are kept (a local-only user is uploaded by the sync that follows).
 */
export const mergeUsers = (local: AppUser[], cloud: AppUser[]): AppUser[] => {
  const byId = new Map<string, AppUser>();
  local.forEach((u) => byId.set(u.id, u));
  cloud.forEach((c) => {
    const l = byId.get(c.id);
    if (!l || (c.updatedAt || '') >= (l.updatedAt || '')) byId.set(c.id, c);
  });
  const cloudIds = new Set(cloud.map((c) => c.id));
  // Keep cloud order first, then local-only users.
  return [...cloud.map((c) => byId.get(c.id)!), ...local.filter((l) => !cloudIds.has(l.id))];
};

/** Columns of the Supabase users table (setup.sql + migrate_v16_passwords.sql). Anything else stays local. */
export const USER_COLUMNS = [
  'id', 'name', 'role', 'pin', 'active', 'createdAt',
  'username', 'email', 'roles', 'status', 'pinHash', 'passwordHash', 'passwordSalt', 'passwordIter', 'mustChangePassword',
  'failedAttempts', 'lockedUntil', 'lastLoginAt', 'twoFactorEnabled', 'updatedAt',
  'branchId',
] as const;

export const toUserRow = (u: AppUser): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  USER_COLUMNS.forEach((k) => {
    const v = (u as any)[k];
    row[k] = v === undefined ? null : v;
  });
  if (row.pin == null) row.pin = ''; // older tables declare pin NOT NULL
  return row;
};

// ---------------------------------------------------------------------------
// Failed attempts & lockout (same rules as the old PIN gate)
// ---------------------------------------------------------------------------

export const lockoutMinutesLeft = (u: Pick<AppUser, 'lockedUntil' | 'status'>, now = Date.now()): number => {
  if (!u.lockedUntil) return 0;
  const diff = new Date(u.lockedUntil).getTime() - now;
  return diff > 0 ? Math.ceil(diff / 60000) : 0;
};

export interface FailedAttemptResult {
  user: AppUser;
  locked: boolean;
  attemptsLeft: number;
  lockMinutes: number;
}

export const registerFailedAttempt = (
  user: AppUser,
  policy: Pick<SecurityPolicySettings, 'maxFailedAttempts' | 'lockoutDurationMinutes'>,
  now = Date.now()
): FailedAttemptResult => {
  const max = policy.maxFailedAttempts || 5;
  const lockMinutes = policy.lockoutDurationMinutes || 15;
  // An expired lockout starts a fresh count.
  const prior = user.lockedUntil && new Date(user.lockedUntil).getTime() <= now ? 0 : user.failedAttempts || 0;
  const attempts = prior + 1;
  const locked = attempts >= max;
  return {
    user: locked
      ? { ...user, failedAttempts: attempts, status: 'locked', lockedUntil: new Date(now + lockMinutes * 60000).toISOString() }
      : { ...user, failedAttempts: attempts, lockedUntil: user.lockedUntil && new Date(user.lockedUntil).getTime() <= now ? null : user.lockedUntil },
    locked,
    attemptsLeft: Math.max(0, max - attempts),
    lockMinutes,
  };
};

export const clearLockout = (user: AppUser): AppUser => ({
  ...user,
  failedAttempts: 0,
  lockedUntil: null,
  status: user.status === 'locked' ? 'active' : user.status,
});

export const isAccountActive = (u: AppUser): boolean => u.active !== false && u.status !== 'inactive' && u.status !== 'suspended';
