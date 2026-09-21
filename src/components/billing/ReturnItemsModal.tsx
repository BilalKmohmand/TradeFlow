import React, { useMemo, useRef, useState } from 'react';
import { RotateCcw, Printer } from 'lucide-react';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice, rs } from './ui';
import { planReturn, returnableQty, maxRefund, billNetTotal } from '../../utils/salesDocs';
import { lineQty } from '../../utils/billing';
import { todayISO } from '../../utils/stockFlow';

interface Props {
  invoiceId: string | null;
  onClose: () => void;
  /** Called with the bill id after the return is saved (the bill opens again). */
  onDone: (invoiceId: string) => void;
}

/**
 * Goods coming back on a bill: tick how many of each item, then either give the money back now
 * or take it off what the customer owes. Stock goes back where it came from.
 */
export const ReturnItemsModal: React.FC<Props> = ({ invoiceId, onClose, onDone }) => {
  const { invoices, returns, returnBillItems, setPrintRequest } = useTrading();
  const inv = invoices.find((i) => i.id === invoiceId) || null;
  const [qty, setQty] = useState<Record<string, string>>({});
  const [settle, setSettle] = useState<'refund' | 'credit' | null>(null);
  const [method, setMethod] = useState('Cash');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');
  const [print, setPrint] = useState(true);
  const busy = useRef(false);

  const left = useMemo(() => (inv ? returnableQty(inv, returns) : new Map<string, number>()), [inv, returns]);
  const picks = inv ? inv.items.map((it) => ({ billLineId: it.id, qty: Math.max(0, parseFloat(qty[it.id] || '') || 0) })) : [];
  const plan = inv && picks.some((p) => p.qty > 0) ? planReturn(inv, returns, picks) : null;
  const total = plan?.ok ? plan.total : 0;
  const refundable = inv && plan?.ok ? maxRefund(inv, total) : 0;
  // Default choice: money back when they have paid for it, else off what they owe.
  const mode: 'refund' | 'credit' = refundable <= 0 ? 'credit' : settle ?? 'refund';
  const offOwed = mode === 'refund' ? Math.max(0, Math.round((total - refundable) * 100) / 100) : total;

  const save = () => {
    if (!inv || busy.current) return;
    setError('');
    busy.current = true;
    const r = returnBillItems({ invoiceId: inv.id, lines: picks, settle: mode, refundMethod: method, reason, date });
    if (!r.success) {
      busy.current = false;
      return setError(r.message);
    }
    onDone(inv.id);
    if (print && r.stockReturn) setPrintRequest({ type: 'note', returnId: r.stockReturn.id });
  };

  const nothingLeft = inv ? inv.items.every((it) => (left.get(it.id) || 0) <= 0) : true;

  return (
    <Modal
      isOpen={Boolean(inv)}
      onClose={onClose}
      title={inv ? `Return items — Bill ${inv.invoiceNumber}` : 'Return items'}
      subtitle={inv ? `${inv.customerName} • enter how many came back` : undefined}
      wide
      footer={inv && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 text-sm">
            <span className="text-[#6B7280] dark:text-[#94A3B8]">Return value </span>
            <span className="font-mono font-extrabold text-lg text-[#111827] dark:text-white" data-testid="return-total">{rs(total)}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
            <button type="button" onClick={save} disabled={!plan?.ok} className={primaryBtn}><RotateCcw className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Save return</button>
          </div>
        </div>
      )}
    >
      {inv && (
        <div className="space-y-5">
          {error && <Notice kind="error">{error}</Notice>}
          {nothingLeft && <Notice kind="error">Everything on this bill has already been returned.</Notice>}

          <div className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {inv.items.map((it, idx) => {
              const can = left.get(it.id) || 0;
              const sold = lineQty(it);
              return (
                <div key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{it.productName}</div>
                    <div className="text-[11px] text-[#8E9299]">Sold {sold} {it.unit || ''}{sold - can > 0 ? ` • ${Math.round((sold - can) * 100) / 100} already back` : ''} • {rs(sold > 0 ? it.amount / sold : 0)} each</div>
                  </div>
                  <div className="w-28 shrink-0">
                    <input
                      aria-label={`Return qty ${idx + 1}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={can}
                      step="any"
                      disabled={can <= 0}
                      value={qty[it.id] || ''}
                      onChange={(e) => setQty((q) => ({ ...q, [it.id]: e.target.value }))}
                      className={`${inputCls} font-mono`}
                      placeholder={can > 0 ? `max ${can}` : 'none left'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {plan && !plan.ok && <Notice kind="error">{plan.message}</Notice>}

          <div>
            <span className={labelCls}>Settle the return</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Settle the return">
              <button type="button" role="radio" aria-checked={mode === 'refund'} disabled={refundable <= 0} onClick={() => setSettle('refund')} className={`text-left rounded-2xl border p-3 text-sm disabled:opacity-40 ${mode === 'refund' ? 'border-teal-600 ring-1 ring-teal-600 bg-teal-50/50 dark:bg-teal-950/20' : 'border-[#E5E5E1] dark:border-[#203248]'}`}>
                <div className="font-bold text-[#111827] dark:text-white">Give money back now</div>
                <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{refundable > 0 ? `Up to ${rs(refundable)} (what they paid for these)` : total > 0 ? 'Nothing paid on this bill to give back' : 'Cash, bank or wallet'}</div>
              </button>
              <button type="button" role="radio" aria-checked={mode === 'credit'} onClick={() => setSettle('credit')} className={`text-left rounded-2xl border p-3 text-sm ${mode === 'credit' ? 'border-teal-600 ring-1 ring-teal-600 bg-teal-50/50 dark:bg-teal-950/20' : 'border-[#E5E5E1] dark:border-[#203248]'}`}>
                <div className="font-bold text-[#111827] dark:text-white">Take it off what they owe</div>
                <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">Their account goes down by the return value</div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {mode === 'refund' && (
              <div>
                <label className={labelCls} htmlFor="ret-method">Paid back by</label>
                <select id="ret-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{BILL_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
              </div>
            )}
            <div>
              <label className={labelCls} htmlFor="ret-date">Date</label>
              <input id="ret-date" type="date" value={date} min={inv.issueDate} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div className={mode === 'refund' ? '' : 'sm:col-span-2'}>
              <label className={labelCls} htmlFor="ret-reason">Why (optional)</label>
              <input id="ret-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. dented tins" />
            </div>
          </div>

          {total > 0 && (
            <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] p-4 space-y-1.5 text-sm">
              {plan?.ok && plan.tax > 0 && <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8]"><span>Includes tax</span><span className="font-mono">{rs(plan.tax)}</span></div>}
              {mode === 'refund' && refundable > 0 && <div className="flex justify-between font-bold text-rose-700 dark:text-rose-300"><span>Give back ({method})</span><span className="font-mono">{rs(Math.min(refundable, total))}</span></div>}
              {offOwed > 0 && <div className="flex justify-between font-bold text-teal-700 dark:text-teal-300"><span>Off what they owe</span><span className="font-mono">{rs(offOwed)}</span></div>}
              <div className="flex justify-between text-[#6B7280] dark:text-[#94A3B8] border-t border-[#E5E5E1] dark:border-[#203248] pt-1.5"><span>Bill after return</span><span className="font-mono">{rs(Math.max(0, billNetTotal(inv) - total))}</span></div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-[#111827] dark:text-white">
            <input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} className="w-4 h-4 accent-teal-600" />
            <Printer className="w-4 h-4 text-[#6B7280]" /> Print the credit note after saving
          </label>
        </div>
      )}
    </Modal>
  );
};
