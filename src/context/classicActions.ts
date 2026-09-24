import React, { useEffect, useState } from 'react';
import { DeliveryInfo, Invoice, LedgerEntry, Product, Purchase, PurchaseInvoice, PurchaseInvoiceLine, Supplier } from '../types';
import { booksLockedFor } from '../utils/accounting';
import { formatCurrency } from '../utils/formatters';
import { landedPosting, purchaseInvoiceTotals } from '../utils/purchaseInvoices';
import type { ReceiveStockInput } from './inventoryStore';

/**
 * The "Apna Accountant" layer: purchase invoices and delivery orders.
 *
 * Purchase invoice (see utils/purchaseInvoices.ts for the accounting treatment):
 *  - every line is received into stock through the normal Receive stock path (receiveStock →
 *    addPurchase), at its landed rate (bill discount and other charges spread over the lines);
 *  - the paisa rounding left over is one `purchase_variance` supplier row (Purchase price differences 5150),
 *    so the supplier is owed exactly the bill total;
 *  - "Paid now" is a supplier payment (`payment_made`, method Cash / Bank…), Dr Payable / Cr Cash or Bank.
 *  Deleting the invoice undoes all of it (stock, supplier balance, ledger rows).
 *
 * Delivery order (a bill whose goods go out later): stock is taken when the bill is made, as in the old
 * program; the bill only carries a delivery status (pending → delivered with date, who and vehicle).
 */

type Result<T = object> = { success: boolean; message: string } & Partial<T>;

export const CLASSIC_STORAGE_KEYS = {
  PURCHASE_INVOICES: 'tradeflow_purchase_invoices_v1',
};

/** Payment methods for "Paid now" on a purchase invoice (a cheque goes through Pay supplier → cheque register). */
export const PURCHASE_PAY_METHODS = ['Cash', 'Bank Transfer', 'Easypaisa / JazzCash', 'Card'];

export interface PurchaseInvoiceLineInput {
  productId: string;
  /** Quantity in the item's base unit (cans, tins, kg…). */
  qty: number;
  /** Rate per base unit on the supplier's bill. */
  rate: number;
  /** Typed in packs (cartons): packs × pack size = qty. Kept for printing only. */
  packs?: number;
  batchNo?: string;
  expiryDate?: string;
}

export interface PurchaseInvoiceInput {
  supplierId: string;
  date?: string;
  memoNo?: string;
  godownId?: string;
  lines: PurchaseInvoiceLineInput[];
  /** Discount as % of the gross (wins over discountAmount when above 0). */
  discountPct?: number;
  discountAmount?: number;
  otherCharges?: number;
  paidNow?: number;
  paidMethod?: string;
  remarks?: string;
}

export interface DeliveredInput {
  date?: string;
  by?: string;
  vehicle?: string;
  note?: string;
}

export interface ClassicApi {
  purchaseInvoices: PurchaseInvoice[];
  createPurchaseInvoice: (input: PurchaseInvoiceInput) => Result<{ invoice: PurchaseInvoice }>;
  /** Change a saved purchase invoice (Search → edit): the old one is reversed and the new one posted under the same number. */
  editPurchaseInvoice: (id: string, input: PurchaseInvoiceInput) => Result<{ invoice: PurchaseInvoice }>;
  /** Why a saved purchase invoice cannot be changed or deleted now (null = it can). */
  purchaseInvoiceEditBlock: (id: string) => string | null;
  deletePurchaseInvoice: (id: string) => Result;
  /** The number the next purchase invoice will get (nothing is used up). */
  previewPurchaseInvoiceNumber: (date?: string) => string;
  /** Delivery orders: mark the goods delivered (date, who, vehicle) or back to pending. */
  markBillDelivered: (invoiceId: string, input?: DeliveredInput) => Result;
  markBillDeliveryPending: (invoiceId: string) => Result;
}

