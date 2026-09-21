import React, { useMemo, useState } from 'react';
import { Printer, HandCoins } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useWideLayout } from '../../hooks/useMediaQuery';
import { Modal, Notice, EmptyState, inputCls, labelCls, pillCls, primaryBtn, secondaryBtn, rs, moneyCls } from './ui';
import { CsvButton } from './CsvButton';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { GroupBy, commissionReport, recoveryList, salesByGroup, CommissionRow } from '../../utils/salesExtras';

export type SalesReportTab = 'sales' | 'recovery' | 'commission';

const th = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap';
const td = 'px-3 py-2 text-sm';
const tdNum = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';
const PAID_VIA = ['Cash', 'Bank Transfer', 'Easypaisa / JazzCash', 'Credit (unpaid)'];

const ByToggle: React.FC<{ by: GroupBy; onBy: (b: GroupBy) => void }> = ({ by, onBy }) => (
  <div role="tablist" aria-label="Group by" className="flex gap-1.5">
    <button type="button" role="tab" aria-selected={by === 'salesman'} onClick={() => onBy('salesman')} className={pillCls(by === 'salesman')}>By salesman</button>
    <button type="button" role="tab" aria-selected={by === 'area'} onClick={() => onBy('area')} className={pillCls(by === 'area')}>By area</button>
  </div>
);

