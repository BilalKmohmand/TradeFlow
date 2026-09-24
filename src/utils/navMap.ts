/**
 * THE navigation map: every option of Sarmaya, grouped the way Apna Accountant SB grouped its five top
 * menus (Coding · Invoice · Accounts · Reports · System). One source of truth for
 *
 *  - the desktop top menu bar (components/nav/MenuBar.tsx),
 *  - "Find anything" search (Ctrl+K, "/", and the search box of the phone's More sheet),
 *  - the phone More sheet's five collapsible groups,
 *  - the 16 classic Home buttons (CLASSIC_BUTTONS below),
 *  - the breadcrumb every screen shows ("Accounts › Vouchers").
 *
 * The Reports group is built from the Reports hub's own menu (REPORTS_MENU in classicMenu.ts), so the two
 * can never differ. Pure data + pure functions only: opening a target is components/nav/useNavGo.ts.
 */
import type { ActiveScreen, Permission } from '../types';
import { REPORTS_MENU, isSubmenu, resolveTarget as resolveClassic, NavTarget as ClassicTarget } from './classicMenu';
import { REPORTS, ReportId } from './classicReports';

export type NavGroupId = 'coding' | 'invoice' | 'accounts' | 'reports' | 'system';

/** Dialogs / actions that are not a screen of their own. */
export type NavAction =
  | 'newBill'
  | 'newCashSale'
  | 'newQuote'
  | 'newPurchaseInvoice'
  | 'receive'
  | 'receiveMany'
  | 'paySupplier'
  | 'addExpense'
  | 'transfer'
  | 'interest'
  | 'newItem'
  | 'receiveStock'
  | 'adjustStock'
  | 'purchaseReturn'
  | 'newOrder'
  | 'reorder'
  | 'labels'
  | 'agingCustomers'
  | 'agingSuppliers'
  | 'salesHub'
  | 'salesTeam'
  | 'schemes'
  | 'salesReport'
  | 'recovery'
  | 'commission'
  | 'tradingSuite'
  | 'lock';

export const NAV_ACTIONS: readonly NavAction[] = [
  'newBill', 'newCashSale', 'newQuote', 'newPurchaseInvoice', 'receive', 'receiveMany', 'paySupplier', 'addExpense', 'transfer', 'interest',
  'newItem', 'receiveStock', 'adjustStock', 'purchaseReturn', 'newOrder', 'reorder', 'labels', 'agingCustomers', 'agingSuppliers',
  'salesHub', 'salesTeam', 'schemes', 'salesReport', 'recovery', 'commission', 'tradingSuite', 'lock',
];

/**
 * Where an option goes.
 *  - screen: a screen, optionally on one of its views (a tab or a dialog of that screen), with `sub` for a
 *    step inside the view (e.g. "new:CPV" = a new cash payment voucher) and `anchor` to scroll to a card.
 *  - report: one Reports-hub report, the Books menu or the whole Reports menu.
 *  - action: a dialog that can open from anywhere (new bill, receive payment…).
 */
export type NavTarget =
  | { kind: 'screen'; screen: ActiveScreen; view?: string; sub?: string; anchor?: string }
  | { kind: 'report'; report: ReportId | 'books' | 'menu' }
  | { kind: 'action'; action: NavAction };

export interface NavEntry {
  id: string;
  group: NavGroupId;
  /** Sub-heading inside the group's dropdown. */
  section: string;
  /** Second-level sub-heading (the old Reports menu's Party / Product / Stock Reports). */
  sub?: string;
  label: string;
  /** One short line: what it opens. */
  hint: string;
  /** Names the staff may know it by: Apna Accountant's name, English synonyms. Shown in the menu and searched. */
  aka?: string[];
  /** Search words, including the Urdu / Roman-Urdu words shopkeepers use (udhaar, khata, parchi, maal…). */
  keywords: string[];
  /** All of these are needed. */
  perm?: Permission[];
  /** At least one of these is needed. */
  anyPerm?: Permission[];
  /** Keyboard key shown next to it (F2…). */
  key?: string;
  target: NavTarget;
  /**
   * false = a second way to the same place (e.g. "Cash book" under Accounts › Books, whose home is Reports).
   * The breadcrumb and search de-duplication use the primary entry.
   */
  primary?: boolean;
}

export interface NavSection {
  label: string;
  entries: NavEntry[];
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /** Alt + this letter opens the menu. */
  key: string;
  hint: string;
  /** Columns of the desktop dropdown. */
  cols: number;
  sections: NavSection[];
}

const ADMIN: Permission[] = ['admin_screen', 'system:admin_screen'];
const STOCK_IN: Permission[] = ['products:create', 'stock:adjust'];
const FIN: Permission[] = ['view_finance'];

type Raw = Omit<NavEntry, 'group' | 'section' | 'keywords'> & { keywords?: string[] };
const scr = (screen: ActiveScreen, view?: string, extra?: { sub?: string; anchor?: string }): NavTarget => ({ kind: 'screen', screen, ...(view ? { view } : {}), ...(extra || {}) });
const act = (action: NavAction): NavTarget => ({ kind: 'action', action });
const rep = (report: ReportId | 'books' | 'menu'): NavTarget => ({ kind: 'report', report });

