/**
 * Reports & accounts QA (2026-09): regression tests for what a demanding accountant found in the
 * Reports hub and the Accounts tabs. Each block names the problem it guards against.
 */
import { describe, it, expect } from 'vitest';
import { ACC, EntryBuilder, JournalEntry, accountBalance, buildJournal, mergeAccounts, trialBalance } from '../utils/accounting';
import { DEFAULT_SETTINGS, Invoice, LedgerEntry, Product, Purchase, StockReturn, Customer, Supplier } from '../types';
import { REPORTS, ReportData, reportCsv, stockInHand } from '../utils/classicReports';
import { stockBookValueTotal } from '../utils/stockValuation';
import { moneyText } from '../utils/formatters';
import { formatCell, reportPaper } from '../components/billing/classic/ReportTables';
import { billingReceivablesAging, billingPayablesAging } from '../utils/stockReports';
import { recoveryList, openItems } from '../utils/salesExtras';
import { ownerSnapshot, dailyBusinessReport, OwnerSources } from '../utils/control';

const settings = { ...DEFAULT_SETTINGS, cashOpeningBalance: 0, openingBankBalance: 0, cashOpeningDate: '2026-07-01', taxRatePct: 0 };
const cust = (id: string, totalDue: number): Customer => ({ id, name: `Cust ${id}`, company: '', phone: '', email: '', address: '', totalDue, creditLimit: 0, createdAt: '2026-07-01' });
const sup = (id: string, totalOwed: number): Supplier => ({ id, name: `Sup ${id}`, company: `Sup ${id}`, phone: '', email: '', address: '', totalOwed, createdAt: '2026-07-01' } as Supplier);
const product = (id: string, stockKg: number, cost = 100): Product => ({ id, name: `Item ${id}`, category: 'Ghee', unitPricePerKg: cost * 1.1, costPricePerKg: cost, stockKg, minThresholdKg: 0, unit: 'tin' });
const led = (x: Partial<LedgerEntry> & Pick<LedgerEntry, 'id' | 'entityType' | 'entityId' | 'type' | 'date'>): LedgerEntry => ({ referenceId: x.id, description: '', debit: 0, credit: 0, balanceAfter: 0, ...x } as LedgerEntry);
const bill = (id: string, date: string, customerId: string, lines: { productId: string; qty: number; price: number; cost?: number; free?: boolean }[], paid: { date: string; amount: number }[] = []): Invoice => {
  const total = lines.reduce((a, l) => a + l.qty * l.price, 0);
  return {
    id, invoiceNumber: id, billKind: 'bill', customerId, customerName: `Cust ${customerId}`, issueDate: date, dueDate: date, status: 'issued',
    items: lines.map((l, i) => ({ id: `${id}-${i}`, productId: l.productId, productName: l.productId, kg: l.qty, qty: l.qty, ratePerKg: l.price, unitPrice: l.price, amount: l.qty * l.price, costPricePerKg: l.cost, ...(l.free ? { free: true } : {}) })),
    subtotal: total, discount: 0, taxAmount: 0, totalAmount: total, paidAmount: paid.reduce((a, p) => a + p.amount, 0), balanceDue: total - paid.reduce((a, p) => a + p.amount, 0),
    payments: paid.map((p, i) => ({ id: `${id}-p${i}`, date: p.date, amount: p.amount, method: 'cash' as const })),
    createdAt: date,
  } as unknown as Invoice;
};
const data = (over: Partial<ReportData>): ReportData => ({
  settings, customers: [], suppliers: [], products: [], invoices: [], purchases: [], returns: [], adjustments: [], stockTransfers: [], stockBatches: [], godowns: [], ledger: [], expenses: [], cashEntries: [], purchaseInvoices: [], journal: [], accounts: mergeAccounts([]),
  ...over,
});
const withJournal = (d: ReportData): ReportData => ({ ...d, journal: buildJournal({ settings: d.settings, customers: d.customers, suppliers: d.suppliers, ledger: d.ledger, invoices: d.invoices, purchases: d.purchases, expenses: d.expenses, cashEntries: d.cashEntries, products: d.products, returns: d.returns, adjustments: d.adjustments }) });

