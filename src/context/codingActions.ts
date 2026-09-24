import React from 'react';
import { AppSettings, CashEntry, Customer, Dispatch, Expense, Godown, Invoice, LedgerEntry, Product, Purchase, StockAdjustment, StockBatch, StockReturn, Supplier } from '../types';
import { booksLockedFor, openingStockQty } from '../utils/accounting';
import { BankAccount, MAIN_BANK_CODE } from '../utils/banks';
import { CODING_LIST_NAME, CODING_LIST_SETTING, CodingListKind, codingList, itemsUsing, planOpeningStock, storedList } from '../utils/coding';
import { godownName, invId, withMainGodown } from '../utils/inventory';
import { formatCurrency } from '../utils/formatters';

/**
 * Coding menu actions (see utils/coding.ts): Product Unit / Product Group / Manufacturer Coding lists,
 * Accounts Opening Balances (bulk) and Opening Stocks. Store Coding is the godowns list and City Coding the
 * city list, which have their own actions (inventoryStore.ts / voucherActions.ts).
 */
type Result = { success: boolean; message: string };
const ok = (message: string): Result => ({ success: true, message });
const fail = (message: string): Result => ({ success: false, message });
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface OpeningEntry {
  /** 'cash' | 'bank:<code>' | 'cust:<id>' | 'supp:<id>' (utils/coding.ts openingRows). */
  ref: string;
  /** Debit-positive (a supplier we owe is negative, as in the grid's Credit column). */
  amount: number;
}

export interface CodingApi {
  productUnits: string[];
  productGroups: string[];
  manufacturers: string[];
  addCodingItem: (kind: CodingListKind, name: string) => Result;
  /** Rename a unit / group / manufacturer; every item using it follows. */
  renameCodingItem: (kind: CodingListKind, from: string, to: string) => Result;
  removeCodingItem: (kind: CodingListKind, name: string) => Result;
  /** Accounts Opening Balances: save the changed rows of the grid (cash, banks, customers, suppliers). */
  saveAccountOpenings: (rows: OpeningEntry[], date?: string) => Result;
  /** Opening Stocks: an item's opening quantity in a store (and its opening rate = cost price when given). */
  setOpeningStock: (input: { productId: string; godownId?: string; qty: number; rate?: number }) => Result;
}

interface Deps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  customers: Customer[];
  suppliers: Supplier[];
  ledger: LedgerEntry[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  adjustments: StockAdjustment[];
  purchases: Purchase[];
  invoices: Invoice[];
  dispatches: Dispatch[];
  returns: StockReturn[];
  godowns: Godown[];
  stockBatches: StockBatch[];
  updateRows: (fn: (rows: StockBatch[]) => StockBatch[]) => void;
  bankAccounts: BankAccount[];
  setOpeningBalance: (entityType: 'customer' | 'supplier', id: string, amount: number, date?: string) => Result;
  can: (p: string) => boolean;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: any) => void;
  today: () => string;
}

