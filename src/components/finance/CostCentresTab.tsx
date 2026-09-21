import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { CostCentreKind } from '../../types';
import { cardCls, inputCls, labelCls, primaryBtn, rs, EmptyState, RowAction } from '../billing/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { Account, JournalEntry } from '../../utils/accounting';
import { profitByCostCentre } from '../../utils/financeReports';
import { todayISO } from '../../utils/stockFlow';
import { PeriodPicker } from './common';

type Flash = (r: { success: boolean; message: string }) => void;
const KINDS: { id: CostCentreKind; label: string }[] = [
  { id: 'branch', label: 'Branch / shop' },
  { id: 'area', label: 'Area / route' },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'other', label: 'Other' },
];

/** Accounts → Cost centres: the list of centres and the P&L split by centre. */
export const CostCentresTab: React.FC<{ journal: JournalEntry[]; accounts: Account[]; flash: Flash }> = ({ journal, accounts, flash }) => {
  const { costCentres, addCostCentre, updateCostCentre, deleteCostCentre, can } = useTrading();
  const canEdit = can('finance:view_pnl');
  const canRemove = canEdit && can('delete_records');
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CostCentreKind>('branch');
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const rows = useMemo(() => profitByCostCentre(journal, from, to, accounts, costCentres), [journal, from, to, accounts, costCentres]);
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name || code;
  const accType = (code: string) => accounts.find((a) => a.code === code)?.type;

  return (
    <div className="space-y-4" data-testid="centres-tab">
      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Tag bills, expenses and journal lines with a branch, area or vehicle to see which part of the business makes money. Untagged items show under "Not tagged".</p>
      <div className={`${cardCls} p-4`}><PeriodPicker idPrefix="cc" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>

      {rows.length === 0 ? <div className={cardCls}><EmptyState text="No income or expenses in this period." /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((c) => (
            <div key={c.id} className={`${cardCls} p-4`} data-testid="centre-pnl">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">{c.name}</h3>
                <span className={`tabular-nums font-extrabold ${c.profit >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>{c.profit >= 0 ? '' : '− '}{rs(Math.abs(c.profit))}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                <div><div className="text-[#8E9299] uppercase font-bold">Income</div><div className="tabular-nums font-semibold text-sm">{rs(c.income)}</div></div>
                <div><div className="text-[#8E9299] uppercase font-bold">Cost of sales</div><div className="tabular-nums font-semibold text-sm">{rs(c.costOfSales)}</div></div>
                <div><div className="text-[#8E9299] uppercase font-bold">Expenses</div><div className="tabular-nums font-semibold text-sm">{rs(c.expenses)}</div></div>
              </div>
              <details className="mt-2">
                <summary className="text-xs font-bold text-teal-700 dark:text-teal-300 cursor-pointer">By account</summary>
                <ul className="mt-1 text-xs divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                  {Array.from(c.byAccount.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([code, v]) => (
                    <li key={code} className="py-1 flex justify-between gap-2"><span>{accName(code)}</span><span className="tabular-nums">{accType(code) === 'income' ? '' : '− '}{rs(v)}</span></li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}

      <div className={`${cardCls} overflow-hidden`}>
        <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248] font-bold">Cost centres</div>
        {costCentres.length === 0 ? <EmptyState compact text="No cost centres yet." /> : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {costCentres.map((c) => (
              <li key={c.id} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3" data-testid="centre-row">
                <div className="min-w-0"><div className="text-sm font-semibold">{c.name}{!c.active && <span className="ml-2 text-[10px] uppercase text-[#8E9299]">inactive</span>}</div><div className="text-[11px] text-[#8E9299]">{KINDS.find((k) => k.id === c.kind)?.label}</div></div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={c.active} onChange={(e) => flash(updateCostCentre(c.id, { active: e.target.checked }))} /> In use</label>
                    {canRemove && <RowAction label={`Delete ${c.name}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirm({ id: c.id, name: c.name })} />}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form onSubmit={(e) => { e.preventDefault(); const r = addCostCentre({ name, kind }); flash(r); if (r.success) setName(''); }} className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-t border-[#E5E5E1] dark:border-[#203248]">
            <div className="col-span-2 min-w-0"><label className={labelCls} htmlFor="cc-name">New cost centre</label><input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mardan branch" className={inputCls} /></div>
            <div className="min-w-0"><label className={labelCls} htmlFor="cc-kind">Kind</label><select id="cc-kind" value={kind} onChange={(e) => setKind(e.target.value as CostCentreKind)} className={inputCls}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></div>
            <div className="flex items-end"><button type="submit" className={`${primaryBtn} w-full`}><Plus className="w-4 h-4" /> Add</button></div>
          </form>
        )}
      </div>
      <ConfirmDialog isOpen={Boolean(confirm)} title={`Delete ${confirm?.name}?`} message="Only a cost centre that was never used can be deleted." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) flash(deleteCostCentre(confirm.id)); setConfirm(null); }} />
    </div>
  );
};
