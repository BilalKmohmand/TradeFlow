import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Printer, Search, Lock, Truck } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI, ReportRequest, useCurrentView } from '../../components/billing/BillingUI';
import { PageHeader, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, pillCls, Notice } from '../../components/billing/ui';
import { CsvButton } from '../../components/billing/CsvButton';
import { ScreenReport } from '../../components/billing/classic/ReportTables';
import { useClassicNav } from '../../components/billing/classic/ClassicMenu';
import { useReportData } from '../../hooks/useReportData';
import { BOOKS_MENU, MenuEntry, REPORTS_MENU, isSubmenu, resolveTarget } from '../../utils/classicMenu';
import { REPORTS, ReportDef, ReportFilter, ReportId, ReportRow, bookBalances, defaultFilter, reportCsv } from '../../utils/classicReports';
import { todayISO } from '../../utils/stockFlow';
import { financialYearOf, fyStartOf } from '../../utils/financeBooks';
import { PartyPick, customerParties, supplierParties } from '../../components/billing/PartyPick';
import { fromClassicTarget, targetAllowed } from '../../utils/navMap';

/** Who may open a report: the books and cost / profit figures need finance access. */
const useReportAllowed = () => {
  const { can } = useTrading();
  const finance = can('view_finance');
  return (def: Pick<ReportDef, 'books' | 'finance'>) => (def.books || def.finance ? finance : true);
};

