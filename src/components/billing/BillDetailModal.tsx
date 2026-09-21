import React, { useState } from 'react';
import { Printer, Trash2, Wallet, MessageCircle, RotateCcw, Truck } from 'lucide-react';
import { batchLines } from '../../utils/inventory';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn, Notice, rs } from './ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { formatDate } from '../../utils/formatters';
import { lineQty, linePrice } from '../../utils/billing';
import { todayISO } from '../../utils/stockFlow';
import { useBillingUI } from './BillingUI';
import { returnsForBill, returnedQtyByLine, billNetTotal, lineDiscountLabel } from '../../utils/salesDocs';
import { StockReturn } from '../../types';
import { ChequeFieldsInput, emptyChequeFields } from './ChequeForms';

interface Props {
  invoiceId: string | null;
  onClose: () => void;
}

/** One bill: its lines, its payments, and the three things you do with it — take money, print, delete. */
export const BillDetailModal: React.FC<Props> = ({ invoiceId, onClose }) => {
  const { invoices, customers, payBill, receiveCheque, deleteBill, setPrintRequest, can, currentUser, returns, deleteReturn } = useTrading();
  const ui = useBillingUI();
  const inv = invoices.find((i) => i.id === invoiceId) || null;
  const billReturns = inv ? returnsForBill(returns, inv.id) : [];
  const backQty = inv ? returnedQtyByLine(returns, inv.id) : new Map<string, number>();
  const anyBack = backQty.size > 0;
  const allBack = inv ? inv.items.every((it) => (backQty.get(it.id) || 0) >= lineQty(it)) : false;
  const [challan, setChallan] = useState<{ open: boolean; driver: string; vehicle: string }>({ open: false, driver: '', vehicle: '' });
  const [pendingReturn, setPendingReturn] = useState<StockReturn | null>(null);
  const customer = inv ? customers.find((c) => c.id === inv.customerId) : undefined;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [cheque, setCheque] = useState(emptyChequeFields());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = can('delete_records') || can('system:admin_screen') || can('admin_screen') || currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  const takePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inv) return;
    // Cheques go into the cheque register against this bill (in hand until the bank clears them).
    const r = method === 'Cheque'
      ? receiveCheque({ customerId: inv.customerId, invoiceId: inv.id, amount: parseFloat(amount) || 0, ...cheque, note: note.trim() || undefined })
      : payBill(inv.id, parseFloat(amount) || 0, method, note.trim() || undefined);
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) {
      setAmount('');
      setNote('');
      setCheque(emptyChequeFields());
    }
  };

  const whatsapp = () => {
    if (!inv) return;
    const lines = inv.items.map((it) => `• ${it.productName} × ${lineQty(it)} @ ${rs(linePrice(it))} = ${rs(it.amount)}`).join('\n');
    const back = (inv.returnedAmount || 0) > 0 ? `\nReturned: − ${rs(inv.returnedAmount || 0)}\nNet total: *${rs(billNetTotal(inv))}*` : '';
    const text = `*Bill ${inv.invoiceNumber}* (${formatDate(inv.issueDate)})\n${lines}\nTotal: *${rs(inv.totalAmount)}*${back}\nPaid: ${rs(inv.paidAmount - (inv.refundedAmount || 0))}\nBalance: *${rs(inv.balanceDue)}*`;
    const phone = (inv.customerPhone || customer?.phone || '').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <>
      <Modal isOpen={Boolean(inv)} onClose={onClose} title={inv ? `Bill ${inv.invoiceNumber}` : 'Bill'} subtitle={inv ? `${inv.customerName} • ${formatDate(inv.issueDate)}` : undefined} wide
        footer={inv && (
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPrintRequest({ type: 'bill', invoiceId: inv.id })} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Print</button>
              <button type="button" onClick={whatsapp} className={secondaryBtn}><MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp</button>
              <button type="button" onClick={() => setChallan((c) => ({ ...c, open: !c.open }))} className={secondaryBtn} aria-expanded={challan.open}><Truck className="w-4 h-4 text-indigo-600" /> Delivery challan</button>
              {!allBack && <button type="button" onClick={() => ui.returnItems(inv.id)} className={secondaryBtn}><RotateCcw className="w-4 h-4 text-amber-600" /> Return items</button>}
            </div>
            {canDelete && billReturns.length === 0 && <button type="button" onClick={() => setConfirmDelete(true)} className={dangerBtn}><Trash2 className="w-4 h-4" /> Delete bill</button>}
          </div>
        )}
      >
        {inv && (
          <div className="space-y-5">
            <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
              <table className="w-full text-sm">
                <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[11px] uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">
                  <tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Qty</th>{anyBack && <th className="text-right px-3 py-2">Returned</th>}<th className="text-right px-3 py-2">Price</th><th className="text-right px-3 py-2">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                  {inv.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 font-semibold text-[#111827] dark:text-white">
                        {it.productName}
                        {batchLines(it).map((b) => <div key={b} className="text-[11px] font-normal text-[#6B7280] dark:text-[#94A3B8]">{b}</div>)}
                        {it.customerRate && <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Customer rate</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{lineQty(it)} {it.unit || ''}</td>
                      {anyBack && <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-300" data-testid="returned-qty">{backQty.get(it.id) ? backQty.get(it.id) : '—'}</td>}
                      <td className="px-3 py-2 text-right tabular-nums">{rs(linePrice(it))}{(it.discountAmount || 0) > 0 && <div className="text-[11px] font-sans text-[#6B7280] dark:text-[#94A3B8]">less {lineDiscountLabel(it)}</div>}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{rs(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">{(inv.returnedAmount || 0) > 0 ? 'Net total' : 'Total'}</div><div className="tabular-nums font-extrabold text-[#111827] dark:text-white" data-testid="bill-net-total">{rs(billNetTotal(inv))}</div>{(inv.returnedAmount || 0) > 0 && <div className="text-[11px] text-amber-700 dark:text-amber-300">{rs(inv.totalAmount)} less {rs(inv.returnedAmount || 0)} returned</div>}{(inv.discount || 0) > 0 && <div className="text-[11px] text-[#8E9299]">after {rs(inv.discount || 0)} discount</div>}</div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Paid</div><div className="tabular-nums font-extrabold text-teal-700 dark:text-teal-300">{rs(inv.paidAmount - (inv.refundedAmount || 0))}</div>{(inv.refundedAmount || 0) > 0 && <div className="text-[11px] text-[#8E9299]">after {rs(inv.refundedAmount || 0)} given back</div>}</div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Balance</div><div className={`tabular-nums font-extrabold ${inv.balanceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-[#111827] dark:text-white'}`}>{rs(inv.balanceDue)}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Customer owes (all bills)</div><div className="tabular-nums font-extrabold text-[#111827] dark:text-white">{rs(customer?.totalDue || 0)}</div></div>
            </div>
            {inv.notes && <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Note: {inv.notes}</p>}

            {challan.open && (
              <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">
                <h3 className="text-sm font-bold text-[#111827] dark:text-white flex items-center gap-2"><Truck className="w-4 h-4 text-indigo-600" /> Delivery challan</h3>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Items and quantities only, no prices. The person receiving the goods signs it.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className={labelCls} htmlFor="challan-driver">Driver (optional)</label>
                    <input id="challan-driver" value={challan.driver} onChange={(e) => setChallan((c) => ({ ...c, driver: e.target.value }))} className={inputCls} placeholder="e.g. Rashid" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="challan-vehicle">Vehicle no. (optional)</label>
                    <input id="challan-vehicle" value={challan.vehicle} onChange={(e) => setChallan((c) => ({ ...c, vehicle: e.target.value }))} className={inputCls} placeholder="e.g. LES-1234" />
                  </div>
                  <div className="flex items-end"><button type="button" onClick={() => setPrintRequest({ type: 'bill_challan', invoiceId: inv.id, driver: challan.driver.trim() || undefined, vehicle: challan.vehicle.trim() || undefined })} className={`${primaryBtn} w-full`}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Print challan</button></div>
                </div>
              </div>
            )}

            {billReturns.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Returns</h3>
                <ul className="text-sm divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
                  {billReturns.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="tabular-nums text-xs text-[#8E9299] mr-2">{r.returnNumber}</span>{formatDate(r.date)}
                        <span className="block text-[11px] text-[#8E9299] truncate">{(r.items || []).map((l) => `${l.productName} × ${l.qty}`).join(', ')}{(r.refundAmount || 0) > 0 ? ` • ${rs(r.refundAmount || 0)} given back` : ''}</span>
                      </span>
                      <span className="tabular-nums font-bold text-amber-700 dark:text-amber-300">− {rs(r.amount)}</span>
                      <button type="button" onClick={() => setPrintRequest({ type: 'note', returnId: r.id })} aria-label={`Print credit note ${r.returnNumber}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#111827] dark:hover:text-white"><Printer className="w-4 h-4" /></button>
                      {canDelete && <button type="button" onClick={() => setPendingReturn(r)} aria-label={`Delete return ${r.returnNumber}`} className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {inv.creditOverride && <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Allowed over credit limit by {inv.creditOverride.by}: {inv.creditOverride.reason}</p>}

            {(inv.payments || []).length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Payments</h3>
                <ul className="text-sm divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
                  {(inv.payments || []).map((p) => (
                    <li key={p.id} className="flex justify-between px-3 py-2"><span>{formatDate(p.date)} • {p.notes || p.method}</span><span className="tabular-nums font-bold">{rs(p.amount)}</span></li>
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
                      <input id="pay-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                      <button type="button" onClick={() => setAmount(String(inv.balanceDue))} className="shrink-0 px-3 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-bold text-teal-700 dark:text-teal-300">Full</button>
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
                  {method === 'Cheque' && <ChequeFieldsInput value={cheque} onChange={setCheque} idPrefix="pay-chq" />}
                  <div className="flex items-end"><button type="submit" className={`${primaryBtn} w-full`}>Receive</button></div>
                </div>
              </form>
            )}
            {inv.balanceDue === 0 && msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(pendingReturn)}
        title={`Delete return ${pendingReturn?.returnNumber || ''}?`}
        message="The goods come off the shelf again, the customer's account goes back up, and any money given back is put back in the cash book."
        details={pendingReturn ? [`Value ${rs(pendingReturn.amount)}`, ...(pendingReturn.refundAmount ? [`Given back ${rs(pendingReturn.refundAmount)}`] : [])] : []}
        confirmLabel="Delete return"
        onCancel={() => setPendingReturn(null)}
        onConfirm={() => {
          if (pendingReturn) {
            const r = deleteReturn(pendingReturn.id);
            setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
          }
          setPendingReturn(null);
        }}
      />
      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete bill ${inv?.invoiceNumber || ''}?`}
        message="The bill will be removed as if it never happened: stock goes back to the items, the unpaid amount comes off the customer's account, and any money received on it is taken out of the cash book (treat it as refunded)."
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
