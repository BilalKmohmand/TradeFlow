import { describe, it, expect } from 'vitest';
import { foldText, matcher, matchesQuery, phoneDigits } from '../utils/search';
import { filterParties, searchAccounts, accountOptions } from '../utils/vouchers';
import { filterBills } from '../utils/billing';
import { matchesPurchaseInvoice } from '../utils/purchaseInvoices';
import { filterCheques } from '../utils/cheques';
import { findOption } from '../components/billing/QuickPick';
import { DEFAULT_ACCOUNTS } from '../utils/accounting';
import type { Cheque, Customer, Invoice, Supplier } from '../types';

/**
 * Every search box in the app goes through utils/search.ts, so one set of rules holds everywhere:
 * name, code, shop name, phone (with spaces / +92), city, bill / memo number; any case; Urdu variants.
 */
const cust = (id: string, name: string, extra: Partial<Customer> = {}): Customer => ({ id, name, company: name, phone: '', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01', ...extra });
const customers: Customer[] = [
  cust('c1', 'Zaman and Co BTK', { code: 'C-0001', company: 'Zaman Shop', phone: '0344 3838294', city: 'Batkhela' }),
  cust('c2', 'Haji Karim Kiryana Store', { code: 'C-0002', company: 'Karim General Store', phone: '03001234567', city: 'Mingora' }),
  cust('c3', 'محمد اسلم کریانہ سٹور', { code: 'C-0003', phone: '+92 311 1222333', city: 'بٹ خیلہ' }),
  cust('c4', 'Al-Madina General Store & Wholesale Dealers Malakand Division', { code: 'C-0040', city: 'Thana' }),
];

describe('utils/search: one matching rule', () => {
  it('folds case, punctuation, "&" and Urdu letter variants', () => {
    expect(foldText('  ZAMAN & Co.  ')).toBe('zaman and co');
    // Arabic keyboard yeh / kaf / heh → Urdu ی / ک / ہ
    expect(foldText('كريانه')).toBe(foldText('کریانہ'));
  });
  it('phones: spaces, dashes and +92 are all the same number', () => {
    expect(phoneDigits('+92 300 1234567')).toBe('03001234567');
    expect(phoneDigits('0300-1234567')).toBe('03001234567');
    expect(matchesQuery('0300 123', [], ['03001234567'])).toBe(true);
    expect(matchesQuery('+92 300 1234567', [], ['0300 1234567'])).toBe(true);
    // Fewer than 3 digits never matches a phone (a code like "Z01" is not every phone with "01").
    expect(matchesQuery('01', [], ['0300 1234501'])).toBe(false);
  });
  it('codes with or without the dash, words in any order', () => {
    const m = matcher('c0001');
    expect(m(['C-0001'])).toBe(true);
    expect(matcher('inv12')(['INV-12'])).toBe(true);
    expect(matcher('store karim')(['Haji Karim Kiryana Store'])).toBe(true);
    expect(matcher('')(['anything'])).toBe(true);
    expect(matcher('zzz')(['Zaman'])).toBe(false);
  });
});

describe('customer / supplier lists (filterParties) and the account picker', () => {
  const names = (q: string, city = '') => filterParties(customers, q, city).map((c) => c.id);
  it('finds by name, code, shop name, phone with spaces, city, Urdu, any case', () => {
    expect(names('ZAMAN')).toEqual(['c1']);
    expect(names('c-0002')).toEqual(['c2']);
    expect(names('C0002')).toEqual(['c2']);
    expect(names('karim general')).toEqual(['c2']);
    expect(names('0344 3838')).toEqual(['c1']);
    expect(names('0311 1222')).toEqual(['c3']); // stored as +92 311…
    expect(names('mingora')).toEqual(['c2']);
    expect(names('اسلم')).toEqual(['c3']);
    expect(names('بٹ خیلہ')).toEqual(['c3']);
    expect(names('کريانہ')).toEqual(['c3']); // typed with an Arabic yeh
    expect(names('malakand wholesale')).toEqual(['c4']);
    expect(names('', 'thana')).toEqual(['c4']);
  });
  it('voucher / ledger account picker searches the same way (code, name, shop, phone, city)', () => {
    const suppliers: Supplier[] = [{ id: 's1', name: 'Imran', company: 'Habib Oil Mills', phone: '0321 7654321', email: '', materialCategory: '', totalOwed: 0, address: '', createdAt: '', code: 'S-0001', city: 'Karachi' }];
    const opts = accountOptions(DEFAULT_ACCOUNTS, customers, suppliers);
    const refs = (q: string) => searchAccounts(opts, q).map((o) => o.ref);
    expect(refs('s0001')[0]).toBe('supp:s1');
    expect(refs('0321 765')).toEqual(['supp:s1']);
    expect(refs('imran')).toEqual(['supp:s1']); // contact name of the supplier
    expect(refs('karim general')).toEqual(['cust:c2']);
    expect(refs('1000')[0]).toBe('1000');
  });
});

describe('bill, purchase and cheque lists', () => {
  const today = '2026-09-23';
  const bill = (n: number, c: Customer, memo: string): Invoice => ({ id: `i${n}`, invoiceNumber: `INV-${n}`, memoNo: memo, customerId: c.id, customerName: c.name, customerPhone: c.phone, issueDate: today, dueDate: today, status: 'issued', paymentStatus: 'unpaid', billKind: 'credit', items: [{ id: 'x', productId: 'p', productName: 'Dalda 16 L Tin', kg: 1, ratePerKg: 1, amount: 1 }], subtotal: 1, taxRatePct: 0, taxAmount: 0, totalAmount: 1, paidAmount: 0, balanceDue: 1, createdAt: today });
  const bills = [bill(1, customers[0], 'M-501'), bill(12, customers[1], 'M-777'), bill(3, customers[2], '')];
  const ids = (q: string) => filterBills(bills, q, 'all', today, false, customers).map((b) => b.id).sort();
  it('bills: by bill no. (with or without dash), memo, name, shop, phone with spaces, code, city', () => {
    expect(ids('inv12')).toEqual(['i12']);
    expect(ids('M-777')).toEqual(['i12']);
    expect(ids('KARIM')).toEqual(['i12']);
    expect(ids('karim general')).toEqual(['i12']);
    expect(ids('0300 1234')).toEqual(['i12']);
    expect(ids('c-0001')).toEqual(['i1']);
    expect(ids('batkhela')).toEqual(['i1']);
    expect(ids('اسلم')).toEqual(['i3']);
  });
  it('purchase invoices: number, supplier bill no., supplier code / phone / city, item code', () => {
    const inv = { invoiceNumber: 'P-12', memoNo: 'DF-4471', supplierName: 'Dalda Foods', lines: [{ productName: 'Ghee tin', code: '101' }] };
    const sup = { code: 'S-0003', name: 'Ahmed', city: 'Karachi', phone: '0300 1112223' };
    expect(matchesPurchaseInvoice(inv, 'p12', sup)).toBe(true);
    expect(matchesPurchaseInvoice(inv, 'df4471', sup)).toBe(true);
    expect(matchesPurchaseInvoice(inv, 's-0003', sup)).toBe(true);
    expect(matchesPurchaseInvoice(inv, '0300 111', sup)).toBe(true);
    expect(matchesPurchaseInvoice(inv, 'KARACHI', sup)).toBe(true);
    expect(matchesPurchaseInvoice(inv, 'dalda ghee', sup)).toBe(true);
    expect(matchesPurchaseInvoice(inv, 'habib', sup)).toBe(false);
  });
  it('cheques: party, cheque no., bank, any case', () => {
    const chq = (id: string, partyName: string, chequeNumber: string, bankName: string): Cheque => ({ id, direction: 'received', partyName, chequeNumber, bankName, amount: 1000, chequeDate: today, entryDate: today, status: 'in_hand', createdAt: today });
    const list = [chq('a', 'Zaman and Co BTK', '100200', 'MCB'), chq('b', 'حاجی نور محمد', '778899', 'HBL')];
    expect(filterCheques(list, 'all', today, 'ZAMAN').map((c) => c.id)).toEqual(['a']);
    expect(filterCheques(list, 'all', today, 'hbl').map((c) => c.id)).toEqual(['b']);
    expect(filterCheques(list, 'all', today, 'نور').map((c) => c.id)).toEqual(['b']);
  });
});

describe('type-to-find in a name list (QuickSelect)', () => {
  it('codes without the dash, shop name, phone with spaces, Urdu', () => {
    const opts = customers.map((c) => ({ value: c.id, name: c.name, code: c.code, extra: [c.company, c.phone, c.city].join(' ') }));
    expect(findOption(opts, 'c0002')?.value).toBe('c2');
    expect(findOption(opts, 'karim general')?.value).toBe('c2'); // the shop name
    expect(findOption(opts, '0344 3838')?.value).toBe('c1');
    expect(findOption(opts, 'محمد')?.value).toBe('c3');
  });
});
