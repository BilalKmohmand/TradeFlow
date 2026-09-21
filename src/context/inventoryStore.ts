import React, { useEffect, useMemo, useState } from 'react';
import { BatchAllocation, Godown, Invoice, Product, Purchase, StockAdjustment, StockBatch, StockTransfer, Supplier } from '../types';
import {
  BillStockPlan,
  MAIN_GODOWN,
  applyDeltas,
  godownName,
  invId,
  mainGodownId,
  planBillStock,
  planTransfer,
  receiveIntoRows,
  reconcileBatches,
  restoreBillRows,
  round2,
  takeBackReturnRows,
  withMainGodown,
} from '../utils/inventory';

export const INVENTORY_STORAGE_KEYS = {
  GODOWNS: 'tradeflow_godowns_v1',
  STOCK_BATCHES: 'tradeflow_stock_batches_v1',
  STOCK_TRANSFERS: 'tradeflow_stock_transfers_v1',
};

type Result<T = object> = { success: boolean; message: string } & Partial<T>;

export interface ReceiveStockInput {
  productId: string;
  godownId?: string;
  qty: number;
  batchNo?: string;
  expiryDate?: string;
  /** Cost per unit. With a supplier it is also booked as a purchase owed to the supplier. */
  costPrice?: number;
  supplierId?: string | null;
  date?: string;
  note?: string;
}

export interface TransferStockInput {
  productId: string;
  fromGodownId: string;
  toGodownId: string;
  qty: number;
  date?: string;
  note?: string;
}

/** Everything the rest of the app sees about godowns, batches and transfers (part of useTrading()). */
export interface InventoryApi {
  /** All godowns; the main (default) godown is always first. */
  godowns: Godown[];
  stockBatches: StockBatch[];
  stockTransfers: StockTransfer[];
  addGodown: (name: string, address?: string) => Result<{ godown: Godown }>;
  updateGodown: (id: string, data: { name?: string; address?: string }) => Result;
  deleteGodown: (id: string) => Result;
  receiveStock: (input: ReceiveStockInput) => Result<{ batch: StockBatch; purchase: Purchase }>;
  transferStock: (input: TransferStockInput) => Result<{ transfer: StockTransfer }>;
}

interface Deps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  suppliers: Supplier[];
  addPurchase: (data: { supplierId: string; productId: string; kg: number; pricePerKg: number; date?: string; notes?: string }) => Purchase;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: any) => void;
  userName?: string;
  isCloudSyncReady: boolean;
  syncToSupabase: (table: string, rows: unknown[]) => Promise<void>;
  removeRemote: (table: any, ids: string[]) => void;
  recordAdjustment?: (a: Omit<StockAdjustment, 'id' | 'createdAt' | 'createdBy'>) => void;
  /** Permission check of the signed-in user (receiving/moving stock and managing godowns are not for everyone). */
  can?: (permission: string) => boolean;
}

const today = () => new Date().toISOString().split('T')[0];
const load = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/**
 * Godowns, stock batches and transfers. Lives inside TradingProvider so bills and purchases can
 * use it; product.stockKg stays the total (see utils/inventory.ts for the model).
 */
