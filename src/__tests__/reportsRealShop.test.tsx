import { it, expect } from 'vitest';
import { buildRealShop, addDays } from './helpers/realShop';
import { todayISO } from '../utils/stockFlow';
import { REPORTS, ReportId, defaultFilter, reportCsv, ReportResult } from '../utils/classicReports';
import { accountBalance, ACC, trialBalance, balanceSheet, profitAndLoss } from '../utils/accounting';
import { billsOnly } from '../utils/billing';
import { stockBookValueTotal } from '../utils/stockValuation';

/**
 * Three months of a real shop (see helpers/realShop.tsx), then every report checked the way an accountant
 * would: against the books, against each other and against figures worked out by hand from the raw
 * records. Guards the reports & accounts QA fixes of 2026-09 as a whole.
 */
const issues: string[] = [];
const check = (cond: boolean, msg: string) => { if (!cond) issues.push(msg); };
const near = (a: number, b: number, msg: string, tol = 0.005) => check(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const summ = (r: ReportResult, label: string) => r.summary?.find((s) => s.label === label)?.value as number;

it('three months of trading: every report agrees with the books and with hand-worked figures', async () => {
  const today = todayISO();
  const shop = await buildRealShop({ end: today });
  const s = shop.r();
  const d = shop.hook.result.current.rd;
  expect(shop.fails.filter((f) => !/only \d+ \w+ in Main godown/.test(f))).toEqual([]);
  const f0 = (id: ReportId, patch: Record<string, unknown> = {}) => ({ ...defaultFilter(REPORTS[id], today, s.settings), ...patch });
  const run = (id: ReportId, patch: Record<string, unknown> = {}) => REPORTS[id].build(d, f0(id, patch) as any);

  // Every report builds with default filters and with a wide range, and every CSV is consistent.
  (Object.keys(REPORTS) as ReportId[]).forEach((id) => {
    try {
      const r = run(id, { from: shop.start, productId: 'p3' });
      const csv = reportCsv(r);
      r.sections.forEach((sec) => {
        sec.rows.forEach((row) => Object.keys(row.cells).forEach((k) => check(sec.columns.some((c) => c.key === k), `${id}: cell ${k} has no column`)));
        sec.rows.forEach((row) => Object.values(row.cells).forEach((v) => check(!(typeof v === 'number' && !Number.isFinite(v)), `${id}: non-finite cell`)));
      });
      check(csv.rows.length > 0, `${id}: empty csv`);
    } catch (e) {
      issues.push(`${id}: threw ${(e as Error).message}`);
    }
  });

  // Trial balance.
  const tb = run('trial-balance');
  check(summ(tb, 'Balanced') !== undefined, `TB not balanced: ${JSON.stringify(tb.summary)}`);
  const tbp = run('trial-balance-period', { from: shop.start, to: today });
  check(tbp.summary?.[0].label === 'Balanced', `TB period not balanced ${JSON.stringify(tbp.summary)}`);
  // TB between dates closing = TB as at.
  const tbRows = new Map(tb.sections[0].rows.map((r) => [r.cells.code, (Number(r.cells.debit) || 0) - (Number(r.cells.credit) || 0)]));
  tbp.sections[0].rows.forEach((r) => near((Number(r.cells.closeDr) || 0) - (Number(r.cells.closeCr) || 0), tbRows.get(r.cells.code) || 0, `TBP closing ${r.cells.code}`));
  // Balance sheet.
  const bs = run('balance-sheet');
  check(bs.summary?.[2].label === 'Balanced', `BS not balanced ${JSON.stringify(bs.summary)}`);
  const bsp = run('balance-sheet-period', { from: shop.start });
  check(bsp.summary?.[2].label === 'Balanced', `BSP not balanced ${JSON.stringify(bsp.summary)}`);
  // Receivable = sum of customer balances.
  const rec = run('receivables');
  const custSum = s.customers.reduce((a, c) => a + Math.max(0, c.totalDue), 0);
  near(summ(rec, 'Receivable'), custSum, 'receivable vs customer balances');
  near(accountBalance(d.journal, ACC.RECEIVABLE, today), s.customers.reduce((a, c) => a + c.totalDue, 0), 'AR control vs customers');
  const pay = run('payables');
  near(summ(pay, 'Payable'), s.suppliers.reduce((a, c) => a + Math.max(0, c.totalOwed), 0), 'payable vs suppliers');
  near(-accountBalance(d.journal, ACC.PAYABLE, today), s.suppliers.reduce((a, c) => a + c.totalOwed, 0), 'AP control vs suppliers');
  // Receivable on a past date: hand-computed from the ledger.
  const past = addDays(today, -30);
  const recPast = run('receivables', { asOf: past });
  const handPast = s.customers.reduce((a, c) => {
    const bal = c.totalDue - s.ledger.filter((l) => l.entityType === 'customer' && l.entityId === c.id && l.date > past).reduce((x, l) => x + l.debit - l.credit, 0);
    return a + Math.max(0, bal);
  }, 0);
  near(summ(recPast, 'Receivable'), handPast, 'receivable 30 days ago');
  // Receivable less customer advances (shown under Payable) = the Accounts receivable control account.
  const advPast = run('payables', { asOf: past }).sections[0].rows.filter((r) => String(r.cells.name).includes('customer advance')).reduce((a, r) => a + Number(r.cells.amount), 0);
  near(summ(recPast, 'Receivable') - advPast, accountBalance(d.journal, ACC.RECEIVABLE, past), 'receivable 30 days ago vs AR account');

  // Cash book: closing = cash account; opening on start = opening cash.
  const cb = run('cash-book', { from: shop.start, to: today });
  near(summ(cb, 'Closing cash'), accountBalance(d.journal, ACC.CASH, today), 'cash book closing');
  near(summ(cb, 'Opening cash'), 250000, 'cash book opening (FY start/opening)');
  // single-day cash book: opening + receipts - payments = closing, and opening = previous day's closing.
  const dayX = addDays(today, -20);
  const cbDay = run('cash-book', { from: dayX, to: dayX });
  const cbPrev = run('cash-book', { from: shop.start, to: addDays(dayX, -1) });
  near(summ(cbDay, 'Opening cash'), summ(cbPrev, 'Closing cash'), 'cash book single day opening');
  near(summ(cbDay, 'Opening cash') + summ(cbDay, 'Receipts') - summ(cbDay, 'Payments'), summ(cbDay, 'Closing cash'), 'cash book day arithmetic');
  // Bank book for bank2.
  const bb = run('bank-book', { from: shop.start, accountCode: shop.bank2 });
  near(summ(bb, 'Closing balance'), accountBalance(d.journal, shop.bank2, today), 'bank2 closing');
  // Book balances total = cash + all banks.
  const bkb = run('book-balances');
  near(summ(bkb, 'Cash + bank'), [ACC.CASH, ACC.BANK, shop.bank2, shop.bank3].reduce((a, c) => a + accountBalance(d.journal, c, today), 0), 'book balances');

  // Day book: every entry of a day; debit = credit.
  const db = run('day-book', { asOf: dayX });
  near(summ(db, 'Debit'), summ(db, 'Credit'), 'day book dr=cr');
  const jb = run('journal-book', { from: shop.start, to: today });
  near(summ(jb, 'Debit'), summ(jb, 'Credit'), 'journal book dr=cr');

  // P&L: from the journal by hand.
  const pl = run('profit-loss-period', { from: shop.start, to: today });
  const hand = profitAndLoss(d.journal, shop.start, today, d.accounts);
  near(summ(pl, hand.netProfit >= 0 ? 'Net profit' : 'Net loss'), hand.netProfit, 'P&L net');
  // Sales income by hand: bills' subtotal in range.
  const bills = billsOnly(s.invoices).filter((i) => i.issueDate >= shop.start && i.issueDate <= today);
  const salesHand = bills.reduce((a, i) => a + i.items.reduce((x, it) => x + (Number(it.amount) || 0) + (Number(it.discountAmount) || 0), 0), 0);
  const salesRow = pl.sections[0].rows.find((r) => r.cells.code === '4000');
  near(Number(salesRow?.cells.amount), salesHand, 'P&L sales 4000 vs bill lines gross');
  // Daily sale totals.
  const ds = run('daily-sale', { from: shop.start, to: today });
  near(summ(ds, 'Sale'), bills.reduce((a, i) => a + i.totalAmount, 0), 'daily sale');
  check(summ(ds, 'Bills') === bills.length, `daily sale bills ${summ(ds, 'Bills')} vs ${bills.length}`);
  // Single-day edge.
  const oneDay = bills[0].issueDate;
  const ds1 = run('daily-sale', { from: oneDay, to: oneDay });
  near(summ(ds1, 'Sale'), bills.filter((i) => i.issueDate === oneDay).reduce((a, i) => a + i.totalAmount, 0), 'daily sale one day');
  // Gross profit total = sales - COGS in P&L?
  const gp = run('daily-gross-profit', { from: shop.start, to: today });
  const cogs = pl.sections[0].rows.find((r) => r.cells.code === '5000');
  near(summ(gp, 'Cost'), Number(cogs?.cells.amount), 'daily GP cost vs COGS');
  // Daily purchase vs Inventory debits from purchases.
  const dp = run('daily-purchase', { from: shop.start, to: today });
  const purchHand = s.purchaseInvoices.reduce((a, p) => a + (Number((p as any).totalAmount ?? (p as any).total) || 0), 0);
  near(summ(dp, 'Purchase'), purchHand, 'daily purchase vs purchase invoices total');
  // Stock in hand: value = Σ qty × rate; qty = product stock.
  const sih = run('stock-in-hand');
  const rows = sih.sections[0].rows;
  // Σ qty × rate, give or take the rate being shown to the paisa.
  near(summ(sih, 'Stock value'), rows.reduce((a, r) => a + (Number(r.cells.qty) || 0) * (Number(r.cells.rate) || 0), 0), 'stock value = Σ qty × rate', rows.reduce((a, r) => a + Math.abs(Number(r.cells.qty) || 0) * 0.005, 0));
  near(summ(sih, 'Stock value'), accountBalance(d.journal, ACC.INVENTORY, today), 'stock value = Inventory account');
  near(stockBookValueTotal(d, past), accountBalance(d.journal, ACC.INVENTORY, past), 'stock value 30 days ago = Inventory account');
  rows.forEach((r) => {
    const p = s.products.find((x) => x.code === r.cells.code)!;
    near(Number(r.cells.qty), p.stockKg, `stock qty ${p.name}`);
  });
  const sv = run('stock-value');
  near(summ(sv, 'Stock value'), summ(sih, 'Stock value'), 'stock value report vs stock in hand');
  // Stock in hand on a past date equals stock ledger closing on that date.
  const sihPast = run('stock-in-hand', { asOf: past });
  const sl = run('stock-ledger', { productId: 'p3', from: shop.start, to: past });
  const p3 = sihPast.sections[0].rows.find((r) => r.cells.code === '103');
  near(Number(p3?.cells.qty), Number(sl.sections[0].totals?.balance), 'stock ledger closing vs stock in hand past');
  // Party sales.
  const ps = run('party-sales', { from: shop.start, to: today });
  near(ps.sections[0].totals!.sale as number, bills.reduce((a, i) => a + i.totalAmount, 0), 'party sales total');
  near(ps.sections[0].totals!.balance as number, 0 + ps.sections[0].rows.reduce((a, r) => a + (Number(r.cells.balance) || 0), 0), 'party sales balance total');
  const pp = run('party-purchases', { from: shop.start, to: today });
  near(pp.sections[0].totals!.purchase as number, summ(dp, 'Purchase'), 'party purchases vs daily purchase');
  const prs = run('product-sales', { from: shop.start, to: today });
  const prp = run('product-purchases', { from: shop.start, to: today });
  near(summ(prp, 'Net purchase'), summ(dp, 'Net purchase'), 'product-wise purchase = daily purchase');
  near(summ(prs, 'Net sale'), summ(pl, 'Income') - Number(pl.sections[0].rows.find((r) => r.cells.code === '4100')?.cells.amount || 0) - Number(pl.sections[0].rows.find((r) => r.cells.code === '4150')?.cells.amount || 0), 'product-wise sale = P&L sales net of discounts and returns', 0.05);
  const po = run('party-outstanding');
  near(summ(po, 'Receivable'), summ(rec, 'Receivable'), 'party outstanding receivable');
  const pd = run('pending-delivery', { status: 'all', from: shop.start });
  check(pd.sections[0].rows.length === s.invoices.filter((i) => i.delivery).length, `pending delivery all ${pd.sections[0].rows.length}`);

  // Trial balance on each month end + BS balanced on many dates.
  for (let k = 0; k <= 90; k += 7) {
    const dt = addDays(shop.start, k);
    const t = trialBalance(d.journal, d.accounts, dt);
    check(t.balanced, `TB ${dt} out by ${t.difference}`);
    const b = balanceSheet(d.journal, dt, d.accounts);
    check(b.balanced, `BS ${dt} out by ${b.difference}`);
  }
  // --- Aging / recovery on today and a past date.
  const { billingReceivablesAging, billingPayablesAging, balanceOn } = await import('../utils/stockReports');
  const { recoveryList, salesByGroup, commissionReport, billNetSales } = await import('../utils/salesExtras');
  const { cashFlowStatement, profitByCostCentre, budgetVsActual } = await import('../utils/financeReports');
  const dueOn = (dt: string) => s.customers.reduce((a, c) => a + Math.max(0, balanceOn(c.totalDue, s.ledger, 'customer', c.id, dt)), 0);
  for (const dt of [today, past, addDays(shop.start, 5)]) {
    const ag = billingReceivablesAging(s.customers, s.ledger, dt);
    near(ag.reduce((a, r) => a + r.total, 0), dueOn(dt), `aging customers total ${dt}`);
    ag.forEach((r) => near(r.current + r.d31_60 + r.d61_90 + r.d90plus, r.total, `aging buckets ${r.name} ${dt}`));
    const rl = recoveryList(s.customers, s.ledger, dt, 'area', { salesmen: s.salesmen, areas: s.areas });
    near(rl.total, dueOn(dt), `recovery total ${dt}`);
    const pa = billingPayablesAging(s.suppliers, s.ledger, dt);
    near(pa.reduce((a, r) => a + r.total, 0), s.suppliers.reduce((a, x) => a + Math.max(0, balanceOn(x.totalOwed, s.ledger, 'supplier', x.id, dt)), 0), `aging suppliers ${dt}`);
  }
  // --- Sales by salesman = by area = bills.
  const sbS = salesByGroup(s.invoices, s.returns, shop.start, today, 'salesman', { salesmen: s.salesmen, areas: s.areas });
  const sbA = salesByGroup(s.invoices, s.returns, shop.start, today, 'area', { salesmen: s.salesmen, areas: s.areas });
  near(sbS.totals.net, sbA.totals.net, 'sales by salesman = by area');
  near(sbS.totals.billed, summ(ds, 'Sale'), 'sales by salesman = daily sale');
  // --- Commission: salesman 1 on sales.
  const cr = commissionReport({ salesmen: s.salesmen, invoices: s.invoices, returns: s.returns, ledger: s.ledger, customers: s.customers, expenses: s.expenses }, shop.start, today);
  const s1 = s.salesmen.find((x) => x.name === 'Gul Khan')!;
  const base1 = bills.filter((i) => i.salesmanId === s1.id).reduce((a, i) => a + billNetSales(i), 0) - s.returns.filter((x) => x.kind === 'sales' && s.invoices.find((i) => i.id === x.invoiceId)?.salesmanId === s1.id).reduce((a, x) => a + x.amount - (x.taxAmount || 0), 0);
  near(cr.find((x) => x.salesman.id === s1.id)!.base, base1, 'commission base s1');
  const g = cr.find((x) => x.salesman.id === s1.id)!;
  near(g.earned, Math.round(base1 * 1) / 100, 'commission earned 1%', 0.01);
  near(g.owed, g.earnedToDate - 5000, 'commission owed after the Rs. 5,000 paid');
  // --- Cash flow.
  const cf = cashFlowStatement(d.journal, shop.start, today, d.accounts);
  near(cf.closing, [ACC.CASH, ACC.BANK, shop.bank2, shop.bank3].reduce((a, c) => a + accountBalance(d.journal, c, today), 0), 'cash flow closing');
  near(cf.difference, 0, 'cash flow difference');
  // --- Cost centres add up to the P&L.
  const cc = profitByCostCentre(d.journal, shop.start, today, d.accounts, s.costCentres);
  near(cc.reduce((a, c) => a + c.profit, 0), hand.netProfit, 'cost centres total = net profit');
  // --- Budget: rent actual per full month = 45,000.
  const bva = budgetVsActual(d.journal, s.budgets, shop.fullMonths, d.accounts);
  const rent = bva.expenses.find((x) => x.account.code === '6070')!;
  expect(rent.actual).toBe(45000 * shop.fullMonths.length);
  expect(rent.budget).toBe(45000 * shop.fullMonths.length);

  // --- Year end: close FY 2025-26 (the shop's first days), everything still balances.
  const { act } = await import('@testing-library/react');
  const plBefore = profitAndLoss(d.journal, '2025-07-01', '2026-06-30', d.accounts).netProfit;
  let res: any;
  act(() => { res = shop.r().closeYear({ fyStartDate: '2025-07-01' }); });
  expect(res.success, res.message).toBe(true);
  const d2 = shop.hook.result.current.rd;
  const s2 = shop.r();
  check(s2.settings.booksLockedUntil === '2026-06-30', `lock ${s2.settings.booksLockedUntil}`);
  const plAfter = REPORTS['profit-loss-period'].build(d2, { from: '2025-07-01', to: '2026-06-30', asOf: today } as any);
  near(summ(plAfter, plBefore >= 0 ? 'Net profit' : 'Net loss'), plBefore, 'closed year P&L still shows the year');
  const bsAfter = REPORTS['balance-sheet'].build(d2, { from: today, to: today, asOf: today } as any);
  check(bsAfter.summary?.[2].label === 'Balanced', 'BS after close');
  const bsYe = REPORTS['balance-sheet'].build(d2, { from: today, to: today, asOf: '2026-06-30' } as any);
  check(bsYe.summary?.[2].label === 'Balanced', 'BS at year end after close');
  const tbYe = REPORTS['trial-balance'].build(d2, { from: today, to: today, asOf: '2026-06-30' } as any);
  check(tbYe.summary?.[0].label === 'Balanced', 'TB at year end after close');
  // After the close no income or expense account is left at the year end: the profit sits in retained earnings.
  check(!tbYe.sections[0].rows.some((r) => /^[456]/.test(String(r.cells.code))), 'P&L accounts emptied at year end');
  near(Number(tbYe.sections[0].rows.find((r) => r.cells.code === '3200')?.cells.credit), plBefore, 'retained earnings = the year\'s profit');
  const tbp2 = REPORTS['trial-balance-period'].build(d2, { from: '2026-07-01', to: today, asOf: today } as any);
  // The new year's trial balance opens with no sales brought forward.
  check(tbp2.sections[0].rows.find((r) => r.cells.code === '4000')?.cells.openCr == null, 'sales opening after close');
  check(tbp2.summary?.[0].label === 'Balanced', 'TB between dates after close');
  const jb2 = REPORTS['journal-book'].build(d2, { from: '2026-06-30', to: '2026-06-30', asOf: today } as any);
  check(jb2.sections[0].rows.some((r) => r.cells.doc === 'Year-end closing'), 'closing entry in the journal book');
  let refused: any;
  act(() => { refused = shop.r().createBill({ customerId: 'c1', items: [{ productId: 'p1', name: 'x', qty: 1, unitPrice: 100 }], date: '2026-06-29' }); });
  check(!refused.success, 'bill in closed year refused');
  act(() => { res = shop.r().undoYearClose(); });
  check(res.success && !shop.r().settings.booksLockedUntil, `reopen ${res.message} lock=${shop.r().settings.booksLockedUntil}`);

  expect(issues).toEqual([]);
}, 240000);
