import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading, uid } from '../context/TradingContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;

const setup = () => {
  const hook = renderHook(() => useTrading(), { wrapper });
  act(() => {
    hook.result.current.unlockAdmin('7860');
  });
  return hook;
};

beforeEach(() => {
  localStorage.clear();
});

describe('ids', () => {
  it('never collide in a tight loop', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => uid('x')));
    expect(ids.size).toBe(2000);
  });
});

describe('sessions & permissions', () => {
  it('master PIN signs in as an administrator with every permission', () => {
    const { result } = setup();
    expect(result.current.isAdminUnlocked).toBe(true);
    expect(result.current.currentUser?.role).toBe('admin');
    expect(result.current.can('purge_data')).toBe(true);
  });
  it('rejects a wrong PIN and logs the attempt', () => {
    const { result } = renderHook(() => useTrading(), { wrapper });
    let ok = true;
    act(() => {
      ok = result.current.unlockAdmin('0000');
    });
    expect(ok).toBe(false);
    expect(result.current.isAdminUnlocked).toBe(false);
    expect(result.current.auditLogs[0].action).toBe('Invalid PIN Attempt');
  });
  it('operators can record transactions but not delete, see finance or open admin', () => {
    const { result } = setup();
    act(() => {
      expect(result.current.addUser({ name: 'Bilal', role: 'operator', pin: '1234' }).success).toBe(true);
    });
    act(() => {
      expect(result.current.addUser({ name: 'Dup', role: 'manager', pin: '1234' }).success).toBe(false);
    });
    act(() => {
      result.current.lockAdmin();
    });
    const userId = result.current.users[0].id;
    act(() => {
      expect(result.current.unlockAsUser(userId, '9999')).toBe(false);
    });
    act(() => {
      expect(result.current.unlockAsUser(userId, '1234')).toBe(true);
    });
    expect(result.current.currentUser?.name).toBe('Bilal');
    expect(result.current.can('delete_records')).toBe(false);
    expect(result.current.can('view_finance')).toBe(false);
    expect(result.current.can('admin_screen')).toBe(false);
    expect(result.current.can('manage_expenses')).toBe(true);
    act(() => {
      result.current.addExpense({ date: '2026-09-04', category: 'fuel', amount: 1500, description: 'diesel' });
    });
    expect(result.current.expenses[0].createdBy).toBe('Bilal');
    expect(result.current.auditLogs[0].user).toBe('Bilal');
  });
  it('deactivated users cannot sign in', () => {
    const { result } = setup();
    act(() => {
      result.current.addUser({ name: 'Sara', role: 'manager', pin: '2222' });
    });
    const id = result.current.users[0].id;
    act(() => {
      result.current.updateUser(id, { active: false });
    });
    act(() => {
      expect(result.current.unlockAsUser(id, '2222')).toBe(false);
    });
  });
});

