import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Notice, inputCls, labelCls, primaryBtn, secondaryBtn, rs } from '../billing/ui';
import { Account, validateEntry } from '../../utils/accounting';
import { todayISO } from '../../utils/stockFlow';

interface DraftLine {
  accountCode: string;
  debit: string;
  credit: string;
}

const emptyLine = (): DraftLine => ({ accountCode: '', debit: '', credit: '' });
const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Manual journal entry: any number of lines, saves only when debits equal credits. */
export const JournalEntryModal: React.FC<{ isOpen: boolean; onClose: () => void; accounts: Account[]; onSaved?: (message: string) => void }> = ({ isOpen, onClose, accounts, onSaved }) => {
  const { addManualJournal, settings } = useTrading();
  const [date, setDate] = useState(todayISO());
  const [ref, setRef] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState('');

  const parsed = useMemo(() => lines.map((l) => ({ accountCode: l.accountCode, debit: num(l.debit), credit: num(l.credit) })), [lines]);
  const totalDebit = Math.round(parsed.reduce((a, l) => a + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(parsed.reduce((a, l) => a + l.credit, 0) * 100) / 100;
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
  const check = validateEntry({ date, lines: parsed.filter((l) => l.accountCode || l.debit || l.credit) }, accounts);
  const locked = Boolean(settings.booksLockedUntil && date <= settings.booksLockedUntil);
  const canSave = check.ok && memo.trim().length > 0 && !locked;

  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const busy = useRef(false);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return; // a double tap must not post the entry twice
    if (date > todayISO()) return setError('The date cannot be in the future.');
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 800);
    const r = addManualJournal({ date, ref, memo, lines: parsed });
    if (!r.success) {
      setError(r.message);
      return;
    }
    onSaved?.(r.message);
    onClose();
  };

  const groups: { label: string; type: Account['type'] }[] = [
    { label: 'Assets', type: 'asset' },
    { label: 'Liabilities', type: 'liability' },
    { label: 'Equity', type: 'equity' },
    { label: 'Income', type: 'income' },
    { label: 'Expenses', type: 'expense' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New journal entry"
      subtitle="Each line goes to one account. Total debits must equal total credits."
      wide
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-mono" aria-live="polite">
            <span className="mr-3">Debit <b data-testid="je-total-debit">{rs(totalDebit)}</b></span>
            <span className="mr-3">Credit <b data-testid="je-total-credit">{rs(totalCredit)}</b></span>
            {difference === 0 && totalDebit > 0 ? (
              <span className="text-teal-700 dark:text-teal-300 font-bold">Balanced ✓</span>
            ) : (
              <span className="text-rose-700 dark:text-rose-300 font-bold">Out by {rs(Math.abs(difference))}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
            <button type="submit" form="journal-form" disabled={!canSave} className={primaryBtn}>Save entry</button>
          </div>
        </div>
      }
    >
      <form id="journal-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls} htmlFor="je-date">Date</label>
            <input id="je-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className={labelCls} htmlFor="je-ref">Reference (optional)</label>
            <input id="je-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="JV-1" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="je-memo">Narration</label>
            <input id="je-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this entry for?" className={inputCls} required />
          </div>
        </div>
        {locked && <Notice kind="error">The books are locked up to {settings.booksLockedUntil}. Pick a later date.</Notice>}

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end rounded-2xl sm:rounded-none border sm:border-0 border-[#E5E5E1] dark:border-[#203248] p-2 sm:p-0">
              <div className="col-span-12 sm:col-span-6">
                {i === 0 && <span className={`${labelCls} hidden sm:block`}>Account</span>}
                <select aria-label={`Account ${i + 1}`} value={l.accountCode} onChange={(e) => setLine(i, { accountCode: e.target.value })} className={inputCls}>
                  <option value="">Pick an account…</option>
                  {groups.map((g) => (
                    <optgroup key={g.type} label={g.label}>
                      {accounts.filter((a) => a.type === g.type).map((a) => (
                        <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="col-span-5 sm:col-span-2">
                {i === 0 && <span className={`${labelCls} hidden sm:block`}>Debit</span>}
                <input aria-label={`Debit ${i + 1}`} type="number" min="0" step="any" inputMode="decimal" placeholder="Debit" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} className={`${inputCls} font-mono`} />
              </div>
              <div className="col-span-5 sm:col-span-3">
                {i === 0 && <span className={`${labelCls} hidden sm:block`}>Credit</span>}
                <input aria-label={`Credit ${i + 1}`} type="number" min="0" step="any" inputMode="decimal" placeholder="Credit" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} className={`${inputCls} font-mono`} />
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                <button type="button" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} className="p-2.5 rounded-xl text-[#9CA3AF] hover:text-rose-600 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className={secondaryBtn}><Plus className="w-4 h-4" /> Add line</button>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
      </form>
    </Modal>
  );
};
