import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * Cloud sync when supabase/setup.sql has not been re-run: a column the cloud table does not have yet is
 * left out and the rest of the table still syncs (instead of the whole upsert failing every time).
 */
const upserts: { table: string; keys: string[] }[] = [];

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => ({
      upsert: async (rows: Record<string, unknown>[]) => {
        const keys = Object.keys(rows[0] || {});
        upserts.push({ table, keys });
        if (table === 'customers' && keys.includes('code')) return { error: { message: "Could not find the 'code' column of 'customers' in the schema cache" } };
        return { error: null };
      },
    }),
  },
}));

vi.mock('../lib/database', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/database')>();
  const empty = () => [] as never[];
  return {
    ...real,
    deleteRows: vi.fn(async () => undefined),
    clearTable: vi.fn(async () => undefined),
    clearAllTables: vi.fn(async () => undefined),
    loadAllData: vi.fn(async () => ({
      customers: [{ id: 'c1', code: 'Z01', name: 'Zaman', company: 'Zaman', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }],
      suppliers: empty(), products: empty(), bookings: empty(), dispatches: empty(), purchases: empty(), priceHistory: empty(), expenses: empty(), trucks: empty(),
      users: empty(), cashEntries: empty(), settings: { appMode: 'billing' }, quotations: empty(), purchaseOrders: empty(), returns: empty(), adjustments: empty(), tasks: empty(),
      invoices: [], ledger: empty(), whatsappMessages: empty(), bankStatementLines: null, bankReconciliations: null, godowns: null, stockBatches: null, stockTransfers: null,
      journalEntries: null, accounts: null, customerAgreedRates: null, cheques: null, salesmen: null, areas: null, schemes: null, supplierBills: null, supplierClaims: null,
      finance: {}, approvals: null, deletedRecords: null, branches: null,
    })),
  };
});

import { TradingProvider, useTrading } from '../context/TradingContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;

beforeEach(() => {
  localStorage.clear();
  upserts.length = 0;
});

describe('cloud sync with an out-of-date cloud table', () => {
  it('drops the missing column, keeps syncing the rest, and remembers it for later saves', async () => {
    const hook = renderHook(() => useTrading(), { wrapper });
    await waitFor(() => expect(hook.result.current.isCloudSyncReady).toBe(true));
    await waitFor(() => expect(upserts.some((u) => u.table === 'customers' && !u.keys.includes('code'))).toBe(true));
    const cust = upserts.filter((u) => u.table === 'customers');
    expect(cust[0].keys).toContain('code');
    const retry = cust.find((u) => !u.keys.includes('code'))!;
    expect(retry.keys).toEqual(expect.arrayContaining(['id', 'name', 'phone', 'totalDue']));
    // A later change syncs straight away without the column (no failing first attempt).
    const before = upserts.length;
    act(() => hook.result.current.updateCustomer('c1', { phone: '0345' }));
    await waitFor(() => expect(upserts.slice(before).some((u) => u.table === 'customers')).toBe(true));
    expect(upserts.slice(before).filter((u) => u.table === 'customers').every((u) => !u.keys.includes('code'))).toBe(true);
    // The customer keeps its ID on this device.
    expect(hook.result.current.customers[0].code).toBe('Z01');
  });
});
