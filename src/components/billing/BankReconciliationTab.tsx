import { ConfirmDialog } from '../ConfirmDialog';
import React, { useMemo, useRef, useState } from 'react';
import { Upload, Plus, Wand2, Printer, Save, Link2, Unlink, EyeOff, Eye, FilePlus2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { parseCsv } from '../admin/DataImportTab';
import { cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, Notice, rs } from './ui';
import { collectCashMovements, CashMovement } from '../../utils/finance';
import {
  StatementMapping,
  guessMapping,
  looksLikeHeader,
  mappingIsUsable,
  statementLinesFromRows,
  parseStatementDate,
  parseAmount,
  reconciliationSummary,
  manualCandidates,
  signedAmount,
  CONFIDENCE_LABEL,
  daysApart,
} from '../../utils/bankRec';
import { BankStatementLine, EXPENSE_CATEGORIES, ExpenseCategory } from '../../types';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { BankSelect } from './BankSelect';
import { MAIN_BANK_CODE, scopeToBank } from '../../utils/banks';

const signed = (n: number) => `${n < 0 ? '−' : '+'} ${rs(Math.abs(n))}`;
const moveLabel = (m: CashMovement) => `${formatDate(m.date)} • ${m.counterparty ? `${m.counterparty} — ` : ''}${m.description} • ${m.method}`;

interface PendingFile {
  name: string;
  rows: string[][];
  hasHeader: boolean;
  mapping: StatementMapping;
}

const FIELDS: { key: keyof StatementMapping; label: string; hint?: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount (+ in / − out)', hint: 'or use the two columns below' },
  { key: 'debit', label: 'Money out (debit)' },
  { key: 'credit', label: 'Money in (credit)' },
  { key: 'reference', label: 'Reference / cheque no.' },
];

/**
 * Money → Bank reconciliation. Bring in the bank statement, let the app pair each statement line with
 * the bank entries already in the books, add what is missing, then check the closing balance agrees.
 */
export const BankReconciliationTab: React.FC = () => {
  const {
    ledger, expenses, cashEntries, customers, suppliers, settings: allSettings, can, setPrintRequest, bankAccounts,
    bankStatementLines: allLines, bankReconciliations: allRecs,
    addBankStatementLines, deleteBankStatementLine, autoMatchBankLines, matchBankLine, unmatchBankLine, setBankLineIgnored, createEntryFromBankLine, saveBankReconciliation,
  } = useTrading();
  const canDelete = can('delete_records');
  /** Importing, matching and adding records changes the books: cash book permission (not operators). */
  const canEdit = can('finance:cashbook');
  const [confirmDel, setConfirmDel] = useState<{ title: string; message: string; label: string; action: () => void } | null>(null);
  const today = todayISO();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ date: today, description: '', amount: '', direction: 'out' as 'in' | 'out', reference: '' });
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [matchPick, setMatchPick] = useState('');
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createCat, setCreateCat] = useState<ExpenseCategory>('bank_charges');
  const [createDesc, setCreateDesc] = useState('');
  /** '' = expense / unassigned receipt; otherwise the customer (money in) or supplier (money out) id. */
  const [createParty, setCreateParty] = useState('');
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'matched' | 'ignored'>('all');

  // One bank account at a time: its statement lines, its reconciliations and its own book movements.
  const [bank, setBank] = useState(MAIN_BANK_CODE);
  const lines = useMemo(() => allLines.filter((l) => (l.bankCode || MAIN_BANK_CODE) === bank), [allLines, bank]);
  const recs = useMemo(() => allRecs.filter((r) => (r.bankCode || MAIN_BANK_CODE) === bank), [allRecs, bank]);
  const allMovements = useMemo(() => collectCashMovements(ledger, expenses, cashEntries, customers, suppliers), [ledger, expenses, cashEntries, customers, suppliers]);
  const { movements, settings } = useMemo(() => scopeToBank(allMovements, allSettings, bank), [allMovements, allSettings, bank]);
  const moveById = useMemo(() => new Map(movements.map((m) => [m.id, m])), [movements]);

  const latestLineDate = lines.reduce((mx, l) => (l.date > mx ? l.date : mx), '');
  const [dateInput, setDateInput] = useState('');
  const statementDate = dateInput || latestLineDate || today;
  const savedRec = recs.find((r) => r.statementDate === statementDate);
  const [closingInput, setClosingInput] = useState<Record<string, string>>({});
  const closingText = closingInput[statementDate] ?? (savedRec ? String(savedRec.closingBalance) : '');
  const closing = parseAmount(closingText);
  const allCleared = useMemo(() => Array.from(new Set(recs.flatMap((r) => r.clearedMovementIds))), [recs]);
  const summary = useMemo(
    () => reconciliationSummary({ movements, settings, lines, statementDate, closingBalance: closing ?? 0, clearedMovementIds: allCleared }),
    [movements, settings, lines, statementDate, closing, allCleared]
  );

  const counts = {
    all: lines.length,
    matched: lines.filter((l) => l.status === 'matched').length,
    unmatched: lines.filter((l) => l.status === 'unmatched').length,
    ignored: lines.filter((l) => l.status === 'ignored').length,
  };
  const shown = [...lines].filter((l) => filter === 'all' || l.status === filter).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // ---- Import -----------------------------------------------------------------------------
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNotice(null);
    const rows = parseCsv(await file.text());
    if (rows.length === 0) return setNotice({ kind: 'error', text: 'That file is empty.' });
    const hasHeader = looksLikeHeader(rows[0]);
    const width = Math.max(...rows.map((r) => r.length));
    const mapping = hasHeader ? guessMapping(rows[0]) : { date: 0, description: width > 1 ? 1 : -1, amount: width > 2 ? 2 : -1, debit: -1, credit: -1, reference: -1 };
    setPending({ name: file.name, rows, hasHeader, mapping });
  };
  const preview = useMemo(() => {
    if (!pending || !mappingIsUsable(pending.mapping)) return null;
    return statementLinesFromRows(pending.hasHeader ? pending.rows.slice(1) : pending.rows, pending.mapping);
  }, [pending]);
  const headerCells = pending ? (pending.hasHeader ? pending.rows[0] : pending.rows[0].map((_, i) => `Column ${i + 1}`)) : [];
  const doImport = () => {
    if (!preview || preview.lines.length === 0) return;
    const r = addBankStatementLines(preview.lines, bank);
    setPending(null);
    setDateInput('');
    setNotice({ kind: 'ok', text: `${r.added} line${r.added === 1 ? '' : 's'} added${r.duplicates ? ` (${r.duplicates} already there, skipped)` : ''}. ${r.matched} matched automatically.` });
  };

  const addManual = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseAmount(manual.amount);
    const date = parseStatementDate(manual.date);
    if (!date) return setNotice({ kind: 'error', text: 'Enter the date of the bank line.' });
    if (!amt || amt <= 0) return setNotice({ kind: 'error', text: 'Enter an amount more than zero.' });
    const r = addBankStatementLines([{ date, description: manual.description.trim() || 'Bank entry', amount: manual.direction === 'in' ? Math.abs(amt) : -Math.abs(amt), reference: manual.reference.trim() || undefined }], bank);
    setManual({ ...manual, description: '', amount: '', reference: '' });
    setNotice({ kind: 'ok', text: r.added ? (r.matched ? 'Line added and matched.' : 'Line added.') : 'That line is already there.' });
  };

  // ---- Clearing ---------------------------------------------------------------------------
  const persist = (clearedMovementIds: string[]) =>
    saveBankReconciliation({ statementDate, closingBalance: closing ?? savedRec?.closingBalance ?? 0, clearedMovementIds, bookBalance: summary.bookBalance, difference: summary.difference, reconciled: savedRec?.reconciled ?? false, bankCode: bank });
  const setCleared = (ids: string[], cleared: boolean) => {
    const mine = savedRec?.clearedMovementIds || [];
    if (cleared) persist(Array.from(new Set([...mine, ...ids])));
    else {
      recs.filter((r) => r.clearedMovementIds.some((id) => ids.includes(id))).forEach((r) =>
        saveBankReconciliation({ statementDate: r.statementDate, closingBalance: r.closingBalance, clearedMovementIds: r.clearedMovementIds.filter((id) => !ids.includes(id)), bookBalance: r.bookBalance, difference: r.difference, reconciled: r.reconciled, bankCode: r.bankCode })
      );
    }
  };
  const matchedIds = new Set(lines.filter((l) => l.status === 'matched').flatMap((l) => l.matchedMovementIds));
  const saveRec = () => {
    if (closing === null) return setNotice({ kind: 'error', text: 'Type the closing balance from your bank statement first.' });
    saveBankReconciliation({ statementDate, closingBalance: closing, clearedMovementIds: savedRec?.clearedMovementIds || [], bookBalance: summary.bookBalance, difference: summary.difference, reconciled: summary.reconciled, bankCode: bank });
    setNotice({ kind: 'ok', text: summary.reconciled ? `Saved. Bank reconciled to ${formatDate(statementDate)}.` : 'Saved. The difference still needs explaining.' });
  };

  // ---- Line actions -----------------------------------------------------------------------
  const startCreate = (l: BankStatementLine) => {
    setMatchingId(null);
    setCreatingId(l.id);
    // Bank charges unless the statement text clearly says otherwise.
    const d = l.description;
    setCreateCat(/salary|wage/i.test(d) ? 'salaries' : /\brent\b/i.test(d) ? 'rent' : /electric|sngpl|ptcl|utility|water bill|gas bill/i.test(d) ? 'utilities' : 'bank_charges');
    setCreateDesc(l.description);
    // Guess the customer / supplier from the statement text (e.g. "IBFT Zaman & Co").
    const text = l.description.toLowerCase();
    const who = (l.amount > 0 ? customers : suppliers).find((x: { name: string; company?: string }) => [x.name, x.company].some((n) => n && n.trim().length > 2 && text.includes(n.trim().toLowerCase())));
    setCreateParty(who ? (who as { id: string }).id : '');
  };
  const doCreate = (l: BankStatementLine) => {
    const r = createEntryFromBankLine(l.id, { category: createCat, description: createDesc, ...(createParty ? (l.amount > 0 ? { customerId: createParty } : { supplierId: createParty }) : {}) });
    setNotice({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) setCreatingId(null);
  };
  const startMatch = (l: BankStatementLine) => {
    setCreatingId(null);
    setMatchingId(l.id);
    setMatchPick(manualCandidates(l, lines, movements)[0]?.id || '');
  };
  const doMatch = (l: BankStatementLine) => {
    const r = matchBankLine(l.id, matchPick ? [matchPick] : []);
    setNotice({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) setMatchingId(null);
  };

  const outstanding = [...summary.outstandingDeposits, ...summary.outstandingPayments].sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <div className="space-y-4" data-testid="bank-rec">
      <div className={`${cardCls} p-4 sm:p-5 space-y-3`}>
        <div>
          <h2 className="font-bold text-[#111827] dark:text-white">Check your bank statement</h2>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Bring in the statement from your bank. Sarmaya pairs each line with the bank entries already in your books (same amount, within 3 days), so you only look at what doesn't match.</p>
        </div>
        {bankAccounts.length > 1 && <BankSelect id="rec-bank" className="max-w-sm" label="Bank account to reconcile" value={bank} onChange={(v) => { setBank(v); setDateInput(''); }} />}
        {!canEdit && <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">You can view the reconciliation. Importing statements and matching lines needs a manager or admin.</p>}
        {canEdit && <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" aria-label="Bank statement CSV file" data-testid="bank-csv-input" />
          <button type="button" onClick={() => fileRef.current?.click()} className={primaryBtn}><Upload className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Upload statement (CSV)</button>
          <button type="button" onClick={() => setShowManual((v) => !v)} className={secondaryBtn}><Plus className="w-4 h-4" /> Type a line</button>
          {counts.unmatched > 0 && (
            <button type="button" onClick={() => { const n = autoMatchBankLines(); setNotice({ kind: 'ok', text: n ? `${n} more line${n === 1 ? '' : 's'} matched.` : 'No new matches found.' }); }} className={secondaryBtn}><Wand2 className="w-4 h-4 text-indigo-600" /> Match again</button>
          )}
        </div>}
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

        {pending && (
          <div className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3 sm:p-4 space-y-3" data-testid="bank-mapping">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-sm text-[#111827] dark:text-white truncate">{pending.name}</div>
                <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Tell us which column is which. We guessed from the headings.</div>
              </div>
              <button type="button" onClick={() => setPending(null)} aria-label="Cancel import" className="p-2 rounded-xl text-[#6B7280] hover:bg-[#F4F3EF] dark:hover:bg-[#162436]"><X className="w-4 h-4" /></button>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#374151] dark:text-[#CBD5E1]">
              <input type="checkbox" checked={pending.hasHeader} onChange={(e) => setPending({ ...pending, hasHeader: e.target.checked })} className="w-5 h-5 shrink-0 accent-teal-600" /> First row is headings
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls} htmlFor={`map-${f.key}`}>{f.label}</label>
                  <select id={`map-${f.key}`} value={pending.mapping[f.key]} onChange={(e) => setPending({ ...pending, mapping: { ...pending.mapping, [f.key]: Number(e.target.value) } })} className={inputCls}>
                    <option value={-1}>— not in file —</option>
                    {headerCells.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!mappingIsUsable(pending.mapping) ? (
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Pick the Date column and either the Amount column or the Money out / Money in columns.</p>
            ) : preview && (
              <div className="space-y-2">
                <p className="text-xs text-[#374151] dark:text-[#CBD5E1]"><strong>{preview.lines.length}</strong> line{preview.lines.length === 1 ? '' : 's'} ready{preview.lines.length > 0 ? ` • money in ${rs(preview.lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0))} • money out ${rs(Math.abs(preview.lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0)))}` : ''}</p>
                {preview.errors.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{preview.errors.length} row{preview.errors.length === 1 ? '' : 's'} skipped: {preview.errors.slice(0, 3).join('; ')}{preview.errors.length > 3 ? '…' : ''}</p>}
                <button type="button" onClick={doImport} disabled={preview.lines.length === 0} className={primaryBtn}>Import {preview.lines.length} line{preview.lines.length === 1 ? '' : 's'}</button>
              </div>
            )}
          </div>
        )}

        {showManual && (
          <form onSubmit={addManual} className="grid grid-cols-2 sm:grid-cols-6 gap-2 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3">
            <div className="col-span-1 sm:col-span-1"><label className={labelCls} htmlFor="bl-date">Date</label><input id="bl-date" type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} className={inputCls} /></div>
            <div className="col-span-1 sm:col-span-1"><label className={labelCls} htmlFor="bl-dir">Money</label><select id="bl-dir" value={manual.direction} onChange={(e) => setManual({ ...manual, direction: e.target.value as 'in' | 'out' })} className={inputCls}><option value="in">In</option><option value="out">Out</option></select></div>
            <div className="col-span-2 sm:col-span-2"><label className={labelCls} htmlFor="bl-desc">Description</label><input id="bl-desc" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} className={inputCls} placeholder="as on the statement" /></div>
            <div className="col-span-1 sm:col-span-1"><label className={labelCls} htmlFor="bl-amt">Amount</label><input id="bl-amt" inputMode="decimal" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="0" /></div>
            <div className="col-span-1 sm:col-span-1 flex items-end"><button type="submit" className={`${primaryBtn} w-full px-3`}>Add line</button></div>
          </form>
        )}
      </div>

      {lines.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248] space-y-2">
            <h2 className="font-bold text-[#111827] dark:text-white">Statement lines</h2>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'unmatched', 'matched', 'ignored'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${filter === f ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent' : 'border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]'}`}>
                  {f === 'all' ? 'All' : f === 'unmatched' ? 'Not matched' : f === 'matched' ? 'Matched' : 'Ignored'} ({counts[f]})
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? <div className="px-5 py-6 text-sm text-[#8E9299]">Nothing here.</div> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {shown.map((l) => {
                const matched = l.matchedMovementIds.map((id) => moveById.get(id)).filter(Boolean) as CashMovement[];
                const lost = l.status === 'matched' && matched.length === 0;
                return (
                  <li key={l.id} className="px-4 sm:px-5 py-3 space-y-2" data-testid="bank-line">
                    <div className="flex items-start gap-2">
                      <span className="tabular-nums text-xs text-[#8E9299] w-[4.5rem] shrink-0 pt-0.5">{formatDate(l.date)}</span>
                      <span className="flex-1 min-w-0 text-sm text-[#374151] dark:text-[#CBD5E1] break-words">{l.description}{l.reference ? <span className="text-[11px] text-[#8E9299]"> • {l.reference}</span> : null}</span>
                      <span className={`tabular-nums font-bold text-sm whitespace-nowrap ${l.amount > 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>{signed(l.amount)}</span>
                    </div>
                    {l.status === 'matched' && (
                      <div className="flex flex-wrap items-center gap-2 text-xs pl-0 sm:pl-[4.75rem]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> Matched</span>
                        {l.matchConfidence && <span className="text-[#6B7280] dark:text-[#94A3B8]">{CONFIDENCE_LABEL[l.matchConfidence]}</span>}
                        {lost ? <span className="text-rose-700 dark:text-rose-300 font-semibold">The matched record was deleted.</span> : <span className="text-[#6B7280] dark:text-[#94A3B8] min-w-0 break-words">→ {matched.map(moveLabel).join('; ')}</span>}
                        {canEdit && <button type="button" onClick={() => unmatchBankLine(l.id)} className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl font-bold text-[#6B7280] hover:text-[#111827] dark:hover:text-white"><Unlink className="w-3.5 h-3.5" /> Unmatch</button>}
                      </div>
                    )}
                    {l.status === 'ignored' && (
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:pl-[4.75rem]">
                        <span className="px-2 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#162436] text-[#6B7280] font-bold">Ignored</span>
                        {canEdit && <button type="button" onClick={() => setBankLineIgnored(l.id, false)} className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl font-bold text-[#6B7280] hover:text-[#111827] dark:hover:text-white"><Eye className="w-3.5 h-3.5" /> Undo</button>}
                      </div>
                    )}
                    {l.status === 'unmatched' && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs sm:pl-[4.75rem]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold"><AlertTriangle className="w-3.5 h-3.5" /> Not in your books</span>
                        {canEdit && <button type="button" onClick={() => startCreate(l)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E5E5E1] dark:border-[#203248] font-bold text-teal-700 dark:text-teal-300"><FilePlus2 className="w-3.5 h-3.5" /> {l.amount < 0 ? 'Add as expense' : 'Add as money received'}</button>}
                        {canEdit && <button type="button" onClick={() => startMatch(l)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E5E5E1] dark:border-[#203248] font-bold text-[#374151] dark:text-[#CBD5E1]"><Link2 className="w-3.5 h-3.5" /> Match…</button>}
                        {canEdit && <button type="button" onClick={() => setBankLineIgnored(l.id, true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold text-[#6B7280]"><EyeOff className="w-3.5 h-3.5" /> Ignore</button>}
                        {canDelete && <button type="button" onClick={() => setConfirmDel({ title: 'Delete this statement line?', message: `${formatDate(l.date)} · ${l.description} · ${signed(l.amount)}`, label: 'Delete line', action: () => deleteBankStatementLine(l.id) })} aria-label={`Delete statement line ${l.description}`} className="px-3 py-2 text-[#9CA3AF] hover:text-rose-600">✕</button>}
                      </div>
                    )}
                    {creatingId === l.id && l.status === 'unmatched' && (
                      <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div><label className={labelCls} htmlFor={`party-${l.id}`}>{l.amount > 0 ? 'Received from' : 'Paid to'}</label>
                          <select id={`party-${l.id}`} value={createParty} onChange={(e) => setCreateParty(e.target.value)} className={inputCls}>
                            <option value="">{l.amount > 0 ? 'Someone else (accountant decides)' : 'An expense'}</option>
                            {(l.amount > 0 ? [...customers].sort((a, b) => a.name.localeCompare(b.name)) : [...suppliers].sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name))).map((x) => (
                              <option key={x.id} value={x.id}>{l.amount > 0 ? x.name : x.company || x.name}</option>
                            ))}
                          </select>
                        </div>
                        {l.amount < 0 && !createParty && (
                          <div><label className={labelCls} htmlFor={`cat-${l.id}`}>Expense type</label>
                            <select id={`cat-${l.id}`} value={createCat} onChange={(e) => setCreateCat(e.target.value as ExpenseCategory)} className={inputCls}>
                              {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                          </div>
                        )}
                        <div className={l.amount < 0 && !createParty ? '' : 'sm:col-span-2'}><label className={labelCls} htmlFor={`desc-${l.id}`}>Description</label><input id={`desc-${l.id}`} value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} className={inputCls} /></div>
                        <div className="flex items-end gap-2">
                          <button type="button" onClick={() => doCreate(l)} className={`${primaryBtn} flex-1 px-3`}>{createParty ? 'Record payment' : l.amount < 0 ? 'Add expense' : 'Add receipt'}</button>
                          <button type="button" onClick={() => setCreatingId(null)} className={`${secondaryBtn} px-3`}>Cancel</button>
                        </div>
                        <p className="sm:col-span-3 text-[11px] text-[#8E9299]">{l.amount < 0
                          ? createParty ? `Records ${rs(Math.abs(l.amount))} paid to this supplier from the bank on ${formatDate(l.date)}; what you owe them goes down.` : `Records ${rs(Math.abs(l.amount))} paid from the bank on ${formatDate(l.date)}.`
                          : createParty ? `Records ${rs(l.amount)} received from this customer by bank on ${formatDate(l.date)}; what they owe goes down.` : `Records ${rs(l.amount)} received into the bank on ${formatDate(l.date)}. Your accountant can later say where it came from.`}</p>
                      </div>
                    )}
                    {matchingId === l.id && l.status === 'unmatched' && (() => {
                      const options = manualCandidates(l, lines, movements);
                      const pick = options.find((m) => m.id === matchPick);
                      return (
                        <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3 space-y-2">
                          {options.length === 0 ? <p className="text-xs text-[#8E9299]">No bank {l.amount > 0 ? 'money in' : 'payments'} in your books to match. Add it as a new record instead.</p> : (
                            <>
                              <label className={labelCls} htmlFor={`match-${l.id}`}>Which entry in your books is this?</label>
                              <select id={`match-${l.id}`} value={matchPick} onChange={(e) => setMatchPick(e.target.value)} className={inputCls}>
                                {options.map((m) => <option key={m.id} value={m.id}>{rs(m.amount)} • {moveLabel(m)}</option>)}
                              </select>
                              {pick && Math.abs(signedAmount(pick) - l.amount) >= 0.005 && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Amounts differ by {rs(Math.abs(signedAmount(pick) - l.amount))}.</p>}
                              {pick && daysApart(pick.date, l.date) > 3 && <p className="text-[11px] text-[#8E9299]">{daysApart(pick.date, l.date)} days apart.</p>}
                            </>
                          )}
                          <div className="flex gap-2">
                            {options.length > 0 && <button type="button" onClick={() => doMatch(l)} className={`${primaryBtn} px-4 py-2`}>Match</button>}
                            <button type="button" onClick={() => setMatchingId(null)} className={`${secondaryBtn} px-3 py-2`}>Cancel</button>
                          </div>
                        </div>
                      );
                    })()}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className={`${cardCls} p-4 sm:p-5 space-y-4`} data-testid="bank-summary">
        <div>
          <h2 className="font-bold text-[#111827] dark:text-white">Does the bank balance agree?</h2>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Type the closing balance printed on your statement.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label className={labelCls} htmlFor="rec-date">Statement end date</label><input id="rec-date" type="date" value={statementDate} onChange={(e) => setDateInput(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="rec-closing">Closing balance on statement</label><input id="rec-closing" inputMode="decimal" value={closingText} onChange={(e) => setClosingInput({ ...closingInput, [statementDate]: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="e.g. 139750" /></div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={saveRec} className={`${secondaryBtn} flex-1`}><Save className="w-4 h-4" /> Save</button>
            <button type="button" onClick={() => setPrintRequest({ type: 'bank_reconciliation', statementDate, closingBalance: closing ?? 0, ...(bank !== MAIN_BANK_CODE ? { bankCode: bank } : {}) })} className={`${secondaryBtn} flex-1`}><Printer className="w-4 h-4" /> Print</button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] text-sm">
          <Row label={`Bank balance in your books on ${formatDate(statementDate)}`} value={rs(summary.bookBalance)} strong />
          <Row label={`Less: money in your books not yet in the bank (${summary.outstandingDeposits.length})`} value={`− ${rs(summary.outstandingDepositsTotal)}`} />
          <Row label={`Add: payments in your books not yet out of the bank, e.g. uncleared cheques (${summary.outstandingPayments.length})`} value={`+ ${rs(summary.outstandingPaymentsTotal)}`} />
          <Row label={`Bank lines not in your books yet (${summary.unrecorded.length})`} value={signed(summary.unrecordedTotal)} />
          <Row label="So the statement should show" value={rs(summary.expectedStatementBalance)} strong />
          <Row label="Statement shows" value={closing === null ? '—' : rs(closing)} strong />
        </div>
        {closing !== null && (
          summary.reconciled ? (
            <div role="status" data-testid="rec-status" className="rounded-2xl px-4 py-3 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-teal-800 dark:text-teal-300 font-bold flex flex-wrap items-center gap-x-2 gap-y-1"><CheckCircle2 className="w-5 h-5" /> <span className="whitespace-nowrap">Reconciled ✓</span> <span className="font-normal text-sm">Your books agree with the bank.{summary.unrecorded.length ? ` Add the ${summary.unrecorded.length} missing line${summary.unrecorded.length === 1 ? '' : 's'} to your books.` : ''}</span></div>
          ) : (
            <div role="status" data-testid="rec-status" className="rounded-2xl px-4 py-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-sm"><strong>Off by {rs(Math.abs(summary.difference))}.</strong> {summary.difference > 0 ? 'The bank shows more than expected' : 'The bank shows less than expected'} — look for a missing line, a wrong amount, or tick items below that already cleared.</div>
          )
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">In your books, not on the statement yet ({outstanding.length})</h3>
            {outstanding.length > 0 && <button type="button" onClick={() => setCleared(outstanding.map((m) => m.id), true)} className="text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline">Tick all as cleared</button>}
          </div>
          {outstanding.length === 0 ? <p className="text-sm text-[#8E9299]">Nothing outstanding — every bank entry up to this date is on the statement.</p> : (
            <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
              <table className="w-full text-sm">
                <thead><tr className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] text-left"><th className="px-3 py-2">Cleared</th><th className="px-3 py-2 hidden sm:table-cell">Date</th><th className="px-3 py-2">Entry</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                  {outstanding.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2"><input type="checkbox" checked={false} onChange={() => setCleared([m.id], true)} aria-label={`Mark ${m.description} as cleared`} className="w-5 h-5 shrink-0 accent-teal-600" /></td>
                      <td className="px-3 py-2 tabular-nums text-xs whitespace-nowrap hidden sm:table-cell">{formatDate(m.date)}</td>
                      <td className="px-3 py-2 min-w-[8rem]"><span className="sm:hidden block tabular-nums text-[11px] text-[#8E9299]">{formatDate(m.date)}</span>{m.counterparty ? `${m.counterparty} — ` : ''}{m.description} <span className="text-[11px] text-[#8E9299]">• {m.method}</span></td>
                      <td className={`px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap ${m.direction === 'in' ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>{m.direction === 'in' ? '+' : '−'} {rs(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {allCleared.filter((id) => !matchedIds.has(id) && moveById.has(id) && moveById.get(id)!.date <= statementDate).length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-bold text-[#6B7280] dark:text-[#94A3B8]">Ticked as cleared by hand ({allCleared.filter((id) => !matchedIds.has(id) && moveById.has(id) && moveById.get(id)!.date <= statementDate).length})</summary>
              <ul className="mt-1 space-y-1">
                {allCleared.filter((id) => !matchedIds.has(id) && moveById.has(id) && moveById.get(id)!.date <= statementDate).map((id) => {
                  const m = moveById.get(id)!;
                  return (
                    <li key={id} className="flex items-center gap-2"><span className="flex-1 min-w-0 break-words">{moveLabel(m)} ({rs(m.amount)})</span><button type="button" onClick={() => setCleared([id], false)} className="font-bold text-[#6B7280] hover:text-[#111827] dark:hover:text-white shrink-0">Untick</button></li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={Boolean(confirmDel)}
        title={confirmDel?.title || ''}
        message={confirmDel?.message || ''}
        confirmLabel={confirmDel?.label}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => { confirmDel?.action(); setConfirmDel(null); }}
      />
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`flex items-start justify-between gap-3 px-3 sm:px-4 py-2 ${strong ? 'font-bold text-[#111827] dark:text-white' : 'text-[#374151] dark:text-[#CBD5E1]'}`}>
    <span className="min-w-0">{label}</span>
    <span className="tabular-nums whitespace-nowrap">{value}</span>
  </div>
);
