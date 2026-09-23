import React, { createContext, useContext, useState } from 'react';
import { ReceiveStockModal } from './InventoryUI';
import { AdjustStockModal, ItemHistoryModal, PurchaseReturnModal } from './StockDialogs';
import { AgingModal } from './BillingReports';
import { useBillingUI } from './BillingUI';
import { useTrading } from '../../context/TradingContext';
import { useBillingShortcuts } from './useBillingShortcuts';
import { NavTarget, targetAllowed } from '../../utils/navMap';
import { PurchasingUIProvider } from './purchasing/PurchasingUI';

interface StockUI {
  /** With purchaseOrderId the dialog is filled from the order (what is still to come, at the order rates). */
  receiveStock: (opts?: { productId?: string | null; supplierId?: string | null; purchaseOrderId?: string | null }) => void;
  adjustStock: (productId?: string | null) => void;
  itemHistory: (productId: string) => void;
  purchaseReturn: (opts?: { supplierId?: string | null; productId?: string | null }) => void;
  aging: (side?: 'customers' | 'suppliers') => void;
}

const Ctx = createContext<StockUI | null>(null);

type Open =
  | { kind: 'receive'; productId?: string | null; supplierId?: string | null; purchaseOrderId?: string | null }
  | { kind: 'adjust'; productId?: string | null }
  | { kind: 'return'; productId?: string | null; supplierId?: string | null }
  | { kind: 'aging'; side: 'customers' | 'suppliers' }
  | null;

/** Hosts the stock dialogs (receive, adjust, item history, return to supplier) and the aging report once for all billing screens. */
export const StockUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const billing = useBillingUI();
  const [open, setOpen] = useState<Open>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  // Every open bumps the nonce so the dialog remounts with fresh fields.
  const [nonce, setNonce] = useState(0);
  const show = (o: Open) => { setNonce((n) => n + 1); setOpen(o); };
  const close = () => setOpen(null);

  const api: StockUI = {
    receiveStock: (opts) => show({ kind: 'receive', ...opts }),
    adjustStock: (productId) => show({ kind: 'adjust', productId }),
    itemHistory: (productId) => { setNonce((n) => n + 1); setHistoryId(productId); },
    purchaseReturn: (opts) => show({ kind: 'return', ...opts }),
    aging: (side = 'customers') => show({ kind: 'aging', side }),
  };

  // Desktop function keys: F2 new bill, F3 receive payment, F4 add expense, F6 receive stock, F9 cash book.
  // A key the signed-in role may not use does nothing (same rules as the menus: navMap ACTION_ACCESS).
  const { settings, can } = useTrading();
  const may = (t: NavTarget) => targetAllowed(t, { can });
  useBillingShortcuts((settings.appMode || 'billing') === 'billing', {
    newBill: may({ kind: 'action', action: 'newBill' }) ? () => billing.newBill() : undefined,
    receive: may({ kind: 'action', action: 'receive' }) ? () => billing.receive() : undefined,
    expense: may({ kind: 'action', action: 'addExpense' }) ? () => billing.addExpense() : undefined,
    receiveStock: may({ kind: 'action', action: 'receiveStock' }) ? () => api.receiveStock() : undefined,
    cashBook: may({ kind: 'report', report: 'cash-book' }) ? () => billing.openReport('cash-book') : undefined,
  });

  return (
    <Ctx.Provider value={api}>
      <PurchasingUIProvider receiveOrder={(purchaseOrderId) => api.receiveStock({ purchaseOrderId })}>{children}</PurchasingUIProvider>
      <ItemHistoryModal
        key={`hist-${historyId}`}
        productId={historyId}
        onClose={() => setHistoryId(null)}
        onAdjust={(id) => show({ kind: 'adjust', productId: id })}
        onReceive={(id) => show({ kind: 'receive', productId: id })}
        onOpenBill={(id) => { setHistoryId(null); billing.openBill(id); }}
      />
      <ReceiveStockModal key={`srcv-${nonce}`} isOpen={open?.kind === 'receive'} onClose={close} productId={open?.kind === 'receive' ? open.productId : null} supplierId={open?.kind === 'receive' ? open.supplierId : null} purchaseOrderId={open?.kind === 'receive' ? open.purchaseOrderId : null} />
      <AdjustStockModal key={`sadj-${nonce}`} isOpen={open?.kind === 'adjust'} onClose={close} productId={open?.kind === 'adjust' ? open.productId : null} />
      <PurchaseReturnModal key={`sret-${nonce}`} isOpen={open?.kind === 'return'} onClose={close} supplierId={open?.kind === 'return' ? open.supplierId : null} productId={open?.kind === 'return' ? open.productId : null} />
      <AgingModal key={`sage-${nonce}`} isOpen={open?.kind === 'aging'} onClose={close} side={open?.kind === 'aging' ? open.side : 'customers'} />
    </Ctx.Provider>
  );
};

export const useStockUI = (): StockUI => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStockUI must be used inside StockUIProvider');
  return c;
};
