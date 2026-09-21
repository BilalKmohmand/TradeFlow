import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { creditCheck, creditUsage, customersOverLimit } from '../utils/credit';
import { seedTestUsers, signIn, OPERATOR, OWNER } from './helpers/auth';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;

/** Customer c1 owes Rs. 8,000 against a Rs. 10,000 limit; c2 has no limit. One item at Rs. 1,000. */
const setup = async (as: 'admin' | 'operator' = 'admin') => {
  localStorage.setItem('tradeflow_customers_v2', JSON.stringify([
    { id: 'c1', name: 'Limited Traders', company: 'Limited Traders', phone: '0300', email: '', address: '', totalDue: 8000, creditLimit: 10000, createdAt: '2026-01-01' },
    { id: 'c2', name: 'Open Account', company: 'Open Account', phone: '0301', email: '', address: '', totalDue: 500000, creditLimit: 0, createdAt: '2026-01-01' },
  ]));
  localStorage.setItem('tradeflow_products_v2', JSON.stringify([{ id: 'p1', name: 'Oil tin', category: 'General', unit: 'tin', unitPricePerKg: 1000, stockKg: 500, minThresholdKg: 0 }]));
  localStorage.setItem('tradeflow_invoices_v1', '[]');
  localStorage.setItem('tradeflow_ledger_v2', '[]');
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, as === 'admin' ? undefined : OPERATOR);
  act(() => hook.result.current.updateSettings({ taxRatePct: 0 }));
  return hook;
};
const item = (qty: number) => [{ productId: 'p1', name: 'Oil tin', qty, unitPrice: 1000 }];

beforeEach(() => localStorage.clear());

describe('creditCheck (pure)', () => {
  it('limit 0 means no limit', async () => {
    const c = creditCheck({ totalDue: 1e9, creditLimit: 0 }, 1e6);
    expect(c.hasLimit).toBe(false);
    expect(c.over).toBe(false);
  });
  it('flags when owes + unpaid part goes over, and reports what is available', async () => {
    const c = creditCheck({ totalDue: 8000, creditLimit: 10000 }, 3000);
    expect(c.available).toBe(2000);
    expect(c.after).toBe(11000);
    expect(c.over).toBe(true);
    expect(c.exceededBy).toBe(1000);
    expect(creditCheck({ totalDue: 8000, creditLimit: 10000 }, 2000).over).toBe(false); // exactly at the limit is fine
  });
  it('a fully paid bill never trips the limit, even for a customer already over', async () => {
    expect(creditCheck({ totalDue: 15000, creditLimit: 10000 }, 0).over).toBe(false);
  });
  it('usage and over-limit list', async () => {
    expect(creditUsage({ totalDue: 8000, creditLimit: 10000 }).pct).toBe(80);
    expect(creditUsage({ totalDue: 12000, creditLimit: 10000 }).over).toBe(true);
    expect(creditUsage({ totalDue: 12000, creditLimit: 0 }).over).toBe(false);
    const list = customersOverLimit([
      { id: 'a', totalDue: 11000, creditLimit: 10000 },
      { id: 'b', totalDue: 9000, creditLimit: 10000 },
      { id: 'c', totalDue: 50000, creditLimit: 20000 },
      { id: 'd', totalDue: 50000, creditLimit: 0 },
    ]);
    expect(list.map((c) => c.id)).toEqual(['c', 'a']);
  });
});

describe('createBill credit limit', () => {
  it('blocks a bill that takes the customer over the limit', async () => {
    const { result } = await setup();
    let r: ReturnType<typeof result.current.createBill> | undefined;
    act(() => { r = result.current.createBill({ customerId: 'c1', items: item(3), paidNow: 0 }); });
    expect(r?.success).toBe(false);
    expect(r?.message).toMatch(/over their credit limit/);
    expect(result.current.invoices).toHaveLength(0);
    expect(result.current.customers.find((c) => c.id === 'c1')!.totalDue).toBe(8000);
  });

  it('allows a bill that stays under the limit', async () => {
    const { result } = await setup();
    let r: ReturnType<typeof result.current.createBill> | undefined;
    act(() => { r = result.current.createBill({ customerId: 'c1', items: item(2), paidNow: 0 }); });
    expect(r?.success).toBe(true);
    expect(result.current.customers.find((c) => c.id === 'c1')!.totalDue).toBe(10000);
    expect(result.current.invoices[0].creditOverride).toBeUndefined();
  });

  it('money paid now reduces the credit used', async () => {
    const { result } = await setup();
    let r: ReturnType<typeof result.current.createBill> | undefined;
    // Rs. 5,000 bill, Rs. 3,000 paid now → only Rs. 2,000 on credit → exactly at the limit.
    act(() => { r = result.current.createBill({ customerId: 'c1', items: item(5), paidNow: 3000, paymentMethod: 'Cash' }); });
    expect(r?.success).toBe(true);
    expect(result.current.customers.find((c) => c.id === 'c1')!.totalDue).toBe(10000);
  });

  it('limit 0 means no limit', async () => {
    const { result } = await setup();
    let r: ReturnType<typeof result.current.createBill> | undefined;
    act(() => { r = result.current.createBill({ customerId: 'c2', items: item(400), paidNow: 0 }); });
    expect(r?.success).toBe(true);
  });

  it('override works for a user with permission, needs a reason, and records it on the bill and in the audit log', async () => {
    const { result } = await setup('admin');
    let r: ReturnType<typeof result.current.createBill> | undefined;
    act(() => { r = result.current.createBill({ customerId: 'c1', items: item(3), allowOverLimit: true, overrideReason: '  ' }); });
    expect(r?.success).toBe(false);
    expect(r?.message).toMatch(/reason/i);
    act(() => { r = result.current.createBill({ customerId: 'c1', items: item(3), allowOverLimit: true, overrideReason: 'Pays every Friday' }); });
    expect(r?.success).toBe(true);
    const inv = result.current.invoices[0];
    expect(inv.creditOverride).toMatchObject({ by: OWNER.name, reason: 'Pays every Friday', limit: 10000, dueAfter: 11000 });
    expect(result.current.customers.find((c) => c.id === 'c1')!.totalDue).toBe(11000);
    const log = result.current.auditLogs.find((l) => l.action === 'Credit Limit Overridden');
    expect(log?.details).toContain('Pays every Friday');
    expect(log?.details).toContain(inv.invoiceNumber);
  });

  it('override is refused for a user without the override_credit permission', async () => {
    const { result } = await setup('operator');
    expect(result.current.can('override_credit')).toBe(false);
    let r: ReturnType<typeof result.current.createBill> | undefined;
    act(() => { r = result.current.createBill({ customerId: 'c1', items: item(3), allowOverLimit: true, overrideReason: 'Please' }); });
    expect(r?.success).toBe(false);
    expect(r?.message).toMatch(/manager or admin/);
    expect(result.current.invoices).toHaveLength(0);
  });
});
