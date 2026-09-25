import { test, expect } from '@playwright/test';
import { signIn } from './helpers/login';
import { goTo } from './helpers/nav';
test('logo goes home', async ({ page }) => {
  await signIn(page);
  await goTo(page, 'Money');
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
});
