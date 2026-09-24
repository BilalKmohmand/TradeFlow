import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Save, Percent, Undo2, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';
import type { PostedRun } from '../../context/salesExtrasActions';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { Modal, Notice, EmptyState, inputCls, labelCls, primaryBtn, secondaryBtn, rs, moneyCls } from './ui';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { booksLockedFor } from '../../utils/accounting';
import { BankSelect } from './BankSelect';
import { needsBank } from '../../utils/banks';
import { CodeBox } from './CodeBox';
import { QuickSelect, PickOption } from './QuickPick';

/** Recent interest runs / collection sheets with a one-tap Undo (asks once, then reverses the whole run). */
const RecentRuns: React.FC<{ title: string; runs: PostedRun[]; noun: string; allowed: boolean; onUndo: (id: string) => { success: boolean; message: string }; testId: string }> = ({ title, runs, noun, allowed, onUndo, testId }) => {
  const [pending, setPending] = useState<PostedRun | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  if (runs.length === 0 && !msg) return null;
  return (
    <div className="space-y-2" data-testid={testId}>
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">{title}</h3>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {runs.length > 0 && (
        <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
          {runs.slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm">
              <span className="flex-1 min-w-0"><span className="font-semibold">{r.label}</span> <span className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">• {formatDate(r.date)} • {r.customers} customer{r.customers === 1 ? '' : 's'}</span></span>
              <span className={`${moneyCls} font-bold`}>{rs(r.total)}</span>
              {allowed && <button type="button" onClick={() => setPending(r)} aria-label={`Undo ${noun} ${r.label}`} className="inline-flex items-center gap-1 min-h-11 sm:min-h-9 px-2.5 rounded-xl text-xs font-bold text-[#6B7280] dark:text-[#94A3B8] hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"><Undo2 className="w-4 h-4" /> Undo</button>}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={`Undo ${noun} ${pending?.label || ''}?`}
        message={pending ? `${rs(pending.total)} for ${pending.customers} customer${pending.customers === 1 ? '' : 's'} is taken back and their balances go back to what they were.` : ''}
        confirmLabel={`Undo ${noun}`}
        askReason={false}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            const r = onUndo(pending.id);
            setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
          }
          setPending(null);
        }}
      />
    </div>
  );
};

/** Cheques need their own details and wait in the cheque register, so they are not offered here. */
const METHODS = BILL_PAYMENT_METHODS.filter((m) => m !== 'Cheque');

interface Line {
  key: string;
  customerId: string;
  amount: string;
  method: string;
  /** Bank account for bank methods ('' = the main bank). */
  bank: string;
  note: string;
}

let lineSeq = 0;
const blankLine = (): Line => ({ key: `rl${++lineSeq}`, customerId: '', amount: '', method: 'Cash', bank: '', note: '' });
const focusSoon = (id: string) => setTimeout(() => { const el = document.getElementById(id) as HTMLInputElement | null; el?.focus(); el?.select?.(); }, 30);

/**
 * Receive from many customers at once, like the old "Cash Receipt (Credit Voucher)": a table of lines —
 * Code, Title, A/C balance, Amount, Method, Narration. Every customer gets their own payment row; they
 * share one receipt (collection-sheet) number.
 */
