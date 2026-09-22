import React from 'react';
import {
  Tag,
  FilePlus2,
  PackagePlus,
  ListOrdered,
  TrendingUp,
  ShoppingCart,
  Truck,
  Boxes,
  ListTree,
  BookOpen,
  Landmark,
  Library,
  ScrollText,
  Scale,
  BarChart3,
  Building2,
} from 'lucide-react';
import { useTrading } from '../../../context/TradingContext';
import { useBillingUI } from '../BillingUI';
import { ActiveScreen } from '../../../types';
import { CLASSIC_BUTTONS, NavTarget, resolveTarget } from '../../../utils/classicMenu';
import { cardCls } from '../ui';

type Icon = React.FC<{ className?: string }>;
const ICONS: Record<string, { icon: Icon; tint: string }> = {
  'product-coding': { icon: Tag, tint: 'text-amber-600 dark:text-amber-300' },
  'sale-invoice': { icon: FilePlus2, tint: 'text-teal-700 dark:text-teal-300' },
  'purchase-invoice': { icon: PackagePlus, tint: 'text-indigo-600 dark:text-indigo-300' },
  'product-list': { icon: ListOrdered, tint: 'text-amber-600 dark:text-amber-300' },
  'daily-gross-profit': { icon: TrendingUp, tint: 'text-emerald-600 dark:text-emerald-300' },
  'daily-sale': { icon: ShoppingCart, tint: 'text-teal-700 dark:text-teal-300' },
  'daily-purchase': { icon: Truck, tint: 'text-indigo-600 dark:text-indigo-300' },
  'stock-in-hand': { icon: Boxes, tint: 'text-amber-600 dark:text-amber-300' },
  'accounts-coding': { icon: ListTree, tint: 'text-violet-600 dark:text-violet-300' },
  'account-ledger': { icon: BookOpen, tint: 'text-violet-600 dark:text-violet-300' },
  'cheque-deposits': { icon: Landmark, tint: 'text-sky-600 dark:text-sky-300' },
  books: { icon: Library, tint: 'text-sky-600 dark:text-sky-300' },
  vouchers: { icon: ScrollText, tint: 'text-violet-600 dark:text-violet-300' },
  'trial-balances': { icon: Scale, tint: 'text-rose-600 dark:text-rose-300' },
  'profit-loss': { icon: BarChart3, tint: 'text-emerald-600 dark:text-emerald-300' },
  'balance-sheet': { icon: Building2, tint: 'text-rose-600 dark:text-rose-300' },
};

/** Open whatever a classic menu entry points at (a partner screen that does not exist yet opens its fallback). */
export const useClassicNav = () => {
  const { setActiveScreen } = useTrading();
  const ui = useBillingUI();
  return (target: NavTarget) => {
    const t = resolveTarget(target);
    switch (t.kind) {
      case 'report':
        ui.openReport(t.report);
        break;
      case 'books':
        ui.openReport('books');
        break;
      case 'reports':
        ui.openReport('menu');
        break;
      case 'screen':
        setActiveScreen(t.screen as ActiveScreen);
        break;
      case 'accounts':
        ui.openAccountsTab(t.tab);
        setActiveScreen('accounts');
        break;
      case 'money':
        ui.openMoneyTab(t.tab);
        setActiveScreen('money');
        break;
      case 'items':
        setActiveScreen('products');
        break;
      case 'newBill':
        ui.newBill();
        return;
      case 'newPurchase':
        ui.newPurchaseInvoice();
        return;
    }
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* not in a browser */
    }
  };
};

/**
 * The 16 big buttons of Apna Accountant's home screen, same names, opening our screens.
 * `compact` is the phone grid under "More"; the default is the desktop panel on Home.
 */
export const ClassicMenu: React.FC<{ compact?: boolean; onPicked?: () => void }> = ({ compact, onPicked }) => {
  const go = useClassicNav();
  if (compact) {
    return (
      <div className="grid grid-cols-4 gap-1.5" data-testid="classic-menu-compact" role="group" aria-label="Classic menu">
        {CLASSIC_BUTTONS.map((b) => {
          const { icon: I, tint } = ICONS[b.id];
          return (
            <button key={b.id} type="button" title={b.hint} onClick={() => { onPicked?.(); go(b.target); }} className="min-h-16 flex flex-col items-center justify-center gap-1 px-1 py-1.5 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#162436] text-[10.5px] font-bold leading-tight text-center text-[#111827] dark:text-white hover:border-teal-500/50">
              <I className={`w-4 h-4 ${tint}`} />
              <span>{b.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <section className={`${cardCls} p-4 sm:p-5`} data-testid="classic-menu" aria-label="Classic menu">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-bold text-[#111827] dark:text-white">Classic menu</h2>
        <span className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">Same buttons as Apna Accountant • F2 sale invoice • F9 cash book</span>
      </div>
      <div className="grid grid-cols-4 xl:grid-cols-8 gap-2">
        {CLASSIC_BUTTONS.map((b) => {
          const { icon: I, tint } = ICONS[b.id];
          return (
            <button key={b.id} type="button" title={b.hint} onClick={() => go(b.target)} className="min-h-20 flex flex-col items-center justify-center gap-1.5 px-2 py-2 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#162436] text-xs font-bold leading-tight text-center text-[#111827] dark:text-white hover:border-teal-500/60 hover:shadow-sm transition">
              <I className={`w-5 h-5 ${tint}`} />
              <span>{b.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
