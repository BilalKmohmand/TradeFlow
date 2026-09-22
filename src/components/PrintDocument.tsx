import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { X, Printer, Truck } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate } from '../utils/formatters';
import { todayISO } from '../utils/stockFlow';
import { useEscape } from '../hooks/useEscape';
import { dispatchBilledTotal, EXPENSE_CATEGORIES, BillPrintSize } from '../types';
import { hasPack, formatPackQty, formatQtyWithPacks, shortPack } from '../utils/packUnits';
import { buildDailySheet, lineQty, linePrice } from '../utils/billing';
import { collectCashMovements } from '../utils/finance';
import { scopeToBank } from '../utils/banks';
import { bankRecPrintContent } from './billing/BankRecPrint';
import { chequeRegisterPrintContent } from './billing/ChequeRegisterPrint';
import { CHEQUE_EVENT_LABEL } from '../utils/cheques';
import { batchLines } from '../utils/inventory';
import { useAccounting } from '../hooks/useAccounting';
import { accountingPrintContent, isAccountingPrint } from './accounting/AccountingPrint';
import { BillingPrintRequest, isBillingPrint, useBillingReportPrint } from './billing/BillingReportsPrint';
import { isSalesExtrasPrint, useSalesExtrasPrint } from './billing/SalesExtrasPrint';
import type { SalesExtrasPrintRequest } from '../context/salesExtrasActions';
import { PurchasingPrintRequest, isPurchasingPrint, usePurchasingPrint } from './billing/purchasing/PurchasingPrint';
import { FinancePrintRequest, isFinancePrint, useFinancePrint } from './finance/FinancePrint';
import { BooksPrintRequest, isBooksPrint, useBooksPrint } from './accounting/BooksPrint';
import { lineDiscountLabel, lineGross, billNetTotal, returnsForBill, returnedQtyByLine, quotationLines, quotationTotal } from '../utils/salesDocs';

export type PrintRequest =
  | { type: 'voucher'; ledgerId: string }
  | { type: 'quotation'; quotationId: string }
  | { type: 'po'; purchaseOrderId: string }
  | { type: 'note'; returnId: string }
  | { type: 'invoice'; dispatchId: string }
  | { type: 'challan'; dispatchId: string }
  | { type: 'booking'; bookingId: string }
  | { type: 'statement'; customerId: string; from: string; to: string }
  | { type: 'supplier_statement'; supplierId: string; from: string; to: string }
  | { type: 'bill'; invoiceId: string }
  | { type: 'bill_challan'; invoiceId: string; driver?: string; vehicle?: string }
  | { type: 'daily_sheet'; date: string }
  | { type: 'bank_reconciliation'; statementDate: string; closingBalance: number; bankCode?: string }
  | { type: 'trial_balance'; asOf: string }
  | { type: 'profit_loss'; from: string; to: string }
  | { type: 'balance_sheet'; asOf: string }
  | BillingPrintRequest
  | { type: 'cheque_register'; view?: string }
  | SalesExtrasPrintRequest
  | PurchasingPrintRequest
  | FinancePrintRequest
  | BooksPrintRequest;

/** One line of a thermal receipt: text on the left, amount on the right. */
const ThermalRow: React.FC<{ left: string; right: string; bold?: boolean }> = ({ left, right, bold }) => (
  <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}>
    <span className="min-w-0 break-words">{left}</span>
    <span className="shrink-0 text-right">{right}</span>
  </div>
);
const ThermalRule: React.FC = () => <div className="border-t border-dashed border-gray-900 my-1" />;

/** Narrow single-column receipt for 80 mm thermal printers: shop name, the lines, totals, footer, thank-you. */
const ThermalReceipt: React.FC<{ company: { name: string; address: string; phone: string; taxId: string; logo: string }; title: string; date: string; footer?: string; children: React.ReactNode }> = ({ company, title, date, footer, children }) => (
  <div data-testid="thermal-receipt" className="font-mono text-[11px] leading-snug text-gray-900">
    <div className="text-center">
      {company.logo && <img src={company.logo} alt="" className="mx-auto w-10 h-10 object-contain" />}
      <div className="font-bold text-[14px]">{company.name}</div>
      {company.address && <div>{company.address}</div>}
      {company.phone && <div>{company.phone}</div>}
      {company.taxId && <div>NTN: {company.taxId}</div>}
    </div>
    <ThermalRule />
    <ThermalRow left={title} right="" bold />
    <div>{date}</div>
    <ThermalRule />
    {children}
    <ThermalRule />
    {footer?.trim() && <div className="text-center whitespace-pre-line" data-testid="print-bill-footer">{footer.trim()}</div>}
    <div className="text-center font-bold pt-1">Thank you for your business!</div>
  </div>
);

/** Page size for bills and receipts (other documents stay A4). */
const paperCss = (paper: BillPrintSize): string =>
  paper === 'thermal80'
    ? '@media print { @page { size: 80mm auto; margin: 2mm; } #print-root { width: 76mm !important; max-width: 76mm !important; padding: 0 !important; } }'
    : paper === 'a5'
      ? '@media print { @page { size: A5; margin: 8mm; } #print-root { font-size: 92%; } }'
      : '';

interface PrintDocumentProps {
  request: PrintRequest | null;
  onClose: () => void;
}


/**
 * Printable business documents. The preview is on screen; "Print / Save PDF" uses the browser's
 * print dialog, with CSS in index.css that prints only #print-root.
 */
