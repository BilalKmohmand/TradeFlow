import React from 'react';
import { AppSettings, Customer, Invoice, ReminderSettings } from '../types';
import { ReminderRow, cleanReminderSettings, reminderSettings, remindersDue } from '../utils/reminders';

/**
 * Automatic payment reminders (see utils/reminders.ts). The list of customers due a reminder is worked
 * out whenever the data changes; sending is one tap per customer (WhatsApp opens with the message),
 * and the tap records "last reminded" on the customer so they are not reminded again too soon.
 */
export interface ReminderApi {
  reminderSettings: ReminderSettings;
  updateReminderSettings: (input: Partial<ReminderSettings>) => { success: boolean; message: string };
  /** Customers due a reminder today (empty while reminders are off). */
  remindersDue: ReminderRow[];
  /** Record that a reminder went to these customers now. */
  markReminded: (customerIds: string[]) => { success: boolean; message: string };
}

interface Deps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  invoices: Invoice[];
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  can: (permission: string) => boolean;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: 'billing' | 'system') => void;
  today: string;
  /** remindersDue is costly on big books: the provider memoises it and passes it in. */
  due: ReminderRow[];
}

export const createReminderApi = (d: Deps): ReminderApi => {
  const updateReminderSettings: ReminderApi['updateReminderSettings'] = (input) => {
    if (!d.can('system:company_settings') && !d.can('admin_screen')) return { success: false, message: 'Only an admin can change reminder settings.' };
    const r = cleanReminderSettings({ ...reminderSettings(d.settings), ...input });
    if ('message' in r) return { success: false, message: r.message };
    const v = r.value;
    d.setSettings((prev) => ({ ...prev, reminders: v }));
    d.logAuditEvent('Reminder Settings Changed', `${v.enabled ? 'On' : 'Off'}: ${v.daysAfterDue ?? '—'} days after due, bills over ${v.olderThanDays ?? '—'} days, at most every ${v.everyDays} days.`, 'info', 'system');
    return { success: true, message: v.enabled ? 'Reminders are on. Customers due a reminder show on Home.' : 'Reminders are off.' };
  };

  const markReminded: ReminderApi['markReminded'] = (customerIds) => {
    const ids = new Set(customerIds.filter((id) => d.customers.some((c) => c.id === id)));
    if (ids.size === 0) return { success: false, message: 'Customer not found.' };
    const at = new Date().toISOString();
    d.setCustomers((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, lastRemindedAt: at } : c)));
    const names = d.customers.filter((c) => ids.has(c.id)).map((c) => `${c.name} (Rs. ${c.totalDue})`);
    d.logAuditEvent('Payment Reminder Sent', `WhatsApp reminder to ${names.join(', ')}.`, 'info', 'billing');
    return { success: true, message: `Reminder recorded for ${names.length} customer${names.length === 1 ? '' : 's'}.` };
  };

  return { reminderSettings: reminderSettings(d.settings), updateReminderSettings, remindersDue: d.due, markReminded };
};

export { remindersDue as computeRemindersDue };
