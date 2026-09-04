import { describe, it, expect } from 'vitest';
import { groupByDay, buildMovements, yearOverYear, priceOn, shiftDate, averagePriceBetween } from '../utils/stockFlow';
import { normalizeBooking, normalizeProduct, normalizeDispatch } from '../lib/database';

describe('legacy tons -> kg shim', () => {
  it('converts tons columns and leaves kg columns alone', () => {
    const b = normalizeBooking({ id: 'b1', totalTons: 50, dispatchedTons: 20, remainingTons: 30, pricePerTon: 28000 });
    expect(b.totalKg).toBe(50000);
    expect(b.remainingKg).toBe(30000);
    expect(b.pricePerKg).toBe(28);
    const p = normalizeProduct({ id: 'p1', stockKg: 5, unitPricePerKg: 1 });
    expect(p.stockKg).toBe(5);
    expect(normalizeDispatch({ id: 'd', tons: 2.5 }).kg).toBe(2500);
  });
});

describe('stock movements', () => {
  const lookups = {
    customers: [{ id: 'c1', name: 'Ali' } as any],
    suppliers: [{ id: 's1', company: 'Lucky' } as any],
    products: [{ id: 'p1', name: 'Cement' } as any],
    bookings: [{ id: 'bk1', bookingNumber: 'BK-1' } as any],
  };
  const mv = buildMovements(
    [{ id: 'pu1', receiptNumber: 'GRN-1', supplierId: 's1', productId: 'p1', kg: 1000, pricePerKg: 20, amount: 20000, date: '2026-09-03', createdAt: '2026-09-03' }],
    [{ id: 'd1', dispatchNumber: 'DSP-1', bookingId: 'bk1', customerId: 'c1', productId: 'p1', kg: 400, amount: 10000, truckNumber: 'X', date: '2026-09-04', whatsappSent: false }],
    lookups
  );
  it('normalises purchases and dispatches into one newest-first list', () => {
    expect(mv).toHaveLength(2);
    expect(mv[0].direction).toBe('out');
    expect(mv[0].bookingNumber).toBe('BK-1');
    expect(mv[1].supplierName).toBe('Lucky');
  });
  it('groups by day with no gaps and correct net', () => {
    const days = groupByDay(mv, '2026-09-02', '2026-09-04');
    expect(days.map((d) => d.date)).toEqual(['2026-09-04', '2026-09-03', '2026-09-02']);
    expect(days[0].outKg).toBe(400);
    expect(days[1].inKg).toBe(1000);
    expect(days[1].netKg).toBe(1000);
    expect(days[2].movements).toHaveLength(0);
  });
  it('shifts dates across month boundaries', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('price history comparisons', () => {
  const hist = [
    { id: '1', productId: 'p1', pricePerKg: 20, date: '2025-08-15', source: 'manual' as const },
    { id: '2', productId: 'p1', pricePerKg: 22, date: '2025-09-10', source: 'manual' as const },
    { id: '3', productId: 'p1', pricePerKg: 30, date: '2025-09-20', source: 'booking' as const },
    { id: '4', productId: 'p1', pricePerKg: 25, date: '2026-09-01', source: 'price_update' as const },
  ];
  it('finds the price in effect on a date, ignoring booking rates', () => {
    expect(priceOn(hist, '2025-09-15')?.pricePerKg).toBe(22);
    expect(priceOn(hist, '2025-09-25')?.pricePerKg).toBe(22);
    expect(priceOn(hist, '2025-01-01')).toBeUndefined();
  });
  it('averages list prices in a range and carries forward when empty', () => {
    expect(averagePriceBetween(hist, '2025-07-01', '2025-09-30')).toBe(21);
    expect(averagePriceBetween(hist, '2025-10-01', '2025-12-31')).toBe(22);
  });
  it('computes same month / quarter / day last year with % change', () => {
    const yoy = yearOverYear(hist, 25, '2026-09-04');
    expect(yoy.month.label).toBe('Sep 2025');
    expect(yoy.month.price).toBe(22);
    expect(yoy.month.change).toBeCloseTo(13.636, 2);
    expect(yoy.quarter.label).toBe('Q3 2025');
    expect(yoy.quarter.price).toBe(21);
    expect(yoy.sameDay.date).toBe('2025-09-04');
    expect(yoy.sameDay.price).toBe(20);
    expect(yoy.sameDay.change).toBe(25);
  });
  it('returns nulls with no history', () => {
    const none = yearOverYear([], 25, '2026-09-04');
    expect(none.month.price).toBeNull();
    expect(none.month.change).toBeNull();
  });
});
