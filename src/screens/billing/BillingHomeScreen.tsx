import React, { useMemo } from 'react';
import { FilePlus2, Receipt, Wallet, ArrowLeftRight, HandCoins, AlertTriangle, ChevronRight, Landmark, Banknote, CalendarClock, FileText } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { useStockUI } from '../../components/billing/StockUI';
import { overdueCustomers } from '../../utils/stockReports';
import { Tile, PageHeader, cardCls, primaryBtn, secondaryBtn, rs, moneyCls } from '../../components/billing/ui';
import { collectCashMovements, accountBalancesOn, positionSummary } from '../../utils/finance';
import { daySummary, billsOnly } from '../../utils/billing';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { customersOverLimit } from '../../utils/credit';
import { ExpiryAttention } from '../../components/billing/InventoryUI';
import { expiryAlerts } from '../../utils/inventory';
import { chequeTotals, unclearedChequeTotals } from '../../utils/cheques';
import { useBranchScoped } from '../../hooks/useBranchScoped';
import { BranchFilter } from '../../components/control/BranchFilter';
import { ApprovalsTile } from '../../components/control/Approvals';
import { BackupReminder } from '../../components/control/AutoBackups';

/** The first screen every morning: today's numbers, the four buttons you press all day, what needs attention, recent bills. */
export const BillingHomeScreen: React.FC = () => {
  const { ledger, customers, suppliers, products, setActiveScreen, currentUser, stockBatches, cheques } = useTrading();
  // Bills and money of the branch picked in the branch filter (everything while there is one branch).
  const { invoices, ledger: branchLedger, expenses, cashEntries, settings } = useBranchScoped();
  const ui = useBillingUI();
  const today = todayISO();
  const movements = useMemo(() => collectCashMovements(branchLedger, expenses, cashEntries, customers, suppliers), [branchLedger, expenses, cashEntries, customers, suppliers]);
  const day = useMemo(() => daySummary(invoices, movements, today, expenses), [invoices, movements, today, expenses]);
  const balances = useMemo(() => accountBalancesOn(movements, settings, today), [movements, settings, today]);
  const position = useMemo(() => positionSummary(customers, suppliers, expenses, balances), [customers, suppliers, expenses, balances]);
  const recent = useMemo(() => billsOnly(invoices).sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : b.createdAt.localeCompare(a.createdAt))).slice(0, 8), [invoices]);
  const lowStock = products.filter((p) => p.minThresholdKg > 0 && p.stockKg <= p.minThresholdKg);
  const unpaid = billsOnly(invoices).filter((i) => i.balanceDue > 0);
  const overLimit = useMemo(() => customersOverLimit(customers), [customers]);
  const chq = useMemo(() => chequeTotals(cheques, today), [cheques, today]);
  const pdc = useMemo(() => unclearedChequeTotals(cheques), [cheques]);
  const expiring = useMemo(() => expiryAlerts(stockBatches, products, today).length, [stockBatches, products, today]);
  const stockUI = useStockUI();
  // Customers with money owed for more than 60 days (credit-limit breaches are listed separately above).
  const oldDues = useMemo(() => overdueCustomers(customers, ledger, today).filter((o) => o.oldAmount > 0), [customers, ledger, today]);
  const unpaidTotal = unpaid.reduce((a, i) => a + i.balanceDue, 0);
  const attentionCount = (unpaid.length > 0 ? 1 : 0) + (overLimit.length > 0 ? 1 : 0) + (oldDues.length > 0 ? 1 : 0) + (expiring > 0 ? 1 : 0) + Math.min(lowStock.length, 4);

  const attnRow = 'group w-full flex items-center gap-3 px-4 sm:px-5 py-3 min-h-12 text-left text-sm hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors';
  const dot = (c: string) => <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${c}`} />;
  const chev = <ChevronRight aria-hidden="true" className="w-4 h-4 text-[#9CA3AF] shrink-0 group-hover:text-[#111827] dark:group-hover:text-white" />;
  const linkBtn = 'text-xs font-bold text-teal-700 dark:text-teal-300 inline-flex items-center gap-1 min-h-9 px-2 -mr-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40';

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader title="Home" subtitle={`${formatDate(today)}${currentUser ? ` • ${currentUser.name}` : ''}`}>
        <BranchFilter />
        <button type="button" onClick={() => ui.newBill()} title="New bill (F2)" className={`${primaryBtn} text-base px-6 max-sm:w-full`}><FilePlus2 className="w-5 h-5 text-teal-400 dark:text-teal-700" /> New Bill</button>
      </PageHeader>

      <BackupReminder />
      <ApprovalsTile />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Sales today" value={rs(day.sales)} hint={`${day.billCount} bill${day.billCount === 1 ? '' : 's'}`} onClick={() => setActiveScreen('bills')} />
        <Tile label="Cash received today" value={rs(day.received)} tone="good" hint={day.creditGiven > 0 ? `${rs(day.creditGiven)} given on credit` : 'all bills paid'} onClick={() => setActiveScreen('daily')} />
        <Tile label="Expenses today" value={rs(day.expenses)} tone={day.expenses > 0 ? 'bad' : 'default'} onClick={() => setActiveScreen('daily')} />
        <Tile label="Money in business" value={rs(position.netPosition + pdc.receivable - pdc.payable)} hint="cash + bank + owed to you − what you owe" onClick={() => setActiveScreen('money')} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button type="button" onClick={() => ui.addExpense()} title="Add expense (F4)" className={`${secondaryBtn} py-3`}><Receipt className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Add expense</button>
        <button type="button" onClick={() => ui.receive()} title="Receive payment (F3)" className={`${secondaryBtn} py-3`}><HandCoins className="w-4 h-4 text-teal-700 dark:text-teal-300" /> Receive payment</button>
        <button type="button" onClick={() => ui.transfer()} className={`${secondaryBtn} py-3`}><ArrowLeftRight className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /> Cash ↔ Bank</button>
        <button type="button" onClick={() => setActiveScreen('daily')} className={`${secondaryBtn} py-3`}><Wallet className="w-4 h-4 text-amber-600 dark:text-amber-300" /> Daily sheet</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {attentionCount > 0 && (
            <div className={`${cardCls} overflow-hidden`}>
              <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
                <h2 className="font-bold text-[#111827] dark:text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Needs attention</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">{attentionCount}</span>
              </div>
              <div className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {unpaid.length > 0 && (
                  <button type="button" onClick={() => setActiveScreen('bills')} className={`${attnRow} text-[#374151] dark:text-[#CBD5E1]`}>
                    {dot('bg-amber-500')}
                    <span className="flex-1 min-w-0">{unpaid.length} unpaid bill{unpaid.length === 1 ? '' : 's'} worth <strong className={`${moneyCls} text-[#111827] dark:text-white`}>{rs(unpaidTotal)}</strong></span>
                    {chev}
                  </button>
                )}
                {overLimit.length > 0 && (
                  <button type="button" onClick={() => setActiveScreen('customers')} className={`${attnRow} text-rose-700 dark:text-rose-300`}>
                    {dot('bg-rose-500')}
                    <span className="flex-1 min-w-0">{overLimit.length} customer{overLimit.length === 1 ? '' : 's'} over their credit limit: <strong>{overLimit.slice(0, 3).map((c) => c.name).join(', ')}{overLimit.length > 3 ? '…' : ''}</strong></span>
                    {chev}
                  </button>
                )}
                {oldDues.length > 0 && (
                  <button type="button" onClick={() => stockUI.aging('customers')} className={`${attnRow} text-rose-700 dark:text-rose-300`} data-testid="overdue-60">
                    {dot('bg-rose-500')}
                    <span className="flex-1 min-w-0">{oldDues.length} customer{oldDues.length === 1 ? ' has' : 's have'} <strong className={moneyCls}>{rs(oldDues.reduce((a, o) => a + o.oldAmount, 0))}</strong> owed for over 60 days: <strong>{oldDues.slice(0, 3).map((o) => o.customer.name).join(', ')}{oldDues.length > 3 ? '…' : ''}</strong></span>
                    {chev}
                  </button>
                )}
                {expiring > 0 && <div className="px-4 sm:px-5 py-3"><ExpiryAttention onOpen={() => setActiveScreen('products')} /></div>}
                {lowStock.slice(0, 4).map((p) => (
                  <button key={p.id} type="button" onClick={() => setActiveScreen('products')} className={`${attnRow} text-[#374151] dark:text-[#CBD5E1]`}>
                    {dot('bg-amber-500')}
                    <span className="flex-1 min-w-0">Low stock: <strong className="text-[#111827] dark:text-white">{p.name}</strong> ({p.stockKg.toLocaleString()} {p.unit || 'pcs'} left)</span>
                    {chev}
                  </button>
                ))}
              </div>
            </div>
          )}

          {recent.length === 0 ? (
            <div className={`${cardCls} px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3`}>
              <div className="w-10 h-10 rounded-2xl bg-[#F4F3EF] dark:bg-[#162436] text-[#8E9299] dark:text-[#94A3B8] flex items-center justify-center shrink-0"><FileText className="w-5 h-5" /></div>
              <p className="flex-1 min-w-40 text-sm text-[#6B7280] dark:text-[#94A3B8]">No bills yet. Your latest bills will show here.</p>
              <button type="button" onClick={() => ui.newBill()} className={`${secondaryBtn} shrink-0`}><FilePlus2 className="w-4 h-4 text-teal-700 dark:text-teal-300" /> New bill</button>
            </div>
          ) : (
            <div className={`${cardCls} overflow-hidden`}>
              <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-[#E5E5E1] dark:border-[#203248]">
                <h2 className="font-bold text-[#111827] dark:text-white">Recent bills</h2>
                <button type="button" onClick={() => setActiveScreen('bills')} className={linkBtn}>All bills <ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
              <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {recent.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => ui.openBill(i.id)} className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{i.customerName}</div>
                        <div className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">{i.invoiceNumber} • {formatDate(i.issueDate)} • {i.items.length} item{i.items.length === 1 ? '' : 's'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`${moneyCls} font-bold text-sm text-[#111827] dark:text-white`}>{rs(i.totalAmount)}</div>
                        <div className={`text-[11px] font-bold ${i.balanceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{i.balanceDue > 0 ? `${rs(i.balanceDue)} due` : 'Paid'}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <div className={`${cardCls} p-4 sm:p-5 space-y-2.5`}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#111827] dark:text-white">Money now</h2>
              <button type="button" onClick={() => setActiveScreen('money')} className={linkBtn}>Money screen <ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex justify-between gap-2 text-sm"><span className="flex items-center gap-2 text-[#6B7280] dark:text-[#94A3B8]"><Banknote className="w-4 h-4" /> Cash in hand</span><span className={`${moneyCls} font-bold text-[#111827] dark:text-white`}>{rs(balances.cash)}</span></div>
            <div className="flex justify-between gap-2 text-sm"><span className="flex items-center gap-2 text-[#6B7280] dark:text-[#94A3B8]"><Landmark className="w-4 h-4" /> In bank</span><span className={`${moneyCls} font-bold text-[#111827] dark:text-white`}>{rs(balances.bank)}</span></div>
            {pdc.receivable > 0 && <div className="flex justify-between gap-2 text-sm"><span className="flex items-center gap-2 text-[#6B7280] dark:text-[#94A3B8]"><CalendarClock className="w-4 h-4" /> Cheques in hand</span><span className={`${moneyCls} font-bold text-[#111827] dark:text-white`}>{rs(pdc.receivable)}</span></div>}
            <div className="flex justify-between gap-2 text-sm border-t border-[#E5E5E1] dark:border-[#203248] pt-2.5"><span className="text-[#6B7280] dark:text-[#94A3B8]">Customers owe you</span><span className={`${moneyCls} font-bold text-teal-700 dark:text-teal-300`}>{rs(position.receivables)}</span></div>
            <div className="flex justify-between gap-2 text-sm"><span className="text-[#6B7280] dark:text-[#94A3B8]">You owe others</span><span className={`${moneyCls} font-bold text-rose-700 dark:text-rose-300`}>{rs(position.payables)}</span></div>
          </div>
          <div data-testid="cheques-due-tile">
            <Tile
              label="Cheques due this week"
              value={`${chq.dueThisWeek.count} • ${rs(chq.dueThisWeek.amount)}`}
              tone={chq.dueThisWeek.count > 0 ? 'warn' : 'default'}
              icon={<CalendarClock className="w-4 h-4" />}
              hint={chq.dueThisWeek.count === 0 ? `${chq.inHand.count} in hand • nothing due in the next 7 days` : `coming in ${rs(chq.dueThisWeek.received)}${chq.dueThisWeek.issued > 0 ? ` • going out ${rs(chq.dueThisWeek.issued)}` : ''}`}
              onClick={() => { ui.openMoneyTab('cheques'); setActiveScreen('money'); }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
