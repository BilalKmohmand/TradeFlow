import React, { useMemo } from 'react';
import { FilePlus2, Receipt, Wallet, ArrowLeftRight, HandCoins, AlertTriangle, ChevronRight, Landmark, Banknote, Boxes } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { Tile, cardCls, primaryBtn, secondaryBtn, rs } from '../../components/billing/ui';
import { collectCashMovements, accountBalancesOn, positionSummary } from '../../utils/finance';
import { daySummary } from '../../utils/billing';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';

/** The first screen every morning: today's numbers, the four buttons you press all day, recent bills. */
export const BillingHomeScreen: React.FC = () => {
  const { invoices, ledger, expenses, cashEntries, customers, suppliers, products, settings, setActiveScreen, currentUser, can, updateSettings } = useTrading();
  const isAdmin = can('admin_screen') || can('system:admin_screen');
  const ui = useBillingUI();
  const today = todayISO();
  const movements = useMemo(() => collectCashMovements(ledger, expenses, cashEntries, customers, suppliers), [ledger, expenses, cashEntries, customers, suppliers]);
  const day = useMemo(() => daySummary(invoices, movements, today), [invoices, movements, today]);
  const balances = useMemo(() => accountBalancesOn(movements, settings, today), [movements, settings, today]);
  const position = useMemo(() => positionSummary(customers, suppliers, expenses, balances), [customers, suppliers, expenses, balances]);
  const recent = useMemo(() => [...invoices].filter((i) => i.status !== 'cancelled').sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : b.createdAt.localeCompare(a.createdAt))).slice(0, 8), [invoices]);
  const lowStock = products.filter((p) => p.minThresholdKg > 0 && p.stockKg <= p.minThresholdKg);
  const unpaid = invoices.filter((i) => i.balanceDue > 0 && i.status !== 'cancelled');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-white">Home</h1>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{formatDate(today)}{currentUser ? ` • ${currentUser.name}` : ''}</p>
        </div>
        <button type="button" onClick={() => ui.newBill()} className={`${primaryBtn} text-base px-6`}><FilePlus2 className="w-5 h-5 text-teal-400 dark:text-teal-700" /> New Bill</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Sales today" value={rs(day.sales)} hint={`${day.billCount} bill${day.billCount === 1 ? '' : 's'}`} onClick={() => setActiveScreen('bills')} />
        <Tile label="Cash received today" value={rs(day.received)} tone="good" hint={day.creditGiven > 0 ? `${rs(day.creditGiven)} given on credit` : 'all bills paid'} onClick={() => setActiveScreen('daily')} />
        <Tile label="Expenses today" value={rs(day.expenses)} tone={day.expenses > 0 ? 'bad' : 'default'} onClick={() => setActiveScreen('daily')} />
        <Tile label="Money in business" value={rs(position.netPosition)} hint={`cash + bank + owed to you − what you owe`} onClick={() => setActiveScreen('money')} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button type="button" onClick={() => ui.addExpense()} className={`${secondaryBtn} py-3`}><Receipt className="w-4 h-4 text-rose-600" /> Add expense</button>
        <button type="button" onClick={() => ui.receive()} className={`${secondaryBtn} py-3`}><HandCoins className="w-4 h-4 text-teal-700" /> Receive payment</button>
        <button type="button" onClick={() => ui.transfer()} className={`${secondaryBtn} py-3`}><ArrowLeftRight className="w-4 h-4 text-indigo-600" /> Cash ↔ Bank</button>
        <button type="button" onClick={() => setActiveScreen('daily')} className={`${secondaryBtn} py-3`}><Wallet className="w-4 h-4 text-amber-600" /> Daily sheet</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${cardCls} lg:col-span-2 overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E5E5E1] dark:border-[#203248]">
            <h2 className="font-bold text-[#111827] dark:text-white">Recent bills</h2>
            <button type="button" onClick={() => setActiveScreen('bills')} className="text-xs font-bold text-teal-700 dark:text-teal-300 inline-flex items-center gap-1">All bills <ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6B7280] dark:text-[#94A3B8]">No bills yet. Press <strong>New Bill</strong> to make your first one.</div>
          ) : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {recent.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => ui.openBill(i.id)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{i.customerName}</div>
                      <div className="text-[11px] text-[#8E9299]">{i.invoiceNumber} • {formatDate(i.issueDate)} • {i.items.length} item{i.items.length === 1 ? '' : 's'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm text-[#111827] dark:text-white">{rs(i.totalAmount)}</div>
                      <div className={`text-[11px] font-bold ${i.balanceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{i.balanceDue > 0 ? `${rs(i.balanceDue)} due` : 'Paid'}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className={`${cardCls} p-5 space-y-3`}>
            <h2 className="font-bold text-[#111827] dark:text-white">Money now</h2>
            <div className="flex justify-between text-sm"><span className="flex items-center gap-2 text-[#6B7280] dark:text-[#94A3B8]"><Banknote className="w-4 h-4" /> Cash in hand</span><span className="font-mono font-bold text-[#111827] dark:text-white">{rs(balances.cash)}</span></div>
            <div className="flex justify-between text-sm"><span className="flex items-center gap-2 text-[#6B7280] dark:text-[#94A3B8]"><Landmark className="w-4 h-4" /> In bank</span><span className="font-mono font-bold text-[#111827] dark:text-white">{rs(balances.bank)}</span></div>
            <div className="flex justify-between text-sm border-t border-[#E5E5E1] dark:border-[#203248] pt-2"><span className="text-[#6B7280] dark:text-[#94A3B8]">Customers owe you</span><span className="font-mono font-bold text-teal-700 dark:text-teal-300">{rs(position.receivables)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#6B7280] dark:text-[#94A3B8]">You owe others</span><span className="font-mono font-bold text-rose-700 dark:text-rose-300">{rs(position.payables)}</span></div>
            <button type="button" onClick={() => setActiveScreen('money')} className="text-xs font-bold text-teal-700 dark:text-teal-300 inline-flex items-center gap-1">Money screen <ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          {(unpaid.length > 0 || lowStock.length > 0) && (
            <div className={`${cardCls} p-5 space-y-2`}>
              <h2 className="font-bold text-[#111827] dark:text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Needs attention</h2>
              {unpaid.length > 0 && <button type="button" onClick={() => setActiveScreen('bills')} className="block w-full text-left text-sm text-[#374151] dark:text-[#CBD5E1] hover:text-[#111827] dark:hover:text-white">{unpaid.length} unpaid bill{unpaid.length === 1 ? '' : 's'} worth <strong className="font-mono">{rs(unpaid.reduce((a, i) => a + i.balanceDue, 0))}</strong></button>}
              {lowStock.slice(0, 4).map((p) => (
                <button key={p.id} type="button" onClick={() => setActiveScreen('products')} className="block w-full text-left text-sm text-[#374151] dark:text-[#CBD5E1] hover:text-[#111827] dark:hover:text-white">Low stock: <strong>{p.name}</strong> ({p.stockKg} {p.unit || 'pcs'} left)</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className={`${cardCls} p-5 flex flex-col sm:flex-row sm:items-center gap-4`}>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-[#111827] dark:text-white flex items-center gap-2"><Boxes className="w-4 h-4 text-indigo-600" /> Full trading suite is one tap away</h2>
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mt-1">Same customers, items, ledger and cash book — plus quotations, multi-item bookings, truck dispatches with challans and tax invoices, purchase orders and stock receiving, stock flow and price history, Profit &amp; Loss, balance sheet, receivables aging, fleet, alerts, follow-ups and CSV import. Switch back any time from Admin.</p>
          </div>
          <button type="button" onClick={() => updateSettings({ appMode: 'trading' })} className={`${secondaryBtn} shrink-0`}>Open full suite <ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};
