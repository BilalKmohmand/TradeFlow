/**
 * Apna Accountant's Coding menu: the small master lists (units, product groups, manufacturers), the
 * Accounts Opening Balances grid and the Opening Stocks grid. Pure functions only; the actions that
 * change data are in context/codingActions.ts.
 *
 *  - Units, groups and manufacturers are kept as lists in the settings and on the items themselves
 *    (Product.unit / category / brand). A list shows both, so nothing an item already uses goes missing.
 *  - Accounts Opening Balances: cash (1000), every bank, every customer and supplier. Customer / supplier
 *    openings are their "Opening balance" ledger row (setOpeningBalance); cash / bank are the settings'
 *    opening figures. All post against Opening balance equity (3900), so the trial balance stays balanced.
 *  - Opening Stocks: an item's opening quantity is today's stock with every movement undone
 *    (accounting.openingStockQty). Setting it moves today's stock by the difference, so the journal's
 *    opening-stock entry (Dr Inventory / Cr 3900, at the item's cost) follows by itself.
 */
import { AppSettings, Customer, Godown, LedgerEntry, Product, StockBatch, Supplier } from '../types';
import { distinctValues, itemGroup } from './purchasing';
import { mainLooseQty, withMainGodown } from './inventory';
import { BankAccount } from './banks';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The units an item can be sold in when the shop has not made its own list. */
export const DEFAULT_UNITS = ['pcs', 'kg', 'bag', 'box', 'can', 'tin', 'ctn', 'litre', 'dozen', 'carton', 'ton'];

export type CodingListKind = 'unit' | 'group' | 'manufacturer';
export const CODING_LIST_SETTING: Record<CodingListKind, 'productUnits' | 'productGroups' | 'manufacturers'> = {
  unit: 'productUnits',
  group: 'productGroups',
  manufacturer: 'manufacturers',
};
export const CODING_LIST_NAME: Record<CodingListKind, { one: string; many: string }> = {
  unit: { one: 'unit', many: 'units' },
  group: { one: 'product group', many: 'product groups' },
  manufacturer: { one: 'manufacturer', many: 'manufacturers' },
};

/** What an item holds for this list. */
export const itemValue = (kind: CodingListKind, p: Product): string =>
  kind === 'unit' ? (p.unit || '').trim() : kind === 'group' ? itemGroup(p) : (p.brand || '').trim();

/** The kept list (settings) — for units the built-in list until the shop edits it. */
export const storedList = (kind: CodingListKind, settings: Pick<AppSettings, 'productUnits' | 'productGroups' | 'manufacturers'>): string[] => {
  const v = settings[CODING_LIST_SETTING[kind]];
  return Array.isArray(v) ? v : kind === 'unit' ? DEFAULT_UNITS : [];
};

/** The list shown on the Coding screen and offered on items: kept list + what items use, A→Z, each once. */
export const codingList = (kind: CodingListKind, settings: Pick<AppSettings, 'productUnits' | 'productGroups' | 'manufacturers'>, products: Product[]): string[] =>
  distinctValues([...storedList(kind, settings), ...products.map((p) => itemValue(kind, p))]);

/** Items using a value (case-insensitive). */
export const itemsUsing = (kind: CodingListKind, products: Product[], name: string): Product[] => {
  const n = name.trim().toLowerCase();
  return products.filter((p) => itemValue(kind, p).toLowerCase() === n);
};

// ---------------------------------------------------------------------------------------------------------
// Accounts Opening Balances
// ---------------------------------------------------------------------------------------------------------
export interface OpeningRow {
  /** 'cash' | 'bank:<code>' | 'cust:<id>' | 'supp:<id>' */
  ref: string;
  kind: 'Cash' | 'Bank' | 'Customer' | 'Supplier';
  code: string;
  title: string;
  city?: string;
  /** Debit-positive opening (customer owes / cash / bank = debit; supplier we owe = credit). */
  amount: number;
}

/** Opening (old khata) balance of a party from its "Opening balance" ledger row, debit-positive. */
export const partyOpening = (ledger: LedgerEntry[], type: 'customer' | 'supplier', id: string): number => {
  const row = ledger.find((l) => l.entityType === type && l.entityId === id && l.type === 'opening_balance');
  return row ? round2((Number(row.debit) || 0) - (Number(row.credit) || 0)) : 0;
};

