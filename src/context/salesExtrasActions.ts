import React, { useEffect, useState } from 'react';
import { AppSettings, Customer, Expense, Invoice, LedgerEntry, SalesArea, Salesman, Scheme, isCashMethod } from '../types';
import { booksLockedFor } from '../utils/accounting';
import { InterestRow, interestPreview, validateScheme } from '../utils/salesExtras';
import { formatCurrency } from '../utils/formatters';

/**
 * Sales extras: salesmen and areas (routes), trade schemes, receiving from many customers at once,
 * salesman commission and late-payment interest. Lives inside TradingProvider (like inventoryStore).
 *
 * Accounting (the journal itself is derived in utils/accounting.ts `buildJournal`):
 *  - Scheme free goods are bill lines at price 0 flagged `free`: stock leaves at cost, posted
 *    Dr Scheme / free goods 5250, Cr Inventory 1200 (not cost of sales). A return reverses it.
 *  - Freight / cartage / loading on a bill is `freightCharges` on the invoice: added to the bill total
 *    (so it is owed by the customer) and credited to Freight & other charges income 4100. What the shop
 *    pays the transporter is booked as an ordinary expense (Transport & freight 6030), so the net freight
 *    earned or lost is 4100 − 6030 on the P&L. No tax is charged on freight.
 *  - Receive from many: one `payment_received` ledger row per customer (Dr Cash / Bank, Cr Receivable),
 *    all with the same collection-sheet number as the reference.
 *  - Interest: one `interest_charge` ledger row per customer (a debit note): Dr Receivable 1100,
 *    Cr Interest / late-payment income 4150.
 *  - Commission paid: an expense (category salesman_commission, referenceId = salesman id):
 *    Dr Salesman commission 6125, Cr Cash / Bank (or Unpaid expenses when "Credit (unpaid)").
 */

export const SALES_EXTRAS_STORAGE_KEYS = {
  SALESMEN: 'tradeflow_salesmen_v1',
  AREAS: 'tradeflow_areas_v1',
  SCHEMES: 'tradeflow_schemes_v1',
};

/** Printable sales-extras documents (see components/billing/SalesExtrasPrint.tsx). */
export type SalesExtrasPrintRequest =
  | { type: 'sales_extras'; report: 'sales_by'; by: 'salesman' | 'area'; from: string; to: string }
  | { type: 'sales_extras'; report: 'recovery'; by: 'salesman' | 'area'; asOf: string; filterId?: string }
  | { type: 'sales_extras'; report: 'collection'; sheetNo: string }
  | { type: 'sales_extras'; report: 'commission'; from: string; to: string };

type Result<T = object> = { success: boolean; message: string } & Partial<T>;

export interface ReceiveManyRow {
  customerId: string;
  amount: number;
  /** Cash, Bank Transfer, Easypaisa / JazzCash, Card (cheques go through Receive payment → Cheque). */
  method: string;
}

export interface ReceiveManyInput {
  rows: ReceiveManyRow[];
  date?: string;
  /** Salesman / recovery man who brought the money in. */
  salesmanId?: string | null;
  note?: string;
}

export type SchemeInput = Omit<Scheme, 'id' | 'createdAt' | 'createdBy' | 'updatedAt'> & { id?: string };

export interface SalesExtrasApi {
  salesmen: Salesman[];
  areas: SalesArea[];
  schemes: Scheme[];
  saveSalesman: (input: { id?: string; name: string; phone?: string; commissionPct?: number; commissionOn?: Salesman['commissionOn']; active?: boolean }) => Result<{ salesman: Salesman }>;
  /** Removes an unused salesman; one on bills or customers is switched off instead (history keeps the name). */
  deleteSalesman: (id: string) => Result;
  saveArea: (input: { id?: string; name: string; note?: string; active?: boolean }) => Result<{ area: SalesArea }>;
  deleteArea: (id: string) => Result;
  saveScheme: (input: SchemeInput) => Result<{ scheme: Scheme }>;
  deleteScheme: (id: string) => Result;
  /** Customer's default area / salesman and late-payment interest. */
  setCustomerSalesInfo: (customerId: string, data: { areaId?: string | null; salesmanId?: string | null; interestPctPerMonth?: number; interestAfterDays?: number }) => Result;
  /** Several customers pay at once: one ledger row each, one collection-sheet number. */
  receiveMany: (input: ReceiveManyInput) => Result<{ sheetNo: string; ledgerIds: string[]; total: number }>;
  /** Interest each customer would be charged as of a date (nothing is posted). */
  previewInterest: (asOf: string) => InterestRow[];
  /** Post the interest as debit notes (only the customers given, default all in the preview). */
  chargeInterest: (asOf: string, customerIds?: string[]) => Result<{ ledgerIds: string[]; total: number }>;
  /** Pay a salesman's commission: booked as a "Salesman commission" expense. */
  payCommission: (input: { salesmanId: string; amount: number; paidVia: string; date?: string; note?: string }) => Result<{ expense: Expense }>;
}

