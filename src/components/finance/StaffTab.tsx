import React, { useMemo, useState } from 'react';
import { BookOpen, HandCoins, Pencil, Plus, Printer, Trash2, Undo2, Wallet } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { SalaryLine, StaffMember } from '../../types';
import { Modal, Notice, Tile, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs, EmptyState, RowAction } from '../billing/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { addMonths, advanceBalance, monthLabel, monthOf, salaryNet, salarySheetDraft, salaryTotals, staffLedger } from '../../utils/financeBooks';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { MONEY_METHODS } from './common';

type Flash = (r: { success: boolean; message: string }) => void;

const StaffModal: React.FC<{ member?: StaffMember; onClose: () => void; onDone: Flash }> = ({ member, onClose, onDone }) => {
  const { addStaff, updateStaff } = useTrading();
  const [f, setF] = useState({ name: member?.name || '', role: member?.role || '', salary: member ? String(member.monthlySalary) : '', phone: member?.phone || '', cnic: member?.cnic || '', joinDate: member?.joinDate || todayISO(), active: member ? member.active : true });
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { name: f.name, role: f.role, monthlySalary: parseFloat(f.salary) || 0, phone: f.phone, cnic: f.cnic, joinDate: f.joinDate, active: f.active };
    const r = member ? updateStaff(member.id, data) : addStaff(data);
    if (!r.success) return setError(r.message);
    onDone(r);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={member ? `Edit ${member.name}` : 'Add staff member'}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        {error && <div className="col-span-2"><Notice kind="error">{error}</Notice></div>}
        <div className="col-span-2"><label className={labelCls} htmlFor="st-name">Name</label><input id="st-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="st-role">Job</label><input id="st-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Salesman, driver…" className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="st-salary">Monthly salary (Rs.)</label><input id="st-salary" type="number" inputMode="decimal" min="0" step="any" value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} className={`${inputCls} tabular-nums`} /></div>
        <div><label className={labelCls} htmlFor="st-phone">Phone</label><input id="st-phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="st-join">Joined on</label><input id="st-join" type="date" value={f.joinDate} onChange={(e) => setF({ ...f, joinDate: e.target.value })} className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="st-cnic">CNIC (optional)</label><input id="st-cnic" value={f.cnic} onChange={(e) => setF({ ...f, cnic: e.target.value })} className={inputCls} /></div>
        {member && <label className="flex items-center gap-2 text-sm font-semibold self-end pb-3"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="w-4 h-4" /> Still working here</label>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button><button type="submit" className={primaryBtn}>Save</button></div>
      </form>
    </Modal>
  );
};

const AdvanceModal: React.FC<{ staffId?: string; onClose: () => void; onDone: Flash }> = ({ staffId, onClose, onDone }) => {
  const { staff, giveStaffAdvance } = useTrading();
  const [f, setF] = useState({ staffId: staffId || '', amount: '', method: 'Cash', date: todayISO(), note: '' });
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = giveStaffAdvance({ staffId: f.staffId, amount: parseFloat(f.amount) || 0, method: f.method, date: f.date, note: f.note });
    if (!r.success) return setError(r.message);
    onDone(r);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title="Give an advance" subtitle="A loan to staff. It is recovered from their salary.">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        {error && <div className="col-span-2"><Notice kind="error">{error}</Notice></div>}
        <div className="col-span-2"><label className={labelCls} htmlFor="adv-staff">Staff member</label><select id="adv-staff" value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })} className={inputCls}><option value="">Pick…</option>{staff.filter((s) => s.active || s.id === f.staffId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className={labelCls} htmlFor="adv-amount">Amount (Rs.)</label><input id="adv-amount" type="number" inputMode="decimal" min="0" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={`${inputCls} tabular-nums`} /></div>
        <div><label className={labelCls} htmlFor="adv-method">Paid from</label><select id="adv-method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className={inputCls}>{MONEY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label className={labelCls} htmlFor="adv-date">Date</label><input id="adv-date" type="date" max={todayISO()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="adv-note">Note</label><input id="adv-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Eid" className={inputCls} /></div>
        <div className="col-span-2 flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button><button type="submit" className={primaryBtn}>Give advance</button></div>
      </form>
    </Modal>
  );
};

