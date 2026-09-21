import { BatchAllocation, Godown, Product, StockBatch } from '../types';

/**
 * Inventory model (godowns + batches + expiry)
 * ---------------------------------------------
 * - `Product.stockKg` is ALWAYS the total stock of the item across every godown.
 * - `StockBatch` rows hold stock that is either in a batch (batchNo set, maybe an expiry date) or
 *   plain stock sitting in a godown other than the main one (batchNo '').
 * - Whatever is not in a row is plain stock in the main godown:
 *       main plain stock = product.stockKg − Σ rows of the item
 *   so every older screen and action that only changes stockKg keeps working (it simply acts on
 *   the main godown), and the total can never drift from the sum over godowns.
 * - If an older action takes more than the main godown's plain stock (e.g. a trading dispatch or
 *   an edited stock count), `reconcileBatches` takes the difference out of the rows, earliest
 *   expiry first, so the rows never claim more than the total.
 */

export const MAIN_GODOWN_ID = 'godown-main';
export const MAIN_GODOWN: Godown = { id: MAIN_GODOWN_ID, name: 'Main godown', isDefault: true };
export const EXPIRY_WARN_DAYS = 30;
const EPS = 0.0001;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

let seq = 0;
export const invId = (prefix: string) => {
  seq = (seq + 1) % 100000;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

/** Stored godowns plus the implied main godown (always present, always first). */
export const withMainGodown = (godowns: Godown[]): Godown[] => {
  const main = godowns.find((g) => g.isDefault) || MAIN_GODOWN;
  return [main, ...godowns.filter((g) => g.id !== main.id)];
};

export const mainGodownId = (godowns: Godown[]): string => (godowns.find((g) => g.isDefault) || MAIN_GODOWN).id;

export const godownName = (godowns: Godown[], id?: string | null): string =>
  withMainGodown(godowns).find((g) => g.id === (id || mainGodownId(godowns)))?.name || 'Godown';

/** "2026-10-05" → "05-10-2026" (the format printed on bills). */
export const fmtExpiry = (iso?: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
};

export const daysUntil = (iso: string, today: string): number =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'none';

/** The expiry date is the last day the batch may be sold. */
export const expiryStatus = (expiryDate: string | undefined, today: string, warnDays = EXPIRY_WARN_DAYS): ExpiryStatus => {
  if (!expiryDate) return 'none';
  const d = daysUntil(expiryDate, today);
  if (d < 0) return 'expired';
  if (d <= warnDays) return 'soon';
  return 'ok';
};

export const isExpired = (row: Pick<StockBatch, 'expiryDate'>, onDate: string) => Boolean(row.expiryDate && row.expiryDate < onDate);

/** Earliest expiry first; batches without a date go last; then oldest received first. */
export const fefoCompare = (a: StockBatch, b: StockBatch): number => {
  const ea = a.expiryDate || '9999-12-31';
  const eb = b.expiryDate || '9999-12-31';
  if (ea !== eb) return ea < eb ? -1 : 1;
  return (a.receivedDate || '').localeCompare(b.receivedDate || '');
};

export const rowsOf = (rows: StockBatch[], productId: string) => rows.filter((r) => r.productId === productId);

/** Plain stock in the main godown (can be negative when an item was oversold). */
export const mainLooseQty = (product: Pick<Product, 'id' | 'stockKg'>, rows: StockBatch[]): number =>
  round2(product.stockKg - rowsOf(rows, product.id).reduce((a, r) => a + r.qty, 0));

/** Stock of one item per godown. The values always add up to product.stockKg. */
export const stockByGodown = (product: Pick<Product, 'id' | 'stockKg'>, rows: StockBatch[], godowns: Godown[]): Record<string, number> => {
  const all = withMainGodown(godowns);
  const mainId = all[0].id;
  const out: Record<string, number> = Object.fromEntries(all.map((g) => [g.id, 0]));
  out[mainId] = mainLooseQty(product, rows);
  for (const r of rowsOf(rows, product.id)) out[r.godownId] = round2((out[r.godownId] || 0) + r.qty);
  return out;
};

/** Real batches (with a batch number) that still hold stock. */
export const liveBatches = (rows: StockBatch[], productId?: string) =>
  rows.filter((r) => r.batchNo && r.qty > EPS && (!productId || r.productId === productId)).sort(fefoCompare);

export interface ExpiryAlert {
  batch: StockBatch;
  product: Product;
  status: 'expired' | 'soon';
  days: number;
}

/** Batches with stock that are expired or expire within `warnDays` days, most urgent first. */
export const expiryAlerts = (rows: StockBatch[], products: Product[], today: string, warnDays = EXPIRY_WARN_DAYS): ExpiryAlert[] => {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: ExpiryAlert[] = [];
  for (const b of liveBatches(rows)) {
    const product = byId.get(b.productId);
    if (!product || !b.expiryDate) continue;
    const status = expiryStatus(b.expiryDate, today, warnDays);
    if (status === 'expired' || status === 'soon') out.push({ batch: b, product, status, days: daysUntil(b.expiryDate, today) });
  }
  return out.sort((a, b) => a.days - b.days);
};

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/** A place stock can be taken from: a row, or (rowId null) the implied plain stock of the main godown. */
interface Source {
  rowId: string | null;
  row?: StockBatch;
  avail: number;
}

const sourcesFor = (productId: string, rows: StockBatch[], godownId: string, mainId: string, mainLoose: number, onDate: string, includeExpired: boolean): Source[] => {
  const inGodown = rows.filter((r) => r.productId === productId && r.godownId === godownId && r.qty > EPS);
  const batches = inGodown.filter((r) => r.batchNo && !isExpired(r, onDate)).sort(fefoCompare);
  const loose = inGodown.filter((r) => !r.batchNo);
  const out: Source[] = [...batches, ...loose].map((r) => ({ rowId: r.id, row: r, avail: r.qty }));
  if (godownId === mainId && mainLoose > EPS) out.push({ rowId: null, avail: mainLoose });
  // Expired stock is never sold; it can still be moved (last, after good stock).
  if (includeExpired) out.push(...inGodown.filter((r) => r.batchNo && isExpired(r, onDate)).sort(fefoCompare).map((r) => ({ rowId: r.id, row: r, avail: r.qty })));
  return out;
};

export interface BillStockLine {
  godownId?: string;
  batches?: BatchAllocation[];
}

export interface BillStockPlan {
  ok: boolean;
  message?: string;
  lines: BillStockLine[];
  /** qty change per StockBatch row id (negative = taken). */
  deltas: Record<string, number>;
}

/**
 * Work out where each bill line's stock comes from. Items that were never split into godowns or
 * batches, sold from the main godown, behave exactly as before (no rows touched, may go negative).
 * Batch items take the earliest-expiring, not-expired batch first; expired batches are never sold.
 */
export const planBillStock = (
  products: Product[],
  rows: StockBatch[],
  godowns: Godown[],
  items: { productId: string; qty: number }[],
  godownId: string | undefined,
  onDate: string
): BillStockPlan => {
  const mainId = mainGodownId(godowns);
  const gid = godownId && withMainGodown(godowns).some((g) => g.id === godownId) ? godownId : mainId;
  const gName = godownName(godowns, gid);
  const work = rows.map((r) => ({ ...r }));
  const stock = new Map(products.map((p) => [p.id, p.stockKg]));
  const deltas: Record<string, number> = {};
  const lines: BillStockLine[] = [];

  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    const line: BillStockLine = gid !== mainId ? { godownId: gid } : {};
    if (!p) { lines.push(line); continue; }
    const pRows = work.filter((r) => r.productId === p.id);
    if (!p.trackBatches && gid === mainId && pRows.length === 0) {
      stock.set(p.id, round2((stock.get(p.id) || 0) - it.qty));
      lines.push(line);
      continue;
    }
    const mainLoose = round2((stock.get(p.id) || 0) - pRows.reduce((a, r) => a + r.qty, 0));
    const sources = sourcesFor(p.id, work, gid, mainId, mainLoose, onDate, false);
    let need = it.qty;
    const allocs: BatchAllocation[] = [];
    for (const s of sources) {
      if (need <= EPS) break;
      const take = round2(Math.min(need, s.avail));
      if (take <= 0) continue;
      need = round2(need - take);
      if (s.row) {
        s.row.qty = round2(s.row.qty - take);
        deltas[s.row.id] = round2((deltas[s.row.id] || 0) - take);
        if (s.row.batchNo) allocs.push({ batchId: s.row.id, batchNo: s.row.batchNo, expiryDate: s.row.expiryDate, qty: take, godownId: s.row.godownId });
      }
    }
    if (need > EPS) {
      // A plain item that has never been split across godowns may oversell from the main godown, as
      // before. Once some of it sits in another godown, overselling main would silently eat that
      // godown's stock, so the bill is refused and the shopkeeper is told where the stock is.
      const elsewhere = round2(work.filter((r) => r.productId === p.id && r.godownId !== gid && r.qty > EPS).reduce((a, r) => a + r.qty, 0));
      if (!p.trackBatches && gid === mainId && elsewhere <= EPS) {
        need = 0;
      } else if (!p.trackBatches && gid === mainId) {
        const unit = p.unit || 'pcs';
        const here = round2(it.qty - need);
        const others = withMainGodown(godowns)
          .filter((g) => g.id !== gid)
          .map((g) => ({ g, q: round2(work.filter((r) => r.productId === p.id && r.godownId === g.id).reduce((a, r) => a + r.qty, 0)) }))
          .filter((x) => x.q > EPS)
          .map((x) => `${x.q} in ${x.g.name}`)
          .join(', ');
        return { ok: false, message: `${p.name}: only ${Math.max(0, here)} ${unit} in ${gName}. ${others} — pick that godown on the bill or move the stock first.`, lines: [], deltas: {} };
      } else {
        const unit = p.unit || 'pcs';
        const usable = round2(it.qty - need);
        const expired = work.filter((r) => r.productId === p.id && r.godownId === gid && r.batchNo && r.qty > EPS && isExpired(r, onDate)).sort(fefoCompare);
        const where = withMainGodown(godowns).length > 1 ? ` in ${gName}` : '';
        const message = expired.length
          ? usable > 0
            ? `${p.name}: only ${usable} ${unit} can be sold${where}. Batch ${expired[0].batchNo} expired on ${fmtExpiry(expired[0].expiryDate)} and cannot be sold.`
            : `${p.name}: only expired stock is left${where} (batch ${expired[0].batchNo} expired on ${fmtExpiry(expired[0].expiryDate)}). Receive fresh stock${withMainGodown(godowns).length > 1 ? ' or pick another godown' : ''}.`
          : `${p.name}: only ${Math.max(0, usable)} ${unit} in stock${where}.`;
        return { ok: false, message, lines: [], deltas: {} };
      }
    }
    stock.set(p.id, round2((stock.get(p.id) || 0) - it.qty));
    if (allocs.length) line.batches = allocs;
    lines.push(line);
  }
  return { ok: true, lines, deltas };
};

