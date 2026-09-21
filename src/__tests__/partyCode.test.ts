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
