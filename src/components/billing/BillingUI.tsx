import React, { createContext, useContext, useState } from 'react';
import { NewBillModal } from './NewBillModal';
import { BillDetailModal } from './BillDetailModal';
import { ItemModal } from './ItemModal';
import { ExpenseModal, TransferModal, ReceiveModal } from './MoneyForms';
import { ReturnItemsModal } from './ReturnItemsModal';
import { QuotationModal } from './QuotationModal';
import { ExpenseCategory } from '../../types';

interface BillingUI {
  newBill: (customerId?: string | null) => void;
  openBill: (invoiceId: string) => void;
  /** New bill filled from a quotation ("Convert to bill"). */
  billFromQuote: (quotationId: string) => void;
  /** Return items from a bill (credit note). */
  returnItems: (invoiceId: string) => void;
  /** New quotation, or edit one. */
  newQuote: (customerId?: string | null) => void;
  editQuote: (quotationId: string) => void;
  addExpense: (opts?: { date?: string; category?: ExpenseCategory }) => void;
  receive: (customerId?: string | null) => void;
  transfer: () => void;
  newItem: () => void;
  editItem: (productId: string) => void;
}

const Ctx = createContext<BillingUI | null>(null);

/** Hosts every billing dialog once; screens just call e.g. `ui.newBill()`. */
export const BillingUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bill, setBill] = useState<{ open: boolean; customerId: string | null; quotationId?: string | null }>({ open: false, customerId: null });
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ open: boolean; editId: string | null; customerId: string | null }>({ open: false, editId: null, customerId: null });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expense, setExpense] = useState<{ open: boolean; date?: string; category?: ExpenseCategory }>({ open: false });
  const [receive, setReceive] = useState<{ open: boolean; customerId: string | null }>({ open: false, customerId: null });
  const [transferOpen, setTransferOpen] = useState(false);
  const [item, setItem] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null });
  // Every open bumps the nonce so the dialog remounts with fresh form state (no stale values, no reset race).
  const [nonce, setNonce] = useState(0);
  const bump = () => setNonce((n) => n + 1);

  const api: BillingUI = {
    newBill: (customerId) => { bump(); setBill({ open: true, customerId: customerId || null }); },
    openBill: (id) => { bump(); setDetailId(id); },
    billFromQuote: (quotationId) => { bump(); setBill({ open: true, customerId: null, quotationId }); },
    returnItems: (invoiceId) => { bump(); setDetailId(null); setReturnFor(invoiceId); },
    newQuote: (customerId) => { bump(); setQuote({ open: true, editId: null, customerId: customerId || null }); },
    editQuote: (id) => { bump(); setQuote({ open: true, editId: id, customerId: null }); },
    addExpense: (opts) => { bump(); setExpense({ open: true, ...opts }); },
    receive: (customerId) => { bump(); setReceive({ open: true, customerId: customerId || null }); },
    transfer: () => { bump(); setTransferOpen(true); },
    newItem: () => { bump(); setItem({ open: true, editId: null }); },
    editItem: (id) => { bump(); setItem({ open: true, editId: id }); },
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <NewBillModal key={`bill-${nonce}`} isOpen={bill.open} onClose={() => setBill({ open: false, customerId: null })} customerId={bill.customerId} quotationId={bill.quotationId} />
      <ReturnItemsModal key={`ret-${nonce}`} invoiceId={returnFor} onClose={() => setReturnFor(null)} onDone={(id) => { bump(); setReturnFor(null); setDetailId(id); }} />
      <QuotationModal key={`quote-${nonce}`} isOpen={quote.open} editId={quote.editId} customerId={quote.customerId} onClose={() => setQuote({ open: false, editId: null, customerId: null })} />
      <BillDetailModal key={`detail-${nonce}`} invoiceId={detailId} onClose={() => setDetailId(null)} />
      <ExpenseModal key={`exp-${nonce}`} isOpen={expense.open} onClose={() => setExpense({ open: false })} date={expense.date} category={expense.category} />
      <ReceiveModal key={`rc-${nonce}`} isOpen={receive.open} onClose={() => setReceive({ open: false, customerId: null })} customerId={receive.customerId} />
      <TransferModal key={`tr-${nonce}`} isOpen={transferOpen} onClose={() => setTransferOpen(false)} />
      <ItemModal key={`item-${nonce}`} isOpen={item.open} onClose={() => setItem({ open: false, editId: null })} editId={item.editId} />
    </Ctx.Provider>
  );
};

export const useBillingUI = (): BillingUI => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useBillingUI must be used inside BillingUIProvider');
  return c;
};
