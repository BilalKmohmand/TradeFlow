import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { stockByGodown, expiryStatus, expiryAlerts, reconcileBatches, fmtExpiry, MAIN_GODOWN_ID } from '../utils/inventory';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

const setup = async () => {
  localStorage.setItem('tradeflow_customers_v2', JSON.stringify([{ id: 'c1', name: 'Zaman & Co', company: 'Zaman & Co', phone: '0344', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]));
  localStorage.setItem('tradeflow_suppliers_v2', JSON.stringify([{ id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '0300', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' }]));
  localStorage.setItem('tradeflow_products_v2', JSON.stringify([
    { id: 'p1', name: '5 kgs Can', category: 'General', unit: 'can', unitPricePerKg: 2065, stockKg: 0, minThresholdKg: 0, trackBatches: true },
    { id: 'p2', name: '15.7 kgs Tin', category: 'General', unit: 'tin', unitPricePerKg: 6535, stockKg: 100, minThresholdKg: 10 },
  ]));
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2'].forEach((k) => localStorage.setItem(k, '[]'));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current);
  return hook;
};

type Hook = Awaited<ReturnType<typeof setup>>;
const product = (h: Hook, id: string) => h.result.current.products.find((p) => p.id === id)!;
const batchesOf = (h: Hook, id: string) => h.result.current.stockBatches.filter((b) => b.productId === id && b.batchNo);
/** Invariant: stockKg equals the sum over all godowns and never leaves rows claiming more than the total. */
const expectConsistent = (h: Hook) => {
  const { products, stockBatches, godowns } = h.result.current;
  for (const p of products) {
    const per = stockByGodown(p, stockBatches, godowns);
    const sum = Object.values(per).reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100) / 100).toBe(p.stockKg);
  }
};

beforeEach(() => {
  localStorage.clear();
  // jsdom has no blob URLs; the backup export only needs them for the download link.
  (URL as any).createObjectURL = () => 'blob:test';
  (URL as any).revokeObjectURL = () => {};
});

describe('receive stock into batches', () => {
  it('adds batches, raises stockKg, and books a purchase owed to the supplier when cost + supplier are given', async () => {
    const h = await setup();
    act(() => {
      const r = h.result.current.receiveStock({ productId: 'p1', qty: 50, batchNo: 'LATE', expiryDate: shiftDate(today, 200), costPrice: 1800, supplierId: 's1' });
      expect(r.success).toBe(true);
    });
    act(() => {
      h.result.current.receiveStock({ productId: 'p1', qty: 30, batchNo: 'EARLY', expiryDate: shiftDate(today, 20) });
    });
    expect(product(h, 'p1').stockKg).toBe(80);
    expect(batchesOf(h, 'p1').map((b) => [b.batchNo, b.qty])).toEqual([['LATE', 50], ['EARLY', 30]]);
    // Only the costed receipt with a supplier is a purchase on the supplier's account.
    expect(h.result.current.purchases).toHaveLength(1);
    expect(h.result.current.purchases[0].amount).toBe(90000);
    expect(h.result.current.suppliers[0].totalOwed).toBe(90000);
    expect(h.result.current.ledger.some((l) => l.type === 'purchase_received' && l.debit === 90000)).toBe(true);
    expectConsistent(h);
  });
});

describe('bills take batch stock first-expiry-first-out', () => {
  const receiveTwo = (h: Hook) => {
    act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 50, batchNo: 'LATE', expiryDate: shiftDate(today, 200) }); });
    act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 30, batchNo: 'EARLY', expiryDate: shiftDate(today, 20) }); });
  };

  it('allocates across batches earliest expiry first and records it on the bill line', async () => {
    const h = await setup();
    receiveTwo(h);
    let res: ReturnType<Hook['result']['current']['createBill']> | undefined;
    act(() => {
      res = h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: '5 kgs Can', qty: 40, unitPrice: 2065 }], paidNow: 0 });
    });
    expect(res?.success).toBe(true);
    const line = h.result.current.invoices[0].items[0];
    expect(line.batches?.map((b) => [b.batchNo, b.qty])).toEqual([['EARLY', 30], ['LATE', 10]]);
    expect(product(h, 'p1').stockKg).toBe(40);
    expect(batchesOf(h, 'p1').find((b) => b.batchNo === 'EARLY')!.qty).toBe(0);
    expect(batchesOf(h, 'p1').find((b) => b.batchNo === 'LATE')!.qty).toBe(40);
    expectConsistent(h);
  });

  it('two lines of the same item in one bill continue down the batches', async () => {
    const h = await setup();
    receiveTwo(h);
    act(() => {
      h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'a', qty: 20, unitPrice: 1 }, { productId: 'p1', name: 'b', qty: 20, unitPrice: 1 }], paidNow: 0 });
    });
    const [a, b] = h.result.current.invoices[0].items;
    expect(a.batches?.map((x) => [x.batchNo, x.qty])).toEqual([['EARLY', 20]]);
    expect(b.batches?.map((x) => [x.batchNo, x.qty])).toEqual([['EARLY', 10], ['LATE', 10]]);
    expectConsistent(h);
  });

  it('skips an expired batch, and refuses with a clear message when only expired stock is left', async () => {
    const h = await setup();
    // An old batch received a while ago that has now expired.
    act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 10, batchNo: 'OLD', expiryDate: shiftDate(today, 5), date: shiftDate(today, -60) }); });
    act(() => {
      h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'x', qty: 1, unitPrice: 1 }], paidNow: 0 });
    });
    // Make it expired by moving the expiry into the past (as time passing would).
    const old = batchesOf(h, 'p1')[0];
    act(() => {
      h.result.current.importSystemBackup(JSON.stringify({ ...JSON.parse(h.result.current.exportSystemBackup()), stockBatches: [{ ...old, expiryDate: shiftDate(today, -1) }] }));
    });
    act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 5, batchNo: 'FRESH', expiryDate: shiftDate(today, 90) }); });
    let res: ReturnType<Hook['result']['current']['createBill']> | undefined;
    act(() => {
      res = h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'x', qty: 5, unitPrice: 1 }], paidNow: 0 });
    });
    expect(res?.success).toBe(true);
    expect(h.result.current.invoices[0].items[0].batches?.map((b) => b.batchNo)).toEqual(['FRESH']);
    // Now only the expired batch holds stock.
    const before = h.result.current.invoices.length;
    act(() => {
      res = h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'x', qty: 2, unitPrice: 1 }], paidNow: 0 });
    });
    expect(res?.success).toBe(false);
    expect(res?.message).toMatch(/only expired stock is left/i);
    expect(res?.message).toContain(fmtExpiry(shiftDate(today, -1)));
    expect(h.result.current.invoices.length).toBe(before);
    expect(product(h, 'p1').stockKg).toBe(9);
    expectConsistent(h);
  });

  it('deleting a bill puts the quantity back into the exact batches', async () => {
    const h = await setup();
    receiveTwo(h);
    act(() => {
      h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'x', qty: 45, unitPrice: 10 }], paidNow: 0 });
    });
    expect(batchesOf(h, 'p1').map((b) => [b.batchNo, b.qty])).toEqual([['LATE', 35], ['EARLY', 0]]);
    act(() => {
      h.result.current.deleteBill(h.result.current.invoices[0].id);
    });
    expect(batchesOf(h, 'p1').map((b) => [b.batchNo, b.qty])).toEqual([['LATE', 50], ['EARLY', 30]]);
    expect(product(h, 'p1').stockKg).toBe(80);
    expectConsistent(h);
  });
});