export const useInventoryStore = (deps: Deps) => {
  const { products, setProducts, suppliers, addPurchase, logAuditEvent, userName, isCloudSyncReady, syncToSupabase, removeRemote, recordAdjustment, can } = deps;
  const allowed = (...perms: string[]) => !can || perms.some((x) => can(x));
  const NO = (what: string) => ({ success: false as const, message: `You don't have permission to ${what}. Ask a manager or admin.` });
  const [storedGodowns, setGodowns] = useState<Godown[]>(() => load(INVENTORY_STORAGE_KEYS.GODOWNS));
  const [stockBatches, setStockBatches] = useState<StockBatch[]>(() => load(INVENTORY_STORAGE_KEYS.STOCK_BATCHES));
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>(() => load(INVENTORY_STORAGE_KEYS.STOCK_TRANSFERS));
  const godowns = useMemo(() => withMainGodown(storedGodowns), [storedGodowns]);

  useEffect(() => { localStorage.setItem(INVENTORY_STORAGE_KEYS.GODOWNS, JSON.stringify(storedGodowns)); }, [storedGodowns]);
  useEffect(() => { localStorage.setItem(INVENTORY_STORAGE_KEYS.STOCK_BATCHES, JSON.stringify(stockBatches)); }, [stockBatches]);
  useEffect(() => { localStorage.setItem(INVENTORY_STORAGE_KEYS.STOCK_TRANSFERS, JSON.stringify(stockTransfers)); }, [stockTransfers]);
  useEffect(() => { void syncToSupabase('godowns', storedGodowns); }, [storedGodowns, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('stock_batches', stockBatches); }, [stockBatches, isCloudSyncReady]);
  useEffect(() => { void syncToSupabase('stock_transfers', stockTransfers); }, [stockTransfers, isCloudSyncReady]);

  // Older actions (dispatches, stock counts, deleted purchases/items) only change stockKg; keep rows within the total.
  useEffect(() => {
    const { rows, removedIds } = reconcileBatches(products, stockBatches, storedGodowns);
    if (rows !== stockBatches) setStockBatches(rows);
    if (removedIds.length) removeRemote('stock_batches', removedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, stockBatches]);

  /** Persist the implied main godown the first time godowns are edited. */
  const ensureMain = (prev: Godown[]) => (prev.some((g) => g.isDefault) ? prev : [{ ...MAIN_GODOWN, createdAt: today() }, ...prev]);

  const addGodown: InventoryApi['addGodown'] = (name, address) => {
    if (!allowed('stock:adjust')) return NO('add godowns');
    const clean = name.trim();
    if (!clean) return { success: false, message: 'Give the godown a name.' };
    if (godowns.some((g) => g.name.trim().toLowerCase() === clean.toLowerCase())) return { success: false, message: 'A godown with this name already exists.' };
    const godown: Godown = { id: invId('gdn'), name: clean, address: address?.trim() || undefined, isDefault: false, createdAt: today() };
    setGodowns((prev) => [...ensureMain(prev), godown]);
    logAuditEvent('Godown Added', clean, 'info');
    return { success: true, message: `${clean} added.`, godown };
  };

  const updateGodown: InventoryApi['updateGodown'] = (id, data) => {
    if (!allowed('stock:adjust')) return NO('rename godowns');
    const target = godowns.find((g) => g.id === id);
    if (!target) return { success: false, message: 'Godown not found.' };
    const name = data.name != null ? data.name.trim() : target.name;
    if (!name) return { success: false, message: 'Give the godown a name.' };
    if (godowns.some((g) => g.id !== id && g.name.trim().toLowerCase() === name.toLowerCase())) return { success: false, message: 'A godown with this name already exists.' };
    const next = { ...target, name, address: data.address != null ? data.address.trim() || undefined : target.address };
    setGodowns((prev) => ensureMain(prev).map((g) => (g.id === id ? next : g)));
    if (name !== target.name) logAuditEvent('Godown Renamed', `${target.name} → ${name}`, 'info');
    return { success: true, message: 'Godown saved.' };
  };

  const deleteGodown: InventoryApi['deleteGodown'] = (id) => {
    if (!allowed('stock:adjust') || !allowed('delete_records')) return NO('delete godowns');
    const target = godowns.find((g) => g.id === id);
    if (!target) return { success: false, message: 'Godown not found.' };
    if (target.isDefault) return { success: false, message: 'The main godown cannot be deleted.' };
    const held = stockBatches.filter((r) => r.godownId === id && r.qty > 0.0001);
    if (held.length) {
      const total = round2(held.reduce((a, r) => a + r.qty, 0));
      return { success: false, message: `${target.name} still holds ${total} units of stock. Move it to another godown first.` };
    }
    const emptyRows = stockBatches.filter((r) => r.godownId === id).map((r) => r.id);
    setStockBatches((prev) => prev.filter((r) => r.godownId !== id));
    setGodowns((prev) => prev.filter((g) => g.id !== id));
    removeRemote('godowns', [id]);
    removeRemote('stock_batches', emptyRows);
    logAuditEvent('Godown Deleted', target.name, 'warning');
    return { success: true, message: `${target.name} deleted.` };
  };

  const receiveStock: InventoryApi['receiveStock'] = (input) => {
    if (!allowed('products:create', 'stock:adjust')) return NO('receive stock');
    const product = products.find((p) => p.id === input.productId);
    if (!product) return { success: false, message: 'Pick an item.' };
    const qty = round2(Number(input.qty));
    if (!(qty > 0)) return { success: false, message: 'Enter the quantity received.' };
    const godownId = input.godownId && godowns.some((g) => g.id === input.godownId) ? input.godownId : mainGodownId(storedGodowns);
    const date = input.date || today();
    if (date > today()) return { success: false, message: 'The date cannot be in the future.' };
    if (input.expiryDate && input.expiryDate < date) return { success: false, message: 'The expiry date is before the date received.' };
    const cost = input.costPrice != null && Number.isFinite(input.costPrice) && input.costPrice > 0 ? round2(input.costPrice) : undefined;
    let purchase: Purchase | undefined;
    if (input.supplierId && cost != null) {
      if (!suppliers.some((s) => s.id === input.supplierId)) return { success: false, message: 'Supplier not found.' };
      // Same path as a trading goods receipt: stock in, supplier payable, ledger row.
      purchase = addPurchase({ supplierId: input.supplierId, productId: product.id, kg: qty, pricePerKg: cost, date, notes: [input.batchNo && `Batch ${input.batchNo}`, input.note].filter(Boolean).join(' • ') || undefined });
    } else {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, stockKg: round2(p.stockKg + qty) } : p)));
      recordAdjustment?.({ productId: product.id, deltaKg: qty, reason: 'received', ...(cost != null ? { costPerKg: cost } : {}), note: [input.batchNo && `Batch ${input.batchNo}`, input.note].filter(Boolean).join(' • ') || 'Stock received', date });
    }
    const { rows, batch } = receiveIntoRows(stockBatches, storedGodowns, { product, godownId, qty, batchNo: input.batchNo, expiryDate: input.expiryDate, costPrice: cost, supplierId: input.supplierId, purchaseId: purchase?.id, date });
    if (rows !== stockBatches) {
      const before = new Map<string, StockBatch>(stockBatches.map((r) => [r.id, r]));
      // Apply as a change on the latest state so a concurrent update is not lost.
      setStockBatches((prev) => {
        let out = prev;
        for (const r of rows) {
          const old = before.get(r.id);
          if (!old) out = [...out, r];
          else if (old.qty !== r.qty) out = out.map((x) => (x.id === r.id ? { ...x, qty: round2(x.qty + (r.qty - old.qty)) } : x));
        }
        return out;
      });
    }
    const where = godowns.length > 1 ? ` into ${godownName(storedGodowns, godownId)}` : '';
    logAuditEvent('Stock Received', `${qty} ${product.unit || 'pcs'} ${product.name}${batch ? ` (batch ${batch.batchNo}${batch.expiryDate ? `, exp ${batch.expiryDate}` : ''})` : ''}${where}`, 'info');
    return { success: true, message: `${qty} ${product.unit || 'pcs'} of ${product.name} received${where}.`, batch, purchase };
  };

  const transferStock: InventoryApi['transferStock'] = (input) => {
    if (!allowed('products:create', 'stock:adjust')) return NO('move stock');
    const product = products.find((p) => p.id === input.productId);
    if (!product) return { success: false, message: 'Pick an item.' };
    const qty = round2(Number(input.qty));
    const date = input.date || today();
    const plan = planTransfer(product, stockBatches, storedGodowns, input.fromGodownId, input.toGodownId, qty, date);
    if (!plan.ok) return { success: false, message: plan.message || 'Transfer failed.' };
    const transfer: StockTransfer = {
      id: invId('xfr'),
      productId: product.id,
      fromGodownId: input.fromGodownId,
      toGodownId: input.toGodownId,
      qty,
      date,
      note: input.note?.trim() || undefined,
      batches: plan.batches.length ? plan.batches : undefined,
      createdAt: new Date().toISOString(),
      createdBy: userName,
    };
    setStockBatches(plan.rows);
    setStockTransfers((prev) => [transfer, ...prev]);
    const from = godownName(storedGodowns, input.fromGodownId);
    const to = godownName(storedGodowns, input.toGodownId);
    logAuditEvent('Stock Transferred', `${qty} ${product.unit || 'pcs'} ${product.name}: ${from} → ${to}`, 'info');
    return { success: true, message: `Moved ${qty} ${product.unit || 'pcs'} of ${product.name} from ${from} to ${to}.`, transfer };
  };

  // ---- hooks used by bills (createBill / deleteBill) ----
  const planBill = (items: { productId: string; qty: number }[], godownId: string | undefined, onDate: string): BillStockPlan =>
    planBillStock(products, stockBatches, storedGodowns, items, godownId, onDate);
  const applyBill = (plan: BillStockPlan) => {
    if (Object.keys(plan.deltas).length) setStockBatches((prev) => applyDeltas(prev, plan.deltas));
  };
  const restoreBill = (inv: Pick<Invoice, 'items'>) => {
    if (!inv.items.some((it) => it.batches?.length || it.godownId)) return;
    setStockBatches((prev) => restoreBillRows(prev, inv.items, storedGodowns, today()));
  };

  // ---- hooks used by sales returns against a bill ----
  type ReturnRows = { productId: string; qty: number; godownId?: string; batches?: BatchAllocation[] }[];
  /** Put returned goods back into the batches / godown they were sold from. */
  const restoreReturn = (lines: ReturnRows) => {
    if (!lines.some((l) => l.batches?.length || l.godownId)) return;
    setStockBatches((prev) => restoreBillRows(prev, lines, storedGodowns, today()));
  };
  /** A deleted return takes its goods back out of those batches / godown. */
  const takeBackReturn = (lines: ReturnRows) => {
    if (!lines.some((l) => l.batches?.length || l.godownId)) return;
    setStockBatches((prev) => takeBackReturnRows(prev, lines, storedGodowns));
  };

  // ---- load / backup / reset ----
  /**
   * Replace local inventory with loaded data. `keepLocalIfEmpty` (cloud load): an empty cloud table
   * keeps the local rows, so batches made before migration v11 was run are uploaded, not wiped.
   */
  const hydrate = (data: { godowns?: unknown; stockBatches?: unknown; stockTransfers?: unknown }, opts: { keepLocalIfEmpty?: boolean } = {}) => {
    const take = <T,>(v: unknown, set: React.Dispatch<React.SetStateAction<T[]>>) => {
      if (!Array.isArray(v)) return;
      if (opts.keepLocalIfEmpty && v.length === 0) return;
      set(v as T[]);
    };
    take<Godown>(data.godowns, setGodowns);
    take<StockBatch>(data.stockBatches, setStockBatches);
    take<StockTransfer>(data.stockTransfers, setStockTransfers);
  };
  const backupData = () => ({ godowns: storedGodowns, stockBatches, stockTransfers });
  const reset = () => {
    setGodowns([]);
    setStockBatches([]);
    setStockTransfers([]);
    Object.values(INVENTORY_STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  };
  const purgeSetters = {
    godowns: () => setGodowns([]),
    stock_batches: () => setStockBatches([]),
    stock_transfers: () => setStockTransfers([]),
  };

  /** A deleted purchase takes its own batch with it (not whichever batch happens to sort first). */
  const removePurchaseRows = (purchaseId: string) => {
    const ids = stockBatches.filter((r) => r.purchaseId === purchaseId).map((r) => r.id);
    if (ids.length === 0) return;
    setStockBatches((prev) => prev.filter((r) => !ids.includes(r.id)));
    removeRemote('stock_batches', ids);
  };

  const api: InventoryApi = { godowns, stockBatches, stockTransfers, addGodown, updateGodown, deleteGodown, receiveStock, transferStock };
  return { api, planBill, applyBill, restoreBill, restoreReturn, takeBackReturn, hydrate, backupData, reset, purgeSetters, removePurchaseRows };
};

