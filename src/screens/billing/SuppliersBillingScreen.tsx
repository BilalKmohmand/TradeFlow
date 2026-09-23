import { CsvButton } from '../../components/billing/CsvButton';
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Phone, PackagePlus, HandCoins, Printer, Pencil, Trash2, Undo2, Clock, Layers } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { useStockUI } from '../../components/billing/StockUI';
import { PurchaseRegisterView } from '../../components/billing/BillingReports';
import { Modal, Notice, cardCls, inputCls, primaryBtn, secondaryBtn, dangerBtn, rs, moneyCls, PageHeader, EmptyState, RowAction, pillCls } from '../../components/billing/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { formatDate } from '../../utils/formatters';
import { todayISO } from '../../utils/stockFlow';
import { booksLockedFor } from '../../utils/accounting';
import { Supplier } from '../../types';
import { usePurchasingUI } from '../../components/billing/purchasing/PurchasingUI';
import { useBillingUI, useRequestedView, useCurrentView } from '../../components/billing/BillingUI';
import { PurchaseOrdersView } from '../../components/billing/purchasing/PurchaseOrders';
import { SupplierBillsView } from '../../components/billing/purchasing/SupplierBills';
import { SupplierClaimsView } from '../../components/billing/purchasing/SupplierClaims';
import { ClipboardList, FileText, ShieldAlert, MapPin } from 'lucide-react';
import { CityFilter, PartyBalancesView } from '../../components/billing/PartyBalances';
import { filterParties } from '../../utils/vouchers';

type Tab = 'suppliers' | 'orders' | 'received' | 'bills' | 'claims' | 'returns';
/** The Suppliers tabs (the nav map has an entry for each); views besides tabs: 'add', 'city'. */
export const SUPPLIER_TABS: readonly Tab[] = ['suppliers', 'orders', 'received', 'bills', 'claims', 'returns'];
export const SUPPLIER_VIEWS: readonly string[] = [...SUPPLIER_TABS, 'add', 'city'];
const num = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });

