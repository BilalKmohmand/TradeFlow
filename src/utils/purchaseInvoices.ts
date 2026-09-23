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
 * Search purchase invoices by our number, the supplier's memo / bill no., the supplier or an item.
 * With the invoice's supplier passed in, its code (S-0003), city and phone find the invoice too, and
 * an item code (101) finds every invoice with that item.
 */
export const matchesPurchaseInvoice = (
  p: { invoiceNumber: string; memoNo?: string; supplierName: string; lines: { productName: string; code?: string }[] },
  query: string,
  supplier?: { code?: string; city?: string; phone?: string; name?: string } | null
): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const qDigits = q.replace(/[^0-9]/g, '');
  return (
    p.invoiceNumber.toLowerCase().includes(q) ||
    (p.memoNo || '').toLowerCase().includes(q) ||
    p.supplierName.toLowerCase().includes(q) ||
    p.lines.some((l) => l.productName.toLowerCase().includes(q) || (l.code ? squash(l.code) === squash(q) : false)) ||
    Boolean(
      supplier &&
        ((supplier.code ? squash(supplier.code) === squash(q) : false) ||
          (supplier.city || '').toLowerCase().includes(q) ||
          (supplier.name || '').toLowerCase().includes(q) ||
          (qDigits.length >= 4 && qDigits.length === q.replace(/[\s-]/g, '').length && (supplier.phone || '').replace(/[^0-9]/g, '').includes(qDigits)))
    )
  );
};
