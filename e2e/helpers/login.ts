/**
 * Shared sign-in helpers for e2e specs.
 *
 * Typical use (replaces the old "type 7860 on the keypad" unlock):
 *
 *   import { signIn } from './helpers/login';
 *   await page.addInitScript(seed);           // your own data, if any
 *   await signIn(page);                        // seeds the test users + signs in as the owner (bilal)
 *   await signIn(page, OPERATOR);              // …or as another test user
 *
 * Or step by step:
 *   await seedUsers(page);                     // once per test, before the first page.goto
 *   await login(page, 'bilal', 'Sarmaya@2026');// goes to '/', fills the form, waits for the app
 *
 * Credentials: see ./users.ts (all test users share the password TEST_PASSWORD = "Sarmaya@2026").
 * seedUsers only writes the users if the device has none yet, so a reload keeps changes a test made.
 */
import { expect, Page } from '@playwright/test';
import { OWNER, TestCredentials, TEST_USERS_KEY, testUsers } from './users';

export * from './users';

/** Put the known test users on the device (before the app loads). Pass your own list to override. */
export async function seedUsers(page: Page, users: unknown[] = testUsers()) {
  await page.addInitScript(
    ([key, list]) => {
      if (!localStorage.getItem(key as string)) localStorage.setItem(key as string, JSON.stringify(list));
    },
    [TEST_USERS_KEY, users] as const
  );
}

/**
 * Fill the sign-in form and wait until the app is open.
 * `goto: false` when the form is already showing; `waitForApp: false` when a forced password change follows.
 */
export async function login(
  page: Page,
  username = OWNER.username,
  password = OWNER.password,
  opts: { goto?: boolean; keepSignedIn?: boolean; waitForApp?: boolean } = {}
) {
  if (opts.goto !== false) await page.goto('/');
  const form = page.getByTestId('login-form');
  await expect(form).toBeVisible({ timeout: 15_000 });
  await form.getByLabel('Username', { exact: true }).fill(username);
  await form.getByLabel('Password', { exact: true }).fill(password);
  if (opts.keepSignedIn === false) await form.getByLabel('Keep me signed in on this device').uncheck();
  await form.getByRole('button', { name: 'Sign in' }).click();
  if (opts.waitForApp === false) await expect(form).toHaveCount(0, { timeout: 15_000 });
  else await expect(page.getByTestId('auth-gate')).toHaveCount(0, { timeout: 15_000 });
}

/** seedUsers + login in one call (the common case). */
export async function signIn(page: Page, who: TestCredentials = OWNER) {
  await seedUsers(page);
  await login(page, who.username, who.password);
}
