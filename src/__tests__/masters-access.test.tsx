import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { seedTestUsers, signIn, OPERATOR, VIEWER, MANAGER, OWNER, TestCredentials, makeTestUser, testUsers } from './helpers/auth';
import { matchesSearch, sameText } from '../utils/search';
import { filterParties } from '../utils/vouchers';
import { mapColumns, planImport } from '../utils/masterImport';
import { navGroupsFor, targetAllowed, NAV_ENTRIES, entryAllowed } from '../utils/navMap';
import { hasPermission, DEFAULT_ROLES } from '../lib/auth';
import { splitDocNumber } from '../components/control/ControlSettings';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const ADMIN = { username: 'nadia', password: 'Sarmaya@2026', name: 'Nadia Admin' };

const setup = async (who: TestCredentials) => {
  localStorage.setItem('tradeflow_customers_v2', JSON.stringify([{ id: 'c1', code: 'C-0001', name: 'Ali', company: 'Ali', phone: '0300', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]));
  localStorage.setItem('tradeflow_products_v2', JSON.stringify([{ id: 'p1', name: 'Oil tin', category: 'Ghee', unit: 'tin', unitPricePerKg: 1000, costPricePerKg: 800, stockKg: 50, minThresholdKg: 0 }]));
  seedTestUsers([...testUsers(), makeTestUser({ id: 'user-admin', name: ADMIN.name, username: ADMIN.username, role: 'admin' })]);
  const h = renderHook(() => useTrading(), { wrapper });
  await signIn(() => h.result.current, who);
  return h;
};
const access = (role: string) => ({ can: (p: any) => hasPermission({ role, roles: [role] }, p, DEFAULT_ROLES) });

beforeEach(() => localStorage.clear());

describe('search in the master lists', () => {
  it('finds items by group, part of a barcode, words in any order; Urdu typed on an Arabic keyboard', () => {
    expect(matchesSearch('ghee', ['Dalda 5 kg', 'DT5', '8964000111222', 'Ghee', 'Dalda'])).toBe(true);
    expect(matchesSearch('8964000111', ['x', '', '8964000111222'])).toBe(true);
    expect(matchesSearch('sufi 16', ['Sufi Banaspati 16 kg'])).toBe(true);
    expect(matchesSearch('sf16', ['x', 'SF-16'])).toBe(true);
    expect(matchesSearch('كريم', ['حاجی کریم'])).toBe(true);
    expect(sameText('habib', 'Habib')).toBe(true);
  });
  it('customers are found by contact person and Urdu name', () => {
    const rows = [{ name: 'حاجی کریم اینڈ سنز', phone: '0345' }, { name: 'Ali Raza', phone: '03001234567', contactPerson: 'Haji Karim' }];
    expect(filterParties(rows, 'haji karim', '')).toHaveLength(1);
    expect(filterParties(rows, 'كريم', '')).toHaveLength(1);
    expect(filterParties(rows, '0300 123', '')).toHaveLength(1);
  });
});

describe('CSV import', () => {
  it('a Customers screen download imports as it is; duplicate IDs and phones are skipped', () => {
    const headers = ['﻿Code', 'Name', 'Company', 'Phone', 'City', 'Contact person', 'Balance (Rs.)'];
    expect(mapColumns('customers', headers).missing).toEqual([]);
    const plan = planImport('customers', headers, [['C-0001', 'Dup', '', '0311111', '', '', '0'], ['C-0009', 'حاجی کریم', '', '0322222', 'Mingora', '', '0'], ['C-0010', 'Twin', '', '0322222', '', '', '0']], [{ name: 'Ali', code: 'C-0001', phone: '0300' }]);
    expect(plan.add.map((r) => r.values.name)).toEqual(['حاجی کریم']);
    expect(plan.skipped).toHaveLength(2);
  });
});

describe('document numbers', () => {
  it('"Next no." takes the whole old number', () => {
    expect(splitDocNumber('S-14727', 'INV-')).toEqual({ prefix: 'S-', number: 14727 });
    expect(splitDocNumber('CPV 1064', 'CPV-')).toEqual({ prefix: 'CPV-', number: 1064 });
    expect(splitDocNumber('12696', 'P-')).toEqual({ prefix: 'P-', number: 12696 });
  });
});

describe('roles', () => {
  it('menus, find and function keys: viewer cannot make anything; operator sees no accounts / admin', () => {
    const v = access('viewer');
    const o = access('operator');
    for (const a of ['newBill', 'newItem', 'receive', 'addExpense'] as const) expect(targetAllowed({ kind: 'action', action: a }, v)).toBe(false);
    expect(targetAllowed({ kind: 'action', action: 'newBill' }, o)).toBe(true);
    expect(targetAllowed({ kind: 'report', report: 'cash-book' }, o)).toBe(false);
    const ids = navGroupsFor(o).flatMap((g) => g.sections.flatMap((s) => s.entries.map((e) => e.id)));
    for (const id of ['chart-of-accounts', 'vouchers', 'bank-accounts', 'opening-balances', 'users', 'backups']) expect(ids).not.toContain(id);
    const m = access('manager');
    expect(entryAllowed(NAV_ENTRIES.find((e) => e.id === 'backups')!, m)).toBe(false);
  });

  it('viewer changes nothing; operator deletes nothing', async () => {
    const h = await setup(VIEWER);
    act(() => { h.result.current.updateCustomer('c1', { name: 'Hacked' }); });
    act(() => { h.result.current.addProduct({ name: 'x', category: 'g', unitPricePerKg: 1, stockKg: 1, minThresholdKg: 0 }); });
    expect(h.result.current.customers[0].name).toBe('Ali');
    expect(h.result.current.products).toHaveLength(1);
    act(() => { h.result.current.logout(); });
    await signIn(() => h.result.current, OPERATOR);
    act(() => { h.result.current.deleteCustomer('c1'); });
    act(() => { h.result.current.deleteProduct('p1'); });
    expect(h.result.current.customers).toHaveLength(1);
    expect(h.result.current.products).toHaveLength(1);
  });

  it('manager cannot restore a backup or change the security policy; admin cannot take over the owner', async () => {
    const h = await setup(MANAGER);
    expect(h.result.current.importSystemBackup('{}').success).toBe(false);
    act(() => { h.result.current.logout(); });
    await signIn(() => h.result.current, ADMIN);
    let r: any;
    await act(async () => { r = await h.result.current.resetUserPassword('user-superadmin', 'Takeover@2026'); });
    expect(r.success).toBe(false);
    act(() => { r = h.result.current.updateUser('user-admin', { roles: ['super_admin'] }); });
    expect(r.success).toBe(false);
    act(() => { h.result.current.logout(); });
    await signIn(() => h.result.current, OWNER);
    expect(h.result.current.can('data:write')).toBe(true);
  });
});
