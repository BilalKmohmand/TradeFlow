import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Supabase Auth sign-in and the locked database (README → "Locking the database"), with supabase.auth,
 * supabase.rpc and the cloud read mocked. Covers: online sign-in goes to Supabase, offline sign-in still works
 * from this device's cached hash, first sign-in links an existing user (grace period), staff creation and
 * password resets go through the admin-only RPC, and the users sync never uploads password material.
 */

const h = vi.hoisted(() => ({
  sessionEmail: null as string | null,
  /** email -> password Supabase Auth accepts */
  authUsers: new Map<string, string>(),
  locked: false,
  cloudUsers: [] as Record<string, unknown>[],
  upserts: [] as { table: string; rows: Record<string, unknown>[] }[],
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  rpcResult: {} as Record<string, { data?: unknown; error?: unknown }>,
  signInCalls: [] as { email: string; password: string }[],
  signOutCalls: 0,
  updateUserCalls: [] as { password: string }[],
  loadCalls: 0,
}));

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
        h.signInCalls.push({ email, password });
        if (h.authUsers.get(email) === password) {
          h.sessionEmail = email;
          return { data: { session: { user: { email } } }, error: null };
        }
        return { data: { session: null }, error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } };
      }),
      getSession: vi.fn(async () => ({ data: { session: h.sessionEmail ? { user: { email: h.sessionEmail } } : null }, error: null })),
      signOut: vi.fn(async () => {
        h.signOutCalls++;
        h.sessionEmail = null;
        return { error: null };
      }),
      updateUser: vi.fn(async ({ password }: { password: string }) => {
        h.updateUserCalls.push({ password });
        if (h.sessionEmail) h.authUsers.set(h.sessionEmail, password);
        return { data: {}, error: null };
      }),
    },
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ fn, args });
      return { data: null, error: null, ...(h.rpcResult[fn] || {}) };
    }),
    from: (table: string) => ({
      upsert: async (rows: Record<string, unknown>[]) => {
        if (h.locked && !h.sessionEmail) return { error: { code: '42501', message: `permission denied for table ${table}` } };
        h.upserts.push({ table, rows });
        return { error: null };
      },
      delete: () => ({ in: async () => ({ error: null }), neq: async () => ({ error: null }) }),
    }),
  },
}));

vi.mock('../lib/database', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/database')>();
  const empty = () => [] as never[];
  return {
    ...real,
    deleteRows: vi.fn(async () => undefined),
    clearTable: vi.fn(async () => undefined),
    clearAllTables: vi.fn(async () => undefined),
    loadAllData: vi.fn(async () => {
      h.loadCalls++;
      if (h.locked && !h.sessionEmail) throw new real.CloudAccessDeniedError('permission denied for table customers');
      return {
        customers: empty(), suppliers: empty(), products: empty(), bookings: empty(), dispatches: empty(), purchases: empty(), priceHistory: empty(), expenses: empty(), trucks: empty(),
        users: h.cloudUsers.map((u) => ({ ...u })), cashEntries: empty(), settings: null, quotations: empty(), purchaseOrders: empty(), returns: empty(), adjustments: empty(), tasks: empty(),
        invoices: [], ledger: empty(), whatsappMessages: empty(), bankStatementLines: null, bankReconciliations: null, godowns: null, stockBatches: null, stockTransfers: null,
        journalEntries: null, accounts: null, customerAgreedRates: null, cheques: null, salesmen: null, areas: null, schemes: null, supplierBills: null, supplierClaims: null,
        finance: {}, approvals: null, deletedRecords: null, branches: null,
      };
    }),
  };
});

