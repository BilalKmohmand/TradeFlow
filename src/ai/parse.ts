/**
 * Checking what /api/ai sent back before the app uses it: ids must exist on this device, numbers must be
 * sane, and bill lines the AI could not place are matched by name here (catalog fallback) and flagged for
 * the user to check. Pure functions.
 */
import type { AskOpen, AskResult, BillResult, ReminderResult, SummaryResult } from '../../api/ai';
import type { BillCatalog, CatalogCustomer, CatalogProduct } from './context';
import { normText } from './context';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export interface AskKnown {
  navIds: ReadonlySet<string>;
  customerIds: ReadonlySet<string>;
  productIds: ReadonlySet<string>;
  billIds: ReadonlySet<string>;
}

/** The answer, with `open` kept only when it points at something that exists (and this user may open). */
export const parseAskResult = (raw: unknown, known: AskKnown): AskResult | null => {
  if (!isObj(raw)) return null;
  const answer = text(raw.answer, 3000);
  if (!answer) return null;
  let open: AskOpen | null = null;
  const o = raw.open;
  if (isObj(o) && typeof o.id === 'string') {
    const set = o.kind === 'nav' ? known.navIds : o.kind === 'customer' ? known.customerIds : o.kind === 'product' ? known.productIds : o.kind === 'bill' ? known.billIds : null;
    if (set && set.has(o.id)) open = { kind: o.kind as AskOpen['kind'], id: o.id };
  }
  return { answer, open };
};

export const parseReminderResult = (raw: unknown): ReminderResult | null => {
  if (!isObj(raw)) return null;
  const message = text(raw.message, 2000);
  return message ? { message } : null;
};

export const parseSummaryResult = (raw: unknown): SummaryResult | null => {
  if (!isObj(raw)) return null;
  const headline = text(raw.headline, 400);
  if (!headline) return null;
  const bullets = Array.isArray(raw.bullets) ? raw.bullets.map((b) => text(b, 400)).filter(Boolean).slice(0, 10) : [];
  return { headline, bullets };
};

// ---------------------------------------------------------------------------------------------------------
// Catalog matching (fallback when the AI gave no id, or an id that is not in the catalog)
// ---------------------------------------------------------------------------------------------------------
const words = (s: string) => normText(s).split(' ').filter(Boolean);
/** Common order words that say nothing about which item it is. */
const NOISE = new Set(['ka', 'ki', 'ke', 'de', 'do', 'or', 'aur', 'and', 'the', 'of', 'x', 'pc', 'pcs', 'qty', 'wala', 'wali', 'bhai', 'please', 'plz']);

/** 0..1: how much of what was written is in the name / code (numbers such as sizes must match exactly). */
export const nameScore = (written: string, name: string, code?: string): number => {
  const w = words(written).filter((t) => !NOISE.has(t));
  if (!w.length) return 0;
  if (code && w.includes(normText(code))) return 1;
  const n = words(name);
  if (!n.length) return 0;
  let hit = 0;
  for (const t of w) {
    if (n.includes(t)) hit += 1;
    else if (!/^\d+$/.test(t) && t.length >= 3 && n.some((x) => x.length >= 3 && (x.startsWith(t) || t.startsWith(x)))) hit += 0.7;
  }
  // Share of the written words found, and of the name's words covered.
  const a = hit / w.length;
  const b = Math.min(1, hit / n.length);
  return Math.round(((a * 2 + b) / 3) * 100) / 100;
};

