/**
 * Purchase invoice arithmetic (pure). Used by the form, the store and the tests.
 *
 * Accounting treatment (chosen to match how a trader thinks of it, "what did this can really cost me"):
 *  - The bill discount and the other charges (freight, loading, cartage on the supplier's bill) are
 *    spread over the lines in proportion to each line's amount. Every line is received into stock at
 *    its LANDED rate = rate × (bill total ÷ gross), so the discount lowers the inventory cost and the
 *    charges raise it. The cost of goods sold later uses that landed cost, so the discount reaches
 *    profit exactly when the goods are sold (no separate "purchase discount" income account).
 *  - Each line posts as a normal stock receipt: Dr Inventory 1200 / Cr Payable 2000 at the landed rate.
 *  - Landed rates are kept to the paisa, so the lines can add up to a few paisa more or less than the
 *    bill total. That difference is one `purchase_variance` row on the supplier (Dr/Cr Purchase price
 *    differences 5150 / Payable 2000), so the supplier is owed exactly the bill total.
 *  - Paid now: a normal supplier payment (Dr Payable / Cr Cash 1000 or Bank 1010 by method).
 * Every entry is balanced, so the trial balance stays balanced.
 */
import { matcher } from './search';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PurchaseInvoiceTotals {
  gross: number;
  discount: number;
  charges: number;
  total: number;
}

/** Gross, discount (a % of the gross when a % is given, else the amount, never more than the gross), charges and total. */
export const purchaseInvoiceTotals = (
  lines: { qty: number; rate: number }[],
  opts: { discountPct?: number; discountAmount?: number; otherCharges?: number } = {}
): PurchaseInvoiceTotals => {
  const gross = round2(lines.reduce((a, l) => a + round2((Number(l.qty) || 0) * (Number(l.rate) || 0)), 0));
  const pct = Math.max(0, Number(opts.discountPct) || 0);
  const discount = round2(Math.min(gross, pct > 0 ? (gross * pct) / 100 : Math.max(0, Number(opts.discountAmount) || 0)));
  const charges = round2(Math.max(0, Number(opts.otherCharges) || 0));
  return { gross, discount, charges, total: round2(gross - discount + charges) };
};

/** Landed cost per unit of each line: its rate scaled by total ÷ gross (to the paisa). */
export const landedRates = (lines: { qty: number; rate: number }[], totals: Pick<PurchaseInvoiceTotals, 'gross' | 'total'>): number[] =>
  lines.map((l) => (totals.gross > 0 ? round2((Number(l.rate) || 0) * (totals.total / totals.gross)) : round2(Number(l.rate) || 0)));

/** What the receipts post (Σ qty × landed rate, each to the paisa) and the rounding left over against the bill total. */
export const landedPosting = (lines: { qty: number; rate: number }[], totals: PurchaseInvoiceTotals): { rates: number[]; posted: number; rounding: number } => {
  const rates = landedRates(lines, totals);
  const posted = round2(lines.reduce((a, l, i) => a + round2((Number(l.qty) || 0) * rates[i]), 0));
  return { rates, posted, rounding: round2(totals.total - posted) };
};

/**
 * Search purchase invoices by our number, the supplier's memo / bill no., the supplier (name, and when given
 * their code, contact name, city and phone) or an item (name / code). Rules: utils/search.ts.
 */
export const matchesPurchaseInvoice = (
  p: { invoiceNumber: string; memoNo?: string; supplierName: string; lines: { productName: string; code?: string }[] },
  query: string,
  supplier?: { code?: string; name?: string; company?: string; city?: string; phone?: string }
): boolean =>
  matcher(query)([p.invoiceNumber, p.memoNo, p.supplierName, supplier?.code, supplier?.name, supplier?.company, supplier?.city, ...p.lines.flatMap((l) => [l.productName, l.code])], [supplier?.phone]);
