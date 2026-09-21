import { CsvButton } from '../../components/billing/CsvButton';
import { trialBalanceCsv, generalLedgerCsv, profitLossCsv, balanceSheetCsv } from '../../utils/csvReports';
import React, { useMemo, useState } from 'react';
import { Plus, Printer, Trash2, Lock, Unlock, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { Notice, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn, rs, PageHeader, pillCls } from '../../components/billing/ui';
import { JournalEntryModal } from '../../components/accounting/JournalEntryModal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAccounting } from '../../hooks/useAccounting';
import { ProfitView } from '../../components/billing/BillingReports';
import {
  ACCOUNT_TYPES,
  Account,
  AccountType,
  StatementRow,
  accountTotals,
  balanceSheet,
  drCr,
  generalLedger,
  profitAndLoss,
  trialBalance,
  booksLockedFor,
} from '../../utils/accounting';
import { todayISO } from '../../utils/stockFlow';
import { FixedAssetsTab } from '../../components/finance/FixedAssetsTab';
import { StaffTab } from '../../components/finance/StaffTab';
import { BudgetTab } from '../../components/finance/BudgetTab';
import { CostCentresTab } from '../../components/finance/CostCentresTab';
import { CashFlowTab } from '../../components/finance/CashFlowTab';
import { YearEndTab } from '../../components/finance/YearEndTab';
import { useFinancialYears } from '../../components/finance/common';
import { formatDate } from '../../utils/formatters';

type Tab = 'tb' | 'gl' | 'journal' | 'coa' | 'pnl' | 'bs' | 'profit' | 'cashflow' | 'assets' | 'staff' | 'budget' | 'centres' | 'year';

const TABS: { id: Tab; label: string; help: string }[] = [
  { id: 'tb', label: 'Trial balance', help: 'The balance of every account on one date. Debits (what the business has or spent) must equal credits (what it owes, the owner put in, or it earned).' },
  { id: 'gl', label: 'General ledger', help: 'Every posting to one account, in date order, with a running balance — like a bank statement for that account.' },
  { id: 'journal', label: 'Journal', help: 'The book of entries. Bills, payments and expenses post here automatically; the accountant can add manual entries for corrections.' },
  { id: 'coa', label: 'Chart of accounts', help: 'The list of accounts money is sorted into. System accounts are used by automatic postings; you can add your own.' },
  { id: 'pnl', label: 'Profit & Loss', help: 'Income minus the cost of what was sold and the expenses, for a period: did the business make money?' },
  { id: 'bs', label: 'Balance sheet', help: 'What the business owns (assets) against what it owes (liabilities) and what belongs to the owner (equity), on one date.' },
  { id: 'profit', label: 'Profit by item', help: 'Profit made on each item and from each customer, from your bills: what you sold it for minus what it cost you.' },
  { id: 'cashflow', label: 'Cash flow & ratios', help: 'Where cash came from and went, and a few numbers that show how healthy the business is.' },
  { id: 'assets', label: 'Fixed assets', help: 'Vehicles, generators, fittings and other things the shop owns for years, their depreciation and book value.' },
  { id: 'staff', label: 'Staff & salaries', help: 'Staff list, the monthly salary sheet, advances (loans to staff) and payslips.' },
  { id: 'budget', label: 'Budgets', help: 'Plan how much to spend and earn each month, then compare with what really happened.' },
  { id: 'centres', label: 'Cost centres', help: 'Profit and loss by branch, area or vehicle.' },
  { id: 'year', label: 'Year end', help: 'Financial year setting and closing a finished year.' },
];

/** Tabs that take a date or date range: they get the "Financial year" shortcut. */
const DATED_TABS: Tab[] = ['tb', 'gl', 'journal', 'pnl', 'bs'];

const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
const thCls = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap';
const tdCls = 'px-3 py-2 text-sm';
const numCls = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';

/** Double-entry books derived from everyday records, plus manual journals for the accountant. */
export const AccountsScreen: React.FC = () => {
  const { can, settings, updateSettings, setPrintRequest, deleteManualJournal, addAccount, deleteAccount, isAdminUnlocked } = useTrading();
  const ui = useBillingUI();
  const allowed = can('view_finance');
  // Viewing the books needs finance access; posting or changing them is for managers and admins.
  const canPost = can('finance:view_pnl');
  const canRemove = canPost && can('delete_records');
  const [confirmDel, setConfirmDel] = useState<{ title: string; message: string; label: string; action: () => void } | null>(null);
  const { accounts, journal } = useAccounting(allowed);
  const today = todayISO();
  const [tab, setTab] = useState<Tab>('tb');
  const [asOf, setAsOf] = useState(today);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [glCode, setGlCode] = useState('1000');
  const [jSource, setJSource] = useState<'all' | 'auto' | 'manual'>('all');
  const [jSearch, setJSearch] = useState('');
  const [jLimit, setJLimit] = useState(50);
  const [newJournal, setNewJournal] = useState(0);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [acc, setAcc] = useState<{ code: string; name: string; type: AccountType; description: string }>({ code: '', name: '', type: 'expense', description: '' });
  const [lockDate, setLockDate] = useState(settings.booksLockedUntil || '');
  const { years: fyears } = useFinancialYears();
  const fyValue = fyears.find((y) => y.start === from && (y.end === to || (y.end > today && to === today)))?.start || '';
  const pickYear = (start: string) => {
    const y = fyears.find((x) => x.start === start);
    if (!y) return;
    const end = y.end > today ? today : y.end;
    setFrom(y.start);
    setTo(end);
    setAsOf(end);
  };

  const tb = useMemo(() => trialBalance(journal, accounts, asOf), [journal, accounts, asOf]);
  const gl = useMemo(() => generalLedger(journal, glCode, from, to), [journal, glCode, from, to]);
  const pnl = useMemo(() => profitAndLoss(journal, from, to, accounts), [journal, from, to, accounts]);
  const bs = useMemo(() => balanceSheet(journal, asOf, accounts), [journal, asOf, accounts]);
  const balances = useMemo(() => accountTotals(journal, { to: today }), [journal, today]);
  const name = (code: string) => accounts.find((a) => a.code === code)?.name || `Account ${code}`;

  const journalRows = useMemo(() => {
    const q = jSearch.trim().toLowerCase();
    return journal
      .filter((e) => (jSource === 'all' ? true : e.source === jSource))
      .filter((e) => e.date >= from && e.date <= to)
      .filter((e) => !q || `${e.ref} ${e.memo} ${e.lines.map((l) => `${l.accountCode} ${name(l.accountCode)}`).join(' ')}`.toLowerCase().includes(q))
      .slice()
      .reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal, jSource, jSearch, from, to, accounts]);

  if (!allowed) {
    return (
      <div className={`${cardCls} p-6`}>
        <h1 className="text-xl font-bold text-[#111827] dark:text-white">Accounts</h1>
        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mt-1">You do not have permission to see the books.</p>
      </div>
    );
  }

  const openGl = (code: string) => {
    setGlCode(code);
    setTab('gl');
  };

  const flash = (r: { success: boolean; message: string }) => setNotice({ kind: r.success ? 'ok' : 'error', text: r.message });

  const tabBtn = (t: (typeof TABS)[number]) => (
    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={pillCls(tab === t.id)}>{t.label}</button>
  );

  const dateField = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="min-w-0">
      <label className={labelCls} htmlFor={id}>{label}</label>
      <input id={id} type="date" value={value} onChange={(e) => set(e.target.value || today)} className={inputCls} />
    </div>
  );

  const printBtn = (onClick: () => void, label: string) => (
    <button type="button" onClick={onClick} className={secondaryBtn} aria-label={label}><Printer className="w-4 h-4" /> Print</button>
  );

  const statusPill = (ok: boolean, okText: string, badText: string) =>
    ok ? (
      <span role="status" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-900"><CheckCircle2 className="w-3.5 h-3.5" /> {okText}</span>
    ) : (
      <span role="status" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900"><AlertTriangle className="w-3.5 h-3.5" /> {badText}</span>
    );

  const statementSection = (title: string, rows: StatementRow[], total: number, totalLabel: string) => (
    <>
      <tr className="bg-[#FAF9F6] dark:bg-[#0D1520]"><td colSpan={2} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">{title}</td></tr>
      {rows.length === 0 && <tr><td colSpan={2} className="px-3 py-2 text-sm text-[#8E9299]">Nothing yet.</td></tr>}
      {rows.map((r) => (
        <tr key={r.account.code} className="border-b border-[#F1F0EC] dark:border-[#1E2E40]">
          <td className={tdCls}><button type="button" onClick={() => openGl(r.account.code)} className="text-left hover:underline"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{r.account.code}</span>{r.account.name}</button></td>
          <td className={numCls}>{money(r.amount)}</td>
        </tr>
      ))}
      <tr className="border-b border-[#E5E5E1] dark:border-[#203248] font-bold"><td className={tdCls}>{totalLabel}</td><td className={numCls}>{money(total)}</td></tr>
    </>
  );

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-5 min-w-0">
      <PageHeader title="Accounts" subtitle="Double-entry books, posted automatically from your bills, payments and expenses.">
        {canPost && <button type="button" onClick={() => setNewJournal((n) => n + 1)} className={`${primaryBtn} max-sm:flex-1`}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New journal entry</button>}
      </PageHeader>

      <div role="tablist" aria-label="Accounts views" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">{TABS.filter((t) => t.id !== 'profit' || canPost).map(tabBtn)}</div>
      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] -mt-2">{current.help}</p>
      {DATED_TABS.includes(tab) && fyears.length > 0 && (
        <div className="flex items-center gap-2 -mt-1">
          <label htmlFor="acc-fy" className="text-xs font-bold text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">Financial year</label>
          <select id="acc-fy" value={fyValue} onChange={(e) => pickYear(e.target.value)} className={`${inputCls} !w-auto !py-1.5`}>
            <option value="">Custom dates</option>
            {fyears.map((y) => <option key={y.start} value={y.start}>{y.label}</option>)}
          </select>
        </div>
      )}

      {settings.booksLockedUntil && (
        <div className="rounded-2xl px-4 py-3 text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Books are closed up to {formatDate(settings.booksLockedUntil)}. Nothing dated on or before that day can be added or deleted: bills, payments, expenses, transfers and journals. An admin can reopen the period below.</span>
        </div>
      )}
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {/* ---------------- Trial balance ---------------- */}
      {tab === 'tb' && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 sm:px-5 py-4 border-b border-[#E5E5E1] dark:border-[#203248]">
            <div className="w-44">{dateField('tb-asof', 'As of', asOf, setAsOf)}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {statusPill(tb.balanced, 'Balanced ✓', `Out of balance by ${rs(Math.abs(tb.difference))}`)}
              <CsvButton fileName={`trial-balance-${asOf}.csv`} table={() => trialBalanceCsv(tb)} label="Download trial balance CSV" />
              {printBtn(() => setPrintRequest({ type: 'trial_balance', asOf }), 'Print trial balance')}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]" aria-label="Trial balance">
              <thead><tr className="border-b border-[#E5E5E1] dark:border-[#203248] text-left"><th className={thCls}>Code</th><th className={thCls}>Account</th><th className={`${thCls} text-right`}>Debit</th><th className={`${thCls} text-right`}>Credit</th></tr></thead>
              <tbody>
                {tb.rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-[#8E9299]">No postings yet.</td></tr>}
                {tb.rows.map((r) => (
                  <tr key={r.account.code} className="border-b border-[#F1F0EC] dark:border-[#1E2E40] hover:bg-[#FAF9F6] dark:hover:bg-[#162436] cursor-pointer" onClick={() => openGl(r.account.code)}>
                    <td className={`${tdCls} tabular-nums text-xs text-[#8E9299]`}>{r.account.code}</td>
                    <td className={tdCls}><button type="button" onClick={(e) => { e.stopPropagation(); openGl(r.account.code); }} className="text-left hover:underline">{r.account.name}</button></td>
                    <td className={numCls}>{r.debit ? money(r.debit) : ''}</td>
                    <td className={numCls}>{r.credit ? money(r.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t-2 border-[#111827] dark:border-white"><td colSpan={2} className={tdCls}>Total</td><td className={numCls} data-testid="tb-total-debit">{money(tb.totalDebit)}</td><td className={numCls} data-testid="tb-total-credit">{money(tb.totalCredit)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- General ledger ---------------- */}
      {tab === 'gl' && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-5 py-4 border-b border-[#E5E5E1] dark:border-[#203248]">
            <div className="col-span-2 min-w-0">
              <label className={labelCls} htmlFor="gl-account">Account</label>
              <select id="gl-account" value={glCode} onChange={(e) => setGlCode(e.target.value)} className={inputCls}>
                {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </div>
            {dateField('gl-from', 'From', from, setFrom)}
            {dateField('gl-to', 'To', to, setTo)}
            <div className="col-span-2 sm:col-span-4 flex justify-end"><CsvButton fileName={`ledger-${glCode}-${from}-to-${to}.csv`} table={() => generalLedgerCsv(gl, name(glCode))} label="Download ledger CSV" /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]" aria-label="General ledger">
              <thead><tr className="border-b border-[#E5E5E1] dark:border-[#203248] text-left"><th className={thCls}>Date</th><th className={thCls}>Ref</th><th className={thCls}>Narration</th><th className={`${thCls} text-right`}>Debit</th><th className={`${thCls} text-right`}>Credit</th><th className={`${thCls} text-right`}>Balance</th></tr></thead>
              <tbody>
                <tr className="border-b border-[#F1F0EC] dark:border-[#1E2E40] text-[#6B7280]"><td colSpan={5} className={tdCls}>Opening balance on {formatDate(from)}</td><td className={numCls}>{drCr(gl.opening)}</td></tr>
                {gl.lines.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-[#8E9299]">No postings to {name(glCode)} in this period.</td></tr>}
                {gl.lines.map((l, i) => (
                  <tr key={`${l.entryId}-${i}`} className="border-b border-[#F1F0EC] dark:border-[#1E2E40]">
                    <td className={`${tdCls} tabular-nums text-xs whitespace-nowrap`}>{formatDate(l.date)}</td>
                    <td className={`${tdCls} tabular-nums text-xs whitespace-nowrap`}>
                      {l.billId ? (
                        <button type="button" onClick={() => ui.openBill(l.billId!)} className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-300 font-bold hover:underline" title="Open the bill">{l.ref} <ExternalLink className="w-3 h-3" /></button>
                      ) : l.ref}
                      {l.source === 'manual' && <span className="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">manual</span>}
                    </td>
                    <td className={`${tdCls} min-w-[200px]`}>{l.memo}</td>
                    <td className={numCls}>{l.debit ? money(l.debit) : ''}</td>
                    <td className={numCls}>{l.credit ? money(l.credit) : ''}</td>
                    <td className={`${numCls} font-bold`}>{drCr(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t-2 border-[#111827] dark:border-white"><td colSpan={3} className={tdCls}>Closing balance on {formatDate(to)}</td><td className={numCls}>{money(gl.totalDebit)}</td><td className={numCls}>{money(gl.totalCredit)}</td><td className={numCls}>{drCr(gl.closing)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Journal ---------------- */}
      {tab === 'journal' && (
        <div className="space-y-3">
          <div className={`${cardCls} grid grid-cols-2 sm:grid-cols-4 gap-3 p-4`}>
            <div className="min-w-0">
              <label className={labelCls} htmlFor="j-source">Show</label>
              <select id="j-source" value={jSource} onChange={(e) => setJSource(e.target.value as typeof jSource)} className={inputCls}>
                <option value="all">All entries</option>
                <option value="auto">Automatic</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className={labelCls} htmlFor="j-search">Search</label>
              <input id="j-search" value={jSearch} onChange={(e) => setJSearch(e.target.value)} placeholder="Ref, narration, account" className={inputCls} />
            </div>
            {dateField('j-from', 'From', from, setFrom)}
            {dateField('j-to', 'To', to, setTo)}
          </div>
          {journalRows.length === 0 && <div className={`${cardCls} p-6 text-sm text-center text-[#8E9299]`}>No journal entries match.</div>}
          {journalRows.slice(0, jLimit).map((e) => (
            <div key={e.id} className={`${cardCls} overflow-hidden`} data-testid="journal-entry">
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#F1F0EC] dark:border-[#1E2E40]">
                <span className="tabular-nums text-xs text-[#8E9299]">{formatDate(e.date)}</span>
                {e.billId ? (
                  <button type="button" onClick={() => ui.openBill(e.billId!)} className="tabular-nums text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline">{e.ref}</button>
                ) : (
                  <span className="tabular-nums text-xs font-bold">{e.ref}</span>
                )}
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${e.source === 'manual' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' : 'bg-[#F4F3EF] dark:bg-[#162436] text-[#6B7280]'}`}>{e.source === 'manual' ? 'manual' : 'auto'}</span>
                <span className="text-sm font-semibold text-[#111827] dark:text-white min-w-0 flex-1 truncate">{e.memo}</span>
                {e.source === 'manual' && canRemove && !booksLockedFor(settings, e.date) && (
                  <button type="button" aria-label={`Delete journal entry ${e.ref}`} onClick={() => setConfirmDel({ title: `Delete journal entry ${e.ref}?`, message: `${e.memo} — this entry will be removed from the books.`, label: 'Delete entry', action: () => flash(deleteManualJournal(e.id)) })} className="p-1.5 text-[#9CA3AF] hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px]">
                  <tbody>
                    {e.lines.map((l, i) => (
                      <tr key={i} className="border-b last:border-0 border-[#F7F6F2] dark:border-[#162436]">
                        <td className={`${tdCls} ${l.credit ? 'pl-8' : ''}`}><button type="button" onClick={() => openGl(l.accountCode)} className="text-left hover:underline"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{l.accountCode}</span>{name(l.accountCode)}</button>{l.memo && <span className="block text-[11px] text-[#8E9299]">{l.memo}</span>}</td>
                        <td className={`${numCls} w-28`}>{l.debit ? money(l.debit) : ''}</td>
                        <td className={`${numCls} w-28`}>{l.credit ? money(l.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {journalRows.length > jLimit && <button type="button" onClick={() => setJLimit((n) => n + 100)} className={`${secondaryBtn} w-full`}>Show more ({journalRows.length - jLimit} left)</button>}
        </div>
      )}

      {/* ---------------- Chart of accounts ---------------- */}
      {tab === 'coa' && (
        <div className="space-y-4">
          <div className={`${cardCls} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]" aria-label="Chart of accounts">
                <thead><tr className="border-b border-[#E5E5E1] dark:border-[#203248] text-left"><th className={thCls}>Code</th><th className={thCls}>Account</th><th className={thCls}>Type</th><th className={`${thCls} text-right`}>Balance today</th><th className={thCls} aria-label="Actions" /></tr></thead>
                <tbody>
                  {accounts.map((a: Account) => (
                    <tr key={a.code} className="border-b border-[#F1F0EC] dark:border-[#1E2E40]">
                      <td className={`${tdCls} tabular-nums text-xs text-[#8E9299]`}>{a.code}</td>
                      <td className={tdCls}>
                        <button type="button" onClick={() => openGl(a.code)} className="text-left font-semibold hover:underline">{a.name}</button>
                        {a.description && <span className="block text-[11px] text-[#8E9299]">{a.description}</span>}
                      </td>
                      <td className={`${tdCls} text-xs capitalize`}>{a.type}{a.system ? <span className="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#162436] text-[#6B7280]">system</span> : null}</td>
                      <td className={numCls}>{drCr(balances.get(a.code)?.net ?? 0)}</td>
                      <td className="px-2 text-right">
                        {!a.system && canRemove && (
                          <button type="button" aria-label={`Delete account ${a.code}`} onClick={() => setConfirmDel({ title: `Delete account ${a.code}?`, message: `${a.name} will be removed from the chart of accounts.`, label: 'Delete account', action: () => flash(deleteAccount(a.code)) })} className="p-1.5 text-[#9CA3AF] hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {canPost && <form
            onSubmit={(e) => {
              e.preventDefault();
              const r = addAccount({ code: acc.code, name: acc.name, type: acc.type, description: acc.description });
              flash(r);
              if (r.success) setAcc({ code: '', name: '', type: acc.type, description: '' });
            }}
            className={`${cardCls} p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-5 gap-3`}
          >
            <h2 className="col-span-2 sm:col-span-5 font-bold text-[#111827] dark:text-white">Add an account</h2>
            <div className="min-w-0"><label className={labelCls} htmlFor="acc-code">Code</label><input id="acc-code" inputMode="numeric" value={acc.code} onChange={(e) => setAcc({ ...acc, code: e.target.value })} placeholder="e.g. 1020" className={`${inputCls} tabular-nums`} /></div>
            <div className="min-w-0"><label className={labelCls} htmlFor="acc-type">Type</label><select id="acc-type" value={acc.type} onChange={(e) => setAcc({ ...acc, type: e.target.value as AccountType })} className={inputCls}>{ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
            <div className="col-span-2 min-w-0"><label className={labelCls} htmlFor="acc-name">Name</label><input id="acc-name" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} placeholder="e.g. Meezan Bank current account" className={inputCls} /></div>
            <div className="col-span-2 sm:col-span-1 flex items-end"><button type="submit" className={`${primaryBtn} w-full`}>Add account</button></div>
          </form>}
          {isAdminUnlocked && can('admin_screen') && (
            <div className={`${cardCls} p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end gap-3`}>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-[#111827] dark:text-white">Close the books (period lock)</h2>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">After the accountant has finished a period, lock it so nobody can add or delete anything dated on or before this date — bills, payments, expenses, transfers or journals.</p>
              </div>
              <div className="w-44"><label className={labelCls} htmlFor="lock-date">Locked up to</label><input id="lock-date" type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} className={inputCls} /></div>
              <button type="button" disabled={!lockDate} onClick={() => { updateSettings({ booksLockedUntil: lockDate }); setNotice({ kind: 'ok', text: `Books closed up to ${formatDate(lockDate)}.` }); }} className={secondaryBtn}><Lock className="w-4 h-4" /> Lock</button>
              {settings.booksLockedUntil && <button type="button" onClick={() => { updateSettings({ booksLockedUntil: undefined }); setLockDate(''); setNotice({ kind: 'ok', text: 'Books unlocked.' }); }} className={dangerBtn}><Unlock className="w-4 h-4" /> Unlock</button>}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Profit & Loss ---------------- */}
      {tab === 'pnl' && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 sm:px-5 py-4 border-b border-[#E5E5E1] dark:border-[#203248]">
            <div className="grid grid-cols-2 gap-3 w-full sm:w-auto sm:min-w-[340px]">{dateField('pnl-from', 'From', from, setFrom)}{dateField('pnl-to', 'To', to, setTo)}</div>
            <div className="flex gap-2"><CsvButton fileName={`profit-and-loss-${from}-to-${to}.csv`} table={() => profitLossCsv(pnl)} label="Download profit and loss CSV" />{printBtn(() => setPrintRequest({ type: 'profit_loss', from, to }), 'Print profit and loss')}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px]" aria-label="Profit and loss">
              <tbody>
                {statementSection('Income', pnl.income, pnl.totalIncome, 'Total income')}
                {statementSection('Cost of sales', pnl.costOfSales, pnl.totalCostOfSales, 'Total cost of sales')}
                <tr className="font-bold bg-[#FAF9F6] dark:bg-[#0D1520]"><td className={tdCls}>Gross profit</td><td className={numCls}>{money(pnl.grossProfit)}</td></tr>
                {statementSection('Expenses', pnl.expenses, pnl.totalExpenses, 'Total expenses')}
                <tr className="font-extrabold border-t-2 border-[#111827] dark:border-white"><td className={tdCls}>{pnl.netProfit >= 0 ? 'Net profit' : 'Net loss'}</td><td className={`${numCls} text-base ${pnl.netProfit >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`} data-testid="pnl-net">{money(pnl.netProfit)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'cashflow' && <CashFlowTab journal={journal} accounts={accounts} />}
      {tab === 'assets' && <FixedAssetsTab flash={flash} />}
      {tab === 'staff' && <StaffTab flash={flash} />}
      {tab === 'budget' && <BudgetTab journal={journal} accounts={accounts} flash={flash} />}
      {tab === 'centres' && <CostCentresTab journal={journal} accounts={accounts} flash={flash} />}
      {tab === 'year' && <YearEndTab journal={journal} accounts={accounts} flash={flash} />}

      {/* ---------------- Profit by item / customer (needs finance:view_pnl) ---------------- */}
      {tab === 'profit' && canPost && <ProfitView />}

      {/* ---------------- Balance sheet ---------------- */}
      {tab === 'bs' && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 sm:px-5 py-4 border-b border-[#E5E5E1] dark:border-[#203248]">
            <div className="w-44">{dateField('bs-asof', 'As of', asOf, setAsOf)}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {statusPill(bs.balanced, 'Balanced ✓', `Out by ${rs(Math.abs(bs.difference))}`)}
              <CsvButton fileName={`balance-sheet-${asOf}.csv`} table={() => balanceSheetCsv(bs)} label="Download balance sheet CSV" />
              {printBtn(() => setPrintRequest({ type: 'balance_sheet', asOf }), 'Print balance sheet')}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px]" aria-label="Balance sheet">
              <tbody>
                {statementSection('Assets', bs.assets, bs.totalAssets, 'Total assets')}
                {statementSection('Liabilities', bs.liabilities, bs.totalLiabilities, 'Total liabilities')}
                <tr className="bg-[#FAF9F6] dark:bg-[#0D1520]"><td colSpan={2} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">Equity</td></tr>
                {bs.equity.map((r) => (
                  <tr key={r.account.code} className="border-b border-[#F1F0EC] dark:border-[#1E2E40]"><td className={tdCls}><button type="button" onClick={() => openGl(r.account.code)} className="text-left hover:underline"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{r.account.code}</span>{r.account.name}</button></td><td className={numCls}>{money(r.amount)}</td></tr>
                ))}
                <tr className="border-b border-[#F1F0EC] dark:border-[#1E2E40]"><td className={tdCls}>Profit to date (not yet closed)</td><td className={numCls}>{money(bs.profitToDate)}</td></tr>
                <tr className="border-b border-[#E5E5E1] dark:border-[#203248] font-bold"><td className={tdCls}>Total equity</td><td className={numCls}>{money(bs.totalEquity)}</td></tr>
                <tr className="font-extrabold border-t-2 border-[#111827] dark:border-white"><td className={tdCls}>Liabilities + equity</td><td className={numCls}>{money(bs.totalLiabilities + bs.totalEquity)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <JournalEntryModal key={newJournal} isOpen={newJournal > 0} onClose={() => setNewJournal(0)} onSaved={(m) => flash({ success: true, message: m })} accounts={accounts} />
      <ConfirmDialog
        isOpen={Boolean(confirmDel)}
        title={confirmDel?.title || ''}
        message={confirmDel?.message || ''}
        confirmLabel={confirmDel?.label}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => { confirmDel?.action(); setConfirmDel(null); }}
      />
    </div>
  );
};
