import { CsvButton } from '../../components/billing/CsvButton';
import { cashBookCsv, expensesCsv } from '../../utils/csvReports';
import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Landmark, ArrowLeftRight, HandCoins, Receipt, Settings2, ChevronRight, Printer, Trash2, Coins } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI, useRequestedView, useCurrentView } from '../../components/billing/BillingUI';
import { useStockUI } from '../../components/billing/StockUI';
import { Tile, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs, PageHeader, EmptyState, RowAction, pillCls, Notice } from '../../components/billing/ui';
import { MAIN_BANK_CODE } from '../../utils/banks';
import { collectCashMovements, accountBalancesOn, positionSummary } from '../../utils/finance';
import { groupExpenses } from '../../utils/billing';
import { todayISO, shiftDate } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { booksLockedFor } from '../../utils/accounting';
import { BankReconciliationTab } from '../../components/billing/BankReconciliationTab';
import { ChequesTab } from '../../components/billing/ChequesTab';
import { unclearedChequeTotals } from '../../utils/cheques';
import { useBranchScoped } from '../../hooks/useBranchScoped';
import { BranchFilter } from '../../components/control/BranchFilter';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EditPaymentButton } from '../../components/billing/EditPaymentModal';
import { BankAccountsCard } from '../../components/billing/BankAccounts';

export type MoneyTab = 'overview' | 'expenses' | 'cashbook' | 'cheques' | 'bank';
/** The Money tabs (the nav map has an entry for each). */
export const MONEY_TABS: readonly MoneyTab[] = ['overview', 'expenses', 'cashbook', 'cheques', 'bank'];
/** Views besides the tabs a menu can ask for: 'opening' = overview with the opening-balances form open. */
export const MONEY_VIEWS: readonly string[] = [...MONEY_TABS, 'opening'];
type Tab = MoneyTab;

