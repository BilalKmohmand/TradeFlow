import React, { useMemo, useState } from 'react';
import { Gift, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Notice, EmptyState, inputCls, labelCls, primaryBtn, secondaryBtn, RowAction } from './ui';
import { Scheme, SchemeKind, SchemeSlab } from '../../types';
import { schemeRule } from '../../utils/salesExtras';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';

const KINDS: { id: SchemeKind; label: string; help: string }[] = [
  { id: 'free_every', label: 'Buy N get M free', help: 'Every N bought gives M free (buy 10 get 1: 20 bought → 2 free).' },
  { id: 'free_slab', label: 'Slabs', help: 'The highest slab reached gives its free quantity once (50+ → 3 free, 100+ → 7 free).' },
  { id: 'pct_off', label: '% off above a quantity', help: 'Buying at least this many takes a % off those lines.' },
];

interface Form {
  id: string;
  name: string;
  productId: string;
  kind: SchemeKind;
  buyQty: string;
  freeQty: string;
  slabs: { minQty: string; freeQty: string }[];
  minQty: string;
  pctOff: string;
  freeProductId: string;
  fromDate: string;
  toDate: string;
  customerIds: string[];
  active: boolean;
}

const emptyForm = (): Form => ({ id: '', name: '', productId: '', kind: 'free_every', buyQty: '', freeQty: '', slabs: [{ minQty: '', freeQty: '' }], minQty: '', pctOff: '', freeProductId: '', fromDate: '', toDate: '', customerIds: [], active: true });

const toForm = (s: Scheme): Form => ({
  id: s.id,
  name: s.name,
  productId: s.productId,
  kind: s.kind,
  buyQty: s.buyQty ? String(s.buyQty) : '',
  freeQty: s.freeQty ? String(s.freeQty) : '',
  slabs: s.slabs?.length ? s.slabs.map((x) => ({ minQty: String(x.minQty), freeQty: String(x.freeQty) })) : [{ minQty: '', freeQty: '' }],
  minQty: s.minQty ? String(s.minQty) : '',
  pctOff: s.pctOff ? String(s.pctOff) : '',
  freeProductId: s.freeProductId || '',
  fromDate: s.fromDate || '',
  toDate: s.toDate || '',
  customerIds: s.customerIds || [],
  active: s.active,
});

