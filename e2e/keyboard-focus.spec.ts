import { test, expect, Page } from '@playwright/test';
import { signIn, OWNER } from './helpers/login';
import { bigShop } from './helpers/bigShop';
import { goTo } from './helpers/nav';

/**
 * Keyboard and focus: Code boxes move on with Enter like the old program, focus comes back to where the
 * user was after a dialog closes, Tab stays inside an open dialog, and focus is always visible.
 */
test.use({ viewport: { width: 1360, height: 900 } });

async function open(page: Page) {
  await page.addInitScript(bigShop);
  await signIn(page, OWNER);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({ timeout: 15_000 });
}

const hasVisibleFocus = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const s = getComputedStyle(el);
    return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none') || false;
  });

test('New Bill: Code boxes for the customer and every item line; Enter on a code moves on', async ({ page }) => {
  await open(page);
  await page.keyboard.press('F2');
  const bill = page.getByRole('dialog', { name: 'New Bill' });
  // The cursor still starts in the customer list (type a name or code there, as before).
  await expect(bill.getByLabel('Customer', { exact: true })).toBeFocused();
  await bill.getByLabel('Customer code').fill('c0007');
  await bill.getByLabel('Customer code').press('Enter');
  await expect(bill.getByLabel('Customer', { exact: true })).toHaveValue('c7');
  await expect(bill.locator('#bill-date')).toBeFocused();
  // Picking by name fills the Code box.
  await bill.getByLabel('Customer', { exact: true }).selectOption('c1');
  await expect(bill.getByLabel('Customer code')).toHaveValue('C-0001');

  await bill.getByLabel('Item code 1').fill('105');
  await bill.getByLabel('Item code 1').press('Enter');
  await expect(bill.getByLabel('Item 1', { exact: true })).toHaveValue('p5');
  await expect(bill.getByLabel('Quantity 1', { exact: true })).toBeFocused();
  await page.keyboard.type('3');
  await expect(bill).toContainText('Rs. 7,800'); // 3 × 2,600
  await bill.getByLabel('Item code 1').fill('999');
  await bill.getByLabel('Item code 1').press('Enter');
  await expect(bill.getByRole('alert').filter({ hasText: 'No code' })).toBeVisible();
  await expect(bill.getByLabel('Item 1', { exact: true })).toHaveValue('p5'); // a wrong code changes nothing
});

test('focus returns to the button that opened a dialog, Find anything and the menu; Tab stays inside a dialog', async ({ page }) => {
  await open(page);
  await goTo(page, 'Money');
  const btn = page.locator('main').getByRole('button', { name: 'Receive payment' }).first();
  await btn.focus();
  await page.keyboard.press('Enter');
  const rc = page.getByRole('dialog', { name: 'Receive payment' });
  await expect(rc).toBeVisible();
  await expect(rc.getByLabel('Customer', { exact: true })).toBeFocused(); // the first field gets the cursor
  // Tab and Shift+Tab never leave the dialog.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await rc.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await rc.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(rc).toHaveCount(0);

  // Find anything from a search box: Esc puts the cursor back in that box.
  await goTo(page, 'Customers');
  const search = page.getByLabel('Search customers');
  await search.click();
  await page.keyboard.press('Control+k');
  const find = page.getByRole('dialog', { name: 'Find anything' });
  await expect(find.getByRole('combobox', { name: 'Search' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(find).toHaveCount(0);
  await expect(search).toBeFocused();

  // "/" opens it when not typing; a "/" typed in a box is just a character.
  await search.fill('');
  await search.pressSequentially('a/b');
  await expect(search).toHaveValue('a/b');
  await expect(find).toHaveCount(0);
  await search.blur();
  await page.keyboard.press('/');
  await expect(find.getByRole('combobox', { name: 'Search' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(find).toHaveCount(0);
  await page.locator('main h1').first().click();

  // Alt+A → Accounts menu, arrows move, Esc closes and focus goes back to the menu's name.
  await page.keyboard.press('Alt+a');
  const menu = page.getByRole('menu', { name: 'Accounts' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.getByRole('menubar', { name: 'Menu bar' }).getByRole('menuitem', { name: 'Accounts', exact: true })).toBeFocused();
});

test('focus is visible on buttons, fields, menu names and pills (keyboard users always see where they are)', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Alt+i');
  await page.keyboard.press('Escape');
  expect(await hasVisibleFocus(page), 'menu bar item').toBe(true);
  await goTo(page, 'Customers');
  await page.getByLabel('Search customers').focus();
  expect(await hasVisibleFocus(page), 'search box').toBe(true);
  // Tab on from the search box to the next buttons: each shows focus.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    const what = await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim().slice(0, 30));
    expect(await hasVisibleFocus(page), `focus ring on "${what}"`).toBe(true);
  }
});
