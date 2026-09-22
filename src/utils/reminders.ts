/**
 * Automatic payment reminders (pure helpers; the context records who was reminded and when).
 *
 * The app cannot send WhatsApp messages by itself: that needs the paid WhatsApp Business API. So when
 * the app opens it lists the customers who are due a reminder, and each one is a single tap that
 * opens the WhatsApp chat with the message already written. Sending is still one tap per customer.
 */
import { AppSettings, Customer, Invoice, ReminderSettings } from '../types';
import { billsOnly } from './billing';
import { billNetTotal } from './salesDocs';
import { whatsappLink } from './purchasing';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 0.005;

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, daysAfterDue: 7, olderThanDays: 30, everyDays: 7 };

/** The shop's reminder settings with defaults filled in (off until the owner turns it on). */
export const reminderSettings = (settings: Pick<AppSettings, 'reminders'>): ReminderSettings => ({ ...DEFAULT_REMINDERS, ...(settings.reminders || {}) });

/** Whole days from `from` to `to` (both YYYY-MM-DD, or ISO date-times). */
export const daysFrom = (from: string, to: string): number =>
  Math.floor((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400000);

export interface OpenBill {
  invoice: Invoice;
  /** Part of this bill still counted as owed. */
  left: number;
}

/**
 * Bills still (partly) unpaid, newest first. What the customer owes is matched against their newest
 * bills first, so money paid "on account" (not against a bill) clears the oldest bills.
 */
export const openBills = (customer: Pick<Customer, 'id' | 'totalDue'>, invoices: Invoice[]): OpenBill[] => {
  let owed = round2(Number(customer.totalDue) || 0);
  if (owed <= EPS) return [];
  const bills = billsOnly(invoices)
    .filter((i) => i.customerId === customer.id)
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : (b.createdAt || '').localeCompare(a.createdAt || '')));
  const out: OpenBill[] = [];
  for (const inv of bills) {
    if (owed <= EPS) break;
    const worth = billNetTotal(inv);
    if (worth <= EPS) continue;
    const left = round2(Math.min(owed, worth));
    out.push({ invoice: inv, left });
    owed = round2(owed - left);
  }
  return out;
};

export interface ReminderRow {
  customer: Customer;
  amount: number;
  /** Oldest bill still unpaid (null when what they owe is an opening balance, not a bill). */
  oldest: { invoiceNumber: string; date: string; dueDate: string; days: number; daysPastDue: number } | null;
  /** Why they are listed, e.g. "12 days past due". */
  reason: string;
  lastRemindedAt: string | null;
}

/**
 * Customers due a reminder today: they owe money, have a phone number, their oldest unpaid bill is
 * past one of the rules, and they were not reminded in the last `everyDays` days.
 */
export const remindersDue = (customers: Customer[], invoices: Invoice[], settings: Pick<AppSettings, 'reminders'>, today: string): ReminderRow[] => {
  const cfg = reminderSettings(settings);
  if (!cfg.enabled) return [];
  const afterDue = cfg.daysAfterDue != null && cfg.daysAfterDue >= 0 ? cfg.daysAfterDue : null;
  const older = cfg.olderThanDays != null && cfg.olderThanDays > 0 ? cfg.olderThanDays : null;
  if (afterDue == null && older == null) return [];
  const every = Math.max(1, Math.round(Number(cfg.everyDays) || 1));
  const rows: ReminderRow[] = [];
  customers.forEach((c) => {
    if (!(c.totalDue > EPS) || !(c.phone || '').replace(/\D/g, '')) return;
    if (c.lastRemindedAt && daysFrom(c.lastRemindedAt, today) < every) return;
    const open = openBills(c, invoices);
    const last = open[open.length - 1];
    const fromBills = round2(open.reduce((a, o) => a + o.left, 0));
    // Owed beyond the bills on record (opening balance): counts from the day the customer was added.
    const base = last && fromBills >= c.totalDue - EPS ? last.invoice : null;
    const issue = base ? base.issueDate : (c.createdAt || today).slice(0, 10);
    const due = base ? base.dueDate || base.issueDate : issue;
    const days = daysFrom(issue, today);
    const pastDue = daysFrom(due, today);
    let reason = '';
    if (afterDue != null && pastDue >= afterDue && pastDue > 0) reason = `${pastDue} day${pastDue === 1 ? '' : 's'} past due`;
    else if (older != null && days >= older) reason = `${days} days old`;
    if (!reason) return;
    rows.push({
      customer: c,
      amount: round2(c.totalDue),
      oldest: base ? { invoiceNumber: base.invoiceNumber, date: base.issueDate, dueDate: due, days, daysPastDue: pastDue } : null,
      reason,
      lastRemindedAt: c.lastRemindedAt || null,
    });
  });
  return rows.sort((a, b) => b.amount - a.amount);
};

const fmtRs = (n: number) => `Rs. ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n)}`;
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/** A polite reminder in simple English with a Roman-Urdu greeting, as most shop customers read it. */
export const reminderMessage = (row: Pick<ReminderRow, 'customer' | 'amount' | 'oldest'>, shopName: string): string => {
  const shop = (shopName || '').trim() || 'our shop';
  const lines = [
    `Assalam-o-Alaikum ${row.customer.name},`,
    '',
    `A gentle reminder from ${shop}: your balance due is *${fmtRs(row.amount)}*.`,
  ];
  if (row.oldest) lines.push(`Oldest unpaid bill: ${row.oldest.invoiceNumber} of ${fmtDate(row.oldest.date)} (${row.oldest.days} day${row.oldest.days === 1 ? '' : 's'} ago).`);
  lines.push('', 'Meherbani farma kar jald adaigi kar dein. If you have already paid, please ignore this message.', '', `Shukriya — ${shop}`);
  return lines.join('\n');
};

/** One-tap WhatsApp chat with the reminder already written. */
export const reminderLink = (row: Pick<ReminderRow, 'customer' | 'amount' | 'oldest'>, shopName: string): string => whatsappLink(row.customer.phone, reminderMessage(row, shopName));

/** Check and clean reminder settings typed on the Settings screen. */
export const cleanReminderSettings = (input: Partial<ReminderSettings>): { ok: true; value: ReminderSettings } | { ok: false; message: string } => {
  const num = (v: unknown): number | null => (v === '' || v == null ? null : Number(v));
  const afterDue = num(input.daysAfterDue);
  const older = num(input.olderThanDays);
  const every = num(input.everyDays);
  if (afterDue != null && (!Number.isFinite(afterDue) || afterDue < 0 || afterDue > 365)) return { ok: false, message: 'Days after the due date must be between 0 and 365.' };
  if (older != null && (!Number.isFinite(older) || older < 1 || older > 3650)) return { ok: false, message: 'Bill age must be between 1 and 3650 days.' };
  if (every == null || !Number.isFinite(every) || every < 1 || every > 365) return { ok: false, message: 'Remind at most once every 1 to 365 days.' };
  if (input.enabled && afterDue == null && older == null) return { ok: false, message: 'Set at least one rule: days after the due date, or bill age.' };
  return { ok: true, value: { enabled: Boolean(input.enabled), daysAfterDue: afterDue == null ? null : Math.round(afterDue), olderThanDays: older == null ? null : Math.round(older), everyDays: Math.round(every) } };
};
