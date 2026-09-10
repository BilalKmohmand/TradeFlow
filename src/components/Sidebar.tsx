import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Layers,
  Package,
  ShoppingBag,
  BarChart3,
  Bell,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Truck,
  FileText,
  ClipboardList,
  RotateCcw,
  PackagePlus,
  ArrowLeftRight,
  Wallet,
  Landmark,
  Scale,
  Receipt,
  CheckCircle2,
  TrendingUp,
  Cloud,
  CloudOff,
  Home,
  FileText as BillIcon,
  CalendarDays,
  Coins,
  Tag,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { computeAlerts } from '../utils/alerts';
import { ActiveScreen } from '../types';

interface SidebarProps {
  onReceiveStock: () => void;
}

interface SubLink {
  label: string;
  icon: React.FC<{ className?: string }>;
  go: () => void;
  badge?: number;
}
interface Section {
  id: ActiveScreen;
  label: string;
  icon: React.FC<{ className?: string }>;
  group: string;
  badge?: number;
  subs?: SubLink[];
}

/**
 * Desktop navigation: grouped sections with quick sub-links into the most used views.
 * Top-level entries are buttons (screens); sub-links are anchors so they never collide with
 * in-page controls that share a label.
 */
export const Sidebar: React.FC<SidebarProps> = ({ onReceiveStock }) => {
  const {
    activeScreen,
    setActiveScreen,
    can,
    isScreenVisible,
    openReports,
    openOps,
    openBookingsView,
    openSuppliersView,
    products,
    customers,
    suppliers,
    bookings,
    trucks,
    ledger,
    dispatches,
    tasks,
    quotations,
    purchaseOrders,
    isCloudSyncEnabled,
    isCloudSyncReady,
    settings,
    invoices,
    updateSettings,
  } = useTrading();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sarmaya_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem('sarmaya_sidebar_collapsed', v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  const today = new Date().toISOString().split('T')[0];
  const alertCount = useMemo(
    () => computeAlerts({ products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders }, today).length,
    [products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders, today]
  );
  const openQuotes = quotations.filter((q) => q.status === 'draft' || q.status === 'sent' || q.status === 'accepted').length;
  const openPOs = purchaseOrders.filter((p) => p.status === 'open' || p.status === 'partial').length;
  const openTasks = tasks.filter((t) => t.status === 'open' && t.dueDate <= today).length;
  const activeOrders = bookings.filter((b) => b.status === 'active').length;
  const inTransit = dispatches.filter((d) => (d.status ?? 'in_transit') === 'in_transit').length;
  const canFinance = can('view_finance') || can('finance:view_pnl');

  const isBilling = (settings.appMode || 'billing') === 'billing';
  const unpaidBills = invoices.filter((i) => i.balanceDue > 0 && i.status !== 'cancelled').length;
  const billingSections: Section[] = [
    { id: 'dashboard', label: 'Home', icon: Home, group: 'Daily work' },
    { id: 'bills', label: 'Bills', icon: BillIcon, group: 'Daily work', badge: unpaidBills },
    { id: 'daily', label: 'Daily Sheet', icon: CalendarDays, group: 'Daily work' },
    { id: 'customers', label: 'Customers', icon: Users, group: 'People' },
    { id: 'suppliers', label: 'Suppliers', icon: Layers, group: 'People' },
    { id: 'products', label: 'Items & Prices', icon: Tag, group: 'Stock' },
    { id: 'money', label: 'Money', icon: Coins, group: 'Money' },
    ...(can('admin_screen') || can('system:admin_screen') ? [{ id: 'admin' as ActiveScreen, label: 'Admin', icon: ShieldCheck, group: 'Administration' }] : []),
  ];

  const sections: Section[] = (isBilling ? billingSections : [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
    {
      id: 'bookings',
      label: 'Bookings',
      icon: ShoppingBag,
      group: 'Sales',
      badge: activeOrders,
      subs: [
        { label: 'Orders', icon: ShoppingBag, go: () => openBookingsView('orders'), badge: activeOrders },
        { label: 'Quotations', icon: FileText, go: () => openBookingsView('quotations'), badge: openQuotes },
        { label: 'Returns & Credit Notes', icon: RotateCcw, go: () => openBookingsView('returns') },
        { label: 'Dispatches in transit', icon: Truck, go: () => openReports('daily'), badge: inTransit },
      ],
    },
    { id: 'customers', label: 'Customers', icon: Users, group: 'Sales' },
    {
      id: 'suppliers',
      label: 'Suppliers',
      icon: Layers,
      group: 'Purchasing',
      subs: [
        { label: 'Supplier accounts', icon: Layers, go: () => openSuppliersView('suppliers') },
        { label: 'Purchase Orders', icon: ClipboardList, go: () => openSuppliersView('orders'), badge: openPOs },
        { label: 'Receive Stock', icon: PackagePlus, go: onReceiveStock },
      ],
    },
    {
      id: 'products',
      label: 'Products',
      icon: Package,
      group: 'Inventory',
      subs: [
        { label: 'Catalogue & stock', icon: Package, go: () => setActiveScreen('products') },
        { label: 'Stock Flow log', icon: ArrowLeftRight, go: () => openReports('flow') },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: BarChart3,
      group: 'Finance',
      subs: [
        { label: 'Daily & monthly', icon: BarChart3, go: () => openReports('daily') },
        ...(canFinance
          ? [
              { label: 'Sales analytics', icon: TrendingUp, go: () => openReports('analytics') },
              { label: 'Profit & Loss', icon: TrendingUp, go: () => openReports('pnl') },
              { label: 'Cash Book', icon: Wallet, go: () => openReports('cashbook') },
              { label: 'Balance Sheet', icon: Landmark, go: () => openReports('balance') },
              { label: 'Receivables aging', icon: Scale, go: () => openReports('aging') },
            ]
          : []),
      ],
    },
    {
      id: 'ops',
      label: 'Ops',
      icon: Bell,
      group: 'Operations',
      badge: alertCount,
      subs: [
        { label: 'Alerts centre', icon: Bell, go: () => openOps('alerts'), badge: alertCount },
        { label: 'Fleet & drivers', icon: Truck, go: () => openOps('fleet') },
        { label: 'Expenses', icon: Receipt, go: () => openOps('expenses') },
        { label: 'Follow-ups', icon: CheckCircle2, go: () => openOps('tasks'), badge: openTasks },
      ],
    },
    ...(can('admin_screen') || can('system:admin_screen') ? [{ id: 'admin' as ActiveScreen, label: 'Admin', icon: ShieldCheck, group: 'Administration' }] : []),
  ] as Section[]).filter((s) => isScreenVisible(s.id));

  const groups = Array.from(new Set(sections.map((s) => s.group)));

  return (
    <aside
      className={`hidden lg:flex flex-col shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-[#E5E5E1] dark:border-[#203248] bg-white/70 dark:bg-[#0D1520]/70 backdrop-blur-md transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-[264px]'}`}
      aria-label="Primary"
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 space-y-5 [scrollbar-width:thin]">
        {groups.map((group) => (
          <div key={group}>
            {!collapsed && <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8E9299] dark:text-[#64748B]">{group}</div>}
            <div className="space-y-0.5">
              {sections
                .filter((s) => s.group === group)
                .map((s) => {
                  const Icon = s.icon;
                  const active = activeScreen === s.id;
                  return (
                    <div key={s.id}>
                      <button
                        onClick={() => setActiveScreen(s.id)}
                        title={s.label}
                        aria-label={s.label}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors ${collapsed ? 'justify-center' : ''} ${
                          active
                            ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                            : 'text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F4F3EF] dark:hover:bg-[#162436]'
                        }`}
                      >
                        <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? 'text-teal-400 dark:text-teal-700' : 'text-[#8E9299]'}`} />
                        {!collapsed && <span className="flex-1 text-left truncate">{s.label}</span>}
                        {!collapsed && s.badge != null && s.badge > 0 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : s.id === 'ops' ? 'bg-rose-100 text-rose-700' : 'bg-[#E5E5E1] dark:bg-[#203248] text-[#374151] dark:text-[#CBD5E1]'}`}>{s.badge}</span>
                        )}
                        {collapsed && s.badge != null && s.badge > 0 && <span className="sr-only">{s.badge}</span>}
                      </button>
                      {!collapsed && active && s.subs && (
                        <div className="mt-1 ml-4 pl-3 border-l border-[#E5E5E1] dark:border-[#203248] space-y-0.5">
                          {s.subs.map((sub) => {
                            const SIcon = sub.icon;
                            return (
                              <a
                                key={sub.label}
                                href={`#${sub.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  sub.go();
                                }}
                                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white hover:bg-[#F4F3EF] dark:hover:bg-[#162436] transition-colors"
                              >
                                <SIcon className="w-3.5 h-3.5 shrink-0" />
                                <span className="flex-1 truncate">{sub.label}</span>
                                {sub.badge != null && sub.badge > 0 && <span className="text-[10px] font-bold text-[#8E9299]">{sub.badge}</span>}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[#E5E5E1] dark:border-[#203248] p-3 space-y-2">
        <div className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px] font-semibold ${isCloudSyncReady ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'} ${collapsed ? 'justify-center' : ''}`} title={isCloudSyncReady ? 'Cloud sync live' : isCloudSyncEnabled ? 'Cloud configured, working offline' : 'Local only'}>
          {isCloudSyncReady ? <Cloud className="w-3.5 h-3.5 shrink-0" /> : <CloudOff className="w-3.5 h-3.5 shrink-0" />}
          {!collapsed && <span className="truncate">{isCloudSyncReady ? 'Cloud sync live' : isCloudSyncEnabled ? 'Offline • local data' : 'Local only'}</span>}
        </div>
        {!isBilling && (can('admin_screen') || can('system:admin_screen')) && (
          <button onClick={() => updateSettings({ appMode: 'billing' })} title="Back to simple billing" aria-label="Back to simple billing" className={`w-full flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 ${collapsed ? 'justify-center' : ''}`}>
            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && <span className="truncate">Back to simple billing</span>}
          </button>
        )}
        {!collapsed && (
          <div className="px-3 text-[10px] text-[#8E9299] dark:text-[#64748B] truncate">{settings.companyName || 'Sarmaya'} • {new Date().getFullYear()}</div>
        )}
        <button onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="w-full flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:bg-[#F4F3EF] dark:hover:bg-[#162436]">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /> Collapse</>}
        </button>
      </div>
    </aside>
  );
};
