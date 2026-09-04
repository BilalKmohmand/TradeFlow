import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck as TruckIcon,
  Receipt,
  Bell,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Info,
  Phone,
  X,
  Download,
  ArrowRight,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { formatCurrency, formatKg, formatDate } from '../utils/formatters';
import { computeAlerts } from '../utils/alerts';
import { monthKey, currentMonthKey, monthLabel, shiftMonth } from '../utils/finance';
import { todayISO } from '../utils/stockFlow';
import { EXPENSE_CATEGORIES, ExpenseCategory, OpsTab, Truck, TruckStatus, Expense } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TasksPanel } from '../components/TradeDocsPanels';

interface OpsScreenProps {
  initialTab?: OpsTab;
}

const inputCls =
  'w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#111827] dark:text-white focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600';
const labelCls = 'block text-[10px] font-bold text-[#8E9299] mb-1.5 uppercase tracking-widest';
const card = 'bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs';

const STATUS_LABEL: Record<TruckStatus, string> = {
  available: 'Available',
  on_trip: 'On trip',
  maintenance: 'Maintenance',
  inactive: 'Inactive',
};
const STATUS_CLS: Record<TruckStatus, string> = {
  available: 'bg-teal-50 text-teal-900 border-teal-200',
  on_trip: 'bg-amber-50 text-amber-900 border-amber-200',
  maintenance: 'bg-rose-50 text-rose-900 border-rose-200',
  inactive: 'bg-[#FAF9F6] text-[#6B7280] border-[#E5E5E1]',
};

