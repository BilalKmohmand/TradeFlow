import { describe, it, expect } from 'vitest';
import { REPORTS, ReportData, ReportFilter } from '../utils/classicReports';

/** The old program's ProductWise Sale (one product, customer by customer) and City Wise Sale. */
const d = {
  products: [{ id: 'p1', code: '1', name: 'Local 5kg Daba', unit: 'pcs' }, { id: 'p2', code: '2', name: 'Local 2.5kg Daba', unit: 'pcs' }],
  customers: [{ id: 'c1', name: 'warid islam swabi', city: 'Swabi', totalDue: 0 }, { id: 'c2', name: 'Banaras Btk', city: 'Batkhela', totalDue: 0 }],
  suppliers: [],
  invoices: [
    { id: 'i1', invoiceNumber: 'S-14554', customerId: 'c1', customerName: 'warid islam swabi', issueDate: '2026-09-06', billKind: 'credit', status: 'issued', totalAmount: 4460000, items: [{ productId: 'p1', productName: 'Local 5kg Daba', qty: 2000, unitPrice: 2230, amount: 4460000 }] },
    { id: 'i2', invoiceNumber: 'S-14594', customerId: 'c1', customerName: 'warid islam swabi', issueDate: '2026-09-11', billKind: 'credit', status: 'issued', totalAmount: 2220000 + 1000, items: [{ productId: 'p1', productName: 'Local 5kg Daba', qty: 1000, unitPrice: 2220, amount: 2220000 }, { productId: 'p2', productName: 'x', qty: 1, unitPrice: 1000, amount: 1000 }] },
    { id: 'i3', invoiceNumber: 'S-14522', customerId: 'c2', customerName: 'Banaras Btk', issueDate: '2026-09-05', billKind: 'credit', status: 'issued', totalAmount: 829500, items: [{ productId: 'p1', productName: 'Local 5kg Daba', qty: 350, unitPrice: 2370, amount: 829500 }] },
  ],
  returns: [{ id: 'r1', kind: 'sales', returnNumber: 'SR-1', customerId: 'c2', date: '2026-09-20', productId: 'p1', kg: 10, pricePerKg: 2370, amount: 23700, items: [{ productId: 'p1', qty: 10, unitPrice: 2370 }] }],
  purchases: [],
  purchaseInvoices: [],
  ledger: [],
} as unknown as ReportData;
const f = { from: '2026-09-01', to: '2026-10-01', asOf: '2026-10-01' } as ReportFilter;

describe('ProductWise Sale (old format)', () => {
  it('asks for a product, not a customer', () => {
    expect(REPORTS['product-sales'].filters).toEqual(['product']);
    expect(REPORTS['product-purchases'].filters).toEqual(['product']);
  });

  it('one product: customer headings, Date | Inv # | Mode | QtyDr | QtyCr | Rate | Amount, returns in QtyDr', () => {
    const rep = REPORTS['product-sales'].build(d, { ...f, productId: 'p1' });
    const s = rep.sections[0];
    expect(s.columns.map((c) => c.label)).toEqual(['Date', 'Inv #', 'Mode', 'QtyDr', 'QtyCr', 'Rate', 'Amount']);
    expect(s.rows.map((r) => [r.style || '', r.cells.date, r.cells.ref, r.cells.qtyDr, r.cells.qtyCr, r.cells.rate, r.cells.amount])).toEqual([
      ['heading', 'Customer :', 'Banaras Btk', null, null, null, null],
      ['', '2026-09-05', 'S-14522', 0, 350, 2370, 829500],
      ['', '2026-09-20', 'SR-1', 10, 0, 2370, -23700],
      ['heading', 'Customer :', 'warid islam swabi', null, null, null, null],
      ['', '2026-09-06', 'S-14554', 0, 2000, 2230, 4460000],
      ['', '2026-09-11', 'S-14594', 0, 1000, 2220, 2220000],
    ]);
    expect(s.totals).toMatchObject({ qtyDr: 10, qtyCr: 3350, amount: 829500 - 23700 + 4460000 + 2220000 });
  });

  it('no product: every product in one list (as before); PartyWise Product Sale Detail takes the customer', () => {
    expect(REPORTS['product-sales'].build(d, f).sections[0].rows.length).toBe(2);
    const one = REPORTS['party-product-sales'].build(d, { ...f, customerId: 'c2' });
    expect(one.title).toBe('PartyWise Product Sale Detail');
    expect(one.sections[0].rows.map((r) => [r.cells.code, r.cells.qty, r.cells.amount])).toEqual([['1', 340, 805800]]);
  });

  it('City Wise Sale adds up each city', () => {
    const rows = REPORTS['city-sales'].build(d, f).sections[0].rows.map((r) => [r.cells.city, r.cells.bills, r.cells.sale, r.cells.returns, r.cells.net]);
    expect(rows).toEqual([['Swabi', 2, 6681000, 0, 6681000], ['Batkhela', 1, 829500, 23700, 805800]]);
  });
});
