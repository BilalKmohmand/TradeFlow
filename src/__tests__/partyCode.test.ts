import { describe, it, expect } from 'vitest';
import { codeTaken, codeMatches } from '../utils/partyCode';

const parties = [
  { id: 'c1', name: 'Haji Karim', code: 'C-215' },
  { id: 'c2', name: 'Gul Traders' },
];

describe('customer / supplier IDs', () => {
  it('finds a clash ignoring case and spaces', () => {
    expect(codeTaken(parties, ' c-215 ')?.id).toBe('c1');
  });
  it('does not clash with itself when editing', () => {
    expect(codeTaken(parties, 'C-215', 'c1')).toBeUndefined();
  });
  it('empty codes never clash', () => {
    expect(codeTaken(parties, '')).toBeUndefined();
    expect(codeTaken(parties, '   ')).toBeUndefined();
  });
  it('matches search by prefix', () => {
    expect(codeMatches('C-215', 'c-2')).toBe(true);
    expect(codeMatches(undefined, 'c')).toBe(false);
  });
});

import { nextPartyCode, assignMissingCodes } from '../utils/partyCode';

describe('automatic customer / supplier IDs', () => {
  it('numbers after the highest C-number, ignoring hand-typed codes in other styles', () => {
    expect(nextPartyCode([], 'C-')).toBe('C-0001');
    expect(nextPartyCode([{ code: 'C-0007' }, { code: 'ABC' }, { code: 'c-0002' }], 'C-')).toBe('C-0008');
  });
  it('gives missing IDs oldest first and leaves existing ones alone', () => {
    const list = [
      { id: 'b', createdAt: '2026-02-01' },
      { id: 'a', createdAt: '2026-01-01' },
      { id: 'c', createdAt: '2026-03-01', code: 'C-0005' },
    ];
    const out = assignMissingCodes(list, 'C-');
    expect(out.map((p) => p.code)).toEqual(['C-0007', 'C-0006', 'C-0005']);
    expect(assignMissingCodes(out, 'C-')).toBe(out); // nothing to do → same array
  });
});
