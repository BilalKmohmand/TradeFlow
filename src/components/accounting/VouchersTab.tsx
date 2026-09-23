import { matcher } from '../../utils/search';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Printer, Pencil, Trash2, Eye, X } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Notice, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs, EmptyState, RowAction } from '../billing/ui';
import { Account, JournalEntry, booksLockedFor } from '../../utils/accounting';
import { VOUCHER_TYPES, VoucherType, accountOptions, moneySideAmount, moneySideCode, voucherInputOf, voucherTotals, voucherTypeInfo, cleanLines, VoucherInput } from '../../utils/vouchers';
import { AccountPicker } from './AccountPicker';
import { BankSelect } from '../billing/BankSelect';
import { ConfirmDialog } from '../ConfirmDialog';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { MAIN_BANK_CODE, bankNameOf } from '../../utils/banks';
import { isPendingApproval } from '../../context/controlActions';
import { FileText } from 'lucide-react';

type Flash = (r: { success: boolean; message: string }) => void;
const typeTone: Record<VoucherType, string> = {
  CPV: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  BPV: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  CRV: 'bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  BRV: 'bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  JV: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
};
const voucherTotal = (v: JournalEntry) => v.lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);

/** Accounts → Vouchers: CPV / CRV / BPV / BRV / JV with many lines each, like the old desktop books. */
export const VouchersTab: React.FC<{ accounts: Account[]; flash: Flash; request?: { sub: string; n: number } | null }> = ({ accounts, flash, request }) => {
  const { vouchers, customers, suppliers, can, setPrintRequest, deleteVoucher, voucherEditBlock, bankAccounts, settings } = useTrading();
  const today = todayISO();
  const [kind, setKind] = useState<'all' | VoucherType>('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [editor, setEditor] = useState<{ type: VoucherType; id?: string; nonce: number } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [pendingDel, setPendingDel] = useState<JournalEntry | null>(null);
  const [limit, setLimit] = useState(50);
  const canCash = can('finance:record_payment');
  const canJv = can('finance:view_pnl');
  // Opened from a menu / search: "new:CPV" starts a new voucher of that type, "view:<id>" shows one.
  useEffect(() => {
    if (!request) return;
    const [what, arg] = [request.sub.slice(0, request.sub.indexOf(':')), request.sub.slice(request.sub.indexOf(':') + 1)];
    if (what === 'new' && VOUCHER_TYPES.some((t) => t.id === arg) && (arg === 'JV' ? canJv : canCash)) setEditor({ type: arg as VoucherType, nonce: Date.now() });
    if (what === 'view' && vouchers.some((v) => v.id === arg)) setViewId(arg);
  }, [request?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const canDelete = can('delete_records');
  const nameOf = (l: JournalEntry['lines'][number]) =>
    l.partyType === 'customer' ? customers.find((c) => c.id === l.partyId)?.name || 'Customer' : l.partyType === 'supplier' ? (() => { const s = suppliers.find((x) => x.id === l.partyId); return s ? s.company || s.name : 'Supplier'; })() : accounts.find((a) => a.code === l.accountCode)?.name || l.accountCode;

  const rows = useMemo(() => {
    const m = matcher(q);
    return vouchers
      .filter((v) => (kind === 'all' || v.voucherType === kind) && v.date >= from && v.date <= to)
      .filter((v) => m([v.ref, v.memo, ...v.lines.flatMap((l) => [l.accountCode, nameOf(l), l.narration])]))
      .sort((a, b) => (a.date === b.date ? b.ref.localeCompare(a.ref, undefined, { numeric: true }) : a.date < b.date ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vouchers, kind, q, from, to, customers, suppliers, accounts]);

  const view = vouchers.find((v) => v.id === viewId) || null;
  const printRange = () => setPrintRequest({ type: 'vouchers_print', ids: [...rows].reverse().map((v) => v.id) });

  return (
    <div className="space-y-3" data-testid="vouchers-tab">
      <div className={`${cardCls} p-4 space-y-3`}>
        <div className="flex flex-wrap gap-2" aria-label="New voucher">
          {VOUCHER_TYPES.filter((t) => (t.id === 'JV' ? canJv : canCash)).map((t) => (
            <button key={t.id} type="button" onClick={() => setEditor({ type: t.id, nonce: Date.now() })} className={`${secondaryBtn} max-sm:flex-1`} aria-label={`New ${t.label}`}>
              <Plus className="w-4 h-4" /> {t.id} <span className="hidden sm:inline text-[#6B7280] font-normal">{t.short}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="min-w-0">
            <label className={labelCls} htmlFor="vch-kind">Type</label>
            <select id="vch-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputCls}>
              <option value="all">All vouchers</option>
              {VOUCHER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.short}</option>)}
            </select>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label className={labelCls} htmlFor="vch-search">Search</label>
            <input id="vch-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, narration, account" className={inputCls} />
          </div>
          <div className="min-w-0"><label className={labelCls} htmlFor="vch-from">From</label><input id="vch-from" type="date" value={from} onChange={(e) => setFrom(e.target.value || today)} className={inputCls} /></div>
          <div className="min-w-0"><label className={labelCls} htmlFor="vch-to">To</label><input id="vch-to" type="date" value={to} onChange={(e) => setTo(e.target.value || today)} className={inputCls} /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{rows.length} voucher{rows.length === 1 ? '' : 's'} • {rs(rows.reduce((a, v) => a + voucherTotal(v), 0))}</span>
          <button type="button" disabled={rows.length === 0} onClick={printRange} className={secondaryBtn} aria-label="Vouchers printing"><Printer className="w-4 h-4" /> Vouchers printing ({rows.length})</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={cardCls}><EmptyState compact icon={<FileText className="w-5 h-5" />} text={vouchers.length ? 'No vouchers match.' : 'No vouchers yet. Pick CPV, CRV, BPV, BRV or JV above to make one.'} /></div>
      ) : (
        <ul className={`${cardCls} divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] overflow-hidden`} aria-label="Vouchers">
          {rows.slice(0, limit).map((v) => {
            const t = v.voucherType as VoucherType;
            const lines = v.lines.filter((l) => !l.moneySide);
            return (
              <li key={v.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 pl-4 pr-2 py-2.5" data-testid="voucher-row">
                <button type="button" onClick={() => setViewId(v.id)} className="flex-1 min-w-0 text-left">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${typeTone[t]}`}>{t}</span>
                    <span className="shrink-0 tabular-nums text-sm font-bold text-[#111827] dark:text-white">{v.ref}</span>
                    <span className="shrink-0 tabular-nums text-xs text-[#6B7280]">{formatDate(v.date)}</span>
                    <span className="truncate text-sm text-[#374151] dark:text-[#CBD5E1]">{v.memo}</span>
                  </span>
                  <span className="block text-[11px] text-[#6B7280] dark:text-[#8E9299] truncate">{lines.map(nameOf).slice(0, 4).join(', ')}{lines.length > 4 ? ` +${lines.length - 4} more` : ''}{v.bankCode ? ` • ${bankNameOf(bankAccounts, v.bankCode)}` : ''}</span>
                </button>
                <span className="tabular-nums whitespace-nowrap font-bold text-sm">{rs(voucherTotal(v))}</span>
                <span className="flex items-center gap-0.5 max-sm:ml-auto">
                  <RowAction label={`View voucher ${v.ref}`} icon={<Eye className="w-4 h-4" />} onClick={() => setViewId(v.id)} />
                  <RowAction label={`Print voucher ${v.ref}`} icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'vouchers_print', ids: [v.id] })} />
                  {!voucherEditBlock(v.id) && <RowAction label={`Edit voucher ${v.ref}`} icon={<Pencil className="w-4 h-4" />} onClick={() => setEditor({ type: t, id: v.id, nonce: Date.now() })} />}
                  {canDelete && !booksLockedFor(settings, v.date) && <RowAction label={`Delete voucher ${v.ref}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPendingDel(v)} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > limit && <button type="button" onClick={() => setLimit((n) => n + 100)} className={`${secondaryBtn} w-full`}>Show more ({rows.length - limit} left)</button>}

      {editor && <VoucherModal key={editor.nonce} type={editor.type} editId={editor.id} accounts={accounts} onClose={() => setEditor(null)} onSaved={(m, id) => { flash({ success: true, message: m }); setEditor(null); if (id) setViewId(id); }} />}

      <Modal isOpen={Boolean(view)} onClose={() => setViewId(null)} title={view ? `${view.ref} — ${voucherTypeInfo(view.voucherType as VoucherType).label}` : 'Voucher'} subtitle={view ? `${formatDate(view.date)}${view.bankCode ? ` • ${bankNameOf(bankAccounts, view.bankCode)}` : ''} • ${view.memo}` : undefined} wide
        footer={view && (
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={() => setPrintRequest({ type: 'vouchers_print', ids: [view.id] })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print</button>
            {!voucherEditBlock(view.id) && <button type="button" onClick={() => { setViewId(null); setEditor({ type: view.voucherType as VoucherType, id: view.id, nonce: Date.now() }); }} className={secondaryBtn}><Pencil className="w-4 h-4" /> Edit</button>}
            <button type="button" onClick={() => setViewId(null)} className={primaryBtn}>Close</button>
          </div>
        )}
      >
        {view && (
          <div className="space-y-2" data-testid="voucher-view">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280]"><th className="py-1.5 pr-2">Account</th><th className="py-1.5 pr-2">Narration</th><th className="py-1.5 text-right">Debit</th><th className="py-1.5 text-right">Credit</th></tr></thead>
                <tbody>
                  {view.lines.map((l, i) => (
                    <tr key={i} className="border-t border-[#F1F0EC] dark:border-[#1E2E40]">
                      <td className="py-1.5 pr-2"><span className="tabular-nums text-xs text-[#8E9299] mr-1.5">{l.partyType ? (l.partyType === 'customer' ? customers.find((c) => c.id === l.partyId)?.code : suppliers.find((s) => s.id === l.partyId)?.code) || '' : l.accountCode}</span>{nameOf(l)}{l.moneySide && <span className="ml-1.5 text-[9px] font-bold uppercase text-[#6B7280]">auto</span>}</td>
                      <td className="py-1.5 pr-2 text-xs text-[#6B7280]">{l.moneySide ? '' : l.narration}</td>
                      <td className="py-1.5 text-right tabular-nums">{l.debit ? rs(l.debit) : ''}</td>
                      <td className="py-1.5 text-right tabular-nums">{l.credit ? rs(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[#6B7280]">Made by {view.createdBy || '—'}{view.updatedAt ? ` • changed by ${view.updatedBy || '—'} on ${formatDate(view.updatedAt.slice(0, 10))}` : ''}{voucherEditBlock(view.id) && settings.booksLockedUntil && view.date <= settings.booksLockedUntil ? ' • in a closed period' : ''}</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(pendingDel)}
        title={`Delete voucher ${pendingDel?.ref || ''}?`}
        message={`${pendingDel?.memo || ''} — every line comes off the books (party balances, cash book, expenses). A copy is kept in Admin → Deleted records.`}
        confirmLabel="Delete voucher"
        onCancel={() => setPendingDel(null)}
        onConfirm={() => { if (pendingDel) flash(deleteVoucher(pendingDel.id)); setPendingDel(null); }}
      />
    </div>
  );
};

interface LineRow { key: string; account: string; debit: string; credit: string; narration: string }
let rowSeq = 0;
const newLine = (p: Partial<LineRow> = {}): LineRow => ({ key: `vl-${++rowSeq}`, account: '', debit: '', credit: '', narration: '', ...p });

/** New / edit voucher: number shown (given automatically), date, bank, narration and many lines. */
export const VoucherModal: React.FC<{ type: VoucherType; editId?: string; accounts: Account[]; onClose: () => void; onSaved: (message: string, id?: string) => void }> = ({ type, editId, accounts, onClose, onSaved }) => {
  const { vouchers, customers, suppliers, addVoucher, updateVoucher, previewVoucherNumber, setPrintRequest, bankAccounts } = useTrading();
  const info = voucherTypeInfo(type);
  const existing = editId ? vouchers.find((v) => v.id === editId) : undefined;
  const start: VoucherInput | null = existing ? voucherInputOf(existing) : null;
  const [date, setDate] = useState(start?.date || todayISO());
  const [narration, setNarration] = useState(start?.narration || '');
  const [bank, setBank] = useState(start?.bankCode || MAIN_BANK_CODE);
  const [lines, setLines] = useState<LineRow[]>(() => (start ? start.lines.map((l) => newLine({ account: l.account, debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '', narration: l.narration || '' })) : info.money ? [newLine()] : [newLine(), newLine()]));
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const busy = useRef(false);
  const options = useMemo(() => accountOptions(accounts, customers, suppliers, { forVoucher: true }).filter((o) => o.ref !== moneySideCode(type, bank)), [accounts, customers, suppliers, type, bank]);
  const num = (s: string) => Math.max(0, parseFloat(s) || 0);
  const parsed = lines.map((l) => ({ account: l.account, debit: num(l.debit), credit: num(l.credit), narration: l.narration }));
  const clean = cleanLines(parsed);
  const totals = voucherTotals(clean);
  const side = moneySideCode(type, bank);
  const sideAmt = moneySideAmount(type, clean);
  const sideName = side ? (side === '1000' ? 'Cash in hand' : bankAccounts.find((b) => b.code === side)?.name || 'Bank') : '';
  const number = existing ? existing.ref : previewVoucherNumber(type, date);
  const set = (key: string, patch: Partial<LineRow>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  // Lines usually go on one side: payments are debits, receipts are credits.
  const main: 'debit' | 'credit' = info.side === 'receive' ? 'credit' : 'debit';

  const save = (print: boolean) => {
    if (busy.current || sent) return;
    setError('');
    const input: VoucherInput = { type, date, narration, lines: parsed, ...(info.money === 'bank' ? { bankCode: bank } : {}) };
    busy.current = true;
    const r = existing ? updateVoucher(existing.id, input) : addVoucher(input);
    busy.current = false;
    if (!r.success) return setError(r.message);
    if (isPendingApproval(r)) return setSent(r.message);
    const id = (r as { voucher?: JournalEntry }).voucher?.id;
    if (print && id) setPrintRequest({ type: 'vouchers_print', ids: [id] });
    onSaved(r.message, print ? undefined : id);
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-[#374151] dark:text-[#CBD5E1] tabular-nums" data-testid="voucher-totals">
        Debit <strong>{rs(totals.debit + (info.side === 'receive' ? sideAmt : 0))}</strong> • Credit <strong>{rs(totals.credit + (info.side === 'pay' ? sideAmt : 0))}</strong>
        {!info.money && Math.abs(totals.debit - totals.credit) >= 0.005 && <span className="ml-2 font-bold text-rose-700 dark:text-rose-300">Difference {rs(Math.abs(totals.debit - totals.credit))}</span>}
      </div>
      {/* Phones: "Save voucher" gets its own full-width row on top, so no button label is squeezed onto 3 lines. */}
      <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*:last-child]:order-first max-sm:[&>*:last-child]:basis-full">
        <button type="button" onClick={onClose} className={`${secondaryBtn} max-sm:flex-1`}>{sent ? 'Close' : 'Cancel'}</button>
        <button type="button" onClick={() => save(true)} disabled={Boolean(sent)} className={`${secondaryBtn} max-sm:flex-1`}><Printer className="w-4 h-4" /> Save &amp; print</button>
        <button type="button" onClick={() => save(false)} disabled={Boolean(sent)} className={`${primaryBtn} max-sm:flex-1`}>Save voucher</button>
      </div>
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} title={`${existing ? 'Edit' : 'New'} ${info.label}`} subtitle={info.money ? `The ${info.money === 'cash' ? 'cash' : 'bank'} side is added by itself: just enter who was ${info.side === 'pay' ? 'paid' : 'received from'} and for what.` : 'Debits must equal credits.'} wide footer={footer}>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="space-y-4" aria-label={info.label}>
        {error && <Notice kind="error">{error}</Notice>}
        {sent && <div data-testid="voucher-sent-for-approval"><Notice kind="ok">{sent}</Notice></div>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="min-w-0">
            <label className={labelCls} htmlFor="vch-number">Voucher no.</label>
            <input id="vch-number" readOnly value={number} className={`${inputCls} tabular-nums !bg-[#F4F3EF] dark:!bg-[#0D1520]`} title="Given automatically" data-testid="voucher-number" />
          </div>
          <div className="min-w-0">
            <label className={labelCls} htmlFor="vch-date">Date</label>
            <input id="vch-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          {info.money === 'bank' && (bankAccounts.length > 1 ? <BankSelect id="vch-bank" className="col-span-2" label="Bank account" value={bank} onChange={setBank} /> : <div className="col-span-2 min-w-0"><span className={labelCls}>Bank account</span><div className={`${inputCls} !bg-[#F4F3EF] dark:!bg-[#0D1520]`}>{bankAccounts[0]?.name}</div></div>)}
          <div className={`min-w-0 ${info.money === 'bank' ? 'col-span-2 sm:col-span-4' : 'col-span-2'}`}>
            <label className={labelCls} htmlFor="vch-narration">Narration</label>
            <input id="vch-narration" value={narration} onChange={(e) => setNarration(e.target.value)} className={inputCls} placeholder={info.side === 'pay' ? 'e.g. Payments to suppliers' : info.side === 'receive' ? 'e.g. Recovery from Mardan' : 'e.g. Set off / correction'} />
          </div>
        </div>

        <div className="space-y-2" aria-label="Voucher lines">
          <div className="hidden sm:grid grid-cols-[minmax(0,2.2fr)_7.5rem_7.5rem_minmax(0,1.4fr)_2.5rem] gap-2 px-1 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
            <span>Account (type a code or name, F1 to search)</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span>Line narration</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,2.2fr)_7.5rem_7.5rem_minmax(0,1.4fr)_2.5rem] gap-2 items-start rounded-2xl sm:rounded-none border sm:border-0 border-[#E5E5E1] dark:border-[#203248] p-2 sm:p-0" data-testid="voucher-line">
              <AccountPicker id={`vch-acc-${i + 1}`} aria-label={`Line ${i + 1} account`} className="col-span-3 sm:col-span-1" value={l.account} options={options} onPick={(ref) => set(l.key, { account: ref })} />
              <input aria-label={`Line ${i + 1} debit`} type="number" inputMode="decimal" min="0" step="any" value={l.debit} onChange={(e) => set(l.key, { debit: e.target.value, ...(e.target.value ? { credit: '' } : {}) })} className={`${inputCls} tabular-nums text-right ${main === 'debit' ? '' : 'opacity-80'}`} placeholder="Debit" />
              <input aria-label={`Line ${i + 1} credit`} type="number" inputMode="decimal" min="0" step="any" value={l.credit} onChange={(e) => set(l.key, { credit: e.target.value, ...(e.target.value ? { debit: '' } : {}) })} className={`${inputCls} max-sm:col-span-2 tabular-nums text-right ${main === 'credit' ? '' : 'opacity-80'}`} placeholder="Credit" />
              <input aria-label={`Line ${i + 1} narration`} value={l.narration} onChange={(e) => set(l.key, { narration: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-1`} placeholder="optional" />
              <button type="button" onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== l.key) : prev))} aria-label={`Remove line ${i + 1}`} className="justify-self-end p-2.5 rounded-xl text-[#9CA3AF] hover:text-rose-600"><X className="w-4 h-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setLines((prev) => [...prev, newLine()])} className={secondaryBtn}><Plus className="w-4 h-4" /> Add line</button>
          {side && (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] px-3.5 py-2.5 text-sm" data-testid="voucher-money-side">
              <span className="min-w-0 truncate"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{side}</span>{sideName} <span className="text-[11px] text-[#6B7280]">(added by itself)</span></span>
              <span className="tabular-nums font-bold whitespace-nowrap">{info.side === 'pay' ? 'Cr' : 'Dr'} {rs(Math.max(0, sideAmt))}</span>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
};

