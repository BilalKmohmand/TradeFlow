import React, { useState } from 'react';
import { Landmark, Plus, Pencil, Trash2 } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Notice, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, rs, RowAction } from './ui';
import { BankAccount } from '../../utils/banks';
import { ConfirmDialog } from '../ConfirmDialog';

/** Money → Overview: the balance of every bank account, and adding / changing them. */
export const BankAccountsCard: React.FC<{ balances: Record<string, number>; onOpenBank?: (code: string) => void }> = ({ balances, onOpenBank }) => {
  const { bankAccounts, can, deleteBankAccount, bankInUse } = useTrading();
  const canManage = can('finance:cashbook') || can('finance:view_pnl');
  const [edit, setEdit] = useState<BankAccount | 'new' | null>(null);
  const [pendingDel, setPendingDel] = useState<BankAccount | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const total = bankAccounts.reduce((a, b) => a + (balances[b.code] || 0), 0);
  return (
    <div className={`${cardCls} overflow-hidden`} data-testid="bank-accounts">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-[#E5E5E1] dark:border-[#203248]">
        <h2 className="font-bold text-[#111827] dark:text-white inline-flex items-center gap-2"><Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /> Bank accounts</h2>
        <span className="flex items-center gap-2 ml-auto">
          <span className="tabular-nums whitespace-nowrap font-bold text-sm">{rs(total)}</span>
          {canManage && <button type="button" onClick={() => { setMsg(null); setEdit('new'); }} className={secondaryBtn}><Plus className="w-4 h-4" /> Add bank account</button>}
        </span>
      </div>
      {msg && <div className="px-4 pt-3"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
        {bankAccounts.map((b) => (
          <li key={b.code} className="flex items-center gap-2 pl-4 sm:pl-5 pr-2 py-2" data-testid={`bank-row-${b.code}`}>
            <button type="button" onClick={() => onOpenBank?.(b.code)} className="flex-1 min-w-0 text-left py-1">
              <span className="font-semibold text-sm text-[#111827] dark:text-white block truncate">{b.name}{b.isMain ? <span className="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#162436] text-[#6B7280]">main</span> : null}</span>
              <span className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">{b.code}{b.accountTitle ? ` • ${b.accountTitle}` : ''}{b.accountNumber ? ` • A/C ${b.accountNumber}` : ''}</span>
            </button>
            <span className="tabular-nums whitespace-nowrap font-bold text-sm text-[#111827] dark:text-white" data-testid={`bank-balance-${b.code}`}>{rs(balances[b.code] || 0)}</span>
            {canManage && <RowAction label={`Edit ${b.name}`} icon={<Pencil className="w-4 h-4" />} onClick={() => { setMsg(null); setEdit(b); }} />}
            {canManage && !b.isMain && can('delete_records') && !bankInUse(b.code) && <RowAction label={`Remove ${b.name}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPendingDel(b)} />}
          </li>
        ))}
      </ul>
      {edit && <BankAccountModal bank={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={(t) => setMsg({ kind: 'ok', text: t })} />}
      <ConfirmDialog
        isOpen={Boolean(pendingDel)}
        title={`Remove ${pendingDel?.name || ''}?`}
        message="No money has gone through it, so it is simply taken off the list."
        confirmLabel="Remove"
        onCancel={() => setPendingDel(null)}
        onConfirm={() => { if (pendingDel) { const r = deleteBankAccount(pendingDel.code); setMsg({ kind: r.success ? 'ok' : 'error', text: r.message }); } setPendingDel(null); }}
      />
    </div>
  );
};

const BankAccountModal: React.FC<{ bank: BankAccount | null; onClose: () => void; onSaved: (text: string) => void }> = ({ bank, onClose, onSaved }) => {
  const { addBankAccount, updateBankAccount } = useTrading();
  const [f, setF] = useState({ bankName: bank?.bankName || '', accountTitle: bank?.accountTitle || '', accountNumber: bank?.accountNumber || '', opening: bank ? String(bank.openingBalance || 0) : '' });
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { bankName: f.bankName, accountTitle: f.accountTitle, accountNumber: f.accountNumber, openingBalance: parseFloat(f.opening) || 0 };
    const r = bank ? updateBankAccount(bank.code, input) : addBankAccount(input);
    if (!r.success) return setError(r.message);
    onSaved(r.message);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={bank ? `Edit ${bank.name}` : 'Add bank account'} subtitle="Money can then be paid and received through it. The opening balance is what it had on the day the books start.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="bank-name">Bank name</label>
            <input id="bank-name" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} className={inputCls} placeholder="e.g. HBL, UBL, Meezan" list="bank-names" />
            <datalist id="bank-names">{['HBL', 'UBL', 'MCB', 'ABL', 'BAHL', 'BAFL', 'BOP', 'MBL', 'Meezan Bank', 'National Bank', 'Askari Bank', 'Faysal Bank', 'Bank of Khyber', 'JS Bank'].map((b) => <option key={b} value={b} />)}</datalist>
          </div>
          {!bank?.isMain && (
            <>
              <div>
                <label className={labelCls} htmlFor="bank-title">Account title (optional)</label>
                <input id="bank-title" value={f.accountTitle} onChange={(e) => setF({ ...f, accountTitle: e.target.value })} className={inputCls} placeholder="e.g. Madina Oil Traders" />
              </div>
              <div>
                <label className={labelCls} htmlFor="bank-number">Account number (optional)</label>
                <input id="bank-number" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} className={`${inputCls} tabular-nums`} />
              </div>
            </>
          )}
          <div>
            <label className={labelCls} htmlFor="bank-opening">Opening balance (Rs.)</label>
            <input id="bank-opening" type="number" inputMode="decimal" step="any" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="0" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>{bank ? 'Save' : 'Add bank account'}</button>
        </div>
      </form>
    </Modal>
  );
};
