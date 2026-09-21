/**
 * Sign-in helpers for unit/integration tests (replaces the old `unlockAdmin('7860')`).
 *
 *   seedTestUsers();                                  // before rendering TradingProvider
 *   const hook = renderHook(() => useTrading(), { wrapper });
 *   await signIn(() => hook.result.current);          // owner "bilal"
 *   await signIn(() => hook.result.current, OPERATOR);
 *
 * The accounts (and their password "Sarmaya@2026") are shared with the e2e specs: e2e/helpers/users.ts.
 */
import { act } from '@testing-library/react';
import { OWNER, TestCredentials, TEST_USERS_KEY, testUsers } from '../../../e2e/helpers/users';

export * from '../../../e2e/helpers/users';

/** Write the standard test users to localStorage (call before the provider mounts). */
export const seedTestUsers = (users: unknown[] = testUsers()) => localStorage.setItem(TEST_USERS_KEY, JSON.stringify(users));

type Loginable = { login: (u: string, p: string, keep?: boolean) => Promise<{ success: boolean; error?: string }> };

/** Sign in through the real context API; throws with the app's message if it fails. */
export const signIn = async (get: () => Loginable, who: TestCredentials = OWNER) => {
  let res: { success: boolean; error?: string } = { success: false };
  await act(async () => {
    res = await get().login(who.username, who.password);
  });
  if (!res.success) throw new Error(`signIn(${who.username}) failed: ${res.error}`);
};
