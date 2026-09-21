import React from 'react';
import { Store } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';

/** "Branch: All / Batkhela / Mingora" — only shown once the shop has two or more branches. One choice for all screens. */
export const BranchFilter: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { branchesEnabled, branches, branchView, setBranchView } = useTrading();
  if (!branchesEnabled) return null;
  return (
    <label className={`inline-flex items-center gap-2 min-h-11 sm:min-h-9 pl-3 pr-1 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] bg-white dark:bg-[#101A26] text-xs font-bold text-[#6B7280] dark:text-[#94A3B8] ${className}`}>
      <Store className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">Branch</span>
      <select
        aria-label="Branch"
        data-testid="branch-filter"
        value={branchView}
        onChange={(e) => setBranchView(e.target.value)}
        className="bg-transparent py-1.5 pr-2 text-sm sm:text-xs font-bold text-[#111827] dark:text-white focus:outline-hidden max-w-[11rem]"
      >
        <option value="all">All branches</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );
};
