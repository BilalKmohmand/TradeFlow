/**
 * Sale Invoice helpers for the e2e specs (the form works like Apna Accountant SB: an entry row, a grid, a
 * "Print Invoice" None / Half / Full / Mini choice and Save).
 *
 *   await saveAndPrint(dialog);            // Full (A4); 'Half' = A5, 'Mini' = 80 mm thermal
 *
 * The print choice is remembered on the device; the helper puts it back to None so the next Save in the
 * same test does not print.
 */
import { Locator } from '@playwright/test';

export async function saveAndPrint(dialog: Locator, choice: 'Half' | 'Full' | 'Mini' = 'Full') {
  await dialog.getByRole('radiogroup', { name: 'Print Invoice' }).getByText(choice, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.page().evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sarmaya_print_')).forEach((k) => localStorage.removeItem(k)));
}

/**
 * One line of the Payment Method grid (Code | Title | Debit | Narration): the account by its code
 * ('1000' cash, '1010' main bank, '1011'… other banks, '1150' a customer's cheque) and the amount.
 * `keep: true` leaves it in the entry row (it still counts) instead of putting it in the grid.
 */
export async function addPayment(dialog: Locator, account: string, amount: string, opts: { note?: string; keep?: boolean } = {}) {
  await dialog.getByLabel('Payment account', { exact: true }).selectOption(account);
  await dialog.getByLabel('Paid now', { exact: true }).fill(amount);
  if (opts.note) await dialog.getByLabel('Narration', { exact: true }).fill(opts.note);
  if (!opts.keep) await dialog.getByRole('button', { name: 'Add payment line' }).click();
}
