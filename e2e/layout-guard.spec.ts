import { test, expect, Page } from '@playwright/test';
import { signIn, OWNER } from './helpers/login';
import { bigShop } from './helpers/bigShop';
import { layoutProblems, describeProblems, LayoutProblem } from './helpers/layoutGuard';
import { NAV_GROUPS, NavEntry, navCheck } from '../src/utils/navMap';

/**
 * LAYOUT GUARD — every screen and every dialog of the nav map, at the five screen sizes the shop uses, with
 * a big realistic shop (40 customers with Urdu and very long names, 30 items, 60 bills, 3 banks…).
 * Fails when anything a user would call broken shows up (see helpers/layoutGuard.ts):
 *   a number / code / date box too narrow for a realistic value, a number box under 72px, a drop-down that
 *   cuts a short choice, sideways page scroll, a dialog that doesn't fit the window, a control hidden under
 *   the header or the bottom tab bar, a short button label broken over lines.
 * A new nav-map entry is checked automatically.
 */
const SIZES: { name: string; width: number; height: number; phone?: boolean }[] = [
  { name: 'desktop 1360×900', width: 1360, height: 900 },
  { name: 'laptop 1280×720', width: 1280, height: 720 },
  { name: 'tablet 820×1180', width: 820, height: 1180 },
  { name: 'phone 390×844', width: 390, height: 844, phone: true },
  { name: 'small phone 360×740', width: 360, height: 740, phone: true },
];

const entries = NAV_GROUPS.flatMap((g) => g.sections.flatMap((s) => s.entries.map((e) => ({ e, g })))).filter(({ e }) => !navCheck(e).special);

async function closeAll(page: Page) {
  for (let i = 0; i < 4 && (await page.getByRole('dialog').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
}

/** Open an option the way a user at this size would: the top menu bar (lg and up) or the More sheet. */
async function openEntry(page: Page, e: NavEntry, groupLabel: string, groupId: string) {
  const bar = page.getByRole('navigation', { name: 'Main' });
  if (await bar.isVisible()) {
    await bar.getByRole('button', { name: 'More', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet).toBeVisible();
    const group = sheet.getByRole('group', { name: groupLabel });
    if (!(await group.isVisible())) await sheet.getByTestId(`more-group-${groupId}`).click();
    await group.getByRole('button', { name: e.label, exact: true }).first().click();
    await expect(sheet).toBeHidden();
  } else {
    await page.getByRole('menubar', { name: 'Menu bar' }).getByRole('menuitem', { name: groupLabel, exact: true }).click();
    const menu = page.getByRole('menu', { name: groupLabel });
    await menu.getByRole('menuitem', { name: e.label, exact: true }).click();
    await expect(menu).toBeHidden();
  }
  await page.waitForTimeout(350); // dialogs slide in over 180ms; lists render
}

for (const size of SIZES) {
  test.describe(`Layout guard at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: Boolean(size.phone), hasTouch: Boolean(size.phone) });
    test('no squeezed numbers, no sideways scroll, nothing under the bars, every dialog fits', async ({ page }) => {
      test.setTimeout(420_000);
      await page.addInitScript(bigShop);
      await signIn(page, OWNER);
      await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({ timeout: 15_000 });
      const found: string[] = [];
      const check = async (label: string) => {
        const p: LayoutProblem[] = await layoutProblems(page);
        if (p.length) found.push(`— ${label}\n${describeProblems(p)}`);
      };
      await check('Home');
      for (const { e, g } of entries) {
        await test.step(`${g.label} › ${e.label}`, async () => {
          await openEntry(page, e, g.label, g.id);
          await check(`${g.label} › ${e.label}`);
          await closeAll(page);
        });
      }
      expect(found, `layout problems at ${size.name}:\n${found.join('\n')}`).toEqual([]);
    });
  });
}

test.describe('Layout guard: the busiest dialogs filled in, on the smallest phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  test('New Bill with three long lines, a voucher with lines, Receive payment with a customer: all readable', async ({ page }) => {
    await page.addInitScript(bigShop);
    await signIn(page, OWNER);
    const bar = page.getByRole('navigation', { name: 'Main' });
    await bar.getByRole('button', { name: 'New bill' }).click();
    const bill = page.getByRole('dialog', { name: 'New Bill' });
    await expect(bill).toBeVisible();
    await bill.getByLabel('Customer code').fill('C-0005');
    await bill.getByLabel('Customer code').press('Enter');
    await expect(bill.getByLabel('Customer', { exact: true })).toHaveValue('c5');
    for (let i = 1; i <= 3; i++) {
      if (i > 1) await bill.getByRole('button', { name: /Add another item/ }).click();
      await bill.getByLabel(`Item code ${i}`).fill(String(100 + i * 9));
      await bill.getByLabel(`Item code ${i}`).press('Enter');
      await bill.getByLabel(`Quantity ${i}`, { exact: true }).fill('1250');
      await bill.getByLabel(`Price ${i}`, { exact: true }).fill('7250.50');
    }
    await bill.getByLabel('Paid now', { exact: true }).fill('1250000');
    expect(describeProblems(await layoutProblems(page))).toBe('');
    await closeAll(page);

    await bar.getByRole('button', { name: 'Money', exact: true }).click();
    await page.getByRole('button', { name: 'Receive payment' }).first().click();
    const rc = page.getByRole('dialog', { name: 'Receive payment' });
    await rc.getByLabel('Party code').fill('3');
    await rc.getByLabel('Party code').press('Enter');
    await expect(rc.getByLabel('Customer', { exact: true })).toHaveValue('c3');
    await expect(rc.getByLabel('Amount (Rs.)')).toBeFocused();
    await rc.getByLabel('Amount (Rs.)').fill('1250000');
    expect(describeProblems(await layoutProblems(page))).toBe('');
  });
});
