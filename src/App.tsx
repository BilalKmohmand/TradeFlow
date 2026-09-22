import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TradingProvider, useTrading } from './context/TradingContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { CommandBar } from './components/CommandBar';
import { WhatsAppNotificationToast } from './components/WhatsAppNotificationToast';
import { WhatsAppDrawer } from './components/WhatsAppDrawer';
import { DispatchModal } from './components/DispatchModal';
import { BookingModal } from './components/BookingModal';
import { PaymentModal } from './components/PaymentModal';
import { CustomerModal } from './components/CustomerModal';
import { SupplierModal } from './components/SupplierModal';
import { ProductModal } from './components/ProductModal';
import { CustomerDetailModal } from './components/CustomerDetailModal';
import { SupplierDetailModal } from './components/SupplierDetailModal';
import { ProductDetailModal } from './components/ProductDetailModal';
import { BookingDetailModal } from './components/BookingDetailModal';
import { PurchaseModal } from './components/PurchaseModal';
import { PrintDocument, PrintRequest } from './components/PrintDocument';
import { OpsScreen } from './screens/OpsScreen';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';

// Screens
import { DashboardScreen } from './screens/DashboardScreen';
import { CustomersScreen } from './screens/CustomersScreen';
import { SuppliersScreen } from './screens/SuppliersScreen';
import { ProductsScreen } from './screens/ProductsScreen';
import { BookingsScreen } from './screens/BookingsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { AdminScreen } from './screens/AdminScreen';
import { AuthGate } from './components/AuthGate';
import { BillingUIProvider } from './components/billing/BillingUI';
import { BillingHomeScreen } from './screens/billing/BillingHomeScreen';
import { BillsScreen } from './screens/billing/BillsScreen';
import { ItemsScreen } from './screens/billing/ItemsScreen';
import { ReceiveStockModal } from './components/billing/InventoryUI';
import { DailySheetScreen } from './screens/billing/DailySheetScreen';
import { MoneyScreen } from './screens/billing/MoneyScreen';
import { CustomersBillingScreen } from './screens/billing/CustomersBillingScreen';
import { AccountsScreen } from './screens/billing/AccountsScreen';
import { SuppliersBillingScreen } from './screens/billing/SuppliersBillingScreen';
import { StockUIProvider } from './components/billing/StockUI';
import { OwnerDashboardScreen } from './screens/billing/OwnerDashboardScreen';
import { PurchasesScreen } from './screens/billing/PurchasesScreen';
import { ReportsHubScreen } from './screens/billing/ReportsHubScreen';

