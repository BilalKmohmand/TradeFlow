import React, { useMemo, useState } from 'react';
import { Banknote, Landmark, ArrowLeftRight, HandCoins, Receipt, Settings2, ChevronRight, Printer } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { Tile, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs } from '../../components/billing/ui';
import { collectCashMovements, accountBalancesOn, positionSummary } from '../../utils/finance';
import { groupExpenses } from '../../utils/billing';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';

type Tab = 'overview' | 'expenses' | 'cashbook';

/** Where the money is: cash, bank, who owes you, who you owe; plus expense sheets and the cash book. */
export const MoneyScreen: React.FC = () => {
  const { ledger, expenses, cashEntries, customers, suppliers, settings, updateSettings, setSelectedCustomerId, setSelectedSupplierId, setActiveScreen, setPrintRequest, deleteExpense } = useTrading();
  const ui = useBillingUI();
  const today = todayISO();
  const [tab, setTab] = useState<Tab>('overview');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [showOpening, setShowOpening] = useState(false);
  const [opening, setOpening] = useState({ cash: String(settings.cashOpeningBalance || 0), bank: String(settings.openingBankBalance || 0), date: settings.cashOpeningDate });

  const movements = useMemo(() => collectCashMovements(ledger, expenses, cashEntries, customers, suppliers), [ledger, expenses, cashEntries, customers, suppliers]);
  const balances = useMemo(() => accountBalancesOn(movements, settings, today), [movements, settings, today]);
  const position = useMemo(() => positionSummary(customers, suppliers, expenses, balances), [customers, suppliers, expenses, balances]);
  const debtors = useMemo(() => customers.filter((c) => c.totalDue > 0).sort((a, b) => b.totalDue - a.totalDue), [customers]);
  const creditors = useMemo(() => suppliers.filter((s) => s.totalOwed > 0).sort((a, b) => b.totalOwed - a.totalOwed), [suppliers]);
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
    <button type="button" onClick={() => setTab(id)} className={`px-4 py-2 rounded-2xl text-xs font-bold border ${tab === id ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent' : 'bg-white dark:bg-[#101A26] border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]'}`}>{label}</button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-white">Money</h1>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">How much is in the business, who owes you, and who you owe.</p>
        </div>
        <div className="flex gap-1.5">{tabBtn('overview', 'Overview')}{tabBtn('expenses', 'Expense sheets')}{tabBtn('cashbook', 'Cash book')}</div>
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Cash in hand" value={rs(balances.cash)} icon={<Banknote className="w-4 h-4" />} />
            <Tile label="In bank" value={rs(balances.bank)} icon={<Landmark className="w-4 h-4" />} />
            <Tile label="Others owe you" value={rs(position.receivables)} tone="good" hint={`${debtors.length} customer${debtors.length === 1 ? '' : 's'}`} />
            <Tile label="You owe others" value={rs(position.payables)} tone={position.payables > 0 ? 'bad' : 'default'} hint={`${creditors.length} supplier${creditors.length === 1 ? '' : 's'}${unpaidExpenses.length ? ` + ${unpaidExpenses.length} unpaid expense${unpaidExpenses.length === 1 ? '' : 's'}` : ''}`} />
          </div>
          <div className={`${cardCls} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Money in the business</div>
              <div className={`text-3xl font-extrabold font-mono ${position.netPosition >= 0 ? 'text-[#111827] dark:text-white' : 'text-rose-700'}`}>{rs(position.netPosition)}</div>
              <div className="text-xs text-[#8E9299]">cash {rs(balances.cash)} + bank {rs(balances.bank)} + owed to you {rs(position.receivables)} − you owe {rs(position.payables)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => ui.transfer()} className={secondaryBtn}><ArrowLeftRight className="w-4 h-4 text-indigo-600" /> Cash ↔ Bank</button>
              <button type="button" onClick={() => ui.receive()} className={secondaryBtn}><HandCoins className="w-4 h-4 text-teal-700" /> Receive</button>
              <button type="button" onClick={() => { setOpening({ cash: String(settings.cashOpeningBalance || 0), bank: String(settings.openingBankBalance || 0), date: settings.cashOpeningDate }); setShowOpening((v) => !v); }} className={secondaryBtn}><Settings2 className="w-4 h-4" /> Opening balances</button>
            </div>
          </div>
          {showOpening && (
            <form onSubmit={saveOpening} className={`${cardCls} p-5 grid grid-cols-1 sm:grid-cols-4 gap-3`}>
              <div><label className={labelCls} htmlFor="op-cash">Cash on opening day</label><input id="op-cash" type="number" step="any" value={opening.cash} onChange={(e) => setOpening({ ...opening, cash: e.target.value })} className={`${inputCls} font-mono`} /></div>
              <div><label className={labelCls} htmlFor="op-bank">Bank on opening day</label><input id="op-bank" type="number" step="any" value={opening.bank} onChange={(e) => setOpening({ ...opening, bank: e.target.value })} className={`${inputCls} font-mono`} /></div>
              <div><label className={labelCls} htmlFor="op-date">Counting from</label><input id="op-date" type="date" value={opening.date} onChange={(e) => setOpening({ ...opening, date: e.target.value })} className={inputCls} /></div>
              <div className="flex items-end"><button type="submit" className={`${primaryBtn} w-full`}>Save</button></div>
            </form>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${cardCls} overflow-hidden`}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]"><h2 className="font-bold text-[#111827] dark:text-white">Customers who owe you</h2><span className="font-mono font-bold text-sm text-teal-700 dark:text-teal-300">{rs(position.receivables)}</span></div>
              {debtors.length === 0 ? <div className="px-5 py-5 text-sm text-[#8E9299]">Nobody owes you anything.</div> : (
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                  {debtors.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-5 py-2.5">
                      <button type="button" onClick={() => setSelectedCustomerId(c.id)} className="flex-1 min-w-0 text-left"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{c.name}</span><span className="text-[11px] text-[#8E9299]">{c.phone}</span></button>
                      <span className="font-mono font-bold text-sm">{rs(c.totalDue)}</span>
                      <button type="button" onClick={() => ui.receive(c.id)} className="text-xs font-bold text-teal-700 dark:text-teal-300 px-2 py-1 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40">Receive</button>
                      <button type="button" onClick={() => setPrintRequest({ type: 'statement', customerId: c.id, from: `${today.slice(0, 4)}-01-01`, to: today })} aria-label={`Print statement for ${c.name}`} className="p-1.5 text-[#9CA3AF] hover:text-[#111827] dark:hover:text-white"><Printer className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={`${cardCls} overflow-hidden`}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]"><h2 className="font-bold text-[#111827] dark:text-white">You owe</h2><span className="font-mono font-bold text-sm text-rose-700 dark:text-rose-300">{rs(position.payables)}</span></div>
              {creditors.length + unpaidExpenses.length === 0 ? <div className="px-5 py-5 text-sm text-[#8E9299]">You owe nothing right now.</div> : (
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                  {creditors.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-5 py-2.5">
                      <button type="button" onClick={() => setSelectedSupplierId(s.id)} className="flex-1 min-w-0 text-left"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{s.company || s.name}</span><span className="text-[11px] text-[#8E9299]">supplier • {s.phone}</span></button>
                      <span className="font-mono font-bold text-sm">{rs(s.totalOwed)}</span>
                    </li>
                  ))}
                  {unpaidExpenses.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 px-5 py-2.5">
                      <span className="flex-1 min-w-0"><span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{e.description}</span><span className="text-[11px] text-[#8E9299]">unpaid expense • {formatDate(e.date)}</span></span>
                      <span className="font-mono font-bold text-sm">{rs(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => setActiveScreen('suppliers')} className="w-full px-5 py-2.5 text-left text-xs font-bold text-teal-700 dark:text-teal-300 border-t border-[#F1F0EC] dark:border-[#1E2E40] inline-flex items-center gap-1">Suppliers & payments <ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </>
      )}

      {tab !== 'overview' && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-[#6B7280] dark:text-[#94A3B8]" htmlFor="money-month">Month</label>
          <input id="money-month" type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputCls} w-auto`} />
          {tab === 'expenses' && <button type="button" onClick={() => ui.addExpense()} className={`${primaryBtn} ml-auto`}><Receipt className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Add expense</button>}
        </div>
      )}

      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className={`${cardCls} p-5 flex items-center justify-between`}><span className="font-bold text-[#111827] dark:text-white">Total expenses this month</span><span className="font-mono font-extrabold text-xl text-rose-700 dark:text-rose-300">{rs(monthTotal)}</span></div>
          {monthExpenses.length === 0 ? <div className={`${cardCls} p-8 text-center text-sm text-[#8E9299]`}>No expenses recorded this month.</div> : monthExpenses.map((g) => (
            <div key={g.category} className={`${cardCls} overflow-hidden`}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]"><h2 className="font-bold text-[#111827] dark:text-white">{g.label} sheet</h2><span className="font-mono font-bold text-sm">{rs(g.total)}</span></div>
              <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {g.rows.sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-5 py-2.5 text-sm"><span className="font-mono text-xs text-[#8E9299] w-20 shrink-0">{formatDate(e.date)}</span><span className="flex-1 min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{e.description}<span className="text-[11px] text-[#8E9299]"> • {e.paidVia || 'Cash'}{e.createdBy ? ` • ${e.createdBy}` : ''}</span></span><span className="font-mono font-bold">{rs(e.amount)}</span><button type="button" onClick={() => deleteExpense(e.id)} aria-label={`Delete expense ${e.description}`} className="text-[#9CA3AF] hover:text-rose-600 text-xs px-1">✕</button></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'cashbook' && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="grid grid-cols-3 text-center divide-x divide-[#E5E5E1] dark:divide-[#203248] border-b border-[#E5E5E1] dark:border-[#203248]">
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">In</div><div className="font-mono font-bold text-teal-700 dark:text-teal-300">{rs(monthMoves.filter((m) => m.direction === 'in').reduce((a, m) => a + m.amount, 0))}</div></div>
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Out</div><div className="font-mono font-bold text-rose-700 dark:text-rose-300">{rs(monthMoves.filter((m) => m.direction === 'out').reduce((a, m) => a + m.amount, 0))}</div></div>
            <div className="p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Entries</div><div className="font-mono font-bold">{monthMoves.length}</div></div>
          </div>
          {monthMoves.length === 0 ? <div className="px-5 py-8 text-center text-sm text-[#8E9299]">No money moved this month.</div> : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {monthMoves.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-5 py-2.5 text-sm"><span className="font-mono text-xs text-[#8E9299] w-20 shrink-0">{formatDate(m.date)}</span><span className="flex-1 min-w-0 truncate text-[#374151] dark:text-[#CBD5E1]">{m.counterparty ? `${m.counterparty} • ` : ''}{m.description}<span className="text-[11px] text-[#8E9299]"> • {m.method || 'Cash'}</span></span><span className={`font-mono font-bold ${m.direction === 'in' ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>{m.direction === 'in' ? '+' : '−'} {rs(m.amount)}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
