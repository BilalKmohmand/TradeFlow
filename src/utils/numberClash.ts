/**
 * Bill numbers that two devices both used.
 *
 * Every device takes the next bill number from its own counter. Two phones used at the same time (or
 * one working offline) can both make "INV-0012". When the bills meet in the cloud, the one made FIRST
 * keeps the number and the later one is renumbered — by the device that made it, so exactly one
 * device changes it. The old number is kept on the bill (renumberedFrom + a note) and the user is told.
 */

export interface NumberedDoc {
  id: string;
  invoiceNumber: string;
  /** Device the bill was made on (absent on bills from before this check). */
  deviceId?: string;
  createdAt?: string;
}

export interface NumberClash {
  /** The bill to renumber (made later, on this device). */
  invoiceId: string;
  number: string;
  /** The bill that keeps the number. */
  keptId: string;
}

/**
 * When an id was made: ids are "<prefix>-<Date.now() in base 36><counter><random>", so the first
 * 8 base-36 characters are the time in ms. Unknown formats sort last (treated as made later).
 */
export const idTime = (id: string): number => {
  const part = (id || '').split('-')[1] || '';
  const t = parseInt(part.slice(0, 8), 36);
  // 2020-01-01 .. 2100-01-01: anything else is not a timestamp.
  return Number.isFinite(t) && t > 1577836800000 && t < 4102444800000 ? t : Number.MAX_SAFE_INTEGER;
};

/** Earlier first: by the time in the id, then the creation date, then the id itself (stable on every device). */
const madeBefore = (a: NumberedDoc, b: NumberedDoc) => idTime(a.id) - idTime(b.id) || (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id);

/**
 * Bills on this device that must take a new number: for each number used by two or more different
 * bills (this device's list plus what the cloud holds), every bill but the first-made one — when it
 * was made on this device. Bills made elsewhere are left for their own device to renumber.
 */
export const findNumberClashes = (local: NumberedDoc[], cloud: NumberedDoc[], deviceId: string): NumberClash[] => {
  const byId = new Map<string, NumberedDoc>();
  cloud.forEach((d) => d.id && byId.set(d.id, d));
  local.forEach((d) => d.id && byId.set(d.id, { ...byId.get(d.id), ...d }));
  const byNumber = new Map<string, NumberedDoc[]>();
  byId.forEach((d) => {
    const n = (d.invoiceNumber || '').trim();
    if (!n) return;
    byNumber.set(n, [...(byNumber.get(n) || []), d]);
  });
  const localIds = new Set(local.map((d) => d.id));
  const out: NumberClash[] = [];
  byNumber.forEach((docs, number) => {
    if (docs.length < 2) return;
    const sorted = [...docs].sort(madeBefore);
    sorted.slice(1).forEach((d) => {
      if (localIds.has(d.id) && d.deviceId === deviceId) out.push({ invoiceId: d.id, number, keptId: sorted[0].id });
    });
  });
  return out;
};

/**
 * Numbers used twice where the later bill carries no device tag (made before this check existed), so
 * no device renumbers it on its own. Shown as a warning so the clash is never silent.
 */
export const untaggedClashes = (local: NumberedDoc[], cloud: NumberedDoc[]): string[] => {
  const byId = new Map<string, NumberedDoc>();
  [...cloud, ...local].forEach((d) => d.id && byId.set(d.id, { ...byId.get(d.id), ...d }));
  const byNumber = new Map<string, NumberedDoc[]>();
  byId.forEach((d) => {
    const n = (d.invoiceNumber || '').trim();
    if (n) byNumber.set(n, [...(byNumber.get(n) || []), d]);
  });
  const out: string[] = [];
  byNumber.forEach((docs, n) => {
    if (docs.length > 1 && [...docs].sort(madeBefore).slice(1).some((d) => !d.deviceId)) out.push(n);
  });
  return out.sort();
};

const DEVICE_KEY = 'sarmaya_device_id_v1';
/** A short random tag for this device (kept in its storage). */
export const deviceTag = (): string => {
  try {
    const have = localStorage.getItem(DEVICE_KEY);
    if (have) return have;
    const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
    localStorage.setItem(DEVICE_KEY, tag);
    return tag;
  } catch {
    return 'DEVICE';
  }
};
