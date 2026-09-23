import { describe, it, expect } from 'vitest';
import { findByCode } from '../components/billing/CodeBox';

const items = [
  { id: 's1', code: 'S-0001' },
  { id: 's2', code: 'S-0002', barcode: '8964000123456' },
  { id: 's3', code: 'ABC-12' },
  { id: 's4', code: 'X-12' },
];

describe('Code box lookup', () => {
  it('exact code, any case, spaces ignored', () => {
    expect(findByCode(items, 's-0002')?.id).toBe('s2');
    expect(findByCode(items, ' S - 0001 ')?.id).toBe('s1');
  });
  it('just the number part when only one code has it', () => {
    expect(findByCode(items, '2')?.id).toBe('s2');
    expect(findByCode(items, '0001')?.id).toBe('s1');
  });
  it('barcode', () => {
    expect(findByCode(items, '8964000123456')?.id).toBe('s2');
  });
  it('ambiguous number or unknown code picks nothing', () => {
    expect(findByCode(items, '12')).toBeUndefined(); // ABC-12 and X-12
    expect(findByCode(items, 'zzz')).toBeUndefined();
  });
});
