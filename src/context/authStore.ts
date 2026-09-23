/**
 * Username + password sign-in, sign-up of the shop owner, lock screen, logout and password changes.
 * Part of useTrading() (see TradingContext.tsx), kept in its own file like inventoryStore.ts.
 *
 * Session: { userId, expiresAt, locked } in localStorage ("Keep me signed in", 30 days) or
 * sessionStorage (until the browser/tab closes). The signed-in user is always looked up in the
 * users list, so a deleted or switched-off account is signed out straight away.
 *
 * Two layers (see README → "Locking the database"):
 *   - This device: the password is checked against the PBKDF2 hash cached on the device, so sign-in
 *     works offline on a device the person has used before. The hash is never uploaded.
 *   - Supabase Auth (when configured and online): the same username + password also signs in to
 *     Supabase (src/lib/cloudAuth.ts). That session is what the locked database (supabase/lock.sql)
 *     requires, and Supabase is the source of truth for the password when it can be reached.
 *     An existing user without a Supabase login yet gets one at their first sign-in on the updated
 *     app (grace period, sarmaya_claim_account); new staff and password resets create/update it
 *     through the owner/admin-only sarmaya_admin_set_login.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, AppUser, AuditCategory, Permission, RoleDefinition, SecurityPolicySettings, SessionUser, UserRole } from '../types';
import { hasPermission } from '../lib/auth';
import {
  ClaimResult,
  cloudAdminSetLogin,
  cloudAuthAvailable,
  cloudChangeOwnPassword,
  cloudClaimAccount,
  cloudSignIn,
  cloudSignOut,
  hasCloudSessionFor,
} from '../lib/cloudAuth';
import {
  canSignIn,
  clearLockout,
  hashPassword,
  hasPassword,
  isAccountActive,
  isOwnerAccount,
  lockoutMinutesLeft,
  matchesLegacyCredential,
  migrateLegacyUsers,
  normalizeUsername,
  registerFailedAttempt,
  validateNewPassword,
  validateUsername,
  verifyPassword,
} from '../lib/password';

export const SESSION_KEY = 'sarmaya_session_v2';
/** Old keys from the PIN era, removed on start (the master PIN is read once for the owner's first sign-in). */
/** Built-in super admin sign-in (username is matched case-insensitively, so "Admin" works). */
export const DEFAULT_ADMIN = { id: 'user-default-admin', username: 'admin', password: '1234' } as const;

export const LEGACY_KEYS = { ADMIN_PIN: 'sarmaya_admin_pin_v1', SESSION_USER: 'sarmaya_current_user_v1', AUTH_TOKEN: 'sarmaya_jwt_token_v1' };
const KEEP_SIGNED_IN_DAYS = 30;

export type AuthStatus = 'loading' | 'signup' | 'login' | 'locked' | 'change_password' | 'signed_in';

export interface AuthResult {
  success: boolean;
  error?: string;
  message?: string;
  mustChangePassword?: boolean;
  attemptsLeft?: number;
  isLocked?: boolean;
  remainingMinutes?: number;
}

interface StoredSession {
  userId: string;
  expiresAt: number;
  persistent: boolean;
  locked?: boolean;
}

