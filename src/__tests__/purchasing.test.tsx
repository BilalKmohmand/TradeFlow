import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import { seedTestUsers, signIn, OPERATOR } from './helpers/auth';
import { todayISO, shiftDate } from '../utils/stockFlow';
import { ACC, accountBalance, buildJournal, trialBalance, DEFAULT_ACCOUNTS } from '../utils/accounting';
import {
  ean13CheckDigit,
  findByBarcode,
  makeInternalBarcode,
  nextNumber,
  poLines,
  profitByAttribute,
  receiveOnPo,
  reorderReport,
  threeWayMatch,
  whatsappLink,
  poWhatsAppText,
} from '../utils/purchasing';
import { code128Bars, code128Values, code128Widths, code128Svg, isEncodable } from '../utils/barcode';
import { dataUrlBytes, fitWithin } from '../utils/imageResize';
import { findOption } from '../components/billing/QuickPick';
import { profitFromBills } from '../utils/stockReports';
import { Product, Purchase, PurchaseOrder } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;
const today = todayISO();

const setup = async (who = undefined as undefined | typeof OPERATOR, extra: { lockedUntil?: string } = {}) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', cashOpeningBalance: 0, openingBankBalance: 0, cashOpeningDate: '2026-01-01', taxRatePct: 0, ...(extra.lockedUntil ? { booksLockedUntil: extra.lockedUntil } : {}) });
  set('tradeflow_customers_v2', [{ id: 'c1', name: 'Haji Karim', company: 'Karim Store', phone: '0300', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]);
  set('tradeflow_suppliers_v2', [
    { id: 's1', name: 'Ahmed', company: 'Dalda Foods', phone: '0300 1234567', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' },
    { id: 's2', name: 'Bashir', company: 'Habib Oil Mills', phone: '0301', email: '', materialCategory: 'Oil', address: '', totalOwed: 0, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_products_v2', [
    { id: 'p1', name: 'Dalda Ghee 16 kg tin', category: 'Ghee', brand: 'Dalda', barcode: '8964000123456', unit: 'tin', unitPricePerKg: 7000, costPricePerKg: 6000, stockKg: 4, minThresholdKg: 10, reorderQty: 30, supplierId: 's1' },
    { id: 'p2', name: 'Habib Cooking Oil 5 L', category: 'Cooking oil', brand: 'Habib', unit: 'can', unitPricePerKg: 2400, costPricePerKg: 2000, stockKg: 2, minThresholdKg: 6, packName: 'carton', packSize: 4 },
    { id: 'p3', name: 'Salt 1 kg', category: 'General', unit: 'pcs', unitPricePerKg: 50, stockKg: 100, minThresholdKg: 10 },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_purchase_orders_v2'].forEach((k) => set(k, []));
  seedTestUsers();
  const hook = renderHook(() => useTrading(), { wrapper });
  await signIn(() => hook.result.current, who);
  return hook;
};
type Hook = Awaited<ReturnType<typeof setup>>;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => {
    out = fn();
  });
  return out!;
};
const sup = (h: Hook, id = 's1') => h.result.current.suppliers.find((s) => s.id === id)!;
const books = (h: Hook) => {
  const s = h.result.current;
  return buildJournal({ settings: s.settings, customers: s.customers, suppliers: s.suppliers, ledger: s.ledger, invoices: s.invoices, purchases: s.purchases, expenses: s.expenses, cashEntries: s.cashEntries, products: s.products, returns: s.returns, adjustments: s.adjustments });
};
const expectBooksBalanced = (h: Hook) => {
  const j = books(h);
  expect(trialBalance(j, DEFAULT_ACCOUNTS, today).balanced).toBe(true);
  // Payable in the books equals what the Suppliers screen shows.
  const owed = h.result.current.suppliers.reduce((a, s) => a + s.totalOwed, 0);
  expect(Math.round(-accountBalance(j, ACC.PAYABLE, today) * 100) / 100).toBe(Math.round(owed * 100) / 100);
  return j;
};

beforeEach(() => localStorage.clear());

describe('Code 128 barcodes', () => {
  it('uses code set C for even-length digits and B otherwise, with a correct check symbol', () => {
    // Code set B: start 104, "P"=48 … check = (104 + Σ value × position) mod 103.
    const b = code128Values('PJJ123C');
    expect(b[0]).toBe(104);
    expect(b.at(-1)).toBe(106);
    const body = b.slice(0, -2);
    expect(b.at(-2)).toBe(body.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0) % 103);
    expect(b.at(-2)).toBe(55);
    const c = code128Values('8964000123456'.slice(0, 12));
    expect(c[0]).toBe(105);
    expect(c.slice(1, 7)).toEqual([89, 64, 0, 1, 23, 45]);
  });
  it('every symbol is 11 modules (stop 13) and bars alternate from a bar', () => {
    const widths = code128Widths('ABC-12');
    const symbols = code128Values('ABC-12').length;
    expect(widths.reduce((a, w) => a + w, 0)).toBe((symbols - 1) * 11 + 13);
    const { bars, width } = code128Bars('ABC-12');
    expect(width).toBe((symbols - 1) * 11 + 13 + 20);
    expect(bars[0][0]).toBe(10);
    expect(code128Svg('X1')).toContain('<svg');
    expect(isEncodable('گھی')).toBe(false);
    expect(() => code128Values('')).toThrow();
  });
  it('EAN-13 check digit and shop-made barcodes', () => {
    expect(ean13CheckDigit('400638133393')).toBe('1');
    const code = makeInternalBarcode([], 1234567890123);
    expect(code).toMatch(/^2\d{12}$/);
    expect(code.at(-1)).toBe(ean13CheckDigit(code.slice(0, 12)));
    expect(makeInternalBarcode([code], 1234567890123)).not.toBe(code);
  });
});

describe('finding items by barcode', () => {
  const products = [
    { id: 'a', name: 'Dalda tin', code: 'DT', barcode: '8964000123456' },
    { id: 'b', name: '8964 special', code: '89' },
  ] as Product[];
  it('exact barcode wins over code prefixes and names (USB scanner typing)', () => {
    const opts = products.map((p) => ({ value: p.id, name: p.name, code: p.code, barcode: p.barcode }));
    expect(findOption(opts, '8964000123456')?.value).toBe('a');
    expect(findOption(opts, '89')?.value).toBe('b');
    expect(findByBarcode(products, ' 8964000123456 ')?.id).toBe('a');
    expect(findByBarcode(products, 'dt')?.id).toBe('a');
    expect(findByBarcode(products, '000')).toBeUndefined();
  });
});

describe('purchase orders (multi-line)', () => {
  it('creates an order, receives part against a line, then the rest', async () => {
    const h = await setup();
    const r = run(() => h.result.current.createPurchaseOrder({ supplierId: 's1', expectedDate: shiftDate(today, 3), lines: [{ productId: 'p1', qty: 20, rate: 6100 }, { productId: 'p2', qty: 8, rate: 2050 }] }));
    expect(r.success).toBe(true);
    const po = r.order!;
    expect(po.poNumber).toBe('PO-1');
    expect(po.amount).toBe(20 * 6100 + 8 * 2050);
    expect(po.items).toHaveLength(2);
    expect(po.status).toBe('open');
    // Nothing is posted for an order.
    expect(h.result.current.ledger).toHaveLength(0);

    const line1 = po.items![0];
    run(() => h.result.current.receiveStock({ productId: 'p1', qty: 12, costPrice: 6100, supplierId: 's1', purchaseOrderId: po.id, poLineId: line1.id }));
    let now = h.result.current.purchaseOrders.find((x) => x.id === po.id)!;
    expect(now.status).toBe('partial');
    expect(now.items![0].receivedQty).toBe(12);
    expect(now.receivedKg).toBe(12);
    expect(h.result.current.purchases[0].purchaseOrderId).toBe(po.id);
    expect(h.result.current.purchases[0].poLineId).toBe(line1.id);
    expect(h.result.current.products.find((p) => p.id === 'p1')!.stockKg).toBe(16);
    expect(sup(h).totalOwed).toBe(73200);

    run(() => h.result.current.receiveStock({ productId: 'p1', qty: 8, costPrice: 6100, supplierId: 's1', purchaseOrderId: po.id }));
    run(() => h.result.current.receiveStock({ productId: 'p2', qty: 8, costPrice: 2050, supplierId: 's1', purchaseOrderId: po.id, poLineId: po.items![1].id }));
    now = h.result.current.purchaseOrders.find((x) => x.id === po.id)!;
    expect(now.status).toBe('received');
    expect(poLines(now).map((l) => l.receivedQty)).toEqual([20, 8]);
    expectBooksBalanced(h);
  });

  it('changes and cancels orders with the right guards', async () => {
    const h = await setup();
    const po = run(() => h.result.current.createPurchaseOrder({ supplierId: 's1', lines: [{ productId: 'p1', qty: 10, rate: 6000 }] })).order!;
    run(() => h.result.current.receiveStock({ productId: 'p1', qty: 4, costPrice: 6000, supplierId: 's1', purchaseOrderId: po.id }));
    const tooLow = run(() => h.result.current.updatePurchaseOrder(po.id, { supplierId: 's1', lines: [{ productId: 'p1', qty: 3, rate: 6000 }] }));
    expect(tooLow.success).toBe(false);
    const more = run(() => h.result.current.updatePurchaseOrder(po.id, { supplierId: 's1', lines: [{ productId: 'p1', qty: 12, rate: 6000 }, { productId: 'p3', qty: 50, rate: 40 }] }));
    expect(more.success).toBe(true);
    expect(more.order!.items![0].receivedQty).toBe(4);
    expect(run(() => h.result.current.removePurchaseOrder(po.id)).success).toBe(false);
    expect(run(() => h.result.current.cancelOrder(po.id, 'Supplier out of stock')).success).toBe(true);
    expect(h.result.current.purchaseOrders.find((x) => x.id === po.id)!.status).toBe('cancelled');
    const empty = run(() => h.result.current.createPurchaseOrder({ supplierId: 's2', lines: [{ productId: 'p2', qty: 4, rate: 2000 }] })).order!;
    expect(run(() => h.result.current.removePurchaseOrder(empty.id)).success).toBe(true);
    expect(run(() => h.result.current.createPurchaseOrder({ supplierId: 's1', lines: [] })).success).toBe(false);
  });

  it('WhatsApp text and link', () => {
    const po = { id: 'x', poNumber: 'PO-7', supplierId: 's1', productId: 'p1', kg: 2, pricePerKg: 100, amount: 200, status: 'open', receivedKg: 0, createdAt: '2026-09-01', items: [{ id: 'l', productId: 'p1', qty: 2, rate: 100, receivedQty: 0 }] } as PurchaseOrder;
    const text = poWhatsAppText(po, [{ id: 'p1', name: 'Dalda tin', unit: 'tin' } as Product], undefined, 'My Shop', (d) => d);
    expect(text).toContain('Purchase order PO-7');
    expect(text).toContain('Dalda tin — 2 tin @ Rs. 100');
    expect(whatsappLink('0300-1234567', 'hi')).toBe('https://wa.me/923001234567?text=hi');
  });

  it('operators cannot make orders or record supplier bills', async () => {
    const h = await setup(OPERATOR);
    expect(run(() => h.result.current.createPurchaseOrder({ supplierId: 's1', lines: [{ productId: 'p1', qty: 1, rate: 1 }] })).success).toBe(false);
    expect(run(() => h.result.current.recordSupplierBill({ supplierId: 's1', billNumber: '1', purchaseIds: ['x'], lines: [] })).success).toBe(false);
    expect(run(() => h.result.current.addSupplierClaim({ supplierId: 's1', productId: 'p1', qty: 1, rate: 1, reason: 'leaked' })).success).toBe(false);
  });

  it('next numbers and receiving on older single-item orders', () => {
    expect(nextNumber('PO', ['PO-2026-123', 'PO-4', 'X-9'])).toBe('PO-124');
    const old = { id: 'o', poNumber: 'PO-1', supplierId: 's', productId: 'p', kg: 10, pricePerKg: 5, amount: 50, status: 'open', receivedKg: 0, createdAt: '' } as PurchaseOrder;
    expect(receiveOnPo(old, 'p', 10).status).toBe('received');
    expect(receiveOnPo(old, 'p', 4).status).toBe('partial');
  });
});

describe('supplier bill and three-way match', () => {
  const receiveOrder = async () => {
    const h = await setup();
    const po = run(() => h.result.current.createPurchaseOrder({ supplierId: 's1', lines: [{ productId: 'p1', qty: 10, rate: 6000 }, { productId: 'p2', qty: 8, rate: 2000 }] })).order!;
    run(() => h.result.current.receiveStock({ productId: 'p1', qty: 10, costPrice: 6000, supplierId: 's1', purchaseOrderId: po.id }));
    run(() => h.result.current.receiveStock({ productId: 'p2', qty: 8, costPrice: 2000, supplierId: 's1', purchaseOrderId: po.id }));
    return { h, po };
  };

  it('a bill equal to the goods received posts nothing more and shows Matched', async () => {
    const { h, po } = await receiveOrder();
    const ids = h.result.current.purchases.map((p) => p.id);
    const r = run(() => h.result.current.recordSupplierBill({ supplierId: 's1', billNumber: 'DF-4471', purchaseIds: ids, lines: [{ productId: 'p1', qty: 10, rate: 6000 }, { productId: 'p2', qty: 8, rate: 2000 }] }));
    expect(r.success).toBe(true);
    expect(r.bill!.variance).toBe(0);
    expect(r.bill!.ledgerId).toBeNull();
    expect(r.bill!.purchaseOrderId).toBe(po.id);
    expect(sup(h).totalOwed).toBe(76000);
    const m = threeWayMatch({ po: h.result.current.purchaseOrders[0], receipts: h.result.current.purchases, bills: h.result.current.supplierBills, products: h.result.current.products });
    expect(m.status).toBe('matched');
    // The same receipts can't be billed twice, nor the same bill number.
    expect(run(() => h.result.current.recordSupplierBill({ supplierId: 's1', billNumber: 'DF-4472', purchaseIds: ids, lines: [{ productId: 'p1', qty: 1, rate: 1 }] })).success).toBe(false);
    expectBooksBalanced(h);
  });

  it('a higher bill adds only the difference (no double counting) and flags the rate', async () => {
    const { h } = await receiveOrder();
    const ids = h.result.current.purchases.map((p) => p.id);
    const r = run(() => h.result.current.recordSupplierBill({ supplierId: 's1', billNumber: 'DF-9', purchaseIds: ids, lines: [{ productId: 'p1', qty: 10, rate: 6100 }, { productId: 'p2', qty: 8, rate: 2000 }], otherCharges: 500 }));
    expect(r.success).toBe(true);
    expect(r.bill!.amount).toBe(77500);
    expect(r.bill!.receivedValue).toBe(76000);
    expect(r.bill!.variance).toBe(1500);
    // Owed = exactly the bill (76,000 booked at receipt + 1,500 difference).
    expect(sup(h).totalOwed).toBe(77500);
    const row = h.result.current.ledger.find((l) => l.type === 'purchase_variance')!;
    expect(row.debit).toBe(1500);
    const j = expectBooksBalanced(h);
    expect(accountBalance(j, ACC.PRICE_DIFFERENCES, today)).toBe(1500);
    // Inventory stays at the receipt cost.
    expect(accountBalance(j, ACC.INVENTORY, today)).toBe(76000 + 4 * 6000 + 2 * 2000 + 100 * 0);
    const m = threeWayMatch({ po: h.result.current.purchaseOrders[0], receipts: h.result.current.purchases, bills: h.result.current.supplierBills, products: h.result.current.products });
    expect(m.status).toBe('mismatch');
    expect(m.lines.find((l) => l.productId === 'p1')!.flags).toContain('rate_differs');
    expect(m.difference).toBe(1500);

    // Deleting the bill reverses the difference.
    expect(run(() => h.result.current.deleteSupplierBill(r.bill!.id)).success).toBe(true);
    expect(sup(h).totalOwed).toBe(76000);
    expect(h.result.current.ledger.some((l) => l.type === 'purchase_variance')).toBe(false);
    expectBooksBalanced(h);
  });

  it('a lower bill (less billed than received) takes the difference off and is flagged', async () => {
    const { h } = await receiveOrder();
    const ids = h.result.current.purchases.map((p) => p.id);
    const r = run(() => h.result.current.recordSupplierBill({ supplierId: 's1', billNumber: 'DF-10', purchaseIds: ids, lines: [{ productId: 'p1', qty: 9, rate: 6000 }, { productId: 'p2', qty: 8, rate: 2000 }] }));
    expect(r.bill!.variance).toBe(-6000);
    expect(sup(h).totalOwed).toBe(70000);
    const j = expectBooksBalanced(h);
    expect(accountBalance(j, ACC.PRICE_DIFFERENCES, today)).toBe(-6000);
    const m = threeWayMatch({ po: null, receipts: h.result.current.purchases, bills: h.result.current.supplierBills, products: h.result.current.products });
    expect(m.lines.find((l) => l.productId === 'p1')!.flags).toContain('billed_less_than_received');
  });

  it('flags short and over receipts against the order, and waits for the bill', () => {
    const products = [{ id: 'a', name: 'A', unit: 'tin' }, { id: 'b', name: 'B', unit: 'can' }] as Product[];
    const po = { id: 'o', poNumber: 'PO-1', supplierId: 's', productId: 'a', kg: 0, pricePerKg: 0, amount: 0, status: 'partial', receivedKg: 0, createdAt: '', items: [{ id: '1', productId: 'a', qty: 10, rate: 5, receivedQty: 6 }, { id: '2', productId: 'b', qty: 4, rate: 5, receivedQty: 5 }] } as PurchaseOrder;
    const receipts = [
      { id: 'r1', productId: 'a', kg: 6, amount: 30, pricePerKg: 5 },
      { id: 'r2', productId: 'b', kg: 5, amount: 25, pricePerKg: 5 },
    ] as Purchase[];
    const m = threeWayMatch({ po, receipts, bills: [], products });
    expect(m.status).toBe('awaiting_bill');
    expect(m.lines.find((l) => l.productId === 'a')!.flags).toEqual(['short_received']);
    expect(m.lines.find((l) => l.productId === 'b')!.flags).toEqual(['over_received']);
    expect(threeWayMatch({ po, receipts: [], bills: [], products }).status).toBe('awaiting_goods');
  });

  it('refuses a bill in a closed period, and receipts from another supplier', async () => {
    const h = await setup(undefined, { lockedUntil: shiftDate(today, -5) });
    run(() => h.result.current.receiveStock({ productId: 'p1', qty: 2, costPrice: 6000, supplierId: 's1' }));
    run(() => h.result.current.receiveStock({ productId: 'p2', qty: 2, costPrice: 2000, supplierId: 's2' }));
    const [p2r, p1r] = h.result.current.purchases;
    expect(run(() => h.result.current.recordSupplierBill({ supplierId: 's1', billNumber: 'A', date: shiftDate(today, -10), purchaseIds: [p1r.id], lines: [{ productId: 'p1', qty: 2, rate: 6000 }] })).message).toMatch(/closed/);
    expect(run(() => h.result.current.recordSupplierBill({ supplierId: 's1', billNumber: 'A', purchaseIds: [p2r.id], lines: [{ productId: 'p2', qty: 2, rate: 2000 }] })).message).toMatch(/another supplier/);
    // A billed receipt can't be deleted on its own.
    run(() => h.result.current.recordSupplierBill({ supplierId: 's1', billNumber: 'A', purchaseIds: [p1r.id], lines: [{ productId: 'p1', qty: 2, rate: 6000 }] }));
    run(() => { h.result.current.deletePurchase(p1r.id); });
    expect(h.result.current.purchases.some((p) => p.id === p1r.id)).toBe(true);
  });
});

describe('supplier claims', () => {
  it('open → accepted (partly) posts a debit note; re-open removes it; settle closes it', async () => {
    const h = await setup();
    run(() => h.result.current.receiveStock({ productId: 'p1', qty: 10, costPrice: 6000, supplierId: 's1' }));
    const receipt = h.result.current.purchases[0];
    // Too many for that receipt.
    expect(run(() => h.result.current.addSupplierClaim({ supplierId: 's1', purchaseId: receipt.id, productId: 'p1', qty: 11, rate: 6000, reason: 'leaked' })).success).toBe(false);
    const c = run(() => h.result.current.addSupplierClaim({ supplierId: 's1', purchaseId: receipt.id, productId: 'p1', qty: 2, rate: 6000, reason: 'leaked', note: '2 tins leaking' })).claim!;
    expect(c.claimNumber).toBe('CLM-1');
    expect(c.amount).toBe(12000);
    expect(sup(h).totalOwed).toBe(60000);
    expect(run(() => h.result.current.acceptSupplierClaim(c.id, { amount: 13000 })).success).toBe(false);
    expect(run(() => h.result.current.acceptSupplierClaim(c.id, { amount: 10000 })).success).toBe(true);
    expect(sup(h).totalOwed).toBe(50000);
    const row = h.result.current.ledger.find((l) => l.type === 'supplier_claim')!;
    expect(row.credit).toBe(10000);
    let j = expectBooksBalanced(h);
    expect(accountBalance(j, ACC.STOCK_LOSSES, today)).toBe(-10000);

    expect(run(() => h.result.current.reopenSupplierClaim(c.id)).success).toBe(true);
    expect(sup(h).totalOwed).toBe(60000);
    expect(h.result.current.ledger.some((l) => l.type === 'supplier_claim')).toBe(false);
    run(() => h.result.current.acceptSupplierClaim(c.id));
    expect(sup(h).totalOwed).toBe(48000);
    expect(run(() => h.result.current.settleSupplierClaim(c.id)).success).toBe(true);
    expect(h.result.current.supplierClaims[0].status).toBe('settled');
    j = expectBooksBalanced(h);
    expect(accountBalance(j, ACC.PAYABLE, today)).toBe(-48000);

    // Rejected claims post nothing; deleting an accepted one takes its debit note away.
    const c2 = run(() => h.result.current.addSupplierClaim({ supplierId: 's1', productId: 'p1', qty: 1, rate: 6000, reason: 'short' })).claim!;
    expect(c2.claimNumber).toBe('CLM-2');
    run(() => h.result.current.rejectSupplierClaim(c2.id, { note: 'Supplier says it was delivered' }));
    expect(sup(h).totalOwed).toBe(48000);
    expect(run(() => h.result.current.deleteSupplierClaim(c.id)).success).toBe(true);
    expect(sup(h).totalOwed).toBe(60000);
    expectBooksBalanced(h);
  });
});

describe('re-order report', () => {
  it('lists items at or below their level with a suggested qty, on-order deducted, last supplier and rate', async () => {
    const h = await setup();
    run(() => h.result.current.receiveStock({ productId: 'p2', qty: 1, costPrice: 1990, supplierId: 's2', date: shiftDate(today, -3) }));
    run(() => h.result.current.createPurchaseOrder({ supplierId: 's1', lines: [{ productId: 'p1', qty: 5, rate: 6000 }] }));
    const s = h.result.current;
    const rows = reorderReport(s.products, s.purchases, s.purchaseOrders);
    expect(rows.map((r) => r.product.id)).toEqual(['p1', 'p2']);
    const p1 = rows.find((r) => r.product.id === 'p1')!;
    // Re-order qty 30 less the 5 already on order.
    expect(p1.onOrder).toBe(5);
    expect(p1.suggested).toBe(25);
    expect(p1.lastSupplierId).toBe('s1');
    expect(p1.lastRate).toBe(6000);
    const p2 = rows.find((r) => r.product.id === 'p2')!;
    // No re-order qty: up to twice the level (12 − 3 = 9), rounded up to whole cartons of 4 → 12.
    expect(p2.suggested).toBe(12);
    expect(p2.lastSupplierId).toBe('s2');
    expect(p2.lastRate).toBe(1990);

    const made = run(() => h.result.current.ordersFromReorder(rows.map((r) => ({ productId: r.product.id, qty: r.suggested, rate: r.lastRate || 0, supplierId: r.lastSupplierId || '' }))));
    expect(made.success).toBe(true);
    expect(made.orders).toHaveLength(2);
    expect(made.orders!.map((o) => o.supplierId).sort()).toEqual(['s1', 's2']);
    expect(made.orders!.map((o) => o.poNumber).sort()).toEqual(['PO-2', 'PO-3']);
    expect(run(() => h.result.current.ordersFromReorder([{ productId: 'p3', qty: 5, rate: 1, supplierId: '' }])).success).toBe(false);
  });
});

describe('item groups and brands', () => {
  it('rolls profit by item up to group and brand with the same totals', async () => {
    const h = await setup();
    const bill = run(() => h.result.current.createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'Dalda', qty: 2, unitPrice: 7000 }, { productId: 'p2', name: 'Habib', qty: 1, unitPrice: 2400 }, { productId: 'p3', name: 'Salt', qty: 10, unitPrice: 50 }], paidNow: 0 } as any));
    expect(bill.success).toBe(true);
    const s = h.result.current;
    const rep = profitFromBills({ invoices: s.invoices, returns: s.returns, purchases: s.purchases, products: s.products, customers: s.customers }, today, today);
    const byGroup = profitByAttribute(rep.byItem, s.products, 'group');
    const byBrand = profitByAttribute(rep.byItem, s.products, 'brand');
    expect(byGroup.map((r) => r.name).sort()).toEqual(['Cooking oil', 'Ghee', 'No group']);
    expect(byBrand.map((r) => r.name).sort()).toEqual(['Dalda', 'Habib', 'No brand']);
    const sum = (rows: { sales: number }[]) => Math.round(rows.reduce((a, r) => a + r.sales, 0) * 100) / 100;
    expect(sum(byGroup)).toBe(rep.totals.sales);
    expect(sum(byBrand)).toBe(rep.totals.sales);
    expect(byGroup.find((r) => r.name === 'Ghee')!.profit).toBe(2000);
  });
});

describe('photo helpers', () => {
  it('measures data URLs and fits sizes', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,QUJD')).toBe(3);
    expect(dataUrlBytes('data:image/jpeg;base64,QUI=')).toBe(2);
    expect(fitWithin(1000, 500, 320)).toEqual({ width: 320, height: 160 });
    expect(fitWithin(100, 50, 320)).toEqual({ width: 100, height: 50 });
  });
});
