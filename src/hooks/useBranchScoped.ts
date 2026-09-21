import { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { scopeToBranch, settingsForBranch } from '../utils/control';

/**
 * Bills, money rows and settings for the branch picked in the branch filter (all of them while the
 * shop has one branch or "All branches" is picked). Screens read these instead of the raw lists.
 */
export const useBranchScoped = () => {
  const { invoices, ledger, expenses, cashEntries, returns, settings, branchView, mainBranchId } = useTrading();
  return useMemo(() => {
    const scoped = scopeToBranch({ invoices, ledger, expenses, cashEntries, returns }, branchView, mainBranchId);
    return { ...scoped, settings: settingsForBranch(settings, branchView, mainBranchId), branchView };
  }, [invoices, ledger, expenses, cashEntries, returns, settings, branchView, mainBranchId]);
};
