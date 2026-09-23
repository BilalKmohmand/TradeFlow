/**
 * ONE way to match what staff type in a search box, used by every list and picker in the app
 * (customers, suppliers, items, bills, purchase invoices, vouchers, cheques, Find anything):
 *
 *  - any case, extra spaces and punctuation ignored ("zaman & co" finds "Zaman and Co BTK");
 *  - several words in any order, each in any field ("karim mingora" = shop name + city);
 *  - codes and numbers with or without the dash / space ("c0001" = "C-0001", "inv12" = "INV-12");
 *  - phones typed with spaces or dashes, or with +92 instead of 0 ("0300 123", "+92 300 1234567");
 *    a phone only matches 3+ digits, so a short code like "Z01" is not matched by every phone with "01";
 *  - Urdu typed on an Arabic keyboard (ي / ك / ه) finds the Urdu spelling (ی / ک / ہ), and vowel marks
 *    (zer, zabar…) are ignored.
 */

/** Text folded for comparing: lower case, Urdu letter variants unified, punctuation → one space. */
export const foldText = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[ً-ٰٟ۪-ۭ]/g, '') // Arabic / Urdu vowel marks
    .replace(/[يى]/g, 'ی') // ي ى → ی
    .replace(/ك/g, 'ک') // ك → ک
    .replace(/[هة]/g, 'ہ') // ه ة → ہ
    .replace(/[أإ]/g, 'ا') // أ إ → ا
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const squash = (s: string) => s.replace(/ /g, '');

/** Digits of a phone number, written the local way (+92 300… / 0092 300… → 0300…). */
export const phoneDigits = (s: unknown): string => {
  const d = String(s ?? '').replace(/\D/g, '');
  return d.replace(/^(0092|92)(?=3\d{9}$|\d{9,10}$)/, '0');
};

export type SearchField = string | number | null | undefined;

/**
 * Build a matcher for one query (build once, test many rows).
 *   const m = matcher(query);
 *   rows.filter((r) => m([r.name, r.code, r.company, r.city], [r.phone]))
 * An empty query matches everything.
 */
export const matcher = (query: string) => {
  const q = foldText(query);
  if (!q) return (_text: SearchField[], _phones?: SearchField[]) => true;
  const words = q.split(' ');
  const qs = squash(q);
  const raw = query.trim();
  const phoneQ = /^[\d\s\-+().]+$/.test(raw) && raw.replace(/\D/g, '').length >= 3 ? phoneDigits(raw) : '';
  return (text: SearchField[], phones: SearchField[] = []): boolean => {
    const hay = text.filter((x) => x !== null && x !== undefined && x !== '').map(foldText);
    const all = hay.join(' ');
    if (words.every((w) => all.includes(w))) return true;
    if (qs.length >= 2 && hay.some((h) => squash(h).includes(qs))) return true;
    if (phoneQ && phones.some((p) => p && phoneDigits(p).includes(phoneQ))) return true;
    return false;
  };
};

/** One-off check: does `query` match any of these fields (and, by digits, these phones)? */
export const matchesQuery = (query: string, text: SearchField[], phones: SearchField[] = []) => matcher(query)(text, phones);
