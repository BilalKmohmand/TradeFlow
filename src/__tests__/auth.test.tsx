import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import bcrypt from 'bcryptjs';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { SESSION_KEY } from '../context/authStore';
import {
  PASSWORD_ITERATIONS,
  canSignIn,
  deriveUsername,
  hashPassword,
  lockoutMinutesLeft,
  matchesLegacyCredential,
  mergeUsers,
  migrateLegacyUsers,
  registerFailedAttempt,
  timingSafeEqual,
  toUserRow,
  validateNewPassword,
  validateUsername,
  verifyPassword,
} from '../lib/password';
import { AppUser } from '../types';
import { OPERATOR, OWNER, TEST_PASSWORD, hashForTest, seedTestUsers, signIn } from './helpers/auth';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const render = () => renderHook(() => useTrading(), { wrapper });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (fn: () => Promise<any>): Promise<any> => {
  let out: any;
  await act(async () => {
    out = await fn();
  });
  return out;
};

/** The users a shop had in the PIN era (as stored by the old app). */
const pinEraUsers = (): AppUser[] => [
  { id: 'user-superadmin', name: 'Bilal Khan Mohmand', username: 'superadmin', role: 'super_admin', roles: ['super_admin'], pin: '7860', pinHash: bcrypt.hashSync('7860', 4), passwordHash: bcrypt.hashSync('Admin@7860', 4), active: true, status: 'active', createdAt: '2026-09-01' },
  { id: 'user-manager', name: 'Rashid Minhas', username: 'rashid.ops', role: 'manager', roles: ['manager'], pin: '1234', active: true, status: 'active', createdAt: '2026-09-02' },
  { id: 'user-operator', name: 'Zahid Yard Weighbridge', username: 'zahid.weigh', role: 'operator', roles: ['operator'], pin: '9876', active: true, status: 'active', createdAt: '2026-09-03' },
  { id: 'user-viewer', name: 'Auditor Ayesha', role: 'viewer', roles: ['viewer'], pin: '5566', active: true, status: 'active', createdAt: '2026-09-04' },
];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('password hashing (PBKDF2-SHA256 via WebCrypto)', () => {
  it('hashes with a random 16-byte salt and at least 150k iterations, and verifies', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a.passwordIter).toBe(PASSWORD_ITERATIONS);
    expect(a.passwordIter).toBeGreaterThanOrEqual(150_000);
    expect(atob(a.passwordSalt)).toHaveLength(16);
    expect(atob(a.passwordHash)).toHaveLength(32);
    expect(a.passwordSalt).not.toBe(b.passwordSalt);
    expect(a.passwordHash).not.toBe(b.passwordHash);
    expect(JSON.stringify(a)).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('correct horsE', a)).toBe(false);
    expect(await verifyPassword('', a)).toBe(false);
  });
  it('never throws on a missing or broken record', async () => {
    expect(await verifyPassword('x', {})).toBe(false);
    expect(await verifyPassword('x', { passwordHash: '!!', passwordSalt: '??', passwordIter: 10 })).toBe(false);
  });
  it('verifies hashes made in Node for the test accounts (same format on every device)', async () => {
    expect(await verifyPassword(TEST_PASSWORD, hashForTest(TEST_PASSWORD, 1000))).toBe(true);
    expect(await verifyPassword('nope', hashForTest(TEST_PASSWORD, 1000))).toBe(false);
  });
  it('compares in constant time for equal lengths', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
  it('validates usernames and new passwords in plain English', () => {
    expect(validateUsername('Bilal')).toBeNull();
    expect(validateUsername('bilal khan')).toMatch(/no spaces/);
    expect(validateUsername('')).toMatch(/Choose a username/);
    expect(validateNewPassword('short')).toMatch(/at least 8 characters/);
    expect(validateNewPassword('long enough', 'different')).toMatch(/do not match/);
    expect(validateNewPassword('long enough', 'long enough')).toBeNull();
  });
});