export const applyDeltas = (rows: StockBatch[], deltas: Record<string, number>): StockBatch[] =>
  Object.keys(deltas).length === 0 ? rows : rows.map((r) => (deltas[r.id] ? { ...r, qty: round2(r.qty + deltas[r.id]) } : r));

/** Add plain stock to a godown other than the main one (main-godown plain stock is implied). */
const addLoose = (rows: StockBatch[], productId: string, godownId: string, qty: number, onDate: string): StockBatch[] => {
  const existing = rows.find((r) => r.productId === productId && r.godownId === godownId && !r.batchNo);
  if (existing) return rows.map((r) => (r === existing ? { ...r, qty: round2(r.qty + qty) } : r));
  return [...rows, { id: invId('stk'), productId, godownId, batchNo: '', qty: round2(qty), receivedDate: onDate, createdAt: onDate }];
};

/** Put a deleted bill's stock back into exactly the batches (and godown) it came from. */
export const restoreBillRows = (
  rows: StockBatch[],
  lines: { productId: string; qty?: number; godownId?: string; batches?: BatchAllocation[] }[],
  godowns: Godown[],
  onDate: string
): StockBatch[] => {
  const mainId = mainGodownId(godowns);
  // Stock going back to a godown that has since been deleted returns to the main godown instead of
  // landing in rows nobody can see or move.
  const live = new Set(withMainGodown(godowns).map((g) => g.id));
  const home = (gid?: string) => (gid && live.has(gid) ? gid : mainId);
  let out = rows;
  for (const line of lines) {
    if (line.qty == null) continue;
    let inBatches = 0;
    for (const a of line.batches || []) {
      inBatches = round2(inBatches + a.qty);
      const hit = out.find((r) => r.id === a.batchId);
      if (hit) out = out.map((r) => (r.id === a.batchId ? { ...r, godownId: home(r.godownId), qty: round2(r.qty + a.qty) } : r));
      else out = [...out, { id: a.batchId, productId: line.productId, godownId: home(a.godownId || line.godownId), batchNo: a.batchNo, expiryDate: a.expiryDate, qty: round2(a.qty), receivedDate: onDate, createdAt: onDate }];
    }
    const loose = round2(line.qty - inBatches);
    if (loose > EPS && home(line.godownId) !== mainId) out = addLoose(out, line.productId, home(line.godownId), loose, onDate);
  }
  return out;
};

