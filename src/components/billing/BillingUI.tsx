import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NewBillModal } from './NewBillModal';
import { BillDetailModal } from './BillDetailModal';
import { ItemModal } from './ItemModal';
import { ExpenseModal, TransferModal, ReceiveModal, PaySupplierModal } from './MoneyForms';
import { ReturnItemsModal } from './ReturnItemsModal';
import { QuotationModal } from './QuotationModal';
import { ExpenseCategory } from '../../types';
import { SalesExtrasModals, SalesView } from './SalesHub';
import { useTrading } from '../../context/TradingContext';
import type { ReportId } from '../../utils/classicReports';
import type { AccountsTab } from '../../utils/classicMenu';
import { PurchaseInvoiceModal, PurchaseInvoiceDetail } from './classic/PurchaseInvoiceModal';
import { MarkDeliveredModal } from './classic/DeliveryDialogs';

/** What the Reports hub should show: one report, the Books menu or the whole menu. */
export type ReportRequest = ReportId | 'books' | 'menu';

/** Which AI dialog is open (hosted by components/ai/AiHost.tsx). */
export type AiView = { kind: 'ask' } | { kind: 'reminder'; customerId: string | null } | { kind: 'summary' };

interface BillingUI {
  newBill: (customerId?: string | null) => void;
  /** New Sale Invoice with "AI: from photo / message" opened on it. */
  newBillFromAi: () => void;
  /** AI: Ask the shop (Ctrl+J), payment reminder, business summary. */
  askShop: () => void;
  aiReminder: (customerId?: string | null) => void;
  aiSummary: () => void;
  ai: AiView | null;
  closeAi: () => void;
  /** Cash Sale Invoice: a walk-in sale paid in cash (customer optional). */
  newCashSale: () => void;
  openBill: (invoiceId: string) => void;
  /** Edit a saved bill in the New Bill form (same number); the bill reopens after saving. */
  editBill: (invoiceId: string) => void;
  /** New bill filled from a quotation ("Convert to bill"). */
  billFromQuote: (quotationId: string) => void;
  /** Return items from a bill (credit note). */
  returnItems: (invoiceId: string) => void;
  /** New quotation, or edit one. */
  newQuote: (customerId?: string | null) => void;
  editQuote: (quotationId: string) => void;
  addExpense: (opts?: { date?: string; category?: ExpenseCategory }) => void;
  receive: (customerId?: string | null) => void;
  /** Pay a supplier (cash / bank / cheque into the cheque register). */
  paySupplier: (supplierId?: string | null) => void;
  transfer: () => void;
  newItem: () => void;
  editItem: (productId: string) => void;
  /** Ask the Money screen to open on a tab the next time it mounts (then call setActiveScreen('money')). */
  openMoneyTab: (tab: 'overview' | 'expenses' | 'cashbook' | 'cheques' | 'bank' | null) => void;
  /** The requested Money tab, if any (the Money screen reads it on mount, then clears it). */
  peekMoneyTab: () => 'overview' | 'expenses' | 'cashbook' | 'cheques' | 'bank' | null;
  /** Sales & recovery: salesmen / areas, schemes, reports, receive from many, commission, interest ('hub' = the menu). */
  salesExtras: (view?: SalesView) => void;
  /** Open the Reports hub on a report (or the Books / Reports menu). */
  openReport: (id: ReportRequest) => void;
  /** Latest request (the hub follows it; `n` changes on every request). */
  reportRequest: { id: ReportRequest; n: number } | null;
  /** Ask the Accounts screen to show a tab (then go to 'accounts'); `sub` = a step inside it ("new:CPV", "view:<id>", "new"). */
  openAccountsTab: (tab: AccountsTab, sub?: string) => void;
  accountsTabRequest: { tab: AccountsTab; sub?: string; n: number } | null;
  /** Ask a screen to show one of its views (a tab or one of its dialogs) the next time it mounts / now. */
  requestView: (screen: string, view: string) => void;
  /** The view waiting for this screen, without taking it. */
  peekView: (screen: string) => string | null;
  /** Take (and clear) the view waiting for this screen. */
  takeView: (screen: string) => string | null;
  /** Changes on every requestView (screens watch it). */
  viewRequestN: number;
  /** What the screen on show is showing now (tab / report), for the breadcrumb. */
  currentView: { screen: string; view: string | null } | null;
  setCurrentView: (screen: string, view: string | null) => void;
  /** New purchase invoice, or look at a saved one. */
  newPurchaseInvoice: (supplierId?: string | null) => void;
  openPurchaseInvoice: (id: string) => void;
  /** A saved purchase invoice in the Purchase Invoice form, to change or delete it (Search). */
  editPurchaseInvoice: (id: string) => void;
  /** Delivery order: mark delivered (date, who, vehicle) and print the challan. */
  markDelivered: (invoiceId: string) => void;
}