// ---------------------------------------------------------------------------------------------------------
// Coding: the masters (items, parties, accounts), as Apna Accountant's "Coding" menu.
// ---------------------------------------------------------------------------------------------------------
const CODING: { label: string; entries: Raw[] }[] = [
  {
    // Apna Accountant SB's Coding menu: exactly these, in this order.
    label: 'Coding',
    entries: [
      { id: 'chart-of-accounts', label: 'Accounts Coding New', aka: ['Accounts Coding', 'Chart of accounts'], hint: 'The account heads money is sorted into; add a new account', keywords: ['hisab', 'hisaab', 'account head', 'coa', 'coding', 'chart', 'new account'], perm: FIN, target: scr('accounts', 'coa') },
      { id: 'account-openings', label: 'Accounts Opening Balances', aka: ['Opening balances'], hint: 'Opening balance of cash, banks, customers and suppliers in one grid', keywords: ['opening', 'shuru', 'purana khata', 'old khata', 'balance', 'b/f'], target: scr('coding', 'opening-balances') },
      { id: 'units', label: 'Product Unit Coding', aka: ['Units'], hint: 'Units items are sold in: tin, can, ctn, pcs…', keywords: ['unit', 'tin', 'can', 'ctn', 'carton', 'qty', 'pcs'], target: scr('coding', 'units') },
      { id: 'godowns', label: 'Store Coding', aka: ['Godowns / stores', 'Godowns'], hint: 'Stores and godowns, and the stock in each', keywords: ['godam', 'godaam', 'godown', 'store', 'warehouse'], perm: ['stock:adjust'], target: scr('products', 'godowns') },
      { id: 'product-groups', label: 'Product Group Coding', aka: ['Item groups'], hint: 'Item groups: Ghee, Cooking oil, Banaspati…', keywords: ['group', 'category', 'qism'], target: scr('coding', 'groups') },
      { id: 'items', label: 'Product Coding', aka: ['Items & prices', 'Items'], hint: 'Add or change items, codes, units, pack sizes and prices', keywords: ['maal', 'item', 'product', 'rate', 'qeemat', 'qimat', 'price', 'code', 'barcode', 'ghee', 'oil', 'tin'], target: scr('products') },
      { id: 'manufacturers', label: 'Manufacturer Coding', aka: ['Brands'], hint: 'Brands / manufacturers of the items: Dalda, Habib…', keywords: ['brand', 'company', 'manufacturer', 'maker'], target: scr('coding', 'manufacturers') },
      { id: 'opening-stock', label: 'Opening Stocks', aka: ['Opening stock'], hint: 'Stock of each item on the first day of the books, per store, with its rate', keywords: ['opening', 'stock', 'maal', 'shuru', 'b/f'], target: scr('coding', 'opening-stock') },
      { id: 'user-coding', label: 'User Coding', aka: ['Users'], hint: 'Who can sign in, their passwords and roles', keywords: ['user', 'password', 'login', 'staff'], anyPerm: ADMIN, perm: ['users:view'], target: scr('admin', 'users'), primary: false },
      { id: 'cities', label: 'City Coding', aka: ['Cities / towns'], hint: 'The list of cities used on customers and suppliers', keywords: ['shehr', 'shahar', 'city', 'town', 'area'], target: scr('customers', 'cities') },
    ],
  },
  {
    label: 'Parties',
    entries: [
      { id: 'customers', label: 'Customers', aka: ['Customer Coding'], hint: 'Who they are, what they owe, their bills', keywords: ['gahak', 'grahak', 'customer', 'party', 'khata', 'dukandar'], target: scr('customers') },
      { id: 'new-customer', label: 'Add customer', hint: 'Open a new customer account', keywords: ['naya gahak', 'new customer', 'party'], target: scr('customers', 'add') },
      { id: 'suppliers', label: 'Suppliers', aka: ['Supplier Coding'], hint: 'Companies you buy from and what you owe them', keywords: ['supplier', 'company', 'dealer', 'party', 'vendor'], target: scr('suppliers', 'suppliers') },
      { id: 'new-supplier', label: 'Add supplier', hint: 'Open a new supplier account', keywords: ['new supplier', 'company', 'party'], target: scr('suppliers', 'add') },
      { id: 'salesmen', label: 'Salesmen & areas', hint: 'Order bookers, recovery men and their areas', keywords: ['salesman', 'order booker', 'area', 'route', 'ilaqa'], target: act('salesTeam') },
    ],
  },
  {
    label: 'More setup',
    entries: [
      { id: 'new-item', label: 'New item', hint: 'Add one item to the price list', keywords: ['maal', 'naya', 'add item', 'product'], target: act('newItem') },
      { id: 'schemes', label: 'Schemes (free goods)', hint: 'Buy 10 get 1 and other free-goods schemes', keywords: ['scheme', 'free', 'bonus', 'muft', 'offer'], target: act('schemes') },
      { id: 'labels', label: 'Barcode labels', hint: 'Print barcode / price stickers for items', keywords: ['barcode', 'sticker', 'label', 'print'], target: act('labels') },
      { id: 'bank-accounts', label: 'Bank accounts', hint: 'Meezan, HBL…: add a bank and see each balance', keywords: ['bank', 'account', 'meezan', 'hbl', 'ubl', 'mcb'], perm: FIN, target: scr('money', 'overview', { anchor: 'bank-accounts' }) },
      { id: 'opening-balances', label: 'Opening cash & bank', hint: 'Cash and bank on the day you started', keywords: ['opening', 'shuru', 'balance', 'cash', 'bank'], target: scr('money', 'opening', { anchor: 'opening' }) },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------
// Invoice: sale, purchase and stock documents.
// ---------------------------------------------------------------------------------------------------------
const INVOICE: { label: string; entries: Raw[] }[] = [
  {
    // Apna Accountant SB's Invoice menu, in its order: Purchase Invoice ›, Sale Invoice ›, Store Transfer.
    label: 'Invoice',
    entries: [
      { id: 'new-purchase-invoice', sub: 'Purchase Invoice', label: 'Purchase Invoice', aka: ['New purchase invoice'], hint: "Enter a supplier's bill: stock in, supplier owed", keywords: ['khareed', 'kharid', 'purchase', 'supplier bill', 'maal aya'], anyPerm: STOCK_IN, target: act('newPurchaseInvoice') },
      { id: 'purchase-return', sub: 'Purchase Invoice', label: 'Purchase Return', aka: ['Debit note', 'Return goods'], hint: 'Send stock back to a supplier', keywords: ['wapsi', 'wapas', 'return', 'debit note'], anyPerm: STOCK_IN, target: act('purchaseReturn') },
      { id: 'purchases', sub: 'Purchase Invoice', label: 'Purchase Invoices list', hint: 'Every purchase invoice; search by P-number or bill no.', keywords: ['khareed', 'purchase', 'register'], anyPerm: [...STOCK_IN, 'suppliers:view'], target: scr('purchases') },
      { id: 'new-bill', sub: 'Sale Invoice', label: 'Sale Invoice', aka: ['New bill'], key: 'F2', hint: 'Make a bill for a customer', keywords: ['bill', 'parchi', 'invoice', 'bikri', 'farokht', 'sale', 'becha'], target: act('newBill') },
      { id: 'cash-sale', sub: 'Sale Invoice', label: 'Cash Sale Invoice', aka: ['Counter sale', 'Walk-in sale'], hint: 'A walk-in sale paid in cash; customer optional', keywords: ['cash sale', 'naqad', 'counter', 'walk in', 'bikri', 'parchi'], target: act('newCashSale') },
      { id: 'sale-returns', sub: 'Sale Invoice', label: 'Sale Return', aka: ['Sale returns (credit notes)', 'Credit note'], hint: 'Goods customers returned. To make one: open the bill → Return items', keywords: ['wapsi', 'wapas', 'return', 'credit note'], target: scr('bills', 'returns') },
      { id: 'bills', sub: 'Sale Invoice', label: 'Sale Invoices list', aka: ['Bills list'], hint: 'Every bill, paid and unpaid; search by number or memo', keywords: ['parchi', 'bill', 'invoices', 'sale register', 'bikri'], target: scr('bills', 'bills') },
      { id: 'move-stock', label: 'Store Transfer', aka: ['Move stock', 'Stock transfer'], hint: 'Move stock from one godown to another', keywords: ['godam', 'transfer', 'shift', 'maal', 'store'], anyPerm: STOCK_IN, target: scr('products', 'move') },
    ],
  },
  {
    label: 'Sale',
    entries: [
      { id: 'quotations', label: 'Quotations', hint: 'Price quotes; convert one to a bill', keywords: ['quote', 'estimate', 'rate dena'], target: scr('bills', 'quotes') },
      { id: 'new-quote', label: 'New quotation', hint: 'Write a price quote for a customer', keywords: ['quote', 'estimate'], target: act('newQuote') },
      { id: 'delivery-orders', label: 'Delivery orders (pending)', aka: ['Pending deliveries'], hint: 'Bills whose goods have not gone out yet; mark delivered, print challan', keywords: ['delivery', 'challan', 'maal bhejna', 'gari', 'dispatch'], target: rep('pending-delivery'), primary: false },
    ],
  },
  {
    label: 'Purchase',
    entries: [
      { id: 'supplier-returns', label: 'Purchase returns list', hint: 'Debit notes: goods sent back to suppliers', keywords: ['wapsi', 'debit note', 'return'], target: scr('suppliers', 'returns') },
      { id: 'purchase-orders', label: 'Purchase orders', hint: 'Orders placed with suppliers; receive against them', keywords: ['po', 'order', 'mangwana'], target: scr('suppliers', 'orders') },
      { id: 'new-purchase-order', label: 'New purchase order', hint: 'Order goods from a supplier', keywords: ['po', 'order'], target: act('newOrder') },
      { id: 'supplier-bills', label: 'Supplier bills', hint: 'Bills for goods received earlier or services', keywords: ['supplier bill', 'invoice'], target: scr('suppliers', 'bills') },
      { id: 'claims', label: 'Supplier claims', hint: 'Leaked, short or damaged goods claimed from suppliers', keywords: ['claim', 'leak', 'kharab', 'damage', 'short'], target: scr('suppliers', 'claims') },
      { id: 'stock-received', label: 'Stock received register', hint: 'Every delivery received from suppliers', keywords: ['maal aya', 'grn', 'received'], target: scr('suppliers', 'received') },
    ],
  },
  {
    label: 'Stock',
    entries: [
      { id: 'receive-stock', label: 'Receive stock', key: 'F6', hint: 'Stock you bought or brought in', keywords: ['maal aya', 'stock in', 'grn', 'maal'], anyPerm: STOCK_IN, target: act('receiveStock') },
      { id: 'adjust-stock', label: 'Adjust stock', hint: 'Leaked, damaged, expired, count correction, received free', keywords: ['leak', 'kharab', 'damage', 'expire', 'ginti', 'count', 'maal'], perm: ['stock:adjust'], target: act('adjustStock') },
      { id: 'reorder', label: 'Re-order list', hint: 'Items to buy again, turned into purchase orders', keywords: ['kam maal', 'order', 'khatam', 'low'], target: act('reorder') },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------
// Accounts: vouchers, money in / out, banks & cheques, ledgers and books.
// ---------------------------------------------------------------------------------------------------------
const voucher = (id: 'CPV' | 'CRV' | 'BPV' | 'BRV' | 'JV', label: string, hint: string, keywords: string[]): Raw => ({
  id: id.toLowerCase(),
  label: `${id} — ${label}`,
  aka: [label],
  hint,
  keywords: [id.toLowerCase(), ...keywords],
  perm: id === 'JV' ? ['view_finance', 'finance:view_pnl'] : ['view_finance', 'finance:record_payment'],
  target: scr('accounts', 'vouchers', { sub: `new:${id}` }),
});

const ACCOUNTS: { label: string; entries: Raw[] }[] = [
  {
    label: 'Vouchers',
    entries: [
      { id: 'vouchers', label: 'Vouchers', aka: ['Vouchers'], hint: 'All vouchers: find, view, print, edit', keywords: ['voucher', 'parchi', 'cpv', 'crv', 'bpv', 'brv', 'jv'], perm: FIN, target: scr('accounts', 'vouchers') },
      voucher('CPV', 'Cash payment voucher', 'Cash paid out: rent, a supplier, anything', ['cash payment', 'naqad', 'adaigi', 'kharcha']),
      voucher('CRV', 'Cash receipt voucher', 'Cash received in', ['cash receipt', 'naqad', 'wasooli', 'wasuli']),
      voucher('BPV', 'Bank payment voucher', 'Paid from a bank account or by cheque', ['bank payment', 'cheque', 'adaigi']),
      voucher('BRV', 'Bank receipt voucher', 'Received into a bank account', ['bank receipt', 'jama', 'deposit']),
      voucher('JV', 'Journal voucher', 'Adjustments between accounts', ['journal', 'adjustment']),
      { id: 'new-journal', label: 'Manual journal entry', hint: 'A correction entry for the accountant', keywords: ['journal', 'correction', 'adjustment'], perm: ['view_finance', 'finance:view_pnl'], target: scr('accounts', 'journal', { sub: 'new' }) },
    ],
  },
  {
    label: 'Money in & out',
    entries: [
      { id: 'receive', label: 'Receive payment', key: 'F3', hint: 'Money a customer paid you', keywords: ['wasooli', 'wasuli', 'udhaar', 'udhar', 'payment', 'raqam', 'paisay', 'recovery'], target: act('receive') },
      { id: 'receive-many', label: 'Receive from many', hint: 'Several customers paid at once (recovery round)', keywords: ['wasooli', 'wasuli', 'recovery', 'udhaar', 'bulk'], perm: ['finance:record_payment'], target: act('receiveMany') },
      { id: 'pay-supplier', label: 'Pay supplier', hint: 'Money you paid a supplier (cash, bank or cheque)', keywords: ['adaigi', 'payment', 'supplier', 'dena'], target: act('paySupplier') },
      { id: 'add-expense', label: 'Add expense', key: 'F4', hint: 'Rent, salaries, food, transport…', keywords: ['kharcha', 'kharch', 'kiraya', 'rent', 'bijli', 'expense'], target: act('addExpense') },
      { id: 'transfer', label: 'Cash ↔ Bank', aka: ['Bank deposit', 'Cash withdrawal'], hint: 'Deposit cash in the bank or draw it out', keywords: ['jama', 'deposit', 'withdraw', 'nikalna', 'bank', 'cash'], target: act('transfer') },
      { id: 'money', label: 'Money overview', hint: 'Cash, bank, who owes you and whom you owe', keywords: ['paisay', 'paise', 'cash in hand', 'position', 'naqad', 'udhaar'], target: scr('money', 'overview') },
      { id: 'expense-sheets', label: 'Expense sheets', hint: 'Expenses of a month, sheet by sheet', keywords: ['kharcha', 'kharch', 'expense'], target: scr('money', 'expenses') },
      { id: 'money-moves', label: 'Money in & out (month)', hint: 'Every receipt and payment of a month, cash or one bank', keywords: ['rokar', 'cash', 'lein dein', 'len den'], target: scr('money', 'cashbook') },
      { id: 'daily-sheet', label: 'Daily sheet', hint: 'One day on one page: bills, cash, expenses', keywords: ['rozana', 'aaj', 'today', 'din', 'daily'], target: scr('daily') },
      { id: 'interest', label: 'Late-payment interest', hint: 'Charge interest on overdue money (off unless set on a customer)', keywords: ['interest', 'sood', 'late', 'jurmana'], perm: ['finance:view_pnl'], target: act('interest') },
    ],
  },
  {
    label: 'Bank & cheques',
    entries: [
      { id: 'cheques', label: 'Cheques', aka: ['Cheque Deposits Bank'], hint: 'Cheque register: in hand, deposited, cleared, bounced', keywords: ['cheque', 'chek', 'check', 'pdc', 'post dated', 'bank', 'jama'], target: scr('money', 'cheques') },
      { id: 'bank-rec', label: 'Bank reconciliation', aka: ['Accounts Reconciliation'], hint: 'Tick your books against the bank statement', keywords: ['bank', 'statement', 'reconcile', 'milana'], perm: FIN, target: scr('money', 'bank') },
    ],
  },
  {
    label: 'Ledgers & books',
    entries: [
      { id: 'account-ledger', label: 'Account ledger', aka: ['Account Ledger'], hint: 'Any account for any dates, with the running balance', keywords: ['ledger', 'khata', 'hisab', 'hisaab', 'statement', 'udhaar'], perm: FIN, target: scr('accounts', 'ledger') },
      { id: 'general-ledger', label: 'General ledger', hint: 'Every posting to one account (drill-down)', keywords: ['gl', 'ledger', 'khata'], perm: FIN, target: scr('accounts', 'gl') },
      { id: 'journal', label: 'Journal', hint: 'The book of all entries, automatic and manual', keywords: ['journal', 'entries', 'roznamcha'], perm: FIN, target: scr('accounts', 'journal') },
      { id: 'books', label: 'Books', aka: ['Books'], hint: 'Cash book, bank book, day book, journal book, book balances', keywords: ['bahi', 'rokar', 'books', 'cash book'], target: rep('books') },
      { id: 'acc-cash-book', label: 'Cash book', key: 'F9', hint: 'Cash in hand: every receipt and payment', keywords: ['rokar', 'naqad', 'cash'], perm: FIN, target: rep('cash-book'), primary: false },
      { id: 'bank-book', label: 'Bank book', hint: 'One bank account: deposits, withdrawals, balance', keywords: ['bank', 'bahi'], perm: FIN, target: rep('bank-book') },
      { id: 'acc-day-book', label: 'Day book', hint: 'Every entry of one day', keywords: ['roznamcha', 'rozana', 'daily'], perm: FIN, target: rep('day-book'), primary: false },
      { id: 'acc-journal-book', label: 'Journal book', hint: 'Journal entries between dates', keywords: ['journal', 'jv'], perm: FIN, target: rep('journal-book'), primary: false },
    ],
  },
  {
    label: 'Statements & finance',
    entries: [
      { id: 'tb-screen', label: 'Trial balance (drill-down)', hint: 'Click any account to open its ledger', keywords: ['tb', 'mizan', 'trial'], perm: FIN, target: scr('accounts', 'tb') },
      { id: 'pnl-screen', label: 'Profit & loss (drill-down)', hint: 'Income, cost of sales and expenses', keywords: ['munafa', 'nuqsan', 'faida', 'pnl'], perm: FIN, target: scr('accounts', 'pnl') },
      { id: 'bs-screen', label: 'Balance sheet (drill-down)', hint: 'What the business owns and owes', keywords: ['bs', 'assets', 'liabilities'], perm: FIN, target: scr('accounts', 'bs') },
      { id: 'cashflow', label: 'Cash flow & ratios', hint: 'Where cash came from and went', keywords: ['cash flow', 'ratio', 'health'], perm: FIN, target: scr('accounts', 'cashflow') },
      { id: 'fixed-assets', label: 'Fixed assets', hint: 'Vehicles, generators, fittings and depreciation', keywords: ['asset', 'gari', 'generator', 'depreciation'], perm: FIN, target: scr('accounts', 'assets') },
      { id: 'staff', label: 'Staff & salaries', hint: 'Salary sheet, advances and payslips', keywords: ['tankhwah', 'tankhah', 'salary', 'mulazim', 'staff', 'advance', 'payroll'], perm: FIN, target: scr('accounts', 'staff') },
      { id: 'budgets', label: 'Budgets', hint: 'Plan each month, then compare', keywords: ['budget', 'plan'], perm: FIN, target: scr('accounts', 'budget') },
      { id: 'cost-centres', label: 'Cost centres', hint: 'Profit and loss by branch, area or vehicle', keywords: ['cost centre', 'branch', 'vehicle'], perm: FIN, target: scr('accounts', 'centres') },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------
// Reports: dashboards and business reports, then the Reports hub's own menu (REPORTS_MENU) unchanged.
// ---------------------------------------------------------------------------------------------------------
const REPORTS_EXTRA: { label: string; entries: Raw[] } = {
  label: 'Dashboards & business',
  entries: [
    { id: 'owner', label: 'Owner dashboard', hint: 'The whole business on one screen', keywords: ['dashboard', 'malik', 'owner', 'summary'], perm: ['finance:view_pnl'], target: scr('owner') },
    { id: 'all-reports', label: 'All reports', hint: 'The full Reports menu, with a report search', keywords: ['reports', 'report'], target: rep('menu') },
    { id: 'aging-customers', label: 'Who owes for how long (aging)', aka: ['Aging', 'Receivable aging'], hint: 'Customers by 0–30, 31–60, 61–90, 90+ days', keywords: ['udhaar', 'udhar', 'purana udhaar', 'overdue', 'aging', 'baqaya', 'wasooli'], target: act('agingCustomers') },
    { id: 'aging-suppliers', label: 'Supplier aging', aka: ['Payable aging'], hint: 'What you owe each supplier, by how long', keywords: ['dena', 'udhaar', 'aging', 'supplier'], target: act('agingSuppliers') },
    { id: 'recovery', label: 'Recovery list', hint: 'Customers who owe money, to print for the recovery man', keywords: ['wasooli', 'wasuli', 'recovery', 'udhaar', 'udhar'], perm: ['reports:view'], target: act('recovery') },
    { id: 'sales-by-salesman', label: 'Sales by salesman / area', hint: 'Bills, returns and freight for any dates', keywords: ['salesman', 'area', 'bikri'], perm: ['reports:view'], target: act('salesReport') },
    { id: 'commission', label: 'Salesman commission', hint: 'What each salesman earned, and pay it', keywords: ['commission', 'salesman'], perm: ['reports:view'], target: act('commission') },
    { id: 'sales-hub', label: 'Sales & recovery (all)', hint: 'Salesmen, areas, schemes, collections and commission', keywords: ['sales', 'recovery', 'wasooli'], target: act('salesHub') },
    { id: 'profit-by-item', label: 'Profit by item & customer', aka: ['Profit reports'], hint: 'What you sold each item for minus what it cost', keywords: ['munafa', 'faida', 'profit', 'margin'], perm: ['view_finance', 'finance:view_pnl'], target: scr('accounts', 'profit') },
    { id: 'receivable-by-city', label: 'Receivable by city', hint: 'What customers owe, city by city', keywords: ['udhaar', 'shehr', 'city', 'lena'], target: scr('customers', 'city') },
    { id: 'payable-by-city', label: 'Payable by city', hint: 'What you owe suppliers, city by city', keywords: ['dena', 'shehr', 'city'], target: scr('suppliers', 'city') },
  ],
};

/** Extra names / search words for the Reports-hub reports (their labels are the old program's names). */
const REPORT_AKA: Partial<Record<ReportId, string[]>> = {
  'trial-balance': ['Trial Balances'],
  'profit-loss': ['Profit & Loss', 'P&L'],
  'rate-list': ['Product List', 'Rate List', 'Price list'],
  'pending-delivery': ['Pending Delivery List', 'Delivery orders'],
  receivables: ['Receivables', 'Debtors'],
  payables: ['Payables', 'Creditors'],
};
const REPORT_WORDS: Partial<Record<ReportId, string[]>> = {
  'cash-book': ['rokar', 'naqad', 'cash', 'bahi'],
  'bank-book': ['bank', 'bahi'],
  'day-book': ['roznamcha', 'rozana', 'daily'],
  'journal-book': ['journal', 'jv'],
  'trial-balance': ['tb', 'mizan'],
  'trial-balance-period': ['tb', 'mizan'],
  'book-balances': ['cash', 'bank', 'balance', 'naqad'],
  'receivable-payable': ['udhaar', 'udhar', 'lena', 'dena', 'lena dena', 'khata'],
  receivables: ['udhaar', 'udhar', 'lena', 'baqaya', 'khata', 'wasooli', 'debtors'],
  payables: ['dena', 'udhaar', 'supplier', 'creditors'],
  'profit-loss': ['munafa', 'nuqsan', 'faida', 'pnl'],
  'profit-loss-period': ['munafa', 'nuqsan', 'faida', 'pnl'],
  'balance-sheet': ['bs'],
  'balance-sheet-period': ['bs'],
  'daily-gross-profit': ['munafa', 'faida', 'rozana', 'profit'],
  'daily-sale': ['rozana', 'bikri', 'farokht', 'sale'],
  'daily-purchase': ['rozana', 'khareed', 'kharid'],
  'stock-in-hand': ['maal', 'stock', 'godam', 'mojood'],
  'party-sales': ['gahak', 'customer', 'bikri'],
  'party-purchases': ['supplier', 'khareed'],
  'party-outstanding': ['udhaar', 'baqaya', 'lena', 'dena'],
  'product-sales': ['maal', 'bikri', 'item'],
  'product-purchases': ['maal', 'khareed', 'item'],
  'rate-list': ['qeemat', 'qimat', 'rate', 'nirakh', 'price'],
  'stock-ledger': ['maal', 'khata', 'item'],
  'godown-stock': ['godam', 'godaam', 'maal'],
  'stock-value': ['maal', 'qeemat', 'value'],
  'low-stock': ['kam maal', 'khatam', 'reorder'],
  'pending-delivery': ['delivery', 'challan', 'maal bhejna', 'gari'],
};

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A classic menu target (classicMenu.ts) as a nav target. */
export const fromClassicTarget = (t: ClassicTarget): NavTarget => {
  const r = resolveClassic(t);
  switch (r.kind) {
    case 'report': return rep(r.report);
    case 'books': return rep('books');
    case 'reports': return rep('menu');
    case 'accounts': return scr('accounts', r.tab);
    case 'money': return scr('money', r.tab);
    case 'items': return scr('products');
    case 'newBill': return act('newBill');
    case 'newPurchase': return act('newPurchaseInvoice');
    case 'screen': return scr(r.screen as ActiveScreen);
  }
};

/** Makes or changes something: never for a read-only role (Auditor / Viewer). */
const WRITE: Permission[] = ['data:write'];
const EXPENSES: Permission[] = ['manage_expenses', 'finance:manage_expenses'];

/**
 * What each dialog needs, wherever it is opened from (menus, "Find anything", the function keys, Home).
 * perm = all of these; anyPerm = at least one.
 */
export const ACTION_ACCESS: Record<NavAction, { perm?: Permission[]; anyPerm?: Permission[] }> = {
  newBill: { perm: WRITE },
  newCashSale: { perm: WRITE },
  newQuote: { perm: WRITE },
  newPurchaseInvoice: { perm: WRITE, anyPerm: STOCK_IN },
  receive: { perm: ['finance:record_payment'] },
  receiveMany: { perm: ['finance:record_payment'] },
  paySupplier: { perm: ['finance:record_payment'] },
  addExpense: { perm: WRITE, anyPerm: EXPENSES },
  transfer: { perm: WRITE },
  interest: { perm: ['finance:view_pnl'] },
  newItem: { perm: ['products:create'] },
  receiveStock: { perm: WRITE, anyPerm: STOCK_IN },
  adjustStock: { perm: ['stock:adjust'] },
  purchaseReturn: { perm: WRITE, anyPerm: STOCK_IN },
  newOrder: { perm: WRITE, anyPerm: STOCK_IN },
  reorder: {},
  labels: {},
  agingCustomers: {},
  agingSuppliers: {},
  salesHub: {},
  salesTeam: {},
  schemes: {},
  salesReport: {},
  recovery: {},
  commission: {},
  tradingSuite: { anyPerm: ADMIN, perm: ['system:company_settings'] },
  lock: {},
};

/** Permission a target needs by itself (screens gate themselves; the map mirrors that). */
const targetPerm = (t: NavTarget): { perm?: Permission[]; anyPerm?: Permission[] } => {
  if (t.kind === 'report' && t.report !== 'books' && t.report !== 'menu') {
    const d = REPORTS[t.report];
    return d.books || d.finance ? { perm: FIN } : {};
  }
  if (t.kind === 'action') return ACTION_ACCESS[t.action] || {};
  if (t.kind === 'screen' && t.screen === 'accounts') return { perm: t.view === 'profit' ? ['view_finance', 'finance:view_pnl'] : FIN };
  if (t.kind === 'screen' && t.screen === 'money' && (t.view === 'bank' || t.view === 'opening')) return { perm: t.view === 'opening' ? [...FIN, ...WRITE] : FIN };
  if (t.kind === 'screen' && t.screen === 'customers' && t.view === 'add') return { perm: ['customers:create'] };
  if (t.kind === 'screen' && t.screen === 'suppliers' && t.view === 'add') return { perm: ['suppliers:create'] };
  if (t.kind === 'screen' && t.screen === 'products' && (t.view === 'godowns' || t.view === 'move')) return { perm: WRITE };
  if (t.kind === 'screen' && t.screen === 'coding' && t.view === 'opening-balances') return { perm: FIN };
  if (t.kind === 'screen' && t.screen === 'coding' && t.view === 'opening-stock') return { perm: ['stock:adjust'] };
  return {};
};

/** May this user open the target (a dialog, screen view or report), wherever it is opened from? */
export const targetAllowed = (t: NavTarget, a: Pick<NavAccess, 'can'>): boolean => {
  const need = targetPerm(t);
  if (need.perm && !need.perm.every((p) => a.can(p))) return false;
  if (need.anyPerm && !need.anyPerm.some((p) => a.can(p))) return false;
  return true;
};

const reportSections = (): { label: string; entries: Raw[] }[] =>
  REPORTS_MENU.map((section) => ({
    label: section.label,
    entries: section.items.flatMap((it) =>
      (isSubmenu(it) ? it.entries.map((e) => ({ e, sub: it.label })) : [{ e: it, sub: undefined as string | undefined }]).map(({ e, sub }) => {
        const target = fromClassicTarget(e.target);
        const reportId = target.kind === 'report' ? (target.report as ReportId) : null;
        const def = reportId && reportId in REPORTS ? REPORTS[reportId] : null;
        // Links from the old Reports menu to a screen (Chart of Accounts, Account Ledger…) are second ways there.
        const primary = target.kind === 'report';
        return {
          id: reportId ? `rep-${reportId}` : `rep-${slug(e.label)}`,
          label: e.label,
          ...(sub ? { sub } : {}),
          hint: def ? def.help : `Opens ${e.label}`,
          ...(reportId && REPORT_AKA[reportId] ? { aka: REPORT_AKA[reportId] } : {}),
          keywords: [...(reportId ? REPORT_WORDS[reportId] || [] : []), ...(sub ? [sub.toLowerCase()] : [])],
          ...(e.key ? { key: e.key } : {}),
          target,
          ...(primary ? {} : { primary: false }),
        } as Raw;
      })
    ),
  }));

// ---------------------------------------------------------------------------------------------------------
// System: shop settings, users, numbers, approvals, branches, backups, year end.
// ---------------------------------------------------------------------------------------------------------
const admin = (view: string, anchor?: string): NavTarget => scr('admin', view, anchor ? { anchor } : undefined);
const SYSTEM: { label: string; entries: Raw[] }[] = [
  {
    label: 'Shop & bills',
    entries: [
      { id: 'shop-details', label: 'Shop details', hint: 'Shop name, address, phone, NTN and logo on bills', keywords: ['dukan', 'shop', 'company', 'logo', 'address', 'ntn', 'naam'], anyPerm: ADMIN, perm: ['system:company_settings'], target: admin('system', 'company') },
      { id: 'bill-settings', label: 'Bill settings', hint: 'Paper size, bill footer, previous balance, short stock, classic menu', keywords: ['print', 'a4', 'thermal', 'footer', 'parchi', 'bill'], anyPerm: ADMIN, perm: ['system:company_settings'], target: admin('system', 'bill-settings') },
      { id: 'reminder-settings', label: 'Payment reminders', hint: 'WhatsApp reminders to customers who owe', keywords: ['whatsapp', 'sms', 'yaad', 'reminder', 'udhaar'], anyPerm: ADMIN, perm: ['system:company_settings'], target: admin('system', 'reminders') },
      { id: 'doc-numbers', label: 'Document numbers', hint: 'Bill, voucher and invoice number series', keywords: ['number', 'series', 'numbering', 'serial'], anyPerm: ADMIN, perm: ['system:company_settings'], target: admin('controls', 'doc-numbers') },
      { id: 'branches', label: 'Branches', hint: 'More than one shop: branches and each person’s branch', keywords: ['shakh', 'branch', 'dukan'], anyPerm: ADMIN, perm: ['system:company_settings'], target: admin('controls', 'branches') },
    ],
  },
  {
    label: 'Users & security',
    entries: [
      { id: 'users', label: 'Users & passwords', hint: 'Who can sign in, their passwords and roles', keywords: ['password', 'login', 'user', 'staff', 'mulazim'], anyPerm: ADMIN, perm: ['users:view'], target: admin('users') },
      { id: 'roles', label: 'Roles & permissions', hint: 'What each role may see and do', keywords: ['rights', 'ijazat', 'permission', 'role'], anyPerm: ADMIN, perm: ['roles:view'], target: admin('roles') },
      { id: 'visibility', label: 'Screen visibility & masking', hint: 'Hide screens or figures from some roles', keywords: ['hide', 'chupana', 'mask'], anyPerm: ADMIN, perm: ['visibility:manage'], target: admin('visibility') },
      { id: 'security-policy', label: 'Security policies', hint: 'Password rules, lock-out', keywords: ['password', 'security', 'lock'], anyPerm: ADMIN, perm: ['roles:manage'], target: admin('policy') },
      { id: 'sign-in-settings', label: 'Sign-in & session', hint: 'Auto-lock and staying signed in', keywords: ['session', 'auto lock', 'login'], anyPerm: ADMIN, target: admin('system', 'sign-in') },
      { id: 'approval-rules', label: 'Approval rules', hint: 'Big discounts, payments or adjustments need a manager', keywords: ['manzoori', 'approval', 'limit', 'rule'], anyPerm: ADMIN, perm: ['system:company_settings'], target: admin('controls', 'approval-rules') },
      { id: 'approvals', label: 'Approvals inbox', hint: 'Documents waiting for a manager', keywords: ['manzoori', 'approve', 'pending'], anyPerm: ADMIN, perm: ['approvals:approve'], target: admin('approvals') },
      { id: 'audit', label: 'Audit log', hint: 'Who did what, and when', keywords: ['record', 'history', 'kisne', 'audit', 'log'], anyPerm: ADMIN, perm: ['system:audit_view'], target: admin('audit') },
      { id: 'lock', label: 'Lock screen', hint: 'Your password is needed to open again', keywords: ['lock', 'band', 'tala'], target: act('lock') },
    ],
  },
  {
    label: 'Data',
    entries: [
      { id: 'backups', label: 'Backup & restore', hint: 'Download a backup file, or restore one', keywords: ['backup', 'restore', 'mehfooz', 'download', 'data'], anyPerm: ADMIN, perm: ['system:backup_restore'], target: admin('system', 'backups') },
      { id: 'auto-backups', label: 'Automatic backups', hint: 'Backups kept on this device every day', keywords: ['backup', 'auto', 'mehfooz'], anyPerm: ADMIN, perm: ['system:backup_restore'], target: admin('system', 'auto-backups') },
      { id: 'data-import', label: 'Data import', hint: 'Bring customers, items and balances from Excel / CSV', keywords: ['excel', 'csv', 'import', 'purana data'], anyPerm: ADMIN, perm: ['system:backup_restore'], target: admin('import') },
      { id: 'data-export', label: 'Data export (CSV)', hint: 'Download customers, items, bills… as CSV', keywords: ['excel', 'csv', 'export', 'download'], anyPerm: ADMIN, perm: ['reports:export'], target: admin('system', 'exports') },
      { id: 'deleted', label: 'Deleted records', hint: 'Everything deleted, and bring it back', keywords: ['delete', 'bin', 'wapas', 'restore', 'undo'], anyPerm: ADMIN, target: admin('deleted') },
    ],
  },
  {
    label: 'Year & mode',
    entries: [
      { id: 'year-end', label: 'Year end', hint: 'Financial year and closing a finished year', keywords: ['saal', 'year', 'closing', 'financial year'], perm: FIN, target: scr('accounts', 'year') },
      { id: 'period-lock', label: 'Close the books (period lock)', hint: 'Stop changes on or before a date', keywords: ['lock', 'band', 'closing', 'period'], perm: ['view_finance', 'admin_screen'], target: scr('accounts', 'coa', { anchor: 'period-lock' }) },
      { id: 'trading-suite', label: 'Full trading suite', hint: 'Bookings, dispatches, fleet and stock-flow reports', keywords: ['trading', 'mode', 'bookings', 'fleet'], anyPerm: ADMIN, target: act('tradingSuite') },
    ],
  },
];

const GROUP_META: { id: NavGroupId; label: string; key: string; hint: string; cols: number; sections: { label: string; entries: Raw[] }[] }[] = [
  { id: 'coding', label: 'Coding', key: 'C', hint: 'Accounts, openings, units, stores, items, users, cities', cols: 3, sections: CODING },
  { id: 'invoice', label: 'Invoice', key: 'I', hint: 'Sale, purchase, returns and stock', cols: 3, sections: INVOICE },
  { id: 'accounts', label: 'Accounts', key: 'A', hint: 'Vouchers, money, banks and books', cols: 4, sections: ACCOUNTS },
  { id: 'reports', label: 'Reports', key: 'R', hint: 'Every report and dashboard', cols: 4, sections: [REPORTS_EXTRA, ...reportSections()] },
  { id: 'system', label: 'System', key: 'S', hint: 'Settings, users, backups, year end', cols: 3, sections: SYSTEM },
];

/** The five menus, every option (not yet filtered by permission). */
export const NAV_GROUPS: NavGroup[] = GROUP_META.map((g) => ({
  id: g.id,
  label: g.label,
  key: g.key,
  hint: g.hint,
  cols: g.cols,
  sections: g.sections.map((s) => ({
    label: s.label,
    entries: s.entries.map((e) => {
      const own = targetPerm(e.target);
      const perm = Array.from(new Set([...(e.perm || []), ...(own.perm || [])]));
      const anyPerm = e.anyPerm || own.anyPerm;
      return { ...e, keywords: e.keywords || [], group: g.id, section: s.label, ...(perm.length ? { perm } : {}), ...(anyPerm ? { anyPerm } : {}) } as NavEntry;
    }),
  })),
}));

/** Every option, in menu order. */
export const NAV_ENTRIES: NavEntry[] = NAV_GROUPS.flatMap((g) => g.sections.flatMap((s) => s.entries));

// The old Reports menu's links to screens (Chart of Accounts, Account Ledger…) borrow the hint of the
// option that owns that screen, so both read the same.
NAV_ENTRIES.forEach((e) => {
  if (!e.hint.startsWith('Opens ')) return;
  const owner = NAV_ENTRIES.find((o) => o !== e && o.primary !== false && targetKey(o.target) === targetKey(e.target));
  if (owner) e.hint = owner.hint;
});
export const navEntry = (id: string): NavEntry | undefined => NAV_ENTRIES.find((e) => e.id === id);
export const navGroup = (id: NavGroupId): NavGroup => NAV_GROUPS.find((g) => g.id === id)!;

/** The screen a target shows. */
export const targetScreen = (t: NavTarget): ActiveScreen | null => (t.kind === 'screen' ? t.screen : t.kind === 'report' ? 'reports-hub' : null);

/** A key that is equal for two entries that open the same thing. */
export function targetKey(t: NavTarget): string {
  return t.kind === 'screen' ? `s:${t.screen}:${t.view || ''}:${t.sub || ''}:${t.anchor || ''}` : t.kind === 'report' ? `r:${t.report}` : `a:${t.action}`;
}

export interface NavAccess {
  can: (p: Permission) => boolean;
  /** Screens an admin hid from this user (Admin → Visibility). */
  isScreenVisible?: (s: ActiveScreen) => boolean;
}

/** May this user open the entry? */
export const entryAllowed = (e: NavEntry, a: NavAccess): boolean => {
  if (e.perm && !e.perm.every((p) => a.can(p))) return false;
  if (e.anyPerm && !e.anyPerm.some((p) => a.can(p))) return false;
  const s = targetScreen(e.target);
  if (s && a.isScreenVisible && !a.isScreenVisible(s)) return false;
  return true;
};

/** The five menus with only what this user may open (empty sections dropped, groups always kept). */
export const navGroupsFor = (a: NavAccess): NavGroup[] =>
  NAV_GROUPS.map((g) => ({
    ...g,
    sections: g.sections.map((s) => ({ ...s, entries: s.entries.filter((e) => entryAllowed(e, a)) })).filter((s) => s.entries.length > 0),
  }));

/** Split a group's sections into `cols` columns, in order, roughly balanced by height. */
export const columnsOf = (sections: NavSection[], cols: number): NavSection[][] => {
  const size = (s: NavSection) => s.entries.length + 1.5 + new Set(s.entries.map((e) => e.sub).filter(Boolean)).size;
  const total = sections.reduce((a, s) => a + size(s), 0);
  const out: NavSection[][] = [];
  let cur: NavSection[] = [];
  let h = 0;
  sections.forEach((s, i) => {
    const left = sections.length - i;
    const colsLeft = cols - out.length;
    if (cur.length && (h + size(s) / 2 > total / cols || left < colsLeft) && out.length < cols - 1) {
      out.push(cur);
      cur = [];
      h = 0;
    }
    cur.push(s);
    h += size(s);
  });
  if (cur.length) out.push(cur);
  // One very long section (e.g. Accounts Reports) is split so no column is much taller than the rest.
  while (out.length < cols) {
    const tallest = out.reduce((best, c, i) => (c.reduce((a, s) => a + size(s), 0) > out[best].reduce((a, s) => a + size(s), 0) ? i : best), 0);
    const col = out[tallest];
    const big = col.reduce((b, s, i) => (s.entries.length > col[b].entries.length ? i : b), 0);
    const s = col[big];
    if (s.entries.length < 8) break;
    const half = Math.ceil(s.entries.length / 2);
    const a = { ...s, entries: s.entries.slice(0, half) };
    const b = { ...s, label: `${s.label} (cont.)`, entries: s.entries.slice(half) };
    out.splice(tallest, 1, [...col.slice(0, big), a], [b, ...col.slice(big + 1)]);
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------------------
/** Lower case, "&" → "and", punctuation out, and doubled letters squashed so "udhaar" = "udhar", "wasooli" = "wasoli". */
export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/↔/g, ' ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .replace(/([a-z])\1+/g, '$1')
    .trim();

const words = (s: string) => normalize(s).split(' ').filter(Boolean);

/** How well an entry matches a query (0 = not at all). Every word typed must match something. */
export const scoreEntry = (e: NavEntry, query: string): number => {
  const q = normalize(query);
  if (!q) return 0;
  const tokens = q.split(' ');
  const label = normalize(e.label);
  const aka = (e.aka || []).map(normalize);
  const kws = e.keywords.map(normalize);
  const labelWords = words(e.label);
  const akaWords = (e.aka || []).flatMap(words);
  const kwWords = e.keywords.flatMap(words);
  const context = normalize(`${e.section} ${e.sub || ''} ${e.group}`);
  const hint = normalize(e.hint);
  let score = 0;
  for (const t of tokens) {
    let best = 0;
    if (label.startsWith(t)) best = Math.max(best, 40);
    if (labelWords.some((w) => w === t)) best = Math.max(best, 36);
    if (labelWords.some((w) => w.startsWith(t))) best = Math.max(best, 30);
    if (kwWords.some((w) => w === t)) best = Math.max(best, 28);
    if (akaWords.some((w) => w.startsWith(t))) best = Math.max(best, 26);
    if (kwWords.some((w) => w.startsWith(t))) best = Math.max(best, 20);
    if (t.length > 2 && label.includes(t)) best = Math.max(best, 15);
    if (t.length > 2 && context.includes(t)) best = Math.max(best, 8);
    if (t.length > 2 && hint.includes(t)) best = Math.max(best, 6);
    if (!best) return 0;
    score += best;
  }
  if (label === q || aka.includes(q)) score += 60;
  // The first keyword is what the option mainly is ("udhaar" → Receivable, not every page that mentions it).
  else if (kws[0] === q) score += 45;
  else if (kws.includes(q)) score += 30;
  else if (label.startsWith(q) || aka.some((a) => a.startsWith(q))) score += 20;
  if (e.primary !== false) score += 1;
  return score;
};

/** Options matching the query, best first; the same place reached two ways is listed once. */
export const searchNav = (query: string, a?: NavAccess, limit = 12): NavEntry[] => {
  const pool = a ? NAV_ENTRIES.filter((e) => entryAllowed(e, a)) : NAV_ENTRIES;
  const scored = pool
    .map((e, i) => ({ e, i, s: scoreEntry(e, query) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.i - y.i);
  const seen = new Set<string>();
  const out: NavEntry[] = [];
  for (const { e } of scored) {
    const k = targetKey(e.target);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------------------------------------
/** Screens that are not an option of a menu (Home is the logo / Home button / bottom bar). */
export const SCREEN_HOME_LABEL: Partial<Record<ActiveScreen, string>> = { dashboard: 'Home' };

/**
 * The menu entry a screen (and its current view) belongs to, for the breadcrumb.
 * `view` is the tab / report the screen shows now (null = its main view).
 */
export const entryForView = (screen: ActiveScreen, view: string | null): NavEntry | undefined => {
  const byPrimary = (list: NavEntry[]) => list.find((e) => e.primary !== false) || list[0];
  if (screen === 'reports-hub') {
    const id = view && view !== 'menu' ? view : 'menu';
    return byPrimary(NAV_ENTRIES.filter((e) => e.target.kind === 'report' && e.target.report === id));
  }
  const onScreen = NAV_ENTRIES.filter((e) => e.target.kind === 'screen' && e.target.screen === screen && !e.target.sub && !e.target.anchor);
  if (view) {
    const exact = byPrimary(onScreen.filter((e) => e.target.kind === 'screen' && e.target.view === view));
    if (exact) return exact;
    const anyAnchor = byPrimary(NAV_ENTRIES.filter((e) => e.target.kind === 'screen' && e.target.screen === screen && e.target.view === view));
    if (anyAnchor) return anyAnchor;
  }
  return byPrimary(onScreen.filter((e) => e.target.kind === 'screen' && !e.target.view)) || byPrimary(onScreen);
};

export const breadcrumbFor = (screen: ActiveScreen, view: string | null): { group?: NavGroup; entry?: NavEntry; label: string } => {
  if (SCREEN_HOME_LABEL[screen]) return { label: SCREEN_HOME_LABEL[screen]! };
  const entry = entryForView(screen, view);
  if (!entry) return { label: screen };
  return { group: navGroup(entry.group), entry, label: entry.label };
};

// ---------------------------------------------------------------------------------------------------------
// The 16 big buttons of Apna Accountant's home screen, same names and order, pointing at nav entries.
// ---------------------------------------------------------------------------------------------------------
export interface ClassicButton {
  /** Stable id (also the icon key in ClassicMenu.tsx). */
  id: string;
  /** The old program's name. */
  label: string;
  /** The nav entry it opens. */
  entryId: string;
}
export const CLASSIC_BUTTONS: ClassicButton[] = [
  { id: 'product-coding', label: 'Product Coding', entryId: 'items' },
  { id: 'sale-invoice', label: 'Sale Invoice', entryId: 'new-bill' },
  { id: 'purchase-invoice', label: 'Purchase Invoice', entryId: 'new-purchase-invoice' },
  { id: 'product-list', label: 'Product List', entryId: 'rep-rate-list' },
  { id: 'daily-gross-profit', label: 'Daily Gross Profit', entryId: 'rep-daily-gross-profit' },
  { id: 'daily-sale', label: 'Daily Sale', entryId: 'rep-daily-sale' },
  { id: 'daily-purchase', label: 'Daily Purchase', entryId: 'rep-daily-purchase' },
  { id: 'stock-in-hand', label: 'Stock In Hand', entryId: 'rep-stock-in-hand' },
  { id: 'accounts-coding', label: 'Accounts Coding', entryId: 'chart-of-accounts' },
  { id: 'account-ledger', label: 'Account Ledger', entryId: 'account-ledger' },
  { id: 'cheque-deposits', label: 'Cheque Deposits Bank', entryId: 'cheques' },
  { id: 'books', label: 'Books', entryId: 'books' },
  { id: 'vouchers', label: 'Vouchers', entryId: 'vouchers' },
  { id: 'trial-balances', label: 'Trial Balances', entryId: 'rep-trial-balance' },
  { id: 'profit-loss', label: 'Profit & Loss', entryId: 'rep-profit-loss' },
  { id: 'balance-sheet', label: 'Balance Sheet', entryId: 'rep-balance-sheet' },
];
/** A classic button with its entry (hint, key, target, permission). */
export const classicEntry = (b: ClassicButton): NavEntry => navEntry(b.entryId)!;

/** The shortest useful "where it lives" line: "Accounts › Vouchers". */
export const pathOf = (e: NavEntry): string => `${navGroup(e.group).label} › ${e.label}`;

// ---------------------------------------------------------------------------------------------------------
// What each option shows when it opens (the e2e test opens every entry and checks exactly this).
// ---------------------------------------------------------------------------------------------------------
export interface NavCheck {
  /** An h1 with this text. */
  heading?: string;
  /** A tab (role="tab", selected) whose name starts with this. */
  tab?: string;
  /** A toggle button (aria-pressed=true) whose name starts with this. */
  pressed?: string;
  /** A dialog with this name. */
  dialog?: string;
  /** A card marked data-nav-anchor="…", scrolled into view. */
  anchor?: string;
  /** Leaves billing (trading suite) or locks the app: the test checks and undoes it. */
  special?: 'tradingSuite' | 'lock';
}

/** h1 of each screen. */
export const SCREEN_TITLE: Partial<Record<ActiveScreen, string>> = {
  dashboard: 'Home', products: 'Items & Prices', customers: 'Customers', suppliers: 'Suppliers', accounts: 'Accounts', money: 'Money',
  admin: 'Administrator Control Center', bills: 'Bills', daily: 'Daily Sheet', owner: 'Owner dashboard', purchases: 'Purchase invoices', 'reports-hub': 'Reports', coding: 'Coding',
};
/** Tab / toggle names of the screens with tabs (checked against the screens by the unit tests). */
export const ACCOUNTS_TAB_LABEL: Record<string, string> = {
  vouchers: 'Vouchers', ledger: 'Account ledger', parties: 'Receivable & payable', tb: 'Trial balance', gl: 'General ledger', journal: 'Journal', coa: 'Chart of accounts',
  pnl: 'Profit & Loss', bs: 'Balance sheet', profit: 'Profit by item', cashflow: 'Cash flow & ratios', assets: 'Fixed assets', staff: 'Staff & salaries', budget: 'Budgets', centres: 'Cost centres', year: 'Year end',
};
export const MONEY_TAB_LABEL: Record<string, string> = { overview: 'Overview', expenses: 'Expense sheets', cashbook: 'Cash book', cheques: 'Cheques', bank: 'Bank reconciliation' };
export const ADMIN_TAB_LABEL: Record<string, string> = {
  users: 'User Accounts & Auth', roles: 'Roles & RBAC Matrix', visibility: 'Visibility & Masking', policy: 'Security Policies', audit: 'Audit Trail',
  approvals: 'Approvals', deleted: 'Deleted records', controls: 'Rules, numbers & branches', system: 'System & Backups', import: 'Data Import',
};
export const SUPPLIER_TAB_LABEL: Record<string, string> = { suppliers: 'Suppliers', orders: 'Orders', received: 'Stock received', bills: 'Supplier bills', claims: 'Claims', returns: 'Returns' };
export const BILLS_TAB_LABEL: Record<string, string> = { bills: 'Bills', returns: 'Returns', quotes: 'Quotations' };
/** Tabs of the Coding screen (screens/billing/CodingScreen.tsx CODING_TAB_NAMES). */
export const CODING_TAB_LABEL: Record<string, string> = {
  'opening-balances': 'Accounts Opening Balances', units: 'Product Unit Coding', groups: 'Product Group Coding', manufacturers: 'Manufacturer Coding', 'opening-stock': 'Opening Stocks',
};

const VIEW_DIALOG: Record<string, string> = {
  'customers:add': 'New customer',
  'customers:cities': 'Cities / towns',
  'customers:city': 'Receivable by city',
  'suppliers:add': 'New supplier',
  'suppliers:city': 'Payable by city',
  'products:godowns': 'Godowns',
  'products:move': 'Move stock',
};
const ACTION_DIALOG: Record<NavAction, string | null> = {
  newBill: 'New Bill', newCashSale: 'Cash Sale Invoice', newQuote: 'New Quotation', newPurchaseInvoice: 'Purchase Invoice', receive: 'Receive payment', receiveMany: 'Receive from many',
  paySupplier: 'Pay supplier', addExpense: 'Add expense', transfer: 'Cash ↔ Bank', interest: 'Charge interest', newItem: 'New item', receiveStock: 'Receive stock',
  adjustStock: 'Adjust stock', purchaseReturn: 'Return goods to supplier', newOrder: 'New purchase order', reorder: 'Re-order report', labels: 'Print barcode labels',
  agingCustomers: 'Who owes for how long', agingSuppliers: 'Who owes for how long', salesHub: 'Sales & recovery', salesTeam: 'Salesmen & areas', schemes: 'Schemes',
  salesReport: 'Sales reports', recovery: 'Sales reports', commission: 'Sales reports', tradingSuite: null, lock: null,
};
/** The voucher screen's title (the old program's window title, utils/voucherEntry.ts VOUCHER_TITLES). */
const VOUCHER_LABEL: Record<string, string> = { CPV: 'Cash Payment -- [Debit Voucher]', CRV: 'Cash Receipt -- [Credit Voucher]', BPV: 'Bank Payment -- [Debit Voucher]', BRV: 'Bank Receipt -- [Credit Voucher]', JV: 'Journal Voucher' };

/** What must be visible once the entry has opened. */
export const navCheck = (e: NavEntry): NavCheck => {
  const t = e.target;
  if (t.kind === 'report') return { heading: t.report === 'books' ? 'Books' : t.report === 'menu' ? 'Reports' : REPORTS[t.report].title };
  if (t.kind === 'action') {
    if (t.action === 'tradingSuite' || t.action === 'lock') return { special: t.action };
    return { dialog: ACTION_DIALOG[t.action]! };
  }
  const c: NavCheck = { heading: SCREEN_TITLE[t.screen] };
  const v = t.view;
  if (t.sub?.startsWith("new:")) c.dialog = VOUCHER_LABEL[t.sub.slice(4)];
  else if (t.sub === 'new' && v === 'journal') c.dialog = 'New journal entry';
  if (t.anchor) c.anchor = t.anchor;
  if (!v) return c;
  if (VIEW_DIALOG[`${t.screen}:${v}`]) c.dialog = VIEW_DIALOG[`${t.screen}:${v}`];
  else if (t.screen === 'accounts') c.tab = ACCOUNTS_TAB_LABEL[v];
  else if (t.screen === 'money') {
    if (v === 'opening') c.anchor = 'opening';
    else c.pressed = MONEY_TAB_LABEL[v];
  } else if (t.screen === 'admin') c.pressed = ADMIN_TAB_LABEL[v];
  else if (t.screen === 'suppliers') c.tab = SUPPLIER_TAB_LABEL[v];
  else if (t.screen === 'bills') c.tab = BILLS_TAB_LABEL[v];
  else if (t.screen === 'coding') c.tab = CODING_TAB_LABEL[v];
  return c;
};
