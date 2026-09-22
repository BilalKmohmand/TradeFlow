import React, { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock, ShieldCheck, ChevronRight, Undo2 } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { ApprovalRequest } from '../../types';
import { Modal, Notice, cardCls, inputCls, primaryBtn, secondaryBtn, dangerBtn, rs, moneyCls, EmptyState, pillCls } from '../billing/ui';
import { formatDate } from '../../utils/formatters';
import { RULE_LABEL } from '../../utils/control';
import { adjustmentReasonLabel } from '../../types';

const when = (iso?: string) => (iso ? `${formatDate(iso.slice(0, 10))} ${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '');

const STATUS: Record<ApprovalRequest['status'], { label: string; cls: string }> = {
  pending: { label: 'Waiting for approval', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
  approved: { label: 'Approved', cls: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
  cancelled: { label: 'Taken back', cls: 'bg-[#F4F3EF] text-[#6B7280] dark:bg-[#162436] dark:text-[#94A3B8]' },
};

/** What the request would post, in plain words. */
const Details: React.FC<{ req: ApprovalRequest }> = ({ req }) => {
  const { customers, suppliers, products } = useTrading();
  const p = req.payload || {};
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3"><span className="text-[#6B7280] dark:text-[#94A3B8]">{label}</span><span className="text-right font-semibold text-[#111827] dark:text-white">{value}</span></div>
  );
  if (req.kind === 'bill') {
    const cust = customers.find((c) => c.id === p.customerId)?.name || p.newCustomer?.name || 'Customer';
    const paid = (p.payments || []).reduce((a: number, x: { amount: number }) => a + (Number(x.amount) || 0), 0) + (Number(p.paidNow) || 0) + (Number(p.cheque?.amount) || 0);
    return (
      <div className="space-y-1 text-xs">
        {row('Customer', cust)}
        {row('Date', formatDate(p.date || req.requestedAt.slice(0, 10)))}
        <ul className="rounded-xl border border-[#E5E5E1] dark:border-[#203248] divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] my-1">
          {(p.items || []).map((it: any, i: number) => (
            <li key={i} className="flex justify-between gap-2 px-2.5 py-1.5">
              <span className="min-w-0 truncate">{it.name || products.find((x) => x.id === it.productId)?.name} × {it.qty} @ {rs(it.unitPrice)}{it.discountValue ? <span className="text-amber-700 dark:text-amber-300"> − {it.discountType === 'pct' ? `${it.discountValue}%` : rs(it.discountValue)}</span> : null}</span>
              <span className={moneyCls}>{rs(it.qty * it.unitPrice)}</span>
            </li>
          ))}
        </ul>
        {Number(p.discount) > 0 && row('Bill discount', rs(p.discount))}
        {row('Paid now', paid > 0 ? rs(paid) : 'nothing (on credit)')}
      </div>
    );
  }
  if (req.kind === 'supplier_payment') {
    const s = suppliers.find((x) => x.id === p.supplierId);
    return <div className="space-y-1 text-xs">{row('Supplier', s?.company || s?.name || 'Supplier')}{row('Amount', rs(p.amount))}{row('How', p.notes || 'Cash')}{row('Date', formatDate(p.date))}{s && row('You owe them now', rs(s.totalOwed))}</div>;
  }
  if (req.kind === 'supplier_cheque') {
    const s = suppliers.find((x) => x.id === p.supplierId);
    return <div className="space-y-1 text-xs">{row('Supplier', s?.company || s?.name || 'Supplier')}{row('Cheque', `#${p.chequeNumber} ${p.bankName}`)}{row('Amount', rs(p.amount))}{row('Cheque date', formatDate(p.chequeDate))}</div>;
  }
  if (req.kind === 'stock_loss') {
    const it = products.find((x) => x.id === p.productId);
    return <div className="space-y-1 text-xs">{row('Item', it?.name || 'Item')}{row('Take off', `${Math.abs(p.deltaQty)} ${it?.unit || 'pcs'}`)}{row('Why', adjustmentReasonLabel(p.reason))}{p.note && row('Note', p.note)}{row('Date', formatDate(p.date))}{it && row('In stock now', `${it.stockKg} ${it.unit || 'pcs'}`)}</div>;
  }
  if (req.kind === 'delete_bill') return <div className="space-y-1 text-xs">{row('Bill', p.invoiceNumber)}{row('Reason', req.note || 'No reason given')}</div>;
  if (req.kind === 'voucher') {
    const who = (ref: string) => {
      if (ref.startsWith('supp:')) { const s = suppliers.find((x) => x.id === ref.slice(5)); return s?.company || s?.name || 'Supplier'; }
      if (ref.startsWith('cust:')) return customers.find((x) => x.id === ref.slice(5))?.name || 'Customer';
      return `Account ${ref}`;
    };
    return (
      <div className="space-y-1 text-xs">
        {row('Voucher', `${p.type} — ${p.narration || ''}`)}
        {row('Date', formatDate(p.date))}
        <ul className="rounded-xl border border-[#E5E5E1] dark:border-[#203248] divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] my-1">
          {(p.lines || []).map((l: { account: string; debit: number; credit: number }, i: number) => (
            <li key={i} className="flex justify-between gap-2 px-2.5 py-1.5"><span className="min-w-0 truncate">{who(l.account)}</span><span className={moneyCls}>{Number(l.debit) > 0 ? `Dr ${rs(l.debit)}` : `Cr ${rs(l.credit)}`}</span></li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
};

const RequestCard: React.FC<{ req: ApprovalRequest; onMsg: (m: { kind: 'ok' | 'error'; text: string }) => void }> = ({ req, onMsg }) => {
  const { canApprove, approveRequest, rejectRequest, cancelRequest, currentUser, branchesEnabled, branchName } = useTrading();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(req.status === 'pending');
  const mine = req.requestedById === currentUser?.id;
  const st = STATUS[req.status];
  const act = (r: { success: boolean; message: string }) => onMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
  return (
    <li className="px-4 sm:px-5 py-3.5 space-y-2" data-testid="approval-request">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-start gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-[#111827] dark:text-white">{req.title}</div>
          <div className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">
            {req.rules.map((r) => RULE_LABEL[r]).join(' • ')} • asked by {req.requestedBy || 'staff'} {when(req.requestedAt)}{branchesEnabled && req.branchId ? ` • ${branchName(req.branchId)}` : ''}
          </div>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cls}`}>{st.label}</span>
      </button>
      {open && (
        <div className="space-y-2.5">
          <ul className="text-xs font-semibold text-amber-800 dark:text-amber-300 list-disc pl-5">{req.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          {req.note && req.kind !== 'delete_bill' && <p className="text-xs text-[#374151] dark:text-[#CBD5E1]"><strong>Note:</strong> {req.note}</p>}
          <Details req={req} />
          {req.status !== 'pending' && (
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
              {st.label} by {req.decidedBy} {when(req.decidedAt)}{req.resultRef ? ` • ${req.resultRef}` : ''}{req.decisionNote ? ` — “${req.decisionNote}”` : ''}
            </p>
          )}
          {req.status === 'pending' && canApprove && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} flex-1`} placeholder="Note (needed to reject)" aria-label={`Note for ${req.title}`} />
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button type="button" onClick={() => act(rejectRequest(req.id, note))} className={dangerBtn}><XCircle className="w-4 h-4" /> Reject</button>
                <button type="button" onClick={() => act(approveRequest(req.id, note))} className={primaryBtn}><CheckCircle2 className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Approve</button>
              </div>
            </div>
          )}
          {req.status === 'pending' && !canApprove && mine && (
            <button type="button" onClick={() => act(cancelRequest(req.id))} className={secondaryBtn}><Undo2 className="w-4 h-4" /> Take back</button>
          )}
        </div>
      )}
    </li>
  );
};

