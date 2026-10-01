import { describe, it, expect } from 'vitest';
import { accountLedger, custRef, suppRef } from '../utils/vouchers';
import type { Customer, Invoice, LedgerEntry, Purchase, PurchaseInvoice, Supplier } from '../types';

/** The Account Ledger in the old program's format: one row per bill with its products, OB with Debit / Credit, Grand Total. */
const led = (x: Partial<LedgerEntry>): LedgerEntry => ({ id: Math.random().toString(36), entityType: 'supplier', entityId: 's1', type: 'purchase_received', referenceId: '', date: '2026-09-30', description: '', debit: 0, credit: 0, balanceAfter: 0, ...x }) as LedgerEntry;
const base = { journal: [], accounts: [] };

describe('account ledger, old format', () => {
  it('supplier: a purchase invoice is one row under its own number with every product; opening balance sits in the OB row', () => {
    const supplier = { id: 's1', name: 'MG', company: 'MG EDIBLE OIL', code: 'S-0001', totalOwed: 2000 + 3000 + 500 - 4000 } as unknown as Supplier;
    const purchases = [{ id: 'pu1', receiptNumber: 'GRN-1' }, { id: 'pu2', receiptNumber: 'GRN-2' }] as Purchase[];
    const purchaseInvoices = [{ id: 'pi1', invoiceNumber: 'P-3', memoNo: '20', lines: [
      { id: 'l1', productId: 'a', productName: '5 Kg Tin', unit: 'pcs', qty: 2, rate: 1500, amount: 3000, landedRate: 1500, purchaseId: 'pu1' },
      { id: 'l2', productId: 'b', productName: '14 KG TIN', unit: 'pcs', qty: 1, rate: 500, amount: 500, landedRate: 500, purchaseId: 'pu2' },
    ] }] as unknown as PurchaseInvoice[];
    // Newest first, as the app keeps it.
    const ledger = [
      led({ type: 'payment_made', referenceId: 'SUP-PAY-4', description: 'Supplier payment made: Cash', credit: 4000 }),
      led({ type: 'purchase_received', referenceId: 'GRN-2', description: 'x', debit: 500 }),
      led({ type: 'purchase_received', referenceId: 'GRN-1', description: 'x', debit: 3000 }),
      led({ type: 'opening_balance', referenceId: 'OB', description: 'Opening balance', debit: 2000 }),
    ];
    const rep = accountLedger(suppRef('s1'), '2026-09-01', '2026-10-01', { ...base, customers: [], suppliers: [supplier], ledger, purchases, purchaseInvoices });
    expect(rep.openingCredit).toBe(2000);
    expect(rep.opening).toBe(-2000);
    expect(rep.rows.map((r) => r.ref)).toEqual(['P-3', 'SUP-PAY-4']); // entry order within the day; no GRN rows
    expect(rep.rows[0].narration).toBe('Purchase bill P-3 (bill 20) Product:5 Kg Tin Qty:2.00, @1500.00- Product:14 KG TIN Qty:1.00, @500.00');
    expect(rep.rows[0].credit).toBe(3500);
    expect(rep.rows[0].balance).toBe(-5500);
    expect(rep.rows[1].balance).toBe(-1500);
    expect([rep.grandDebit, rep.grandCredit, rep.closing]).toEqual([4000, 5500, -1500]);
  });

  it('customer: a sale bill row lists its products; rows before the period are in OB as Debit and Credit', () => {
    const customer = { id: 'c1', name: 'Amin Khan', totalDue: 10000 - 4000 + 2350 - 1000 } as unknown as Customer;
    const invoices = [{ id: 'i2', invoiceNumber: 'S-14592', items: [{ productId: 'a', productName: 'Local 2.5kg Daba', qty: 2, unitPrice: 1175 }] }] as unknown as Invoice[];
    const ledger = [
      led({ entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'S-14592', receiptNo: 'CRV-1171', date: '2026-09-15', description: '3079', credit: 1000 }),
      led({ entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'S-14592', sourceId: 'i2', date: '2026-09-09', description: 'Bill', debit: 2350 }),
      led({ entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'CRV-1', date: '2026-08-20', description: 'old', credit: 4000 }),
      led({ entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'S-1', sourceId: 'i1', date: '2026-08-10', description: 'old bill', debit: 10000 }),
    ];
    const rep = accountLedger(custRef('c1'), '2026-09-01', '2026-10-01', { ...base, customers: [customer], suppliers: [], ledger, invoices });
    expect([rep.openingDebit, rep.openingCredit, rep.opening]).toEqual([10000, 4000, 6000]);
    expect(rep.rows[0]).toMatchObject({ ref: 'S-14592', narration: 'Sale bill S-14592 Product:Local 2.5kg Daba Qty:2.00, @1175.00', debit: 2350, balance: 8350 });
    expect(rep.rows[1]).toMatchObject({ ref: 'CRV-1171', credit: 1000, balance: 7350 });
    expect([rep.grandDebit, rep.grandCredit]).toEqual([12350, 5000]);
  });
});
