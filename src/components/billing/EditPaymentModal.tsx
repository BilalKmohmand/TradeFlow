import React, { useEffect, useState } from 'react';
import { Pencil, Save } from 'lucide-react';
import type { LedgerEntry } from '../../types';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { Modal, Notice, inputCls, labelCls, primaryBtn, secondaryBtn } from './ui';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { needsBank } from '../../utils/banks';
import { BankSelect } from './BankSelect';
import { PartyPick, customerParties, supplierParties } from './PartyPick';

const METHODS = BILL_PAYMENT_METHODS.filter((m) => m !== 'Cheque');

/** The note typed with a payment: kept on the row, or read back from older rows' description. */
export const paymentNoteOf = (l: LedgerEntry): string => {
  if (l.note != null) return l.note;
  const rest = l.description.replace(/^(Payment received|Supplier payment made):\s*/, '');
  const m = rest.match(/^[^-]*? - (.*)$/);
  if (!m) return '';
  const after = m[1];
  const linked = after.match(/^(?:Bill|collection) \S+(?: \((.*)\))?$/);
  if (linked) return linked[1] || '';
  return after.trim();
};

/** A saved customer / supplier payment row that Edit may be offered on. */
export const isEditablePayment = (l: LedgerEntry | undefined): l is LedgerEntry =>
  Boolean(l && ((l.entityType === 'customer' && l.type === 'payment_received') || (l.entityType === 'supplier' && l.type === 'payment_made')) && l.credit > 0 && !l.voucherId && !/cheque/i.test(l.method || ''));

/** Edit a saved payment: same receipt number; amount, date, method / bank, note and the party can change. */
export const EditPaymentModal: React.FC<{ ledgerId: string | null; onClose: () => void; onSaved?: (message: string) => void }> = ({ ledgerId, onClose, onSaved }) => {
  const { ledger, customers, suppliers, editPayment, paymentEditBlock } = useTrading();
  const row = ledgerId ? ledger.find((l) => l.id === ledgerId) : undefined;
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [method, setMethod] = useState('Cash');
  const [bank, setBank] = useState('');
  const [note, setNote] = useState('');
  const [party, setParty] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!row) return;
    setAmount(String(row.credit));
    setDate(row.date);
    setMethod(row.method && METHODS.includes(row.method as (typeof METHODS)[number]) ? row.method : row.method || 'Cash');
    setBank(row.bankCode || '');
    setNote(paymentNoteOf(row));
    setParty(row.entityId);
    setError('');
    // Only when a different payment is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerId]);

  if (!ledgerId) return null;
  if (!row) return null;
  const isCust = row.entityType === 'customer';
  const block = paymentEditBlock(row.id);
  const methods = METHODS.includes(method as (typeof METHODS)[number]) ? METHODS : [...METHODS, method];

  const save = () => {
    setError('');
    const r = editPayment(row.id, { amount: parseFloat(amount) || 0, date, method, bankCode: needsBank(method) ? bank : '', note, entityId: party });
    if (!r.success) return setError(r.message);
    onSaved?.(r.message);
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={`Edit payment ${row.referenceId}`} subtitle={`${isCust ? 'Received' : 'Paid'} ${formatDate(row.date)} — the receipt number stays the same.`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="button" onClick={save} disabled={Boolean(block)} className={primaryBtn}><Save className="w-4 h-4" /> Save changes</button>
        </div>
      }
    >
      <div className="space-y-3" data-testid="edit-payment">
        {block && <Notice kind="error">{block}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        <PartyPick id="ep-party" label={isCust ? 'Customer' : 'Supplier'} parties={isCust ? customerParties(customers) : supplierParties(suppliers)} value={party} onPick={setParty} placeholder={isCust ? 'Select customer…' : 'Select supplier…'} balanceWord={isCust ? 'owes' : 'you owe'} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ep-amount">Amount</label>
            <input id="ep-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} tabular-nums`} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ep-date">Date</label>
            <input id="ep-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ep-method">Method</label>
            <select id="ep-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{methods.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ep-note">Note</label>
            <input id="ep-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
          </div>
          {needsBank(method) && <BankSelect id="ep-bank" className="col-span-2" value={bank} onChange={setBank} />}
        </div>
        {(row.edits || []).length > 0 && (
          <div data-testid="payment-edit-history">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1">Edit history</h3>
            <ul className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] space-y-0.5">
              {row.edits!.map((e, i) => <li key={i}>{formatDate(e.at.slice(0, 10))}{e.by ? ` • ${e.by}` : ''}: {e.changes}</li>)}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};

/** Small "Edit" button for a payment row; opens the edit form. */
export const EditPaymentButton: React.FC<{ row: LedgerEntry | undefined; label?: string; onSaved?: (message: string) => void; className?: string }> = ({ row, label, onSaved, className = '' }) => {
  const [open, setOpen] = useState(false);
  if (!isEditablePayment(row)) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={label || `Edit payment ${row.referenceId}`}
        className={`inline-flex items-center gap-1 min-h-9 px-2 rounded-xl text-xs font-bold text-[#6B7280] dark:text-[#94A3B8] hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 ${className}`}>
        <Pencil className="w-3.5 h-3.5" /> Edit
      </button>
      {open && <EditPaymentModal ledgerId={row.id} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  );
};
