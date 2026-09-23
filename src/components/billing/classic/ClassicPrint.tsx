import React, { useMemo } from 'react';
import { useTrading } from '../../../context/TradingContext';
import { useReportData } from '../../../hooks/useReportData';
import { REPORTS, ReportFilter, ReportId } from '../../../utils/classicReports';
import { formatAmount, formatDate } from '../../../utils/formatters';
import { todayISO } from '../../../utils/stockFlow';
import { ClassicPage, PrintReport } from './ReportTables';

/** Printable classic reports and the purchase invoice (shown by PrintDocument). */
export type ClassicPrintRequest =
  | { type: 'classic_report'; report: ReportId; filter: ReportFilter }
  | { type: 'purchase_invoice'; id: string; paper?: 'a4' | 'a5' };

export const isClassicPrint = (r: { type: string } | null | undefined): r is ClassicPrintRequest => !!r && (r.type === 'classic_report' || r.type === 'purchase_invoice');

type Content = { raw: true; title: string; number: string; date: string; body: React.ReactNode; pageCss: string };

const money = formatAmount;
const A4 = '@media print { @page { size: A4; margin: 10mm; } }';
const A5 = '@media print { @page { size: A5; margin: 8mm; } }';

export const useClassicPrint = (request: { type: string } | null): Content | null => {
  const classic = isClassicPrint(request) ? request : null;
  const def = classic?.type === 'classic_report' ? REPORTS[classic.report] : undefined;
  const data = useReportData(Boolean(def?.books));
  const { settings, currentUser, godowns, suppliers } = useTrading();
  return useMemo(() => {
    if (!classic) return null;
    const company = { name: settings.companyName || 'Sarmaya', address: settings.companyAddress, phone: settings.companyPhone };
    if (classic.type === 'classic_report') {
      if (!def) return null;
      const report = def.build(data, { ...classic.filter, today: classic.filter.today || todayISO() });
      return {
        raw: true,
        title: report.title,
        number: report.period,
        date: todayISO(),
        pageCss: A4,
        body: (
          <ClassicPage company={company} title={report.title} period={report.period} printedBy={currentUser?.name}>
            <PrintReport report={report} />
          </ClassicPage>
        ),
      };
    }
    const inv = data.purchaseInvoices.find((p) => p.id === classic.id);
    if (!inv) return null;
    const a5 = classic.paper === 'a5';
    const sup = suppliers.find((s) => s.id === inv.supplierId);
    const th = 'border border-gray-800 px-1.5 py-1 text-[10px] font-bold uppercase';
    const td = 'border border-gray-400 px-1.5 py-1 text-[11px]';
    const tr = (label: string, value: string, bold = false) => (
      <tr className={bold ? 'font-extrabold' : ''}><td className="px-1.5 py-0.5 text-right text-[11px]">{label}</td><td className="px-1.5 py-0.5 text-right font-mono text-[11px] w-32">{value}</td></tr>
    );
    return {
      raw: true,
      title: 'PURCHASE INVOICE',
      number: inv.invoiceNumber,
      date: inv.date,
      pageCss: a5 ? A5 : A4,
      body: (
        <ClassicPage company={company} title="Purchase Invoice" printedBy={currentUser?.name} width={a5 ? '132mm' : '190mm'}>
          <div className="grid grid-cols-2 gap-3 text-[11px]" data-testid="print-purchase-invoice">
            <div>
              <div>Computer #: <b className="font-mono">{inv.invoiceNumber}</b></div>
              <div>Date: <b>{formatDate(inv.date)}</b></div>
              {inv.memoNo && <div>Memo No (supplier bill): <b className="font-mono">{inv.memoNo}</b></div>}
              {godowns.length > 1 && inv.godownId && <div>Store: <b>{godowns.find((g) => g.id === inv.godownId)?.name}</b></div>}
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-600">Supplier</div>
              <div className="font-bold">{sup?.code ? `${sup.code} • ` : ''}{inv.supplierName}</div>
              {sup?.address && <div>{sup.address}</div>}
              {sup?.phone && <div className="font-mono">{sup.phone}</div>}
            </div>
          </div>
          <table className="w-full border-collapse mt-3">
            <thead>
              <tr><th className={`${th} text-left`}>Code</th><th className={`${th} text-left`}>Product name</th><th className={`${th} text-left`}>Unit</th><th className={`${th} text-left`}>Packing</th><th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th></tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td className={`${td} font-mono`}>{l.code || ''}</td>
                  <td className={td}>{l.productName}{l.batchNo ? <div className="text-[9px] text-gray-600">Batch {l.batchNo}{l.expiryDate ? ` · Exp ${formatDate(l.expiryDate)}` : ''}</div> : null}</td>
                  <td className={td}>{l.unit}</td>
                  <td className={td}>{l.packs ? `${money(l.packs)} × ${l.packSize}` : ''}</td>
                  <td className={`${td} text-right font-mono`}>{money(l.qty)}</td>
                  <td className={`${td} text-right font-mono`}>{money(l.rate)}</td>
                  <td className={`${td} text-right font-mono`}>{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="ml-auto mt-2">
            <tbody>
              {tr('Amount', money(inv.grossAmount))}
              {inv.discountAmount > 0 && tr(`Discount${inv.discountPct ? ` ${inv.discountPct}%` : ''}`, `− ${money(inv.discountAmount)}`)}
              {inv.otherCharges > 0 && tr('Other charges', money(inv.otherCharges))}
              {tr('Bill total', `Rs. ${money(inv.totalAmount)}`, true)}
              {inv.paidAmount > 0 && tr(`Paid (${inv.paidMethod || 'Cash'})`, money(inv.paidAmount))}
              {tr('Balance', `Rs. ${money(Math.round((inv.totalAmount - inv.paidAmount) * 100) / 100)}`, true)}
            </tbody>
          </table>
          {inv.remarks && <p className="mt-2 text-[11px]">Remarks: {inv.remarks}</p>}
          <div className="grid grid-cols-2 gap-10 mt-10 text-[11px]"><div className="border-t border-gray-900 pt-1">Received by</div><div className="border-t border-gray-900 pt-1">Checked by</div></div>
        </ClassicPage>
      ),
    };
  }, [classic, def, data, settings, currentUser, godowns, suppliers]);
};