/**
 * Undo a sales return's stock: take the returned qty back out of the batches (and non-main godown
 * plain stock) it was put into. Rows never go below zero.
 */
export const takeBackReturnRows = (
  rows: StockBatch[],
  lines: { productId: string; qty: number; godownId?: string; batches?: BatchAllocation[] }[],
  godowns: Godown[]
): StockBatch[] => {
  const mainId = mainGodownId(godowns);
  const deltas: Record<string, number> = {};
  for (const line of lines) {
    let inBatches = 0;
    for (const a of line.batches || []) {
      inBatches = round2(inBatches + a.qty);
      if (rows.some((r) => r.id === a.batchId)) deltas[a.batchId] = round2((deltas[a.batchId] || 0) - a.qty);
    }
    const loose = round2(line.qty - inBatches);
    if (loose > EPS && line.godownId && line.godownId !== mainId) {
      const row = rows.find((r) => r.productId === line.productId && r.godownId === line.godownId && !r.batchNo);
      if (row) deltas[row.id] = round2((deltas[row.id] || 0) - loose);
    }
  }
  if (Object.keys(deltas).length === 0) return rows;
  return rows.map((r) => (deltas[r.id] ? { ...r, qty: Math.max(0, round2(r.qty + deltas[r.id])) } : r));
};