describe('Journal entries never come out a paisa off', () => {
  it('a debit and a credit of the same half-paisa amount round to the same figure', () => {
    // Math.round(-9320305.5) is -9320305: before the fix the credit was 93,203.05 and the debit 93,203.06.
    const lines = new EntryBuilder().dr('5000', 93203.055).cr('1200', 93203.055).build();
    expect(lines.find((l) => l.accountCode === '5000')!.debit).toBe(93203.06);
    expect(lines.find((l) => l.accountCode === '1200')!.credit).toBe(93203.06);
  });

  it('a bill whose cost has half paisa (and free scheme goods) posts a balanced entry, so the trial balance is exactly zero', () => {
    const d = withJournal(data({
      customers: [cust('c1', 0)],
      products: [product('p1', 0, 100)],
      invoices: [bill('b1', '2026-07-05', 'c1', [{ productId: 'p1', qty: 3, price: 120, cost: 33.335 }, { productId: 'p1', qty: 1, price: 0, cost: 33.335, free: true }])],
      ledger: [led({ id: 'l1', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'b1', sourceId: 'b1', date: '2026-07-05', debit: 360 })],
    }));
    const tb = trialBalance(d.journal, d.accounts, '2026-07-31');
    expect(tb.difference).toBe(0);
    d.journal.forEach((e) => expect(Math.round(e.lines.reduce((a, l) => a + l.debit - l.credit, 0) * 100)).toBe(0));
  });
});

describe('Stock value = Inventory in the balance sheet', () => {
  // Two purchases at different prices; the bill takes the older (cheaper) stock first (its line cost),
  // so the stock left is the dearer lot. A weighted average of all purchases valued it too low.
  const build = () => {
    const purchases: Purchase[] = [
      { id: 'pu1', receiptNumber: 'GRN-1', supplierId: 's1', productId: 'p1', kg: 10, pricePerKg: 100, amount: 1000, date: '2026-07-02', createdAt: '2026-07-02' } as Purchase,
      { id: 'pu2', receiptNumber: 'GRN-2', supplierId: 's1', productId: 'p1', kg: 10, pricePerKg: 130, amount: 1300, date: '2026-07-10', createdAt: '2026-07-10' } as Purchase,
    ];
    const returns: StockReturn[] = [{ id: 'r1', returnNumber: 'DN-1', kind: 'purchase', supplierId: 's1', productId: 'p1', kg: 1, pricePerKg: 130, amount: 130, reason: 'leak', date: '2026-07-15', createdAt: '2026-07-15' }];
    return withJournal(data({
      customers: [cust('c1', 1200)],
      suppliers: [sup('s1', 2170)],
      // 20 in, 10 sold, 1 sent back, plus 5 opening = 14 on hand.
      products: [product('p1', 14, 90)],
      purchases,
      returns,
      invoices: [bill('b1', '2026-07-12', 'c1', [{ productId: 'p1', qty: 10, price: 120, cost: 100 }])],
      ledger: [
        led({ id: 'l1', entityType: 'supplier', entityId: 's1', type: 'purchase_received', referenceId: 'GRN-1', date: '2026-07-02', debit: 1000 }),
        led({ id: 'l2', entityType: 'supplier', entityId: 's1', type: 'purchase_received', referenceId: 'GRN-2', date: '2026-07-10', debit: 1300 }),
        led({ id: 'l3', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'b1', sourceId: 'b1', date: '2026-07-12', debit: 1200 }),
        led({ id: 'l4', entityType: 'supplier', entityId: 's1', type: 'debit_note', referenceId: 'DN-1', date: '2026-07-15', credit: 130 }),
      ],
    }));
  };

  it('Stock In Hand and Stock Value total the Inventory account, today and on an earlier date', () => {
    const d = build();
    for (const day of ['2026-07-11', '2026-07-13', '2026-07-31']) {
      const inv = accountBalance(d.journal, ACC.INVENTORY, day);
      const sih = REPORTS['stock-in-hand'].build(d, { from: day, to: day, asOf: day, today: '2026-07-31' });
      expect(sih.summary!.find((x) => x.label === 'Stock value')!.value, `stock in hand ${day}`).toBeCloseTo(inv, 2);
      const sv = REPORTS['stock-value'].build(d, { from: day, to: day, asOf: day, today: '2026-07-31' });
      expect(sv.summary![0].value, `stock value ${day}`).toBeCloseTo(inv, 2);
    }
    // 5 opening (at the average purchase cost 115, as the books value it) + 1000 + 1300 − 10 × 100 (the
    // older lot the bill took) − 130 sent back = 1,745 for 14 tins: cost rate 124.64. The old average
    // of every purchase (115) put it at 1,610.
    const row = stockInHand(d, '2026-07-31')[0];
    expect(row.qty).toBe(14);
    expect(row.value).toBe(1745);
    expect(row.rate).toBe(124.64);
  });

  it('the owner dashboard shows the same stock value', () => {
    const d = build();
    const src: OwnerSources = { invoices: d.invoices, ledger: d.ledger, expenses: [], cashEntries: [], customers: d.customers, suppliers: d.suppliers, products: d.products, purchases: d.purchases, returns: d.returns, cheques: [], settings };
    expect(ownerSnapshot(src, '2026-07-31').stockValue).toBe(stockBookValueTotal(src, '2026-07-31'));
    expect(ownerSnapshot(src, '2026-07-31').stockValue).toBeCloseTo(accountBalance(d.journal, ACC.INVENTORY, '2026-07-31'), 2);
  });
});

