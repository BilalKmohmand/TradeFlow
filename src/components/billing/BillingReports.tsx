import React, { useMemo, useState } from 'react';
import { Printer, Download } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Tile, cardCls, inputCls, labelCls, secondaryBtn, rs } from './ui';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { downloadCsvFile } from '../../utils/listTools';
import { AgingRow, sumAging } from '../../utils/finance';
import { billingPayablesAging, billingReceivablesAging, profitFromBills, purchaseRegister, ProfitRow } from '../../utils/stockReports';
import { profitByAttribute } from '../../utils/purchasing';

const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(Math.round(n));
const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
const th = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap';
const td = 'px-3 py-2 text-sm';
const tdNum = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';

const chip = (active: boolean) =>
  `px-3.5 py-2 rounded-2xl text-xs font-bold border whitespace-nowrap ${active ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent' : 'bg-white dark:bg-[#101A26] border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]'}`;

// ---------------------------------------------------------------------------
// Aging: who owes for how long
// ---------------------------------------------------------------------------
export const AgingTable: React.FC<{ rows: AgingRow[]; empty: string; onOpen?: (id: string) => void }> = ({ rows, empty, onOpen }) => {
  const t = sumAging(rows);
  if (rows.length === 0) return <p className="text-sm text-[#8E9299] py-6 text-center">{empty}</p>;
  const cell = (n: number, tone = '') => <td className={`${tdNum} ${n > 0 ? tone : 'text-[#C4C4C0] dark:text-[#3B4B5E]'}`}>{n > 0 ? money(n) : '—'}</td>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
      <table className="w-full min-w-[560px]" data-testid="aging-table">
        <thead className="bg-[#FAF9F6] dark:bg-[#162436]">
          <tr><th className={`${th} text-left`}>Name</th><th className={`${th} text-right`}>0–30 days</th><th className={`${th} text-right`}>31–60</th><th className={`${th} text-right`}>61–90</th><th className={`${th} text-right`}>90+</th><th className={`${th} text-right`}>Total</th></tr>
        </thead>
        <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
          {rows.map((r) => (
            <tr key={r.entityId}>
              <td className={td}>
                {onOpen ? <button type="button" onClick={() => onOpen(r.entityId)} className="font-semibold text-left hover:underline">{r.name}</button> : <span className="font-semibold">{r.name}</span>}
                {r.oldestDays > 0 && <span className="block text-[11px] text-[#8E9299]">oldest {r.oldestDays} day{r.oldestDays === 1 ? '' : 's'}</span>}
              </td>
              {cell(r.current)}
              {cell(r.d31_60, 'text-amber-700 dark:text-amber-300')}
              {cell(r.d61_90, 'text-rose-600 dark:text-rose-300')}
              {cell(r.d90plus, 'text-rose-700 dark:text-rose-300 font-bold')}
              <td className={`${tdNum} font-bold`}>{money(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-[#FAF9F6] dark:bg-[#162436] font-bold">
          <tr><td className={td}>Total</td><td className={tdNum}>{money(t.current)}</td><td className={tdNum}>{money(t.d31_60)}</td><td className={tdNum}>{money(t.d61_90)}</td><td className={tdNum}>{money(t.d90plus)}</td><td className={tdNum}>{money(t.total)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
};

export const AgingModal: React.FC<{ isOpen: boolean; onClose: () => void; side: 'customers' | 'suppliers' }> = ({ isOpen, onClose, side: initial }) => {
  const { customers, suppliers, ledger, setPrintRequest } = useTrading();
  const [side, setSide] = useState(initial);
  const [asOf, setAsOf] = useState(todayISO());
  const rows = useMemo(() => (!isOpen ? [] : side === 'customers' ? billingReceivablesAging(customers, ledger, asOf) : billingPayablesAging(suppliers, ledger, asOf)), [isOpen, side, customers, suppliers, ledger, asOf]);
  const exportCsv = () =>
    downloadCsvFile(`sarmaya-aging-${side}-${asOf}.csv`, ['Name', 'Phone', '0-30 days', '31-60 days', '61-90 days', '90+ days', 'Total', 'Oldest (days)'], rows.map((r) => [r.name, r.phone, r.current, r.d31_60, r.d61_90, r.d90plus, r.total, r.oldestDays]));
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Who owes for how long" subtitle="Money still owed, split by how old it is. Payments clear the oldest bills first." wide
      footer={
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={exportCsv} className={secondaryBtn}><Download className="w-4 h-4" /> CSV</button>
          <button type="button" onClick={() => setPrintRequest({ type: 'billing_report', report: 'aging', side, asOf })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print</button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div role="tablist" aria-label="Whose money" className="flex gap-1.5">
            <button type="button" role="tab" aria-selected={side === 'customers'} onClick={() => setSide('customers')} className={chip(side === 'customers')}>Customers owe you</button>
            <button type="button" role="tab" aria-selected={side === 'suppliers'} onClick={() => setSide('suppliers')} className={chip(side === 'suppliers')}>You owe suppliers</button>
          </div>
          <div className="ml-auto">
            <label className={labelCls} htmlFor="aging-asof">As of</label>
            <input id="aging-asof" type="date" value={asOf} max={todayISO()} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={`${inputCls} w-auto`} />
          </div>
        </div>
        <AgingTable rows={rows} empty={side === 'customers' ? 'Nobody owes you anything.' : 'You owe no supplier anything.'} />
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Purchase register
// ---------------------------------------------------------------------------
export const PurchaseRegisterView: React.FC<{ supplierId?: string }> = ({ supplierId: fixedSupplier }) => {
  const { purchases, returns, adjustments, suppliers, products, setPrintRequest } = useTrading();
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [supplierId, setSupplierId] = useState(fixedSupplier || '');
  const [productId, setProductId] = useState('');
  const reg = useMemo(() => purchaseRegister({ purchases, returns, adjustments, suppliers, products }, { from, to, supplierId: supplierId || undefined, productId: productId || undefined }), [purchases, returns, adjustments, suppliers, products, from, to, supplierId, productId]);
  const exportCsv = () =>
    downloadCsvFile(`sarmaya-purchase-register-${from}-to-${to}.csv`, ['Date', 'Ref', 'Supplier', 'Item', 'Qty', 'Unit', 'Rate', 'Amount', 'Note'], reg.rows.map((r) => [r.date, r.ref, r.supplier, r.item, r.qty, r.unit, r.rate, r.amount, r.note || '']));
  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4 grid grid-cols-2 sm:grid-cols-4 gap-3`}>
        <div><label className={labelCls} htmlFor="reg-from">From</label><input id="reg-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="reg-to">To</label><input id="reg-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputCls} /></div>
        {!fixedSupplier && (
          <div><label className={labelCls} htmlFor="reg-supplier">Supplier</label>
            <select id="reg-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}><option value="">All suppliers</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.company || s.name}</option>)}</select>
          </div>
        )}
        <div className={fixedSupplier ? 'col-span-2' : ''}><label className={labelCls} htmlFor="reg-item">Item</label>
          <select id="reg-item" value={productId} onChange={(e) => setProductId(e.target.value)} className={inputCls}><option value="">All items</option>{[...products].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Stock received" value={rs(reg.received)} hint={`${reg.rows.filter((r) => r.amount >= 0).length} receipt${reg.rows.filter((r) => r.amount >= 0).length === 1 ? '' : 's'}`} />
        <Tile label="Sent back" value={rs(reg.returned)} tone={reg.returned > 0 ? 'warn' : 'default'} />
        <Tile label="Net bought" value={rs(reg.net)} />
      </div>
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" onClick={exportCsv} className={secondaryBtn}><Download className="w-4 h-4" /> CSV</button>
        <button type="button" onClick={() => setPrintRequest({ type: 'billing_report', report: 'purchase_register', from, to, supplierId: supplierId || undefined, productId: productId || undefined })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print</button>
      </div>
      <div className={`${cardCls} overflow-hidden`}>
        {reg.rows.length === 0 ? <p className="p-8 text-center text-sm text-[#8E9299]">No stock received in these dates.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]" data-testid="purchase-register">
              <thead className="bg-[#FAF9F6] dark:bg-[#162436]"><tr><th className={`${th} text-left`}>Date</th><th className={`${th} text-left`}>Supplier</th><th className={`${th} text-left`}>Item</th><th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th></tr></thead>
              <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {reg.rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className={r.kind === 'return' ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''}>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(r.date)}<span className="block text-[11px] tabular-nums text-[#8E9299]">{r.ref}</span></td>
                    <td className={td}>{r.supplier}{r.kind === 'return' && <span className="block text-[11px] font-bold text-rose-700 dark:text-rose-300">returned</span>}</td>
                    <td className={td}>{r.item}</td>
                    <td className={tdNum}>{num(r.qty)} {r.unit}</td>
                    <td className={tdNum}>{r.rate ? money(r.rate) : '—'}</td>
                    <td className={`${tdNum} font-bold`}>{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#FAF9F6] dark:bg-[#162436] font-bold"><tr><td className={td} colSpan={5}>Total</td><td className={tdNum}>{money(reg.net)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Profit by item and by customer (from bills)
// ---------------------------------------------------------------------------
type ProfitBy = 'item' | 'customer' | 'group' | 'brand';
const PROFIT_BY: { id: ProfitBy; label: string; col: string; count: string }[] = [
  { id: 'item', label: 'By item', col: 'Item', count: 'Qty sold' },
  { id: 'group', label: 'By group', col: 'Group', count: 'Items' },
  { id: 'brand', label: 'By brand', col: 'Brand', count: 'Items' },
  { id: 'customer', label: 'By customer', col: 'Customer', count: 'Bills' },
];
const ProfitTable: React.FC<{ rows: ProfitRow[]; kind: ProfitBy; testId: string }> = ({ rows, kind, testId }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[560px]" data-testid={testId}>
      <thead className="bg-[#FAF9F6] dark:bg-[#162436]"><tr><th className={`${th} text-left`}>{PROFIT_BY.find((x) => x.id === kind)!.col}</th><th className={`${th} text-right`}>{PROFIT_BY.find((x) => x.id === kind)!.count}</th><th className={`${th} text-right`}>Sales</th><th className={`${th} text-right`}>Cost</th><th className={`${th} text-right`}>Profit</th><th className={`${th} text-right`}>Margin</th></tr></thead>
      <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
        {rows.map((r) => (
          <tr key={r.key}>
            <td className={td}><span className="font-semibold">{r.name}</span>{r.uncosted > 0 && <span className="block text-[11px] text-amber-700 dark:text-amber-300">cost unknown on {r.uncosted} line{r.uncosted === 1 ? '' : 's'}</span>}</td>
            <td className={tdNum}>{kind === 'item' ? `${num(r.qty || 0)} ${r.unit || ''}` : r.bills}</td>
            <td className={tdNum}>{money(r.sales)}</td>
            <td className={tdNum}>{money(r.cost)}</td>
            <td className={`${tdNum} font-bold ${r.profit < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-teal-700 dark:text-teal-300'}`}>{money(r.profit)}</td>
            <td className={tdNum}>{r.marginPct == null ? '—' : `${r.marginPct}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ProfitView: React.FC = () => {
  const { invoices, returns, purchases, products, customers, setPrintRequest } = useTrading();
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [view, setView] = useState<ProfitBy>('item');
  const report = useMemo(() => profitFromBills({ invoices, returns, purchases, products, customers }, from, to), [invoices, returns, purchases, products, customers, from, to]);
  // Group / brand: the item rows rolled up, so the totals are the same as by item.
  const rows = view === 'item' ? report.byItem : view === 'customer' ? report.byCustomer : profitByAttribute(report.byItem, products, view);
  const by = PROFIT_BY.find((x) => x.id === view)!;
  const exportCsv = () =>
    downloadCsvFile(`sarmaya-profit-by-${view}-${from}-to-${to}.csv`, [by.col, by.count, 'Unit', 'Sales', 'Cost', 'Profit', 'Margin %'], rows.map((r) => [r.name, view === 'item' ? r.qty || 0 : r.bills || 0, view === 'item' ? r.unit || '' : '', r.sales, r.cost, r.profit, r.marginPct ?? '']));
  return (
    <div className="space-y-4" data-testid="profit-report">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className={labelCls} htmlFor="pf-from">From</label><input id="pf-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${inputCls} w-auto`} /></div>
        <div><label className={labelCls} htmlFor="pf-to">To</label><input id="pf-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${inputCls} w-auto`} /></div>
        <div className="flex gap-2 ml-auto">
          <button type="button" onClick={exportCsv} className={secondaryBtn}><Download className="w-4 h-4" /> CSV</button>
          <button type="button" onClick={() => setPrintRequest({ type: 'billing_report', report: 'profit', from, to })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print</button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile label="Sales" value={rs(report.totals.sales)} hint={`${report.totals.bills} bill${report.totals.bills === 1 ? '' : 's'}`} />
        <Tile label="Cost of items sold" value={rs(report.totals.cost)} />
        <Tile label="Profit" value={rs(report.totals.profit)} tone={report.totals.profit < 0 ? 'bad' : 'good'} />
        <Tile label="Margin" value={report.totals.marginPct == null ? '—' : `${report.totals.marginPct}%`} />
      </div>
      {report.totals.uncosted > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{report.totals.uncosted} bill line{report.totals.uncosted === 1 ? ' has' : 's have'} no cost (the item was never received with a cost). Profit on those is shown in full; set a cost price on the item to fix it.</p>}
      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Sales are bill lines less any bill discount (tax and delivery charges are left out). Cost is what the stock cost when it was sold — the same figure your accounts use. Goods customers returned come off both.</p>
      <div role="tablist" aria-label="Profit by" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {PROFIT_BY.map((x) => <button key={x.id} type="button" role="tab" aria-selected={view === x.id} onClick={() => setView(x.id)} className={chip(view === x.id)}>{x.label}</button>)}
      </div>
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? <p className="p-8 text-center text-sm text-[#8E9299]">No bills in these dates.</p> : <ProfitTable rows={rows} kind={view} testId={`profit-by-${view}`} />}
      </div>
    </div>
  );
};