/** One report: its filters, print, CSV and the table(s). */
const ReportView: React.FC<{ id: ReportId; onBack: () => void; backLabel: string }> = ({ id, onBack, backLabel }) => {
  const def = REPORTS[id];
  const { settings, customers, suppliers, products, godowns, setPrintRequest, invoices } = useTrading();
  const ui = useBillingUI();
  const today = todayISO();
  const [filter, setFilter] = useState<ReportFilter>(() => defaultFilter(def, today, settings));
  const data = useReportData(Boolean(def.books));
  const set = (patch: Partial<ReportFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const missing = def.requires === 'product' && !filter.productId;
  const report = useMemo(() => def.build(data, { ...filter, today }), [def, data, filter, today]);
  const banks = useMemo(() => (def.filters?.includes('bank') ? bookBalances(data.journal, data.accounts, today).filter((b) => b.code !== '1000') : []), [def, data, today]);
  const fy = financialYearOf(today, fyStartOf(settings));
  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  // Pending delivery list: mark delivered / print the challan from the row.
  const rowAction =
    id === 'pending-delivery'
      ? (row: ReportRow) => {
          const inv = row.billId ? invoices.find((i) => i.id === row.billId) : undefined;
          if (!inv?.delivery) return null;
          return inv.delivery.status === 'pending' ? (
            <button type="button" onClick={() => ui.markDelivered(inv.id)} className="inline-flex items-center gap-1 min-h-9 px-2.5 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40" aria-label={`Mark ${inv.invoiceNumber} delivered`}>
              <Truck className="w-3.5 h-3.5" /> Mark delivered
            </button>
          ) : (
            <button type="button" onClick={() => setPrintRequest({ type: 'bill_challan', invoiceId: inv.id, driver: inv.delivery!.deliveredBy, vehicle: inv.delivery!.vehicle })} className="inline-flex items-center gap-1 min-h-9 px-2.5 rounded-xl text-xs font-bold text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40]" aria-label={`Print challan ${inv.invoiceNumber}`}>
              <Printer className="w-3.5 h-3.5" /> Challan
            </button>
          );
        }
      : undefined;

  return (
    <div className="space-y-4" data-testid={`report-${id}`}>
      <PageHeader title={def.title} subtitle={def.help}>
        <button type="button" onClick={onBack} className={secondaryBtn}><ArrowLeft className="w-4 h-4" /> {backLabel}</button>
        <CsvButton fileName={`${id}-${filter.from}-${filter.to}.csv`} table={() => reportCsv(report)} disabled={missing} />
        <button type="button" onClick={() => setPrintRequest({ type: 'classic_report', report: id, filter: { ...filter, today } })} disabled={missing} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Print</button>
      </PageHeader>

      <div className={`${cardCls} p-3 sm:p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          {def.dateMode === 'range' && (
            <>
              <div className="w-[calc(50%-0.4rem)] sm:w-40">
                <label className={labelCls} htmlFor="rep-from">From</label>
                <input id="rep-from" type="date" value={filter.from} max={filter.to} onChange={(e) => set({ from: e.target.value })} className={inputCls} />
              </div>
              <div className="w-[calc(50%-0.4rem)] sm:w-40">
                <label className={labelCls} htmlFor="rep-to">To</label>
                <input id="rep-to" type="date" value={filter.to} min={filter.from} onChange={(e) => set({ to: e.target.value })} className={inputCls} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => set({ from: today, to: today })} className={pillCls(filter.from === today && filter.to === today)}>Today</button>
                <button type="button" onClick={() => set({ from: `${today.slice(0, 7)}-01`, to: today })} className={pillCls(filter.from === `${today.slice(0, 7)}-01` && filter.to === today)}>This month</button>
                <button type="button" onClick={() => set({ from: fy.start, to: today })} className={pillCls(filter.from === fy.start && filter.to === today)}>{fy.label}</button>
              </div>
            </>
          )}
          {(def.dateMode === 'asOf' || def.dateMode === 'day') && (
            <div className="w-full sm:w-44">
              <label className={labelCls} htmlFor={def.dateMode === 'day' ? 'rep-day' : 'rep-asof'}>{def.dateMode === 'day' ? 'Date' : 'As at'}</label>
              <input id={def.dateMode === 'day' ? 'rep-day' : 'rep-asof'} type="date" value={filter.asOf} max={today} onChange={(e) => set({ asOf: e.target.value })} className={inputCls} />
            </div>
          )}
          {def.filters?.includes('customer') && (
            <div className="w-full sm:w-80">
              <PartyPick id="rep-customer" label="Customer" parties={customerParties(sortedCustomers)} value={filter.customerId || ''} onPick={(id) => set({ customerId: id || undefined })} placeholder="All customers" />
            </div>
          )}
          {def.filters?.includes('supplier') && (
            <div className="w-full sm:w-80">
              <PartyPick id="rep-supplier" label="Supplier" parties={supplierParties(suppliers)} value={filter.supplierId || ''} onPick={(id) => set({ supplierId: id || undefined })} placeholder="All suppliers" balanceWord="you owe" />
            </div>
          )}
          {def.filters?.includes('product') && (
            <div className="w-full sm:w-64">
              <label className={labelCls} htmlFor="rep-product">Product</label>
              <select id="rep-product" value={filter.productId || ''} onChange={(e) => set({ productId: e.target.value || undefined })} className={inputCls}>
                <option value="">{def.requires === 'product' ? 'Pick a product…' : 'All products'}</option>
                {sortedProducts.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} • ` : ''}{p.name}</option>)}
              </select>
            </div>
          )}
          {def.filters?.includes('godown') && godowns.length > 1 && (
            <div className="w-full sm:w-48">
              <label className={labelCls} htmlFor="rep-godown">Store / godown</label>
              <select id="rep-godown" value={filter.godownId || ''} onChange={(e) => set({ godownId: e.target.value || undefined })} className={inputCls}>
                <option value="">All godowns</option>
                {godowns.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          {def.filters?.includes('bank') && (
            <div className="w-full sm:w-56">
              <label className={labelCls} htmlFor="rep-bank">Bank</label>
              <select id="rep-bank" value={filter.accountCode || '1010'} onChange={(e) => set({ accountCode: e.target.value })} className={inputCls}>
                {(banks.length ? banks : [{ code: '1010', name: 'Bank', balance: 0 }]).map((b) => <option key={b.code} value={b.code}>{b.code} {b.name}</option>)}
              </select>
            </div>
          )}
          {def.filters?.includes('status') && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Delivery status">
              {(['pending', 'delivered', 'all'] as const).map((st) => (
                <button key={st} type="button" aria-pressed={(filter.status || 'pending') === st} onClick={() => set({ status: st })} className={pillCls((filter.status || 'pending') === st, 'teal')}>{st === 'pending' ? 'Pending' : st === 'delivered' ? 'Delivered' : 'All'}</button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-[#6B7280] dark:text-[#94A3B8]" data-testid="report-period">{report.period}</p>
      </div>

      {missing ? <div className={`${cardCls} px-4 py-6 text-sm text-center text-[#6B7280] dark:text-[#94A3B8]`}>Pick a product to see its stock ledger.</div> : <ScreenReport report={report} onOpenBill={ui.openBill} rowAction={rowAction} />}
    </div>
  );
};

/** One menu line: the old name, a key hint, and a lock when the user may not open it. */
const EntryButton: React.FC<{ entry: MenuEntry; onGo: (e: MenuEntry) => void; indent?: boolean }> = ({ entry, onGo, indent }) => {
  const allowed = useReportAllowed();
  const { can } = useTrading();
  const t = resolveTarget(entry.target);
  // Reports need finance access for the books / profit; links to screens (Chart of Accounts, Account Ledger…)
  // follow the same rules as the menus.
  const locked = t.kind === 'report' ? !allowed(REPORTS[t.report]) : !targetAllowed(fromClassicTarget(entry.target), { can });
  return (
    <button type="button" onClick={() => onGo(entry)} disabled={locked} title={locked ? 'Needs finance access' : undefined} className={`group w-full flex items-center gap-2 min-h-11 px-3 rounded-xl text-sm text-left font-semibold text-[#111827] dark:text-white hover:bg-[#F4F3EF] dark:hover:bg-[#162436] disabled:opacity-45 disabled:pointer-events-none ${indent ? 'pl-7' : ''}`}>
      <span className="flex-1 min-w-0">{entry.label}</span>
      {entry.key && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]">{entry.key}</span>}
      {locked ? <Lock className="w-3.5 h-3.5 text-[#9CA3AF]" /> : <ChevronRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#111827] dark:group-hover:text-white" />}
    </button>
  );
};

/**
 * Reports, laid out like Apna Accountant's Reports menu: Accounts Reports, Inventory Reports (with
 * Party / Product / Stock sub-menus) and Pending Delivery. The "Books" button opens the books part.
 */
export const ReportsHubScreen: React.FC = () => {
  const ui = useBillingUI();
  const go = useClassicNav();
  const [view, setView] = useState<ReportRequest>(() => ui.reportRequest?.id || 'menu');
  const [from, setFrom] = useState<'menu' | 'books'>(() => (ui.reportRequest?.id === 'books' ? 'books' : 'menu'));
  const [q, setQ] = useState('');
  const allowed = useReportAllowed();
  useCurrentView('reports-hub', view);
  // A new request (a menu button, F9…) while the hub is already open switches to it.
  const n = ui.reportRequest?.n;
  useEffect(() => {
    if (!ui.reportRequest) return;
    setView(ui.reportRequest.id);
    if (ui.reportRequest.id === 'books' || ui.reportRequest.id === 'menu') setFrom(ui.reportRequest.id);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (e: MenuEntry) => {
    const t = resolveTarget(e.target);
    if (t.kind === 'report') {
      setFrom(view === 'books' ? 'books' : 'menu');
      setView(t.report);
      try { window.scrollTo({ top: 0 }); } catch { /* not in a browser */ }
    } else go(e.target);
  };

  if (view !== 'menu' && view !== 'books') {
    const def = REPORTS[view];
    if (!allowed(def)) {
      return (
        <div className="space-y-4">
          <PageHeader title={def.title}><button type="button" onClick={() => setView(from)} className={secondaryBtn}><ArrowLeft className="w-4 h-4" /> Back</button></PageHeader>
          <Notice kind="error">This report shows the books or profit figures. Ask a manager or admin for finance access.</Notice>
        </div>
      );
    }
    return <ReportView key={view} id={view} onBack={() => setView(from)} backLabel={from === 'books' ? 'Books' : 'Reports'} />;
  }

  if (view === 'books') {
    return (
      <div className="space-y-5" data-testid="books-menu">
        <PageHeader title="Books" subtitle="Cash book, bank book, day book, journal book and book balances.">
          <button type="button" onClick={() => setView('menu')} className={secondaryBtn}>All reports</button>
        </PageHeader>
        <div className={`${cardCls} p-2 max-w-xl`}>
          {BOOKS_MENU.map((e) => <EntryButton key={e.label} entry={e} onGo={open} />)}
        </div>
      </div>
    );
  }

  const query = q.trim().toLowerCase();
  const match = (label: string) => !query || label.toLowerCase().includes(query);
  return (
    <div className="space-y-5" data-testid="reports-menu">
      <PageHeader title="Reports" subtitle="The same menu as Apna Accountant. Every report has dates, Print and CSV.">
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input aria-label="Find a report" value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} pl-9`} placeholder="Find a report…" />
        </div>
      </PageHeader>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {REPORTS_MENU.map((section) => {
          const items = section.items
            .map((it) => (isSubmenu(it) ? { ...it, entries: it.entries.filter((e) => match(e.label) || match(it.label)) } : it))
            .filter((it) => (isSubmenu(it) ? it.entries.length > 0 : match(it.label)));
          if (items.length === 0) return null;
          return (
            <section key={section.label} className={`${cardCls} p-2`} aria-label={section.label}>
              <h2 className="px-3 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">{section.label}</h2>
              {items.map((it) =>
                isSubmenu(it) ? (
                  <div key={it.label} className="mt-1">
                    <div className="px-3 py-1.5 text-sm font-bold text-[#374151] dark:text-[#CBD5E1]">{it.label} ›</div>
                    {it.entries.map((e) => <EntryButton key={e.label} entry={e} onGo={open} indent />)}
                  </div>
                ) : (
                  <EntryButton key={it.label} entry={it} onGo={open} />
                )
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
