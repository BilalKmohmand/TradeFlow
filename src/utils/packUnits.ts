/**
 * Pack units: an item kept in a base unit (tin, can, bottle…) can also be bought and sold in a
 * bigger pack (carton = 6 tins). Everything stored — stock, bill quantities, prices — stays in the
 * base unit; packs are only a way of typing and reading quantities.
 */

export interface PackInfo {
  unit?: string;
  packName?: string;
  packSize?: number;
}

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The item has a usable pack (a name and more than one base unit per pack). */
export const hasPack = (p?: PackInfo | null): boolean => Boolean(p && p.packName && p.packName.trim() && Number(p.packSize) > 1);

const NO_PLURAL = new Set(['kg', 'g', 'gm', 'ml', 'l', 'ltr', 'pcs', 'mt', 'ton', 'dozen', 'dz']);

/** "tin" → "tins", "box" → "boxes"; units like kg / pcs stay as they are. */
export const plural = (word: string, n: number): string => {
  const w = word.trim();
  if (!w || Math.abs(n) === 1 || NO_PLURAL.has(w.toLowerCase()) || /s$/i.test(w)) return w;
  if (/(x|ch|sh)$/i.test(w)) return `${w}es`;
  return `${w}s`;
};

const SHORT: Record<string, string> = { carton: 'ctn', cartons: 'ctn', dozen: 'dz', packet: 'pkt', packets: 'pkt', bundle: 'bdl', bundles: 'bdl', crate: 'crt', crates: 'crt' };
/** Short name for a pack on narrow displays ("carton" → "ctn"). */
export const shortPack = (packName: string): string => SHORT[packName.trim().toLowerCase()] || packName.trim();

const num = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);

/** Whole packs and the base units left over. Works on the size of the quantity; the sign is kept on both parts. */
export const splitPacks = (qty: number, packSize: number): { packs: number; rest: number } => {
  const sign = qty < 0 ? -1 : 1;
  const abs = Math.abs(qty);
  const packs = Math.floor(round4(abs / packSize));
  const rest = round2(abs - packs * packSize);
  return { packs: packs * sign, rest: rest * sign };
};

/**
 * "2 cartons + 3 tins" (long) or "2 ctn + 3 tins" (short). Without a pack, or when there is less
 * than one pack, it is just "3 tins".
 */
export const formatPackQty = (qty: number, p: PackInfo, style: 'long' | 'short' = 'long'): string => {
  const unit = p.unit || 'pcs';
  if (!hasPack(p) || Math.abs(qty) < p.packSize) return `${num(qty)} ${plural(unit, qty)}`;
  // Negative stock (oversold): "−(7 ctn + 2 tins)" so it can't be read as −7 + 2.
  if (qty < 0) {
    const pos = formatPackQty(-qty, p, style);
    return pos.includes(' + ') ? `−(${pos})` : `−${pos}`;
  }
  const { packs, rest } = splitPacks(qty, p.packSize);
  const packWord = style === 'short' ? shortPack(p.packName) : plural(p.packName, packs);
  const main = `${num(packs)} ${packWord}`;
  return rest === 0 ? main : `${main} + ${num(rest)} ${plural(unit, rest)}`;
};

/** "15 tins (2 ctn + 3)": the base quantity with its packs in brackets (plain "15 tins" without a pack). */
export const formatQtyWithPacks = (qty: number, p: PackInfo): string => {
  const unit = p.unit || 'pcs';
  const base = `${num(qty)} ${plural(unit, qty)}`;
  if (!hasPack(p) || Math.abs(qty) < p.packSize) return base;
  const { packs, rest } = splitPacks(qty, p.packSize);
  return `${base} (${num(packs)} ${shortPack(p.packName)}${rest !== 0 ? ` + ${num(Math.abs(rest))}` : ''})`;
};

/** Packs typed on a form → base units. */
export const packsToBase = (packs: number, packSize: number): number => round4(packs * packSize);
/** Base units → packs (may be a fraction). */
export const baseToPacks = (qty: number, packSize: number): number => round4(qty / packSize);