describe('Daily business report for an earlier day', () => {
  it('shows what customers owed, the stock and the cash / credit split at the close of THAT day', () => {
    const d = withJournal(data({
      customers: [cust('c1', 0)],
      products: [product('p1', 0, 100)],
      purchases: [{ id: 'pu1', receiptNumber: 'GRN-1', supplierId: 's1', productId: 'p1', kg: 10, pricePerKg: 100, amount: 1000, date: '2026-07-01', createdAt: '2026-07-01' } as Purchase],
      // Bill on the 5th on credit; paid in full on the 20th.
      invoices: [bill('b1', '2026-07-05', 'c1', [{ productId: 'p1', qty: 10, price: 120, cost: 100 }], [{ date: '2026-07-20', amount: 1200 }])],
      ledger: [
        led({ id: 'l1', entityType: 'customer', entityId: 'c1', type: 'bill_issued', referenceId: 'b1', sourceId: 'b1', date: '2026-07-05', debit: 1200 }),
        led({ id: 'l2', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'b1', sourceId: 'b1', date: '2026-07-20', credit: 1200, method: 'Cash' }),
      ],
    }));
    const src: OwnerSources = { invoices: d.invoices, ledger: d.ledger, expenses: [], cashEntries: [], customers: d.customers, suppliers: [], products: d.products, purchases: d.purchases, returns: [], cheques: [], settings };
    const r = dailyBusinessReport(src, '2026-07-05');
    expect(r.snap.receivables).toBe(1200); // today they owe 0, but on the 5th they owed the bill
    expect(r.cashSales).toBe(0); // paid later: a credit sale that day
    expect(r.creditSales).toBe(1200);
    expect(r.snap.stockValue).toBe(0); // all 10 sold that day
    expect(dailyBusinessReport(src, '2026-07-02').snap.stockValue).toBe(1000);
  });
});

describe('Aging and the recovery list on an earlier date', () => {
  // Opening dues 5,000; a bill of 3,000 on the 10th; 6,000 paid on the 15th (clears the opening and part of the bill);
  // a new bill of 4,000 on the 25th. Today (31st) they owe 6,000.
  const customers = [cust('c1', 6000)];
  const ledger = [
    led({ id: 'a', entityType: 'customer', entityId: 'c1', type: 'bill_issued', date: '2026-07-10', debit: 3000 }),
    led({ id: 'b', entityType: 'customer', entityId: 'c1', type: 'payment_received', date: '2026-07-15', credit: 6000 }),
    led({ id: 'c', entityType: 'customer', entityId: 'c1', type: 'bill_issued', date: '2026-07-25', debit: 4000 }),
  ];

  it('ages what was owed on that date, not today’s balance', () => {
    expect(billingReceivablesAging(customers, ledger, '2026-07-20')[0].total).toBe(2000);
    expect(billingReceivablesAging(customers, ledger, '2026-07-12')[0].total).toBe(8000);
    expect(billingReceivablesAging(customers, ledger, '2026-07-31')[0].total).toBe(6000);
  });

  it('opening dues paid off by payments larger than the bills are not counted twice', () => {
    // On the 20th: history nets to −3,000 (3,000 billed, 6,000 paid); opening 5,000 ⇒ 2,000 owed.
    const row = billingReceivablesAging(customers, ledger, '2026-07-20')[0];
    expect(row.current + row.d31_60 + row.d61_90 + row.d90plus).toBe(2000);
    expect(openItems(customers[0], ledger, '2026-07-20').reduce((a, i) => a + i.amount, 0)).toBe(2000);
  });

  it('the recovery list on an earlier date lists who owed then', () => {
    const paidOff = [cust('c2', 0)];
    const l2 = [led({ id: 'x', entityType: 'customer', entityId: 'c2', type: 'bill_issued', date: '2026-07-03', debit: 500 }), led({ id: 'y', entityType: 'customer', entityId: 'c2', type: 'payment_received', date: '2026-07-28', credit: 500 })];
    const r = recoveryList(paidOff, l2, '2026-07-10', 'area', { salesmen: [], areas: [] });
    expect(r.total).toBe(500);
    expect(r.groups[0].rows[0].lastPaymentDate).toBeNull();
    expect(recoveryList(paidOff, l2, '2026-07-31', 'area', { salesmen: [], areas: [] }).total).toBe(0);
  });

  it('supplier aging on an earlier date', () => {
    const s = [sup('s1', 0)];
    const l = [led({ id: 'p', entityType: 'supplier', entityId: 's1', type: 'purchase_received', date: '2026-07-02', debit: 900 }), led({ id: 'q', entityType: 'supplier', entityId: 's1', type: 'payment_made', date: '2026-07-20', credit: 900 })];
    expect(billingPayablesAging(s, l, '2026-07-10')[0].total).toBe(900);
    expect(billingPayablesAging(s, l, '2026-07-31')).toEqual([]);
  });
});

