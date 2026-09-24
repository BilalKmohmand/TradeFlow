/**
 * CSV import of the masters (customers, suppliers, items): which column is which, and which rows can be
 * added. Pure functions so the Data Import screen and the tests use the same rules.
 *
 *  - Column names are matched loosely: the template's own names (name, company, code…), the headings of
 *    our own CSV downloads (Code, Name, Phone, City, Contact person, Sales tax #, Balance (Rs.)…) and common
 *    spellings from other programs (Party Name, Mobile, Account Code…). So a file downloaded from the
 *    Customers screen can be imported again as it is.
 *  - Only the name is required. The phone, when given, must not already belong to someone else; the ID /
 *    item code and barcode must not already be used (on this device or earlier in the same file).
 *  - Urdu names are kept exactly as typed (the file is read as UTF-8; Excel's "CSV UTF-8" works).
 */
import { foldText } from './search';

export type ImportKind = 'customers' | 'suppliers' | 'products';

type Field =
  | 'name' | 'company' | 'phone' | 'email' | 'address' | 'code' | 'city' | 'contactPerson' | 'salesTaxNo' | 'fax'
  | 'creditLimit' | 'openingDue' | 'openingOwed' | 'materialCategory'
  | 'category' | 'brand' | 'barcode' | 'unit' | 'unitPricePerKg' | 'costPricePerKg' | 'stockKg' | 'minThresholdKg' | 'supplierCompany' | 'description' | 'packName' | 'packSize';