export const PrintDocument: React.FC<PrintDocumentProps> = ({ request, onClose }) => {
  const { dispatches, bookings, customers, suppliers, products, ledger, trucks, currentUser, settings, quotations, purchaseOrders, returns, invoices, expenses, cashEntries, bankStatementLines, bankReconciliations, cheques, salesmen, areas } = useTrading();
  const COMPANY = {
    name: settings.companyName || 'Sarmaya',
    tagline: settings.companyTagline || '',
    address: settings.companyAddress || '',
    phone: settings.companyPhone || '',
    taxId: settings.companyTaxId || '',
    email: settings.companyEmail || '',
    logo: settings.companyLogo || '',
  };
  useEscape(Boolean(request), onClose, 1); // the preview sits above every dialog
  // Paper for bills and receipts (Settings): A4, A5 or an 80 mm thermal roll.
  const paper: BillPrintSize = settings.billPrintSize || 'a4';
  const sizedDoc = Boolean(request && (request.type === 'bill' || request.type === 'voucher'));
  const books = useAccounting(isAccountingPrint(request));
  const billingReport = useBillingReportPrint(request);
  const salesExtrasReport = useSalesExtrasPrint(request);
  const purchasingDoc = usePurchasingPrint(request);
  const financeDoc = useFinancePrint(request);
  const booksDoc = useBooksPrint(request);

  const content = useMemo(() => {
    if (!request) return null;
    if (isAccountingPrint(request)) return accountingPrintContent(request, books);
    if (isBillingPrint(request)) return billingReport;
    if (isSalesExtrasPrint(request)) return salesExtrasReport;
    if (isPurchasingPrint(request)) return purchasingDoc;
    if (isFinancePrint(request)) return financeDoc;
    if (isBooksPrint(request)) return booksDoc;

    if (request.type === 'bill') {
      const inv = invoices.find((i) => i.id === request.invoiceId);
      if (!inv) return null;
      const customer = customers.find((c) => c.id === inv.customerId);
      const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
      const hasLineDisc = inv.items.some((it) => (it.discountAmount || 0) > 0);
      const span = hasLineDisc ? 4 : 3;
      const lineDisc = inv.items.reduce((a, it) => a + (it.discountAmount || 0), 0);
      const billRets = returnsForBill(returns, inv.id);
      const refunded = inv.refundedAmount || 0;
      // "Show previous balance on bill": what they owed before this bill, and in all with what is still due on it.
      const billRow = ledger.find((l) => l.type === 'bill_issued' && l.entityType === 'customer' && (l.sourceId ? l.sourceId === inv.id : l.referenceId === inv.invoiceNumber && l.entityId === inv.customerId));
      const prevBalance = settings.showPrevBalanceOnBill && billRow ? Math.round((billRow.balanceAfter - billRow.debit) * 100) / 100 : null;
      const totalDueWithPrev = prevBalance != null ? Math.round((prevBalance + inv.balanceDue) * 100) / 100 : null;
      const time = inv.issuedAt ? new Date(inv.issuedAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : undefined;
      const freight = (inv.freightCharges || 0) + (inv.handlingCharges || 0);
      const salesmanName = inv.salesmanId ? salesmen.find((s) => s.id === inv.salesmanId)?.name : undefined;
      const areaName = inv.areaId ? areas.find((a) => a.id === inv.areaId)?.name : undefined;
      const qtyText = (it: (typeof inv.items)[number]) => (hasPack(it) ? formatQtyWithPacks(lineQty(it), it) : `${money(lineQty(it))}${it.unit && it.unit !== 'pcs' ? ` ${it.unit}` : ''}`);

      if (paper === 'thermal80') {
        return {
          thermal: true,
          title: 'INVOICE',
          number: `Invoice #${inv.invoiceNumber.replace(/^INV-/, '')}`,
          date: inv.issueDate,
          body: (
            <ThermalReceipt company={COMPANY} title={`INVOICE #${inv.invoiceNumber.replace(/^INV-/, '')}`} date={`${formatDate(inv.issueDate)}${time ? ` ${time}` : ''}`} footer={settings.billFooter}>
              <div data-testid="thermal-customer">
                <div>Customer: <b>{inv.customerName}</b></div>
                {(inv.customerPhone || customer?.phone) && <div>Ph: {inv.customerPhone || customer?.phone}</div>}
                {(salesmanName || areaName) && <div>{[salesmanName && `Salesman: ${salesmanName}`, areaName && `Area: ${areaName}`].filter(Boolean).join(' · ')}</div>}
              </div>
              <ThermalRule />
              {inv.items.map((it) => (
                <div key={it.id} className="py-0.5">
                  <div className="font-bold">{it.productName}</div>
                  {it.free ? (
                    <ThermalRow left={`${qtyText(it)} FREE${it.schemeName ? ` (${it.schemeName})` : ' (scheme)'}`} right="0" />
                  ) : (
                    <ThermalRow left={`${qtyText(it)} x ${money(it.packPrice != null && hasPack(it) ? it.packPrice : linePrice(it))}${it.packPrice != null && hasPack(it) ? `/${shortPack(it.packName || '')}` : ''}`} right={money(it.amount)} />
                  )}
                  {(it.discountAmount || 0) > 0 && <ThermalRow left={`  less ${lineDiscountLabel(it)}`} right="" />}
                </div>
              ))}
              <ThermalRule />
              <ThermalRow left="Subtotal" right={money(inv.subtotal)} />
              {(inv.discount || 0) > 0 && <ThermalRow left="Discount" right={`-${money(inv.discount || 0)}`} />}
              {inv.taxAmount > 0 && <ThermalRow left={`${settings.taxLabel || 'Sales Tax'} ${inv.taxRatePct}%`} right={money(inv.taxAmount)} />}
              {freight > 0 && <ThermalRow left="Freight / loading" right={money(freight)} />}
              <ThermalRow left="TOTAL" right={`Rs. ${money(inv.totalAmount)}`} bold />
              {billRets.map((r) => <ThermalRow key={r.id} left={`Returned ${r.returnNumber}`} right={`-${money(r.amount)}`} />)}
              {inv.paidAmount > 0 && <ThermalRow left={`Paid${inv.paymentMethod ? ` (${inv.paymentMethod})` : ''}`} right={money(inv.paidAmount)} />}
              {refunded > 0 && <ThermalRow left="Money given back" right={`-${money(refunded)}`} />}
              <ThermalRow left={inv.balanceDue > 0 ? 'Balance due' : 'PAID IN FULL'} right={inv.balanceDue > 0 ? `Rs. ${money(inv.balanceDue)}` : ''} bold />
              {prevBalance != null && totalDueWithPrev != null && (
                <>
                  <ThermalRule />
                  <ThermalRow left="Previous balance" right={money(prevBalance)} />
                  <ThermalRow left="Total balance" right={`Rs. ${money(totalDueWithPrev)}`} bold />
                </>
              )}
              {inv.notes && <div className="pt-1">Note: {inv.notes}</div>}
            </ThermalReceipt>
          ),
        };
      }

      return {
        title: 'INVOICE',
        number: `Invoice #${inv.invoiceNumber.replace(/^INV-/, '')}`,
        date: inv.issueDate,
        time,
        body: (
          <>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Bill from</div>
                <div className="font-bold text-sm">{COMPANY.name}</div>
                <div>{COMPANY.address}</div>
                {COMPANY.email && <div>{COMPANY.email}</div>}
                <div className="font-mono">{COMPANY.phone}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Bill to</div>
                <div className="font-bold text-sm">{inv.customerName}</div>
                {inv.customerCompany && inv.customerCompany !== inv.customerName && <div>{inv.customerCompany}</div>}
                {(inv.customerAddress || customer?.address) && <div>{inv.customerAddress || customer?.address}</div>}
                <div className="font-mono">{inv.customerPhone || customer?.phone}</div>
                {customer?.code && <div>Customer ID: <span className="font-mono font-bold">{customer.code}</span></div>}
                {(salesmanName || areaName) && <div data-testid="print-bill-salesman">{[salesmanName && `Salesman: ${salesmanName}`, areaName && `Area: ${areaName}`].filter(Boolean).join(' · ')}</div>}
              </div>
            </div>
            <table className={`w-full text-xs ${paper === 'a5' ? 'mt-4' : 'mt-6'} border-collapse`}>
              <thead>
                <tr className="bg-gray-800 text-white text-[10px] uppercase tracking-widest">
                  <th className="text-left py-2 px-3">Description</th>
                  <th className="text-right py-2 px-3">Qty</th>
                  <th className="text-right py-2 px-3">Price</th>
                  {hasLineDisc && <th className="text-right py-2 px-3">Disc.</th>}
                  <th className="text-right py-2 px-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it) => (
                  <tr key={it.id} className="border-b border-gray-200">
                    <td className={`${paper === 'a5' ? 'py-2' : 'py-3'} px-3 font-bold`}>
                      {it.productName}
                      {it.free && <div className="text-[10px] font-bold text-teal-700" data-testid="print-free-line">FREE — {it.schemeName || 'scheme'}</div>}
                      {batchLines(it).map((b) => <div key={b} className="text-[10px] font-normal text-gray-600">{b}</div>)}
                    </td>
                    <td className={`${paper === 'a5' ? 'py-2' : 'py-3'} px-3 text-right font-mono whitespace-nowrap`}>
                      {money(lineQty(it))}{it.unit && it.unit !== 'pcs' ? ` ${it.unit}` : ''}
                      {hasPack(it) && Math.abs(lineQty(it)) >= (it.packSize || 0) && <div className="text-[10px] text-gray-600" data-testid="print-line-packs">{formatPackQty(lineQty(it), it)}</div>}
                    </td>
                    <td className={`${paper === 'a5' ? 'py-2' : 'py-3'} px-3 text-right font-mono whitespace-nowrap`}>
                      {it.free ? 'FREE' : money(linePrice(it))}
                      {it.packPrice != null && hasPack(it) && <div className="text-[10px] text-gray-600">{money(it.packPrice)}/{shortPack(it.packName || '')}</div>}
                    </td>
                    {hasLineDisc && <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{(it.discountAmount || 0) > 0 ? <>{money(it.discountAmount || 0)}{it.discountType === 'pct' ? <div className="text-[10px] text-gray-500">{lineDiscountLabel(it)}</div> : null}</> : '—'}</td>}
                    <td className={`${paper === 'a5' ? 'py-2' : 'py-3'} px-3 text-right font-mono font-bold whitespace-nowrap`}>{money(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {lineDisc > 0 && <tr><td colSpan={span} className="pt-4 text-right text-[11px] text-gray-600">Items before discount</td><td className="pt-4 text-right font-mono px-3">{money(inv.items.reduce((a, it) => a + lineGross(it), 0))}</td></tr>}
                {lineDisc > 0 && <tr><td colSpan={span} className="pt-1 text-right text-[11px] text-gray-600">Item discounts</td><td className="pt-1 text-right font-mono px-3">− {money(lineDisc)}</td></tr>}
                <tr><td colSpan={span} className="pt-4 text-right text-[11px] text-gray-600">Subtotal</td><td className="pt-4 text-right font-mono px-3">{money(inv.subtotal)}</td></tr>
                {(inv.discount || 0) > 0 && <tr><td colSpan={span} className="pt-1 text-right text-[11px] text-gray-600">Discount</td><td className="pt-1 text-right font-mono px-3">− {money(inv.discount || 0)}</td></tr>}
                {inv.taxAmount > 0 && <tr><td colSpan={span} className="pt-1 text-right text-[11px] text-gray-600">{settings.taxLabel || 'Sales Tax'} ({inv.taxRatePct}%)</td><td className="pt-1 text-right font-mono px-3">{money(inv.taxAmount)}</td></tr>}
                {freight > 0 && <tr data-testid="print-freight"><td colSpan={span} className="pt-1 text-right text-[11px] text-gray-600">Freight / cartage / loading</td><td className="pt-1 text-right font-mono px-3">{money(freight)}</td></tr>}
                <tr><td colSpan={span} className="pt-3 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Total</td><td className="pt-3 text-right font-mono font-extrabold text-base px-3 whitespace-nowrap">Rs. {money(inv.totalAmount)}</td></tr>
                {billRets.map((r) => <tr key={r.id}><td colSpan={span} className="pt-1 text-right text-[11px] text-gray-600">Returned ({r.returnNumber}, {formatDate(r.date)})</td><td className="pt-1 text-right font-mono px-3">− {money(r.amount)}</td></tr>)}
                {billRets.length > 0 && <tr><td colSpan={span} className="pt-1 text-right font-bold text-[11px] text-gray-800">Net total</td><td className="pt-1 text-right font-mono font-bold px-3 whitespace-nowrap">Rs. {money(billNetTotal(inv))}</td></tr>}
                {inv.paidAmount > 0 && <tr><td colSpan={span} className="pt-1 text-right text-[11px] text-gray-600">Paid{inv.paymentMethod ? ` (${inv.paymentMethod})` : ''}</td><td className="pt-1 text-right font-mono px-3">{money(inv.paidAmount)}</td></tr>}
                {refunded > 0 && <tr><td colSpan={span} className="pt-1 text-right text-[11px] text-gray-600">Money given back</td><td className="pt-1 text-right font-mono px-3">− {money(refunded)}</td></tr>}
                {inv.balanceDue > 0 ? (
                  <tr><td colSpan={span} className="pt-1 text-right font-bold text-[11px] text-gray-800">Balance due</td><td className="pt-1 text-right font-mono font-bold px-3 whitespace-nowrap">Rs. {money(inv.balanceDue)}</td></tr>
                ) : (
                  <tr><td colSpan={span + 1} className="pt-1 text-right text-[11px] text-teal-700 font-bold">{billNetTotal(inv) === 0 ? 'ALL ITEMS RETURNED' : 'PAID IN FULL'}</td></tr>
                )}
                {prevBalance != null && totalDueWithPrev != null ? (
                  <>
                    <tr data-testid="print-prev-balance"><td colSpan={span} className="pt-3 text-right text-[11px] text-gray-600">Previous balance</td><td className="pt-3 text-right font-mono px-3">{money(prevBalance)}</td></tr>
                    <tr><td colSpan={span} className="pt-1 text-right font-bold text-[11px] text-gray-800">Total balance</td><td className="pt-1 text-right font-mono font-bold px-3 whitespace-nowrap">Rs. {money(totalDueWithPrev)}</td></tr>
                  </>
                ) : (
                  customer && customer.totalDue > 0 && <tr><td colSpan={span + 1} className="pt-3 text-right text-[11px] text-gray-500">Total outstanding on account: Rs. {money(customer.totalDue)}</td></tr>
                )}
              </tfoot>
            </table>
            {inv.notes && <div className="mt-4 text-[11px] text-gray-600">Note: {inv.notes}</div>}
            <div className={`grid grid-cols-2 gap-10 ${paper === 'a5' ? 'mt-8' : 'mt-14'} text-xs`}>
              <div className="border-t border-gray-900 pt-2">For {COMPANY.name}</div>
              <div className="border-t border-gray-900 pt-2">Received by</div>
            </div>
            {settings.billFooter?.trim() && <div data-testid="print-bill-footer" className="mt-6 text-[11px] text-gray-600 whitespace-pre-line text-center">{settings.billFooter.trim()}</div>}
          </>
        ),
      };
    }

    if (request.type === 'bill_challan') {
      const inv = invoices.find((i) => i.id === request.invoiceId);
      if (!inv) return null;
      const customer = customers.find((c) => c.id === inv.customerId);
      const back = returnedQtyByLine(returns, inv.id);
      const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
      const rows = inv.items.map((it) => ({ it, qty: Math.max(0, Math.round((lineQty(it) - (back.get(it.id) || 0)) * 100) / 100) })).filter((r) => r.qty > 0);
      return {
        title: 'DELIVERY CHALLAN',
        number: `Challan for Invoice #${inv.invoiceNumber.replace(/^INV-/, '')}`,
        date: todayISO(),
        body: (
          <>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Deliver to</div>
                <div className="font-bold text-sm">{inv.customerName}</div>
                {inv.customerCompany && inv.customerCompany !== inv.customerName && <div>{inv.customerCompany}</div>}
                {(inv.customerAddress || customer?.address) && <div>{inv.customerAddress || customer?.address}</div>}
                <div className="font-mono">{inv.customerPhone || customer?.phone}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Delivery</div>
                <div>Bill: <b className="font-mono">{inv.invoiceNumber}</b> ({formatDate(inv.issueDate)})</div>
                <div>Driver: <b>{request.driver || '____________________'}</b></div>
                <div>Vehicle no.: <b className="font-mono">{request.vehicle || '____________________'}</b></div>
              </div>
            </div>
            <table className="w-full text-xs mt-6 border-collapse">
              <thead>
                <tr className="bg-gray-800 text-white text-[10px] uppercase tracking-widest">
                  <th className="text-left py-2 px-3 w-10">#</th>
                  <th className="text-left py-2 px-3">Item</th>
                  <th className="text-right py-2 px-3">Quantity</th>
                  <th className="text-right py-2 px-3 w-28">Checked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ it, qty }, i) => (
                  <tr key={it.id} className="border-b border-gray-200">
                    <td className="py-3 px-3 font-mono">{i + 1}</td>
                    <td className="py-3 px-3 font-bold">{it.productName}{batchLines(it).map((b) => <div key={b} className="text-[10px] font-normal text-gray-600">{b}</div>)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">{money(qty)} {it.unit || ''}</td>
                    <td className="py-3 px-3 text-right text-gray-400">☐</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={2} className="pt-3 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Total pieces</td><td className="pt-3 text-right font-mono font-extrabold px-3">{money(rows.reduce((a, r) => a + r.qty, 0))}</td><td /></tr>
              </tfoot>
            </table>
            <div className="mt-4 text-[11px] text-gray-600">Goods received in good condition and correct quantity.</div>
            <div className="grid grid-cols-3 gap-8 mt-14 text-xs">
              <div className="border-t border-gray-900 pt-2">For {COMPANY.name}</div>
              <div className="border-t border-gray-900 pt-2">Driver</div>
              <div className="border-t border-gray-900 pt-2">Received by (name &amp; signature)</div>
            </div>
          </>
        ),
      };
    }
    if (request.type === 'cheque_register') return chequeRegisterPrintContent({ cheques, view: request.view, today: todayISO() });

    if (request.type === 'bank_reconciliation') {
      const bank = request.bankCode || '1010';
      const scoped = scopeToBank(collectCashMovements(ledger, expenses, cashEntries, customers, suppliers), settings, bank);
      const mine = <T extends { bankCode?: string }>(rows: T[]) => rows.filter((r) => (r.bankCode || '1010') === bank);
      return bankRecPrintContent({ ...request, movements: scoped.movements, settings: scoped.settings, lines: mine(bankStatementLines), reconciliations: mine(bankReconciliations) });
    }

    if (request.type === 'daily_sheet') {
      const sheet = buildDailySheet({ invoices, ledger, expenses, cashEntries, customers, suppliers, settings, cheques }, request.date);
      const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
      const row = (label: string, value: number, bold = false) => (
        <tr className={`border-b border-gray-100 ${bold ? 'font-bold' : ''}`}><td className="py-1.5">{label}</td><td className="py-1.5 text-right font-mono">{money(value)}</td></tr>
      );
      return {
        title: 'DAILY SHEET',
        number: formatDate(request.date),
        date: request.date,
        body: (
          <>
            <div className="grid grid-cols-4 gap-3 text-xs">
              {[['Opening cash', sheet.opening.cash], ['Cash in', sheet.cashIn], ['Cash out', sheet.cashOut], ['Closing cash', sheet.closing.cash]].map(([l, v]) => (
                <div key={String(l)} className="border border-gray-300 rounded p-2"><div className="text-[10px] uppercase tracking-widest text-gray-500">{l}</div><div className="font-mono font-bold text-sm">{money(Number(v))}</div></div>
              ))}
              {[['Opening bank', sheet.opening.bank], ['Bank in', sheet.bankIn], ['Bank out', sheet.bankOut], ['Closing bank', sheet.closing.bank]].map(([l, v]) => (
                <div key={String(l)} className="border border-gray-200 rounded p-2"><div className="text-[10px] uppercase tracking-widest text-gray-500">{l}</div><div className="font-mono text-sm">{money(Number(v))}</div></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-6 mt-6 text-xs">
              <div>
                <div className="font-bold uppercase tracking-widest text-[10px] border-b-2 border-gray-900 pb-1 mb-1">Bills ({sheet.bills.length}) — Rs. {money(sheet.summary.sales)}</div>
                <table className="w-full"><tbody>
                  {sheet.bills.length === 0 && <tr><td className="py-1.5 text-gray-500">No bills.</td></tr>}
                  {sheet.bills.map((b) => (
                    <tr key={b.id} className="border-b border-gray-100"><td className="py-1.5"><span className="font-mono text-gray-500">{b.invoiceNumber}</span> {b.customerName}<span className="text-gray-500">{b.balanceDue > 0 ? ` (credit ${money(b.balanceDue)})` : ''}</span></td><td className="py-1.5 text-right font-mono">{money(b.totalAmount)}</td></tr>
                  ))}
                </tbody></table>
                <div className="font-bold uppercase tracking-widest text-[10px] border-b-2 border-gray-900 pb-1 mb-1 mt-5">Money received — Rs. {money(sheet.summary.received)}</div>
                <table className="w-full"><tbody>
                  {sheet.receipts.length === 0 && <tr><td className="py-1.5 text-gray-500">Nothing received.</td></tr>}
                  {sheet.receipts.map((m) => row(`${m.counterparty} (${m.method || 'Cash'})`, m.amount))}
                </tbody></table>
              </div>
              <div>
                <div className="font-bold uppercase tracking-widest text-[10px] border-b-2 border-gray-900 pb-1 mb-1">Expenses — Rs. {money(sheet.summary.expenses)}</div>
                <table className="w-full"><tbody>
                  {sheet.expenses.length === 0 && <tr><td className="py-1.5 text-gray-500">No expenses.</td></tr>}
                  {sheet.expenses.map((g) => (
                    <React.Fragment key={g.category}>
                      {row(EXPENSE_CATEGORIES.find((c) => c.id === g.category)?.label || g.label, g.total, true)}
                      {g.rows.map((e) => <tr key={e.id} className="border-b border-gray-100 text-gray-600"><td className="py-1 pl-3">{e.description} ({e.paidVia || 'Cash'})</td><td className="py-1 text-right font-mono">{money(e.amount)}</td></tr>)}
                    </React.Fragment>
                  ))}
                </tbody></table>
                <div className="font-bold uppercase tracking-widest text-[10px] border-b-2 border-gray-900 pb-1 mb-1 mt-5">Suppliers paid & transfers</div>
                <table className="w-full"><tbody>
                  {sheet.supplierPayments.length + sheet.other.length === 0 && <tr><td className="py-1.5 text-gray-500">None.</td></tr>}
                  {sheet.supplierPayments.map((m) => row(`${m.counterparty} (${m.method || 'Cash'})`, m.amount))}
                  {sheet.other.map((m) => row(m.description, m.amount))}
                </tbody></table>
                {sheet.cheques.length > 0 && (
                  <>
                    <div className="font-bold uppercase tracking-widest text-[10px] border-b-2 border-gray-900 pb-1 mb-1 mt-5">Cheques</div>
                    <table className="w-full"><tbody>
                      {sheet.cheques.map((ev) => <React.Fragment key={`${ev.cheque.id}-${ev.kind}`}>{row(`${CHEQUE_EVENT_LABEL[ev.kind]}: ${ev.cheque.partyName} #${ev.cheque.chequeNumber} ${ev.cheque.bankName}`, ev.cheque.amount)}</React.Fragment>)}
                    </tbody></table>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-10 mt-14 text-xs">
              <div className="border-t border-gray-900 pt-2">Prepared by</div>
              <div className="border-t border-gray-900 pt-2">Checked by</div>
            </div>
          </>
        ),
      };
    }

    if (request.type === 'invoice' || request.type === 'challan') {
      const d = dispatches.find((x) => x.id === request.dispatchId);
      if (!d) return null;
      const booking = bookings.find((b) => b.id === d.bookingId);
      const customer = customers.find((c) => c.id === d.customerId);
      const bookingItem = booking?.items?.find((it) => it.id === d.bookingItemId);
      const product = products.find((p) => p.id === (d.productId || bookingItem?.productId || booking?.productId));
      const truck = trucks.find((t) => t.id === d.truckId);
      const isInvoice = request.type === 'invoice';
      const unit = d.kg > 0 ? d.amount / d.kg : (bookingItem?.pricePerKg || booking?.pricePerKg || 0);
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
                {d.grossKg != null && d.tareKg != null && <div>Weighbridge <span className="font-mono">gross {formatKg(d.grossKg)} − tare {formatKg(d.tareKg)}</span></div>}
                {d.deliveredAt && <div>Delivered <span className="font-mono">{formatDate(d.deliveredAt)}</span>{d.receivedBy ? ` to ${d.receivedBy}` : ''}</div>}
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
                    <div className="font-bold">{product?.name || bookingItem?.productName || 'Commodity'}</div>
                    <div className="text-gray-500">
                      {product?.category || 'Bulk Commodity'}
                      {booking?.items && booking.items.length > 1 && bookingItem ? ` • Line Item: ${product?.name}` : ''}
                      {d.notes ? ` • ${d.notes}` : ''}
                    </div>
                  </td>
                  <td className="py-3 text-right font-mono">{formatKg(d.kg)}</td>
                  {isInvoice && <td className="py-3 text-right font-mono">{unit.toFixed(2)}</td>}
                  {isInvoice && <td className="py-3 text-right font-mono font-bold">{formatCurrency(d.amount)}</td>}
                </tr>
              </tbody>
              {isInvoice && (
                <tfoot>
                  {(d.freightCharge || 0) > 0 && (
                    <tr><td colSpan={3} className="pt-3 text-right text-[11px] text-gray-600">Freight</td><td className="pt-3 text-right font-mono">{formatCurrency(d.freightCharge || 0)}</td></tr>
                  )}
                  {(d.taxAmount || 0) > 0 && (
                    <tr><td colSpan={3} className="pt-1 text-right text-[11px] text-gray-600">{settings.taxLabel || 'Sales Tax'} ({d.taxRatePct || 0}%)</td><td className="pt-1 text-right font-mono">{formatCurrency(d.taxAmount || 0)}</td></tr>
                  )}
                  <tr>
                    <td colSpan={3} className="pt-4 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Total payable</td>
                    <td className="pt-4 text-right font-mono font-extrabold text-base">{formatCurrency(dispatchBilledTotal(d))}</td>
                  </tr>
                  {d.paymentReceivedImmediately && (
                    <tr><td colSpan={4} className="pt-1 text-right text-[11px] text-teal-700 font-bold">PAID ON DISPATCH</td></tr>
                  )}
                  {booking && (
                    <tr>
                      <td colSpan={4} className="pt-3 text-right text-[11px] text-gray-500">
                        Contract balance: {bookingItem ? `${product?.name}: ${formatKg(bookingItem.remainingKg)} left | ` : ''}Overall contract {formatKg(booking.remainingKg)} remaining of {formatKg(booking.totalKg)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
            {!isInvoice && (
              <div className="grid grid-cols-2 gap-10 mt-16 text-xs">
                <div className="border-t border-gray-900 pt-2">Dispatched by ({COMPANY.name})</div>
                <div className="border-t border-gray-900 pt-2">Received by (customer signature & stamp)</div>
              </div>
            )}
          </>
        ),
      };
    }

    if (request.type === 'booking') {
      const b = bookings.find((x) => x.id === request.bookingId);
      if (!b) return null;
      const customer = customers.find((c) => c.id === b.customerId);
      const items = (b.items && b.items.length > 0)
        ? b.items
        : [
            {
              id: 'item-legacy',
              productId: b.productId,
              productName: products.find((p) => p.id === b.productId)?.name,
              totalKg: b.totalKg,
              dispatchedKg: b.dispatchedKg,
              remainingKg: b.remainingKg,
              pricePerKg: b.pricePerKg,
              totalAmount: b.totalAmount,
            },
          ];

      return {
        title: 'SALES CONTRACT & BOOKING CONFIRMATION',
        number: b.bookingNumber,
        date: b.createdAt,
        body: (
          <>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Buyer / Customer</div>
                <div className="font-bold text-sm">{customer?.company}</div>
                <div>{customer?.name}</div>
                <div>{customer?.address}</div>
                <div className="font-mono">{customer?.phone}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Contract Particulars</div>
                <div>Contract # <span className="font-mono font-bold">{b.bookingNumber}</span></div>
                <div>Status <span className="font-mono uppercase font-bold text-teal-800">{b.status}</span></div>
                {b.targetDeliveryDate && <div>Target Delivery <span className="font-mono">{formatDate(b.targetDeliveryDate)}</span></div>}
                {b.brokerName && <div>Broker <span className="font-mono">{b.brokerName}</span></div>}
              </div>
            </div>

            <table className="w-full text-xs mt-6 border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-900 text-[10px] uppercase tracking-widest text-gray-600">
                  <th className="text-left py-2">#</th>
                  <th className="text-left py-2">Commodity / Item</th>
                  <th className="text-right py-2">Contract Qty</th>
                  <th className="text-right py-2">Rate (Rs./kg)</th>
                  <th className="text-right py-2">Line Total</th>
                  <th className="text-right py-2">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((it, idx) => {
                  const p = products.find((prod) => prod.id === it.productId);
                  return (
                    <tr key={it.id || idx}>
                      <td className="py-3 text-gray-400 font-bold">{idx + 1}</td>
                      <td className="py-3">
                        <div className="font-bold">{p?.name || it.productName || 'Commodity'}</div>
                        <div className="text-gray-500">{p?.category || 'Bulk Commodity'}{it.rateOverrideReason ? ` • Note: ${it.rateOverrideReason}` : ''}</div>
                      </td>
                      <td className="py-3 text-right font-mono">{formatKg(it.totalKg)}</td>
                      <td className="py-3 text-right font-mono">Rs. {it.pricePerKg}/kg</td>
                      <td className="py-3 text-right font-mono font-bold">{formatCurrency(it.totalAmount || it.totalKg * it.pricePerKg)}</td>
                      <td className="py-3 text-right font-mono text-amber-800">{formatKg(it.remainingKg)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-900">
                  <td colSpan={2} className="pt-4 font-bold text-gray-900 text-right uppercase tracking-widest text-[10px]">Total Contract Volume & Value</td>
                  <td className="pt-4 text-right font-mono font-bold text-sm">{formatKg(b.totalKg)}</td>
                  <td className="pt-4" />
                  <td className="pt-4 text-right font-mono font-extrabold text-base">{formatCurrency(b.totalAmount)}</td>
                  <td className="pt-4 text-right font-mono font-bold text-amber-800">{formatKg(b.remainingKg)}</td>
                </tr>
                {b.notes && (
                  <tr>
                    <td colSpan={6} className="pt-4 text-xs text-gray-600 italic bg-gray-50 p-3 rounded-lg border border-gray-200">
                      Special Terms: {b.notes}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>

            <div className="grid grid-cols-2 gap-10 mt-16 text-xs">
              <div className="border-t border-gray-900 pt-2">Authorized Signatory ({COMPANY.name})</div>
              <div className="border-t border-gray-900 pt-2">Buyer Acceptance & Stamp</div>
            </div>
          </>
        ),
      };
    }

    const simpleDoc = (opts: { title: string; number: string; date: string; partyLabel: string; party?: { company?: string; name?: string; address?: string; phone?: string } | null; lines: { label: string; sub?: string; kg: number; rate: number; amount: number }[]; footer?: React.ReactNode; signatures?: [string, string] }) => ({
      title: opts.title,
      number: opts.number,
      date: opts.date,
      body: (
        <>
          <div className="grid grid-cols-2 gap-6 text-xs">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{opts.partyLabel}</div>
              <div className="font-bold text-sm">{opts.party?.company}</div>
              <div>{opts.party?.name}</div>
              <div>{opts.party?.address}</div>
              <div className="font-mono">{opts.party?.phone}</div>
            </div>
          </div>
          <table className="w-full text-xs mt-6 border-collapse">
            <thead><tr className="border-b-2 border-gray-900 text-[10px] uppercase tracking-widest text-gray-600"><th className="text-left py-2">Description</th><th className="text-right py-2">Quantity</th><th className="text-right py-2">Rate (Rs./kg)</th><th className="text-right py-2">Amount</th></tr></thead>
            <tbody>
              {opts.lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-200"><td className="py-3"><div className="font-bold">{l.label}</div>{l.sub && <div className="text-gray-500">{l.sub}</div>}</td><td className="py-3 text-right font-mono">{formatKg(l.kg)}</td><td className="py-3 text-right font-mono">{l.rate.toFixed(2)}</td><td className="py-3 text-right font-mono font-bold">{formatCurrency(l.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3} className="pt-4 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Total</td><td className="pt-4 text-right font-mono font-extrabold text-base">{formatCurrency(opts.lines.reduce((a, l) => a + l.amount, 0))}</td></tr></tfoot>
          </table>
          {opts.footer && <div className="mt-4 text-xs text-gray-600">{opts.footer}</div>}
          {opts.signatures && (
            <div className="grid grid-cols-2 gap-10 mt-16 text-xs"><div className="border-t border-gray-900 pt-2">{opts.signatures[0]}</div><div className="border-t border-gray-900 pt-2">{opts.signatures[1]}</div></div>
          )}
        </>
      ),
    });

    if (request.type === 'quotation') {
      const q = quotations.find((x) => x.id === request.quotationId);
      if (!q) return null;
      const cust = customers.find((c) => c.id === q.customerId);
      if (q.items?.length) {
        const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
        const lines = quotationLines(q);
        return {
          title: 'QUOTATION',
          number: q.quoteNumber,
          date: q.createdAt,
          body: (
            <>
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Quotation for</div>
                  <div className="font-bold text-sm">{cust?.name}</div>
                  {cust?.company && cust.company !== cust.name && <div>{cust.company}</div>}
                  {cust?.address && <div>{cust.address}</div>}
                  <div className="font-mono">{cust?.phone}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Valid until</div>
                  <div className="font-bold text-sm">{formatDate(q.validUntil)}</div>
                </div>
              </div>
              <table className="w-full text-xs mt-6 border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-white text-[10px] uppercase tracking-widest">
                    <th className="text-left py-2 px-3">Item</th>
                    <th className="text-right py-2 px-3">Qty</th>
                    <th className="text-right py-2 px-3">Price</th>
                    <th className="text-right py-2 px-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-3 px-3 font-bold">{l.productName}</td>
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{hasPack(l) ? formatQtyWithPacks(l.qty, l) : `${money(l.qty)}${l.unit && l.unit !== 'pcs' ? ` ${l.unit}` : ''}`}</td>
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{l.packPrice != null && hasPack(l) ? `${money(l.packPrice)}/${shortPack(l.packName || '')}` : money(l.unitPrice)}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">{money(Math.round(l.qty * l.unitPrice * 100) / 100)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3} className="pt-4 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Total</td><td className="pt-4 text-right font-mono font-extrabold text-base px-3 whitespace-nowrap">Rs. {money(quotationTotal(lines))}</td></tr>
                </tfoot>
              </table>
              <div className="mt-4 text-[11px] text-gray-600">Prices are good until <b>{formatDate(q.validUntil)}</b>{settings.taxRatePct ? `; ${settings.taxLabel || 'sales tax'} ${settings.taxRatePct}% is added on the bill` : ''}.{q.notes ? ` ${q.notes}` : ''}</div>
              <div className="grid grid-cols-2 gap-10 mt-14 text-xs">
                <div className="border-t border-gray-900 pt-2">For {COMPANY.name}</div>
                <div className="border-t border-gray-900 pt-2">Accepted by customer</div>
              </div>
            </>
          ),
        };
      }
      const prod = products.find((p) => p.id === q.productId);
      return simpleDoc({ title: 'QUOTATION', number: q.quoteNumber, date: q.createdAt, partyLabel: 'Quotation for', party: cust, lines: [{ label: prod?.name || 'Goods', sub: prod?.category, kg: q.kg, rate: q.pricePerKg, amount: q.amount }], footer: <>Valid until <b>{formatDate(q.validUntil)}</b>.{q.notes ? ` ${q.notes}` : ''} Prices exclusive of {settings.taxLabel || 'sales tax'}{settings.taxRatePct ? ` (${settings.taxRatePct}%)` : ''}.</>, signatures: [`For ${COMPANY.name}`, 'Accepted by customer'] });
    }
    if (request.type === 'po') {
      const po = purchaseOrders.find((x) => x.id === request.purchaseOrderId);
      if (!po) return null;
      const sup = suppliers.find((s) => s.id === po.supplierId);
      const prod = products.find((p) => p.id === po.productId);
      return simpleDoc({ title: 'PURCHASE ORDER', number: po.poNumber, date: po.createdAt, partyLabel: 'To supplier', party: sup, lines: [{ label: prod?.name || 'Goods', sub: prod?.category, kg: po.kg, rate: po.pricePerKg, amount: po.amount }], footer: <>{po.expectedDate ? <>Deliver by <b>{formatDate(po.expectedDate)}</b>. </> : null}{po.notes || ''} Received so far: {formatKg(po.receivedKg)}.</>, signatures: [`Authorised for ${COMPANY.name}`, 'Supplier acknowledgement'] });
    }
    if (request.type === 'note') {
      const r = returns.find((x) => x.id === request.returnId);
      if (!r) return null;
      if (r.kind === 'sales' && r.items?.length) {
        const inv = invoices.find((i) => i.id === r.invoiceId);
        const cust = customers.find((c) => c.id === r.customerId);
        const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
        const tax = r.taxAmount || 0;
        const refund = r.refundAmount || 0;
        return {
          title: 'CREDIT NOTE',
          number: r.returnNumber,
          date: r.date,
          body: (
            <>
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Credit to</div>
                  <div className="font-bold text-sm">{cust?.name || inv?.customerName}</div>
                  {cust?.address && <div>{cust.address}</div>}
                  <div className="font-mono">{cust?.phone || inv?.customerPhone}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Against bill</div>
                  <div className="font-bold text-sm font-mono">{inv?.invoiceNumber || '—'}</div>
                  {inv && <div>{formatDate(inv.issueDate)}</div>}
                </div>
              </div>
              <table className="w-full text-xs mt-6 border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-white text-[10px] uppercase tracking-widest">
                    <th className="text-left py-2 px-3">Item returned</th>
                    <th className="text-right py-2 px-3">Qty</th>
                    <th className="text-right py-2 px-3">Price</th>
                    <th className="text-right py-2 px-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((l, i) => {
                    // Pack of the bill line (older returns don't carry it themselves).
                    const pk = hasPack(l) ? l : inv?.items.find((x) => x.id === l.billLineId);
                    return (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-3 px-3 font-bold">{l.productName}</td>
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{pk && hasPack(pk) ? formatQtyWithPacks(l.qty, { unit: l.unit || pk.unit, packName: pk.packName, packSize: pk.packSize }) : `${money(l.qty)}${l.unit && l.unit !== 'pcs' ? ` ${l.unit}` : ''}`}</td>
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{money(l.unitPrice)}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">{money(l.amount)}</td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {tax > 0 && <tr><td colSpan={3} className="pt-4 text-right text-[11px] text-gray-600">{settings.taxLabel || 'Sales Tax'}</td><td className="pt-4 text-right font-mono px-3">{money(tax)}</td></tr>}
                  <tr><td colSpan={3} className="pt-3 text-right font-bold uppercase tracking-widest text-[10px] text-gray-600">Total credit</td><td className="pt-3 text-right font-mono font-extrabold text-base px-3 whitespace-nowrap">Rs. {money(r.amount)}</td></tr>
                  {refund > 0 && <tr><td colSpan={3} className="pt-1 text-right text-[11px] text-gray-600">Paid back ({r.refundMethod || 'Cash'})</td><td className="pt-1 text-right font-mono px-3">{money(refund)}</td></tr>}
                  {r.amount - refund > 0.005 && <tr><td colSpan={3} className="pt-1 text-right text-[11px] text-gray-600">Taken off your account</td><td className="pt-1 text-right font-mono px-3">{money(r.amount - refund)}</td></tr>}
                </tfoot>
              </table>
              {r.reason && <div className="mt-4 text-[11px] text-gray-600">Reason: {r.reason}</div>}
              <div className="grid grid-cols-2 gap-10 mt-14 text-xs">
                <div className="border-t border-gray-900 pt-2">For {COMPANY.name}</div>
                <div className="border-t border-gray-900 pt-2">Customer</div>
              </div>
            </>
          ),
        };
      }
      const party = r.kind === 'sales' ? customers.find((c) => c.id === r.customerId) : suppliers.find((s) => s.id === r.supplierId);
      const prod = products.find((p) => p.id === r.productId);
      return simpleDoc({ title: r.kind === 'sales' ? 'CREDIT NOTE' : 'DEBIT NOTE', number: r.returnNumber, date: r.date, partyLabel: r.kind === 'sales' ? 'Credit to customer' : 'Debit against supplier', party: party, lines: [{ label: `${prod?.name || 'Goods'} returned`, sub: r.reason, kg: r.kg, rate: r.pricePerKg, amount: r.amount }], footer: <>{r.kind === 'sales' ? 'This amount has been credited to your account.' : 'This amount has been deducted from the balance payable to you.'}</>, signatures: [`For ${COMPANY.name}`, r.kind === 'sales' ? 'Customer' : 'Supplier'] });
    }

    if (request.type === 'voucher') {
      const l = ledger.find((x) => x.id === request.ledgerId);
      if (!l || !(l.type === 'payment_received' || l.type === 'payment_made')) return null;
      const isReceipt = l.type === 'payment_received';
      const party = isReceipt ? customers.find((c) => c.id === l.entityId) : suppliers.find((s) => s.id === l.entityId);
      if (paper === 'thermal80') {
        return {
          thermal: true,
          title: isReceipt ? 'RECEIPT' : 'PAYMENT',
          number: l.referenceId,
          date: l.date,
          body: (
            <ThermalReceipt company={COMPANY} title={`${isReceipt ? 'RECEIPT' : 'PAYMENT'} ${l.referenceId}`} date={formatDate(l.date)} footer={settings.billFooter}>
              <div>{isReceipt ? 'Received from' : 'Paid to'}: <b>{party?.company || party?.name}</b></div>
              {party?.phone && <div>Ph: {party.phone}</div>}
              <ThermalRule />
              <div>{l.description}</div>
              <ThermalRule />
              <ThermalRow left="AMOUNT" right={`Rs. ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(l.credit)}`} bold />
              <ThermalRow left="Balance after" right={new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(l.balanceAfter)} />
            </ThermalReceipt>
          ),
        };
      }
      return {
        title: isReceipt ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER',
        number: l.referenceId,
        date: l.date,
        body: (
          <>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{isReceipt ? 'Received from' : 'Paid to'}</div>
                <div className="font-bold text-sm">{party?.company}</div>
                <div>{party?.name}</div>
                <div className="font-mono">{party?.phone}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Amount</div>
                <div className="font-mono font-extrabold text-2xl">{formatCurrency(l.credit)}</div>
                <div className="text-[11px] text-gray-500">Balance after: {formatCurrency(l.balanceAfter)}</div>
              </div>
            </div>
            <div className="mt-6 text-xs border-t border-b border-gray-200 py-3">{l.description}</div>
            <div className="grid grid-cols-2 gap-10 mt-16 text-xs">
              <div className="border-t border-gray-900 pt-2">{isReceipt ? 'Received by' : 'Paid by'} ({COMPANY.name})</div>
              <div className="border-t border-gray-900 pt-2">{isReceipt ? 'Payer signature' : 'Payee signature'}</div>
            </div>
            {settings.billFooter?.trim() && <div className="mt-6 text-[11px] text-gray-600 whitespace-pre-line text-center">{settings.billFooter.trim()}</div>}
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
                {entity.code && <div>{isCustomer ? 'Customer' : 'Supplier'} ID: <span className="font-mono font-bold">{entity.code}</span></div>}
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
  }, [request, paper, books, billingReport, salesExtrasReport, purchasingDoc, financeDoc, booksDoc, salesmen, areas, dispatches, bookings, customers, suppliers, products, ledger, trucks, settings, quotations, purchaseOrders, returns, invoices, expenses, cashEntries, bankStatementLines, bankReconciliations, cheques]);

  // On a narrow screen (a phone) the A4 / A5 page is scaled down to fit the width instead of being cut
  // off at the right. Only the preview: print CSS resets the zoom, so the paper is unchanged.
  const fitRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const inner = fitRef.current;
    const root = inner?.parentElement;
    const frame = root?.parentElement;
    if (!inner || !root || !frame) return;
    const measure = () => {
      inner.style.zoom = '';
      const cs = getComputedStyle(root);
      const have = frame.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const need = inner.scrollWidth;
      if (have > 0 && need > have + 1) inner.style.zoom = String(Math.max(0.3, have / need));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(frame);
    return () => ro.disconnect();
  }, [request, content, paper]);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:p-6 overflow-y-auto print:static print:p-0 print:block print:overflow-visible">
      <div onClick={onClose} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs print:hidden" />
      {sizedDoc && paperCss(paper) && <style data-testid="print-paper" data-paper={paper}>{paperCss(paper)}</style>}
      {content && (content as { pageCss?: string }).pageCss && <style data-testid="print-page">{(content as { pageCss?: string }).pageCss}</style>}
      <div className={`relative z-10 w-full ${sizedDoc && paper === 'thermal80' ? 'max-w-sm' : sizedDoc && paper === 'a5' ? 'max-w-xl' : 'max-w-3xl'} my-auto print:my-0 print:max-w-none`}>
        <div className="flex items-center justify-between mb-3 print:hidden">
          <span className="text-xs text-white/80">Preview • use "Print / Save PDF" to print or export.</span>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="px-4 py-2 bg-white text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5 shadow-sm hover:bg-slate-100"><Printer className="w-3.5 h-3.5 text-teal-700" /> Print / Save PDF</button>
            <button onClick={onClose} aria-label="Close preview" className="p-2 rounded-2xl bg-white/10 text-white hover:bg-white/20"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div id="print-root" data-paper={sizedDoc ? paper : undefined} className={`bg-white text-gray-900 rounded-2xl print:rounded-none shadow-2xl print:shadow-none ${content && (content as { raw?: boolean }).raw ? 'p-0 w-fit mx-auto' : content && (content as { thermal?: boolean }).thermal ? 'p-3' : sizedDoc && paper === 'a5' ? 'p-4 sm:p-6' : 'p-4 sm:p-10'} overflow-x-auto`}>
          <div id="print-fit" ref={fitRef}>
          {content && ((content as { thermal?: boolean }).thermal || (content as { raw?: boolean }).raw) ? (
            content.body
          ) : content ? (
            <>
              <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
                <div className="flex items-center gap-3">
                  {COMPANY.logo ? <img src={COMPANY.logo} alt="" className="w-14 h-14 rounded-xl object-contain" /> : <div className="w-11 h-11 rounded-2xl bg-gray-900 flex items-center justify-center text-white"><Truck className="w-5 h-5 text-teal-400" /></div>}
                  <div>
                    <div className="font-serif italic font-bold text-2xl leading-none">{COMPANY.name}</div>
                    <div className="text-[11px] text-gray-500 mt-1">{COMPANY.tagline}</div>
                    <div className="text-[11px] text-gray-500">{COMPANY.address}{COMPANY.phone ? ` • ${COMPANY.phone}` : ''}</div>
                    {COMPANY.taxId && <div className="text-[11px] text-gray-500">Tax ID: {COMPANY.taxId}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold tracking-widest">{content.title}</div>
                  <div className="font-mono text-sm">{content.number}</div>
                  <div className="text-[11px] text-gray-500">Date: {formatDate(content.date)}{(content as any).time ? ` ${(content as any).time}` : ''}</div>
                </div>
              </div>
              <div className="mt-6">{content.body}</div>
              <div className="mt-10 pt-3 border-t border-gray-200 flex items-center justify-between text-[10px] text-gray-500">
                <span>Generated by {COMPANY.name} on {formatDate(todayISO())}{currentUser ? ` by ${currentUser.name}` : ''}</span>
                <span>{request.type === 'bill' || request.type === 'bill_challan' || (request.type === 'note' && returns.find((x) => x.id === request.returnId)?.items?.length) || (request.type === 'quotation' && quotations.find((x) => x.id === request.quotationId)?.items?.length) || request.type === 'daily_sheet' || request.type === 'bank_reconciliation' || request.type === 'cheque_register' || isAccountingPrint(request) || isBillingPrint(request) || isSalesExtrasPrint(request) || isPurchasingPrint(request) || isFinancePrint(request) ? 'All amounts in PKR (Rs.)' : 'All quantities in kg • amounts in PKR'}</span>
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-xs text-gray-500">The record for this document no longer exists.</div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
