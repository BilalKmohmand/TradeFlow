import { test, expect, Page } from '@playwright/test';
import { login, seedUsers, OWNER, TEST_PASSWORD } from './helpers/login';
import { goTo } from './helpers/nav';

const SHOTS = process.env.SHOT_DIR || 'e2e/screenshots/auth';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

const noOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(0);
};

const appIsOpen = (page: Page) => expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 });

async function openUserMenu(page: Page) {
  await page.getByRole('button', { name: /^Account menu for/ }).click();
}

test.describe('Sign-up, sign-in and passwords', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => {
      throw e;
    });
  });

  test('an empty device creates the owner account, then stays signed in', async ({ page }) => {
    await page.goto('/');
    const form = page.getByTestId('signup-form');
    await expect(form.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await form.getByLabel('Shop name').fill('Zaman Oil Traders');
    await form.getByLabel('Your name').fill('Bilal Khan');
    await form.getByLabel('Username').fill('Bilal');
    await form.getByLabel('Password', { exact: true }).fill('short');
    await form.getByLabel('Confirm password').fill('short');
    await form.getByRole('button', { name: 'Create account' }).click();
    await expect(form.getByRole('alert')).toHaveText('Password must be at least 8 characters.');

    await form.getByLabel('Password', { exact: true }).fill('zaman-2026');
    await form.getByLabel('Confirm password').fill('zaman-2026x');
    await form.getByRole('button', { name: 'Create account' }).click();
    await expect(form.getByRole('alert')).toHaveText('The two passwords do not match.');

    // Show / hide the password.
    const pw = form.getByLabel('Password', { exact: true });
    await expect(pw).toHaveAttribute('type', 'password');
    await form.getByRole('button', { name: 'Show password' }).first().click();
    await expect(pw).toHaveAttribute('type', 'text');

    await form.getByLabel('Confirm password').fill('zaman-2026');
    await form.getByRole('button', { name: 'Create account' }).click();
    await appIsOpen(page);
    await expect(page.getByRole('banner').getByText('Zaman Oil Traders')).toBeVisible();

    // Nothing stored in plain text.
    const stored = await page.evaluate(() => localStorage.getItem('tradeflow_users_v2') || '');
    expect(stored).not.toContain('zaman-2026');
    expect(stored).toContain('passwordSalt');

    // "Keep me signed in" is the default: a reload opens straight into the app.
    await page.reload();
    await appIsOpen(page);

    // My account shows the username.
    await openUserMenu(page);
    await page.getByRole('menuitem', { name: /My account/ }).click();
    await expect(page.getByTestId('my-username')).toHaveText('bilal');
  });

  test('login: wrong password is refused with a clear message, then the right one works', async ({ page }) => {
    await seedUsers(page);
    await page.goto('/');
    const form = page.getByTestId('login-form');
    await form.getByLabel('Username', { exact: true }).fill('BILAL ');
    await form.getByLabel('Password', { exact: true }).fill('not-my-password');
    await form.getByRole('button', { name: 'Sign in' }).click();
    await expect(form.getByRole('alert')).toHaveText('Username or password is incorrect. 4 attempts left before the account is locked.');
    await form.getByLabel('Username', { exact: true }).fill('nobody');
    await form.getByLabel('Password', { exact: true }).fill('whatever-1');
    await form.getByRole('button', { name: 'Sign in' }).click();
    await expect(form.getByRole('alert')).toHaveText('Username or password is incorrect.');
    await login(page, OWNER.username, OWNER.password, { goto: false });
    await appIsOpen(page);
  });

  test('a PIN-era user signs in once with the old PIN and must choose a new password', async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('tradeflow_users_v2')) return;
      localStorage.setItem(
        'tradeflow_users_v2',
        JSON.stringify([
          { id: 'user-superadmin', name: 'Bilal Khan Mohmand', username: 'superadmin', role: 'super_admin', roles: ['super_admin'], pin: '7860', active: true, status: 'active', createdAt: '2026-09-01' },
          { id: 'user-manager', name: 'Rashid Minhas', username: 'rashid.ops', role: 'manager', roles: ['manager'], pin: '1234', active: true, status: 'active', createdAt: '2026-09-02' },
        ])
      );
    });
    await page.goto('/');
    await expect(page.getByTestId('pin-migration-hint')).toBeVisible();
    await login(page, 'rashid', '1234', { goto: false, waitForApp: false }); // a new password is needed next
    const change = page.getByTestId('change-password-form');
    await expect(change.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await expect(change).toContainText('Rashid Minhas');
    await change.getByLabel('New password', { exact: true }).fill('rashid-2026!');
    await change.getByLabel('Confirm new password').fill('rashid-2026!');
    await change.getByRole('button', { name: 'Save password' }).click();
    await appIsOpen(page);

    // Log out, the old PIN no longer works, the new password does.
    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    const form = page.getByTestId('login-form');
    await form.getByLabel('Username', { exact: true }).fill('rashid');
    await form.getByLabel('Password', { exact: true }).fill('1234');
    await form.getByRole('button', { name: 'Sign in' }).click();
    await expect(form.getByRole('alert')).toContainText('Username or password is incorrect.');
    await login(page, 'rashid', 'rashid-2026!', { goto: false });
    await appIsOpen(page);
  });

  test('the owner adds a staff member, who signs in with the temporary password and sets their own', async ({ page }) => {
    await seedUsers(page);
    await login(page);
    await goTo(page, 'Admin');
    await expect(page.getByRole('heading', { name: /Admin(istrator)? Control Center/ })).toBeVisible();
    // Usernames are listed.
    await expect(page.getByTestId('user-row-zahid')).toContainText('@zahid');

    await page.getByRole('button', { name: 'Add staff' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add staff' });
    await dialog.getByLabel('Full name').fill('Sana Cashier');
    await dialog.getByLabel('Username').fill('sana');
    await dialog.getByLabel('Role').selectOption('editor');
    await dialog.getByLabel('Temporary password').fill('welcome-sana');
    await dialog.getByRole('button', { name: 'Create account' }).click();
    const created = page.getByTestId('staff-created');
    await expect(created).toContainText('sana');
    await expect(created).toContainText('welcome-sana');
    await created.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('user-row-sana')).toContainText('Temporary password');
    // The old master-PIN card is replaced by sign-in & session info.
    await page.getByRole('button', { name: /System & Backups/ }).click();
    await expect(page.getByText('Sign-in & session')).toBeVisible();
    await expect(page.getByText(/Master Terminal PIN/)).toHaveCount(0);

    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await login(page, 'sana', 'welcome-sana', { goto: false, waitForApp: false });
    const change = page.getByTestId('change-password-form');
    await expect(change).toBeVisible();
    await change.getByLabel('New password', { exact: true }).fill('sana-own-pass');
    await change.getByLabel('Confirm new password').fill('sana-own-pass');
    await change.getByRole('button', { name: 'Save password' }).click();
    await appIsOpen(page);
    // An editor cannot open Admin.
    await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);
  });

  test('lock asks for the same password; switch user and log out', async ({ page }) => {
    await seedUsers(page);
    await login(page);
    await appIsOpen(page);
    await page.getByRole('button', { name: 'Lock screen' }).click();
    const lock = page.getByTestId('lock-screen');
    await expect(lock).toContainText('@bilal');
    // A reload does not get past the lock.
    await page.reload();
    await expect(lock).toBeVisible();
    await lock.getByLabel('Password', { exact: true }).fill('wrong-password');
    await lock.getByRole('button', { name: 'Unlock' }).click();
    await expect(lock.getByRole('alert')).toContainText('Username or password is incorrect.');
    await lock.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await lock.getByRole('button', { name: 'Unlock' }).click();
    await appIsOpen(page);

    // Switch user from the lock screen.
    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Lock screen' }).click();
    await page.getByRole('button', { name: /Switch user/ }).click();
    await expect(page.getByTestId('login-form')).toBeVisible();
    await login(page, 'rashid', TEST_PASSWORD, { goto: false });
    await appIsOpen(page);

    // Log out ends the session for good.
    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page.getByTestId('login-form')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('login-form')).toBeVisible();
    const audit = await page.evaluate(() => localStorage.getItem('sarmaya_audit_logs_v1') || '');
    for (const action of ['User Login', 'Login Failed', 'Screen Locked', 'Screen Unlocked', 'User Logout']) expect(audit).toContain(action);
  });
});

