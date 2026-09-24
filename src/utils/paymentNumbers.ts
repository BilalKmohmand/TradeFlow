import type { LedgerEntry } from '../types';

/**
 * The number a saved payment is filed under — what the old program called the receipt / voucher number:
 * its own receipt number (a payment taken on a bill gets one, "PAY-7"), else the document it was posted
 * with (a Receive payment receipt, a collection sheet "CS-3", a supplier voucher, or the bill it was paid on).
 */
export const paymentNo = (l: Pick<LedgerEntry, 'referenceId' | 'receiptNo'>): string => l.receiptNo || l.referenceId || '';

/** Every receipt number already used by customer payments (so the next one never repeats). */
export const receiptNumbersIn = (ledger: LedgerEntry[]): string[] =>
  ledger.filter((l) => l.type === 'payment_received').flatMap((l) => (l.receiptNo ? [l.referenceId, l.receiptNo] : [l.referenceId]));
