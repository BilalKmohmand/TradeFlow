import React, { useRef, useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice } from './billing/ui';
import { codeTaken } from '../utils/partyCode';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When set, the modal edits this supplier instead of creating one. */
  editId?: string | null;
}

/**
 * Add or edit a supplier. Only the name and phone are needed; nothing is invented for fields left empty.
 */
export const SupplierModal: React.FC<SupplierModalProps> = ({ isOpen, onClose, editId }) => {
  const { addSupplier, updateSupplier, suppliers } = useTrading();
  const editing = editId ? suppliers.find((s) => s.id === editId) : undefined;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit supplier' : 'New supplier'} subtitle="Name and phone are enough. Everything else is optional.">
      {/* Remount per supplier so the form always starts from that supplier's details. */}
      <SupplierForm key={`${isOpen}-${editId || 'new'}`} editing={editing} suppliers={suppliers} addSupplier={addSupplier} updateSupplier={updateSupplier} onClose={onClose} />
    </Modal>
  );
};

type Ctx = ReturnType<typeof useTrading>;

const SupplierForm: React.FC<{
  editing: Ctx['suppliers'][number] | undefined;
  suppliers: Ctx['suppliers'];
  addSupplier: Ctx['addSupplier'];
  updateSupplier: Ctx['updateSupplier'];
  onClose: () => void;
}> = ({ editing, suppliers, addSupplier, updateSupplier, onClose }) => {
  const [code, setCode] = useState(editing?.code || '');
  const [name, setName] = useState(editing?.name || '');
  const [company, setCompany] = useState(editing?.company && editing.company !== editing.name ? editing.company : '');
  const [phone, setPhone] = useState(editing?.phone || '');
  const [category, setCategory] = useState(editing?.materialCategory || '');
  const [email, setEmail] = useState(editing?.email || '');
  const [address, setAddress] = useState(editing?.address || '');
  const [error, setError] = useState('');
  const busy = useRef(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    if (!name.trim()) return setError('Enter the supplier name.');
    if (!phone.trim()) return setError('Enter a phone number.');
    const digits = phone.replace(/[^0-9]/g, '');
    const dup = suppliers.find((s) => s.id !== editing?.id && digits && s.phone.replace(/[^0-9]/g, '') === digits);
    if (dup) return setError(`${dup.company || dup.name} already uses this phone number.`);
    const taken = codeTaken(suppliers, code, editing?.id);
    if (taken) return setError(`Supplier ID ${code.trim()} is already used by ${taken.company || taken.name}.`);
    busy.current = true;
    const data = {
      code: code.trim() || undefined,
      name: name.trim(),
      company: company.trim() || name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      materialCategory: category.trim(),
      address: address.trim(),
    };
    if (editing) updateSupplier(editing.id, data);
    else addSupplier(data);
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={editing ? 'Edit supplier' : 'New supplier'}>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="sup-code">Supplier ID (optional)</label>
          <input id="sup-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="Your own code, e.g. S-104" autoCapitalize="characters" />
        </div>
        <div>
          <label className={labelCls} htmlFor="sup-name">Name</label>
          <input id="sup-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Iftikhar" />
        </div>
        <div>
          <label className={labelCls} htmlFor="sup-company">Company / mill name (optional)</label>
          <input id="sup-company" value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} placeholder="e.g. Tajj Mill" />
        </div>
        <div>
          <label className={labelCls} htmlFor="sup-phone">Phone</label>
          <input id="sup-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0300 1234567" />
        </div>
        <div>
          <label className={labelCls} htmlFor="sup-category">What they supply (optional)</label>
          <input id="sup-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="e.g. Ghee, cooking oil" />
        </div>
        <div>
          <label className={labelCls} htmlFor="sup-email">Email (optional)</label>
          <input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="sup-address">Address (optional)</label>
          <input id="sup-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
        <button type="submit" className={primaryBtn}>{editing ? 'Save changes' : 'Save supplier'}</button>
      </div>
    </form>
  );
};