interface Deps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  invoices: Invoice[];
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  addExpense: (data: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => Expense;
  settings: AppSettings;
  can: (permission: string) => boolean;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger') => void;
  uid: (prefix: string) => string;
  userName?: string;
  today: () => string;
  isCloudSyncReady: boolean;
  syncToSupabase: (table: string, rows: unknown[]) => Promise<void>;
  removeRemote: (table: any, ids: string[]) => void;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isDate = (d?: string | null) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
const fail = (message: string) => ({ success: false as const, message });
const load = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Next number for a series like "CS-12" (collection sheet) or "INT-4" (interest note). */
const nextNumber = (ledger: LedgerEntry[], prefix: string) => {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = ledger.reduce((m, l) => {
    const n = parseInt((re.exec(l.referenceId || '') || [])[1] || '0', 10);
    return n > m ? n : m;
  }, 0);
  return `${prefix}-${max + 1}`;
};

export const useSalesExtrasStore = (d: Deps) => {
  const [salesmen, setSalesmen] = useState<Salesman[]>(() => load(SALES_EXTRAS_STORAGE_KEYS.SALESMEN));
  const [areas, setAreas] = useState<SalesArea[]>(() => load(SALES_EXTRAS_STORAGE_KEYS.AREAS));
  const [schemes, setSchemes] = useState<Scheme[]>(() => load(SALES_EXTRAS_STORAGE_KEYS.SCHEMES));

  useEffect(() => { localStorage.setItem(SALES_EXTRAS_STORAGE_KEYS.SALESMEN, JSON.stringify(salesmen)); }, [salesmen]);
  useEffect(() => { localStorage.setItem(SALES_EXTRAS_STORAGE_KEYS.AREAS, JSON.stringify(areas)); }, [areas]);
  useEffect(() => { localStorage.setItem(SALES_EXTRAS_STORAGE_KEYS.SCHEMES, JSON.stringify(schemes)); }, [schemes]);
  useEffect(() => { void d.syncToSupabase('salesmen', salesmen); }, [salesmen, d.isCloudSyncReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void d.syncToSupabase('areas', areas); }, [areas, d.isCloudSyncReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void d.syncToSupabase('schemes', schemes); }, [schemes, d.isCloudSyncReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const noPermission = (what: string) => fail(`You don't have permission to ${what}. Ask a manager or admin.`);
  const now = () => new Date().toISOString();

  // ---- salesmen & areas --------------------------------------------------------------------
  const saveSalesman: SalesExtrasApi['saveSalesman'] = (input) => {
    if (!d.can('customers:edit')) return noPermission('change salesmen');
    const name = (input.name || '').trim();
    if (!name) return fail("Enter the salesman's name.");
    if (salesmen.some((s) => s.id !== input.id && same(s.name, name))) return fail(`A salesman called ${name} already exists.`);
    const pct = input.commissionPct == null || input.commissionPct === ('' as unknown) ? 0 : Number(input.commissionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return fail('Commission must be between 0 and 100%.');
    const existing = input.id ? salesmen.find((s) => s.id === input.id) : undefined;
    if (input.id && !existing) return fail('Salesman not found.');
    const salesman: Salesman = {
      ...(existing || { id: d.uid('sm'), createdAt: d.today(), active: true }),
      name,
      phone: input.phone?.trim() || undefined,
      commissionPct: pct > 0 ? round2(pct) : undefined,
      commissionOn: input.commissionOn === 'recovery' ? 'recovery' : 'sales',
      active: input.active ?? existing?.active ?? true,
      ...(existing ? { updatedAt: now() } : {}),
    };
    setSalesmen((prev) => (existing ? prev.map((s) => (s.id === salesman.id ? salesman : s)) : [...prev, salesman]));
    d.logAuditEvent(existing ? 'Salesman Updated' : 'Salesman Added', `${name}${pct > 0 ? ` (${pct}% on ${salesman.commissionOn})` : ''}`, 'info');
    return { success: true, message: `${name} saved.`, salesman };
  };

  const deleteSalesman: SalesExtrasApi['deleteSalesman'] = (id) => {
    if (!d.can('customers:edit')) return noPermission('remove salesmen');
    const s = salesmen.find((x) => x.id === id);
    if (!s) return fail('Salesman not found.');
    const used = d.invoices.some((i) => i.salesmanId === id) || d.customers.some((c) => c.salesmanId === id) || d.ledger.some((l) => l.salesmanId === id);
    if (used) {
      setSalesmen((prev) => prev.map((x) => (x.id === id ? { ...x, active: false, updatedAt: now() } : x)));
      d.logAuditEvent('Salesman Switched Off', `${s.name} (kept on old bills)`, 'info');
      return { success: true, message: `${s.name} is on bills or customers, so they were switched off (not deleted).` };
    }
    setSalesmen((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('salesmen', [id]);
    d.logAuditEvent('Salesman Deleted', s.name, 'warning');
    return { success: true, message: `${s.name} deleted.` };
  };

  const saveArea: SalesExtrasApi['saveArea'] = (input) => {
    if (!d.can('customers:edit')) return noPermission('change areas');
    const name = (input.name || '').trim();
    if (!name) return fail('Enter the area / route name.');
    if (areas.some((a) => a.id !== input.id && same(a.name, name))) return fail(`An area called ${name} already exists.`);
    const existing = input.id ? areas.find((a) => a.id === input.id) : undefined;
    if (input.id && !existing) return fail('Area not found.');
    const area: SalesArea = {
      ...(existing || { id: d.uid('area'), createdAt: d.today(), active: true }),
      name,
      note: input.note?.trim() || undefined,
      active: input.active ?? existing?.active ?? true,
      ...(existing ? { updatedAt: now() } : {}),
    };
    setAreas((prev) => (existing ? prev.map((a) => (a.id === area.id ? area : a)) : [...prev, area]));
    d.logAuditEvent(existing ? 'Area Updated' : 'Area Added', name, 'info');
    return { success: true, message: `${name} saved.`, area };
  };

  const deleteArea: SalesExtrasApi['deleteArea'] = (id) => {
    if (!d.can('customers:edit')) return noPermission('remove areas');
    const a = areas.find((x) => x.id === id);
    if (!a) return fail('Area not found.');
    const used = d.invoices.some((i) => i.areaId === id) || d.customers.some((c) => c.areaId === id);
    if (used) {
      setAreas((prev) => prev.map((x) => (x.id === id ? { ...x, active: false, updatedAt: now() } : x)));
      d.logAuditEvent('Area Switched Off', `${a.name} (kept on old bills)`, 'info');
      return { success: true, message: `${a.name} is on bills or customers, so it was switched off (not deleted).` };
    }
    setAreas((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('areas', [id]);
    d.logAuditEvent('Area Deleted', a.name, 'warning');
    return { success: true, message: `${a.name} deleted.` };
  };

  // ---- schemes -----------------------------------------------------------------------------
  const saveScheme: SalesExtrasApi['saveScheme'] = (input) => {
    if (!d.can('edit_prices') && !d.can('products:edit_prices')) return noPermission('change schemes');
    const err = validateScheme(input);
    if (err) return fail(err);
    const existing = input.id ? schemes.find((s) => s.id === input.id) : undefined;
    if (input.id && !existing) return fail('Scheme not found.');
    const kind = input.kind;
    const scheme: Scheme = {
      id: existing?.id || d.uid('sch'),
      createdAt: existing?.createdAt || d.today(),
      createdBy: existing?.createdBy || d.userName,
      name: input.name.trim(),
      productId: input.productId,
      kind,
      ...(kind === 'free_every' ? { buyQty: round2(Number(input.buyQty)), freeQty: round2(Number(input.freeQty)) } : {}),
      ...(kind === 'free_slab' ? { slabs: (input.slabs || []).filter((x) => x.minQty > 0 && x.freeQty > 0).map((x) => ({ minQty: round2(x.minQty), freeQty: round2(x.freeQty) })).sort((a, b) => a.minQty - b.minQty) } : {}),
      ...(kind === 'pct_off' ? { minQty: round2(Number(input.minQty)), pctOff: round2(Number(input.pctOff)) } : {}),
      freeProductId: kind !== 'pct_off' && input.freeProductId && input.freeProductId !== input.productId ? input.freeProductId : null,
      fromDate: input.fromDate || undefined,
      toDate: input.toDate || undefined,
      customerIds: (input.customerIds || []).filter(Boolean),
      active: input.active !== false,
      ...(existing ? { updatedAt: now() } : {}),
    };
    setSchemes((prev) => (existing ? prev.map((s) => (s.id === scheme.id ? scheme : s)) : [...prev, scheme]));
    d.logAuditEvent(existing ? 'Scheme Updated' : 'Scheme Added', scheme.name, 'info');
    return { success: true, message: `Scheme "${scheme.name}" saved.`, scheme };
  };

  const deleteScheme: SalesExtrasApi['deleteScheme'] = (id) => {
    if (!d.can('edit_prices') && !d.can('products:edit_prices')) return noPermission('delete schemes');
    const s = schemes.find((x) => x.id === id);
    if (!s) return fail('Scheme not found.');
    // Bills keep the scheme name on their free lines, so removing it never changes an old bill.
    setSchemes((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('schemes', [id]);
    d.logAuditEvent('Scheme Deleted', s.name, 'warning');
    return { success: true, message: `Scheme "${s.name}" deleted.` };
  };

  // ---- customers ---------------------------------------------------------------------------
  const setCustomerSalesInfo: SalesExtrasApi['setCustomerSalesInfo'] = (customerId, data) => {
    if (!d.can('customers:edit')) return noPermission('change customers');
    const c = d.customers.find((x) => x.id === customerId);
    if (!c) return fail('Customer not found.');
    const pct = data.interestPctPerMonth == null ? c.interestPctPerMonth : Number(data.interestPctPerMonth);
    const after = data.interestAfterDays == null ? c.interestAfterDays : Number(data.interestAfterDays);
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 10)) return fail('Interest must be between 0 and 10% a month.');
    if (after != null && (!Number.isFinite(after) || after < 0 || after > 365)) return fail('Days before interest starts must be between 0 and 365.');
    if (data.areaId && !areas.some((a) => a.id === data.areaId)) return fail('Area not found.');
    if (data.salesmanId && !salesmen.some((s) => s.id === data.salesmanId)) return fail('Salesman not found.');
    // Interest settings change what the customer is charged: managers only.
    const effAfter = (pct || 0) > 0 ? after || 0 : 0;
    const wasAfter = (c.interestPctPerMonth || 0) > 0 ? c.interestAfterDays || 0 : 0;
    const interestChanged = (pct || 0) !== (c.interestPctPerMonth || 0) || effAfter !== wasAfter;
    if (interestChanged && !d.can('finance:view_pnl')) return noPermission('set late-payment interest');
    d.setCustomers((prev) =>
      prev.map((x) =>
        x.id === customerId
          ? {
              ...x,
              ...(data.areaId !== undefined ? { areaId: data.areaId || null } : {}),
              ...(data.salesmanId !== undefined ? { salesmanId: data.salesmanId || null } : {}),
              interestPctPerMonth: pct && pct > 0 ? round2(pct) : undefined,
              interestAfterDays: pct && pct > 0 ? Math.round(after || 0) : undefined,
            }
          : x
      )
    );
    if (interestChanged) d.logAuditEvent('Customer Interest Set', `${c.name}: ${pct || 0}% a month after ${after || 0} days`, 'warning');
    return { success: true, message: `${c.name} saved.` };
  };

  // ---- receive from many -------------------------------------------------------------------
  const receiveMany: SalesExtrasApi['receiveMany'] = (input) => {
    if (!d.can('finance:record_payment')) return noPermission('record payments');
    const date = input.date || d.today();
    if (!isDate(date)) return fail('Enter a valid date.');
    if (date > d.today()) return fail('The date cannot be in the future.');
    const locked = booksLockedFor(d.settings, date);
    if (locked) return fail(locked);
    if (input.salesmanId && !salesmen.some((s) => s.id === input.salesmanId)) return fail('Salesman not found.');
    const rows = (input.rows || []).map((r) => ({ ...r, amount: round2(Number(r.amount) || 0) })).filter((r) => r.amount > 0);
    if (rows.length === 0) return fail('Tick at least one customer and enter the amount received.');
    const seen = new Set<string>();
    for (const r of rows) {
      const c = d.customers.find((x) => x.id === r.customerId);
      if (!c) return fail('A customer on the list was not found.');
      if (seen.has(c.id)) return fail(`${c.name} is on the list twice.`);
      seen.add(c.id);
      if (!r.method || /cheque/i.test(r.method)) return fail(`${c.name}: cheques go through Receive payment (they wait in the cheque register until the bank clears them).`);
      if (r.amount > round2(c.totalDue) + 0.005) return fail(c.totalDue > 0 ? `${c.name} owes only ${formatCurrency(c.totalDue)}.` : `${c.name} owes nothing right now.`);
    }
    const sheetNo = nextNumber(d.ledger, 'CS');
    const note = input.note?.trim();
    const entries: LedgerEntry[] = rows.map((r) => {
      const c = d.customers.find((x) => x.id === r.customerId)!;
      return {
        id: d.uid('led'),
        entityType: 'customer',
        entityId: c.id,
        type: 'payment_received',
        referenceId: sheetNo,
        date,
        method: r.method,
        description: `Payment received: ${r.method} - collection ${sheetNo}${note ? ` (${note})` : ''}`,
        debit: 0,
        credit: r.amount,
        balanceAfter: round2(c.totalDue - r.amount),
        ...(input.salesmanId ? { salesmanId: input.salesmanId } : {}),
      };
    });
    const byCustomer = new Map(rows.map((r) => [r.customerId, r.amount]));
    d.setCustomers((prev) => prev.map((c) => (byCustomer.has(c.id) ? { ...c, totalDue: round2(c.totalDue - (byCustomer.get(c.id) || 0)) } : c)));
    d.setLedger((prev) => [...entries, ...prev]);
    const total = round2(rows.reduce((a, r) => a + r.amount, 0));
    const cash = round2(rows.filter((r) => isCashMethod(r.method)).reduce((a, r) => a + r.amount, 0));
    d.logAuditEvent('Collection Recorded', `${sheetNo}: ${rows.length} customer(s), ${formatCurrency(total)} (cash ${formatCurrency(cash)}, bank ${formatCurrency(round2(total - cash))}).`, 'info');
    return { success: true, message: `${formatCurrency(total)} received from ${rows.length} customer${rows.length === 1 ? '' : 's'} (${sheetNo}).`, sheetNo, ledgerIds: entries.map((e) => e.id), total };
  };

  // ---- interest ----------------------------------------------------------------------------
  const previewInterest: SalesExtrasApi['previewInterest'] = (asOf) => interestPreview(d.customers, d.ledger, asOf);

  const chargeInterest: SalesExtrasApi['chargeInterest'] = (asOf, customerIds) => {
    if (!d.can('finance:view_pnl')) return noPermission('charge interest');
    if (!isDate(asOf)) return fail('Enter a valid date.');
    if (asOf > d.today()) return fail('The date cannot be in the future.');
    const locked = booksLockedFor(d.settings, asOf);
    if (locked) return fail(locked);
    const rows = interestPreview(d.customers, d.ledger, asOf).filter((r) => !customerIds || customerIds.includes(r.customer.id));
    if (rows.length === 0) return fail('No interest to charge on this date.');
    const first = nextNumber(d.ledger, 'INT');
    let n = parseInt(first.split('-')[1], 10);
    const entries: LedgerEntry[] = rows.map((r) => ({
      id: d.uid('led'),
      entityType: 'customer',
      entityId: r.customer.id,
      type: 'interest_charge',
      referenceId: `INT-${n++}`,
      date: asOf,
      description: `Late-payment charge ${r.pct}% a month on ${formatCurrency(r.overdue)} overdue`,
      debit: r.interest,
      credit: 0,
      balanceAfter: round2(r.customer.totalDue + r.interest),
    }));
    const add = new Map(rows.map((r) => [r.customer.id, r.interest]));
    d.setCustomers((prev) => prev.map((c) => (add.has(c.id) ? { ...c, totalDue: round2(c.totalDue + (add.get(c.id) || 0)) } : c)));
    d.setLedger((prev) => [...entries, ...prev]);
    const total = round2(rows.reduce((a, r) => a + r.interest, 0));
    d.logAuditEvent('Interest Charged', `${rows.length} customer(s), ${formatCurrency(total)} as of ${asOf}.`, 'warning');
    return { success: true, message: `Interest of ${formatCurrency(total)} charged to ${rows.length} customer${rows.length === 1 ? '' : 's'}.`, ledgerIds: entries.map((e) => e.id), total };
  };

  // ---- commission --------------------------------------------------------------------------
  const payCommission: SalesExtrasApi['payCommission'] = (input) => {
    if (!d.can('manage_expenses') && !d.can('finance:manage_expenses')) return noPermission('pay commission');
    const s = salesmen.find((x) => x.id === input.salesmanId);
    if (!s) return fail('Pick the salesman.');
    const amount = round2(Number(input.amount) || 0);
    if (!(amount > 0)) return fail('Enter the amount paid.');
    const date = input.date || d.today();
    if (!isDate(date)) return fail('Enter a valid date.');
    if (date > d.today()) return fail('The date cannot be in the future.');
    const locked = booksLockedFor(d.settings, date);
    if (locked) return fail(locked);
    const expense = d.addExpense({ date, category: 'salesman_commission', amount, description: `Commission — ${s.name}${input.note?.trim() ? ` (${input.note.trim()})` : ''}`, paidVia: input.paidVia || 'Cash', referenceId: s.id, truckId: null, dispatchId: null });
    d.logAuditEvent('Commission Paid', `${s.name}: ${formatCurrency(amount)} by ${input.paidVia || 'Cash'}`, 'info');
    return { success: true, message: `${formatCurrency(amount)} commission paid to ${s.name}.`, expense };
  };

  // ---- load / backup / reset ---------------------------------------------------------------
  const hydrate = (data: { salesmen?: unknown; areas?: unknown; schemes?: unknown }, opts: { keepLocalIfEmpty?: boolean } = {}) => {
    const take = <T,>(v: unknown, set: React.Dispatch<React.SetStateAction<T[]>>) => {
      if (!Array.isArray(v)) return;
      if (opts.keepLocalIfEmpty && v.length === 0) return;
      set(v as T[]);
    };
    take<Salesman>(data.salesmen, setSalesmen);
    take<SalesArea>(data.areas, setAreas);
    take<Scheme>(data.schemes, setSchemes);
  };
  const backupData = () => ({ salesmen, areas, schemes });
  const reset = () => {
    setSalesmen([]);
    setAreas([]);
    setSchemes([]);
    Object.values(SALES_EXTRAS_STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  };
  const purgeSetters = {
    salesmen: () => setSalesmen([]),
    areas: () => setAreas([]),
    schemes: () => setSchemes([]),
  };

  const api: SalesExtrasApi = {
    salesmen,
    areas,
    schemes,
    saveSalesman,
    deleteSalesman,
    saveArea,
    deleteArea,
    saveScheme,
    deleteScheme,
    setCustomerSalesInfo,
    receiveMany,
    previewInterest,
    chargeInterest,
    payCommission,
  };
  return { api, hydrate, backupData, reset, purgeSetters };
};
