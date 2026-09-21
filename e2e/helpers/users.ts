/**
 * Known test accounts with real PBKDF2 password hashes, built in Node (same format the app
 * writes with WebCrypto — see src/lib/password.ts). No Playwright import, so unit tests can use
 * this file too.
 *
 *   username  password        role
 *   bilal     Sarmaya@2026    super_admin  (owner, "Bilal Khan Mohmand")
 *   rashid    Sarmaya@2026    manager
 *   zahid     Sarmaya@2026    operator
 *   ayesha    Sarmaya@2026    viewer
 *
 * Put them in localStorage key `tradeflow_users_v2` (TEST_USERS_KEY) before the app loads.
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';

export const TEST_PASSWORD = 'Sarmaya@2026';
export const TEST_USERS_KEY = 'tradeflow_users_v2';
/** Same work factor as the app (src/lib/password.ts PASSWORD_ITERATIONS). */
const TEST_ITERATIONS = 210_000;

export interface TestCredentials {
  username: string;
  password: string;
  name: string;
}

export const OWNER: TestCredentials = { username: 'bilal', password: TEST_PASSWORD, name: 'Bilal Khan Mohmand' };
export const MANAGER: TestCredentials = { username: 'rashid', password: TEST_PASSWORD, name: 'Rashid Minhas' };
export const OPERATOR: TestCredentials = { username: 'zahid', password: TEST_PASSWORD, name: 'Zahid Yard Weighbridge' };
export const VIEWER: TestCredentials = { username: 'ayesha', password: TEST_PASSWORD, name: 'Auditor Ayesha' };

/** PBKDF2-SHA256 record exactly as src/lib/password.ts stores it. */
export const hashForTest = (password: string, iterations = TEST_ITERATIONS) => {
  const salt = randomBytes(16);
  const key = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256');
  return { passwordHash: key.toString('base64'), passwordSalt: salt.toString('base64'), passwordIter: iterations };
};

/** One user record ready for localStorage. Extra fields (e.g. mustChangePassword, active) can be overridden. */
export const makeTestUser = (opts: { id: string; name: string; username: string; role: string; password?: string } & Record<string, unknown>) => {
  const { password = TEST_PASSWORD, ...rest } = opts;
  return {
    pin: '',
    ...hashForTest(password),
    roles: [opts.role],
    active: true,
    status: 'active',
    mustChangePassword: false,
    failedAttempts: 0,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...rest,
  };
};

let cached: ReturnType<typeof makeTestUser>[] | null = null;
/** The four standard test users (owner, manager, operator, viewer). */
export const testUsers = () =>
  (cached ??= [
    makeTestUser({ id: 'user-superadmin', name: OWNER.name, username: OWNER.username, role: 'super_admin' }),
    makeTestUser({ id: 'user-manager', name: MANAGER.name, username: MANAGER.username, role: 'manager' }),
    makeTestUser({ id: 'user-operator', name: OPERATOR.name, username: OPERATOR.username, role: 'operator' }),
    makeTestUser({ id: 'user-viewer', name: VIEWER.name, username: VIEWER.username, role: 'viewer' }),
  ]);
