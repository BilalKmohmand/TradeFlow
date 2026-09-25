import React, { useEffect, useState } from 'react';
import { BellRing, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { useBillingUI } from './BillingUI';
import { useTrading } from '../../context/TradingContext';
import { cardCls, inputCls, labelCls, secondaryBtn, Notice, rs, moneyCls } from './ui';
import { ReminderRow, reminderLink } from '../../utils/reminders';
import { formatDate } from '../../utils/formatters';

const waBtn =
  'inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 rounded-xl text-xs font-bold whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-[#0B1520]';

/**
 * Settings → Payment reminders. Off by default. The rules decide who is listed on Home; the app
 * can't send WhatsApp messages in the background (that needs the paid WhatsApp Business API), so
 * each reminder is still one tap that opens the chat with the message written.
 */
export const RemindersSettingsCard: React.FC = () => {
  const { reminderSettings: cfg, updateReminderSettings, can } = useTrading();
  const canEdit = can('system:company_settings') || can('admin_screen');
  const [form, setForm] = useState({ daysAfterDue: cfg.daysAfterDue == null ? '' : String(cfg.daysAfterDue), olderThanDays: cfg.olderThanDays == null ? '' : String(cfg.olderThanDays), everyDays: String(cfg.everyDays) });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const save = (enabled: boolean) => {
    const r = updateReminderSettings({ enabled, daysAfterDue: form.daysAfterDue === '' ? null : Number(form.daysAfterDue), olderThanDays: form.olderThanDays === '' ? null : Number(form.olderThanDays), everyDays: Number(form.everyDays) });
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
  };
  const field = (id: string, key: keyof typeof form, label: string, help: string, placeholder: string) => (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="numeric" min="0" step="1" disabled={!canEdit} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={`${inputCls} tabular-nums`} placeholder={placeholder} />
      <p className="mt-1 text-[11px] text-[#8E9299]">{help}</p>
    </div>
  );
  return (
    <div className={`${cardCls} p-5 space-y-4`} data-testid="reminder-settings">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900"><BellRing className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#111827] dark:text-white">Payment reminders</h3>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">List customers who should be reminded on Home, with a one-tap WhatsApp message.</p>
        </div>
      </div>
      <label htmlFor="rem-on" className="flex items-start gap-3 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] px-3.5 py-3 cursor-pointer">
        <input id="rem-on" type="checkbox" disabled={!canEdit} checked={cfg.enabled} onChange={(e) => save(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-teal-700" />
        <span>
          <span className="block text-sm font-semibold text-[#111827] dark:text-white">Remind customers who owe money</span>
          <span className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8]">When the app opens, Home lists who is due a reminder. You tap to send each one: WhatsApp can't be sent in the background without the paid WhatsApp Business API.</span>
        </span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {field('rem-after-due', 'daysAfterDue', 'Days after the bill is due', 'Leave empty to not use this rule.', 'e.g. 7')}
        {field('rem-older', 'olderThanDays', 'Or when a bill is older than (days)', 'Leave empty to not use this rule.', 'e.g. 30')}
        {field('rem-every', 'everyDays', 'Remind the same customer at most every (days)', 'Nobody is listed again before this.', '7')}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <button type="button" disabled={!canEdit} onClick={() => save(cfg.enabled)} className={secondaryBtn}>Save reminder rules</button>
    </div>
  );
};

/** Home → "Send reminders": everyone due a reminder, one tap each, or "Send all" one chat after another. */
export const SendRemindersPanel: React.FC = () => {
  const { remindersDue, markReminded, settings, reminderSettings: cfg } = useTrading();
  const ui = useBillingUI();
  // "Send all": browsers only open one chat per tap, so the list is worked through one tap at a time.
  const [queue, setQueue] = useState<ReminderRow[] | null>(null);
  const [sent, setSent] = useState(0);
  const [queueSize, setQueueSize] = useState(0);
  useEffect(() => {
    if (queue && queue.length === 0) setQueue(null);
  }, [queue]);
  if (!cfg.enabled || (remindersDue.length === 0 && !queue && sent === 0)) return null;
  const shop = settings.companyName || '';
  const send = (row: ReminderRow) => {
    markReminded([row.customer.id]);
    setSent((n) => n + 1);
  };
  const next = queue?.[0];

  return (
    <div className={`${cardCls} overflow-hidden`} data-testid="send-reminders">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
        <h2 className="font-bold text-[#111827] dark:text-white flex items-center gap-2"><BellRing className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Send reminders</h2>
        {remindersDue.length > 1 && !queue && <button type="button" onClick={() => { setSent(0); setQueueSize(remindersDue.length); setQueue(remindersDue); }} className={secondaryBtn}><Send className="w-4 h-4" /> Send all ({remindersDue.length})</button>}
      </div>
      {next && (
        <div className="px-4 sm:px-5 py-3 bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-900 flex flex-wrap items-center gap-2" role="status">
          <span className="flex-1 min-w-0 text-sm text-[#111827] dark:text-white">Next: <strong>{next.customer.name}</strong> ({queueSize - queue!.length + 1} of {queueSize})</span>
          <a href={reminderLink(next, shop)} target="_blank" rel="noopener noreferrer" onClick={() => { send(next); setQueue((q) => (q ? q.slice(1) : q)); }} className={waBtn}><MessageCircle className="w-4 h-4" /> Open WhatsApp</a>
          <button type="button" onClick={() => setQueue((q) => (q ? q.slice(1) : q))} className={secondaryBtn}>Skip</button>
          <button type="button" onClick={() => setQueue(null)} aria-label="Stop sending" className={secondaryBtn}><X className="w-4 h-4" /> Stop</button>
        </div>
      )}
      {remindersDue.length === 0 ? (
        <p className="px-4 sm:px-5 py-3 text-sm text-teal-700 dark:text-teal-300">All reminders for today are done.</p>
      ) : (
        <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
          {remindersDue.slice(0, 20).map((r) => (
            <li key={r.customer.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#111827] dark:text-white truncate">{r.customer.name} <span className={`${moneyCls} text-amber-700 dark:text-amber-300`}>{rs(r.amount)}</span></div>
                <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                  {r.oldest ? `Oldest ${r.oldest.invoiceNumber} of ${formatDate(r.oldest.date)}` : 'Opening balance'} • {r.reason} • {r.lastRemindedAt ? `last reminded ${formatDate(r.lastRemindedAt.slice(0, 10))}` : 'never reminded'}
                </div>
              </div>
              <button type="button" onClick={() => ui.aiReminder(r.customer.id)} className={`${secondaryBtn} !py-1.5 max-sm:flex-1`} aria-label={`AI write reminder to ${r.customer.name}`} title="AI writes the reminder in Urdu, Roman Urdu or English; you check it, then send"><Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-300" /> AI write</button>
              <a href={reminderLink(r, shop)} target="_blank" rel="noopener noreferrer" onClick={() => send(r)} className={`${waBtn} max-sm:flex-1`} aria-label={`Send WhatsApp reminder to ${r.customer.name}`}><MessageCircle className="w-4 h-4" /> WhatsApp</a>
            </li>
          ))}
          {remindersDue.length > 20 && <li className="px-4 sm:px-5 py-2 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">…and {remindersDue.length - 20} more (Send all goes through everyone).</li>}
        </ul>
      )}
    </div>
  );
};

