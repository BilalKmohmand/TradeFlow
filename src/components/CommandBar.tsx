import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Users,
  Layers,
  Package,
  ShoppingBag,
  Truck,
  CreditCard,
  MessageSquare,
  BarChart3,
  Sun,
  Moon,
  Sparkles,
  ArrowRight,
  CornerDownLeft,
  X,
  Clock,
  Plus,
  ShieldCheck,
  Lock,
  PackagePlus,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency, formatKg } from '../utils/formatters';

interface CommandBarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDispatch: (bookingId?: string) => void;
  onOpenBooking: () => void;
  onOpenCustomer: (customerId: string) => void;
  onOpenSupplier: (supplierId: string) => void;
  onOpenPayment: (type: 'customer' | 'supplier', id?: string) => void;
  onOpenCustomerModal: () => void;
  onOpenSupplierModal: () => void;
  onOpenProductModal: () => void;
  onOpenWhatsAppDrawer: () => void;
  onOpenPurchaseModal: () => void;
}

type CommandItem = {
  id: string;
  category: 'customers' | 'suppliers' | 'products' | 'bookings' | 'actions' | 'navigation';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeType?: 'default' | 'success' | 'warning' | 'info';
  icon: React.FC<{ className?: string }>;
  perform: () => void;
};

