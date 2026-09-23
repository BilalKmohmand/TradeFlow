/**
 * A realistic oil & ghee shop with three months of trading, built through the app's own actions
 * (the same calls the screens make). Used by the reports / accounts audit tests and, dumped to JSON,
 * by the e2e report specs.
 *
 *  - 40 customers (some with opening dues, a few Urdu names, 6 cities), 15 suppliers,
 *    30 products in cartons, 2 godowns, 3 banks;
 *  - ~200 bills (cash, credit, split, cheque, delivery orders), purchase invoices, receipts,
 *    bill returns, purchase returns, cheques (one bounced), expenses, vouchers (CPV / CRV / BPV / JV),
 *    a fixed asset with depreciation and a salary run with an advance.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { TradingProvider, useTrading } from '../../context/TradingContext';
import { useReportData } from '../../hooks/useReportData';
import { seedTestUsers, signIn } from './auth';
import type { Customer, Product, Supplier } from '../../types';

export const wrapper = ({ children }: { children: React.ReactNode }) => <TradingProvider>{children}</TradingProvider>;

/** Deterministic random numbers (so every run builds the same shop). */
export const rng = (seed = 20260923) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const CITIES = ['Peshawar', 'Mardan', 'Swat', 'Nowshera', 'Charsadda', 'Batkhela'];
const URDU = ['حاجی کریم اینڈ سنز', 'محمد علی کریانہ', 'خان جنرل سٹور', 'اقبال ٹریڈرز'];
const BRANDS = ['Dalda', 'Habib', 'Sufi', 'Eva', 'Kisan', 'Seasons'];

export interface ShopOpts {
  /** Last day of trading (default: today). The shop starts ~90 days before. */
  end: string;
  bills?: number;
}

type Ctx = ReturnType<typeof useTrading>;

/** Masters written before the app starts (as the old program's data would be imported). */
export const seedMasters = (start: string) => {
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const openDay = addDays(start, -1);
  set('tradeflow_settings_v2', {
    appMode: 'billing',
    companyName: 'Khan Oil & Ghee Traders',
    companyAddress: 'Main Bazaar, Mardan',
    companyPhone: '0937-123456',
    cashOpeningBalance: 250000,
    openingBankBalance: 900000,
    cashOpeningDate: openDay,
    taxRatePct: 0,
    financialYearStart: '07-01',
  });
  const r = rng(7);
  const customers = Array.from({ length: 40 }, (_, i) => {
    const n = i + 1;
    const urdu = i < URDU.length ? URDU[i] : null;
    const name = urdu || `Customer ${String(n).padStart(2, '0')} ${['Store', 'Traders', 'Kiryana', 'Mart'][i % 4]}`;
    return {
      id: `c${n}`,
      code: `C-${String(n).padStart(3, '0')}`,
      name,
      company: name,
      phone: `0300${String(1000000 + n)}`,
      email: '',
      address: `${CITIES[i % CITIES.length]} bazaar`,
      city: CITIES[i % CITIES.length],
      // A third brought balances in from the old books.
      totalDue: i % 3 === 0 ? Math.round(r() * 80) * 1000 : 0,
      creditLimit: 0,
      createdAt: openDay,
    };
  });
  const suppliers = Array.from({ length: 15 }, (_, i) => ({
    id: `s${i + 1}`,
    code: `S-${String(i + 1).padStart(2, '0')}`,
    name: `Rep ${i + 1}`,
    company: `${BRANDS[i % BRANDS.length]} Distributor ${i + 1}`,
    phone: `0321${String(2000000 + i)}`,
    email: '',
    address: CITIES[i % CITIES.length],
    city: CITIES[i % CITIES.length],
    totalOwed: i % 4 === 0 ? 150000 + i * 10000 : 0,
    createdAt: openDay,
  }));
  const products = Array.from({ length: 30 }, (_, i) => {
    const brand = BRANDS[i % BRANDS.length];
    const ghee = i % 2 === 0;
    const cost = ghee ? 2400 + i * 37 : 1800 + i * 29;
    return {
      id: `p${i + 1}`,
      code: String(101 + i),
      name: `${brand} ${ghee ? 'Ghee' : 'Cooking Oil'} ${[1, 5, 10, 16][i % 4]} ${i % 4 === 3 ? 'L tin' : 'L'}`,
      category: ghee ? 'Ghee' : 'Cooking oil',
      brand,
      unit: i % 4 === 3 ? 'tin' : 'pouch',
      unitPricePerKg: Math.round(cost * 1.08),
      costPricePerKg: cost,
      // Some opening stock brought in (valued at cost as the opening stock entry).
      stockKg: i % 5 === 0 ? 24 : 0,
      minThresholdKg: 12,
      packName: 'carton',
      packSize: i % 4 === 3 ? 4 : 12,
      supplierId: `s${(i % 15) + 1}`,
    };
  });
  set('tradeflow_customers_v2', customers);
  set('tradeflow_suppliers_v2', suppliers);
  set('tradeflow_products_v2', products);
  seedTestUsers();
};

