import { CsvButton } from '../../components/billing/CsvButton';
import { cashBookCsv, expensesCsv } from '../../utils/csvReports';
import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Landmark, ArrowLeftRight, HandCoins, Receipt, Settings2, ChevronRight, Printer, Trash2, Coins } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { useStockUI } from '../../components/billing/StockUI';
import { Tile, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs, PageHeader, EmptyState, RowAction, pillCls } from '../../components/billing/ui';
import { collectCashMovements, accountBalancesOn, positionSummary } from '../../utils/finance';
import { groupExpenses } from '../../utils/billing';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { booksLockedFor } from '../../utils/accounting';
import { BankReconciliationTab } from '../../components/billing/BankReconciliationTab';
import { ChequesTab } from '../../components/billing/ChequesTab';
import { unclearedChequeTotals } from '../../utils/cheques';
import { useBranchScoped } from '../../hooks/useBranchScoped';
import { BranchFilter } from '../../components/control/BranchFilter';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export type MoneyTab = 'overview' | 'expenses' | 'cashbook' | 'cheques' | 'bank';
type Tab = MoneyTab;

/** Where the money is: cash, bank, who owes you, who you owe; plus expense sheets and the cash book. */
export const MoneyScreen: React.FC = () => {
  const { customers, suppliers, settings, updateSettings, setSelectedCustomerId, setSelectedSupplierId, setActiveScreen, setPrintRequest, deleteExpense, can, cheques, isChequeRecord } = useTrading();
  const canDelete = can('delete_records');
  // Money of the branch picked in the branch filter (everything while there is one branch).
  const { ledger, expenses, cashEntries, settings: branchSettings } = useBranchScoped();
  const [pendingExp, setPendingExp] = useState<{ id: string; label: string } | null>(null);
  // Bank reconciliation is book-keeping: staff without finance access (operators) don't see it.
  const canSeeBank = can('view_finance');
  const ui = useBillingUI();
  const stockUI = useStockUI();
  const today = todayISO();
  // The home screen can open Money straight on a tab (e.g. "Cheques due this week").
  const [tab, setTab] = useState<Tab>(() => ui.peekMoneyTab() || 'overview');
  useEffect(() => { ui.openMoneyTab(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [month, setMonth] = useState(today.slice(0, 7));
  const [showOpening, setShowOpening] = useState(false);
  const [opening, setOpening] = useState({ cash: String(settings.cashOpeningBalance || 0), bank: String(settings.openingBankBalance || 0), date: settings.cashOpeningDate });

  const movements = useMemo(() => collectCashMovements(ledger, expenses, cashEntries, customers, suppliers), [ledger, expenses, cashEntries, customers, suppliers]);
  const balances = useMemo(() => accountBalancesOn(movements, branchSettings, today), [movements, branchSettings, today]);
  const position = useMemo(() => positionSummary(customers, suppliers, expenses, balances), [customers, suppliers, expenses, balances]);
  // Cheques not yet cleared are still the business's money (or still owed): count them in the total.
  const pdc = useMemo(() => unclearedChequeTotals(cheques), [cheques]);
  const netWithCheques = position.netPosition + pdc.receivable - pdc.payable;
  const debtors = useMemo(() => customers.filter((c) => c.totalDue > 0).sort((a, b) => b.totalDue - a.totalDue), [customers]);
  const creditors = useMemo(() => suppliers.filter((s) => s.totalOwed > 0).sort((a, b) => b.totalOwed - a.totalOwed), [suppliers]);
  // Customers who paid in advance: the shop owes them goods or money back.
  const advances = useMemo(() => customers.filter((c) => c.totalDue < 0).sort((a, b) => a.totalDue - b.totalDue), [customers]);
  const unpaidExpenses = useMemo(() => expenses.filter((e) => e.paidVia === 'Credit (unpaid)'), [expenses]);
  const monthExpenses = useMemo(() => groupExpenses(expenses.filter((e) => e.date.startsWith(month))), [expenses, month]);
  const monthTotal = monthExpenses.reduce((a, g) => a + g.total, 0);
  const monthMoves = useMemo(() => movements.filter((m) => m.date.startsWith(month)).sort((a, b) => (a.date < b.date ? 1 : -1)), [movements, month]);

  const saveOpening = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({ cashOpeningBalance: parseFloat(opening.cash) || 0, openingBankBalance: parseFloat(opening.bank) || 0, cashOpeningDate: opening.date || today });
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
              <button type="button" onClick={() => { setOpening({ cash: String(settings.cashOpeningBalance || 0), bank: String(settings.openingBankBalance || 0), date: settings.cashOpeningDate }); setShowOpening((v) => !v); }} className={secondaryBtn}><Settings2 className="w-4 h-4" /> Opening balances</button>
            </div>
          </div>
          {showOpening && (
            <form onSubmit={saveOpening} className={`${cardCls} p-5 grid grid-cols-1 sm:grid-cols-4 gap-3`}>
              <div><label className={labelCls} htmlFor="op-cash">Cash on opening day</label><input id="op-cash" type="number" inputMode="decimal" step="any" value={opening.cash} onChange={(e) => setOpening({ ...opening, cash: e.target.value })} className={`${inputCls} tabular-nums`} /></div>
              <div><label className={labelCls} htmlFor="op-bank">Bank on opening day</label><input id="op-bank" type="number" inputMode="decimal" step="any" value={opening.bank} onChange={(e) => setOpening({ ...opening, bank: e.target.value })} className={`${inputCls} tabular-nums`} /></div>
              <div><label className={labelCls} htmlFor="op-date">Counting from</label><input id="op-date" type="date" value={opening.date} onChange={(e) => setOpening({ ...opening, date: e.target.value })} className={inputCls} /></div>
              <div className="flex items-end"><button type="submit" className={`${primaryBtn} w-full`}>Save</button></div>
            </form>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${cardCls} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]"><h2 className="font-bold text-[#111827] dark:text-white">Customers owe you</h2><span className="flex items-center gap-2 ml-auto"><button type="button" onClick={() => stockUI.aging('customers')} className="text-xs font-bold text-teal-700 dark:text-teal-300 min-h-9 px-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40">How long?</button><span className="tabular-nums whitespace-nowrap font-bold text-sm text-teal-700 dark:text-teal-300">{rs(position.receivables)}</span></span></div>
              {debtors.length === 0 ? <div className="px-5 py-5 text-sm text-[#6B7280] dark:text-[#94A3B8]">Nobody owes you anything.</div> : (
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                  {debtors.map((c) => (
                    <li key={c.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 pl-4 sm:pl-5 pr-2 py-2 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                      <button type="button" onClick={() => setSelectedCustomerId(c.id)} className="flex-1 min-w-0 text-left py-1"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{c.name}</span><span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">{c.phone}</span></button>
                      <span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(c.totalDue)}</span>
                      <span className="max-sm:w-full flex justify-end gap-1"><RowAction label={`Receive payment from ${c.name}`} text="Receive" alwaysText tone="teal" icon={<HandCoins className="w-4 h-4" />} onClick={() => ui.receive(c.id)} />
                      <RowAction label={`Print statement for ${c.name}`} icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'statement', customerId: c.id, from: `${today.slice(0, 4)}-01-01`, to: today })} /></span>
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
                      <button type="button" onClick={() => setSelectedSupplierId(s.id)} className="flex-1 min-w-0 text-left"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{s.company || s.name}</span><span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">supplier • {s.phone}</span></button>
                      <span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white">{rs(s.totalOwed)}</span>
                    </li>
                  ))}
                  {advances.map((c) => (
                    <li key={c.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 pl-4 sm:pl-5 pr-2 py-2 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                      <button type="button" onClick={() => setSelectedCustomerId(c.id)} className="flex-1 min-w-0 text-left py-1"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{c.name}</span><span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">customer paid in advance</span></button>
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
          <input id="money-month" type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputCls} w-auto`} />
          <span className="ml-auto" />
          {tab === 'expenses' && <CsvButton fileName={`expenses-${month}.csv`} table={() => expensesCsv(monthExpenses.flatMap((g) => g.rows))} label="Download expenses CSV" />}
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
                  <li key={e.id} className="flex items-center gap-2 pl-4 sm:pl-5 pr-2 py-2 min-h-12 text-sm hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors"><span className="text-xs text-[#6B7280] dark:text-[#8E9299] w-20 shrink-0 tabular-nums">{formatDate(e.date)}</span><span className="flex-1 min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{e.description}<span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]"> • {e.paidVia || 'Cash'}{e.createdBy ? ` • ${e.createdBy}` : ''}</span></span><span className="tabular-nums whitespace-nowrap font-bold">{rs(e.amount)}</span>{canDelete && !booksLockedFor(settings, e.date) && !isChequeRecord(e.id) && <RowAction label={`Delete expense ${e.description}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPendingExp({ id: e.id, label: `${e.description} (${rs(e.amount)})` })} />}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'cashbook' && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="grid grid-cols-3 text-center divide-x divide-[#E5E5E1] dark:divide-[#203248] border-b border-[#E5E5E1] dark:border-[#203248]">
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">In</div><div className="tabular-nums whitespace-nowrap font-bold text-teal-700 dark:text-teal-300">{rs(monthMoves.filter((m) => m.direction === 'in').reduce((a, m) => a + m.amount, 0))}</div></div>
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Out</div><div className="tabular-nums whitespace-nowrap font-bold text-rose-700 dark:text-rose-300">{rs(monthMoves.filter((m) => m.direction === 'out').reduce((a, m) => a + m.amount, 0))}</div></div>
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Entries</div><div className="tabular-nums whitespace-nowrap font-bold">{monthMoves.length}</div></div>
          </div>
          {monthMoves.length === 0 ? <EmptyState compact icon={<Coins className="w-5 h-5" />} text="No money moved this month." /> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {monthMoves.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-4 sm:px-5 py-2.5 text-sm hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors"><span className="text-xs text-[#6B7280] dark:text-[#8E9299] w-20 shrink-0 tabular-nums">{formatDate(m.date)}</span><span className="flex-1 min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{m.counterparty ? `${m.counterparty} • ` : ''}{m.description}<span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]"> • {m.method || 'Cash'}</span></span><span className={`tabular-nums whitespace-nowrap font-bold ${m.direction === 'in' ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>{m.direction === 'in' ? '+' : '−'} {rs(m.amount)}</span></li>
              ))}
            </ul>
          )}
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
