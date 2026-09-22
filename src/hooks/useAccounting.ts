import { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { useBranchScoped } from './useBranchScoped';
import { Account, JournalEntry, buildJournal, combineJournal, mergeAccounts } from '../utils/accounting';
import { buildFinanceJournal } from '../utils/financeBooks';

export interface Books {
  accounts: Account[];
  /** Automatic postings derived from bills, payments, expenses, stock, fixed assets, salaries... */
  auto: JournalEntry[];
  /** Auto + manual, oldest first. */
  journal: JournalEntry[];
}

/**
 * The general ledger for the current data. Pass `enabled = false` to skip the work
 * (e.g. the print host when no accounting document is open).
 */
export const useAccounting = (enabled = true): Books => {
  const { dispatches, purchases, products, adjustments, manualJournals, customAccounts, fixedAssets, depreciationRuns, salaryRuns } = useTrading();
  // Bills, money rows, opening balances and customer / supplier balances of the branch picked in the
  // branch filter (all while there is one branch). Stock, fixed assets and manual journals carry no
  // branch: they belong to the main branch, so another branch's books leave them out.
  const { settings, ledger, invoices, expenses, cashEntries, returns, customers, suppliers, branchPart, allInvoices, allReturns } = useBranchScoped();
  const accounts = useMemo(() => mergeAccounts(customAccounts), [customAccounts]);
  const auto = useMemo(
    () =>
      enabled
        ? [
            ...buildJournal({ settings, customers, suppliers, ledger, invoices, dispatches, purchases, expenses, cashEntries, products, returns, adjustments, branchPart, stockInvoices: allInvoices, stockReturns: allReturns }),
            // Fixed assets, depreciation and advances recovered from salaries (see utils/financeBooks.ts).
            ...(branchPart === 'other' ? [] : buildFinanceJournal({ settings, fixedAssets, depreciationRuns, salaryRuns })),
          ]
        : [],
    [enabled, settings, customers, suppliers, ledger, invoices, dispatches, purchases, expenses, cashEntries, products, returns, adjustments, fixedAssets, depreciationRuns, salaryRuns, branchPart, allInvoices, allReturns]
  );
  const journal = useMemo(() => (enabled ? combineJournal(auto, branchPart === 'other' ? [] : manualJournals) : []), [enabled, auto, manualJournals, branchPart]);
  return { accounts, auto, journal };
};
