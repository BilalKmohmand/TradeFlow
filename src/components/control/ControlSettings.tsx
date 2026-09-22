import React, { useState } from 'react';
import { ShieldCheck, Hash, Store, Plus, Trash2, Save } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { ApprovalRules, DocSeriesConfig, DocSeriesKey } from '../../types';
import { Notice, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, RowAction } from '../billing/ui';
import { DOC_SERIES, formatDocNumber } from '../../utils/control';

type Msg = { kind: 'ok' | 'error'; text: string } | null;
const Section: React.FC<{ icon: React.ReactNode; title: string; text: string; anchor?: string; children: React.ReactNode }> = ({ icon, title, text, anchor, children }) => (
  <section data-nav-anchor={anchor} className={`${cardCls} p-4 sm:p-5 space-y-4`}>
    <div>
      <h2 className="font-bold text-[#111827] dark:text-white flex items-center gap-2">{icon} {title}</h2>
      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mt-0.5">{text}</p>
    </div>
    {children}
  </section>
);

// ---------------------------------------------------------------------------
export const ApprovalRulesForm: React.FC = () => {
  const { approvalRules, updateApprovalRules } = useTrading();
  const str = (n?: number | null) => (n ? String(n) : '');
  const [f, setF] = useState({ discount: str(approvalRules.discountPctAbove), supplier: str(approvalRules.supplierPaymentAbove), stock: str(approvalRules.stockLossAbove), credit: Boolean(approvalRules.creditLimit), del: Boolean(approvalRules.deleteBills) });
  const [msg, setMsg] = useState<Msg>(null);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const rules: ApprovalRules = { discountPctAbove: parseFloat(f.discount) || null, supplierPaymentAbove: parseFloat(f.supplier) || null, stockLossAbove: parseFloat(f.stock) || null, creditLimit: f.credit, deleteBills: f.del };
    const r = updateApprovalRules(rules);
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
  };
  const check = (id: string, label: string, hint: string, on: boolean, set: (v: boolean) => void) => (
    <label htmlFor={id} className="flex items-start gap-3 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3 cursor-pointer">
      <input id={id} type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="w-5 h-5 mt-0.5 shrink-0 accent-teal-700" />
      <span className="text-sm"><span className="font-semibold text-[#111827] dark:text-white">{label}</span><span className="block text-xs text-[#6B7280] dark:text-[#94A3B8]">{hint}</span></span>
    </label>
  );
  return (
    <Section icon={<ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-300" />} anchor="approval-rules" title="Approval rules" text="Staff without “Approve / Reject” (Admin → Roles) must send these to a manager. The document waits in Approvals and is only posted when approved. Leave a box empty to switch that rule off.">
      <form onSubmit={save} className="space-y-3" aria-label="Approval rules">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls} htmlFor="rule-discount">Discount on a bill above (%)</label>
            <input id="rule-discount" type="number" inputMode="decimal" min="0" max="100" step="any" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} className={inputCls} placeholder="off, e.g. 10" />
          </div>
          <div>
            <label className={labelCls} htmlFor="rule-supplier">Payment to a supplier above (Rs.)</label>
            <input id="rule-supplier" type="number" inputMode="decimal" min="0" step="any" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} className={inputCls} placeholder="off, e.g. 100000" />
          </div>
          <div>
            <label className={labelCls} htmlFor="rule-stock">Stock loss above (Rs. at cost)</label>
            <input id="rule-stock" type="number" inputMode="decimal" min="0" step="any" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className={inputCls} placeholder="off, e.g. 5000" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {check('rule-credit', 'Bill over the credit limit', 'Instead of refusing, the bill goes to a manager (managers can still allow it on the spot).', f.credit, (v) => setF({ ...f, credit: v }))}
          {check('rule-delete', 'Deleting any bill', 'Staff can only ask to delete a bill; a manager approves the delete.', f.del, (v) => setF({ ...f, del: v }))}
        </div>
        <div className="flex justify-end"><button type="submit" className={primaryBtn}><Save className="w-4 h-4" /> Save rules</button></div>
      </form>
    </Section>
  );
};