export const OpsScreen: React.FC<OpsScreenProps> = ({ initialTab = 'alerts' }) => {
  const {
    trucks,
    dispatches,
    expenses,
    products,
    customers,
    suppliers,
    bookings,
    ledger,
    addTruck,
    updateTruck,
    deleteTruck,
    addExpense,
    deleteExpense,
    can,
    setSelectedCustomerId,
    setSelectedSupplierId,
    setSelectedProductId,
    openBooking,
    openReports,
    tasks,
    quotations,
    purchaseOrders,
    openBookingsView,
    openSuppliersView,
  } = useTrading();

  const [tab, setTab] = useState<OpsTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  // ---- Fleet form ----
  const [truckForm, setTruckForm] = useState<{ id: string | null; number: string; driverName: string; driverPhone: string; capacityKg: string; status: TruckStatus; notes: string }>({
    id: null, number: '', driverName: '', driverPhone: '+92 3', capacityKg: '25000', status: 'available', notes: '',
  });
  const [truckFormOpen, setTruckFormOpen] = useState(false);
  const [pendingTruck, setPendingTruck] = useState<Truck | null>(null);

  const openTruckForm = (t?: Truck) => {
    setTruckForm(t ? { id: t.id, number: t.number, driverName: t.driverName, driverPhone: t.driverPhone, capacityKg: String(t.capacityKg), status: t.status, notes: t.notes || '' } : { id: null, number: '', driverName: '', driverPhone: '+92 3', capacityKg: '25000', status: 'available', notes: '' });
    setTruckFormOpen(true);
  };
  const submitTruck = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { number: truckForm.number.trim(), driverName: truckForm.driverName.trim(), driverPhone: truckForm.driverPhone.trim(), capacityKg: Math.max(0, parseFloat(truckForm.capacityKg) || 0), status: truckForm.status, notes: truckForm.notes.trim() || undefined };
    if (!data.number) return;
    if (truckForm.id) updateTruck(truckForm.id, data);
    else addTruck(data);
    setTruckFormOpen(false);
  };

  const truckStats = useMemo(() => {
    const map = new Map<string, { trips: number; kg: number; last: string | null; spend: number }>();
    trucks.forEach((t) => map.set(t.id, { trips: 0, kg: 0, last: null, spend: 0 }));
    dispatches.forEach((d) => {
      const t = d.truckId ? map.get(d.truckId) : undefined;
      if (!t) return;
      t.trips += 1;
      t.kg += d.kg;
      if (!t.last || d.date > t.last) t.last = d.date;
    });
    expenses.forEach((e) => {
      const t = e.truckId ? map.get(e.truckId) : undefined;
      if (t) t.spend += e.amount;
    });
    return map;
  }, [trucks, dispatches, expenses]);

  // ---- Expenses ----
  const [expMonth, setExpMonth] = useState(currentMonthKey());
  const [expForm, setExpForm] = useState<{ date: string; category: ExpenseCategory; amount: string; description: string; paidVia: string; truckId: string; dispatchId: string }>({
    date: todayISO(), category: 'transport', amount: '', description: '', paidVia: 'Cash', truckId: '', dispatchId: '',
  });
  const recentDispatches = useMemo(() => [...dispatches].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40), [dispatches]);
  const [pendingExpense, setPendingExpense] = useState<Expense | null>(null);
  const monthExpenses = useMemo(() => expenses.filter((e) => monthKey(e.date) === expMonth).sort((a, b) => (a.date < b.date ? 1 : -1)), [expenses, expMonth]);
  const monthTotal = monthExpenses.reduce((a, e) => a + e.amount, 0);
  const byCategory = useMemo(() => {
    const m = new Map<ExpenseCategory, number>();
    monthExpenses.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + e.amount));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  const submitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expForm.amount);
    if (!amount || amount <= 0 || !expForm.description.trim()) return;
    addExpense({ date: expForm.date, category: expForm.category, amount, description: expForm.description.trim(), paidVia: expForm.paidVia, truckId: expForm.truckId || null, dispatchId: expForm.dispatchId || null });
    setExpForm((f) => ({ ...f, amount: '', description: '' }));
    setExpMonth(monthKey(expForm.date));
  };

  const exportExpenses = () => {
    let csv = `Date,Category,Description,Vehicle,Paid via,Amount (Rs.),Recorded by\n`;
    monthExpenses.forEach((e) => {
      const truck = trucks.find((t) => t.id === e.truckId);
      csv += `"${e.date}","${EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label || e.category}","${e.description.replace(/"/g, '""')}","${truck?.number || ''}","${e.paidVia || ''}",${e.amount},"${e.createdBy || ''}"\n`;
    });
    csv += `\nTotal,,,,,${monthTotal}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sarmaya-expenses-${expMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---- Alerts ----
  const alerts = useMemo(() => computeAlerts({ products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders }, todayISO()), [products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders]);
  const followAlert = (a: (typeof alerts)[number]) => {
    if (!a.link) return;
    switch (a.link.type) {
      case 'customer': setSelectedCustomerId(a.link.id); break;
      case 'supplier': setSelectedSupplierId(a.link.id); break;
      case 'product': setSelectedProductId(a.link.id); break;
      case 'booking': openBooking(a.link.id, a.link.dispatchId || null); break;
      case 'truck': setTab('fleet'); break;
      case 'task': setTab('tasks'); break;
      case 'quotation': openBookingsView('quotations'); break;
      case 'po': openSuppliersView('orders'); break;
    }
  };

  const tabBtn = (id: OpsTab, label: string, icon: React.ReactNode, count?: number) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 ${tab === id ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs' : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'}`}
    >
      {icon}
      {label}
      {count != null && count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === id ? 'bg-white/20' : 'bg-rose-100 text-rose-700'}`}>{count}</span>}
    </button>
  );

  const dangerCount = alerts.filter((a) => a.severity === 'danger').length;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#101A26] p-6 sm:p-7 rounded-[32px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Operations Control</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif italic font-normal tracking-tight text-[#111827] dark:text-white mt-1.5">Operations</h2>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1">Fleet & drivers, operating expenses, and everything that needs attention today.</p>
        </div>
        <div className="bg-[#FAF9F6] dark:bg-[#162436] p-1.5 rounded-3xl sm:rounded-full border border-[#E5E5E1] dark:border-[#203248] flex flex-wrap items-center gap-1 text-xs font-bold w-fit max-w-full">
          {tabBtn('alerts', 'Alerts', <Bell className="w-3.5 h-3.5" />, alerts.length)}
          {tabBtn('fleet', 'Fleet', <TruckIcon className="w-3.5 h-3.5" />)}
          {tabBtn('expenses', 'Expenses', <Receipt className="w-3.5 h-3.5" />)}
          {tabBtn('tasks', 'Follow-ups', <CheckCircle2 className="w-3.5 h-3.5" />, tasks.filter((t) => t.status === 'open' && t.dueDate <= todayISO()).length)}
        </div>
      </div>

      {/* ================= ALERTS ================= */}
      {tab === 'alerts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={`${card} p-5`}><div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Critical</div><div className="text-2xl font-bold font-mono text-rose-700 mt-1">{dangerCount}</div></div>
            <div className={`${card} p-5`}><div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Warnings</div><div className="text-2xl font-bold font-mono text-amber-700 mt-1">{alerts.filter((a) => a.severity === 'warning').length}</div></div>
            <div className={`${card} p-5`}><div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Info</div><div className="text-2xl font-bold font-mono text-[#111827] dark:text-white mt-1">{alerts.filter((a) => a.severity === 'info').length}</div></div>
          </div>
          <div className={`${card} overflow-hidden`}>
            {alerts.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto text-teal-600 mb-2" />
                <p className="text-sm font-semibold text-[#111827] dark:text-white">All clear</p>
                <p className="text-xs text-[#8E9299] mt-1">No low stock, overdue accounts, late deliveries or credit breaches.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#F0F0EE] dark:divide-[#1E2E40]">
                {alerts.map((a) => (
                  <button key={a.id} onClick={() => followAlert(a)} className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors">
                    <span className={`mt-0.5 p-1.5 rounded-xl border shrink-0 ${a.severity === 'danger' ? 'bg-rose-50 text-rose-600 border-rose-200' : a.severity === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-[#FAF9F6] text-[#6B7280] border-[#E5E5E1]'}`}>
                      {a.severity === 'info' ? <Info className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-[#111827] dark:text-white block">{a.title}</span>
                      <span className="text-xs text-[#6B7280] dark:text-[#94A3B8] block mt-0.5">{a.detail}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-[#8E9299] shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-[11px] text-[#8E9299]">
            Aging is derived from the ledger with payments applied oldest-first. See <button onClick={() => openReports('aging')} className="text-teal-700 font-semibold hover:underline">Reports → Aging</button> for the full breakdown.
          </div>
        </div>
      )}

      {/* ================= FLEET ================= */}
      {tab === 'fleet' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
              {trucks.length} vehicle(s) • {trucks.filter((t) => t.status === 'available').length} available • total capacity {formatKg(trucks.reduce((a, t) => a + t.capacityKg, 0))}
            </div>
            {can('manage_fleet') && (
              <button onClick={() => openTruckForm()} className="px-4 py-2 bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5 shadow-xs">
                <Plus className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Add Vehicle
              </button>
            )}
          </div>

          {truckFormOpen && (
            <form onSubmit={submitTruck} className={`${card} p-5 space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#111827] dark:text-white">{truckForm.id ? 'Edit vehicle' : 'New vehicle'}</h3>
                <button type="button" onClick={() => setTruckFormOpen(false)} className="p-1.5 text-[#8E9299] hover:text-[#111827]"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className={labelCls}>Plate / Vehicle # *</label><input value={truckForm.number} onChange={(e) => setTruckForm({ ...truckForm, number: e.target.value })} className={inputCls} placeholder="LES-8921-A" required /></div>
                <div><label className={labelCls}>Driver name</label><input value={truckForm.driverName} onChange={(e) => setTruckForm({ ...truckForm, driverName: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls}>Driver phone</label><input value={truckForm.driverPhone} onChange={(e) => setTruckForm({ ...truckForm, driverPhone: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls}>Capacity (kg)</label><input type="number" min="0" step="1" value={truckForm.capacityKg} onChange={(e) => setTruckForm({ ...truckForm, capacityKg: e.target.value })} className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={truckForm.status} onChange={(e) => setTruckForm({ ...truckForm, status: e.target.value as TruckStatus })} className={inputCls}>
                    {(Object.keys(STATUS_LABEL) as TruckStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Notes</label><input value={truckForm.notes} onChange={(e) => setTruckForm({ ...truckForm, notes: e.target.value })} className={inputCls} placeholder="Tipper, 6-wheeler, contractor..." /></div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setTruckFormOpen(false)} className="px-4 py-2 text-xs font-semibold text-[#6B7280] rounded-2xl hover:bg-[#FAF9F6]">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold rounded-2xl">{truckForm.id ? 'Save changes' : 'Add vehicle'}</button>
              </div>
            </form>
          )}

          {trucks.length === 0 ? (
            <div className={`${card} py-16 text-center`}>
              <TruckIcon className="w-10 h-10 mx-auto text-[#8E9299] mb-2" />
              <p className="text-sm font-semibold text-[#111827] dark:text-white">No vehicles registered</p>
              <p className="text-xs text-[#8E9299] mt-1">Add your trucks and drivers to pick them when logging a dispatch and to track trips per vehicle.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trucks.map((t) => {
                const st = truckStats.get(t.id) || { trips: 0, kg: 0, last: null, spend: 0 };
                return (
                  <div key={t.id} className={`${card} p-5 space-y-3`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono font-extrabold text-base text-[#111827] dark:text-white">{t.number}</div>
                        <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{t.driverName || 'No driver assigned'}</div>
                        {t.driverPhone && <div className="text-[11px] font-mono text-[#8E9299] flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{t.driverPhone}</div>}
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_CLS[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                    </div>
                    <div className="bg-[#FAF9F6] dark:bg-[#162436] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-3 grid grid-cols-3 gap-2 text-center">
                      <div><div className="text-[10px] text-[#8E9299] uppercase font-bold">Capacity</div><div className="text-xs font-mono font-bold text-[#111827] dark:text-white">{formatKg(t.capacityKg)}</div></div>
                      <div><div className="text-[10px] text-[#8E9299] uppercase font-bold">Trips</div><div className="text-xs font-mono font-bold text-[#111827] dark:text-white">{st.trips}</div></div>
                      <div><div className="text-[10px] text-[#8E9299] uppercase font-bold">Hauled</div><div className="text-xs font-mono font-bold text-teal-800 dark:text-teal-400">{formatKg(st.kg)}</div></div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#8E9299] font-mono">
                      <span>Last trip: {st.last ? formatDate(st.last) : '—'}</span>
                      <span>Costs: {formatCurrency(st.spend)}</span>
                    </div>
                    {t.notes && <p className="text-[11px] text-[#6B7280] italic">{t.notes}</p>}
                    {can('manage_fleet') && (
                      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#F0F0EE] dark:border-[#1E2E40]">
                        <button onClick={() => openTruckForm(t)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] hover:bg-[#FAF9F6] dark:hover:bg-[#162436] flex items-center gap-1"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                        {can('delete_records') && (
                          <button onClick={() => setPendingTruck(t)} className="p-1.5 rounded-xl text-[#8E9299] hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= EXPENSES ================= */}
      {tab === 'tasks' && <TasksPanel />}

      {tab === 'expenses' && (
        <div className="space-y-4">
          {can('manage_expenses') && (
            <form onSubmit={submitExpense} className={`${card} p-5 space-y-3`}>
              <h3 className="text-sm font-bold text-[#111827] dark:text-white flex items-center gap-1.5"><Receipt className="w-4 h-4 text-teal-700" /> Record an expense</h3>
              <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
                <div><label className={labelCls}>Date</label><input type="date" value={expForm.date} max={todayISO()} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} className={inputCls} required /></div>
                <div>
                  <label className={labelCls}>Category</label>
                  <select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value as ExpenseCategory })} className={inputCls}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Amount (Rs.)</label><input type="number" min="1" step="0.01" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} className={inputCls} required /></div>
                <div className="col-span-2 lg:col-span-1"><label className={labelCls}>Description</label><input value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className={inputCls} placeholder="Diesel for LES-8921" required /></div>
                <div>
                  <label className={labelCls}>Vehicle</label>
                  <select value={expForm.truckId} onChange={(e) => setExpForm({ ...expForm, truckId: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    {trucks.map((t) => <option key={t.id} value={t.id}>{t.number}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Trip (dispatch)</label>
                  <select value={expForm.dispatchId} onChange={(e) => { const id = e.target.value; const d = dispatches.find((x) => x.id === id); setExpForm({ ...expForm, dispatchId: id, truckId: d?.truckId || expForm.truckId }); }} className={inputCls}>
                    <option value="">—</option>
                    {recentDispatches.map((d) => <option key={d.id} value={d.id}>{d.dispatchNumber} • {d.truckNumber}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Paid via</label>
                  <select value={expForm.paidVia} onChange={(e) => setExpForm({ ...expForm, paidVia: e.target.value })} className={inputCls}>
                    {['Cash', 'Bank Transfer', 'Cheque', 'Card', 'Credit (unpaid)'].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="px-5 py-2 bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Add expense</button>
              </div>
            </form>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setExpMonth(shiftMonth(expMonth, -1))} className="px-3 py-1.5 rounded-xl border border-[#E5E5E1] dark:border-[#203248] text-xs bg-white dark:bg-[#162436] text-[#111827] dark:text-white">‹</button>
              <input type="month" value={expMonth} onChange={(e) => setExpMonth(e.target.value)} className="bg-white dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-xl px-3 py-1.5 text-xs font-mono text-[#111827] dark:text-white" />
              <button onClick={() => setExpMonth(shiftMonth(expMonth, 1))} className="px-3 py-1.5 rounded-xl border border-[#E5E5E1] dark:border-[#203248] text-xs bg-white dark:bg-[#162436] text-[#111827] dark:text-white">›</button>
              <span className="text-xs text-[#6B7280] dark:text-[#94A3B8] ml-1">{monthLabel(expMonth)} • {monthExpenses.length} entries</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-bold text-[#111827] dark:text-white">{formatCurrency(monthTotal)}</span>
              <button onClick={exportExpenses} disabled={monthExpenses.length === 0} className="px-3.5 py-2 bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold rounded-2xl flex items-center gap-1.5 text-[#111827] dark:text-white disabled:opacity-40"><Download className="w-3.5 h-3.5" /> CSV</button>
            </div>
          </div>

          {byCategory.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {byCategory.map(([cat, amt]) => (
                <div key={cat} className={`${card} p-4`}>
                  <div className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest truncate">{EXPENSE_CATEGORIES.find((c) => c.id === cat)?.label}</div>
                  <div className="text-sm font-mono font-bold text-[#111827] dark:text-white mt-1">{formatCurrency(amt)}</div>
                  <div className="w-full h-1.5 bg-[#E5E5E1] dark:bg-[#203248] rounded-full mt-2 overflow-hidden"><div className="h-full bg-teal-600" style={{ width: `${monthTotal > 0 ? (amt / monthTotal) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          )}

          <div className={`${card} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF9F6] dark:bg-[#162436] border-b border-[#E5E5E1] dark:border-[#203248] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]">
                  <tr><th className="py-3 px-4">Date</th><th className="py-3 px-4">Category</th><th className="py-3 px-4">Description</th><th className="py-3 px-4">Vehicle</th><th className="py-3 px-4">Paid via</th><th className="py-3 px-4 text-right">Amount</th><th className="py-3 px-2" /></tr>
                </thead>
                <tbody className="divide-y divide-[#FAF9F6] dark:divide-[#1E2E40] font-mono">
                  {monthExpenses.length === 0 ? (
                    <tr><td colSpan={7} className="py-10 text-center text-[#8E9299] font-sans">No expenses recorded for {monthLabel(expMonth)}.</td></tr>
                  ) : (
                    monthExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                        <td className="py-2.5 px-4 text-[#6B7280] whitespace-nowrap">{formatDate(e.date)}</td>
                        <td className="py-2.5 px-4 font-sans text-[#111827] dark:text-white">{EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label}</td>
                        <td className="py-2.5 px-4 font-sans text-[#374151] dark:text-[#CBD5E1]">{e.description}{e.createdBy && <span className="block text-[10px] text-[#8E9299]">by {e.createdBy}</span>}</td>
                        <td className="py-2.5 px-4 text-[#6B7280]">{trucks.find((t) => t.id === e.truckId)?.number || '—'}</td>
                        <td className="py-2.5 px-4 font-sans text-[#6B7280]">{e.paidVia || '—'}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-[#111827] dark:text-white">{formatCurrency(e.amount)}</td>
                        <td className="py-2.5 px-2 text-right">
                          {can('delete_records') && (
                            <button onClick={() => setPendingExpense(e)} className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingTruck)}
        title={`Remove ${pendingTruck?.number ?? 'vehicle'} from the fleet?`}
        message="Past dispatches keep the plate number but lose the link to this vehicle."
        confirmLabel="Remove Vehicle"
        onConfirm={() => { if (pendingTruck) deleteTruck(pendingTruck.id); setPendingTruck(null); }}
        onCancel={() => setPendingTruck(null)}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingExpense)}
        title="Delete this expense?"
        message={pendingExpense ? `${formatCurrency(pendingExpense.amount)} — ${pendingExpense.description}` : ''}
        confirmLabel="Delete Expense"
        onConfirm={() => { if (pendingExpense) deleteExpense(pendingExpense.id); setPendingExpense(null); }}
        onCancel={() => setPendingExpense(null)}
      />
    </div>
  );
};