test.describe('Sign-in screens on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('sign-up, login and lock fit a 390px screen in light and dark mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('signup-form')).toBeVisible();
    await noOverflow(page, 'sign-up');
    await shot(page, 'mobile-signup-light');
    await page.getByRole('button', { name: 'Switch light / dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await noOverflow(page, 'sign-up dark');
    await shot(page, 'mobile-signup-dark');

    const form = page.getByTestId('signup-form');
    await form.getByLabel('Shop name').fill('Rohail Zaman Traders');
    await form.getByLabel('Your name').fill('Rohail');
    await form.getByLabel('Username').fill('rohail');
    await form.getByLabel('Password', { exact: true }).fill('rohail-pass-1');
    await form.getByLabel('Confirm password').fill('rohail-pass-1');
    await form.getByRole('button', { name: 'Create account' }).click();
    await appIsOpen(page);
    await noOverflow(page, 'home after sign-up');

    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Lock screen' }).click();
    await expect(page.getByTestId('lock-screen')).toBeVisible();
    await noOverflow(page, 'lock screen');
    await shot(page, 'mobile-lock-dark');
    await page.getByRole('button', { name: /Switch user/ }).click();
    await expect(page.getByTestId('login-form')).toBeVisible();
    await noOverflow(page, 'login');
    await shot(page, 'mobile-login-dark');
    await login(page, 'rohail', 'rohail-pass-1', { goto: false });
    await appIsOpen(page);
  });
});