/** Where the money is: cash, bank, who owes you, who you owe; plus expense sheets and the cash book. */
export const MoneyScreen: React.FC = () => {
  const { customers, suppliers, settings, updateSettings, setSelectedCustomerId, setSelectedSupplierId, setActiveScreen, setPrintRequest, deleteExpense, can, cheques, isLinkedRecord } = useTrading();
  const canDelete = can('delete_records');
  // Money of the branch picked in the branch filter (everything while there is one branch).
  // Customer / supplier balances are the branch's own when one branch is picked (see partyBalancesForBranch).
  const { ledger, expenses, cashEntries, settings: branchSettings, customers: partyCustomers, suppliers: partySuppliers, wholeShop } = useBranchScoped();
  const { branchName, branchView, bankAccounts } = useTrading();
  // Cash book: every movement, the cash drawer only, or one bank account.
  const [bookAcct, setBookAcct] = useState<string>('all');
  const bankName = (code?: string) => bankAccounts.find((b) => b.code === code)?.name;
  const [pendingExp, setPendingExp] = useState<{ id: string; label: string } | null>(null);
  // Bank reconciliation is book-keeping: staff without finance access (operators) don't see it.
  const canSeeBank = can('view_finance');
  const ui = useBillingUI();
  const stockUI = useStockUI();
  const today = todayISO();
  // The home screen can open Money straight on a tab (e.g. "Cheques due this week").
  const [tab, setTab] = useState<Tab>(() => { const v = ui.peekView('money'); return (MONEY_TABS as readonly string[]).includes(v || '') ? (v as Tab) : 'overview'; });
  const [month, setMonth] = useState(today.slice(0, 7));
  const [showOpening, setShowOpening] = useState(false);
  // Opening balances: cash and every bank account, and the day the books start from.
  const openingForm = () => ({ cash: String(settings.cashOpeningBalance || 0), banks: Object.fromEntries(bankAccounts.map((b) => [b.code, String(b.openingBalance || 0)])) as Record<string, string>, date: settings.cashOpeningDate || '' });
  const [opening, setOpening] = useState(openingForm);
  const [openingError, setOpeningError] = useState('');
  // Menus / search / Home tiles can open a tab (or the opening balances) here.
  useRequestedView('money', (v) => {
    if (v === 'opening') {
      setTab('overview');
      setOpening(openingForm());
      setOpeningError('');
      setShowOpening(true);
    } else if ((MONEY_TABS as readonly string[]).includes(v)) setTab(v as Tab);
  });
  useCurrentView('money', tab === 'overview' && showOpening ? 'opening' : tab);

  const movements = useMemo(() => collectCashMovements(ledger, expenses, cashEntries, customers, suppliers), [ledger, expenses, cashEntries, customers, suppliers]);
  const ledgerById = useMemo(() => new Map(ledger.map((l) => [l.id, l])), [ledger]);
  const balances = useMemo(() => accountBalancesOn(movements, branchSettings, today), [movements, branchSettings, today]);
  const position = useMemo(() => positionSummary(partyCustomers, partySuppliers, expenses, balances), [partyCustomers, partySuppliers, expenses, balances]);
  // Cheques not yet cleared are still the business's money (or still owed): count them in the total.
  const pdc = useMemo(() => unclearedChequeTotals(cheques), [cheques]);
  const netWithCheques = position.netPosition + pdc.receivable - pdc.payable;
  const debtors = useMemo(() => partyCustomers.filter((c) => c.totalDue > 0.005).sort((a, b) => b.totalDue - a.totalDue), [partyCustomers]);
  const creditors = useMemo(() => partySuppliers.filter((s) => s.totalOwed > 0.005).sort((a, b) => b.totalOwed - a.totalOwed), [partySuppliers]);
  // In a branch view a supplier paid from this branch but billed to the main one shows as paid ahead here.
  const supplierAdvances = useMemo(() => partySuppliers.filter((s) => s.totalOwed < -0.005), [partySuppliers]);
  // Customers who paid in advance: the shop owes them goods or money back.
  const advances = useMemo(() => partyCustomers.filter((c) => c.totalDue < -0.005).sort((a, b) => a.totalDue - b.totalDue), [partyCustomers]);
  const unpaidExpenses = useMemo(() => expenses.filter((e) => e.paidVia === 'Credit (unpaid)'), [expenses]);
  const monthExpenses = useMemo(() => groupExpenses(expenses.filter((e) => e.date.startsWith(month))), [expenses, month]);
  const monthTotal = monthExpenses.reduce((a, g) => a + g.total, 0);
  const monthMoves = useMemo(
    () => movements.filter((m) => m.date.startsWith(month) && (bookAcct === 'all' || (bookAcct === 'cash' ? !m.bankCode : m.bankCode === bookAcct))).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [movements, month, bookAcct]
  );

  // One account picked (cash or a bank): a real book — balance brought forward, running balance, balance carried.
  const book = useMemo(() => {
    if (bookAcct === 'all') return null;
    const bal = (asOf: string) => { const b = accountBalancesOn(movements, branchSettings, asOf); return bookAcct === 'cash' ? b.cash : b.banks[bookAcct] || 0; };
    const opening = bal(shiftDate(`${month}-01`, -1));
    let run = opening;
    const rows = [...monthMoves]
      .filter((m) => m.date >= (branchSettings.cashOpeningDate || ''))
      .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))
      .map((m) => { run = Math.round((run + (m.direction === 'in' ? m.amount : -m.amount)) * 100) / 100; return { m, balance: run }; });
    return { opening, rows, closing: run };
  }, [bookAcct, movements, branchSettings, month, monthMoves]);

  const saveOpening = (e: React.FormEvent) => {
    e.preventDefault();
    const date = opening.date || today;
    // Opening balances count in every day after the opening date: changing them would change a closed period.
    const closed = booksLockedFor(settings, settings.cashOpeningDate && settings.cashOpeningDate < date ? settings.cashOpeningDate : date);
    if (closed) return setOpeningError(`Opening balances can't be changed: ${closed}`);
    const amt = (v?: string) => Math.round((parseFloat(v || '') || 0) * 100) / 100;
    const others = Object.fromEntries(bankAccounts.filter((b) => !b.isMain).map((b) => [b.code, amt(opening.banks[b.code])]));
    updateSettings({ cashOpeningBalance: amt(opening.cash), openingBankBalance: amt(opening.banks[MAIN_BANK_CODE]), bankOpenings: { ...(settings.bankOpenings || {}), ...others }, cashOpeningDate: date });
    setOpeningError('');
    setShowOpening(false);
  };

  const tabBtn = (id: Tab, label: string) => (
    <button type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={pillCls(tab === id)}>{label}</button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Money" subtitle="How much is in the business, who owes you, and who you owe.">
        {can('finance:record_payment') && <button type="button" onClick={() => ui.salesExtras('receive_many')} className={secondaryBtn}><HandCoins className="w-4 h-4 text-teal-700 dark:text-teal-300" /> Receive from many</button>}
        <BranchFilter />
        <button type="button" onClick={() => ui.receive()} className={`${primaryBtn} max-sm:flex-1`}><HandCoins className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Receive payment</button>
      </PageHeader>
      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]" aria-label="Money views">{tabBtn('overview', 'Overview')}{tabBtn('expenses', 'Expense sheets')}{tabBtn('cashbook', 'Cash book')}{tabBtn('cheques', 'Cheques')}{canSeeBank && tabBtn('bank', 'Bank reconciliation')}</div>

      {tab === 'overview' && (
        <>
          {!wholeShop && (
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] -mt-2" data-testid="branch-balances-note">
              {branchName(branchView)} only: customer and supplier balances come from this branch's bills and payments. Records with no branch (older ones, opening balances, stock bought) count as {branchName(null)}.
            </p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Cash in hand" value={rs(balances.cash)} icon={<Banknote className="w-4 h-4" />} />
            <Tile label="In bank" value={rs(balances.bank)} icon={<Landmark className="w-4 h-4" />} />
            <Tile label="Customers owe you" value={rs(position.receivables)} tone="good" hint={`${debtors.length} customer${debtors.length === 1 ? '' : 's'}`} />
            <Tile label="You owe others" value={rs(position.payables)} tone={position.payables > 0 ? 'bad' : 'default'} hint={`${creditors.length} supplier${creditors.length === 1 ? '' : 's'}${unpaidExpenses.length ? ` + ${unpaidExpenses.length} unpaid expense${unpaidExpenses.length === 1 ? '' : 's'}` : ''}`} />
          </div>
          <div className={`${cardCls} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Money in the business</div>
              <div className={`text-2xl sm:text-3xl font-extrabold tabular-nums ${netWithCheques >= 0 ? 'text-[#111827] dark:text-white' : 'text-rose-700 dark:text-rose-300'}`}>{rs(netWithCheques)}</div>
              <div className="text-xs text-[#6B7280] dark:text-[#8E9299] mt-0.5">cash {rs(balances.cash)} + bank {rs(balances.bank)} + owed to you {rs(position.receivables)} − you owe {rs(position.payables)}{pdc.receivable > 0 ? ` + cheques in hand ${rs(pdc.receivable)}` : ''}{pdc.payable > 0 ? ` − cheques not yet cleared ${rs(pdc.payable)}` : ''}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => ui.transfer()} className={secondaryBtn}><ArrowLeftRight className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /> Cash ↔ Bank</button>
              <button type="button" onClick={() => { setOpening(openingForm()); setOpeningError(''); setShowOpening((v) => !v); }} aria-expanded={showOpening} className={secondaryBtn}><Settings2 className="w-4 h-4" /> Opening balances</button>
            </div>
          </div>
          {showOpening && (
            <form onSubmit={saveOpening} data-nav-anchor="opening" aria-label="Opening balances" className={`${cardCls} p-5 space-y-3`}>
              <div>
                <h2 className="font-bold text-[#111827] dark:text-white">Opening balances</h2>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">What was in the cash drawer and in each bank account on the day the books start.</p>
              </div>
              {openingError && <Notice kind="error">{openingError}</Notice>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div><label className={labelCls} htmlFor="op-date">Counting from</label><input id="op-date" type="date" value={opening.date} max={today} onChange={(e) => setOpening({ ...opening, date: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls} htmlFor="op-cash">Cash on opening day</label><input id="op-cash" type="number" inputMode="decimal" step="any" value={opening.cash} onChange={(e) => setOpening({ ...opening, cash: e.target.value })} className={`${inputCls} tabular-nums`} /></div>
                {bankAccounts.map((b) => (
                  <div key={b.code}>
                    <label className={labelCls} htmlFor={b.isMain ? 'op-bank' : `op-bank-${b.code}`}>{bankAccounts.length > 1 ? `${b.name} on opening day` : 'Bank on opening day'}</label>
                    <input id={b.isMain ? 'op-bank' : `op-bank-${b.code}`} type="number" inputMode="decimal" step="any" value={opening.banks[b.code] ?? ''} onChange={(e) => setOpening({ ...opening, banks: { ...opening.banks, [b.code]: e.target.value } })} className={`${inputCls} tabular-nums`} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowOpening(false)} className={secondaryBtn}>Cancel</button>
                <button type="submit" className={primaryBtn}>Save opening balances</button>
              </div>
            </form>
          )}
          <div data-nav-anchor="bank-accounts"><BankAccountsCard balances={balances.banks} onOpenBank={(code) => { setBookAcct(code); setTab('cashbook'); }} /></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${cardCls} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]"><h2 className="font-bold text-[#111827] dark:text-white">Customers owe you</h2><span className="flex items-center gap-2 ml-auto"><button type="button" onClick={() => stockUI.aging('customers')} className="text-xs font-bold text-teal-700 dark:text-teal-300 min-h-9 px-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40">How long?</button><span className="tabular-nums whitespace-nowrap font-bold text-sm text-teal-700 dark:text-teal-300">{rs(position.receivables)}</span></span></div>
              {debtors.length + supplierAdvances.length === 0 ? <div className="px-5 py-5 text-sm text-[#6B7280] dark:text-[#94A3B8]">Nobody owes you anything.</div> : (
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]" data-testid="money-debtors">
                  {debtors.map((c) => (
                    <li key={c.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 pl-4 sm:pl-5 pr-2 py-2 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                      <button type="button" onClick={() => { setSelectedCustomerId(c.id); setActiveScreen('customers'); }} className="flex-1 min-w-0 text-left py-1"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{c.name}</span><span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">{c.phone}</span></button>
                      <span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(c.totalDue)}</span>
                      <span className="max-sm:w-full flex justify-end gap-1"><RowAction label={`Receive payment from ${c.name}`} text="Receive" alwaysText tone="teal" icon={<HandCoins className="w-4 h-4" />} onClick={() => ui.receive(c.id)} />
                      <RowAction label={`Print statement for ${c.name}`} icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'statement', customerId: c.id, from: `${today.slice(0, 4)}-01-01`, to: today })} /></span>
                    </li>
                  ))}
                  {supplierAdvances.map((x) => (
                    <li key={x.id} className="flex items-center gap-2 px-4 sm:px-5 py-2.5">
                      <button type="button" onClick={() => { setSelectedSupplierId(x.id); setActiveScreen('suppliers'); }} className="flex-1 min-w-0 text-left"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{x.company || x.name}</span><span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">supplier paid ahead{wholeShop ? '' : ' from this branch'}</span></button>
                      <span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(-x.totalOwed)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={`${cardCls} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]"><h2 className="font-bold text-[#111827] dark:text-white">You owe</h2><span className="flex items-center gap-2 ml-auto"><button type="button" onClick={() => stockUI.aging('suppliers')} className="text-xs font-bold text-teal-700 dark:text-teal-300 min-h-9 px-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40">How long?</button><span className="tabular-nums whitespace-nowrap font-bold text-sm text-rose-700 dark:text-rose-300">{rs(position.payables)}</span></span></div>
              {creditors.length + unpaidExpenses.length + advances.length === 0 ? <div className="px-5 py-5 text-sm text-[#6B7280] dark:text-[#94A3B8]">You owe nothing right now.</div> : (
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                  {creditors.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-4 sm:px-5 py-2.5 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                      <button type="button" onClick={() => { setSelectedSupplierId(s.id); setActiveScreen('suppliers'); }} className="flex-1 min-w-0 text-left"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{s.company || s.name}</span><span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">supplier • {s.phone}</span></button>
                      <span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(s.totalOwed)}</span>
                    </li>
                  ))}
                  {advances.map((c) => (
                    <li key={c.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 pl-4 sm:pl-5 pr-2 py-2 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                      <button type="button" onClick={() => { setSelectedCustomerId(c.id); setActiveScreen('customers'); }} className="flex-1 min-w-0 text-left py-1"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{c.name}</span><span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">customer paid in advance</span></button>
                      <span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(-c.totalDue)}</span>
                    </li>
                  ))}
                  {unpaidExpenses.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 px-5 py-2.5">
                      <span className="flex-1 min-w-0"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{e.description}</span><span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">unpaid expense • {formatDate(e.date)}</span></span>
                      <span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => setActiveScreen('suppliers')} className="w-full px-5 py-2.5 text-left text-xs font-bold text-teal-700 dark:text-teal-300 border-t border-[#F1F0EC] dark:border-[#1E2E40] inline-flex items-center gap-1">Suppliers & payments <ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </>
      )}

      {tab === 'bank' && canSeeBank && <BankReconciliationTab />}

      {tab === 'cheques' && <ChequesTab />}

      {(tab === 'expenses' || tab === 'cashbook') && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-bold text-[#6B7280] dark:text-[#94A3B8]" htmlFor="money-month">Month</label>
          <input id="money-month" type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputCls} !w-auto`} />
          <span className="ml-auto" />
          {tab === 'expenses' && <CsvButton fileName={`expenses-${month}.csv`} table={() => expensesCsv(monthExpenses.flatMap((g) => g.rows))} label="Download expenses CSV" />}
          {tab === 'cashbook' && (
            <select aria-label="Cash book account" data-testid="cashbook-account" value={bookAcct} onChange={(e) => setBookAcct(e.target.value)} className={`${inputCls} !w-auto`}>
              <option value="all">Cash and all banks</option>
              <option value="cash">Cash in hand</option>
              {bankAccounts.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          )}
          {tab === 'cashbook' && <CsvButton fileName={`cash-book-${month}.csv`} table={() => cashBookCsv(monthMoves)} label="Download cash book CSV" />}
          {tab === 'expenses' && <button type="button" onClick={() => ui.addExpense()} className={primaryBtn}><Receipt className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Add expense</button>}
        </div>
      )}

      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className={`${cardCls} p-4 sm:p-5 flex items-center justify-between gap-3`}><span className="font-bold text-[#111827] dark:text-white">Total expenses this month</span><span className="tabular-nums whitespace-nowrap font-extrabold text-xl text-rose-700 dark:text-rose-300">{rs(monthTotal)}</span></div>
          {monthExpenses.length === 0 ? <div className={cardCls}><EmptyState compact icon={<Receipt className="w-5 h-5" />} text="No expenses recorded this month." action={<button type="button" onClick={() => ui.addExpense()} className={secondaryBtn}><Receipt className="w-4 h-4" /> Add expense</button>} /></div> : monthExpenses.map((g) => (
            <div key={g.category} className={`${cardCls} overflow-hidden`}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]"><h2 className="font-bold text-[#111827] dark:text-white">{g.label} sheet</h2><span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(g.total)}</span></div>
              <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {g.rows.sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => (
                  <li key={e.id} className="flex items-center gap-2 pl-4 sm:pl-5 pr-2 py-2 min-h-12 text-sm hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors"><span className="text-xs text-[#6B7280] dark:text-[#8E9299] w-20 shrink-0 tabular-nums">{formatDate(e.date)}</span><span className="flex-1 min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{e.description}<span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]"> • {e.paidVia || 'Cash'}{e.createdBy ? ` • ${e.createdBy}` : ''}</span></span><span className="tabular-nums whitespace-nowrap font-bold">{rs(e.amount)}</span>{canDelete && !booksLockedFor(settings, e.date) && !isLinkedRecord(e.id) && <RowAction label={`Delete expense ${e.description}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPendingExp({ id: e.id, label: `${e.description} (${rs(e.amount)})` })} />}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'cashbook' && !book && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="grid grid-cols-3 text-center divide-x divide-[#E5E5E1] dark:divide-[#203248] border-b border-[#E5E5E1] dark:border-[#203248]">
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">In</div><div className="tabular-nums whitespace-nowrap font-bold text-teal-700 dark:text-teal-300">{rs(monthMoves.filter((m) => m.direction === 'in').reduce((a, m) => a + m.amount, 0))}</div></div>
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Out</div><div className="tabular-nums whitespace-nowrap font-bold text-rose-700 dark:text-rose-300">{rs(monthMoves.filter((m) => m.direction === 'out').reduce((a, m) => a + m.amount, 0))}</div></div>
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Entries</div><div className="tabular-nums whitespace-nowrap font-bold">{monthMoves.length}</div></div>
          </div>
          {monthMoves.length === 0 ? <EmptyState compact icon={<Coins className="w-5 h-5" />} text="No money moved this month." /> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {monthMoves.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-4 sm:px-5 py-2.5 text-sm hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors"><span className="text-xs text-[#6B7280] dark:text-[#8E9299] w-20 shrink-0 tabular-nums">{formatDate(m.date)}</span><span className="flex-1 min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{m.counterparty ? `${m.counterparty} • ` : ''}{m.description}<span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]"> • {m.method || 'Cash'}{m.bankCode && bankAccounts.length > 1 ? ` • ${bankName(m.bankCode) || m.bankCode}` : ''}</span></span><span className={`tabular-nums whitespace-nowrap font-bold ${m.direction === 'in' ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>{m.direction === 'in' ? '+' : '−'} {rs(m.amount)}</span><EditPaymentButton row={ledgerById.get(m.sourceId)} /></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {tab === 'cashbook' && book && (
        <div className={`${cardCls} overflow-hidden`} data-testid="account-book">
          <div className="grid grid-cols-2 sm:grid-cols-4 text-center divide-x divide-[#E5E5E1] dark:divide-[#203248] border-b border-[#E5E5E1] dark:border-[#203248] max-sm:[&>*:nth-child(3)]:border-l-0 max-sm:[&>*:nth-child(-n+2)]:border-b max-sm:[&>*:nth-child(-n+2)]:border-[#E5E5E1] dark:max-sm:[&>*:nth-child(-n+2)]:border-[#203248]">
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Brought forward</div><div className="tabular-nums whitespace-nowrap font-bold" data-testid="book-opening">{rs(book.opening)}</div></div>
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">In</div><div className="tabular-nums whitespace-nowrap font-bold text-teal-700 dark:text-teal-300">{rs(book.rows.filter((r) => r.m.direction === 'in').reduce((a, r) => a + r.m.amount, 0))}</div></div>
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Out</div><div className="tabular-nums whitespace-nowrap font-bold text-rose-700 dark:text-rose-300">{rs(book.rows.filter((r) => r.m.direction === 'out').reduce((a, r) => a + r.m.amount, 0))}</div></div>
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Balance</div><div className={`tabular-nums whitespace-nowrap font-bold ${book.closing < 0 ? 'text-rose-700 dark:text-rose-300' : ''}`} data-testid="book-closing">{rs(book.closing)}</div></div>
          </div>
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            <li className="flex items-center gap-2 px-4 sm:px-5 py-2.5 text-sm font-semibold bg-[#FAF9F6] dark:bg-[#162436]"><span className="text-xs text-[#6B7280] dark:text-[#8E9299] w-20 shrink-0 tabular-nums">{formatDate(`${month}-01`)}</span><span className="flex-1 min-w-0">Balance brought forward</span><span className="tabular-nums whitespace-nowrap">{rs(book.opening)}</span></li>
            {book.rows.map(({ m, balance }) => (
              <li key={m.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 px-4 sm:px-5 py-2.5 text-sm hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors" data-testid="book-row">
                <span className="text-xs text-[#6B7280] dark:text-[#8E9299] w-20 shrink-0 tabular-nums">{formatDate(m.date)}</span>
                <span className="flex-1 min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{m.counterparty ? `${m.counterparty} • ` : ''}{m.description}<span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]"> • {m.method || 'Cash'}</span></span>
                <span className={`tabular-nums whitespace-nowrap font-bold ${m.direction === 'in' ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>{m.direction === 'in' ? '+' : '−'} {rs(m.amount)}</span>
                <EditPaymentButton row={ledgerById.get(m.sourceId)} />
                <span className="max-sm:w-full max-sm:text-right sm:w-32 shrink-0 text-right tabular-nums whitespace-nowrap text-xs text-[#6B7280] dark:text-[#94A3B8]" data-testid="book-balance">bal {rs(balance)}</span>
              </li>
            ))}
            {book.rows.length === 0 && <li className="px-5 py-5 text-sm text-center text-[#6B7280] dark:text-[#94A3B8]">No money moved in this account this month.</li>}
          </ul>
        </div>
      )}
      <ConfirmDialog
        isOpen={Boolean(pendingExp)}
        title="Delete this expense?"
        message={`${pendingExp?.label || ''} is removed. A copy is kept in Admin → Deleted records.`}
        confirmLabel="Delete"
        onCancel={() => setPendingExp(null)}
        onConfirm={() => { if (pendingExp) deleteExpense(pendingExp.id); setPendingExp(null); }}
      />
    </div>
  );
};