describe('godowns and transfers', () => {
  it('transfers keep the total, and a bill from the second godown takes stock from there', async () => {
    const h = await setup();
    let gid = '';
    act(() => {
      const r = h.result.current.addGodown('Batkhela godown');
      gid = r.godown!.id;
    });
    expect(h.result.current.godowns.map((g) => g.name)).toEqual(['Main godown', 'Batkhela godown']);
    // Plain item p2: 100 in main → move 30.
    act(() => {
      const r = h.result.current.transferStock({ productId: 'p2', fromGodownId: MAIN_GODOWN_ID, toGodownId: gid, qty: 30, note: 'for shop' });
      expect(r.success).toBe(true);
    });
    expect(product(h, 'p2').stockKg).toBe(100);
    let per = stockByGodown(product(h, 'p2'), h.result.current.stockBatches, h.result.current.godowns);
    expect(per[MAIN_GODOWN_ID]).toBe(70);
    expect(per[gid]).toBe(30);
    expect(h.result.current.stockTransfers).toHaveLength(1);
    expectConsistent(h);

    // Cannot move more than the godown holds.
    act(() => {
      const r = h.result.current.transferStock({ productId: 'p2', fromGodownId: gid, toGodownId: MAIN_GODOWN_ID, qty: 31 });
      expect(r.success).toBe(false);
    });

    // Bill 10 from the second godown.
    act(() => {
      const r = h.result.current.createBill({ customerId: 'c1', godownId: gid, items: [{ productId: 'p2', name: 'Tin', qty: 10, unitPrice: 6535 }], paidNow: 0 });
      expect(r.success).toBe(true);
    });
    per = stockByGodown(product(h, 'p2'), h.result.current.stockBatches, h.result.current.godowns);
    expect(product(h, 'p2').stockKg).toBe(90);
    expect(per[gid]).toBe(20);
    expect(per[MAIN_GODOWN_ID]).toBe(70);
    expect(h.result.current.invoices[0].items[0].godownId).toBe(gid);
    // A second godown cannot be oversold.
    act(() => {
      const r = h.result.current.createBill({ customerId: 'c1', godownId: gid, items: [{ productId: 'p2', name: 'Tin', qty: 25, unitPrice: 1 }], paidNow: 0 });
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/only 20 tin/i);
    });
    // Deleting the bill returns stock to the second godown.
    act(() => { h.result.current.deleteBill(h.result.current.invoices[0].id); });
    per = stockByGodown(product(h, 'p2'), h.result.current.stockBatches, h.result.current.godowns);
    expect(per[gid]).toBe(30);
    expectConsistent(h);
  });

  it('moves batches with their number and expiry', async () => {
    const h = await setup();
    let gid = '';
    act(() => { gid = h.result.current.addGodown('Store 2').godown!.id; });
    act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 20, batchNo: 'A1', expiryDate: shiftDate(today, 100) }); });
    act(() => { h.result.current.transferStock({ productId: 'p1', fromGodownId: MAIN_GODOWN_ID, toGodownId: gid, qty: 8 }); });
    const moved = batchesOf(h, 'p1').find((b) => b.godownId === gid)!;
    expect(moved.batchNo).toBe('A1');
    expect(moved.expiryDate).toBe(shiftDate(today, 100));
    expect(moved.qty).toBe(8);
    expect(product(h, 'p1').stockKg).toBe(20);
    expectConsistent(h);
  });

  it("can't delete a godown that still has stock, or the main godown", async () => {
    const h = await setup();
    let gid = '';
    act(() => { gid = h.result.current.addGodown('Store 2').godown!.id; });
    act(() => { h.result.current.receiveStock({ productId: 'p2', qty: 5, godownId: gid }); });
    act(() => {
      const r = h.result.current.deleteGodown(gid);
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/still holds 5/);
    });
    act(() => { expect(h.result.current.deleteGodown(MAIN_GODOWN_ID).success).toBe(false); });
    act(() => { h.result.current.transferStock({ productId: 'p2', fromGodownId: gid, toGodownId: MAIN_GODOWN_ID, qty: 5 }); });
    act(() => { expect(h.result.current.deleteGodown(gid).success).toBe(true); });
    expect(h.result.current.godowns).toHaveLength(1);
    expect(product(h, 'p2').stockKg).toBe(105);
    expectConsistent(h);
  });

  it('renames godowns (including the main one)', async () => {
    const h = await setup();
    act(() => { expect(h.result.current.updateGodown(MAIN_GODOWN_ID, { name: 'Shop' }).success).toBe(true); });
    expect(h.result.current.godowns[0].name).toBe('Shop');
    expect(h.result.current.godowns[0].isDefault).toBe(true);
  });
});

