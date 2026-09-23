import React, { useState } from 'react';
import { BankSelect, bankOpt } from './BankSelect';
import { useTrading } from '../../context/TradingContext';
import { Cheque } from '../../types';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn, Notice, rs } from './ui';
import { todayISO } from '../../utils/stockFlow';
import { formatDate } from '../../utils/formatters';
import { billsOnly } from '../../utils/billing';

/** Cheque no. / bank / date fields, shared by the cheque form and the "Receive payment" forms. */
export interface ChequeFields {
  chequeNumber: string;
  bankName: string;
  chequeDate: string;
}
export const emptyChequeFields = (): ChequeFields => ({ chequeNumber: '', bankName: '', chequeDate: todayISO() });

/** `narrow`: two columns at every size (the bill's payment box is only half the dialog wide, so three squeeze the date). */
export const ChequeFieldsInput: React.FC<{ value: ChequeFields; onChange: (v: ChequeFields) => void; idPrefix: string; direction?: 'received' | 'issued'; narrow?: boolean }> = ({ value, onChange, idPrefix, direction = 'received', narrow }) => (
  <div className={`col-span-full grid grid-cols-2 ${narrow ? '' : 'sm:grid-cols-3'} gap-3 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-3`}>
    <div>
      <label className={labelCls} htmlFor={`${idPrefix}-no`}>Cheque no.</label>
      <input id={`${idPrefix}-no`} value={value.chequeNumber} onChange={(e) => onChange({ ...value, chequeNumber: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="e.g. 10045521" inputMode="numeric" />
    </div>
    <div>
      <label className={labelCls} htmlFor={`${idPrefix}-bank`}>Bank</label>
      <input id={`${idPrefix}-bank`} value={value.bankName} onChange={(e) => onChange({ ...value, bankName: e.target.value })} className={inputCls} placeholder="e.g. HBL" list="cheque-banks" />
    </div>
    <div className={narrow ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
      <label className={labelCls} htmlFor={`${idPrefix}-date`}>Date on cheque</label>
      <input id={`${idPrefix}-date`} type="date" value={value.chequeDate} onChange={(e) => onChange({ ...value, chequeDate: e.target.value })} className={inputCls} />
    </div>
    <datalist id="cheque-banks">{['HBL', 'MCB', 'UBL', 'Allied Bank', 'Bank Alfalah', 'Meezan Bank', 'National Bank', 'Bank Al Habib', 'Askari Bank', 'Faysal Bank', 'Standard Chartered', 'JS Bank', 'Bank of Punjab', 'Bank of Khyber'].map((b) => <option key={b} value={b} />)}</datalist>
    <p className="col-span-full text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{direction === 'issued'
        ? <>Shows under "Issued" in Money → Cheques and is paid from the bank when it clears.{value.chequeDate > todayISO() ? ` Post-dated: the supplier can cash it from ${formatDate(value.chequeDate)}.` : ''}</>
        : <>Stays under "Cheques in hand" until the bank clears it.{value.chequeDate > todayISO() ? ` Post-dated: can be deposited from ${formatDate(value.chequeDate)}.` : ''}</>}</p>
  </div>
);

/** Record a cheque received from a customer or given to a supplier. */
export const ChequeFormModal: React.FC<{ isOpen: boolean; onClose: () => void; direction: 'received' | 'issued'; customerId?: string | null }> = ({ isOpen, onClose, direction, customerId }) => {
  const { customers, suppliers, invoices, receiveCheque, issueCheque } = useTrading();
  const received = direction === 'received';
  const [party, setParty] = useState(customerId || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [billId, setBillId] = useState('');
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<ChequeFields>(emptyChequeFields());
  const [bank, setBank] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const openBills = received && party ? billsOnly(invoices).filter((i) => i.customerId === party && i.balanceDue > 0) : [];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sent) return;
    const amt = parseFloat(amount) || 0;
    const common = { amount: amt, bankName: fields.bankName, chequeNumber: fields.chequeNumber, chequeDate: fields.chequeDate, date, note: note.trim() || undefined };
    const r = received ? receiveCheque({ ...common, customerId: party, invoiceId: billId || null }) : issueCheque({ ...common, supplierId: party, ...bankOpt(bank) });
    if (!r.success) return setError(r.message);
    // Approval rule "payment to a supplier above Rs. Y": the cheque waits for a manager.
    if ('pendingApproval' in r && r.pendingApproval) return setSent(r.message);
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={received ? 'Cheque received' : 'Give a cheque'} subtitle={received ? "Takes it off what the customer owes. Not in the bank until it clears." : 'Takes it off what you owe the supplier. Paid from the bank when it clears.'}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        {sent && <Notice kind="ok">{sent}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls} htmlFor="chq-party">{received ? 'Customer' : 'Supplier'}</label>
            <select id="chq-party" value={party} onChange={(e) => { setParty(e.target.value); setBillId(''); }} className={inputCls}>
              <option value="">{received ? 'Select customer…' : 'Select supplier…'}</option>
              {received
                ? [...customers].sort((a, b) => b.totalDue - a.totalDue).map((x) => <option key={x.id} value={x.id}>{x.name}{x.totalDue > 0 ? ` (owes Rs. ${x.totalDue.toLocaleString()})` : ''}</option>)
                : [...suppliers].sort((a, b) => b.totalOwed - a.totalOwed).map((x) => <option key={x.id} value={x.id}>{x.company || x.name}{x.totalOwed > 0 ? ` (you owe Rs. ${x.totalOwed.toLocaleString()})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="chq-amount">Amount (Rs.)</label>
            <input id="chq-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
          </div>
          <div>
            <label className={labelCls} htmlFor="chq-entry">{received ? 'Received on' : 'Given on'}</label>
            <input id="chq-entry" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <ChequeFieldsInput value={fields} onChange={setFields} idPrefix="chq" direction={direction} />
          {!received && <BankSelect id="chq-own-bank" className="col-span-2" label="Drawn on (your bank account)" value={bank} onChange={setBank} />}
          {openBills.length > 0 && (
            <div className="col-span-2">
              <label className={labelCls} htmlFor="chq-bill">For bill (optional)</label>
              <select id="chq-bill" value={billId} onChange={(e) => { setBillId(e.target.value); const b = openBills.find((x) => x.id === e.target.value); if (b && !amount) setAmount(String(b.balanceDue)); }} className={inputCls}>
                <option value="">Against the account (old dues)</option>
                {openBills.map((b) => <option key={b.id} value={b.id}>{b.invoiceNumber} • {formatDate(b.issueDate)} • {rs(b.balanceDue)} due</option>)}
              </select>
            </div>
          )}
          <div className="col-span-2">
            <label className={labelCls} htmlFor="chq-note">Note</label>
            <input id="chq-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>Save cheque</button>
        </div>
      </form>
    </Modal>
  );
};

export type ChequeAction = 'deposit' | 'clear' | 'bounce' | 'cancel';

const ACTION_TITLE: Record<ChequeAction, string> = {
  deposit: 'Deposit cheque',
  clear: 'Mark cheque cleared',
  bounce: 'Cheque bounced',
  cancel: 'Cancel cheque',
};

/** Deposit / clear / bounce / cancel one cheque: a date, and for a bounce the reason and bank charge. */
export const ChequeActionModal: React.FC<{ cheque: Cheque | null; action: ChequeAction | null; onClose: () => void; onDone?: (message: string) => void }> = ({ cheque, action, onClose, onDone }) => {
  const { depositCheque, clearCheque, bounceCheque, cancelCheque } = useTrading();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');
  const [charge, setCharge] = useState('');
  const [chargeTo, setChargeTo] = useState<'customer' | 'shop'>('customer');
  const [bank, setBank] = useState('');
  const [error, setError] = useState('');
  const open = Boolean(cheque && action);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cheque || !action) return;
    const r =
      action === 'deposit' ? depositCheque(cheque.id, date, bank || undefined)
      : action === 'clear' ? clearCheque(cheque.id, date, bank || undefined)
      : action === 'bounce' ? bounceCheque(cheque.id, { date, reason, bankCharge: parseFloat(charge) || 0, chargeTo })
      : cancelCheque(cheque.id, { date, reason });
    if (!r.success) return setError(r.message);
    onDone?.(r.message);
    onClose();
  };
  const received = cheque?.direction === 'received';
  const explain =
    action === 'deposit' ? 'You took it to the bank. It is still not money until the bank clears it.'
    : action === 'clear' ? (received ? 'The money is in your bank account now.' : 'The bank paid the supplier from your account.')
    : action === 'bounce' ? "The customer owes this amount again."
    : received ? 'You gave the cheque back to the customer. They owe this amount again.' : 'The supplier did not cash it. You owe them this amount again.';
  return (
    <Modal isOpen={open} onClose={onClose} title={action ? ACTION_TITLE[action] : 'Cheque'} subtitle={cheque ? `${cheque.partyName} • #${cheque.chequeNumber} ${cheque.bankName} • ${rs(cheque.amount)}` : undefined}>
      {cheque && action && (
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">{explain}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="chq-act-date">Date</label>
              <input id="chq-act-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            {(action === 'deposit' || action === 'clear') && <BankSelect id="chq-act-bank" label={action === 'deposit' ? 'Deposited into' : received ? 'Cleared into' : 'Paid from'} value={bank || cheque.bankCode || ''} onChange={setBank} />}
            {(action === 'bounce' || action === 'cancel') && (
              <div className={action === 'cancel' ? '' : 'col-span-2 sm:col-span-1'}>
                <label className={labelCls} htmlFor="chq-act-reason">{action === 'bounce' ? 'Why it bounced' : 'Reason'}</label>
                <input id="chq-act-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder={action === 'bounce' ? 'e.g. Insufficient funds' : 'optional'} list={action === 'bounce' ? 'bounce-reasons' : undefined} />
                <datalist id="bounce-reasons">{['Insufficient funds', 'Signature differs', 'Payment stopped', 'Account closed', 'Date / amount mismatch'].map((r) => <option key={r} value={r} />)}</datalist>
              </div>
            )}
            {action === 'bounce' && (
              <>
                <div>
                  <label className={labelCls} htmlFor="chq-act-charge">Bank charge (Rs.)</label>
                  <input id="chq-act-charge" type="number" inputMode="decimal" min="0" step="any" value={charge} onChange={(e) => setCharge(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
                </div>
                <div>
                  <span className={labelCls}>Charge paid by</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(['customer', 'shop'] as const).map((w) => (
                      <button key={w} type="button" onClick={() => setChargeTo(w)} aria-pressed={chargeTo === w} className={`rounded-2xl border px-2 py-2.5 text-xs font-bold ${chargeTo === w ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300' : 'border-[#E5E5E1] dark:border-[#203248] text-[#6B7280]'}`}>{w === 'customer' ? 'Customer' : 'Shop'}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>Back</button>
            <button type="submit" className={action === 'bounce' || action === 'cancel' ? dangerBtn : primaryBtn}>{action === 'deposit' ? 'Deposit' : action === 'clear' ? 'Mark cleared' : action === 'bounce' ? 'Mark bounced' : 'Cancel cheque'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
};
