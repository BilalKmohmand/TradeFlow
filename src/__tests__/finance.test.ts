import { describe, it, expect } from 'vitest';
import { costPerKgOn, computeMonthlyPnL, ageLedger, receivablesAging, creditExposure, shiftMonth, pnlTrend, productSalesHistory, computeBalanceSheet } from '../utils/finance';
import { computeAlerts } from '../utils/alerts';
import { LedgerEntry } from '../types';

const purchases = [
  { id: 'a', receiptNumber: 'G1', supplierId: 's1', productId: 'p1', kg: 1000, pricePerKg: 20, amount: 20000, date: '2026-08-01', createdAt: '2026-08-01' },
  { id: 'b', receiptNumber: 'G2', supplierId: 's1', productId: 'p1', kg: 1000, pricePerKg: 30, amount: 30000, date: '2026-09-02', createdAt: '2026-09-02' },
];
const dispatches = [
  { id: 'd1', dispatchNumber: 'D1', bookingId: 'b1', customerId: 'c1', productId: 'p1', kg: 500, amount: 20000, truckNumber: 'X', date: '2026-09-03', whatsappSent: false },
  { id: 'd2', dispatchNumber: 'D2', bookingId: 'b1', customerId: 'c1', productId: 'p2', kg: 100, amount: 5000, truckNumber: 'X', date: '2026-09-04', whatsappSent: false },
];
const products = [
  { id: 'p1', name: 'Cement', category: 'x', unitPricePerKg: 40, stockKg: 1500, minThresholdKg: 100 },
  { id: 'p2', name: 'Coal', category: 'x', unitPricePerKg: 50, stockKg: 50, minThresholdKg: 100 },
];
const expenses = [
  { id: 'e1', date: '2026-09-05', category: 'fuel' as const, amount: 3000, description: 'diesel', createdAt: '2026-09-05' },
  { id: 'e2', date: '2026-08-05', category: 'rent' as const, amount: 9000, description: 'rent', createdAt: '2026-08-05' },
];

describe('cost basis', () => {
  it('uses weighted average of purchases up to the date', () => {
    expect(costPerKgOn(purchases, 'p1', '2026-08-15')).toBe(20);
    expect(costPerKgOn(purchases, 'p1', '2026-09-03')).toBe(25);
  });
  it('falls back to any purchase, then null', () => {
    expect(costPerKgOn(purchases, 'p1', '2026-01-01')).toBe(25);
    expect(costPerKgOn(purchases, 'p2', '2026-09-03')).toBeNull();
  });
});