/**
 * Keep rows consistent with the totals: drop rows of deleted items, and when an older action took
 * more stock than the main godown's plain stock, take the rest out of the rows (main godown first,
 * earliest expiry first). Returns the same array when nothing changed.
 */
export const reconcileBatches = (products: Product[], rows: StockBatch[], godowns: Godown[]): { rows: StockBatch[]; removedIds: string[] } => {
  if (rows.length === 0) return { rows, removedIds: [] };
  const mainId = mainGodownId(godowns);
  const byId = new Map(products.map((p) => [p.id, p]));
  const removedIds = rows.filter((r) => !byId.has(r.productId)).map((r) => r.id);
  let out = removedIds.length ? rows.filter((r) => byId.has(r.productId)) : rows;
  const deltas: Record<string, number> = {};
  const productIds = new Set(out.map((r) => r.productId));
  for (const pid of productIds) {
    const p = byId.get(pid)!;
    const pRows = out.filter((r) => r.productId === pid);
    let deficit = round2(pRows.reduce((a, r) => a + r.qty, 0) - p.stockKg);
    if (deficit <= EPS) continue;
    const order = pRows
      .filter((r) => r.qty > EPS)
      .sort((a, b) => (a.godownId === mainId ? 0 : 1) - (b.godownId === mainId ? 0 : 1) || (a.batchNo ? 0 : 1) - (b.batchNo ? 0 : 1) || fefoCompare(a, b));
    for (const r of order) {
      if (deficit <= EPS) break;
      const take = round2(Math.min(deficit, r.qty));
      deltas[r.id] = -take;
      deficit = round2(deficit - take);
    }
  }
  out = applyDeltas(out, deltas);
  return { rows: out, removedIds };
};

export interface TransferPlan {
  ok: boolean;
  message?: string;
  rows: StockBatch[];
  batches: BatchAllocation[];
}

