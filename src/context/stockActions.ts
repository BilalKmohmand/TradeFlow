import React from 'react';
import { AdjustmentReason, Godown, LedgerEntry, Product, Purchase, StockAdjustment, StockBatch, StockReturn, Supplier, adjustmentReasonLabel } from '../types';
import { addLooseRow, applyDeltas, godownName, mainGodownId, planTakeFromGodown, restoreBillRows, round2, withMainGodown } from '../utils/inventory';
import { costPerKgOn } from '../utils/finance';
import { formatCurrency } from '../utils/formatters';

type Result<T = object> = { success: boolean; message: string } & Partial<T>;

export interface StockAdjustInput {
  productId: string;
  /** + stock found / received free, − stock lost. */
  deltaQty: number;
  reason: AdjustmentReason;
  godownId?: string | null;
  /** Adjust exactly this batch (its godown is used). */
  batchId?: string | null;
  note?: string;
  date?: string;
}

export interface PurchaseReturnInput {
  supplierId: string;
  productId: string;
  qty: number;
  /** Rate per unit credited back by the supplier. */
  rate: number;
  reason: string;
  godownId?: string | null;
  batchId?: string | null;
  purchaseId?: string | null;
  date?: string;
}

/** Stock adjustments with a reason and goods sent back to suppliers, godown- and batch-aware. */
export interface StockActionsApi {
  adjustStockBy: (input: StockAdjustInput) => Result<{ adjustment: StockAdjustment }>;
  undoStockAdjustment: (id: string) => Result;
  returnToSupplier: (input: PurchaseReturnInput) => Result<{ stockReturn: StockReturn }>;
  deletePurchaseReturn: (id: string) => Result;
}

interface Deps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  purchases: Purchase[];
  adjustments: StockAdjustment[];
  setAdjustments: React.Dispatch<React.SetStateAction<StockAdjustment[]>>;
  returns: StockReturn[];
  setReturns: React.Dispatch<React.SetStateAction<StockReturn[]>>;
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  godowns: Godown[];
  stockBatches: StockBatch[];
  updateRows: (fn: (rows: StockBatch[]) => StockBatch[]) => void;
  can: (permission: string) => boolean;
  lockedFor: (date: string) => string | null;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger') => void;
  removeRemote: (table: any, ids: string[]) => void;
  uid: (prefix: string) => string;
  userName?: string;
  today: () => string;
  /** Next debit note number from the shop's number series (see controlActions.ts); DN-n when absent. */
  docNumber?: (date: string) => string;
}

const EPS = 0.0001;
const NO = (what: string) => ({ success: false as const, message: `You don't have permission to ${what}. Ask a manager or admin.` });

/** Next DN-### number (highest existing + 1), so debit notes read in order. */
export const nextDebitNoteNumber = (returns: StockReturn[]): string => {
  const max = returns
    .filter((r) => r.kind === 'purchase')
    .reduce((m, r) => {
      const n = parseInt((r.returnNumber.match(/(\d+)\s*$/) || [])[1] || '0', 10);
      return Number.isFinite(n) && n > m && n < 1_000_000 ? n : m;
    }, 0);
  return `DN-${max + 1}`;
};

