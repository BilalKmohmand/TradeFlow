import React, { useRef, useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Lock,
  RotateCcw,
  Database,
  Trash2,
  Download,
  Upload,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  ScrollText,
  Cloud,
  CloudOff,
  Users,
  Layers,
  Package,
  ShoppingBag,
  Truck,
  BookOpen,
  MessageSquare,
  PackagePlus,
  History,
  UserPlus,
  Users2,
  Pencil,
  Receipt,
  Truck as TruckIcon,
} from 'lucide-react';
import { AppUser, UserRole } from '../types';
import { useTrading } from '../context/TradingContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TableName } from '../lib/database';

type PendingAction =
  | { kind: 'purge'; table: TableName; label: string; count: number }
  | { kind: 'factory' }
  | { kind: 'sample' }
  | { kind: 'clearAudit' }
  | { kind: 'resetPin' }
  | { kind: 'deleteUser'; user: AppUser }
  | null;

const inputCls =
  'w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50';

const cardCls =
  'bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-xs space-y-4';

const sectionTitle = (icon: React.ReactNode, title: string, subtitle: string) => (
  <div className="flex items-start gap-3">
    <div className="p-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-teal-700 dark:text-teal-400 shrink-0">
      {icon}
    </div>
    <div>
      <h3 className="text-base font-bold text-[#111827] dark:text-white">{title}</h3>
      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5">{subtitle}</p>
    </div>
  </div>
);

