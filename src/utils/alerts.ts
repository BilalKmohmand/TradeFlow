import { AppAlert, Booking, Customer, LedgerEntry, Product, Supplier, Truck } from '../types';
import { receivablesAging, payablesAging } from './finance';
import { formatCurrency, formatKg, formatDate } from './formatters';

/** Every actionable condition in the business, computed from live data. */
export const computeAlerts = (
  data: {
    products: Product[];
    customers: Customer[];
    suppliers: Supplier[];
    bookings: Booking[];
    trucks: Truck[];
    ledger: LedgerEntry[];
  },
  asOf: string
): AppAlert[] => {
  const alerts: AppAlert[] = [];

  data.products.forEach((p) => {
    if (p.stockKg <= p.minThresholdKg) {
      alerts.push({
        id: `low-${p.id}`,
        kind: 'low_stock',
        severity: p.stockKg <= 0 ? 'danger' : 'warning',
        title: p.stockKg <= 0 ? `${p.name} is out of stock` : `${p.name} is below reorder level`,
        detail: `${formatKg(p.stockKg)} on hand, threshold ${formatKg(p.minThresholdKg)}. Receive stock from ${p.supplierId ? 'the linked supplier' : 'a supplier'}.`,
        link: { type: 'product', id: p.id },
      });
    }
  });

  data.customers.forEach((c) => {
    if (c.creditLimit > 0 && c.totalDue > c.creditLimit) {
      alerts.push({
        id: `credit-${c.id}`,
        kind: 'credit_exceeded',
        severity: 'danger',
        title: `${c.name} is over their credit limit`,
        detail: `Outstanding ${formatCurrency(c.totalDue)} against a limit of ${formatCurrency(c.creditLimit)}.`,
        link: { type: 'customer', id: c.id },
      });
    }
  });

  receivablesAging(data.customers, data.ledger, asOf).forEach((r) => {
    const overdue = r.d31_60 + r.d61_90 + r.d90plus;
    if (overdue > 0) {
      alerts.push({
        id: `recv-${r.entityId}`,
        kind: 'overdue_receivable',
        severity: r.d90plus > 0 || r.d61_90 > 0 ? 'danger' : 'warning',
        title: `${r.name} has ${formatCurrency(overdue)} overdue`,
        detail: `Oldest unpaid invoice is ${r.oldestDays} days old (${r.oldestOpenDate ? formatDate(r.oldestOpenDate) : ''}). Send a reminder or record the payment.`,
        link: { type: 'customer', id: r.entityId },
      });
    }
  });

  payablesAging(data.suppliers, data.ledger, asOf).forEach((r) => {
    const overdue = r.d31_60 + r.d61_90 + r.d90plus;
    if (overdue > 0) {
      alerts.push({
        id: `pay-${r.entityId}`,
        kind: 'overdue_payable',
        severity: r.d90plus > 0 ? 'danger' : 'warning',
        title: `We owe ${r.company} ${formatCurrency(overdue)} past 30 days`,
        detail: `Oldest open receipt is ${r.oldestDays} days old. Settle to protect supply.`,
        link: { type: 'supplier', id: r.entityId },
      });
    }
  });

  data.bookings.forEach((b) => {
    if (b.status === 'active' && b.remainingKg > 0 && b.targetDeliveryDate && b.targetDeliveryDate < asOf) {
      const cust = data.customers.find((c) => c.id === b.customerId);
      alerts.push({
        id: `late-${b.id}`,
        kind: 'late_delivery',
        severity: 'warning',
        title: `${b.bookingNumber} is past its delivery date`,
        detail: `${formatKg(b.remainingKg)} still to dispatch for ${cust?.name || 'customer'}; target was ${formatDate(b.targetDeliveryDate)}.`,
        link: { type: 'booking', id: b.id },
      });
    }
  });

  data.trucks.forEach((t) => {
    if (t.status === 'maintenance') {
      alerts.push({
        id: `truck-${t.id}`,
        kind: 'truck_maintenance',
        severity: 'info',
        title: `${t.number} is in maintenance`,
        detail: `${t.driverName || 'No driver'} • ${formatKg(t.capacityKg)} capacity unavailable.`,
        link: { type: 'truck', id: t.id },
      });
    }
  });

  const rank = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
};
