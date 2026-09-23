/**
 * One way to search the master lists (items, customers, suppliers): forgiving about case, spaces, Urdu
 * keyboards and word order.
 *
 *  - Urdu typed on an Arabic keyboard (ي ك ه ة) finds names written with the Urdu letters (ی ک ہ), and
 *    the vowel marks (zer, zabar, pesh…) and tatweel are ignored.
 *  - Urdu / Arabic digits (۱۲۳ / ١٢٣) are read as 1 2 3.
 *  - Every word of the search must be found somewhere (in any field, in any order), so "sufi 16" finds
 *    "Sufi Banaspati 16 kg" and "ghee dalda" finds a Dalda item in the Ghee group.
 *  - A word also matches with the spaces / dashes left out, so "SF16" finds code "SF-16" and "sf 16" does too.
 */

const ARABIC_TO_URDU: Record<string, string> = {
  'ي': 'ی', // Arabic yeh
  'ى': 'ی', // alef maksura
  'ئ': 'ی', // yeh with hamza (search as plain yeh)
  'ك': 'ک', // Arabic kaf
  'ه': 'ہ', // Arabic heh
  'ة': 'ہ', // teh marbuta
  'ۃ': 'ہ', // teh marbuta goal
  'ۀ': 'ہ',
  'أ': 'ا',
  'إ': 'ا',
  'ٱ': 'ا',
  'ؤ': 'و',
};

/** Text folded for comparing: lower case, Urdu letters unified, marks dropped, digits as 0-9, single spaces. */
export const foldText = (s: string | number | null | undefined): string => {
  let t = String(s ?? '').normalize('NFKC').toLowerCase();
  // Arabic-Indic (٠-٩) and Extended Arabic-Indic / Urdu (۰-۹) digits.
  t = t.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  // Vowel marks, superscript alef, Quranic marks and tatweel.
  t = t.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '');
  t = t.replace(/[يىئكهةۃۀأإٱؤ]/g, (c) => ARABIC_TO_URDU[c] || c);
  return t.replace(/\s+/g, ' ').trim();
};

/** The same, with spaces, dashes, dots and slashes left out ("SF-16 / A" → "sf16a"). */
const compact = (s: string) => s.replace(/[\s\-_./\\]+/g, '');

/** The words of a search, folded. Empty = no search. */
export const searchWords = (query: string): string[] => foldText(query).split(' ').filter(Boolean);

/**
 * True when every word of `query` is found in at least one of `fields` (empty query = true).
 * Pass the fields already folded with foldText when searching many rows (see `searchHaystack`).
 */
export const matchesWords = (words: string[], haystack: string): boolean => {
  if (words.length === 0) return true;
  const flat = compact(haystack);
  return words.every((w) => haystack.includes(w) || flat.includes(compact(w)));
};

/** All the searchable fields of a row as one folded string (fields are kept apart by a separator). */
export const searchHaystack = (fields: (string | number | null | undefined)[]): string =>
  fields.map(foldText).filter(Boolean).join(' | ');

/** One-off check: does this row (its fields) match the search? */
export const matchesSearch = (query: string, fields: (string | number | null | undefined)[]): boolean =>
  matchesWords(searchWords(query), searchHaystack(fields));

/** Case- and Urdu-insensitive equality, for filters (brand "habib" is the same as "Habib"). */
export const sameText = (a: string | null | undefined, b: string | null | undefined): boolean => foldText(a) === foldText(b);