import { TradingProvider, useTrading } from '../context/TradingContext';
import { authEmail } from '../lib/cloudAuth';
import { mergeUsers, toUserRow, USER_COLUMNS } from '../lib/password';
import { AppUser } from '../types';
import { OPERATOR, OWNER, TEST_PASSWORD, TEST_USERS_KEY, seedTestUsers, testUsers } from './helpers/auth';

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
/** A user row as the cloud now holds it: no hash, salt, iterations or PIN. */
const cloudRow = (u: object) => toUserRow(u as unknown as AppUser);
const setOnline = (online: boolean) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  h.sessionEmail = null;
  h.authUsers.clear();
  h.locked = false;
  h.cloudUsers = testUsers().map(cloudRow);
  h.upserts.length = 0;
  h.rpcCalls.length = 0;
  h.rpcResult = {};
  h.signInCalls.length = 0;
  h.signOutCalls = 0;
  h.updateUserCalls.length = 0;
  h.loadCalls = 0;
  // Every test user has a Supabase login with the same password, unless a test says otherwise.
  testUsers().forEach((u) => h.authUsers.set(authEmail(u.username), TEST_PASSWORD));
  setOnline(true);
});
afterEach(() => setOnline(true));

describe('sign-in with Supabase Auth', () => {
  it('online sign-in also signs in to Supabase as <username>@shop.sarmaya.local and remembers the link', async () => {
    seedTestUsers();
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    const res = await call(() => result.current.login('  Bilal ', TEST_PASSWORD));
    expect(res.success).toBe(true);
    expect(h.signInCalls).toEqual([{ email: 'bilal@shop.sarmaya.local', password: TEST_PASSWORD }]);
    expect(result.current.currentUser?.username).toBe('bilal');
    await waitFor(() => expect(result.current.users.find((u) => u.username === 'bilal')?.cloudLinked).toBe(true));
    // Logging out also ends the Supabase session on this device.
    act(() => result.current.logout());
    await waitFor(() => expect(h.signOutCalls).toBe(1));
  });

  it('offline sign-in still works from the password cached on this device (Supabase is not called)', async () => {
    seedTestUsers();
    setOnline(false);
    const { result } = render();
    await waitFor(() => expect(result.current.authStatus).toBe('login'));
    expect((await call(() => result.current.login('bilal', 'wrong-password'))).success).toBe(false);
    const res = await call(() => result.current.login('bilal', TEST_PASSWORD));
    expect(res.success).toBe(true);
    expect(result.current.authStatus).toBe('signed_in');
    expect(h.signInCalls).toHaveLength(0);
  });

  it('a password changed elsewhere: Supabase accepts the new one (and it is cached here); the old one is refused', async () => {
    seedTestUsers();
    h.authUsers.set(authEmail('zahid'), 'brand-new-pass-1');
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    h.rpcResult.sarmaya_claim_account = { data: 'already_linked' };
    const old = await call(() => result.current.login('zahid', TEST_PASSWORD));
    expect(old.success).toBe(false);
    expect(old.error).toMatch(/newest password/);
    const fresh = await call(() => result.current.login('zahid', 'brand-new-pass-1'));
    expect(fresh.success).toBe(true);
    act(() => result.current.logout());
    // Offline now: the new password works from the cache on this device.
    setOnline(false);
    expect((await call(() => result.current.login('zahid', 'brand-new-pass-1'))).success).toBe(true);
  });

  it('first sign-in of an existing user with no Supabase login yet links it (claim RPC with the local hash)', async () => {
    seedTestUsers();
    h.authUsers.delete(authEmail('rashid'));
    h.rpcResult.sarmaya_claim_account = { data: 'linked' };
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    const claimSpy = h.rpcCalls;
    // The server creates the login when the claim succeeds.
    const supa = (await import('../lib/supabaseClient')).supabase as any;
    supa.rpc.mockImplementationOnce(async (fn: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ fn, args });
      h.authUsers.set(authEmail(String(args.p_username)), String(args.p_password));
      return { data: 'linked', error: null };
    });
    const res = await call(() => result.current.login('rashid', TEST_PASSWORD));
    expect(res.success).toBe(true);
    const localHash = testUsers().find((u) => u.username === 'rashid')!.passwordHash;
    expect(claimSpy).toEqual([{ fn: 'sarmaya_claim_account', args: { p_username: 'rashid', p_password: TEST_PASSWORD, p_password_hash: localHash } }]);
    expect(h.signInCalls.map((c) => c.email)).toEqual(['rashid@shop.sarmaya.local', 'rashid@shop.sarmaya.local']);
    expect(h.sessionEmail).toBe('rashid@shop.sarmaya.local');
  });

  it('before auth_setup.sql is run (no RPC), sign-in keeps working on this device', async () => {
    seedTestUsers();
    h.authUsers.clear();
    h.rpcResult.sarmaya_claim_account = { error: { code: 'PGRST202', message: 'Could not find the function public.sarmaya_claim_account' } };
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    expect((await call(() => result.current.login('bilal', TEST_PASSWORD))).success).toBe(true);
    expect((await call(() => result.current.login('bilal', 'not-the-password'))).success).toBe(false);
  });

  it('a new device signs in online: Supabase first, then the shop data is read and the password cached', async () => {
    // Nothing on this device; the database is locked, so nothing can be read before signing in.
    h.locked = true;
    const { result } = render();
    await waitFor(() => expect(result.current.authStatus).toBe('login'));
    expect(result.current.users).toHaveLength(0); // no built-in admin invented on a device that could not read the shop
    setOnline(false);
    expect((await call(() => result.current.login('zahid', TEST_PASSWORD))).error).toMatch(/needs the internet/);
    setOnline(true);
    const res = await call(() => result.current.login('zahid', TEST_PASSWORD));
    expect(res.success).toBe(true);
    expect(result.current.currentUser?.username).toBe('zahid');
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    await waitFor(() => expect(result.current.users.find((u) => u.username === 'zahid')?.passwordHash).toBeTruthy());
    // Next time it also works offline on this device.
    act(() => result.current.logout());
    setOnline(false);
    expect((await call(() => result.current.login('zahid', TEST_PASSWORD))).success).toBe(true);
  });

  it('locked database at start: a signed-in device asks for the password once, then syncs again', async () => {
    seedTestUsers();
    localStorage.setItem('sarmaya_session_v2', JSON.stringify({ userId: 'user-operator', expiresAt: Date.now() + 3600_000, persistent: true }));
    h.locked = true;
    const { result } = render();
    await waitFor(() => expect(result.current.authStatus).toBe('locked'));
    expect(result.current.cloudSignInRequired).toBe(true);
    expect(result.current.isCloudSyncReady).toBe(false);
    const res = await call(() => result.current.unlockScreen(TEST_PASSWORD));
    expect(res.success).toBe(true);
    expect(h.signInCalls.map((c) => c.email)).toEqual(['zahid@shop.sarmaya.local']);
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    expect(result.current.cloudSignInRequired).toBe(false);
    expect(result.current.authStatus).toBe('signed_in');
  });

  it('changing your own password changes it in Supabase too', async () => {
    seedTestUsers();
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    await call(() => result.current.login('ayesha', TEST_PASSWORD));
    const res = await call(() => result.current.changePassword(TEST_PASSWORD, 'another-good-pass', 'another-good-pass'));
    expect(res.success).toBe(true);
    expect(h.updateUserCalls).toEqual([{ password: 'another-good-pass' }]);
    // Offline, a user with a Supabase login cannot change it (device and server would disagree).
    setOnline(false);
    h.sessionEmail = null;
    const offline = await call(() => result.current.changePassword('another-good-pass', 'third-good-pass', 'third-good-pass'));
    expect(offline.success).toBe(false);
    expect(offline.error).toMatch(/internet/);
  });
});