export const createCodingApi = (d: Deps): CodingApi => {
  const lists = {
    unit: codingList('unit', d.settings, d.products),
    group: codingList('group', d.settings, d.products),
    manufacturer: codingList('manufacturer', d.settings, d.products),
  };
  const canEditItems = () => d.can('products:create');
  const clean = (s: string) => (s || '').trim().replace(/\s+/g, ' ');
  const setList = (kind: CodingListKind, fn: (list: string[]) => string[]) =>
    d.setSettings((prev) => ({ ...prev, [CODING_LIST_SETTING[kind]]: fn(storedList(kind, prev)) }));
  const field = (kind: CodingListKind): 'unit' | 'category' | 'brand' => (kind === 'unit' ? 'unit' : kind === 'group' ? 'category' : 'brand');

  const addCodingItem: CodingApi['addCodingItem'] = (kind, name) => {
    const n = CODING_LIST_NAME[kind];
    if (!canEditItems()) return fail(`You don't have permission to change the ${n.many}.`);
    const v = clean(name);
    if (!v) return fail(`Enter the ${n.one} name.`);
    if (lists[kind].some((x) => x.toLowerCase() === v.toLowerCase())) return fail(`${v} is already in the list.`);
    setList(kind, (l) => [...l, v]);
    d.logAuditEvent('Coding Added', `${n.one}: ${v}`, 'info', 'data');
    return ok(`${v} added.`);
  };

  const renameCodingItem: CodingApi['renameCodingItem'] = (kind, from, to) => {
    const n = CODING_LIST_NAME[kind];
    if (!canEditItems()) return fail(`You don't have permission to change the ${n.many}.`);
    const old = clean(from);
    const v = clean(to);
    if (!v) return fail(`Enter the ${n.one} name.`);
    if (!lists[kind].some((x) => x.toLowerCase() === old.toLowerCase())) return fail(`${old} is not in the list.`);
    if (v.toLowerCase() !== old.toLowerCase() && lists[kind].some((x) => x.toLowerCase() === v.toLowerCase())) return fail(`${v} is already in the list.`);
    const users = new Set(itemsUsing(kind, d.products, old).map((p) => p.id));
    setList(kind, (l) => [...l.filter((x) => x.toLowerCase() !== old.toLowerCase()), v]);
    if (users.size) d.setProducts((prev) => prev.map((p) => (users.has(p.id) ? { ...p, [field(kind)]: v } : p)));
    d.logAuditEvent('Coding Renamed', `${n.one}: ${old} → ${v}${users.size ? ` (${users.size} item${users.size === 1 ? '' : 's'})` : ''}`, 'info', 'data');
    return ok(`${old} renamed to ${v}${users.size ? ` on ${users.size} item${users.size === 1 ? '' : 's'}` : ''}.`);
  };

  const removeCodingItem: CodingApi['removeCodingItem'] = (kind, name) => {
    const n = CODING_LIST_NAME[kind];
    if (!canEditItems()) return fail(`You don't have permission to change the ${n.many}.`);
    const v = clean(name);
    const users = itemsUsing(kind, d.products, v);
    if (users.length) return fail(`${v} is used by ${users.length} item${users.length === 1 ? '' : 's'} (${users.slice(0, 3).map((p) => p.name).join(', ')}${users.length > 3 ? '…' : ''}). Change those items first.`);
    setList(kind, (l) => l.filter((x) => x.toLowerCase() !== v.toLowerCase()));
    d.logAuditEvent('Coding Removed', `${n.one}: ${v}`, 'warning', 'data');
    return ok(`${v} removed.`);
  };

  const saveAccountOpenings: CodingApi['saveAccountOpenings'] = (rows, date) => {
    if (!d.can('view_finance') || !d.can('data:write')) return fail('Only a manager or admin can change opening balances.');
    const when = date || d.settings.cashOpeningDate || d.today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(when)) return fail('Enter the date of the opening balances.');
    if (when > d.today()) return fail('The opening date cannot be in the future.');
    const money = rows.filter((r) => r.ref === 'cash' || r.ref.startsWith('bank:'));
    const parties = rows.filter((r) => r.ref.startsWith('cust:') || r.ref.startsWith('supp:'));
    const bad = rows.find((r) => !Number.isFinite(Number(r.amount)));
    if (bad) return fail('Enter every opening balance as a number.');
    // Cash and bank openings count in every day from the opening date: not inside a closed period.
    if (money.length) {
      const openDate = d.settings.cashOpeningDate || when;
      const locked = booksLockedFor(d.settings, openDate < when ? openDate : when);
      if (locked) return fail(`Opening cash and bank can't be changed: ${locked}`);
      const unknown = money.find((r) => r.ref !== 'cash' && !d.bankAccounts.some((b) => `bank:${b.code}` === r.ref));
      if (unknown) return fail('A bank account in the list no longer exists.');
    }
    let changed = 0;
    const errors: string[] = [];
    parties.forEach((r) => {
      const type = r.ref.startsWith('cust:') ? 'customer' : 'supplier';
      const id = r.ref.slice(5);
      const exists = type === 'customer' ? d.customers.some((c) => c.id === id) : d.suppliers.some((s) => s.id === id);
      if (!exists) return errors.push(`A ${type} in the list no longer exists.`);
      const hasRow = d.ledger.some((l) => l.entityType === type && l.entityId === id && l.type === 'opening_balance');
      // A supplier's opening is "we owe them" positive: the grid's credit.
      const amt = round2(type === 'customer' ? Number(r.amount) : -Number(r.amount));
      const res = d.setOpeningBalance(type, id, amt, hasRow ? undefined : when);
      if (!res.success) errors.push(res.message);
      else if (res.message !== 'Opening balance unchanged.') changed += 1;
    });
    if (money.length) {
      const patch: Partial<AppSettings> = {};
      const others: Record<string, number> = {};
      money.forEach((r) => {
        const amt = round2(Number(r.amount));
        if (r.ref === 'cash') patch.cashOpeningBalance = amt;
        else if (r.ref === `bank:${MAIN_BANK_CODE}`) patch.openingBankBalance = amt;
        else others[r.ref.slice(5)] = amt;
      });
      d.setSettings((prev) => ({
        ...prev,
        ...patch,
        ...(Object.keys(others).length ? { bankOpenings: { ...(prev.bankOpenings || {}), ...others } } : {}),
        cashOpeningDate: prev.cashOpeningDate || when,
      }));
      changed += money.length;
      d.logAuditEvent('Opening Balances', money.map((r) => `${r.ref === 'cash' ? 'Cash' : d.bankAccounts.find((b) => `bank:${b.code}` === r.ref)?.name || r.ref} ${formatCurrency(r.amount)}`).join(', '), 'warning', 'data');
    }
    if (errors.length) return fail(`${changed ? `${changed} saved, but ` : ''}${errors[0]}`);
    return ok(changed ? `Opening balances saved (${changed} account${changed === 1 ? '' : 's'}).` : 'Nothing changed.');
  };

  const setOpeningStock: CodingApi['setOpeningStock'] = (input) => {
    if (!d.can('stock:adjust')) return fail("You don't have permission to change stock. Ask a manager or admin.");
    const product = d.products.find((p) => p.id === input.productId);
    if (!product) return fail('Pick an item.');
    const all = withMainGodown(d.godowns);
    const godownId = input.godownId || all[0].id;
    const opening = openingStockQty({ settings: d.settings, ledger: d.ledger, expenses: d.expenses, cashEntries: d.cashEntries, adjustments: d.adjustments, purchases: d.purchases, products: d.products, invoices: d.invoices, dispatches: d.dispatches, returns: d.returns });
    const locked = booksLockedFor(d.settings, opening.date);
    if (locked) return fail(`Opening stock is in a closed period. ${locked}`);
    const rate = input.rate != null && Number.isFinite(Number(input.rate)) ? round2(Number(input.rate)) : undefined;
    if (rate != null && rate < 0) return fail('The rate cannot be less than 0.');
    const plan = planOpeningStock(product, opening.qty.get(product.id) || 0, d.godowns, d.stockBatches, godownId, input.qty);
    if (!plan.ok) return fail(plan.message || 'Opening stock not saved.');
    const rateChanged = rate != null && rate > 0 && rate !== round2(product.costPricePerKg || 0);
    if (plan.delta === 0 && !rateChanged) return ok('Opening stock unchanged.');
    const isMain = godownId === all[0].id;
    d.setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? {
              ...p,
              stockKg: round2(p.stockKg + plan.delta),
              ...(plan.openingByGodown ? { openingByGodown: plan.openingByGodown } : {}),
              ...(rateChanged ? { costPricePerKg: rate } : {}),
            }
          : p
      )
    );
    if (!isMain && plan.delta !== 0) {
      const today = d.today();
      d.updateRows((rows) => {
        const loose = rows.find((r) => r.productId === product.id && r.godownId === godownId && !r.batchNo);
        if (loose) return rows.map((r) => (r === loose ? { ...r, qty: round2(r.qty + plan.delta) } : r));
        return [...rows, { id: invId('stk'), productId: product.id, godownId, batchNo: '', qty: round2(plan.delta), receivedDate: opening.date || today, createdAt: today }];
      });
    }
    const unit = product.unit || 'pcs';
    const where = all.length > 1 ? ` in ${godownName(d.godowns, godownId)}` : '';
    const qty = round2(Number(input.qty));
    d.logAuditEvent('Opening Stock', `${product.name}${where}: opening ${qty} ${unit}${rateChanged ? ` at ${formatCurrency(rate!)}` : ''} (stock ${plan.delta >= 0 ? '+' : ''}${plan.delta})`, 'warning', 'data');
    return ok(`${product.name}: opening stock ${qty} ${unit}${where} saved.`);
  };

  return {
    productUnits: lists.unit,
    productGroups: lists.group,
    manufacturers: lists.manufacturer,
    addCodingItem,
    renameCodingItem,
    removeCodingItem,
    saveAccountOpenings,
    setOpeningStock,
  };
};
