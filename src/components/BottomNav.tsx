import React, { useMemo, useState } from 'react';
import { Home, FileText, Coins, MoreHorizontal, Plus, Users, Layers, Tag, CalendarDays, BookOpen, ShieldCheck, Sun, Moon, Sparkles, Bell, KeyRound, Lock, LogOut, ChevronDown, ArrowLeftRight } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useBillingUI } from './billing/BillingUI';
import { Modal } from './billing/ui';
import { MyAccountDialog } from './MyAccountDialog';
import { computeAlerts } from '../utils/alerts';
import { ActiveScreen } from '../types';
import { useMediaQuery } from '../hooks/useMediaQuery';

type Icon = React.FC<{ className?: string }>;

/**
 * Phone / tablet navigation for simple billing (below the `lg` breakpoint, where the sidebar is hidden):
 * a fixed bottom tab bar — Home, Bills, a big "New bill" in the middle, Money, More — and a "More" sheet
 * with every other screen plus theme, notifications and the account actions.
 */
export const BottomNav: React.FC = () => {
  const {
    activeScreen, setActiveScreen, can, isScreenVisible, invoices, currentUser, roles, lockScreen, logout, updateSettings,
    products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders,
  } = useTrading();
  const { themeMode, setThemeMode } = useTheme();
  const ui = useBillingUI();
  const [moreOpen, setMoreOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const alerts = useMemo(
    () => computeAlerts({ products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders }, new Date().toISOString().split('T')[0]),
    [products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders]
  );
  const unpaidBills = invoices.filter((i) => i.balanceDue > 0 && i.status !== 'cancelled').length;
  // Desktop has the sidebar: keep the bar (and its sheet) out of the page entirely.
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const tabs: { id: ActiveScreen; label: string; icon: Icon; badge?: number }[] = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'bills', label: 'Bills', icon: FileText, badge: unpaidBills },
  ];
  const tabsRight: { id: ActiveScreen; label: string; icon: Icon }[] = [{ id: 'money', label: 'Money', icon: Coins }];
  const moreScreens: { id: ActiveScreen; label: string; icon: Icon; tint: string }[] = ([
    { id: 'customers', label: 'Customers', icon: Users, tint: 'text-teal-700 dark:text-teal-300' },
    { id: 'suppliers', label: 'Suppliers', icon: Layers, tint: 'text-indigo-600 dark:text-indigo-300' },
    { id: 'products', label: 'Items & Prices', icon: Tag, tint: 'text-amber-600 dark:text-amber-300' },
    { id: 'daily', label: 'Daily Sheet', icon: CalendarDays, tint: 'text-sky-600 dark:text-sky-300' },
    ...(can('view_finance') ? [{ id: 'accounts' as ActiveScreen, label: 'Accounts', icon: BookOpen, tint: 'text-violet-600 dark:text-violet-300' }] : []),
    ...(can('admin_screen') || can('system:admin_screen') ? [{ id: 'admin' as ActiveScreen, label: 'Admin', icon: ShieldCheck, tint: 'text-rose-600 dark:text-rose-300' }] : []),
  ] as { id: ActiveScreen; label: string; icon: Icon; tint: string }[]).filter((s) => isScreenVisible(s.id));
  const moreActive = moreScreens.some((s) => s.id === activeScreen);

  const go = (id: ActiveScreen) => {
    setActiveScreen(id);
    setMoreOpen(false);
    window.scrollTo({ top: 0 });
  };

  const tabCls = (active: boolean) =>
    `relative flex-1 min-w-0 min-h-14 flex flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition-colors ${
      active ? 'text-[#111827] dark:text-white' : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
    }`;
  const iconWrap = (active: boolean) => `flex items-center justify-center w-12 h-7 rounded-full transition-colors ${active ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200' : ''}`;

  const renderTab = ({ id, label, icon: I, badge }: { id: ActiveScreen; label: string; icon: Icon; badge?: number }) => {
    const active = activeScreen === id;
    return (
      <button key={id} type="button" onClick={() => go(id)} aria-label={label} aria-current={active ? 'page' : undefined} className={tabCls(active)}>
        <span className={iconWrap(active)}>
          <I className="w-5 h-5" />
        </span>
        <span aria-hidden="true">{label}</span>
        {badge != null && badge > 0 && (
          <span aria-hidden="true" className="absolute top-1 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">{badge > 99 ? '99+' : badge}</span>
        )}
      </button>
    );
  };

  const themes: { id: ThemeMode; label: string; icon: Icon }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'auto', label: 'Auto', icon: Sparkles },
  ];
  const rowCls = 'w-full min-h-12 flex items-center gap-3 px-3.5 rounded-2xl text-sm font-semibold text-left hover:bg-[#F4F3EF] dark:hover:bg-[#162436] transition-colors';

  if (isDesktop) return null;
  return (
    <>
      <nav
        aria-label="Main"
        className="lg:hidden print:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 dark:bg-[#101A26]/95 backdrop-blur-md border-t border-[#E5E5E1] dark:border-[#203248] shadow-[0_-4px_16px_rgba(17,24,39,0.06)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-xl mx-auto flex items-stretch gap-1 px-2 pt-1 pb-1">
          {tabs.map(renderTab)}
          <div className="flex-1 min-w-0 flex items-start justify-center">
            <button
              type="button"
              onClick={() => ui.newBill()}
              aria-label="New bill"
              className="-mt-5 flex flex-col items-center gap-1 text-[11px] font-bold text-[#111827] dark:text-white"
            >
              <span className="w-14 h-14 rounded-full bg-[#111827] dark:bg-teal-500 text-white dark:text-[#07131F] shadow-lg shadow-slate-900/20 ring-4 ring-white dark:ring-[#101A26] flex items-center justify-center active:scale-95 transition-transform">
                <Plus className="w-7 h-7" />
              </span>
              <span aria-hidden="true">New bill</span>
            </button>
          </div>
          {tabsRight.map(renderTab)}
          <button type="button" onClick={() => setMoreOpen(true)} aria-label="More" aria-haspopup="dialog" aria-expanded={moreOpen} className={tabCls(moreActive)}>
            <span className={iconWrap(moreActive)}>
              <MoreHorizontal className="w-5 h-5" />
            </span>
            <span aria-hidden="true">More</span>
          </button>
        </div>
      </nav>

      <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {moreScreens.map((s) => {
              const I = s.icon;
              const active = activeScreen === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(s.id)}
                  aria-label={s.label}
                  aria-current={active ? 'page' : undefined}
                  className={`min-h-20 flex flex-col items-center justify-center gap-1.5 px-1 rounded-2xl border text-xs font-bold text-center transition-colors ${
                    active
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent'
                      : 'bg-[#FAF9F6] dark:bg-[#162436] border-[#E5E5E1] dark:border-[#203248] text-[#111827] dark:text-white hover:border-teal-500/50'
                  }`}
                >
                  <I className={`w-5 h-5 ${active ? '' : s.tint}`} />
                  <span aria-hidden="true" className="leading-tight">{s.label}</span>
                </button>
              );
            })}
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8] mb-1.5">Appearance</div>
            <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#F4F3EF] dark:bg-[#0D1520] border border-[#E5E5E1] dark:border-[#203248]">
              {themes.map((t) => {
                const I = t.icon;
                const on = themeMode === t.id;
                return (
                  <button key={t.id} type="button" aria-pressed={on} onClick={() => setThemeMode(t.id)} className={`min-h-11 flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-colors ${on ? 'bg-white dark:bg-[#1E2E40] text-[#111827] dark:text-white shadow-xs' : 'text-[#6B7280] dark:text-[#94A3B8]'}`}>
                    <I className="w-4 h-4" /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-1">
            <button type="button" onClick={() => setAlertsOpen((v) => !v)} aria-expanded={alertsOpen} className={`${rowCls} text-[#111827] dark:text-white`}>
              <Bell className="w-4.5 h-4.5 text-[#6B7280] dark:text-[#94A3B8]" />
              <span className="flex-1">Notifications</span>
              {alerts.length > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{alerts.length}</span>}
              <ChevronDown className={`w-4 h-4 text-[#8E9299] transition-transform ${alertsOpen ? 'rotate-180' : ''}`} />
            </button>
            {alertsOpen && (
              <ul className="px-3.5 pb-2 space-y-2 text-xs">
                {alerts.length === 0 && <li className="text-[#6B7280] dark:text-[#94A3B8] py-1">All clear. Nothing overdue, late or short.</li>}
                {alerts.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-start gap-2">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.severity === 'danger' ? 'bg-rose-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-teal-500'}`} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-[#111827] dark:text-white">{a.title}</span>
                      <span className="block text-[#6B7280] dark:text-[#94A3B8]">{a.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {currentUser && (
            <div className="rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-1">
              <div className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="w-9 h-9 rounded-full bg-teal-600 dark:bg-teal-500 text-white flex items-center justify-center text-sm font-bold shrink-0">{currentUser.name.charAt(0).toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[#111827] dark:text-white truncate">{currentUser.name}</span>
                  <span className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8] truncate">@{currentUser.username} · {roles.find((r) => r.id === currentUser.role)?.name || currentUser.role}</span>
                </span>
              </div>
              {(can('admin_screen') || can('system:admin_screen')) && (
                <button type="button" onClick={() => { setMoreOpen(false); updateSettings({ appMode: 'trading' }); setActiveScreen('dashboard'); }} className={`${rowCls} text-indigo-800 dark:text-indigo-300`}>
                  <ArrowLeftRight className="w-4.5 h-4.5" /> Full trading suite
                </button>
              )}
              <button type="button" onClick={() => { setMoreOpen(false); setAccountOpen(true); }} className={`${rowCls} text-[#111827] dark:text-white`}>
                <KeyRound className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400" /> My account &amp; password
              </button>
              <button type="button" onClick={() => { setMoreOpen(false); lockScreen(); }} className={`${rowCls} text-[#111827] dark:text-white`}>
                <Lock className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" /> Lock screen
              </button>
              <button type="button" onClick={() => { setMoreOpen(false); logout(); }} className={`${rowCls} text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40`}>
                <LogOut className="w-4.5 h-4.5" /> Log out
              </button>
            </div>
          )}
        </div>
      </Modal>
      <MyAccountDialog isOpen={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  );
};
