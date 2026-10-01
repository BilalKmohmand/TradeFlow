import React from 'react';
import { formatDate, moneyText } from '../../../utils/formatters';
import { slashDate } from '../../../utils/classicReports';
import type { Cell, ReportColumn, ReportResult, ReportRow } from '../../../utils/classicReports';

const QTY = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });

/** One cell as text: money with separators, ISO dates as "22 Sep 2026", other numbers as quantities. */
export const formatCell = (col: Pick<ReportColumn, 'money' | 'key' | 'format'>, v: Cell): string => {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    if (col.format === 'fixed2') return v.toFixed(2);
    if (col.format === 'amount2') return AMT2.format(v);
    return col.money ? moneyText(v) : QTY.format(v);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return col.format === 'dmy' ? slashDate(v) : formatDate(v);
  return v;
};
const AMT2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Company = { name: string; address?: string; phone?: string };

/**
 * A report drawn the way the old program prints it: the shop name in dark red, the title underlined in navy,
 * a caption line in italics, a rounded header bar, no grid lines, and group headings as "Customer :  Name".
 * Always black on white (a sheet of paper), on screen and in print.
 */
export const OldProgramReport: React.FC<{ report: ReportResult; company?: Company; onOpenBill?: (id: string) => void; width?: string }> = ({ report, company, onOpenBill, width }) => (
  <div className="bg-white text-black px-6 sm:px-10 py-8 mx-auto" style={{ width: width || '100%', maxWidth: '100%', fontFamily: 'Arial, Helvetica, sans-serif' }} data-testid="old-report">
    <div className="text-center">
      {company && <div className="text-[22px] font-bold tracking-wide" style={{ color: '#7B1113', fontFamily: 'Georgia, "Times New Roman", serif' }}>{company.name.toUpperCase()}</div>}
      <div className="mt-0.5"><span className="text-[17px] font-bold underline underline-offset-4" style={{ color: '#14146E' }} data-testid="classic-title">{report.title}</span></div>
    </div>
    <div className="mt-7 text-[12px] font-bold italic" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }} data-testid="old-report-caption">{report.oldLayout?.caption}</div>
    {report.sections.map((s, si) => (
      <div key={si} className="mt-3 overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 0 }} data-testid="report-table">
          <thead>
            <tr>
              {s.columns.map((c, ci) => (
                <th
                  key={c.key}
                  className={`px-3 py-1 text-[13px] font-bold whitespace-nowrap border-y-2 border-black ${ci === 0 ? 'border-l-2 rounded-l-lg' : ''} ${ci === s.columns.length - 1 ? 'border-r-2 rounded-r-lg' : ''} ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  style={{ color: '#14146E', fontFamily: 'Georgia, "Times New Roman", serif', ...(c.align === 'right' ? {} : { width: '6.5rem' }) }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.rows.length === 0 && <tr><td colSpan={s.columns.length} className="px-3 py-6 text-center text-[12px] text-gray-600">{s.empty || 'Nothing to show.'}</td></tr>}
            {s.rows.map((r, ri) =>
              r.style === 'heading' ? (
                <tr key={ri} data-testid="old-report-group">
                  <td colSpan={s.columns.length} className="pl-10 pt-2.5 pb-0.5">
                    <span className="text-[11px] italic mr-8">{String(r.cells[s.columns[0].key] ?? '')}</span>
                    <span className="text-[13px] font-bold italic" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{String(r.cells[s.columns[1].key] ?? '')}</span>
                  </td>
                </tr>
              ) : (
                <tr key={ri} className={r.billId && onOpenBill ? 'cursor-pointer hover:bg-gray-100' : ''} onClick={r.billId && onOpenBill ? () => onOpenBill(r.billId!) : undefined}>
                  {s.columns.map((c) => <td key={c.key} className={`px-3 py-1 text-[11.5px] whitespace-nowrap ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{formatCell(c, r.cells[c.key])}</td>)}
                </tr>
              )
            )}
          </tbody>
          {s.totals && s.rows.length > 0 && (
            <tfoot>
              <tr data-testid="report-totals">
                {s.columns.map((c) => <td key={c.key} className={`px-3 py-1.5 text-[12px] font-bold border-t-2 border-black whitespace-nowrap ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{formatCell(c, s.totals![c.key] ?? null)}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    ))}
  </div>
);

/** Short keys (code, date, doc #) never wrap; other text columns keep at least ~9rem on a phone. */
const NOWRAP_KEYS = new Set(['code', 'date', 'ref', 'bill', 'memo', 'unit', 'lastDoc', 'lastPay', 'lastSaleOn', 'lastBuyOn', 'doc']);
const textColCls = (c: Pick<ReportColumn, 'align' | 'key'>) => (c.align === 'right' ? '' : NOWRAP_KEYS.has(c.key) ? 'whitespace-nowrap' : 'min-w-[9rem]');

const rowCls = (r: ReportRow) =>
  r.style === 'heading'
    ? 'bg-[#F4F3EF] dark:bg-[#162436] font-bold text-[#111827] dark:text-white'
    : r.style === 'subtotal' || r.style === 'total'
      ? 'font-bold text-[#111827] dark:text-white'
      : r.style === 'muted'
        ? 'text-[#6B7280] dark:text-[#94A3B8]'
        : 'text-[#374151] dark:text-[#CBD5E1]';

/** The report on screen: summary tiles, then each section as a scrollable table. */
export const ScreenReport: React.FC<{ report: ReportResult; onOpenBill?: (id: string) => void; rowAction?: (row: ReportRow) => React.ReactNode; company?: Company }> = ({ report, onOpenBill, rowAction, company }) =>
  report.oldLayout ? (
    <div className="rounded-[20px] border border-[#E5E5E1] dark:border-[#203248] bg-white overflow-hidden shadow-sm" data-testid="report-body">
      <OldProgramReport report={report} company={company} onOpenBill={onOpenBill} />
    </div>
  ) : (
  <div className="space-y-4" data-testid="report-body">
    {report.summary && report.summary.length > 0 && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {report.summary.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">{s.label}</div>
            <div className="text-base font-extrabold tabular-nums text-[#111827] dark:text-white break-words" data-testid={`summary-${s.label}`}>{s.money && typeof s.value === 'number' ? `Rs. ${moneyText(s.value)}` : String(s.value ?? '')}</div>
          </div>
        ))}
      </div>
    )}
    {report.sections.map((s, si) => (
      <div key={si} className="rounded-[20px] border border-[#E5E5E1] dark:border-[#203248] bg-white dark:bg-[#101A26] overflow-hidden">
        {s.title && <h3 className="px-4 py-2.5 text-sm font-bold text-[#111827] dark:text-white border-b border-[#E5E5E1] dark:border-[#203248]">{s.title}</h3>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="report-table">
            <thead className="bg-[#FAF9F6] dark:bg-[#162436]">
              <tr>
                {s.columns.map((c) => <th key={c.key} className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'} ${textColCls(c)}`}>{c.label}</th>)}
                {rowAction && <th className="px-3 py-2" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {s.rows.length === 0 && (
                <tr><td colSpan={s.columns.length + (rowAction ? 1 : 0)} className="px-4 py-6 text-center text-sm text-[#6B7280] dark:text-[#94A3B8]">{s.empty || 'Nothing to show.'}</td></tr>
              )}
              {s.rows.map((r, ri) => (
                <tr key={ri} className={`${rowCls(r)} ${r.billId && onOpenBill ? 'cursor-pointer hover:bg-[#FAF9F6] dark:hover:bg-[#162436]' : ''}`} onClick={r.billId && onOpenBill ? () => onOpenBill(r.billId!) : undefined}>
                  {s.columns.map((c) => <td key={c.key} className={`px-3 py-1.5 ${c.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : textColCls(c)}`}>{formatCell(c, r.cells[c.key])}</td>)}
                  {rowAction && <td className="px-2 py-1 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{rowAction(r)}</td>}
                </tr>
              ))}
            </tbody>
            {s.totals && s.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#111827] dark:border-white font-extrabold text-[#111827] dark:text-white" data-testid="report-totals">
                  {s.columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{formatCell(c, s.totals![c.key] ?? null)}</td>)}
                  {rowAction && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    ))}
    {report.notes?.map((n) => <p key={n} className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{n}</p>)}
  </div>
);

/**
 * The classic printed page: shop name centred, the report title underlined under it, the period,
 * then plain ruled tables (black on white).
 */
export const ClassicPage: React.FC<{ company: { name: string; address?: string; phone?: string }; title: string; period?: string; printedBy?: string; width?: string; children: React.ReactNode }> = ({ company, title, period, printedBy, width = '190mm', children }) => (
  <div className="p-6 text-gray-900 bg-white" style={{ width, maxWidth: '100%' }} data-testid="classic-page">
    <div className="text-center">
      <div className="text-2xl font-extrabold tracking-wide">{company.name}</div>
      {(company.address || company.phone) && <div className="text-[11px] text-gray-700">{[company.address, company.phone].filter(Boolean).join(' • ')}</div>}
      <div className="mt-2"><span className="text-base font-bold uppercase tracking-wider underline underline-offset-4 decoration-2" data-testid="classic-title">{title}</span></div>
      {period && <div className="text-[11px] mt-1 text-gray-700">{period}</div>}
    </div>
    <div className="mt-4">{children}</div>
    <div className="mt-6 pt-2 border-t border-gray-400 flex justify-between text-[9px] text-gray-600">
      <span>Printed {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}{printedBy ? ` by ${printedBy}` : ''}</span>
      <span>All amounts in Rs.</span>
    </div>
  </div>
);

/**
 * Paper of a printed report: A4 portrait fits about six columns; wider reports (trial balance between
 * dates, stock in hand with godowns, rate list…) print on A4 landscape so no column is cut off.
 */
export const reportPaper = (report: ReportResult): { landscape: boolean; width: string; pageCss: string } => {
  const cols = Math.max(0, ...report.sections.map((s) => s.columns.length));
  const landscape = cols > 6;
  return landscape
    ? { landscape, width: '277mm', pageCss: '@media print { @page { size: A4 landscape; margin: 10mm; } }' }
    : { landscape, width: '190mm', pageCss: '@media print { @page { size: A4; margin: 10mm; } }' };
};

const pth = 'border border-gray-800 px-1.5 py-1 text-[10px] font-bold uppercase';
const ptd = 'border border-gray-400 px-1.5 py-0.5 text-[10.5px]';

/** A report result as ruled print tables. */
export const PrintReport: React.FC<{ report: ReportResult }> = ({ report }) => (
  <div className="space-y-3">
    {report.summary && report.summary.length > 0 && (
      <div className="text-[10.5px] flex flex-wrap gap-x-5 gap-y-0.5 justify-center">
        {report.summary.map((s) => <span key={s.label}>{s.label}: <b>{s.money && typeof s.value === 'number' ? `Rs. ${moneyText(s.value)}` : String(s.value ?? '')}</b></span>)}
      </div>
    )}
    {report.sections.map((s, si) => (
      <div key={si}>
        {s.title && <div className="text-[11px] font-bold underline mb-1">{s.title}</div>}
        <table className="w-full border-collapse">
          <thead>
            <tr>{s.columns.map((c) => <th key={c.key} className={`${pth} ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {s.rows.length === 0 && <tr><td colSpan={s.columns.length} className={`${ptd} text-center text-gray-500`}>{s.empty || 'Nothing to show.'}</td></tr>}
            {s.rows.map((r, ri) => (
              <tr key={ri} className={r.style === 'heading' ? 'bg-gray-100 font-bold' : r.style === 'subtotal' || r.style === 'total' ? 'font-bold' : ''}>
                {s.columns.map((c) => <td key={c.key} className={`${ptd} ${c.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{formatCell(c, r.cells[c.key])}</td>)}
              </tr>
            ))}
          </tbody>
          {s.totals && s.rows.length > 0 && (
            <tfoot>
              <tr className="font-extrabold">{s.columns.map((c) => <td key={c.key} className={`border-2 border-gray-900 px-1.5 py-1 text-[10.5px] ${c.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{formatCell(c, s.totals![c.key] ?? null)}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    ))}
    {report.notes?.map((n) => <p key={n} className="text-[9.5px] text-gray-600">{n}</p>)}
  </div>
);
