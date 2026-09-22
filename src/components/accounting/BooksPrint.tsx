import React, { useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import { useAccounting } from '../../hooks/useAccounting';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { amountInWordsPK } from '../../utils/chequePrint';
import { JournalEntry, mergeAccounts } from '../../utils/accounting';
import { accountLedger, parseRef, partyBalanceReport, partyReportTitle, PartyReportKind, voucherTypeInfo } from '../../utils/vouchers';
import { bankNameOf } from '../../utils/banks';

/** Vouchers, the account ledger and the receivable / payable reports, printed like the old desktop reports. */
export type BooksPrintRequest =
  | { type: 'vouchers_print'; ids: string[] }
  | { type: 'account_ledger'; ref: string; from: string; to: string }
  | { type: 'party_balances'; kind: PartyReportKind; cityWise: boolean; city?: string };

const TYPES = ['vouchers_print', 'account_ledger', 'party_balances'];
export const isBooksPrint = (r: { type: string } | null | undefined): r is BooksPrintRequest => !!r && TYPES.includes(r.type);

const money = (n: number) => new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const drcr = (n: number) => (Math.abs(n) < 0.005 ? '0.00' : `${money(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`);
const th = 'py-1.5 px-2 text-[10px] uppercase tracking-wider text-gray-700 border-b-2 border-gray-900';
const td = 'py-1 px-2 align-top';
const tdn = 'py-1 px-2 text-right font-mono whitespace-nowrap align-top';

/** Shop name centred on top, the report title under it (the old program's layout). */
const ReportHead: React.FC<{ shop: string; address?: string; title: string; sub?: React.ReactNode }> = ({ shop, address, title, sub }) => (
  <div className="text-center border-b-2 border-gray-900 pb-2 mb-3">
    <div className="text-xl font-extrabold tracking-wide">{shop}</div>
    {address && <div className="text-[11px] text-gray-600">{address}</div>}
    <div className="mt-1 text-sm font-bold uppercase tracking-widest">{title}</div>
    {sub && <div className="text-[11px] text-gray-700 mt-0.5">{sub}</div>}
  </div>
);

export const useBooksPrint = (request: { type: string } | null) => {
  const t = useTrading();
  const { settings, manualJournals, customers, suppliers, ledger, customAccounts, bankAccounts, currentUser } = t;
  const needsBooks = Boolean(request && request.type === 'account_ledger' && parseRef((request as unknown as { ref: string }).ref || '').kind === 'account');
  const books = useAccounting(needsBooks);
  return useMemo(() => {
    if (!isBooksPrint(request)) return null;
    const shop = settings.companyName || 'Sarmaya';
    const address = [settings.companyAddress, settings.companyPhone].filter(Boolean).join(' • ');
    const accounts = mergeAccounts(customAccounts);
    const accName = (code: string) => accounts.find((a) => a.code === code)?.name || code;
    const page = (children: React.ReactNode) => <div className="p-6 sm:p-8 w-[186mm] max-w-full text-gray-900 text-xs">{children}</div>;

    if (request.type === 'vouchers_print') {
      const list = request.ids.map((id) => manualJournals.find((j) => j.id === id)).filter(Boolean) as JournalEntry[];
      if (!list.length) return null;
      const one = (v: JournalEntry, i: number) => {
        const info = voucherTypeInfo(v.voucherType || 'JV');
        const total = v.lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
        const partyCode = (l: JournalEntry['lines'][number]) =>
          l.partyType === 'customer' ? customers.find((c) => c.id === l.partyId)?.code || '' : l.partyType === 'supplier' ? suppliers.find((s) => s.id === l.partyId)?.code || '' : l.accountCode;
        const title = (l: JournalEntry['lines'][number]) =>
          l.partyType === 'customer' ? customers.find((c) => c.id === l.partyId)?.name || 'Customer' : l.partyType === 'supplier' ? (() => { const s = suppliers.find((x) => x.id === l.partyId); return s ? s.company || s.name : 'Supplier'; })() : accName(l.accountCode);
        return (
          <div key={v.id} data-testid="printed-voucher" className={i < list.length - 1 ? 'mb-8 pb-6 border-b border-dashed border-gray-400 break-after-page' : ''} style={i < list.length - 1 ? { breakAfter: 'page' } : undefined}>
            <ReportHead shop={shop} address={address} title={info.label} />
            <div className="flex flex-wrap justify-between gap-2 mb-2 text-[11px]">
              <span>Voucher No: <strong className="font-mono">{v.ref}</strong></span>
              {v.bankCode && <span>Bank: <strong>{bankNameOf(bankAccounts, v.bankCode)}</strong></span>}
              <span>Date: <strong>{formatDate(v.date)}</strong></span>
            </div>
            <div className="mb-2 text-[11px]">Narration: {v.memo}</div>
            <table className="w-full border-collapse">
              <thead><tr><th className={`${th} text-left`}>Code</th><th className={`${th} text-left`}>Account</th><th className={`${th} text-left`}>Narration</th><th className={`${th} text-right`}>Debit</th><th className={`${th} text-right`}>Credit</th></tr></thead>
              <tbody>
                {v.lines.map((l, k) => (
                  <tr key={k} className="border-b border-gray-200">
                    <td className={`${td} font-mono`}>{partyCode(l)}</td>
                    <td className={td}>{title(l)}</td>
                    <td className={td}>{l.moneySide ? '' : l.narration || ''}</td>
                    <td className={tdn}>{l.debit ? money(l.debit) : ''}</td>
                    <td className={tdn}>{l.credit ? money(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t-2 border-gray-900"><td className={td} colSpan={3}>Total</td><td className={tdn}>{money(total)}</td><td className={tdn}>{money(v.lines.reduce((a, l) => a + (Number(l.credit) || 0), 0))}</td></tr></tfoot>
            </table>
            <div className="mt-2 text-[11px]">Amount in words: <strong>{amountInWordsPK(total)}</strong></div>
            <div className="mt-12 grid grid-cols-4 gap-4 text-center text-[11px]" data-testid="voucher-signatures">
              {['Prepared by', 'Checked by', 'Approved by', 'Received by'].map((s) => (
                <div key={s}><div className="border-t border-gray-900 pt-1">{s}</div>{s === 'Prepared by' && <div className="text-[10px] text-gray-500">{v.createdBy || ''}</div>}</div>
              ))}
            </div>
          </div>
        );
      };
      return { title: 'VOUCHERS', number: list.length === 1 ? list[0].ref : `${list.length} vouchers`, date: todayISO(), raw: true, body: page(list.map(one)) };
    }

    if (request.type === 'account_ledger') {
      const rep = accountLedger(request.ref, request.from, request.to, { journal: books.journal, accounts, customers, suppliers, ledger });
      return {
        title: 'ACCOUNT LEDGER',
        number: rep.code || rep.title,
        date: todayISO(),
        raw: true,
        body: page(
          <div data-testid="printed-account-ledger">
            <ReportHead shop={shop} address={address} title="Account Ledger Report" sub={<>Account: <strong>{rep.code ? `${rep.code} — ` : ''}{rep.title}</strong> • Date From {formatDate(request.from)} To {formatDate(request.to)}</>} />
            <table className="w-full border-collapse">
              <thead><tr><th className={`${th} text-left`}>Date</th><th className={`${th} text-left`}>VchNo</th><th className={`${th} text-left`}>Narration</th><th className={`${th} text-right`}>Debit</th><th className={`${th} text-right`}>Credit</th><th className={`${th} text-right`}>Balance</th></tr></thead>
              <tbody>
                <tr className="border-b border-gray-200 font-semibold"><td className={td}>{formatDate(request.from)}</td><td className={td}>OB</td><td className={td}>Opening balance</td><td className={tdn} /><td className={tdn} /><td className={tdn}>{drcr(rep.opening)}</td></tr>
                {rep.rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className={`${td} whitespace-nowrap`}>{formatDate(r.date)}</td>
                    <td className={`${td} font-mono whitespace-nowrap`}>{r.ref}</td>
                    <td className={td}>{r.narration}</td>
                    <td className={tdn}>{r.debit ? money(r.debit) : ''}</td>
                    <td className={tdn}>{r.credit ? money(r.credit) : ''}</td>
                    <td className={tdn}>{drcr(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t-2 border-gray-900"><td className={td} colSpan={3}>Grand Total</td><td className={tdn}>{money(rep.totalDebit)}</td><td className={tdn}>{money(rep.totalCredit)}</td><td className={tdn}>{drcr(rep.closing)}</td></tr></tfoot>
            </table>
            <div className="mt-6 flex justify-between text-[10px] text-gray-500"><span>Printed {formatDate(todayISO())}{currentUser ? ` by ${currentUser.name}` : ''}</span><span>Amounts in PKR (Rs.)</span></div>
          </div>
        ),
      };
    }

    // Receivable / payable, optionally city-wise.
    const rep = partyBalanceReport(customers, suppliers, { kind: request.kind, cityWise: request.cityWise, city: request.city });
    const title = partyReportTitle(request.kind, request.cityWise);
    return {
      title: title.toUpperCase(),
      number: request.city || '',
      date: todayISO(),
      raw: true,
      body: page(
        <div data-testid="printed-party-balances">
          <ReportHead shop={shop} address={address} title={title} sub={<>As of {formatDate(todayISO())}{request.city ? ` • City: ${request.city}` : ''}</>} />
          <table className="w-full border-collapse">
            <thead><tr><th className={`${th} text-left`}>Code</th><th className={`${th} text-left`}>Name</th><th className={`${th} text-left`}>City</th><th className={`${th} text-left`}>Phone</th><th className={`${th} text-right`}>Balance</th></tr></thead>
            <tbody>
              {rep.groups.map((g) => (
                <React.Fragment key={g.city || 'all'}>
                  {rep.cityWise && <tr><td colSpan={5} className="pt-3 pb-1 px-2 font-bold uppercase tracking-wider text-[10px]">{g.city}</td></tr>}
                  {g.rows.map((r) => (
                    <tr key={r.ref} className="border-b border-gray-100"><td className={`${td} font-mono`}>{r.code}</td><td className={td}>{r.name}</td><td className={td}>{r.city}</td><td className={td}>{r.phone}</td><td className={tdn}>{drcr(r.balance)}</td></tr>
                  ))}
                  {rep.cityWise && <tr className="font-semibold border-b border-gray-400"><td className={td} colSpan={4}>Subtotal {g.city}</td><td className={tdn}>{request.kind !== 'payable' ? `${money(g.receivable)} Dr` : ''}{request.kind === 'both' ? ' / ' : ''}{request.kind !== 'receivable' ? `${money(g.payable)} Cr` : ''}</td></tr>}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              {request.kind !== 'payable' && <tr className="font-bold border-t-2 border-gray-900"><td className={td} colSpan={4}>Grand total receivable</td><td className={tdn}>{money(rep.receivable)} Dr</td></tr>}
              {request.kind !== 'receivable' && <tr className="font-bold"><td className={td} colSpan={4}>Grand total payable</td><td className={tdn}>{money(rep.payable)} Cr</td></tr>}
            </tfoot>
          </table>
        </div>
      ),
    };
  }, [request, settings, manualJournals, customers, suppliers, ledger, customAccounts, bankAccounts, books, currentUser]);
};