/** Move stock between godowns. Batches keep their number and expiry; total stock never changes. */
export const planTransfer = (
  product: Product,
  rows: StockBatch[],
  godowns: Godown[],
  fromId: string,
  toId: string,
  qty: number,
  onDate: string
): TransferPlan => {
  const all = withMainGodown(godowns);
  const mainId = all[0].id;
  if (fromId === toId) return { ok: false, message: 'Pick two different godowns.', rows, batches: [] };
  if (!all.some((g) => g.id === fromId) || !all.some((g) => g.id === toId)) return { ok: false, message: 'Godown not found.', rows, batches: [] };
  if (!(qty > 0)) return { ok: false, message: 'Enter a quantity greater than zero.', rows, batches: [] };
  const sources = sourcesFor(product.id, rows, fromId, mainId, mainLooseQty(product, rows), onDate, true);
  const available = round2(sources.reduce((a, s) => a + s.avail, 0));
  if (qty > available + EPS) return { ok: false, message: `Only ${available} ${product.unit || 'pcs'} of ${product.name} in ${godownName(godowns, fromId)}.`, rows, batches: [] };
  let out = rows;
  let need = qty;
  const batches: BatchAllocation[] = [];
  for (const s of sources) {
    if (need <= EPS) break;
    const take = round2(Math.min(need, s.avail));
    need = round2(need - take);
    if (s.row) out = out.map((r) => (r.id === s.row!.id ? { ...r, qty: round2(r.qty - take) } : r));
    if (s.row?.batchNo) {
      const src = s.row;
      batches.push({ batchId: src.id, batchNo: src.batchNo, expiryDate: src.expiryDate, qty: take, godownId: fromId });
      const same = out.find((r) => r.productId === product.id && r.godownId === toId && r.batchNo === src.batchNo && (r.expiryDate || '') === (src.expiryDate || ''));
      if (same) out = out.map((r) => (r.id === same.id ? { ...r, qty: round2(r.qty + take) } : r));
      else out = [...out, { ...src, id: invId('bat'), godownId: toId, qty: take, createdAt: onDate }];
    } else if (toId !== mainId) {
      out = addLoose(out, product.id, toId, take, onDate);
    }
  }
  return { ok: true, rows: out, batches };
};

/** Add received stock to rows (the caller adds qty to product.stockKg). */
export const receiveIntoRows = (
  rows: StockBatch[],
  godowns: Godown[],
  input: { product: Product; godownId: string; qty: number; batchNo?: string; expiryDate?: string; costPrice?: number; supplierId?: string | null; purchaseId?: string | null; date: string }
): { rows: StockBatch[]; batch?: StockBatch } => {
  const mainId = mainGodownId(godowns);
  const { product, godownId, qty, date } = input;
  if (product.trackBatches) {
    const batchNo = input.batchNo?.trim() || `B-${date.replace(/-/g, '')}`;
    const same = rows.find((r) => r.productId === product.id && r.godownId === godownId && r.batchNo === batchNo && (r.expiryDate || '') === (input.expiryDate || ''));
    if (same) {
      const merged = { ...same, qty: round2(same.qty + qty) };
      return { rows: rows.map((r) => (r.id === same.id ? merged : r)), batch: merged };
    }
    const batch: StockBatch = {
      id: invId('bat'),
      productId: product.id,
      godownId,
      batchNo,
      expiryDate: input.expiryDate || undefined,
      qty: round2(qty),
      receivedDate: date,
      costPrice: input.costPrice,
      supplierId: input.supplierId || null,
      purchaseId: input.purchaseId || null,
      createdAt: new Date().toISOString(),
    };
    return { rows: [...rows, batch], batch };
  }
  if (godownId === mainId) return { rows };
  return { rows: addLoose(rows, product.id, godownId, qty, date) };
};

/** "Batch A1 · Exp 05-10-2026" lines for a bill line (quantity added when stock came from more than one batch). */
export const batchLines = (line: { batches?: BatchAllocation[]; unit?: string }): string[] => {
  const list = line.batches || [];
  return list.map((b) => `Batch ${b.batchNo}${b.expiryDate ? ` · Exp ${fmtExpiry(b.expiryDate)}` : ''}${list.length > 1 ? ` × ${b.qty}` : ''}`);
};
