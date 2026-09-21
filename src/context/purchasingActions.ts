import React, { useEffect, useState } from 'react';
import {
  AppSettings,
  LedgerEntry,
  Product,
  Purchase,
  PurchaseOrder,
  PurchaseOrderLine,
  Supplier,
  SupplierBill,
  SupplierBillLine,
  SupplierClaim,
  SupplierClaimReason,
  SUPPLIER_CLAIM_REASONS,
} from '../types';
import { booksLockedFor } from '../utils/accounting';
import { formatCurrency, formatDate } from '../utils/formatters';
import { nextNumber, poLines, round2, withLineTotals } from '../utils/purchasing';

/**
 * Purchasing in billing mode (SAP MM style, kept simple): multi-line purchase orders, the
 * supplier's own bill matched against the goods received, and claims against suppliers.
 *
 * Accounting (the journal itself is derived in utils/accounting.ts `buildJournal`):
 *  - A purchase order posts nothing: it is only a promise.
 *  - Goods received against an order go through the normal Receive stock path (addPurchase):
 *    Dr Inventory / Cr Payable at the receipt rate, and the order line's received qty moves.
 *  - Supplier bill: the payable for those goods was ALREADY booked at the receipt. To avoid counting
 *    it twice, the bill posts only the difference between the bill total and the value of the
 *    receipts it covers, as one `purchase_variance` ledger row on the supplier:
 *      bill > received value → debit (owed more),  Dr Purchase price differences 5150 / Cr Payable
 *      bill < received value → credit (owed less), Dr Payable / Cr Purchase price differences 5150
 *    After it, the supplier balance for those goods equals exactly the bill amount. Inventory stays
 *    at the receipt cost (what bills and COGS use), so the difference is a cost of sales.
 *  - Supplier claim (leaked / damaged / short goods): nothing is posted while it is open or when it
 *    is rejected. Accepting it posts a `supplier_claim` ledger row (a debit note) for the accepted
 *    amount: Dr Payable / Cr Stock losses 5100 (a recovery of the loss). "Settled" only closes it.
 *    Re-opening or deleting an accepted claim removes its debit note again.
 */

type Result<T = object> = { success: boolean; message: string } & Partial<T>;

export const PURCHASING_STORAGE_KEYS = {
  SUPPLIER_BILLS: 'tradeflow_supplier_bills_v1',
  SUPPLIER_CLAIMS: 'tradeflow_supplier_claims_v1',
};

export interface PurchaseOrderInput {
  supplierId: string;
  lines: { productId: string; qty: number; rate: number }[];
  orderDate?: string;
  expectedDate?: string;
  notes?: string;
}

export interface SupplierBillInput {
  supplierId: string;
  billNumber: string;
  date?: string;
  purchaseOrderId?: string | null;
  purchaseIds: string[];
  lines: { productId: string; qty: number; rate: number }[];
  otherCharges?: number;
  note?: string;
}

export interface SupplierClaimInput {
  supplierId: string;
  purchaseId?: string | null;
  productId: string;
  qty: number;
  rate: number;
  reason: SupplierClaimReason;
  note?: string;
  date?: string;
}

export interface ReorderOrderInput {
  supplierId: string;
  productId: string;
  qty: number;
  rate: number;
}

export interface PurchasingApi {
  supplierBills: SupplierBill[];
  supplierClaims: SupplierClaim[];
  createPurchaseOrder: (input: PurchaseOrderInput) => Result<{ order: PurchaseOrder }>;
  /** Change an order's lines / dates. Lines already (partly) received can't go below what came. */
  updatePurchaseOrder: (id: string, input: PurchaseOrderInput) => Result<{ order: PurchaseOrder }>;
  /** Cancel the order (whatever is still to come). Goods already received stay. */
  cancelOrder: (id: string, reason?: string) => Result;
  /** Delete an order nothing was received on. */
  removePurchaseOrder: (id: string) => Result;
  /** One order per supplier from the re-order report. */
  ordersFromReorder: (rows: ReorderOrderInput[], opts?: { expectedDate?: string; notes?: string }) => Result<{ orders: PurchaseOrder[] }>;
  recordSupplierBill: (input: SupplierBillInput) => Result<{ bill: SupplierBill }>;
  deleteSupplierBill: (id: string) => Result;
  addSupplierClaim: (input: SupplierClaimInput) => Result<{ claim: SupplierClaim }>;
  /** The supplier agreed: the accepted amount comes off what you owe them (debit note). */
  acceptSupplierClaim: (id: string, opts?: { amount?: number; date?: string; note?: string }) => Result;
  rejectSupplierClaim: (id: string, opts?: { date?: string; note?: string }) => Result;
  /** Close an accepted claim (money or goods received, or adjusted in a payment). */
  settleSupplierClaim: (id: string, opts?: { date?: string; note?: string }) => Result;
  /** Back to open; an accepted claim's debit note is removed. */
  reopenSupplierClaim: (id: string) => Result;
  deleteSupplierClaim: (id: string) => Result;
  /** Receipt (Purchase id) already covered by a supplier bill. */
  isBilledReceipt: (purchaseId: string) => boolean;
}

