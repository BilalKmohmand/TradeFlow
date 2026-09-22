import React from 'react';
import { AppSettings, CashEntry, Cheque, Customer, Expense, Invoice, InvoicePaymentRecord, LedgerEntry, Supplier } from '../types';
import { ACC, booksLockedFor } from '../utils/accounting';
import { chequeLinkedIds } from '../utils/cheques';
import { billBalance } from '../utils/salesDocs';
import { formatCurrency, formatDate } from '../utils/formatters';

/**
 * Post-dated cheque (PDC) register.
 *
 * Accounting choice (the journal itself is derived in utils/accounting.ts `buildJournal`):
 *  - A customer cheque takes the amount off the customer's balance on the day it is RECEIVED (ledger row
 *    `cheque_received`), because that is what both sides treat as "paid, subject to clearing". Until the
 *    bank clears it the money sits in the asset account 1150 "Cheques in hand" — never in Cash or Bank,
 *    so the cash book and the bank balance only move when the bank really pays.
 *  - Depositing is a status change only (the cheque is still not money).
 *  - Clearing creates a bank cash-book entry (method "Cheque", accountCode 1150): Dr Bank / Cr 1150. Being
 *    an ordinary bank movement it shows in the cash book, the daily sheet and can be matched in bank
 *    reconciliation.
 *  - A bounce (or a cheque handed back) adds the amount back onto the customer (`cheque_returned`,
 *    Dr Receivable / Cr 1150). A bank charge for the bounce is booked as a bank-charges expense paid from
 *    the bank; if it is passed on to the customer, a `cheque_charge` row adds it to their balance and
 *    credits Bank charges, so the shop's net cost is nil.
 *  - Supplier cheques mirror this: issuing takes it off the supplier (`cheque_issued`, Dr Payable /
 *    Cr 2050 "Cheques issued"), clearing pays it from the bank (Dr 2050 / Cr Bank), cancelling puts it
 *    back on the supplier (`cheque_returned`, Dr 2050 / Cr Payable).
 */

type Result = { success: boolean; message: string; cheque?: Cheque };

export interface ReceiveChequeInput {
  customerId: string;
  amount: number;
  bankName: string;
  chequeNumber: string;
  /** Date written on the cheque (may be in the future). */
  chequeDate: string;
  /** Day it was received (default today). */
  date?: string;
  invoiceId?: string | null;
  note?: string;
}

export interface IssueChequeInput {
  supplierId: string;
  amount: number;
  bankName: string;
  chequeNumber: string;
  chequeDate: string;
  date?: string;
  note?: string;
  /** The shop's bank account the cheque is drawn on (chart code; empty = the main bank). */
  bankCode?: string;
}

export interface ChequeApi {
  cheques: Cheque[];
  /** Record a customer's cheque (operators may do this). Takes it off what the customer owes. */
  receiveCheque: (input: ReceiveChequeInput) => Result;
  /** Record a cheque given to a supplier. Takes it off what you owe them. */
  issueCheque: (input: IssueChequeInput) => Result;
  /** Deposited into one of the shop's bank accounts (bankCode; empty = the main bank). */
  depositCheque: (id: string, date?: string, bankCode?: string) => Result;
  /** The bank paid: the money moves into (or out of) the bank (the cheque's own bank unless one is given). */
  clearCheque: (id: string, date?: string, bankCode?: string) => Result;
  /** The customer's cheque bounced: they owe it again, plus the bank charge if passed on. */
  bounceCheque: (id: string, opts: { reason: string; date?: string; bankCharge?: number; chargeTo?: 'customer' | 'shop' }) => Result;
  /** Cheque handed back to the customer / cancelled with the supplier before it cleared. */
  cancelCheque: (id: string, opts?: { reason?: string; date?: string }) => Result;
  /** True for a ledger row, cash entry or expense a cheque created (change the cheque, don't delete it). */
  isChequeRecord: (id: string) => boolean;
}