// ---------------------------------------------------------------------------
const SeriesRow: React.FC<{ k: DocSeriesKey; label: string; onMsg: (m: Msg) => void }> = ({ k, label, onMsg }) => {
  const { numberSeries, updateNumberSeries, previewDocNumber } = useTrading();
  const cfg = numberSeries[k];
  const [f, setF] = useState({ prefix: cfg.prefix, yearly: Boolean(cfg.yearly), pad: String(cfg.pad ?? 0), start: '' });
  const year = new Date().toISOString().slice(0, 4);
  const sample = formatDocNumber({ prefix: f.prefix || '?', yearly: f.yearly, pad: f.yearly && !(parseInt(f.pad) > 0) ? 4 : parseInt(f.pad) || 0 }, parseInt(f.start) || 1, year);
  const save = () => {
    const next: DocSeriesConfig = { prefix: f.prefix, yearly: f.yearly, pad: parseInt(f.pad) || 0, startAt: f.start.trim() ? parseInt(f.start) : null };
    const r = updateNumberSeries(k, next);
    onMsg({ kind: r.success ? 'ok' : 'error', text: `${label}: ${r.message}` });
    if (r.success) setF((x) => ({ ...x, start: '' }));
  };
  const id = `series-${k}`;
  return (
    <li className="py-3 grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_0.7fr_0.9fr_1fr_auto] gap-2 items-end" data-testid={id}>
      <div className="col-span-2 sm:col-span-1">
        <div className="font-semibold text-sm text-[#111827] dark:text-white">{label}</div>
        <div className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">Next: <strong className="tabular-nums">{previewDocNumber(k)}</strong></div>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${id}-prefix`}>Prefix</label>
        <input id={`${id}-prefix`} value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${id}-pad`}>Digits</label>
        <input id={`${id}-pad`} type="number" min="0" max="8" value={f.pad} onChange={(e) => setF({ ...f, pad: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${id}-start`}>Next no.</label>
        <input id={`${id}-start`} type="number" min="1" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className={inputCls} placeholder="same" />
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] min-h-11 cursor-pointer" htmlFor={`${id}-yearly`}>
        <input id={`${id}-yearly`} type="checkbox" checked={f.yearly} onChange={(e) => setF({ ...f, yearly: e.target.checked })} className="w-5 h-5 accent-teal-700" /> New series each year
      </label>
      <div className="col-span-2 sm:col-span-1 flex items-center gap-2 justify-end">
        <span className="text-[11px] text-[#6B7280] dark:text-[#8E9299] sm:hidden">e.g. {sample}</span>
        <button type="button" onClick={save} className={secondaryBtn} aria-label={`Save ${label} numbers`}><Save className="w-4 h-4" /> Save</button>
      </div>
    </li>
  );
};

export const NumberSeriesForm: React.FC = () => {
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <Section icon={<Hash className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />} anchor="doc-numbers" title="Document numbers" text="Numbers run in order with no gaps and are never used again, even after a delete. Tick “New series each year” for numbers like INV-2026-0001. “Next no.” can only move forward.">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
        {DOC_SERIES.map((s) => <SeriesRow key={s.key} k={s.key} label={s.label} onMsg={setMsg} />)}
      </ul>
    </Section>
  );
};

// ---------------------------------------------------------------------------
export const BranchesForm: React.FC = () => {
  const { branches, addBranch, updateBranch, deleteBranch, mainBranchId, users, setUserBranch, godowns, setGodownBranch, branchesEnabled } = useTrading();
  const [f, setF] = useState({ name: '', address: '' });
  const [msg, setMsg] = useState<Msg>(null);
  const show = (r: { success: boolean; message: string }) => setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const r = addBranch(f);
    show(r);
    if (r.success) setF({ name: '', address: '' });
  };
  const godownBranch = (gid: string) => branches.find((b) => (b.godownIds || []).includes(gid))?.id || '';
  return (
    <Section icon={<Store className="w-4 h-4 text-amber-600 dark:text-amber-300" />} anchor="branches" title="Branches" text="For shops with more than one outlet (e.g. Batkhela shop, Mingora shop). Once a second branch is added, bills, expenses, cash entries and payments record the branch of the person making them, and Home, Bills, Daily sheet, Money and Accounts get a branch filter. Records made before belong to the first (main) branch.">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {branches.length > 0 && (
        <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]" aria-label="Branches list">
          {branches.map((b) => (
            <li key={b.id} className="flex items-center gap-2 px-3 py-2">
              <input defaultValue={b.name} onBlur={(e) => e.target.value.trim() !== b.name && show(updateBranch(b.id, { name: e.target.value }))} className={`${inputCls} flex-1`} aria-label={`Name of branch ${b.name}`} />
              {b.id === mainBranchId && <span className="shrink-0 px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-[10px] font-bold">Main</span>}
              <RowAction label={`Remove branch ${b.name}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => show(deleteBranch(b.id))} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end" aria-label="Add branch">
        <div>
          <label className={labelCls} htmlFor="branch-name">Branch name</label>
          <input id="branch-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder={branches.length ? 'e.g. Mingora shop' : 'e.g. Batkhela shop (main)'} />
        </div>
        <div>
          <label className={labelCls} htmlFor="branch-address">Address (optional)</label>
          <input id="branch-address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={inputCls} />
        </div>
        <button type="submit" className={primaryBtn}><Plus className="w-4 h-4" /> Add branch</button>
      </form>

      {branchesEnabled && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-2">Each person’s branch</h3>
            <ul className="space-y-2">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-sm font-semibold text-[#111827] dark:text-white">{u.name}</span>
                  <select aria-label={`Branch of ${u.name}`} value={u.branchId && branches.some((b) => b.id === u.branchId) ? u.branchId : ''} onChange={(e) => show(setUserBranch(u.id, e.target.value || null))} className={`${inputCls} !w-48`}>
                    <option value="">{branches.find((b) => b.id === mainBranchId)?.name || 'Main'} (main)</option>
                    {branches.filter((b) => b.id !== mainBranchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-2">Godowns</h3>
            <ul className="space-y-2">
              {godowns.map((g) => (
                <li key={g.id} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-sm font-semibold text-[#111827] dark:text-white">{g.name}</span>
                  <select aria-label={`Branch of godown ${g.name}`} value={godownBranch(g.id)} onChange={(e) => show(setGodownBranch(g.id, e.target.value || null))} className={`${inputCls} !w-48`}>
                    <option value="">Not tied to a branch</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Section>
  );
};

/** Admin → Controls: approval rules, document numbers, branches. */
export const ControlSettingsTab: React.FC = () => (
  <div className="space-y-5">
    <ApprovalRulesForm />
    <NumberSeriesForm />
    <BranchesForm />
  </div>
);
