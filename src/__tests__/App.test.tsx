import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import App from '../App';

const seedLocal = () => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Ali Raza', company: 'Raza Traders', phone: '+92 300 2222222', email: '', address: '', totalDue: 500000, creditLimit: 5000000, createdAt: '2026-09-01' }]);
  set('tradeflow_products_v2', [{ id: 'p1', name: 'OPC Cement', category: 'Construction', unitPricePerKg: 25, stockKg: 480000, minThresholdKg: 100000 }]);
  set('tradeflow_bookings_v2', [{ id: 'b1', bookingNumber: 'BK-2026-514', customerId: 'c1', productId: 'p1', totalKg: 50000, dispatchedKg: 20000, remainingKg: 30000, pricePerKg: 25, totalAmount: 1250000, paidAmount: 0, status: 'active', paymentStatus: 'unpaid', createdAt: '2026-09-04' }]);
  set('tradeflow_dispatches_v2', [{ id: 'd1', dispatchNumber: 'DSP-2026-521', bookingId: 'b1', customerId: 'c1', productId: 'p1', kg: 20000, amount: 500000, truckNumber: 'LES-8921', date: '2026-09-04', whatsappSent: false }]);
};

const unlock = async () => {
  for (const d of '7860') {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: d }));
    });
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });
  expect(screen.getByRole('heading', { name: 'Trading Overview' })).toBeTruthy();
};

describe('App integration', () => {
  beforeEach(() => {
    localStorage.clear();
    seedLocal();
  });

  it('unlocks, opens a booking, prints its invoice while keeping the booking open, and Escape closes only the preview', async () => {
    render(<App />);
    await unlock();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Bookings' })[0]);
    });
    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'BK-2026-514' }));
    });
    expect(screen.getByText('Dispatches (1)')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Print invoice'));
    });
    expect(screen.getByText('TAX INVOICE')).toBeTruthy();
    expect(screen.queryByText('Dispatches (1)'), 'booking modal must stay open under the preview').toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByText('TAX INVOICE')).toBeNull();
    expect(screen.queryByText('Dispatches (1)'), 'Escape on the preview must not close the booking').toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByText('Dispatches (1)')).toBeNull();
  });

  it('Admin nav opens the admin screen for the master PIN user', async () => {
    render(<App />);
    await unlock();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Admin' })[0]);
    });
    expect(screen.getByRole('heading', { name: 'Admin Control Center' })).toBeTruthy();
    expect(within(screen.getByRole('heading', { name: 'Admin Control Center' }).closest('div')!).getByText('Administrator')).toBeTruthy();
  });
});