/** Runs the three months of trading through the real context. Returns the hook for inspection. */
export const buildRealShop = async (opts: ShopOpts) => {
  const end = opts.end;
  const start = addDays(end, -89);
  localStorage.clear();
  seedMasters(start);
  const hook = renderHook(() => ({ t: useTrading(), rd: useReportData(true) }), { wrapper });
  await signIn(() => hook.result.current.t);
  const r = (): Ctx => hook.result.current.t;
  const fails: string[] = [];
  const ok = (res: { success: boolean; message?: string } | undefined, what: string) => {
    if (!res || !res.success) fails.push(`${what}: ${res?.message}`);
    return res;
  };
  const rand = rng(99);
  const pickOne = (a: unknown[]) => a[Math.floor(rand() * a.length)];
  const pickS = (a: Supplier[]) => pickOne(a) as Supplier;
  const pickC = (a: Customer[]) => pickOne(a) as Customer;
  const pickP = (a: Product[]) => pickOne(a) as Product;

  // Banks: main 1010 plus two more.
  let bank2 = '';
  let bank3 = '';
  act(() => { const x = r().addBankAccount({ bankName: 'Meezan Bank', accountTitle: 'Khan Oil', accountNumber: '0101-22', openingBalance: 150000 }); ok(x, 'bank 2'); bank2 = x.code || ''; });
  act(() => { const x = r().addBankAccount({ bankName: 'MCB', accountTitle: 'Khan Oil', accountNumber: '7788-11', openingBalance: 0 }); ok(x, 'bank 3'); bank3 = x.code || ''; });
  let godown2 = '';
  act(() => { const x = r().addGodown('Back godown', 'Behind the shop'); ok(x, 'godown'); godown2 = x.godown?.id || ''; });

  // Salesmen and areas: every customer gets one of each (bills take the customer's defaults).
  const salesmanIds: string[] = [];
  const areaIds: string[] = [];
  act(() => { const x = r().saveSalesman({ name: 'Gul Khan', commissionPct: 1 }); ok(x, 'salesman 1'); salesmanIds.push(x.salesman?.id || ''); });
  act(() => { const x = r().saveSalesman({ name: 'Rafiq', commissionPct: 1.5, commissionOn: 'recovery' }); ok(x, 'salesman 2'); salesmanIds.push(x.salesman?.id || ''); });
  ['Saddar', 'Cantt', 'Sheikh Maltoon'].forEach((name) => act(() => { const x = r().saveArea({ name }); ok(x, `area ${name}`); areaIds.push(x.area?.id || ''); }));
  r().customers.forEach((c, i) => act(() => ok(r().setCustomerSalesInfo(c.id, { salesmanId: i % 5 === 4 ? null : salesmanIds[i % 2], areaId: areaIds[i % 3] }), `sales info ${c.id}`)));

  const products = () => r().products;
  const bills = opts.bills ?? 200;
  const days = Array.from({ length: 90 }, (_, i) => addDays(start, i));
  const billDays = days.filter((_, i) => i >= 1);
  const billsPerDay = bills / billDays.length;
  let billCount = 0;
  let chequeNo = 5000;
  let assetDone = false;

  for (let di = 0; di < days.length; di++) {
    const day = days[di];
    // Purchases: one supplier invoice every 4 days (first day: stock up everything).
    if (di === 0 || di % 4 === 0) {
      const sup = di === 0 ? null : pickS(r().suppliers);
      const list = di === 0 ? products() : products().filter((p) => p.supplierId === sup!.id || rand() < 0.15);
      const bySup = new Map<string, typeof list>();
      list.forEach((p) => bySup.set(p.supplierId || 's1', [...(bySup.get(p.supplierId || 's1') || []), p]));
      bySup.forEach((items, sid) => {
        act(() => {
          ok(
            r().createPurchaseInvoice({
              supplierId: sid,
              date: day,
              memoNo: `SUP-${day}-${sid}`,
              godownId: di % 16 === 8 && godown2 ? godown2 : undefined,
              lines: items.map((p) => ({ productId: p.id, qty: (p.packSize || 12) * (di === 0 ? 20 : 4), rate: Math.round((p.costPricePerKg || 1000) * (1 + (di / 900))), packs: di === 0 ? 20 : 4 })),
              discountPct: di % 3 === 0 ? 1 : 0,
              otherCharges: di % 2 === 0 ? 1500 : 0,
              paidNow: di % 5 === 0 ? 20000 : 0,
              paidMethod: 'Cash',
            }),
            `purchase invoice ${day} ${sid}`
          );
        });
      });
    }
    if (di === 0) continue;

    // Bills.
    const target = Math.round(billsPerDay * di) - billCount;
    for (let b = 0; b < target; b++) {
      billCount++;
      const cust = pickC(r().customers);
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pickP(products().filter((p) => p.stockKg > 30)));
      const uniq = Array.from(new Map(lines.filter(Boolean).map((p) => [p.id, p])).values());
      if (!uniq.length) continue;
      const items = uniq.map((p) => ({ productId: p.id, name: p.name, qty: (p.packSize || 12) * (1 + Math.floor(rand() * 2)), unitPrice: p.unitPricePerKg, unit: p.unit, ...(rand() < 0.15 ? { discountType: 'pct' as const, discountValue: 2 } : {}) }));
      const gross = items.reduce((a, it) => a + it.qty * it.unitPrice * (it.discountValue ? 0.98 : 1), 0);
      const kind = billCount % 7;
      const payments =
        kind === 0 || kind === 3 ? [{ method: 'Cash', amount: Math.round(gross) }]
        : kind === 1 ? [{ method: 'Bank Transfer', amount: Math.round(gross / 2), bankCode: billCount % 2 ? bank2 : '' }]
        : kind === 2 ? [{ method: 'Cash', amount: 5000 }]
        : [];
      act(() => {
        ok(
          r().createBill({
            customerId: cust.id,
            items,
            date: day,
            discount: billCount % 11 === 0 ? 500 : 0,
            freightCharges: billCount % 13 === 0 ? 800 : 0,
            payments,
            memoNo: billCount % 5 === 0 ? `M-${billCount}` : undefined,
            deliveryOrder: billCount % 17 === 0,
            ...(billCount % 29 === 0 ? { cheque: { amount: 10000, bankName: 'HBL', chequeNumber: String(chequeNo++), chequeDate: day } } : {}),
            allowOverLimit: true,
          }),
          `bill ${billCount} on ${day}`
        );
      });
    }

    // Customer payments on credit accounts.
    if (di % 2 === 0) {
      const debtors = r().customers.filter((c) => c.totalDue > 20000);
      const c = debtors.length ? pickC(debtors) : null;
      if (c) act(() => { r().recordCustomerPayment(c.id, Math.round(c.totalDue * 0.4), di % 4 === 0 ? 'Cash' : 'Bank Transfer', day, di % 4 === 0 ? undefined : { bankCode: di % 8 === 0 ? bank3 : '' }); });
    }
    // Pay suppliers weekly.
    if (di % 7 === 3) {
      const creditors = r().suppliers.filter((s) => s.totalOwed > 50000);
      const s = creditors.length ? pickS(creditors) : null;
      if (s) act(() => { r().recordSupplierPayment(s.id, Math.round(s.totalOwed * 0.5), di % 2 ? 'Bank Transfer' : 'Cash', day); });
    }
    // Expenses: rent monthly, daily tea/fuel.
    if (day.endsWith('-01')) act(() => { r().addExpense({ date: day, category: 'rent', amount: 45000, description: 'Shop rent', paidVia: 'Bank Transfer' } as any); });
    if (di % 3 === 0) act(() => { r().addExpense({ date: day, category: pickOne(['food', 'fuel', 'labour', 'utilities'] as const), amount: 500 + Math.round(rand() * 3000), description: 'Daily expense', paidVia: 'Cash' } as any); });
    // Cash to bank.
    if (di % 10 === 5) act(() => ok(r().addCashTransfer({ amount: 100000, from: 'cash', date: day, toBankCode: di % 20 === 5 ? bank2 : undefined }), `transfer ${day}`));
    // Godown transfer.
    if (di % 15 === 7 && godown2) {
      const main = r().godowns.find((g) => g.isDefault)!;
      const p = products().find((x) => x.stockKg > 200 && x.id !== "p1")!;
      act(() => ok(r().transferStock({ productId: p.id, fromGodownId: main.id, toGodownId: godown2, qty: 24, date: day }), `godown transfer ${day}`));
    }
    // A fixed asset in the first month.
    if (!assetDone && di === 10) {
      assetDone = true;
      act(() => ok(r().addFixedAsset({ name: 'Suzuki pickup', category: 'vehicle' as any, purchaseDate: day, cost: 1800000, paidFrom: 'bank', usefulLifeYears: 5, method: 'straight_line' }), 'asset'));
    }
  }

  // Month-end things for every full month in the period.
  const monthEnd = (m: string) => addDays(`${addDays(`${m}-28`, 5).slice(0, 7)}-01`, -1);
  const fullMonths = Array.from(new Set(days.map((d) => d.slice(0, 7)))).filter((m) => `${m}-01` >= start && monthEnd(m) <= end);
  let staffId = '';
  act(() => { const x = r().addStaff({ name: 'Gul Khan', role: 'Salesman', monthlySalary: 35000, joinDate: start }); ok(x, 'staff'); staffId = x.member?.id || ''; });
  let staff2 = '';
  act(() => { const x = r().addStaff({ name: 'Bashir', role: 'Loader', monthlySalary: 25000, joinDate: start }); ok(x, 'staff 2'); staff2 = x.member?.id || ''; });
  act(() => ok(r().giveStaffAdvance({ staffId, amount: 10000, method: 'Cash', date: `${fullMonths[0]}-20` }), 'advance'));
  fullMonths.forEach((m, i) => {
    const last = monthEnd(m);
    act(() => ok(r().runDepreciation({ month: m }), `depreciation ${m}`));
    if (i === fullMonths.length - 1) {
      act(() =>
        ok(
          r().paySalaries({
            month: m,
            date: last,
            method: 'Cash',
            lines: [
              { staffId, name: 'Gul Khan', role: 'Salesman', salary: 35000, bonus: 0, deductions: 0, advanceDeducted: 10000, net: 25000 },
              { staffId: staff2, name: 'Bashir', role: 'Loader', salary: 25000, bonus: 2000, deductions: 0, advanceDeducted: 0, net: 27000 },
            ],
          }),
          `salaries ${m}`
        )
      );
    }
  });

  // Returns: three bill returns (credit and refund), two purchase returns.
  const someBills = r().invoices.filter((i) => i.items.length > 0).slice(10, 13);
  someBills.forEach((inv, i) => {
    const line = inv.items[0];
    act(() => ok(r().returnBillItems({ invoiceId: inv.id, lines: [{ billLineId: line.id, qty: Math.min(2, Number(line.qty) || 1) }], settle: i === 2 && inv.paidAmount > 0 ? 'refund' : 'credit', refundMethod: 'Cash', reason: 'Leaking', date: addDays(inv.issueDate, 2) }), `bill return ${inv.invoiceNumber}`));
  });
  const pr = [...r().purchases].sort((a, b) => a.date.localeCompare(b.date)).slice(3, 5);
  pr.forEach((p) => act(() => ok(r().returnToSupplier({ supplierId: p.supplierId, productId: p.productId, qty: 2, rate: p.pricePerKg, reason: 'Damaged', date: addDays(p.date, 3) }), `purchase return ${p.receiptNumber}`)));

  // Cheques: four received, three cleared, one bounced (charge passed to the customer); two issued, one cleared.
  const chqDay = addDays(start, 40);
  for (let i = 0; i < 4; i++) {
    const c = r().customers[5 + i];
    act(() => ok(r().receiveCheque({ customerId: c.id, amount: 20000 + i * 5000, bankName: 'UBL', chequeNumber: `C${900 + i}`, chequeDate: addDays(chqDay, i), date: addDays(chqDay, i) }), `cheque in ${i}`));
  }
  r().cheques.filter((c) => c.chequeNumber.startsWith('C9')).forEach((c, i) => {
    act(() => ok(r().depositCheque(c.id, addDays(chqDay, 5), i % 2 ? bank2 : ''), `deposit ${c.chequeNumber}`));
    if (i === 3) act(() => ok(r().bounceCheque(c.id, { reason: 'Insufficient funds', date: addDays(chqDay, 7), bankCharge: 500, chargeTo: 'customer' }), 'bounce'));
    else act(() => ok(r().clearCheque(c.id, addDays(chqDay, 7)), `clear ${c.chequeNumber}`));
  });
  act(() => ok(r().issueCheque({ supplierId: 's2', amount: 60000, bankName: 'Meezan', chequeNumber: 'S100', chequeDate: addDays(chqDay, 2), date: addDays(chqDay, 2), bankCode: bank2 }), 'cheque out 1'));
  act(() => ok(r().issueCheque({ supplierId: 's3', amount: 40000, bankName: 'MCB', chequeNumber: 'S101', chequeDate: addDays(end, 10), date: addDays(end, -3), bankCode: bank3 }), 'cheque out 2'));
  const out1 = r().cheques.find((c) => c.chequeNumber === 'S100');
  if (out1) act(() => ok(r().clearCheque(out1.id, addDays(chqDay, 6)), 'clear out 1'));

  // Vouchers.
  act(() => ok(r().addVoucher({ type: 'CPV', date: addDays(start, 20), narration: 'Electricity bill', lines: [{ account: '6080', debit: 18500, credit: 0, narration: 'WAPDA' }] }), 'CPV'));
  act(() => ok(r().addVoucher({ type: 'CRV', date: addDays(start, 25), narration: 'Received from customer', lines: [{ account: 'cust:c2', debit: 0, credit: 15000, narration: 'Cash' }] }), 'CRV'));
  act(() => ok(r().addVoucher({ type: 'BPV', date: addDays(start, 30), narration: 'Paid supplier by bank', bankCode: bank2, lines: [{ account: 'supp:s5', debit: 70000, credit: 0 }] }), 'BPV'));
  act(() => ok(r().addVoucher({ type: 'JV', date: addDays(start, 35), narration: 'Owner capital into bank', lines: [{ account: '1010', debit: 500000, credit: 0 }, { account: '3000', debit: 0, credit: 500000 }] }), 'JV'));
  // Stock adjustment (leak).
  act(() => ok(r().adjustStockBy({ productId: 'p1', deltaQty: -3, reason: 'leaked', note: 'Back row', date: addDays(start, 45) } as any), 'adjust'));
  // Deliveries: mark half the delivery orders delivered.
  r().invoices.filter((i) => i.delivery).forEach((i, k) => {
    if (k % 2 === 0) act(() => ok(r().markBillDelivered(i.id, { date: addDays(i.issueDate, 1), by: 'Gul Khan', vehicle: 'LES-123' }), `deliver ${i.invoiceNumber}`));
  });

  // Commission paid, a cost centre with an expense, and a rent budget.
  act(() => ok(r().payCommission({ salesmanId: salesmanIds[0], amount: 5000, paidVia: 'Cash', date: addDays(end, -5) }), 'commission'));
  let centreId = '';
  act(() => { const x = r().addCostCentre({ name: 'Delivery pickup', kind: 'vehicle' }); ok(x, 'centre'); centreId = x.centre?.id || ''; });
  act(() => { r().addExpense({ date: addDays(end, -4), category: 'fuel', amount: 6000, description: 'Pickup diesel', paidVia: 'Cash', costCentreId: centreId } as any); });
  fullMonths.forEach((m) => act(() => ok(r().setBudget(m, '6070', 45000), `budget ${m}`)));

  return { hook, r, fails, start, end, bank2, bank3, godown2, salesmanIds, areaIds, centreId, fullMonths };
};
