import { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { partyBalancesForBranch, scopeToBranch, settingsForBranch } from '../utils/control';

/**
 * Bills, money rows, settings and customer / supplier balances for the branch picked in the branch
 * filter (all of them while the shop has one branch or "All branches" is picked). Screens read these
 * instead of the raw lists. `customers[].totalDue` / `suppliers[].totalOwed` are the branch's own
 * balances (see partyBalancesForBranch); `wholeShop` is true when nothing is filtered.
 */
export const useBranchScoped = () => {
  const { invoices, ledger, expenses, cashEntries, returns, settings, branchView, mainBranchId, customers, suppliers } = useTrading();
  return useMemo(() => {
    const scoped = scopeToBranch({ invoices, ledger, expenses, cashEntries, returns }, branchView, mainBranchId);
    const parties = partyBalancesForBranch({ invoices, ledger, expenses, cashEntries, returns, customers, suppliers }, branchView, mainBranchId);
    const wholeShop = !branchView || branchView === 'all';
    return {
      ...scoped,
      ...parties,
      settings: settingsForBranch(settings, branchView, mainBranchId),
      branchView,
      wholeShop,
      /** The main branch (or the whole shop) also carries what has no branch: stock, adjustments, fixed assets, manual journals. */
      branchPart: (wholeShop ? 'all' : branchView === mainBranchId ? 'main' : 'other') as 'all' | 'main' | 'other',
      /** Whole-shop bills and returns (opening stock is worked out from all of them). */
      allInvoices: invoices,
      allReturns: returns,
    };
  }, [invoices, ledger, expenses, cashEntries, returns, settings, branchView, mainBranchId, customers, suppliers]);
};
