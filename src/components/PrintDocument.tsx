import React, { useMemo } from 'react';
import { X, Printer, Truck } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate } from '../utils/formatters';
import { todayISO } from '../utils/stockFlow';
import { useEscape } from '../hooks/useEscape';

export type PrintRequest =
  | { type: 'invoice'; dispatchId: string }
  | { type: 'challan'; dispatchId: string }
  | { type: 'statement'; customerId: string; from: string; to: string }
  | { type: 'supplier_statement'; supplierId: string; from: string; to: string };

interface PrintDocumentProps {
  request: PrintRequest | null;
  onClose: () => void;
}

const COMPANY = {
  name: 'Sarmaya',
  tagline: 'Pakistani Bulk Commodity Trading & Logistics',
  address: 'Karachi, Pakistan',
};

/**
 * Printable business documents. The preview is on screen; "Print / Save PDF" uses the browser's
 * print dialog, with CSS in index.css that prints only #print-root.
 */
export const PrintDocument: React.FC<PrintDocumentProps> = ({ request, onClose }) => {
  const { dispatches, bookings, customers, suppliers, products, ledger, trucks, currentUser } = useTrading();
  useEscape(Boolean(request), onClose);

  const content = useMemo(() => {
    if (!request) return null;

    if (request.type === 'invoice' || request.type === 'challan') {
      const d = dispatches.find((x) => x.id === request.dispatchId);
      if (!d) return null;
      const booking = bookings.find((b) => b.id === d.bookingId);
      const customer = customers.find((c) => c.id === d.customerId);
      const product = products.find((p) => p.id === d.productId);
      const truck = trucks.find((t) => t.id === d.truckId);
      const isInvoice = request.type === 'invoice';
      const unit = d.kg > 0 ? d.amount / d.kg : booking?.pricePerKg || 0;
      return {
        title: isInvoice ? 'TAX INVOICE' : 'DELIVERY CHALLAN',
        number: isInvoice ? `INV-${d.dispatchNumber}` : d.dispatchNumber,
        date: d.date,
        body: (
          <>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{isInvoice ? 'Bill to' : 'Deliver to'}</div>
                <div className="font-bold text-sm">{customer?.company}</div>
                <div>{customer?.name}</div>
                <div>{customer?.address}</div>
                <div className="font-mono">{customer?.phone}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Reference</div>
                <div>Booking <span className="font-mono font-bold">{booking?.bookingNumber}</span></div>
                <div>Dispatch <span className="font-mono font-bold">{d.dispatchNumber}</span></div>
                <div>Vehicle <span className="font-mono font-bold">{d.truckNumber}</span></div>
                {(truck?.driverName || d.driverPhone) && <div>Driver {truck?.driverName || ''} <span className="font-mono">{d.driverPhone || truck?.driverPhone || ''}</span></div>}
              </div>
            </div>
            <table className="w-full text-xs mt-6 border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-900 text-[10px] uppercase tracking-widest text-gray-600">
                  <th className="text-left py-2">Description</th>
                  <th className="text-right py-2">Quantity</th>
                  {isInvoice && <th className="text-right py-2">Rate (Rs./kg)</th>}
                  {isInvoice && <th className="text-right py-2">Amount</th>}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="py-3">
                    <div className="font-bold">{product?.name}</div>
                    <div className="text-gray-500">{product?.category}{d.notes ? ` • ${d.notes}` : ''}</div>
                  </td>
                  <td className="py-3 text-right font-mono">{formatKg(d.kg)}</td>
                  {isInvoice && <td className="py-3 text-right font-mono">{unit.toFixed(2)}</td>}
                  {isInvoice && <td className="py-3 text-right font-mono font-bold">{formatCurrency(d.amount)}</td>}
                </tr>
              </tbody>
              {isInvoice && (
                <tfoot>
                  <tr>
                    <td colSpan={3} className="pt-4 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Total payable</td>
                    <td className="pt-4 text-right font-mono font-extrabold text-base">{formatCurrency(d.amount)}</td>
                  </tr>
                  {d.paymentReceivedImmediately && (
                    <tr><td colSpan={4} className="pt-1 text-right text-[11px] text-teal-700 font-bold">PAID ON DISPATCH</td></tr>
                  )}
                  {booking && (
                    <tr><td colSpan={4} className="pt-3 text-right text-[11px] text-gray-500">Booking balance after this dispatch: {formatKg(booking.remainingKg)} remaining of {formatKg(booking.totalKg)}</td></tr>
                  )}
                </tfoot>
              )}
            </table>
            {!isInvoice && (
              <div className="grid grid-cols-2 gap-10 mt-16 text-xs">
                <div className="border-t border-gray-900 pt-2">Dispatched by (Sarmaya)</div>
                <div className="border-t border-gray-900 pt-2">Received by (customer signature & stamp)</div>
              </div>
            )}
          </>
        ),
      };
    }

    if (request.type === 'statement' || request.type === 'supplier_statement') {
      const isCustomer = request.type === 'statement';
      const entity = isCustomer ? customers.find((c) => c.id === request.customerId) : suppliers.find((s) => s.id === request.supplierId);
      if (!entity) return null;
      const entityId = entity.id;
      const rows = ledger
        .filter((l) => l.entityType === (isCustomer ? 'customer' : 'supplier') && l.entityId === entityId)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const opening = rows.filter((l) => l.date < request.from).reduce((a, l) => a + l.debit - l.credit, 0);
      const inRange = rows.filter((l) => l.date >= request.from && l.date <= request.to);
      let running = opening;
      const lines = inRange.map((l) => {
        running += l.debit - l.credit;
        return { ...l, running };
      });
      const balance = isCustomer ? (entity as any).totalDue : (entity as any).totalOwed;
      return {
        title: isCustomer ? 'STATEMENT OF ACCOUNT' : 'SUPPLIER STATEMENT',
        number: `${formatDate(request.from)} – ${formatDate(request.to)}`,
        date: todayISO(),
        body: (
          <>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{isCustomer ? 'Customer' : 'Supplier'}</div>
                <div className="font-bold text-sm">{entity.company}</div>
                <div>{entity.name}</div>
                <div>{entity.address}</div>
                <div className="font-mono">{entity.phone}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Balance on record</div>
                <div className="font-mono font-extrabold text-lg">{formatCurrency(balance)}</div>
                <div className="text-[11px] text-gray-500">{isCustomer ? 'receivable from customer' : 'payable to supplier'}</div>
              </div>
            </div>
            <table className="w-full text-xs mt-6 border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-900 text-[10px] uppercase tracking-widest text-gray-600">
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Reference</th>
                  <th className="text-left py-2">Description</th>
                  <th className="text-right py-2">Debit</th>
                  <th className="text-right py-2">Credit</th>
                  <th className="text-right py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200 text-gray-600">
                  <td className="py-2" colSpan={5}>Opening balance as at {formatDate(request.from)}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(opening)}</td>
                </tr>
                {lines.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-gray-500">No transactions in this period.</td></tr>
                ) : (
                  lines.map((l) => (
                    <tr key={l.id} className="border-b border-gray-100">
                      <td className="py-2 font-mono whitespace-nowrap">{formatDate(l.date)}</td>
                      <td className="py-2 font-mono">{l.referenceId}</td>
                      <td className="py-2">{l.description}{l.kg ? ` (${formatKg(l.kg)})` : ''}</td>
                      <td className="py-2 text-right font-mono">{l.debit > 0 ? formatCurrency(l.debit) : ''}</td>
                      <td className="py-2 text-right font-mono">{l.credit > 0 ? formatCurrency(l.credit) : ''}</td>
                      <td className="py-2 text-right font-mono font-bold">{formatCurrency(l.running)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="pt-4 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Closing balance as at {formatDate(request.to)}</td>
                  <td className="pt-4 text-right font-mono font-extrabold text-base">{formatCurrency(running)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        ),
      };
    }
    return null;
  }, [request, dispatches, bookings, customers, suppliers, products, ledger, trucks]);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 overflow-y-auto print:static print:p-0 print:block">
      <div onClick={onClose} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs print:hidden" />
      <div className="relative z-10 w-full max-w-3xl my-6 print:my-0 print:max-w-none">
        <div className="flex items-center justify-between mb-3 print:hidden">
          <span className="text-xs text-white/80">Preview • use "Print / Save PDF" to print or export.</span>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="px-4 py-2 bg-white text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5 shadow-sm hover:bg-slate-100"><Printer className="w-3.5 h-3.5 text-teal-700" /> Print / Save PDF</button>
            <button onClick={onClose} aria-label="Close preview" className="p-2 rounded-2xl bg-white/10 text-white hover:bg-white/20"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div id="print-root" className="bg-white text-gray-900 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-8 sm:p-10">
          {content ? (
            <>
              <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gray-900 flex items-center justify-center text-white"><Truck className="w-5 h-5 text-teal-400" /></div>
                  <div>
                    <div className="font-serif italic font-bold text-2xl leading-none">{COMPANY.name}</div>
                    <div className="text-[11px] text-gray-500 mt-1">{COMPANY.tagline}</div>
                    <div className="text-[11px] text-gray-500">{COMPANY.address}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold tracking-widest">{content.title}</div>
                  <div className="font-mono text-sm">{content.number}</div>
                  <div className="text-[11px] text-gray-500">Date: {formatDate(content.date)}</div>
                </div>
              </div>
              <div className="mt-6">{content.body}</div>
              <div className="mt-10 pt-3 border-t border-gray-200 flex items-center justify-between text-[10px] text-gray-500">
                <span>Generated by {COMPANY.name} on {formatDate(todayISO())}{currentUser ? ` by ${currentUser.name}` : ''}</span>
                <span>All quantities in kg • amounts in PKR</span>
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-xs text-gray-500">The record for this document no longer exists.</div>
          )}
        </div>
      </div>
    </div>
  );
};
