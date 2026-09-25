import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Copy, MessageCircle, Send, Sparkles } from 'lucide-react';
import type { AskOpen, AskResult, SummaryResult } from '../../../api/ai';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, pillCls, rs, bidi } from '../billing/ui';
import { useBillingUI } from '../billing/BillingUI';
import { useStockUI } from '../billing/StockUI';
import { useTrading } from '../../context/TradingContext';
import { useNavAccess, useNavGo } from '../nav/useNavGo';
import { navEntry } from '../../utils/navMap';
import { aiScreens, buildAskContext, buildSummaryContext, guessLanguage, reminderFacts, ReminderLanguage, SummaryPeriod } from '../../ai/context';
import { parseAskResult, parseReminderResult, parseSummaryResult } from '../../ai/parse';
import { reminderMessage, openBills, daysFrom } from '../../utils/reminders';
import { whatsappLink } from '../../utils/purchasing';
import { AiPrivacyNote, AiStatus, useAiCall, useAiShopData } from './AiKit';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const ASK_SHORTCUT = isMac ? '⌘J' : 'Ctrl+J';

// ---------------------------------------------------------------------------------------------------------
// Ask the shop (Pooch-o)
// ---------------------------------------------------------------------------------------------------------
interface Turn {
  q: string;
  a: AskResult;
}