/** Approvals inbox: managers approve or reject; staff see what they sent and what happened to it. */
export const ApprovalsInbox: React.FC = () => {
  const { approvals, canApprove, currentUser } = useTrading();
  const [view, setView] = useState<'pending' | 'done'>('pending');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const visible = useMemo(() => (canApprove ? approvals : approvals.filter((a) => a.requestedById === currentUser?.id)), [approvals, canApprove, currentUser?.id]);
  const pending = visible.filter((a) => a.status === 'pending');
  const done = visible.filter((a) => a.status !== 'pending').slice(0, 100);
  const rows = view === 'pending' ? pending : done;
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5" role="tablist" aria-label="Approvals">
        <button type="button" role="tab" aria-selected={view === 'pending'} onClick={() => setView('pending')} className={pillCls(view === 'pending', 'amber')}>Waiting ({pending.length})</button>
        <button type="button" role="tab" aria-selected={view === 'done'} onClick={() => setView('done')} className={pillCls(view === 'done')}>Done</button>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <EmptyState compact icon={<ShieldCheck className="w-5 h-5" />} text={view === 'pending' ? (canApprove ? 'Nothing is waiting for approval.' : 'You have nothing waiting for approval.') : 'No approved or rejected requests yet.'} />
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">{rows.map((r) => <RequestCard key={r.id} req={r} onMsg={setMsg} />)}</ul>
        )}
      </div>
      {!canApprove && <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">A manager or admin approves these. Nothing is posted to the books or the stock until then.</p>}
    </div>
  );
};

export const ApprovalsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Approvals" subtitle="Documents waiting for a manager. Nothing is posted until approved." wide>
    <ApprovalsInbox />
  </Modal>
);

/** Home / Bills: "3 waiting for approval" — opens the inbox. Hidden when nothing is waiting. */
export const ApprovalsTile: React.FC<{ kind?: ApprovalRequest['kind'] }> = ({ kind }) => {
  const { approvals, canApprove, currentUser } = useTrading();
  const [open, setOpen] = useState(false);
  const mine = approvals.filter((a) => a.status === 'pending' && (!kind || a.kind === kind) && (canApprove || a.requestedById === currentUser?.id));
  // The inbox stays open after the last request is decided (so the result can be read).
  if (mine.length === 0 && !open) return null;
  const total = mine.reduce((a, r) => a + r.amount, 0);
  return (
    <>
      {mine.length > 0 && <button type="button" data-testid="approvals-tile" onClick={() => setOpen(true)} className={`${cardCls} w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left border-amber-300 dark:border-amber-900 hover:shadow-sm transition`}>
        <span className="w-9 h-9 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0"><Clock className="w-4 h-4" /></span>
        <span className="flex-1 min-w-0 text-sm text-[#374151] dark:text-[#CBD5E1]">
          <strong className="text-[#111827] dark:text-white">{mine.length} waiting for approval</strong>
          <span className="block text-[11px] text-[#6B7280] dark:text-[#8E9299]">{canApprove ? 'Tap to approve or reject' : 'Sent to a manager'} • <span className={moneyCls}>{rs(total)}</span></span>
        </span>
        <ChevronRight className="w-4 h-4 text-[#9CA3AF] shrink-0" />
      </button>}
      <ApprovalsModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};
