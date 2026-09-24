import React, { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI, useCurrentView, useRequestedView } from '../../components/billing/BillingUI';
import { Notice, PageHeader, cardCls, inputCls, labelCls, pillCls, primaryBtn, rs, secondaryBtn, RowAction } from '../../components/billing/ui';
import { CodingListKind, CODING_LIST_NAME, drCrOf, itemsUsing, openingByStore, openingRows, openingTotals } from '../../utils/coding';
import { openingStockQty } from '../../utils/accounting';
import { withMainGodown } from '../../utils/inventory';
import { matcher } from '../../utils/search';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';

/** The Coding screen's own tabs (the other Coding options open their existing screens / dialogs). */
export const CODING_TABS = ['opening-balances', 'units', 'groups', 'manufacturers', 'opening-stock'] as const;
export type CodingTab = (typeof CODING_TABS)[number];
export const CODING_TAB_NAMES: Record<CodingTab, string> = {
  'opening-balances': 'Accounts Opening Balances',
  units: 'Product Unit Coding',
  groups: 'Product Group Coding',
  manufacturers: 'Manufacturer Coding',
  'opening-stock': 'Opening Stocks',
};
const HELP: Record<CodingTab, string> = {
  'opening-balances': 'Opening (old books) balance of cash, every bank, customer and supplier. The difference goes to Opening balance equity (3900), so the books stay balanced.',
  units: 'Units items are sold in (tin, can, ctn…). They are offered when adding or changing an item.',
  groups: 'Product groups (Ghee, Cooking oil…). Reports can be totalled by group.',
  manufacturers: 'Brands / manufacturers of the items (Dalda, Habib…).',
  'opening-stock': 'Stock of each item on the first day of the books, per store, and its rate. Posts Dr Inventory / Cr Opening balance equity at that rate.',
};
const KIND_OF: Record<'units' | 'groups' | 'manufacturers', CodingListKind> = { units: 'unit', groups: 'group', manufacturers: 'manufacturer' };

type Flash = (r: { success: boolean; message: string }) => void;

/** Coding: Apna Accountant's Coding-menu screens that had no home in the app yet. */
export const CodingScreen: React.FC = () => {
  const ui = useBillingUI();
  const [tab, setTab] = useState<CodingTab>(() => { const v = ui.peekView('coding'); return (CODING_TABS as readonly string[]).includes(v || '') ? (v as CodingTab) : 'opening-balances'; });
  useRequestedView('coding', (v) => { if ((CODING_TABS as readonly string[]).includes(v)) setTab(v as CodingTab); });
  useCurrentView('coding', tab);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const flash: Flash = (r) => setNotice({ kind: r.success ? 'ok' : 'error', text: r.message });
  const pick = (t: CodingTab) => { setTab(t); setNotice(null); };
  return (
    <div className="space-y-5">
      <PageHeader title="Coding" subtitle="Masters and opening figures, as in the old program's Coding menu." />
      <div role="tablist" aria-label="Coding views" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {CODING_TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => pick(t)} className={pillCls(tab === t)}>{CODING_TAB_NAMES[t]}</button>)}
      </div>
      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] -mt-2">{HELP[tab]}</p>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {tab === 'opening-balances' && <OpeningBalancesTab flash={flash} />}
      {(tab === 'units' || tab === 'groups' || tab === 'manufacturers') && <CodingListTab key={tab} kind={KIND_OF[tab]} flash={flash} />}
      {tab === 'opening-stock' && <OpeningStockTab flash={flash} />}
    </div>
  );
};

/** Enter moves down the same column (the old grids' keyboard). */
const moveDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const el = e.currentTarget;
  const row = Number(el.dataset.row);
  const col = el.dataset.col;
  const next = el.closest('table')?.querySelector<HTMLInputElement>(`input[data-row="${row + 1}"][data-col="${col}"]`);
  (next || el).focus();
  next?.select();
};

