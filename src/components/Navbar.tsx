import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Layers,
  Package,
  ShoppingBag,
  BarChart3,
  Truck,
  Sparkles,
  Search,
  Sun,
  Moon,
  Check,
  ChevronDown,
  Lock,
  ShieldCheck,
  Bell,
  UserCircle2,
  Home,
  FileText,
  CalendarDays,
  Coins,
  Tag,
  BookOpen,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { MyAccountDialog } from './MyAccountDialog';
import { useMemo } from 'react';
import { computeAlerts } from '../utils/alerts';
import { useTrading } from '../context/TradingContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { ActiveScreen } from '../types';

interface NavbarProps {
  onOpenCommandBar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenCommandBar,
}) => {
  const {
    activeScreen,
    setActiveScreen,
    openOps,
    lockScreen,
    logout,
    roles,
    can,
    isScreenVisible,
    currentUser,
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
    settings,
    updateSettings,
  } = useTrading();
  const alertCount = useMemo(
    () => computeAlerts({ products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders }, new Date().toISOString().split('T')[0]).length,
    [products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders]
  );
  const { themeMode, resolvedTheme, setThemeMode, isNightTime, timeLabel } = useTheme();

  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMyAccountOpen, setIsMyAccountOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const alerts = useMemo(
    () => computeAlerts({ products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders }, new Date().toISOString().split('T')[0]).slice(0, 6),
    [products, customers, suppliers, bookings, trucks, ledger, dispatches, tasks, quotations, purchaseOrders]
  );
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close theme menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsBellOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isBilling = (settings.appMode || 'billing') === 'billing';
  const adminItem = can('admin_screen') || can('system:admin_screen') ? [{ id: 'admin' as ActiveScreen, label: 'Admin', icon: ShieldCheck }] : [];
  const billingNavItems: { id: ActiveScreen; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'bills', label: 'Bills', icon: FileText },
    { id: 'daily', label: 'Daily Sheet', icon: CalendarDays },
    { id: 'money', label: 'Money', icon: Coins },
    ...(can('view_finance') ? [{ id: 'accounts' as ActiveScreen, label: 'Accounts', icon: BookOpen }] : []),
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'suppliers', label: 'Suppliers', icon: Layers },
    { id: 'products', label: 'Items', icon: Tag },
    ...adminItem,
  ];
  const allNavItems: { id: ActiveScreen; label: string; icon: React.FC<{ className?: string }> }[] = isBilling ? billingNavItems : [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'suppliers', label: 'Suppliers', icon: Layers },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'bookings', label: 'Bookings', icon: ShoppingBag },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'ops', label: 'Ops', icon: Bell },
    ...(can('admin_screen') || can('system:admin_screen') ? [{ id: 'admin' as ActiveScreen, label: 'Admin', icon: ShieldCheck }] : []),
  ];

  const navItems = allNavItems.filter((item) => isScreenVisible(item.id));
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

  return (
    <header className="print:hidden sticky top-0 z-30 bg-white/90 dark:bg-[#101A26]/90 backdrop-blur-md border-b border-[#E5E5E1] dark:border-[#203248] text-[#111827] dark:text-[#F1F5F9] shadow-xs transition-colors pt-[env(safe-area-inset-top)]">
      <div className="min-w-0 w-full mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between min-h-14 sm:min-h-16 min-w-0 py-2 sm:py-3 gap-2 sm:gap-4">
          {/* Logo & Brand: the shop name wraps to two lines on phones instead of being cut off. */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 lg:flex-none">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#111827] dark:bg-[#162436] flex items-center justify-center text-white shadow-xs border border-transparent dark:border-[#203248] shrink-0">
              <Truck className="w-5 h-5 text-teal-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="font-serif italic font-bold text-[17px] leading-[1.15] sm:text-xl tracking-tight text-[#111827] dark:text-white line-clamp-2 sm:line-clamp-1 break-words">
                  {settings.companyName || 'Sarmaya'}
                </h1>
                <span className="hidden md:inline-flex shrink-0 text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 bg-[#FAF9F6] dark:bg-[#162436] text-teal-800 dark:text-teal-300 rounded-full border border-[#E5E5E1] dark:border-[#203248]">
                  {isBilling ? 'Billing' : 'Bulk Trading'}
                </span>
              </div>
            </div>
          </div>

          {/* Search (Ctrl/⌘ K): a real search field look on wider screens, an icon on phones. */}
          <button
            type="button"
            onClick={onOpenCommandBar}
            aria-label="Search"
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
            title={`Search customers, bills, items… (${isMac ? '⌘K' : 'Ctrl+K'})`}
            className="group shrink-0 flex items-center justify-center sm:justify-between gap-2 w-11 h-11 sm:w-60 lg:w-72 xl:w-80 sm:h-10 sm:px-3.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-white dark:hover:bg-[#1E2E40] border border-[#E5E5E1] dark:border-[#2A3F5A] hover:border-teal-600/50 dark:hover:border-teal-400/50 text-[#6B7280] dark:text-[#94A3B8] transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Search className="w-4.5 h-4.5 sm:w-4 sm:h-4 text-[#374151] dark:text-[#CBD5E1] shrink-0" />
              <span className="hidden sm:inline text-sm font-medium truncate group-hover:text-[#111827] dark:group-hover:text-white">Search</span>
            </span>
            <kbd className="hidden sm:inline-flex items-center text-[11px] font-semibold font-sans bg-white dark:bg-[#0D1520] px-1.5 py-0.5 rounded-md border border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8] shrink-0">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>

          {/* Right Action Hub */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className={`${isBilling ? 'hidden lg:flex' : 'flex'} items-center rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] p-0.5`}>
            {/* Automated System-Aware Theme Toggle */}
            <div className="relative hidden sm:block" ref={themeMenuRef}>
              <button
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                title={`Theme: ${timeLabel}. Click to switch theme.`}
                aria-label="Theme"
                aria-haspopup="menu"
                aria-expanded={isThemeMenuOpen}
                className="w-9 h-9 rounded-xl hover:bg-white dark:hover:bg-[#1E2E40] text-[#111827] dark:text-[#F1F5F9] transition-colors flex items-center justify-center"
              >
                {themeMode === 'auto' ? (
                  <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                ) : themeMode === 'dark' ? (
                  <Moon className="w-4 h-4 text-teal-400" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-500" />
                )}
              </button>

              {/* Theme Dropdown Menu */}
              {isThemeMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#101A26] rounded-2xl shadow-xl border border-[#E5E5E1] dark:border-[#203248] py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8E9299] dark:text-[#64748B] border-b border-[#E5E5E1] dark:border-[#203248] mb-1 flex items-center justify-between">
                    <span>Theme Aesthetics</span>
                    <span className="text-[9px] font-mono font-normal">
                      {isNightTime ? '🌙 Night' : '☀️ Day'}
                    </span>
                  </div>

                  {/* Option 1: Auto (System & Time-Aware) */}
                  <button
                    onClick={() => {
                      setThemeMode('auto');
                      setIsThemeMenuOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors ${
                      themeMode === 'auto'
                        ? 'text-teal-700 dark:text-teal-400 font-bold bg-teal-50/50 dark:bg-teal-950/30'
                        : 'text-[#111827] dark:text-[#F1F5F9]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <div>
                        <div className="font-semibold">Auto (System & Time)</div>
                        <div className="text-[10px] text-[#8E9299] dark:text-[#94A3B8]">
                          {isNightTime ? 'Deep Ocean at night' : 'Light Neutral in daytime'}
                        </div>
                      </div>
                    </div>
                    {themeMode === 'auto' && <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                  </button>

                  {/* Option 2: Light Neutral */}
                  <button
                    onClick={() => {
                      setThemeMode('light');
                      setIsThemeMenuOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors ${
                      themeMode === 'light'
                        ? 'text-teal-700 dark:text-teal-400 font-bold bg-teal-50/50 dark:bg-teal-950/30'
                        : 'text-[#111827] dark:text-[#F1F5F9]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Sun className="w-4 h-4 text-amber-500" />
                      <div>
                        <div className="font-semibold">Light Neutral</div>
                        <div className="text-[10px] text-[#8E9299] dark:text-[#94A3B8]">
                          Warm Alabaster aesthetic
                        </div>
                      </div>
                    </div>
                    {themeMode === 'light' && <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                  </button>

                  {/* Option 3: Deep Ocean Dark Mode */}
                  <button
                    onClick={() => {
                      setThemeMode('dark');
                      setIsThemeMenuOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition-colors ${
                      themeMode === 'dark'
                        ? 'text-teal-700 dark:text-teal-400 font-bold bg-teal-50/50 dark:bg-teal-950/30'
                        : 'text-[#111827] dark:text-[#F1F5F9]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Moon className="w-4 h-4 text-teal-400" />
                      <div>
                        <div className="font-semibold">Deep Ocean (Dark)</div>
                        <div className="text-[10px] text-[#8E9299] dark:text-[#94A3B8]">
                          Midnight Navy & Sea Teal
                        </div>
                      </div>
                    </div>
                    {themeMode === 'dark' && <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                  </button>
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setIsBellOpen((v) => !v)}
                title="Notifications"
                aria-label="Notifications"
                className="relative w-9 h-9 rounded-xl hover:bg-white dark:hover:bg-[#1E2E40] text-[#111827] dark:text-[#F1F5F9] transition-colors flex items-center justify-center"
              >
                <Bell className="w-4 h-4" />
                {alertCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">{alertCount > 99 ? '99+' : alertCount}</span>}
              </button>
              {isBellOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#101A26] rounded-2xl shadow-xl border border-[#E5E5E1] dark:border-[#203248] py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8E9299] dark:text-[#64748B] border-b border-[#E5E5E1] dark:border-[#203248] mb-1 flex items-center justify-between">
                    <span>Needs attention</span>
                    <span className="font-mono">{alertCount}</span>
                  </div>
                  {alerts.length === 0 ? (
                    <div className="px-3.5 py-5 text-center text-[#8E9299]">All clear. Nothing overdue, late or short.</div>
                  ) : (
                    alerts.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setIsBellOpen(false);
                          openOps('alerts');
                        }}
                        className="w-full text-left px-3.5 py-2 flex items-start gap-2 hover:bg-[#FAF9F6] dark:hover:bg-[#162436]"
                      >
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.severity === 'danger' ? 'bg-rose-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-teal-500'}`} />
                        <span className="min-w-0">
                          <span className="block font-semibold text-[#111827] dark:text-white truncate">{a.title}</span>
                          <span className="block text-[10px] text-[#8E9299] line-clamp-2">{a.detail}</span>
                        </span>
                      </button>
                    ))
                  )}
                  <button onClick={() => { setIsBellOpen(false); openOps('alerts'); }} className="w-full mt-1 px-3.5 py-2 text-[11px] font-bold text-teal-700 dark:text-teal-400 hover:underline text-left border-t border-[#E5E5E1] dark:border-[#203248]">Open alerts centre →</button>
                </div>
              )}
            </div>

            </div>

            {/* Signed-in user: menu with My account, Lock screen and Log out */}
            {currentUser && (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={isUserMenuOpen}
                  aria-label={`Account menu for ${currentUser.name}`}
                  title={`Signed in as ${currentUser.name} (@${currentUser.username})`}
                  className="flex items-center gap-2 p-1.5 sm:p-1 xl:pl-1.5 xl:pr-2.5 xl:py-1 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] border border-[#E5E5E1] dark:border-[#203248] text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] max-w-64 transition-colors"
                >
                  <span className="w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-teal-600 dark:bg-teal-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden xl:block min-w-0 text-left">
                    <span className="block text-xs font-semibold text-[#111827] dark:text-white truncate">{currentUser.name}</span>
                    <span className="block text-[9px] uppercase tracking-wider text-teal-700 dark:text-teal-300 font-bold truncate">
                      {currentUser.role.replace('_', ' ')}
                    </span>
                  </span>
                  <ChevronDown className="w-3 h-3 text-[#8E9299] hidden xl:block" />
                </button>
                {isUserMenuOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#101A26] rounded-2xl shadow-xl border border-[#E5E5E1] dark:border-[#203248] py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3.5 pb-2 mb-1 border-b border-[#E5E5E1] dark:border-[#203248]">
                      <div className="font-bold text-sm text-[#111827] dark:text-white truncate">{currentUser.name}</div>
                      <div className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] truncate">
                        <span className="font-mono">@{currentUser.username}</span> · {roles.find((r) => r.id === currentUser.role)?.name || currentUser.role}
                      </div>
                    </div>
                    <button role="menuitem" type="button" onClick={() => { setIsUserMenuOpen(false); setIsMyAccountOpen(true); }} className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] text-[#111827] dark:text-[#F1F5F9] font-semibold">
                      <KeyRound className="w-4 h-4 text-teal-600 dark:text-teal-400" /> My account &amp; password
                    </button>
                    <button role="menuitem" type="button" onClick={() => { setIsUserMenuOpen(false); lockScreen(); }} className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] text-[#111827] dark:text-[#F1F5F9] font-semibold">
                      <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Lock screen
                    </button>
                    <button role="menuitem" type="button" onClick={() => { setIsUserMenuOpen(false); logout(); }} className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold">
                      <LogOut className="w-4 h-4" /> Log out
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Lock screen button: asks for the same user's password to open again */}
            <button
              onClick={() => lockScreen()}
              title="Lock screen (your password is needed to open again)"
              aria-label="Lock screen"
              className="hidden sm:flex items-center gap-1.5 h-10 px-3 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-[#E5E5E1] dark:border-[#203248] hover:border-rose-200 dark:hover:border-rose-900/60 text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 transition-all shadow-2xs active:scale-95"
            >
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="hidden xl:inline">Lock</span>
            </button>

          </div>
        </div>

        {/* Mobile Navigation Bar: equal-width tabs so all screens fit without scrolling */}
        {!isBilling && adminItem.length > 0 && (
          <button type="button" onClick={() => { updateSettings({ appMode: 'billing' }); setActiveScreen('dashboard'); }} className="lg:hidden w-full text-left px-1 pt-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">← Back to simple billing</button>
        )}
        {!isBilling && <nav className={`grid lg:hidden ${navItems.length > 8 ? 'grid-cols-5' : 'grid-cols-4'} gap-0.5 py-1.5 border-t border-[#E5E5E1] dark:border-[#203248]`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 rounded-xl text-[9px] leading-tight font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]'
                    : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40]'
                }`}
              >
                <span className="relative">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-400 dark:text-teal-700' : ''}`} />
                  {item.id === 'ops' && alertCount > 0 && <span className="absolute -top-1 -right-2 min-w-3.5 h-3.5 px-0.5 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center">{alertCount}</span>}
                </span>
                <span className="w-full truncate text-center">{item.label}</span>
              </button>
            );
          })}
        </nav>}
      </div>
      <MyAccountDialog isOpen={isMyAccountOpen} onClose={() => setIsMyAccountOpen(false)} />
    </header>
  );
};