describe('Money is shown as whole rupees or with two decimals, never one', () => {
  it('moneyText and report cells', () => {
    expect(moneyText(7252.2)).toBe('7,252.20');
    expect(moneyText(0.8)).toBe('0.80');
    expect(moneyText(1192150)).toBe('1,192,150');
    expect(moneyText(-148059.16)).toBe('-148,059.16');
    expect(moneyText(-0.004)).toBe('0');
    expect(formatCell({ key: 'amount', money: true }, 7252.2)).toBe('7,252.20');
  });
});

describe('Printed reports', () => {
  it('wide reports print on A4 landscape so the last column is not cut off', () => {
    const d = data({});
    const tb = REPORTS['trial-balance-period'].build(d, { from: '2026-07-01', to: '2026-07-31', asOf: '2026-07-31' });
    expect(reportPaper(tb)).toMatchObject({ landscape: true, width: '277mm' });
    expect(reportPaper(tb).pageCss).toContain('A4 landscape');
    const cb = REPORTS['cash-book'].build(d, { from: '2026-07-01', to: '2026-07-31', asOf: '2026-07-31' });
    expect(reportPaper(cb).landscape).toBe(false);
  });
});

describe('Purchase reports agree with each other', () => {
  it('Product-wise Purchase includes supplier-bill differences / invoice rounding, so it totals Daily Purchase and Party-wise Purchase', () => {
    const d = data({
      suppliers: [sup('s1', 0)],
      products: [product('p1', 0)],
      purchases: [{ id: 'pu1', receiptNumber: 'GRN-1', supplierId: 's1', productId: 'p1', kg: 3, pricePerKg: 33.33, amount: 99.99, date: '2026-07-02', createdAt: '2026-07-02' } as Purchase],
      ledger: [
        led({ id: 'r', entityType: 'supplier', entityId: 's1', type: 'purchase_variance', referenceId: 'PI-1', date: '2026-07-02', debit: 0.01 }),
        led({ id: 'v', entityType: 'supplier', entityId: 's1', type: 'purchase_variance', referenceId: 'SB-9', date: '2026-07-03', debit: 50 }),
      ],
    });
    const f = { from: '2026-07-01', to: '2026-07-31', asOf: '2026-07-31' };
    const prod = REPORTS['product-purchases'].build(d, f).summary![0].value;
    const daily = REPORTS['daily-purchase'].build(d, f).summary![0].value;
    const party = REPORTS['party-purchases'].build(d, f).sections[0].totals!.purchase;
    expect(prod).toBe(150);
    expect(daily).toBe(150);
    expect(party).toBe(150);
  });
});

describe('Journal book / day book', () => {
  it('list the year-end closing entry and name vouchers by type', () => {
    const closing: JournalEntry = { id: 'yc', date: '2026-06-30', ref: 'YE-2025-26', memo: 'Year-end close', source: 'manual', closing: true, lines: [{ accountCode: '4000', debit: 100, credit: 0 }, { accountCode: '3200', debit: 0, credit: 100 }] };
    const cpv: JournalEntry = { id: 'v', date: '2026-06-30', ref: 'CPV-1', memo: 'Tea', source: 'manual', voucherType: 'CPV', lines: [{ accountCode: '6020', debit: 50, credit: 0 }, { accountCode: '1000', debit: 0, credit: 50 }] };
    const d = data({ journal: [closing, cpv] });
    const jb = REPORTS['journal-book'].build(d, { from: '2026-06-30', to: '2026-06-30', asOf: '2026-06-30' });
    const heads = jb.sections[0].rows.filter((r) => r.style === 'heading').map((r) => r.cells.doc);
    expect(heads).toEqual(['Year-end closing', 'Cash payment voucher']);
    expect(jb.summary!.find((s) => s.label === 'Debit')!.value).toBe(150);
    const csv = reportCsv(jb);
    expect(csv.rows.some((r) => r.includes('YE-2025-26'))).toBe(true);
  });
});
