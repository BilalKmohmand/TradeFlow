import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { OWNER, seedTestUsers } from './helpers/auth';

const seedLocal = () => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'trading' });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Ali Raza', company: 'Raza Traders', phone: '+92 300 2222222', email: '', address: '', totalDue: 500000, creditLimit: 5000000, createdAt: '2026-09-01' }]);
  set('tradeflow_products_v2', [{ id: 'p1', name: 'OPC Cement', category: 'Construction', unitPricePerKg: 25, stockKg: 480000, minThresholdKg: 100000 }]);
  set('tradeflow_bookings_v2', [{ id: 'b1', bookingNumber: 'BK-2026-514', customerId: 'c1', productId: 'p1', totalKg: 50000, dispatchedKg: 20000, remainingKg: 30000, pricePerKg: 25, totalAmount: 1250000, paidAmount: 0, status: 'active', paymentStatus: 'unpaid', createdAt: '2026-09-04' }]);
  set('tradeflow_dispatches_v2', [{ id: 'd1', dispatchNumber: 'DSP-2026-521', bookingId: 'b1', customerId: 'c1', productId: 'p1', kg: 20000, amount: 500000, truckNumber: 'LES-8921', date: '2026-09-04', whatsappSent: false }]);
};

/** Sign in through the real form: username + password. */
const unlock = async () => {
  const form = await screen.findByTestId('login-form');
  expect(form).toBeTruthy();
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: OWNER.username } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: OWNER.password } });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  });
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Trading Overview' })).toBeTruthy(), { timeout: 5000 });
};

describe('App integration', () => {
  // Full app render + real password hashing: slow on a busy machine.
  vi.setConfig({ testTimeout: 20_000 });
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    seedLocal();
    seedTestUsers();
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
    expect(screen.getByText(/Dispatches.*\(1\)/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Print invoice'));
    });
    expect(screen.getByText('TAX INVOICE')).toBeTruthy();
    expect(screen.queryByText(/Dispatches.*\(1\)/), 'booking modal must stay open under the preview').toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByText('TAX INVOICE')).toBeNull();
    expect(screen.queryByText(/Dispatches.*\(1\)/), 'Escape on the preview must not close the booking').toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByText(/Dispatches.*\(1\)/)).toBeNull();
  });

  it('Admin nav opens the admin screen for the owner', async () => {
    render(<App />);
    await unlock();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Admin' })[0]);
    });
    expect(screen.getByRole('heading', { name: /Admin(istrator)? Control Center/ })).toBeTruthy();
  });
});
