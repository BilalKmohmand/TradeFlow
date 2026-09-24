/**
 * The navigation map (utils/navMap.ts): every option opens something that exists, respects permissions,
 * search finds options by our names, the old program's names and shopkeepers' Urdu words, and nothing the
 * app or Apna Accountant SB has is missing from the five menus.
 */
import { describe, it, expect } from 'vitest';
import { ACTIVE_SCREENS, ActiveScreen, Permission } from '../types';
import {
  NAV_ENTRIES,
  NAV_GROUPS,
  NAV_ACTIONS,
  CLASSIC_BUTTONS,
  classicEntry,
  columnsOf,
  entryAllowed,
  navGroupsFor,
  normalize,
  searchNav,
  breadcrumbFor,
  targetKey,
  NavEntry,
  navCheck,
  ACCOUNTS_TAB_LABEL,
  MONEY_TAB_LABEL,
  ADMIN_TAB_LABEL,
  SUPPLIER_TAB_LABEL,
  BILLS_TAB_LABEL,
  CODING_TAB_LABEL,
} from '../utils/navMap';
import { REPORTS, ReportId } from '../utils/classicReports';
import { REPORTS_MENU, BOOKS_MENU, isSubmenu } from '../utils/classicMenu';
import { ACCOUNTS_TABS, ACCOUNTS_TAB_NAMES } from '../screens/billing/AccountsScreen';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MONEY_TABS, MONEY_VIEWS } from '../screens/billing/MoneyScreen';
import { ADMIN_TABS } from '../screens/AdminScreen';
import { SUPPLIER_TABS, SUPPLIER_VIEWS } from '../screens/billing/SuppliersBillingScreen';
import { BILLS_TABS } from '../screens/billing/BillsScreen';
import { CODING_TABS, CODING_TAB_NAMES } from '../screens/billing/CodingScreen';

/** Views each screen understands (tabs, and dialogs it opens on request). */
const VIEWS: Partial<Record<ActiveScreen, readonly string[]>> = {
  accounts: ACCOUNTS_TABS,
  money: MONEY_VIEWS,
  admin: ADMIN_TABS,
  suppliers: SUPPLIER_VIEWS,
  bills: BILLS_TABS,
  customers: ['add', 'cities', 'city'],
  products: ['godowns', 'move'],
  coding: CODING_TABS,
};

/** Cards a menu can scroll to (data-nav-anchor in the screens), by screen and view. */
const ANCHORS: Record<string, string[]> = {
  'admin:system': ['company', 'bill-settings', 'reminders', 'backups', 'auto-backups', 'exports', 'sign-in'],
  'admin:controls': ['approval-rules', 'doc-numbers', 'branches'],
  'money:overview': ['bank-accounts'],
  'money:opening': ['opening'],
  'accounts:coa': ['period-lock'],
};

const all = (): Permission[] => [];
const everyone = { can: () => true };
const nobody = { can: () => false };
const only = (...perms: Permission[]) => ({ can: (p: Permission) => perms.includes(p) });