interface Deps {
  cheques: Cheque[];
  setCheques: React.Dispatch<React.SetStateAction<Cheque[]>>;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  settings: AppSettings;
  can: (permission: string) => boolean;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger') => void;
  uid: (prefix: string) => string;
  userName?: string;
  today: () => string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isDate = (d?: string | null) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
const fail = (message: string): Result => ({ success: false, message });
const BANK_METHOD = 'Cheque';
const CHARGE_PAID_VIA = 'Bank Transfer';

/** Recompute a bill's paid / due / status after its payments changed (returns and refunds on it still count). */
const withPayments = (inv: Invoice, payments: InvoicePaymentRecord[], today: string): Invoice => {
  const paid = round2(payments.reduce((a, p) => a + p.amount, 0));
  const due = billBalance({ ...inv, paidAmount: paid });
  const kept = round2(paid - (inv.refundedAmount || 0));
  const status = due === 0 ? 'paid' : kept > 0 ? 'partial' : 'issued';
  return { ...inv, payments, paidAmount: paid, balanceDue: due, paymentStatus: due === 0 ? 'paid' : kept > 0 ? 'partial' : 'unpaid', status, billKind: inv.billKind ? (due === 0 ? 'cash' : 'credit') : inv.billKind, updatedAt: today };
};

export const createChequeApi = (d: Deps): ChequeApi => {
  const who = d.userName;
  const noPermission = (what: string) => fail(`You don't have permission to ${what}. Ask a manager or admin.`);
  const find = (id: string) => d.cheques.find((c) => c.id === id);
  const label = (c: Cheque) => `Cheque ${c.chequeNumber}${c.bankName ? ` (${c.bankName})` : ''}`;
  const update = (id: string, patch: Partial<Cheque>) => d.setCheques((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: d.today() } : c)));

  /** Shared checks for the date of a status change. */
  const checkDate = (c: Cheque, date: string, what: string): string | null => {
    if (!isDate(date)) return 'Enter a valid date.';
    if (date > d.today()) return 'The date cannot be in the future.';
    if (date < c.entryDate) return `The cheque was only ${c.direction === 'received' ? 'received' : 'given'} on ${formatDate(c.entryDate)}; it can't be ${what} before that.`;
    return booksLockedFor(d.settings, date);
  };

  const validateNew = (input: { amount: number; bankName: string; chequeNumber: string; chequeDate: string }, date: string): string | null => {
    if (!(Number(input.amount) > 0)) return 'Enter the cheque amount.';
    if (!input.chequeNumber.trim()) return 'Enter the cheque number.';
    if (!input.bankName.trim()) return 'Enter the bank name.';
    if (!isDate(input.chequeDate)) return 'Enter the date written on the cheque.';
    if (!isDate(date)) return 'Enter a valid date.';
    if (date > d.today()) return 'The date received cannot be in the future. (The cheque itself can be dated ahead.)';
    return booksLockedFor(d.settings, date);
  };

  const duplicate = (direction: Cheque['direction'], bankName: string, chequeNumber: string) =>
    d.cheques.find((c) => c.direction === direction && c.status !== 'cancelled' && c.chequeNumber.trim().toLowerCase() === chequeNumber.trim().toLowerCase() && c.bankName.trim().toLowerCase() === bankName.trim().toLowerCase());

  const receiveCheque: ChequeApi['receiveCheque'] = (input) => {
    if (!d.can('finance:record_payment')) return noPermission('record cheques');
    const customer = d.customers.find((c) => c.id === input.customerId);
    if (!customer) return fail('Pick the customer.');
    const date = input.date || d.today();
    const bad = validateNew(input, date);
    if (bad) return fail(bad);
    const amount = round2(Number(input.amount));
    const dup = duplicate('received', input.bankName, input.chequeNumber);
    if (dup) return fail(`Cheque ${dup.chequeNumber} of ${dup.bankName} is already in the register (${dup.partyName}).`);
    const inv = input.invoiceId ? d.invoices.find((i) => i.id === input.invoiceId) : undefined;
    if (input.invoiceId) {
      if (!inv || inv.customerId !== customer.id) return fail('That bill is not for this customer.');
      if (amount > inv.balanceDue + 0.005) return fail(`Only ${formatCurrency(inv.balanceDue)} is left on bill ${inv.invoiceNumber}.`);
    }
    const id = d.uid('chq');
    const ledgerId = d.uid('led');
    const dueAfter = round2(customer.totalDue - amount);
    const cheque: Cheque = {
      id,
      direction: 'received',
      customerId: customer.id,
      supplierId: null,
      partyName: customer.name,
      bankName: input.bankName.trim(),
      chequeNumber: input.chequeNumber.trim(),
      amount,
      chequeDate: input.chequeDate,
      entryDate: date,
      invoiceId: inv?.id || null,
      status: 'in_hand',
      note: input.note?.trim() || undefined,
      ledgerId,
      createdAt: d.today(),
      createdBy: who,
    };
    const postDated = input.chequeDate > date ? `, dated ${formatDate(input.chequeDate)}` : '';
    const row: LedgerEntry = {
      id: ledgerId,
      entityType: 'customer',
      entityId: customer.id,
      type: 'cheque_received',
      referenceId: `CHQ-${cheque.chequeNumber}`,
      sourceId: id,
      method: BANK_METHOD,
      date,
      description: `Cheque received: ${cheque.bankName} #${cheque.chequeNumber}${postDated}${inv ? ` - Bill ${inv.invoiceNumber}` : ''}`,
      debit: 0,
      credit: amount,
      balanceAfter: dueAfter,
    };
    d.setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, totalDue: round2(c.totalDue - amount) } : c)));
    d.setLedger((prev) => [row, ...prev]);
    if (inv) {
      const record: InvoicePaymentRecord = { id: `pay-${id}`, date, amount, method: 'cheque', referenceNumber: cheque.chequeNumber, notes: `Cheque ${cheque.chequeNumber} (${cheque.bankName})${postDated} - in hand`, recordedBy: who };
      d.setInvoices((prev) => prev.map((i) => (i.id === inv.id ? withPayments(i, [...(i.payments || []), record], d.today()) : i)));
    }
    d.setCheques((prev) => [cheque, ...prev]);
    d.logAuditEvent('Cheque Received', `${label(cheque)} from ${customer.name}: ${formatCurrency(amount)}, dated ${formatDate(cheque.chequeDate)}${inv ? ` against ${inv.invoiceNumber}` : ''}.`, 'info');
    return { success: true, message: `Cheque ${cheque.chequeNumber} for ${formatCurrency(amount)} recorded as in hand.`, cheque };
  };

  const issueCheque: ChequeApi['issueCheque'] = (input) => {
    if (!d.can('finance:record_payment')) return noPermission('record cheques');
    const supplier = d.suppliers.find((s) => s.id === input.supplierId);
    if (!supplier) return fail('Pick the supplier.');
    const date = input.date || d.today();
    const bad = validateNew(input, date);
    if (bad) return fail(bad);
    const amount = round2(Number(input.amount));
    const dup = duplicate('issued', input.bankName, input.chequeNumber);
    if (dup) return fail(`Cheque ${dup.chequeNumber} of ${dup.bankName} is already in the register (${dup.partyName}).`);
    const id = d.uid('chq');
    const ledgerId = d.uid('led');
    const name = supplier.company || supplier.name;
    const cheque: Cheque = {
      id,
      direction: 'issued',
      customerId: null,
      supplierId: supplier.id,
      partyName: name,
      bankName: input.bankName.trim(),
      chequeNumber: input.chequeNumber.trim(),
      amount,
      chequeDate: input.chequeDate,
      entryDate: date,
      invoiceId: null,
      status: 'issued',
      note: input.note?.trim() || undefined,
      ...(input.bankCode && input.bankCode !== '1010' ? { bankCode: input.bankCode } : {}),
      ledgerId,
      createdAt: d.today(),
      createdBy: who,
    };
    const row: LedgerEntry = {
      id: ledgerId,
      entityType: 'supplier',
      entityId: supplier.id,
      type: 'cheque_issued',
      referenceId: `CHQ-${cheque.chequeNumber}`,
      sourceId: id,
      method: BANK_METHOD,
      date,
      description: `Cheque given: ${cheque.bankName} #${cheque.chequeNumber}${input.chequeDate > date ? `, dated ${formatDate(input.chequeDate)}` : ''}`,
      debit: 0,
      credit: amount,
      balanceAfter: round2(supplier.totalOwed - amount),
    };
    d.setSuppliers((prev) => prev.map((s) => (s.id === supplier.id ? { ...s, totalOwed: round2(s.totalOwed - amount) } : s)));
    d.setLedger((prev) => [row, ...prev]);
    d.setCheques((prev) => [cheque, ...prev]);
    d.logAuditEvent('Cheque Issued', `${label(cheque)} to ${name}: ${formatCurrency(amount)}, dated ${formatDate(cheque.chequeDate)}.`, 'info');
    return { success: true, message: `Cheque ${cheque.chequeNumber} for ${formatCurrency(amount)} given to ${name}.`, cheque };
  };

  const depositCheque: ChequeApi['depositCheque'] = (id, when, bankCode) => {
    if (!d.can('finance:record_payment')) return noPermission('deposit cheques');
    const c = find(id);
    if (!c) return fail('Cheque not found.');
    if (c.direction !== 'received' || c.status !== 'in_hand') return fail('Only a cheque in hand can be deposited.');
    const date = when || d.today();
    const bad = checkDate(c, date, 'deposited');
    if (bad) return fail(bad);
    if (date < c.chequeDate) return fail(`This cheque is dated ${formatDate(c.chequeDate)}. The bank won't take it before then.`);
    update(id, { status: 'deposited', depositedDate: date, ...(bankCode && bankCode !== '1010' ? { bankCode } : {}) });
    d.logAuditEvent('Cheque Deposited', `${label(c)} from ${c.partyName}: ${formatCurrency(c.amount)}.`, 'info');
    return { success: true, message: `${label(c)} deposited. Mark it cleared when the bank shows the money.` };
  };

  const clearCheque: ChequeApi['clearCheque'] = (id, when, bankCode) => {
    if (!d.can('finance:cashbook')) return noPermission('mark cheques cleared');
    const c = find(id);
    if (!c) return fail('Cheque not found.');
    if (!(c.status === 'in_hand' || c.status === 'deposited' || c.status === 'issued')) return fail(`This cheque is already ${c.status}.`);
    const date = when || d.today();
    const bad = checkDate(c, date, 'cleared');
    if (bad) return fail(bad);
    if (date < c.chequeDate) return fail(`This cheque is dated ${formatDate(c.chequeDate)}; the bank can't clear it before then.`);
    if (c.depositedDate && date < c.depositedDate) return fail(`It was deposited on ${formatDate(c.depositedDate)}; it can't clear before that.`);
    const received = c.direction === 'received';
    const bank = bankCode || c.bankCode;
    const entry: CashEntry = {
      id: d.uid('cash'),
      date,
      direction: received ? 'in' : 'out',
      amount: c.amount,
      description: `${label(c)} cleared - ${c.partyName}`,
      method: BANK_METHOD,
      accountCode: received ? ACC.CHEQUES_IN_HAND : ACC.CHEQUES_ISSUED,
      ...(bank && bank !== '1010' ? { bankCode: bank } : {}),
      createdAt: d.today(),
      createdBy: who,
    };
    d.setCashEntries((prev) => [entry, ...prev]);
    update(id, { status: 'cleared', clearedDate: date, clearedEntryId: entry.id, ...(bank && bank !== '1010' ? { bankCode: bank } : {}) });
    if (received && c.invoiceId) {
      d.setInvoices((prev) => prev.map((i) => (i.id === c.invoiceId ? { ...i, payments: (i.payments || []).map((p) => (p.id === `pay-${c.id}` ? { ...p, notes: (p.notes || '').replace(/ - in hand$/, ` - cleared ${formatDate(date)}`) } : p)) } : i)));
    }
    d.logAuditEvent('Cheque Cleared', `${label(c)} ${received ? 'from' : 'to'} ${c.partyName}: ${formatCurrency(c.amount)} ${received ? 'into' : 'out of'} the bank.`, 'info');
    return { success: true, message: `${label(c)} cleared: ${formatCurrency(c.amount)} ${received ? 'added to' : 'paid from'} the bank.` };
  };

  /** Put the cheque's amount back on the customer / supplier and take it off any bill it paid. */
  const reverse = (c: Cheque, date: string, text: string): string => {
    const ledgerId = d.uid('led');
    if (c.direction === 'received') {
      const customer = d.customers.find((x) => x.id === c.customerId);
      d.setCustomers((prev) => prev.map((x) => (x.id === c.customerId ? { ...x, totalDue: round2(x.totalDue + c.amount) } : x)));
      d.setLedger((prev) => [{ id: ledgerId, entityType: 'customer', entityId: c.customerId || '', type: 'cheque_returned', referenceId: `CHQ-${c.chequeNumber}`, sourceId: c.id, method: BANK_METHOD, date, description: text, debit: c.amount, credit: 0, balanceAfter: round2((customer?.totalDue || 0) + c.amount) }, ...prev]);
      if (c.invoiceId) d.setInvoices((prev) => prev.map((i) => (i.id === c.invoiceId ? withPayments(i, (i.payments || []).filter((p) => p.id !== `pay-${c.id}`), d.today()) : i)));
    } else {
      const supplier = d.suppliers.find((x) => x.id === c.supplierId);
      d.setSuppliers((prev) => prev.map((x) => (x.id === c.supplierId ? { ...x, totalOwed: round2(x.totalOwed + c.amount) } : x)));
      d.setLedger((prev) => [{ id: ledgerId, entityType: 'supplier', entityId: c.supplierId || '', type: 'cheque_returned', referenceId: `CHQ-${c.chequeNumber}`, sourceId: c.id, method: BANK_METHOD, date, description: text, debit: c.amount, credit: 0, balanceAfter: round2((supplier?.totalOwed || 0) + c.amount) }, ...prev]);
    }
    return ledgerId;
  };

  const bounceCheque: ChequeApi['bounceCheque'] = (id, opts) => {
    if (!d.can('finance:cashbook')) return noPermission('mark cheques bounced');
    const c = find(id);
    if (!c) return fail('Cheque not found.');
    if (c.direction !== 'received') return fail('Only a customer\'s cheque can bounce here. Cancel a cheque you gave instead.');
    if (!(c.status === 'in_hand' || c.status === 'deposited')) return fail(`This cheque is already ${c.status}.`);
    const reason = (opts.reason || '').trim();
    if (!reason) return fail('Write why it bounced (e.g. insufficient funds).');
    const date = opts.date || d.today();
    const bad = checkDate(c, date, 'bounced');
    if (bad) return fail(bad);
    const charge = round2(Math.max(0, Number(opts.bankCharge) || 0));
    const chargeTo = charge > 0 ? opts.chargeTo || 'shop' : null;
    const reversalLedgerId = reverse(c, date, `Cheque bounced: ${c.bankName} #${c.chequeNumber} (${reason})`);
    let chargeExpenseId: string | null = null;
    let chargeLedgerId: string | null = null;
    if (charge > 0) {
      // The bank takes its fee from the shop's account either way; passing it on puts it on the customer.
      const expense: Expense = { id: d.uid('exp'), date, category: 'bank_charges', amount: charge, description: `Bank charge: bounced cheque ${c.chequeNumber} (${c.partyName})`, paidVia: CHARGE_PAID_VIA, ...(c.bankCode ? { bankCode: c.bankCode } : {}), truckId: null, dispatchId: null, createdAt: d.today(), createdBy: who };
      d.setExpenses((prev) => [expense, ...prev]);
      chargeExpenseId = expense.id;
      if (chargeTo === 'customer') {
        chargeLedgerId = d.uid('led');
        const customer = d.customers.find((x) => x.id === c.customerId);
        d.setCustomers((prev) => prev.map((x) => (x.id === c.customerId ? { ...x, totalDue: round2(x.totalDue + charge) } : x)));
        d.setLedger((prev) => [{ id: chargeLedgerId!, entityType: 'customer', entityId: c.customerId || '', type: 'cheque_charge', referenceId: `CHQ-${c.chequeNumber}`, sourceId: c.id, date, description: `Bank charge for bounced cheque #${c.chequeNumber}`, debit: charge, credit: 0, balanceAfter: round2((customer?.totalDue || 0) + c.amount + charge) }, ...prev]);
      }
    }
    update(id, { status: 'bounced', returnedDate: date, returnReason: reason, bankCharge: charge || undefined, chargeTo, reversalLedgerId, chargeExpenseId, chargeLedgerId });
    d.logAuditEvent('Cheque Bounced', `${label(c)} from ${c.partyName}: ${formatCurrency(c.amount)} (${reason})${charge > 0 ? `; bank charge ${formatCurrency(charge)} ${chargeTo === 'customer' ? 'added to the customer' : 'paid by the shop'}` : ''}.`, 'warning');
    return { success: true, message: `${label(c)} marked bounced. ${formatCurrency(c.amount + (chargeTo === 'customer' ? charge : 0))} added back to ${c.partyName}'s account.` };
  };

  const cancelCheque: ChequeApi['cancelCheque'] = (id, opts = {}) => {
    if (!d.can('finance:cashbook')) return noPermission('cancel cheques');
    const c = find(id);
    if (!c) return fail('Cheque not found.');
    if (c.direction === 'received' ? c.status !== 'in_hand' : c.status !== 'issued') {
      return fail(c.status === 'deposited' ? 'This cheque is already with the bank. Mark it cleared or bounced.' : `This cheque is already ${c.status}.`);
    }
    const date = opts.date || d.today();
    const bad = checkDate(c, date, 'cancelled');
    if (bad) return fail(bad);
    const reason = (opts.reason || '').trim();
    const text = c.direction === 'received'
      ? `Cheque returned to customer: ${c.bankName} #${c.chequeNumber}${reason ? ` (${reason})` : ''}`
      : `Cheque cancelled: ${c.bankName} #${c.chequeNumber}${reason ? ` (${reason})` : ''}`;
    const reversalLedgerId = reverse(c, date, text);
    update(id, { status: 'cancelled', returnedDate: date, returnReason: reason || undefined, reversalLedgerId });
    d.logAuditEvent('Cheque Cancelled', `${label(c)} ${c.direction === 'received' ? 'from' : 'to'} ${c.partyName}: ${formatCurrency(c.amount)}${reason ? ` (${reason})` : ''}.`, 'warning');
    return { success: true, message: `${label(c)} cancelled. ${formatCurrency(c.amount)} put back on ${c.partyName}'s account.` };
  };

  const linked = chequeLinkedIds(d.cheques);
  return { cheques: d.cheques, receiveCheque, issueCheque, depositCheque, clearCheque, bounceCheque, cancelCheque, isChequeRecord: (id) => linked.has(id) };
};
