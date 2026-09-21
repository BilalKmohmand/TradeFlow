import React, { useState } from 'react';
import { Pencil, Plus, Trash2, UserRound, MapPin } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Notice, EmptyState, inputCls, labelCls, pillCls, primaryBtn, secondaryBtn, RowAction } from './ui';
import { CommissionBasis } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';

type Msg = { kind: 'ok' | 'error'; text: string } | null;

/** Salesmen (with optional commission) and areas / routes: two simple lists. */
export const SalesTeamModal: React.FC<{ isOpen: boolean; onClose: () => void; initialTab?: 'salesmen' | 'areas' }> = ({ isOpen, onClose, initialTab = 'salesmen' }) => {
  const { salesmen, areas, saveSalesman, deleteSalesman, saveArea, deleteArea, customers, can } = useTrading();
  const canEdit = can('customers:edit');
  const [tab, setTab] = useState<'salesmen' | 'areas'>(initialTab);
  const [msg, setMsg] = useState<Msg>(null);
  const emptySm = { id: '', name: '', phone: '', pct: '', on: 'sales' as CommissionBasis };
  const [sm, setSm] = useState(emptySm);
  const [area, setArea] = useState({ id: '', name: '', note: '' });
  // Removing asks first (like every delete); the reason goes with the copy in Admin → Deleted records.
  const [pending, setPending] = useState<{ kind: 'salesman' | 'area'; id: string; name: string } | null>(null);
  const count = (field: 'salesmanId' | 'areaId', id: string) => customers.filter((c) => c[field] === id).length;

  const submitSalesman = (e: React.FormEvent) => {
    e.preventDefault();
    const r = saveSalesman({ id: sm.id || undefined, name: sm.name, phone: sm.phone, commissionPct: sm.pct === '' ? 0 : Number(sm.pct), commissionOn: sm.on });
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) setSm(emptySm);
  };
  const submitArea = (e: React.FormEvent) => {
    e.preventDefault();
    const r = saveArea({ id: area.id || undefined, name: area.name, note: area.note });
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) setArea({ id: '', name: '', note: '' });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Salesmen & areas" subtitle="Bills record the salesman and area; customers get a default for each.">
      <div className="space-y-4">
        <div role="tablist" aria-label="Salesmen or areas" className="flex gap-1.5">
          <button type="button" role="tab" aria-selected={tab === 'salesmen'} onClick={() => { setTab('salesmen'); setMsg(null); }} className={pillCls(tab === 'salesmen')}>Salesmen ({salesmen.length})</button>
          <button type="button" role="tab" aria-selected={tab === 'areas'} onClick={() => { setTab('areas'); setMsg(null); }} className={pillCls(tab === 'areas')}>Areas / routes ({areas.length})</button>
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

        {tab === 'salesmen' && (
          <>
            {salesmen.length === 0 ? (
              <EmptyState compact icon={<UserRound className="w-5 h-5" />} text="No salesmen yet. Add the people who take orders or collect money." />
            ) : (
              <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]" data-testid="salesmen-list">
                {[...salesmen].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map((s) => (
                  <li key={s.id} className="flex items-center gap-2 pl-3 pr-1 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold truncate ${s.active ? 'text-[#111827] dark:text-white' : 'text-[#9CA3AF] line-through'}`}>{s.name}</div>
                      <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                        {s.phone ? `${s.phone} • ` : ''}{s.commissionPct ? `${s.commissionPct}% on ${s.commissionOn === 'recovery' ? 'money recovered' : 'sales'}` : 'no commission'} • {count('salesmanId', s.id)} customer(s){s.active ? '' : ' • switched off'}
                      </div>
                    </div>
                    {canEdit && <RowAction label={`Edit ${s.name}`} icon={<Pencil className="w-4 h-4" />} onClick={() => setSm({ id: s.id, name: s.name, phone: s.phone || '', pct: s.commissionPct ? String(s.commissionPct) : '', on: s.commissionOn || 'sales' })} />}
                    {canEdit && !s.active && <RowAction label={`Switch ${s.name} on`} text="On" alwaysText icon={<Plus className="w-4 h-4" />} onClick={() => { const r = saveSalesman({ id: s.id, name: s.name, phone: s.phone, commissionPct: s.commissionPct, commissionOn: s.commissionOn, active: true }); setMsg({ kind: r.success ? 'ok' : 'error', text: r.message }); }} />}
                    {canEdit && s.active && <RowAction label={`Remove ${s.name}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPending({ kind: 'salesman', id: s.id, name: s.name })} />}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form onSubmit={submitSalesman} className="grid grid-cols-2 gap-3 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3" data-testid="salesman-form">
                <div className="col-span-2 text-xs font-bold text-[#374151] dark:text-[#CBD5E1]">{sm.id ? 'Edit salesman' : 'Add a salesman'}</div>
                <div>
                  <label className={labelCls} htmlFor="sm-name">Name</label>
                  <input id="sm-name" value={sm.name} onChange={(e) => setSm({ ...sm, name: e.target.value })} className={inputCls} placeholder="e.g. Rashid" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="sm-phone">Phone</label>
                  <input id="sm-phone" value={sm.phone} onChange={(e) => setSm({ ...sm, phone: e.target.value })} className={inputCls} placeholder="optional" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="sm-pct">Commission %</label>
                  <input id="sm-pct" type="number" inputMode="decimal" min="0" max="99" step="any" value={sm.pct} onChange={(e) => setSm({ ...sm, pct: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="0 = none" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="sm-on">Commission on</label>
                  <select id="sm-on" value={sm.on} onChange={(e) => setSm({ ...sm, on: e.target.value as CommissionBasis })} className={inputCls}>
                    <option value="sales">Sales (bills they made)</option>
                    <option value="recovery">Money recovered</option>
                  </select>
                </div>
                <div className="col-span-2 flex justify-end gap-2">
                  {sm.id && <button type="button" onClick={() => setSm(emptySm)} className={secondaryBtn}>Cancel</button>}
                  <button type="submit" className={primaryBtn}>{sm.id ? 'Save salesman' : 'Add salesman'}</button>
                </div>
              </form>
            )}
          </>
        )}

        {tab === 'areas' && (
          <>
            {areas.length === 0 ? (
              <EmptyState compact icon={<MapPin className="w-5 h-5" />} text="No areas yet. Add the routes or markets your customers are in." />
            ) : (
              <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]" data-testid="areas-list">
                {[...areas].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map((a) => (
                  <li key={a.id} className="flex items-center gap-2 pl-3 pr-1 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold truncate ${a.active ? 'text-[#111827] dark:text-white' : 'text-[#9CA3AF] line-through'}`}>{a.name}</div>
                      <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{a.note ? `${a.note} • ` : ''}{count('areaId', a.id)} customer(s){a.active ? '' : ' • switched off'}</div>
                    </div>
                    {canEdit && <RowAction label={`Edit ${a.name}`} icon={<Pencil className="w-4 h-4" />} onClick={() => setArea({ id: a.id, name: a.name, note: a.note || '' })} />}
                    {canEdit && !a.active && <RowAction label={`Switch ${a.name} on`} text="On" alwaysText icon={<Plus className="w-4 h-4" />} onClick={() => { const r = saveArea({ id: a.id, name: a.name, note: a.note, active: true }); setMsg({ kind: r.success ? 'ok' : 'error', text: r.message }); }} />}
                    {canEdit && a.active && <RowAction label={`Remove ${a.name}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPending({ kind: 'area', id: a.id, name: a.name })} />}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form onSubmit={submitArea} className="grid grid-cols-2 gap-3 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3" data-testid="area-form">
                <div className="col-span-2 text-xs font-bold text-[#374151] dark:text-[#CBD5E1]">{area.id ? 'Edit area' : 'Add an area / route'}</div>
                <div>
                  <label className={labelCls} htmlFor="area-name">Area name</label>
                  <input id="area-name" value={area.name} onChange={(e) => setArea({ ...area, name: e.target.value })} className={inputCls} placeholder="e.g. Saddar" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="area-note">Note</label>
                  <input id="area-note" value={area.note} onChange={(e) => setArea({ ...area, note: e.target.value })} className={inputCls} placeholder="e.g. Tuesday route" />
                </div>
                <div className="col-span-2 flex justify-end gap-2">
                  {area.id && <button type="button" onClick={() => setArea({ id: '', name: '', note: '' })} className={secondaryBtn}>Cancel</button>}
                  <button type="submit" className={primaryBtn}>{area.id ? 'Save area' : 'Add area'}</button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={`Remove ${pending?.name || ''}?`}
        message={pending?.kind === 'salesman' ? 'A salesman who is on bills or customers is only switched off (old bills keep the name).' : 'An area that is on bills or customers is only switched off (old bills keep the name).'}
        confirmLabel="Remove"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            const r = pending.kind === 'salesman' ? deleteSalesman(pending.id) : deleteArea(pending.id);
            setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
          }
          setPending(null);
        }}
      />
    </Modal>
  );
};

/** On a customer: default area and salesman for new bills, and late-payment interest (off by default). */
export const CustomerSalesPanel: React.FC<{ customerId: string }> = ({ customerId }) => {
  const { customers, salesmen, areas, setCustomerSalesInfo, can } = useTrading();
  const c = customers.find((x) => x.id === customerId);
  const canEdit = can('customers:edit');
  const canInterest = can('finance:view_pnl');
  const [form, setForm] = useState(() => ({
    areaId: c?.areaId || '',
    salesmanId: c?.salesmanId || '',
    pct: c?.interestPctPerMonth ? String(c.interestPctPerMonth) : '',
    after: c?.interestAfterDays != null && c.interestPctPerMonth ? String(c.interestAfterDays) : '30',
  }));
  const [msg, setMsg] = useState<Msg>(null);
  if (!c) return null;
  const noLists = salesmen.length === 0 && areas.length === 0;
  if (!canEdit && noLists && !c.interestPctPerMonth) return null;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = setCustomerSalesInfo(c.id, {
      areaId: form.areaId || null,
      salesmanId: form.salesmanId || null,
      ...(canInterest ? { interestPctPerMonth: form.pct === '' ? 0 : Number(form.pct), interestAfterDays: form.after === '' ? 0 : Number(form.after) } : {}),
    });
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
  };
  const activeSm = salesmen.filter((s) => s.active || s.id === form.salesmanId);
  const activeAreas = areas.filter((a) => a.active || a.id === form.areaId);
  return (
    <form onSubmit={save} data-testid="customer-sales-panel">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Area, salesman &amp; late payment</h3>
      {msg && <div className="mb-2"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} htmlFor="cs-area">Area</label>
          <select id="cs-area" value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })} className={inputCls} disabled={!canEdit}>
            <option value="">{areas.length ? 'No area' : 'No areas yet'}</option>
            {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="cs-salesman">Salesman</label>
          <select id="cs-salesman" value={form.salesmanId} onChange={(e) => setForm({ ...form, salesmanId: e.target.value })} className={inputCls} disabled={!canEdit}>
            <option value="">{salesmen.length ? 'No salesman' : 'No salesmen yet'}</option>
            {activeSm.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {canInterest && (
          <>
            <div>
              <label className={labelCls} htmlFor="cs-int-pct">Interest % a month</label>
              <input id="cs-int-pct" type="number" inputMode="decimal" min="0" max="10" step="any" value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="Off" />
            </div>
            <div>
              <label className={labelCls} htmlFor="cs-int-days">After how many days</label>
              <input id="cs-int-days" type="number" inputMode="numeric" min="0" max="365" step="1" value={form.after} onChange={(e) => setForm({ ...form, after: e.target.value })} className={`${inputCls} tabular-nums`} />
            </div>
          </>
        )}
        {!canInterest && c.interestPctPerMonth ? <p className="col-span-2 text-[11px] text-[#6B7280]">Late payment: {c.interestPctPerMonth}% a month after {c.interestAfterDays || 0} days.</p> : null}
      </div>
      {canEdit && <div className="mt-2 flex justify-end"><button type="submit" className={secondaryBtn}>Save area &amp; salesman</button></div>}
    </form>
  );
};
