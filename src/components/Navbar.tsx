import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Layers,
  Package,
  ShoppingBag,
  BarChart3,
  Truck,
  MessageSquare,
  Sparkles,
  Search,
  Sun,
  Moon,
  Check,
  ChevronDown,
  Lock,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { ActiveScreen } from '../types';

interface NavbarProps {
  onOpenDispatch: () => void;
  onOpenWhatsAppDrawer: () => void;
  onOpenCommandBar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenDispatch,
  onOpenWhatsAppDrawer,
  onOpenCommandBar,
}) => {
  const { activeScreen, setActiveScreen, whatsappMessages, isAdminUnlocked, lockAdmin } = useTrading();
  const { themeMode, resolvedTheme, setThemeMode, isNightTime, timeLabel } = useTheme();

  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close theme menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems: { id: ActiveScreen; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'suppliers', label: 'Suppliers', icon: Layers },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'bookings', label: 'Bookings', icon: ShoppingBag },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#101A26]/90 backdrop-blur-md border-b border-[#E5E5E1] dark:border-[#203248] text-[#111827] dark:text-[#F1F5F9] shadow-xs transition-colors">
      <div className="max-w-7xl min-w-0 w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex items-center justify-between min-h-16 min-w-0 py-3 gap-3 sm:gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-[#111827] dark:bg-[#162436] flex items-center justify-center text-white shadow-xs border border-transparent dark:border-[#203248]">
              <Truck className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif italic font-bold text-lg sm:text-xl tracking-tight text-[#111827] dark:text-white">
                  Sarmaya
                </h1>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 bg-[#FAF9F6] dark:bg-[#162436] text-teal-800 dark:text-teal-300 rounded-full border border-[#E5E5E1] dark:border-[#203248]">
                  Bulk Trading
                </span>
              </div>
              <p className="text-[11px] text-[#8E9299] dark:text-[#94A3B8] font-medium hidden 2xl:block">
                Simple • Smart • Automated
              </p>
            </div>
          </div>

          {/* Core Navigation Items */}
          <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 bg-[#FAF9F6] dark:bg-[#162436] p-1 rounded-full border border-[#E5E5E1] dark:border-[#203248]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveScreen(item.id)}
                  title={item.label}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-xs'
                      : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-400 dark:text-teal-700' : 'text-[#8E9299] dark:text-[#64748B]'}`} />
                  <span className="hidden xl:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Global Command Bar Search Trigger (CMD+K) - High Contrast & Dedicated Width */}
          <button
            onClick={onOpenCommandBar}
            title="Global Quick Search (Press ⌘K or Ctrl+K to open)"
            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#162436] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] border border-[#CBD5E1] dark:border-[#2A3F5A] hover:border-teal-600/50 dark:hover:border-teal-400/50 rounded-2xl text-xs text-[#374151] dark:text-[#E2E8F0] shadow-2xs transition-all w-36 sm:w-44 lg:w-36 xl:w-52 shrink min-w-0 justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate min-w-0">
              <Search className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-[#4B5563] dark:text-[#CBD5E1] group-hover:text-[#111827] dark:group-hover:text-white truncate">
                Search...
              </span>
            </div>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold bg-[#F1F5F9] dark:bg-[#0D1520] px-1.5 py-0.5 rounded-md border border-[#CBD5E1] dark:border-[#203248] text-[#475569] dark:text-[#94A3B8] shadow-2xs shrink-0">
              <span>⌘K</span>
            </kbd>
          </button>

          {/* Right Action Hub */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Automated System-Aware Theme Toggle */}
            <div className="relative" ref={themeMenuRef}>
              <button
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                title={`Theme: ${timeLabel}. Click to switch theme.`}
                className="px-2.5 py-2 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] text-[#111827] dark:text-[#F1F5F9] border border-[#E5E5E1] dark:border-[#203248] transition-colors flex items-center gap-1.5"
              >
                {themeMode === 'auto' ? (
                  <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 animate-pulse" />
                ) : themeMode === 'dark' ? (
                  <Moon className="w-3.5 h-3.5 text-teal-400" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span className="hidden xl:inline text-[11px] font-semibold text-[#6B7280] dark:text-[#94A3B8]">
                  {themeMode === 'auto' ? 'Auto' : themeMode === 'dark' ? 'Ocean' : 'Light'}
                </span>
                <ChevronDown className="w-3 h-3 text-[#8E9299] hidden sm:block" />
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

            {/* Lock Terminal Button */}
            <button
              onClick={() => lockAdmin()}
              title="Lock Trading Terminal (Requires PIN to enter)"
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-[#E5E5E1] dark:border-[#203248] hover:border-rose-200 dark:hover:border-rose-900/60 text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 transition-all shadow-2xs active:scale-95"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">Lock</span>
            </button>

            {/* Quick Dispatch Button */}
            <button
              onClick={onOpenDispatch}
              className="bg-[#111827] dark:bg-white hover:bg-black dark:hover:bg-slate-100 text-white dark:text-[#111827] text-xs font-bold py-2 px-3 sm:px-3.5 rounded-2xl flex items-center gap-1.5 sm:gap-2 shadow-xs active:scale-95 transition-all border border-[#111827] dark:border-white"
            >
              <Truck className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" />
              <span className="hidden sm:inline">Log Dispatch</span>
            </button>

            {/* WhatsApp Automated Badge */}
            <button
              onClick={onOpenWhatsAppDrawer}
              title="Open WhatsApp Automation Hub"
              className="relative p-2 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] text-[#111827] dark:text-[#F1F5F9] border border-[#E5E5E1] dark:border-[#203248] transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              {whatsappMessages.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-teal-600 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                  {whatsappMessages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex lg:hidden items-center justify-around py-2.5 border-t border-[#E5E5E1] dark:border-[#203248] overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-semibold transition-colors ${
                  isActive
                    ? 'text-teal-700 dark:text-teal-400 font-bold'
                    : 'text-[#8E9299] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};

