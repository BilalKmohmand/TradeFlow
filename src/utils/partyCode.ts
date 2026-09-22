/** The shop's own customer / supplier IDs (codes from their old books or department). */

const norm = (s: string) => s.trim().toLowerCase();

/** The other party already using this code, if any (case-insensitive; empty codes never clash). */
export const codeTaken = <T extends { id: string; code?: string; name?: string; company?: string }>(parties: T[], code: string, selfId?: string): T | undefined => {
  const c = norm(code || '');
  if (!c) return undefined;
  return parties.find((p) => p.id !== selfId && p.code && norm(p.code) === c);
};

/** True when a search text matches the party's code exactly or as a prefix. */
export const codeMatches = (code: string | undefined, q: string): boolean => !!code && !!q && norm(code).startsWith(norm(q));

export const CUSTOMER_CODE_PREFIX = 'C-';
export const SUPPLIER_CODE_PREFIX = 'S-';

/** Highest number already used after `prefix` (e.g. C-0007 → 7), ignoring hand-typed codes in other styles. */
const highest = (parties: { code?: string }[], prefix: string): number => {
  const re = new RegExp(`^${prefix.replace(/[-]/g, '\\-')}(\\d+)$`, 'i');
  return parties.reduce((m, p) => {
    const hit = re.exec((p.code || '').trim());
    return hit ? Math.max(m, parseInt(hit[1], 10)) : m;
  }, 0);
};

/** The next automatic ID: C-0001, C-0002 … (never reuses a higher number already taken). */
export const nextPartyCode = (parties: { code?: string }[], prefix: string): string =>
  `${prefix}${String(highest(parties, prefix) + 1).padStart(4, '0')}`;

/**
 * Give every party without an ID the next automatic one, oldest first (by createdAt, then id), so
 * every device numbers the same records the same way. Returns the same array when nothing changes.
 */
export const assignMissingCodes = <T extends { id: string; code?: string; createdAt?: string }>(parties: T[], prefix: string): T[] => {
  const missing = parties.filter((p) => !(p.code || '').trim());
  if (missing.length === 0) return parties;
  let n = highest(parties, prefix);
  const order = [...missing].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
  const codes = new Map(order.map((p) => [p.id, `${prefix}${String(++n).padStart(4, '0')}`]));
  return parties.map((p) => (codes.has(p.id) ? { ...p, code: codes.get(p.id) } : p));
};