export const CommandBar: React.FC<CommandBarProps> = ({
  isOpen,
  onClose,
  onOpenDispatch,
  onOpenBooking,
  onOpenCustomer,
  onOpenSupplier,
  onOpenPayment,
  onOpenCustomerModal,
  onOpenSupplierModal,
  onOpenProductModal,
  onOpenWhatsAppDrawer,
  onOpenPurchaseModal,
}) => {
  const {
    customers,
    suppliers,
    products,
    bookings,
    setActiveScreen,
    lockAdmin,
    setSelectedProductId,
    openBooking,
  } = useTrading();

  const { themeMode, setThemeMode, cycleTheme, resolvedTheme } = useTheme();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Global shortcut handler (CMD+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open handled by caller or state
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build searchable items
  const allItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];

    // Quick Actions
    items.push({
      id: 'action-dispatch',
      category: 'actions',
      title: 'Log Truck Dispatch',
      subtitle: 'Record instant commodity shipment & auto-notify customer via WhatsApp',
      badge: 'Quick Action',
      badgeType: 'info',
      icon: Truck,
      perform: () => {
        onClose();
        onOpenDispatch();
      },
    });

    items.push({
      id: 'action-booking',
      category: 'actions',
      title: 'Create New Booking Order',
      subtitle: 'Schedule bulk commodity supply contract',
      badge: 'Order',
      badgeType: 'default',
      icon: Plus,
      perform: () => {
        onClose();
        onOpenBooking();
      },
    });

    items.push({
      id: 'action-receive-stock',
      category: 'actions',
      title: 'Receive Stock from Supplier',
      subtitle: 'Book incoming goods: adds to warehouse stock and supplier payable',
      badge: 'Incoming',
      badgeType: 'success',
      icon: PackagePlus,
      perform: () => {
        onClose();
        onOpenPurchaseModal();
      },
    });

    items.push({
      id: 'action-customer-pay',
      category: 'actions',
      title: 'Record Customer Payment',
      subtitle: 'Receive cleared funds & update outstanding ledger',
      badge: 'Receivables',
      badgeType: 'success',
      icon: CreditCard,
      perform: () => {
        onClose();
        onOpenPayment('customer');
      },
    });

    items.push({
      id: 'action-supplier-pay',
      category: 'actions',
      title: 'Record Supplier Payment',
      subtitle: 'Disburse funds to source supplier terminal',
      badge: 'Payables',
      badgeType: 'warning',
      icon: CreditCard,
      perform: () => {
        onClose();
        onOpenPayment('supplier');
      },
    });

    // Navigation Items
    items.push({
      id: 'nav-dashboard',
      category: 'navigation',
      title: 'Go to Dashboard',
      subtitle: 'Real-time overview, metrics, and active bookings',
      icon: Truck,
      perform: () => {
        onClose();
        setActiveScreen('dashboard');
      },
    });

    items.push({
      id: 'nav-reports',
      category: 'navigation',
      title: 'Go to Reports & Financial Exports',
      subtitle: 'Daily dispatch log, monthly rollups, and CSV downloads',
      badge: 'Reports',
      icon: BarChart3,
      perform: () => {
        onClose();
        setActiveScreen('reports');
      },
    });

    items.push({
      id: 'nav-admin',
      category: 'navigation',
      title: 'Open Admin Control Center',
      subtitle: 'Change PIN, delete or purge data, backups, audit log',
      badge: 'Admin',
      badgeType: 'warning',
      icon: ShieldCheck,
      perform: () => {
        onClose();
        setActiveScreen('admin');
      },
    });

    items.push({
      id: 'nav-whatsapp',
      category: 'navigation',
      title: 'Open WhatsApp Automation Hub',
      subtitle: 'Review quiet delivery dispatches & balance sweep reminders',
      badge: 'Automation',
      badgeType: 'success',
      icon: MessageSquare,
      perform: () => {
        onClose();
        onOpenWhatsAppDrawer();
      },
    });

    items.push({
      id: 'action-lock-terminal',
      category: 'actions',
      title: 'Lock Trading Terminal (PIN Required)',
      subtitle: 'Instantly lock the app so PIN is required on reopen',
      badge: 'Security',
      badgeType: 'warning',
      icon: Lock,
      perform: () => {
        onClose();
        lockAdmin();
      },
    });

    items.push({
      id: 'action-theme-toggle',
      category: 'actions',
      title: `Toggle Theme Mode (Current: ${themeMode.toUpperCase()})`,
      subtitle: 'Cycle between Auto (Time-aware), Light Neutral, and Deep Ocean dark mode',
      badge: themeMode === 'auto' ? 'Time-aware' : themeMode === 'dark' ? 'Deep Ocean' : 'Light',
      badgeType: 'info',
      icon: themeMode === 'dark' ? Moon : themeMode === 'light' ? Sun : Sparkles,
      perform: () => {
        cycleTheme();
        onClose();
      },
    });

    // Customers
    customers.forEach((c) => {
      items.push({
        id: `customer-${c.id}`,
        category: 'customers',
        title: `${c.name} — ${c.company}`,
        subtitle: `Phone: ${c.phone} • Credit: ${formatCurrency(c.creditLimit)} • Address: ${c.address}`,
        badge: c.totalDue > 0 ? `Due: ${formatCurrency(c.totalDue)}` : 'Zero Due',
        badgeType: c.totalDue > 0 ? 'warning' : 'success',
        icon: Users,
        perform: () => {
          onClose();
          onOpenCustomer(c.id);
        },
      });
    });

    // Suppliers
    suppliers.forEach((s) => {
      items.push({
        id: `supplier-${s.id}`,
        category: 'suppliers',
        title: `${s.name} — ${s.company}`,
        subtitle: `Category: ${s.materialCategory} • Phone: ${s.phone} • Berth: ${s.address}`,
        badge: s.totalOwed > 0 ? `Owed: ${formatCurrency(s.totalOwed)}` : 'Paid up',
        badgeType: s.totalOwed > 0 ? 'warning' : 'default',
        icon: Layers,
        perform: () => {
          onClose();
          onOpenSupplier(s.id);
        },
      });
    });

    // Products
    products.forEach((p) => {
      items.push({
        id: `product-${p.id}`,
        category: 'products',
        title: `${p.name} (${p.category})`,
        subtitle: `Price: Rs. ${p.unitPricePerKg}/kg • Threshold: ${p.minThresholdKg}kg`,
        badge: `Stock: ${formatKg(p.stockKg)}`,
        badgeType: p.stockKg < p.minThresholdKg ? 'warning' : 'info',
        icon: Package,
        perform: () => {
          onClose();
          setSelectedProductId(p.id);
        },
      });
    });

    // Bookings
    bookings.forEach((b) => {
      const cust = customers.find((c) => c.id === b.customerId);
      const prod = products.find((p) => p.id === b.productId);
      items.push({
        id: `booking-${b.id}`,
        category: 'bookings',
        title: `Order ${b.bookingNumber} • ${cust?.name || 'Customer'}`,
        subtitle: `${prod?.name} • ${b.totalKg} kg (Rs. ${b.pricePerKg}/kg) • Created: ${b.createdAt}`,
        badge: b.remainingKg > 0 ? `${b.remainingKg}kg Remaining` : 'Completed',
        badgeType: b.remainingKg > 0 ? 'info' : 'success',
        icon: ShoppingBag,
        perform: () => {
          onClose();
          openBooking(b.id);
        },
      });
    });

    return items;
  }, [
    customers,
    suppliers,
    products,
    bookings,
    themeMode,
    onClose,
    onOpenDispatch,
    onOpenBooking,
    onOpenCustomer,
    onOpenSupplier,
    onOpenPayment,
    onOpenWhatsAppDrawer,
    setActiveScreen,
    cycleTheme,
  ]);

  // Filter items by query
  const filteredItems = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) {
      return allItems;
    }
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(clean) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(clean)) ||
        (item.badge && item.badge.toLowerCase().includes(clean)) ||
        item.category.toLowerCase().includes(clean)
    );
  }, [allItems, query]);

  // Handle keyboard events inside dialog
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filteredItems[selectedIndex];
      if (current) {
        current.perform();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-2xl bg-white dark:bg-[#111C28] rounded-3xl shadow-2xl border border-[#E5E5E1] dark:border-[#22354A] overflow-hidden z-10 flex flex-col max-h-[80vh]"
        >
          {/* Search Input Bar */}
          <div className="p-4 sm:p-5 border-b border-[#E5E5E1] dark:border-[#22354A] flex items-center gap-3.5 bg-white dark:bg-[#111C28]">
            <Search className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search customers, suppliers, commodities, orders, or actions (e.g. 'Coal', 'Acme', 'Dispatch')..."
              className="flex-1 bg-transparent text-sm sm:text-base font-sans text-[#111827] dark:text-white placeholder-[#8E9299] dark:placeholder-[#64748B] focus:outline-hidden"
            />
            {query ? (
              <button
                onClick={() => setQuery('')}
                className="p-1 rounded-lg text-[#8E9299] hover:text-[#111827] dark:hover:text-white hover:bg-[#FAF9F6] dark:hover:bg-[#18283A]"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-[#8E9299] dark:text-[#64748B] bg-[#FAF9F6] dark:bg-[#18283A] px-2 py-1 rounded-lg border border-[#E5E5E1] dark:border-[#22354A]">
                <span>ESC</span>
              </div>
            )}
          </div>

          {/* Category Chips Filter / Quick Jumps */}
          <div className="px-4 py-2.5 bg-[#FAF9F6] dark:bg-[#0D1520] border-b border-[#E5E5E1] dark:border-[#22354A] flex items-center gap-2 overflow-x-auto text-[11px] font-semibold text-[#6B7280] dark:text-[#94A3B8]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8E9299] dark:text-[#64748B] shrink-0">
              Filter:
            </span>
            <button
              onClick={() => setQuery('')}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                !query ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : 'hover:bg-[#E5E5E1] dark:hover:bg-[#1E2E40]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setQuery('customer')}
              className="px-2.5 py-1 rounded-full hover:bg-[#E5E5E1] dark:hover:bg-[#1E2E40] transition-colors"
            >
              Customers ({customers.length})
            </button>
            <button
              onClick={() => setQuery('supplier')}
              className="px-2.5 py-1 rounded-full hover:bg-[#E5E5E1] dark:hover:bg-[#1E2E40] transition-colors"
            >
              Suppliers ({suppliers.length})
            </button>
            <button
              onClick={() => setQuery('product')}
              className="px-2.5 py-1 rounded-full hover:bg-[#E5E5E1] dark:hover:bg-[#1E2E40] transition-colors"
            >
              Commodities ({products.length})
            </button>
            <button
              onClick={() => setQuery('order')}
              className="px-2.5 py-1 rounded-full hover:bg-[#E5E5E1] dark:hover:bg-[#1E2E40] transition-colors"
            >
              Bookings ({bookings.length})
            </button>
          </div>

          {/* Results List */}
          <div ref={listRef} className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1">
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center text-[#8E9299] dark:text-[#64748B] space-y-2">
                <Search className="w-8 h-8 mx-auto opacity-40 text-teal-600" />
                <p className="text-sm font-semibold text-[#111827] dark:text-white">
                  No matching results for "{query}"
                </p>
                <p className="text-xs">Try searching for customer names, commodities, truck orders, or actions.</p>
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === selectedIndex;

                return (
                  <div
                    key={item.id}
                    data-index={idx}
                    onClick={() => item.perform()}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`p-3 sm:p-3.5 rounded-2xl cursor-pointer flex items-center justify-between gap-3 transition-all ${
                      isSelected
                        ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] shadow-sm'
                        : 'hover:bg-[#FAF9F6] dark:hover:bg-[#18283A] text-[#111827] dark:text-[#F1F5F9]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-white/10 dark:bg-black/10 text-teal-400 dark:text-teal-700'
                            : 'bg-[#FAF9F6] dark:bg-[#0D1520] border border-[#E5E5E1] dark:border-[#22354A] text-teal-700 dark:text-teal-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold text-xs sm:text-sm truncate ${
                              isSelected ? 'text-white dark:text-[#111827]' : 'text-[#111827] dark:text-white'
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>
                        {item.subtitle && (
                          <p
                            className={`text-[11px] truncate ${
                              isSelected
                                ? 'text-gray-300 dark:text-gray-600'
                                : 'text-[#8E9299] dark:text-[#94A3B8]'
                            }`}
                          >
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.badge && (
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isSelected
                              ? 'bg-white/20 dark:bg-black/10 text-white dark:text-[#111827]'
                              : item.badgeType === 'warning'
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                              : item.badgeType === 'success'
                              ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300'
                              : item.badgeType === 'info'
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'
                              : 'bg-[#FAF9F6] dark:bg-[#0D1520] text-[#6B7280] dark:text-[#94A3B8] border border-[#E5E5E1] dark:border-[#22354A]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}

                      {isSelected && (
                        <CornerDownLeft className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700 hidden sm:block" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Guide */}
          <div className="p-3 px-5 bg-[#FAF9F6] dark:bg-[#0D1520] border-t border-[#E5E5E1] dark:border-[#22354A] flex items-center justify-between text-[11px] text-[#8E9299] dark:text-[#64748B]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="font-mono bg-white dark:bg-[#111C28] px-1.5 py-0.5 rounded border border-[#E5E5E1] dark:border-[#22354A]">
                  ↑↓
                </span>{' '}
                Navigate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono bg-white dark:bg-[#111C28] px-1.5 py-0.5 rounded border border-[#E5E5E1] dark:border-[#22354A]">
                  ↵
                </span>{' '}
                Select
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono bg-white dark:bg-[#111C28] px-1.5 py-0.5 rounded border border-[#E5E5E1] dark:border-[#22354A]">
                  ESC
                </span>{' '}
                Close
              </span>
            </div>
            <span className="text-[10px] font-mono">Sarmaya Quick Navigation</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