describe('trading flow', () => {
  const seed = (result: { current: ReturnType<typeof useTrading> }) => {
    let customerId = '';
    let supplierId = '';
    let productId = '';
    act(() => {
      customerId = result.current.addCustomer({ name: 'Ali', company: 'Ali Traders', phone: '+92 300 1111111', email: '', address: '', creditLimit: 500000 }).id;
      supplierId = result.current.addSupplier({ name: 'Lucky', company: 'Lucky Cement', phone: '+92 300 2222222', email: '', materialCategory: 'Cement', address: '' }).id;
    });
    act(() => {
      productId = result.current.addProduct({ name: 'Cement', category: 'Construction', unitPricePerKg: 40, stockKg: 10000, minThresholdKg: 1000, supplierId }).id;
    });
    return { customerId, supplierId, productId };
  };

  it('booking -> dispatch updates stock, dues, ledger and price history; delete reverses all of it', () => {
    const { result } = setup();
    const { customerId, productId } = seed(result);
    expect(result.current.priceHistory).toHaveLength(1);

    let bookingId = '';
    act(() => {
      bookingId = result.current.createBooking({ customerId, productId, totalKg: 5000, pricePerKg: 40 }).id;
    });
    expect(result.current.bookings[0].totalAmount).toBe(200000);
    expect(result.current.priceHistory.some((p) => p.source === 'booking')).toBe(true);

    let dispatchId = '';
    act(() => {
      dispatchId = result.current.logDispatch({ bookingId, kg: 2000, truckNumber: 'les-1', sendWhatsApp: true }).dispatch.id;
    });
    const b = result.current.bookings[0];
    expect(b.dispatchedKg).toBe(2000);
    expect(b.remainingKg).toBe(3000);
    expect(result.current.products[0].stockKg).toBe(8000);
    expect(result.current.customers[0].totalDue).toBe(80000);
    expect(result.current.dispatches[0].truckNumber).toBe('LES-1');
    expect(result.current.ledger.filter((l) => l.entityId === customerId)).toHaveLength(1);
    expect(result.current.whatsappMessages[0].type).toBe('dispatch_alert');

    act(() => {
      result.current.recordCustomerPayment(customerId, 30000, 'bank');
    });
    expect(result.current.customers[0].totalDue).toBe(50000);

    act(() => {
      result.current.deleteDispatch(dispatchId);
    });
    expect(result.current.dispatches).toHaveLength(0);
    expect(result.current.products[0].stockKg).toBe(10000);
    expect(result.current.bookings[0].remainingKg).toBe(5000);
    expect(result.current.bookings[0].status).toBe('active');
    expect(result.current.customers[0].totalDue).toBe(0); // 50000 - 80000 clamped
    expect(result.current.ledger.filter((l) => l.type === 'dispatch_billed')).toHaveLength(0);
    expect(result.current.whatsappMessages.filter((m) => m.type === 'dispatch_alert')).toHaveLength(0);
  });

  it('paid-on-dispatch does not add to dues and marks the booking partial', () => {
    const { result } = setup();
    const { customerId, productId } = seed(result);
    let bookingId = '';
    act(() => {
      bookingId = result.current.createBooking({ customerId, productId, totalKg: 1000, pricePerKg: 40 }).id;
    });
    act(() => {
      result.current.logDispatch({ bookingId, kg: 400, truckNumber: 'x', paymentReceivedImmediately: true, sendWhatsApp: false });
    });
    expect(result.current.customers[0].totalDue).toBe(0);
    expect(result.current.bookings[0].paidAmount).toBe(16000);
    expect(result.current.bookings[0].paymentStatus).toBe('partial');
    expect(result.current.ledger.filter((l) => l.entityId === customerId)).toHaveLength(2);
  });

  it('receiving stock raises stock and the supplier payable; deleting it reverses', () => {
    const { result } = setup();
    const { supplierId, productId } = seed(result);
    let purchaseId = '';
    act(() => {
      purchaseId = result.current.addPurchase({ supplierId, productId, kg: 3000, pricePerKg: 25, date: '2026-09-01' }).id;
    });
    expect(result.current.products[0].stockKg).toBe(13000);
    expect(result.current.suppliers[0].totalOwed).toBe(75000);
    expect(result.current.ledger[0].type).toBe('purchase_received');
    act(() => {
      result.current.recordSupplierPayment(supplierId, 25000);
    });
    expect(result.current.suppliers[0].totalOwed).toBe(50000);
    act(() => {
      result.current.deletePurchase(purchaseId);
    });
    expect(result.current.products[0].stockKg).toBe(10000);
    expect(result.current.suppliers[0].totalOwed).toBe(0);
    expect(result.current.ledger.filter((l) => l.type === 'purchase_received')).toHaveLength(0);
  });

  it('deleting a customer cascades bookings, dispatches, ledger and messages', () => {
    const { result } = setup();
    const { customerId, productId } = seed(result);
    let bookingId = '';
    act(() => {
      bookingId = result.current.createBooking({ customerId, productId, totalKg: 1000, pricePerKg: 40 }).id;
    });
    act(() => {
      result.current.logDispatch({ bookingId, kg: 100, truckNumber: 'x' });
    });
    let summary: any;
    act(() => {
      summary = result.current.deleteCustomer(customerId);
    });
    expect(summary.bookings).toBe(1);
    expect(summary.dispatches).toBe(1);
    expect(result.current.customers).toHaveLength(0);
    expect(result.current.bookings).toHaveLength(0);
    expect(result.current.dispatches).toHaveLength(0);
    expect(result.current.ledger).toHaveLength(0);
    expect(result.current.whatsappMessages).toHaveLength(0);
    expect(result.current.products[0].stockKg).toBe(10000);
  });

  it('editing a booking recalculates amounts; cancelling keeps dispatches', () => {
    const { result } = setup();
    const { customerId, productId } = seed(result);
    let bookingId = '';
    act(() => {
      bookingId = result.current.createBooking({ customerId, productId, totalKg: 1000, pricePerKg: 40 }).id;
    });
    act(() => {
      result.current.logDispatch({ bookingId, kg: 300, truckNumber: 'x', sendWhatsApp: false });
    });
    act(() => {
      result.current.updateBooking(bookingId, { totalKg: 200, pricePerKg: 50 });
    });
    const b = result.current.bookings[0];
    expect(b.totalKg).toBe(300); // cannot go below dispatched
    expect(b.remainingKg).toBe(0);
    expect(b.status).toBe('completed');
    expect(b.totalAmount).toBe(15000);
    act(() => {
      result.current.updateBooking(bookingId, { totalKg: 1000 });
    });
    expect(result.current.bookings[0].status).toBe('active');
    act(() => {
      result.current.cancelBooking(bookingId, 'customer withdrew');
    });
    expect(result.current.bookings[0].status).toBe('cancelled');
    expect(result.current.bookings[0].cancelReason).toBe('customer withdrew');
    expect(result.current.dispatches).toHaveLength(1);
  });

  it('price changes are recorded in history and product deletion removes it', () => {
    const { result } = setup();
    const { productId } = seed(result);
    act(() => {
      result.current.updateProductPrice(productId, 45, 'market up');
    });
    act(() => {
      result.current.addPricePoint(productId, 30, '2025-09-01', 'last year');
    });
    expect(result.current.products[0].unitPricePerKg).toBe(45);
    expect(result.current.priceHistory).toHaveLength(3);
    act(() => {
      result.current.deleteProduct(productId);
    });
    expect(result.current.priceHistory).toHaveLength(0);
  });

  it('bulk reminders create one message per customer with unique ids', () => {
    const { result } = setup();
    act(() => {
      for (let i = 0; i < 5; i++) {
        const c = result.current.addCustomer({ name: `C${i}`, company: 'x', phone: `+92${i}`, email: '', address: '', creditLimit: 0 });
        result.current.updateCustomer(c.id, { totalDue: 100 });
      }
    });
    let count = 0;
    act(() => {
      count = result.current.runAutomatedOverdueCheck();
    });
    expect(count).toBe(5);
    expect(new Set(result.current.whatsappMessages.map((m) => m.id)).size).toBe(5);
  });

  it('factory reset wipes business data but keeps the session and PIN', () => {
    const { result } = setup();
    seed(result);
    act(() => {
      result.current.factoryResetAllData();
    });
    expect(result.current.customers).toHaveLength(0);
    expect(result.current.products).toHaveLength(0);
    expect(result.current.isAdminUnlocked).toBe(true);
    expect(result.current.adminPin).toBe('7860');
  });
});