/** Header text → a comparable key: "Sales Tax #" → "salestax", "Credit limit (Rs.)" → "creditlimit". */
export const headerKey = (h: string): string =>
  foldText(h.replace(/^﻿/, ''))
    .replace(/\((rs\.?|rs|kg|pcs)\)/g, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, '')
    .replace(/(no|number|#)$/, '');

const PARTY: Record<string, Field> = {
  name: 'name', partyname: 'name', customername: 'name', suppliername: 'name', accountname: 'name', title: 'name',
  company: 'company', shop: 'company', shopname: 'company', business: 'company', firm: 'company',
  phone: 'phone', mobile: 'phone', cell: 'phone', contact: 'phone', phoneno: 'phone', mobileno: 'phone',
  email: 'email', address: 'address',
  code: 'code', id: 'code', customerid: 'code', supplierid: 'code', accountcode: 'code', partycode: 'code', customercode: 'code', suppliercode: 'code',
  city: 'city', town: 'city', citytown: 'city',
  contactperson: 'contactPerson', salestax: 'salesTaxNo', strn: 'salesTaxNo', stn: 'salesTaxNo', salestaxno: 'salesTaxNo', fax: 'fax',
};
const CUSTOMER: Record<string, Field> = {
  ...PARTY, creditlimit: 'creditLimit', limit: 'creditLimit',
  openingdue: 'openingDue', opening: 'openingDue', openingbalance: 'openingDue', balance: 'openingDue', outstanding: 'openingDue', owes: 'openingDue',
};
const SUPPLIER: Record<string, Field> = {
  ...PARTY, materialcategory: 'materialCategory', category: 'materialCategory',
  openingowed: 'openingOwed', opening: 'openingOwed', openingbalance: 'openingOwed', balance: 'openingOwed', payable: 'openingOwed', youowe: 'openingOwed',
};
const PRODUCT: Record<string, Field> = {
  name: 'name', item: 'name', itemname: 'name', product: 'name', productname: 'name',
  code: 'code', itemcode: 'code', productcode: 'code', barcode: 'barcode', ean: 'barcode',
  category: 'category', group: 'category', itemgroup: 'category', brand: 'brand', company: 'brand',
  unit: 'unit', soldper: 'unit',
  unitpriceperkg: 'unitPricePerKg', price: 'unitPricePerKg', saleprice: 'unitPricePerKg', sellingprice: 'unitPricePerKg', rate: 'unitPricePerKg', pricerskg: 'unitPricePerKg',
  costpriceperkg: 'costPricePerKg', cost: 'costPricePerKg', costprice: 'costPricePerKg', purchaseprice: 'costPricePerKg',
  stockkg: 'stockKg', stock: 'stockKg', qty: 'stockKg', quantity: 'stockKg', openingstock: 'stockKg',
  minthresholdkg: 'minThresholdKg', reorderlevel: 'minThresholdKg', minstock: 'minThresholdKg',
  suppliercompany: 'supplierCompany', supplier: 'supplierCompany', description: 'description',
  pack: 'packName', packname: 'packName', packsize: 'packSize', perpack: 'packSize',
};
const MAPS: Record<ImportKind, Record<string, Field>> = { customers: CUSTOMER, suppliers: SUPPLIER, products: PRODUCT };

/** The field each column holds (null = a column we don't use), and the required columns that are missing. */
export const mapColumns = (kind: ImportKind, headers: string[]): { fields: (Field | null)[]; missing: string[] } => {
  const map = MAPS[kind];
  const seen = new Set<Field>();
  const fields = headers.map((h) => {
    const f = map[headerKey(h)] || null;
    if (!f || seen.has(f)) return null; // the first column of a kind wins
    seen.add(f);
    return f;
  });
  return { fields, missing: seen.has('name') ? [] : ['name'] };
};

export interface ImportRow {
  line: number;
  values: Partial<Record<Field, string>>;
}
export interface ImportPlan {
  add: ImportRow[];
  skipped: { line: number; reason: string }[];
}

const digits = (v?: string) => (v || '').replace(/[^0-9]/g, '');
const key = (v?: string) => foldText(v || '');

/** Which rows can be added, and why the others are skipped. `existing` = what is already on the device. */
export const planImport = (
  kind: ImportKind,
  headers: string[],
  rows: string[][],
  existing: { name: string; phone?: string; code?: string; barcode?: string }[]
): ImportPlan => {
  const { fields } = mapColumns(kind, headers);
  const phones = new Set(existing.map((x) => digits(x.phone)).filter((p) => p.length >= 5));
  const codes = new Set(existing.map((x) => key(x.code)).filter(Boolean));
  const barcodes = new Set(existing.map((x) => (x.barcode || '').trim()).filter(Boolean));
  const names = new Set(kind === 'products' ? existing.map((x) => key(x.name)) : []);
  const plan: ImportPlan = { add: [], skipped: [] };
  rows.forEach((row, i) => {
    const line = i + 2;
    const values: Partial<Record<Field, string>> = {};
    fields.forEach((f, j) => {
      if (f) values[f] = (row[j] || '').trim();
    });
    const skip = (reason: string) => plan.skipped.push({ line, reason });
    if (!values.name) return skip('the name is empty.');
    const code = key(values.code);
    if (code && codes.has(code)) return skip(`${values.name}: ${kind === 'products' ? 'item code' : 'ID'} ${values.code} is already used.`);
    if (kind === 'products') {
      if (names.has(key(values.name))) return skip(`${values.name}: an item with this name already exists.`);
      const bc = (values.barcode || '').trim();
      if (bc && barcodes.has(bc)) return skip(`${values.name}: barcode ${bc} is already on another item.`);
      if (bc) barcodes.add(bc);
      names.add(key(values.name));
    } else {
      const ph = digits(values.phone);
      if (ph.length >= 5 && phones.has(ph)) return skip(`${values.name}: phone ${values.phone} is already used.`);
      if (ph.length >= 5) phones.add(ph);
    }
    if (code) codes.add(code);
    plan.add.push({ line, values });
  });
  return plan;
};

/** "1,25,000", "Rs. 500", "(2000)" → numbers (never below zero). */
/** A number that may be negative (opening balances: negative = advance). */
export const importSignedNumber = (v?: string): number => Math.round((parseFloat((v || '').replace(/[^0-9.\-]/g, '')) || 0) * 100) / 100;
export const importNumber = (v?: string): number => Math.max(0, parseFloat((v || '').replace(/[^0-9.\-]/g, '')) || 0);
