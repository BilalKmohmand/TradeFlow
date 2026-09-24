import { describe, it, expect } from 'vitest';
import { paymentNo, receiptNumbersIn } from '../utils/paymentNumbers';
import { fmt2, fmt2OrBlank } from '../components/billing/classic/LedgerGrid';
import type { LedgerEntry } from '../types';

const row = (patch: Partial<LedgerEntry>): LedgerEntry => ({ id: 'l', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'PAY-1', date: '2026-09-01', description: '', debit: 0, credit: 100, balanceAfter: 0, ...patch });

describe('receipt / voucher numbers of saved payments', () => {
  it('a bill payment shows its own receipt number, others the document they were posted with', () => {
    expect(paymentNo(row({ referenceId: 'INV-12', receiptNo: 'PAY-7' }))).toBe('PAY-7');
    expect(paymentNo(row({ referenceId: 'CS-3' }))).toBe('CS-3');
    expect(paymentNo(row({ referenceId: 'INV-12' }))).toBe('INV-12'); // paid with the bill (older rows)
  });
  it('the next receipt number counts receipt numbers kept on bill payments too', () => {
    const ledger = [row({ referenceId: 'PAY-1' }), row({ referenceId: 'INV-3', receiptNo: 'PAY-2' }), row({ type: 'payment_made', referenceId: 'SP-1' })];
    expect(receiptNumbersIn(ledger)).toEqual(['PAY-1', 'INV-3', 'PAY-2']);
  });
});

describe('ledger grid figures', () => {
  it('two decimals, thousands separated, blank for nothing in a Debit / Credit cell', () => {
    expect(fmt2(222000)).toBe('222,000.00');
    expect(fmt2(15500.5)).toBe('15,500.50');
    expect(fmt2OrBlank(0)).toBe('');
    expect(fmt2OrBlank(1750000)).toBe('1,750,000.00');
  });
});
