import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Printer, Trash2, Undo2, Wrench } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { ASSET_CATEGORIES, AssetCategory, AssetPaidFrom, DepreciationMethod, FixedAsset } from '../../types';
import { Modal, Notice, Tile, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs, EmptyState, RowAction } from '../billing/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { assetRegister, disposalResult, monthLabel, monthOf, reducingRate } from '../../utils/financeBooks';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { CostCentreSelect, MONEY_METHODS, useFinancialYears } from './common';

type Flash = (r: { success: boolean; message: string }) => void;

const PAID_FROM: { id: AssetPaidFrom; label: string }[] = [
  { id: 'cash', label: 'Cash in hand' },
  { id: 'bank', label: 'Bank' },
  { id: 'credit', label: 'On credit (pay later)' },
  { id: 'owned', label: 'Already owned (opening balance)' },
];

const AddAssetModal: React.FC<{ onClose: () => void; onDone: Flash }> = ({ onClose, onDone }) => {
  const { addFixedAsset } = useTrading();
  const [f, setF] = useState({ name: '', category: 'vehicle' as AssetCategory, purchaseDate: todayISO(), cost: '', paidFrom: 'cash' as AssetPaidFrom, vendor: '', life: '5', residual: '', method: 'straight_line' as DepreciationMethod, rate: '', opening: '', centre: '', note: '' });
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const cost = parseFloat(f.cost) || 0;
  const life = parseFloat(f.life) || 0;
  const residual = parseFloat(f.residual) || 0;
  const monthly = f.method === 'straight_line' ? (life > 0 ? (cost - residual) / (life * 12) : 0) : (cost - (parseFloat(f.opening) || 0)) * (reducingRate({ ratePct: parseFloat(f.rate) || undefined, usefulLifeYears: life || 1 }) / 1200);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = addFixedAsset({ name: f.name, category: f.category, purchaseDate: f.purchaseDate, cost, paidFrom: f.paidFrom, vendor: f.vendor, usefulLifeYears: life, residualValue: residual, method: f.method, ratePct: parseFloat(f.rate) || undefined, openingAccumulated: parseFloat(f.opening) || 0, costCentreId: f.centre || null, note: f.note });
    if (!r.success) return setError(r.message);
    onDone(r);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title="Add fixed asset" subtitle="Something the shop owns and uses for years: vehicle, generator, fittings…" wide
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button><button type="submit" form="asset-form" className={primaryBtn}>Save asset</button></div>}>
      <form id="asset-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
        {error && <div className="col-span-2"><Notice kind="error">{error}</Notice></div>}
        <div className="col-span-2 sm:col-span-1"><label className={labelCls} htmlFor="fa-name">Name</label><input id="fa-name" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Suzuki pickup LES-1234" className={inputCls} /></div>
        <div className="col-span-2 sm:col-span-1"><label className={labelCls} htmlFor="fa-cat">Type</label><select id="fa-cat" value={f.category} onChange={(e) => set({ category: e.target.value as AssetCategory })} className={inputCls}>{ASSET_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
        <div><label className={labelCls} htmlFor="fa-cost">Cost (Rs.)</label><input id="fa-cost" type="number" inputMode="decimal" min="0" step="any" value={f.cost} onChange={(e) => set({ cost: e.target.value })} className={`${inputCls} tabular-nums`} /></div>
        <div><label className={labelCls} htmlFor="fa-date">Bought on</label><input id="fa-date" type="date" max={todayISO()} value={f.purchaseDate} onChange={(e) => set({ purchaseDate: e.target.value })} className={inputCls} /></div>
        <div className="col-span-2 sm:col-span-1"><label className={labelCls} htmlFor="fa-paid">Paid from</label><select id="fa-paid" value={f.paidFrom} onChange={(e) => set({ paidFrom: e.target.value as AssetPaidFrom })} className={inputCls}>{PAID_FROM.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
        {f.paidFrom === 'credit' && <div className="col-span-2 sm:col-span-1"><label className={labelCls} htmlFor="fa-vendor">Bought from</label><input id="fa-vendor" value={f.vendor} onChange={(e) => set({ vendor: e.target.value })} placeholder="Seller's name" className={inputCls} /></div>}
        {f.paidFrom === 'owned' && <div className="col-span-2 sm:col-span-1"><label className={labelCls} htmlFor="fa-opening">Depreciation already charged (Rs.)</label><input id="fa-opening" type="number" inputMode="decimal" min="0" step="any" value={f.opening} onChange={(e) => set({ opening: e.target.value })} placeholder="0" className={`${inputCls} tabular-nums`} /></div>}
        <div><label className={labelCls} htmlFor="fa-method">Depreciation</label><select id="fa-method" value={f.method} onChange={(e) => set({ method: e.target.value as DepreciationMethod })} className={inputCls}><option value="straight_line">Straight line (same every month)</option><option value="reducing_balance">Reducing balance (% of what is left)</option></select></div>
        <div><label className={labelCls} htmlFor="fa-life">Useful life (years)</label><input id="fa-life" type="number" inputMode="decimal" min="0" step="any" value={f.life} onChange={(e) => set({ life: e.target.value })} className={`${inputCls} tabular-nums`} /></div>
        <div><label className={labelCls} htmlFor="fa-residual">Value at the end (Rs.)</label><input id="fa-residual" type="number" inputMode="decimal" min="0" step="any" value={f.residual} onChange={(e) => set({ residual: e.target.value })} placeholder="0" className={`${inputCls} tabular-nums`} /></div>
        {f.method === 'reducing_balance' && <div><label className={labelCls} htmlFor="fa-rate">Rate % a year</label><input id="fa-rate" type="number" inputMode="decimal" min="0" max="99" step="any" value={f.rate} onChange={(e) => set({ rate: e.target.value })} placeholder={String(reducingRate({ usefulLifeYears: life || 1 }))} className={`${inputCls} tabular-nums`} /></div>}
        <div className="col-span-2 sm:col-span-1"><CostCentreSelect id="fa-centre" value={f.centre} onChange={(v) => set({ centre: v })} /></div>
        <div className="col-span-2"><label className={labelCls} htmlFor="fa-note">Note (optional)</label><input id="fa-note" value={f.note} onChange={(e) => set({ note: e.target.value })} className={inputCls} /></div>
        {cost > 0 && life > 0 && <p className="col-span-2 text-xs text-[#6B7280] dark:text-[#94A3B8]">About <b className="tabular-nums">{rs(Math.max(0, Math.round(monthly * 100) / 100))}</b> a month will be charged as depreciation (an expense), starting from the month it was bought.</p>}
      </form>
    </Modal>
  );
};

