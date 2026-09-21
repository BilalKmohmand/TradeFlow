import React, { useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import type { SalesExtrasPrintRequest } from '../../context/salesExtrasActions';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { commissionReport, recoveryList, salesByGroup } from '../../utils/salesExtras';

export const isSalesExtrasPrint = (r: { type: string } | null | undefined): r is SalesExtrasPrintRequest => !!r && r.type === 'sales_extras';

const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
const th = 'py-2 px-2 text-[10px] uppercase tracking-widest text-gray-600';
const tdn = 'py-1.5 px-2 text-right font-mono whitespace-nowrap';

type Content = { title: string; number: string; date: string; body: React.ReactNode };

/** Printable sales-by-salesman/area, recovery list, collection sheet and commission (shown by PrintDocument). */
export const useSalesExtrasPrint = (request: { type: string } | null): Content | null => {
  const { customers, ledger, invoices, returns, expenses, salesmen, areas } = useTrading();
  return useMemo(() => {
    if (!isSalesExtrasPrint(request)) return null;
    const names = { salesmen, areas };
    const who = (by: 'salesman' | 'area') => (by === 'salesman' ? 'Salesman' : 'Area');

    if (request.report === 'sales_by') {
      const rep = salesByGroup(invoices, returns, request.from, request.to, request.by, names);
      return {
        title: `SALES BY ${request.by === 'salesman' ? 'SALESMAN' : 'AREA'}`,
        number: `${formatDate(request.from)} to ${formatDate(request.to)}`,
        date: todayISO(),
        body: (
          <>
            <table className="w-full text-xs border-collapse" data-testid="print-sales-by">
              <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>{who(request.by)}</th><th className={`${th} text-right`}>Bills</th><th className={`${th} text-right`}>Sales</th><th className={`${th} text-right`}>Returns</th><th className={`${th} text-right`}>Net sales</th><th className={`${th} text-right`}>Freight</th><th className={`${th} text-right`}>Tax</th><th className={`${th} text-right`}>Billed</th></tr></thead>
              <tbody>
                {rep.rows.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-gray-500">No bills in these dates.</td></tr>}
                {rep.rows.map((r) => (
                  <tr key={r.id || 'none'} className="border-b border-gray-100"><td className="py-1.5 px-2">{r.name}{r.freeQty ? <span className="text-gray-500"> · {r.freeQty} free</span> : null}</td><td className={tdn}>{r.bills}</td><td className={tdn}>{money(r.sales)}</td><td className={tdn}>{r.returns ? `− ${money(r.returns)}` : ''}</td><td className={`${tdn} font-bold`}>{money(r.net)}</td><td className={tdn}>{r.freight ? money(r.freight) : ''}</td><td className={tdn}>{r.tax ? money(r.tax) : ''}</td><td className={tdn}>{money(r.billed)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold border-t-2 border-gray-900"><td className="py-2 px-2">Total</td><td className={tdn}>{rep.totals.bills}</td><td className={tdn}>{money(rep.totals.sales)}</td><td className={tdn}>{rep.totals.returns ? `− ${money(rep.totals.returns)}` : ''}</td><td className={tdn}>{money(rep.totals.net)}</td><td className={tdn}>{money(rep.totals.freight)}</td><td className={tdn}>{money(rep.totals.tax)}</td><td className={tdn}>{money(rep.totals.billed)}</td></tr></tfoot>
            </table>
            <p className="mt-3 text-[10px] text-gray-500">Sales are after discounts, before tax and freight. Returns are goods sent back on these bills in the same dates.</p>
          </>
        ),
      };
    }

    if (request.report === 'recovery') {
      const rep = recoveryList(customers, ledger, request.asOf, request.by, names, request.filterId);
      const only = request.filterId && request.filterId !== 'all' ? (request.by === 'salesman' ? salesmen : areas).find((x) => x.id === request.filterId)?.name : request.filterId === '' ? `No ${request.by}` : null;
      return {
        title: 'RECOVERY LIST',
        number: `As of ${formatDate(request.asOf)}${only ? ` · ${only}` : ''}`,
        date: todayISO(),
        body: (
          <div data-testid="print-recovery">
            {rep.groups.length === 0 && <p className="py-4 text-center text-xs text-gray-500">Nobody owes money.</p>}
            {rep.groups.map((g) => (
              <div key={g.id || 'none'} className="mb-5 break-inside-avoid">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-700 mb-1">{who(request.by)}: {g.name}</h3>
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>Customer</th><th className={`${th} text-left`}>Phone</th><th className={`${th} text-left`}>Oldest bill</th><th className={`${th} text-right`}>Due</th><th className={`${th} text-right w-28`}>Received</th></tr></thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.customer.id} className="border-b border-gray-200"><td className="py-2 px-2">{r.customer.code ? <span className="font-mono">{r.customer.code} · </span> : null}{r.customer.name}{r.customer.address ? <div className="text-[10px] text-gray-500">{r.customer.address}</div> : null}</td><td className="py-2 px-2 font-mono">{r.customer.phone}</td><td className="py-2 px-2 whitespace-nowrap">{r.oldestDate ? `${formatDate(r.oldestDate)} (${r.oldestDays} d)` : ''}</td><td className={`${tdn} font-bold`}>{money(r.due)}</td><td className="py-2 px-2 border-b border-dotted border-gray-400" /></tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="font-bold"><td colSpan={3} className="pt-2 px-2 text-right">Total {g.name}</td><td className={tdn}>{money(g.total)}</td><td /></tr></tfoot>
                </table>
              </div>
            ))}
            <table className="w-full text-xs"><tbody><tr className="font-bold border-t-2 border-gray-900"><td className="py-2 px-2">Total due ({rep.count} customers)</td><td className={`${tdn} text-sm`}>Rs. {money(rep.total)}</td></tr></tbody></table>
            <div className="grid grid-cols-2 gap-10 mt-12 text-xs"><div className="border-t border-gray-900 pt-2">Recovery man</div><div className="border-t border-gray-900 pt-2">Checked by</div></div>
          </div>
        ),
      };
    }

    if (request.report === 'collection') {
      const rows = ledger.filter((l) => l.entityType === 'customer' && l.type === 'payment_received' && l.referenceId === request.sheetNo);
      if (rows.length === 0) return null;
      const date = rows[0].date;
      const sm = rows.find((r) => r.salesmanId)?.salesmanId;
      const total = rows.reduce((a, r) => a + r.credit, 0);
      const cash = rows.filter((r) => (r.method || 'Cash').toLowerCase().startsWith('cash')).reduce((a, r) => a + r.credit, 0);
      return {
        title: 'COLLECTION SHEET',
        number: request.sheetNo,
        date,
        body: (
          <div data-testid="print-collection">
            {sm && <p className="text-xs mb-3">Collected by: <b>{salesmen.find((s) => s.id === sm)?.name || '—'}</b></p>}
            <table className="w-full text-xs border-collapse">
              <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>#</th><th className={`${th} text-left`}>Customer</th><th className={`${th} text-left`}>Method</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Balance after</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = customers.find((x) => x.id === r.entityId);
                  return <tr key={r.id} className="border-b border-gray-100"><td className="py-1.5 px-2">{i + 1}</td><td className="py-1.5 px-2">{c?.code ? <span className="font-mono">{c.code} · </span> : null}{c?.name || 'Customer'}</td><td className="py-1.5 px-2">{r.method || 'Cash'}</td><td className={`${tdn} font-bold`}>{money(r.credit)}</td><td className={tdn}>{money(r.balanceAfter)}</td></tr>;
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={3} className="pt-3 px-2 text-right text-gray-600">Cash</td><td className={`${tdn} pt-3`}>{money(cash)}</td><td /></tr>
                <tr><td colSpan={3} className="px-2 text-right text-gray-600">Bank / wallet</td><td className={tdn}>{money(total - cash)}</td><td /></tr>
                <tr className="font-bold border-t-2 border-gray-900"><td colSpan={3} className="py-2 px-2 text-right uppercase tracking-widest text-[10px]">Total received</td><td className={`${tdn} text-sm`}>Rs. {money(total)}</td><td /></tr>
              </tfoot>
            </table>
            <div className="grid grid-cols-2 gap-10 mt-14 text-xs"><div className="border-t border-gray-900 pt-2">Handed over by</div><div className="border-t border-gray-900 pt-2">Received by (cashier)</div></div>
          </div>
        ),
      };
    }

    if (request.report === 'commission') {
      const rows = commissionReport({ salesmen, invoices, returns, ledger, customers, expenses }, request.from, request.to);
      return {
        title: 'SALESMAN COMMISSION',
        number: `${formatDate(request.from)} to ${formatDate(request.to)}`,
        date: todayISO(),
        body: (
          <table className="w-full text-xs border-collapse" data-testid="print-commission">
            <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>Salesman</th><th className={`${th} text-left`}>On</th><th className={`${th} text-right`}>Base</th><th className={`${th} text-right`}>%</th><th className={`${th} text-right`}>Earned in these dates</th><th className={`${th} text-right`}>Earned to date</th><th className={`${th} text-right`}>Paid to date</th><th className={`${th} text-right`}>Still owed (to date)</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-gray-500">No salesman has a commission set.</td></tr>}
              {rows.map((r) => (
                <tr key={r.salesman.id} className="border-b border-gray-100"><td className="py-1.5 px-2">{r.salesman.name}</td><td className="py-1.5 px-2">{r.basis === 'recovery' ? 'Money recovered' : 'Sales'}</td><td className={tdn}>{money(r.base)}</td><td className={tdn}>{r.pct}%</td><td className={`${tdn} font-bold`}>{money(r.earned)}</td><td className={tdn}>{money(r.earnedToDate)}</td><td className={tdn}>{money(r.paidToDate)}</td><td className={`${tdn} font-bold`}>{money(r.owed)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr className="font-bold border-t-2 border-gray-900"><td colSpan={4} className="py-2 px-2 text-right">Total earned</td><td className={tdn}>{money(rows.reduce((a, r) => a + r.earned, 0))}</td><td className={tdn}>{money(rows.reduce((a, r) => a + r.earnedToDate, 0))}</td><td className={tdn}>{money(rows.reduce((a, r) => a + r.paidToDate, 0))}</td><td className={tdn}>{money(rows.reduce((a, r) => a + r.owed, 0))}</td></tr></tfoot>
          </table>
        ),
      };
    }
    return null;
  }, [request, customers, ledger, invoices, returns, expenses, salesmen, areas]);
};
