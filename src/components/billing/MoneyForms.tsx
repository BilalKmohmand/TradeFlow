import React, { useMemo, useState } from 'react';
import { PartyPicker } from './PartyPicker';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { EXPENSE_CATEGORIES, ExpenseCategory, Customer, Supplier } from '../../types';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice } from './ui';
import { todayISO } from '../../utils/stockFlow';
import { collectCashMovements, accountBalancesOn } from '../../utils/finance';
import { rs } from './ui';
import { booksLockedFor } from '../../utils/accounting';
import { ChequeFieldsInput, emptyChequeFields } from './ChequeForms';
import { CostCentreSelect } from '../finance/common';
import { BankSelect, bankOpt } from './BankSelect';
import { needsBank, MAIN_BANK_CODE } from '../../utils/banks';

const EXPENSE_PAID_VIA = ['Cash', 'Bank Transfer', 'Easypaisa / JazzCash', 'Card', 'Credit (unpaid)'];

/** Record an expense: what, how much, which sheet (category) it belongs to, and how it was paid. */
export const ExpenseModal: React.FC<{ isOpen: boolean; onClose: () => void; date?: string; category?: ExpenseCategory }> = ({ isOpen, onClose, date, category }) => {
  const { addExpense, settings } = useTrading();
  const [form, setForm] = useState({ date: date || todayISO(), category: (category || 'daily') as ExpenseCategory, amount: '', description: '', paidVia: 'Cash', costCentreId: '', bank: '' });
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) return setError('Enter the amount.');
    if (!form.description.trim()) return setError('Write what this expense was for.');
    const closed = booksLockedFor(settings, form.date);
    if (closed) return setError(closed);
    addExpense({ date: form.date, category: form.category, amount, description: form.description.trim(), paidVia: form.paidVia, truckId: null, dispatchId: null, ...(form.costCentreId ? { costCentreId: form.costCentreId } : {}), ...(needsBank(form.paidVia) ? bankOpt(form.bank) : {}) });
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add expense" subtitle="Goes onto the daily sheet under its category.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls} htmlFor="exp-desc">What for</label>
            <input id="exp-desc" autoFocus value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="e.g. Lunch for staff" />
          </div>
          <div>
            <label className={labelCls} htmlFor="exp-amount">Amount (Rs.)</label>
            <input id="exp-amount" type="number" inputMode="decimal" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="0" />
          </div>
          <div>
            <label className={labelCls} htmlFor="exp-cat">Category</label>
            <select id="exp-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })} className={inputCls}>{EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </div>
          <div>
            <label className={labelCls} htmlFor="exp-date">Date</label>
            <input id="exp-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="exp-via">Paid from</label>
            <select id="exp-via" value={form.paidVia} onChange={(e) => setForm({ ...form, paidVia: e.target.value })} className={inputCls}>{EXPENSE_PAID_VIA.map((v) => <option key={v}>{v}</option>)}</select>
          </div>
          {needsBank(form.paidVia) && <BankSelect id="exp-bank" className="col-span-2" value={form.bank} onChange={(v) => setForm({ ...form, bank: v })} />}
          <div className="col-span-2 empty:hidden"><CostCentreSelect id="exp-centre" value={form.costCentreId} onChange={(v) => setForm({ ...form, costCentreId: v })} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>Save expense</button>
        </div>
      </form>
    </Modal>
  );
};

