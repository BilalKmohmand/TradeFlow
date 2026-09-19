import { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { Account, JournalEntry, buildJournal, combineJournal, mergeAccounts } from '../utils/accounting';

export interface Books {
  accounts: Account[];
  /** Automatic postings derived from bills, payments, expenses, stock... */
  auto: JournalEntry[];
  /** Auto + manual, oldest first. */
  journal: JournalEntry[];
}

/**
 * The general ledger for the current data. Pass `enabled = false` to skip the work
 * (e.g. the print host when no accounting document is open).
 */
export const useAccounting = (enabled = true): Books => {
  const { settings, customers, suppliers, ledger, invoices, dispatches, purchases, expenses, cashEntries, products, returns, adjustments, manualJournals, customAccounts } = useTrading();
  const accounts = useMemo(() => mergeAccounts(customAccounts), [customAccounts]);
  const auto = useMemo(
    () => (enabled ? buildJournal({ settings, customers, suppliers, ledger, invoices, dispatches, purchases, expenses, cashEntries, products, returns, adjustments }) : []),
    [enabled, settings, customers, suppliers, ledger, invoices, dispatches, purchases, expenses, cashEntries, products, returns, adjustments]
  );
  const journal = useMemo(() => (enabled ? combineJournal(auto, manualJournals) : []), [enabled, auto, manualJournals]);
  return { accounts, auto, journal };
};
