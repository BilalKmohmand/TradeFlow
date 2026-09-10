import React, { useState } from 'react';
import { Printer, Trash2, Wallet, MessageCircle } from 'lucide-react';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn, Notice, rs } from './ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { formatDate } from '../../utils/formatters';
import { lineQty, linePrice } from '../../utils/billing';
import { todayISO } from '../../utils/stockFlow';

interface Props {
  invoiceId: string | null;
  onClose: () => void;
}

/** One bill: its lines, its payments, and the three things you do with it — take money, print, delete. */
export const BillDetailModal: React.FC<Props> = ({ invoiceId, onClose }) => {
  const { invoices, customers, payBill, deleteBill, setPrintRequest, can, currentUser } = useTrading();
  const inv = invoices.find((i) => i.id === invoiceId) || null;
  const customer = inv ? customers.find((c) => c.id === inv.customerId) : undefined;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = can('delete_records') || can('system:admin_screen') || can('admin_screen') || currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  const takePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inv) return;
    const r = payBill(inv.id, parseFloat(amount) || 0, method, note.trim() || undefined);
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) {
      setAmount('');
      setNote('');
    }
  };

  const whatsapp = () => {
    if (!inv) return;
    const lines = inv.items.map((it) => `• ${it.productName} × ${lineQty(it)} @ ${rs(linePrice(it))} = ${rs(it.amount)}`).join('\n');
    const text = `*Bill ${inv.invoiceNumber}* (${formatDate(inv.issueDate)})\n${lines}\nTotal: *${rs(inv.totalAmount)}*\nPaid: ${rs(inv.paidAmount)}\nBalance: *${rs(inv.balanceDue)}*`;
    const phone = (inv.customerPhone || customer?.phone || '').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <>
      <Modal isOpen={Boolean(inv)} onClose={onClose} title={inv ? `Bill ${inv.invoiceNumber}` : 'Bill'} subtitle={inv ? `${inv.customerName} • ${formatDate(inv.issueDate)}` : undefined} wide
        footer={inv && (
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex gap-2">
              <button type="button" onClick={() => setPrintRequest({ type: 'bill', invoiceId: inv.id })} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Print</button>
              <button type="button" onClick={whatsapp} className={secondaryBtn}><MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp</button>
            </div>
            {canDelete && <button type="button" onClick={() => setConfirmDelete(true)} className={dangerBtn}><Trash2 className="w-4 h-4" /> Delete bill</button>}
          </div>
        )}
      >
        {inv && (
          <div className="space-y-5">
            <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
              <table className="w-full text-sm">
                <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">
                  <tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Price</th><th className="text-right px-3 py-2">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                  {inv.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 font-semibold text-[#111827] dark:text-white">{it.productName}</td>
                      <td className="px-3 py-2 text-right font-mono">{lineQty(it)} {it.unit || ''}</td>
                      <td className="px-3 py-2 text-right font-mono">{rs(linePrice(it))}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{rs(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Total</div><div className="font-mono font-extrabold text-[#111827] dark:text-white">{rs(inv.totalAmount)}</div>{(inv.discount || 0) > 0 && <div className="text-[11px] text-[#8E9299]">after {rs(inv.discount || 0)} discount</div>}</div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Paid</div><div className="font-mono font-extrabold text-teal-700 dark:text-teal-300">{rs(inv.paidAmount)}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Balance</div><div className={`font-mono font-extrabold ${inv.balanceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-[#111827] dark:text-white'}`}>{rs(inv.balanceDue)}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Customer owes (all bills)</div><div className="font-mono font-extrabold text-[#111827] dark:text-white">{rs(customer?.totalDue || 0)}</div></div>
            </div>
            {inv.notes && <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Note: {inv.notes}</p>}

            {(inv.payments || []).length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Payments</h3>
                <ul className="text-sm divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
                  {(inv.payments || []).map((p) => (
                    <li key={p.id} className="flex justify-between px-3 py-2"><span>{formatDate(p.date)} • {p.notes || p.method}</span><span className="font-mono font-bold">{rs(p.amount)}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {inv.balanceDue > 0 && (
              <form onSubmit={takePayment} className="rounded-2xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 p-4 space-y-3">
                <h3 className="text-sm font-bold text-[#111827] dark:text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-teal-700" /> Receive payment</h3>
                {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="col-span-2 sm:col-span-1">
                    <label className={labelCls} htmlFor="pay-amount">Amount</label>
                    <div className="flex gap-1">
                      <input id="pay-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} font-mono`} placeholder="0" />
                      <button type="button" onClick={() => setAmount(String(inv.balanceDue))} className="shrink-0 px-2 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-bold text-teal-700 dark:text-teal-300">Full</button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="pay-method">Method</label>
                    <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{BILL_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="pay-note">Note</label>
                    <input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
                  </div>
                  <div className="flex items-end"><button type="submit" className={`${primaryBtn} w-full`}>Receive</button></div>
                </div>
              </form>
            )}
            {inv.balanceDue === 0 && msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete bill ${inv?.invoiceNumber || ''}?`}
        message="The bill will be removed. Stock goes back to the items and the unpaid amount comes off the customer's account."
        details={inv ? [`Total ${rs(inv.totalAmount)}, paid ${rs(inv.paidAmount)}`, `Customer: ${inv.customerName}`, `Dated ${formatDate(inv.issueDate)} (today is ${formatDate(todayISO())})`] : []}
        confirmLabel="Delete bill"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!inv) return;
          deleteBill(inv.id);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </>
  );
};