/** Trade schemes per item: free goods (bonus qty) or % off. New Bill applies them on its own. */
export const SchemesModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { schemes, products, customers, saveScheme, deleteScheme, can } = useTrading();
  const canEdit = can('edit_prices') || can('products:edit_prices');
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [custPick, setCustPick] = useState('');
  const today = todayISO();
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name)), [customers]);
  const productName = (id?: string | null) => products.find((p) => p.id === id)?.name || 'Removed item';
  const unitOf = (id?: string | null) => products.find((p) => p.id === id)?.unit || '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const n = (v: string) => (v === '' ? undefined : Number(v));
    const r = saveScheme({
      id: form.id || undefined,
      name: form.name,
      productId: form.productId,
      kind: form.kind,
      buyQty: n(form.buyQty),
      freeQty: n(form.freeQty),
      slabs: form.slabs.map((x) => ({ minQty: Number(x.minQty) || 0, freeQty: Number(x.freeQty) || 0 })).filter((x: SchemeSlab) => x.minQty > 0 || x.freeQty > 0),
      minQty: n(form.minQty),
      pctOff: n(form.pctOff),
      freeProductId: form.freeProductId || null,
      fromDate: form.fromDate || undefined,
      toDate: form.toDate || undefined,
      customerIds: form.customerIds,
      active: form.active,
    });
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) setForm(null);
  };

  const status = (s: Scheme) => (!s.active ? 'Off' : s.toDate && s.toDate < today ? 'Ended' : s.fromDate && s.fromDate > today ? 'Starts later' : 'Running');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schemes" subtitle="Free goods or a discount when a customer buys enough. New bills add them by themselves." wide>
      <div className="space-y-4">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {!form && (
          <>
            {schemes.length === 0 ? (
              <EmptyState compact icon={<Gift className="w-5 h-5" />} text="No schemes yet. Add one like “Dalda 5L tin: buy 10 get 1 free”." />
            ) : (
              <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]" data-testid="schemes-list">
                {[...schemes].sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
                  const st = status(s);
                  return (
                    <li key={s.id} className="flex items-center gap-2 pl-3 pr-1 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-[#111827] dark:text-white truncate">{s.name}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st === 'Running' ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300' : 'bg-[#F4F3EF] dark:bg-[#162436] text-[#6B7280] dark:text-[#94A3B8]'}`}>{st}</span>
                        </div>
                        <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                          {productName(s.productId)}: {schemeRule(s, unitOf(s.productId))}{s.freeProductId ? ` (free: ${productName(s.freeProductId)})` : ''}
                          {s.fromDate || s.toDate ? ` • ${s.fromDate ? formatDate(s.fromDate) : '…'} – ${s.toDate ? formatDate(s.toDate) : '…'}` : ''}
                          {s.customerIds?.length ? ` • ${s.customerIds.length} customer(s) only` : ' • all customers'}
                        </div>
                      </div>
                      {canEdit && <RowAction label={`Edit scheme ${s.name}`} icon={<Pencil className="w-4 h-4" />} onClick={() => { setMsg(null); setForm(toForm(s)); }} />}
                      {canEdit && <RowAction label={`Delete scheme ${s.name}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => { const r = deleteScheme(s.id); setMsg({ kind: r.success ? 'ok' : 'error', text: r.message }); }} />}
                    </li>
                  );
                })}
              </ul>
            )}
            {canEdit && <button type="button" onClick={() => { setMsg(null); setForm(emptyForm()); }} className={primaryBtn}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New scheme</button>}
          </>
        )}

        {form && (
          <form onSubmit={submit} className="space-y-3" data-testid="scheme-form">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="sch-name">Scheme name</label>
                <input id="sch-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Summer bonus" />
              </div>
              <div>
                <label className={labelCls} htmlFor="sch-item">Item bought</label>
                <select id="sch-item" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className={inputCls}>
                  <option value="">Select item…</option>
                  {sortedProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <span className={labelCls}>Kind</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Kind of scheme">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" role="radio" aria-checked={form.kind === k.id} onClick={() => setForm({ ...form, kind: k.id })} className={`rounded-2xl border p-2.5 text-left text-xs ${form.kind === k.id ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300' : 'border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8]'}`}>
                    <div className="font-bold text-sm">{k.label}</div>
                    <div>{k.help}</div>
                  </button>
                ))}
              </div>
            </div>
            {form.kind === 'free_every' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="sch-buy">For every (qty bought)</label>
                  <input id="sch-buy" type="number" inputMode="decimal" min="0" step="any" value={form.buyQty} onChange={(e) => setForm({ ...form, buyQty: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="10" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="sch-free">Free qty</label>
                  <input id="sch-free" type="number" inputMode="decimal" min="0" step="any" value={form.freeQty} onChange={(e) => setForm({ ...form, freeQty: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="1" />
                </div>
              </div>
            )}
            {form.kind === 'free_slab' && (
              <div className="space-y-2">
                {form.slabs.map((sl, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <div>
                      <label className={labelCls} htmlFor={`sch-slab-min-${i}`}>Buys at least</label>
                      <input id={`sch-slab-min-${i}`} type="number" inputMode="decimal" min="0" step="any" value={sl.minQty} onChange={(e) => setForm({ ...form, slabs: form.slabs.map((x, j) => (j === i ? { ...x, minQty: e.target.value } : x)) })} className={`${inputCls} tabular-nums`} placeholder="50" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`sch-slab-free-${i}`}>Gets free</label>
                      <input id={`sch-slab-free-${i}`} type="number" inputMode="decimal" min="0" step="any" value={sl.freeQty} onChange={(e) => setForm({ ...form, slabs: form.slabs.map((x, j) => (j === i ? { ...x, freeQty: e.target.value } : x)) })} className={`${inputCls} tabular-nums`} placeholder="3" />
                    </div>
                    <button type="button" aria-label={`Remove slab ${i + 1}`} disabled={form.slabs.length === 1} onClick={() => setForm({ ...form, slabs: form.slabs.filter((_, j) => j !== i) })} className="mb-1 p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600 disabled:opacity-30"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setForm({ ...form, slabs: [...form.slabs, { minQty: '', freeQty: '' }] })} className="text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline">+ Add a slab</button>
              </div>
            )}
            {form.kind === 'pct_off' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="sch-min">From qty</label>
                  <input id="sch-min" type="number" inputMode="decimal" min="0" step="any" value={form.minQty} onChange={(e) => setForm({ ...form, minQty: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="20" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="sch-pct">% off</label>
                  <input id="sch-pct" type="number" inputMode="decimal" min="0" max="99" step="any" value={form.pctOff} onChange={(e) => setForm({ ...form, pctOff: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="5" />
                </div>
              </div>
            )}
            {form.kind !== 'pct_off' && (
              <div>
                <label className={labelCls} htmlFor="sch-free-item">Free item</label>
                <select id="sch-free-item" value={form.freeProductId} onChange={(e) => setForm({ ...form, freeProductId: e.target.value })} className={inputCls}>
                  <option value="">Same item</option>
                  {sortedProducts.filter((p) => p.id !== form.productId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="sch-from">From date</label>
                <input id="sch-from" type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="sch-to">To date</label>
                <input id="sch-to" type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="sch-cust">Only for these customers (leave empty for everyone)</label>
              <div className="flex gap-2">
                <select id="sch-cust" value={custPick} onChange={(e) => setCustPick(e.target.value)} className={inputCls}>
                  <option value="">Add a customer…</option>
                  {sortedCustomers.filter((c) => !form.customerIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" disabled={!custPick} onClick={() => { setForm({ ...form, customerIds: [...form.customerIds, custPick] }); setCustPick(''); }} className={`${secondaryBtn} shrink-0`}>Add</button>
              </div>
              {form.customerIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.customerIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#F4F3EF] dark:bg-[#162436] pl-2.5 pr-1 py-0.5 text-xs font-semibold">
                      {customers.find((c) => c.id === id)?.name || 'Removed'}
                      <button type="button" aria-label="Remove customer from scheme" onClick={() => setForm({ ...form, customerIds: form.customerIds.filter((x) => x !== id) })} className="p-0.5 rounded-full hover:text-rose-600"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-teal-700" /> Scheme is on</label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={secondaryBtn}>Cancel</button>
              <button type="submit" className={primaryBtn}>Save scheme</button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