export const AskShopDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { data, canFinance, finance, today } = useAiShopData();
  const { setSelectedCustomerId, setActiveScreen, customers, products, invoices } = useTrading();
  const access = useNavAccess();
  const go = useNavGo();
  const ui = useBillingUI();
  const stock = useStockUI();
  const ai = useAiCall('ask');
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      endRef.current?.scrollIntoView({ block: 'nearest' });
    } catch {
      /* jsdom */
    }
  }, [turns.length, ai.state.status]);

  const examples = ['Haji Karim ka kitna udhaar hai?', 'aaj kitni sale hui?', 'kaunse items kam hain?', ...(canFinance ? ['is mahine ka munafa?'] : [])];
  const screens = useMemo(() => aiScreens(access), [access]);

  const ask = async (text = question) => {
    const q = text.trim();
    if (!q || ai.loading) return;
    const context = buildAskContext(data, { today, question: q, canFinance, finance: finance(), screens });
    const result = await ai.run({ question: q, context, history: turns.slice(-3).map((t) => ({ q: t.q, a: t.a.answer })) });
    if (!result) return;
    const parsed = parseAskResult(result, {
      navIds: new Set(screens.map((s) => s.id)),
      customerIds: new Set(customers.map((c) => c.id)),
      productIds: new Set(products.map((p) => p.id)),
      billIds: new Set(invoices.map((i) => i.id)),
    });
    if (!parsed) return ai.fail('The AI answer could not be read. Try again.');
    setTurns((prev) => [...prev, { q, a: parsed }]);
    setQuestion('');
  };

  const openLabel = (o: AskOpen): string => {
    if (o.kind === 'customer') return customers.find((c) => c.id === o.id)?.name || 'customer';
    if (o.kind === 'product') return products.find((p) => p.id === o.id)?.name || 'item';
    if (o.kind === 'bill') return `bill ${invoices.find((i) => i.id === o.id)?.invoiceNumber || ''}`.trim();
    return navEntry(o.id)?.label || 'screen';
  };
  const openIt = (o: AskOpen) => {
    close();
    if (o.kind === 'customer') {
      setSelectedCustomerId(o.id);
      setActiveScreen('customers');
    } else if (o.kind === 'product') stock.itemHistory(o.id);
    else if (o.kind === 'bill') ui.openBill(o.id);
    else {
      const e = navEntry(o.id);
      if (e) go(e.target);
    }
  };
  const close = () => {
    ai.cancel();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Ask the shop" subtitle={`Pooch-o: ask in Urdu, Roman Urdu or English (${ASK_SHORTCUT})`} wide
      footer={
        <form className="flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
          <textarea
            dir="auto"
            rows={1}
            aria-label="Your question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }}
            className={`${inputCls} resize-none min-h-11`}
            placeholder="e.g. Haji Karim ka kitna udhaar hai?"
            maxLength={500}
          />
          <button type="submit" disabled={ai.loading || !question.trim()} className={`${primaryBtn} shrink-0`} aria-label="Ask"><Send className="w-4 h-4" /><span className="hidden sm:inline">Ask</span></button>
        </form>
      }
    >
      <div className="space-y-4" data-testid="ask-shop">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Ask about customers, udhaar, sales, stock{canFinance ? ', profit' : ''} or bills. Try:</p>
            <div className="flex flex-wrap gap-2">
              {examples.map((x) => (
                <button key={x} type="button" onClick={() => { setQuestion(x); void ask(x); }} className={pillCls(false)}>{x}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end"><div dir="auto" className="max-w-[85%] rounded-2xl rounded-br-md bg-[#111827] dark:bg-white text-white dark:text-[#111827] px-3.5 py-2 text-sm">{t.q}</div></div>
            <div className="flex gap-2">
              <Sparkles className="w-4 h-4 mt-2.5 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden="true" />
              <div className="min-w-0 max-w-[90%] rounded-2xl rounded-bl-md border border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#162436] px-3.5 py-2.5 space-y-2">
                <p dir="auto" data-testid="ai-answer" className="text-sm text-[#111827] dark:text-white whitespace-pre-wrap">{t.a.answer}</p>
                {t.a.open && (
                  <button type="button" onClick={() => openIt(t.a.open!)} className={`${secondaryBtn} !py-1.5`} data-testid="ai-open">
                    <ArrowUpRight className="w-4 h-4" /> Open {bidi(openLabel(t.a.open))}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <AiStatus state={ai.state} onCancel={ai.cancel} />
        <AiPrivacyNote>{canFinance ? '' : 'Profit, cost, cash and bank figures are not sent for your account.'}</AiPrivacyNote>
        <div ref={endRef} />
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Payment reminder
// ---------------------------------------------------------------------------------------------------------
const LANGS: { id: ReminderLanguage; label: string }[] = [
  { id: 'urdu', label: 'اردو' },
  { id: 'roman', label: 'Roman Urdu' },
  { id: 'english', label: 'English' },
];

export const AiReminderDialog: React.FC<{ isOpen: boolean; customerId: string | null; onClose: () => void }> = ({ isOpen, customerId, onClose }) => {
  const { customers, invoices, ledger, settings, markReminded } = useTrading();
  const owing = useMemo(() => customers.filter((c) => c.totalDue > 0).sort((a, b) => b.totalDue - a.totalDue), [customers]);
  const [custId, setCustId] = useState(customerId || owing[0]?.id || '');
  const customer = customers.find((c) => c.id === custId);
  const [lang, setLang] = useState<ReminderLanguage>(() => guessLanguage(customer?.name));
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const ai = useAiCall('reminder');

  const pickCustomer = (id: string) => {
    setCustId(id);
    setLang(guessLanguage(customers.find((c) => c.id === id)?.name));
    setMessage('');
  };
  const write = async () => {
    if (!customer) return ai.fail('Pick a customer first.');
    const facts = reminderFacts({ customer, invoices, ledger, shopName: settings.companyName, shopPhone: settings.companyPhone, today: new Date().toISOString().slice(0, 10) });
    const r = await ai.run({ language: lang, facts });
    if (!r) return;
    const parsed = parseReminderResult(r);
    if (!parsed) return ai.fail('The AI answer could not be read. Try again.');
    setMessage(parsed.message);
  };
  const standard = () => {
    if (!customer) return;
    const open = openBills(customer, invoices);
    const o = open[open.length - 1];
    const today = new Date().toISOString().slice(0, 10);
    setMessage(reminderMessage({ customer, amount: customer.totalDue, oldest: o ? { invoiceNumber: o.invoice.invoiceNumber, date: o.invoice.issueDate, dueDate: o.invoice.dueDate, days: daysFrom(o.invoice.issueDate, today), daysPastDue: 0 } : null }, settings.companyName || ''));
  };
  const close = () => {
    ai.cancel();
    onClose();
  };
  const phone = (customer?.phone || '').replace(/\D/g, '');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no clipboard */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="AI payment reminder" subtitle="AI writes it; you read, change and send it on WhatsApp."
      footer={
        <div className="flex flex-wrap gap-2 justify-end">
          {message && <button type="button" onClick={copy} className={secondaryBtn}><Copy className="w-4 h-4" /> {copied ? 'Copied' : 'Copy'}</button>}
          {message && phone && (
            <a href={whatsappLink(customer!.phone, message)} target="_blank" rel="noopener noreferrer" onClick={() => markReminded([customer!.id])} className={`${primaryBtn} !bg-emerald-600 !text-white`} data-testid="ai-reminder-send">
              <MessageCircle className="w-4 h-4" /> Send on WhatsApp
            </a>
          )}
          <button type="button" onClick={write} disabled={ai.loading || !customer} className={message ? secondaryBtn : primaryBtn}><Sparkles className="w-4 h-4" /> {message ? 'Write again' : 'Write with AI'}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="ai-rem-customer">Customer</label>
          <select id="ai-rem-customer" value={custId} onChange={(e) => pickCustomer(e.target.value)} className={inputCls}>
            {!customer && <option value="">Pick a customer…</option>}
            {customer && customer.totalDue <= 0 && <option value={customer.id}>{customer.name}</option>}
            {owing.map((c) => <option key={c.id} value={c.id}>{c.name} — owes {rs(c.totalDue)}</option>)}
          </select>
          {customer && !phone && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">No phone number for this customer: copy the message instead.</p>}
        </div>
        <div>
          <span className={labelCls} id="ai-rem-lang">Language</span>
          <div role="group" aria-labelledby="ai-rem-lang" className="flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button key={l.id} type="button" aria-pressed={lang === l.id} onClick={() => setLang(l.id)} className={pillCls(lang === l.id, 'teal')} {...(l.id === 'urdu' ? { lang: 'ur', 'aria-label': 'Urdu' } : {})}>{l.label}</button>
            ))}
          </div>
        </div>
        {message && (
          <div>
            <label className={labelCls} htmlFor="ai-rem-message">Reminder message (you can change it)</label>
            <textarea id="ai-rem-message" dir="auto" rows={7} value={message} onChange={(e) => setMessage(e.target.value)} className={inputCls} data-skip-autofocus />
          </div>
        )}
        <AiStatus state={ai.state} onCancel={ai.cancel} loadingText="Writing the reminder…" />
        {(ai.state.status === 'not_setup' || ai.state.status === 'error') && !message && (
          <button type="button" onClick={standard} className={secondaryBtn}>Use the standard message instead</button>
        )}
        <AiPrivacyNote>The customer's name, amount due, oldest bill and last payment are sent.</AiPrivacyNote>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Business summary (Owner dashboard)
// ---------------------------------------------------------------------------------------------------------
const PERIODS: { id: SummaryPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
];

export const AiSummaryDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { data, canFinance, finance, today } = useAiShopData();
  const [period, setPeriod] = useState<SummaryPeriod>('today');
  const [summary, setSummary] = useState<(SummaryResult & { period: SummaryPeriod }) | null>(null);
  const ai = useAiCall('summary');
  const write = async () => {
    const context = buildSummaryContext(data, { today, period, canFinance, finance: finance() });
    const r = await ai.run({ period, context });
    if (!r) return;
    const parsed = parseSummaryResult(r);
    if (!parsed) return ai.fail('The AI answer could not be read. Try again.');
    setSummary({ ...parsed, period });
  };
  const close = () => {
    ai.cancel();
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={close} title="AI business summary" subtitle="A short read of how the business is doing."
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={write} disabled={ai.loading} className={primaryBtn}><Sparkles className="w-4 h-4 text-violet-300 dark:text-violet-600" /> {summary ? 'Write again' : 'Write summary'}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} className={pillCls(period === p.id, 'teal')}>{p.label}</button>
          ))}
        </div>
        {summary && (
          <section data-testid="ai-summary" aria-label="Summary" className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#162436] px-4 py-3 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">{PERIODS.find((p) => p.id === summary.period)?.label}</p>
            <h3 className="font-bold text-[#111827] dark:text-white">{summary.headline}</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-[#374151] dark:text-[#CBD5E1]">
              {summary.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </section>
        )}
        <AiStatus state={ai.state} onCancel={ai.cancel} loadingText="Writing the summary…" />
        <AiPrivacyNote>Totals for the period, top customers and items, overdue customers and low stock are sent.</AiPrivacyNote>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Host: the AI dialogs, once, and Ctrl/⌘ + J for Ask the shop.
// ---------------------------------------------------------------------------------------------------------
export const AiHost: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const ui = useBillingUI();
  const { can } = useTrading();
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        if (ui.ai?.kind === 'ask') ui.closeAi();
        else ui.askShop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, ui]);
  if (!enabled || !ui.ai) return null;
  const v = ui.ai;
  if (v.kind === 'ask') return <AskShopDialog isOpen onClose={ui.closeAi} />;
  if (v.kind === 'reminder') return <AiReminderDialog key={v.customerId || 'any'} isOpen customerId={v.customerId} onClose={ui.closeAi} />;
  if (v.kind === 'summary' && (can('finance:view_pnl') || can('view_finance'))) return <AiSummaryDialog isOpen onClose={ui.closeAi} />;
  return null;
};
