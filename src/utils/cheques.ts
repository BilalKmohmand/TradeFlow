import { Cheque, ChequeStatus } from '../types';
import { shiftDate } from './stockFlow';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Plain-English status shown in the register. */
export const CHEQUE_STATUS_LABEL: Record<ChequeStatus, string> = {
  in_hand: 'In hand',
  deposited: 'Deposited',
  issued: 'Issued',
  cleared: 'Cleared',
  bounced: 'Bounced',
  cancelled: 'Cancelled',
};

export const chequeStatusLabel = (c: Pick<Cheque, 'status' | 'direction'>) =>
  c.status === 'cancelled' && c.direction === 'received' ? 'Returned' : CHEQUE_STATUS_LABEL[c.status];

/** Still waiting on the bank (not cleared, bounced or cancelled). */
export const isPendingCheque = (c: Pick<Cheque, 'status'>) => c.status === 'in_hand' || c.status === 'deposited' || c.status === 'issued';

/** Pending cheques dated up to 6 days from today (older, still-pending ones are overdue and included). */
export const chequesDueThisWeek = (cheques: Cheque[], today: string): Cheque[] => {
  const end = shiftDate(today, 6);
  return cheques.filter((c) => isPendingCheque(c) && c.chequeDate <= end).sort((a, b) => (a.chequeDate < b.chequeDate ? -1 : a.chequeDate > b.chequeDate ? 1 : 0));
};

export type ChequeView = 'in_hand' | 'due' | 'deposited' | 'bounced' | 'issued' | 'all';

export const CHEQUE_VIEWS: { id: ChequeView; label: string }[] = [
  { id: 'in_hand', label: 'In hand' },
  { id: 'due', label: 'Due this week' },
  { id: 'deposited', label: 'Deposited' },
  { id: 'bounced', label: 'Bounced' },
  { id: 'issued', label: 'Issued' },
  { id: 'all', label: 'All' },
];

const byChequeDate = (a: Cheque, b: Cheque) => (a.chequeDate < b.chequeDate ? -1 : a.chequeDate > b.chequeDate ? 1 : a.createdAt.localeCompare(b.createdAt));

/** Cheques for one list of the register, oldest cheque date first ("All" is newest first). */
export const filterCheques = (cheques: Cheque[], view: ChequeView, today: string, query = ''): Cheque[] => {
  const q = query.trim().toLowerCase();
  const match = (c: Cheque) => !q || c.partyName.toLowerCase().includes(q) || c.chequeNumber.toLowerCase().includes(q) || c.bankName.toLowerCase().includes(q);
  let rows: Cheque[];
  if (view === 'due') rows = chequesDueThisWeek(cheques, today);
  else if (view === 'in_hand') rows = cheques.filter((c) => c.direction === 'received' && c.status === 'in_hand');
  else if (view === 'deposited') rows = cheques.filter((c) => c.status === 'deposited');
  else if (view === 'bounced') rows = cheques.filter((c) => c.status === 'bounced');
  else if (view === 'issued') rows = cheques.filter((c) => c.direction === 'issued' && c.status === 'issued');
  else rows = [...cheques].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt));
  rows = rows.filter(match);
  return view === 'all' ? rows : rows.sort(byChequeDate);
};

export interface ChequeTotals {
  inHand: { count: number; amount: number };
  deposited: { count: number; amount: number };
  issued: { count: number; amount: number };
  bounced: { count: number; amount: number };
  dueThisWeek: { count: number; amount: number; received: number; issued: number };
}

export const chequeTotals = (cheques: Cheque[], today: string): ChequeTotals => {
  const agg = (rows: Cheque[]) => ({ count: rows.length, amount: round2(rows.reduce((a, c) => a + c.amount, 0)) });
  const due = chequesDueThisWeek(cheques, today);
  return {
    inHand: agg(cheques.filter((c) => c.direction === 'received' && c.status === 'in_hand')),
    deposited: agg(cheques.filter((c) => c.status === 'deposited')),
    issued: agg(cheques.filter((c) => c.direction === 'issued' && c.status === 'issued')),
    bounced: agg(cheques.filter((c) => c.status === 'bounced')),
    dueThisWeek: {
      ...agg(due),
      received: round2(due.filter((c) => c.direction === 'received').reduce((a, c) => a + c.amount, 0)),
      issued: round2(due.filter((c) => c.direction === 'issued').reduce((a, c) => a + c.amount, 0)),
    },
  };
};

/** Customer cheques not yet money (in hand + deposited), and supplier cheques not yet paid by the bank. */
export const unclearedChequeTotals = (cheques: Cheque[]) => ({
  receivable: round2(cheques.filter((c) => c.direction === 'received' && (c.status === 'in_hand' || c.status === 'deposited')).reduce((a, c) => a + c.amount, 0)),
  payable: round2(cheques.filter((c) => c.direction === 'issued' && c.status === 'issued').reduce((a, c) => a + c.amount, 0)),
});

export type ChequeEventKind = 'received' | 'issued' | 'deposited' | 'cleared' | 'bounced' | 'cancelled';

export interface ChequeEvent {
  cheque: Cheque;
  kind: ChequeEventKind;
  date: string;
}

export const CHEQUE_EVENT_LABEL: Record<ChequeEventKind, string> = {
  received: 'Cheque received',
  issued: 'Cheque given',
  deposited: 'Deposited in bank',
  cleared: 'Cleared',
  bounced: 'Bounced',
  cancelled: 'Cancelled / returned',
};

/** Everything that happened to cheques on one day (for the daily sheet). */
export const chequeEventsOn = (cheques: Cheque[], date: string): ChequeEvent[] => {
  const out: ChequeEvent[] = [];
  cheques.forEach((c) => {
    if (c.entryDate === date) out.push({ cheque: c, kind: c.direction === 'received' ? 'received' : 'issued', date });
    if (c.depositedDate === date) out.push({ cheque: c, kind: 'deposited', date });
    if (c.clearedDate === date) out.push({ cheque: c, kind: 'cleared', date });
    if (c.returnedDate === date) out.push({ cheque: c, kind: c.status === 'bounced' ? 'bounced' : 'cancelled', date });
  });
  return out;
};

/** Ids of the cash-book / expense records created by cheques (they are changed through the cheque, not deleted on their own). */
export const chequeLinkedIds = (cheques: Cheque[]): Set<string> => {
  const ids = new Set<string>();
  cheques.forEach((c) => {
    [c.ledgerId, c.reversalLedgerId, c.clearedEntryId, c.chargeExpenseId, c.chargeLedgerId].forEach((x) => { if (x) ids.add(x); });
  });
  return ids;
};
