import React, { useMemo } from 'react';
import { useTrading } from '../../../context/TradingContext';
import { formatDate } from '../../../utils/formatters';
import { todayISO } from '../../../utils/stockFlow';
import { CLAIM_STATUS_LABEL, MATCH_FLAG_LABEL, MATCH_STATUS_LABEL, PO_STATUS_LABEL, poLines, reorderReport, threeWayMatch } from '../../../utils/purchasing';
import { SUPPLIER_CLAIM_REASONS } from '../../../types';

/** Printable purchasing documents (shown by PrintDocument). */
export type PurchasingPrintRequest =
  | { type: 'purchase_order'; purchaseOrderId: string }
  | { type: 'supplier_bill'; billId: string }
  | { type: 'supplier_claim'; claimId: string }
  | { type: 'reorder_report' };

export const isPurchasingPrint = (r: { type: string } | null | undefined): r is PurchasingPrintRequest =>
  !!r && (r.type === 'purchase_order' || r.type === 'supplier_bill' || r.type === 'supplier_claim' || r.type === 'reorder_report');

const money = (n: number) => new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
const th = 'py-2 px-2 text-[10px] uppercase tracking-widest text-gray-600';
const tdn = 'py-1.5 px-2 text-right font-mono whitespace-nowrap';
type Content = { title: string; number: string; date: string; body: React.ReactNode };