describe('staff logins go through the admin-only RPC', () => {
  it('adding staff calls sarmaya_admin_set_login with the new id, username and temporary password', async () => {
    seedTestUsers();
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    await call(() => result.current.login(OWNER.username, OWNER.password));
    h.rpcResult.sarmaya_admin_set_login = { data: 'created' };
    const res = await call(() => result.current.addUser({ name: 'Waji', username: 'Waji', role: 'operator', password: 'temp-pass-123' }));
    expect(res.success).toBe(true);
    expect(h.rpcCalls).toEqual([{ fn: 'sarmaya_admin_set_login', args: { p_user_id: res.user.id, p_username: 'waji', p_password: 'temp-pass-123' } }]);
  });

  it('when the server refuses (not an admin there), the staff member is not created', async () => {
    seedTestUsers();
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    await call(() => result.current.login(OWNER.username, OWNER.password));
    h.rpcResult.sarmaya_admin_set_login = { error: { code: '42501', message: 'Only the owner or an admin can change sign-ins.' } };
    const before = result.current.users.length;
    const res = await call(() => result.current.addUser({ name: 'Waji Two', username: 'waji2', role: 'operator', password: 'temp-pass-123' }));
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Account not created/);
    expect(result.current.users).toHaveLength(before);
  });

  it('a password reset updates the Supabase login through the same RPC', async () => {
    seedTestUsers();
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    await call(() => result.current.login(OWNER.username, OWNER.password));
    h.rpcResult.sarmaya_admin_set_login = { data: 'updated' };
    const res = await call(() => result.current.resetUserPassword('user-operator', 'fresh-temp-99'));
    expect(res.success).toBe(true);
    expect(h.rpcCalls).toEqual([{ fn: 'sarmaya_admin_set_login', args: { p_user_id: 'user-operator', p_username: OPERATOR.username, p_password: 'fresh-temp-99' } }]);
  });
});