/** Change what an asset is called, its type, cost centre and note (money and depreciation stay as posted). */
const EditAssetModal: React.FC<{ asset: FixedAsset; onClose: () => void; onDone: Flash }> = ({ asset, onClose, onDone }) => {
  const { updateFixedAsset } = useTrading();
  const [f, setF] = useState({ name: asset.name, category: asset.category, centre: asset.costCentreId || '', note: asset.note || '' });
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = updateFixedAsset(asset.id, { name: f.name, category: f.category, costCentreId: f.centre || null, note: f.note.trim() || undefined });
    if (!r.success) return setError(r.message);
    onDone(r);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={`Edit ${asset.name}`} subtitle="Cost, dates and depreciation already posted do not change."
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button><button type="submit" form="asset-edit-form" className={primaryBtn}>Save changes</button></div>}>
      <form id="asset-edit-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
        {error && <div className="col-span-2"><Notice kind="error">{error}</Notice></div>}
        <div className="col-span-2 sm:col-span-1"><label className={labelCls} htmlFor="fae-name">Name</label><input id="fae-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} /></div>
        <div className="col-span-2 sm:col-span-1"><label className={labelCls} htmlFor="fae-cat">Type</label><select id="fae-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as AssetCategory })} className={inputCls}>{ASSET_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
        <div className="col-span-2 sm:col-span-1"><CostCentreSelect id="fae-centre" value={f.centre} onChange={(v) => setF({ ...f, centre: v })} /></div>
        <div className="col-span-2"><label className={labelCls} htmlFor="fae-note">Note (optional)</label><input id="fae-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} /></div>
      </form>
    </Modal>
  );
};