describe('migration of PIN-era users', () => {
  it('gives each a username from the first name and asks for a new password', () => {
    const out = migrateLegacyUsers(pinEraUsers());
    expect(out.map((u) => u.username)).toEqual(['bilal', 'rashid', 'zahid', 'auditor']);
    expect(out.every((u) => u.mustChangePassword)).toBe(true);
    // Idempotent: running again changes nothing.
    expect(migrateLegacyUsers(out)).toBe(out);
  });
  it('keeps usernames unique and leaves password users alone', () => {
    const withPassword: AppUser = { id: 'x', name: 'Bilal New', username: 'bilal', role: 'manager', pin: '', ...hashForTest('whatever-1', 1000), active: true, createdAt: '2026-01-01' };
    const out = migrateLegacyUsers([withPassword, { id: 'y', name: 'Bilal Old', role: 'operator', pin: '1111', active: true, createdAt: '2026-01-01' }]);
    expect(out[0]).toBe(withPassword);
    expect(out[1].username).toBe('bilal2');
    expect(deriveUsername('  A  ', new Set())).toBe('usera');
  });
  it('accepts the old PIN (plain or bcrypt) once, and the old master PIN only for the owner', () => {
    const [owner, manager] = migrateLegacyUsers(pinEraUsers());
    expect(matchesLegacyCredential(owner, '7860')).toBe(true);
    expect(matchesLegacyCredential({ ...owner, pin: '' }, '7860')).toBe(true); // bcrypt pinHash
    expect(matchesLegacyCredential(owner, 'Admin@7860')).toBe(true); // old bcrypt password
    expect(matchesLegacyCredential(owner, '0000')).toBe(false);
    expect(matchesLegacyCredential({ ...owner, pin: '', pinHash: null, passwordHash: null }, '4455', '4455')).toBe(true);
    expect(matchesLegacyCredential(manager, '4455', '4455')).toBe(false);
    expect(matchesLegacyCredential(manager, '1234')).toBe(true);
  });
  it('users sync as table columns only, with the hash fields', () => {
    const row = toUserRow({ id: 'u', name: 'N', role: 'operator', active: true, createdAt: 'x', ...hashForTest('pw-pw-pw-pw', 1000), lastLogin: 'junk' } as any);
    expect(row).toHaveProperty('passwordHash');
    expect(row).toHaveProperty('passwordSalt');
    expect(row).toHaveProperty('passwordIter', 1000);
    expect(row).not.toHaveProperty('lastLogin');
    expect(row.pin).toBe('');
  });
  it('merges device and cloud users: newer copy wins, local-only users are kept', () => {
    const base = { name: 'A', role: 'operator', active: true, createdAt: 'x' } as const;
    const merged = mergeUsers(
      [{ ...base, id: '1', username: 'local-new', updatedAt: '2026-09-02' }, { ...base, id: '2', username: 'only-local' }] as AppUser[],
      [{ ...base, id: '1', username: 'cloud-old', updatedAt: '2026-09-01' }, { ...base, id: '3', username: 'only-cloud' }] as AppUser[]
    );
    expect(merged.map((u) => u.username).sort()).toEqual(['local-new', 'only-cloud', 'only-local']);
  });
});

describe('lockout', () => {
  it('locks after the policy limit and starts over when the lock has expired', () => {
    const policy = { maxFailedAttempts: 3, lockoutDurationMinutes: 15 };
    let u = { id: 'u', name: 'U', role: 'operator', active: true, createdAt: 'x' } as AppUser;
    let r = registerFailedAttempt(u, policy);
    expect(r).toMatchObject({ locked: false, attemptsLeft: 2 });
    u = registerFailedAttempt(r.user, policy).user;
    r = registerFailedAttempt(u, policy);
    expect(r.locked).toBe(true);
    expect(lockoutMinutesLeft(r.user)).toBe(15);
    const later = Date.now() + 16 * 60000;
    expect(lockoutMinutesLeft(r.user, later)).toBe(0);
    expect(registerFailedAttempt(r.user, policy, later)).toMatchObject({ locked: false, attemptsLeft: 2 });
  });
});

describe('built-in Admin / 1234', () => {
  it('an empty device gets a super admin "Admin" who signs in with 1234, once', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.authStatus).toBe('login'), { timeout: 20_000 });
    let r: any;
    await act(async () => { r = await result.current.login('Admin', '1234'); });
    expect(r.success).toBe(true);
    expect(r.mustChangePassword).toBe(false);
    expect(result.current.currentUser?.role).toBe('super_admin');
  });
});

