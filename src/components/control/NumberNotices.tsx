import React from 'react';
import { Hash, X } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';

/**
 * Bill numbers that were changed because another device had already used them (or old bills that
 * share a number): shown until dismissed, so a clash is never silent.
 */
export const NumberNoticesBanner: React.FC = () => {
  const { numberNotices, dismissNumberNotice, duplicateBillNumbers } = useTrading();
  if (numberNotices.length === 0 && duplicateBillNumbers.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="number-notices">
      {numberNotices.map((n) => (
        <div key={n.id} role="status" className="flex items-start gap-3 rounded-2xl px-4 py-3 text-sm bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900">
          <Hash className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">{n.text}</span>
          <button type="button" onClick={() => dismissNumberNotice(n.id)} aria-label="Dismiss" className="-m-1.5 p-2.5 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/40"><X className="w-4 h-4" /></button>
        </div>
      ))}
      {duplicateBillNumbers.length > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-2xl px-4 py-3 text-sm bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-900">
          <Hash className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">Two older bills share the number{duplicateBillNumbers.length === 1 ? '' : 's'} {duplicateBillNumbers.slice(0, 5).join(', ')}{duplicateBillNumbers.length > 5 ? '…' : ''}. Search the number on Bills to see both; keep one and re-enter the other if needed.</span>
        </div>
      )}
    </div>
  );
};