// ---------------------------------------------------------------------------------------------------------
// Product Unit / Product Group / Manufacturer Coding
// ---------------------------------------------------------------------------------------------------------
const CodingListTab: React.FC<{ kind: CodingListKind; flash: Flash }> = ({ kind, flash }) => {
  const { productUnits, productGroups, manufacturers, products, addCodingItem, renameCodingItem, removeCodingItem, can } = useTrading();
  const list = kind === 'unit' ? productUnits : kind === 'group' ? productGroups : manufacturers;
  const n = CODING_LIST_NAME[kind];
  const canEdit = can('products:create');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);
  const title = n.one.replace(/^./, (c) => c.toUpperCase());
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const r = addCodingItem(kind, name);
    flash(r);
    if (r.success) setName('');
  };
  const rename = () => {
    if (!editing) return;
    const r = renameCodingItem(kind, editing.from, editing.to);
    flash(r);
    if (r.success) setEditing(null);
  };
  return (
    <div className={`${cardCls} p-4 space-y-3`} data-testid={`coding-list-${kind}`}>
      {canEdit && (
        <form onSubmit={add} className="flex gap-2 items-end" aria-label={`Add ${n.one}`}>
          <div className="flex-1 min-w-0">
            <label className={labelCls} htmlFor={`coding-new-${kind}`}>New {n.one}</label>
            <input id={`coding-new-${kind}`} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder={kind === 'unit' ? 'e.g. ctn' : kind === 'group' ? 'e.g. Banaspati' : 'e.g. Dalda'} autoComplete="off" />
          </div>
          <button type="submit" className={primaryBtn}><Plus className="w-4 h-4" /> Add</button>
        </form>
      )}
      <table className="w-full text-sm" aria-label={`${title} list`}>
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280]"><th className="py-1.5 pr-2 w-12">#</th><th className="py-1.5 pr-2">{title}</th><th className="py-1.5 pr-2 text-right">Items</th><th className="w-24" /></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={4} className="py-3 text-[#8E9299]">No {n.many} yet.</td></tr>}
          {list.map((v, i) => {
            const used = itemsUsing(kind, products, v).length;
            const isEd = editing?.from === v;
            return (
              <tr key={v} className="border-t border-[#F1F0EC] dark:border-[#1E2E40]" data-testid="coding-row">
                <td className="py-1.5 pr-2 tabular-nums text-xs text-[#8E9299]">{i + 1}</td>
                <td className="py-1.5 pr-2 font-semibold text-[#111827] dark:text-white">
                  {isEd ? (
                    <input aria-label={`New name for ${v}`} autoFocus value={editing!.to} onChange={(e) => setEditing({ from: v, to: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rename(); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} className={`${inputCls} !py-1.5`} />
                  ) : v}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-xs text-[#6B7280]">{used || ''}</td>
                <td className="py-1 text-right whitespace-nowrap">
                  {canEdit && (isEd ? (
                    <>
                      <RowAction label={`Save ${v}`} icon={<Check className="w-4 h-4" />} onClick={rename} tone="teal" />
                      <RowAction label="Stop renaming" icon={<X className="w-4 h-4" />} onClick={() => setEditing(null)} />
                    </>
                  ) : (
                    <>
                      <RowAction label={`Rename ${v}`} icon={<Pencil className="w-4 h-4" />} onClick={() => setEditing({ from: v, to: v })} />
                      <RowAction label={`Remove ${v}`} icon={<Trash2 className="w-4 h-4" />} tone="danger" onClick={() => flash(removeCodingItem(kind, v))} />
                    </>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Accounts Opening Balances
// ---------------------------------------------------------------------------------------------------------
const num = (s: string) => Math.round((parseFloat(String(s).replace(/,/g, '')) || 0) * 100) / 100;

const OpeningBalancesTab: React.FC<{ flash: Flash }> = ({ flash }) => {
  const { settings, bankAccounts, customers, suppliers, ledger, saveAccountOpenings, can } = useTrading();
  const rows = useMemo(() => openingRows({ settings, banks: bankAccounts, customers, suppliers, ledger }), [settings, bankAccounts, customers, suppliers, ledger]);
  const [edits, setEdits] = useState<Record<string, { debit: string; credit: string }>>({});
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'Cash' | 'Bank' | 'Customer' | 'Supplier'>('all');
  const [date, setDate] = useState(settings.cashOpeningDate || todayISO());
  const [limit, setLimit] = useState(200);
  const canSee = can('view_finance');
  const canEdit = canSee && can('data:write');
  if (!canSee) return <Notice kind="error">Opening balances are for a manager or accountant.</Notice>;

  const valueOf = (ref: string, amount: number) => edits[ref] || { debit: drCrOf(amount).debit ? String(drCrOf(amount).debit) : '', credit: drCrOf(amount).credit ? String(drCrOf(amount).credit) : '' };
  const amountOf = (ref: string, amount: number) => { const e = edits[ref]; return e ? Math.round((num(e.debit) - num(e.credit)) * 100) / 100 : amount; };
  const changed = rows.filter((r) => edits[r.ref] && amountOf(r.ref, r.amount) !== r.amount);
  const all = rows.map((r) => ({ amount: amountOf(r.ref, r.amount) }));
  const t = openingTotals(all);
  const m = matcher(q);
  const shown = rows.filter((r) => (kind === 'all' || r.kind === kind) && m([r.code, r.title, r.city, r.kind]));
  const set = (ref: string, amount: number, side: 'debit' | 'credit', v: string) =>
    setEdits((prev) => { const cur = prev[ref] || valueOf(ref, amount); return { ...prev, [ref]: side === 'debit' ? { debit: v, credit: v ? '' : cur.credit } : { credit: v, debit: v ? '' : cur.debit } }; });
  const save = () => {
    const r = saveAccountOpenings(changed.map((x) => ({ ref: x.ref, amount: amountOf(x.ref, x.amount) })), date);
    flash(r);
    if (r.success) setEdits({});
  };
  return (
    <div className="space-y-3" data-testid="opening-balances">
      <div className={`${cardCls} p-4 grid grid-cols-2 sm:grid-cols-4 gap-3`}>
        <div className="min-w-0 col-span-2">
          <label className={labelCls} htmlFor="ob-search">Search</label>
          <input id="ob-search" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} placeholder="Code, title or city" />
        </div>
        <div className="min-w-0">
          <label className={labelCls} htmlFor="ob-kind">Accounts</label>
          <select id="ob-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputCls}>
            <option value="all">All</option><option value="Cash">Cash</option><option value="Bank">Banks</option><option value="Customer">Customers</option><option value="Supplier">Suppliers</option>
          </select>
        </div>
        <div className="min-w-0">
          <label className={labelCls} htmlFor="ob-date">Opening date</label>
          <input id="ob-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} disabled={!canEdit} />
        </div>
      </div>
      <div className={`${cardCls} overflow-x-auto`}>
        <table className="w-full min-w-[560px] text-sm" aria-label="Opening balances">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280] bg-[#FAF9F6] dark:bg-[#162436]">
              <th className="px-3 py-2 w-28">Code</th><th className="px-3 py-2">Title</th><th className="px-3 py-2 text-right w-40">Debit opening</th><th className="px-3 py-2 text-right w-40">Credit opening</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((r, i) => {
              const v = valueOf(r.ref, r.amount);
              const dirty = changed.some((c) => c.ref === r.ref);
              return (
                <tr key={r.ref} className={`border-t border-[#F1F0EC] dark:border-[#1E2E40] ${dirty ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}`} data-testid="opening-row">
                  <td className="px-3 py-1.5 tabular-nums text-xs text-[#6B7280]">{r.code || '—'}</td>
                  <td className="px-3 py-1.5"><span className="font-semibold text-[#111827] dark:text-white">{r.title}</span><span className="text-[11px] text-[#8E9299]"> • {r.kind}{r.city ? ` • ${r.city}` : ''}</span></td>
                  <td className="px-2 py-1"><input aria-label={`${r.title} debit opening`} data-row={i} data-col="d" type="number" inputMode="decimal" min="0" step="any" value={v.debit} disabled={!canEdit} onChange={(e) => set(r.ref, r.amount, 'debit', e.target.value)} onKeyDown={moveDown} className={`${inputCls} !py-1.5 text-right tabular-nums`} /></td>
                  <td className="px-2 py-1"><input aria-label={`${r.title} credit opening`} data-row={i} data-col="c" type="number" inputMode="decimal" min="0" step="any" value={v.credit} disabled={!canEdit} onChange={(e) => set(r.ref, r.amount, 'credit', e.target.value)} onKeyDown={moveDown} className={`${inputCls} !py-1.5 text-right tabular-nums`} /></td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-[#8E9299]">No accounts match.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#E5E5E1] dark:border-[#203248] font-bold">
              <td className="px-3 py-2" colSpan={2}>Totals</td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="opening-total-debit">{rs(t.debit)}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="opening-total-credit">{rs(t.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {shown.length > limit && <button type="button" onClick={() => setLimit((n) => n + 300)} className={`${secondaryBtn} w-full`}>Show more ({shown.length - limit} left)</button>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]" data-testid="opening-equity">Opening balance equity (3900): {t.equity >= 0 ? 'Cr' : 'Dr'} {rs(Math.abs(t.equity))}{changed.length ? ` • ${changed.length} changed` : ''}</p>
        {canEdit && <button type="button" onClick={save} disabled={changed.length === 0} className={primaryBtn}><Save className="w-4 h-4" /> Save opening balances</button>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Opening Stocks
// ---------------------------------------------------------------------------------------------------------
const OpeningStockTab: React.FC<{ flash: Flash }> = ({ flash }) => {
  const { products, godowns, settings, ledger, expenses, cashEntries, adjustments, purchases, invoices, dispatches, returns, setOpeningStock, can } = useTrading();
  const stores = useMemo(() => withMainGodown(godowns), [godowns]);
  const [store, setStore] = useState(stores[0].id);
  const [q, setQ] = useState('');
  const [edits, setEdits] = useState<Record<string, { qty: string; rate: string }>>({});
  const canEdit = can('stock:adjust');
  const opening = useMemo(() => openingStockQty({ settings, ledger, expenses, cashEntries, adjustments, purchases, products, invoices, dispatches, returns }), [settings, ledger, expenses, cashEntries, adjustments, purchases, products, invoices, dispatches, returns]);
  const rows = useMemo(
    () => [...products].sort((a, b) => (a.code || '~').localeCompare(b.code || '~', undefined, { numeric: true }) || a.name.localeCompare(b.name)).map((p) => ({ p, qty: openingByStore(p, opening.qty.get(p.id) || 0, godowns)[store] || 0, rate: p.costPricePerKg || 0 })),
    [products, opening, godowns, store]
  );
  const m = matcher(q);
  const shown = rows.filter((r) => m([r.p.code, r.p.name, r.p.category, r.p.brand]));
  const valueOf = (id: string, qty: number, rate: number) => edits[id] || { qty: String(qty), rate: rate ? String(rate) : '' };
  const cur = (id: string, qty: number, rate: number) => { const v = valueOf(id, qty, rate); return { qty: num(v.qty), rate: num(v.rate) }; };
  const changed = rows.filter((r) => { const c = cur(r.p.id, r.qty, r.rate); return edits[r.p.id] && (c.qty !== r.qty || (c.rate > 0 && c.rate !== r.rate)); });
  const total = rows.reduce((a, r) => { const c = cur(r.p.id, r.qty, r.rate); return a + c.qty * c.rate; }, 0);
  const set = (id: string, qty: number, rate: number, k: 'qty' | 'rate', v: string) => setEdits((prev) => ({ ...prev, [id]: { ...valueOf(id, qty, rate), [k]: v } }));
  const save = () => {
    let saved = 0;
    for (const r of changed) {
      const c = cur(r.p.id, r.qty, r.rate);
      const res = setOpeningStock({ productId: r.p.id, godownId: store, qty: c.qty, ...(c.rate > 0 ? { rate: c.rate } : {}) });
      if (!res.success) {
        flash({ success: false, message: `${saved ? `${saved} saved, but ` : ''}${res.message}` });
        setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !changed.slice(0, saved).some((x) => x.p.id === id))));
        return;
      }
      saved += 1;
    }
    setEdits({});
    flash({ success: true, message: `Opening stock saved (${saved} item${saved === 1 ? '' : 's'}).` });
  };
  return (
    <div className="space-y-3" data-testid="opening-stock">
      <div className={`${cardCls} p-4 grid grid-cols-2 sm:grid-cols-4 gap-3`}>
        <div className="min-w-0 col-span-2">
          <label className={labelCls} htmlFor="os-search">Search</label>
          <input id="os-search" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} placeholder="Item code, name, group" />
        </div>
        <div className="min-w-0">
          <label className={labelCls} htmlFor="os-store">Store</label>
          <select id="os-store" value={store} onChange={(e) => { setStore(e.target.value); setEdits({}); }} className={inputCls}>{stores.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        </div>
        <div className="min-w-0">
          <span className={labelCls}>As on</span>
          <div className={`${inputCls} !bg-[#F4F3EF] dark:!bg-[#0D1520] tabular-nums`} data-testid="opening-stock-date">{opening.date ? formatDate(opening.date) : '—'}</div>
        </div>
      </div>
      <div className={`${cardCls} overflow-x-auto`}>
        <table className="w-full min-w-[620px] text-sm" aria-label="Opening stocks">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280] bg-[#FAF9F6] dark:bg-[#162436]">
              <th className="px-3 py-2 w-24">Code</th><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right w-32">Opening qty</th><th className="px-3 py-2 text-right w-32">Rate</th><th className="px-3 py-2 text-right w-32">Value</th><th className="px-3 py-2 text-right w-28">Stock now</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const v = valueOf(r.p.id, r.qty, r.rate);
              const c = cur(r.p.id, r.qty, r.rate);
              const dirty = changed.some((x) => x.p.id === r.p.id);
              return (
                <tr key={r.p.id} className={`border-t border-[#F1F0EC] dark:border-[#1E2E40] ${dirty ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}`} data-testid="opening-stock-row">
                  <td className="px-3 py-1.5 tabular-nums text-xs text-[#6B7280]">{r.p.code || '—'}</td>
                  <td className="px-3 py-1.5"><span className="font-semibold text-[#111827] dark:text-white">{r.p.name}</span><span className="text-[11px] text-[#8E9299]"> • {r.p.unit || 'pcs'}</span></td>
                  <td className="px-2 py-1"><input aria-label={`${r.p.name} opening qty`} data-row={i} data-col="q" type="number" inputMode="decimal" min="0" step="any" value={v.qty} disabled={!canEdit} onChange={(e) => set(r.p.id, r.qty, r.rate, 'qty', e.target.value)} onKeyDown={moveDown} className={`${inputCls} !py-1.5 text-right tabular-nums`} /></td>
                  <td className="px-2 py-1"><input aria-label={`${r.p.name} rate`} data-row={i} data-col="r" type="number" inputMode="decimal" min="0" step="any" value={v.rate} disabled={!canEdit} onChange={(e) => set(r.p.id, r.qty, r.rate, 'rate', e.target.value)} onKeyDown={moveDown} className={`${inputCls} !py-1.5 text-right tabular-nums`} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{rs(c.qty * c.rate)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-xs text-[#6B7280]">{r.p.stockKg}</td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-[#8E9299]">No items{q ? ' match' : ' yet'}.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#E5E5E1] dark:border-[#203248] font-bold">
              <td className="px-3 py-2" colSpan={4}>Total opening stock{stores.length > 1 ? ` (${stores.find((g) => g.id === store)?.name})` : ''}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="opening-stock-total">{rs(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {canEdit ? (
        <div className="flex justify-end"><button type="button" onClick={save} disabled={changed.length === 0} className={primaryBtn}><Save className="w-4 h-4" /> Save opening stock</button></div>
      ) : (
        <p className="text-xs text-[#6B7280]">Only staff who may adjust stock can change opening stock.</p>
      )}
    </div>
  );
};
