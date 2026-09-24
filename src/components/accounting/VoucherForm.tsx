import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Save, Search, Trash2, X, Plus, Check } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Notice, inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn, rs } from '../billing/ui';
import { Account, JournalEntry, AccountBalance } from '../../utils/accounting';
import { AccountOption, VoucherType, accountOptions, moneySideAmount, moneySideCode, searchAccounts, voucherInputOf, voucherTypeInfo } from '../../utils/vouchers';
import {
  EMPTY_ENTRY, EntryRow, GridLine, VOUCHER_TITLES, balanceText, commitEntry, entryOf, entryTouched, findVoucherByNumber, gridOf, gridTotals, mainSide, optionByCode, removeLine, voucherInputFromGrid,
} from '../../utils/voucherEntry';
import { BankSelect } from '../billing/BankSelect';
import { ConfirmDialog } from '../ConfirmDialog';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { MAIN_BANK_CODE } from '../../utils/banks';
import { isPendingApproval } from '../../context/controlActions';
import { LedgerGrid, LedgerColumn, TotalsLabel, fmt2, fmt2OrBlank, ledgerInputCls, ledgerNumCls } from '../billing/classic/LedgerGrid';

const roCls = `${inputCls} tabular-nums !bg-[#F4F3EF] dark:!bg-[#0D1520]`;
const cellBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-md border border-[#D9D8D2] dark:border-[#2A3E57] bg-white dark:bg-[#0B131D] text-[#374151] dark:text-[#CBD5E1] hover:text-teal-700 dark:hover:text-teal-300';
/** Code | Title | Debit | Credit | Narration, as the old voucher screen. */
const VCH_COLS: LedgerColumn[] = [
  { key: 'code', label: 'Code', width: '6.25rem' },
  { key: 'title', label: 'Title', width: 'minmax(9rem,2fr)' },
  { key: 'debit', label: 'Debit', width: '7.75rem', numeric: true },
  { key: 'credit', label: 'Credit', width: '7.75rem', numeric: true },
  { key: 'narration', label: 'Narration', width: 'minmax(8rem,1.6fr)' },
  { key: 'act', label: <span className="sr-only">Line</span>, width: '4.75rem', align: 'center' },
];

/**
 * The voucher screen, step for step as Apna Accountant SB: "Cash Payment -- [Debit Voucher]" (CPV),
 * "Cash Receipt -- [Credit Voucher]" (CRV), the bank ones (BPV / BRV) and the journal voucher (JV).
 *
 *   Date · Voucher # (automatic) · A/C Balance
 *   entry row: Code → Title → Debit / Credit → Narration (Enter moves on; Enter on Narration puts the line in the grid)
 *   grid: Code | Title | Debit | Credit | Narration (click a line to change it, Delete to remove it)
 *   Print Voucher ☐ · Totals · Save · Delete · Search · Cancel
 *
 * F1 / F2 in Code, or typing a name in Title, opens "Search Code (By Title)". The cash (or bank) side is
 * added by itself. Save keeps the screen open on a new blank voucher, as the old program did.
 */
export const VoucherModal: React.FC<{
  type: VoucherType;
  editId?: string;
  accounts: Account[];
  balances?: Map<string, AccountBalance>;
  onClose: () => void;
  onSaved: (message: string, id?: string) => void;
}> = ({ type, editId, accounts, balances, onClose, onSaved }) => {
  const { vouchers, customers, suppliers, addVoucher, updateVoucher, deleteVoucher, voucherEditBlock, previewVoucherNumber, setPrintRequest, bankAccounts, can } = useTrading();
  const info = voucherTypeInfo(type);
  const main = mainSide(type);
  const other: 'debit' | 'credit' = main === 'debit' ? 'credit' : 'debit';

  // The voucher on the screen: a new one (loadedId null) or a saved one opened by Search / Edit.
  const [loadedId, setLoadedId] = useState<string | null>(editId || null);
  const loaded = loadedId ? vouchers.find((v) => v.id === loadedId) || null : null;
  const startOf = (v: JournalEntry | null) => (v ? voucherInputOf(v) : null);
  const [date, setDate] = useState(() => startOf(loaded)?.date || todayISO());
  const [bank, setBank] = useState(() => startOf(loaded)?.bankCode || MAIN_BANK_CODE);
  const [lines, setLines] = useState<GridLine[]>(() => { const s = startOf(loaded); return s ? gridOf(s) : []; });
  const [entry, setEntry] = useState<EntryRow>(EMPTY_ENTRY);
  const [codeText, setCodeText] = useState('');
  const [titleText, setTitleText] = useState('');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [printOn, setPrintOn] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [picker, setPicker] = useState<{ q: string; then: 'amount' | 'title' } | null>(null);
  const [finding, setFinding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const busy = useRef(false);

  const codeRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const debitRef = useRef<HTMLInputElement>(null);
  const creditRef = useRef<HTMLInputElement>(null);
  const narrRef = useRef<HTMLInputElement>(null);
  const amountRef = (side: 'debit' | 'credit') => (side === 'debit' ? debitRef : creditRef);
  // One pending "put the cursor there" at a time: the latest wish wins (a click on a line beats a load's Code).
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (fn: () => void, ms = 60) => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => { focusTimer.current = null; fn(); }, ms);
  };
  useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); }, []);

  const side = moneySideCode(type, bank);
  const options = useMemo(() => accountOptions(accounts, customers, suppliers, { forVoucher: true }).filter((o) => o.ref !== side), [accounts, customers, suppliers, side]);
  const byRef = useMemo(() => new Map(options.map((o) => [o.ref, o])), [options]);
  const picked = entry.account ? byRef.get(entry.account) : undefined;
  const block = loaded ? voucherEditBlock(loaded.id) : null;
  const readOnly = Boolean(block);
  const number = loaded ? loaded.ref : previewVoucherNumber(type, date);

  /** Debit-positive balance of an account: parties from their own balance, the rest from the books. */
  const balanceOf = (ref: string): number | undefined => {
    const o = byRef.get(ref);
    if (o?.balance != null) return o.balance;
    const code = o?.code || ref;
    return balances?.get(code)?.net;
  };
  const acBalance = picked ? balanceOf(picked.ref) : side ? balances?.get(side)?.net : undefined;
  const acName = picked ? picked.name : side ? (side === '1000' ? 'Cash in hand' : bankAccounts.find((b) => b.code === side)?.name || 'Bank') : '';

  const totals = gridTotals(lines);
  const sideAmt = moneySideAmount(type, lines);
  const sideName = side ? (side === '1000' ? 'Cash in hand' : bankAccounts.find((b) => b.code === side)?.name || 'Bank') : '';
  const nameOfRef = (ref: string) => byRef.get(ref)?.name || (ref.startsWith('cust:') || ref.startsWith('supp:') ? 'Deleted party' : accounts.find((a) => a.code === ref)?.name || ref);
  const codeOfRef = (ref: string) => byRef.get(ref)?.code || (ref.includes(':') ? '' : ref);

  const setAccount = (o: AccountOption | undefined) => {
    setEntry((e) => ({ ...e, account: o?.ref || '' }));
    setCodeText(o?.code || '');
    setTitleText(o?.name || '');
  };
  const clearEntry = () => {
    setEntry(EMPTY_ENTRY);
    setCodeText('');
    setTitleText('');
    setEditIndex(null);
  };
  const focusCode = () => later(() => codeRef.current?.focus());

  /** A new blank voucher (after Save, Delete, or Cancel with something on the screen). */
  const blank = () => {
    setLoadedId(null);
    setLines([]);
    clearEntry();
    setError('');
    setDate(todayISO());
    focusCode();
  };
  const load = (v: JournalEntry) => {
    const s = voucherInputOf(v);
    setLoadedId(v.id);
    setDate(s.date);
    setBank(s.bankCode || MAIN_BANK_CODE);
    setLines(gridOf(s));
    clearEntry();
    setError('');
    setNotice('');
    focusCode();
  };

  // The old screen starts on Code.
  useEffect(() => {
    const t = setTimeout(() => {
      // Unless the user is already typing in the voucher (the bank list may have taken the first focus).
      const a = document.activeElement as HTMLElement | null;
      if (!a || a.tagName === 'SELECT' || !a.closest('[data-testid="voucher-form"]')) codeRef.current?.focus();
    }, 90);
    return () => clearTimeout(t);
  }, []);

  // A different voucher asked for from outside (the list's Edit button) while open.
  useEffect(() => {
    if (editId && editId !== loadedId) {
      const v = vouchers.find((x) => x.id === editId);
      if (v) load(v);
    }
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- entry row keyboard: Code → Title → Debit / Credit → Narration → (into the grid) → Code ----
  const openPicker = (q: string, then: 'amount' | 'title' = 'amount') => setPicker({ q, then });
  const onCodeKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'F1' || e.key === 'F2') {
      e.preventDefault();
      openPicker(/^\d+$/.test(codeText.trim()) ? '' : codeText.trim());
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const typed = codeText.trim();
    if (!typed) {
      if (entry.account) titleRef.current?.focus();
      else openPicker('');
      return;
    }
    const o = optionByCode(options, typed);
    if (o) {
      setAccount(o);
      setError('');
      titleRef.current?.focus();
    } else {
      setError(`No account has the code ${typed}. Pick it from the list.`);
      openPicker(/^\d+$/.test(typed) ? '' : typed);
    }
  };
  const onCodeBlur = () => {
    const typed = codeText.trim();
    if (!typed) return;
    const o = optionByCode(options, typed);
    if (o && o.ref !== entry.account) setAccount(o);
  };
  const onTitleChange = (v: string) => {
    // Typing a name opens "Search Code (By Title)" with what was typed.
    const name = picked?.name || '';
    const q = name && v.startsWith(name) ? v.slice(name.length) : v;
    setTitleText(v);
    if (q.trim()) openPicker(q.trimStart());
  };
  const onTitleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'F1' || e.key === 'F2') {
      e.preventDefault();
      openPicker('');
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (entry.account) amountRef(main).current?.focus();
    else openPicker(titleText.trim());
  };
  const onAmountKey = (which: 'debit' | 'credit') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const has = (s: string) => (parseFloat(s) || 0) > 0;
    if (which === main && !has(entry[main])) amountRef(other).current?.focus();
    else narrRef.current?.focus();
  };
  const commit = (): boolean => {
    const r = commitEntry(lines, entry, editIndex);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    setLines(r.lines);
    clearEntry();
    setError('');
    setNotice('');
    return true;
  };
  const onNarrKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (readOnly) return;
    if (commit()) codeRef.current?.focus();
  };

  // ---- grid ----
  const editLine = (i: number) => {
    if (readOnly) return;
    const l = lines[i];
    const o = byRef.get(l.account);
    setEntry(entryOf(l));
    setCodeText(o?.code || codeOfRef(l.account));
    setTitleText(o?.name || nameOfRef(l.account));
    setEditIndex(i);
    setError('');
    later(() => amountRef(l.debit > 0 ? 'debit' : 'credit').current?.focus(), 0);
  };
  const dropLine = (i: number) => {
    if (readOnly) return;
    setLines((prev) => removeLine(prev, i));
    if (editIndex === i) clearEntry();
    else if (editIndex != null && editIndex > i) setEditIndex(editIndex - 1);
  };

  // ---- buttons ----
  const save = () => {
    if (busy.current || readOnly) return;
    setNotice('');
    let rows = lines;
    // A line still in the entry row goes in first (as if Enter was pressed on its Narration).
    if (entryTouched(entry)) {
      const r = commitEntry(lines, entry, editIndex);
      if (!r.ok) return setError(r.error);
      rows = r.lines;
      setLines(rows);
      clearEntry();
    }
    if (rows.length === 0) return setError('Add at least one line: type the account code and press Enter.');
    const input = voucherInputFromGrid(type, date, rows, bank);
    busy.current = true;
    const r = loaded ? updateVoucher(loaded.id, input) : addVoucher(input);
    busy.current = false;
    if (!r.success) return setError(r.message);
    setError('');
    const id = (r as { voucher?: JournalEntry }).voucher?.id;
    if (!isPendingApproval(r) && printOn && id) setPrintRequest({ type: 'vouchers_print', ids: [id] });
    onSaved(r.message, id);
    blank();
    setNotice(r.message);
  };
  const cancel = () => {
    if (loaded || lines.length || entryTouched(entry)) {
      blank();
      setNotice('');
    } else onClose();
  };
  const del = () => {
    if (!loaded) return;
    const r = deleteVoucher(loaded.id);
    setConfirmDel(false);
    if (!r.success) return setError(r.message);
    onSaved(r.message);
    blank();
    setNotice(r.message);
  };

  const canDelete = Boolean(loaded) && can('delete_records');
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#374151] dark:text-[#CBD5E1] min-h-11 sm:min-h-0">
          <input type="checkbox" checked={printOn} onChange={(e) => setPrintOn(e.target.checked)} className="w-4 h-4 accent-teal-700" /> Print Voucher
        </label>
      </div>
      <div className="grid grid-cols-2 sm:flex gap-2 max-sm:w-full">
        <button type="button" onClick={save} disabled={readOnly} className={`${primaryBtn} max-sm:col-span-2`}><Save className="w-4 h-4" /> Save</button>
        <button type="button" onClick={() => setConfirmDel(true)} disabled={!canDelete || readOnly} className={dangerBtn}><Trash2 className="w-4 h-4" /> Delete</button>
        <button type="button" onClick={() => setFinding(true)} className={secondaryBtn}><Search className="w-4 h-4" /> Search</button>
        <button type="button" onClick={cancel} className={`${secondaryBtn} max-sm:col-span-2`}><X className="w-4 h-4" /> Cancel</button>
      </div>
    </div>
  );

  const amountCls = (which: 'debit' | 'credit') => `${ledgerNumCls} ${which === main ? '' : 'opacity-80'}`;
  return (
    <Modal isOpen onClose={onClose} title={VOUCHER_TITLES[type]} subtitle={loaded ? `Voucher ${loaded.ref}${readOnly ? ' (view only)' : ' — change it and Save'}` : info.money ? `The ${info.money === 'cash' ? 'cash' : 'bank'} side is added by itself. Code, Enter, amount, Enter, narration, Enter.` : 'Debits must equal credits. Code, Enter, amount, Enter, narration, Enter.'} wide="xl" footer={footer}>
      <div className="space-y-4" data-testid="voucher-form" data-voucher-type={type}>
        {error && <Notice kind="error">{error}</Notice>}
        {!error && notice && <Notice kind="ok">{notice}</Notice>}
        {block && <Notice kind="error">This voucher can't be changed: {block}</Notice>}

        {/* Header: Date · Voucher # · (bank) · A/C Balance */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="min-w-0">
            <label className={labelCls} htmlFor="vch-date">Date</label>
            <input id="vch-date" type="date" data-skip-autofocus value={date} max={todayISO()} disabled={readOnly} onChange={(e) => setDate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); codeRef.current?.focus(); } }} className={inputCls} />
          </div>
          <div className="min-w-0">
            <label className={labelCls} htmlFor="vch-number">Voucher #</label>
            <input id="vch-number" readOnly data-skip-autofocus tabIndex={-1} value={number} className={roCls} title="Given automatically" data-testid="voucher-number" />
          </div>
          {info.money === 'bank' && (
            <div className="min-w-0 max-sm:col-span-2">
              {bankAccounts.length > 1 ? <BankSelect id="vch-bank" label="Bank account" value={bank} onChange={setBank} /> : <><span className={labelCls}>Bank account</span><div className={roCls}>{bankAccounts[0]?.name}</div></>}
            </div>
          )}
          <div className={`min-w-0 ${info.money === 'bank' ? 'max-sm:col-span-2' : 'col-span-2'}`}>
            <label className={labelCls} htmlFor="vch-balance">A/C Balance</label>
            <input id="vch-balance" readOnly data-skip-autofocus tabIndex={-1} value={acBalance == null ? '' : `${balanceText(acBalance)}${acName ? ` — ${acName}` : ''}`} className={roCls} data-testid="voucher-ac-balance" />
          </div>
        </div>

        {/* Entry row + grid: one ruled sheet, Code | Title | Debit | Credit | Narration */}
        <LedgerGrid
          ariaLabel="Voucher lines"
          testId="voucher-grid"
          columns={VCH_COLS}
          minWidth={680}
          minRows={15}
          empty="No lines yet. Type a code in the entry row and press Enter."
          entry={readOnly ? undefined : {
            editing: editIndex != null,
            cells: {
              code: <input id="vch-code" ref={codeRef} aria-label="Code" value={codeText} autoComplete="off" inputMode="text" onChange={(e) => setCodeText(e.target.value)} onKeyDown={onCodeKey} onBlur={onCodeBlur} className={`${ledgerInputCls} tabular-nums`} placeholder="F1" title="Type the account code and press Enter. F1 / F2: search by title." />,
              title: (
                <div className="flex gap-1">
                  <input id="vch-title" ref={titleRef} aria-label="Title" value={titleText} autoComplete="off" onChange={(e) => onTitleChange(e.target.value)} onKeyDown={onTitleKey} className={`${ledgerInputCls} flex-1`} placeholder="Type a name to search" />
                  <button type="button" onClick={() => openPicker('')} className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-md border border-[#D9D8D2] dark:border-[#2A3E57] text-[#6B7280] hover:text-teal-700" aria-label="Search Code (By Title)" title="Search Code (By Title) — F1"><Search className="w-4 h-4" /></button>
                </div>
              ),
              debit: <input id="vch-debit" ref={debitRef} aria-label="Debit" type="number" inputMode="decimal" min="0" step="any" value={entry.debit} onChange={(e) => setEntry((x) => ({ ...x, debit: e.target.value, ...(e.target.value ? { credit: '' } : {}) }))} onKeyDown={onAmountKey('debit')} className={amountCls('debit')} />,
              credit: <input id="vch-credit" ref={creditRef} aria-label="Credit" type="number" inputMode="decimal" min="0" step="any" value={entry.credit} onChange={(e) => setEntry((x) => ({ ...x, credit: e.target.value, ...(e.target.value ? { debit: '' } : {}) }))} onKeyDown={onAmountKey('credit')} className={amountCls('credit')} />,
              narration: <input id="vch-narration" ref={narrRef} aria-label="Narration" value={entry.narration} autoComplete="off" onChange={(e) => setEntry((x) => ({ ...x, narration: e.target.value }))} onKeyDown={onNarrKey} className={ledgerInputCls} placeholder={type === 'CRV' || type === 'BRV' ? 'e.g. Bill 1203' : 'e.g. BAHL- Rahmat Ali Peshawar'} />,
              act: (
                <div className="flex gap-1 justify-center">
                  <button type="button" onClick={() => { if (commit()) focusCode(); }} className={cellBtn} aria-label={editIndex != null ? 'Update line' : 'Add line'} title={editIndex != null ? 'Update line (Enter on Narration)' : 'Add line (Enter on Narration)'}>
                    {editIndex != null ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </button>
                  {editIndex != null && <button type="button" onClick={() => { clearEntry(); focusCode(); }} className={cellBtn} aria-label="Stop changing line"><X className="w-4 h-4" /></button>}
                </div>
              ),
            },
          }}
          rows={lines.map((l, i) => ({
            key: i,
            testId: 'voucher-line',
            label: `Line ${i + 1}: ${nameOfRef(l.account)}`,
            selected: editIndex === i,
            inert: readOnly,
            onActivate: readOnly ? undefined : () => editLine(i),
            onDelete: readOnly ? undefined : () => { dropLine(i); focusCode(); },
            cells: {
              code: <span className="text-[#6B7280] dark:text-[#94A3B8]">{codeOfRef(l.account)}</span>,
              title: <span className="font-semibold">{nameOfRef(l.account)}</span>,
              debit: fmt2OrBlank(l.debit),
              credit: fmt2OrBlank(l.credit),
              narration: <span className="text-[#374151] dark:text-[#CBD5E1]">{l.narration}</span>,
              act: readOnly ? null : <button type="button" onClick={(e) => { e.stopPropagation(); dropLine(i); }} aria-label={`Remove line ${i + 1}`} className="inline-flex w-6 h-6 items-center justify-center rounded text-[#9CA3AF] hover:text-rose-600 align-middle"><X className="w-3.5 h-3.5" /></button>,
            },
          }))}
          totals={{
            testId: 'voucher-totals',
            cells: {
              title: <TotalsLabel />,
              debit: <span data-testid="voucher-total-debit">{fmt2(totals.debit)}</span>,
              credit: <span data-testid="voucher-total-credit">{fmt2(totals.credit)}</span>,
              narration: !info.money && Math.abs(totals.debit - totals.credit) >= 0.005 ? <span className="text-xs font-bold text-rose-700 dark:text-rose-300">Difference {rs(Math.abs(totals.debit - totals.credit))}</span> : null,
            },
          }}
        />
        {side && (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] px-3.5 py-2.5 text-sm" data-testid="voucher-money-side">
            <span className="min-w-0 truncate"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{side}</span>{sideName} <span className="text-[11px] text-[#6B7280]">(added by itself)</span></span>
            <span className="tabular-nums font-bold whitespace-nowrap">{info.side === 'pay' ? 'Cr' : 'Dr'} {rs(Math.max(0, sideAmt))}</span>
          </div>
        )}
      </div>

      {picker && (
        <TitleSearch
          options={options}
          initial={picker.q}
          balanceOf={balanceOf}
          onClose={() => { setPicker(null); later(() => (entry.account ? amountRef(main) : codeRef).current?.focus()); }}
          onPick={(ref) => {
            setAccount(byRef.get(ref));
            setError('');
            setPicker(null);
            later(() => amountRef(main).current?.focus());
          }}
        />
      )}
      {finding && <VoucherSearch type={type} vouchers={vouchers} onClose={() => setFinding(false)} onPick={(v) => { setFinding(false); load(v); }} />}
      <ConfirmDialog
        isOpen={confirmDel}
        title={`Delete voucher ${loaded?.ref || ''}?`}
        message={`${loaded?.memo || ''} — every line comes off the books (party balances, cash book, expenses). A copy is kept in Admin → Deleted records.`}
        confirmLabel="Delete voucher"
        onCancel={() => setConfirmDel(false)}
        onConfirm={del}
      />
    </Modal>
  );
};