/** Suppliers the simple way: what you owe them, stock received, goods sent back. No bookings or dispatches. */
export const SuppliersBillingScreen: React.FC<{ onAdd: () => void }> = ({ onAdd }) => {
  const { suppliers, purchases, returns, products, ledger, setEditRequest, deleteSupplier, setPrintRequest, can, deletePurchaseReturn, settings, selectedSupplierId, setSelectedSupplierId } = useTrading();
  const stock = useStockUI();
  const buy = usePurchasingUI();
  const ui = useBillingUI();
  const onPay = (id: string) => ui.paySupplier(id);
  const { purchaseOrders, supplierClaims } = useTrading();
  const openOrders = purchaseOrders.filter((p) => p.status === 'open' || p.status === 'partial').length;
  const openClaims = supplierClaims.filter((c) => c.status === 'open').length;
  const [tab, setTab] = useState<Tab>(() => { const v = ui.peekView('suppliers'); return (SUPPLIER_TABS as readonly string[]).includes(v || '') ? (v as Tab) : 'suppliers'; });
  // Menus / search: a tab, "add" (new supplier) or "city" (payable by city).
  useRequestedView('suppliers', (v) => {
    if ((SUPPLIER_TABS as readonly string[]).includes(v)) setTab(v as Tab);
    else if (v === 'add') onAdd();
    else if (v === 'city') setShowBalances(true);
  });
  useCurrentView('suppliers', tab);
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [showBalances, setShowBalances] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);
  // Opened from elsewhere (Money, search): show that supplier here.
  useEffect(() => {
    if (!selectedSupplierId) return;
    if (suppliers.some((x) => x.id === selectedSupplierId)) { setTab('suppliers'); setOpenId(selectedSupplierId); }
    setSelectedSupplierId(null);
  }, [selectedSupplierId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pendingReturn, setPendingReturn] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const today = todayISO();
  const canDelete = can('delete_records');
  const canStock = can('products:create') || can('stock:adjust');
  const canAdd = can('suppliers:create');
  const canEditSup = can('suppliers:edit');
  const canPay = can('finance:record_payment');
  const rows = useMemo(() => {
    return filterParties<Supplier>(suppliers, query, city)
      .sort((a, b) => b.totalOwed - a.totalOwed || (a.company || a.name).localeCompare(b.company || b.name));
  }, [suppliers, query, city]);
  const owed = suppliers.reduce((a, s) => a + Math.max(0, s.totalOwed), 0);
  const open = suppliers.find((s) => s.id === openId) || null;
  const productName = (id: string) => products.find((p) => p.id === id)?.name || 'Item';
  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit || 'pcs';
  const openPurchases = open ? purchases.filter((p) => p.supplierId === open.id).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
  const openPayments = open ? ledger.filter((l) => l.entityType === 'supplier' && l.entityId === open.id && l.type === 'payment_made').sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
  const debitNotes = useMemo(() => returns.filter((r) => r.kind === 'purchase').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.returnNumber.localeCompare(a.returnNumber))), [returns]);
  const openReturns = open ? debitNotes.filter((r) => r.supplierId === open.id) : [];
  const supName = (id?: string | null) => {
    const s = suppliers.find((x) => x.id === id);
    return s ? s.company || s.name : 'Supplier';
  };

  const tabBtn = (id: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`${pillCls(tab === id, 'teal')} px-4 text-sm`}>{label}</button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Suppliers" subtitle={<>{suppliers.length} supplier{suppliers.length === 1 ? '' : 's'}{owed > 0 ? <> • you owe <span className={moneyCls}>{rs(owed)}</span></> : ''}</>}>
        {canStock && <button type="button" onClick={() => stock.purchaseReturn()} className={secondaryBtn}><Undo2 className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Return goods</button>}
        <button type="button" onClick={() => stock.aging('suppliers')} className={secondaryBtn}><Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" /> How long owed</button>
        <button type="button" onClick={() => setShowBalances(true)} className={secondaryBtn}><MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /> Payable by city</button>
        <CsvButton fileName={`suppliers-${todayISO()}.csv`} table={() => ({ headers: ['Code', 'Name', 'Company', 'Phone', 'City', 'Contact person', 'Sales tax #', 'Fax', 'Address', 'You owe (Rs.)'], rows: rows.map((x) => [x.code || '', x.name, x.company, x.phone, x.city || '', x.contactPerson || '', x.salesTaxNo || '', x.fax || '', x.address, x.totalOwed]) })} label="Download suppliers CSV" />
        {canAdd && <button type="button" onClick={onAdd} className={`${primaryBtn} max-sm:flex-1`}><Plus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Add supplier</button>}
      </PageHeader>
      <div role="tablist" aria-label="Suppliers views" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {tabBtn('suppliers', 'Suppliers')}
        {tabBtn('orders', `Orders${openOrders ? ` (${openOrders})` : ''}`)}
        {tabBtn('received', 'Stock received')}
        {tabBtn('bills', 'Supplier bills')}
        {tabBtn('claims', `Claims${openClaims ? ` (${openClaims})` : ''}`)}
        {tabBtn('returns', `Returns${debitNotes.length ? ` (${debitNotes.length})` : ''}`)}
      </div>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {tab === 'suppliers' && (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, code, city, phone or contact" className={`${inputCls} pl-10`} aria-label="Search suppliers" />
            </div>
            <CityFilter id="supplier-city" value={city} onChange={setCity} />
          </div>
          <div className={`${cardCls} overflow-hidden`}>
            {rows.length === 0 ? (
              <EmptyState
                icon={<Layers className="w-5 h-5" />}
                text={query || city ? 'No supplier matches that search.' : 'No suppliers yet. Add the companies you buy stock from.'}
                action={!query && !city && canAdd && <button type="button" onClick={onAdd} className={secondaryBtn}><Plus className="w-4 h-4" /> Add supplier</button>}
              />
            ) : (
              <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]">
                {rows.map((s) => (
                  <li key={s.id} className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 px-4 md:px-5 py-2.5 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                    <button type="button" onClick={() => setOpenId(s.id)} className="flex-1 min-w-0 text-left py-1 group">
                      <span className="flex items-center gap-1.5 min-w-0 font-semibold text-sm text-[#111827] dark:text-white">{s.code && <span className="shrink-0 text-[11px] font-bold text-teal-700 dark:text-teal-300">{s.code}</span>}<span className="truncate group-hover:underline">{s.company || s.name}</span></span>
                      <span className="text-[11px] text-[#6B7280] dark:text-[#8E9299] flex items-center gap-1 truncate"><Phone className="w-3 h-3 shrink-0" /> {s.phone || 'no phone'}{s.company && s.name !== s.company ? ` • ${s.name}` : ''}{s.city ? ` • ${s.city}` : ''}</span>
                    </button>
                    <div className="text-right shrink-0 md:w-36">
                      {s.totalOwed > 0 ? (
                        <><div className={`${moneyCls} font-bold text-sm text-rose-700 dark:text-rose-300`}>{rs(s.totalOwed)}</div><div className="text-[11px] text-[#6B7280] dark:text-[#8E9299]">you owe</div></>
                      ) : s.totalOwed < 0 ? (
                        <><div className={`${moneyCls} font-bold text-sm text-teal-700 dark:text-teal-300`}>{rs(-s.totalOwed)}</div><div className="text-[11px] text-teal-700 dark:text-teal-300">they owe you</div></>
                      ) : (
                        <div className="text-xs font-medium text-[#9CA3AF] dark:text-[#64748B]">Nothing due</div>
                      )}
                    </div>
                    <div className="w-full md:w-auto flex justify-end gap-1 max-md:-mr-2">
                      {s.totalOwed > 0 && canPay && <RowAction label={`Pay ${s.company || s.name}`} text="Pay" alwaysText icon={<HandCoins className="w-4 h-4" />} onClick={() => onPay(s.id)} />}
                      {canStock && <RowAction label={`Receive stock from ${s.company || s.name}`} text="Receive stock" alwaysText tone="teal" icon={<PackagePlus className="w-4 h-4" />} onClick={() => stock.receiveStock({ supplierId: s.id })} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {tab === 'orders' && <PurchaseOrdersView onNew={() => buy.newOrder()} onOpen={buy.openOrder} onReceive={(id) => stock.receiveStock({ purchaseOrderId: id })} onReorder={buy.reorder} />}

      {tab === 'received' && <PurchaseRegisterView />}

      {tab === 'bills' && <SupplierBillsView onNew={() => buy.recordBill()} />}

      {tab === 'claims' && <SupplierClaimsView onNew={() => buy.newClaim()} />}

      {tab === 'returns' && (
        <div className={`${cardCls} overflow-hidden`}>
          {debitNotes.length === 0 ? (
            <EmptyState icon={<Undo2 className="w-5 h-5" />} text={<>No goods sent back yet. Use <strong>Return goods</strong> when you send stock back to a supplier.</>} />
          ) : (
            <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40]" aria-label="Debit notes">
              {debitNotes.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-4 sm:px-5 py-2.5 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[#111827] dark:text-white truncate"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{r.returnNumber}</span>{supName(r.supplierId)}</div>
                    <div className="text-[11px] text-[#8E9299] truncate">{formatDate(r.date)} • {num(r.kg)} {r.unit || unitOf(r.productId)} {productName(r.productId)} • {r.reason}</div>
                  </div>
                  <span className={`${moneyCls} font-bold text-sm shrink-0 text-[#111827] dark:text-white`}>{rs(r.amount)}</span>
                  <RowAction label={`Print debit note ${r.returnNumber}`} text="Print" icon={<Printer className="w-4 h-4" />} onClick={() => setPrintRequest({ type: 'debit_note', returnId: r.id })} />
                  {canDelete && !booksLockedFor(settings, r.date) && <RowAction label={`Delete debit note ${r.returnNumber}`} tone="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setPendingReturn(r.id)} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal isOpen={Boolean(open)} onClose={() => setOpenId(null)} title={open ? open.company || open.name : 'Supplier'} subtitle={open ? `${open.code ? `${open.code} • ` : ''}${open.phone || 'no phone'}${open.city ? ` • ${open.city}` : ''}${open.address && open.address !== open.city ? ` • ${open.address}` : ''}` : undefined} wide
        footer={open && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              {canStock && <button type="button" onClick={() => { const id = open.id; setOpenId(null); stock.receiveStock({ supplierId: id }); }} className={primaryBtn}><PackagePlus className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Receive stock</button>}
              {canPay && <button type="button" onClick={() => { const id = open.id; setOpenId(null); onPay(id); }} className={`${secondaryBtn} ${canStock ? "" : "col-span-2"}`}><HandCoins className="w-4 h-4 text-teal-700 dark:text-teal-300" /> Pay</button>}
              {canStock && <button type="button" onClick={() => { const id = open.id; setOpenId(null); buy.newOrder({ supplierId: id }); }} className={secondaryBtn}><ClipboardList className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /> New order</button>}
              {can('suppliers:edit') && <button type="button" onClick={() => { const id = open.id; setOpenId(null); buy.recordBill({ supplierId: id }); }} className={secondaryBtn}><FileText className="w-4 h-4" /> Supplier bill</button>}
              {can('suppliers:edit') && <button type="button" onClick={() => { const id = open.id; setOpenId(null); buy.newClaim({ supplierId: id }); }} className={`${secondaryBtn} col-span-2 sm:col-span-1`}><ShieldAlert className="w-4 h-4 text-amber-600" /> Claim</button>}
              <div className={`col-span-2 grid ${['grid-cols-1', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][1 + (canEditSup ? 1 : 0) + (canDelete ? 1 : 0) + (canStock ? 1 : 0)]} gap-2 sm:contents`}>
                {canStock && <button type="button" onClick={() => { const id = open.id; setOpenId(null); stock.purchaseReturn({ supplierId: id }); }} className={`${secondaryBtn} max-sm:flex-col max-sm:gap-1 max-sm:px-1 max-sm:py-2 max-sm:text-xs`}><Undo2 className="w-4 h-4 text-rose-600" /> Return goods</button>}
                <button type="button" onClick={() => setPrintRequest({ type: 'supplier_statement', supplierId: open.id, from: `${today.slice(0, 4)}-01-01`, to: today })} className={`${secondaryBtn} max-sm:flex-col max-sm:gap-1 max-sm:px-1 max-sm:py-2 max-sm:text-xs`}><Printer className="w-4 h-4" /> Statement</button>
                {canEditSup && <button type="button" onClick={() => { const id = open.id; setOpenId(null); setEditRequest({ type: 'supplier', id }); }} className={`${secondaryBtn} max-sm:flex-col max-sm:gap-1 max-sm:px-1 max-sm:py-2 max-sm:text-xs`}><Pencil className="w-4 h-4" /> Edit</button>}
                {canDelete && <button type="button" onClick={() => setPendingDelete(open)} className={`${dangerBtn} max-sm:flex-col max-sm:gap-1 max-sm:px-1 max-sm:py-2 max-sm:text-xs sm:ml-auto`}><Trash2 className="w-4 h-4" /> Delete</button>}
              </div>
          </div>
        )}
      >
        {open && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">{open.totalOwed < 0 ? 'They owe you' : 'You owe'}</div><div className={`tabular-nums font-extrabold ${open.totalOwed > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-[#111827] dark:text-white'}`}>{rs(Math.abs(open.totalOwed))}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Receipts</div><div className="tabular-nums font-extrabold text-[#111827] dark:text-white">{openPurchases.length}</div></div>
              <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B7280]">Bought so far</div><div className="tabular-nums font-extrabold text-[#111827] dark:text-white">{rs(openPurchases.reduce((a, p) => a + p.amount, 0))}</div></div>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Stock received</h3>
              {openPurchases.length === 0 ? <p className="text-sm text-[#8E9299]">Nothing received from this supplier yet.</p> : (
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
                  {openPurchases.slice(0, 20).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{p.receiptNumber}</span>{formatDate(p.date)}<span className="block text-[11px] text-[#8E9299] truncate">{num(p.kg)} {unitOf(p.productId)} {productName(p.productId)} @ {rs(p.pricePerKg)}</span></span>
                      <span className="tabular-nums font-bold shrink-0">{rs(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {openReturns.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Goods sent back</h3>
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-sm">
                  {openReturns.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{r.returnNumber}</span>{formatDate(r.date)}<span className="block text-[11px] text-[#8E9299] truncate">{num(r.kg)} {r.unit || unitOf(r.productId)} {productName(r.productId)} • {r.reason}</span></span>
                      <span className="tabular-nums font-bold text-rose-700 dark:text-rose-300 shrink-0">− {rs(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {openPayments.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Payments made</h3>
                <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-sm">
                  {openPayments.slice(0, 12).map((l) => (
                    <li key={l.id} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0 truncate">{formatDate(l.date)} • {l.description}</span><span className="tabular-nums font-bold shrink-0">{rs(l.credit)}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.company || pendingDelete?.name || ''}?`}
        message="The supplier and their payment history are removed. Items keep their stock."
        details={pendingDelete ? [`You owe ${rs(pendingDelete.totalOwed)}`] : []}
        confirmLabel="Delete supplier"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteSupplier(pendingDelete.id);
          setPendingDelete(null);
          setOpenId(null);
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingReturn)}
        title="Delete this debit note?"
        message="The goods go back into stock and the amount is added back to what you owe the supplier."
        confirmLabel="Delete debit note"
        onCancel={() => setPendingReturn(null)}
        onConfirm={() => {
          if (pendingReturn) {
            const r = deletePurchaseReturn(pendingReturn);
            setNotice({ kind: r.success ? 'ok' : 'error', text: r.message });
          }
          setPendingReturn(null);
        }}
      />
      <Modal isOpen={showBalances} onClose={() => setShowBalances(false)} title="Payable by city" subtitle="Receivable and payable reports, city-wise with subtotals." wide>
        <PartyBalancesView initialKind="payable" />
      </Modal>
    </div>
  );
};
