import { CsvButton } from './CsvButton';
import { chequesCsv } from '../../utils/csvReports';
import React, { useMemo, useState } from 'react';
import { Printer, Plus, Search, Send, Ruler } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Cheque } from '../../types';
import { cardCls, inputCls, primaryBtn, secondaryBtn, Notice, Tile, rs } from './ui';
import { ChequeActionModal, ChequeAction, ChequeFormModal } from './ChequeForms';
import { CHEQUE_VIEWS, ChequeView, chequeStatusLabel, chequeTotals, filterCheques } from '../../utils/cheques';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { ChequeLayoutModal } from '../finance/ChequeLayoutModal';

const STATUS_TONE: Record<Cheque['status'], string> = {
  in_hand: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  deposited: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  issued: 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  cleared: 'bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  bounced: 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

/** Money → Cheques: the post-dated cheque register with the few things you do to a cheque. */
export const ChequesTab: React.FC = () => {
  const { cheques, can, setPrintRequest } = useTrading();
  const today = todayISO();
  const [view, setView] = useState<ChequeView>('due');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<{ direction: 'received' | 'issued'; n: number } | null>(null);
  const [act, setAct] = useState<{ cheque: Cheque; action: ChequeAction; n: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const canRecord = can('finance:record_payment');
  const canManage = can('finance:cashbook');
  const totals = useMemo(() => chequeTotals(cheques, today), [cheques, today]);
  const rows = useMemo(() => filterCheques(cheques, view, today, query), [cheques, view, today, query]);
  const count = (v: ChequeView) => filterCheques(cheques, v, today).length;
  const total = rows.reduce((a, c) => a + c.amount, 0);
  const open = (cheque: Cheque, action: ChequeAction) => { setMsg(''); setAct({ cheque, action, n: Date.now() }); };

  const actions = (c: Cheque) => {
    const btn = 'text-xs font-bold px-3 py-2 rounded-xl border border-[#E5E5E1] dark:border-[#203248] hover:bg-[#F4F3EF] dark:hover:bg-[#162436] disabled:opacity-40 disabled:pointer-events-none';
    const out: React.ReactNode[] = [];
    if (c.direction === 'received' && c.status === 'in_hand' && canRecord) out.push(<button key="dep" type="button" onClick={() => open(c, 'deposit')} className={`${btn} text-indigo-700 dark:text-indigo-300`} disabled={c.chequeDate > today} title={c.chequeDate > today ? `Can be deposited from ${formatDate(c.chequeDate)}` : undefined}>{c.chequeDate > today ? `Deposit from ${formatDate(c.chequeDate)}` : 'Deposit'}</button>);
    if ((c.status === 'deposited' || c.status === 'issued') && canManage) out.push(<button key="clr" type="button" onClick={() => open(c, 'clear')} className={`${btn} text-teal-700 dark:text-teal-300`}>Mark cleared</button>);
    if (c.direction === 'received' && (c.status === 'in_hand' || c.status === 'deposited') && canManage) out.push(<button key="bnc" type="button" onClick={() => open(c, 'bounce')} className={`${btn} text-rose-700 dark:text-rose-300`}>Bounced</button>);
    if (c.direction === 'issued' && c.status !== 'cancelled') out.push(<button key="prt" type="button" onClick={() => setPrintRequest({ type: 'cheque_print', chequeId: c.id })} className={`${btn} text-[#111827] dark:text-white`} aria-label={`Print cheque ${c.chequeNumber}`}>Print cheque</button>);
    if (((c.direction === 'received' && c.status === 'in_hand') || c.status === 'issued') && canManage) out.push(<button key="cnl" type="button" onClick={() => open(c, 'cancel')} className={`${btn} text-[#6B7280]`}>Cancel</button>);
    return out;
  };

  return (
    <div className="space-y-4" data-testid="cheques-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Cheques in hand" value={rs(totals.inHand.amount)} hint={`${totals.inHand.count} cheque${totals.inHand.count === 1 ? '' : 's'}`} tone="warn" onClick={() => setView('in_hand')} />
        <Tile label="Due this week" value={rs(totals.dueThisWeek.amount)} hint={`${totals.dueThisWeek.count} cheque${totals.dueThisWeek.count === 1 ? '' : 's'}`} onClick={() => setView('due')} />
        <Tile label="Deposited, not cleared" value={rs(totals.deposited.amount)} hint={`${totals.deposited.count} at the bank`} onClick={() => setView('deposited')} />
        <Tile label="Issued, not cleared" value={rs(totals.issued.amount)} tone={totals.issued.amount > 0 ? 'bad' : 'default'} hint={`${totals.issued.count} to suppliers`} onClick={() => setView('issued')} />
      </div>

      <div className="flex flex-wrap gap-2">
        {canRecord && <button type="button" onClick={() => setForm({ direction: 'received', n: Date.now() })} className={primaryBtn}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Cheque received</button>}
        {canRecord && <button type="button" onClick={() => setForm({ direction: 'issued', n: Date.now() })} className={secondaryBtn}><Send className="w-4 h-4 text-sky-600" /> Give a cheque</button>}
        <span className="sm:ml-auto"><CsvButton fileName={`cheques-${view}-${today}.csv`} table={() => chequesCsv(rows)} label="Download cheques CSV" /></span>
        <button type="button" onClick={() => setPrintRequest({ type: 'cheque_register', view })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print register</button>
        {canManage && <button type="button" onClick={() => setLayoutOpen(true)} className={secondaryBtn}><Ruler className="w-4 h-4" /> Cheque layout</button>}
      </div>

      {msg && <Notice kind="ok">{msg}</Notice>}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Cheque lists">
        {CHEQUE_VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={`shrink-0 px-3 py-2 rounded-2xl text-xs font-bold border ${view === v.id ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent' : 'bg-white dark:bg-[#101A26] border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]'}`}>{v.label} ({count(v.id)})</button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, cheque no. or bank" className={`${inputCls} pl-10`} aria-label="Search cheques" />
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
          <h2 className="font-bold text-[#111827] dark:text-white">{CHEQUE_VIEWS.find((v) => v.id === view)?.label}</h2>
          <span className="tabular-nums font-bold text-sm" data-testid="cheque-list-total">{rs(total)}</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[#8E9299]">{cheques.length === 0 ? 'No cheques yet. Record one when a customer gives you a cheque.' : 'No cheques in this list.'}</div>
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {rows.map((c) => {
              const overdue = (c.status === 'in_hand' || c.status === 'issued' || c.status === 'deposited') && c.chequeDate < today;
              const btns = actions(c);
              return (
                <li key={c.id} className="px-4 sm:px-5 py-3" data-testid="cheque-row">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{c.direction === 'issued' ? 'To ' : ''}{c.partyName}</div>
                      <div className="text-[11px] text-[#8E9299]"><span className="tabular-nums">#{c.chequeNumber}</span> • {c.bankName} • dated <span className={overdue ? 'font-bold text-amber-700 dark:text-amber-300' : ''}>{formatDate(c.chequeDate)}</span></div>
                      {(c.status === 'bounced' || c.status === 'cancelled') && c.returnReason && <div className="text-[11px] text-rose-700 dark:text-rose-300">{c.returnReason}{c.bankCharge ? ` • bank charge ${rs(c.bankCharge)} (${c.chargeTo === 'customer' ? 'customer pays' : 'shop paid'})` : ''}</div>}
                      {c.status === 'cleared' && c.clearedDate && <div className="text-[11px] text-teal-700 dark:text-teal-300">Cleared {formatDate(c.clearedDate)}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`tabular-nums font-bold text-sm ${c.direction === 'issued' ? 'text-rose-700 dark:text-rose-300' : 'text-[#111827] dark:text-white'}`}>{c.direction === 'issued' ? '− ' : ''}{rs(c.amount)}</div>
                      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_TONE[c.status]}`}>{chequeStatusLabel(c)}</span>
                    </div>
                  </div>
                  {btns.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{btns}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form && <ChequeFormModal key={form.n} isOpen onClose={() => setForm(null)} direction={form.direction} />}
      {layoutOpen && <ChequeLayoutModal onClose={() => setLayoutOpen(false)} onSaved={setMsg} />}
      {act && <ChequeActionModal key={act.n} cheque={act.cheque} action={act.action} onClose={() => setAct(null)} onDone={setMsg} />}
    </div>
  );
};
