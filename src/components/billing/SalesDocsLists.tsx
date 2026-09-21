import React, { useMemo, useState } from 'react';
import { Printer, Trash2, MessageCircle, FilePlus2, Pencil } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from './BillingUI';
import { cardCls, rs, Notice } from './ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { quotationLines, quotationStatusOn } from '../../utils/salesDocs';
import { Quotation, StockReturn } from '../../types';

const iconBtn = 'p-2 rounded-xl text-[#9CA3AF] hover:text-[#111827] dark:hover:text-white hover:bg-white dark:hover:bg-[#1E2E40]';

/** Goods customers brought back on their bills (credit notes), newest first. */
export const ReturnsList: React.FC = () => {
  const { returns, invoices, customers, setPrintRequest, deleteReturn, can } = useTrading();
  const ui = useBillingUI();
  const [pending, setPending] = useState<StockReturn | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const rows = useMemo(() => returns.filter((r) => r.kind === 'sales' && r.invoiceId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt))), [returns]);
  const canDelete = can('delete_records');
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <div className="space-y-3">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{rows.length} return{rows.length === 1 ? '' : 's'}{total > 0 ? ` • ${rs(total)}` : ''}. To return goods, open the bill and tap “Return items”.</p>
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280] dark:text-[#94A3B8]">No returns yet.</div>
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {rows.map((r) => {
              const inv = invoices.find((i) => i.id === r.invoiceId);
              const who = customers.find((c) => c.id === r.customerId)?.name || inv?.customerName || 'Customer';
              return (
                <li key={r.id} className="flex items-center gap-2 px-3 sm:px-5 py-3 hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                  <button type="button" onClick={() => inv && ui.openBill(inv.id)} className="flex-1 min-w-0 text-left">
                    <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{who}</div>
                    <div className="text-[11px] text-[#8E9299] truncate">{r.returnNumber} • {formatDate(r.date)}{inv ? ` • bill ${inv.invoiceNumber}` : ''} • {(r.items || []).map((l) => `${l.productName} × ${l.qty}`).join(', ')}</div>
                  </button>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-sm text-amber-700 dark:text-amber-300">− {rs(r.amount)}</div>
                    <div className="text-[11px] text-[#8E9299]">{(r.refundAmount || 0) > 0 ? `${rs(r.refundAmount || 0)} given back` : 'off account'}</div>
                  </div>
                  <button type="button" onClick={() => setPrintRequest({ type: 'note', returnId: r.id })} aria-label={`Print credit note ${r.returnNumber}`} className={iconBtn}><Printer className="w-4 h-4" /></button>
                  {canDelete && <button type="button" onClick={() => setPending(r)} aria-label={`Delete return ${r.returnNumber}`} className={`${iconBtn} hover:text-rose-600`}><Trash2 className="w-4 h-4" /></button>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={`Delete return ${pending?.returnNumber || ''}?`}
        message="The goods come off the shelf again, the customer's account goes back up, and any money given back is put back in the cash book."
        details={pending ? [`Value ${rs(pending.amount)}`] : []}
        confirmLabel="Delete return"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            const r = deleteReturn(pending.id);
            setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
          }
          setPending(null);
        }}
      />
    </div>
  );
};

const STATUS: Record<Quotation['status'], { label: string; cls: string }> = {
  draft: { label: 'Not sent', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  sent: { label: 'Sent', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  accepted: { label: 'Agreed', cls: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  rejected: { label: 'Declined', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  expired: { label: 'Expired', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  converted: { label: 'Billed', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
};

/** Price offers made in billing mode: print or WhatsApp them, and turn them into bills. */
export const QuotationsList: React.FC = () => {
  const { quotations, customers, invoices, products, setPrintRequest, setQuotationStatus, deleteQuotation, can } = useTrading();
  const ui = useBillingUI();
  const [pending, setPending] = useState<Quotation | null>(null);
  const today = todayISO();
  const rows = useMemo(() => quotations.filter((q) => q.items?.length).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.quoteNumber.localeCompare(a.quoteNumber, undefined, { numeric: true }))), [quotations]);
  const canDelete = can('delete_records');

  const whatsapp = (q: Quotation) => {
    const c = customers.find((x) => x.id === q.customerId);
    const lines = quotationLines(q, (id) => products.find((p) => p.id === id)?.name).map((l) => `• ${l.productName} × ${l.qty} @ ${rs(l.unitPrice)} = ${rs(l.qty * l.unitPrice)}`).join('\n');
    const text = `*Quotation ${q.quoteNumber}*\n${lines}\nTotal: *${rs(q.amount)}*\nPrices good until ${formatDate(q.validUntil)}.`;
    window.open(`https://wa.me/${(c?.phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    if (q.status === 'draft') setQuotationStatus(q.id, 'sent');
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">A quotation is a price offer. When the customer agrees, tap “Make bill”.</p>
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280] dark:text-[#94A3B8]">No quotations yet.</div>
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {rows.map((q) => {
              const st = quotationStatusOn(q, today);
              const who = customers.find((c) => c.id === q.customerId)?.name || 'Customer';
              const billed = q.invoiceId ? invoices.find((i) => i.id === q.invoiceId) : undefined;
              return (
                <li key={q.id} className="px-3 sm:px-5 py-3 hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{who} <span className={`ml-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS[st].cls}`}>{STATUS[st].label}</span></div>
                      <div className="text-[11px] text-[#8E9299] truncate">{q.quoteNumber} • good until {formatDate(q.validUntil)} • {quotationLines(q).map((l) => `${l.productName} × ${l.qty}`).join(', ')}</div>
                    </div>
                    <div className="font-mono font-bold text-sm text-[#111827] dark:text-white shrink-0">{rs(q.amount)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {st !== 'converted' ? (
                      <button type="button" onClick={() => ui.billFromQuote(q.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-700 text-white text-xs font-bold" aria-label={`Make bill from ${q.quoteNumber}`}><FilePlus2 className="w-3.5 h-3.5" /> Make bill</button>
                    ) : billed ? (
                      <button type="button" onClick={() => ui.openBill(billed.id)} className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:underline">Bill {billed.invoiceNumber}</button>
                    ) : null}
                    <button type="button" onClick={() => setPrintRequest({ type: 'quotation', quotationId: q.id })} aria-label={`Print ${q.quoteNumber}`} className={iconBtn}><Printer className="w-4 h-4" /></button>
                    <button type="button" onClick={() => whatsapp(q)} aria-label={`WhatsApp ${q.quoteNumber}`} className={iconBtn}><MessageCircle className="w-4 h-4 text-emerald-600" /></button>
                    {st !== 'converted' && <button type="button" onClick={() => ui.editQuote(q.id)} aria-label={`Edit ${q.quoteNumber}`} className={iconBtn}><Pencil className="w-4 h-4" /></button>}
                    {st !== 'converted' && st !== 'accepted' && <button type="button" onClick={() => setQuotationStatus(q.id, 'accepted')} className="px-2 py-1.5 rounded-xl text-xs font-semibold text-[#6B7280] hover:text-teal-700">Mark agreed</button>}
                    {st !== 'converted' && st !== 'rejected' && <button type="button" onClick={() => setQuotationStatus(q.id, 'rejected')} className="px-2 py-1.5 rounded-xl text-xs font-semibold text-[#6B7280] hover:text-rose-700">Declined</button>}
                    {canDelete && <button type="button" onClick={() => setPending(q)} aria-label={`Delete ${q.quoteNumber}`} className={`${iconBtn} hover:text-rose-600 ml-auto`}><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={`Delete quotation ${pending?.quoteNumber || ''}?`}
        message="Only the quotation is removed. Any bill made from it stays."
        confirmLabel="Delete quotation"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) deleteQuotation(pending.id);
          setPending(null);
        }}
      />
    </div>
  );
};