function MainApp() {
  const {
    activeScreen,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedSupplierId,
    setSelectedSupplierId,
    selectedProductId,
    setSelectedProductId,
    selectedBookingId,
    highlightDispatchId,
    openBooking,
    isAdminUnlocked,
    requestedOpsTab,
    printRequest,
    setPrintRequest,
    editRequest,
    setEditRequest,
    settings,
    setActiveScreen,
  } = useTrading();
  const isBilling = (settings.appMode || 'billing') === 'billing';
  // Trading-only screens have no place in simple billing: send the user home instead of showing them.
  useEffect(() => {
    if (isBilling && (activeScreen === 'bookings' || activeScreen === 'reports' || activeScreen === 'ops' || activeScreen === 'billing')) setActiveScreen('dashboard');
  }, [isBilling, activeScreen, setActiveScreen]);

  // Modal States
  const [isCommandBarOpen, setIsCommandBarOpen] = useState<boolean>(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const [preselectedBookingId, setPreselectedBookingId] = useState<string | null>(null);
  const [preselectedBookingItemId, setPreselectedBookingItemId] = useState<string | null>(null);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState<boolean>(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState<boolean>(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [paymentEntityType, setPaymentEntityType] = useState<'customer' | 'supplier'>('customer');
  const [paymentPreselectedId, setPaymentPreselectedId] = useState<string | null>(null);

  const [isWhatsAppDrawerOpen, setIsWhatsAppDrawerOpen] = useState<boolean>(false);

  // Receive Stock (purchase) modal
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState<boolean>(false);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<string | null>(null);
  const [purchaseProductId, setPurchaseProductId] = useState<string | null>(null);
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(null);
  // Simple billing uses the multi-item Receive stock form; purchase orders keep the goods-receipt form.
  const [receiveUI, setReceiveUI] = useState<{ n: number; open: boolean }>({ n: 0, open: false });
  const handleOpenPurchase = (opts?: { supplierId?: string | null; productId?: string | null; purchaseOrderId?: string | null }) => {
    setPurchaseSupplierId(opts?.supplierId ?? null);
    setPurchaseProductId(opts?.productId ?? null);
    setPurchaseOrderId(opts?.purchaseOrderId ?? null);
    if (isBilling && !opts?.purchaseOrderId) setReceiveUI((r) => ({ n: r.n + 1, open: true }));
    else setIsPurchaseModalOpen(true);
  };

  // Global keydown listener for CMD+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandBarOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenDispatch = (bookingId?: string, bookingItemId?: string) => {
    setPreselectedBookingId(bookingId || null);
    setPreselectedBookingItemId(bookingItemId || null);
    setIsDispatchModalOpen(true);
  };

  const handleOpenCustomerPayment = (customerId: string) => {
    setPaymentEntityType('customer');
    setPaymentPreselectedId(customerId);
    setIsPaymentModalOpen(true);
  };

  const handleOpenSupplierPayment = (supplierId: string) => {
    setPaymentEntityType('supplier');
    setPaymentPreselectedId(supplierId);
    setIsPaymentModalOpen(true);
  };

  // Sign-up / sign-in / lock screen / forced password change until a user is signed in.
  if (!isAdminUnlocked) {
    return <AuthGate />;
  }

  return (
    <BillingUIProvider>
    <StockUIProvider>
    <div className="min-h-screen print:min-h-0 w-full overflow-x-hidden bg-[#FAF9F6] dark:bg-[#090F17] text-[#111827] dark:text-[#F1F5F9] font-sans flex flex-col selection:bg-teal-700 selection:text-white transition-colors">
      {/* Navigation Header */}
      <Navbar
        onOpenCommandBar={() => setIsCommandBarOpen(true)}
      />

      {/* Sidebar + content */}
      <div className="flex-1 flex min-w-0 w-full print:hidden">
      <Sidebar onReceiveStock={() => handleOpenPurchase()} />
      {/* Main Content View with Smooth Transitions */}
      <main className={`flex-1 max-w-7xl min-w-0 w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-5 sm:pt-6 ${isBilling ? 'pb-bottom-bar' : 'pb-12'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeScreen}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeScreen === 'dashboard' && isBilling && <BillingHomeScreen />}
            {activeScreen === 'bills' && <BillsScreen />}
            {activeScreen === 'daily' && <DailySheetScreen />}
            {activeScreen === 'money' && <MoneyScreen />}
            {activeScreen === 'accounts' && <AccountsScreen />}
            {activeScreen === 'owner' && <OwnerDashboardScreen />}
            {activeScreen === 'purchases' && <PurchasesScreen />}
            {activeScreen === 'reports-hub' && <ReportsHubScreen />}
            {activeScreen === 'products' && isBilling && <ItemsScreen />}
            {activeScreen === 'dashboard' && !isBilling && (
              <DashboardScreen
                onOpenDispatch={handleOpenDispatch}
                onOpenBooking={() => setIsBookingModalOpen(true)}
                onOpenCustomer={(cId) => setSelectedCustomerId(cId)}
                onOpenWhatsAppDrawer={() => setIsWhatsAppDrawerOpen(true)}
                onReceiveStock={() => handleOpenPurchase()}
              />
            )}

            {activeScreen === 'customers' && isBilling && <CustomersBillingScreen onAdd={() => setIsCustomerModalOpen(true)} />}
            {activeScreen === 'customers' && !isBilling && (
              <CustomersScreen
                onSelectCustomer={(cId) => setSelectedCustomerId(cId)}
                onOpenAddCustomer={() => setIsCustomerModalOpen(true)}
                onOpenPayment={handleOpenCustomerPayment}
              />
            )}

            {activeScreen === 'suppliers' && isBilling && <SuppliersBillingScreen onAdd={() => setIsSupplierModalOpen(true)} />}
            {activeScreen === 'suppliers' && !isBilling && (
              <SuppliersScreen
                onSelectSupplier={(sId) => setSelectedSupplierId(sId)}
                onOpenAddSupplier={() => setIsSupplierModalOpen(true)}
                onOpenPayment={handleOpenSupplierPayment}
                onReceiveStock={(opts) => handleOpenPurchase(opts)}
              />
            )}

            {activeScreen === 'products' && !isBilling && (
              <ProductsScreen
                onOpenAddProduct={() => setIsProductModalOpen(true)}
                onOpenBooking={() => setIsBookingModalOpen(true)}
                onReceiveStock={(productId) => handleOpenPurchase({ productId })}
              />
            )}

            {activeScreen === 'bookings' && !isBilling && (
              <BookingsScreen
                onOpenNewBooking={() => setIsBookingModalOpen(true)}
                onOpenDispatchForBooking={handleOpenDispatch}
                onOpenCustomer={(cId) => setSelectedCustomerId(cId)}
              />
            )}

            {activeScreen === 'reports' && !isBilling && <ReportsScreen onReceiveStock={() => handleOpenPurchase()} />}

            {activeScreen === 'ops' && !isBilling && <OpsScreen initialTab={requestedOpsTab || 'alerts'} />}

            {activeScreen === 'admin' && <AdminScreen />}
          </motion.div>
        </AnimatePresence>
      </main>
      </div>

      {/* Phones & tablets in simple billing: bottom tab bar + "More" sheet (the sidebar takes over on desktop). */}
      {isBilling && <BottomNav />}

      {/* Global Command Bar (CMD+K) */}
      <CommandBar
        isOpen={isCommandBarOpen}
        onClose={() => setIsCommandBarOpen(false)}
        onOpenDispatch={handleOpenDispatch}
        onOpenBooking={() => setIsBookingModalOpen(true)}
        onOpenCustomer={(cId) => { setSelectedCustomerId(cId); if (isBilling) setActiveScreen('customers'); }}
        onOpenSupplier={(sId) => { setSelectedSupplierId(sId); if (isBilling) setActiveScreen('suppliers'); }}
        onOpenPayment={(type, id) => {
          if (type === 'customer' && id) handleOpenCustomerPayment(id);
          else if (type === 'supplier' && id) handleOpenSupplierPayment(id);
          else {
            setPaymentEntityType(type);
            setPaymentPreselectedId(null);
            setIsPaymentModalOpen(true);
          }
        }}
        onOpenCustomerModal={() => setIsCustomerModalOpen(true)}
        onOpenSupplierModal={() => setIsSupplierModalOpen(true)}
        onOpenProductModal={() => setIsProductModalOpen(true)}
        onOpenWhatsAppDrawer={() => setIsWhatsAppDrawerOpen(true)}
        onOpenPurchaseModal={() => handleOpenPurchase()}
        isBilling={isBilling}
      />

      {/* Toast Alert for background automated WhatsApp delivery */}
      <WhatsAppNotificationToast />

      {/* WhatsApp Automation Drawer */}
      <WhatsAppDrawer
        isOpen={isWhatsAppDrawerOpen}
        onClose={() => setIsWhatsAppDrawerOpen(false)}
      />

      {/* Smart Dispatch Modal */}
      <DispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => {
          setIsDispatchModalOpen(false);
          setPreselectedBookingId(null);
          setPreselectedBookingItemId(null);
        }}
        preselectedBookingId={preselectedBookingId}
        preselectedBookingItemId={preselectedBookingItemId}
      />

      {/* New Booking Modal */}
      <BookingModal
        isOpen={isBookingModalOpen || editRequest?.type === 'booking'}
        onClose={() => {
          setIsBookingModalOpen(false);
          if (editRequest?.type === 'booking') setEditRequest(null);
        }}
        editBookingId={editRequest?.type === 'booking' ? editRequest.id : null}
      />

      {/* Trading-suite detail windows. Simple billing opens the customer / supplier on its own screens instead. */}
      {!isBilling && <>
      {/* Customer Detail & Ledger Modal */}
      <CustomerDetailModal
        customerId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
        onOpenDispatchForBooking={handleOpenDispatch}
        onOpenPayment={handleOpenCustomerPayment}
      />

      {/* Supplier Detail & Ledger Modal */}
      <SupplierDetailModal
        supplierId={selectedSupplierId}
        onClose={() => setSelectedSupplierId(null)}
        onOpenPayment={handleOpenSupplierPayment}
        onReceiveStock={(supplierId) => handleOpenPurchase({ supplierId })}
      />

      {/* Product Detail: price history, stock in/out, bookings */}
      <ProductDetailModal
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onReceiveStock={(productId) => handleOpenPurchase({ productId })}
      />

      {/* Booking Detail: dispatches + ledger with cross-links */}
      <BookingDetailModal
        bookingId={selectedBookingId}
        highlightDispatchId={highlightDispatchId}
        onClose={() => openBooking(null)}
        onOpenDispatchForBooking={handleOpenDispatch}
      />
      </>}

      {/* Receive Stock (incoming purchase) */}
      <ReceiveStockModal
        key={`rcv-${receiveUI.n}`}
        isOpen={receiveUI.open}
        onClose={() => setReceiveUI((r) => ({ ...r, open: false }))}
        supplierId={purchaseSupplierId}
        productId={purchaseProductId}
      />
      <PurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        preselectedSupplierId={purchaseSupplierId}
        preselectedPurchaseOrderId={purchaseOrderId}
        preselectedProductId={purchaseProductId}
      />

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentPreselectedId(null);
        }}
        entityType={paymentEntityType}
        preselectedEntityId={paymentPreselectedId}
      />

      {/* Add Entity Modals */}
      <CustomerModal
        isOpen={isCustomerModalOpen || editRequest?.type === 'customer'}
        onClose={() => {
          setIsCustomerModalOpen(false);
          if (editRequest?.type === 'customer') setEditRequest(null);
        }}
        editId={editRequest?.type === 'customer' ? editRequest.id : null}
      />

      <SupplierModal
        isOpen={isSupplierModalOpen || editRequest?.type === 'supplier'}
        onClose={() => {
          setIsSupplierModalOpen(false);
          if (editRequest?.type === 'supplier') setEditRequest(null);
        }}
        editId={editRequest?.type === 'supplier' ? editRequest.id : null}
      />

      <ProductModal
        isOpen={isProductModalOpen || editRequest?.type === 'product'}
        onClose={() => {
          setIsProductModalOpen(false);
          if (editRequest?.type === 'product') setEditRequest(null);
        }}
        editId={editRequest?.type === 'product' ? editRequest.id : null}
      />

      {/* Printable documents (invoice, delivery challan, statements) */}
      <PrintDocument request={printRequest as PrintRequest | null} onClose={() => setPrintRequest(null)} />
    </div>
    </StockUIProvider>
    </BillingUIProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TradingProvider>
        <MainApp />
      </TradingProvider>
    </ThemeProvider>
  );
}

