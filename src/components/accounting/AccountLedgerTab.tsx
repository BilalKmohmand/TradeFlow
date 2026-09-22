import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { cardCls, inputCls, labelCls, secondaryBtn } from '../billing/ui';
import { CsvButton } from '../billing/CsvButton';
import { Account, JournalEntry, drCr } from '../../utils/accounting';
import { accountLedger, accountOptions, ledgerCsv } from '../../utils/vouchers';
import { AccountPicker } from './AccountPicker';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';

const money = (n: number) => new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const th = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap';
const td = 'px-3 py-2 text-sm';
const tdn = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';

/**
 * The old program's "Account Ledger": any account — a customer, a supplier, a bank, cash, an expense or
 * income — for a date range, with the OB row, running Dr / Cr balance and the grand total.
 */
export const AccountLedgerTab: React.FC<{ accounts: Account[]; journal: JournalEntry[]; initial?: string; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }> = ({ accounts, journal, initial, from, to, setFrom, setTo }) => {
  const { customers, suppliers, ledger, setPrintRequest } = useTrading();
  const today = todayISO();
  const [ref, setRef] = useState(initial || '1000');
  const options = useMemo(() => accountOptions(accounts, customers, suppliers), [accounts, customers, suppliers]);
  const rep = useMemo(() => accountLedger(ref, from, to, { journal, accounts, customers, suppliers, ledger }), [ref, from, to, journal, accounts, customers, suppliers, ledger]);
  return (
    <div className={`${cardCls} overflow-hidden`} data-testid="account-ledger">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-5 py-4 border-b border-[#E5E5E1] dark:border-[#203248]">
        <div className="col-span-2 min-w-0">
          <label className={labelCls} htmlFor="al-account">Account (code or name)</label>
          <AccountPicker id="al-account" aria-label="Ledger account" value={ref} options={options} onPick={(r) => r && setRef(r)} />
        </div>
        <div className="min-w-0"><label className={labelCls} htmlFor="al-from">Date from</label><input id="al-from" type="date" value={from} onChange={(e) => setFrom(e.target.value || today)} className={inputCls} /></div>
        <div className="min-w-0"><label className={labelCls} htmlFor="al-to">Date to</label><input id="al-to" type="date" value={to} onChange={(e) => setTo(e.target.value || today)} className={inputCls} /></div>
        <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold text-[#111827] dark:text-white min-w-0 truncate">{rep.code ? <span className="tabular-nums text-[#8E9299] mr-1.5">{rep.code}</span> : null}{rep.title}</span>
          <span className="flex gap-2">
            <CsvButton fileName={`account-ledger-${rep.code || 'party'}-${from}-to-${to}.csv`} table={() => ledgerCsv(rep)} label="Download account ledger CSV" />
            <button type="button" onClick={() => setPrintRequest({ type: 'account_ledger', ref, from, to })} className={secondaryBtn} aria-label="Print account ledger"><Printer className="w-4 h-4" /> Print</button>
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]" aria-label="Account ledger">
          <thead><tr className="border-b border-[#E5E5E1] dark:border-[#203248] text-left"><th className={th}>Date</th><th className={th}>VchNo</th><th className={th}>Narration</th><th className={`${th} text-right`}>Debit</th><th className={`${th} text-right`}>Credit</th><th className={`${th} text-right`}>Balance</th></tr></thead>
          <tbody>
            <tr className="border-b border-[#F1F0EC] dark:border-[#1E2E40] font-semibold" data-testid="ledger-ob"><td className={`${td} tabular-nums text-xs`}>{formatDate(from)}</td><td className={td}>OB</td><td className={td}>Opening balance</td><td className={tdn} /><td className={tdn} /><td className={tdn}>{drCr(rep.opening)}</td></tr>
            {rep.rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-[#8E9299]">Nothing posted to this account in these dates.</td></tr>}
            {rep.rows.map((r, i) => (
              <tr key={i} className="border-b border-[#F1F0EC] dark:border-[#1E2E40]" data-testid="ledger-row">
                <td className={`${td} tabular-nums text-xs whitespace-nowrap`}>{formatDate(r.date)}</td>
                <td className={`${td} tabular-nums text-xs whitespace-nowrap`}>{r.ref}</td>
                <td className={`${td} min-w-[200px]`}>{r.narration}</td>
                <td className={tdn}>{r.debit ? money(r.debit) : ''}</td>
                <td className={tdn}>{r.credit ? money(r.credit) : ''}</td>
                <td className={`${tdn} font-bold`}>{drCr(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold border-t-2 border-[#111827] dark:border-white" data-testid="ledger-total"><td colSpan={3} className={td}>Grand Total</td><td className={tdn}>{money(rep.totalDebit)}</td><td className={tdn}>{money(rep.totalCredit)}</td><td className={tdn}>{drCr(rep.closing)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
