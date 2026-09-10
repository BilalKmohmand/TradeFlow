import React, { useMemo, useState } from 'react';
import { Plus, Search, Phone, FilePlus2, HandCoins, Printer, Pencil, Trash2 } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../../components/billing/BillingUI';
import { Modal, cardCls, inputCls, primaryBtn, secondaryBtn, dangerBtn, rs } from '../../components/billing/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { billsOnly } from '../../utils/billing';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { Customer } from '../../types';

/** Customers the simple way: who they are, what they owe, and their bills. */
export const CustomersBillingScreen: React.FC<{ onAdd: () => void }> = ({ onAdd }) => {
  const { customers, invoices, ledger, setEditRequest, deleteCustomer, setPrintRequest, can } = useTrading();
  const ui = useBillingUI();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const today = todayISO();
  const canDelete = can('delete_records');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.company || '').toLowerCase().includes(q)).sort((a, b) => b.totalDue - a.totalDue || a.name.localeCompare(b.name));
  }, [customers, query]);
  const owed = customers.reduce((a, c) => a + c.totalDue, 0);
  const open = customers.find((c) => c.id === openId) || null;
  const openBills = open ? billsOnly(invoices).filter((i) => i.customerId === open.id).sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)) : [];
  const openPayments = open ? ledger.filter((l) => l.entityType === 'customer' && l.entityId === open.id && l.type === 'payment_received').sort((a, b) => (a.date < b.date ? 1 : -1)) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-white">Customers</h1>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{customers.length} customer{customers.length === 1 ? '' : 's'}{owed > 0 ? ` • they owe you ${rs(owed)}` : ''}</p>
        </div>
        <button type="button" onClick={onAdd} className={primaryBtn}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Add customer</button>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone" className={`${inputCls} pl-10`} aria-label="Search customers" />
      </div>
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280] dark:text-[#94A3B8]">No customers yet. Add one here, or type a new name while making a bill.</div>
        ) : (
          <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 sm:px-5 py-3 hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                <button type="button" onClick={() => setOpenId(c.id)} className="flex-1 min-w-0 text-left">
                  <div className="font-semibold text-sm text-[#111827] dark:text-white truncate">{c.name}</div>
                  <div className="text-[11px] text-[#8E9299] flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone || 'no phone'}</div>
                </button>
                <div className="text-right shrink-0">
                  <div className={`font-mono font-bold text-sm ${c.totalDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-[#111827] dark:text-white'}`}>{c.totalDue > 0 ? rs(c.totalDue) : 'Clear'}</div>
                  {c.totalDue > 0 && <div className="text-[11px] text-[#8E9299]">owes you</div>}
                </div>
                <button type="button" onClick={() => ui.newBill(c.id)} aria-label={`New bill for ${c.name}`} className="p-2.5 rounded-xl text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40"><FilePlus2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal isOpen={Boolean(open)} onClose={() => setOpenId(null)} title={open?.name || 'Customer'} subtitle={open ? `${open.phone || 'no phone'}${open.address ? ` • ${open.address}` : ''}` : undefined} wide
        footer={open && (
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setOpenId(null); ui.newBill(open.id); }} className={primaryBtn}><FilePlus2 className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New bill</button>
              {open.totalDue > 0 && <button type="button" onClick={() => { setOpenId(null); ui.receive(open.id); }} className={secondaryBtn}><HandCoins className="w-4 h-4 text-teal-700" /> Receive payment</button>}
              <button type="button" onClick={() => setPrintRequest({ type: 'statement', customerId: open.id, from: `${today.slice(0, 4)}-01-01`, to: today })} className={secondaryBtn}><Printer className="w-4 h-4" /> Statement</button>
              <button type="button" onClick={() => { setOpenId(null); setEditRequest({ type: 'customer', id: open.id }); }} className={secondaryBtn}><Pencil className="w-4 h-4" /> Edit</button>
            </div>
            {canDelete && <button type="button" onClick={() => setPendingDelete(open)} className={dangerBtn}><Trash2 className="w-4 h-4" /> Delete</button>}
          </div>
        )}
      >
        {open && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Owes you</div><div className={`font-mono font-extrabold ${open.totalDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-[#111827] dark:text-white'}`}>{rs(open.totalDue)}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Bills</div><div className="font-mono font-extrabold text-[#111827] dark:text-white">{openBills.length}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Bought so far</div><div className="font-mono font-extrabold text-[#111827] dark:text-white">{rs(openBills.reduce((a, b) => a + b.totalAmount, 0))}</div></div>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Bills</h3>
              {openBills.length === 0 ? <p className="text-sm text-[#8E9299]">No bills yet.</p> : (
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
                  {openBills.map((b) => (
                    <li key={b.id}><button type="button" onClick={() => { setOpenId(null); ui.openBill(b.id); }} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                      <span className="min-w-0"><span className="font-mono text-xs text-[#8E9299] mr-2">{b.invoiceNumber}</span><span className="text-sm text-[#111827] dark:text-white">{formatDate(b.issueDate)}</span><span className="block text-[11px] text-[#8E9299] truncate">{b.items.map((it) => `${it.productName} × ${it.qty ?? it.kg}`).join(', ')}</span></span>
                      <span className="text-right shrink-0"><span className="font-mono font-bold text-sm text-[#111827] dark:text-white">{rs(b.totalAmount)}</span><span className={`block text-[11px] font-bold ${b.balanceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{b.balanceDue > 0 ? `${rs(b.balanceDue)} due` : 'Paid'}</span></span>
                    </button></li>
                  ))}
                </ul>
              )}
            </div>
            {openPayments.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Money received</h3>
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-sm">
                  {openPayments.slice(0, 12).map((l) => (
                    <li key={l.id} className="flex justify-between px-3 py-2"><span>{formatDate(l.date)} • {l.method || l.description.replace(/^Payment received:?\s*/, '')}</span><span className="font-mono font-bold text-teal-700 dark:text-teal-300">{rs(l.credit)}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name || ''}?`}
        message="The customer, their bills and their payment history are removed."
        details={pendingDelete ? [`Owes ${rs(pendingDelete.totalDue)}`, `${billsOnly(invoices).filter((i) => i.customerId === pendingDelete.id).length} bill(s)`] : []}
        confirmLabel="Delete customer"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteCustomer(pendingDelete.id);
          setPendingDelete(null);
          setOpenId(null);
        }}
      />
    </div>
  );
};