const SalarySheetModal: React.FC<{ onClose: () => void; onDone: Flash }> = ({ onClose, onDone }) => {
  const { staff, staffAdvances, salaryRuns, paySalaries } = useTrading();
  const today = todayISO();
  const [month, setMonth] = useState(() => {
    const cur = monthOf(today);
    return salaryRuns.some((r) => r.month === addMonths(cur, -1)) ? cur : addMonths(cur, -1);
  });
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState('Cash');
  const [lines, setLines] = useState<SalaryLine[]>(() => salarySheetDraft(staff, staffAdvances, salaryRuns, month));
  const [error, setError] = useState('');
  const changeMonth = (m: string) => { setMonth(m); setLines(salarySheetDraft(staff, staffAdvances, salaryRuns, m)); };
  const setLine = (i: number, key: 'salary' | 'bonus' | 'deductions' | 'advanceDeducted', v: string) =>
    setLines((prev) => prev.map((l, idx) => { if (idx !== i) return l; const next = { ...l, [key]: parseFloat(v) || 0 }; return { ...next, net: salaryNet(next) }; }));
  const t = salaryTotals(lines);
  const paid = salaryRuns.find((r) => r.month === month);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = paySalaries({ month, date, method, lines });
    if (!r.success) return setError(r.message);
    onDone(r);
    onClose();
  };
  const num = (id: string, value: number, on: (v: string) => void, label: string) => (
    <input id={id} aria-label={label} type="number" inputMode="decimal" min="0" step="any" value={value || ''} placeholder="0" onChange={(e) => on(e.target.value)} className={`${inputCls} tabular-nums !px-2 text-right`} />
  );
  return (
    <Modal isOpen onClose={onClose} title="Salary sheet" subtitle="Check each line, then pay. Advances are recovered from the salary." wide
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs tabular-nums space-x-3"><span>Salaries <b>{rs(t.gross)}</b></span><span>Advances <b>{rs(t.advance)}</b></span><span>To pay <b data-testid="salary-net-total">{rs(t.net)}</b></span></div>
          <div className="flex gap-2"><button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button><button type="submit" form="salary-form" disabled={Boolean(paid) || lines.length === 0} className={primaryBtn}><Wallet className="w-4 h-4" /> Pay salaries</button></div>
        </div>
      }>
      <form id="salary-form" onSubmit={submit} className="space-y-3">
        {error && <Notice kind="error">{error}</Notice>}
        {paid && <Notice kind="error">Salaries for {monthLabel(month)} were already paid on {formatDate(paid.date)}.</Notice>}
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelCls} htmlFor="sal-month">Month</label><input id="sal-month" type="month" max={monthOf(today)} value={month} onChange={(e) => e.target.value && changeMonth(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="sal-date">Paid on</label><input id="sal-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="sal-method">Paid from</label><select id="sal-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{MONEY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
        </div>
        {lines.length === 0 && <p className="text-sm text-[#8E9299]">No active staff for this month.</p>}
        <div className="space-y-2">
          {lines.map((l, i) => {
            const owed = Math.max(0, advanceBalance(l.staffId, staffAdvances, salaryRuns));
            return (
              <div key={l.staffId} className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3" data-testid="salary-line">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0"><div className="font-semibold text-sm truncate">{l.name}</div><div className="text-[11px] text-[#8E9299]">{l.role}{owed > 0 ? ` • owes ${rs(owed)} advance` : ''}</div></div>
                  <div className="text-right"><div className="text-[10px] uppercase font-bold text-[#8E9299]">Net</div><div className={`tabular-nums font-extrabold ${l.net < 0 ? 'text-rose-700' : ''}`}>{rs(l.net)}</div></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><label className={labelCls} htmlFor={`sal-${i}-s`}>Salary</label>{num(`sal-${i}-s`, l.salary, (v) => setLine(i, 'salary', v), `Salary for ${l.name}`)}</div>
                  <div><label className={labelCls} htmlFor={`sal-${i}-b`}>Bonus</label>{num(`sal-${i}-b`, l.bonus, (v) => setLine(i, 'bonus', v), `Bonus for ${l.name}`)}</div>
                  <div><label className={labelCls} htmlFor={`sal-${i}-d`}>Deductions</label>{num(`sal-${i}-d`, l.deductions, (v) => setLine(i, 'deductions', v), `Deductions for ${l.name}`)}</div>
                  <div><label className={labelCls} htmlFor={`sal-${i}-a`}>Advance cut</label>{num(`sal-${i}-a`, l.advanceDeducted, (v) => setLine(i, 'advanceDeducted', v), `Advance recovered from ${l.name}`)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </form>
    </Modal>
  );
};

const StaffLedgerModal: React.FC<{ member: StaffMember; onClose: () => void }> = ({ member, onClose }) => {
  const { staffAdvances, salaryRuns, setPrintRequest } = useTrading();
  const rows = staffLedger(member.id, staffAdvances, salaryRuns);
  return (
    <Modal isOpen onClose={onClose} title={`${member.name}: account`} subtitle="Advances given, recovered from salary, and salaries paid." wide
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setPrintRequest({ type: 'staff_ledger', staffId: member.id })} className={secondaryBtn}><Printer className="w-4 h-4" /> Print</button><button type="button" onClick={onClose} className={primaryBtn}>Done</button></div>}>
      {rows.length === 0 ? <p className="text-sm text-[#8E9299]">Nothing yet.</p> : (
        <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]" data-testid="staff-ledger">
          {rows.map((r, i) => (
            <li key={i} className="py-2 flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0"><div className="font-semibold">{r.text}</div><div className="text-[11px] text-[#8E9299]">{formatDate(r.date)}{r.salaryPaid ? ` • paid ${rs(r.salaryPaid)}` : ''}</div></div>
              <div className="text-right tabular-nums shrink-0">
                {r.advance > 0 && <div className="text-rose-700 dark:text-rose-300">+ {rs(r.advance)}</div>}
                {r.recovered > 0 && <div className="text-teal-700 dark:text-teal-300">− {rs(r.recovered)}</div>}
                <div className="text-[11px] text-[#8E9299]">owes {rs(r.balance)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

/** Accounts → Staff & salaries. */
export const StaffTab: React.FC<{ flash: Flash }> = ({ flash }) => {
  const { staff, staffAdvances, salaryRuns, can, deleteStaff, deleteStaffAdvance, undoSalaryRun, setPrintRequest } = useTrading();
  const canEdit = can('finance:cashbook');
  const canRemove = canEdit && can('delete_records');
  const [modal, setModal] = useState<{ kind: 'staff'; member?: StaffMember } | { kind: 'advance'; staffId?: string } | { kind: 'sheet' } | { kind: 'ledger'; member: StaffMember } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; label: string; action: () => void } | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const owed = (id: string) => advanceBalance(id, staffAdvances, salaryRuns);
  const totalOwed = useMemo(() => staff.reduce((a, s) => a + Math.max(0, advanceBalance(s.id, staffAdvances, salaryRuns)), 0), [staff, staffAdvances, salaryRuns]);
  const monthlyBill = staff.filter((s) => s.active).reduce((a, s) => a + s.monthlySalary, 0);
  const list = staff.filter((s) => showLeft || s.active).sort((a, b) => a.name.localeCompare(b.name));
  const runs = [...salaryRuns].sort((a, b) => (a.month < b.month ? 1 : -1));
  const recentAdvances = [...staffAdvances].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name || 'Staff';

  return (
    <div className="space-y-4" data-testid="staff-tab">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Staff working" value={String(staff.filter((s) => s.active).length)} />
        <Tile label="Monthly salaries" value={rs(monthlyBill)} />
        <Tile label="Advances outstanding" value={rs(totalOwed)} tone={totalOwed > 0 ? 'warn' : 'default'} hint="Money staff still owe the shop" />
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setModal({ kind: 'sheet' })} className={primaryBtn} disabled={staff.length === 0}><Wallet className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Salary sheet</button>
          <button type="button" onClick={() => setModal({ kind: 'staff' })} className={secondaryBtn}><Plus className="w-4 h-4" /> Add staff</button>
          <button type="button" onClick={() => setModal({ kind: 'advance' })} className={secondaryBtn} disabled={staff.length === 0}><HandCoins className="w-4 h-4" /> Give advance</button>
        </div>
      )}

      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
          <h2 className="font-bold text-[#111827] dark:text-white">Staff</h2>
          <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> Show staff who left</label>
        </div>
        {list.length === 0 ? <EmptyState text="No staff yet. Add the people who work in the shop to run the monthly salary sheet." /> : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {list.map((s) => {
              const o = owed(s.id);
              return (
                <li key={s.id} className="px-4 sm:px-5 py-3" data-testid="staff-row">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{s.name}{!s.active && <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">Left</span>}</div>
                      <div className="text-[11px] text-[#8E9299]">{s.role || 'Staff'} • since {formatDate(s.joinDate)}{s.phone ? ` • ${s.phone}` : ''}</div>
                    </div>
                    <div className="text-right tabular-nums shrink-0"><div className="font-bold text-sm">{rs(s.monthlySalary)}</div>{o > 0 && <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">owes {rs(o)}</div>}</div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1 -ml-2">
                    <RowAction label={`Account of ${s.name}`} text="Account" alwaysText icon={<BookOpen className="w-4 h-4" />} onClick={() => setModal({ kind: 'ledger', member: s })} />
                    {canEdit && <RowAction label={`Advance to ${s.name}`} text="Advance" alwaysText icon={<HandCoins className="w-4 h-4" />} onClick={() => setModal({ kind: 'advance', staffId: s.id })} />}
                    {canEdit && <RowAction label={`Edit ${s.name}`} icon={<Pencil className="w-4 h-4" />} onClick={() => setModal({ kind: 'staff', member: s })} />}
                    {canRemove && <RowAction label={`Remove ${s.name}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirm({ title: `Remove ${s.name}?`, message: 'Only for someone added by mistake. Staff who left should be edited and marked as left.', label: 'Remove', action: () => flash(deleteStaff(s.id)) })} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {runs.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248] font-bold">Salaries paid</div>
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {runs.map((r) => (
              <li key={r.id} className="px-4 sm:px-5 py-3" data-testid="salary-run">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="font-semibold text-sm">{monthLabel(r.month)}</div><div className="text-[11px] text-[#8E9299]">Paid {formatDate(r.date)} by {r.method} • {r.lines.length} staff{r.totalAdvance ? ` • ${rs(r.totalAdvance)} advances recovered` : ''}</div></div>
                  <div className="tabular-nums font-bold text-sm">{rs(r.totalNet)}</div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1 -ml-2">
                  <RowAction label={`Print salary sheet ${monthLabel(r.month)}`} text="Sheet" alwaysText icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'salary_sheet', runId: r.id })} />
                  {r.lines.map((l) => <RowAction key={l.staffId} label={`Payslip for ${l.name}, ${monthLabel(r.month)}`} text={`Payslip: ${l.name}`} alwaysText icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'payslip', runId: r.id, staffId: l.staffId })} />)}
                  {canRemove && <RowAction label={`Undo salaries ${monthLabel(r.month)}`} tone="danger" icon={<Undo2 className="w-4 h-4" />} onClick={() => setConfirm({ title: `Undo salaries for ${monthLabel(r.month)}?`, message: `The salary payment of ${rs(r.totalNet)} is taken out of the books and advances recovered go back on the staff accounts.`, label: 'Undo salaries', action: () => flash(undoSalaryRun(r.id)) })} />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentAdvances.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248] font-bold">Recent advances</div>
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {recentAdvances.map((a) => (
              <li key={a.id} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-sm font-semibold">{nameOf(a.staffId)}</div><div className="text-[11px] text-[#8E9299]">{formatDate(a.date)} • {a.method}{a.note ? ` • ${a.note}` : ''}</div></div>
                <div className="flex items-center gap-1"><span className="tabular-nums font-bold text-sm">{rs(a.amount)}</span>{canRemove && <RowAction label={`Delete advance to ${nameOf(a.staffId)}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirm({ title: 'Delete this advance?', message: 'It is removed from the staff account and the cash book.', label: 'Delete', action: () => flash(deleteStaffAdvance(a.id)) })} />}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modal?.kind === 'staff' && <StaffModal member={modal.member} onClose={() => setModal(null)} onDone={flash} />}
      {modal?.kind === 'advance' && <AdvanceModal staffId={modal.staffId} onClose={() => setModal(null)} onDone={flash} />}
      {modal?.kind === 'sheet' && <SalarySheetModal onClose={() => setModal(null)} onDone={flash} />}
      {modal?.kind === 'ledger' && <StaffLedgerModal member={modal.member} onClose={() => setModal(null)} />}
      <ConfirmDialog isOpen={Boolean(confirm)} title={confirm?.title || ''} message={confirm?.message || ''} confirmLabel={confirm?.label} onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.action(); setConfirm(null); }} />
    </div>
  );
};
