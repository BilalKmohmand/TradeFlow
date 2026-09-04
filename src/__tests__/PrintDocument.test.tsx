import { describe, it, expect } from 'vitest';
import React, { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { PrintDocument } from '../components/PrintDocument';

const Harness: React.FC = () => {
  const t = useTrading();
  const [request, setRequest] = useState<any>(null);
  return (
    <div>
      <button
        onClick={() => {
          t.unlockAdmin('7860');
          t.addCustomer({ name: 'Ali', company: 'Raza', phone: '1', email: '', address: '', creditLimit: 0 });
          t.addProduct({ name: 'Cement', category: 'x', unitPricePerKg: 25, stockKg: 100000, minThresholdKg: 0 });
        }}
      >
        step1
      </button>
      <button onClick={() => t.createBooking({ customerId: t.customers[0].id, productId: t.products[0].id, totalKg: 1000, pricePerKg: 25 })}>step2</button>
      <button
        onClick={() => {
          const d = t.logDispatch({ bookingId: t.bookings[0].id, kg: 100, truckNumber: 'X', sendWhatsApp: false }).dispatch;
          setRequest({ type: 'invoice', dispatchId: d.id });
        }}
      >
        step3
      </button>
      <PrintDocument request={request} onClose={() => setRequest(null)} />
    </div>
  );
};

describe('PrintDocument', () => {
  it('renders an invoice for a dispatch and closes on Escape', async () => {
    localStorage.clear();
    render(
      <TradingProvider>
        <Harness />
      </TradingProvider>
    );
    for (const step of ['step1', 'step2', 'step3']) {
      await act(async () => {
        screen.getByText(step).click();
      });
    }
    expect(screen.getByText('TAX INVOICE')).toBeTruthy();
    expect(screen.getAllByText('Rs 2,500').length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByText('TAX INVOICE')).toBeNull();
  });
});
