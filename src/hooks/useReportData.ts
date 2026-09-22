import { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { useAccounting } from './useAccounting';
import type { ReportData } from '../utils/classicReports';

/**
 * Everything the classic reports read. The books (journal) are only built when `withBooks` is true,
 * and follow the branch picked in the branch filter, like the Accounts screen.
 */
export const useReportData = (withBooks: boolean): ReportData => {
  const t = useTrading();
  const books = useAccounting(withBooks);
  const { settings, customers, suppliers, products, invoices, purchases, returns, adjustments, stockTransfers, stockBatches, godowns, ledger, expenses, cashEntries, purchaseInvoices } = t;
  return useMemo(
    () => ({ settings, customers, suppliers, products, invoices, purchases, returns, adjustments, stockTransfers, stockBatches, godowns, ledger, expenses, cashEntries, purchaseInvoices, journal: books.journal, accounts: books.accounts }),
    [settings, customers, suppliers, products, invoices, purchases, returns, adjustments, stockTransfers, stockBatches, godowns, ledger, expenses, cashEntries, purchaseInvoices, books.journal, books.accounts]
  );
};