describe('nav map: structure', () => {
  it('has the old program’s five menus in order, each with its Alt letter', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['Coding', 'Invoice', 'Accounts', 'Reports', 'System']);
    expect(NAV_GROUPS.map((g) => g.key)).toEqual(['C', 'I', 'A', 'R', 'S']);
    NAV_GROUPS.forEach((g) => expect(g.sections.every((s) => s.entries.length > 0), g.label).toBe(true));
    void all;
  });

  it('entry ids are unique and every entry has a label, hint and keywords', () => {
    const ids = NAV_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    NAV_ENTRIES.forEach((e) => {
      expect(e.label.trim(), e.id).not.toBe('');
      expect(e.hint.trim(), e.id).not.toBe('');
      expect(Array.isArray(e.keywords), e.id).toBe(true);
    });
  });

  it('every entry opens a screen / tab / dialog / card / report / action that exists', () => {
    NAV_ENTRIES.forEach((e) => {
      const t = e.target;
      if (t.kind === 'report') {
        if (t.report !== 'books' && t.report !== 'menu') expect(REPORTS[t.report as ReportId], e.id).toBeTruthy();
      } else if (t.kind === 'action') {
        expect(NAV_ACTIONS, e.id).toContain(t.action);
      } else {
        expect(ACTIVE_SCREENS as readonly string[], e.id).toContain(t.screen);
        if (t.view) expect(VIEWS[t.screen], `${e.id}: ${t.screen} has no view list`).toBeTruthy();
        if (t.view) expect(VIEWS[t.screen], e.id).toContain(t.view);
        if (t.anchor) expect(ANCHORS[`${t.screen}:${t.view}`] || [], e.id).toContain(t.anchor);
        if (t.sub) {
          if (t.view === 'vouchers') expect(t.sub, e.id).toMatch(/^new:(CPV|CRV|BPV|BRV|JV)$/);
          else expect(`${t.view}:${t.sub}`, e.id).toBe('journal:new');
        }
      }
    });
  });

  it('the Reports group is the Reports hub’s own menu (same sections, same entries, same order)', () => {
    const reports = NAV_GROUPS.find((g) => g.id === 'reports')!;
    const hubSections = REPORTS_MENU.map((s) => s.label);
    expect(reports.sections.map((s) => s.label).slice(1)).toEqual(hubSections);
    REPORTS_MENU.forEach((sec) => {
      const labels = sec.items.flatMap((it) => (isSubmenu(it) ? it.entries.map((x) => x.label) : [it.label]));
      expect(reports.sections.find((s) => s.label === sec.label)!.entries.map((e) => e.label)).toEqual(labels);
    });
    // The Books menu of the hub is under Accounts › Ledgers & books.
    const books = NAV_ENTRIES.filter((e) => e.group === 'accounts' && e.section === 'Ledgers & books' && e.target.kind === 'report');
    BOOKS_MENU.filter((b) => b.target.kind === 'report').forEach((b) => {
      const id = (b.target as { report: string }).report;
      expect(NAV_ENTRIES.some((e) => e.target.kind === 'report' && e.target.report === id), b.label).toBe(true);
    });
    expect(books.map((e) => e.label)).toEqual(expect.arrayContaining(['Books', 'Cash book', 'Bank book', 'Day book', 'Journal book']));
  });

  it('the 16 classic Home buttons are nav entries, with the old names', () => {
    expect(CLASSIC_BUTTONS).toHaveLength(16);
    CLASSIC_BUTTONS.forEach((b) => {
      const e = classicEntry(b);
      expect(e, b.label).toBeTruthy();
      const names = [e.label, ...(e.aka || [])].map(normalize);
      expect(names.some((n) => n.includes(normalize(b.label)) || normalize(b.label).includes(n)), `${b.label} ↔ ${e.label}`).toBe(true);
    });
  });

  it('columns of a dropdown keep every entry once, in order', () => {
    NAV_GROUPS.forEach((g) => {
      const cols = columnsOf(g.sections, g.cols);
      expect(cols.length).toBeLessThanOrEqual(g.cols);
      expect(cols.flat().flatMap((s) => s.entries.map((e) => e.id))).toEqual(g.sections.flatMap((s) => s.entries.map((e) => e.id)));
    });
  });
});