const safeStorage = (kind: 'local' | 'session'): Storage | null => {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

export const readSession = (): StoredSession | null => {
  for (const kind of ['local', 'session'] as const) {
    const store = safeStorage(kind);
    const raw = store?.getItem(SESSION_KEY);
    if (!raw) continue;
    try {
      const s = JSON.parse(raw) as StoredSession;
      if (s && s.userId && s.expiresAt > Date.now()) return s;
    } catch {
      /* ignore */
    }
    store?.removeItem(SESSION_KEY);
  }
  return null;
};

const writeSession = (s: StoredSession | null) => {
  const local = safeStorage('local');
  const session = safeStorage('session');
  local?.removeItem(SESSION_KEY);
  session?.removeItem(SESSION_KEY);
  if (!s) return;
  (s.persistent ? local : session)?.setItem(SESSION_KEY, JSON.stringify(s));
};

const nowISO = () => new Date().toISOString();
const newId = () => `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface NewStaffInput {
  name: string;
  username: string;
  role: UserRole;
  roles?: UserRole[];
  /** Temporary password; the person must choose their own at first sign-in. */
  password: string;
  email?: string;
}

/** Everything the rest of the app sees about signing in (part of useTrading()). */
export interface AuthApi {
  authStatus: AuthStatus;
  /** The signed-in user; null while signed out, locked or before a forced password change. */
  currentUser: SessionUser | null;
  /** The user whose session is locked or must change password (for the gate screens). */
  pendingUser: SessionUser | null;
  /** True when the app is open for a signed-in user (kept under its old name for existing screens). */
  isAdminUnlocked: boolean;
  signUpOwner: (input: { shopName: string; name: string; username: string; password: string; confirmPassword?: string }) => Promise<AuthResult>;
  login: (username: string, password: string, keepSignedIn?: boolean) => Promise<AuthResult>;
  unlockScreen: (password: string) => Promise<AuthResult>;
  lockScreen: () => void;
  /** @deprecated use lockScreen (kept for older screens). */
  lockAdmin: () => void;
  logout: () => void;
  /** Change the signed-in (or forced-change) user's password. `currentPassword` is not needed on the forced-change screen. */
  changePassword: (currentPassword: string | null, newPassword: string, confirmPassword?: string) => Promise<AuthResult>;
  addUser: (data: NewStaffInput) => Promise<{ success: boolean; message: string; user?: AppUser }>;
  resetUserPassword: (userId: string, tempPassword: string) => Promise<{ success: boolean; message: string }>;
  /** The shop's database is locked and this device has no Supabase session: the password is needed to keep syncing. */
  cloudSignInRequired: boolean;
}

/** The Supabase side, provided by TradingContext. */
export interface CloudDeps {
  /** Supabase is configured for this build. */
  enabled: boolean;
  /** The cloud copy has been read in this session. */
  loaded: boolean;
  /** The cloud refused this device (database locked and no valid Supabase session). */
  needsSignIn: boolean;
  /**
   * Called after a successful Supabase sign-in: turns cloud sync on, reading the cloud first when it has not
   * been read yet (or when `reload`). Resolves with the cloud users when it read them, otherwise null.
   */
  connect: (opts?: { reload?: boolean }) => Promise<AppUser[] | null>;
}

const NO_CLOUD: CloudDeps = { enabled: false, loaded: false, needsSignIn: false, connect: async () => null };

/** Plain-English note for a first sign-in that could not create the Supabase login. */
const claimNotice = (claim: ClaimResult): string | undefined => {
  switch (claim) {
    case 'hash_mismatch':
    case 'no_legacy_password':
    case 'grace_over':
    case 'no_account':
      return 'Signed in on this device only. To sync with the shop, ask the owner to set you a temporary password (Admin → Users → key icon).';
    default:
      return undefined;
  }
};

interface Deps {
  users: AppUser[];
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  roles: RoleDefinition[];
  securityPolicy: SecurityPolicySettings;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  /** True once the cloud users table has been read (or there is no cloud / it failed). */
  cloudSettled: boolean;
  /** Supabase Auth + cloud state (leave out when there is no cloud). */
  cloud?: CloudDeps;
  log: (action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: AuditCategory) => void;
}

const toSessionUser = (u: AppUser): SessionUser => ({
  id: u.id,
  name: u.name,
  username: u.username,
  email: u.email,
  role: u.role,
  roles: u.roles && u.roles.length > 0 ? u.roles : [u.role],
});

export const useAuthStore = ({ users, setUsers, roles, securityPolicy, settings, setSettings, cloudSettled, cloud = NO_CLOUD, log }: Deps): AuthApi => {
  const [session, setSessionState] = useState<StoredSession | null>(() => readSession());
  const usersRef = useRef(users);
  usersRef.current = users;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const setSession = useCallback((s: StoredSession | null) => {
    sessionRef.current = s;
    writeSession(s);
    setSessionState(s);
  }, []);

  // Old PIN-era session keys are meaningless now.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_KEYS.SESSION_USER);
      localStorage.removeItem(LEGACY_KEYS.AUTH_TOKEN);
    } catch {
      /* ignore */
    }
  }, []);

  // Give PIN-era users a username and the "choose a password" flag (runs for local, cloud and restored users).
  useEffect(() => {
    const migrated = migrateLegacyUsers(users);
    if (migrated !== users) setUsers(migrated);
  }, [users, setUsers]);

  // The old master PIN is only a one-time way in for the owner. Once an owner has a real password, forget it.
  const legacyMasterPin = useMemo(() => {
    let local = '';
    try {
      local = localStorage.getItem(LEGACY_KEYS.ADMIN_PIN)?.trim() || '';
    } catch {
      /* ignore */
    }
    return settings.masterPin?.trim() || local;
  }, [settings.masterPin]);
  const ownerHasPassword = users.some((u) => isOwnerAccount(u) && hasPassword(u));
  useEffect(() => {
    if (!ownerHasPassword) return;
    try {
      localStorage.removeItem(LEGACY_KEYS.ADMIN_PIN);
    } catch {
      /* ignore */
    }
    if (settings.masterPin) setSettings((prev) => ({ ...prev, masterPin: null }));
  }, [ownerHasPassword, settings.masterPin, setSettings]);

  // Built-in super admin (owner's request): username "Admin", password "1234". Added once, after the
  // cloud copy has loaded, when no account uses that username. It has a fixed id so devices that each
  // add it merge into one record. Change the password in My account whenever the shop is ready.
  // With a cloud, only after the cloud copy was actually read: a device that could not read it (offline, or the
  // database is locked) must not invent an admin that would then overwrite the shop's real one.
  useEffect(() => {
    if (!cloudSettled) return;
    if (cloud.enabled && !cloud.loaded) return;
    const FLAG = 'sarmaya_default_admin_added_v1';
    try {
      if (localStorage.getItem(FLAG)) return; // once per device: deleting it later keeps it deleted
    } catch {
      /* ignore */
    }
    const markDone = () => {
      try {
        localStorage.setItem(FLAG, '1');
      } catch {
        /* ignore */
      }
    };
    if (users.some((u) => u.id === DEFAULT_ADMIN.id || normalizeUsername(u.username) === DEFAULT_ADMIN.username)) return markDone();
    let cancelled = false;
    void hashPassword(DEFAULT_ADMIN.password).then((hash) => {
      if (cancelled) return;
      const now = nowISO();
      setUsers((prev) =>
        prev.some((u) => u.id === DEFAULT_ADMIN.id || normalizeUsername(u.username) === DEFAULT_ADMIN.username)
          ? prev
          : [
              {
                id: DEFAULT_ADMIN.id,
                name: 'Admin',
                username: DEFAULT_ADMIN.username,
                role: 'super_admin',
                roles: ['super_admin'],
                pin: '',
                ...hash,
                mustChangePassword: false,
                active: true,
                status: 'active',
                failedAttempts: 0,
                createdAt: now.split('T')[0],
                updatedAt: now,
              } as AppUser,
              ...prev,
            ]
      );
      markDone();
    });
    return () => {
      cancelled = true;
    };
  }, [cloudSettled, cloud.enabled, cloud.loaded, users, setUsers]);

  // The database was locked (lock.sql) while this device had no Supabase session: ask for the password once,
  // on the lock screen, so the person signs in to Supabase and sync carries on.
  const cloudPromptedRef = useRef(false);
  useEffect(() => {
    if (!cloud.needsSignIn) {
      cloudPromptedRef.current = false;
      return;
    }
    if (cloudPromptedRef.current) return;
    const s = sessionRef.current;
    if (!s || s.locked) return;
    cloudPromptedRef.current = true;
    setSession({ ...s, locked: true });
  }, [cloud.needsSignIn, setSession]);

  const sessionUser = session ? users.find((u) => u.id === session.userId && isAccountActive(u)) : undefined;
  // With a cloud, a user synced from it can sign in (online) even without a password cached on this device.
  const canSignInHere = (u: AppUser) => canSignIn(u) || (cloud.enabled && isAccountActive(u) && Boolean(normalizeUsername(u.username)));
  const anyAccount = users.some(canSignInHere);

  let authStatus: AuthStatus;
  if (sessionUser && session) {
    authStatus = session.locked ? 'locked' : sessionUser.mustChangePassword || !hasPassword(sessionUser) ? 'change_password' : 'signed_in';
  } else if (anyAccount) authStatus = 'login';
  else if (!cloudSettled) authStatus = 'loading';
  // The shop's cloud could not be read (no internet, or locked until sign-in): never offer "create an account"
  // here; the first sign-in on this device goes to Supabase.
  else authStatus = cloud.enabled && !cloud.loaded ? 'login' : 'signup';

  const currentUser = useMemo(
    () => (authStatus === 'signed_in' && sessionUser ? toSessionUser(sessionUser) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authStatus, sessionUser?.id, sessionUser?.name, sessionUser?.role, sessionUser?.username, (sessionUser?.roles || []).join(',')]
  );
  const pendingUser = useMemo(
    () => (sessionUser && (authStatus === 'locked' || authStatus === 'change_password') ? toSessionUser(sessionUser) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authStatus, sessionUser?.id, sessionUser?.name]
  );

  const patchUser = (id: string, patch: Partial<AppUser> | ((u: AppUser) => AppUser)) =>
    setUsers((prev) => prev.map((u) => (u.id === id ? (typeof patch === 'function' ? patch(u) : { ...u, ...patch }) : u)));

  const startSession = (user: AppUser, persistent: boolean) => {
    const hours = persistent ? KEEP_SIGNED_IN_DAYS * 24 : Math.max(1, securityPolicy.sessionTimeoutHours || 8);
    setSession({ userId: user.id, expiresAt: Date.now() + hours * 3600_000, persistent });
  };

  /** Refuse a switched-off or locked-out account before looking at the password. */
  const preCheck = (user: AppUser): AuthResult | null => {
    const label = `${user.name} (@${user.username || user.id})`;
    if (!isAccountActive(user)) {
      log('Login Blocked', `${label} tried to sign in but the account is switched off.`, 'warning', 'auth');
      return { success: false, error: 'This account is switched off. Ask the shop owner to turn it back on.' };
    }
    const minutesLeft = lockoutMinutesLeft(user);
    if (minutesLeft > 0) {
      log('Locked Account Attempt', `${label} tried to sign in while locked out (${minutesLeft} min left).`, 'warning', 'auth');
      return {
        success: false,
        isLocked: true,
        remainingMinutes: minutesLeft,
        error: `Too many wrong attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}, or ask the owner to unlock your account.`,
      };
    }
    return null;
  };

  /** Count a wrong password (the account locks after the policy limit). */
  const failAttempt = (user: AppUser, error?: string): AuthResult => {
    const label = `${user.name} (@${user.username || user.id})`;
    // Re-read: the record may have changed while hashing.
    const latest = usersRef.current.find((u) => u.id === user.id) || user;
    const res = registerFailedAttempt(latest, securityPolicy);
    patchUser(user.id, () => res.user);
    if (res.locked) {
      log('Account Locked Out', `${label} was locked for ${res.lockMinutes} minutes after too many wrong passwords.`, 'danger', 'auth');
      return {
        success: false,
        isLocked: true,
        remainingMinutes: res.lockMinutes,
        error: `Too many wrong attempts. The account is locked for ${res.lockMinutes} minutes.`,
      };
    }
    log('Login Failed', `Wrong password for ${label}. ${res.attemptsLeft} attempt(s) left.`, 'warning', 'auth');
    return {
      success: false,
      attemptsLeft: res.attemptsLeft,
      error: `${error || 'Username or password is incorrect.'} ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? '' : 's'} left before the account is locked.`,
    };
  };

  /** The password against this device's cached hash (or a one-time old PIN). */
  const verifyLocal = async (user: AppUser, password: string): Promise<{ ok: boolean; usedLegacy: boolean }> => {
    if (hasPassword(user)) return { ok: await verifyPassword(password, user), usedLegacy: false };
    if (matchesLegacyCredential(user, password, legacyMasterPin)) return { ok: true, usedLegacy: true };
    return { ok: false, usedLegacy: false };
  };

  type CloudOutcome =
    /** Signed in to Supabase. */
    | { kind: 'ok' }
    /** Supabase says the password is wrong and this device could not vouch for it either. */
    | { kind: 'wrong' }
    /** Supabase has a different (newer) password for this user, or the account is switched off there. */
    | { kind: 'stale'; error: string }
    /** Supabase could not be used (offline, not set up, no login yet): this device decides. */
    | { kind: 'local'; notice?: string };

  /**
   * Sign in to Supabase as this user. If Supabase has no login for them yet and the password matched this
   * device's hash, create it (first sign-in on the updated app, grace period only).
   */
  const signInToCloud = async (username: string, password: string, user: AppUser, localOk: boolean): Promise<CloudOutcome> => {
    if (!cloud.enabled || !cloudAuthAvailable()) return { kind: 'local' };
    const first = await cloudSignIn(username, password);
    if (first.status === 'ok') return { kind: 'ok' };
    if (first.status === 'unavailable') return { kind: 'local' };
    if (!localOk || !hasPassword(user)) return { kind: 'wrong' };
    const claim = await cloudClaimAccount(username, password, user.passwordHash as string);
    if (claim === 'linked') {
      const again = await cloudSignIn(username, password);
      if (again.status !== 'ok') return { kind: 'local' };
      log('Secure Sign-in Linked', `${user.name} (@${user.username}) now signs in to the shop's cloud too.`, 'info', 'auth');
      return { kind: 'ok' };
    }
    if (claim === 'already_linked') {
      return { kind: 'stale', error: 'This password was changed (by the owner or on another device). Sign in with your newest password.' };
    }
    if (claim === 'inactive') return { kind: 'stale', error: 'This account is switched off in the shop.' };
    const notice = claimNotice(claim);
    if (notice) log('Cloud Sign-in Missing', `${user.name} (@${user.username}) signed in on this device only (${claim}).`, 'warning', 'auth');
    return { kind: 'local', notice };
  };

  /** After Supabase accepted the password: cache it on this device, remember the link, start syncing. */
  const afterCloudSignIn = async (user: AppUser, password: string, localOk: boolean) => {
    const hash = localOk ? null : await hashPassword(password);
    patchUser(user.id, (u) => ({ ...u, ...(hash || {}), cloudLinked: true }));
    if (!cloud.loaded || cloud.needsSignIn) void cloud.connect();
  };

  const login: AuthApi['login'] = async (username, password, keepSignedIn = true) => {
    const name = normalizeUsername(username);
    if (!name || !password) return { success: false, error: 'Enter your username and password.' };
    let user = usersRef.current.find((u) => normalizeUsername(u.username) === name);

    // Not on this device: only Supabase can check it (the first sign-in on a device needs the internet).
    if (!user || !canSignInHere(user)) {
      if (!cloud.enabled) {
        log('Login Failed', `Sign-in attempt with unknown username "${name}".`, 'warning', 'auth');
        return { success: false, error: 'Username or password is incorrect.' };
      }
      const res = await cloudSignIn(name, password);
      if (res.status === 'unavailable') {
        return { success: false, error: 'The first sign-in on this device needs the internet. Connect and try again.' };
      }
      if (res.status === 'invalid') {
        log('Login Failed', `Sign-in attempt with unknown username "${name}".`, 'warning', 'auth');
        return { success: false, error: 'Username or password is incorrect.' };
      }
      const cloudUsers = (await cloud.connect({ reload: true })) || [];
      user = cloudUsers.find((u) => normalizeUsername(u.username) === name) || usersRef.current.find((u) => normalizeUsername(u.username) === name);
      if (!user || !isAccountActive(user)) {
        void cloudSignOut();
        return { success: false, error: user ? 'This account is switched off. Ask the shop owner to turn it back on.' : 'Could not load your account from the shop. Try again.' };
      }
      const hash = await hashPassword(password);
      const mustChange = Boolean(user.mustChangePassword);
      patchUser(user.id, (u) => ({ ...clearLockout(u), ...hash, cloudLinked: true, lastLoginAt: nowISO(), mustChangePassword: mustChange }));
      startSession(user, keepSignedIn);
      log('User Login', `${user.name} (@${user.username}) signed in (first time on this device).`, 'info', 'auth');
      return { success: true, mustChangePassword: mustChange };
    }

    const blocked = preCheck(user);
    if (blocked) return blocked;
    const local = await verifyLocal(user, password);
    // An old PIN is not a Supabase password: that one-time sign-in stays on this device.
    const remote: CloudOutcome = local.usedLegacy ? { kind: 'local' } : await signInToCloud(name, password, user, local.ok);
    if (remote.kind === 'local' && !local.ok && !canSignIn(user)) {
      // Known from the cloud, but never used on this device and Supabase cannot be reached.
      return { success: false, error: 'The first sign-in on this device needs the internet. Connect and try again.' };
    }
    if (remote.kind === 'wrong' || remote.kind === 'stale' || (remote.kind === 'local' && !local.ok)) {
      return failAttempt(user, remote.kind === 'stale' ? remote.error : undefined);
    }
    if (remote.kind === 'ok') await afterCloudSignIn(user, password, local.ok);
    const signedIn = user;
    const mustChange = Boolean(local.usedLegacy || signedIn.mustChangePassword || (!hasPassword(signedIn) && remote.kind !== 'ok'));
    patchUser(signedIn.id, (u) => ({ ...clearLockout(u), lastLoginAt: nowISO(), mustChangePassword: mustChange }));
    startSession(signedIn, keepSignedIn);
    log(
      'User Login',
      `${signedIn.name} (@${signedIn.username}) signed in${local.usedLegacy ? ' with their old PIN and must now choose a password' : ''}${remote.kind !== 'ok' && cloud.enabled ? ' (on this device only, not to the cloud)' : ''}.`,
      'info',
      'auth'
    );
    return { success: true, mustChangePassword: mustChange, message: remote.kind === 'local' ? remote.notice : undefined };
  };

  const unlockScreen: AuthApi['unlockScreen'] = async (password) => {
    const s = sessionRef.current;
    const user = s ? usersRef.current.find((u) => u.id === s.userId) : undefined;
    if (!s || !user) return { success: false, error: 'Please sign in again.' };
    if (!password) return { success: false, error: 'Enter your password.' };
    const blocked = preCheck(user);
    if (blocked) return blocked;
    const local = await verifyLocal(user, password);
    // Supabase only when needed: no Supabase session on this device yet, or the password did not match here.
    const needCloud = cloud.enabled && !local.usedLegacy && (!local.ok || cloud.needsSignIn || !(await hasCloudSessionFor(user.username)));
    const remote: CloudOutcome = needCloud ? await signInToCloud(user.username || '', password, user, local.ok) : { kind: 'local' };
    if (remote.kind === 'wrong' || remote.kind === 'stale' || (remote.kind === 'local' && !local.ok)) {
      return failAttempt(user, remote.kind === 'stale' ? remote.error : undefined);
    }
    if (remote.kind === 'ok') await afterCloudSignIn(user, password, local.ok);
    patchUser(user.id, (u) => ({ ...clearLockout(u), lastLoginAt: nowISO() }));
    setSession({ ...s, locked: false });
    log('Screen Unlocked', `${user.name} unlocked the screen.`, 'info', 'auth');
    return { success: true, message: remote.kind === 'local' ? remote.notice : undefined };
  };

  const lockScreen = () => {
    const s = sessionRef.current;
    if (!s) return;
    const user = usersRef.current.find((u) => u.id === s.userId);
    log('Screen Locked', `${user?.name || 'User'} locked the screen.`, 'info', 'auth');
    setSession({ ...s, locked: true });
  };

  const logout = () => {
    const s = sessionRef.current;
    const user = s ? usersRef.current.find((u) => u.id === s.userId) : undefined;
    if (user) log('User Logout', `${user.name} (@${user.username}) signed out.`, 'info', 'auth');
    setSession(null);
    // The next person on this device must sign in to Supabase as themselves.
    if (cloud.enabled) void cloudSignOut();
  };

  const signUpOwner: AuthApi['signUpOwner'] = async ({ shopName, name, username, password, confirmPassword }) => {
    if (usersRef.current.some(canSignInHere) || (cloud.enabled && !cloud.loaded)) {
      return { success: false, error: 'This shop already has an account. Please sign in instead.' };
    }
    const cleanName = name.trim();
    if (!cleanName) return { success: false, error: 'Enter your name.' };
    const userErr = validateUsername(username);
    if (userErr) return { success: false, error: userErr };
    const pwErr = validateNewPassword(password, confirmPassword, securityPolicy);
    if (pwErr) return { success: false, error: pwErr };
    const hash = await hashPassword(password);
    const now = nowISO();
    const owner: AppUser = {
      id: newId(),
      name: cleanName,
      username: normalizeUsername(username),
      role: 'super_admin',
      roles: ['super_admin'],
      pin: '',
      ...hash,
      mustChangePassword: false,
      active: true,
      status: 'active',
      failedAttempts: 0,
      lastLoginAt: now,
      createdAt: now.split('T')[0],
      updatedAt: now,
    };
    setUsers((prev) => [owner, ...prev]);
    const shop = shopName.trim();
    if (shop) setSettings((prev) => (!prev.companyName?.trim() || prev.companyName === 'Sarmaya' ? { ...prev, companyName: shop } : prev));
    startSession(owner, true);
    log('Owner Account Created', `${cleanName} (@${owner.username}) created the owner account${shop ? ` for ${shop}` : ''}.`, 'warning', 'auth');
    return { success: true };
  };

  const changePassword: AuthApi['changePassword'] = async (currentPassword, newPassword, confirmPassword) => {
    const s = sessionRef.current;
    const user = s ? usersRef.current.find((u) => u.id === s.userId) : undefined;
    if (!s || !user) return { success: false, error: 'Please sign in again.' };
    const forced = Boolean(user.mustChangePassword) || !hasPassword(user);
    if (!forced) {
      const ok = currentPassword ? await verifyPassword(currentPassword, user) : false;
      if (!ok) return { success: false, error: 'Your current password is not correct.' };
    }
    const pwErr = validateNewPassword(newPassword, confirmPassword, securityPolicy);
    if (pwErr) return { success: false, error: pwErr };
    if (matchesLegacyCredential(user, newPassword) || (currentPassword && currentPassword === newPassword)) {
      return { success: false, error: 'Choose a new password that is different from the old one.' };
    }
    // Supabase holds the real password: change it there first. A user who has a Supabase login cannot change
    // it offline (the two would disagree); a user without one (database not set up yet) changes it here only.
    if (cloud.enabled) {
      let session = await hasCloudSessionFor(user.username);
      if (!session && user.cloudLinked && currentPassword && cloudAuthAvailable()) {
        session = (await cloudSignIn(user.username || '', currentPassword)).status === 'ok';
      }
      if (session) {
        const res = await cloudChangeOwnPassword(newPassword);
        if (!res.ok) return { success: false, error: res.message || 'Could not change the password on the server.' };
      } else if (user.cloudLinked) {
        return { success: false, error: 'Connect to the internet to change your password (it is also changed on the server).' };
      }
    }
    const hash = await hashPassword(newPassword);
    patchUser(user.id, (u) => ({ ...u, ...hash, pin: '', pinHash: null, mustChangePassword: false, updatedAt: nowISO() }));
    log('Password Changed', `${user.name} (@${user.username}) ${forced ? 'set a new password' : 'changed their password'}.`, 'warning', 'auth');
    return { success: true, message: 'Password saved.' };
  };

  const can = (p: Permission) => Boolean(currentUser) && hasPermission(currentUser, p, roles, securityPolicy.enableRoleHierarchy);

  const addUser: AuthApi['addUser'] = async (data) => {
    if (!can('users:create')) return { success: false, message: 'You do not have permission to add users.' };
    const cleanName = data.name.trim();
    if (!cleanName) return { success: false, message: 'Enter the person’s name.' };
    const userErr = validateUsername(data.username);
    if (userErr) return { success: false, message: userErr };
    const username = normalizeUsername(data.username);
    if (usersRef.current.some((u) => normalizeUsername(u.username) === username)) {
      return { success: false, message: `The username "${username}" is already taken.` };
    }
    const pwErr = validateNewPassword(data.password, undefined, securityPolicy);
    if (pwErr) return { success: false, message: `Temporary password: ${pwErr.charAt(0).toLowerCase()}${pwErr.slice(1)}` };
    const assignedRoles = data.roles && data.roles.length > 0 ? data.roles : [data.role];
    if (assignedRoles.includes('super_admin') && !currentUser?.roles?.includes('super_admin') && currentUser?.role !== 'super_admin') {
      return { success: false, message: 'Only the owner can create another owner (super admin).' };
    }
    const id = newId();
    let cloudNote = '';
    if (cloud.enabled) {
      const res = await cloudAdminSetLogin(id, username, data.password);
      if (!res.ok && res.status !== 'not_installed') return { success: false, message: `Account not created: ${res.message}` };
      if (!res.ok) cloudNote = ' It works on this device only until the shop database is set up for secure sign-in (supabase/auth_setup.sql).';
    }
    const hash = await hashPassword(data.password);
    const now = nowISO();
    const user: AppUser = {
      id,
      name: cleanName,
      username,
      email: data.email?.trim() || undefined,
      role: assignedRoles[0],
      roles: assignedRoles,
      pin: '',
      ...hash,
      mustChangePassword: true,
      active: true,
      status: 'active',
      failedAttempts: 0,
      createdAt: now.split('T')[0],
      updatedAt: now,
    };
    setUsers((prev) => [user, ...prev]);
    log('User Created', `${currentUser?.name} created @${username} (${cleanName}) with role [${assignedRoles.join(', ')}] and a temporary password.`, 'warning', 'users');
    return { success: true, message: `Account @${username} created. Give ${cleanName} the temporary password; they will choose their own at first sign-in.${cloudNote}`, user };
  };

  const resetUserPassword: AuthApi['resetUserPassword'] = async (userId, tempPassword) => {
    if (!can('users:edit')) return { success: false, message: 'You do not have permission to reset passwords.' };
    const user = usersRef.current.find((u) => u.id === userId);
    if (!user) return { success: false, message: 'User not found.' };
    // An admin must not be able to take over the owner's account by setting its password.
    if (isOwnerAccount(user) && user.id !== currentUser?.id && !(currentUser && isOwnerAccount(currentUser))) {
      return { success: false, message: 'Only an owner (super admin) can set a password for an owner account.' };
    }
    const pwErr = validateNewPassword(tempPassword, undefined, securityPolicy);
    if (pwErr) return { success: false, message: pwErr };
    let cloudNote = '';
    if (cloud.enabled) {
      const res = await cloudAdminSetLogin(user.id, user.username || '', tempPassword);
      if (!res.ok && res.status !== 'not_installed') return { success: false, message: `Password not changed: ${res.message}` };
      if (!res.ok) cloudNote = ' It works on this device only until the shop database is set up for secure sign-in (supabase/auth_setup.sql).';
    }
    const hash = await hashPassword(tempPassword);
    patchUser(userId, (u) => ({ ...clearLockout(u), ...hash, pin: '', pinHash: null, mustChangePassword: true, updatedAt: nowISO() }));
    log('Password Reset', `${currentUser?.name} set a temporary password for @${user.username} (${user.name}).`, 'warning', 'auth');
    return { success: true, message: `Temporary password set for @${user.username}. They must choose a new one at next sign-in.${cloudNote}` };
  };

  return {
    authStatus,
    currentUser,
    pendingUser,
    isAdminUnlocked: authStatus === 'signed_in',
    signUpOwner,
    login,
    unlockScreen,
    lockScreen,
    lockAdmin: lockScreen,
    logout,
    changePassword,
    addUser,
    resetUserPassword,
    cloudSignInRequired: cloud.enabled && cloud.needsSignIn,
  };
};
