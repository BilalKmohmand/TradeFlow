import { Customer } from '../types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CreditCheck {
  /** 0 means the customer has no limit. */
  limit: number;
  hasLimit: boolean;
  /** What the customer owes before this bill. */
  owes: number;
  /** Room left under the limit before this bill (never below 0). */
  available: number;
  /** The unpaid part of this bill (what goes on credit). */
  billCredit: number;
  /** What the customer would owe after this bill. */
  after: number;
  /** True when `after` is more than the limit and this bill adds to it. */
  over: boolean;
  /** How far over the limit this bill would take them. */
  exceededBy: number;
}

/**
 * Would putting `billCredit` on this customer's account take them over their credit limit?
 * A limit of 0 (or less) means "no limit". A fully paid bill never trips the limit.
 */
export const creditCheck = (customer: Pick<Customer, 'totalDue' | 'creditLimit'> | undefined | null, billCredit: number): CreditCheck => {
  const limit = Math.max(0, Number(customer?.creditLimit) || 0);
  const owes = round2(Math.max(0, Number(customer?.totalDue) || 0));
  const credit = round2(Math.max(0, billCredit || 0));
  const after = round2(owes + credit);
  const hasLimit = limit > 0;
  const over = hasLimit && credit > 0 && after > limit + 0.005;
  return {
    limit,
    hasLimit,
    owes,
    available: hasLimit ? round2(Math.max(0, limit - owes)) : Infinity,
    billCredit: credit,
    after,
    over,
    exceededBy: over ? round2(after - limit) : 0,
  };
};

export interface CreditUsage {
  limit: number;
  owes: number;
  /** Percentage of the limit in use (0 when there is no limit). */
  pct: number;
  over: boolean;
}

export const creditUsage = (customer: Pick<Customer, 'totalDue' | 'creditLimit'>): CreditUsage => {
  const limit = Math.max(0, Number(customer.creditLimit) || 0);
  const owes = Math.max(0, Number(customer.totalDue) || 0);
  if (limit <= 0) return { limit: 0, owes, pct: 0, over: false };
  return { limit, owes, pct: Math.round((owes / limit) * 100), over: owes > limit + 0.005 };
};

/** Customers who owe more than their credit limit, worst first. */
export const customersOverLimit = <T extends Pick<Customer, 'totalDue' | 'creditLimit'>>(customers: T[]): T[] =>
  customers.filter((c) => creditUsage(c).over).sort((a, b) => b.totalDue - b.creditLimit - (a.totalDue - a.creditLimit));