const Ctx = createContext<BillingUI | null>(null);

/** Hosts every billing dialog once; screens just call e.g. `ui.newBill()`. */
export const BillingUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bill, setBill] = useState<{ open: boolean; customerId: string | null; quotationId?: string | null; editInvoiceId?: string | null; mode?: 'sale' | 'cash'; ai?: boolean }>({ open: false, customerId: null });
  const [ai, setAi] = useState<AiView | null>(null);
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ open: boolean; editId: string | null; customerId: string | null }>({ open: false, editId: null, customerId: null });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expense, setExpense] = useState<{ open: boolean; date?: string; category?: ExpenseCategory }>({ open: false });
  const [receive, setReceive] = useState<{ open: boolean; customerId: string | null }>({ open: false, customerId: null });
  const [pay, setPay] = useState<{ open: boolean; supplierId: string | null }>({ open: false, supplierId: null });
  const [transferOpen, setTransferOpen] = useState(false);
  const [item, setItem] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null });
  // Every open bumps the nonce so the dialog remounts with fresh form state (no stale values, no reset race).
  const [nonce, setNonce] = useState(0);
  const bump = () => setNonce((n) => n + 1);
  const [salesView, setSalesView] = useState<SalesView | null>(null);
  const { setActiveScreen, activeScreen } = useTrading();
  const pendingView = useRef<{ screen: string; view: string } | null>(null);
  const [viewRequestN, setViewRequestN] = useState(0);
  const [currentView, setCurrentViewState] = useState<BillingUI['currentView']>(null);
  // A request for a screen the user then left without it showing is dropped.
  useEffect(() => {
    if (pendingView.current && pendingView.current.screen !== activeScreen) pendingView.current = null;
  }, [activeScreen]);
  const requestView = (screen: string, view: string) => { pendingView.current = { screen, view }; setViewRequestN((n) => n + 1); };
  const peekView = (screen: string) => (pendingView.current?.screen === screen ? pendingView.current.view : null);
  const [reportRequest, setReportRequest] = useState<BillingUI['reportRequest']>(null);
  const [accountsTabRequest, setAccountsTabRequest] = useState<BillingUI['accountsTabRequest']>(null);
  const [purchase, setPurchase] = useState<{ open: boolean; supplierId: string | null; editId?: string | null }>({ open: false, supplierId: null });
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [deliverId, setDeliverId] = useState<string | null>(null);

  const api: BillingUI = {
    newBill: (customerId) => { bump(); setBill({ open: true, customerId: customerId || null }); },
    newCashSale: () => { bump(); setBill({ open: true, customerId: null, mode: 'cash' }); },
    newBillFromAi: () => { bump(); setBill({ open: true, customerId: null, ai: true }); },
    askShop: () => setAi({ kind: 'ask' }),
    aiReminder: (customerId) => setAi({ kind: 'reminder', customerId: customerId || null }),
    aiSummary: () => setAi({ kind: 'summary' }),
    ai,
    closeAi: () => setAi(null),
    openBill: (id) => { bump(); setDetailId(id); },
    editBill: (id) => { bump(); setDetailId(null); setBill({ open: true, customerId: null, editInvoiceId: id }); },
    billFromQuote: (quotationId) => { bump(); setBill({ open: true, customerId: null, quotationId }); },
    returnItems: (invoiceId) => { bump(); setDetailId(null); setReturnFor(invoiceId); },
    newQuote: (customerId) => { bump(); setQuote({ open: true, editId: null, customerId: customerId || null }); },
    editQuote: (id) => { bump(); setQuote({ open: true, editId: id, customerId: null }); },
    addExpense: (opts) => { bump(); setExpense({ open: true, ...opts }); },
    receive: (customerId) => { bump(); setReceive({ open: true, customerId: customerId || null }); },
    paySupplier: (supplierId) => { bump(); setPay({ open: true, supplierId: supplierId || null }); },
    transfer: () => { bump(); setTransferOpen(true); },
    newItem: () => { bump(); setItem({ open: true, editId: null }); },
    editItem: (id) => { bump(); setItem({ open: true, editId: id }); },
    openMoneyTab: (tab) => { if (tab) requestView('money', tab); else if (pendingView.current?.screen === 'money') pendingView.current = null; },
    peekMoneyTab: () => peekView('money') as ReturnType<BillingUI['peekMoneyTab']>,
    requestView,
    peekView,
    takeView: (screen) => { const v = peekView(screen); if (v) pendingView.current = null; return v; },
    viewRequestN,
    currentView,
    setCurrentView: (screen, view) => setCurrentViewState((c) => (c && c.screen === screen && c.view === view ? c : { screen, view })),
    salesExtras: (view = 'hub') => { bump(); setSalesView(view); },
    openReport: (id) => { setReportRequest((r) => ({ id, n: (r?.n || 0) + 1 })); setActiveScreen('reports-hub'); },
    reportRequest,
    openAccountsTab: (tab, sub) => setAccountsTabRequest((r) => ({ tab, ...(sub ? { sub } : {}), n: (r?.n || 0) + 1 })),
    accountsTabRequest,
    newPurchaseInvoice: (supplierId) => { bump(); setPurchase({ open: true, supplierId: supplierId || null }); },
    openPurchaseInvoice: (id) => { bump(); setPurchaseId(id); },
    editPurchaseInvoice: (id) => { bump(); setPurchaseId(null); setPurchase({ open: true, supplierId: null, editId: id }); },
    markDelivered: (invoiceId) => { bump(); setDeliverId(invoiceId); },
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <NewBillModal key={`bill-${nonce}`} isOpen={bill.open} onClose={() => setBill({ open: false, customerId: null })} customerId={bill.customerId} quotationId={bill.quotationId} editInvoiceId={bill.editInvoiceId} mode={bill.mode} startWithAi={bill.ai} onEdited={(id) => { bump(); setBill({ open: false, customerId: null }); setDetailId(id); }} />
      <ReturnItemsModal key={`ret-${nonce}`} invoiceId={returnFor} onClose={() => setReturnFor(null)} onDone={(id) => { bump(); setReturnFor(null); setDetailId(id); }} />
      <QuotationModal key={`quote-${nonce}`} isOpen={quote.open} editId={quote.editId} customerId={quote.customerId} onClose={() => setQuote({ open: false, editId: null, customerId: null })} />
      <BillDetailModal key={`detail-${nonce}`} invoiceId={detailId} onClose={() => setDetailId(null)} />
      <ExpenseModal key={`exp-${nonce}`} isOpen={expense.open} onClose={() => setExpense({ open: false })} date={expense.date} category={expense.category} />
      <ReceiveModal key={`rc-${nonce}`} isOpen={receive.open} onClose={() => setReceive({ open: false, customerId: null })} customerId={receive.customerId} />
      <PaySupplierModal key={`ps-${nonce}`} isOpen={pay.open} onClose={() => setPay({ open: false, supplierId: null })} supplierId={pay.supplierId} />
      <TransferModal key={`tr-${nonce}`} isOpen={transferOpen} onClose={() => setTransferOpen(false)} />
      <SalesExtrasModals key={`sx-${nonce}`} view={salesView} onView={setSalesView} />
      <ItemModal key={`item-${nonce}`} isOpen={item.open} onClose={() => setItem({ open: false, editId: null })} editId={item.editId} />
      <PurchaseInvoiceModal key={`pinv-${nonce}`} isOpen={purchase.open} supplierId={purchase.supplierId} editId={purchase.editId} onEdit={(id) => { bump(); setPurchase({ open: true, supplierId: null, editId: id }); }} onNew={() => { bump(); setPurchase({ open: true, supplierId: null }); }} onClose={() => setPurchase({ open: false, supplierId: null })} onSaved={(id) => { bump(); setPurchase({ open: false, supplierId: null }); setPurchaseId(id); }} onOpen={(id) => { bump(); setPurchase({ open: false, supplierId: null }); setPurchaseId(id); }} />
      <PurchaseInvoiceDetail key={`pind-${nonce}`} id={purchaseId} onClose={() => setPurchaseId(null)} />
      <MarkDeliveredModal key={`dlv-${nonce}`} invoiceId={deliverId} onClose={() => setDeliverId(null)} />
    </Ctx.Provider>
  );
};

export const useBillingUI = (): BillingUI => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useBillingUI must be used inside BillingUIProvider');
  return c;
};

/** A screen applies views asked for from a menu / search (`apply` gets e.g. "cheques"). */
export const useRequestedView = (screen: string, apply: (view: string) => void) => {
  const ui = useBillingUI();
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    const v = ui.takeView(screen);
    if (v) applyRef.current(v);
  }, [ui.viewRequestN]); // eslint-disable-line react-hooks/exhaustive-deps
};

/** A screen tells the breadcrumb which tab / report it shows. */
export const useCurrentView = (screen: string, view: string | null) => {
  const ui = useBillingUI();
  useEffect(() => { ui.setCurrentView(screen, view); }, [screen, view]); // eslint-disable-line react-hooks/exhaustive-deps
};
