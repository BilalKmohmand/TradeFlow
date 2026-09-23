import React from 'react';
import { moneyText } from '../../utils/formatters';
import { useTrading } from '../../context/TradingContext';
import { inputCls, labelCls } from '../billing/ui';
import { FinancialYear, financialYearOf, financialYearsBetween, fyStartOf } from '../../utils/financeBooks';
import { todayISO } from '../../utils/stockFlow';

export const fthCls = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap text-left';
export const ftdCls = 'px-3 py-2 text-sm';
export const fnumCls = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';
export const money = (n: number) => moneyText(n);
export const MONEY_METHODS = ['Cash', 'Bank Transfer', 'Easypaisa / JazzCash', 'Cheque'];

/** Optional cost-centre picker (hidden when the shop has no cost centres). */
export const CostCentreSelect: React.FC<{ id: string; value: string; onChange: (v: string) => void; label?: string; compact?: boolean }> = ({ id, value, onChange, label = 'Cost centre (optional)', compact }) => {
  const { costCentres } = useTrading();
  const list = costCentres.filter((c) => c.active || c.id === value);
  if (list.length === 0) return null;
  return (
    <div className="min-w-0">
      {!compact && <label className={labelCls} htmlFor={id}>{label}</label>}
      <select id={id} aria-label={compact ? label : undefined} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">— None —</option>
        {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
};

/** Financial years from when the books started up to the current one (newest first). */
export const useFinancialYears = (): { years: FinancialYear[]; current: FinancialYear; fyStart: string } => {
  const { settings } = useTrading();
  const fyStart = fyStartOf(settings);
  const today = todayISO();
  const first = settings.cashOpeningDate && settings.cashOpeningDate < today ? settings.cashOpeningDate : today;
  return { years: financialYearsBetween(first, today, fyStart), current: financialYearOf(today, fyStart), fyStart };
};

/** From / To dates with a "Financial year" shortcut. */
export const PeriodPicker: React.FC<{ idPrefix: string; from: string; to: string; onChange: (from: string, to: string) => void }> = ({ idPrefix, from, to, onChange }) => {
  const { years } = useFinancialYears();
  const today = todayISO();
  const match = years.find((y) => y.start === from && (y.end === to || (y.end > today && to === today)));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full sm:w-auto">
      <div className="col-span-2 sm:col-span-1 min-w-0">
        <label className={labelCls} htmlFor={`${idPrefix}-fy`}>Financial year</label>
        <select id={`${idPrefix}-fy`} value={match?.label || ''} onChange={(e) => { const y = years.find((x) => x.label === e.target.value); if (y) onChange(y.start, y.end > today ? today : y.end); }} className={inputCls}>
          <option value="">Custom dates</option>
          {years.map((y) => <option key={y.label} value={y.label}>{y.label}</option>)}
        </select>
      </div>
      <div className="min-w-0"><label className={labelCls} htmlFor={`${idPrefix}-from`}>From</label><input id={`${idPrefix}-from`} type="date" value={from} onChange={(e) => onChange(e.target.value || from, to)} className={inputCls} /></div>
      <div className="min-w-0"><label className={labelCls} htmlFor={`${idPrefix}-to`}>To</label><input id={`${idPrefix}-to`} type="date" value={to} onChange={(e) => onChange(from, e.target.value || to)} className={inputCls} /></div>
    </div>
  );
};

/** Horizontal bar: `pct` of the track filled; over 100% shows in red. */
export const Bar: React.FC<{ pct: number | null; good?: 'low' | 'high'; label: string }> = ({ pct, good = 'low', label }) => {
  const v = pct == null ? 0 : pct;
  const over = v > 100;
  const tone = pct == null ? 'bg-[#E5E5E1] dark:bg-[#203248]' : good === 'low' ? (over ? 'bg-rose-500' : v > 85 ? 'bg-amber-500' : 'bg-teal-600') : v >= 100 ? 'bg-teal-600' : v >= 70 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className="h-2.5 w-full rounded-full bg-[#F1F0EC] dark:bg-[#162436] overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
    </div>
  );
};
