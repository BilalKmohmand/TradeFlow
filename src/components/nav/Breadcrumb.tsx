import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../billing/BillingUI';
import { breadcrumbFor } from '../../utils/navMap';
import { openMenu } from './useNavGo';

/**
 * "Accounts › Vouchers": where the screen on show lives in the five menus, so staff learn the way. The group
 * name opens that menu (the top bar on a desktop, the More sheet on a phone).
 */
export const Breadcrumb: React.FC = () => {
  const { activeScreen } = useTrading();
  const ui = useBillingUI();
  const view = ui.currentView?.screen === activeScreen ? ui.currentView.view : null;
  const crumb = breadcrumbFor(activeScreen, view);
  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumb" className="mb-2 sm:mb-3 min-w-0 print:hidden">
      <ol className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] min-w-0">
        {crumb.group && (
          <>
            <li className="shrink-0">
              <button type="button" onClick={() => openMenu(crumb.group!.id)} aria-label={`Open the ${crumb.group.label} menu`} title={`Everything under ${crumb.group.label}`} className="rounded-md px-1 -mx-1 hover:text-teal-700 dark:hover:text-teal-300 hover:underline">
                {crumb.group.label}
              </button>
            </li>
            <li aria-hidden="true" className="shrink-0"><ChevronRight className="w-3 h-3" /></li>
          </>
        )}
        <li aria-current="page" className="min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{crumb.label}</li>
      </ol>
    </nav>
  );
};
