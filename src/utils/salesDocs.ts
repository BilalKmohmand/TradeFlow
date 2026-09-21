/**
 * Sales documents around a bill (billing mode): line discounts, sales returns / credit notes,
 * quotations and delivery challans. Pure helpers — the context does the saving.
 */
import { BatchAllocation, Invoice, InvoiceItem, Quotation, QuotationLine, ReturnLine, StockReturn } from '../types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 0.005;

// ---------------------------------------------------------------------------
// Line discounts
// ---------------------------------------------------------------------------
/** Rs. off one bill line: a fixed Rs. amount or a % of qty × price, never more than the line itself. */
export const lineDiscountAmount = (qty: number, unitPrice: number, type: 'rs' | 'pct' | undefined, value: number | undefined): number => {
  const gross = round2((Number(qty) || 0) * (Number(unitPrice) || 0));
  const v = Math.max(0, Number(value) || 0);
  if (!v || gross <= 0) return 0;
  const off = type === 'pct' ? round2((gross * Math.min(v, 100)) / 100) : round2(v);
  return Math.min(off, gross);
};

/** Sum of line discounts on a bill (older bills have none). */
export const billLineDiscounts = (inv: Pick<Invoice, 'items'>): number => round2(inv.items.reduce((a, it) => a + (Number(it.discountAmount) || 0), 0));

/** qty × price before any line discount. */
export const lineGross = (it: Pick<InvoiceItem, 'qty' | 'kg' | 'unitPrice' | 'ratePerKg'>): number => round2((it.qty ?? it.kg) * (it.unitPrice ?? it.ratePerKg));

/** Short printed label of a line discount, e.g. "5%" or "Rs. 200". */
export const lineDiscountLabel = (it: Pick<InvoiceItem, 'discountType' | 'discountValue' | 'discountAmount'>): string => {
  if (!it.discountAmount) return '';
  return it.discountType === 'pct' ? `${it.discountValue}%` : `Rs. ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(it.discountAmount)}`;
};