/** "Search Code (By Title)": type to filter, arrows to move, Enter or a double-click to pick. */
export const TitleSearch: React.FC<{ options: AccountOption[]; initial?: string; balanceOf?: (ref: string) => number | undefined; onPick: (ref: string) => void; onClose: () => void }> = ({ options, initial = '', balanceOf, onPick, onClose }) => {
  const [q, setQ] = useState(initial);
  const [at, setAt] = useState(0);
  const hits = useMemo(() => searchAccounts(options, q, 300), [options, q]);
  const listRef = useRef<HTMLTableSectionElement>(null);
  useEffect(() => setAt(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${at}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [at]);
  const inputRef = useRef<HTMLInputElement>(null);
  // More typed in Title while this opens: carry it over.
  useEffect(() => setQ(initial), [initial]);
  useLayoutEffect(() => {
    // Straight into the search box, the cursor after what was already typed in Title.
    const el = inputRef.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, []);
  const footer = (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
      <button type="button" disabled={!hits[at]} onClick={() => hits[at] && onPick(hits[at].ref)} className={primaryBtn}>Select</button>
    </div>
  );
  return (
    <Modal isOpen onClose={onClose} title="Search Code (By Title)" subtitle="Type part of the name (or code, city). ↑ ↓ to move, Enter or double-click to pick." footer={footer}>
      <div className="space-y-3">
        <input
          ref={inputRef}
          aria-label="Search by title"
          value={q}
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(hits.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (hits[at]) onPick(hits[at].ref); }
          }}
          className={inputCls}
          placeholder="e.g. MG Edible, Zaman, 2224"
        />
        <div className="max-h-[50vh] overflow-y-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
          <table className="w-full text-sm" role="grid" aria-label="Accounts found">
            <thead className="sticky top-0 bg-[#FAF9F6] dark:bg-[#162436]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280]"><th className="px-3 py-2 w-28">Customer #</th><th className="px-3 py-2">Customer Name</th></tr>
            </thead>
            <tbody ref={listRef}>
              {hits.length === 0 && <tr><td colSpan={2} className="px-3 py-3 text-[#8E9299]">Nothing matches.</td></tr>}
              {hits.map((o, i) => {
                const bal = balanceOf?.(o.ref);
                return (
                  <tr
                    key={o.ref}
                    data-row={i}
                    role="row"
                    aria-selected={i === at}
                    onClick={() => setAt(i)}
                    onDoubleClick={() => onPick(o.ref)}
                    className={`border-t border-[#F1F0EC] dark:border-[#1E2E40] cursor-pointer ${i === at ? 'bg-teal-50 dark:bg-teal-950/40' : 'hover:bg-[#FAF9F6] dark:hover:bg-[#162436]'}`}
                  >
                    <td className="px-3 py-2 tabular-nums text-xs text-[#6B7280]">{o.code || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-[#111827] dark:text-white">{o.name}</span>
                      <span className="text-[11px] text-[#8E9299]">{o.city ? ` • ${o.city}` : ''} • {o.group}{bal != null && Math.abs(bal) >= 0.005 ? ` • ${balanceText(bal)}` : ''}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

/** Search: open a saved voucher of this kind by its number. */
const VoucherSearch: React.FC<{ type: VoucherType; vouchers: JournalEntry[]; onPick: (v: JournalEntry) => void; onClose: () => void }> = ({ type, vouchers, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const mine = useMemo(() => vouchers.filter((v) => v.voucherType === type).sort((a, b) => (a.date === b.date ? b.ref.localeCompare(a.ref, undefined, { numeric: true }) : a.date < b.date ? 1 : -1)), [vouchers, type]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = t.replace(/\D/g, '');
    return (t ? mine.filter((v) => v.ref.toLowerCase().includes(t) || (d && v.ref.replace(/\D/g, '').includes(d)) || v.memo.toLowerCase().includes(t)) : mine).slice(0, 30);
  }, [mine, q]);
  const go = () => {
    const v = findVoucherByNumber(vouchers, type, q) || (shown.length === 1 ? shown[0] : undefined);
    if (v) onPick(v);
    else setErr(q.trim() ? `No ${type} numbered ${q.trim()}.` : 'Type the voucher number.');
  };
  return (
    <Modal isOpen onClose={onClose} title="Search Voucher" subtitle={`Open a saved ${voucherTypeInfo(type).label.toLowerCase()} by its number.`}>
      <div className="space-y-3">
        {err && <Notice kind="error">{err}</Notice>}
        <div>
          <label className={labelCls} htmlFor="vch-find">Voucher #</label>
          <input id="vch-find" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} className={`${inputCls} tabular-nums`} placeholder="e.g. 1066" autoComplete="off" />
        </div>
        <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] max-h-72 overflow-y-auto" aria-label="Saved vouchers">
          {shown.length === 0 && <li className="px-3 py-3 text-sm text-[#8E9299]">No {type} vouchers{q.trim() ? ' match' : ' yet'}.</li>}
          {shown.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => onPick(v)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                <span className="min-w-0 truncate"><span className="tabular-nums text-sm font-bold mr-2">{v.ref}</span><span className="text-xs text-[#6B7280]">{formatDate(v.date)} • {v.memo}</span></span>
                <span className="tabular-nums text-sm font-semibold whitespace-nowrap">{rs(v.lines.reduce((a, l) => a + (Number(l.debit) || 0), 0))}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
};