export const ReceiveManyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { customers, salesmen, receiveMany, setPrintRequest, settings, collectionSheets, undoCollection, can, nextCollectionNo } = useTrading();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [salesmanId, setSalesmanId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>(() => [blankLine()]);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');
  const [done, setDone] = useState<{ sheetNo: string; message: string } | null>(null);

  // The dialog stays mounted: every time it opens, start a fresh receipt with one empty line.
  useEffect(() => {
    if (!isOpen) return;
    setDate(todayISO());
    setLines([blankLine()]);
    setError('');
    setWarn('');
    setDone(null);
  }, [isOpen]);

  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const sorted = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const options: PickOption[] = useMemo(() => sorted.map((c) => ({ value: c.id, name: c.name, code: c.code, extra: [(c as { company?: string }).company, c.city, c.phone].filter(Boolean).join(' ') })), [sorted]);

  const setLine = (key: string, patch: Partial<Line>) => { setError(''); setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l))); };
  /** Pick a customer on a line; the same customer twice is not allowed — go to their line instead. */
  const pickCustomer = (key: string, id: string): boolean => {
    setWarn('');
    const other = lines.findIndex((l) => l.key !== key && l.customerId === id);
    if (id && other >= 0) {
      setWarn(`${byId.get(id)?.name || 'This customer'} is already on line ${other + 1}. Change the amount there.`);
      setLine(key, { customerId: '' });
      focusSoon(`rm-amt-${lines[other].key}`);
      return false;
    }
    setLine(key, { customerId: id });
    return true;
  };
  const addLine = (focus = true) => {
    const l = blankLine();
    setLines((prev) => [...prev, l]);
    if (focus) focusSoon(`rm-code-${l.key}`);
  };
  /** Enter on Amount / Narration: go to the next line's Code (adding a line at the end). */
  const nextLine = (key: string) => {
    const at = lines.findIndex((l) => l.key === key);
    if (at >= 0 && at < lines.length - 1) focusSoon(`rm-code-${lines[at + 1].key}`);
    else addLine();
  };
  const removeLine = (key: string) => { setWarn(''); setLines((prev) => (prev.length === 1 ? [blankLine()] : prev.filter((l) => l.key !== key))); };

  const filled = lines.filter((l) => l.customerId && (parseFloat(l.amount) || 0) > 0);
  const total = filled.reduce((a, l) => a + (parseFloat(l.amount) || 0), 0);
  const cash = filled.filter((l) => l.method.toLowerCase().startsWith('cash')).reduce((a, l) => a + (parseFloat(l.amount) || 0), 0);

  const save = (print: boolean) => {
    setError('');
    const closed = booksLockedFor(settings, date);
    if (closed) return setError(closed);
    const noName = lines.findIndex((l) => !l.customerId && (parseFloat(l.amount) || 0) > 0);
    if (noName >= 0) return setError(`Line ${noName + 1} has an amount but no customer.`);
    const r = receiveMany({ date, salesmanId: salesmanId || null, note, rows: filled.map((l) => ({ customerId: l.customerId, amount: parseFloat(l.amount) || 0, method: l.method, ...(needsBank(l.method) && l.bank ? { bankCode: l.bank } : {}), ...(l.note.trim() ? { note: l.note.trim() } : {}) })) });
    if (!r.success || !r.sheetNo) return setError(r.message);
    setDone({ sheetNo: r.sheetNo, message: r.message });
    if (print) setPrintRequest({ type: 'sales_extras', report: 'collection', sheetNo: r.sheetNo });
  };

  if (done) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Money received" subtitle={`Collection sheet ${done.sheetNo}`}>
        <div className="space-y-4">
          <Notice kind="ok">{done.message}</Notice>
          <RecentRuns title="Made a mistake?" runs={collectionSheets.filter((c) => c.id === done.sheetNo)} noun="collection" allowed={can('finance:record_payment')} onUndo={undoCollection} testId="undo-collection" />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setPrintRequest({ type: 'sales_extras', report: 'collection', sheetNo: done.sheetNo })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print collection sheet</button>
            <button type="button" onClick={onClose} className={primaryBtn}>Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 text-sm">
        <span className="text-[#6B7280] dark:text-[#94A3B8]" data-testid="receive-many-count">{filled.length} customer(s) • </span>
        <span className={`${moneyCls} font-extrabold text-lg`} data-testid="receive-many-total">{rs(total)}</span>
        {total > 0 && <span className="ml-2 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">cash {rs(cash)} • bank {rs(total - cash)}</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => save(false)} disabled={filled.length === 0} className={secondaryBtn}><Save className="w-4 h-4" /> Save</button>
        <button type="button" onClick={() => save(true)} disabled={filled.length === 0} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save &amp; Print</button>
      </div>
    </div>
  );

  const cols = 'sm:grid-cols-[6.5rem_minmax(9rem,1.6fr)_6.5rem_7rem_8.5rem_minmax(6rem,1fr)_2.75rem]';
  const head = 'text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]';
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receive from many" subtitle="Cash receipt: one line per customer. Type the code and press Enter, then the amount." wide footer={footer}>
      <div className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        {warn && <Notice kind="error">{warn}</Notice>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <span className={labelCls}>Receipt no.</span>
            <div className={`${inputCls} tabular-nums`} title="Given automatically when you save" data-testid="rm-next-number">{nextCollectionNo()}</div>
          </div>
          <div>
            <label className={labelCls} htmlFor="rm-date">Date</label>
            <input id="rm-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="rm-salesman">Collected by</label>
            <select id="rm-salesman" value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {salesmen.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="rm-note">Note</label>
            <input id="rm-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
          </div>
        </div>
        <div className="space-y-2" data-testid="receive-many-table">
          <div className={`hidden sm:grid ${cols} gap-2 px-1`} aria-hidden="true">
            <span className={head}>Code</span>
            <span className={head}>Title</span>
            <span className={`${head} text-right`}>A/C balance</span>
            <span className={head}>Amount</span>
            <span className={head}>Method</span>
            <span className={head}>Narration</span>
            <span />
          </div>
          {lines.map((l, i) => {
            const c = l.customerId ? byId.get(l.customerId) : undefined;
            const n = i + 1;
            return (
              <div key={l.key} data-testid="receive-many-row" className={`grid grid-cols-2 ${cols} gap-2 items-start sm:items-center rounded-2xl sm:rounded-xl border sm:border-0 border-[#E5E5E1] dark:border-[#203248] p-2.5 sm:p-1 ${c ? 'bg-teal-50/40 dark:bg-teal-950/10' : ''}`}>
                <CodeBox id={`rm-code-${l.key}`} label={`Line ${n} code`} items={customers} value={l.customerId} onPick={(id) => pickCustomer(l.key, id)}
                  onEnter={(hit) => { if (hit) focusSoon(`rm-amt-${l.key}`); }} />
                <div className="min-w-0">
                  <QuickSelect id={`rm-cust-${l.key}`} aria-label={`Line ${n} customer`} value={l.customerId} options={options} onPick={(id) => { if (pickCustomer(l.key, id) && id) focusSoon(`rm-amt-${l.key}`); }} className={inputCls} title="Type a name, code, city or phone to find it">
                    <option value="">Customer…</option>
                    {sorted.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` (${x.city})` : ''}</option>)}
                  </QuickSelect>
                </div>
                <div className="col-span-2 sm:col-span-1 flex sm:block items-baseline justify-between text-right px-1">
                  <span className="sm:hidden text-[11px] text-[#6B7280] dark:text-[#94A3B8]">A/C balance</span>
                  <span className={`${moneyCls} text-sm font-semibold ${c && c.totalDue > 0.005 ? '' : 'text-[#6B7280] dark:text-[#94A3B8]'}`} data-testid={`rm-balance-${n}`}>{c ? rs(c.totalDue) : '—'}</span>
                </div>
                <input id={`rm-amt-${l.key}`} aria-label={`Line ${n} amount`} type="number" inputMode="decimal" min="0" step="any" value={l.amount}
                  onChange={(e) => setLine(l.key, { amount: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextLine(l.key); } }}
                  className={`${inputCls} tabular-nums`} placeholder="Amount" />
                <select aria-label={`Line ${n} method`} value={l.method} onChange={(e) => setLine(l.key, { method: e.target.value })} className={inputCls}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                <input aria-label={`Line ${n} narration`} value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextLine(l.key); } }}
                  className={inputCls} placeholder="Narration" />
                <button type="button" onClick={() => removeLine(l.key)} aria-label={`Remove line ${n}`} className="justify-self-end inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 rounded-xl text-[#6B7280] dark:text-[#94A3B8] hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"><Trash2 className="w-4 h-4" /></button>
                {needsBank(l.method) && <BankSelect id={`rm-bank-${l.key}`} className="col-span-2 sm:col-start-4 sm:col-span-3" label={`Line ${n} into bank`} value={l.bank} onChange={(v) => setLine(l.key, { bank: v })} />}
              </div>
            );
          })}
          <button type="button" onClick={() => addLine()} className={secondaryBtn}><Plus className="w-4 h-4" /> Add row</button>
        </div>
        <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">Got a cheque? Use Receive payment → Cheque, so it waits in the cheque register until the bank clears it.</p>
        <RecentRuns title="Recent collection sheets" runs={collectionSheets} noun="collection" allowed={can('finance:record_payment')} onUndo={undoCollection} testId="recent-collections" />
      </div>
    </Modal>
  );
};

