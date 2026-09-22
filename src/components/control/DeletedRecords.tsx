import React, { useMemo, useState } from 'react';
import { Search, Trash2, RotateCcw, Eye } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { DeletedKind, DeletedRecord } from '../../types';
import { Modal, Notice, cardCls, inputCls, secondaryBtn, primaryBtn, EmptyState, RowAction } from '../billing/ui';
import { formatDate } from '../../utils/formatters';

export const DELETED_KIND_LABEL: Record<DeletedKind, string> = {
  bill: 'Bill', customer: 'Customer', supplier: 'Supplier', item: 'Item', expense: 'Expense', cash_entry: 'Cash entry', return: 'Customer return',
  debit_note: 'Debit note', quotation: 'Quotation', purchase_order: 'Purchase order', stock_receipt: 'Stock received', stock_adjustment: 'Stock adjustment',
  journal: 'Journal entry', payment: 'Payment', booking: 'Booking', dispatch: 'Dispatch',
  supplier_bill: 'Supplier bill', supplier_claim: 'Supplier claim', fixed_asset: 'Fixed asset', staff: 'Staff member', staff_advance: 'Staff advance',
  cost_centre: 'Cost centre', salesman: 'Salesman', area: 'Area', scheme: 'Scheme', godown: 'Godown', other: 'Other',
};

const when = (iso: string) => `${formatDate(iso.slice(0, 10))} ${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

/** Plain "field: value" view of a deleted record (nested rows shown as short JSON). */
const Fields: React.FC<{ data: unknown }> = ({ data }) => {
  const rows = Array.isArray(data) ? data : [data];
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <dl key={i} className="text-xs grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-1 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3">
          {Object.entries((r || {}) as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-[#6B7280] dark:text-[#94A3B8] truncate">{k}</dt>
              <dd className="font-semibold text-[#111827] dark:text-white break-words">{typeof v === 'object' ? <code className="text-[10px] font-normal whitespace-pre-wrap">{JSON.stringify(v, null, 1).slice(0, 1200)}</code> : String(v)}</dd>
            </React.Fragment>
          ))}
        </dl>
      ))}
    </div>
  );
};

/** Admin → Deleted records: every delete with who / when / why; view it, restore the simple ones. */
export const DeletedRecordsTab: React.FC = () => {
  const { deletedRecords, canRestore, restoreDeletedRecord, restoreBlockReason } = useTrading();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<DeletedKind | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const kinds = useMemo(() => Array.from(new Set(deletedRecords.map((r) => r.kind))), [deletedRecords]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deletedRecords.filter((r) => (kind === 'all' || r.kind === kind) && (!q || r.label.toLowerCase().includes(q) || (r.reason || '').toLowerCase().includes(q) || (r.deletedBy || '').toLowerCase().includes(q)));
  }, [deletedRecords, query, kind]);
  const open: DeletedRecord | undefined = deletedRecords.find((r) => r.id === openId);
  const restore = (id: string) => {
    const r = restoreDeletedRecord(id);
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) setOpenId(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#111827] dark:text-white">Deleted records</h2>
        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">A copy of everything deleted, with who deleted it, when and why. Customers, suppliers, items, expenses, cash entries, bills and payments can be put back. A bill is made again like a new bill (stock, closed periods and duplicates are checked again).</p>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, number, reason or person" className={`${inputCls} pl-10`} aria-label="Search deleted records" />
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value as DeletedKind | 'all')} className={`${inputCls} sm:w-56`} aria-label="Kind of record">
          <option value="all">All kinds</option>
          {kinds.map((k) => <option key={k} value={k}>{DELETED_KIND_LABEL[k]}</option>)}
        </select>
      </div>
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <EmptyState compact icon={<Trash2 className="w-5 h-5" />} text={deletedRecords.length ? 'Nothing matches.' : 'Nothing has been deleted yet.'} />
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]" aria-label="Deleted records list">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 pl-4 sm:pl-5 pr-2 py-2.5" data-testid="deleted-record">
                <button type="button" onClick={() => setOpenId(r.id)} className="flex-1 min-w-0 text-left">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[#F4F3EF] dark:bg-[#162436] text-[10px] font-bold uppercase tracking-wide text-[#6B7280] dark:text-[#94A3B8]">{DELETED_KIND_LABEL[r.kind]}</span>
                    <span className="truncate font-semibold text-sm text-[#111827] dark:text-white">{r.label}</span>
                  </span>
                  <span className="block text-[11px] text-[#6B7280] dark:text-[#8E9299] truncate">
                    {r.deletedBy || 'Unknown'} • {when(r.deletedAt)} • {r.reason ? `“${r.reason}”` : 'no reason given'}{r.restoredAt ? ` • restored by ${r.restoredBy}` : ''}
                  </span>
                </button>
                <RowAction label={`View ${r.label}`} icon={<Eye className="w-4 h-4" />} onClick={() => setOpenId(r.id)} />
                {canRestore(r) && <RowAction label={`Restore ${r.label}`} text="Restore" tone="teal" icon={<RotateCcw className="w-4 h-4" />} onClick={() => restore(r.id)} />}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal
        isOpen={Boolean(open)}
        onClose={() => setOpenId(null)}
        title={open ? `${DELETED_KIND_LABEL[open.kind]} deleted` : ''}
        subtitle={open ? `${open.deletedBy || 'Unknown'} • ${when(open.deletedAt)}` : ''}
        footer={open ? (
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setOpenId(null)} className={secondaryBtn}>Close</button>
            {canRestore(open) && <button type="button" onClick={() => restore(open.id)} className={primaryBtn}><RotateCcw className="w-4 h-4" /> Restore</button>}
          </div>
        ) : undefined}
      >
        {open && (
          <div className="space-y-3">
            <p className="font-semibold text-sm text-[#111827] dark:text-white">{open.label}</p>
            <p className="text-sm"><span className="text-[#6B7280] dark:text-[#94A3B8]">Reason: </span>{open.reason || 'No reason given'}</p>
            {open.restoredAt && <Notice kind="ok">Restored by {open.restoredBy} on {when(open.restoredAt)}.</Notice>}
            {!open.restoredAt && restoreBlockReason(open) && <p className="rounded-2xl px-4 py-3 text-sm bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900" data-testid="restore-block">View only: {restoreBlockReason(open)}</p>}
            <Fields data={open.data} />
          </div>
        )}
      </Modal>
    </div>
  );
};
