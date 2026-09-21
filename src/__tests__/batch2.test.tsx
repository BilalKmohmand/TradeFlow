import { describe, it, expect, beforeEach } from 'vitest';
import React, { useEffect } from 'react';
import { renderHook, act, render, screen } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { buildJournal, trialBalance, accountBalance, mergeAccounts } from '../utils/accounting';
import { collectCashMovements, accountBalancesOn } from '../utils/finance';
import { buildDailySheet, resolveBillPayments, customerSnapshot, lastRateFor } from '../utils/billing';
import { formatPackQty, formatQtyWithPacks, splitPacks, plural } from '../utils/packUnits';
import { dailySheetCsv, trialBalanceCsv, cashBookCsv, itemHistoryCsv } from '../utils/csvReports';
import { toCsv } from '../utils/listTools';
import { findOption } from '../components/billing/QuickPick';
import { PrintDocument } from '../components/PrintDocument';
import { itemHistory } from '../utils/stockReports';
import { todayISO } from '../utils/stockFlow';
import { seedTestUsers, signIn } from './helpers/auth';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

const seed = (settings: Record<string, unknown> = {}) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 20000, openingBankBalance: 100000, cashOpeningDate: '2026-01-01', taxRatePct: 0, ...settings });
  set('tradeflow_customers_v2', [
    { id: 'c1', name: 'Zaman & Co', company: 'Zaman & Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01', code: 'Z01' },
    { id: 'c2', name: 'Haji Karim', company: 'Karim Store', phone: '0300', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: '16 L Tin Dalda', category: 'General', unit: 'tin', unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 44, minThresholdKg: 0, packName: 'carton', packSize: 6, code: 'DT16' },
    { id: 'p2', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2000, stockKg: 10, minThresholdKg: 0 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_cheques_v1'].forEach((k) => localStorage.setItem(k, '[]'));
  seedTestUsers();
};

const setup = async (settings: Record<string, unknown> = {}) => {
  seed(settings);
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
  return hook;
};
type H = Awaited<ReturnType<typeof setup>>['result'];
const books = (result: H) => {
  const s = result.current;
  return [...buildJournal({ settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices, dispatches: s.dispatches, purchases: s.purchases, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products, returns: s.returns, adjustments: s.adjustments, cheques: s.cheques } as any), ...s.manualJournals];
};
const balances = (result: H) => {
  const s = result.current;
  return accountBalancesOn(collectCashMovements(s.ledger, s.expenses, s.cashEntries, s.customers, s.suppliers), s.settings, today);
};

beforeEach(() => localStorage.clear());

describe('pack units', () => {
  const tin = { unit: 'tin', packName: 'carton', packSize: 6 };
  it('reads quantities as packs + base units', () => {
    expect(formatPackQty(15, tin)).toBe('2 cartons + 3 tins');
    expect(formatPackQty(15, tin, 'short')).toBe('2 ctn + 3 tins');
    expect(formatPackQty(12, tin)).toBe('2 cartons');
    expect(formatPackQty(6, tin)).toBe('1 carton');
    expect(formatPackQty(4, tin)).toBe('4 tins');
    expect(formatPackQty(1, tin)).toBe('1 tin');
    expect(formatPackQty(-8, tin, 'short')).toBe('−(1 ctn + 2 tins)');
    expect(formatQtyWithPacks(15, tin)).toBe('15 tins (2 ctn + 3)');
    expect(formatQtyWithPacks(12, tin)).toBe('12 tins (2 ctn)');
    expect(formatQtyWithPacks(15, { unit: 'tin' })).toBe('15 tins');
    expect(formatPackQty(44, { unit: 'kg' })).toBe('44 kg');
    expect(splitPacks(44, 6)).toEqual({ packs: 7, rest: 2 });
    expect(plural('box', 2)).toBe('boxes');
  });

  it('a bill line typed in cartons is stored in tins, keeps the pack price and takes stock in tins', async () => {
    const { result } = await setup();
    let r: any;
    // 2.5 cartons at Rs. 6,000 a carton = 15 tins at Rs. 1,000.
    act(() => { r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Tin', qty: 15, unitPrice: 6000 / 6, packPrice: 6000 }], paidNow: 0 }); });
    expect(r.success).toBe(true);
    const line = result.current.invoices[0].items[0];
    expect(line.qty).toBe(15);
    expect(line.unitPrice).toBe(1000);
    expect(line.amount).toBe(15000);
    expect(line.packName).toBe('carton');
    expect(line.packSize).toBe(6);
    expect(line.packPrice).toBe(6000);
    expect(result.current.products.find((p) => p.id === 'p1')!.stockKg).toBe(29);
    // COGS still per tin: 15 × 800.
    expect(accountBalance(books(result), '5000', today)).toBe(12000);
  });

  it('an awkward pack price keeps the exact amount (no rounding drift)', async () => {
    const { result } = await setup();
    act(() => { result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Tin', qty: 12, unitPrice: 1250 / 6, packPrice: 1250 }] }); });
    expect(result.current.invoices[0].totalAmount).toBe(2500);
  });
});

describe('stock short setting', () => {
  it('by default a short bill is allowed (as before) and stock goes below zero', async () => {
    const { result } = await setup();
    let ok: any;
    act(() => { ok = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Can', qty: 11, unitPrice: 2000 }] }); });
    expect(ok.success).toBe(true);
    expect(result.current.products.find((p) => p.id === 'p2')!.stockKg).toBe(-1);
  });
  it('refuses a bill that needs more than is in stock when the shop turned that off', async () => {
    const { result } = await setup({ allowNegativeStock: false });
    let r: any;
    act(() => { r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Can', qty: 8, unitPrice: 2000 }, { productId: 'p2', name: 'Can', qty: 3, unitPrice: 2000 }] }); });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/only 10 cans in stock/i);
    expect(r.message).toMatch(/Allow bills when stock is short/);
    expect(result.current.invoices).toHaveLength(0);
    expect(result.current.products.find((p) => p.id === 'p2')!.stockKg).toBe(10);
  });
  it('sells into negative stock when the setting is on', async () => {
    const { result } = await setup({ allowNegativeStock: true });
    let r: any;
    act(() => { r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Can', qty: 11, unitPrice: 2000 }] }); });
    expect(r.success).toBe(true);
    expect(result.current.products.find((p) => p.id === 'p2')!.stockKg).toBe(-1);
    expect(trialBalance(books(result), mergeAccounts(result.current.customAccounts), today).balanced).toBe(true);
  });
});

describe('split payment on one bill', () => {
  it('resolves parts: cash over the total is change; bank / cheque cannot be more than the bill', () => {
    expect(resolveBillPayments(1000, [{ method: 'Cash', amount: 700 }, { method: 'Bank Transfer', amount: 500 }])).toMatchObject({ paid: 1000, change: 200, parts: [{ method: 'Cash', amount: 500 }, { method: 'Bank Transfer', amount: 500 }] });
    expect(resolveBillPayments(1000, [{ method: 'Bank Transfer', amount: 800 }], 300).error).toMatch(/more than the bill total/);
    expect(resolveBillPayments(1000, [], 1200).error).toMatch(/cheque is more/);
    // Older single-method callers are capped as before.
    expect(resolveBillPayments(1000, [{ method: 'Bank Transfer', amount: 1200 }])).toMatchObject({ paid: 1000, change: 0 });
    expect(resolveBillPayments(1000, [{ method: 'Cash', amount: 0 }], 0)).toMatchObject({ paid: 0, parts: [] });
  });

  it('cash + bank + cheque: each posts to the right place; the cheque waits in the register', async () => {
    const { result } = await setup();
    let r: any;
    act(() => {
      r = result.current.createBill({
        customerId: 'c1',
        items: [{ productId: 'p1', name: 'Tin', qty: 30, unitPrice: 1000 }],
        payments: [{ method: 'Cash', amount: 5000 }, { method: 'Bank Transfer', amount: 10000 }],
        cheque: { amount: 15000, bankName: 'HBL', chequeNumber: '100200', chequeDate: today },
      });
    });
    expect(r.success).toBe(true);
    const inv = result.current.invoices[0];
    expect(inv.totalAmount).toBe(30000);
    expect(inv.paidAmount).toBe(30000);
    expect(inv.balanceDue).toBe(0);
    expect(inv.paymentMethod).toBe('Cash + Bank Transfer + Cheque');
    expect(inv.payments!.map((p) => [p.method, p.amount])).toEqual([['cash', 5000], ['bank_transfer', 10000], ['cheque', 15000]]);
    // Ledger: two money rows + one cheque row; customer owes nothing.
    const rows = result.current.ledger.filter((l) => l.sourceId === inv.id || l.referenceId === 'CHQ-100200');
    expect(rows.map((l) => [l.type, l.method, l.credit || l.debit]).sort()).toEqual([
      ['bill_issued', undefined, 30000],
      ['cheque_received', 'Cheque', 15000],
      ['payment_received', 'Bank Transfer', 10000],
      ['payment_received', 'Cash', 5000],
    ].sort());
    expect(result.current.customers.find((c) => c.id === 'c1')!.totalDue).toBe(0);
    // Cheque register: in hand, linked to the bill.
    expect(result.current.cheques).toHaveLength(1);
    expect(result.current.cheques[0]).toMatchObject({ status: 'in_hand', invoiceId: inv.id, amount: 15000, chequeNumber: '100200', customerId: 'c1' });
    // Cash + bank only moved by the real money, not the cheque.
    const b = balances(result);
    expect(b.cash).toBe(25000);
    expect(b.bank).toBe(110000);
    // Books: cheque in 1150, trial balance balanced.
    const j = books(result);
    expect(accountBalance(j, '1150', today)).toBe(15000);
    expect(accountBalance(j, '1100', today)).toBe(0);
    expect(trialBalance(j, mergeAccounts(result.current.customAccounts), today).balanced).toBe(true);
    // Daily sheet: two receipts, the cheque under cheques, the bill once.
    const s = result.current;
    const sheet = buildDailySheet({ invoices: s.invoices, ledger: s.ledger, expenses: s.expenses, cashEntries: s.cashEntries, customers: s.customers, suppliers: s.suppliers, settings: s.settings, cheques: s.cheques }, today);
    expect(sheet.bills).toHaveLength(1);
    expect(sheet.receipts.map((m) => m.amount).sort()).toEqual([10000, 5000]);
    expect(sheet.cashIn).toBe(5000);
    expect(sheet.bankIn).toBe(10000);
    expect(sheet.cheques).toHaveLength(1);
    expect(sheet.summary.received).toBe(15000);
    expect(sheet.summary.creditGiven).toBe(0);
    // The bill can't be deleted while its cheque is in hand; clearing the cheque puts it in the bank.
    let del: any;
    act(() => { del = result.current.deleteBill(inv.id); });
    expect(del.success).toBe(false);
    expect(del.message).toMatch(/100200/);
    act(() => { result.current.clearCheque(result.current.cheques[0].id); });
    expect(balances(result).bank).toBe(125000);
    expect(accountBalance(books(result), '1150', today)).toBe(0);
    expect(result.current.invoices[0].payments!.find((p) => p.method === 'cheque')!.notes).toMatch(/cleared/);
  });

  it('a part-cheque bill leaves the rest on credit; bouncing the cheque puts it back on the bill', async () => {
    const { result } = await setup();
    act(() => { result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Can', qty: 5, unitPrice: 2000 }], payments: [{ method: 'Cash', amount: 2000 }], cheque: { amount: 5000, bankName: 'MCB', chequeNumber: '7', chequeDate: today } }); });
    const inv = result.current.invoices[0];
    expect(inv.balanceDue).toBe(3000);
    expect(result.current.customers[0].totalDue).toBe(3000);
    act(() => { result.current.bounceCheque(result.current.cheques[0].id, { reason: 'insufficient funds' }); });
    expect(result.current.invoices[0].balanceDue).toBe(8000);
    expect(result.current.customers[0].totalDue).toBe(8000);
    expect(trialBalance(books(result), mergeAccounts(result.current.customAccounts), today).balanced).toBe(true);
  });

  it('refuses a cheque without number / bank, a duplicate cheque, and non-cash over the total', async () => {
    const { result } = await setup();
    let r: any;
    const bill = (extra: object) => act(() => { r = result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Can', qty: 1, unitPrice: 2000 }], ...extra }); });
    bill({ cheque: { amount: 1000, bankName: 'HBL', chequeNumber: ' ', chequeDate: today } });
    expect(r.message).toMatch(/cheque number/);
    bill({ cheque: { amount: 1000, bankName: '', chequeNumber: '55', chequeDate: today } });
    expect(r.message).toMatch(/bank name/);
    bill({ payments: [{ method: 'Bank Transfer', amount: 1500 }], cheque: { amount: 1000, bankName: 'HBL', chequeNumber: '55', chequeDate: today } });
    expect(r.message).toMatch(/more than the bill total/);
    bill({ cheque: { amount: 1000, bankName: 'HBL', chequeNumber: '55', chequeDate: today } });
    expect(r.success).toBe(true);
    bill({ cheque: { amount: 1000, bankName: 'hbl', chequeNumber: '55', chequeDate: today } });
    expect(r.message).toMatch(/already in the register/);
    expect(result.current.invoices).toHaveLength(1);
    // Cash over the total is change: only what was due is booked.
    bill({ payments: [{ method: 'Cash', amount: 5000 }] });
    expect(r.success).toBe(true);
    expect(result.current.invoices[0].paidAmount).toBe(2000);
  });
});

describe('New Bill helpers', () => {
  it('customer snapshot: last 3 bills and last payment; last rate per item', async () => {
    const { result } = await setup();
    act(() => { result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Can', qty: 1, unitPrice: 1900 }] }); });
    act(() => { result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Can', qty: 1, unitPrice: 1950 }], paidNow: 500, paymentMethod: 'Cash' }); });
    act(() => { result.current.createBill({ customerId: 'c2', items: [{ productId: 'p2', name: 'Can', qty: 1, unitPrice: 2100 }] }); });
    const s = result.current;
    const snap = customerSnapshot('c1', s.invoices, s.ledger);
    expect(snap.lastBills.map((b) => b.invoiceNumber)).toEqual(['INV-2', 'INV-1']);
    expect(snap.lastPayment).toMatchObject({ amount: 500, method: 'Cash' });
    expect(lastRateFor('c1', 'p2', s.invoices)).toMatchObject({ rate: 1950, invoiceNumber: 'INV-2' });
    expect(lastRateFor('c2', 'p2', s.invoices)?.rate).toBe(2100);
    expect(lastRateFor('c1', 'p1', s.invoices)).toBeNull();
  });
  it('type-to-find matches codes first, then names (start, word, anywhere), then phone', () => {
    const opts = [
      { value: 'a', name: '16 L Tin Dalda', code: 'DT16' },
      { value: 'b', name: 'Dalda Cooking Oil 5 L', code: 'DC5' },
      { value: 'c', name: 'Haji Karim', extra: '0300 1234567' },
    ];
    expect(findOption(opts, 'dc5')?.value).toBe('b');
    expect(findOption(opts, 'dt')?.value).toBe('a');
    expect(findOption(opts, 'dalda')?.value).toBe('b'); // name starts with it beats a later word
    expect(findOption(opts, 'tin')?.value).toBe('a');
    expect(findOption(opts, 'karim')?.value).toBe('c');
    expect(findOption(opts, '1234')?.value).toBe('c');
    expect(findOption(opts, 'zzz')).toBeUndefined();
  });
});

describe('CSV exports', () => {
  it('one quoting rule; daily sheet, cash book, trial balance and item history have rows', async () => {
    expect(toCsv(['A', 'B'], [['x "y"', 3]])).toBe('"A","B"\n"x ""y""","3"');
    const { result } = await setup();
    act(() => { result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Can', qty: 2, unitPrice: 2000 }], payments: [{ method: 'Cash', amount: 1000 }], cheque: { amount: 3000, bankName: 'HBL', chequeNumber: '9', chequeDate: today } }); });
    const s = result.current;
    const sheet = buildDailySheet({ invoices: s.invoices, ledger: s.ledger, expenses: s.expenses, cashEntries: s.cashEntries, customers: s.customers, suppliers: s.suppliers, settings: s.settings, cheques: s.cheques }, today);
    const d = dailySheetCsv(sheet);
    expect(d.rows.find((r) => r[0] === 'Bill')).toEqual(['Bill', 'INV-1', 'Zaman & Co', 'Can × 2', 'Cash + Cheque', 4000, 'paid']);
    expect(d.rows.some((r) => r[0] === 'Cheque received' && r[1] === '9')).toBe(true);
    expect(d.rows.some((r) => r[0] === 'Money in' && r[5] === 1000)).toBe(true);
    const cb = cashBookCsv(collectCashMovements(s.ledger, s.expenses, s.cashEntries, s.customers, s.suppliers));
    expect(cb.rows).toHaveLength(1);
    const tb = trialBalanceCsv(trialBalance(books(result), mergeAccounts(s.customAccounts), today));
    const total = tb.rows[tb.rows.length - 1];
    expect(total[1]).toBe('Total');
    expect(total[2]).toBe(total[3]);
    const hist = itemHistory('p2', { products: s.products, customers: s.customers, suppliers: s.suppliers, invoices: s.invoices, purchases: s.purchases, returns: s.returns, adjustments: s.adjustments, stockTransfers: s.stockTransfers, dispatches: s.dispatches, godowns: s.godowns });
    expect(itemHistoryCsv(hist.rows, hist.opening, 'can').rows.length).toBeGreaterThan(1);
  });
});

describe('bill print sizes', () => {
  const Printer: React.FC<{ onReady: (t: ReturnType<typeof useTrading>) => void; invoiceId?: string }> = ({ onReady, invoiceId }) => {
    const t = useTrading();
    useEffect(() => { onReady(t); });
    return <PrintDocument request={invoiceId ? { type: 'bill', invoiceId } : null} onClose={() => {}} />;
  };

  it('thermal 80 mm: narrow receipt with shop name, items in packs, totals, previous balance, footer and thank-you', async () => {
    seed({ companyName: 'Rohail Traders', billPrintSize: 'thermal80', billFooter: 'Goods once sold will not be taken back.', showPrevBalanceOnBill: true });
    let t!: ReturnType<typeof useTrading>;
    const view = render(<TradingProvider><Printer onReady={(x) => { t = x; }} /></TradingProvider>);
    await signIn(() => t);
    act(() => { t.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Can', qty: 1, unitPrice: 2000 }] }); });
    let id = '';
    act(() => { id = t.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: '16 L Tin Dalda', qty: 15, unitPrice: 1000, packPrice: 6000 }], paidNow: 5000, paymentMethod: 'Cash' }).invoice!.id; });
    view.rerender(<TradingProvider><Printer onReady={(x) => { t = x; }} invoiceId={id} /></TradingProvider>);
    const receipt = await screen.findByTestId('thermal-receipt');
    expect(receipt.textContent).toContain('Rohail Traders');
    expect(receipt.textContent).toContain('15 tins (2 ctn + 3) x 6,000/ctn');
    expect(receipt.textContent).toContain('15,000');
    expect(receipt.textContent).toContain('Balance due');
    expect(receipt.textContent).toContain('Previous balance');
    expect(receipt.textContent).toMatch(/Total balance\s*Rs\. 12,000/);
    expect(receipt.textContent).toContain('Goods once sold will not be taken back.');
    expect(receipt.textContent).toContain('Thank you');
    expect(document.querySelector('[data-testid="print-paper"]')?.textContent).toContain('80mm');
  });

  it('A5 keeps the full bill layout with pack quantities and footer, on A5 paper', async () => {
    seed({ billPrintSize: 'a5', billFooter: 'Terms: 30 days' });
    let t!: ReturnType<typeof useTrading>;
    const view = render(<TradingProvider><Printer onReady={(x) => { t = x; }} /></TradingProvider>);
    await signIn(() => t);
    let id = '';
    act(() => { id = t.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: '16 L Tin Dalda', qty: 15, unitPrice: 1000 }] }).invoice!.id; });
    view.rerender(<TradingProvider><Printer onReady={(x) => { t = x; }} invoiceId={id} /></TradingProvider>);
    expect(await screen.findByText('INVOICE')).toBeTruthy();
    expect(screen.getByTestId('print-line-packs').textContent).toBe('2 cartons + 3 tins');
    expect(screen.getByTestId('print-bill-footer').textContent).toBe('Terms: 30 days');
    expect(document.querySelector('[data-testid="print-paper"]')?.textContent).toContain('A5');
    expect(screen.queryByTestId('thermal-receipt')).toBeNull();
  });
});