/** The one catalog entry that clearly matches a written name (best score ≥ 0.5 and ahead of the next). */
export const bestMatch = <T extends { id: string; name: string; code?: string }>(written: string, list: T[], extra?: (x: T) => string): { id: string; score: number } | null => {
  if (!written.trim()) return null;
  const scored = list
    .map((x) => ({ id: x.id, score: Math.max(nameScore(written, x.name, x.code), extra ? nameScore(written, extra(x)) : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.score < 0.5) return null;
  if (scored[1] && top.score - scored[1].score < 0.15) return null;
  return top;
};
export const matchProduct = (written: string, products: CatalogProduct[]) => bestMatch(written, products);
export const matchCustomer = (written: string, customers: CatalogCustomer[]) => bestMatch(written, customers, (c) => `${c.name} ${c.city || ''}`);

export interface ParsedBillLine {
  productId: string | null;
  nameAsWritten: string;
  qty: number;
  unit: 'base' | 'pack';
  rate: number | null;
  confidence: number;
  /** 'ai' = the AI placed it; 'name' = matched here by name; null = not matched. */
  matchedBy: 'ai' | 'name' | null;
  /** Show it highlighted: not matched, low confidence, matched by name, or a quantity that had to be guessed. */
  needsCheck: boolean;
}
export interface ParsedBill {
  customerId: string | null;
  customerMatchedBy: 'ai' | 'name' | null;
  customerNameGuess: string;
  lines: ParsedBillLine[];
  notes: string;
}

/** Below this the line is shown for checking. */
export const LOW_CONFIDENCE = 0.7;

export const parseBillResult = (raw: unknown, catalog: BillCatalog): ParsedBill | null => {
  if (!isObj(raw) || !Array.isArray(raw.lines)) return null;
  const pIds = new Set(catalog.products.map((p) => p.id));
  const cIds = new Set(catalog.customers.map((c) => c.id));
  const lines: ParsedBillLine[] = raw.lines
    .filter(isObj)
    .slice(0, 60)
    .map((l) => {
      const written = text(l.nameAsWritten, 200);
      const qtyRaw = typeof l.qty === 'number' ? l.qty : Number(l.qty);
      const qtyOk = Number.isFinite(qtyRaw) && qtyRaw > 0 && qtyRaw < 1_000_000;
      const rateRaw = typeof l.rate === 'number' ? l.rate : l.rate == null ? null : Number(l.rate);
      const rate = rateRaw != null && Number.isFinite(rateRaw) && rateRaw >= 0 ? Math.round(rateRaw * 100) / 100 : null;
      const conf = typeof l.confidence === 'number' && Number.isFinite(l.confidence) ? Math.min(1, Math.max(0, l.confidence)) : 0.5;
      let productId = typeof l.productId === 'string' && pIds.has(l.productId) ? l.productId : null;
      let matchedBy: ParsedBillLine['matchedBy'] = productId ? 'ai' : null;
      let confidence = conf;
      if (!productId) {
        const m = matchProduct(written, catalog.products);
        if (m) {
          productId = m.id;
          matchedBy = 'name';
          confidence = Math.min(0.6, m.score);
        } else confidence = 0;
      }
      const product = productId ? catalog.products.find((p) => p.id === productId) : undefined;
      const unit: 'base' | 'pack' = l.unit === 'pack' && product?.packName && (product.packSize || 0) > 1 ? 'pack' : 'base';
      return {
        productId,
        nameAsWritten: written || product?.name || '',
        qty: qtyOk ? Math.round(qtyRaw * 10000) / 10000 : 1,
        unit,
        rate,
        confidence,
        matchedBy,
        needsCheck: !productId || matchedBy === 'name' || confidence < LOW_CONFIDENCE || !qtyOk,
      };
    })
    .filter((l) => l.productId || l.nameAsWritten);
  let customerId = typeof raw.customerId === 'string' && cIds.has(raw.customerId) ? raw.customerId : null;
  let customerMatchedBy: ParsedBill['customerMatchedBy'] = customerId ? 'ai' : null;
  const guess = text(raw.customerNameGuess, 200);
  if (!customerId && guess) {
    const m = matchCustomer(guess, catalog.customers);
    if (m) {
      customerId = m.id;
      customerMatchedBy = 'name';
    }
  }
  return { customerId, customerMatchedBy, customerNameGuess: guess, lines, notes: text(raw.notes, 1000) };
};
