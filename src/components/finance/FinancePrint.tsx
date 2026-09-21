import React, { useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import { ASSET_CATEGORIES, Cheque, ChequeLayout } from '../../types';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { assetRegister, monthLabel, staffLedger } from '../../utils/financeBooks';
import { CASH_FLOW_LINES, cashFlowStatement } from '../../utils/financeReports';
import { amountFiguresPK, amountInWordsPK, chequeDateText, chequeLayoutOf } from '../../utils/chequePrint';
import { useAccounting } from '../../hooks/useAccounting';

/** Printable finance documents (shown by PrintDocument). */
export type FinancePrintRequest =
  | { type: 'asset_register'; asOf: string }
  | { type: 'salary_sheet'; runId: string }
  | { type: 'payslip'; runId: string; staffId: string }
  | { type: 'staff_ledger'; staffId: string }
  | { type: 'cash_flow'; from: string; to: string }
  | { type: 'cheque_print'; chequeId: string };

const TYPES = ['asset_register', 'salary_sheet', 'payslip', 'staff_ledger', 'cash_flow', 'cheque_print'];
export const isFinancePrint = (r: { type: string } | null | undefined): r is FinancePrintRequest => !!r && TYPES.includes(r.type);

const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
const th = 'py-2 px-2 text-[10px] uppercase tracking-widest text-gray-600';
const td = 'py-1.5 px-2';
const tdn = 'py-1.5 px-2 text-right font-mono whitespace-nowrap';

export type FinancePrintContent = {
  title: string;
  number: string;
  date: string;
  body: React.ReactNode;
  /** Printed as is, without the letterhead (the cheque leaf). */
  raw?: boolean;
  /** Extra print CSS (paper size). */
  pageCss?: string;
};

/** The cheque leaf: every field placed in mm from the leaf's top-left corner. */
export const ChequeLeaf: React.FC<{ cheque: Pick<Cheque, 'partyName' | 'amount' | 'chequeDate'>; layout: ChequeLayout; outline?: boolean }> = ({ cheque, layout, outline }) => {
  const at = (p: { x: number; y: number }): React.CSSProperties => ({ position: 'absolute', left: `${p.x}mm`, top: `${p.y}mm`, whiteSpace: 'nowrap' });
  const boxes = layout.dateDigitGapMm > 0;
  const date = chequeDateText(cheque.chequeDate, boxes);
  return (
    <div
      data-testid="cheque-leaf"
      className={`relative bg-white text-black font-semibold ${outline ? 'outline-1 outline-dashed outline-gray-400 print:outline-0' : ''}`}
      style={{ width: `${layout.widthMm}mm`, height: `${layout.heightMm}mm`, fontSize: `${layout.fontSizePt}pt`, fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      {layout.acPayee && (
        <div style={{ position: 'absolute', left: '6mm', top: '4mm', transform: 'rotate(-20deg)', fontSize: '8pt', borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '0.5mm 2mm' }}>A/C PAYEE ONLY</div>
      )}
      <div style={at(layout.date)} data-testid="cheque-date">
        {boxes ? date.split('').map((ch, i) => <span key={i} style={{ display: 'inline-block', width: `${layout.dateDigitGapMm}mm`, textAlign: 'center' }}>{ch}</span>) : date}
      </div>
      <div style={at(layout.payee)} data-testid="cheque-payee">{cheque.partyName}</div>
      <div style={{ ...at(layout.words), whiteSpace: 'normal', width: `${layout.wordsWidthMm}mm`, lineHeight: 1.9 }} data-testid="cheque-words">{amountInWordsPK(cheque.amount)}</div>
      <div style={at(layout.figures)} data-testid="cheque-figures">{amountFiguresPK(cheque.amount)}</div>
    </div>
  );
};

/** Builds the printable content for a finance request (null for any other request). */
export const useFinancePrint = (request: { type: string } | null): FinancePrintContent | null => {
  const t = useTrading();
  const { fixedAssets, depreciationRuns, staff, staffAdvances, salaryRuns, costCentres, cheques, settings } = t;
  const books = useAccounting(Boolean(request && request.type === 'cash_flow'));
  return useMemo(() => {
    if (!isFinancePrint(request)) return null;
    const today = todayISO();

    if (request.type === 'cheque_print') {
      const c = cheques.find((x) => x.id === request.chequeId);
      if (!c) return null;
      const layout = chequeLayoutOf(settings);
      return {
        title: 'CHEQUE',
        number: c.chequeNumber,
        date: c.chequeDate,
        raw: true,
        pageCss: `@media print { @page { size: ${layout.widthMm}mm ${layout.heightMm}mm; margin: 0; } #print-root { padding: 0 !important; width: ${layout.widthMm}mm !important; } }`,
        body: <ChequeLeaf cheque={c} layout={layout} outline />,
      };
    }

    if (request.type === 'asset_register') {
      const reg = assetRegister(fixedAssets, depreciationRuns, request.asOf);
      const cat = (id: string) => ASSET_CATEGORIES.find((c) => c.id === id)?.label || id;
      const centre = (id?: string | null) => (id ? costCentres.find((c) => c.id === id)?.name || '' : '');
      return {
        title: 'FIXED ASSET REGISTER',
        number: `As of ${formatDate(request.asOf)}`,
        date: today,
        body: (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-900 text-left">
                <th className={th}>Asset</th><th className={th}>Bought</th><th className={th}>Method</th>
                <th className={`${th} text-right`}>Cost</th><th className={`${th} text-right`}>Depreciation to date</th><th className={`${th} text-right`}>Book value</th>
              </tr>
            </thead>
            <tbody>
              {reg.rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-gray-400">No fixed assets.</td></tr>}
              {reg.rows.map((r) => (
                <tr key={r.asset.id} className="border-b border-gray-100 align-top">
                  <td className={td}><div className="font-bold">{r.asset.name}</div><div className="text-[10px] text-gray-500">{cat(r.asset.category)}{centre(r.asset.costCentreId) ? ` • ${centre(r.asset.costCentreId)}` : ''}{r.disposed ? ` • sold ${formatDate(r.asset.disposalDate!)} for ${money(r.asset.disposalProceeds || 0)}` : ''}</div></td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(r.asset.purchaseDate)}</td>
                  <td className={`${td} text-[10px]`}>{r.asset.method === 'reducing_balance' ? `Reducing ${r.asset.ratePct || Math.round(200 / r.asset.usefulLifeYears)}%` : `Straight line ${r.asset.usefulLifeYears} yrs`}</td>
                  <td className={tdn}>{money(r.cost)}</td>
                  <td className={tdn}>{money(r.accumulated)}</td>
                  <td className={`${tdn} font-bold`}>{r.disposed ? 'Sold' : money(r.bookValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t-2 border-gray-900"><td colSpan={3} className="pt-2">Total (assets in use)</td><td className={tdn}>{money(reg.totalCost)}</td><td className={tdn}>{money(reg.totalAccumulated)}</td><td className={tdn}>{money(reg.totalBookValue)}</td></tr>
            </tfoot>
          </table>
        ),
      };
    }

    if (request.type === 'salary_sheet' || request.type === 'payslip') {
      const r = salaryRuns.find((x) => x.id === request.runId);
      if (!r) return null;
      if (request.type === 'payslip') {
        const l = r.lines.find((x) => x.staffId === request.staffId);
        if (!l) return null;
        const s = staff.find((x) => x.id === l.staffId);
        const row = (label: string, v: number, bold = false) => (
          <tr className={`border-b border-gray-100 ${bold ? 'font-bold' : ''}`}><td className={td}>{label}</td><td className={tdn}>{money(v)}</td></tr>
        );
        return {
          title: 'PAYSLIP',
          number: monthLabel(r.month),
          date: r.date,
          body: (
            <div className="text-xs space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div><div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Employee</div><div className="font-bold text-sm">{l.name}</div><div>{l.role || s?.role}</div>{s?.phone && <div className="font-mono">{s.phone}</div>}{s?.cnic && <div className="font-mono">CNIC {s.cnic}</div>}</div>
                <div className="text-right"><div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Paid</div><div>{formatDate(r.date)} by {r.method}</div></div>
              </div>
              <table className="w-full border-collapse">
                <tbody>
                  {row('Monthly salary', l.salary)}
                  {l.bonus > 0 && row('Bonus / overtime', l.bonus)}
                  {l.deductions > 0 && row('Less: deductions', -l.deductions)}
                  {l.advanceDeducted > 0 && row('Less: advance recovered', -l.advanceDeducted)}
                  <tr className="font-extrabold border-t-2 border-gray-900"><td className="pt-2 text-sm">Net pay</td><td className="pt-2 text-right font-mono text-sm">{money(l.net)}</td></tr>
                </tbody>
              </table>
              <div className="italic">{amountInWordsPK(l.net)}</div>
              <div className="grid grid-cols-2 gap-10 pt-12 text-[11px]">
                <div className="border-t border-gray-900 pt-2">Paid by</div>
                <div className="border-t border-gray-900 pt-2">Received by (signature)</div>
              </div>
            </div>
          ),
        };
      }
      return {
        title: 'SALARY SHEET',
        number: monthLabel(r.month),
        date: r.date,
        body: (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-900 text-left">
                <th className={th}>Name</th><th className={`${th} text-right`}>Salary</th><th className={`${th} text-right`}>Bonus</th><th className={`${th} text-right`}>Deductions</th><th className={`${th} text-right`}>Advance</th><th className={`${th} text-right`}>Net paid</th><th className={th}>Signature</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.staffId} className="border-b border-gray-200">
                  <td className={td}><div className="font-bold">{l.name}</div><div className="text-[10px] text-gray-500">{l.role}</div></td>
                  <td className={tdn}>{money(l.salary)}</td><td className={tdn}>{l.bonus ? money(l.bonus) : ''}</td><td className={tdn}>{l.deductions ? money(l.deductions) : ''}</td><td className={tdn}>{l.advanceDeducted ? money(l.advanceDeducted) : ''}</td>
                  <td className={`${tdn} font-bold`}>{money(l.net)}</td><td className="py-1.5 px-2 w-28" />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t-2 border-gray-900"><td className="pt-2">Total</td><td colSpan={3} className={tdn}>{money(r.totalGross)} gross</td><td className={tdn}>{money(r.totalAdvance)}</td><td className={tdn}>{money(r.totalNet)}</td><td /></tr>
              <tr><td colSpan={7} className="pt-2 text-[10px] text-gray-500">Paid {formatDate(r.date)} by {r.method}.</td></tr>
            </tfoot>
          </table>
        ),
      };
    }

    if (request.type === 'staff_ledger') {
      const s = staff.find((x) => x.id === request.staffId);
      if (!s) return null;
      const rows = staffLedger(s.id, staffAdvances, salaryRuns);
      return {
        title: 'STAFF ACCOUNT',
        number: s.name,
        date: today,
        body: (
          <table className="w-full text-xs border-collapse">
            <thead><tr className="border-b-2 border-gray-900 text-left"><th className={th}>Date</th><th className={th}>Details</th><th className={`${th} text-right`}>Advance</th><th className={`${th} text-right`}>Recovered</th><th className={`${th} text-right`}>Salary paid</th><th className={`${th} text-right`}>Advance owed</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-gray-400">Nothing yet.</td></tr>}
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100"><td className={`${td} whitespace-nowrap`}>{formatDate(r.date)}</td><td className={td}>{r.text}</td><td className={tdn}>{r.advance ? money(r.advance) : ''}</td><td className={tdn}>{r.recovered ? money(r.recovered) : ''}</td><td className={tdn}>{r.salaryPaid ? money(r.salaryPaid) : ''}</td><td className={`${tdn} font-bold`}>{money(r.balance)}</td></tr>
              ))}
            </tbody>
          </table>
        ),
      };
    }

    // Cash flow statement
    const cf = cashFlowStatement(books.journal, request.from, request.to);
    const section = (id: 'operating' | 'investing' | 'financing' | 'opening', title: string, total: number) => {
      const lines = CASH_FLOW_LINES.filter((l) => l.section === id).flatMap((l) => [
        cf.flows[l.id].in ? { key: `${l.id}-in`, label: l.inLabel, v: cf.flows[l.id].in } : null,
        cf.flows[l.id].out ? { key: `${l.id}-out`, label: l.outLabel, v: -cf.flows[l.id].out } : null,
      ]).filter(Boolean) as { key: string; label: string; v: number }[];
      if (id === 'opening' && lines.length === 0) return null;
      return (
        <>
          <tr><td colSpan={2} className="pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</td></tr>
          {lines.length === 0 && <tr><td colSpan={2} className="py-1 text-gray-400">—</td></tr>}
          {lines.map((l) => <tr key={l.key} className="border-b border-gray-100"><td className="py-1.5">{l.label}</td><td className="py-1.5 text-right font-mono">{money(l.v)}</td></tr>)}
          <tr className="font-bold border-b border-gray-300"><td className="py-1.5">Net</td><td className="py-1.5 text-right font-mono">{money(total)}</td></tr>
        </>
      );
    };
    return {
      title: 'CASH FLOW STATEMENT',
      number: `${formatDate(request.from)} – ${formatDate(request.to)}`,
      date: today,
      body: (
        <table className="w-full text-xs border-collapse">
          <tbody>
            <tr className="font-bold"><td className="py-1.5">Cash & bank at the start</td><td className="py-1.5 text-right font-mono">{money(cf.opening)}</td></tr>
            {section('opening', 'Brought in when the books started', cf.openingBroughtIn)}
            {section('operating', 'From running the shop', cf.operating)}
            {section('investing', 'Fixed assets', cf.investing)}
            {section('financing', 'Owner and loans', cf.financing)}
            <tr className="font-extrabold border-t-2 border-gray-900"><td className="pt-3">Cash & bank at the end</td><td className="pt-3 text-right font-mono">{money(cf.closing)}</td></tr>
          </tbody>
        </table>
      ),
    };
  }, [request, fixedAssets, depreciationRuns, staff, staffAdvances, salaryRuns, costCentres, cheques, settings, books]);
};
