import React, { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { cardCls, inputCls, labelCls, pillCls, secondaryBtn, rs, EmptyState } from '../billing/ui';
import { Account, JournalEntry } from '../../utils/accounting';
import { financialYearOf, monthLabel, monthOf, monthsBetween } from '../../utils/financeBooks';
import { BudgetRow, budgetVsActual } from '../../utils/financeReports';
import { todayISO } from '../../utils/stockFlow';
import { Bar, useFinancialYears } from './common';

type Flash = (r: { success: boolean; message: string }) => void;

const Rows: React.FC<{ title: string; rows: BudgetRow[]; income?: boolean; total: { budget: number; actual: number } }> = ({ title, rows, income, total }) => (
  <div className={`${cardCls} overflow-hidden`}>
    <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
      <h2 className="font-bold">{title}</h2>
      <span className="text-xs tabular-nums text-[#6B7280] dark:text-[#94A3B8]">{rs(total.actual)} of {rs(total.budget)}</span>
    </div>
    {rows.length === 0 ? <EmptyState compact text={`No ${income ? 'income' : 'expenses'} or budget in this period.`} /> : (
      <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
        {rows.map((r) => (
          <li key={r.account.code} className="px-4 sm:px-5 py-3 space-y-1.5" data-testid="budget-row">
            <div className="flex items-start justify-between gap-3 text-sm">
              <span className="font-semibold min-w-0">{r.account.name}</span>
              <span className="tabular-nums text-right shrink-0">{rs(r.actual)} <span className="text-[#8E9299]">/ {r.budget ? rs(r.budget) : 'no budget'}</span></span>
            </div>
            <Bar pct={r.pctUsed} good={income ? 'high' : 'low'} label={`${r.account.name}: ${r.pctUsed ?? 0}% of budget`} />
            <div className="flex justify-between text-[11px] tabular-nums">
              <span className="text-[#8E9299]">{r.pctUsed == null ? 'Set a budget to compare' : `${r.pctUsed}% ${income ? 'of target' : 'used'}`}</span>
              {r.budget > 0 && <span className={r.variance >= 0 ? 'text-teal-700 dark:text-teal-300 font-bold' : 'text-rose-700 dark:text-rose-300 font-bold'}>{r.variance >= 0 ? (income ? `${rs(r.variance)} above target` : `${rs(r.variance)} under budget`) : income ? `${rs(-r.variance)} short of target` : `${rs(-r.variance)} over budget`}</span>}
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
);

/** Accounts → Budgets: set a monthly budget per income / expense account, then compare with actual. */
export const BudgetTab: React.FC<{ journal: JournalEntry[]; accounts: Account[]; flash: Flash }> = ({ journal, accounts, flash }) => {
  const { budgets, setBudget, copyBudget, can } = useTrading();
  const canEdit = can('finance:view_pnl');
  const today = todayISO();
  const { years, fyStart } = useFinancialYears();
  const [mode, setMode] = useState<'compare' | 'set'>('compare');
  const [scope, setScope] = useState<string>(monthOf(today)); // "YYYY-MM" or an FY start date
  const [month, setMonth] = useState(monthOf(today));
  const months = useMemo(() => {
    if (/^\d{4}-\d{2}$/.test(scope)) return [scope];
    const fy = financialYearOf(scope, fyStart);
    return monthsBetween(monthOf(fy.start), monthOf(fy.end));
  }, [scope, fyStart]);
  const report = useMemo(() => budgetVsActual(journal, budgets, months, accounts), [journal, budgets, months, accounts]);
  const budgetable = accounts.filter((a) => a.type === 'income' || a.type === 'expense');
  const valueOf = (code: string) => budgets.find((b) => b.month === month && b.accountCode === code)?.amount ?? '';
  const restOfYear = () => {
    const fy = financialYearOf(`${month}-01`, fyStart);
    return monthsBetween(month, monthOf(fy.end)).filter((m) => m !== month);
  };

  return (
    <div className="space-y-4" data-testid="budget-tab">
      <div className="flex gap-1.5" role="tablist" aria-label="Budget views">
        <button type="button" role="tab" aria-selected={mode === 'compare'} onClick={() => setMode('compare')} className={pillCls(mode === 'compare')}>Budget vs actual</button>
        {canEdit && <button type="button" role="tab" aria-selected={mode === 'set'} onClick={() => setMode('set')} className={pillCls(mode === 'set')}>Set budget</button>}
      </div>

      {mode === 'compare' && (
        <>
          <div className={`${cardCls} p-4 grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 sm:w-fit`}>
            <div className="min-w-0"><label className={labelCls} htmlFor="bud-scope-month">Month</label><input id="bud-scope-month" type="month" value={/^\d{4}-\d{2}$/.test(scope) ? scope : ''} onChange={(e) => e.target.value && setScope(e.target.value)} className={inputCls} /></div>
            <div className="min-w-0"><label className={labelCls} htmlFor="bud-scope-fy">or whole year</label><select id="bud-scope-fy" value={/^\d{4}-\d{2}$/.test(scope) ? '' : scope} onChange={(e) => e.target.value && setScope(e.target.value)} className={inputCls}><option value="">—</option>{years.map((y) => <option key={y.start} value={y.start}>{y.label}</option>)}</select></div>
          </div>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{months.length === 1 ? monthLabel(months[0]) : `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}`}. Actual figures come from the books. Green bars are on track; amber is close to the limit; red is over budget (or short of an income target).</p>
          <Rows title="Income" rows={report.income} income total={report.totalIncome} />
          <Rows title="Expenses" rows={report.expenses} total={report.totalExpenses} />
        </>
      )}

      {mode === 'set' && canEdit && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 sm:px-5 py-4 border-b border-[#E5E5E1] dark:border-[#203248]">
            <div className="w-44"><label className={labelCls} htmlFor="bud-month">Budget for</label><input id="bud-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inputCls} /></div>
            <button type="button" onClick={() => flash(copyBudget(month, restOfYear()))} className={secondaryBtn}><Copy className="w-4 h-4" /> Copy to rest of the year</button>
          </div>
          <p className="px-4 sm:px-5 pt-3 text-xs text-[#6B7280] dark:text-[#94A3B8]">Type how much you plan to spend (or earn) in {monthLabel(month)}. Saved as soon as you leave the box; leave empty for no budget.</p>
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {budgetable.map((a) => (
              <li key={`${month}-${a.code}`} className="px-4 sm:px-5 py-2 flex items-center justify-between gap-3">
                <label htmlFor={`bud-${a.code}`} className="text-sm min-w-0"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{a.code}</span>{a.name}<span className="ml-1.5 text-[10px] uppercase text-[#8E9299]">{a.type}</span></label>
                <input id={`bud-${a.code}`} type="number" inputMode="decimal" min="0" step="any" defaultValue={valueOf(a.code)} placeholder="—"
                  onBlur={(e) => { const v = parseFloat(e.target.value) || 0; const cur = Number(valueOf(a.code)) || 0; if (v !== cur) { const r = setBudget(month, a.code, v); if (!r.success) flash(r); } }}
                  className={`${inputCls} !w-32 tabular-nums text-right`} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