interface Deps {
  products: Product[];
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  purchases: Purchase[];
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  settings: { booksLockedUntil?: string };
  can: (p: string) => boolean;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: any) => void;
  uid: (prefix: string) => string;
  userName?: string;
  today: () => string;
  isCloudSyncReady: boolean;
  syncToSupabase: (table: string, rows: unknown[]) => Promise<void>;
  removeRemote: (table: any, ids: string[]) => void;
  receiveStock: (input: ReceiveStockInput) => { success: boolean; message: string; purchase?: Purchase };
  deletePurchase: (id: string) => { purchases: number };
  isBilledReceipt: (purchaseId: string) => boolean;
  /** Take / preview the next number of the purchase_invoice series. */
  docNumber: (date: string, existing: string[]) => string;
  previewNumber: (date: string, existing: string[]) => string;
  /** Next supplier payment number (supplier_payment series). */
  payNumber: (date: string) => string;
  branchStamp: () => { branchId?: string };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const load = <T,>(key: string): T[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const fail = (message: string) => ({ success: false as const, message });

export const useClassicStore = (d: Deps) => {
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>(() => load(CLASSIC_STORAGE_KEYS.PURCHASE_INVOICES));
  useEffect(() => { localStorage.setItem(CLASSIC_STORAGE_KEYS.PURCHASE_INVOICES, JSON.stringify(purchaseInvoices)); }, [purchaseInvoices]);
  useEffect(() => { void d.syncToSupabase('purchase_invoices', purchaseInvoices); }, [purchaseInvoices, d.isCloudSyncReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const numbers = () => purchaseInvoices.map((p) => p.invoiceNumber);

  /** Why a saved invoice cannot be reversed right now (null = it can). */
  const reverseBlock = (inv: PurchaseInvoice): string | null => {
    const locked = booksLockedFor(d.settings, inv.date);
    if (locked) return locked;
    const receiptIds = inv.lines.map((l) => l.purchaseId).filter((x): x is string => Boolean(x));
    if (receiptIds.some((pid) => d.isBilledReceipt(pid))) return 'A supplier bill is recorded against these goods. Delete that bill first (Suppliers → Supplier bills).';
    return null;
  };
  /** Undo a saved invoice: its receipts (stock + supplier), the payment and rounding rows. */
  const reverse = (inv: PurchaseInvoice) => {
    const receiptIds = inv.lines.map((l) => l.purchaseId).filter((x): x is string => Boolean(x));
    receiptIds.forEach((pid) => { if (d.purchases.some((p) => p.id === pid)) d.deletePurchase(pid); });
    const extraRows = [inv.paymentLedgerId, inv.roundingLedgerId].filter((x): x is string => Boolean(x));
    // Put back what the extra rows moved: the payment lowered the balance, the rounding raised (or lowered) it.
    const back = round2(d.ledger.filter((l) => extraRows.includes(l.id)).reduce((a, l) => a - (Number(l.debit) || 0) + (Number(l.credit) || 0), 0));
    if (Math.abs(back) >= 0.005) d.setSuppliers((sp) => sp.map((s) => (s.id === inv.supplierId ? { ...s, totalOwed: round2((s.totalOwed || 0) + back) } : s)));
    d.setLedger((prev) => prev.filter((l) => !extraRows.includes(l.id)));
    if (extraRows.length) d.removeRemote('ledger', extraRows);
    setPurchaseInvoices((prev) => prev.filter((p) => p.id !== inv.id));
    d.removeRemote('purchase_invoices', [inv.id]);
  };

  const createPurchaseInvoice: ClassicApi['createPurchaseInvoice'] = (input) => post(input);

  const post = (input: PurchaseInvoiceInput, replace?: PurchaseInvoice): Result<{ invoice: PurchaseInvoice }> => {
    if (!(d.can('products:create') || d.can('stock:adjust'))) return fail("You don't have permission to enter purchase invoices. Ask a manager or admin.");
    const supplier = d.suppliers.find((s) => s.id === input.supplierId);
    if (!supplier) return fail('Pick the supplier.');
    const date = input.date || d.today();
    if (date > d.today()) return fail('The date cannot be in the future.');
    const locked = booksLockedFor(d.settings, date);
    if (locked) return fail(locked);
    const lines = (input.lines || []).filter((l) => l.productId);
    if (lines.length === 0) return fail('Add at least one item.');
    for (const [i, l] of lines.entries()) {
      const p = d.products.find((x) => x.id === l.productId);
      const where = lines.length > 1 ? `Line ${i + 1}: ` : '';
      // "Line 2: enter the rate…", or on its own "Enter the rate…" (a sentence starts with a capital).
      const say = (t: string) => fail(where ? `${where}${t}` : t.charAt(0).toUpperCase() + t.slice(1));
      if (!p) return say('item not found.');
      if (!(Number(l.qty) > 0)) return say(`enter the quantity of ${p.name}.`);
      if (!(Number(l.rate) > 0)) return say(`enter the rate of ${p.name}.`);
      if (l.expiryDate && l.expiryDate < date) return say(`the expiry date of ${p.name} is before the invoice date.`);
    }
    const memoNo = (input.memoNo || '').trim();
    if (memoNo && purchaseInvoices.some((p) => p.id !== replace?.id && p.supplierId === supplier.id && (p.memoNo || '').trim().toLowerCase() === memoNo.toLowerCase())) {
      return fail(`Bill no. ${memoNo} of ${supplier.company || supplier.name} is already entered.`);
    }
    const totals = purchaseInvoiceTotals(lines, { discountPct: input.discountPct, discountAmount: input.discountAmount, otherCharges: input.otherCharges });
    if (totals.total <= 0) return fail('The invoice total must be more than zero.');
    const paid = round2(Math.max(0, Number(input.paidNow) || 0));
    if (paid > totals.total + 0.005) return fail(`Paid now (${formatCurrency(paid)}) is more than the invoice total (${formatCurrency(totals.total)}).`);
    const method = input.paidMethod && PURCHASE_PAY_METHODS.includes(input.paidMethod) ? input.paidMethod : 'Cash';

    if (replace) {
      const block = reverseBlock(replace);
      if (block) return fail(block);
      reverse(replace);
    }
    const invoiceNumber = replace ? replace.invoiceNumber : d.docNumber(date, numbers());
    const id = d.uid('pinv');
    const { rates, rounding } = landedPosting(lines, totals);
    const supName = supplier.company || supplier.name;
    const note = `Purchase invoice ${invoiceNumber}${memoNo ? ` (bill ${memoNo})` : ''}`;
    // Editing: the old invoice's part of what the supplier is owed is already taken back off.
    let owed = round2((supplier.totalOwed || 0) - (replace && replace.supplierId === supplier.id ? replace.totalAmount - replace.paidAmount : 0));
    const outLines: PurchaseInvoiceLine[] = [];
    const receipts: string[] = [];
    for (const [i, l] of lines.entries()) {
      const p = d.products.find((x) => x.id === l.productId)!;
      const qty = round2(Number(l.qty));
      const r = d.receiveStock({ productId: p.id, godownId: input.godownId, qty, costPrice: rates[i], supplierId: supplier.id, date, note, owedBefore: owed, batchNo: p.trackBatches ? l.batchNo : undefined, expiryDate: p.trackBatches ? l.expiryDate || undefined : undefined });
      // Only possible if something changed between the checks above and here (e.g. permission): stop, keep what was received.
      if (!r.success) return fail(`${p.name}: ${r.message}`);
      if (r.purchase) {
        receipts.push(r.purchase.receiptNumber);
        owed = round2(owed + r.purchase.amount);
      }
      outLines.push({
        id: d.uid('pil'),
        productId: p.id,
        productName: p.name,
        ...(p.code ? { code: p.code } : {}),
        unit: p.unit || 'pcs',
        ...(l.packs && p.packName && (p.packSize || 0) > 1 ? { packName: p.packName, packSize: p.packSize, packs: round2(l.packs) } : {}),
        qty,
        rate: round2(Number(l.rate)),
        amount: round2(qty * Number(l.rate)),
        landedRate: rates[i],
        ...(r.purchase ? { purchaseId: r.purchase.id } : {}),
        ...(p.trackBatches && l.batchNo ? { batchNo: l.batchNo } : {}),
        ...(p.trackBatches && l.expiryDate ? { expiryDate: l.expiryDate } : {}),
      });
    }

    const ledgerRows: LedgerEntry[] = [];
    let roundingLedgerId: string | null = null;
    if (Math.abs(rounding) >= 0.01) {
      roundingLedgerId = d.uid('led');
      owed = round2(owed + rounding);
      ledgerRows.push({ id: roundingLedgerId, entityType: 'supplier', entityId: supplier.id, type: 'purchase_variance', referenceId: invoiceNumber, sourceId: id, date, description: `Rounding on purchase invoice ${invoiceNumber}`, debit: rounding > 0 ? rounding : 0, credit: rounding < 0 ? -rounding : 0, balanceAfter: owed, ...d.branchStamp() });
    }
    let paymentLedgerId: string | null = null;
    if (paid > 0) {
      paymentLedgerId = d.uid('led');
      owed = round2(owed - paid);
      ledgerRows.push({ id: paymentLedgerId, entityType: 'supplier', entityId: supplier.id, type: 'payment_made', referenceId: d.payNumber(date), sourceId: id, method, date, description: `Paid on purchase invoice ${invoiceNumber}: ${method}`, debit: 0, credit: paid, balanceAfter: owed, ...d.branchStamp() });
    }
    const change = round2(rounding - paid);
    if (Math.abs(change) >= 0.005) d.setSuppliers((prev) => prev.map((s) => (s.id === supplier.id ? { ...s, totalOwed: round2((s.totalOwed || 0) + change) } : s)));
    // The receipts' supplier rows read as lines of this invoice on the supplier's statement.
    d.setLedger((prev) => [
      ...ledgerRows,
      ...prev.map((l) => (l.entityType === 'supplier' && l.type === 'purchase_received' && receipts.includes(l.referenceId) ? { ...l, description: `${note}: ${l.description.replace(/^Stock received [^:]*:\s*/, '')}` } : l)),
    ]);

    const invoice: PurchaseInvoice = {
      id,
      invoiceNumber,
      ...(memoNo ? { memoNo } : {}),
      date,
      supplierId: supplier.id,
      supplierName: supName,
      godownId: input.godownId || null,
      lines: outLines,
      grossAmount: totals.gross,
      ...((Number(input.discountPct) || 0) > 0 ? { discountPct: round2(Number(input.discountPct)) } : {}),
      discountAmount: totals.discount,
      otherCharges: totals.charges,
      totalAmount: totals.total,
      paidAmount: paid,
      ...(paid > 0 ? { paidMethod: method } : {}),
      paymentLedgerId,
      roundingLedgerId,
      ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}),
      createdAt: replace ? replace.createdAt : new Date().toISOString(),
      createdBy: replace ? replace.createdBy : d.userName,
      ...(replace ? { updatedAt: new Date().toISOString(), updatedBy: d.userName } : {}),
      ...d.branchStamp(),
    };
    setPurchaseInvoices((prev) => [invoice, ...prev]);
    if (replace) {
      d.logAuditEvent('Purchase Invoice Edited', `${invoiceNumber} from ${supName}: ${formatCurrency(replace.totalAmount)} → ${formatCurrency(totals.total)}.`, 'warning', 'billing');
      return { success: true, message: `Purchase invoice ${invoiceNumber} updated.`, invoice };
    }
    d.logAuditEvent('Purchase Invoice Saved', `${invoiceNumber}${memoNo ? ` (bill ${memoNo})` : ''} from ${supName}: ${formatCurrency(totals.total)}${paid > 0 ? `, ${formatCurrency(paid)} paid by ${method}` : ''}.`, 'info', 'billing');
    return { success: true, message: `Purchase invoice ${invoiceNumber} saved.`, invoice };
  };

  const purchaseInvoiceEditBlock: ClassicApi['purchaseInvoiceEditBlock'] = (id) => {
    const inv = purchaseInvoices.find((p) => p.id === id);
    if (!inv) return 'Purchase invoice not found.';
    if (!d.can('delete_records')) return "You don't have permission to change saved purchase invoices. Ask a manager or admin.";
    return reverseBlock(inv);
  };

  const editPurchaseInvoice: ClassicApi['editPurchaseInvoice'] = (id, input) => {
    if (!d.can('delete_records')) return fail("You don't have permission to change saved purchase invoices. Ask a manager or admin.");
    const inv = purchaseInvoices.find((p) => p.id === id);
    if (!inv) return fail('Purchase invoice not found.');
    return post(input, inv);
  };

  const deletePurchaseInvoice: ClassicApi['deletePurchaseInvoice'] = (id) => {
    if (!d.can('delete_records')) return fail("You don't have permission to delete purchase invoices. Ask a manager or admin.");
    const inv = purchaseInvoices.find((p) => p.id === id);
    if (!inv) return fail('Purchase invoice not found.');
    const block = reverseBlock(inv);
    if (block) return fail(block);
    reverse(inv);
    d.logAuditEvent('Purchase Invoice Deleted', `${inv.invoiceNumber} from ${inv.supplierName} (${formatCurrency(inv.totalAmount)}): stock, supplier balance and payment reversed.`, 'danger', 'billing');
    return { success: true, message: `Purchase invoice ${inv.invoiceNumber} deleted.` };
  };

  const setDelivery = (invoiceId: string, next: DeliveryInfo | undefined) => d.setInvoices((prev) => prev.map((i) => (i.id === invoiceId ? { ...i, delivery: next, updatedAt: d.today() } : i)));

  const markBillDelivered: ClassicApi['markBillDelivered'] = (invoiceId, input = {}) => {
    const inv = d.invoices.find((i) => i.id === invoiceId);
    if (!inv) return fail('Bill not found.');
    if (!inv.delivery) return fail(`Bill ${inv.invoiceNumber} is not a delivery order.`);
    const on = input.date || d.today();
    if (on > d.today()) return fail('The delivery date cannot be in the future.');
    if (on < inv.issueDate) return fail('The delivery date is before the bill date.');
    setDelivery(invoiceId, {
      status: 'delivered',
      deliveredOn: on,
      ...(input.by?.trim() ? { deliveredBy: input.by.trim() } : {}),
      ...(input.vehicle?.trim() ? { vehicle: input.vehicle.trim().toUpperCase() } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      markedBy: d.userName,
      markedAt: new Date().toISOString(),
    });
    d.logAuditEvent('Delivery Marked Done', `${inv.invoiceNumber} (${inv.customerName}) delivered on ${on}${input.by?.trim() ? ` by ${input.by.trim()}` : ''}${input.vehicle?.trim() ? `, vehicle ${input.vehicle.trim().toUpperCase()}` : ''}.`, 'info', 'billing');
    return { success: true, message: `Bill ${inv.invoiceNumber} marked delivered.` };
  };

  const markBillDeliveryPending: ClassicApi['markBillDeliveryPending'] = (invoiceId) => {
    const inv = d.invoices.find((i) => i.id === invoiceId);
    if (!inv?.delivery) return fail('Bill not found.');
    setDelivery(invoiceId, { status: 'pending' });
    d.logAuditEvent('Delivery Set Pending', `${inv.invoiceNumber} (${inv.customerName}) is waiting for delivery again.`, 'warning', 'billing');
    return { success: true, message: `Bill ${inv.invoiceNumber} is pending delivery again.` };
  };

  // ---- load / backup / reset ----
  const hydrate = (data: { purchaseInvoices?: unknown }, opts: { keepLocalIfEmpty?: boolean } = {}) => {
    if (!Array.isArray(data.purchaseInvoices)) return;
    if (opts.keepLocalIfEmpty && data.purchaseInvoices.length === 0) return;
    setPurchaseInvoices(data.purchaseInvoices as PurchaseInvoice[]);
  };
  const backupData = () => ({ purchaseInvoices });
  const reset = () => {
    setPurchaseInvoices([]);
    localStorage.removeItem(CLASSIC_STORAGE_KEYS.PURCHASE_INVOICES);
  };
  const purgeSetters = { purchase_invoices: () => setPurchaseInvoices([]) };
  /** A deleted supplier takes their purchase invoices with them (their receipts and ledger go too). */
  const removeForSupplier = (supplierId: string) => {
    const ids = purchaseInvoices.filter((p) => p.supplierId === supplierId).map((p) => p.id);
    if (ids.length === 0) return;
    setPurchaseInvoices((prev) => prev.filter((p) => p.supplierId !== supplierId));
    d.removeRemote('purchase_invoices', ids);
  };

  const api: ClassicApi = {
    purchaseInvoices,
    createPurchaseInvoice,
    editPurchaseInvoice,
    purchaseInvoiceEditBlock,
    deletePurchaseInvoice,
    previewPurchaseInvoiceNumber: (date) => d.previewNumber(date || d.today(), numbers()),
    markBillDelivered,
    markBillDeliveryPending,
  };
  return { api, hydrate, backupData, reset, purgeSetters, removeForSupplier };
};
