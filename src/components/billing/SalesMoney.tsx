import React, { useMemo, useState } from 'react';
import { Printer, Save, Search, Percent, Undo2 } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';
import type { PostedRun } from '../../context/salesExtrasActions';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { Modal, Notice, EmptyState, inputCls, labelCls, primaryBtn, secondaryBtn, rs, moneyCls } from './ui';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { booksLockedFor } from '../../utils/accounting';
import { filterParties } from '../../utils/vouchers';
import { BankSelect } from './BankSelect';
import { needsBank } from '../../utils/banks';

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
  on: boolean;
  amount: string;
  method: string;
  /** Bank account for bank methods ('' = the main bank). */
  bank: string;
}

/**
 * Receive from many customers at once (the recovery man's round): tick customers, enter what each
 * paid, save once. Every customer gets their own payment row; they share one collection-sheet number.
 */
export const ReceiveManyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { customers, salesmen, areas, receiveMany, setPrintRequest, settings, collectionSheets, undoCollection, can, nextCollectionNo } = useTrading();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [salesmanId, setSalesmanId] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ sheetNo: string; message: string } | null>(null);

  const owing = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => c.totalDue > 0.005)
      .filter((c) => areaFilter === 'all' || (c.areaId || '') === areaFilter)
      .filter((c) => !q || filterParties([c], q, '').length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, query, areaFilter]);
  // Searching someone who has nothing due must say so, not "nobody owes you".
  const settled = useMemo(() => {
    const q = query.trim();
    if (!q || owing.length > 0) return [] as typeof customers;
    return filterParties<(typeof customers)[number]>(customers, q, '').filter((c) => c.totalDue <= 0.005).slice(0, 3);
  }, [customers, query, owing.length]);
  const line = (id: string): Line => lines[id] || { on: false, amount: '', method: 'Cash', bank: '' };
  const setLine = (id: string, patch: Partial<Line>) => { setError(''); setLines((prev) => ({ ...prev, [id]: { ...line(id), ...patch } })); };
  const ticked = (Object.entries(lines) as [string, Line][]).filter(([, l]) => l.on && (parseFloat(l.amount) || 0) > 0);
  const total = ticked.reduce((a, [, l]) => a + (parseFloat(l.amount) || 0), 0);
  const cash = ticked.filter(([, l]) => l.method.toLowerCase().startsWith('cash')).reduce((a, [, l]) => a + (parseFloat(l.amount) || 0), 0);

  const save = (print: boolean) => {
    setError('');
    const closed = booksLockedFor(settings, date);
    if (closed) return setError(closed);
    const r = receiveMany({ date, salesmanId: salesmanId || null, note, rows: ticked.map(([customerId, l]) => ({ customerId, amount: parseFloat(l.amount) || 0, method: l.method, ...(needsBank(l.method) && l.bank ? { bankCode: l.bank } : {}) })) });
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
        <span className="text-[#6B7280] dark:text-[#94A3B8]">{ticked.length} customer(s) • </span>
        <span className={`${moneyCls} font-extrabold text-lg`} data-testid="receive-many-total">{rs(total)}</span>
        {total > 0 && <span className="ml-2 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">cash {rs(cash)} • bank {rs(total - cash)}</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => save(false)} disabled={ticked.length === 0} className={secondaryBtn}><Save className="w-4 h-4" /> Save</button>
        <button type="button" onClick={() => save(true)} disabled={ticked.length === 0} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save &amp; Print</button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receive from many" subtitle="Tick each customer who paid and enter the amount. One save records them all." wide footer={footer}>
      <div className="space-y-4">
        <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Receipt no. <strong className="tabular-nums text-sm text-[#111827] dark:text-white" title="Given automatically when you save" data-testid="rm-next-number">{nextCollectionNo()}</strong></div>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <label className={labelCls} htmlFor="rm-area">Area</label>
            <select id="rm-area" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className={inputCls}>
              <option value="all">All areas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              {areas.length > 0 && <option value="">No area</option>}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="rm-note">Note</label>
            <input id="rm-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
          </div>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a customer" className={`${inputCls} pl-10`} aria-label="Find a customer" />
        </div>
        {owing.length === 0 ? (
          <EmptyState
            compact
            text={
              settled.length
                ? `${settled.map((c) => c.name).join(', ')} ${settled.length === 1 ? 'has' : 'have'} nothing due. Only customers who owe money are listed here.`
                : query.trim()
                  ? `No customer here matches "${query.trim()}". Only customers who owe money are listed.`
                  : 'Nobody owes you money here.'
            }
          />
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]" data-testid="receive-many-list">
            {owing.map((c) => {
              const l = line(c.id);
              return (
                <li key={c.id} className={`px-3 py-2 ${l.on ? 'bg-teal-50/60 dark:bg-teal-950/20' : ''}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" aria-label={`Received from ${c.name}`} checked={l.on} onChange={(e) => setLine(c.id, { on: e.target.checked, amount: e.target.checked && !l.amount ? String(Math.round(c.totalDue * 100) / 100) : l.amount })} className="w-5 h-5 accent-teal-700 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate text-[#111827] dark:text-white">{c.code ? `${c.code} • ` : ''}{c.name}</div>
                      <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">owes <span className={moneyCls}>{rs(c.totalDue)}</span>{c.city ? ` • ${c.city}` : ''}{c.areaId ? ` • ${areas.find((a) => a.id === c.areaId)?.name || ''}` : ''}</div>
                    </div>
                  </div>
                  {l.on && (
                    <div className="grid grid-cols-2 gap-2 mt-2 pl-8">
                      <input aria-label={`Amount from ${c.name}`} type="number" inputMode="decimal" min="0" step="any" value={l.amount} onChange={(e) => setLine(c.id, { amount: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="Amount" />
                      <select aria-label={`Method for ${c.name}`} value={l.method} onChange={(e) => setLine(c.id, { method: e.target.value })} className={inputCls}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                      {needsBank(l.method) && <BankSelect id={`rm-bank-${c.id}`} className="col-span-2" label={`Into bank (${c.name})`} value={l.bank} onChange={(v) => setLine(c.id, { bank: v })} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
