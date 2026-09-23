import { useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../billing/BillingUI';
import { useStockUI } from '../billing/StockUI';
import { usePurchasingUI } from '../billing/purchasing/PurchasingUI';
import type { AccountsTab } from '../../utils/classicMenu';
import { NavAccess, NavGroupId, NavTarget, navGroupsFor, targetAllowed } from '../../utils/navMap';

/** Ask the desktop menu bar (or, on a phone, the More sheet) to open a group. */
export const OPEN_MENU_EVENT = 'sarmaya:open-menu';
export const openMenu = (group: NavGroupId) => {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_MENU_EVENT, { detail: group }));
  } catch {
    /* not in a browser */
  }
};

/** Scroll to a card marked data-nav-anchor once the screen has rendered it (screens animate in), then flash it. */
export const scrollToAnchor = (anchor: string) => {
  if (typeof document === 'undefined') return;
  const started = Date.now();
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-nav-anchor="${anchor}"]`);
    if (!el) {
      if (Date.now() - started < 2500) setTimeout(tick, 60);
      return;
    }
    el.style.scrollMarginTop = 'calc(var(--header-h, 4rem) + 16px)';
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      el.scrollIntoView();
    }
    el.setAttribute('data-nav-flash', '');
    setTimeout(() => el.removeAttribute('data-nav-flash'), 1600);
  };
  setTimeout(tick, 60);
};

const scrollTop = () => {
  try {
    window.scrollTo({ top: 0 });
  } catch {
    /* not in a browser */
  }
};

/** What the signed-in user may open (for navGroupsFor / searchNav / entryAllowed). */
export const useNavAccess = (): NavAccess => {
  const { can, isScreenVisible } = useTrading();
  return useMemo(() => ({ can, isScreenVisible }), [can, isScreenVisible]);
};

/** The five menus for this user. */
export const useNavGroups = () => {
  const access = useNavAccess();
  return useMemo(() => navGroupsFor(access), [access]);
};

/** Open whatever a nav-map entry points at: a screen (and tab / dialog / card on it), a report, or a dialog. */
export const useNavGo = () => {
  const t = useTrading();
  const ui = useBillingUI();
  const stock = useStockUI();
  const buy = usePurchasingUI();
  return (target: NavTarget) => {
    // Whatever opens it (menu, Find anything, classic button, breadcrumb), a role never gets what it may not use.
    if (!targetAllowed(target, { can: t.can })) return;
    switch (target.kind) {
      case 'report':
        ui.openReport(target.report);
        scrollTop();
        return;
      case 'screen': {
        const { screen, view, sub, anchor } = target;
        if (screen === 'reports-hub') {
          ui.openReport('menu');
        } else {
          if (screen === 'accounts' && view) ui.openAccountsTab(view as AccountsTab, sub);
          else if (view) ui.requestView(screen, view);
          t.setActiveScreen(screen);
        }
        if (anchor) scrollToAnchor(anchor);
        else scrollTop();
        return;
      }
      case 'action':
        switch (target.action) {
          case 'newBill': return ui.newBill();
          case 'newQuote': return ui.newQuote();
          case 'newPurchaseInvoice': return ui.newPurchaseInvoice();
          case 'receive': return ui.receive();
          case 'receiveMany': return ui.salesExtras('receive_many');
          case 'paySupplier': return ui.paySupplier();
          case 'addExpense': return ui.addExpense();
          case 'transfer': return ui.transfer();
          case 'interest': return ui.salesExtras('interest');
          case 'newItem': return ui.newItem();
          case 'receiveStock': return stock.receiveStock();
          case 'adjustStock': return stock.adjustStock();
          case 'purchaseReturn': return stock.purchaseReturn();
          case 'newOrder': return buy.newOrder();
          case 'reorder': return buy.reorder();
          case 'labels': return buy.labels();
          case 'agingCustomers': return stock.aging('customers');
          case 'agingSuppliers': return stock.aging('suppliers');
          case 'salesHub': return ui.salesExtras('hub');
          case 'salesTeam': return ui.salesExtras('team');
          case 'schemes': return ui.salesExtras('schemes');
          case 'salesReport': return ui.salesExtras('sales');
          case 'recovery': return ui.salesExtras('recovery');
          case 'commission': return ui.salesExtras('commission');
          case 'tradingSuite':
            t.updateSettings({ appMode: 'trading' });
            t.setActiveScreen('dashboard');
            return;
          case 'lock': return t.lockScreen();
        }
    }
  };
};