export const createStockActions = (d: Deps): StockActionsApi => {
  const unitOf = (p: Product) => p.unit || 'pcs';
  const costOf = (p: Product, date: string, row?: StockBatch) => {
    if (row?.costPrice && row.costPrice > 0) return round2(row.costPrice);
    const dated = costPerKgOn(d.purchases, p.id, date);
    if (dated != null && dated > 0) return round2(dated);
    return p.costPricePerKg && p.costPricePerKg > 0 ? round2(p.costPricePerKg) : undefined;
  };
  const checkDate = (date: string): string | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter a valid date.';
    if (date > d.today()) return 'The date cannot be in the future.';
    return d.lockedFor(date);
  };

  const adjustStockBy: StockActionsApi['adjustStockBy'] = (input) => {
    if (!d.can('stock:adjust')) return NO('adjust stock');
    const product = d.products.find((p) => p.id === input.productId);
    if (!product) return { success: false, message: 'Pick an item.' };
    const delta = round2(Number(input.deltaQty));
    if (!Number.isFinite(delta) || Math.abs(delta) < EPS) return { success: false, message: 'Enter how much stock to add or take off.' };
    const date = input.date || d.today();
    const bad = checkDate(date);
    if (bad) return { success: false, message: bad };
    const unit = unitOf(product);
    const all = withMainGodown(d.godowns);
    const mainId = mainGodownId(d.godowns);
    const row = input.batchId ? d.stockBatches.find((r) => r.id === input.batchId && r.productId === product.id) : undefined;
    if (input.batchId && !row) return { success: false, message: 'That batch was not found.' };
    const godownId = row ? row.godownId : input.godownId && all.some((g) => g.id === input.godownId) ? input.godownId : mainId;

    let rowChange: ((rows: StockBatch[]) => StockBatch[]) | null = null;
    let batchNo: string | undefined;
    if (delta < 0) {
      const plan = planTakeFromGodown(product, d.stockBatches, d.godowns, godownId, -delta, date, row?.id);
      if (!plan.ok) return { success: false, message: plan.message || 'Not enough stock.' };
      if (Object.keys(plan.deltas).length) rowChange = (rows) => applyDeltas(rows, plan.deltas);
      batchNo = row?.batchNo || (plan.batches.length === 1 ? plan.batches[0].batchNo : undefined);
    } else if (row) {
      rowChange = (rows) => rows.map((r) => (r.id === row.id ? { ...r, qty: round2(r.qty + delta) } : r));
      batchNo = row.batchNo || undefined;
    } else if (godownId !== mainId) {
      rowChange = (rows) => addLooseRow(rows, d.godowns, product.id, godownId, delta, date);
    }

    const cost = costOf(product, date, row);
    const adjustment: StockAdjustment = {
      id: d.uid('adj'),
      productId: product.id,
      deltaKg: delta,
      reason: input.reason,
      ...(cost ? { costPerKg: cost } : {}),
      note: input.note?.trim() || undefined,
      date,
      createdAt: new Date().toISOString(),
      createdBy: d.userName,
      godownId: godownId === mainId ? null : godownId,
      batchId: row?.id || null,
      ...(batchNo ? { batchNo } : {}),
    };
    d.setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, stockKg: round2(p.stockKg + delta) } : p)));
    if (rowChange) d.updateRows(rowChange);
    d.setAdjustments((prev) => [adjustment, ...prev]);
    const where = all.length > 1 ? ` in ${godownName(d.godowns, godownId)}` : '';
    const label = adjustmentReasonLabel(input.reason);
    d.logAuditEvent('Stock Adjusted', `${product.name}: ${delta > 0 ? '+' : ''}${delta} ${unit}${where}${batchNo ? ` (batch ${batchNo})` : ''} — ${label}${adjustment.note ? `: ${adjustment.note}` : ''}`, 'warning');
    return { success: true, message: `${product.name}: ${delta > 0 ? 'added' : 'took off'} ${Math.abs(delta)} ${unit}${where} (${label.toLowerCase()}).`, adjustment };
  };

  const undoStockAdjustment: StockActionsApi['undoStockAdjustment'] = (id) => {
    if (!d.can('stock:adjust') || !d.can('delete_records')) return NO('undo stock adjustments');
    const adj = d.adjustments.find((a) => a.id === id);
    if (!adj) return { success: false, message: 'Adjustment not found.' };
    const bad = d.lockedFor(adj.date.slice(0, 10));
    if (bad) return { success: false, message: bad };
    const product = d.products.find((p) => p.id === adj.productId);
    const mainId = mainGodownId(d.godowns);
    const godownId = adj.godownId || mainId;
    if (product && adj.deltaKg > 0) {
      // Taking back stock that was added: it must still be there.
      const plan = planTakeFromGodown(product, d.stockBatches, d.godowns, godownId, adj.deltaKg, d.today(), adj.batchId && d.stockBatches.some((r) => r.id === adj.batchId) ? adj.batchId : null);
      if (!plan.ok) return { success: false, message: `Can't undo: ${plan.message}` };
      if (Object.keys(plan.deltas).length) d.updateRows((rows) => applyDeltas(rows, plan.deltas));
    } else if (product && adj.deltaKg < 0) {
      const back = -adj.deltaKg;
      if (adj.batchId || godownId !== mainId) {
        const batches = adj.batchId ? [{ batchId: adj.batchId, batchNo: adj.batchNo || '', qty: back, godownId }] : [];
        d.updateRows((rows) => restoreBillRows(rows, [{ productId: product.id, qty: back, godownId, batches: batches.filter((b) => b.batchNo) }], d.godowns, d.today()));
      }
    }
    d.setProducts((prev) => prev.map((p) => (p.id === adj.productId ? { ...p, stockKg: round2(p.stockKg - adj.deltaKg) } : p)));
    d.setAdjustments((prev) => prev.filter((a) => a.id !== id));
    d.removeRemote('stock_adjustments', [id]);
    d.logAuditEvent('Stock Adjustment Undone', `${product?.name || 'Item'}: ${adj.deltaKg > 0 ? '+' : ''}${adj.deltaKg} reversed.`, 'danger');
    return { success: true, message: 'Adjustment undone.' };
  };

  const returnToSupplier: StockActionsApi['returnToSupplier'] = (input) => {
    if (!d.can('products:create') && !d.can('stock:adjust')) return NO('send stock back to suppliers');
    const supplier = d.suppliers.find((s) => s.id === input.supplierId);
    if (!supplier) return { success: false, message: 'Pick the supplier.' };
    const product = d.products.find((p) => p.id === input.productId);
    if (!product) return { success: false, message: 'Pick an item.' };
    const qty = round2(Number(input.qty));
    if (!(qty > 0)) return { success: false, message: 'Enter the quantity sent back.' };
    const rate = round2(Number(input.rate));
    if (!(rate > 0)) return { success: false, message: `Enter the rate per ${unitOf(product)} the supplier will credit.` };
    if (!input.reason.trim()) return { success: false, message: 'Say why the goods are going back (e.g. leaking tins).' };
    const date = input.date || d.today();
    const bad = checkDate(date);
    if (bad) return { success: false, message: bad };
    const mainId = mainGodownId(d.godowns);
    const row = input.batchId ? d.stockBatches.find((r) => r.id === input.batchId && r.productId === product.id) : undefined;
    const godownId = row ? row.godownId : input.godownId || mainId;
    const plan = planTakeFromGodown(product, d.stockBatches, d.godowns, godownId, qty, date, row?.id);
    if (!plan.ok) return { success: false, message: plan.message || 'Not enough stock.' };

    const amount = round2(qty * rate);
    const unit = unitOf(product);
    const stockReturn: StockReturn = {
      id: d.uid('ret'),
      returnNumber: d.docNumber ? d.docNumber(date) : nextDebitNoteNumber(d.returns),
      kind: 'purchase',
      customerId: null,
      supplierId: supplier.id,
      productId: product.id,
      dispatchId: null,
      purchaseId: input.purchaseId || null,
      kg: qty,
      pricePerKg: rate,
      amount,
      reason: input.reason.trim(),
      date,
      createdAt: new Date().toISOString(),
      createdBy: d.userName,
      godownId: godownId === mainId ? null : godownId,
      ...(plan.batches.length ? { batches: plan.batches } : {}),
      unit,
    };
    const owedAfter = round2(supplier.totalOwed - amount);
    const entry: LedgerEntry = {
      id: d.uid('led'),
      entityType: 'supplier',
      entityId: supplier.id,
      type: 'debit_note',
      referenceId: stockReturn.returnNumber,
      date,
      description: `Debit note ${stockReturn.returnNumber}: ${qty} ${unit} ${product.name} returned — ${stockReturn.reason}`,
      debit: 0,
      credit: amount,
      balanceAfter: owedAfter,
      kg: qty,
      sourceId: stockReturn.id,
    };
    d.setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, stockKg: round2(p.stockKg - qty) } : p)));
    if (Object.keys(plan.deltas).length) d.updateRows((rows) => applyDeltas(rows, plan.deltas));
    d.setSuppliers((prev) => prev.map((s) => (s.id === supplier.id ? { ...s, totalOwed: round2(s.totalOwed - amount) } : s)));
    d.setLedger((prev) => [entry, ...prev]);
    d.setReturns((prev) => [stockReturn, ...prev]);
    d.logAuditEvent('Purchase Return', `${stockReturn.returnNumber}: ${qty} ${unit} ${product.name} back to ${supplier.company || supplier.name} (${formatCurrency(amount)}) — ${stockReturn.reason}`, 'warning');
    return { success: true, message: `Debit note ${stockReturn.returnNumber} made. ${formatCurrency(amount)} taken off what you owe ${supplier.company || supplier.name}.`, stockReturn };
  };

  const deletePurchaseReturn: StockActionsApi['deletePurchaseReturn'] = (id) => {
    if (!d.can('delete_records')) return NO('delete debit notes');
    const r = d.returns.find((x) => x.id === id && x.kind === 'purchase');
    if (!r) return { success: false, message: 'Debit note not found.' };
    const bad = d.lockedFor(r.date);
    if (bad) return { success: false, message: bad };
    const ledgerIds = d.ledger.filter((l) => l.entityType === 'supplier' && l.referenceId === r.returnNumber && l.type === 'debit_note').map((l) => l.id);
    d.setProducts((prev) => prev.map((p) => (p.id === r.productId ? { ...p, stockKg: round2(p.stockKg + r.kg) } : p)));
    if (r.batches?.length || r.godownId) d.updateRows((rows) => restoreBillRows(rows, [{ productId: r.productId, qty: r.kg, godownId: r.godownId || undefined, batches: r.batches }], d.godowns, d.today()));
    if (r.supplierId) d.setSuppliers((prev) => prev.map((s) => (s.id === r.supplierId ? { ...s, totalOwed: round2(s.totalOwed + r.amount) } : s)));
    d.setLedger((prev) => prev.filter((l) => !ledgerIds.includes(l.id)));
    d.setReturns((prev) => prev.filter((x) => x.id !== id));
    d.removeRemote('ledger', ledgerIds);
    d.removeRemote('returns', [id]);
    d.logAuditEvent('Debit Note Deleted', `${r.returnNumber} removed; stock and supplier balance put back.`, 'danger');
    return { success: true, message: `${r.returnNumber} deleted.` };
  };

  return { adjustStockBy, undoStockAdjustment, returnToSupplier, deletePurchaseReturn };
};