describe('plain items and older actions', () => {
  it('non-batch items in a one-godown shop behave exactly as before (can go negative, no rows)', async () => {
    const h = await setup();
    act(() => { h.result.current.updateSettings({ allowNegativeStock: true }); });
    act(() => {
      h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p2', name: 'Tin', qty: 120, unitPrice: 1 }], paidNow: 0 });
    });
    expect(product(h, 'p2').stockKg).toBe(-20);
    expect(h.result.current.stockBatches).toHaveLength(0);
    const line = h.result.current.invoices[0].items[0];
    expect(line.batches).toBeUndefined();
    expect(line.godownId).toBeUndefined();
    act(() => { h.result.current.deleteBill(h.result.current.invoices[0].id); });
    expect(product(h, 'p2').stockKg).toBe(100);
  });

  it('stock edited down elsewhere comes out of batches (earliest expiry first) so the total always matches', async () => {
    const h = await setup();
    act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 10, batchNo: 'B', expiryDate: shiftDate(today, 100) }); });
    act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 10, batchNo: 'A', expiryDate: shiftDate(today, 50) }); });
    act(() => { h.result.current.updateProduct('p1', { stockKg: 12 }); });
    expect(batchesOf(h, 'p1').map((b) => [b.batchNo, b.qty])).toEqual([['B', 10], ['A', 2]]);
    expectConsistent(h);
  });

  it('batches of a deleted item are dropped', async () => {
    const h = await setup();
    act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 10, batchNo: 'B' }); });
    act(() => { h.result.current.deleteProduct('p1'); });
    expect(h.result.current.stockBatches).toHaveLength(0);
  });

  it('godowns, batches and transfers survive a backup round trip', async () => {
    const h = await setup();
    let gid = '';
    act(() => { gid = h.result.current.addGodown('Store 2').godown!.id; });
    act(() => { h.result.current.receiveStock({ productId: 'p1', qty: 10, batchNo: 'B', godownId: gid, expiryDate: shiftDate(today, 10) }); });
    const json = h.result.current.exportSystemBackup();
    act(() => { h.result.current.factoryResetAllData(); });
    expect(h.result.current.stockBatches).toHaveLength(0);
    expect(h.result.current.godowns).toHaveLength(1);
    act(() => { h.result.current.importSystemBackup(json); });
    expect(h.result.current.godowns.map((g) => g.id)).toContain(gid);
    expect(batchesOf(h, 'p1')[0].qty).toBe(10);
    expectConsistent(h);
  });
});