/** Late-payment interest: preview what each customer would be charged, then post it as debit notes. */
export const InterestRunModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { previewInterest, chargeInterest, customers, can, interestRuns, undoInterestRun } = useTrading();
  const today = todayISO();
  const [asOf, setAsOf] = useState(today);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const rows = useMemo(() => (isOpen ? previewInterest(asOf) : []), [isOpen, asOf, previewInterest]);
  const picked = rows.filter((r) => !skip.has(r.customer.id));
  const total = picked.reduce((a, r) => a + r.interest, 0);
  const withRate = customers.filter((c) => (c.interestPctPerMonth || 0) > 0).length;
  const allowed = can('finance:view_pnl');

  const post = () => {
    const r = chargeInterest(asOf, picked.map((x) => x.customer.id));
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) setSkip(new Set());
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Charge interest" subtitle="Late-payment charge on overdue money, for customers who have a rate set." wide
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 text-sm"><span className="text-[#6B7280] dark:text-[#94A3B8]">{picked.length} customer(s) • </span><span className={`${moneyCls} font-extrabold text-lg`}>{rs(total)}</span></div>
          <button type="button" onClick={post} disabled={!allowed || picked.length === 0} className={primaryBtn}><Percent className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Post interest</button>
        </div>
      }
    >
      <div className="space-y-4">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {!allowed && <Notice kind="error">Only a manager or admin can charge interest.</Notice>}
        <div className="flex flex-wrap items-end gap-3">
          <div><label className={labelCls} htmlFor="int-asof">Charge up to</label><input id="int-asof" type="date" value={asOf} max={today} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={`${inputCls} sm:w-auto`} /></div>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] flex-1 min-w-[12rem]">{withRate === 0 ? 'Interest is off for every customer. Set a rate on the customer (Customers → open → Area, salesman & late payment).' : `${withRate} customer(s) have a rate. Each unpaid bill is charged from the day it became overdue (or the last run), pro rata by day.`}</p>
        </div>
        {rows.length === 0 ? <EmptyState compact text="No interest to charge on this date." /> : (
          <ul className="space-y-2" data-testid="interest-preview">
            {rows.map((r) => (
              <li key={r.customer.id} className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" aria-label={`Charge ${r.customer.name}`} checked={!skip.has(r.customer.id)} onChange={(e) => setSkip((prev) => { const n = new Set(prev); if (e.target.checked) n.delete(r.customer.id); else n.add(r.customer.id); return n; })} className="w-5 h-5 accent-teal-700" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{r.customer.name}</div>
                    <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{r.pct}% a month after {r.afterDays} days • overdue <span className={moneyCls}>{rs(r.overdue)}</span>{r.lastChargedOn ? ` • last charged ${formatDate(r.lastChargedOn)}` : ''}</div>
                  </div>
                  <span className={`${moneyCls} font-bold`}>{rs(r.interest)}</span>
                </div>
                <ul className="mt-1.5 pl-8 text-[11px] text-[#6B7280] dark:text-[#94A3B8] space-y-0.5">
                  {r.lines.map((l, i) => <li key={i}>{l.ref} ({formatDate(l.date)}): {rs(l.amount)} × {l.days} days from {formatDate(l.from)} = <span className={moneyCls}>{rs(l.interest)}</span></li>)}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <RecentRuns title="Interest already charged" runs={interestRuns} noun="interest" allowed={allowed} onUndo={undoInterestRun} testId="recent-interest" />
      </div>
    </Modal>
  );
};