/** Every account the Opening Balances grid lists, in the old program's order: cash, banks, customers, suppliers. */
export const openingRows = (d: { settings: Pick<AppSettings, 'cashOpeningBalance'>; banks: BankAccount[]; customers: Customer[]; suppliers: Supplier[]; ledger: LedgerEntry[] }): OpeningRow[] => {
  const byCode = <T extends { code?: string; name: string }>(a: T, b: T) => (a.code || '~').localeCompare(b.code || '~', undefined, { numeric: true }) || a.name.localeCompare(b.name);
  const rows: OpeningRow[] = [{ ref: 'cash', kind: 'Cash', code: '1000', title: 'Cash in hand', amount: round2(Number(d.settings.cashOpeningBalance) || 0) }];
  d.banks.forEach((b) => rows.push({ ref: `bank:${b.code}`, kind: 'Bank', code: b.code, title: b.name, amount: round2(Number(b.openingBalance) || 0) }));
  [...d.customers].sort(byCode).forEach((c) => rows.push({ ref: `cust:${c.id}`, kind: 'Customer', code: c.code || '', title: c.name, city: c.city, amount: partyOpening(d.ledger, 'customer', c.id) }));
  [...d.suppliers].map((s) => ({ ...s, name: s.company || s.name })).sort(byCode).forEach((s) => rows.push({ ref: `supp:${s.id}`, kind: 'Supplier', code: s.code || '', title: s.name, city: s.city, amount: -partyOpening(d.ledger, 'supplier', s.id) }));
  return rows;
};

/** Debit / credit columns of a debit-positive amount. */
export const drCrOf = (amount: number) => ({ debit: amount > 0 ? round2(amount) : 0, credit: amount < 0 ? round2(-amount) : 0 });

/** Totals of the grid and what goes to Opening balance equity (3900) to balance it. */
export const openingTotals = (rows: { amount: number }[]) => {
  const debit = round2(rows.reduce((a, r) => a + (r.amount > 0 ? r.amount : 0), 0));
  const credit = round2(rows.reduce((a, r) => a + (r.amount < 0 ? -r.amount : 0), 0));
  return { debit, credit, equity: round2(debit - credit) };
};

// ---------------------------------------------------------------------------------------------------------
// Opening Stocks
// ---------------------------------------------------------------------------------------------------------
/** Opening quantity of an item in each store: others as entered, the main godown the rest of the total. */
export const openingByStore = (product: Product, totalOpening: number, godowns: Godown[]): Record<string, number> => {
  const all = withMainGodown(godowns);
  const mainId = all[0].id;
  const out: Record<string, number> = {};
  let others = 0;
  all.slice(1).forEach((g) => {
    const q = round2(Number(product.openingByGodown?.[g.id]) || 0);
    out[g.id] = q;
    others += q;
  });
  out[mainId] = round2(totalOpening - others);
  return out;
};

export interface OpeningStockChange {
  ok: boolean;
  message?: string;
  /** Change to today's stock (and the store's own stock). */
  delta: number;
  /** The item's stored openings of the other stores after the change. */
  openingByGodown?: Record<string, number>;
}

/**
 * Plan setting an item's opening quantity in one store. Today's stock moves by the same amount (in that
 * store); refused if that would leave less than nothing because the stock has already gone out.
 */
export const planOpeningStock = (product: Product, totalOpening: number, godowns: Godown[], rows: StockBatch[], godownId: string, qty: number): OpeningStockChange => {
  const q = round2(Number(qty));
  if (!Number.isFinite(q) || q < 0) return { ok: false, message: 'Enter the opening quantity (0 or more).', delta: 0 };
  const all = withMainGodown(godowns);
  const store = all.find((g) => g.id === godownId);
  if (!store) return { ok: false, message: 'Pick the store.', delta: 0 };
  const isMain = store.id === all[0].id;
  const current = openingByStore(product, totalOpening, godowns)[store.id] || 0;
  const delta = round2(q - current);
  if (delta === 0) return { ok: true, delta: 0 };
  const unit = product.unit || 'pcs';
  if (round2(product.stockKg + delta) < 0) return { ok: false, message: `${product.name}: ${round2(-delta)} ${unit} have already gone out, so the opening can't be that low.`, delta: 0 };
  const held = isMain ? mainLooseQty(product, rows) : round2(rows.filter((r) => r.productId === product.id && r.godownId === store.id && !r.batchNo).reduce((a, r) => a + r.qty, 0));
  if (round2(held + delta) < 0) return { ok: false, message: `${product.name}: only ${held} ${unit} are left in ${store.name}, so its opening can't go down by ${round2(-delta)}.`, delta: 0 };
  if (isMain) return { ok: true, delta };
  const next = { ...(product.openingByGodown || {}) };
  if (q === 0) delete next[store.id];
  else next[store.id] = q;
  return { ok: true, delta, openingByGodown: next };
};