describe('nav map: permissions', () => {
  it('an owner with every permission sees every entry; nobody sees only the open ones', () => {
    expect(navGroupsFor(everyone).flatMap((g) => g.sections.flatMap((s) => s.entries))).toHaveLength(NAV_ENTRIES.length);
    const open = navGroupsFor(nobody).flatMap((g) => g.sections.flatMap((s) => s.entries));
    open.forEach((e) => {
      expect(e.perm, e.id).toBeUndefined();
      expect(e.anyPerm, e.id).toBeUndefined();
    });
    // Nothing that makes or changes data is open to a role without rights (a viewer).
    expect(open.map((e) => e.id)).toEqual(expect.arrayContaining(['customers', 'items', 'rep-daily-sale']));
    expect(open.map((e) => e.id)).not.toContain('new-bill');
  });

  it('books, vouchers and Accounts tabs need finance access; System needs the admin screen', () => {
    const op = only('finance:record_payment', 'reports:view', 'products:create', 'data:write');
    const ids = (a: { can: (p: Permission) => boolean }) => new Set(NAV_ENTRIES.filter((e) => entryAllowed(e, a)).map((e) => e.id));
    const seen = ids(op);
    ['vouchers', 'cpv', 'account-ledger', 'chart-of-accounts', 'rep-trial-balance', 'rep-cash-book', 'bank-rec', 'profit-by-item', 'users', 'backups', 'owner'].forEach((id) => expect(seen.has(id), id).toBe(false));
    ['new-bill', 'receive', 'receive-many', 'new-purchase-invoice', 'rep-daily-sale', 'recovery', 'cheques'].forEach((id) => expect(seen.has(id), id).toBe(true));
    const acct = ids(only('view_finance', 'finance:record_payment'));
    expect(acct.has('cpv')).toBe(true);
    expect(acct.has('jv')).toBe(false); // JV needs finance:view_pnl
    expect(ids(only('system:admin_screen', 'users:view')).has('users')).toBe(true);
    expect(ids(only('system:admin_screen')).has('backups')).toBe(false);
    // A screen an admin hid (Admin → Visibility) drops its options.
    const hidden = new Set(NAV_ENTRIES.filter((e) => entryAllowed(e, { can: () => true, isScreenVisible: (s) => s !== 'money' })).map((e) => e.id));
    expect(hidden.has('cheques')).toBe(false);
    expect(hidden.has('vouchers')).toBe(true);
  });
});

describe('nav map: search', () => {
  const top = (q: string, n = 6) => searchNav(q, everyone, n).map((e) => e.id);

  it('"udhaar" finds receivables and aging', () => {
    const r = top('udhaar', 8);
    expect(r).toEqual(expect.arrayContaining(['rep-receivables', 'aging-customers']));
    expect(top('udhar', 8)).toEqual(expect.arrayContaining(['rep-receivables', 'aging-customers']));
  });
  it('"CPV" is the cash payment voucher first', () => {
    expect(top('CPV')[0]).toBe('cpv');
    expect(top('cpv')[0]).toBe('cpv');
  });
  it('"ledger" is the account ledger first', () => {
    expect(top('ledger')[0]).toBe('account-ledger');
    expect(top('khata')).toContain('account-ledger');
  });
  it('old program names, Urdu words and F-keys find the right option', () => {
    expect(top('Product Coding')[0]).toBe('items');
    expect(top('Accounts Coding')[0]).toBe('chart-of-accounts');
    expect(top('Cheque Deposits Bank')[0]).toBe('cheques');
    expect(top('Trial Balances')[0]).toBe('rep-trial-balance');
    expect(top('parchi')).toContain('new-bill');
    expect(top('kharcha')).toContain('add-expense');
    expect(top('maal')).toContain('rep-stock-in-hand');
    expect(top('rozana')).toContain('daily-sheet');
    expect(top('wasooli')).toContain('receive');
    expect(top('rokar')).toContain('rep-cash-book');
    expect(top('godam')).toContain('godowns');
    expect(top('backup')[0]).toBe('backups');
    expect(top('password')[0]).toBe('users');
  });
  it('the same place reached two ways is listed once, and hidden options are not found', () => {
    const r = searchNav('cash book', everyone, 20);
    expect(new Set(r.map((e) => targetKey(e.target))).size).toBe(r.length);
    expect(searchNav('vouchers', nobody).map((e) => e.id)).not.toContain('vouchers');
    expect(searchNav('zzzz-nothing', everyone)).toEqual([]);
  });
  it('normalises Roman Urdu spellings', () => {
    expect(normalize('Udhaar')).toBe(normalize('udhar'));
    expect(normalize('Wasooli')).toBe(normalize('wasoli'));
    expect(normalize('Profit & Loss')).toBe('profit and los');
  });
});

