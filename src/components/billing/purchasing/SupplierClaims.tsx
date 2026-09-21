import React, { useMemo, useRef, useState } from 'react';
import { Plus, Printer, Trash2, Check, X, RotateCcw, ShieldAlert, CheckCheck } from 'lucide-react';
import { useTrading } from '../../../context/TradingContext';
import { Modal, Notice, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs, moneyCls, EmptyState, RowAction, pillCls } from '../ui';
import { ConfirmDialog } from '../../ConfirmDialog';
import { formatDate } from '../../../utils/formatters';
import { todayISO } from '../../../utils/stockFlow';
import { CLAIM_STATUS_LABEL } from '../../../utils/purchasing';
import { SUPPLIER_CLAIM_REASONS, SupplierClaim, SupplierClaimReason, SupplierClaimStatus } from '../../../types';

const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });

export const claimChip = (s: SupplierClaimStatus) => {
  const tone =
    s === 'accepted'
      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
      : s === 'settled'
        ? 'bg-[#F4F3EF] dark:bg-[#1E2E40] text-[#374151] dark:text-[#CBD5E1]'
        : s === 'rejected'
          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`} data-claim-status={s}>{CLAIM_STATUS_LABEL[s]}</span>;
};

/** Claim for leaked / damaged / short goods from a supplier's delivery. */
export const SupplierClaimModal: React.FC<{ isOpen: boolean; onClose: () => void; supplierId?: string | null; purchaseId?: string | null; productId?: string | null; onSaved?: (msg: string) => void }> = ({ isOpen, onClose, supplierId: preSupplier, purchaseId: preReceipt, productId: preProduct, onSaved }) => {
  const { suppliers, purchases, products, addSupplierClaim } = useTrading();
  const pre = preReceipt ? purchases.find((p) => p.id === preReceipt) : undefined;
  const [supplierId, setSupplierId] = useState(pre?.supplierId || preSupplier || '');
  const [purchaseId, setPurchaseId] = useState(pre?.id || '');
  const [productId, setProductId] = useState(pre?.productId || preProduct || '');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState(pre ? String(pre.pricePerKg) : '');
  const [reason, setReason] = useState<SupplierClaimReason>('leaked');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');
  const busy = useRef(false);
  const receipts = useMemo(() => purchases.filter((p) => p.supplierId === supplierId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60), [purchases, supplierId]);
  const product = products.find((p) => p.id === productId);
  const pickReceipt = (id: string) => {
    setPurchaseId(id);
    const r = purchases.find((p) => p.id === id);
    if (r) {
      setProductId(r.productId);
      setRate(String(r.pricePerKg));
    }
  };
  const amount = (parseFloat(qty) || 0) * (parseFloat(rate) || 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    setError('');
    const r = addSupplierClaim({ supplierId, purchaseId: purchaseId || null, productId, qty: parseFloat(qty) || 0, rate: parseFloat(rate) || 0, reason, note, date });
    if (!r.success) return setError(r.message);
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 800);
    onSaved?.(r.message);
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New supplier claim" subtitle="Leaked, damaged or short goods from a delivery. Nothing changes in the books until the supplier accepts it.">
      <form onSubmit={submit} className="space-y-4" id="claim-form">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls} htmlFor="cl-supplier">Supplier</label>
            <select id="cl-supplier" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPurchaseId(''); }} className={inputCls}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company || s.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="cl-receipt">Delivery (stock receipt)</label>
            <select id="cl-receipt" value={purchaseId} onChange={(e) => pickReceipt(e.target.value)} className={inputCls} disabled={!supplierId}>
              <option value="">Not linked to a receipt</option>
              {receipts.map((r) => <option key={r.id} value={r.id}>{r.receiptNumber} • {formatDate(r.date)} • {num(r.kg)} {products.find((p) => p.id === r.productId)?.name || 'item'}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="cl-item">Item</label>
            <select id="cl-item" value={productId} onChange={(e) => setProductId(e.target.value)} className={inputCls} disabled={Boolean(purchaseId)}>
              <option value="">Select item…</option>
              {[...products].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="cl-reason">What was wrong</label>
            <select id="cl-reason" value={reason} onChange={(e) => setReason(e.target.value as SupplierClaimReason)} className={inputCls}>
              {SUPPLIER_CLAIM_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="cl-date">Date</label>
            <input id="cl-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="cl-qty">Quantity{product ? ` (${product.unit || 'pcs'})` : ''}</label>
            <input id="cl-qty" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
          </div>
          <div>
            <label className={labelCls} htmlFor="cl-rate">Rate per unit</label>
            <input id="cl-rate" type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="Rs." />
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="cl-note">Details (optional)</label>
            <input id="cl-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="e.g. 3 tins leaking in carton 14" />
          </div>
        </div>
        {amount > 0 && <p className="text-sm">Claim amount <strong className={moneyCls}>{rs(amount)}</strong></p>}
        <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Leaked or damaged goods still in your count? Take them out with Items → Adjust stock (reason Leaked / Damaged).</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>Save claim</button>
        </div>
      </form>
    </Modal>
  );
};

type Decide = { claim: SupplierClaim; action: 'accept' | 'reject' | 'settle' };

/** Claims list with accept / reject / settle (Suppliers → Claims). */
export const SupplierClaimsView: React.FC<{ onNew: () => void }> = ({ onNew }) => {
  const { supplierClaims, suppliers, products, purchases, can, setPrintRequest, acceptSupplierClaim, rejectSupplierClaim, settleSupplierClaim, reopenSupplierClaim, deleteSupplierClaim } = useTrading();
  const [filter, setFilter] = useState<'active' | 'all' | SupplierClaimStatus>('active');
  const [decide, setDecide] = useState<Decide | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<{ claim: SupplierClaim; action: 'reopen' | 'delete' } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const canEdit = can('suppliers:edit');
  const rows = useMemo(
    () => supplierClaims.filter((c) => (filter === 'all' ? true : filter === 'active' ? c.status === 'open' || c.status === 'accepted' : c.status === filter)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.claimNumber.localeCompare(a.claimNumber, undefined, { numeric: true }))),
    [supplierClaims, filter]
  );
  const supName = (id: string) => {
    const s = suppliers.find((x) => x.id === id);
    return s ? s.company || s.name : 'Supplier';
  };
  const openAmount = supplierClaims.filter((c) => c.status === 'open').reduce((a, c) => a + c.amount, 0);
  const openDecide = (claim: SupplierClaim, action: Decide['action']) => {
    setDecide({ claim, action });
    setAmount(String(claim.amount));
    setDate(todayISO());
    setNote('');
  };
  const runDecide = (e: React.FormEvent) => {
    e.preventDefault();
    if (!decide) return;
    const { claim, action } = decide;
    const r = action === 'accept' ? acceptSupplierClaim(claim.id, { amount: parseFloat(amount) || 0, date, note }) : action === 'reject' ? rejectSupplierClaim(claim.id, { date, note }) : settleSupplierClaim(claim.id, { date, note });
    setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
    if (r.success) setDecide(null);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Claim status" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {(['active', 'open', 'accepted', 'settled', 'rejected', 'all'] as const).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={pillCls(filter === f)}>{f === 'active' ? 'Pending' : f === 'all' ? 'All' : CLAIM_STATUS_LABEL[f]}</button>
          ))}
        </div>
        {canEdit && <button type="button" onClick={onNew} className={`${primaryBtn} ml-auto`}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New claim</button>}
      </div>
      {openAmount > 0 && <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Waiting for suppliers to answer: <strong className={moneyCls}>{rs(openAmount)}</strong></p>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <EmptyState icon={<ShieldAlert className="w-5 h-5" />} text="No claims here. Make a claim when goods from a supplier arrive leaked, damaged or short." />
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]" aria-label="Supplier claims">
            {rows.map((c) => {
              const p = products.find((x) => x.id === c.productId);
              const receipt = purchases.find((x) => x.id === c.purchaseId);
              return (
                <li key={c.id} className="px-4 py-2.5 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-[#111827] dark:text-white truncate"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{c.claimNumber}</span>{supName(c.supplierId)}</div>
                      <div className="text-[11px] text-[#8E9299] truncate">{formatDate(c.date)} • {num(c.qty)} {p?.unit || 'pcs'} {p?.name || 'item'} {SUPPLIER_CLAIM_REASONS.find((r) => r.id === c.reason)?.label.toLowerCase()}{receipt ? ` • ${receipt.receiptNumber}` : ''}{c.note ? ` • ${c.note}` : ''}</div>
                    </div>
                    {claimChip(c.status)}
                    <span className={`${moneyCls} font-bold text-sm text-right`}>{rs(c.amount)}{c.acceptedAmount != null && Math.abs(c.acceptedAmount - c.amount) >= 0.01 && <span className="block text-[11px] font-semibold text-teal-700 dark:text-teal-300">accepted {rs(c.acceptedAmount)}</span>}</span>
                  </div>
                  <div className="flex flex-wrap justify-end gap-0.5 -mr-2">
                    {canEdit && c.status === 'open' && <RowAction label={`Accept claim ${c.claimNumber}`} text="Accepted" alwaysText tone="teal" icon={<Check className="w-4 h-4" />} onClick={() => openDecide(c, 'accept')} />}
                    {canEdit && c.status === 'open' && <RowAction label={`Reject claim ${c.claimNumber}`} text="Rejected" alwaysText icon={<X className="w-4 h-4" />} onClick={() => openDecide(c, 'reject')} />}
                    {canEdit && c.status === 'accepted' && <RowAction label={`Settle claim ${c.claimNumber}`} text="Settled" alwaysText tone="teal" icon={<CheckCheck className="w-4 h-4" />} onClick={() => openDecide(c, 'settle')} />}
                    {canEdit && c.status !== 'open' && <RowAction label={`Re-open claim ${c.claimNumber}`} icon={<RotateCcw className="w-4 h-4" />} onClick={() => setConfirm({ claim: c, action: 'reopen' })} />}
                    <RowAction label={`Print claim ${c.claimNumber}`} text="Print" icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'supplier_claim', claimId: c.id })} />
                    {canEdit && can('delete_records') && <RowAction label={`Delete claim ${c.claimNumber}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirm({ claim: c, action: 'delete' })} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Modal isOpen={Boolean(decide)} onClose={() => setDecide(null)} title={decide ? `${decide.action === 'accept' ? 'Supplier accepted' : decide.action === 'reject' ? 'Supplier rejected' : 'Settle'} ${decide.claim.claimNumber}` : ''} subtitle={decide?.action === 'accept' ? 'The accepted amount comes off what you owe this supplier (a debit note).' : decide?.action === 'reject' ? 'Nothing changes in the books.' : 'The claim is closed (money or goods received, or adjusted in a payment).'}>
        {decide && (
          <form onSubmit={runDecide} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {decide.action === 'accept' && (
                <div>
                  <label className={labelCls} htmlFor="cl-accept-amount">Amount accepted</label>
                  <input id="cl-accept-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} tabular-nums`} />
                </div>
              )}
              <div>
                <label className={labelCls} htmlFor="cl-decide-date">Date</label>
                <input id="cl-decide-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls} htmlFor="cl-decide-note">Note (optional)</label>
                <input id="cl-decide-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDecide(null)} className={secondaryBtn}>Cancel</button>
              <button type="submit" className={primaryBtn}>Save</button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(confirm)}
        title={confirm ? `${confirm.action === 'delete' ? 'Delete' : 'Re-open'} claim ${confirm.claim.claimNumber}?` : ''}
        message={confirm?.claim.ledgerId ? 'Its debit note is removed: the amount goes back onto what you owe the supplier.' : 'Nothing in the books changes.'}
        confirmLabel={confirm?.action === 'delete' ? 'Delete claim' : 'Re-open claim'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            const r = confirm.action === 'delete' ? deleteSupplierClaim(confirm.claim.id) : reopenSupplierClaim(confirm.claim.id);
            setMsg({ kind: r.success ? 'ok' : 'error', text: r.message });
          }
          setConfirm(null);
        }}
      />
    </div>
  );
};