describe('tax, freight and delivery', () => {
  it('applies sales tax and freight to the invoice, ledger and customer due; delete reverses the billed total', () => {
    const { result } = setup();
    let customerId = '';
    let productId = '';
    act(() => {
      customerId = result.current.addCustomer({ name: 'Ali', company: 'A', phone: '1', email: '', address: '', creditLimit: 0 }).id;
      productId = result.current.addProduct({ name: 'Cement', category: 'x', unitPricePerKg: 40, stockKg: 10000, minThresholdKg: 0 }).id;
    });
    act(() => {
      result.current.updateSettings({ taxRatePct: 18, taxLabel: 'GST' });
    });
    let bookingId = '';
    act(() => {
      bookingId = result.current.createBooking({ customerId, productId, totalKg: 1000, pricePerKg: 40 }).id;
    });
    let dispatchId = '';
    act(() => {
      dispatchId = result.current.logDispatch({ bookingId, kg: 100, truckNumber: 'x', freightCharge: 500, grossKg: 25100, tareKg: 25000, sendWhatsApp: false }).dispatch.id;
    });
    const d = result.current.dispatches[0];
    expect(d.amount).toBe(4000);
    expect(d.freightCharge).toBe(500);
    expect(d.taxAmount).toBe(810); // 18% of 4500
    expect(d.totalBilled).toBe(5310);
    expect(d.status).toBe('in_transit');
    expect(result.current.customers[0].totalDue).toBe(5310);
    expect(result.current.ledger[0].debit).toBe(5310);
    act(() => {
      result.current.markDelivered(dispatchId, { receivedBy: 'Guard', podNote: 'signed' });
    });
    expect(result.current.dispatches[0].status).toBe('delivered');
    expect(result.current.dispatches[0].receivedBy).toBe('Guard');
    act(() => {
      result.current.deleteDispatch(dispatchId);
    });
    expect(result.current.customers[0].totalDue).toBe(0);
    expect(result.current.products[0].stockKg).toBe(10000);
  });

  it('dispatching with a fleet vehicle puts it on trip and delivery frees it', () => {
    const { result } = setup();
    let customerId = '', productId = '', truckId = '';
    act(() => {
      customerId = result.current.addCustomer({ name: 'Ali', company: 'A', phone: '1', email: '', address: '', creditLimit: 0 }).id;
      productId = result.current.addProduct({ name: 'Cement', category: 'x', unitPricePerKg: 40, stockKg: 10000, minThresholdKg: 0 }).id;
      truckId = result.current.addTruck({ number: 'les-1', driverName: 'R', driverPhone: '', capacityKg: 20000, status: 'available' }).id;
    });
    let bookingId = '';
    act(() => { bookingId = result.current.createBooking({ customerId, productId, totalKg: 1000, pricePerKg: 40 }).id; });
    let dispatchId = '';
    act(() => { dispatchId = result.current.logDispatch({ bookingId, kg: 100, truckNumber: 'LES-1', truckId, sendWhatsApp: false }).dispatch.id; });
    expect(result.current.trucks[0].status).toBe('on_trip');
    act(() => { result.current.markDelivered(dispatchId); });
    expect(result.current.trucks[0].status).toBe('available');
  });
});