describe('nav map: breadcrumb', () => {
  it('names where a screen lives', () => {
    const c = (s: ActiveScreen, v: string | null) => { const b = breadcrumbFor(s, v); return b.group ? `${b.group.label} › ${b.label}` : b.label; };
    expect(c('accounts', 'vouchers')).toBe('Accounts › Vouchers');
    expect(c('accounts', 'coa')).toBe('Coding › Accounts Coding New');
    expect(c('money', 'cheques')).toBe('Accounts › Cheques');
    expect(c('admin', 'users')).toBe('System › Users & passwords');
    expect(c('reports-hub', 'trial-balance')).toBe('Reports › Trial Balance');
    expect(c('reports-hub', 'menu')).toBe('Reports › All reports');
    expect(c('reports-hub', 'books')).toBe('Accounts › Books');
    expect(c('bills', 'quotes')).toBe('Invoice › Quotations');
    expect(c('products', null)).toBe('Coding › Product Coding');
    expect(c('coding', 'opening-stock')).toBe('Coding › Opening Stocks');
    expect(c('coding', 'opening-balances')).toBe('Coding › Accounts Opening Balances');
    expect(c('dashboard', null)).toBe('Home');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Coverage: nothing of ours and nothing of Apna Accountant SB may be missing from the menus.
// ---------------------------------------------------------------------------------------------------------
const namesIn = (group?: string) => {
  const entries = NAV_ENTRIES.filter((e) => !group || e.group === group);
  const set = new Set<string>();
  entries.forEach((e) => [e.label, ...(e.aka || []), e.section, e.sub || ''].forEach((n) => n && set.add(normalize(n))));
  return set;
};
const hasName = (name: string, group?: string) => {
  const n = normalize(name);
  return [...namesIn(group)].some((x) => x === n || x.startsWith(`${n} `) || x.includes(n));
};

/** Apna Accountant SB, everything by the names the staff know. [name, the menu it must be under] */
const OLD_PROGRAM: [string, string][] = [
  // The 16 Home buttons
  ['Product Coding', 'coding'], ['Sale Invoice', 'invoice'], ['Purchase Invoice', 'invoice'], ['Product List', 'reports'],
  ['Daily Gross Profit', 'reports'], ['Daily Sale', 'reports'], ['Daily Purchase', 'reports'], ['Stock In Hand', 'reports'],
  ['Accounts Coding', 'coding'], ['Account Ledger', 'accounts'], ['Cheque Deposits Bank', 'accounts'], ['Books', 'accounts'],
  ['Vouchers', 'accounts'], ['Trial Balances', 'reports'], ['Profit & Loss', 'reports'], ['Balance Sheet', 'reports'],
  // Reports › Accounts Reports
  ['Chart of Accounts', 'reports'], ['Account Ledger', 'reports'], ['Accounts Reconciliation', 'reports'], ['Cash Book', 'reports'],
  ['Day Book', 'reports'], ['Journal Book', 'reports'], ['Trial Balance', 'reports'], ['Trial Balance Between Dates', 'reports'],
  ['Book Balances', 'reports'], ['Receivable And Payable', 'reports'], ['Receivable And Payable CityWise', 'reports'],
  ['Receivable', 'reports'], ['Payable', 'reports'], ['Profit And Loss', 'reports'], ['Profit and Loss Between Dates', 'reports'],
  ['Balance Sheet Between Dates', 'reports'], ['Vouchers Printing', 'reports'],
  // Reports › Inventory Reports
  ['Inventory Reports', 'reports'], ['Party Reports', 'reports'], ['Product Reports', 'reports'], ['Stock Reports', 'reports'],
  // Reports › Pending Delivery
  ['Pending Delivery List', 'reports'],
  // The Coding menu
  ['Accounts Coding New', 'coding'], ['Accounts Opening Balances', 'coding'], ['Product Unit Coding', 'coding'], ['Store Coding', 'coding'],
  ['Product Group Coding', 'coding'], ['Manufacturer Coding', 'coding'], ['Opening Stocks', 'coding'], ['User Coding', 'coding'], ['City Coding', 'coding'],
];

/** Screens that are deliberately not a menu option, and why. */
const SCREEN_IGNORE: Partial<Record<ActiveScreen, string>> = {
  dashboard: 'Home: the logo, the sidebar and the bottom bar open it; the breadcrumb shows "Home"',
  bookings: 'Full trading suite only (billing mode sends it to Home); reached by System › Full trading suite',
  billing: 'Legacy trading-suite billing screen; billing mode redirects it to Home',
  reports: 'Trading-suite reports; billing mode redirects to Home (billing uses the Reports hub)',
  ops: 'Trading-suite operations; billing mode redirects to Home',
};

describe('nav map: coverage', () => {
  it.each(OLD_PROGRAM)('Apna Accountant’s “%s” is in the %s menu', (name, group) => {
    expect(hasName(name, group), `${name} missing from ${group}`).toBe(true);
  });

  it('every screen of the app has an entry (or a justified ignore)', () => {
    const missing = (ACTIVE_SCREENS as readonly ActiveScreen[]).filter((s) => {
      if (SCREEN_IGNORE[s]) return false;
      return !NAV_ENTRIES.some((e) => (e.target.kind === 'screen' && e.target.screen === s) || (s === 'reports-hub' && e.target.kind === 'report'));
    });
    expect(missing).toEqual([]);
    Object.keys(SCREEN_IGNORE).forEach((s) => expect(ACTIVE_SCREENS as readonly string[]).toContain(s));
  });

  const tabCovered = (screen: ActiveScreen, tab: string) => NAV_ENTRIES.some((e) => e.target.kind === 'screen' && e.target.screen === screen && e.target.view === tab);
  it.each([...ACCOUNTS_TABS])('Accounts tab “%s” has an entry', (tab) => expect(tabCovered('accounts', tab)).toBe(true));
  it.each([...MONEY_TABS])('Money tab “%s” has an entry', (tab) => expect(tabCovered('money', tab)).toBe(true));
  it.each([...ADMIN_TABS])('Admin tab “%s” has an entry', (tab) => expect(tabCovered('admin', tab)).toBe(true));
  it.each([...SUPPLIER_TABS])('Suppliers tab “%s” has an entry', (tab) => expect(tabCovered('suppliers', tab)).toBe(true));
  it.each([...BILLS_TABS])('Bills tab “%s” has an entry', (tab) => expect(tabCovered('bills', tab)).toBe(true));
  it.each([...CODING_TABS])('Coding tab “%s” has an entry', (tab) => expect(tabCovered('coding', tab)).toBe(true));

  it('the Coding menu starts with Apna Accountant’s Coding menu, exactly and in order', () => {
    const coding = NAV_GROUPS.find((g) => g.id === 'coding')!;
    expect(coding.sections[0].label).toBe('Coding');
    expect(coding.sections[0].entries.map((e) => e.label)).toEqual([
      'Accounts Coding New', 'Accounts Opening Balances', 'Product Unit Coding', 'Store Coding', 'Product Group Coding',
      'Product Coding', 'Manufacturer Coding', 'Opening Stocks', 'User Coding', 'City Coding',
    ]);
    // Each opens a working screen: its own Coding tab, or the existing screen / dialog.
    const where = Object.fromEntries(coding.sections[0].entries.map((e) => [e.label, targetKey(e.target)]));
    expect(where).toEqual({
      'Accounts Coding New': 's:accounts:coa::', 'Accounts Opening Balances': 's:coding:opening-balances::', 'Product Unit Coding': 's:coding:units::',
      'Store Coding': 's:products:godowns::', 'Product Group Coding': 's:coding:groups::', 'Product Coding': 's:products:::', 'Manufacturer Coding': 's:coding:manufacturers::',
      'Opening Stocks': 's:coding:opening-stock::', 'User Coding': 's:admin:users::', 'City Coding': 's:customers:cities::',
    });
  });

  it('every report of the Reports hub, and every dialog action, is reachable', () => {
    (Object.keys(REPORTS) as ReportId[]).forEach((id) => expect(NAV_ENTRIES.some((e) => e.target.kind === 'report' && e.target.report === id), id).toBe(true));
    NAV_ACTIONS.forEach((a) => expect(NAV_ENTRIES.some((e) => e.target.kind === 'action' && e.target.action === a), a).toBe(true));
  });

  it('the spec’d options are all there, in their menus', () => {
    const want: Record<string, string[]> = {
      coding: ['Product Coding', 'Customers', 'Suppliers', 'Accounts Coding New', 'Bank accounts', 'City Coding', 'Salesmen & areas', 'Store Coding', 'Schemes (free goods)', 'Opening cash & bank'],
      invoice: ['Sale invoice (new bill)', 'Bills list', 'Purchase invoice', 'Purchase invoices list', 'Sale returns (credit notes)', 'Purchase return (debit note)', 'Quotations', 'Delivery orders (pending)', 'Purchase orders', 'Receive stock', 'Adjust stock', 'Move stock'],
      accounts: ['Vouchers', 'CPV — Cash payment voucher', 'CRV — Cash receipt voucher', 'BPV — Bank payment voucher', 'BRV — Bank receipt voucher', 'JV — Journal voucher', 'Receive payment', 'Receive from many', 'Pay supplier', 'Add expense', 'Cash ↔ Bank', 'Cheques', 'Bank reconciliation', 'Account ledger', 'Books', 'Cash book', 'Bank book', 'Day book', 'Journal book', 'Daily sheet'],
      reports: ['Owner dashboard', 'Who owes for how long (aging)', 'Profit by item & customer', 'Recovery list'],
      system: ['Shop details', 'Bill settings', 'Users & passwords', 'Roles & permissions', 'Document numbers', 'Approval rules', 'Approvals inbox', 'Branches', 'Backup & restore', 'Automatic backups', 'Data import', 'Deleted records', 'Audit log', 'Year end', 'Full trading suite'],
    };
    Object.entries(want).forEach(([g, labels]) => {
      const have = NAV_ENTRIES.filter((e) => e.group === g).map((e) => e.label);
      expect(have, g).toEqual(expect.arrayContaining(labels));
    });
  });
});

describe('nav map: what each option shows', () => {
  it('every entry says what must be visible once it opens', () => {
    NAV_ENTRIES.forEach((e) => {
      const c = navCheck(e);
      expect(Boolean(c.heading || c.dialog || c.tab || c.pressed || c.anchor || c.special), e.id).toBe(true);
      Object.values(c).forEach((v) => expect(v, e.id).toBeTruthy());
    });
  });
  it('tab names in the map are the screens’ real tab names', () => {
    expect(ACCOUNTS_TAB_LABEL).toEqual(ACCOUNTS_TAB_NAMES);
    expect(CODING_TAB_LABEL).toEqual(CODING_TAB_NAMES);
    const src = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf8');
    const money = src('screens/billing/MoneyScreen.tsx');
    Object.entries(MONEY_TAB_LABEL).forEach(([id, l]) => expect(money, id).toContain(`tabBtn('${id}', '${l}')`));
    const admin = src('screens/AdminScreen.tsx');
    Object.entries(ADMIN_TAB_LABEL).forEach(([id, l]) => expect(admin, id).toMatch(new RegExp(`id: '${id}',\\s*label: '${l.replace(/[&]/g, '&')}'`)));
    const sup = src('screens/billing/SuppliersBillingScreen.tsx');
    Object.entries(SUPPLIER_TAB_LABEL).forEach(([id, l]) => expect(sup, id).toMatch(new RegExp(`tabBtn\\('${id}', \`?'?${l}`)));
    const bills = src('screens/billing/BillsScreen.tsx');
    Object.entries(BILLS_TAB_LABEL).forEach(([id, l]) => expect(bills, id).toMatch(new RegExp(`\\['${id}', \`?'?${l}`)));
  });
});

// Handy when reviewing: the whole map as text (not an assertion).
export const navMapAsText = (): string =>
  NAV_GROUPS.map((g) => `${g.label}\n${g.sections.map((s) => `  ${s.label}\n${s.entries.map((e: NavEntry) => `    ${e.sub ? `${e.sub} › ` : ''}${e.label}${e.aka?.length ? ` (${e.aka.join(', ')})` : ''}`).join('\n')}`).join('\n')}`).join('\n');