describe('monthly P&L', () => {
  const pnl = computeMonthlyPnL('2026-09', dispatches, purchases, expenses, products as any);
  it('sums revenue, COGS, expenses and net for the month only', () => {
    expect(pnl.revenue).toBe(25000);
    expect(pnl.cogs).toBe(12500); // 500 kg * 25
    expect(pnl.grossProfit).toBe(12500);
    expect(pnl.expenses).toBe(3000);
    expect(pnl.netProfit).toBe(9500);
    expect(pnl.uncostedKg).toBe(100);
    expect(pnl.purchasedKg).toBe(1000);
  });
  it('produces per-product margins', () => {
    const cement = pnl.products.find((p) => p.productId === 'p1')!;
    expect(cement.avgSellPerKg).toBe(40);
    expect(cement.avgCostPerKg).toBe(25);
    expect(cement.marginPct).toBe(37.5);
    const coal = pnl.products.find((p) => p.productId === 'p2')!;
    expect(coal.avgCostPerKg).toBeNull();
  });
  it('builds a trend ending at the month', () => {
    const t = pnlTrend('2026-09', 3, dispatches, purchases, expenses, products as any);
    expect(t.map((x) => x.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(t[1].expenses).toBe(9000);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('aging', () => {
  const led = (over: Partial<LedgerEntry>): LedgerEntry => ({ id: Math.random().toString(), entityType: 'customer', entityId: 'c1', type: 'dispatch_billed', referenceId: 'r', date: '2026-01-01', description: '', debit: 0, credit: 0, balanceAfter: 0, ...over });
  it('applies payments to the oldest invoices first and buckets the rest', () => {
    const entries = [
      led({ date: '2026-05-01', debit: 10000 }), // 126 days old on 2026-09-04 -> paid off
      led({ date: '2026-07-20', debit: 5000 }), // 46 days -> 31-60
      led({ date: '2026-08-25', debit: 4000 }), // 10 days -> current
      led({ date: '2026-08-01', credit: 12000, type: 'payment_received' }),
    ];
    const a = ageLedger(entries, '2026-09-04');
    expect(a.total).toBe(7000);
    expect(a.d90plus).toBe(0);
    expect(a.d31_60).toBe(3000);
    expect(a.current).toBe(4000);
    expect(a.oldestOpenDate).toBe('2026-07-20');
    expect(a.oldestDays).toBe(46);
  });
  it('lists customers with open balances, highest first', () => {
    const customers = [
      { id: 'c1', name: 'A', company: 'A co', phone: '1', totalDue: 7000, creditLimit: 0 } as any,
      { id: 'c2', name: 'B', company: 'B co', phone: '2', totalDue: 0, creditLimit: 0 } as any,
    ];
    const rows = receivablesAging(customers, [led({ date: '2026-08-25', debit: 7000 })], '2026-09-04');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('A');
  });
});

describe('credit exposure', () => {
  it('adds outstanding and committed active bookings', () => {
    const c = { id: 'c1', totalDue: 10000, creditLimit: 50000 } as any;
    const e = creditExposure(c, [
      { customerId: 'c1', status: 'active', remainingKg: 100, pricePerKg: 50 },
      { customerId: 'c1', status: 'completed', remainingKg: 0, pricePerKg: 50 },
      { customerId: 'c2', status: 'active', remainingKg: 999, pricePerKg: 50 },
    ]);
    expect(e.committed).toBe(5000);
    expect(e.exposure).toBe(15000);
  });
});

describe('alerts', () => {
  it('flags low stock, credit breaches, overdue receivables and late deliveries', () => {
    const alerts = computeAlerts(
      {
        products: products as any,
        customers: [{ id: 'c1', name: 'Ali', company: 'A', phone: '1', totalDue: 60000, creditLimit: 50000 } as any],
        suppliers: [],
        bookings: [{ id: 'b1', bookingNumber: 'BK-1', customerId: 'c1', status: 'active', remainingKg: 100, targetDeliveryDate: '2026-08-01' } as any],
        trucks: [{ id: 't1', number: 'X', status: 'maintenance', driverName: '', driverPhone: '', capacityKg: 1, createdAt: '' }],
        ledger: [{ id: 'l', entityType: 'customer', entityId: 'c1', type: 'dispatch_billed', referenceId: 'r', date: '2026-06-01', description: '', debit: 60000, credit: 0, balanceAfter: 0 }],
      },
      '2026-09-04'
    );
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toContain('low_stock');
    expect(kinds).toContain('credit_exceeded');
    expect(kinds).toContain('overdue_receivable');
    expect(kinds).toContain('late_delivery');
    expect(kinds).toContain('truck_maintenance');
    expect(alerts[0].severity).toBe('danger');
  });
});

describe('product sales history', () => {
  it('reports kg and revenue per month with same-month-last-year comparison', () => {
    const ds = [
      ...dispatches,
      { id: 'old', dispatchNumber: 'D0', bookingId: 'b0', customerId: 'c1', productId: 'p1', kg: 250, amount: 8000, truckNumber: 'X', date: '2025-09-10', whatsappSent: false },
    ];
    const rows = productSalesHistory(ds, 'p1', '2026-09', 12);
    expect(rows).toHaveLength(12);
    expect(rows[0].month).toBe('2025-10');
    const sep = rows[rows.length - 1];
    expect(sep.month).toBe('2026-09');
    expect(sep.kg).toBe(500);
    expect(sep.revenue).toBe(20000);
    expect(sep.avgPricePerKg).toBe(40);
    expect(sep.lastYearKg).toBe(250);
    expect(sep.kgChangePct).toBe(100);
    expect(rows[0].kgChangePct).toBeNull();
  });
});

describe('balance sheet', () => {
  it('values stock at cost, nets cash movements and balances equity', () => {
    const bs = computeBalanceSheet(
      {
        products: products as any,
        purchases,
        customers: [{ id: 'c1', name: 'A', company: 'A', phone: '1', totalDue: 30000, creditLimit: 0 } as any],
        suppliers: [{ id: 's1', name: 'S', company: 'S', phone: '2', totalOwed: 15000 } as any],
        ledger: [
          { id: 'x', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'r', date: '2026-09-01', description: '', debit: 0, credit: 10000, balanceAfter: 0 },
          { id: 'y', entityType: 'supplier', entityId: 's1', type: 'payment_made', referenceId: 'r', date: '2026-09-02', description: '', debit: 0, credit: 4000, balanceAfter: 0 },
          { id: 'z', entityType: 'customer', entityId: 'c1', type: 'payment_received', referenceId: 'r', date: '2026-12-01', description: '', debit: 0, credit: 99999, balanceAfter: 0 },
        ],
        expenses: [...expenses, { id: 'e3', date: '2026-09-06', category: 'rent' as const, amount: 5000, description: 'unpaid rent', paidVia: 'Credit (unpaid)', createdAt: '2026-09-06' }],
      },
      '2026-09-30'
    );
    expect(bs.inventory.atCost).toBe(1500 * 25); // cement at weighted avg 25; steel uncosted -> 0
    expect(bs.inventory.uncostedKg).toBe(50);
    expect(bs.receivables).toBe(30000);
    expect(bs.cashNet.net).toBe(10000 - 4000 - 3000 - 9000); // December payment excluded
    expect(bs.payables).toBe(15000);
    expect(bs.accruedExpenses).toBe(5000);
    expect(bs.equity).toBe(bs.totalAssets - bs.totalLiabilities);
  });
});
