/**
 * Go to a billing screen the way a user would, on any screen size.
 *
 *   await goTo(page, 'Daily Sheet');
 *
 * Desktop: the sidebar button. Phone/tablet (billing mode): the bottom tab bar
 * (Home, Bills, Money) or, for everything else, the "More" sheet.
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
  await page.getByRole('button', { name, exact: true }).first().click();
}