describe('the users sync never uploads password material', () => {
  it('upserts to the users table carry no passwordHash, passwordSalt, passwordIter or pinHash, and an empty pin', async () => {
    seedTestUsers([...testUsers(), { ...testUsers()[2], id: 'user-legacy', username: 'legacy', pin: '4455', pinHash: '$2a$04$abc' }]);
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    await call(() => result.current.login(OWNER.username, OWNER.password));
    await waitFor(() => expect(h.upserts.some((u) => u.table === 'users')).toBe(true));
    const rows = h.upserts.filter((u) => u.table === 'users').flatMap((u) => u.rows);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([...USER_COLUMNS].sort());
      expect(row).not.toHaveProperty('passwordHash');
      expect(row).not.toHaveProperty('passwordSalt');
      expect(row).not.toHaveProperty('passwordIter');
      expect(row).not.toHaveProperty('pinHash');
      expect(row.pin).toBe('');
    }
    // ...while this device keeps its cached hashes for offline sign-in.
    const stored = JSON.parse(localStorage.getItem(TEST_USERS_KEY) || '[]');
    expect(stored.find((u: AppUser) => u.username === 'bilal').passwordHash).toBeTruthy();
  });

  it('a newer cloud copy of a user (without hash) never wipes the hash cached on this device', () => {
    const local = testUsers()[0] as unknown as AppUser;
    const cloud = { ...cloudRow(local), name: 'Renamed in the cloud', updatedAt: '2030-01-01T00:00:00.000Z' } as unknown as AppUser;
    const [merged] = mergeUsers([{ ...local, cloudLinked: true }], [cloud]);
    expect(merged.name).toBe('Renamed in the cloud');
    expect(merged.passwordHash).toBe(local.passwordHash);
    expect(merged.passwordSalt).toBe(local.passwordSalt);
    expect(merged.passwordIter).toBe(local.passwordIter);
    expect(merged.cloudLinked).toBe(true);
  });

  it('when the database gets locked mid-session, sync pauses (nothing lost) and resumes after the password', async () => {
    seedTestUsers();
    const { result } = render();
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(true));
    await call(() => result.current.login(OPERATOR.username, OPERATOR.password));
    // lock.sql runs; this device's Supabase session is gone (e.g. signed in elsewhere before the update).
    h.locked = true;
    h.sessionEmail = null;
    act(() => {
      result.current.addCustomer({ name: 'Locked Out Ltd', company: 'Locked Out Ltd', phone: '0300', email: '', address: '', creditLimit: 0 } as any);
    });
    await waitFor(() => expect(result.current.isCloudSyncReady).toBe(false));
    await waitFor(() => expect(result.current.authStatus).toBe('locked'));
    expect(result.current.customers.some((c) => c.name === 'Locked Out Ltd')).toBe(true);
    h.upserts.length = 0;
    expect((await call(() => result.current.unlockScreen(TEST_PASSWORD))).success).toBe(true);
    await waitFor(() => expect(h.upserts.some((u) => u.table === 'customers' && u.rows.some((r) => r.name === 'Locked Out Ltd'))).toBe(true));
  });
});
