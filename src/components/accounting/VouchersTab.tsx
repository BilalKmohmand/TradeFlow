import { matcher } from '../../utils/search';
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Pencil, Trash2, Eye } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs, EmptyState, RowAction } from '../billing/ui';
import { Account, AccountBalance, JournalEntry, booksLockedFor } from '../../utils/accounting';
import { VoucherModal } from './VoucherForm';
import { VOUCHER_TYPES, VoucherType, voucherTypeInfo } from '../../utils/vouchers';
import { ConfirmDialog } from '../ConfirmDialog';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { bankNameOf } from '../../utils/banks';
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
export const VouchersTab: React.FC<{ accounts: Account[]; flash: Flash; request?: { sub: string; n: number } | null; balances?: Map<string, AccountBalance> }> = ({ accounts, flash, request, balances }) => {
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

      {editor && <VoucherModal key={editor.nonce} type={editor.type} editId={editor.id} accounts={accounts} balances={balances} onClose={() => setEditor(null)} onSaved={(m) => flash({ success: true, message: m })} />}

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

