import React, { useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Lock, Undo2 } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Notice, cardCls, inputCls, labelCls, primaryBtn, dangerBtn, rs } from '../billing/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { ACC, Account, JournalEntry, profitAndLoss, trialBalance } from '../../utils/accounting';
import { closingEntry, latestClose } from '../../utils/financeBooks';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { useFinancialYears } from './common';

type Flash = (r: { success: boolean; message: string }) => void;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Accounts → Year end: financial year setting and the "Close the year" wizard. */
export const YearEndTab: React.FC<{ journal: JournalEntry[]; accounts: Account[]; flash: Flash }> = ({ journal, accounts, flash }) => {
  const { settings, updateSettings, yearCloses, closeYear, undoYearClose, can, isAdminUnlocked } = useTrading();
  const isAdmin = can('finance:view_pnl') && can('admin_screen') && isAdminUnlocked;
  const today = todayISO();
  const { years, fyStart } = useFinancialYears();
  const ended = years.filter((y) => y.end < today);
  const openYears = ended.filter((y) => !yearCloses.some((c) => c.label === y.label));
  const [picked, setPick] = useState(openYears[openYears.length - 1]?.start || '');
  // The oldest year still open, unless another open year was picked.
  const pick = openYears.some((y) => y.start === picked) ? picked : openYears[openYears.length - 1]?.start || '';
  const [toAccount, setToAccount] = useState<string>(ACC.RETAINED_EARNINGS);
  const [confirm, setConfirm] = useState<'close' | 'undo' | null>(null);
  const fy = years.find((y) => y.start === pick);
  const tb = useMemo(() => (fy ? trialBalance(journal, accounts, fy.end) : null), [journal, accounts, fy]);
  const pnl = useMemo(() => (fy ? profitAndLoss(journal, fy.start, fy.end, accounts) : null), [journal, accounts, fy]);
  const closing = useMemo(() => (fy ? closingEntry(journal, fy.end, accounts, toAccount) : null), [journal, accounts, fy, toAccount]);
  const last = latestClose(yearCloses);
  const startMonth = Number(fyStart.slice(0, 2));
  const step = (ok: boolean, text: React.ReactNode) => (
    <li className="flex items-start gap-2 text-sm">{ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-teal-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-600 shrink-0" />}<span>{text}</span></li>
  );

  return (
    <div className="space-y-4" data-testid="yearend-tab">
      <div className={`${cardCls} p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end gap-3`}>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold">Financial year</h2>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">In Pakistan the tax year runs 1 July to 30 June. Reports can be picked by financial year.</p>
        </div>
        <div className="w-48"><label className={labelCls} htmlFor="fy-start">Year starts on 1st of</label>
          <select id="fy-start" value={startMonth} disabled={!isAdmin} onChange={(e) => { updateSettings({ financialYearStart: `${String(e.target.value).padStart(2, '0')}-01` }); flash({ success: true, message: 'Financial year start saved.' }); }} className={inputCls}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>

      {yearCloses.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248] font-bold">Closed years</div>
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {[...yearCloses].sort((a, b) => (a.end < b.end ? 1 : -1)).map((c) => (
              <li key={c.id} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3" data-testid="year-close">
                <div className="min-w-0"><div className="text-sm font-semibold">{c.label}</div><div className="text-[11px] text-[#8E9299]">{formatDate(c.start)} – {formatDate(c.end)} • closed {formatDate(c.createdAt)}{c.createdBy ? ` by ${c.createdBy}` : ''}</div></div>
                <div className="text-right"><div className={`tabular-nums font-bold text-sm ${c.profit >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>{c.profit >= 0 ? 'Profit' : 'Loss'} {rs(Math.abs(c.profit))}</div><div className="text-[11px] text-[#8E9299]">to {c.toAccount === ACC.CAPITAL ? "owner's capital" : 'retained earnings'}</div></div>
              </li>
            ))}
          </ul>
          {isAdmin && last && <div className="p-4 border-t border-[#E5E5E1] dark:border-[#203248]"><button type="button" onClick={() => setConfirm('undo')} className={dangerBtn}><Undo2 className="w-4 h-4" /> Reopen {last.label}</button></div>}
        </div>
      )}

      <div className={`${cardCls} p-4 sm:p-5 space-y-4`}>
        <div>
          <h2 className="font-bold">Close the year</h2>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">When the accountant has finished a year: the year's profit is moved to the owner's side of the balance sheet and the books are locked, so nothing in that year can change any more.</p>
        </div>
        {!isAdmin && <Notice kind="error">Only an admin (with admin mode unlocked) can close a year.</Notice>}
        {openYears.length === 0 ? <p className="text-sm text-[#8E9299]">No finished year is waiting to be closed.</p> : (
          <>
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 sm:w-fit">
              <div className="min-w-0"><label className={labelCls} htmlFor="close-fy">Year</label><select id="close-fy" value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls}>{openYears.map((y) => <option key={y.start} value={y.start}>{y.label}</option>)}</select></div>
              <div className="min-w-0"><label className={labelCls} htmlFor="close-to">Move profit to</label><select id="close-to" value={toAccount} onChange={(e) => setToAccount(e.target.value)} className={inputCls}><option value={ACC.RETAINED_EARNINGS}>Retained earnings</option><option value={ACC.CAPITAL}>Owner's capital</option></select></div>
            </div>
            {fy && tb && pnl && closing && (
              <ol className="space-y-2" data-testid="close-checks">
                {step(tb.balanced, <>Trial balance at {formatDate(fy.end)} {tb.balanced ? 'is balanced.' : `is out by ${rs(Math.abs(tb.difference))} — fix this first.`}</>)}
                {step(true, <>{pnl.netProfit >= 0 ? 'Profit' : 'Loss'} for {fy.label}: <b className="tabular-nums" data-testid="close-profit">{rs(Math.abs(pnl.netProfit))}</b>{Math.abs(closing.profit - pnl.netProfit) >= 0.01 && <> (plus {rs(closing.profit - pnl.netProfit)} from earlier years not closed yet)</>}.</>)}
                {step(true, <>A closing entry dated {formatDate(fy.end)} empties {closing.lines.length - 1} income and expense accounts into {toAccount === ACC.CAPITAL ? "owner's capital" : 'retained earnings'}.</>)}
                {step(true, <>The books are locked up to {formatDate(fy.end)}.</>)}
              </ol>
            )}
            <button type="button" disabled={!isAdmin || !tb?.balanced} onClick={() => setConfirm('close')} className={primaryBtn}><Lock className="w-4 h-4" /> Close {fy?.label}</button>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm !== null}
        title={confirm === 'undo' ? `Reopen ${last?.label}?` : `Close ${fy?.label}?`}
        message={confirm === 'undo' ? 'The closing entry is removed and the lock goes back to where it was before the close.' : 'The profit is carried forward and nothing dated in this year can be added or changed afterwards.'}
        confirmLabel={confirm === 'undo' ? 'Reopen year' : 'Close the year'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { flash(confirm === 'undo' ? undoYearClose() : closeYear({ fyStartDate: pick, toAccount })); setConfirm(null); }}
      />
      <p className="text-[11px] text-[#8E9299]">Lock date now: {settings.booksLockedUntil ? formatDate(settings.booksLockedUntil) : 'none'}.</p>
    </div>
  );
};
