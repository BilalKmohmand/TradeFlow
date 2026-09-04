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

// Screens
import { DashboardScreen } from './screens/DashboardScreen';
import { CustomersScreen } from './screens/CustomersScreen';
import { SuppliersScreen } from './screens/SuppliersScreen';
import { ProductsScreen } from './screens/ProductsScreen';
import { BookingsScreen } from './screens/BookingsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { AdminScreen } from './screens/AdminScreen';
import { AppStartPinGate } from './components/AppStartPinGate';

function MainApp() {
  const {
    activeScreen,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedSupplierId,
    setSelectedSupplierId,
    isAdminUnlocked,
  } = useTrading();

  // Modal States
  const [isCommandBarOpen, setIsCommandBarOpen] = useState<boolean>(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const [preselectedBookingId, setPreselectedBookingId] = useState<string | null>(null);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState<boolean>(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState<boolean>(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [paymentEntityType, setPaymentEntityType] = useState<'customer' | 'supplier'>('customer');
  const [paymentPreselectedId, setPaymentPreselectedId] = useState<string | null>(null);

  const [isWhatsAppDrawerOpen, setIsWhatsAppDrawerOpen] = useState<boolean>(false);

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

  const handleOpenDispatch = (bookingId?: string) => {
    setPreselectedBookingId(bookingId || null);
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

  // Master PIN Gate on start of web app
  if (!isAdminUnlocked) {
    return <AppStartPinGate />;
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#FAF9F6] dark:bg-[#090F17] text-[#111827] dark:text-[#F1F5F9] font-sans flex flex-col selection:bg-teal-700 selection:text-white transition-colors">
      {/* Navigation Header */}
      <Navbar
        onOpenCommandBar={() => setIsCommandBarOpen(true)}
      />

      {/* Main Content View with Smooth Transitions */}
      <main className="flex-1 max-w-7xl min-w-0 w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 pt-6 pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeScreen}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeScreen === 'dashboard' && (
              <DashboardScreen
                onOpenDispatch={handleOpenDispatch}
                onOpenBooking={() => setIsBookingModalOpen(true)}
                onOpenCustomer={(cId) => setSelectedCustomerId(cId)}
                onOpenWhatsAppDrawer={() => setIsWhatsAppDrawerOpen(true)}
              />
            )}

            {activeScreen === 'customers' && (
              <CustomersScreen
                onSelectCustomer={(cId) => setSelectedCustomerId(cId)}
                onOpenAddCustomer={() => setIsCustomerModalOpen(true)}
                onOpenPayment={handleOpenCustomerPayment}
              />
            )}

            {activeScreen === 'suppliers' && (
              <SuppliersScreen
                onSelectSupplier={(sId) => setSelectedSupplierId(sId)}
                onOpenAddSupplier={() => setIsSupplierModalOpen(true)}
                onOpenPayment={handleOpenSupplierPayment}
              />
            )}

            {activeScreen === 'products' && (
              <ProductsScreen
                onOpenAddProduct={() => setIsProductModalOpen(true)}
                onOpenBooking={() => setIsBookingModalOpen(true)}
              />
            )}

            {activeScreen === 'bookings' && (
              <BookingsScreen
                onOpenNewBooking={() => setIsBookingModalOpen(true)}
                onOpenDispatchForBooking={handleOpenDispatch}
                onOpenCustomer={(cId) => setSelectedCustomerId(cId)}
              />
            )}

            {activeScreen === 'reports' && <ReportsScreen />}

            {activeScreen === 'admin' && <AdminScreen />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global Command Bar (CMD+K) */}
      <CommandBar
        isOpen={isCommandBarOpen}
        onClose={() => setIsCommandBarOpen(false)}
        onOpenDispatch={handleOpenDispatch}
        onOpenBooking={() => setIsBookingModalOpen(true)}
        onOpenCustomer={(cId) => setSelectedCustomerId(cId)}
        onOpenSupplier={(sId) => setSelectedSupplierId(sId)}
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
        }}
        preselectedBookingId={preselectedBookingId}
      />

      {/* New Booking Modal */}
      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
      />

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
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
      />

      <SupplierModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
      />

      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
      />
    </div>
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

