import { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
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
  const { settings, customers, suppliers, ledger, invoices, dispatches, purchases, expenses, cashEntries, products, returns, adjustments, manualJournals, customAccounts, fixedAssets, depreciationRuns, salaryRuns } = useTrading();
  const accounts = useMemo(() => mergeAccounts(customAccounts), [customAccounts]);
  const auto = useMemo(
    () =>
      enabled
        ? [
            ...buildJournal({ settings, customers, suppliers, ledger, invoices, dispatches, purchases, expenses, cashEntries, products, returns, adjustments }),
            // Fixed assets, depreciation and advances recovered from salaries (see utils/financeBooks.ts).
            ...buildFinanceJournal({ settings, fixedAssets, depreciationRuns, salaryRuns }),
          ]
        : [],
    [enabled, settings, customers, suppliers, ledger, invoices, dispatches, purchases, expenses, cashEntries, products, returns, adjustments, fixedAssets, depreciationRuns, salaryRuns]
  );
  const journal = useMemo(() => (enabled ? combineJournal(auto, manualJournals) : []), [enabled, auto, manualJournals]);
  return { accounts, auto, journal };
};
