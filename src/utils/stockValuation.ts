/**
 * Stock at book value: what each item's stock is worth in the books (the Inventory account 1200) on a
 * date. Built from the same movements, at the same costs, as the journal (utils/accounting.ts):
 *
 *   opening stock (qty × cost on the first day)          + value
 *   goods received (purchase amount)                      + value
 *   sold on a bill (qty × the cost captured on the line)  − value      (free scheme goods too)
 *   dispatched (trading)                                  − qty × cost on the day
 *   customer returns (qty × the cost it left at)          + value
 *   sent back to the supplier (debit note amount)         − value
 *   stock adjustments (qty × cost)                        ± value
 *
 * So Stock In Hand, Stock Value and the owner dashboard show the same figure as the balance sheet,
 * and each item's cost rate is its value ÷ its quantity.
 */
import type { AppSettings, CashEntry, Dispatch, Expense, Invoice, LedgerEntry, Product, Purchase, StockAdjustment, StockReturn } from '../types';
import { billLineUnitCost, openingStock, productCostOn } from './accounting';
import { billsOnly } from './billing';

const round2 = (n: number) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;

export interface ValuationSources {
  settings: Pick<AppSettings, 'cashOpeningDate'>;
  ledger: LedgerEntry[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  products: Product[];
  purchases: Purchase[];
  invoices: Invoice[];
  returns: StockReturn[];
  adjustments?: StockAdjustment[];
  dispatches?: Dispatch[];
}

/** Book value of every item's stock at the end of `asOf` (productId → Rs.). */
export const stockBookValues = (src: ValuationSources, asOf: string): Map<string, number> => {
  const adjustments = src.adjustments || [];
  const dispatches = src.dispatches || [];
  const value = new Map<string, number>();
  const add = (productId: string, amount: number) => value.set(productId, (value.get(productId) || 0) + (Number(amount) || 0));
  const cost = (productId: string, date: string) => productCostOn(src.purchases, src.products, productId, date);

  const opening = openingStock({ settings: src.settings, ledger: src.ledger, expenses: src.expenses, cashEntries: src.cashEntries, adjustments, purchases: src.purchases, products: src.products, invoices: src.invoices, dispatches, returns: src.returns });
  if (opening.date <= asOf) opening.rows.forEach((r) => add(r.product.id, round2(r.qty * r.cost)));

  src.purchases.forEach((p) => { if (p.date <= asOf) add(p.productId, p.amount); });
  billsOnly(src.invoices).forEach((inv) => {
    if (inv.issueDate > asOf) return;
    inv.items.forEach((it) => {
      const unit = billLineUnitCost(it, inv.issueDate, src.purchases, src.products);
      if (unit) add(it.productId, -round2(unit * (Number(it.qty ?? it.kg) || 0)));
    });
  });
  dispatches.forEach((d) => {
    if (d.date > asOf) return;
    const c = cost(d.productId, d.date);
    if (c != null) add(d.productId, -round2(c * d.kg));
  });
  src.returns.forEach((r) => {
    if (r.date > asOf) return;
    if (r.kind === 'purchase') {
      add(r.productId, -(Number(r.amount) || 0));
    } else if (r.items?.length) {
      r.items.forEach((it) => {
        const c = it.costPricePerKg && it.costPricePerKg > 0 ? it.costPricePerKg : cost(it.productId, r.date);
        if (c) add(it.productId, round2(c * it.qty));
      });
    } else {
      const c = cost(r.productId, r.date);
      if (c != null) add(r.productId, round2(c * r.kg));
    }
  });
  adjustments.forEach((a) => {
    if (a.date.slice(0, 10) > asOf || !a.deltaKg) return;
    const c = a.costPerKg && a.costPerKg > 0 ? a.costPerKg : cost(a.productId, a.date);
    if (c != null) add(a.productId, Math.sign(a.deltaKg) * round2(Math.abs(a.deltaKg) * c));
  });
  value.forEach((v, k) => value.set(k, round2(v)));
  return value;
};

/** Total book value of the stock on a date (= the Inventory account, give or take paisa rounding). */
export const stockBookValueTotal = (src: ValuationSources, asOf: string): number => round2(Array.from(stockBookValues(src, asOf).values()).reduce((a, v) => a + v, 0));