export const AdminScreen: React.FC = () => {
  const {
    customers,
    suppliers,
    products,
    bookings,
    dispatches,
    purchases,
    priceHistory,
    expenses,
    trucks,
    users,
    cashEntries,
    addUser,
    updateUser,
    deleteUser,
    can,
    currentUser,
    ledger,
    whatsappMessages,
    changeAdminPin,
    resetAdminPinToDefault,
    lockAdmin,
    auditLogs,
    clearAuditLogs,
    exportSystemBackup,
    importSystemBackup,
    factoryResetAllData,
    resetToSampleData,
    purgeTable,
    isCloudSyncEnabled,
    isCloudSyncReady,
  } = useTrading();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<PendingAction>(null);

  // Users & roles
  const [userForm, setUserForm] = useState<{ id: string | null; name: string; role: UserRole; pin: string }>({ id: null, name: '', role: 'operator', pin: '' });
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userFeedback, setUserFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const submitUser = (e: React.FormEvent) => {
    e.preventDefault();
    const res = userForm.id
      ? updateUser(userForm.id, { name: userForm.name.trim(), role: userForm.role, ...(userForm.pin ? { pin: userForm.pin } : {}) })
      : addUser({ name: userForm.name, role: userForm.role, pin: userForm.pin });
    setUserFeedback({ type: res.success ? 'success' : 'error', message: res.message });
    if (res.success) {
      setUserFormOpen(false);
      setUserForm({ id: null, name: '', role: 'operator', pin: '' });
    }
  };

  const downloadCsv = (name: string, csv: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const exportCustomers = () => downloadCsv('sarmaya-customers.csv', 'Name,Company,Phone,Email,Address,Outstanding (Rs.),Credit limit (Rs.),Since\n' + customers.map((c) => [q(c.name), q(c.company), q(c.phone), q(c.email), q(c.address), c.totalDue, c.creditLimit, q(c.createdAt)].join(',')).join('\n'));
  const exportSuppliers = () => downloadCsv('sarmaya-suppliers.csv', 'Name,Company,Phone,Email,Category,Address,Payable (Rs.),Since\n' + suppliers.map((s) => [q(s.name), q(s.company), q(s.phone), q(s.email), q(s.materialCategory), q(s.address), s.totalOwed, q(s.createdAt)].join(',')).join('\n'));
  const exportProducts = () => downloadCsv('sarmaya-products.csv', 'Name,Category,Price (Rs./kg),Stock (kg),Reorder level (kg),Supplier\n' + products.map((p) => [q(p.name), q(p.category), p.unitPricePerKg, p.stockKg, p.minThresholdKg, q(suppliers.find((s) => s.id === p.supplierId)?.company || '')].join(',')).join('\n'));
  const exportLedger = () => downloadCsv('sarmaya-ledger.csv', 'Date,Entity type,Entity,Type,Reference,Description,Debit,Credit,Balance after,kg\n' + [...ledger].sort((a, b) => (a.date < b.date ? -1 : 1)).map((l) => { const name = l.entityType === 'customer' ? customers.find((c) => c.id === l.entityId)?.name : suppliers.find((s) => s.id === l.entityId)?.company; return [q(l.date), q(l.entityType), q(name || l.entityId), q(l.type), q(l.referenceId), q(l.description), l.debit, l.credit, l.balanceAfter, l.kg ?? ''].join(','); }).join('\n'));

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinFeedback(null);
    if (newPin !== confirmPin) {
      setPinFeedback({ type: 'error', message: 'New PIN and confirmation do not match.' });
      return;
    }
    const res = changeAdminPin(currentPin, newPin);
    setPinFeedback({ type: res.success ? 'success' : 'error', message: res.message });
    if (res.success) {
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importSystemBackup(String(reader.result || ''));
      setImportFeedback({ type: res.success ? 'success' : 'error', message: res.message });
    };
    reader.onerror = () => setImportFeedback({ type: 'error', message: 'Could not read the selected file.' });
    reader.readAsText(file);
    e.target.value = '';
  };

  const tables: { table: TableName; label: string; count: number; icon: React.ReactNode }[] = [
    { table: 'customers', label: 'Customers', count: customers.length, icon: <Users className="w-4 h-4" /> },
    { table: 'suppliers', label: 'Suppliers', count: suppliers.length, icon: <Layers className="w-4 h-4" /> },
    { table: 'products', label: 'Products', count: products.length, icon: <Package className="w-4 h-4" /> },
    { table: 'bookings', label: 'Bookings', count: bookings.length, icon: <ShoppingBag className="w-4 h-4" /> },
    { table: 'dispatches', label: 'Dispatches', count: dispatches.length, icon: <Truck className="w-4 h-4" /> },
    { table: 'purchases', label: 'Stock Receipts', count: purchases.length, icon: <PackagePlus className="w-4 h-4" /> },
    { table: 'price_history', label: 'Price History', count: priceHistory.length, icon: <History className="w-4 h-4" /> },
    { table: 'expenses', label: 'Expenses', count: expenses.length, icon: <Receipt className="w-4 h-4" /> },
    { table: 'trucks', label: 'Fleet', count: trucks.length, icon: <TruckIcon className="w-4 h-4" /> },
    { table: 'cash_entries', label: 'Cash Entries', count: cashEntries.length, icon: <Receipt className="w-4 h-4" /> },
    { table: 'ledger', label: 'Ledger Entries', count: ledger.length, icon: <BookOpen className="w-4 h-4" /> },
    { table: 'whatsapp_messages', label: 'WhatsApp Logs', count: whatsappMessages.length, icon: <MessageSquare className="w-4 h-4" /> },
  ];

  const runPending = () => {
    if (!pending) return;
    switch (pending.kind) {
      case 'purge':
        purgeTable(pending.table);
        break;
      case 'factory':
        factoryResetAllData();
        break;
      case 'sample':
        resetToSampleData();
        break;
      case 'clearAudit':
        clearAuditLogs();
        break;
      case 'resetPin':
        resetAdminPinToDefault();
        setPinFeedback({ type: 'success', message: 'Master PIN reset to the factory default (7860).' });
        break;
      case 'deleteUser':
        deleteUser(pending.user.id);
        break;
    }
    setPending(null);
  };

  const dialogProps = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case 'purge':
        return {
          title: `Empty the ${pending.label} table?`,
          message: `All ${pending.count} row(s) will be removed locally and from the cloud database. Related records in other tables are NOT adjusted.`,
          confirmLabel: `Purge ${pending.label}`,
          requireText: 'PURGE',
        };
      case 'factory':
        return {
          title: 'Factory reset all data?',
          message: 'Every customer, supplier, product, booking, dispatch, ledger row and WhatsApp log will be permanently deleted, locally and in the cloud.',
          details: ['Your PIN and theme settings are kept.', 'Export a backup first if you might need this data again.'],
          confirmLabel: 'Wipe Everything',
          requireText: 'DELETE ALL',
        };
      case 'sample':
        return {
          title: 'Replace data with the sample dataset?',
          message: 'Current data will be overwritten by the built-in demo customers, suppliers, products and bookings.',
          confirmLabel: 'Load Sample Data',
          requireText: 'SAMPLE',
        };
      case 'clearAudit':
        return {
          title: 'Clear the audit log?',
          message: 'The security and activity history shown below will be erased.',
          confirmLabel: 'Clear Log',
        };
      case 'deleteUser':
        return {
          title: `Remove ${pending.user.name}?`,
          message: 'They will no longer be able to sign in. Their name stays on past audit entries.',
          confirmLabel: 'Remove User',
        };
      case 'resetPin':
        return {
          title: 'Reset the master PIN?',
          message: 'The PIN will go back to the factory default 7860. Change it again straight after.',
          confirmLabel: 'Reset PIN',
        };
    }
  })();

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#101A26] p-7 rounded-[32px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Administrator</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif italic font-normal tracking-tight text-[#111827] dark:text-white mt-1.5">
            Admin Control Center
          </h2>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1">
            Security, data management, backups and the audit trail. Every action here is logged.
          </p>
        </div>

        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold ${
            isCloudSyncReady
              ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
          }`}
        >
          {isCloudSyncReady ? <Cloud className="w-4 h-4" /> : <CloudOff className="w-4 h-4" />}
          <span>
            {isCloudSyncReady
              ? 'Supabase sync live'
              : isCloudSyncEnabled
              ? 'Supabase configured, initial load failed — local only'
              : 'Supabase not configured — local only'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Security */}
        <div className={cardCls}>
          {sectionTitle(<KeyRound className="w-5 h-5" />, 'Master PIN & Session', 'Change the terminal PIN or lock the app immediately.')}

          <form onSubmit={handleChangePin} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Current PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">New PIN (4-6 digits)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className={inputCls}
                  required
                />
              </div>
            </div>

            {pinFeedback && (
              <div
                className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2 ${
                  pinFeedback.type === 'success'
                    ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {pinFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{pinFeedback.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold shadow-xs hover:bg-black dark:hover:bg-slate-100 transition-all active:scale-95 flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" />
                <span>Save New PIN</span>
              </button>
              <button
                type="button"
                onClick={() => setPending({ kind: 'resetPin' })}
                className="px-4 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Default</span>
              </button>
              <button
                type="button"
                onClick={lockAdmin}
                className="px-4 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 flex items-center gap-1.5 ml-auto"
              >
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Lock Now</span>
              </button>
            </div>
          </form>
        </div>

        {/* Backup & Restore */}
        <div className={cardCls}>
          {sectionTitle(<Database className="w-5 h-5" />, 'Backup, Restore & Reset', 'Export a JSON snapshot, restore one, or start over.')}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => exportSystemBackup()}
              className="px-4 py-3 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold shadow-xs hover:bg-black dark:hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" />
              <span>Export Backup (JSON)</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-3 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Backup</span>
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
            <button
              type="button"
              onClick={() => setPending({ kind: 'sample' })}
              className="px-4 py-3 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] flex items-center justify-center gap-1.5"
            >
              <FlaskConical className="w-3.5 h-3.5 text-teal-600" />
              <span>Load Sample Data</span>
            </button>
            {can('purge_data') && (
            <button
              type="button"
              onClick={() => setPending({ kind: 'factory' })}
              className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Factory Reset</span>
            </button>
            )}
          </div>

          {importFeedback && (
            <div
              className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2 ${
                importFeedback.type === 'success'
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              {importFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{importFeedback.message}</span>
            </div>
          )}

          <p className="text-[11px] text-[#8E9299] dark:text-[#64748B] leading-relaxed">
            Individual records can be deleted from their own screens (Customers, Suppliers, Products, Bookings, Reports).
            Those deletes cascade and reverse stock and balances. The purge buttons below do not.
          </p>
        </div>
      </div>

      {/* Users & roles */}
      {can('manage_users') && (
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-3">
          {sectionTitle(<Users2 className="w-5 h-5" />, 'Users & Roles', 'Each person signs in with their own PIN. Admins can do everything; managers can delete and change prices but not purge data; operators can only record day-to-day transactions.')}
          <button type="button" onClick={() => { setUserForm({ id: null, name: '', role: 'operator', pin: '' }); setUserFormOpen(true); setUserFeedback(null); }} className="px-4 py-2.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold shadow-xs flex items-center gap-1.5 shrink-0">
            <UserPlus className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Add User
          </button>
        </div>

        {userFormOpen && (
          <form onSubmit={submitUser} className="bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div><label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Name</label><input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} className={inputCls} required /></div>
            <div>
              <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Role</label>
              <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })} className={inputCls}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="operator">Operator</option>
              </select>
            </div>
            <div><label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">{userForm.id ? 'New PIN (blank = keep)' : 'PIN (4-6 digits)'}</label><input type="password" inputMode="numeric" maxLength={6} value={userForm.pin} onChange={(e) => setUserForm({ ...userForm, pin: e.target.value })} className={inputCls} required={!userForm.id} /></div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold">{userForm.id ? 'Save' : 'Create'}</button>
              <button type="button" onClick={() => setUserFormOpen(false)} className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-[#6B7280]">Cancel</button>
            </div>
          </form>
        )}

        {userFeedback && (
          <div className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2 ${userFeedback.type === 'success' ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
            {userFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{userFeedback.message}</span>
          </div>
        )}

        <div className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] divide-y divide-[#F0F0EE] dark:divide-[#1E2E40] overflow-hidden">
          {users.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8E9299]">No named users yet. Everyone is using the master PIN as Administrator. Add users so the audit log shows who did what.</div>
          ) : (
            users.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center gap-3 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${u.active ? 'bg-teal-500' : 'bg-[#CBD5E1]'}`} />
                <span className="font-bold text-[#111827] dark:text-white flex-1 min-w-0 truncate">{u.name}{currentUser?.id === u.id && <span className="ml-2 text-[10px] text-teal-700 font-semibold">(you)</span>}</span>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-[#374151] dark:text-[#CBD5E1]">{u.role}</span>
                <button type="button" onClick={() => updateUser(u.id, { active: !u.active })} className="text-[11px] font-semibold text-[#6B7280] hover:text-[#111827] dark:hover:text-white">{u.active ? 'Deactivate' : 'Activate'}</button>
                <button type="button" onClick={() => { setUserForm({ id: u.id, name: u.name, role: u.role, pin: '' }); setUserFormOpen(true); setUserFeedback(null); }} className="p-1.5 rounded-lg text-[#8E9299] hover:text-teal-700 hover:bg-teal-50"><Pencil className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => setPending({ kind: 'deleteUser', user: u })} className="p-1.5 rounded-lg text-[#8E9299] hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))
          )}
        </div>
      </div>
      )}

      {/* Exports */}
      <div className={cardCls}>
        {sectionTitle(<Download className="w-5 h-5" />, 'Data Exports', 'Download master data and the full ledger as CSV for Excel or your accountant.')}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            { label: `Customers (${customers.length})`, fn: exportCustomers },
            { label: `Suppliers (${suppliers.length})`, fn: exportSuppliers },
            { label: `Products (${products.length})`, fn: exportProducts },
            { label: `Full ledger (${ledger.length})`, fn: exportLedger },
          ].map((x) => (
            <button key={x.label} type="button" onClick={x.fn} className="px-4 py-3 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] flex items-center justify-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> {x.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table management */}
      {can('purge_data') && (
      <div className={cardCls}>
        {sectionTitle(<ShieldCheck className="w-5 h-5" />, 'Data Tables', 'Row counts per table with a hard purge for each. Purges skip cascade logic.')}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tables.map((t) => (
            <div
              key={t.table}
              className="bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-[#111827] dark:text-white">
                  <span className="text-teal-700 dark:text-teal-400">{t.icon}</span>
                  {t.label}
                </span>
                <span className="text-lg font-mono font-bold text-[#111827] dark:text-white">{t.count}</span>
              </div>
              <button
                type="button"
                disabled={t.count === 0}
                onClick={() => setPending({ kind: 'purge', table: t.table, label: t.label, count: t.count })}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3 h-3" />
                <span>Purge table</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      )}

      {/* Audit log */}
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-3">
          {sectionTitle(<ScrollText className="w-5 h-5" />, 'Audit Log', 'Last 100 security and data events on this device.')}
          <button
            type="button"
            disabled={auditLogs.length === 0}
            onClick={() => setPending({ kind: 'clearAudit' })}
            className="px-3.5 py-2 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 disabled:opacity-40 shrink-0"
          >
            Clear
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248] divide-y divide-[#F0F0EE] dark:divide-[#1E2E40]">
          {auditLogs.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#8E9299]">No audit events recorded.</div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="px-4 py-3 flex items-start gap-3 text-xs">
                <span
                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    log.severity === 'danger' ? 'bg-rose-500' : log.severity === 'warning' ? 'bg-amber-500' : 'bg-teal-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-[#111827] dark:text-white truncate">{log.action}{log.user && <span className="ml-2 text-[10px] font-semibold text-teal-700 dark:text-teal-400">{log.user}</span>}</span>
                    <span className="font-mono text-[10px] text-[#8E9299] shrink-0">{log.timestamp}</span>
                  </div>
                  <p className="text-[#6B7280] dark:text-[#94A3B8] mt-0.5 break-words">{log.details}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {dialogProps && (
        <ConfirmDialog
          isOpen={Boolean(pending)}
          title={dialogProps.title}
          message={dialogProps.message}
          details={'details' in dialogProps ? dialogProps.details : undefined}
          confirmLabel={dialogProps.confirmLabel}
          requireText={'requireText' in dialogProps ? dialogProps.requireText : undefined}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};
