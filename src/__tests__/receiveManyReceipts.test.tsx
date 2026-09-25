import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { seedTestUsers, signIn } from './helpers/auth';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { DEFAULT_ACCOUNTS, buildJournal, trialBalance } from '../utils/accounting';
import { collectCashMovements } from '../utils/finance';
import { paymentNo } from '../utils/paymentNumbers';
import { planDocNumbers } from '../utils/control';
import { todayISO } from '../utils/stockFlow';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

const setup = async () => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  const c = (id: string, name: string, code: string) => ({ id, name, code, company: name, phone: '', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' });
  set('tradeflow_customers_v2', [c('c1', 'Zaman Store', '101'), c('c2', 'Bismillah Traders', '102'), c('c3', 'Noor Kiryana', '103')]);
  set('tradeflow_suppliers_v2', []);
  set('tradeflow_products_v2', [{ id: 'p1', name: 'Dalda 5L tin', category: 'Oil', unit: 'tin', unitPricePerKg: 2000, costPricePerKg: 1500, stockKg: 100, minThresholdKg: 0 }]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2', 'tradeflow_quotations_v2', 'tradeflow_agreed_rates_v1'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => { out = fn(); });
  return out!;
};
const balanced = (h: Hook) => {
  const t = h.result.current;
  const j = buildJournal({ settings: t.settings, customers: t.customers, suppliers: t.suppliers, ledger: t.ledger, invoices: t.invoices, dispatches: t.dispatches, purchases: t.purchases, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, returns: t.returns, adjustments: t.adjustments });
  expect(trialBalance(j, DEFAULT_ACCOUNTS, today).balanced).toBe(true);
};
const bill = (h: Hook, customerId: string, qty: number) => {
  const r = run(() => h.result.current.createBill({ customerId, items: [{ productId: 'p1', name: 'Dalda 5L tin', qty, unitPrice: 2000 }] } as any));
  expect(r.success, r.message).toBe(true);
};
const threeLines = () => [
  { customerId: 'c1', amount: 1000, method: 'Cash', note: 'first' },
  { customerId: 'c2', amount: 2000, method: 'Bank Transfer' },
  { customerId: 'c3', amount: 3000, method: 'Cash' },
];

beforeEach(() => localStorage.clear());

describe('Receive from many: a voucher number for the sheet and a receipt number per line', () => {
  it('3 lines get consecutive receipt numbers after an existing PAY number; the sheet keeps CS-n', async () => {
    const h = await setup();
    bill(h, 'c1', 5);
    bill(h, 'c2', 5);
    bill(h, 'c3', 5);
    const pay = run(() => h.result.current.recordCustomerPayment('c1', 500, 'Cash'))!;
    expect(pay.referenceId).toBe('PAY-1');

    // The preview shows what each line will get, and uses nothing up.
    expect(h.result.current.previewReceiptNos(3)).toEqual(['PAY-2', 'PAY-3', 'PAY-4']);
    expect(h.result.current.previewReceiptNos(3)).toEqual(['PAY-2', 'PAY-3', 'PAY-4']);
    expect(h.result.current.nextCollectionNo()).toBe('CS-1');

    const r = run(() => h.result.current.receiveMany({ rows: threeLines() }));
    expect(r.success, r.message).toBe(true);
    expect(r.sheetNo).toBe('CS-1');
    expect(r.receiptNos).toEqual(['PAY-2', 'PAY-3', 'PAY-4']);
    expect(r.message).toMatch(/PAY-2 to PAY-4/);

    const rows = r.ledgerIds!.map((id) => h.result.current.ledger.find((l) => l.id === id)!);
    expect(rows.map((l) => l.referenceId)).toEqual(['CS-1', 'CS-1', 'CS-1']);
    expect(rows.map((l) => l.receiptNo)).toEqual(['PAY-2', 'PAY-3', 'PAY-4']);
    expect(rows.map((l) => l.entityId)).toEqual(['c1', 'c2', 'c3']);
    // Customer lists and the cash book show the line's own receipt number.
    expect(rows.map(paymentNo)).toEqual(['PAY-2', 'PAY-3', 'PAY-4']);
    const t = h.result.current;
    const refs = collectCashMovements(t.ledger, t.expenses, t.cashEntries, t.customers, t.suppliers).filter((m) => r.ledgerIds!.includes(m.sourceId || '')).map((m) => m.reference).sort();
    expect(refs).toEqual(['PAY-2', 'PAY-3', 'PAY-4']);
    // The sheet is still listed (and undone) as one voucher.
    expect(h.result.current.collectionSheets.map((s) => s.id)).toEqual(['CS-1']);
    // The next Receive payment continues after the collection.
    expect(h.result.current.previewDocNumber('receipt')).toBe('PAY-5');
    balanced(h);
  });

  it('undo collection and delete do not bring a receipt number back', async () => {
    const h = await setup();
    bill(h, 'c1', 5);
    bill(h, 'c2', 5);
    bill(h, 'c3', 5);
    run(() => h.result.current.recordCustomerPayment('c1', 500, 'Cash'));
    const first = run(() => h.result.current.receiveMany({ rows: threeLines() }));
    expect(first.receiptNos).toEqual(['PAY-2', 'PAY-3', 'PAY-4']);
    const dueBefore = h.result.current.customers.find((c) => c.id === 'c2')!.totalDue;

    const u = run(() => h.result.current.undoCollection('CS-1'));
    expect(u.success, u.message).toBe(true);
    expect(h.result.current.ledger.some((l) => l.receiptNo === 'PAY-2')).toBe(false);
    expect(h.result.current.customers.find((c) => c.id === 'c2')!.totalDue).toBe(dueBefore + 2000);
    balanced(h);

    // Numbers taken by the undone sheet are never given again.
    expect(h.result.current.previewReceiptNos(2)).toEqual(['PAY-5', 'PAY-6']);
    const again = run(() => h.result.current.receiveMany({ rows: threeLines().slice(0, 2) }));
    expect(again.success, again.message).toBe(true);
    expect(again.receiptNos).toEqual(['PAY-5', 'PAY-6']);
    const all = h.result.current.ledger.filter((l) => l.type === 'payment_received').map(paymentNo);
    expect(new Set(all).size).toBe(all.length);
    balanced(h);

    // Delete the last line (PAY-6): its number is not given again either.
    run(() => h.result.current.deleteLedgerEntry(again.ledgerIds![1]));
    expect(h.result.current.ledger.some((l) => l.receiptNo === 'PAY-6')).toBe(false);
    balanced(h);

    // A single Receive payment after that carries on.
    const next = run(() => h.result.current.recordCustomerPayment('c3', 100, 'Cash'))!;
    expect(next.referenceId).toBe('PAY-7');
    balanced(h);
  });

  it('editing a line keeps its receipt number', async () => {
    const h = await setup();
    bill(h, 'c1', 5);
    bill(h, 'c2', 5);
    const r = run(() => h.result.current.receiveMany({ rows: [{ customerId: 'c1', amount: 1000, method: 'Cash' }, { customerId: 'c2', amount: 2000, method: 'Cash' }] }));
    const id = r.ledgerIds![1];
    const e = run(() => h.result.current.editPayment(id, { amount: 1500, method: 'Bank Transfer' }));
    expect(e.success, e.message).toBe(true);
    const row = h.result.current.ledger.find((l) => l.id === id)!;
    expect(row.receiptNo).toBe('PAY-2');
    expect(row.referenceId).toBe('CS-1');
    expect(row.credit).toBe(1500);
    balanced(h);
  });

  it('planDocNumbers previews a run of numbers after the highest one used', () => {
    expect(planDocNumbers({}, 'receipt', '2026-09-01', ['PAY-1', 'PAY-3'], 3)).toEqual(['PAY-4', 'PAY-5', 'PAY-6']);
    expect(planDocNumbers({ docCounters: { receipt: 9 } }, 'receipt', '2026-09-01', [], 2)).toEqual(['PAY-10', 'PAY-11']);
    expect(planDocNumbers({}, 'receipt', '2026-09-01', [], 0)).toEqual([]);
  });
});