const SellAssetModal: React.FC<{ asset: FixedAsset; onClose: () => void; onDone: Flash }> = ({ asset, onClose, onDone }) => {
  const { disposeFixedAsset, depreciationRuns } = useTrading();
  const [date, setDate] = useState(todayISO());
  const [proceeds, setProceeds] = useState('');
  const [method, setMethod] = useState<'cash' | 'bank'>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const p = parseFloat(proceeds) || 0;
  const res = disposalResult(asset, depreciationRuns, p);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = disposeFixedAsset(asset.id, { date, proceeds: p, method, note });
    if (!r.success) return setError(r.message);
    onDone(r);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={`Sell or scrap: ${asset.name}`} subtitle="Enter 0 if it was thrown away or given away.">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        {error && <div className="col-span-2"><Notice kind="error">{error}</Notice></div>}
        <div><label className={labelCls} htmlFor="sell-date">Date</label><input id="sell-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="sell-amount">Sold for (Rs.)</label><input id="sell-amount" type="number" inputMode="decimal" min="0" step="any" value={proceeds} onChange={(e) => setProceeds(e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} /></div>
        {p > 0 && <div><label className={labelCls} htmlFor="sell-method">Money received in</label><select id="sell-method" value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'bank')} className={inputCls}><option value="cash">Cash in hand</option><option value="bank">Bank</option></select></div>}
        <div className={p > 0 ? '' : 'col-span-2'}><label className={labelCls} htmlFor="sell-note">Note</label><input id="sell-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Buyer, reason…" className={inputCls} /></div>
        <div className="col-span-2 rounded-2xl bg-[#FAF9F6] dark:bg-[#0D1520] p-3 text-xs space-y-1 tabular-nums">
          <div className="flex justify-between"><span>Cost</span><span>{rs(asset.cost)}</span></div>
          <div className="flex justify-between"><span>Depreciation so far</span><span>− {rs(res.accumulated)}</span></div>
          <div className="flex justify-between font-bold"><span>Book value</span><span>{rs(res.bookValue)}</span></div>
          <div className={`flex justify-between font-bold ${res.gain >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`} data-testid="sale-gain"><span>{res.gain >= 0 ? 'Gain on sale' : 'Loss on sale'}</span><span>{rs(Math.abs(res.gain))}</span></div>
          <p className="text-[#6B7280] dark:text-[#94A3B8] font-sans">Run depreciation up to last month before recording the sale, so the book value is up to date.</p>
        </div>
        <div className="col-span-2 flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button><button type="submit" className={primaryBtn}>{p > 0 ? 'Record sale' : 'Write off'}</button></div>
      </form>
    </Modal>
  );
};

const PayCreditorModal: React.FC<{ asset: FixedAsset; owed: number; onClose: () => void; onDone: Flash }> = ({ asset, owed, onClose, onDone }) => {
  const { payAssetCreditor } = useTrading();
  const [amount, setAmount] = useState(String(owed));
  const [method, setMethod] = useState('Cash');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = payAssetCreditor(asset.id, { amount: parseFloat(amount) || 0, method, date });
    if (!r.success) return setError(r.message);
    onDone(r);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={`Pay for ${asset.name}`} subtitle={`${rs(owed)} still owed${asset.vendor ? ` to ${asset.vendor}` : ''}.`}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        {error && <div className="col-span-2"><Notice kind="error">{error}</Notice></div>}
        <div><label className={labelCls} htmlFor="fap-amount">Amount (Rs.)</label><input id="fap-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} tabular-nums`} /></div>
        <div><label className={labelCls} htmlFor="fap-method">Paid from</label><select id="fap-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{MONEY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label className={labelCls} htmlFor="fap-date">Date</label><input id="fap-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
        <div className="col-span-2 flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button><button type="submit" className={primaryBtn}>Pay</button></div>
      </form>
    </Modal>
  );
};