describe('expiry helpers', () => {
  it('classifies expiry dates and lists alerts most urgent first', async () => {
    expect(expiryStatus(undefined, '2026-09-19')).toBe('none');
    expect(expiryStatus('2026-09-18', '2026-09-19')).toBe('expired');
    expect(expiryStatus('2026-09-19', '2026-09-19')).toBe('soon');
    expect(expiryStatus('2026-10-19', '2026-09-19')).toBe('soon');
    expect(expiryStatus('2026-10-20', '2026-09-19')).toBe('ok');
    expect(fmtExpiry('2026-10-05')).toBe('05-10-2026');
    const p = { id: 'p', name: 'Can', category: '', unitPricePerKg: 1, stockKg: 30, minThresholdKg: 0 };
    const rows = [
      { id: 'a', productId: 'p', godownId: MAIN_GODOWN_ID, batchNo: 'A', expiryDate: '2026-10-10', qty: 10, receivedDate: '2026-01-01' },
      { id: 'b', productId: 'p', godownId: MAIN_GODOWN_ID, batchNo: 'B', expiryDate: '2026-09-01', qty: 10, receivedDate: '2026-01-01' },
      { id: 'c', productId: 'p', godownId: MAIN_GODOWN_ID, batchNo: 'C', expiryDate: '2027-09-01', qty: 10, receivedDate: '2026-01-01' },
      { id: 'd', productId: 'p', godownId: MAIN_GODOWN_ID, batchNo: 'D', expiryDate: '2026-09-02', qty: 0, receivedDate: '2026-01-01' },
    ];
    expect(expiryAlerts(rows, [p], '2026-09-19').map((a) => [a.batch.batchNo, a.status])).toEqual([['B', 'expired'], ['A', 'soon']]);
    expect(reconcileBatches([p], rows, []).rows).toBe(rows);
  });
});
