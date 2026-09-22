/**
 * Go to a billing screen the way a user would, on any screen size.
 *
 *   await goTo(page, 'Daily Sheet');
 *
 * Desktop: the sidebar button (the top menu bar's five menus are role="menuitem", so they never clash).
 * Phone/tablet (billing mode): the bottom tab bar (Home, Bills, Money) or, for everything else, the
 * "More" sheet. To open a menu option instead, see openMenuOption below.
 * Screen names: Home, Bills, Daily Sheet, Money, Accounts, Customers, Suppliers, Items & Prices, Admin.
 */
import { expect, Page } from '@playwright/test';

export async function goTo(page: Page, name: string) {
  const bar = page.getByRole('navigation', { name: 'Main' });
  if (await bar.isVisible()) {
    const tab = bar.getByRole('button', { name, exact: true });
    if (await tab.count()) {
      await tab.click();
      return;
    }
    await bar.getByRole('button', { name: 'More', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name, exact: true }).click();
    await expect(sheet).toBeHidden();
    return;
  }
  const side = page.getByRole('complementary', { name: 'Primary' }).getByRole('button', { name, exact: true });
  if (await side.count()) {
    await side.first().click();
    return;
  }
  await page.getByRole('button', { name, exact: true }).first().click();
}

/** Desktop top menu bar: open a group (Coding, Invoice, Accounts, Reports, System) and click one option. */
export async function openMenuOption(page: Page, group: string, option: string) {
  await page.getByRole('menubar', { name: 'Menu bar' }).getByRole('menuitem', { name: group, exact: true }).click();
  const menu = page.getByRole('menu', { name: group });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: option, exact: true }).click();
  await expect(menu).toBeHidden();
}