/** Move money between the cash drawer and the bank account (deposit or withdrawal). */
export const TransferModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addCashTransfer, ledger, expenses, cashEntries, customers, suppliers, settings, bankAccounts } = useTrading();
  const balances = accountBalancesOn(collectCashMovements(ledger, expenses, cashEntries, customers, suppliers), settings, todayISO());
  const [from, setFrom] = useState<'cash' | 'bank' | 'bank2bank'>('cash');
  const [bank, setBank] = useState(MAIN_BANK_CODE);
  const [toBank, setToBank] = useState(bankAccounts.find((b) => b.code !== MAIN_BANK_CODE)?.code || '');
  const many = bankAccounts.length > 1;
  const bankBal = (code: string) => balances.banks[code || MAIN_BANK_CODE] || 0;
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount) || 0;
    const available = from === 'cash' ? balances.cash : bankBal(bank);
    if (amt > available + 0.005) return setError(`Only ${rs(available)} is ${from === 'cash' ? 'in the cash drawer' : `in ${bankAccounts.find((b) => b.code === bank)?.name || 'the bank'}`} right now.`);
    const r = addCashTransfer({ amount: amt, from: from === 'cash' ? 'cash' : 'bank', date, note: note.trim() || undefined, bankCode: bank, ...(from === 'bank2bank' ? { toBankCode: toBank } : {}) });
    if (!r.success) return setError(r.message);
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cash ↔ Bank" subtitle="Deposit cash into the bank, or withdraw cash from it.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div className={`grid ${many ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
          <button type="button" onClick={() => setFrom('cash')} className={`rounded-2xl border p-3 text-sm font-bold ${from === 'cash' ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300' : 'border-[#E5E5E1] dark:border-[#203248] text-[#6B7280]'}`}>Deposit to bank<div className="text-[11px] font-normal">cash in hand {rs(balances.cash)}</div></button>
          <button type="button" onClick={() => setFrom('bank')} className={`rounded-2xl border p-3 text-sm font-bold ${from === 'bank' ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300' : 'border-[#E5E5E1] dark:border-[#203248] text-[#6B7280]'}`}>Withdraw cash<div className="text-[11px] font-normal">in bank {rs(balances.bank)}</div></button>
          {many && <button type="button" onClick={() => setFrom('bank2bank')} className={`rounded-2xl border p-3 text-sm font-bold ${from === 'bank2bank' ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300' : 'border-[#E5E5E1] dark:border-[#203248] text-[#6B7280]'}`}>Bank → bank<div className="text-[11px] font-normal">{bankAccounts.length} accounts</div></button>}
        </div>
        {many && (
          <div className="grid grid-cols-2 gap-3">
            <BankSelect id="tr-bank" className={from === 'bank2bank' ? '' : 'col-span-2'} label={from === 'bank2bank' ? 'From bank' : 'Bank account'} value={bank} onChange={(v) => { setBank(v); if (v === toBank) setToBank(bankAccounts.find((b) => b.code !== v)?.code || ''); }} balances={balances.banks} />
            {from === 'bank2bank' && <BankSelect id="tr-to-bank" label="To bank" value={toBank} onChange={setToBank} exclude={bank} balances={balances.banks} />}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="tr-amount">Amount (Rs.)</label>
            <input id="tr-amount" autoFocus type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
          </div>
          <div>
            <label className={labelCls} htmlFor="tr-date">Date</label>
            <input id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="tr-note">Note</label>
            <input id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="e.g. HBL slip 2231" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>Record</button>
        </div>
      </form>
    </Modal>
  );
};

/** Take money from a customer against their whole account (old dues), not a specific bill. */
export const ReceiveModal: React.FC<{ isOpen: boolean; onClose: () => void; customerId?: string | null }> = ({ isOpen, onClose, customerId }) => {
  const { customers, recordCustomerPayment, receiveCheque, settings } = useTrading();
  const [cust, setCust] = useState(customerId || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [bank, setBank] = useState('');
  const [note, setNote] = useState('');
  const [cheque, setCheque] = useState(emptyChequeFields());
  const [error, setError] = useState('');
  const isCheque = method === 'Cheque';
  const c = customers.find((x) => x.id === cust);
  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => b.totalDue - a.totalDue), [customers]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount) || 0;
    if (!c) return setError('Pick the customer.');
    if (amt <= 0) return setError('Enter the amount.');
    const closed = booksLockedFor(settings, todayISO());
    if (closed) return setError(closed);
    if (amt > c.totalDue + 0.005) return setError(c.totalDue > 0 ? `${c.name} owes only ${rs(c.totalDue)}. Enter up to that amount.` : `${c.name} owes nothing right now. Make a bill first.`);
    if (isCheque) {
      // A cheque goes into the cheque register (in hand until the bank clears it), not straight into the bank.
      const r = receiveCheque({ customerId: c.id, amount: amt, ...cheque, note: note.trim() || undefined });
      if (!r.success) return setError(r.message);
      return onClose();
    }
    recordCustomerPayment(c.id, amt, `${method}${note.trim() ? ` - ${note.trim()}` : ''}`, undefined, needsBank(method) ? bankOpt(bank) : {});
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receive payment" subtitle="Money received against a customer's account.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <label className={labelCls} htmlFor="rc-cust">Customer</label>
          <PartyPicker<Customer> id="rc-cust" parties={sortedCustomers} value={cust} onChange={setCust} nextId="rc-amount" placeholder="Select customer…" optionText={(x) => `${x.name}${x.totalDue > 0 ? ` (owes Rs. ${x.totalDue.toLocaleString()})` : ''}`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="rc-amount">Amount (Rs.)</label>
            <div className="flex gap-1">
              <input id="rc-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
              {c && c.totalDue > 0 && <button type="button" onClick={() => setAmount(String(c.totalDue))} className="shrink-0 px-2 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-bold text-teal-700 dark:text-teal-300">Full</button>}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="rc-method">Method</label>
            <select id="rc-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{BILL_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          {needsBank(method) && <BankSelect id="rc-bank" className="col-span-2" label="Into bank" value={bank} onChange={setBank} />}
          {isCheque && <ChequeFieldsInput value={cheque} onChange={setCheque} idPrefix="rc-chq" />}
          <div className="col-span-2">
            <label className={labelCls} htmlFor="rc-note">Note</label>
            <input id="rc-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>Receive</button>
        </div>
      </form>
    </Modal>
  );
};

/**
 * Pay a supplier against what you owe them: cash, bank / wallet, or a cheque (which goes into the
 * cheque register as "given" and is paid from the bank only when it clears). Approval rules apply.
 */
export const PaySupplierModal: React.FC<{ isOpen: boolean; onClose: () => void; supplierId?: string | null }> = ({ isOpen, onClose, supplierId }) => {
  const { suppliers, recordSupplierPayment, issueCheque, supplierPaymentApproval, settings } = useTrading();
  const [sup, setSup] = useState(supplierId || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [bank, setBank] = useState('');
  const [note, setNote] = useState('');
  const [cheque, setCheque] = useState(emptyChequeFields());
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const isCheque = method === 'Cheque';
  const s = suppliers.find((x) => x.id === sup);
  const sortedSuppliers = useMemo(() => [...suppliers].sort((a, b) => b.totalOwed - a.totalOwed), [suppliers]);
  const amt = parseFloat(amount) || 0;
  const needsApproval = amt > 0 ? supplierPaymentApproval(amt) : null;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sent) return;
    if (!s) return setError('Pick the supplier.');
    if (amt <= 0) return setError('Enter the amount.');
    const closed = booksLockedFor(settings, todayISO());
    if (closed) return setError(closed);
    if (isCheque) {
      // A cheque goes into the cheque register (given, paid from the bank when it clears).
      const r = issueCheque({ supplierId: s.id, amount: amt, ...cheque, note: note.trim() || undefined, ...bankOpt(bank) });
      if (!r.success) return setError(r.message);
      if ('pendingApproval' in r && r.pendingApproval) return setSent(r.message);
      return onClose();
    }
    recordSupplierPayment(s.id, amt, `${method}${note.trim() ? ` - ${note.trim()}` : ''}`, undefined, needsBank(method) ? bankOpt(bank) : {});
    if (needsApproval) return setSent(`Sent for approval: ${needsApproval}. Nothing is paid until a manager approves it.`);
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pay supplier" subtitle="Money paid against what you owe a supplier.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        {sent && <div data-testid="payment-sent-for-approval"><Notice kind="ok">{sent}</Notice></div>}
        {!sent && needsApproval && (
          <p data-testid="payment-needs-approval" className="rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs font-bold text-amber-900 dark:text-amber-200">
            Needs a manager’s approval: {needsApproval}. Saving sends it to Approvals.
          </p>
        )}
        <div>
          <label className={labelCls} htmlFor="ps-sup">Supplier</label>
          <PartyPicker<Supplier> id="ps-sup" parties={sortedSuppliers} value={sup} onChange={setSup} nextId="ps-amount" placeholder="Select supplier…" nameOf={(x) => x.company || x.name} optionText={(x) => `${x.company || x.name}${x.totalOwed > 0 ? ` (you owe Rs. ${x.totalOwed.toLocaleString()})` : ''}`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ps-amount">Amount (Rs.)</label>
            <div className="flex gap-1">
              <input id="ps-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
              {s && s.totalOwed > 0 && <button type="button" onClick={() => setAmount(String(s.totalOwed))} className="shrink-0 px-2 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-bold text-teal-700 dark:text-teal-300">Full</button>}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="ps-method">Method</label>
            <select id="ps-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{BILL_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          {(needsBank(method) || isCheque) && <BankSelect id="ps-bank" className="col-span-2" label={isCheque ? 'Cheque drawn on' : 'Paid from bank'} value={bank} onChange={setBank} />}
          {isCheque && <ChequeFieldsInput value={cheque} onChange={setCheque} idPrefix="ps-chq" direction="issued" />}
          <div className="col-span-2">
            <label className={labelCls} htmlFor="ps-note">Note</label>
            <input id="ps-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>{sent ? 'Close' : 'Cancel'}</button>
          <button type="submit" disabled={Boolean(sent)} className={primaryBtn}>Pay</button>
        </div>
      </form>
    </Modal>
  );
};
