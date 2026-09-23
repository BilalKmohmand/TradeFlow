/**
 * Sales QA regressions: the Code box lookup with a name fallback, bills search (customer code, amount),
 * printed paisa, and a return refunded through the second bank posting to that bank.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, act, render, fireEvent, screen } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { seedTestUsers, signIn } from './helpers/auth';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { buildJournal, trialBalance, mergeAccounts } from '../utils/accounting';
import { filterBills } from '../utils/billing';
import { formatAmount } from '../utils/formatters';
import { lineDiscountLabel } from '../utils/salesDocs';
import { CodeBox } from '../components/billing/CodeBox';
import { bidi } from '../components/billing/ui';
import type { Invoice } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

describe('printed money keeps its paisa', () => {
  it('whole rupees without decimals, otherwise always two', () => {
    expect(formatAmount(12339691.5)).toBe('12,339,691.50');
    expect(formatAmount(1192150)).toBe('1,192,150');
    expect(formatAmount(0.1 + 0.2)).toBe('0.30');
    expect(lineDiscountLabel({ discountType: 'rs', discountValue: 150.5, discountAmount: 150.5 })).toBe('Rs. 150.50');
  });
  it('an Urdu name is isolated so it cannot scramble the English around it', () => {
    expect(bidi('حاجی')).toBe('⁨حاجی⁩');
    expect(bidi('')).toBe('');
  });
});

describe('bills search', () => {
  const bill = (id: string, patch: Partial<Invoice>): Invoice => ({
    id, invoiceNumber: `INV-${id}`, customerId: 'c1', customerName: 'Zaman and Co', items: [{ id: `${id}-1`, productId: 'p1', productName: 'Dalda tin', kg: 1, qty: 1, ratePerKg: 100, unitPrice: 100, amount: 100 }],
    issueDate: today, dueDate: today, subtotal: 100, taxRatePct: 0, taxAmount: 0, totalAmount: 100, paidAmount: 0, balanceDue: 100, status: 'issued', paymentStatus: 'unpaid', createdAt: today, billKind: 'credit', ...patch,
  } as unknown as Invoice);
  const rows = [bill('1', { customerId: 'c4', totalAmount: 12345678.5, balanceDue: 45678.5 }), bill('2', { issueDate: shiftDate(today, -40) })];
  const codes = new Map([['c4', 'C-0004'], ['c1', 'C-0001']]);
  it('finds a customer by code and a bill by its total or balance (with or without commas / Rs.)', () => {
    const f = (q: string) => filterBills(rows, q, 'all', today, false, (id) => codes.get(id)).map((i) => i.id);
    expect(f('c-0004')).toEqual(['1']);
    expect(f('12,345,678.50')).toEqual(['1']);
    expect(f('Rs. 45678.5')).toEqual(['1']);
    expect(f('C-0001')).toEqual(['2']);
    expect(f('99')).toEqual([]);
  });
});

describe('Code box', () => {
  const items = [{ id: 'p1', code: '101' }, { id: 'p2', code: '102', barcode: '8964000000021' }];
  const Harness = ({ onPick, onEnter }: { onPick: (id: string) => void; onEnter?: (id: string | undefined, t: string) => void }) => {
    const [v, setV] = React.useState('');
    return <CodeBox id="c" label="Code" items={items} value={v} onPick={(id) => { setV(id); onPick(id); }} fallback={(t) => (t.toLowerCase().startsWith('hab') ? 'p2' : undefined)} onEnter={onEnter} />;
  };
  it('Enter picks once (leaving the box afterwards does not pick again); a name falls back; an unknown code says so', () => {
    const picks: string[] = [];
    const enters: (string | undefined)[] = [];
    render(<Harness onPick={(id) => picks.push(id)} onEnter={(id) => enters.push(id)} />);
    const box = screen.getByLabelText('Code') as HTMLInputElement;
    fireEvent.change(box, { target: { value: '8964000000021' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.blur(box);
    expect(picks).toEqual(['p2']);
    expect(enters).toEqual(['p2']);
    expect(box.value).toBe('102');
    fireEvent.change(box, { target: { value: 'habib' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(picks).toEqual(['p2']); // already picked: nothing new
    fireEvent.change(box, { target: { value: '1' } }); // no code is just 1, and the name fallback knows no "1"
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toContain('No code "1"');
    expect(enters[enters.length - 1]).toBeUndefined();
  });
});

describe('return refunded through another bank', () => {
  it('the refund comes out of the bank that was picked and the books stay balanced', async () => {
    const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
    set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 10000, openingBankBalance: 50000, cashOpeningDate: '2026-01-01', taxRatePct: 0, bankOpenings: { '1011': 20000 } });
    set('tradeflow_accounts_v1', [{ id: 'a1', code: '1011', name: 'HBL — 4471', type: 'asset', parent: '1010', isBank: true, bankName: 'HBL' }]);
    set('tradeflow_customers_v2', [{ id: 'c1', code: 'C-0001', name: 'حاجی عبدالرحمن', company: '', phone: '0300', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]);
    set('tradeflow_products_v2', [{ id: 'p1', code: '101', name: 'Sugar 50 kg', category: 'General', unit: 'bag', unitPricePerKg: 9999.75, costPricePerKg: 9000, stockKg: 100, minThresholdKg: 0 }]);
    ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2'].forEach((k) => set(k, []));
    seedTestUsers();
    const hook = renderHook(() => useTrading(), { wrapper });
    await signIn(() => hook.result.current);
    let billId = '';
    act(() => {
      const r = hook.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Sugar 50 kg', qty: 3, unitPrice: 9999.75, unit: 'bag' }], payments: [{ method: 'Cash', amount: 29999.25 }], paymentMethod: 'Cash', date: today });
      if (!r.success) throw new Error(r.message);
      billId = r.invoice!.id;
    });
    const inv = hook.result.current.invoices.find((i) => i.id === billId)!;
    act(() => {
      const r = hook.result.current.returnBillItems({ invoiceId: billId, lines: [{ billLineId: inv.items[0].id, qty: 1 }], settle: 'refund', refundMethod: 'Bank Transfer', refundBankCode: '1011' });
      if (!r.success) throw new Error(r.message);
    });
    const s = hook.result.current;
    const refund = s.ledger.find((l) => l.type === 'refund_paid')!;
    expect(refund.debit).toBe(9999.75);
    expect(refund.bankCode).toBe('1011');
    const journal = buildJournal({ settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices, purchases: s.purchases, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products, returns: s.returns, adjustments: s.adjustments });
    const refundEntry = journal.find((e) => e.lines.some((l) => l.accountCode === '1011' && l.credit === 9999.75));
    expect(refundEntry, 'the refund is paid out of HBL (1011), not the main bank').toBeTruthy();
    const tb = trialBalance(journal, mergeAccounts(s.customAccounts), today);
    expect(tb.balanced).toBe(true);
  });
});
