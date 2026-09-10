import React, { useRef, useState } from 'react';
import {
  KeyRound,
  RotateCcw,
  Lock,
  Database,
  Download,
  Upload,
  FlaskConical,
  Trash2,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Users,
  Layers,
  Package,
  ShoppingBag,
  Truck,
  PackagePlus,
  History,
  BookOpen,
  MessageSquare,
} from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { ConfirmDialog } from '../ConfirmDialog';
import { TableName } from '../../lib/database';

type PendingAction =
  | { kind: 'purge'; table: TableName; label: string; count: number }
  | { kind: 'factory' }
  | { kind: 'sample' }
  | { kind: 'resetPin' }
  | null;

const inputCls =
  'w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50';

const cardCls =
  'bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-xs space-y-4';

export const SystemDataTab: React.FC = () => {
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
    cashEntries,
    quotations,
    purchaseOrders,
    returns,
    adjustments,
    tasks,
    ledger,
    whatsappMessages,
    settings,
    updateSettings,
    changeAdminPin,
    resetAdminPinToDefault,
    lockAdmin,
    exportSystemBackup,
    importSystemBackup,
    factoryResetAllData,
    resetToSampleData,
    purgeTable,
    can,
  } = useTrading();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<PendingAction>(null);

  const [company, setCompany] = useState({
    companyName: settings.companyName || '',
    companyTagline: settings.companyTagline || '',
    companyAddress: settings.companyAddress || '',
    companyPhone: settings.companyPhone || '',
    companyTaxId: settings.companyTaxId || '',
    taxRatePct: String(settings.taxRatePct ?? 0),
    taxLabel: settings.taxLabel || 'Sales Tax',
    monthlyTargetRs: String(settings.monthlyTargetRs ?? 0),
    appMode: (settings.appMode || 'billing') as 'billing' | 'trading',
    cashOpeningBalance: String(settings.cashOpeningBalance ?? 0),
    openingBankBalance: String(settings.openingBankBalance ?? 0),
    cashOpeningDate: settings.cashOpeningDate,
  });
  const [companySaved, setCompanySaved] = useState(false);

  const saveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      companyName: company.companyName.trim() || 'Sarmaya',
      companyTagline: company.companyTagline.trim(),
      companyAddress: company.companyAddress.trim(),
      companyPhone: company.companyPhone.trim(),
      companyTaxId: company.companyTaxId.trim(),
      taxRatePct: Math.max(0, Math.min(100, parseFloat(company.taxRatePct) || 0)),
      taxLabel: company.taxLabel.trim() || 'Sales Tax',
      monthlyTargetRs: Math.max(0, parseFloat(company.monthlyTargetRs) || 0),
      appMode: company.appMode,
      cashOpeningBalance: parseFloat(company.cashOpeningBalance) || 0,
      openingBankBalance: parseFloat(company.openingBankBalance) || 0,
      cashOpeningDate: company.cashOpeningDate || settings.cashOpeningDate,
    });
    setCompanySaved(true);
    setTimeout(() => setCompanySaved(false), 1500);
  };

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
  const exportCustomers = () =>
    downloadCsv(
      'sarmaya-customers.csv',
      'Name,Company,Phone,Email,Address,Outstanding (Rs.),Credit limit (Rs.),Since\n' +
        customers
          .map((c) => [q(c.name), q(c.company), q(c.phone), q(c.email), q(c.address), c.totalDue, c.creditLimit, q(c.createdAt)].join(','))
          .join('\n')
    );
  const exportSuppliers = () =>
    downloadCsv(
      'sarmaya-suppliers.csv',
      'Name,Company,Phone,Email,Category,Address,Payable (Rs.),Since\n' +
        suppliers
          .map((s) => [q(s.name), q(s.company), q(s.phone), q(s.email), q(s.materialCategory), q(s.address), s.totalOwed, q(s.createdAt)].join(','))
          .join('\n')
    );
  const exportProducts = () =>
    downloadCsv(
      'sarmaya-products.csv',
      'Name,Category,Price (Rs./kg),Stock (kg),Reorder level (kg),Supplier\n' +
        products
          .map((p) => [q(p.name), q(p.category), p.unitPricePerKg, p.stockKg, p.minThresholdKg, q(suppliers.find((s) => s.id === p.supplierId)?.company || '')].join(','))
          .join('\n')
    );
  const exportLedger = () =>
    downloadCsv(
      'sarmaya-ledger.csv',
      'Date,Entity type,Entity,Type,Reference,Description,Debit,Credit,Balance after,kg\n' +
        [...ledger]
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((l) => {
            const name = l.entityType === 'customer' ? customers.find((c) => c.id === l.entityId)?.name : suppliers.find((s) => s.id === l.entityId)?.company;
            return [q(l.date), q(l.entityType), q(name || l.entityId), q(l.type), q(l.referenceId), q(l.description), l.debit, l.credit, l.balanceAfter, l.kg ?? ''].join(',');
          })
          .join('\n')
    );

  const tables: { table: TableName; label: string; count: number; icon: React.ReactNode }[] = [
    { table: 'customers', label: 'Customers', count: customers.length, icon: <Users className="w-4 h-4" /> },
    { table: 'suppliers', label: 'Suppliers', count: suppliers.length, icon: <Layers className="w-4 h-4" /> },
    { table: 'products', label: 'Products', count: products.length, icon: <Package className="w-4 h-4" /> },
    { table: 'bookings', label: 'Bookings', count: bookings.length, icon: <ShoppingBag className="w-4 h-4" /> },
    { table: 'dispatches', label: 'Dispatches', count: dispatches.length, icon: <Truck className="w-4 h-4" /> },
    { table: 'purchases', label: 'Stock Receipts', count: purchases.length, icon: <PackagePlus className="w-4 h-4" /> },
    { table: 'price_history', label: 'Price History', count: priceHistory.length, icon: <History className="w-4 h-4" /> },
    { table: 'expenses', label: 'Expenses', count: expenses.length, icon: <Receipt className="w-4 h-4" /> },
    { table: 'trucks', label: 'Fleet', count: trucks.length, icon: <Truck className="w-4 h-4" /> },
    { table: 'cash_entries', label: 'Cash Entries', count: cashEntries.length, icon: <Receipt className="w-4 h-4" /> },
    { table: 'quotations', label: 'Quotations', count: quotations.length, icon: <History className="w-4 h-4" /> },
    { table: 'purchase_orders', label: 'Purchase Orders', count: purchaseOrders.length, icon: <PackagePlus className="w-4 h-4" /> },
    { table: 'returns', label: 'Returns', count: returns.length, icon: <History className="w-4 h-4" /> },
    { table: 'stock_adjustments', label: 'Stock Adjustments', count: adjustments.length, icon: <Package className="w-4 h-4" /> },
    { table: 'tasks', label: 'Follow-ups', count: tasks.length, icon: <CheckCircle2 className="w-4 h-4" /> },
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
      case 'resetPin':
        resetAdminPinToDefault();
        setPinFeedback({ type: 'success', message: 'Master PIN reset to default (7860).' });
        break;
    }
    setPending(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Master PIN */}
        <div className={cardCls}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white">Master Terminal PIN</h3>
              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Quick keypad access to unlock the terminal.</p>
            </div>
          </div>

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
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">New PIN</label>
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
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white">Backup & Snapshots</h3>
              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Export or restore complete system JSON state.</p>
            </div>
          </div>

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
              <span>Load Demo Data</span>
            </button>
            {can('system:purge_data') && (
              <button
                type="button"
                onClick={() => setPending({ kind: 'factory' })}
                className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 flex items-center justify-center gap-1.5"
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
        </div>
      </div>

      {/* Company & Invoicing */}
      <div className={cardCls}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#111827] dark:text-white">Commercial Entity & Invoicing</h3>
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Appears on bill of ladings, gate passes, and tax receipts.</p>
          </div>
        </div>

        <form onSubmit={saveCompany} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Company name</label>
            <input value={company.companyName} onChange={(e) => setCompany({ ...company, companyName: e.target.value })} className={inputCls} />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Tagline</label>
            <input value={company.companyTagline} onChange={(e) => setCompany({ ...company, companyTagline: e.target.value })} className={inputCls} />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Address</label>
            <input value={company.companyAddress} onChange={(e) => setCompany({ ...company, companyAddress: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Phone</label>
            <input value={company.companyPhone} onChange={(e) => setCompany({ ...company, companyPhone: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">NTN / STRN</label>
            <input value={company.companyTaxId} onChange={(e) => setCompany({ ...company, companyTaxId: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Sales tax %</label>
            <input type="number" min="0" max="100" step="0.01" value={company.taxRatePct} onChange={(e) => setCompany({ ...company, taxRatePct: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Tax label</label>
            <input value={company.taxLabel} onChange={(e) => setCompany({ ...company, taxLabel: e.target.value })} className={inputCls} />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5" htmlFor="app-mode">App mode</label>
            <select id="app-mode" value={company.appMode} onChange={(e) => setCompany({ ...company, appMode: e.target.value as 'billing' | 'trading' })} className={inputCls}>
              <option value="billing">Simple billing (bills, daily sheet, money)</option>
              <option value="trading">Full trading suite (bookings, dispatches, per-kg pricing)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Opening cash (Rs.)</label>
            <input type="number" step="any" value={company.cashOpeningBalance} onChange={(e) => setCompany({ ...company, cashOpeningBalance: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Opening bank (Rs.)</label>
            <input type="number" step="any" value={company.openingBankBalance} onChange={(e) => setCompany({ ...company, openingBankBalance: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Counting from</label>
            <input type="date" value={company.cashOpeningDate} onChange={(e) => setCompany({ ...company, cashOpeningDate: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">Monthly sales target (Rs.)</label>
            <input type="number" min="0" step="1000" value={company.monthlyTargetRs} onChange={(e) => setCompany({ ...company, monthlyTargetRs: e.target.value })} className={inputCls} />
          </div>
          <div className="flex items-end">
            <button type="submit" className="px-5 py-2.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold shadow-xs flex items-center gap-1.5">
              {companySaved ? <><CheckCircle2 className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Saved</> : 'Save profile'}
            </button>
          </div>
        </form>
      </div>

      {/* CSV Data Exports */}
      <div className={cardCls}>
        <h3 className="text-base font-bold text-[#111827] dark:text-white">Master Data CSV Exports</h3>
        <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Download full raw data for reporting in spreadsheet software.</p>
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

      {/* Table purge */}
      {can('system:purge_data') && (
        <div className={cardCls}>
          <h3 className="text-base font-bold text-[#111827] dark:text-white">Database Table Purges</h3>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Hard-empty individual tables. Purges bypass relational cascading.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {tables.map((t) => (
              <div key={t.table} className="bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl p-4 flex flex-col gap-3">
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
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#101A26] border border-[#E5E5E1] dark:border-[#203248] text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Purge table</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          isOpen={Boolean(pending)}
          title={
            pending.kind === 'purge'
              ? `Empty the ${pending.label} table?`
              : pending.kind === 'factory'
              ? 'Factory reset all data?'
              : pending.kind === 'sample'
              ? 'Replace data with sample dataset?'
              : 'Reset master PIN to default (7860)?'
          }
          message={
            pending.kind === 'purge'
              ? `All ${pending.count} row(s) will be permanently cleared.`
              : pending.kind === 'factory'
              ? 'Every customer, supplier, product, dispatch, and ledger record will be permanently deleted.'
              : pending.kind === 'sample'
              ? 'Current state will be overwritten by the demo catalog and customers.'
              : 'Master PIN will be reset to 7860.'
          }
          confirmLabel={
            pending.kind === 'purge'
              ? `Purge ${pending.label}`
              : pending.kind === 'factory'
              ? 'Wipe Everything'
              : pending.kind === 'sample'
              ? 'Load Sample'
              : 'Reset PIN'
          }
          requireText={
            pending.kind === 'purge' ? 'PURGE' : pending.kind === 'factory' ? 'DELETE ALL' : undefined
          }
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};
