/**
 * The "Apna Accountant SB" menus, with the names the shop's staff know, mapped onto Sarmaya's screens.
 *
 *  - (the 16 big Home buttons: see navMap.ts CLASSIC_BUTTONS)
 *  - REPORTS_MENU: the old Reports menu (Accounts Reports / Inventory Reports / Pending Delivery).
 *  - BOOKS_MENU: what the "Books" button opens (cash book, bank book, day book, journal book, balances).
 *
 * Some entries belong to screens built separately (vouchers, an any-account ledger, a chart-of-accounts
 * tree, bank accounts, city-wise receivable / payable). They are addressed by the screen ids in
 * PARTNER_SCREENS: once a screen with that id exists (it is listed in ACTIVE_SCREENS in types.ts) the
 * entry opens it; until then it opens the fallback (an Accounts tab or one of our reports).
 */
import { ACTIVE_SCREENS } from '../types';
import type { ReportId } from './classicReports';

/** Screen ids other parts of the app provide (or will provide). */
export const PARTNER_SCREENS = {
  vouchers: 'vouchers',
  accountLedger: 'account-ledger',
  chartOfAccounts: 'chart-of-accounts',
  bankAccounts: 'bank-accounts',
  cityReport: 'city-report',
} as const;

export type AccountsTab = 'tb' | 'gl' | 'journal' | 'coa' | 'pnl' | 'bs' | 'vouchers' | 'ledger' | 'parties' | 'profit' | 'cashflow' | 'assets' | 'staff' | 'budget' | 'centres' | 'year';
export type MoneyTabId = 'overview' | 'expenses' | 'cashbook' | 'cheques' | 'bank';

export type NavTarget =
  | { kind: 'report'; report: ReportId }
  | { kind: 'books' }
  | { kind: 'reports' }
  | { kind: 'screen'; screen: string; fallback: NavTarget }
  | { kind: 'accounts'; tab: AccountsTab }
  | { kind: 'money'; tab: MoneyTabId }
  | { kind: 'items' }
  | { kind: 'newBill' }
  | { kind: 'newPurchase' };

/** True once a screen with this id exists in the app. */
export const screenAvailable = (id: string): boolean => (ACTIVE_SCREENS as readonly string[]).includes(id);

/** The target actually opened: a partner screen that does not exist yet falls back. */
export const resolveTarget = (t: NavTarget): Exclude<NavTarget, { kind: 'screen' }> | { kind: 'screen'; screen: string; fallback: NavTarget } =>
  t.kind === 'screen' && !screenAvailable(t.screen) ? (resolveTarget(t.fallback) as Exclude<NavTarget, { kind: 'screen' }>) : t;

/** The 16 Home buttons now live in the nav map (utils/navMap.ts CLASSIC_BUTTONS), so buttons and menus never drift. */

export interface MenuEntry {
  label: string;
  target: NavTarget;
  /** Keyboard key shown next to it (e.g. F9). */
  key?: string;
}
export interface MenuSubmenu {
  label: string;
  entries: MenuEntry[];
}
export type MenuItem = MenuEntry | MenuSubmenu;
export interface MenuSection {
  label: string;
  items: MenuItem[];
}
export const isSubmenu = (m: MenuItem): m is MenuSubmenu => 'entries' in m;

const r = (label: string, report: ReportId, key?: string): MenuEntry => ({ label, target: { kind: 'report', report }, ...(key ? { key } : {}) });

/** The old program's Reports menu, same order and names. */
export const REPORTS_MENU: MenuSection[] = [
  {
    label: 'Accounts Reports',
    items: [
      { label: 'Chart of Accounts', target: { kind: 'screen', screen: PARTNER_SCREENS.chartOfAccounts, fallback: { kind: 'accounts', tab: 'coa' } } },
      { label: 'Account Ledger', target: { kind: 'screen', screen: PARTNER_SCREENS.accountLedger, fallback: { kind: 'accounts', tab: 'ledger' } } },
      { label: 'Accounts Reconciliation', target: { kind: 'money', tab: 'bank' } },
      r('Cash Book', 'cash-book', 'F9'),
      r('Day Book', 'day-book'),
      r('Journal Book', 'journal-book'),
      r('Trial Balance', 'trial-balance'),
      r('Trial Balance Between Dates', 'trial-balance-period'),
      r('Book Balances', 'book-balances'),
      r('Receivable And Payable', 'receivable-payable'),
      { label: 'Receivable And Payable CityWise', target: { kind: 'screen', screen: PARTNER_SCREENS.cityReport, fallback: { kind: 'accounts', tab: 'parties' } } },
      r('Receivable', 'receivables'),
      r('Payable', 'payables'),
      r('Profit And Loss', 'profit-loss'),
      r('Profit and Loss Between Dates', 'profit-loss-period'),
      r('Balance Sheet', 'balance-sheet'),
      r('Balance Sheet Between Dates', 'balance-sheet-period'),
      { label: 'Vouchers Printing', target: { kind: 'screen', screen: PARTNER_SCREENS.vouchers, fallback: { kind: 'accounts', tab: 'vouchers' } } },
    ],
  },
  {
    label: 'Inventory Reports',
    items: [
      r('Daily Gross Profit', 'daily-gross-profit'),
      { label: 'Party Reports', entries: [r('Party-wise Sale', 'party-sales'), r('Party-wise Purchase', 'party-purchases'), r('Party Outstanding', 'party-outstanding')] },
      { label: 'Product Reports', entries: [r('Daily Sale', 'daily-sale'), r('Daily Purchase', 'daily-purchase'), r('Product-wise Sale', 'product-sales'), r('Product-wise Purchase', 'product-purchases'), r('Product List / Rate List', 'rate-list')] },
      { label: 'Stock Reports', entries: [r('Stock In Hand', 'stock-in-hand'), r('Stock Ledger', 'stock-ledger'), r('Godown-wise Stock', 'godown-stock'), r('Stock Value', 'stock-value'), r('Low Stock', 'low-stock')] },
    ],
  },
  {
    label: 'Pending Delivery',
    items: [r('Pending Delivery List Report', 'pending-delivery')],
  },
];

/** "Books": the cash book / day book hub. */
export const BOOKS_MENU: MenuEntry[] = [
  r('Cash Book', 'cash-book', 'F9'),
  r('Bank Book', 'bank-book'),
  r('Day Book', 'day-book'),
  r('Journal Book', 'journal-book'),
  r('Book Balances', 'book-balances'),
];

/** Every report entry of the menus, flat (for search and tests). */
export const allMenuEntries = (): MenuEntry[] => [
  ...REPORTS_MENU.flatMap((s) => s.items.flatMap((i) => (isSubmenu(i) ? i.entries : [i]))),
  ...BOOKS_MENU,
];
