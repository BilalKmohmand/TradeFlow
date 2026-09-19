import React, { useRef, useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice } from './billing/ui';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When set, the modal edits this customer instead of creating one. */
  editId?: string | null;
}

/**
 * Add or edit a customer. Only the name and phone are needed. Nothing is invented for fields left
 * empty, and the credit limit is off unless one is typed (blank or 0 = no limit).
 */
export const CustomerModal: React.FC<CustomerModalProps> = ({ isOpen, onClose, editId }) => {
  const { addCustomer, updateCustomer, customers } = useTrading();
  const editing = editId ? customers.find((c) => c.id === editId) : undefined;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit customer' : 'New customer'} subtitle="Name and phone are enough. Everything else is optional.">
      {/* Remount per customer so the form always starts from that customer's details. */}
      <CustomerForm key={`${isOpen}-${editId || 'new'}`} editing={editing} customers={customers} addCustomer={addCustomer} updateCustomer={updateCustomer} onClose={onClose} />
    </Modal>
  );
};

const CustomerForm: React.FC<{
  editing: ReturnType<typeof useTrading>['customers'][number] | undefined;
  customers: ReturnType<typeof useTrading>['customers'];
  addCustomer: ReturnType<typeof useTrading>['addCustomer'];
  updateCustomer: ReturnType<typeof useTrading>['updateCustomer'];
  onClose: () => void;
}> = ({ editing, customers, addCustomer, updateCustomer, onClose }) => {
  const [name, setName] = useState(editing?.name || '');
  const [company, setCompany] = useState(editing?.company && editing.company !== editing.name ? editing.company : '');
  const [phone, setPhone] = useState(editing?.phone || '');
  const [creditLimit, setCreditLimit] = useState(editing && editing.creditLimit > 0 ? String(editing.creditLimit) : '');
  const [email, setEmail] = useState(editing?.email || '');
  const [address, setAddress] = useState(editing?.address || '');
  const [error, setError] = useState('');
  const busy = useRef(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    if (!name.trim()) return setError('Enter the customer name.');
    if (!phone.trim()) return setError('Enter a phone number.');
    const digits = phone.replace(/[^0-9]/g, '');
    const dup = customers.find((c) => c.id !== editing?.id && digits && c.phone.replace(/[^0-9]/g, '') === digits);
    if (dup) return setError(`${dup.name} already uses this phone number.`);
    const limit = creditLimit.trim() ? parseFloat(creditLimit.replace(/,/g, '')) : 0;
    if (!Number.isFinite(limit) || limit < 0) return setError('The credit limit must be a number (leave it empty for no limit).');
    busy.current = true;
    const data = {
      name: name.trim(),
      company: company.trim() || name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      creditLimit: limit,
    };
    if (editing) updateCustomer(editing.id, data);
    else addCustomer(data);
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={editing ? 'Edit customer' : 'New customer'}>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="cust-name">Name</label>
          <input id="cust-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Haji Karim" />
        </div>
        <div>
          <label className={labelCls} htmlFor="cust-company">Shop / business name (optional)</label>
          <input id="cust-company" value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} placeholder="e.g. Karim Store" />
        </div>
        <div>
          <label className={labelCls} htmlFor="cust-phone">Phone</label>
          <input id="cust-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputCls} font-mono`} placeholder="0300 1234567" />
        </div>
        <div>
          <label className={labelCls} htmlFor="cust-limit">Credit limit in Rs. (optional)</label>
          <input id="cust-limit" type="text" inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} className={`${inputCls} font-mono`} placeholder="Empty = no limit" />
          <p className="text-[11px] text-[#8E9299] mt-1">Bills that would take them over this are stopped unless a manager allows it.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="cust-email">Email (optional)</label>
          <input id="cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="cust-address">Address (optional)</label>
          <input id="cust-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
        <button type="submit" className={primaryBtn}>{editing ? 'Save changes' : 'Save customer'}</button>
      </div>
    </form>
  );
};
