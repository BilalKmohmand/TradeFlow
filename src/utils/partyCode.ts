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