/** Sales by salesman / area, the recovery list and salesman commission. */
export const SalesReportsModal: React.FC<{ isOpen: boolean; onClose: () => void; initialTab?: SalesReportTab }> = ({ isOpen, onClose, initialTab = 'sales' }) => {
  const t = useTrading();
  const { invoices, returns, customers, ledger, expenses, salesmen, areas, setPrintRequest, can, payCommission } = t;
  const wide = useWideLayout();
  const today = todayISO();
  const [tab, setTab] = useState<SalesReportTab>(initialTab);
  const [by, setBy] = useState<GroupBy>('salesman');
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [filterId, setFilterId] = useState('all');
  const [pay, setPay] = useState<{ salesmanId: string; amount: string; via: string; date: string; note: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const names = { salesmen, areas };

  const sales = useMemo(() => (isOpen && tab === 'sales' ? salesByGroup(invoices, returns, from, to, by, names) : null), [isOpen, tab, invoices, returns, from, to, by, salesmen, areas]); // eslint-disable-line react-hooks/exhaustive-deps
  const recovery = useMemo(() => (isOpen && tab === 'recovery' ? recoveryList(customers, ledger, asOf, by, names, filterId) : null), [isOpen, tab, customers, ledger, asOf, by, filterId, salesmen, areas]); // eslint-disable-line react-hooks/exhaustive-deps
  const commission = useMemo(() => (isOpen && tab === 'commission' ? commissionReport({ salesmen, invoices, returns, ledger, customers, expenses }, from, to) : null), [isOpen, tab, salesmen, invoices, returns, ledger, customers, expenses, from, to]);
  const canPay = can('manage_expenses') || can('finance:manage_expenses');
  const groupList = by === 'salesman' ? salesmen : areas;

  const range = (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
      <div><label className={labelCls} htmlFor="sr-from">From</label><input id="sr-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${inputCls} sm:w-auto`} /></div>
      <div><label className={labelCls} htmlFor="sr-to">To</label><input id="sr-to" type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${inputCls} sm:w-auto`} /></div>
    </div>
  );

  const submitPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pay) return;
    const r = payCommission({ salesmanId: pay.salesmanId, amount: Number(pay.amount) || 0, paidVia: pay.via, date: pay.date, note: pay.note });
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) setPay(null);
  };

  const footer = (
    <div className="flex flex-wrap gap-2 justify-end">
      {tab === 'sales' && sales && <CsvButton fileName={`sales-by-${by}-${from}-${to}.csv`} table={() => ({ headers: [by === 'salesman' ? 'Salesman' : 'Area', 'Bills', 'Sales (Rs.)', 'Returns (Rs.)', 'Net sales (Rs.)', 'Freight (Rs.)', 'Tax (Rs.)', 'Billed (Rs.)', 'Free qty'], rows: sales.rows.map((r) => [r.name, r.bills, r.sales, r.returns, r.net, r.freight, r.tax, r.billed, r.freeQty]) })} label="Download sales CSV" />}
      {tab === 'recovery' && recovery && <CsvButton fileName={`recovery-list-${asOf}.csv`} table={() => ({ headers: [by === 'salesman' ? 'Salesman' : 'Area', 'Code', 'Customer', 'Phone', 'Oldest bill', 'Days', 'Due (Rs.)'], rows: recovery.groups.flatMap((g) => g.rows.map((r) => [g.name, r.customer.code || '', r.customer.name, r.customer.phone, r.oldestDate || '', r.oldestDays, r.due])) })} label="Download recovery list CSV" />}
      {tab === 'commission' && commission && <CsvButton fileName={`commission-${from}-${to}.csv`} table={() => ({ headers: ['Salesman', 'On', 'Base (Rs.)', '%', 'Earned (Rs.)', 'Paid to date (Rs.)', 'Still owed (Rs.)'], rows: commission.map((r) => [r.salesman.name, r.basis, r.base, r.pct, r.earned, r.paidToDate, r.owed]) })} label="Download commission CSV" />}
      <button type="button" className={secondaryBtn} onClick={() => setPrintRequest(tab === 'sales' ? { type: 'sales_extras', report: 'sales_by', by, from, to } : tab === 'recovery' ? { type: 'sales_extras', report: 'recovery', by, asOf, filterId } : { type: 'sales_extras', report: 'commission', from, to })}>
        <Printer className="w-4 h-4" /> Print
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sales reports" subtitle={tab === 'recovery' ? 'Who owes money, by area or salesman, oldest bill first.' : tab === 'commission' ? 'What each salesman earned, and paying it.' : 'Sales by salesman or area for any dates.'} wide footer={footer}>
      <div className="space-y-4">
        <div role="tablist" aria-label="Sales reports" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {([['sales', 'Sales'], ['recovery', 'Recovery list'], ['commission', 'Commission']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setMsg(null); }} className={pillCls(tab === id, 'teal')}>{label}</button>
          ))}
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

        {tab === 'sales' && sales && (
          <>
            <div className="flex flex-wrap items-end gap-3"><ByToggle by={by} onBy={setBy} />{range}</div>
            {sales.rows.length === 0 ? <EmptyState compact text="No bills in these dates." /> : wide ? (
              <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
                <table className="w-full" data-testid="sales-by-table">
                  <thead className="bg-[#FAF9F6] dark:bg-[#162436]"><tr><th className={`${th} text-left`}>{by === 'salesman' ? 'Salesman' : 'Area'}</th><th className={`${th} text-right`}>Bills</th><th className={`${th} text-right`}>Sales</th><th className={`${th} text-right`}>Returns</th><th className={`${th} text-right`}>Net sales</th><th className={`${th} text-right`}>Freight</th><th className={`${th} text-right`}>Billed</th></tr></thead>
                  <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                    {sales.rows.map((r) => (
                      <tr key={r.id || 'none'}><td className={`${td} font-semibold`}>{r.name}{r.freeQty > 0 && <span className="block text-[11px] font-normal text-[#8E9299]">{r.freeQty} free under schemes</span>}</td><td className={tdNum}>{r.bills}</td><td className={tdNum}>{rs(r.sales)}</td><td className={tdNum}>{r.returns ? `− ${rs(r.returns)}` : '—'}</td><td className={`${tdNum} font-bold`}>{rs(r.net)}</td><td className={tdNum}>{r.freight ? rs(r.freight) : '—'}</td><td className={tdNum}>{rs(r.billed)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#FAF9F6] dark:bg-[#162436] font-bold"><tr><td className={td}>Total</td><td className={tdNum}>{sales.totals.bills}</td><td className={tdNum}>{rs(sales.totals.sales)}</td><td className={tdNum}>{sales.totals.returns ? `− ${rs(sales.totals.returns)}` : '—'}</td><td className={tdNum}>{rs(sales.totals.net)}</td><td className={tdNum}>{rs(sales.totals.freight)}</td><td className={tdNum}>{rs(sales.totals.billed)}</td></tr></tfoot>
                </table>
              </div>
            ) : (
              <ul className="space-y-2" data-testid="sales-by-table">
                {sales.rows.map((r) => (
                  <li key={r.id || 'none'} className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3">
                    <div className="flex justify-between gap-2"><span className="font-semibold text-sm">{r.name}</span><span className={`${moneyCls} font-bold`}>{rs(r.net)}</span></div>
                    <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{r.bills} bill(s) • sales {rs(r.sales)}{r.returns ? ` • returns ${rs(r.returns)}` : ''}{r.freight ? ` • freight ${rs(r.freight)}` : ''}</div>
                  </li>
                ))}
                <li className="flex justify-between px-3 font-bold text-sm"><span>Total net sales</span><span className={moneyCls}>{rs(sales.totals.net)}</span></li>
              </ul>
            )}
          </>
        )}

        {tab === 'recovery' && recovery && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <ByToggle by={by} onBy={(b) => { setBy(b); setFilterId('all'); }} />
              <div><label className={labelCls} htmlFor="rec-filter">{by === 'salesman' ? 'Salesman' : 'Area'}</label>
                <select id="rec-filter" value={filterId} onChange={(e) => setFilterId(e.target.value)} className={`${inputCls} sm:w-auto`}>
                  <option value="all">All</option>
                  {groupList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  <option value="">{by === 'salesman' ? 'No salesman' : 'No area'}</option>
                </select>
              </div>
              <div><label className={labelCls} htmlFor="rec-asof">As of</label><input id="rec-asof" type="date" value={asOf} max={today} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={`${inputCls} sm:w-auto`} /></div>
            </div>
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]"><strong className={moneyCls}>{rs(recovery.total)}</strong> due from {recovery.count} customer(s). Oldest unpaid bill first; payments clear the oldest bills first.</p>
            {recovery.groups.length === 0 ? <EmptyState compact text="Nobody owes you money here." /> : (
              <div className="space-y-3" data-testid="recovery-list">
                {recovery.groups.map((g) => (
                  <div key={g.id || 'none'} className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] overflow-hidden">
                    <div className="flex justify-between gap-2 px-3 py-2 bg-[#FAF9F6] dark:bg-[#162436] text-sm font-bold"><span>{g.name}</span><span className={moneyCls}>{rs(g.total)}</span></div>
                    <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                      {g.rows.map((r) => (
                        <li key={r.customer.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="font-semibold">{r.customer.code ? `${r.customer.code} • ` : ''}{r.customer.name}</span>
                            <span className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{r.customer.phone || 'no phone'}{r.oldestDate ? ` • oldest bill ${formatDate(r.oldestDate)} (${r.oldestDays} days)` : ''}</span>
                          </span>
                          <span className={`${moneyCls} font-bold ${r.oldestDays > 60 ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>{rs(r.due)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'commission' && commission && (
          <>
            {range}
            {commission.length === 0 ? <EmptyState compact text="No salesman has a commission % yet. Set it in Salesmen & areas." /> : (
              <ul className="space-y-2" data-testid="commission-list">
                {commission.map((r: CommissionRow) => (
                  <li key={r.salesman.id} className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{r.salesman.name}</span>
                      <span className={`${moneyCls} font-bold`}>{rs(r.earned)}</span>
                    </div>
                    <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{r.pct}% of {rs(r.base)} {r.basis === 'recovery' ? 'recovered' : 'sold'} in these dates • paid so far {rs(r.paidToDate)} • <strong className={r.owed > 0 ? 'text-amber-700 dark:text-amber-300' : ''}>still owed {rs(r.owed)}</strong></div>
                    {canPay && pay?.salesmanId !== r.salesman.id && r.owed > 0 && <button type="button" onClick={() => { setMsg(null); setPay({ salesmanId: r.salesman.id, amount: String(r.owed), via: 'Cash', date: today, note: '' }); }} className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline"><HandCoins className="w-3.5 h-3.5" /> Pay commission</button>}
                    {pay?.salesmanId === r.salesman.id && (
                      <form onSubmit={submitPay} className="grid grid-cols-2 gap-2 pt-1" data-testid="pay-commission-form">
                        <div><label className={labelCls} htmlFor="pc-amount">Amount (Rs.)</label><input id="pc-amount" type="number" inputMode="decimal" min="0" step="any" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className={`${inputCls} tabular-nums`} /></div>
                        <div><label className={labelCls} htmlFor="pc-via">Paid from</label><select id="pc-via" value={pay.via} onChange={(e) => setPay({ ...pay, via: e.target.value })} className={inputCls}>{PAID_VIA.map((v) => <option key={v}>{v}</option>)}</select></div>
                        <div><label className={labelCls} htmlFor="pc-date">Date</label><input id="pc-date" type="date" value={pay.date} max={today} onChange={(e) => setPay({ ...pay, date: e.target.value })} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="pc-note">Note</label><input id="pc-note" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} className={inputCls} placeholder="e.g. for August" /></div>
                        <div className="col-span-2 flex justify-end gap-2"><button type="button" onClick={() => setPay(null)} className={secondaryBtn}>Cancel</button><button type="submit" className={primaryBtn}>Pay</button></div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">Commission on sales = bills they made (after discounts, before tax and freight) less goods returned. On recovery = cash, bank and cheques collected (bounced cheques taken off). Paying it books a "Salesman commission" expense.</p>
          </>
        )}
      </div>
    </Modal>
  );
};