interface Deps {
  purchaseOrders: PurchaseOrder[];
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
  purchases: Purchase[];
  products: Product[];
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  settings: AppSettings;
  can: (permission: string) => boolean;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger') => void;
  uid: (prefix: string) => string;
  userName?: string;
  today: () => string;
  isCloudSyncReady: boolean;
  syncToSupabase: (table: string, rows: unknown[]) => Promise<void>;
  removeRemote: (table: any, ids: string[]) => void;
  /** Next purchase order number from the shop's number series (Admin → Rules, numbers & branches); PO-n when absent. */
  docNumber?: (existing: string[]) => string;
}

const load = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const isDate = (d?: string | null) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
const fail = (message: string) => ({ success: false as const, message });
const NO = (what: string) => fail(`You don't have permission to ${what}. Ask a manager or admin.`);

export const usePurchasingStore = (d: Deps) => {
  const [supplierBills, setSupplierBills] = useState<SupplierBill[]>(() => load(PURCHASING_STORAGE_KEYS.SUPPLIER_BILLS));
  const [supplierClaims, setSupplierClaims] = useState<SupplierClaim[]>(() => load(PURCHASING_STORAGE_KEYS.SUPPLIER_CLAIMS));
  useEffect(() => { localStorage.setItem(PURCHASING_STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(supplierBills)); }, [supplierBills]);
  useEffect(() => { localStorage.setItem(PURCHASING_STORAGE_KEYS.SUPPLIER_CLAIMS, JSON.stringify(supplierClaims)); }, [supplierClaims]);
  useEffect(() => { void d.syncToSupabase('supplier_bills', supplierBills); }, [supplierBills, d.isCloudSyncReady]);
  useEffect(() => { void d.syncToSupabase('supplier_claims', supplierClaims); }, [supplierClaims, d.isCloudSyncReady]);

  const canOrder = () => d.can('products:create') || d.can('stock:adjust');
  const canBooks = () => d.can('suppliers:edit');
  const supName = (id?: string | null) => {
    const s = d.suppliers.find((x) => x.id === id);
    return s ? s.company || s.name : 'Supplier';
  };
  const productName = (id: string) => d.products.find((p) => p.id === id)?.name || 'Item';
  const lockedFor = (date: string) => booksLockedFor(d.settings, date);

  /** Add a ledger row on the supplier and move their balance by (debit − credit). */
  const postSupplierRow = (row: Omit<LedgerEntry, 'id' | 'entityType' | 'balanceAfter'>): LedgerEntry => {
    const supplier = d.suppliers.find((s) => s.id === row.entityId);
    const delta = round2(row.debit - row.credit);
    const entry: LedgerEntry = { ...row, id: d.uid('led'), entityType: 'supplier', balanceAfter: round2((supplier?.totalOwed || 0) + delta) };
    d.setSuppliers((prev) => prev.map((s) => (s.id === row.entityId ? { ...s, totalOwed: round2(s.totalOwed + delta) } : s)));
    d.setLedger((prev) => [entry, ...prev]);
    return entry;
  };
  /** Take a posted row back out (reversing its effect on the supplier balance). */
  const unpostSupplierRow = (ledgerId?: string | null) => {
    if (!ledgerId) return;
    const row = d.ledger.find((l) => l.id === ledgerId);
    if (!row) return;
    const delta = round2(row.debit - row.credit);
    d.setSuppliers((prev) => prev.map((s) => (s.id === row.entityId ? { ...s, totalOwed: round2(s.totalOwed - delta) } : s)));
    d.setLedger((prev) => prev.filter((l) => l.id !== ledgerId));
    d.removeRemote('ledger', [ledgerId]);
  };

  // ---------------------------------------------------------------------------
  // Purchase orders
  // ---------------------------------------------------------------------------
  const cleanLines = (input: PurchaseOrderInput): { lines?: { productId: string; qty: number; rate: number }[]; error?: string } => {
    const used = (input.lines || []).filter((l) => l.productId || Number(l.qty) > 0);
    if (used.length === 0) return { error: 'Add at least one item.' };
    for (const [i, l] of used.entries()) {
      const where = used.length > 1 ? `Line ${i + 1}: ` : '';
      const p = d.products.find((x) => x.id === l.productId);
      if (!p) return { error: `${where}pick an item.` };
      if (!(Number(l.qty) > 0)) return { error: `${where}enter the quantity of ${p.name}.` };
      if (!(Number(l.rate) >= 0) || !Number.isFinite(Number(l.rate))) return { error: `${where}enter the rate of ${p.name}.` };
    }
    return { lines: used.map((l) => ({ productId: l.productId, qty: round2(Number(l.qty)), rate: round2(Number(l.rate)) })) };
  };

  const validateHeader = (input: PurchaseOrderInput): string | null => {
    if (!d.suppliers.some((s) => s.id === input.supplierId)) return 'Pick the supplier.';
    if (input.orderDate && !isDate(input.orderDate)) return 'Enter a valid order date.';
    if (input.expectedDate && !isDate(input.expectedDate)) return 'Enter a valid expected date.';
    if (input.orderDate && input.expectedDate && input.expectedDate < input.orderDate) return 'The expected date is before the order date.';
    return null;
  };

  const buildOrder = (input: PurchaseOrderInput, lines: { productId: string; qty: number; rate: number }[], poNumber: string): PurchaseOrder => {
    const now = d.today();
    const items: PurchaseOrderLine[] = lines.map((l) => {
      const p = d.products.find((x) => x.id === l.productId);
      return { id: d.uid('pol'), productId: l.productId, productName: p?.name, unit: p?.unit || 'pcs', qty: l.qty, rate: l.rate, receivedQty: 0 };
    });
    const base: PurchaseOrder = {
      id: d.uid('po'),
      poNumber,
      supplierId: input.supplierId,
      productId: items[0].productId,
      kg: 0,
      pricePerKg: 0,
      amount: 0,
      expectedDate: input.expectedDate || undefined,
      status: 'open',
      receivedKg: 0,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      createdBy: d.userName,
      orderDate: input.orderDate || now,
      updatedAt: now,
    };
    return withLineTotals(base, items);
  };

  const poNumberFor = (existing: string[]) => (d.docNumber ? d.docNumber(existing) : nextNumber('PO', existing));

  const createPurchaseOrder: PurchasingApi['createPurchaseOrder'] = (input) => {
    if (!canOrder()) return NO('make purchase orders');
    const headerError = validateHeader(input);
    if (headerError) return fail(headerError);
    const { lines, error } = cleanLines(input);
    if (error || !lines) return fail(error || 'Add at least one item.');
    const order = buildOrder(input, lines, poNumberFor(d.purchaseOrders.map((p) => p.poNumber)));
    d.setPurchaseOrders((prev) => [order, ...prev]);
    d.logAuditEvent('Purchase Order Created', `${order.poNumber} to ${supName(order.supplierId)}: ${lines.length} item${lines.length === 1 ? '' : 's'}, ${formatCurrency(order.amount)}`, 'info');
    return { success: true, message: `Purchase order ${order.poNumber} saved.`, order };
  };

  const updatePurchaseOrder: PurchasingApi['updatePurchaseOrder'] = (id, input) => {
    if (!canOrder()) return NO('change purchase orders');
    const po = d.purchaseOrders.find((x) => x.id === id);
    if (!po) return fail('Purchase order not found.');
    if (po.status === 'cancelled' || po.status === 'received') return fail(`This order is ${po.status}; it can't be changed.`);
    const headerError = validateHeader(input);
    if (headerError) return fail(headerError);
    if (input.supplierId !== po.supplierId && po.receivedKg > 0) return fail('Goods were already received on this order; the supplier cannot change.');
    const { lines, error } = cleanLines(input);
    if (error || !lines) return fail(error || 'Add at least one item.');
    const old = poLines(po).map((l) => ({ ...l }));
    const items: PurchaseOrderLine[] = [];
    // Match new lines to old ones by item, so received quantities stay with their line.
    const pool = [...old];
    for (const l of lines) {
      const idx = pool.findIndex((x) => x.productId === l.productId);
      const prev = idx >= 0 ? pool.splice(idx, 1)[0] : undefined;
      const p = d.products.find((x) => x.id === l.productId);
      if (prev && l.qty + 0.0001 < prev.receivedQty) return fail(`${p?.name || 'Item'}: ${prev.receivedQty} already received; the order can't be less than that.`);
      items.push({ id: prev?.id || d.uid('pol'), productId: l.productId, productName: p?.name, unit: p?.unit || 'pcs', qty: l.qty, rate: l.rate, receivedQty: prev?.receivedQty || 0 });
    }
    const dropped = pool.find((x) => x.receivedQty > 0);
    if (dropped) return fail(`${productName(dropped.productId)} was already received on this order; it can't be removed.`);
    const order = withLineTotals(
      { ...po, supplierId: input.supplierId, expectedDate: input.expectedDate || undefined, orderDate: input.orderDate || po.orderDate, notes: input.notes?.trim() || undefined, updatedAt: d.today() },
      items
    );
    d.setPurchaseOrders((prev) => prev.map((x) => (x.id === id ? order : x)));
    d.logAuditEvent('Purchase Order Changed', `${order.poNumber}: ${formatCurrency(order.amount)}`, 'info');
    return { success: true, message: `${order.poNumber} saved.`, order };
  };

  const cancelOrder: PurchasingApi['cancelOrder'] = (id, reason) => {
    if (!canOrder()) return NO('cancel purchase orders');
    const po = d.purchaseOrders.find((x) => x.id === id);
    if (!po) return fail('Purchase order not found.');
    if (po.status === 'cancelled') return fail('This order is already cancelled.');
    if (po.status === 'received') return fail('Everything on this order has been received; there is nothing to cancel.');
    const now = d.today();
    d.setPurchaseOrders((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'cancelled', cancelledAt: now, updatedAt: now, notes: reason?.trim() ? [x.notes, `Cancelled: ${reason.trim()}`].filter(Boolean).join(' • ') : x.notes } : x)));
    d.logAuditEvent('Purchase Order Cancelled', `${po.poNumber}${reason ? ` — ${reason}` : ''}`, 'warning');
    return { success: true, message: `${po.poNumber} cancelled.${po.receivedKg > 0 ? ' Goods already received stay in stock.' : ''}` };
  };

  const removePurchaseOrder: PurchasingApi['removePurchaseOrder'] = (id) => {
    if (!d.can('delete_records')) return NO('delete purchase orders');
    const po = d.purchaseOrders.find((x) => x.id === id);
    if (!po) return fail('Purchase order not found.');
    if (po.receivedKg > 0 || d.purchases.some((p) => p.purchaseOrderId === id)) return fail('Goods were received on this order. Cancel it instead.');
    if (supplierBills.some((b) => b.purchaseOrderId === id)) return fail('A supplier bill is recorded against this order. Delete the bill first.');
    d.setPurchaseOrders((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('purchase_orders', [id]);
    d.logAuditEvent('Purchase Order Deleted', po.poNumber, 'danger');
    return { success: true, message: `${po.poNumber} deleted.` };
  };

  const ordersFromReorder: PurchasingApi['ordersFromReorder'] = (rows, opts = {}) => {
    if (!canOrder()) return NO('make purchase orders');
    const used = rows.filter((r) => r.productId && Number(r.qty) > 0);
    if (used.length === 0) return fail('Tick at least one item with a quantity.');
    const missing = used.find((r) => !d.suppliers.some((s) => s.id === r.supplierId));
    if (missing) return fail(`Pick a supplier for ${productName(missing.productId)}.`);
    const bySupplier = new Map<string, ReorderOrderInput[]>();
    used.forEach((r) => bySupplier.set(r.supplierId, [...(bySupplier.get(r.supplierId) || []), r]));
    const numbers = d.purchaseOrders.map((p) => p.poNumber);
    const orders: PurchaseOrder[] = [];
    bySupplier.forEach((list, supplierId) => {
      const poNumber = poNumberFor(numbers);
      numbers.push(poNumber);
      orders.push(buildOrder({ supplierId, lines: list, expectedDate: opts.expectedDate, notes: opts.notes || 'Made from the re-order report' }, list.map((l) => ({ productId: l.productId, qty: round2(Number(l.qty)), rate: round2(Number(l.rate) || 0) })), poNumber));
    });
    d.setPurchaseOrders((prev) => [...orders, ...prev]);
    d.logAuditEvent('Purchase Orders Created', `${orders.map((o) => o.poNumber).join(', ')} from the re-order report`, 'info');
    return { success: true, message: `${orders.length} purchase order${orders.length === 1 ? '' : 's'} made: ${orders.map((o) => `${o.poNumber} (${supName(o.supplierId)})`).join(', ')}.`, orders };
  };

  // ---------------------------------------------------------------------------
  // Supplier bills (three-way match)
  // ---------------------------------------------------------------------------
  const isBilledReceipt = (purchaseId: string) => supplierBills.some((b) => b.purchaseIds.includes(purchaseId));

  const recordSupplierBill: PurchasingApi['recordSupplierBill'] = (input) => {
    if (!canBooks()) return NO('record supplier bills');
    const supplier = d.suppliers.find((s) => s.id === input.supplierId);
    if (!supplier) return fail('Pick the supplier.');
    const billNumber = (input.billNumber || '').trim();
    if (!billNumber) return fail("Enter the supplier's bill number.");
    if (supplierBills.some((b) => b.supplierId === input.supplierId && b.billNumber.trim().toLowerCase() === billNumber.toLowerCase())) return fail(`Bill ${billNumber} from ${supName(input.supplierId)} is already recorded.`);
    const date = input.date || d.today();
    if (!isDate(date)) return fail('Enter a valid bill date.');
    if (date > d.today()) return fail('The bill date cannot be in the future.');
    const closed = lockedFor(date);
    if (closed) return fail(closed);
    const ids = Array.from(new Set(input.purchaseIds || []));
    if (ids.length === 0) return fail('Tick the stock received that this bill is for.');
    const receipts = ids.map((id) => d.purchases.find((p) => p.id === id));
    if (receipts.some((r) => !r)) return fail('A stock receipt on this bill no longer exists.');
    const wrong = receipts.find((r) => r!.supplierId !== input.supplierId);
    if (wrong) return fail(`Receipt ${wrong!.receiptNumber} is from another supplier.`);
    const billed = receipts.find((r) => isBilledReceipt(r!.id));
    if (billed) return fail(`Receipt ${billed!.receiptNumber} is already on another supplier bill.`);
    if (input.purchaseOrderId && !d.purchaseOrders.some((p) => p.id === input.purchaseOrderId)) return fail('Purchase order not found.');
    const lines: SupplierBillLine[] = [];
    for (const [i, l] of (input.lines || []).filter((x) => x.productId || Number(x.qty) > 0).entries()) {
      const p = d.products.find((x) => x.id === l.productId);
      if (!p) return fail(`Line ${i + 1}: pick an item.`);
      const qty = round2(Number(l.qty));
      const rate = round2(Number(l.rate));
      if (!(qty > 0)) return fail(`Enter the quantity billed for ${p.name}.`);
      if (!(rate >= 0) || !Number.isFinite(rate)) return fail(`Enter the billed rate for ${p.name}.`);
      lines.push({ productId: p.id, productName: p.name, unit: p.unit || 'pcs', qty, rate, amount: round2(qty * rate) });
    }
    if (lines.length === 0) return fail('Add the lines from the supplier bill.');
    const otherCharges = round2(Number(input.otherCharges) || 0);
    if (otherCharges < 0) return fail('Other charges cannot be negative.');
    const amount = round2(lines.reduce((a, l) => a + l.amount, 0) + otherCharges);
    const receivedValue = round2(receipts.reduce((a, r) => a + r!.amount, 0));
    const variance = round2(amount - receivedValue);
    const bill: SupplierBill = {
      id: d.uid('sbill'),
      billNumber,
      supplierId: input.supplierId,
      date,
      purchaseOrderId: input.purchaseOrderId || receipts.find((r) => r!.purchaseOrderId)?.purchaseOrderId || null,
      purchaseIds: ids,
      lines,
      otherCharges: otherCharges || undefined,
      amount,
      receivedValue,
      variance,
      ledgerId: null,
      note: input.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
      createdBy: d.userName,
    };
    if (Math.abs(variance) >= 0.01) {
      const row = postSupplierRow({
        entityId: input.supplierId,
        type: 'purchase_variance',
        referenceId: `Bill ${billNumber}`,
        date,
        description: `Supplier bill ${billNumber}: ${formatCurrency(amount)} for goods received worth ${formatCurrency(receivedValue)} (${variance > 0 ? 'bill more' : 'bill less'} by ${formatCurrency(Math.abs(variance))})`,
        debit: variance > 0 ? variance : 0,
        credit: variance < 0 ? -variance : 0,
        sourceId: bill.id,
      });
      bill.ledgerId = row.id;
    }
    setSupplierBills((prev) => [bill, ...prev]);
    d.logAuditEvent('Supplier Bill Recorded', `${supName(input.supplierId)} bill ${billNumber}: ${formatCurrency(amount)} (goods received ${formatCurrency(receivedValue)})`, Math.abs(variance) >= 0.01 ? 'warning' : 'info');
    const msg =
      Math.abs(variance) < 0.01
        ? `Bill ${billNumber} saved. It matches the goods received.`
        : `Bill ${billNumber} saved. ${formatCurrency(Math.abs(variance))} ${variance > 0 ? 'added to' : 'taken off'} what you owe ${supName(input.supplierId)} (price difference).`;
    return { success: true, message: msg, bill };
  };

  const deleteSupplierBill: PurchasingApi['deleteSupplierBill'] = (id) => {
    if (!canBooks() || !d.can('delete_records')) return NO('delete supplier bills');
    const bill = supplierBills.find((b) => b.id === id);
    if (!bill) return fail('Supplier bill not found.');
    const closed = lockedFor(bill.date);
    if (closed) return fail(closed);
    unpostSupplierRow(bill.ledgerId);
    setSupplierBills((prev) => prev.filter((b) => b.id !== id));
    d.removeRemote('supplier_bills', [id]);
    d.logAuditEvent('Supplier Bill Deleted', `${supName(bill.supplierId)} bill ${bill.billNumber} (${formatCurrency(bill.amount)})`, 'danger');
    return { success: true, message: `Bill ${bill.billNumber} deleted.${bill.ledgerId ? ' The price difference was reversed.' : ''}` };
  };

  // ---------------------------------------------------------------------------
  // Supplier claims
  // ---------------------------------------------------------------------------
  const reasonLabel = (r: SupplierClaimReason) => SUPPLIER_CLAIM_REASONS.find((x) => x.id === r)?.label || r;

  const addSupplierClaim: PurchasingApi['addSupplierClaim'] = (input) => {
    if (!canBooks()) return NO('make supplier claims');
    if (!d.suppliers.some((s) => s.id === input.supplierId)) return fail('Pick the supplier.');
    const p = d.products.find((x) => x.id === input.productId);
    if (!p) return fail('Pick the item.');
    const qty = round2(Number(input.qty));
    const rate = round2(Number(input.rate));
    if (!(qty > 0)) return fail(`Enter the quantity of ${p.name} claimed.`);
    if (!(rate > 0)) return fail('Enter the rate per unit claimed.');
    if (!SUPPLIER_CLAIM_REASONS.some((r) => r.id === input.reason)) return fail('Pick what was wrong with the goods.');
    const date = input.date || d.today();
    if (!isDate(date)) return fail('Enter a valid date.');
    if (date > d.today()) return fail('The date cannot be in the future.');
    if (input.purchaseId) {
      const receipt = d.purchases.find((x) => x.id === input.purchaseId);
      if (!receipt) return fail('That stock receipt no longer exists.');
      if (receipt.supplierId !== input.supplierId) return fail('That stock receipt is from another supplier.');
      if (receipt.productId !== input.productId) return fail(`Receipt ${receipt.receiptNumber} is for ${productName(receipt.productId)}, not ${p.name}.`);
      if (qty > receipt.kg + 0.0001) return fail(`Only ${receipt.kg} ${p.unit || 'pcs'} came on receipt ${receipt.receiptNumber}.`);
      if (date < receipt.date) return fail('The claim date is before the goods were received.');
    }
    const claim: SupplierClaim = {
      id: d.uid('clm'),
      claimNumber: nextNumber('CLM', supplierClaims.map((c) => c.claimNumber)),
      supplierId: input.supplierId,
      purchaseId: input.purchaseId || null,
      productId: p.id,
      qty,
      rate,
      amount: round2(qty * rate),
      reason: input.reason,
      note: input.note?.trim() || undefined,
      date,
      status: 'open',
      ledgerId: null,
      createdAt: new Date().toISOString(),
      createdBy: d.userName,
    };
    setSupplierClaims((prev) => [claim, ...prev]);
    d.logAuditEvent('Supplier Claim Made', `${claim.claimNumber} to ${supName(claim.supplierId)}: ${qty} ${p.unit || 'pcs'} ${p.name} ${reasonLabel(claim.reason).toLowerCase()} (${formatCurrency(claim.amount)})`, 'info');
    return { success: true, message: `Claim ${claim.claimNumber} saved. Nothing changes in the books until the supplier accepts it.`, claim };
  };

  const updateClaim = (id: string, patch: Partial<SupplierClaim>) => setSupplierClaims((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)));

  const decisionDate = (c: SupplierClaim, date: string | undefined): { date?: string; error?: string } => {
    const on = date || d.today();
    if (!isDate(on)) return { error: 'Enter a valid date.' };
    if (on > d.today()) return { error: 'The date cannot be in the future.' };
    if (on < c.date) return { error: `The claim was only made on ${formatDate(c.date)}.` };
    return { date: on };
  };

  const acceptSupplierClaim: PurchasingApi['acceptSupplierClaim'] = (id, opts = {}) => {
    if (!canBooks()) return NO('accept supplier claims');
    const c = supplierClaims.find((x) => x.id === id);
    if (!c) return fail('Claim not found.');
    if (c.status !== 'open') return fail(`Claim ${c.claimNumber} is already ${c.status}.`);
    const { date, error } = decisionDate(c, opts.date);
    if (error || !date) return fail(error || 'Enter a valid date.');
    const closed = lockedFor(date);
    if (closed) return fail(closed);
    const amount = round2(opts.amount != null ? Number(opts.amount) : c.amount);
    if (!(amount > 0)) return fail('Enter the amount the supplier accepted.');
    if (amount > c.amount + 0.001) return fail(`The accepted amount can't be more than the ${formatCurrency(c.amount)} claimed.`);
    const p = d.products.find((x) => x.id === c.productId);
    const row = postSupplierRow({
      entityId: c.supplierId,
      type: 'supplier_claim',
      referenceId: c.claimNumber,
      date,
      description: `Claim ${c.claimNumber} accepted: ${c.qty} ${p?.unit || 'pcs'} ${p?.name || 'goods'} ${reasonLabel(c.reason).toLowerCase()}`,
      debit: 0,
      credit: amount,
      kg: c.qty,
      sourceId: c.id,
    });
    updateClaim(id, { status: 'accepted', acceptedAmount: amount, decidedDate: date, decisionNote: opts.note?.trim() || undefined, ledgerId: row.id });
    d.logAuditEvent('Supplier Claim Accepted', `${c.claimNumber}: ${formatCurrency(amount)} off ${supName(c.supplierId)}`, 'info');
    return { success: true, message: `Claim ${c.claimNumber} accepted. ${formatCurrency(amount)} taken off what you owe ${supName(c.supplierId)}.` };
  };

  const rejectSupplierClaim: PurchasingApi['rejectSupplierClaim'] = (id, opts = {}) => {
    if (!canBooks()) return NO('change supplier claims');
    const c = supplierClaims.find((x) => x.id === id);
    if (!c) return fail('Claim not found.');
    if (c.status !== 'open') return fail(`Claim ${c.claimNumber} is already ${c.status}.`);
    const { date, error } = decisionDate(c, opts.date);
    if (error || !date) return fail(error || 'Enter a valid date.');
    updateClaim(id, { status: 'rejected', decidedDate: date, decisionNote: opts.note?.trim() || undefined });
    d.logAuditEvent('Supplier Claim Rejected', `${c.claimNumber} (${supName(c.supplierId)})${opts.note ? ` — ${opts.note}` : ''}`, 'warning');
    return { success: true, message: `Claim ${c.claimNumber} marked rejected. Nothing changes in the books.` };
  };

  const settleSupplierClaim: PurchasingApi['settleSupplierClaim'] = (id, opts = {}) => {
    if (!canBooks()) return NO('change supplier claims');
    const c = supplierClaims.find((x) => x.id === id);
    if (!c) return fail('Claim not found.');
    if (c.status !== 'accepted') return fail('Only an accepted claim can be settled.');
    const on = opts.date || d.today();
    if (!isDate(on) || on > d.today()) return fail('Enter a valid date (not in the future).');
    updateClaim(id, { status: 'settled', settledDate: on, decisionNote: [c.decisionNote, opts.note?.trim()].filter(Boolean).join(' • ') || undefined });
    d.logAuditEvent('Supplier Claim Settled', c.claimNumber, 'info');
    return { success: true, message: `Claim ${c.claimNumber} settled.` };
  };

  const reopenSupplierClaim: PurchasingApi['reopenSupplierClaim'] = (id) => {
    if (!canBooks()) return NO('change supplier claims');
    const c = supplierClaims.find((x) => x.id === id);
    if (!c) return fail('Claim not found.');
    if (c.status === 'open') return fail('This claim is already open.');
    if (c.ledgerId && c.decidedDate) {
      const closed = lockedFor(c.decidedDate);
      if (closed) return fail(closed);
    }
    unpostSupplierRow(c.ledgerId);
    updateClaim(id, { status: 'open', acceptedAmount: undefined, decidedDate: null, settledDate: null, decisionNote: undefined, ledgerId: null });
    d.logAuditEvent('Supplier Claim Re-opened', c.claimNumber, 'warning');
    return { success: true, message: `Claim ${c.claimNumber} is open again.${c.ledgerId ? ' Its debit note was removed.' : ''}` };
  };

  const deleteSupplierClaim: PurchasingApi['deleteSupplierClaim'] = (id) => {
    if (!canBooks() || !d.can('delete_records')) return NO('delete supplier claims');
    const c = supplierClaims.find((x) => x.id === id);
    if (!c) return fail('Claim not found.');
    if (c.ledgerId && c.decidedDate) {
      const closed = lockedFor(c.decidedDate);
      if (closed) return fail(closed);
    }
    unpostSupplierRow(c.ledgerId);
    setSupplierClaims((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('supplier_claims', [id]);
    d.logAuditEvent('Supplier Claim Deleted', `${c.claimNumber} (${formatCurrency(c.amount)})`, 'danger');
    return { success: true, message: `Claim ${c.claimNumber} deleted.` };
  };

  // ---- load / backup / reset ----
  const hydrate = (data: { supplierBills?: unknown; supplierClaims?: unknown }, opts: { keepLocalIfEmpty?: boolean } = {}) => {
    const take = <T,>(v: unknown, set: React.Dispatch<React.SetStateAction<T[]>>) => {
      if (!Array.isArray(v)) return;
      if (opts.keepLocalIfEmpty && v.length === 0) return;
      set(v as T[]);
    };
    take<SupplierBill>(data.supplierBills, setSupplierBills);
    take<SupplierClaim>(data.supplierClaims, setSupplierClaims);
  };
  const backupData = () => ({ supplierBills, supplierClaims });
  const reset = () => {
    setSupplierBills([]);
    setSupplierClaims([]);
    Object.values(PURCHASING_STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  };
  const purgeSetters = {
    supplier_bills: () => setSupplierBills([]),
    supplier_claims: () => setSupplierClaims([]),
  };
  /** A deleted supplier takes their bills and claims with them (their ledger rows go with the supplier). */
  const removeForSupplier = (supplierId: string) => {
    const billIds = supplierBills.filter((b) => b.supplierId === supplierId).map((b) => b.id);
    const claimIds = supplierClaims.filter((c) => c.supplierId === supplierId).map((c) => c.id);
    if (billIds.length) {
      setSupplierBills((prev) => prev.filter((b) => b.supplierId !== supplierId));
      d.removeRemote('supplier_bills', billIds);
    }
    if (claimIds.length) {
      setSupplierClaims((prev) => prev.filter((c) => c.supplierId !== supplierId));
      d.removeRemote('supplier_claims', claimIds);
    }
  };

  const api: PurchasingApi = {
    supplierBills,
    supplierClaims,
    createPurchaseOrder,
    updatePurchaseOrder,
    cancelOrder,
    removePurchaseOrder,
    ordersFromReorder,
    recordSupplierBill,
    deleteSupplierBill,
    addSupplierClaim,
    acceptSupplierClaim,
    rejectSupplierClaim,
    settleSupplierClaim,
    reopenSupplierClaim,
    deleteSupplierClaim,
    isBilledReceipt,
  };
  return { api, hydrate, backupData, reset, purgeSetters, removeForSupplier };
};