describe('sign-up, login, lock and logout through the app state', () => {
  it('an empty device asks to create the owner account; the password is stored hashed', async () => {
    localStorage.setItem('sarmaya_default_admin_added_v1', '1'); // without the built-in Admin
    const { result } = render();
    expect(result.current.authStatus).toBe('signup');
    expect(result.current.users).toHaveLength(0);
    const weak = await call(() => result.current.signUpOwner({ shopName: 'Zaman Traders', name: 'Bilal', username: 'bilal', password: 'short', confirmPassword: 'short' }));
    expect(weak.error).toMatch(/at least 8/);
    const res = await call(() =>
      result.current.signUpOwner({ shopName: 'Zaman Traders', name: 'Bilal Khan', username: ' Bilal ', password: 'my shop 2026', confirmPassword: 'my shop 2026' })
    );
    expect(res.success).toBe(true);
    expect(result.current.authStatus).toBe('signed_in');
    expect(result.current.currentUser).toMatchObject({ name: 'Bilal Khan', username: 'bilal', role: 'super_admin' });
    expect(result.current.settings.companyName).toBe('Zaman Traders');
    const stored = localStorage.getItem('tradeflow_users_v2')!;
    expect(stored).not.toContain('my shop 2026');
    const owner = result.current.users[0];
    expect(owner.passwordSalt).toBeTruthy();
    expect(await verifyPassword('my shop 2026', owner)).toBe(true);
    // No second public sign-up once an owner exists.
    act(() => result.current.logout());
    expect(result.current.authStatus).toBe('login');
    const again = await call(() => result.current.signUpOwner({ shopName: 'X', name: 'Y', username: 'yy', password: '12345678', confirmPassword: '12345678' }));
    expect(again.success).toBe(false);
  });

  it('username is case-insensitive and trimmed; wrong passwords count down and lock the account', async () => {
    seedTestUsers();
    const { result } = render();
    expect(result.current.authStatus).toBe('login');
    for (let i = 4; i >= 1; i--) {
      const r = await call(() => result.current.login('ZAHID', 'wrong'));
      expect(r.error).toBe(`Username or password is incorrect. ${i} attempt${i === 1 ? '' : 's'} left before the account is locked.`);
    }
    const locked = await call(() => result.current.login('zahid', 'wrong'));
    expect(locked).toMatchObject({ success: false, isLocked: true });
    expect(locked.error).toMatch(/locked for 15 minutes/);
    // Even the right password is refused while locked.
    const refused = await call(() => result.current.login('zahid', TEST_PASSWORD));
    expect(refused.error).toMatch(/Try again in 15 minutes/);
    expect(result.current.auditLogs.some((l) => l.action === 'Account Locked Out')).toBe(true);
    // The owner lifts the lockout.
    await signIn(() => result.current);
    act(() => result.current.unlockUserAccount('user-operator'));
    act(() => result.current.logout());
    const ok = await call(() => result.current.login('  Zahid ', TEST_PASSWORD));
    expect(ok.success).toBe(true);
    expect(result.current.currentUser?.role).toBe('operator');
    const unknown = await call(async () => {
      act(() => result.current.logout());
      return result.current.login('nobody', 'whatever');
    });
    expect(unknown.error).toBe('Username or password is incorrect.');
  });

  it('a PIN-era user signs in once with username + old PIN, must set a password, and the PIN stops working', async () => {
    localStorage.setItem('tradeflow_users_v2', JSON.stringify(pinEraUsers()));
    localStorage.setItem('sarmaya_admin_pin_v1', '7860');
    const { result } = render();
    expect(result.current.authStatus).toBe('login');
    expect(result.current.users.find((u) => u.id === 'user-manager')!.username).toBe('rashid');
    const r = await call(() => result.current.login('rashid', '1234'));
    expect(r).toMatchObject({ success: true, mustChangePassword: true });
    expect(result.current.authStatus).toBe('change_password');
    expect(result.current.currentUser).toBeNull();
    expect(result.current.pendingUser?.name).toBe('Rashid Minhas');
    const same = await call(() => result.current.changePassword(null, '1234', '1234'));
    expect(same.success).toBe(false);
    const done = await call(() => result.current.changePassword(null, 'rashid-new-pass', 'rashid-new-pass'));
    expect(done.success).toBe(true);
    expect(result.current.authStatus).toBe('signed_in');
    const rashid = result.current.users.find((u) => u.id === 'user-manager')!;
    expect(rashid.pin).toBe('');
    expect(rashid.mustChangePassword).toBe(false);
    act(() => result.current.logout());
    expect((await call(() => result.current.login('rashid', '1234'))).success).toBe(false);
    expect((await call(() => result.current.login('rashid', 'rashid-new-pass'))).success).toBe(true);
    // Master PIN is only for the owner, and is forgotten once the owner has a password.
    act(() => result.current.logout());
    expect((await call(() => result.current.login('bilal', '7860'))).mustChangePassword).toBe(true);
    await call(() => result.current.changePassword(null, 'owner-password-1'));
    expect(localStorage.getItem('sarmaya_admin_pin_v1')).toBeNull();
  });

  it('lock screen asks for the same password; logout ends the session', async () => {
    seedTestUsers();
    const { result } = render();
    await signIn(() => result.current);
    act(() => result.current.lockScreen());
    expect(result.current.authStatus).toBe('locked');
    expect(result.current.isAdminUnlocked).toBe(false);
    expect(result.current.pendingUser?.username).toBe('bilal');
    expect((await call(() => result.current.unlockScreen('wrong'))).success).toBe(false);
    expect((await call(() => result.current.unlockScreen(TEST_PASSWORD))).success).toBe(true);
    expect(result.current.authStatus).toBe('signed_in');
    act(() => result.current.logout());
    expect(result.current.authStatus).toBe('login');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(result.current.auditLogs.map((l) => l.action)).toEqual(expect.arrayContaining(['Screen Locked', 'Screen Unlocked', 'User Logout', 'User Login']));
  });

  it('"keep me signed in" survives a restart; otherwise the session lives only in this tab', async () => {
    seedTestUsers();
    const first = render();
    await call(() => first.result.current.login('bilal', TEST_PASSWORD, true));
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).expiresAt).toBeGreaterThan(Date.now() + 29 * 86400_000);
    first.unmount();
    const second = render();
    expect(second.result.current.authStatus).toBe('signed_in');
    act(() => second.result.current.logout());
    await call(() => second.result.current.login('bilal', TEST_PASSWORD, false));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeTruthy();
    // A locked session stays locked after a reload.
    act(() => second.result.current.lockScreen());
    second.unmount();
    expect(render().result.current.authStatus).toBe('locked');
  });

  it('only users who can manage users create staff and reset passwords; both force a new password', async () => {
    seedTestUsers();
    const { result } = render();
    await signIn(() => result.current, OPERATOR);
    const denied = await call(() => result.current.addUser({ name: 'X', username: 'xx', role: 'operator', password: 'temp-pass-1' }));
    expect(denied.success).toBe(false);
    act(() => result.current.logout());
    await signIn(() => result.current, OWNER);
    const dup = await call(() => result.current.addUser({ name: 'Other Zahid', username: 'ZAHID', role: 'operator', password: 'temp-pass-1' }));
    expect(dup.message).toMatch(/already taken/);
    const ok = await call(() => result.current.addUser({ name: 'Sana Cashier', username: 'sana', role: 'editor', password: 'temp-pass-1' }));
    expect(ok.success).toBe(true);
    expect(ok.user).toMatchObject({ username: 'sana', mustChangePassword: true, role: 'editor' });
    const reset = await call(() => result.current.resetUserPassword('user-operator', 'fresh-temp-9'));
    expect(reset.success).toBe(true);
    act(() => result.current.logout());
    expect((await call(() => result.current.login('zahid', TEST_PASSWORD))).success).toBe(false);
    expect((await call(() => result.current.login('zahid', 'fresh-temp-9'))).mustChangePassword).toBe(true);
    expect(result.current.authStatus).toBe('change_password');
  });

  it('the only owner cannot be deleted or demoted, and canSignIn needs a credential', async () => {
    seedTestUsers();
    localStorage.setItem('sarmaya_default_admin_added_v1', '1'); // this test needs a single owner
    const { result } = render();
    await signIn(() => result.current);
    const res = result.current.updateUser('user-superadmin', { role: 'manager', roles: ['manager'] });
    expect(res.success).toBe(false);
    act(() => result.current.deleteUser('user-superadmin'));
    expect(result.current.users.some((u) => u.id === 'user-superadmin')).toBe(true);
    expect(canSignIn({ id: 'n', name: 'N', role: 'operator', active: true, createdAt: 'x' } as AppUser)).toBe(false);
  });
});
