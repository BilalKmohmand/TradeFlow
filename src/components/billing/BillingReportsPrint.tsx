import React, { useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import { formatDate, moneyText } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { sumAging } from '../../utils/finance';
import { billingPayablesAging, billingReceivablesAging, itemHistory, profitFromBills, purchaseRegister } from '../../utils/stockReports';
import { fmtExpiry } from '../../utils/inventory';

/** Printable billing-mode reports and the debit note (shown by PrintDocument). */
export type BillingPrintRequest =
  | { type: 'billing_report'; report: 'aging'; side: 'customers' | 'suppliers'; asOf: string }
  | { type: 'billing_report'; report: 'purchase_register'; from: string; to: string; supplierId?: string; productId?: string }
  | { type: 'billing_report'; report: 'profit'; from: string; to: string }
  | { type: 'billing_report'; report: 'item_history'; productId: string }
  | { type: 'debit_note'; returnId: string };

export const isBillingPrint = (r: { type: string } | null | undefined): r is BillingPrintRequest => !!r && (r.type === 'billing_report' || r.type === 'debit_note');

const money = (n: number) => moneyText(n);
const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
const th = 'py-2 px-2 text-[10px] uppercase tracking-widest text-gray-600';
const tdn = 'py-1.5 px-2 text-right font-mono whitespace-nowrap';

type Content = { title: string; number: string; date: string; body: React.ReactNode };

/** Builds the printable content for a billing report request (null for any other request). */
export const useBillingReportPrint = (request: { type: string } | null): Content | null => {
  const t = useTrading();
  const { customers, suppliers, ledger, purchases, returns, adjustments, products, invoices, stockTransfers, dispatches, godowns, settings } = t;
  return useMemo(() => {
    if (!isBillingPrint(request)) return null;

    if (request.type === 'debit_note') {
      const r = returns.find((x) => x.id === request.returnId && x.kind === 'purchase');
      if (!r) return null;
      const sup = suppliers.find((s) => s.id === r.supplierId);
      const prod = products.find((p) => p.id === r.productId);
      const unit = r.unit || prod?.unit || 'pcs';
      return {
        title: 'DEBIT NOTE',
        number: r.returnNumber,
        date: r.date,
        body: (
          <>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">From</div>
                <div className="font-bold text-sm">{settings.companyName || 'Sarmaya'}</div>
                <div>{settings.companyAddress}</div>
                <div className="font-mono">{settings.companyPhone}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">To supplier</div>
                <div className="font-bold text-sm">{sup?.company || sup?.name || 'Supplier'}</div>
                {sup?.company && sup.name !== sup.company && <div>{sup.name}</div>}
                <div>{sup?.address}</div>
                <div className="font-mono">{sup?.phone}</div>
              </div>
            </div>
            <p className="mt-5 text-xs">We have returned the goods below and debited your account.</p>
            <table className="w-full text-xs mt-3 border-collapse">
              <thead><tr className="bg-gray-800 text-white text-[10px] uppercase tracking-widest"><th className="text-left py-2 px-3">Description</th><th className="text-right py-2 px-3">Qty</th><th className="text-right py-2 px-3">Rate</th><th className="text-right py-2 px-3">Amount</th></tr></thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="py-3 px-3"><div className="font-bold">{prod?.name || 'Goods'} returned</div><div className="text-gray-600">Reason: {r.reason}</div>{(r.batches || []).map((b) => <div key={b.batchId} className="text-[10px] text-gray-600">Batch {b.batchNo}{b.expiryDate ? ` · Exp ${fmtExpiry(b.expiryDate)}` : ''}{(r.batches || []).length > 1 ? ` × ${b.qty}` : ''}</div>)}</td>
                  <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{num(r.kg)}{unit !== 'pcs' ? ` ${unit}` : ''}</td>
                  <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{money(r.pricePerKg)}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">{money(r.amount)}</td>
                </tr>
              </tbody>
              <tfoot><tr><td colSpan={3} className="pt-4 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Total debited</td><td className="pt-4 px-3 text-right font-mono font-extrabold text-base whitespace-nowrap">Rs. {money(r.amount)}</td></tr></tfoot>
            </table>
            <p className="mt-4 text-xs text-gray-600">This amount has been taken off the balance we owe you.</p>
            <div className="grid grid-cols-2 gap-10 mt-16 text-xs"><div className="border-t border-gray-900 pt-2">For {settings.companyName || 'Sarmaya'}</div><div className="border-t border-gray-900 pt-2">Received by supplier</div></div>
          </>
        ),
      };
    }

    if (request.report === 'aging') {
      const rows = request.side === 'customers' ? billingReceivablesAging(customers, ledger, request.asOf) : billingPayablesAging(suppliers, ledger, request.asOf);
      const s = sumAging(rows);
      return {
        title: request.side === 'customers' ? 'CUSTOMERS OWE — AGING' : 'SUPPLIERS OWED — AGING',
        number: `As of ${formatDate(request.asOf)}`,
        date: todayISO(),
        body: (
          <table className="w-full text-xs border-collapse">
            <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>Name</th><th className={`${th} text-right`}>0–30</th><th className={`${th} text-right`}>31–60</th><th className={`${th} text-right`}>61–90</th><th className={`${th} text-right`}>90+</th><th className={`${th} text-right`}>Total</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-gray-500">Nothing owed.</td></tr>}
              {rows.map((r) => (
                <tr key={r.entityId} className="border-b border-gray-100"><td className="py-1.5 px-2">{r.name}{r.phone ? <span className="text-gray-500"> · {r.phone}</span> : null}</td><td className={tdn}>{r.current ? money(r.current) : ''}</td><td className={tdn}>{r.d31_60 ? money(r.d31_60) : ''}</td><td className={tdn}>{r.d61_90 ? money(r.d61_90) : ''}</td><td className={`${tdn} font-bold`}>{r.d90plus ? money(r.d90plus) : ''}</td><td className={`${tdn} font-bold`}>{money(r.total)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr className="font-bold border-t-2 border-gray-900"><td className="py-2 px-2">Total</td><td className={tdn}>{money(s.current)}</td><td className={tdn}>{money(s.d31_60)}</td><td className={tdn}>{money(s.d61_90)}</td><td className={tdn}>{money(s.d90plus)}</td><td className={tdn}>{money(s.total)}</td></tr></tfoot>
          </table>
        ),
      };
    }

    if (request.report === 'purchase_register') {
      const reg = purchaseRegister({ purchases, returns, adjustments, suppliers, products }, { from: request.from, to: request.to, supplierId: request.supplierId, productId: request.productId });
      const sup = request.supplierId ? suppliers.find((s) => s.id === request.supplierId) : null;
      const prod = request.productId ? products.find((p) => p.id === request.productId) : null;
      return {
        title: 'PURCHASE REGISTER',
        number: `${formatDate(request.from)} to ${formatDate(request.to)}`,
        date: todayISO(),
        body: (
          <>
            {(sup || prod) && <p className="text-xs mb-3">{sup ? `Supplier: ${sup.company || sup.name}` : ''}{sup && prod ? ' · ' : ''}{prod ? `Item: ${prod.name}` : ''}</p>}
            <table className="w-full text-xs border-collapse">
              <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>Date</th><th className={`${th} text-left`}>Ref</th><th className={`${th} text-left`}>Supplier</th><th className={`${th} text-left`}>Item</th><th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th></tr></thead>
              <tbody>
                {reg.rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-500">No stock received in these dates.</td></tr>}
                {reg.rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="border-b border-gray-100"><td className="py-1.5 px-2 whitespace-nowrap">{formatDate(r.date)}</td><td className="py-1.5 px-2 font-mono">{r.ref}</td><td className="py-1.5 px-2">{r.supplier}{r.kind === 'return' ? ' (returned)' : ''}</td><td className="py-1.5 px-2">{r.item}</td><td className={tdn}>{num(r.qty)} {r.unit}</td><td className={tdn}>{r.rate ? money(r.rate) : ''}</td><td className={`${tdn} font-bold`}>{money(r.amount)}</td></tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={6} className="pt-3 px-2 text-right text-gray-600">Stock received</td><td className={`${tdn} pt-3`}>{money(reg.received)}</td></tr>
                <tr><td colSpan={6} className="px-2 text-right text-gray-600">Sent back to suppliers</td><td className={tdn}>− {money(reg.returned)}</td></tr>
                <tr className="font-bold"><td colSpan={6} className="px-2 text-right uppercase tracking-widest text-[10px]">Net</td><td className={`${tdn} text-sm`}>Rs. {money(reg.net)}</td></tr>
              </tfoot>
            </table>
          </>
        ),
      };
    }

    if (request.report === 'profit') {
      const rep = profitFromBills({ invoices, returns, purchases, products, customers }, request.from, request.to);
      const table = (title: string, rows: typeof rep.byItem, kind: 'item' | 'customer') => (
        <>
          <h3 className="mt-5 mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-600">{title}</h3>
          <table className="w-full text-xs border-collapse">
            <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>{kind === 'item' ? 'Item' : 'Customer'}</th><th className={`${th} text-right`}>{kind === 'item' ? 'Qty' : 'Bills'}</th><th className={`${th} text-right`}>Sales</th><th className={`${th} text-right`}>Cost</th><th className={`${th} text-right`}>Profit</th><th className={`${th} text-right`}>Margin</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-500">No bills.</td></tr>}
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-gray-100"><td className="py-1.5 px-2">{r.name}{r.uncosted ? ' *' : ''}</td><td className={tdn}>{kind === 'item' ? `${num(r.qty || 0)} ${r.unit || ''}` : r.bills}</td><td className={tdn}>{money(r.sales)}</td><td className={tdn}>{money(r.cost)}</td><td className={`${tdn} font-bold`}>{money(r.profit)}</td><td className={tdn}>{r.marginPct == null ? '' : `${r.marginPct}%`}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      );
      return {
        title: 'PROFIT BY ITEM & CUSTOMER',
        number: `${formatDate(request.from)} to ${formatDate(request.to)}`,
        date: todayISO(),
        body: (
          <>
            <table className="w-full text-xs"><tbody>
              <tr><td className="py-1">Sales ({rep.totals.bills} bills)</td><td className={tdn}>{money(rep.totals.sales)}</td></tr>
              <tr><td className="py-1">Cost of items sold</td><td className={tdn}>− {money(rep.totals.cost)}</td></tr>
              <tr className="font-bold border-t border-gray-900"><td className="py-1">Profit{rep.totals.marginPct != null ? ` (${rep.totals.marginPct}%)` : ''}</td><td className={`${tdn} text-sm`}>Rs. {money(rep.totals.profit)}</td></tr>
            </tbody></table>
            {table('By item', rep.byItem, 'item')}
            {table('By customer', rep.byCustomer, 'customer')}
            {rep.totals.uncosted > 0 && <p className="mt-3 text-[10px] text-gray-500">* some lines have no known cost; their profit is overstated.</p>}
            <p className="mt-2 text-[10px] text-gray-500">Sales exclude tax and delivery charges and are after bill discounts. Returns by customers are taken off.</p>
          </>
        ),
      };
    }

    if (request.report === 'item_history') {
      const p = products.find((x) => x.id === request.productId);
      if (!p) return null;
      const h = itemHistory(p.id, { products, customers, suppliers, invoices, purchases, returns, adjustments, stockTransfers, dispatches, godowns });
      return {
        title: 'ITEM STOCK HISTORY',
        number: p.name,
        date: todayISO(),
        body: (
          <table className="w-full text-xs border-collapse">
            <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>Date</th><th className={`${th} text-left`}>What</th><th className={`${th} text-right`}>In</th><th className={`${th} text-right`}>Out</th><th className={`${th} text-right`}>Balance</th></tr></thead>
            <tbody>
              {h.rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100"><td className="py-1.5 px-2 whitespace-nowrap">{r.date ? formatDate(r.date) : ''}</td><td className="py-1.5 px-2">{r.label}{r.kind === 'sold' && r.party ? ` — ${r.party}` : ''}{r.godown ? ` (${r.godown})` : ''}{r.note ? <span className="text-gray-500"> · {r.note}</span> : null}</td><td className={tdn}>{r.change > 0 ? num(r.change) : ''}</td><td className={tdn}>{r.change < 0 ? num(-r.change) : ''}</td><td className={`${tdn} font-bold`}>{num(r.balance)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr className="font-bold border-t-2 border-gray-900"><td colSpan={4} className="py-2 px-2 text-right">In stock now ({p.unit || 'pcs'}{godowns.length > 1 ? ', all godowns' : ''})</td><td className={tdn}>{num(h.closing)}</td></tr></tfoot>
          </table>
        ),
      };
    }
    return null;
  }, [request, customers, suppliers, ledger, purchases, returns, adjustments, products, invoices, stockTransfers, dispatches, godowns, settings]);
};
