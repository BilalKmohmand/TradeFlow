import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Save, Percent, Undo2, Plus, Trash2, Check, X } from 'lucide-react';
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
import { LedgerGrid, LedgerColumn, TotalsLabel, fmt2, ledgerInputCls, ledgerNumCls, ledgerSelectCls } from './classic/LedgerGrid';

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
const amountOf = (l: Line) => parseFloat(l.amount) || 0;

/** Receipt no. | Code | Title | A/C balance | Amount | Method | Narration, as the old Cash Receipt voucher. */
const RM_COLS: LedgerColumn[] = [
  { key: 'rno', label: 'Receipt no.', width: '6.5rem' },
  { key: 'code', label: 'Code', width: '6rem' },
  { key: 'title', label: 'Title', width: 'minmax(10rem,2fr)' },
  { key: 'balance', label: 'A/C balance', width: '7.5rem', numeric: true },
  { key: 'amount', label: 'Amount', width: '7.75rem', numeric: true },
  { key: 'method', label: 'Method', width: '8.75rem' },
  { key: 'narration', label: 'Narration', width: 'minmax(8rem,1.4fr)' },
  { key: 'act', label: <span className="sr-only">Line</span>, width: '4.75rem', align: 'center' },
];
const cellBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-md border border-[#D9D8D2] dark:border-[#2A3E57] bg-white dark:bg-[#0B131D] text-[#374151] dark:text-[#CBD5E1] hover:text-teal-700 dark:hover:text-teal-300';

/**
 * Receive from many customers at once, like the old "Cash Receipt (Credit Voucher)": one entry row on top of a
 * ruled grid — Code → Title → Amount → Method → Narration, Enter moves on and Enter on Narration puts the line
 * in the grid (click a line to change it, Delete removes it). The sheet is one voucher (CS-n, the old Cash
 * Receipt voucher number); every customer line gets its own payment row with its own receipt number from the
 * Receipt series (shown before saving: next, next+1, …), so either can be given to the client.
 */
export const ReceiveManyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { customers, salesmen, receiveMany, setPrintRequest, settings, collectionSheets, undoCollection, can, nextCollectionNo, previewReceiptNos, bankAccounts, ledger } = useTrading();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [salesmanId, setSalesmanId] = useState('');
  const [note, setNote] = useState('');
  /** Lines in the grid. */
  const [lines, setLines] = useState<Line[]>([]);
  /** The entry row (a new line, or a grid line loaded to change it: editKey). */
  const [entry, setEntry] = useState<Line>(() => blankLine());
  const [editKey, setEditKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');
  const [done, setDone] = useState<{ sheetNo: string; message: string; ledgerIds: string[] } | null>(null);

  // The dialog stays mounted: start the next receipt fresh. Done when it CLOSES, so the open dialog never
  // swaps its rows after the user has started typing (on a slow computer the first entry was lost).
  useEffect(() => {
    if (isOpen) return;
    setDate(todayISO());
    setLines([]);
    setEntry(blankLine());
    setEditKey(null);
    setError('');
    setWarn('');
    setDone(null);
  }, [isOpen]);

  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const sorted = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const options: PickOption[] = useMemo(() => sorted.map((c) => ({ value: c.id, name: c.name, code: c.code, extra: [(c as { company?: string }).company, c.city, c.phone].filter(Boolean).join(' ') })), [sorted]);

  const editAt = editKey ? lines.findIndex((l) => l.key === editKey) : -1;
  /** The line number the entry row is (or will become). */
  const n = editAt >= 0 ? editAt + 1 : lines.length + 1;
  const setE = (patch: Partial<Line>) => { setError(''); setEntry((e) => ({ ...e, ...patch })); };
  /** Pick the entry row's customer; one already in the grid is not taken twice — change the amount there. */
  const pickCustomer = (id: string): boolean => {
    setWarn('');
    const other = lines.findIndex((l) => l.key !== editKey && l.customerId === id);
    if (id && other >= 0) {
      setWarn(`${byId.get(id)?.name || 'This customer'} is already on line ${other + 1}. Change the amount there.`);
      setE({ customerId: '' });
      focusSoon('rm-code'); // back to Code for another customer
      return false;
    }
    setE({ customerId: id });
    return true;
  };
  const clearEntry = () => { setEntry(blankLine()); setEditKey(null); };
  /** The entry row into the grid (Enter on Narration, or Add row). */
  const commit = (): boolean => {
    if (!entry.customerId && !(amountOf(entry) > 0)) {
      if (editKey) clearEntry();
      focusSoon('rm-code');
      return false;
    }
    if (!entry.customerId) { setError(`Line ${n} has an amount but no customer.`); focusSoon('rm-code'); return false; }
    if (!(amountOf(entry) > 0)) { setError(`Enter the amount for line ${n}.`); focusSoon('rm-amt'); return false; }
    setLines((prev) => (editKey ? prev.map((l) => (l.key === editKey ? { ...entry, key: editKey } : l)) : [...prev, entry]));
    clearEntry();
    setError('');
    setWarn('');
    focusSoon('rm-code');
    return true;
  };
  const loadLine = (key: string) => {
    const l = lines.find((x) => x.key === key);
    if (!l) return;
    setEntry({ ...l });
    setEditKey(key);
    setWarn('');
    focusSoon('rm-amt');
  };
  const removeLine = (key: string) => {
    setWarn('');
    setLines((prev) => prev.filter((l) => l.key !== key));
    if (editKey === key) clearEntry();
  };

  // What Save takes: the grid, plus the entry row when it is filled in (as if Enter was pressed on it).
  const entryFilled = Boolean(entry.customerId) && amountOf(entry) > 0;
  const all = editKey ? lines.map((l) => (l.key === editKey ? entry : l)) : entryFilled ? [...lines, entry] : lines;
  const filled = all.filter((l) => l.customerId && amountOf(l) > 0);
  const total = filled.reduce((a, l) => a + amountOf(l), 0);
  const cash = filled.filter((l) => l.method.toLowerCase().startsWith('cash')).reduce((a, l) => a + amountOf(l), 0);
  /** The receipt number each line will get on Save (grid lines in order, then the entry row). */
  const nextNos = isOpen && !done ? previewReceiptNos(Math.max(lines.length, n), date) : [];

  const save = (print: boolean) => {
    setError('');
    const closed = booksLockedFor(settings, date);
    if (closed) return setError(closed);
    if (!editKey && !entry.customerId && amountOf(entry) > 0) return setError(`Line ${n} has an amount but no customer.`);
    const r = receiveMany({ date, salesmanId: salesmanId || null, note, rows: filled.map((l) => ({ customerId: l.customerId, amount: amountOf(l), method: l.method, ...(needsBank(l.method) && l.bank ? { bankCode: l.bank } : {}), ...(l.note.trim() ? { note: l.note.trim() } : {}) })) });
    if (!r.success || !r.sheetNo) return setError(r.message);
    setDone({ sheetNo: r.sheetNo, message: r.message, ledgerIds: r.ledgerIds || [] });
    if (print) setPrintRequest({ type: 'sales_extras', report: 'collection', sheetNo: r.sheetNo });
  };

  if (done) {
    const saved = done.ledgerIds.map((id) => ledger.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => Boolean(l));
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Money received" subtitle={`Voucher ${done.sheetNo}`}>
        <div className="space-y-4">
          <Notice kind="ok">{done.message}</Notice>
          {saved.length > 0 && (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]" data-testid="rm-saved-lines">
              {saved.map((l) => {
                const c = byId.get(l.entityId);
                return (
                  <li key={l.id} className="flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm" data-testid="rm-saved-line">
                    <span className="tabular-nums text-xs font-bold text-[#111827] dark:text-white shrink-0" data-testid="rm-saved-receipt-no">{l.receiptNo || l.referenceId}</span>
                    <span className="flex-1 min-w-0 truncate">{c?.code ? <span className="text-[#6B7280] dark:text-[#94A3B8]">{c.code} · </span> : null}{c?.name || 'Customer'} <span className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">• {l.method || 'Cash'}</span></span>
                    <span className={`${moneyCls} font-bold`}>{rs(l.credit)}</span>
                    <button type="button" onClick={() => setPrintRequest({ type: 'sales_extras', report: 'receipts', ledgerIds: [l.id] })} aria-label={`Print receipt ${l.receiptNo || l.referenceId}`} title="Print this receipt" className="inline-flex items-center justify-center min-h-11 sm:min-h-9 min-w-11 sm:min-w-9 rounded-xl text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40"><Printer className="w-4 h-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
          <RecentRuns title="Made a mistake?" runs={collectionSheets.filter((c) => c.id === done.sheetNo)} noun="collection" allowed={can('finance:record_payment')} onUndo={undoCollection} testId="undo-collection" />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setPrintRequest({ type: 'sales_extras', report: 'collection', sheetNo: done.sheetNo })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print collection sheet</button>
            {saved.length > 0 && <button type="button" onClick={() => setPrintRequest({ type: 'sales_extras', report: 'receipts', ledgerIds: saved.map((l) => l.id) })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print receipts</button>}
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
        <span className={`${moneyCls} font-extrabold text-lg text-[#111827] dark:text-white`} data-testid="receive-many-total">{rs(total)}</span>
        {total > 0 && <span className="ml-2 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">cash {rs(cash)} • bank {rs(total - cash)}</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => save(false)} disabled={filled.length === 0} className={secondaryBtn}><Save className="w-4 h-4" /> Save</button>
        <button type="button" onClick={() => save(true)} disabled={filled.length === 0} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save &amp; Print</button>
      </div>
    </div>
  );

  const ec = entry.customerId ? byId.get(entry.customerId) : undefined;
  const bankName = (code: string) => bankAccounts.find((b) => b.code === code)?.name;
  const multiBank = bankAccounts.length > 1;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receive from many" subtitle="Cash receipt: one line per customer. Code, Enter, amount, Enter, method, Enter, narration, Enter." wide="xl" footer={footer}>
      <div className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        {warn && <Notice kind="error">{warn}</Notice>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <span className={labelCls}>Voucher # / Receipt no.</span>
            <div className={`${inputCls} tabular-nums`} title="The voucher (collection sheet) number, given automatically when you save. Each line also gets its own receipt number." data-testid="rm-next-number">{nextCollectionNo()}</div>
          </div>
          <div>
            <label className={labelCls} htmlFor="rm-date">Date</label>
            <input id="rm-date" type="date" data-skip-autofocus value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="rm-salesman">Collected by</label>
            <select id="rm-salesman" data-skip-autofocus value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {salesmen.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="rm-note">Note</label>
            <input id="rm-note" data-skip-autofocus value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
          </div>
        </div>
        <LedgerGrid
          testId="receive-many-table"
          ariaLabel="Receipt lines"
          columns={RM_COLS}
          minWidth={820}
          minRows={15}
          empty="No lines yet. Type the customer code and press Enter, then the amount."
          entry={{
            editing: Boolean(editKey),
            props: { 'data-testid': 'receive-many-entry' },
            cells: {
              rno: <span className="block leading-8 px-1 tabular-nums text-[#6B7280] dark:text-[#94A3B8]" title="Given automatically when you save" data-testid={`rm-receipt-no-${n}`}>{nextNos[n - 1] || ''}</span>,
              code: <CodeBox key={entry.key} id="rm-code" label={`Line ${n} code`} items={customers} value={entry.customerId} onPick={(id) => pickCustomer(id)} inputClassName={ledgerInputCls}
                onEnter={(hit, typed) => { if (hit) focusSoon('rm-amt'); else if (!typed) focusSoon('rm-cust'); }} />,
              title: (
                <QuickSelect id="rm-cust" aria-label={`Line ${n} customer`} value={entry.customerId} options={options} onPick={(id) => { if (pickCustomer(id) && id) focusSoon('rm-amt'); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && entry.customerId) { e.preventDefault(); focusSoon('rm-amt'); } }}
                  className={ledgerSelectCls} title="Type a name, code, city or phone to find it">
                  <option value="">Customer…</option>
                  {sorted.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` (${x.city})` : ''}</option>)}
                </QuickSelect>
              ),
              balance: <span className={`block leading-8 px-1 ${moneyCls} ${ec && ec.totalDue > 0.005 ? 'font-semibold' : 'text-[#6B7280] dark:text-[#94A3B8]'}`}><span data-testid={`rm-balance-${n}`}>{ec ? fmt2(ec.totalDue) : '—'}</span></span>,
              amount: <input id="rm-amt" aria-label={`Line ${n} amount`} type="number" inputMode="decimal" min="0" step="any" value={entry.amount} onChange={(e) => setE({ amount: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusSoon('rm-method'); } }} className={ledgerNumCls} placeholder="Amount" />,
              method: (
                <select id="rm-method" aria-label={`Line ${n} method`} value={entry.method} onChange={(e) => setE({ method: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusSoon(needsBank(entry.method) && multiBank ? 'rm-bank' : 'rm-narration'); } }} className={ledgerSelectCls}>
                  {METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              ),
              narration: <input id="rm-narration" aria-label={`Line ${n} narration`} value={entry.note} onChange={(e) => setE({ note: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} className={ledgerInputCls} placeholder="Narration" />,
              act: (
                <div className="flex gap-1 justify-center">
                  <button type="button" onClick={() => commit()} className={cellBtn} aria-label={editKey ? 'Update row' : 'Add row'} title={editKey ? 'Update row (Enter on Narration)' : 'Add row (Enter on Narration)'}>{editKey ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}</button>
                  {editKey && <button type="button" onClick={() => { clearEntry(); focusSoon('rm-code'); }} className={cellBtn} aria-label="Stop changing row"><X className="w-4 h-4" /></button>}
                </div>
              ),
            },
            below: needsBank(entry.method) && multiBank ? (
              <div className="max-w-xs" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'SELECT') { e.preventDefault(); focusSoon('rm-narration'); } }}>
                <BankSelect id="rm-bank" label={`Line ${n} into bank`} value={entry.bank} onChange={(v) => setE({ bank: v })} />
              </div>
            ) : undefined,
          }}
          rows={lines.map((l, i) => {
            const c = byId.get(l.customerId);
            return {
              key: l.key,
              testId: 'receive-many-row',
              label: `Line ${i + 1}: ${c?.name || ''}`,
              selected: l.key === editKey,
              onActivate: () => loadLine(l.key),
              onDelete: () => { removeLine(l.key); focusSoon('rm-code'); },
              cells: {
                rno: <span className="tabular-nums text-[#6B7280] dark:text-[#94A3B8]" data-testid={l.key === editKey ? undefined : `rm-receipt-no-${i + 1}`}>{nextNos[i] || ''}</span>,
                code: <span className="text-[#6B7280] dark:text-[#94A3B8]">{c?.code || ''}</span>,
                title: <span className="font-semibold">{c?.name || 'Deleted customer'}</span>,
                balance: <span data-testid={l.key === editKey ? undefined : `rm-balance-${i + 1}`}>{c ? fmt2(c.totalDue) : ''}</span>,
                amount: <span data-testid={`rm-amount-${i + 1}`}>{fmt2(amountOf(l))}</span>,
                method: <span className="text-xs">{l.method}{needsBank(l.method) && multiBank ? ` · ${bankName(l.bank) || bankAccounts[0]?.name || ''}` : ''}</span>,
                narration: <span className="text-[#374151] dark:text-[#CBD5E1]">{l.note}</span>,
                act: <button type="button" onClick={(e) => { e.stopPropagation(); removeLine(l.key); }} aria-label={`Remove line ${i + 1}`} className="inline-flex w-6 h-6 items-center justify-center rounded text-[#9CA3AF] hover:text-rose-600 align-middle"><Trash2 className="w-3.5 h-3.5" /></button>,
              },
            };
          })}
          totals={{ testId: 'receive-many-totals', cells: { title: <TotalsLabel />, amount: fmt2(total) } }}
        />
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
