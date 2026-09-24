/**
 * The voucher screen's entry row, keyboard only, as a shopkeeper types it in Apna Accountant SB:
 *   Code → Enter → (Title) → Enter → amount → Enter → Narration → Enter (the line drops into the grid).
 *
 *   await voucherLine(page, v, '2224', { debit: '1750000' }, 'BAHL- RAHMAT ALI PESHAWAR');
 *
 * `code` may be a name instead ({ search: 'Zaman' }): F1 in Code opens "Search Code (By Title)".
 */
import { expect, Locator, Page } from '@playwright/test';

export const VOUCHER_TITLE = {
  CPV: 'Cash Payment -- [Debit Voucher]',
  CRV: 'Cash Receipt -- [Credit Voucher]',
  BPV: 'Bank Payment -- [Debit Voucher]',
  BRV: 'Bank Receipt -- [Credit Voucher]',
  JV: 'Journal Voucher',
} as const;

export async function voucherLine(page: Page, v: Locator, code: string | { search: string }, amount: { debit?: string; credit?: string }, narration = '') {
  const codeBox = v.getByLabel('Code', { exact: true });
  await codeBox.click();
  if (typeof code === 'string') {
    await codeBox.fill(code);
    await codeBox.press('Enter');
    await expect(v.getByLabel('Title', { exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
  } else {
    await codeBox.press('F1');
    const pop = page.getByRole('dialog', { name: 'Search Code (By Title)' });
    await expect(pop).toBeVisible();
    await pop.getByLabel('Search by title').fill(code.search);
    await pop.getByLabel('Search by title').press('Enter');
    await expect(pop).toHaveCount(0);
  }
  const debit = v.getByLabel('Debit', { exact: true });
  const credit = v.getByLabel('Credit', { exact: true });
  // Enter lands on the voucher's usual side (Debit for payments / JV, Credit for receipts).
  const focused = (l: Locator) => l.evaluate((el) => el === document.activeElement);
  await expect.poll(async () => (await focused(debit)) || (await focused(credit))).toBe(true);
  const first = (await focused(debit)) ? 'debit' : 'credit';
  if (first === 'debit') {
    if (amount.debit) await page.keyboard.type(amount.debit);
    await page.keyboard.press('Enter');
    if (!amount.debit) {
      await expect(credit).toBeFocused();
      await page.keyboard.type(amount.credit || '');
      await page.keyboard.press('Enter');
    }
  } else {
    if (amount.credit) await page.keyboard.type(amount.credit);
    await page.keyboard.press('Enter');
    if (!amount.credit) {
      await expect(debit).toBeFocused();
      await page.keyboard.type(amount.debit || '');
      await page.keyboard.press('Enter');
    }
  }
  await expect(v.getByLabel('Narration', { exact: true })).toBeFocused();
  if (narration) await page.keyboard.type(narration);
  await page.keyboard.press('Enter');
  // Into the grid; the entry row is empty again and Code has the cursor.
  await expect(codeBox).toBeFocused();
  await expect(codeBox).toHaveValue('');
}
