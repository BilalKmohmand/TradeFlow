import { AppAlert, Booking, Customer, Dispatch, LedgerEntry, Product, Supplier, Truck, Task, Quotation, PurchaseOrder } from '../types';
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
    dispatches?: Dispatch[];
    tasks?: Task[];
    quotations?: Quotation[];
    purchaseOrders?: PurchaseOrder[];
  },
  asOf: string
): AppAlert[] => {
  const alerts: AppAlert[] = [];

  const since = new Date(asOf + 'T00:00:00Z');
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceISO = since.toISOString().split('T')[0];
  data.products.forEach((p) => {
    if (p.stockKg <= p.minThresholdKg) {
      const sold30 = (data.dispatches || []).filter((d) => d.productId === p.id && d.date > sinceISO && d.date <= asOf).reduce((a, d) => a + d.kg, 0);
      const perDay = sold30 / 30;
      const daysLeft = perDay > 0 ? Math.floor(p.stockKg / perDay) : null;
      alerts.push({
        id: `low-${p.id}`,
        kind: 'low_stock',
        severity: p.stockKg <= 0 || (daysLeft != null && daysLeft <= 3) ? 'danger' : 'warning',
        title: p.stockKg <= 0 ? `${p.name} is out of stock` : `${p.name} is below reorder level`,
        detail: `${formatKg(p.stockKg)} on hand, threshold ${formatKg(p.minThresholdKg)}.${daysLeft != null ? ` About ${daysLeft} day(s) of stock at the last-30-day sales rate (${formatKg(Math.round(perDay))}/day).` : ''} Raise a purchase order or receive stock.`,
        link: { type: 'product', id: p.id },
      });
    }
  });

  (data.tasks || []).forEach((t) => {
    if (t.status === 'open' && t.dueDate <= asOf) {
      const overdue = t.dueDate < asOf;
      alerts.push({
        id: `task-${t.id}`,
        kind: 'task_due',
        severity: overdue ? 'warning' : 'info',
        title: overdue ? `Overdue follow-up: ${t.title}` : `Due today: ${t.title}`,
        detail: `${t.note || 'No notes.'} (due ${formatDate(t.dueDate)}${t.createdBy ? `, by ${t.createdBy}` : ''})`,
        link: { type: 'task', id: t.id },
      });
    }
  });

  (data.quotations || []).forEach((q) => {
    if ((q.status === 'sent' || q.status === 'draft') && q.validUntil >= asOf) {
      const days = Math.floor((new Date(q.validUntil + 'T00:00:00Z').getTime() - new Date(asOf + 'T00:00:00Z').getTime()) / 86400000);
      if (days <= 2) {
        const cust = data.customers.find((c) => c.id === q.customerId);
        alerts.push({ id: `quote-${q.id}`, kind: 'quote_expiring', severity: 'info', title: `${q.quoteNumber} for ${cust?.name || 'customer'} expires ${days === 0 ? 'today' : `in ${days} day(s)`}`, detail: `${formatKg(q.kg)} @ Rs. ${q.pricePerKg}/kg (${formatCurrency(q.amount)}). Follow up or convert it to a booking.`, link: { type: 'quotation', id: q.id } });
      }
    }
  });

  (data.purchaseOrders || []).forEach((po) => {
    if ((po.status === 'open' || po.status === 'partial') && po.expectedDate && po.expectedDate < asOf) {
      const sup = data.suppliers.find((s) => s.id === po.supplierId);
      alerts.push({ id: `po-${po.id}`, kind: 'po_overdue', severity: 'warning', title: `${po.poNumber} from ${sup?.company || 'supplier'} is overdue`, detail: `${formatKg(po.kg - po.receivedKg)} still expected; was due ${formatDate(po.expectedDate)}.`, link: { type: 'po', id: po.id } });
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

  (data.dispatches || []).forEach((d) => {
    if ((d.status ?? 'in_transit') !== 'in_transit') return;
    const age = Math.floor((new Date(asOf + 'T00:00:00Z').getTime() - new Date(d.date + 'T00:00:00Z').getTime()) / 86400000);
    if (age >= 2) {
      const cust = data.customers.find((c) => c.id === d.customerId);
      alerts.push({
        id: `undelivered-${d.id}`,
        kind: 'undelivered',
        severity: age >= 5 ? 'danger' : 'warning',
        title: `${d.dispatchNumber} not confirmed delivered`,
        detail: `${d.truckNumber} left ${age} day(s) ago with ${formatKg(d.kg)} for ${cust?.name || 'customer'}. Mark it delivered or follow up with the driver.`,
        link: { type: 'booking', id: d.bookingId, dispatchId: d.id },
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
