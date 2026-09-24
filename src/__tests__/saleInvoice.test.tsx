/**
 * Sale Invoice / Cash Sale / Purchase Invoice as in Apna Accountant SB: the entry row + grid, header Disc %,
 * Lumsum Disc, Others Charges, the Payment Method grid, the "Sale a/c" choice, cash sale (walk-in), purchase
 * with discount, and Search → edit (same number). Figures are checked by hand and the books must balance.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React, { useEffect } from 'react';
import { renderHook, act, render, screen, fireEvent, within } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { BillingUIProvider, useBillingUI } from '../components/billing/BillingUI';
import { seedTestUsers, signIn } from './helpers/auth';
import { todayISO } from '../utils/stockFlow';
import { ACC, accountBalance, buildJournal, trialBalance, mergeAccounts } from '../utils/accounting';
import { paymentAccounts, paymentsFromGrid, saleAccounts, saleLine, saleTotals, paperOf } from '../utils/saleInvoice';
import { findBillByNumber } from '../components/billing/NewBillModal';
import { findPurchaseInvoice } from '../components/billing/classic/PurchaseInvoiceModal';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

const seed = () => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 10000, openingBankBalance: 0, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  set('tradeflow_customers_v2', [
    { id: 'c1', code: 'C-0001', name: 'Haji Karim', company: 'Karim Store', phone: '0300', email: '', address: '', city: 'Dargai', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
    { id: 'c2', code: 'C-0002', name: 'Swat Ghee House', company: 'Swat Ghee House', phone: '0301', email: '', address: '', city: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_suppliers_v2', [{ id: 's1', code: 'S-0001', name: 'Ahmed', company: 'Dalda Foods', phone: '0300 1234567', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_products_v2', [
    { id: 'p1', code: '101', name: 'Dalda Ghee 16 kg tin', category: 'Ghee', unit: 'tin', unitPricePerKg: 7000, costPricePerKg: 6000, stockKg: 50, minThresholdKg: 10 },
    { id: 'p2', code: '102', name: 'Habib Cooking Oil 5 L', category: 'Oil', unit: 'can', unitPricePerKg: 2400, costPricePerKg: 2000, stockKg: 40, minThresholdKg: 6, packName: 'carton', packSize: 4 },
    { id: 'p3', code: '103', name: 'Salt 1 kg', category: 'General', unit: 'pcs', unitPricePerKg: 50, costPricePerKg: 40, stockKg: 100, minThresholdKg: 10 },
  ]);
  set('tradeflow_accounts_v1', [
    { id: 'a1', code: '1011', name: 'HBL — 1234', type: 'asset', parent: '1010', isBank: true, bankName: 'HBL', accountNumber: '1234' },
    { id: 'a2', code: '4050', name: 'Sale Of Cooking Oil & Ghee', type: 'income' },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_purchase_orders_v2'].forEach((k) => set(k, []));
  seedTestUsers();
};
const setup = async () => {
  seed();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
  return hook;
};
type T = ReturnType<typeof useTrading>;
const run = <R,>(fn: () => R): R => {
  let out: R;
  act(() => {
    out = fn();
  });
  return out!;
};
const ok = <R extends { success: boolean; message: string }>(r: R) => {
  if (!r.success) throw new Error(r.message);
  return r;
};
const journalOf = (s: T) =>
  buildJournal({ settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices, purchases: s.purchases, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products, returns: s.returns, adjustments: s.adjustments });
const bal = (s: T, code: string) => Math.round(accountBalance(journalOf(s), code, today) * 100) / 100 + 0;
const expectBalanced = (s: T) => {
  const j = journalOf(s);
  expect(trialBalance(j, mergeAccounts(s.customAccounts), today).balanced).toBe(true);
  expect(Math.round(accountBalance(j, ACC.RECEIVABLE, today) * 100) / 100 + 0).toBe(Math.round(s.customers.reduce((a, x) => a + x.totalDue, 0) * 100) / 100);
  expect(Math.round(-accountBalance(j, ACC.PAYABLE, today) * 100) / 100 + 0).toBe(Math.round(s.suppliers.reduce((a, x) => a + x.totalOwed, 0) * 100) / 100);
};

beforeEach(() => localStorage.clear());

describe('sale invoice arithmetic', () => {
  it('header Disc % fills lines without their own discount; Lumsum %, Others Charges, payments and balance', () => {
    const l1 = saleLine({ qty: 10, rate: 7000, discType: 'rs', discValue: 0 }, 5);
    const l2 = saleLine({ qty: 20, rate: 50, discType: 'rs', discValue: 100 }, 5);
    expect(l1).toEqual({ amount: 70000, disc: 3500, net: 66500, pct: 5 });
    expect(l2).toEqual({ amount: 1000, disc: 100, net: 900, pct: null });
    const t = saleTotals({ lines: [{ qty: 10, net: l1.net }, { qty: 20, net: l2.net }], others: 500, lumsumPct: 2, paid: 50000 });
    expect(t).toEqual({ qtyTotal: 30, amountTotal: 67400, lumsum: 1348, tax: 0, others: 500, billTotal: 66552, balance: 16552 });
    // A Lumsum amount (no %) is taken as typed, never more than the amount total.
    expect(saleTotals({ lines: [{ qty: 1, net: 100 }], lumsumAmount: 500 }).lumsum).toBe(100);
  });
  it('the Payment Method grid maps onto cash / bank / cheque parts', () => {
    const accs = paymentAccounts({ openingBankBalance: 0 }, [{ code: '1011', name: 'HBL — 1234', type: 'asset', isBank: true }]);
    expect(accs.map((a) => `${a.code}:${a.kind}`)).toEqual(['1000:cash', '1010:bank', '1011:bank', '1150:cheque']);
    const g = paymentsFromGrid([{ code: '1000', amount: 20000 }, { code: '1011', amount: 30000, note: 'HBL deposit' }, { code: '1150', amount: 5000 }, { code: '1010', amount: 0 }], accs);
    expect(g).toEqual({ parts: [{ method: 'Cash', amount: 20000 }, { method: 'Bank Transfer', amount: 30000, bankCode: '1011', note: 'HBL deposit' }], cheque: 5000 });
    expect(paymentsFromGrid([{ code: '6000', amount: 1 }], accs).error).toMatch(/not a cash or bank account/);
    expect(saleAccounts([{ code: '4050', name: 'Sale Of Cooking Oil & Ghee', type: 'income' }]).map((a) => a.code)).toEqual(['4000', '4050', '4100', '4150', '4900', '4910']);
    expect([paperOf('none'), paperOf('half'), paperOf('full'), paperOf('mini')]).toEqual([null, 'a5', 'a4', 'thermal80']);
  });
});

describe('sale invoice in the books', () => {
  it('Disc % + Lumsum + Others charges + cash and bank lines with narration: totals, posting, balanced', async () => {
    const h = await setup();
    const r = () => h.result.current;
    const accs = paymentAccounts(r().settings, r().customAccounts);
    const pay = paymentsFromGrid([{ code: '1000', amount: 20000 }, { code: '1011', amount: 30000, note: 'HBL deposit' }], accs);
    const res = run(() => ok(r().createBill({
      customerId: 'c1',
      items: [
        { productId: 'p1', name: 'Dalda', qty: 10, unitPrice: 7000, discountType: 'pct', discountValue: 5 },
        { productId: 'p3', name: 'Salt', qty: 20, unitPrice: 50, discountType: 'rs', discountValue: 100, description: 'loose' },
      ],
      discount: 1348,
      freightCharges: 500,
      payments: pay.parts,
      date: today,
    })));
    const inv = res.invoice!;
    expect(inv.subtotal).toBe(67400);
    expect(inv.totalAmount).toBe(66552);
    expect(inv.paidAmount).toBe(50000);
    expect(inv.balanceDue).toBe(16552);
    expect(inv.items[1].description).toBe('loose');
    const s = r();
    expect(s.customers.find((c) => c.id === 'c1')!.totalDue).toBe(16552);
    const bankRow = s.ledger.find((l) => l.type === 'payment_received' && l.bankCode === '1011')!;
    expect(bankRow.credit).toBe(30000);
    expect(bankRow.note).toBe('HBL deposit');
    // Sales gross 71,000; discounts 3,500 + 100 + 1,348; freight 500; cash 20,000 in, HBL 30,000 in.
    expect(bal(s, ACC.SALES)).toBe(-71000);
    expect(bal(s, ACC.SALES_DISCOUNTS)).toBe(4948);
    expect(bal(s, ACC.FREIGHT_INCOME)).toBe(-500);
    expect(bal(s, ACC.CASH)).toBe(30000);
    expect(bal(s, '1011')).toBe(30000);
    expect(bal(s, ACC.RECEIVABLE)).toBe(16552);
    expectBalanced(s);
  });

  it('Sale a/c: the goods are credited to the chosen income account; a non-income account is refused', async () => {
    const h = await setup();
    const r = () => h.result.current;
    const inv = run(() => ok(r().createBill({ customerId: 'c2', items: [{ productId: 'p2', name: 'Oil', qty: 8, unitPrice: 2400 }], saleAccountCode: '4050', date: today }))).invoice!;
    expect(inv.saleAccountCode).toBe('4050');
    expect(bal(r(), '4050')).toBe(-19200);
    expect(bal(r(), ACC.SALES)).toBe(0);
    expectBalanced(r());
    const bad = run(() => r().createBill({ customerId: 'c2', items: [{ productId: 'p2', name: 'Oil', qty: 1, unitPrice: 2400 }], saleAccountCode: '6000' }));
    expect(bad.success).toBe(false);
    expect(bad.message).toMatch(/not an income account/);
    expect(run(() => r().createBill({ customerId: 'c2', items: [{ productId: 'p2', name: 'Oil', qty: 1, unitPrice: 2400 }], saleAccountCode: ACC.SALES_RETURNS })).success).toBe(false);
  });

  it('Cash Sale: walk-in on the one "Cash Sale" account, paid in full in cash, the typed name kept', async () => {
    const h = await setup();
    const r = () => h.result.current;
    const sale = (name: string, qty: number) =>
      run(() => ok(r().createBill({ customerId: '', newCustomer: { name: 'Cash Sale', phone: '' }, items: [{ productId: 'p3', name: 'Salt', qty, unitPrice: 50 }], payments: [{ method: 'Cash', amount: qty * 50 }], cashSale: true, walkInName: name, date: today }))).invoice!;
    const a = sale('Gul Khan', 10);
    const b = sale('', 4);
    expect(a.customerName).toBe('Cash Sale');
    expect(a.walkInName).toBe('Gul Khan');
    expect(a.cashSale).toBe(true);
    expect(b.walkInName).toBeUndefined();
    expect(a.balanceDue).toBe(0);
    expect(b.customerId).toBe(a.customerId); // one Cash Sale account, not one per walk-in
    expect(r().customers.filter((c) => c.name === 'Cash Sale')).toHaveLength(1);
    expect(bal(r(), ACC.CASH)).toBe(10000 + 700);
    expect(bal(r(), ACC.RECEIVABLE)).toBe(0);
    expectBalanced(r());
  });

  it('Search then edit: the bill found by its digits is changed under the same number, books balanced', async () => {
    const h = await setup();
    const r = () => h.result.current;
    const first = run(() => ok(r().createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda', qty: 2, unitPrice: 7000 }], paidNow: 4000, paymentMethod: 'Cash', date: today }))).invoice!;
    run(() => ok(r().createBill({ customerId: 'c2', items: [{ productId: 'p3', name: 'Salt', qty: 1, unitPrice: 50 }], date: today })));
    const digits = first.invoiceNumber.match(/(\d+)$/)![1];
    const hit = findBillByNumber(r().invoices, digits)!;
    expect(hit.id).toBe(first.id);
    expect(r().billEditBlock(r().invoices.find((i) => i.id === hit.id)!)).toBeNull();
    run(() => ok(r().editBill(hit.id, { customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda', qty: 3, unitPrice: 7000, discountType: 'pct', discountValue: 10 }], freightCharges: 200, saleAccountCode: '4050', date: today })));
    const edited = r().invoices.find((i) => i.id === first.id)!;
    expect(edited.invoiceNumber).toBe(first.invoiceNumber);
    expect(r().invoices).toHaveLength(2);
    expect(edited.totalAmount).toBe(18900 + 200);
    expect(edited.paidAmount).toBe(4000); // money already received stays on it
    expect(r().customers.find((c) => c.id === 'c1')!.totalDue).toBe(19100 - 4000);
    expect(r().products.find((p) => p.id === 'p1')!.stockKg).toBe(47);
    expect(bal(r(), '4050')).toBe(-21000);
    expectBalanced(r());
  });
});

describe('purchase invoice with discount; Search → edit / delete', () => {
  it('discount %, then the same invoice changed (same number): stock, supplier and books follow', async () => {
    const h = await setup();
    const r = () => h.result.current;
    const inv = run(() => ok(r().createPurchaseInvoice({ supplierId: 's1', date: today, memoNo: 'DF-1', lines: [{ productId: 'p1', qty: 10, rate: 6000 }, { productId: 'p2', qty: 8, rate: 2000, packs: 2 }], discountPct: 5, paidNow: 10000, paidMethod: 'Cash' }))).invoice!;
    expect(inv.grossAmount).toBe(76000);
    expect(inv.discountAmount).toBe(3800);
    expect(inv.totalAmount).toBe(72200);
    expect(r().suppliers[0].totalOwed).toBe(62200);
    expect(r().products.find((p) => p.id === 'p1')!.stockKg).toBe(60);
    expectBalanced(r());

    const hit = findPurchaseInvoice<T['purchaseInvoices'][number]>(r().purchaseInvoices, 'df-1')!;
    expect(hit.id).toBe(inv.id);
    expect(r().purchaseInvoiceEditBlock(hit.id)).toBeNull();
    const ed = run(() => ok(r().editPurchaseInvoice(hit.id, { supplierId: 's1', date: today, memoNo: 'DF-1', lines: [{ productId: 'p1', qty: 12, rate: 6000 }], discountPct: 10, paidNow: 0 }))).invoice!;
    expect(ed.invoiceNumber).toBe(inv.invoiceNumber);
    expect(r().purchaseInvoices).toHaveLength(1);
    expect(ed.totalAmount).toBe(64800);
    expect(r().suppliers[0].totalOwed).toBe(64800);
    expect(r().products.find((p) => p.id === 'p1')!.stockKg).toBe(62);
    expect(r().products.find((p) => p.id === 'p2')!.stockKg).toBe(40);
    expect(bal(r(), ACC.CASH)).toBe(10000); // the old payment was taken back out
    expectBalanced(r());

    run(() => ok(r().deletePurchaseInvoice(ed.id)));
    expect(r().purchaseInvoices).toHaveLength(0);
    expect(r().suppliers[0].totalOwed).toBe(0);
    expect(r().products.find((p) => p.id === 'p1')!.stockKg).toBe(50);
    expectBalanced(r());
  });
});

// ---------------------------------------------------------------------------------------------------------
// The real form: the entry row, Enter across it, the grid, the Payment Method grid, Save.
// ---------------------------------------------------------------------------------------------------------
describe('Sale Invoice form (entry row + grid)', () => {
  let api!: T;
  const Grab: React.FC = () => {
    const t = useTrading();
    useEffect(() => { api = t; });
    return null;
  };
  const Opener: React.FC = () => {
    const ui = useBillingUI();
    return (
      <>
        <button type="button" onClick={() => ui.newBill()}>open sale</button>
        <button type="button" onClick={() => ui.newCashSale()}>open cash sale</button>
        <button type="button" onClick={() => ui.newPurchaseInvoice()}>open purchase</button>
      </>
    );
  };
  const mount = async () => {
    seed();
    localStorage.setItem('sarmaya_bill_after_save', 'close');
    render(<TradingProvider><Grab /><BillingUIProvider><Opener /></BillingUIProvider></TradingProvider>);
    await signIn(() => api);
  };
  const enter = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });
  const typeIn = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

  it('code Enter → qty → rate Enter puts the line in the grid; Disc %, Lumsum, Others, two payment lines; Save posts it', async () => {
    await mount();
    fireEvent.click(screen.getByText('open sale'));
    const d = await screen.findByRole('dialog', { name: 'New Bill' });
    const q = within(d);
    typeIn(q.getByLabelText('Customer code'), '1');
    enter(q.getByLabelText('Customer code'));
    expect((q.getByLabelText('Customer') as HTMLSelectElement).value).toBe('c1');
    expect(q.getByTestId('bill-party-balance').textContent).toBe('Rs. 0');

    // Line 1 by code.
    typeIn(q.getByLabelText('Code 1'), '101');
    enter(q.getByLabelText('Code 1'));
    expect((q.getByLabelText('Item 1') as HTMLSelectElement).value).toBe('p1');
    expect(q.getByTestId('bill-stock-box').textContent).toContain('50');
    typeIn(q.getByLabelText('Quantity 1'), '10');
    expect((q.getByLabelText('Price 1') as HTMLInputElement).value).toBe('7000');
    enter(q.getByLabelText('Price 1'));
    // In the grid; the entry row is empty and numbered 2.
    expect(q.getAllByTestId('bill-line')).toHaveLength(1);
    expect((q.getByLabelText('Item 2') as HTMLSelectElement).value).toBe('');
    expect(q.getByTestId('line-amount-1').textContent).toBe('70,000.00'); // the grid: 2 decimals, like the old program

    // Line 2 with its own discount (Rs.) and a description.
    typeIn(q.getByLabelText('Code 2'), '103');
    enter(q.getByLabelText('Code 2'));
    typeIn(q.getByLabelText('Description 2'), 'loose');
    typeIn(q.getByLabelText('Quantity 2'), '20');
    typeIn(q.getByLabelText('Discount 2'), '100');
    enter(q.getByLabelText('Discount 2'));
    expect(q.getAllByTestId('bill-line')).toHaveLength(2);

    // Header Disc % 5 → line 1 (no own discount) gets 5%; line 2 keeps its Rs. 100.
    typeIn(q.getByLabelText('Disc %'), '5');
    expect(q.getByTestId('line-amount-1').textContent).toBe('66,500.00');
    expect(q.getByTestId('line-amount-2').textContent).toBe('900.00');
    expect(q.getByTestId('bill-qty-total').textContent).toBe('30');
    expect(q.getByTestId('bill-amount-total').textContent).toBe('Rs. 67,400');
    typeIn(q.getByLabelText('Lumsum Disc%'), '2');
    expect((q.getByLabelText('Lumsum Disc (Rs.)') as HTMLInputElement).value).toBe('1348');
    typeIn(q.getByLabelText('Others Charges'), '500');
    expect(q.getByTestId('bill-total').textContent).toBe('Rs. 66,552');

    // Clicking a grid line brings it back into the entry row; change it and put it back.
    fireEvent.click(q.getAllByTestId('bill-line')[1]);
    expect((q.getByLabelText('Quantity 2') as HTMLInputElement).value).toBe('20');
    enter(q.getByLabelText('Price 2'));
    expect(q.getAllByTestId('bill-line')).toHaveLength(2);

    // Payment Method: cash 20,000, then HBL (1011) 30,000 with a narration.
    typeIn(q.getByLabelText('Paid now'), '20000');
    enter(q.getByLabelText('Narration'));
    expect(q.getAllByTestId('bill-pay-line')).toHaveLength(1);
    typeIn(q.getByLabelText('Payment code'), '1011');
    enter(q.getByLabelText('Payment code'));
    expect((q.getByLabelText('Payment account') as HTMLSelectElement).value).toBe('1011');
    typeIn(q.getByLabelText('Paid now'), '30000');
    typeIn(q.getByLabelText('Narration'), 'HBL deposit');
    enter(q.getByLabelText('Narration'));
    expect(q.getByTestId('bill-pay-total').textContent).toBe('50,000.00');
    expect(q.getByTestId('bill-balance').textContent).toBe('Rs. 16,552');

    fireEvent.click(q.getByRole('button', { name: /^Save/ }));
    expect(api.invoices).toHaveLength(1);
    const inv = api.invoices[0];
    expect(inv.totalAmount).toBe(66552);
    expect(inv.discount).toBe(1348);
    expect(inv.freightCharges).toBe(500);
    expect(inv.paidAmount).toBe(50000);
    expect(inv.items.map((i) => [i.productId, i.qty, i.discountAmount || 0, i.description || ''])).toEqual([['p1', 10, 3500, ''], ['p3', 20, 100, 'loose']]);
    expect(api.ledger.find((l) => l.bankCode === '1011')!.note).toBe('HBL deposit');
    expectBalanced(api);
  });

  it('Delete on a grid line removes it; the Sale a/c picked goes to the bill', async () => {
    await mount();
    fireEvent.click(screen.getByText('open sale'));
    const q = within(await screen.findByRole('dialog', { name: 'New Bill' }));
    fireEvent.change(q.getByLabelText('Customer'), { target: { value: 'c2' } });
    for (const code of ['101', '102']) {
      const n = q.queryAllByTestId('bill-line').length + 1;
      typeIn(q.getByLabelText(`Code ${n}`), code);
      enter(q.getByLabelText(`Code ${n}`));
      typeIn(q.getByLabelText(`Quantity ${n}`), '1');
      enter(q.getByLabelText(`Price ${n}`));
    }
    expect(q.getAllByTestId('bill-line')).toHaveLength(2);
    fireEvent.keyDown(q.getAllByTestId('bill-line')[0], { key: 'Delete' });
    expect(q.getAllByTestId('bill-line')).toHaveLength(1);
    typeIn(q.getByLabelText('Sale a/c code'), '4050');
    enter(q.getByLabelText('Sale a/c code'));
    expect((q.getByLabelText('Sale a/c') as HTMLSelectElement).value).toBe('4050');
    fireEvent.click(q.getByRole('button', { name: /^Save/ }));
    expect(api.invoices[0].items.map((i) => i.productId)).toEqual(['p2']);
    expect(api.invoices[0].saleAccountCode).toBe('4050');
  });

  it('Cash Sale: no customer needed, the walk-in name is kept, paid in full', async () => {
    await mount();
    fireEvent.click(screen.getByText('open cash sale'));
    const q = within(await screen.findByRole('dialog', { name: 'Cash Sale Invoice' }));
    expect(q.queryByTestId('bill-payments')).toBeNull();
    typeIn(q.getByLabelText('Code 1'), '103');
    enter(q.getByLabelText('Code 1'));
    typeIn(q.getByLabelText('Quantity 1'), '6');
    enter(q.getByLabelText('Price 1'));
    expect(q.getByText('Product Balance/Unit')).toBeTruthy();
    typeIn(q.getByLabelText('Customer:'), 'Gul Khan');
    fireEvent.click(q.getByRole('button', { name: /^Save/ }));
    const inv = api.invoices[0];
    expect(inv.customerName).toBe('Cash Sale');
    expect(inv.walkInName).toBe('Gul Khan');
    expect(inv.balanceDue).toBe(0);
    expect(inv.paidAmount).toBe(300);
    expectBalanced(api);
  });

  it('Search Party By City: typing a name in the customer box opens it; city and text narrow the grid; Enter picks', async () => {
    await mount();
    fireEvent.click(screen.getByText('open sale'));
    const q = within(await screen.findByRole('dialog', { name: 'New Bill' }));
    typeIn(q.getByLabelText('Customer code'), 'sw');
    const sp = within(await screen.findByRole('dialog', { name: 'Search Party By City' }));
    expect((sp.getByLabelText('Search') as HTMLInputElement).value).toBe('sw');
    expect(sp.getAllByRole('row').filter((r) => r.getAttribute('data-idx') != null)).toHaveLength(1);
    typeIn(sp.getByLabelText('Search'), '');
    fireEvent.change(sp.getByLabelText('City'), { target: { value: 'Dargai' } });
    const rows = sp.getAllByRole('row').filter((r) => r.getAttribute('data-idx') != null);
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Haji Karim')]);
    enter(sp.getByLabelText('Search'));
    expect((q.getByLabelText('Customer') as HTMLSelectElement).value).toBe('c1');
  });

  it('Purchase Invoice entry row: code Enter, Unit → carton converts the rate, Enter on Rate puts the line in', async () => {
    await mount();
    fireEvent.click(screen.getByText('open purchase'));
    const q = within(await screen.findByRole('dialog', { name: 'Purchase Invoice' }));
    fireEvent.change(q.getByLabelText('Supplier', { selector: 'select' }), { target: { value: 's1' } });
    typeIn(q.getByLabelText('Product code 1'), '102');
    enter(q.getByLabelText('Product code 1'));
    expect((q.getByLabelText('Rate 1') as HTMLInputElement).value).toBe('2000');
    fireEvent.change(q.getByLabelText('Unit 1'), { target: { value: 'pack' } });
    expect((q.getByLabelText('Rate 1') as HTMLInputElement).value).toBe('8000');
    typeIn(q.getByLabelText('Qty 1'), '2');
    expect(q.getByTestId('pi-packing').textContent).toContain('4 can/carton');
    enter(q.getByLabelText('Rate 1'));
    expect(q.getAllByTestId('pi-line')).toHaveLength(1);
    expect(q.getByTestId('pi-amount-1').textContent).toBe('16,000.00');
    expect((q.getByLabelText('Product 2') as HTMLSelectElement).value).toBe('');
  });
});