export const usePurchasingPrint = (request: { type: string } | null): Content | null => {
  const { purchaseOrders, suppliers, products, purchases, supplierBills, supplierClaims, settings } = useTrading();
  return useMemo(() => {
    if (!isPurchasingPrint(request)) return null;
    const party = (supplierId: string, heading: string) => {
      const s = suppliers.find((x) => x.id === supplierId);
      return (
        <div className="grid grid-cols-2 gap-6 text-xs">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">From</div>
            <div className="font-bold text-sm">{settings.companyName || 'Sarmaya'}</div>
            <div>{settings.companyAddress}</div>
            <div className="font-mono">{settings.companyPhone}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{heading}</div>
            <div className="font-bold text-sm">{s?.company || s?.name || 'Supplier'}</div>
            {s?.company && s.name !== s.company && <div>{s.name}</div>}
            <div>{s?.address}</div>
            <div className="font-mono">{s?.phone}</div>
          </div>
        </div>
      );
    };
    const signatures = (a: string, b: string) => (
      <div className="grid grid-cols-2 gap-10 mt-14 text-xs">
        <div className="border-t border-gray-900 pt-2">{a}</div>
        <div className="border-t border-gray-900 pt-2">{b}</div>
      </div>
    );

    if (request.type === 'purchase_order') {
      const po = purchaseOrders.find((p) => p.id === request.purchaseOrderId);
      if (!po) return null;
      const lines = poLines(po);
      return {
        title: 'PURCHASE ORDER',
        number: po.poNumber,
        date: po.orderDate || po.createdAt.slice(0, 10),
        body: (
          <>
            {party(po.supplierId, 'To supplier')}
            <div className="mt-4 text-xs flex flex-wrap gap-x-6">
              <span>Status: <b>{PO_STATUS_LABEL[po.status]}</b></span>
              {po.expectedDate && <span>Deliver by: <b>{formatDate(po.expectedDate)}</b></span>}
            </div>
            <table className="w-full text-xs mt-4 border-collapse">
              <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left w-8`}>#</th><th className={`${th} text-left`}>Item</th><th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th>{po.receivedKg > 0 && <th className={`${th} text-right`}>Received</th>}</tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const p = products.find((x) => x.id === l.productId);
                  return (
                    <tr key={l.id} className="border-b border-gray-200">
                      <td className="py-1.5 px-2 font-mono">{i + 1}</td>
                      <td className="py-1.5 px-2 font-semibold">{p?.name || l.productName || 'Item'}{p?.code ? <span className="text-gray-500 font-normal"> ({p.code})</span> : null}</td>
                      <td className={tdn}>{num(l.qty)} {p?.unit || l.unit || ''}</td>
                      <td className={tdn}>{money(l.rate)}</td>
                      <td className={tdn}>{money(l.qty * l.rate)}</td>
                      {po.receivedKg > 0 && <td className={tdn}>{num(l.receivedQty)}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={4} className="pt-3 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Total (Rs.)</td><td className={`${tdn} font-extrabold text-sm pt-3`}>{money(po.amount)}</td>{po.receivedKg > 0 && <td />}</tr></tfoot>
            </table>
            {po.notes && <p className="mt-4 text-xs">Note: {po.notes}</p>}
            <p className="mt-4 text-[11px] text-gray-600">Please supply the goods above at the rates shown and quote {po.poNumber} on your delivery challan and bill.</p>
            {signatures('Authorised by', 'Accepted by supplier')}
          </>
        ),
      };
    }

    if (request.type === 'supplier_bill') {
      const bill = supplierBills.find((b) => b.id === request.billId);
      if (!bill) return null;
      const po = purchaseOrders.find((p) => p.id === bill.purchaseOrderId);
      const receipts = purchases.filter((p) => bill.purchaseIds.includes(p.id));
      const m = threeWayMatch({ po, receipts, bills: [bill], products });
      return {
        title: 'SUPPLIER BILL CHECK',
        number: `Bill ${bill.billNumber}`,
        date: bill.date,
        body: (
          <>
            {party(bill.supplierId, 'Supplier')}
            <div className="mt-4 text-xs flex flex-wrap gap-x-6">
              {po && <span>Order: <b>{po.poNumber}</b></span>}
              <span>Receipts: <b>{receipts.map((r) => r.receiptNumber).join(', ') || '—'}</b></span>
              <span>Result: <b>{MATCH_STATUS_LABEL[m.status]}</b></span>
            </div>
            <table className="w-full text-xs mt-4 border-collapse">
              <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>Item</th><th className={`${th} text-right`}>Ordered</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Billed</th><th className={`${th} text-right`}>Recv. rate</th><th className={`${th} text-right`}>Bill rate</th><th className={`${th} text-right`}>Billed Rs.</th></tr></thead>
              <tbody>
                {m.lines.map((l) => (
                  <tr key={l.productId} className="border-b border-gray-200 align-top">
                    <td className="py-1.5 px-2 font-semibold">{l.name}{l.flags.length > 0 && <div className="text-[10px] font-normal text-gray-600">{l.flags.map((f) => MATCH_FLAG_LABEL[f]).join('; ')}</div>}</td>
                    <td className={tdn}>{po ? num(l.ordered) : '—'}</td>
                    <td className={tdn}>{num(l.received)}</td>
                    <td className={tdn}>{num(l.billed)}</td>
                    <td className={tdn}>{l.receivedRate != null ? money(l.receivedRate) : '—'}</td>
                    <td className={tdn}>{l.billedRate != null ? money(l.billedRate) : '—'}</td>
                    <td className={tdn}>{money(l.billedValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="ml-auto mt-4 text-xs">
              <tbody>
                <tr><td className="py-1 pr-6">Goods received (booked at receipt)</td><td className="py-1 text-right font-mono">{money(m.receivedValue)}</td></tr>
                {m.otherCharges > 0 && <tr><td className="py-1 pr-6">Other charges on bill</td><td className="py-1 text-right font-mono">{money(m.otherCharges)}</td></tr>}
                <tr className="font-bold border-t border-gray-900"><td className="py-1 pr-6">Bill total</td><td className="py-1 text-right font-mono">{money(bill.amount)}</td></tr>
                <tr><td className="py-1 pr-6">Price difference posted</td><td className="py-1 text-right font-mono">{bill.variance >= 0 ? '' : '−'}{money(Math.abs(bill.variance))}</td></tr>
              </tbody>
            </table>
            {signatures('Checked by', 'Approved for payment')}
          </>
        ),
      };
    }

    if (request.type === 'supplier_claim') {
      const c = supplierClaims.find((x) => x.id === request.claimId);
      if (!c) return null;
      const p = products.find((x) => x.id === c.productId);
      const receipt = purchases.find((x) => x.id === c.purchaseId);
      return {
        title: c.status === 'accepted' || c.status === 'settled' ? 'DEBIT NOTE (CLAIM)' : 'SUPPLIER CLAIM',
        number: c.claimNumber,
        date: c.date,
        body: (
          <>
            {party(c.supplierId, 'To supplier')}
            <p className="mt-5 text-xs">
              We claim for the goods below{receipt ? <> received on <b>{receipt.receiptNumber}</b> ({formatDate(receipt.date)})</> : null}, found{' '}
              <b>{(SUPPLIER_CLAIM_REASONS.find((r) => r.id === c.reason)?.label || c.reason).toLowerCase()}</b>.
            </p>
            <table className="w-full text-xs mt-4 border-collapse">
              <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>Item</th><th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th></tr></thead>
              <tbody><tr className="border-b border-gray-200"><td className="py-1.5 px-2 font-semibold">{p?.name || 'Item'}</td><td className={tdn}>{num(c.qty)} {p?.unit || ''}</td><td className={tdn}>{money(c.rate)}</td><td className={tdn}>{money(c.amount)}</td></tr></tbody>
            </table>
            {c.note && <p className="mt-3 text-xs">Details: {c.note}</p>}
            <div className="mt-4 text-xs space-y-1">
              <div>Status: <b>{CLAIM_STATUS_LABEL[c.status]}</b>{c.decidedDate ? ` on ${formatDate(c.decidedDate)}` : ''}{c.settledDate ? ` • settled ${formatDate(c.settledDate)}` : ''}</div>
              {c.acceptedAmount != null && <div>Amount accepted and debited to your account: <b className="font-mono">Rs. {money(c.acceptedAmount)}</b></div>}
              {c.decisionNote && <div>Note: {c.decisionNote}</div>}
            </div>
            {signatures('For ' + (settings.companyName || 'Sarmaya'), 'Supplier acknowledgement')}
          </>
        ),
      };
    }

    // Re-order report
    const rows = reorderReport(products, purchases, purchaseOrders);
    const supName = (id?: string | null) => {
      const s = suppliers.find((x) => x.id === id);
      return s ? s.company || s.name : '—';
    };
    return {
      title: 'RE-ORDER REPORT',
      number: `${rows.length} item${rows.length === 1 ? '' : 's'}`,
      date: todayISO(),
      body: (
        <table className="w-full text-xs border-collapse">
          <thead><tr className="border-b-2 border-gray-900"><th className={`${th} text-left`}>Item</th><th className={`${th} text-right`}>In stock</th><th className={`${th} text-right`}>Level</th><th className={`${th} text-right`}>On order</th><th className={`${th} text-right`}>Suggested</th><th className={`${th} text-left`}>Last supplier</th><th className={`${th} text-right`}>Last rate</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-gray-500">Nothing needs re-ordering.</td></tr>}
            {rows.map((r) => (
              <tr key={r.product.id} className="border-b border-gray-200">
                <td className="py-1.5 px-2 font-semibold">{r.product.name}</td>
                <td className={tdn}>{num(r.stock)} {r.product.unit || ''}</td>
                <td className={tdn}>{num(r.level)}</td>
                <td className={tdn}>{r.onOrder ? num(r.onOrder) : '—'}</td>
                <td className={`${tdn} font-bold`}>{num(r.suggested)}</td>
                <td className="py-1.5 px-2">{supName(r.lastSupplierId)}{r.lastDate ? <div className="text-[10px] text-gray-500">{formatDate(r.lastDate)}</div> : null}</td>
                <td className={tdn}>{r.lastRate != null ? money(r.lastRate) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    };
  }, [request, purchaseOrders, suppliers, products, purchases, supplierBills, supplierClaims, settings]);
};