/** Accounts → Fixed assets: the register, depreciation runs, sale / scrap. */
export const FixedAssetsTab: React.FC<{ flash: Flash }> = ({ flash }) => {
  const { fixedAssets, depreciationRuns, costCentres, can, runDepreciation, undoDepreciationRun, deleteFixedAsset, undoDisposal, setPrintRequest } = useTrading();
  const canPost = can('finance:view_pnl');
  const canRemove = canPost && can('delete_records');
  const canPay = can('finance:cashbook');
  const today = todayISO();
  const { years, current } = useFinancialYears();
  const [asOf, setAsOf] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const [fy, setFy] = useState(current.start);
  const [modal, setModal] = useState<{ kind: 'add' } | { kind: 'edit'; asset: FixedAsset } | { kind: 'sell'; asset: FixedAsset } | { kind: 'pay'; asset: FixedAsset; owed: number } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; label: string; action: () => void } | null>(null);
  const reg = useMemo(() => assetRegister(fixedAssets, depreciationRuns, asOf), [fixedAssets, depreciationRuns, asOf]);
  const cat = (id: string) => ASSET_CATEGORIES.find((c) => c.id === id)?.label || id;
  const centre = (id?: string | null) => (id ? costCentres.find((c) => c.id === id)?.name : undefined);
  const owedFor = (a: FixedAsset) => (a.paidFrom === 'credit' ? Math.round((a.cost - (a.payments || []).reduce((s, p) => s + p.amount, 0)) * 100) / 100 : 0);

  return (
    <div className="space-y-4" data-testid="assets-tab">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Cost of assets in use" value={rs(reg.totalCost)} />
        <Tile label="Depreciation to date" value={rs(reg.totalAccumulated)} tone="warn" />
        <Tile label="Book value" value={rs(reg.totalBookValue)} tone="good" hint="Cost less depreciation" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {canPost && <button type="button" onClick={() => setModal({ kind: 'add' })} className={primaryBtn}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Add asset</button>}
        <div className="w-40"><label className={labelCls} htmlFor="fa-asof">As of</label><input id="fa-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || today)} className={inputCls} /></div>
        <button type="button" onClick={() => setPrintRequest({ type: 'asset_register', asOf })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print register</button>
      </div>

      {canPost && (
        <div className={`${cardCls} p-4 sm:p-5 space-y-3`}>
          <div>
            <h2 className="font-bold text-[#111827] dark:text-white">Run depreciation</h2>
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Books the wear and tear of every asset as an expense (Dr Depreciation, Cr Accumulated depreciation). A month is never charged twice, so running it again is safe.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44"><label className={labelCls} htmlFor="dep-month">Month</label><input id="dep-month" type="month" max={monthOf(today)} value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} /></div>
            <button type="button" onClick={() => flash(runDepreciation({ month }))} className={secondaryBtn}><Wrench className="w-4 h-4" /> Run for {monthLabel(month)}</button>
            <div className="w-40"><label className={labelCls} htmlFor="dep-fy">Whole year</label><select id="dep-fy" value={fy} onChange={(e) => setFy(e.target.value)} className={inputCls}>{years.map((y) => <option key={y.start} value={y.start}>{y.label}</option>)}</select></div>
            <button type="button" onClick={() => flash(runDepreciation({ fyStartDate: fy }))} className={secondaryBtn}><Wrench className="w-4 h-4" /> Run for the year</button>
          </div>
        </div>
      )}

      <div className={`${cardCls} overflow-hidden`}>
        <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248] font-bold text-[#111827] dark:text-white">Asset register</div>
        {reg.rows.length === 0 ? (
          <EmptyState text="No fixed assets yet. Add the shop's vehicles, generator, fittings and equipment to track their value." />
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {reg.rows.map((r) => {
              const a = r.asset;
              const owed = owedFor(a);
              return (
                <li key={a.id} className="px-4 sm:px-5 py-3" data-testid="asset-row">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-[#111827] dark:text-white">{a.name}{r.disposed && <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{(a.disposalProceeds || 0) > 0 ? 'Sold' : 'Written off'}</span>}</div>
                      <div className="text-[11px] text-[#8E9299]">{cat(a.category)} • bought {formatDate(a.purchaseDate)} • {a.method === 'reducing_balance' ? `reducing ${reducingRate(a)}% a year` : `straight line over ${a.usefulLifeYears} yrs`}{centre(a.costCentreId) ? ` • ${centre(a.costCentreId)}` : ''}</div>
                      {r.disposed && <div className="text-[11px] text-[#6B7280]">{formatDate(a.disposalDate!)}: {rs(a.disposalProceeds || 0)}</div>}
                      {owed > 0 && <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">{rs(owed)} still owed{a.vendor ? ` to ${a.vendor}` : ''}</div>}
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="font-bold text-sm text-[#111827] dark:text-white">{r.disposed ? '—' : rs(r.bookValue)}</div>
                      <div className="text-[11px] text-[#8E9299]">cost {rs(r.cost)}</div>
                      <div className="text-[11px] text-[#8E9299]">dep. {rs(r.accumulated)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5 -ml-2">
                    {canPost && <RowAction label={`Edit ${a.name}`} icon={<Pencil className="w-4 h-4" />} onClick={() => setModal({ kind: 'edit', asset: a })} />}
                    {!r.disposed && a.status !== 'disposed' && canPost && <RowAction label={`Sell or scrap ${a.name}`} text="Sell / scrap" alwaysText icon={<Undo2 className="w-4 h-4 rotate-180" />} onClick={() => setModal({ kind: 'sell', asset: a })} />}
                    {owed > 0 && canPay && <RowAction label={`Pay for ${a.name}`} text="Pay seller" alwaysText tone="teal" icon={<Plus className="w-4 h-4" />} onClick={() => setModal({ kind: 'pay', asset: a, owed })} />}
                    {a.status === 'disposed' && canRemove && <RowAction label={`Undo sale of ${a.name}`} text="Undo sale" alwaysText icon={<Undo2 className="w-4 h-4" />} onClick={() => setConfirm({ title: `Undo the sale of ${a.name}?`, message: 'The asset goes back into the register and the sale money is taken off the cash book.', label: 'Undo sale', action: () => flash(undoDisposal(a.id)) })} />}
                    {a.status !== 'disposed' && canRemove && <RowAction label={`Delete ${a.name}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirm({ title: `Delete ${a.name}?`, message: 'Only for an asset added by mistake. Its purchase payment is removed from the cash book too.', label: 'Delete asset', action: () => flash(deleteFixedAsset(a.id)) })} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {depreciationRuns.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248] font-bold text-[#111827] dark:text-white">Depreciation runs</div>
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {[...depreciationRuns].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => (
              <li key={r.id} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3" data-testid="dep-run">
                <div className="min-w-0"><div className="text-sm font-semibold">{/^\d{4}-\d{2}$/.test(r.period) ? monthLabel(r.period) : r.period}</div><div className="text-[11px] text-[#8E9299]">Booked {formatDate(r.date)} • {r.lines.length} asset{r.lines.length === 1 ? '' : 's'} • {r.months.length} month{r.months.length === 1 ? '' : 's'}</div></div>
                <div className="flex items-center gap-1">
                  <span className="tabular-nums font-bold text-sm">{rs(r.total)}</span>
                  {canRemove && <RowAction label={`Undo depreciation ${r.period}`} tone="danger" icon={<Undo2 className="w-4 h-4" />} onClick={() => setConfirm({ title: `Undo depreciation for ${r.period}?`, message: `${rs(r.total)} of depreciation will be taken out of the books.`, label: 'Undo run', action: () => flash(undoDepreciationRun(r.id)) })} />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modal?.kind === 'add' && <AddAssetModal onClose={() => setModal(null)} onDone={flash} />}
      {modal?.kind === 'edit' && <EditAssetModal asset={modal.asset} onClose={() => setModal(null)} onDone={flash} />}
      {modal?.kind === 'sell' && <SellAssetModal asset={modal.asset} onClose={() => setModal(null)} onDone={flash} />}
      {modal?.kind === 'pay' && <PayCreditorModal asset={modal.asset} owed={modal.owed} onClose={() => setModal(null)} onDone={flash} />}
      <ConfirmDialog isOpen={Boolean(confirm)} title={confirm?.title || ''} message={confirm?.message || ''} confirmLabel={confirm?.label} onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.action(); setConfirm(null); }} />
    </div>
  );
};
