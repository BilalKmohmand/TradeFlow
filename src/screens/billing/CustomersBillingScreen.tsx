import { CsvButton } from '../../components/billing/CsvButton';
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Phone, FilePlus2, HandCoins, Printer, Pencil, Trash2, Clock, FileText, Users, Route } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useWideLayout } from '../../hooks/useMediaQuery';
import { useBillingUI } from '../../components/billing/BillingUI';
import { useStockUI } from '../../components/billing/StockUI';
import { Modal, cardCls, inputCls, primaryBtn, secondaryBtn, dangerBtn, rs, moneyCls, PageHeader, EmptyState, RowAction } from '../../components/billing/ui';
import { creditUsage } from '../../utils/credit';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { billsOnly } from '../../utils/billing';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { Customer } from '../../types';
import { OverLimitBadge, CreditUsageBar } from '../../components/billing/CreditLimit';
import { CustomerRatesPanel } from '../../components/billing/CustomerRates';
import { CustomerSalesPanel } from '../../components/billing/SalesTeam';
import { billNetTotal } from '../../utils/salesDocs';

/** Customers the simple way: who they are, what they owe, and their bills. */
export const CustomersBillingScreen: React.FC<{ onAdd: () => void }> = ({ onAdd }) => {
  const { customers, invoices, ledger, setEditRequest, deleteCustomer, setPrintRequest, can, selectedCustomerId, setSelectedCustomerId } = useTrading();
  const ui = useBillingUI();
  const wide = useWideLayout();
  const stockUI = useStockUI();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  // Opened from elsewhere (Money, search): show that customer here.
  useEffect(() => {
    if (!selectedCustomerId) return;
    if (customers.some((c) => c.id === selectedCustomerId)) setOpenId(selectedCustomerId);
    setSelectedCustomerId(null);
  }, [selectedCustomerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = todayISO();
  const canDelete = can('delete_records');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.code || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q)).sort((a, b) => b.totalDue - a.totalDue || a.name.localeCompare(b.name));
  }, [customers, query]);
  const owed = customers.reduce((a, c) => a + c.totalDue, 0);
  const open = customers.find((c) => c.id === openId) || null;
  const openBills = open ? billsOnly(invoices).filter((i) => i.customerId === open.id).sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)) : [];
  const openPayments = open ? ledger.filter((l) => l.entityType === 'customer' && l.entityId === open.id && (l.type === 'payment_received' || l.type === 'cheque_received' || l.type === 'cheque_returned' || l.type === 'cheque_charge' || l.type === 'interest_charge')).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Customers" subtitle={<>{customers.length} customer{customers.length === 1 ? '' : 's'}{owed > 0 ? <> • they owe you <span className={moneyCls}>{rs(owed)}</span></> : ''}</>}>
        <button type="button" onClick={() => stockUI.aging('customers')} className={secondaryBtn}><Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Who owes for how long</button>
        <button type="button" onClick={() => ui.salesExtras('hub')} className={secondaryBtn}><Route className="w-4 h-4 text-teal-700 dark:text-teal-300" /> Sales &amp; recovery</button>
        <CsvButton fileName={`customers-${today}.csv`} table={() => ({ headers: ['Code', 'Name', 'Company', 'Phone', 'Address', 'Balance (Rs.)', 'Credit limit (Rs.)'], rows: rows.map((c) => [c.code || '', c.name, c.company, c.phone, c.address, c.totalDue, c.creditLimit || '']) })} label="Download customers CSV" />
        <button type="button" onClick={onAdd} className={`${primaryBtn} max-sm:flex-1`}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Add customer</button>
      </PageHeader>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, phone or ID" className={`${inputCls} pl-10`} aria-label="Search customers" />
      </div>
      <div className={`${cardCls} overflow-hidden`}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="w-5 h-5" />}
            text={query ? 'No customer matches that search.' : 'No customers yet. Add one here, or type a new name while making a bill.'}
            action={!query && <button type="button" onClick={onAdd} className={secondaryBtn}><Plus className="w-4 h-4" /> Add customer</button>}
          />
        ) : (
          <>
            {wide && <div className="grid grid-cols-[minmax(0,1fr)_14rem_9rem_auto] gap-4 items-center px-5 py-2.5 bg-[#FAF9F6] dark:bg-[#162436] text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]" aria-hidden="true">
              <span>Customer</span><span>Credit limit</span><span className="text-right">Balance</span><span className="w-[13.5rem]" />
            </div>}
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
              {rows.map((c) => {
                const u = creditUsage(c);
                const bar = u.over ? 'bg-rose-600' : u.pct >= 80 ? 'bg-amber-500' : 'bg-teal-600';
                const limitCell = u.limit > 0 ? (
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">Limit <span className={`${moneyCls} font-semibold text-[#374151] dark:text-[#CBD5E1]`}>{rs(u.limit)}</span></span>
                      <span className={`font-bold ${u.over ? 'text-rose-700 dark:text-rose-300' : u.pct >= 80 ? 'text-amber-700 dark:text-amber-300' : 'text-[#6B7280] dark:text-[#94A3B8]'}`}>{u.pct}% used</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[#E5E5E1] dark:bg-[#203248] overflow-hidden" role="progressbar" aria-label={`${c.name}: credit limit used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, u.pct)}>
                      <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, u.pct)}%` }} />
                    </div>
                  </div>
                ) : <span className="text-[11px] text-[#9CA3AF] dark:text-[#64748B]">No limit</span>;
                const balance = (
                  <div className="text-right">
                    {c.totalDue > 0 ? (
                      <><div className={`${moneyCls} font-bold text-sm text-amber-700 dark:text-amber-300`}>{rs(c.totalDue)}</div><div className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">owes you</div></>
                    ) : c.totalDue < 0 ? (
                      <><div className={`${moneyCls} font-bold text-sm text-teal-700 dark:text-teal-300`}>{rs(-c.totalDue)}</div><div className="text-[11px] text-teal-700 dark:text-teal-300">advance paid</div></>
                    ) : (
                      <div className="text-xs font-medium text-[#9CA3AF] dark:text-[#64748B]">Nothing due</div>
                    )}
                  </div>
                );
                return (
                  <li key={c.id} className="px-4 md:px-5 py-2.5 md:py-2 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors md:grid md:grid-cols-[minmax(0,1fr)_14rem_9rem_auto] md:gap-4 md:items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <button type="button" onClick={() => setOpenId(c.id)} className="flex-1 min-w-0 text-left py-1 group">
                        <span className="flex items-center gap-1.5 min-w-0 font-semibold text-sm text-[#111827] dark:text-white">
                          {c.code && <span className="shrink-0 text-[11px] font-bold text-teal-700 dark:text-teal-300">{c.code}</span>}
                          <span className="truncate group-hover:underline">{c.name}</span>
                          <OverLimitBadge customer={c} />
                        </span>
                        <span className="text-[11px] text-[#6B7280] dark:text-[#8E9299] flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone || 'no phone'}</span>
                      </button>
                      {!wide && <div className="shrink-0">{balance}</div>}
                    </div>
                    <div className={`${u.limit > 0 ? '' : 'max-md:hidden'} mt-1.5 md:mt-0`}>{limitCell}</div>
                    {wide && <div>{balance}</div>}
                    <div className="flex items-center justify-end gap-1 mt-1 md:mt-0 md:w-[13.5rem] max-md:-mr-2">
                      {c.totalDue > 0 && <RowAction label={`Receive payment from ${c.name}`} text="Receive" alwaysText icon={<HandCoins className="w-4 h-4" />} onClick={() => ui.receive(c.id)} />}
                      <RowAction label={`New bill for ${c.name}`} text="New bill" alwaysText tone="teal" icon={<FilePlus2 className="w-4 h-4" />} onClick={() => ui.newBill(c.id)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <Modal isOpen={Boolean(open)} onClose={() => setOpenId(null)} title={open?.name || 'Customer'} subtitle={open ? `${open.phone || 'no phone'}${open.address ? ` • ${open.address}` : ''}` : undefined} wide
        footer={open && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button type="button" onClick={() => { setOpenId(null); ui.newBill(open.id); }} className={`${primaryBtn} ${open.totalDue > 0 ? "" : "col-span-2"}`}><FilePlus2 className="w-4 h-4 text-teal-400 dark:text-teal-700" /> New bill</button>
              {open.totalDue > 0 && <button type="button" onClick={() => { setOpenId(null); ui.receive(open.id); }} className={secondaryBtn}><HandCoins className="w-4 h-4 text-teal-700 dark:text-teal-300" /> Receive payment</button>}
              <div className={`col-span-2 grid ${canDelete ? 'grid-cols-4' : 'grid-cols-3'} gap-2 sm:contents`}>
                <button type="button" onClick={() => { setOpenId(null); ui.newQuote(open.id); }} className={`${secondaryBtn} max-sm:flex-col max-sm:gap-1 max-sm:px-1 max-sm:py-2 max-sm:text-xs`}><FileText className="w-4 h-4" /> Quotation</button>
                <button type="button" onClick={() => setPrintRequest({ type: 'statement', customerId: open.id, from: `${today.slice(0, 4)}-01-01`, to: today })} className={`${secondaryBtn} max-sm:flex-col max-sm:gap-1 max-sm:px-1 max-sm:py-2 max-sm:text-xs`}><Printer className="w-4 h-4" /> Statement</button>
                <button type="button" onClick={() => { setOpenId(null); setEditRequest({ type: 'customer', id: open.id }); }} className={`${secondaryBtn} max-sm:flex-col max-sm:gap-1 max-sm:px-1 max-sm:py-2 max-sm:text-xs`}><Pencil className="w-4 h-4" /> Edit</button>
                {canDelete && <button type="button" onClick={() => setPendingDelete(open)} className={`${dangerBtn} max-sm:flex-col max-sm:gap-1 max-sm:px-1 max-sm:py-2 max-sm:text-xs sm:ml-auto`}><Trash2 className="w-4 h-4" /> Delete</button>}
              </div>
          </div>
        )}
      >
        {open && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">{open.totalDue < 0 ? 'Advance paid' : 'Owes you'}</div><div className={`tabular-nums font-extrabold ${open.totalDue > 0 ? 'text-amber-700 dark:text-amber-300' : open.totalDue < 0 ? 'text-teal-700 dark:text-teal-300' : 'text-[#111827] dark:text-white'}`}>{rs(Math.abs(open.totalDue))}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Bills</div><div className="tabular-nums font-extrabold text-[#111827] dark:text-white">{openBills.length}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Bought so far</div><div className="tabular-nums font-extrabold text-[#111827] dark:text-white">{rs(openBills.reduce((a, b) => a + billNetTotal(b), 0))}</div></div>
            </div>
            <CreditUsageBar customer={open} />
            <CustomerRatesPanel customerId={open.id} />
            <CustomerSalesPanel key={open.id} customerId={open.id} />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Bills</h3>
              {openBills.length === 0 ? <p className="text-sm text-[#8E9299]">No bills yet.</p> : (
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
                  {openBills.map((b) => (
                    <li key={b.id}><button type="button" onClick={() => { setOpenId(null); ui.openBill(b.id); }} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                      <span className="min-w-0"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{b.invoiceNumber}</span><span className="text-sm text-[#111827] dark:text-white">{formatDate(b.issueDate)}</span><span className="block text-[11px] text-[#8E9299] truncate">{b.items.map((it) => `${it.productName} × ${it.qty ?? it.kg}`).join(', ')}</span></span>
                      <span className="text-right shrink-0"><span className="tabular-nums font-bold text-sm text-[#111827] dark:text-white">{rs(billNetTotal(b))}</span><span className={`block text-[11px] font-bold ${b.balanceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{b.balanceDue > 0 ? `${rs(b.balanceDue)} due` : 'Paid'}</span></span>
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
                    <li key={l.id} className="flex justify-between gap-2 px-3 py-2"><span className="min-w-0 truncate">{formatDate(l.date)} • {l.type === 'payment_received' ? l.method || l.description.replace(/^Payment received:?\s*/, '') : l.description}</span>{l.debit > 0 ? <span className="tabular-nums font-bold text-rose-700 dark:text-rose-300 shrink-0">+ {rs(l.debit)}</span> : <span className="tabular-nums font-bold text-teal-700 dark:text-teal-300 shrink-0">{rs(l.credit)}</span>}</li>
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
