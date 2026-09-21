import React, { createContext, useContext, useEffect, useState } from 'react';
import { PurchaseOrderModal, PurchaseOrderDetail } from './PurchaseOrders';
import { SupplierBillModal } from './SupplierBills';
import { SupplierClaimModal } from './SupplierClaims';
import { ReorderModal } from './Reorder';
import { BarcodeLabelsModal } from './Barcodes';

export interface PurchasingUI {
  newOrder: (opts?: { supplierId?: string | null; lines?: { productId: string; qty: number; rate: number }[] }) => void;
  editOrder: (id: string) => void;
  openOrder: (id: string) => void;
  recordBill: (opts?: { supplierId?: string | null; purchaseOrderId?: string | null }) => void;
  newClaim: (opts?: { supplierId?: string | null; purchaseId?: string | null; productId?: string | null }) => void;
  reorder: () => void;
  labels: (productIds?: string[]) => void;
}

const Ctx = createContext<PurchasingUI | null>(null);

type Open =
  | { kind: 'order'; editId?: string | null; supplierId?: string | null; lines?: { productId: string; qty: number; rate: number }[] }
  | { kind: 'bill'; supplierId?: string | null; purchaseOrderId?: string | null }
  | { kind: 'claim'; supplierId?: string | null; purchaseId?: string | null; productId?: string | null }
  | { kind: 'reorder' }
  | { kind: 'labels'; productIds?: string[] }
  | null;

/**
 * Hosts the purchasing dialogs once for all billing screens (orders, supplier bills, claims,
 * re-order report, barcode labels). `receiveOrder` opens Receive stock filled from an order.
 */
export const PurchasingUIProvider: React.FC<{ children: React.ReactNode; receiveOrder: (purchaseOrderId: string) => void }> = ({ children, receiveOrder }) => {
  const [open, setOpen] = useState<Open>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [toast, setToast] = useState('');
  const show = (o: Open) => { setNonce((n) => n + 1); setOpen(o); };
  const close = () => setOpen(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const api: PurchasingUI = {
    newOrder: (opts) => show({ kind: 'order', ...opts }),
    editOrder: (id) => { setDetailId(null); show({ kind: 'order', editId: id }); },
    openOrder: (id) => { setNonce((n) => n + 1); setDetailId(id); },
    recordBill: (opts) => { setDetailId(null); show({ kind: 'bill', ...opts }); },
    newClaim: (opts) => show({ kind: 'claim', ...opts }),
    reorder: () => show({ kind: 'reorder' }),
    labels: (productIds) => show({ kind: 'labels', productIds }),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {open?.kind === 'order' && <PurchaseOrderModal key={`po-${nonce}`} isOpen onClose={close} editId={open.editId} supplierId={open.supplierId} lines={open.lines} onSaved={(po) => { setToast(`Purchase order ${po.poNumber} saved.`); setDetailId(po.id); }} />}
      {detailId && <PurchaseOrderDetail key={`pod-${nonce}`} orderId={detailId} onClose={() => setDetailId(null)} onEdit={api.editOrder} onReceive={(id) => { setDetailId(null); receiveOrder(id); }} onBill={(id) => api.recordBill({ purchaseOrderId: id })} />}
      {open?.kind === 'bill' && <SupplierBillModal key={`sb-${nonce}`} isOpen onClose={close} supplierId={open.supplierId} purchaseOrderId={open.purchaseOrderId} onSaved={setToast} />}
      {open?.kind === 'claim' && <SupplierClaimModal key={`cl-${nonce}`} isOpen onClose={close} supplierId={open.supplierId} purchaseId={open.purchaseId} productId={open.productId} onSaved={setToast} />}
      {open?.kind === 'reorder' && <ReorderModal key={`ro-${nonce}`} isOpen onClose={close} onMade={setToast} />}
      {open?.kind === 'labels' && <BarcodeLabelsModal key={`lb-${nonce}`} isOpen onClose={close} productIds={open.productIds} />}
      {toast && (
        <div role="status" className="fixed z-[80] left-1/2 -translate-x-1/2 bottom-24 sm:bottom-6 max-w-[calc(100vw-2rem)] rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] px-4 py-3 text-sm font-semibold shadow-xl print:hidden" data-testid="purchasing-toast">
          {toast}
        </div>
      )}
    </Ctx.Provider>
  );
};

export const usePurchasingUI = (): PurchasingUI => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePurchasingUI must be used inside PurchasingUIProvider');
  return c;
};
