/**
 * Regressions from the purchasing & suppliers QA round (Sept 2026). The screens are covered by
 * e2e/purchasing-qa.spec.ts; these pin the store / utility behaviour behind each fix.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { seedTestUsers, signIn } from './helpers/auth';
import { matchesPurchaseInvoice } from '../utils/purchaseInvoices';
import { findByCode } from '../components/billing/CodeBox';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;

const setup = async () => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 100000, openingBankBalance: 0, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', []);
  set(
    'tradeflow_suppliers_v2',
    Array.from({ length: 6 }, (_, i) => ({ id: `s${i + 1}`, code: `S-000${i + 1}`, name: `Contact ${i + 1}`, company: `Firm ${i + 1}`, phone: `0300 111222${i}`, email: '', materialCategory: 'Oil', address: '', city: i % 2 ? 'Mardan' : 'Swat', totalOwed: 0, createdAt: '2026-01-01' }))
  );
  set('tradeflow_products_v2', [
    { id: 'p1', code: '101', name: 'Dalda Ghee 16 L Tin', category: 'Ghee', unit: 'tin', unitPricePerKg: 7000, costPricePerKg: 6000, stockKg: 0, minThresholdKg: 5, supplierId: 's1' },
    { id: 'p2', code: '102', name: 'Habib Oil 5 L Can', category: 'Oil', unit: 'can', packName: 'carton', packSize: 4, unitPricePerKg: 2400, costPricePerKg: 2000, stockKg: 0, minThresholdKg: 5, supplierId: 's2' },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_purchase_orders_v2', 'tradeflow_purchase_invoices_v1'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => {
    out = fn();
  });
  return out!;
};
const owed = (h: Hook, id: string) => h.result.current.suppliers.find((s) => s.id === id)!.totalOwed;
const ledgerOwed = (h: Hook, id: string) =>
  Math.round(h.result.current.ledger.filter((l) => l.entityType === 'supplier' && l.entityId === id).reduce((a, l) => a + l.debit - l.credit, 0) * 100) / 100;

describe('supplier payments', () => {
  it('two payments saved before a re-render (a double click) both come off the balance, like both ledger rows', async () => {
    const h = await setup();
    run(() => h.result.current.receiveStock({ productId: 'p1', qty: 5, costPrice: 6000, supplierId: 's1' }));
    expect(owed(h, 's1')).toBe(30000);
    run(() => {
      h.result.current.recordSupplierPayment('s1', 1000, 'Cash');
      h.result.current.recordSupplierPayment('s1', 1000, 'Cash');
    });
    expect(h.result.current.ledger.filter((l) => l.type === 'payment_made')).toHaveLength(2);
    expect(owed(h, 's1')).toBe(28000);
    expect(ledgerOwed(h, 's1')).toBe(28000);
  });
});

describe('stock received wording', () => {
  it('the supplier ledger says the item unit (tin), not kg', async () => {
    const h = await setup();
    run(() => h.result.current.receiveStock({ productId: 'p1', qty: 3, costPrice: 6000, supplierId: 's1' }));
    const row = h.result.current.ledger.find((l) => l.type === 'purchase_received')!;
    expect(row.description).toMatch(/: 3 tin Dalda Ghee 16 L Tin$/);
    expect(row.description).not.toMatch(/ kg /);
  });
});

describe('purchase invoice messages', () => {
  it('a one-line invoice error is a proper sentence; with several lines it names the line', async () => {
    const h = await setup();
    const one = run(() => h.result.current.createPurchaseInvoice({ supplierId: 's1', lines: [{ productId: 'p1', qty: 0, rate: 6000 }] }));
    expect(one.message).toBe('Enter the quantity of Dalda Ghee 16 L Tin.');
    const two = run(() => h.result.current.createPurchaseInvoice({ supplierId: 's1', lines: [{ productId: 'p1', qty: 1, rate: 6000 }, { productId: 'p2', qty: 4, rate: 0 }] }));
    expect(two.message).toBe('Line 2: enter the rate of Habib Oil 5 L Can.');
  });

  it('re-order with many suppliers gives a short message', async () => {
    const h = await setup();
    const rows = [1, 2, 3, 4, 5, 6].map((n) => ({ supplierId: `s${n}`, productId: n % 2 ? 'p1' : 'p2', qty: 10, rate: 100 }));
    const r = run(() => h.result.current.ordersFromReorder(rows));
    expect(r.success).toBe(true);
    expect(r.message).toBe('6 purchase orders made: PO-1 to PO-6 for 6 suppliers — see Suppliers → Orders.');
    const few = run(() => h.result.current.ordersFromReorder([{ supplierId: 's1', productId: 'p1', qty: 1, rate: 1 }]));
    expect(few.message).toBe('1 purchase order made: PO-7 (Firm 1).');
  });
});

describe('purchase invoice list search', () => {
  const inv = { invoiceNumber: 'P-12', memoNo: 'HB-4471', supplierName: 'Habib Oil Mills', lines: [{ productName: 'Habib Oil 5 L Can', code: '102' }] };
  const supplier = { code: 'S-0002', city: 'Lahore', phone: '0300 1234567', name: 'Bashir' };
  it('finds by our number, bill no., supplier name, item name', () => {
    for (const q of ['P-12', '4471', 'habib', 'oil 5 l']) expect(matchesPurchaseInvoice(inv, q, supplier), q).toBe(true);
  });
  it('finds by the supplier code (any case / spaces), city, contact, phone and the exact item code', () => {
    for (const q of ['S-0002', 's-0002', 'S - 0002', 'lahore', 'bashir', '0300 1234567', '1234567', '102']) expect(matchesPurchaseInvoice(inv, q, supplier), q).toBe(true);
  });
  it('does not match another supplier code, another city or a part of an item code', () => {
    for (const q of ['S-0003', 'Karachi', '10', 'zzz']) expect(matchesPurchaseInvoice(inv, q, supplier), q).toBe(false);
    // Without the supplier, the code cannot be known.
    expect(matchesPurchaseInvoice(inv, 'S-0002')).toBe(false);
  });
});

describe('code box lookups used by the purchase invoice', () => {
  const items = [
    { id: 's3', code: 'S-0003' },
    { id: 's22', code: 'S-0022' },
    { id: 'p11', code: '111', barcode: '896400000010' },
  ];
  it('just the number, a lower-case code, a barcode; a wrong code finds nothing', () => {
    expect(findByCode(items, '3')?.id).toBe('s3');
    expect(findByCode(items, 's-0022')?.id).toBe('s22');
    expect(findByCode(items, '896400000010')?.id).toBe('p11');
    expect(findByCode(items, '999')).toBeUndefined();
  });
});
