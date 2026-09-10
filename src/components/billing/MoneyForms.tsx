import React, { useState } from 'react';
import { useTrading, BILL_PAYMENT_METHODS } from '../../context/TradingContext';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../../types';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice } from './ui';
import { todayISO } from '../../utils/stockFlow';
import { collectCashMovements, accountBalancesOn } from '../../utils/finance';
import { rs } from './ui';

const EXPENSE_PAID_VIA = ['Cash', 'Bank Transfer', 'Easypaisa / JazzCash', 'Card', 'Credit (unpaid)'];

/** Record an expense: what, how much, which sheet (category) it belongs to, and how it was paid. */
export const ExpenseModal: React.FC<{ isOpen: boolean; onClose: () => void; date?: string; category?: ExpenseCategory }> = ({ isOpen, onClose, date, category }) => {
  const { addExpense } = useTrading();
  const [form, setForm] = useState({ date: date || todayISO(), category: (category || 'daily') as ExpenseCategory, amount: '', description: '', paidVia: 'Cash' });
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) return setError('Enter the amount.');
    if (!form.description.trim()) return setError('Write what this expense was for.');
    addExpense({ date: form.date, category: form.category, amount, description: form.description.trim(), paidVia: form.paidVia, truckId: null, dispatchId: null });
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
            <input id="exp-amount" type="number" inputMode="decimal" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${inputCls} font-mono`} placeholder="0" />
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
  const { addCashTransfer, ledger, expenses, cashEntries, customers, suppliers, settings } = useTrading();
  const balances = accountBalancesOn(collectCashMovements(ledger, expenses, cashEntries, customers, suppliers), settings, todayISO());
  const [from, setFrom] = useState<'cash' | 'bank'>('cash');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount) || 0;
    const available = from === 'cash' ? balances.cash : balances.bank;
    if (amt > available + 0.005) return setError(`Only ${rs(available)} is ${from === 'cash' ? 'in the cash drawer' : 'in the bank'} right now.`);
    const r = addCashTransfer({ amount: amt, from, date, note: note.trim() || undefined });
    if (!r.success) return setError(r.message);
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cash ↔ Bank" subtitle="Deposit cash into the bank, or withdraw cash from it.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setFrom('cash')} className={`rounded-2xl border p-3 text-sm font-bold ${from === 'cash' ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300' : 'border-[#E5E5E1] dark:border-[#203248] text-[#6B7280]'}`}>Deposit to bank<div className="text-[11px] font-normal">cash in hand {rs(balances.cash)}</div></button>
          <button type="button" onClick={() => setFrom('bank')} className={`rounded-2xl border p-3 text-sm font-bold ${from === 'bank' ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300' : 'border-[#E5E5E1] dark:border-[#203248] text-[#6B7280]'}`}>Withdraw cash<div className="text-[11px] font-normal">in bank {rs(balances.bank)}</div></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="tr-amount">Amount (Rs.)</label>
            <input id="tr-amount" autoFocus type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} font-mono`} placeholder="0" />
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
  const { customers, recordCustomerPayment } = useTrading();
  const [cust, setCust] = useState(customerId || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const c = customers.find((x) => x.id === cust);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount) || 0;
    if (!c) return setError('Pick the customer.');
    if (amt <= 0) return setError('Enter the amount.');
    if (amt > c.totalDue + 0.005) return setError(c.totalDue > 0 ? `${c.name} owes only ${rs(c.totalDue)}. Enter up to that amount.` : `${c.name} owes nothing right now. Make a bill first.`);
    recordCustomerPayment(c.id, amt, `${method}${note.trim() ? ` - ${note.trim()}` : ''}`);
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receive payment" subtitle="Money received against a customer's account.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <label className={labelCls} htmlFor="rc-cust">Customer</label>
          <select id="rc-cust" value={cust} onChange={(e) => setCust(e.target.value)} className={inputCls}>
            <option value="">Select customer…</option>
            {[...customers].sort((a, b) => b.totalDue - a.totalDue).map((x) => <option key={x.id} value={x.id}>{x.name}{x.totalDue > 0 ? ` (owes Rs. ${x.totalDue.toLocaleString()})` : ''}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="rc-amount">Amount (Rs.)</label>
            <div className="flex gap-1">
              <input id="rc-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} font-mono`} placeholder="0" />
              {c && c.totalDue > 0 && <button type="button" onClick={() => setAmount(String(c.totalDue))} className="shrink-0 px-2 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-bold text-teal-700 dark:text-teal-300">Full</button>}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="rc-method">Method</label>
            <select id="rc-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{BILL_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
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
