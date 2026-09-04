import { Dispatch, Purchase, PriceHistoryEntry, Customer, Supplier, Product, Booking } from '../types';

/** A single stock movement, normalised across purchases (in) and dispatches (out). */
export interface StockMovement {
  id: string;
  direction: 'in' | 'out';
  date: string;
  reference: string;
  kg: number;
  amount: number;
  pricePerKg: number;
  productId: string;
  productName: string;
  /** Present for outgoing movements. */
  customerId?: string;
  customerName?: string;
  bookingId?: string;
  bookingNumber?: string;
  dispatchId?: string;
  /** Present for incoming movements. */
  supplierId?: string;
  supplierName?: string;
  purchaseId?: string;
  truckNumber?: string;
  notes?: string;
}

export interface DailyFlow {
  date: string;
  inKg: number;
  inAmount: number;
  outKg: number;
  outAmount: number;
  netKg: number;
  movements: StockMovement[];
}

const byDateDesc = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export const buildMovements = (
  purchases: Purchase[],
  dispatches: Dispatch[],
  lookups: { customers: Customer[]; suppliers: Supplier[]; products: Product[]; bookings: Booking[] }
): StockMovement[] => {
  const productName = (id: string) => lookups.products.find((p) => p.id === id)?.name || 'Unknown product';
  const incoming: StockMovement[] = purchases.map((p) => {
    const sup = lookups.suppliers.find((s) => s.id === p.supplierId);
    return {
      id: `in-${p.id}`,
      direction: 'in',
      date: p.date,
      reference: p.receiptNumber,
      kg: p.kg,
      amount: p.amount,
      pricePerKg: p.pricePerKg,
      productId: p.productId,
      productName: productName(p.productId),
      supplierId: p.supplierId,
      supplierName: sup?.company || sup?.name || 'Unknown supplier',
      purchaseId: p.id,
      truckNumber: p.truckNumber,
      notes: p.notes,
    };
  });
  const outgoing: StockMovement[] = dispatches.map((d) => {
    const cust = lookups.customers.find((c) => c.id === d.customerId);
    const booking = lookups.bookings.find((b) => b.id === d.bookingId);
    return {
      id: `out-${d.id}`,
      direction: 'out',
      date: d.date,
      reference: d.dispatchNumber,
      kg: d.kg,
      amount: d.amount,
      pricePerKg: d.kg > 0 ? d.amount / d.kg : 0,
      productId: d.productId,
      productName: productName(d.productId),
      customerId: d.customerId,
      customerName: cust?.name || 'Unknown customer',
      bookingId: d.bookingId,
      bookingNumber: booking?.bookingNumber,
      dispatchId: d.id,
      truckNumber: d.truckNumber,
      notes: d.notes,
    };
  });
  return [...incoming, ...outgoing].sort(byDateDesc);
};

/** Group movements by day, filling every day in [from, to] so the log has no gaps. */
export const groupByDay = (movements: StockMovement[], from: string, to: string): DailyFlow[] => {
  const map = new Map<string, DailyFlow>();
  const cursor = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (cursor <= end) {
    const key = cursor.toISOString().split('T')[0];
    map.set(key, { date: key, inKg: 0, inAmount: 0, outKg: 0, outAmount: 0, netKg: 0, movements: [] });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  movements.forEach((m) => {
    const day = map.get(m.date);
    if (!day) return;
    day.movements.push(m);
    if (m.direction === 'in') {
      day.inKg += m.kg;
      day.inAmount += m.amount;
    } else {
      day.outKg += m.kg;
      day.outAmount += m.amount;
    }
    day.netKg = day.inKg - day.outKg;
  });
  return Array.from(map.values()).sort(byDateDesc);
};

export const shiftDate = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};

export const todayISO = () => new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// Price history helpers
// ---------------------------------------------------------------------------

/** Entries that represent the listed selling price (not individual booking prices). */
export const isListPrice = (e: PriceHistoryEntry) => e.source !== 'booking' && e.source !== 'purchase';

/** Price in effect on a date: the latest list-price entry on or before it. */
export const priceOn = (entries: PriceHistoryEntry[], date: string): PriceHistoryEntry | undefined => {
  const candidates = entries.filter((e) => isListPrice(e) && e.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1));
  return candidates[0];
};

/** Average of list-price entries within [from, to]; falls back to the price in effect at `from`. */
export const averagePriceBetween = (entries: PriceHistoryEntry[], from: string, to: string): number | null => {
  const inRange = entries.filter((e) => isListPrice(e) && e.date >= from && e.date <= to);
  if (inRange.length > 0) return inRange.reduce((a, e) => a + e.pricePerKg, 0) / inRange.length;
  const carried = priceOn(entries, from);
  return carried ? carried.pricePerKg : null;
};

export const percentChange = (current: number, previous: number | null): number | null => {
  if (previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
};

export interface YearOverYear {
  /** Same calendar month last year */
  month: { label: string; from: string; to: string; price: number | null; change: number | null };
  /** Same calendar quarter last year */
  quarter: { label: string; from: string; to: string; price: number | null; change: number | null };
  /** Exactly one year ago today */
  sameDay: { date: string; price: number | null; change: number | null };
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const yearOverYear = (entries: PriceHistoryEntry[], currentPrice: number, asOf = todayISO()): YearOverYear => {
  const now = new Date(asOf + 'T00:00:00Z');
  const y = now.getUTCFullYear() - 1;
  const m = now.getUTCMonth(); // 0-based
  const monthFrom = `${y}-${pad(m + 1)}-01`;
  const monthTo = `${y}-${pad(m + 1)}-${pad(new Date(Date.UTC(y, m + 1, 0)).getUTCDate())}`;
  const q = Math.floor(m / 3);
  const qFrom = `${y}-${pad(q * 3 + 1)}-01`;
  const qTo = `${y}-${pad(q * 3 + 3)}-${pad(new Date(Date.UTC(y, q * 3 + 3, 0)).getUTCDate())}`;
  const sameDayISO = `${y}-${pad(m + 1)}-${pad(now.getUTCDate())}`;

  const monthPrice = averagePriceBetween(entries, monthFrom, monthTo);
  const quarterPrice = averagePriceBetween(entries, qFrom, qTo);
  const dayPrice = priceOn(entries, sameDayISO)?.pricePerKg ?? null;

  return {
    month: { label: `${MONTHS[m]} ${y}`, from: monthFrom, to: monthTo, price: monthPrice, change: percentChange(currentPrice, monthPrice) },
    quarter: { label: `Q${q + 1} ${y}`, from: qFrom, to: qTo, price: quarterPrice, change: percentChange(currentPrice, quarterPrice) },
    sameDay: { date: sameDayISO, price: dayPrice, change: percentChange(currentPrice, dayPrice) },
  };
};

/** Chart-ready series: one point per list-price entry, ascending by date, plus booking prices as a second series. */
export const priceSeries = (entries: PriceHistoryEntry[]) => {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return sorted.map((e) => ({
    date: e.date,
    listPrice: isListPrice(e) ? e.pricePerKg : null,
    bookingPrice: e.source === 'booking' ? e.pricePerKg : null,
    source: e.source,
    note: e.note,
  }));
};
