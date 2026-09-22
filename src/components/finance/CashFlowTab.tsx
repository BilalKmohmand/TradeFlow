import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { cardCls, secondaryBtn, rs } from '../billing/ui';
import { Account, JournalEntry } from '../../utils/accounting';
import { CASH_FLOW_LINES, CashFlowStatement, cashFlowStatement, keyRatios } from '../../utils/financeReports';
import { todayISO } from '../../utils/stockFlow';
import { PeriodPicker } from './common';

const Section: React.FC<{ cf: CashFlowStatement; id: 'operating' | 'investing' | 'financing' | 'opening'; title: string; help: string; total: number }> = ({ cf, id, title, help, total }) => {
  const lines = CASH_FLOW_LINES.filter((l) => l.section === id).flatMap((l) => [
    cf.flows[l.id].in ? { key: `${l.id}-in`, label: l.inLabel, v: cf.flows[l.id].in } : null,
    cf.flows[l.id].out ? { key: `${l.id}-out`, label: l.outLabel, v: -cf.flows[l.id].out } : null,
  ]).filter(Boolean) as { key: string; label: string; v: number }[];
  if (id === 'opening' && lines.length === 0) return null;
  return (
    <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">{title}</div>
      <div className="text-[11px] text-[#8E9299] mb-1">{help}</div>
      {lines.length === 0 && <div className="text-sm text-[#8E9299]">No money moved.</div>}
      {lines.map((l) => (
        <div key={l.key} className="flex justify-between gap-3 text-sm py-0.5"><span>{l.label}</span><span className={`tabular-nums ${l.v < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-teal-700 dark:text-teal-300'}`}>{l.v < 0 ? '− ' : '+ '}{rs(Math.abs(l.v))}</span></div>
      ))}
      <div className="flex justify-between gap-3 text-sm font-bold pt-1 mt-1 border-t border-[#F1F0EC] dark:border-[#1E2E40]"><span>Net</span><span className="tabular-nums" data-testid={`cf-${id}`}>{total < 0 ? '− ' : ''}{rs(Math.abs(total))}</span></div>
    </div>
  );
};

/** Accounts → Cash flow & ratios. */
export const CashFlowTab: React.FC<{ journal: JournalEntry[]; accounts: Account[] }> = ({ journal, accounts }) => {
  const { setPrintRequest } = useTrading();
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const cf = useMemo(() => cashFlowStatement(journal, from, to, accounts), [journal, from, to, accounts]);
  const ratios = useMemo(() => keyRatios(journal, from, to, accounts), [journal, from, to, accounts]);
  return (
    <div className="space-y-4" data-testid="cashflow-tab">
      <div className={`${cardCls} p-4 flex flex-wrap items-end justify-between gap-3`}>
        <PeriodPicker idPrefix="cf" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <button type="button" onClick={() => setPrintRequest({ type: 'cash_flow', from, to })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print</button>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
          <h2 className="font-bold">Cash flow statement</h2>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Where the money in cash and bank came from and where it went. Profit is not the same as cash: selling on credit is profit now but cash later.</p>
        </div>
        <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248] flex justify-between font-bold text-sm"><span>Cash & bank at the start</span><span className="tabular-nums" data-testid="cf-opening">{rs(cf.opening)}</span></div>
        <Section cf={cf} id="opening" title="Brought in when the books started" help="Opening balances typed in when you started using the app." total={cf.openingBroughtIn} />
        <Section cf={cf} id="operating" title="From running the shop" help="Customers paying, suppliers and expenses paid, salaries." total={cf.operating} />
        <Section cf={cf} id="investing" title="Fixed assets" help="Vehicles, generators and fittings bought or sold." total={cf.investing} />
        <Section cf={cf} id="financing" title="Owner and loans" help="Money the owner put in or took out, loans taken or repaid." total={cf.financing} />
        <div className="px-4 sm:px-5 py-3 flex justify-between font-extrabold"><span>Cash & bank at the end</span><span className="tabular-nums" data-testid="cf-closing">{rs(cf.closing)}</span></div>
        {Math.abs(cf.difference) >= 0.01 && <div className="px-4 sm:px-5 pb-3 text-xs text-rose-700">Does not add up by {rs(cf.difference)}.</div>}
      </div>

      <div>
        <h2 className="font-bold mb-2">Key ratios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ratios.map((r) => (
            <div key={r.id} className={`${cardCls} p-4`} data-testid={`ratio-${r.id}`}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">{r.label}</div>
              <div className="text-2xl font-extrabold tabular-nums mt-1">{r.value == null ? '—' : r.unit === '%' ? `${r.value}%` : r.unit === 'x' ? `${r.value} : 1` : `${r.value} days`}</div>
              <p className="text-sm mt-1">{r.reading}</p>
              <p className="text-[11px] text-[#8E9299] mt-1">{r.explain}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