// ---------------------------------------------------------------------------
// Returns against a bill
// ---------------------------------------------------------------------------
/** Returns made against one bill, oldest first. */
export const returnsForBill = (returns: StockReturn[], invoiceId: string): StockReturn[] =>
  returns.filter((r) => r.kind === 'sales' && r.invoiceId === invoiceId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

/** Quantity already returned per bill line id. */
export const returnedQtyByLine = (returns: StockReturn[], invoiceId: string): Map<string, number> => {
  const map = new Map<string, number>();
  returnsForBill(returns, invoiceId).forEach((r) => (r.items || []).forEach((l) => map.set(l.billLineId, round2((map.get(l.billLineId) || 0) + l.qty))));
  return map;
};

/** How much of each bill line can still come back. */
export const returnableQty = (inv: Pick<Invoice, 'id' | 'items'>, returns: StockReturn[]): Map<string, number> => {
  const done = returnedQtyByLine(returns, inv.id);
  return new Map(inv.items.map((it) => [it.id, Math.max(0, round2((it.qty ?? it.kg) - (done.get(it.id) || 0)))]));
};

/** What the bill comes to after returns (never below zero). */
export const billNetTotal = (inv: Pick<Invoice, 'totalAmount' | 'returnedAmount'>): number => Math.max(0, round2(inv.totalAmount - (inv.returnedAmount || 0)));

/**
 * Balance still owed on a bill after payments, returns and refunds. A return that is not paid back
 * in money reduces what is owed; a refund hands money back and so does not.
 */
export const billBalance = (inv: Pick<Invoice, 'totalAmount' | 'paidAmount' | 'returnedAmount' | 'refundedAmount'>): number =>
  Math.max(0, round2(billNetTotal(inv) - (inv.paidAmount - (inv.refundedAmount || 0))));

/** Money actually kept from the customer on this bill (paid minus refunded). */
export const billNetPaid = (inv: Pick<Invoice, 'paidAmount' | 'refundedAmount'>): number => round2(inv.paidAmount - (inv.refundedAmount || 0));

export interface ReturnPick {
  billLineId: string;
  qty: number;
}

export interface ReturnPlan {
  ok: boolean;
  message?: string;
  lines: ReturnLine[];
  /** Value before tax (posted to Sales returns 4020). */
  goods: number;
  /** Tax reversed (posted to Sales tax payable 2100). */
  tax: number;
  /** goods + tax: what comes off the customer's account. */
  total: number;
}

/**
 * Value the returned lines exactly as they were sold: the line's own price after its line discount,
 * then the bill-level discount shared out by value, then tax. Stock goes back to the batches the
 * line was sold from (latest batch first), else to the godown it left.
 */
export const planReturn = (inv: Invoice, returns: StockReturn[], picks: ReturnPick[]): ReturnPlan => {
  const empty: ReturnPlan = { ok: false, lines: [], goods: 0, tax: 0, total: 0 };
  const chosen = picks.filter((p) => (Number(p.qty) || 0) > 0);
  if (chosen.length === 0) return { ...empty, message: 'Enter how many of at least one item came back.' };
  const left = returnableQty(inv, returns);
  const prior = returnsForBill(returns, inv.id);
  const subtotal = Number(inv.subtotal) || 0;
  const factor = subtotal > 0 ? Math.max(0, subtotal - (Number(inv.discount) || 0)) / subtotal : 1;
  const lines: ReturnLine[] = [];
  for (const p of chosen) {
    const it = inv.items.find((x) => x.id === p.billLineId);
    if (!it) return { ...empty, message: 'That item is not on this bill.' };
    const sold = it.qty ?? it.kg;
    const can = left.get(it.id) || 0;
    if (p.qty > can + EPS) return { ...empty, message: `${it.productName}: only ${can} ${it.unit || ''} can be returned (${sold} sold${sold - can > 0 ? `, ${round2(sold - can)} already returned` : ''}).`.replace('  ', ' ') };
    const perUnit = sold > 0 ? (it.amount / sold) * factor : 0;
    // Put stock back where it came from: batches still "owed" from this line, latest expiry first.
    const back = new Map<string, number>();
    prior.forEach((r) => (r.items || []).filter((l) => l.billLineId === it.id).forEach((l) => (l.batches || []).forEach((b) => back.set(b.batchId, round2((back.get(b.batchId) || 0) + b.qty)))));
    let need = p.qty;
    const batches: BatchAllocation[] = [];
    [...(it.batches || [])].reverse().forEach((b) => {
      if (need <= EPS) return;
      const avail = round2(b.qty - (back.get(b.batchId) || 0));
      const take = round2(Math.min(need, avail));
      if (take <= EPS) return;
      batches.push({ ...b, qty: take });
      need = round2(need - take);
    });
    lines.push({
      billLineId: it.id,
      productId: it.productId,
      productName: it.productName,
      unit: it.unit,
      qty: round2(p.qty),
      unitPrice: round2(perUnit),
      amount: round2(perUnit * p.qty),
      ...(it.costPricePerKg ? { costPricePerKg: it.costPricePerKg } : {}),
      ...(it.godownId ? { godownId: it.godownId } : {}),
      ...(batches.length ? { batches } : {}),
    });
  }
  let goods = round2(lines.reduce((a, l) => a + l.amount, 0));
  let tax = round2((goods * (Number(inv.taxRatePct) || 0)) / 100);
  // Last return empties the bill: take exactly what is left so rounding never leaves a paisa behind.
  const everythingBack = inv.items.every((it) => {
    const now = chosen.filter((c) => c.billLineId === it.id).reduce((a, c) => a + c.qty, 0);
    return (left.get(it.id) || 0) - now <= EPS;
  });
  if (everythingBack) {
    const priorTax = round2(prior.reduce((a, r) => a + (r.taxAmount || 0), 0));
    const remaining = round2(inv.totalAmount - (inv.returnedAmount || 0));
    tax = Math.max(0, round2((Number(inv.taxAmount) || 0) - priorTax));
    goods = Math.max(0, round2(remaining - tax));
  }
  const total = round2(goods + tax);
  if (total <= 0) return { ...empty, message: 'These items have no value to return.' };
  return { ok: true, lines, goods, tax, total };
};

/** Largest refund in money allowed now: what the customer has actually paid on the bill, net of refunds. */
export const maxRefund = (inv: Pick<Invoice, 'paidAmount' | 'refundedAmount' | 'totalAmount' | 'returnedAmount'>, returnTotal: number): number => {
  // Money kept above what the bill will be worth after this return is theirs to get back.
  const netAfter = Math.max(0, round2(billNetTotal(inv) - returnTotal));
  return Math.max(0, Math.min(round2(returnTotal), round2(billNetPaid(inv) - netAfter)));
};

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------
/** Lines of a quotation; older single-item quotes become one line. */
export const quotationLines = (q: Quotation, productName?: (id: string) => string | undefined): QuotationLine[] =>
  q.items && q.items.length
    ? q.items
    : [{ productId: q.productId, productName: productName?.(q.productId) || 'Item', qty: q.kg, unitPrice: q.pricePerKg }];

export const quotationTotal = (items: Pick<QuotationLine, 'qty' | 'unitPrice'>[]): number => round2(items.reduce((a, l) => a + round2(l.qty * l.unitPrice), 0));

/** A draft/sent quote past its valid-until date is shown as expired. */
export const quotationStatusOn = (q: Pick<Quotation, 'status' | 'validUntil'>, today: string): Quotation['status'] =>
  (q.status === 'draft' || q.status === 'sent') && q.validUntil && q.validUntil < today ? 'expired' : q.status;
