/**
 * Username + password sign-in, sign-up of the shop owner, lock screen, logout and password changes.
 * Part of useTrading() (see TradingContext.tsx), kept in its own file like inventoryStore.ts.
 *
 * Session: { userId, expiresAt, locked } in localStorage ("Keep me signed in", 30 days) or
 * sessionStorage (until the browser/tab closes). The signed-in user is always looked up in the
 * users list, so a deleted or switched-off account is signed out straight away.
 *
 * Security note: this is client-side sign-in for a local-first app. Password hashes are PBKDF2,
 * but the Supabase users table is reachable with the anon key while RLS is disabled; real
 * database security would need Supabase Auth + RLS (not implemented).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, AppUser, AuditCategory, Permission, RoleDefinition, SecurityPolicySettings, SessionUser, UserRole } from '../types';
import { hasPermission } from '../lib/auth';
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
}

interface Deps {
  users: AppUser[];
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  roles: RoleDefinition[];
  securityPolicy: SecurityPolicySettings;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  /** True once the cloud users table has been read (or there is no cloud / it failed). */
  cloudSettled: boolean;
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

export const useAuthStore = ({ users, setUsers, roles, securityPolicy, settings, setSettings, cloudSettled, log }: Deps): AuthApi => {
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
  useEffect(() => {
    if (!cloudSettled) return;
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
  }, [cloudSettled, users, setUsers]);

  const sessionUser = session ? users.find((u) => u.id === session.userId && isAccountActive(u)) : undefined;
  const anyAccount = users.some(canSignIn);

  let authStatus: AuthStatus;
  if (sessionUser && session) {
    authStatus = session.locked ? 'locked' : sessionUser.mustChangePassword || !hasPassword(sessionUser) ? 'change_password' : 'signed_in';
  } else if (anyAccount) authStatus = 'login';
  else authStatus = cloudSettled ? 'signup' : 'loading';

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

  /** Check a password for one user, applying the failed-attempt lockout. */
  const checkPassword = async (user: AppUser, password: string): Promise<AuthResult & { usedLegacy?: boolean }> => {
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
    let ok = false;
    let usedLegacy = false;
    if (hasPassword(user)) ok = await verifyPassword(password, user);
    else if (matchesLegacyCredential(user, password, legacyMasterPin)) {
      ok = true;
      usedLegacy = true;
    }
    // Re-read: the record may have changed while hashing.
    const latest = usersRef.current.find((u) => u.id === user.id) || user;
    if (!ok) {
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
        error: `Username or password is incorrect. ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? '' : 's'} left before the account is locked.`,
      };
    }
    return { success: true, usedLegacy };
  };

  const login: AuthApi['login'] = async (username, password, keepSignedIn = true) => {
    const name = normalizeUsername(username);
    if (!name || !password) return { success: false, error: 'Enter your username and password.' };
    const user = usersRef.current.find((u) => normalizeUsername(u.username) === name);
    if (!user || !canSignIn(user)) {
      log('Login Failed', `Sign-in attempt with unknown username "${name}".`, 'warning', 'auth');
      return { success: false, error: 'Username or password is incorrect.' };
    }
    const res = await checkPassword(user, password);
    if (!res.success) return res;
    const mustChange = Boolean(res.usedLegacy || user.mustChangePassword || !hasPassword(user));
    patchUser(user.id, (u) => ({ ...clearLockout(u), lastLoginAt: nowISO(), mustChangePassword: mustChange }));
    startSession(user, keepSignedIn);
    log(
      'User Login',
      `${user.name} (@${user.username}) signed in${res.usedLegacy ? ' with their old PIN and must now choose a password' : ''}.`,
      'info',
      'auth'
    );
    return { success: true, mustChangePassword: mustChange };
  };

  const unlockScreen: AuthApi['unlockScreen'] = async (password) => {
    const s = sessionRef.current;
    const user = s ? usersRef.current.find((u) => u.id === s.userId) : undefined;
    if (!s || !user) return { success: false, error: 'Please sign in again.' };
    if (!password) return { success: false, error: 'Enter your password.' };
    const res = await checkPassword(user, password);
    if (!res.success) return res;
    patchUser(user.id, (u) => ({ ...clearLockout(u), lastLoginAt: nowISO() }));
    setSession({ ...s, locked: false });
    log('Screen Unlocked', `${user.name} unlocked the screen.`, 'info', 'auth');
    return { success: true };
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
  };

  const signUpOwner: AuthApi['signUpOwner'] = async ({ shopName, name, username, password, confirmPassword }) => {
    if (usersRef.current.some(canSignIn)) {
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
    const hash = await hashPassword(data.password);
    const now = nowISO();
    const user: AppUser = {
      id: newId(),
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
    return { success: true, message: `Account @${username} created. Give ${cleanName} the temporary password; they will choose their own at first sign-in.`, user };
  };

  const resetUserPassword: AuthApi['resetUserPassword'] = async (userId, tempPassword) => {
    if (!can('users:edit')) return { success: false, message: 'You do not have permission to reset passwords.' };
    const user = usersRef.current.find((u) => u.id === userId);
    if (!user) return { success: false, message: 'User not found.' };
    const pwErr = validateNewPassword(tempPassword, undefined, securityPolicy);
    if (pwErr) return { success: false, message: pwErr };
    const hash = await hashPassword(tempPassword);
    patchUser(userId, (u) => ({ ...clearLockout(u), ...hash, pin: '', pinHash: null, mustChangePassword: true, updatedAt: nowISO() }));
    log('Password Reset', `${currentUser?.name} set a temporary password for @${user.username} (${user.name}).`, 'warning', 'auth');
    return { success: true, message: `Temporary password set for @${user.username}. They must choose a new one at next sign-in.` };
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
  };
};
