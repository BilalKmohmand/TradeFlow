import { receiptNumbersIn } from '../utils/paymentNumbers';
import React, { useEffect, useRef, useState } from 'react';
import {
  AppSettings,
  AppUser,
  ApprovalKind,
  ApprovalRequest,
  ApprovalRuleKey,
  ApprovalRules,
  Branch,
  CashEntry,
  Customer,
  DeletedKind,
  DeletedRecord,
  DocSeriesConfig,
  DocSeriesKey,
  Expense,
  Invoice,
  LedgerEntry,
  Product,
  Purchase,
  PurchaseOrder,
  Quotation,
  StockAdjustment,
  StockBatch,
  StockReturn,
  Supplier,
  Booking,
  Dispatch,
  Cheque,
} from '../types';
import {
  DEFAULT_SERIES,
  DOC_SERIES,
  anyRuleOn,
  billDiscountPct,
  branchesOn,
  counterKey,
  fmtPct,
  highestExisting,
  mainBranchId,
  planDocNumber,
  seriesConfig,
} from '../utils/control';
import { booksLockedFor } from '../utils/accounting';
import { lineDiscountAmount } from '../utils/salesDocs';
import { resolveBillPayments } from '../utils/billing';
import { creditCheck } from '../utils/credit';
import { shortStockLines } from '../utils/inventory';
import { costPerKgOn } from '../utils/finance';
import { formatDate } from '../utils/formatters';
import { rs } from '../components/billing/ui';
import {
  AutoBackupMeta,
  backupReminderDue,
  getBackupStore,
  lastDownloadAt,
  markDownloaded,
  runDailyBackup,
  saveBackup,
} from '../lib/autoBackup';
import type { DeleteSummary } from './TradingContext';
import type { VoucherSnapshot } from './voucherActions';
import { VoucherInput, validateVoucher, voucherSupplierPayments, voucherTypeInfo } from '../utils/vouchers';
import type { JournalEntry } from '../utils/accounting';

/**
 * Controls for the owner (see utils/control.ts for the pure parts):
 *  - Approval rules: staff without "Approve / Reject" who hit a rule (big discount, bill over the credit
 *    limit, big supplier payment, big stock loss, deleting a bill) get their document saved as
 *    "Waiting for approval". Only the INPUT is stored, so nothing touches the books or the stock until a
 *    manager approves it — approving runs the normal action (all its checks again) as the manager.
 *  - Deleted records bin: every delete keeps a copy with who / when / why; admins can restore the simple
 *    records (customers, suppliers, items, expenses, cash entries).
 *  - Document number series: prefix, optional yearly reset, padding; a counter that never goes down.
 *  - Branches (light): a list of shops; bills, expenses, cash entries and payments record the user's branch.
 *  - Automatic daily backups on the device (lib/autoBackup.ts).
 */

type Result = { success: boolean; message: string };
const ok = (message: string) => ({ success: true, message });
const fail = (message: string) => ({ success: false, message });
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const todayISO = () => new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// The reason typed in a delete confirmation reaches the bin through this slot (ConfirmDialog sets it
// just before calling onConfirm and clears it right after), so no delete function changes its signature.
// ---------------------------------------------------------------------------
let deleteReasonSlot = '';
export const setDeleteReason = (reason: string) => {
  deleteReasonSlot = reason;
};
const takeDeleteReason = () => {
  const r = deleteReasonSlot;
  deleteReasonSlot = '';
  return r;
};

/** True for a result that was saved as "Waiting for approval" instead of being posted. */
export const isPendingApproval = (r: unknown): r is { pendingApproval: ApprovalRequest; message: string } =>
  Boolean(r && typeof r === 'object' && (r as { pendingApproval?: unknown }).pendingApproval);

const KEYS = {
  APPROVALS: 'sarmaya_approvals_v1',
  BIN: 'sarmaya_deleted_records_v1',
  BRANCHES: 'sarmaya_branches_v1',
  VIEW: 'sarmaya_branch_view_v1',
  FIRST_USE: 'sarmaya_first_use_v1',
};
const load = <T,>(key: string): T[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const save = (key: string, rows: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* storage full: the rows stay in memory and in the cloud */
  }
};
const clone = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));
/** Keep the bin from growing without end on the device. */
const BIN_LIMIT = 2000;

// ===========================================================================
// Part 1: state (called near the top of TradingProvider)
// ===========================================================================
interface StoreDeps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  users: AppUser[];
  currentUserId?: string | null;
  isCloudSyncReady: boolean;
  syncToSupabase: (table: string, rows: unknown[]) => Promise<void>;
}

export const useControlStore = (d: StoreDeps) => {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(() => load(KEYS.APPROVALS));
  const [deletedRecords, setDeletedRecords] = useState<DeletedRecord[]>(() => load(KEYS.BIN));
  const [branches, setBranches] = useState<Branch[]>(() => load(KEYS.BRANCHES));
  const [branchView, setBranchViewState] = useState<string>(() => {
    try {
      return localStorage.getItem(KEYS.VIEW) || 'all';
    } catch {
      return 'all';
    }
  });
  const [autoBackups, setAutoBackups] = useState<AutoBackupMeta[]>([]);
  const [lastDownload, setLastDownload] = useState<string | null>(() => lastDownloadAt());
  // The reminder counts from the first day the app was used on this device (no nagging on day one).
  const [firstUse] = useState<string>(() => {
    try {
      const v = localStorage.getItem(KEYS.FIRST_USE);
      if (v) return v;
      const now = new Date().toISOString();
      localStorage.setItem(KEYS.FIRST_USE, now);
      return now;
    } catch {
      return new Date().toISOString();
    }
  });
  /** Approvals being decided right now (a double tap must not post twice). */
  const deciding = useRef(new Set<string>());
  /** Builds the full backup JSON (set by TradingProvider once its data functions exist). */
  const backupBuilder = useRef<() => string>(() => '{}');

  useEffect(() => save(KEYS.APPROVALS, approvals), [approvals]);
  useEffect(() => save(KEYS.BIN, deletedRecords), [deletedRecords]);
  useEffect(() => save(KEYS.BRANCHES, branches), [branches]);
  useEffect(() => {
    try {
      localStorage.setItem(KEYS.VIEW, branchView);
    } catch {
      /* ignore */
    }
  }, [branchView]);
  useEffect(() => { void d.syncToSupabase('approvals', approvals); }, [approvals, d.isCloudSyncReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void d.syncToSupabase('deleted_records', deletedRecords); }, [deletedRecords, d.isCloudSyncReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void d.syncToSupabase('branches', branches); }, [branches, d.isCloudSyncReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Document counters: a synchronous mirror so two documents saved in one tick never share a number.
  const counters = useRef<Record<string, number>>({ ...(d.settings.docCounters || {}) });
  useEffect(() => {
    const incoming = d.settings.docCounters || {};
    const merged = { ...counters.current };
    Object.entries(incoming).forEach(([k, v]) => { merged[k] = Math.max(merged[k] || 0, Number(v) || 0); });
    counters.current = merged;
  }, [d.settings.docCounters]);

  /** Take the next number of a series (the counter moves on at once; it never goes back). */
  const nextDocNumber = (key: DocSeriesKey, date: string, existing: string[]): string => {
    const plan = planDocNumber({ numberSeries: d.settings.numberSeries, docCounters: counters.current }, key, date, existing);
    counters.current = { ...counters.current, [plan.counter]: plan.n };
    d.setSettings((prev) => ({ ...prev, docCounters: { ...(prev.docCounters || {}), [plan.counter]: Math.max(prev.docCounters?.[plan.counter] || 0, plan.n) } }));
    return plan.number;
  };

  const main = mainBranchId(branches);
  const enabled = branchesOn(branches);
  const me = d.users.find((u) => u.id === d.currentUserId);
  const currentBranchId = enabled ? (me?.branchId && branches.some((b) => b.id === me.branchId) ? me.branchId : main) : null;
  /** Fields to put on a new bill / expense / cash entry / payment (nothing while there is only one branch). */
  const branchStamp = (): { branchId?: string } => (currentBranchId ? { branchId: currentBranchId } : {});
  const effectiveView = enabled && branches.some((b) => b.id === branchView) ? branchView : 'all';

  // Daily automatic backup: shortly after sign-in, then every hour (makes at most one per day).
  useEffect(() => {
    if (!d.currentUserId) return;
    if ((import.meta as { env?: { MODE?: string } }).env?.MODE === 'test' && !(globalThis as { __SARMAYA_AUTOBACKUP__?: boolean }).__SARMAYA_AUTOBACKUP__) return;
    let stopped = false;
    const tick = async () => {
      try {
        const store = getBackupStore();
        await runDailyBackup(store, () => backupBuilder.current(), todayISO());
        const list = await store.list();
        if (!stopped) setAutoBackups(list);
      } catch (err) {
        console.warn('Automatic backup failed:', (err as Error)?.message || err);
      }
    };
    const first = setTimeout(tick, 2500);
    const every = setInterval(tick, 60 * 60 * 1000);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [d.currentUserId]);

  const refreshAutoBackups = async () => {
    try {
      setAutoBackups(await getBackupStore().list());
    } catch {
      setAutoBackups([]);
    }
  };

  const hydrate = (data: { approvals?: ApprovalRequest[] | null; deletedRecords?: DeletedRecord[] | null; branches?: Branch[] | null }) => {
    const keep = <T,>(cloud: T[] | null | undefined, set: React.Dispatch<React.SetStateAction<T[]>>) => {
      if (!cloud) return;
      set((prev) => (cloud.length > 0 || prev.length === 0 ? cloud : prev));
    };
    keep(data.approvals, setApprovals);
    keep(data.deletedRecords, setDeletedRecords);
    keep(data.branches, setBranches);
  };

  const reset = () => {
    setApprovals([]);
    setDeletedRecords([]);
    setBranches([]);
    setBranchViewState('all');
  };

  const backupData = () => ({ approvals, deletedRecords, branches });
  const restoreFrom = (data: { approvals?: unknown; deletedRecords?: unknown; branches?: unknown }) => {
    if (Array.isArray(data.approvals)) setApprovals(data.approvals as ApprovalRequest[]);
    if (Array.isArray(data.deletedRecords)) setDeletedRecords(data.deletedRecords as DeletedRecord[]);
    if (Array.isArray(data.branches)) setBranches(data.branches as Branch[]);
  };

  return {
    approvals,
    setApprovals,
    deletedRecords,
    setDeletedRecords,
    branches,
    setBranches,
    branchView: effectiveView,
    setBranchView: (id: string) => setBranchViewState(id || 'all'),
    mainBranchId: main,
    branchesEnabled: enabled,
    currentBranchId,
    branchStamp,
    nextDocNumber,
    counters,
    deciding,
    backupBuilder,
    autoBackups,
    setAutoBackups,
    refreshAutoBackups,
    lastDownload,
    setLastDownload,
    firstUse,
    hydrate,
    reset,
    backupData,
    restoreFrom,
  };
};

export type ControlStore = ReturnType<typeof useControlStore>;

// ===========================================================================
// Part 2: actions (called near the end of TradingProvider, once every action exists)
// ===========================================================================
export interface ControlApi {
  // Approvals
  approvals: ApprovalRequest[];
  approvalRules: ApprovalRules;
  updateApprovalRules: (rules: ApprovalRules) => Result;
  /** Signed-in user may approve / reject (and is not stopped by the rules). */
  canApprove: boolean;
  approveRequest: (id: string, note?: string) => Result;
  rejectRequest: (id: string, note: string) => Result;
  /** The person who asked takes the request back. */
  cancelRequest: (id: string) => Result;
  /** Why this bill would need approval for the signed-in user (null = it will post straight away). */
  billApprovalReasons: (input: BillLikeInput) => string[] | null;
  /** Why a supplier payment of this amount would need approval for the signed-in user (null = none). */
  supplierPaymentApproval: (amount: number) => string | null;
  /** Whether deleting a bill needs approval for the signed-in user. */
  billDeleteNeedsApproval: boolean;

  // Deleted records bin
  deletedRecords: DeletedRecord[];
  /** Delete through the bin with a reason (same as the screens' delete buttons). */
  deleteRecord: (kind: DeletedKind, id: string, reason?: string) => Result;
  canRestore: (rec: DeletedRecord) => boolean;
  /** Why a deleted bill / payment can only be viewed, not restored (null = it can be restored). */
  restoreBlockReason: (rec: DeletedRecord) => string | null;
  restoreDeletedRecord: (binId: string) => Result;

  // Document numbers
  numberSeries: Record<DocSeriesKey, DocSeriesConfig>;
  updateNumberSeries: (key: DocSeriesKey, cfg: DocSeriesConfig) => Result;
  /** The number the next document of this kind will get (nothing is used up). */
  previewDocNumber: (key: DocSeriesKey, date?: string) => string;
  /** Take the next number of a series for a document being saved now. */
  nextDocNumber: (key: DocSeriesKey, date?: string) => string;

  // Branches
  branches: Branch[];
  branchesEnabled: boolean;
  mainBranchId: string | null;
  currentBranchId: string | null;
  branchView: string;
  setBranchView: (id: string) => void;
  addBranch: (input: { name: string; address?: string; phone?: string }) => Result & { branch?: Branch };
  updateBranch: (id: string, patch: { name?: string; address?: string; phone?: string }) => Result;
  deleteBranch: (id: string) => Result;
  setUserBranch: (userId: string, branchId: string | null) => Result;
  setGodownBranch: (godownId: string, branchId: string | null) => Result;
  branchName: (id?: string | null) => string;

  // Automatic backups
  autoBackups: AutoBackupMeta[];
  refreshAutoBackups: () => Promise<void>;
  backupNow: () => Promise<Result>;
  restoreAutoBackup: (id: string) => Promise<Result>;
  deleteAutoBackup: (id: string) => Promise<Result>;
  lastBackupDownloadAt: string | null;
  backupReminderDue: boolean;
}

/** The fields of a bill the rules look at (CreateBillInput has them all). */
export interface BillLikeInput {
  customerId: string;
  newCustomer?: { name: string; phone: string };
  items: { productId: string; name?: string; qty: number; unitPrice: number; discountType?: 'rs' | 'pct'; discountValue?: number; free?: boolean; schemeId?: string }[];
  discount?: number;
  /** Freight / loading charged on the bill (part of the total the customer owes). */
  freightCharges?: number;
  /** Vehicle charges on the bill (part of the total). */
  vehicleCharges?: number;
  paidNow?: number;
  paymentMethod?: string;
  payments?: { method: string; amount: number }[];
  cheque?: { amount: number; bankName: string; chequeNumber: string; chequeDate: string };
  date?: string;
  overrideReason?: string;
  allowOverLimit?: boolean;
  godownId?: string;
  notes?: string;
}

type BillResult = { success: boolean; message: string; invoice?: Invoice };
type SumResult = DeleteSummary;

interface ApiDeps {
  store: ControlStore;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  currentUser: { id: string; name: string } | null | undefined;
  users: AppUser[];
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  can: (p: string) => boolean;
  logAuditEvent: (action: string, details: string, severity?: 'info' | 'warning' | 'danger', category?: any) => void;
  uid: (prefix: string) => string;
  // data
  invoices: Invoice[];
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  purchases: Purchase[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  returns: StockReturn[];
  adjustments: StockAdjustment[];
  quotations: Quotation[];
  purchaseOrders: PurchaseOrder[];
  /** Purchase invoices (classic layer): their numbers belong to the purchase_invoice series. */
  purchaseInvoices?: { invoiceNumber: string }[];
  manualJournals: { id: string; ref: string; date: string; memo: string }[];
  bookings: Booking[];
  dispatches: Dispatch[];
  ledger: LedgerEntry[];
  cheques: Cheque[];
  stockBatches: StockBatch[];
  godowns: { id: string; name: string }[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  /** An expense / cash entry owned by a cheque or a finance record (changed from there, never deleted on its own). */
  isLinkedRecord: (id: string) => boolean;
  planBill?: (items: { productId: string; qty: number }[], godownId: string | undefined, onDate: string) => { ok: boolean; message?: string };
  importSystemBackup: (json: string) => Result;
  exportSystemBackup: () => string;
  // actions that the rules / bin wrap
  createBill: (input: any) => BillResult;
  editBill?: (invoiceId: string, input: any) => BillResult;
  recordSupplierPayment: (supplierId: string, amount: number, notes?: string, date?: string, opts?: { bankCode?: string }) => LedgerEntry | undefined;
  /** Vouchers (see voucherActions.ts): the rules and the bin wrap these. */
  vouchers: {
    addVoucher: (input: VoucherInput) => Result & { voucher?: JournalEntry };
    deleteVoucher: (id: string) => Result;
    voucherSnapshot: (id: string) => VoucherSnapshot | null;
    restoreVoucher: (snap: VoucherSnapshot) => Result;
    voucherRestoreBlock: (snap: VoucherSnapshot) => string | null;
    validate: (input: VoucherInput) => string[];
  };
  issueCheque: (input: any) => Result & { cheque?: Cheque };
  adjustStockBy: (input: any) => Result & { adjustment?: StockAdjustment };
  deleteBill: (id: string) => Result;
  deleteInvoice: (id: string) => Result;
  deleteCustomer: (id: string) => SumResult;
  deleteSupplier: (id: string) => SumResult;
  deleteProduct: (id: string) => SumResult;
  deleteExpense: (id: string) => void;
  deleteCashEntry: (id: string) => void;
  deleteReturn: (id: string) => Result;
  deletePurchaseReturn: (id: string) => Result;
  undoStockAdjustment: (id: string) => Result;
  deleteAdjustment: (id: string) => void;
  deleteQuotation: (id: string) => void;
  deletePurchaseOrder: (id: string) => void;
  deletePurchase: (id: string) => SumResult;
  deleteManualJournal: (id: string) => Result;
  deleteBooking: (id: string) => SumResult;
  deleteDispatch: (id: string) => SumResult;
  deleteLedgerEntry: (id: string) => void;
  /** Newer records (purchasing, finance, sales team, godowns) whose deletes also keep a copy in the bin. */
  more: {
    supplierBills: { id: string; billNumber: string; supplierId: string; amount: number; date: string }[];
    supplierClaims: { id: string; claimNumber: string; supplierId: string; amount?: number; qty: number; productId: string }[];
    fixedAssets: { id: string; name: string; cost: number }[];
    staff: { id: string; name: string; role?: string }[];
    staffAdvances: { id: string; staffId: string; amount: number; date: string }[];
    costCentres: { id: string; name: string }[];
    salesmen: { id: string; name: string }[];
    areas: { id: string; name: string }[];
    schemes: { id: string; name: string }[];
    deleteSupplierBill: (id: string) => Result;
    deleteSupplierClaim: (id: string) => Result;
    removePurchaseOrder: (id: string) => Result;
    deleteFixedAsset: (id: string) => Result;
    deleteStaff: (id: string) => Result;
    deleteStaffAdvance: (id: string) => Result;
    deleteCostCentre: (id: string) => Result;
    deleteSalesman: (id: string) => Result;
    deleteArea: (id: string) => Result;
    deleteScheme: (id: string) => Result;
    deleteGodown: (id: string) => Result;
  };
}

export const createControlApi = (d: ApiDeps) => {
  const s = d.store;
  const me = d.currentUser?.name || 'Unknown';
  const rules: ApprovalRules = d.settings.approvalRules || {};
  const canApprove = d.can('approvals:approve');
  const gated = !canApprove && anyRuleOn(rules);
  const custName = (id?: string | null) => d.customers.find((c) => c.id === id)?.name || 'Customer';
  const supName = (id?: string | null) => {
    const x = d.suppliers.find((v) => v.id === id);
    return x ? x.company || x.name : 'Supplier';
  };

  // -------------------------------------------------------------------------
  // Approvals
  // -------------------------------------------------------------------------
  const queue = (kind: ApprovalKind, ruleKeys: ApprovalRuleKey[], reasons: string[], title: string, amount: number, payload: unknown, note?: string): ApprovalRequest => {
    const req: ApprovalRequest = {
      id: d.uid('apr'),
      kind,
      rules: ruleKeys,
      status: 'pending',
      title,
      reasons,
      amount: round2(amount),
      payload: clone(payload),
      ...(note?.trim() ? { note: note.trim() } : {}),
      requestedBy: d.currentUser?.name,
      requestedById: d.currentUser?.id,
      requestedAt: new Date().toISOString(),
      branchId: s.currentBranchId,
    };
    s.setApprovals((prev) => [req, ...prev]);
    d.logAuditEvent('Sent for Approval', `${title} — ${reasons.join('; ')}`, 'warning', 'billing');
    return req;
  };

  /** Bill lines exactly as createBill takes them (free scheme lines are always price 0, no discount). */
  const billItems = (input: BillLikeInput) =>
    (input.items || []).filter((it) => it.productId && it.qty > 0).map((it) => (it.free ? { ...it, unitPrice: 0, discountType: undefined, discountValue: undefined } : it));

  /** Bill totals exactly as createBill works them out (freight included). */
  const billFigures = (input: BillLikeInput) => {
    const items = billItems(input);
    const lineDisc = items.map((it) => lineDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountValue));
    const subtotal = round2(items.reduce((a, it, i) => a + round2(it.qty * it.unitPrice) - lineDisc[i], 0));
    const discount = round2(Math.min(Math.max(0, input.discount || 0), subtotal));
    const tax = round2(((subtotal - discount) * (d.settings.taxRatePct ?? 0)) / 100);
    const freight = round2(Math.max(0, Number(input.freightCharges) || 0));
    const vehicle = round2(Math.max(0, Number(input.vehicleCharges) || 0));
    const total = round2(subtotal - discount + tax + freight + vehicle);
    const parts = input.payments ? input.payments : (input.paidNow || 0) > 0 ? [{ method: input.paymentMethod || 'Cash', amount: input.paidNow || 0 }] : [];
    const chequeAmt = input.cheque && Number(input.cheque.amount) > 0 ? Number(input.cheque.amount) : 0;
    const pay = resolveBillPayments(total, parts, chequeAmt);
    return { items, total, pay, balanceDue: pay.error ? total : round2(total - pay.paid) };
  };

  const billCustomer = (input: BillLikeInput): Customer | null => {
    const c = d.customers.find((x) => x.id === input.customerId);
    if (c) return c;
    const name = input.newCustomer?.name.trim();
    if (!name) return null;
    const phone = (input.newCustomer?.phone || '').replace(/\D/g, '');
    return d.customers.find((x) => x.name.trim().toLowerCase() === name.toLowerCase() || (phone && x.phone.replace(/\D/g, '') === phone)) || ({ id: '', name, company: name, phone: input.newCustomer?.phone || '', email: '', address: '', totalDue: 0, creditLimit: 0, createdAt: todayISO() } as Customer);
  };

  const billRules = (input: BillLikeInput): { keys: ApprovalRuleKey[]; reasons: string[] } | null => {
    if (!gated) return null;
    const keys: ApprovalRuleKey[] = [];
    const reasons: string[] = [];
    const limit = Number(rules.discountPctAbove) || 0;
    if (limit > 0) {
      // A scheme's own "% off" (the shop's standing offer) is not a discount the staff gave.
      const lines = billItems(input).map((it) => (it.schemeId && !it.free ? { ...it, discountType: undefined, discountValue: undefined } : it));
      const disc = billDiscountPct(lines, input.discount || 0);
      if (disc.pct > limit + 1e-9) {
        keys.push('discount');
        reasons.push(`Discount ${fmtPct(disc.pct)} (${rs(disc.discount)}) is over the ${fmtPct(limit)} limit`);
      }
    }
    if (rules.creditLimit && !d.can('override_credit')) {
      const f = billFigures(input);
      const credit = creditCheck(billCustomer(input), f.balanceDue);
      if (credit.over) {
        keys.push('credit_limit');
        reasons.push(`Over the credit limit: would owe ${rs(credit.after)} (limit ${rs(credit.limit)})`);
      }
    }
    return keys.length ? { keys, reasons } : null;
  };

  /** The checks createBill would refuse on, so a request that can never post is not sent. */
  const billProblem = (input: BillLikeInput): string | null => {
    const f = billFigures(input);
    if (f.items.length === 0) return 'Add at least one item with a quantity.';
    if (f.items.some((it) => !(it.unitPrice >= 0))) return 'A price cannot be negative.';
    if (!billCustomer(input)) return 'Pick a customer first.';
    const date = input.date || todayISO();
    if (date > todayISO()) return 'The bill date cannot be in the future.';
    const locked = booksLockedFor(d.settings, date);
    if (locked) return locked;
    if (f.total <= 0) return 'The bill total must be more than zero.';
    if (f.pay.error) return f.pay.error;
    if (input.cheque && Number(input.cheque.amount) > 0) {
      if (!d.can('finance:record_payment')) return "You don't have permission to record cheques. Ask a manager or admin.";
      if (!String(input.cheque.chequeNumber || '').trim()) return 'Enter the cheque number.';
      if (!String(input.cheque.bankName || '').trim()) return 'Enter the bank name of the cheque.';
    }
    if (d.settings.allowNegativeStock === false) {
      const short = shortStockLines(f.items, d.products);
      if (short.length) return `${short.map((x) => `${x.name}: not enough stock`).join('; ')}.`;
    }
    const plan = d.planBill?.(f.items, input.godownId, todayISO());
    if (plan && !plan.ok) return plan.message || 'Not enough stock.';
    return null;
  };

  const createBill = (input: BillLikeInput): BillResult & { pendingApproval?: ApprovalRequest } => {
    const hit = billRules(input);
    if (!hit) return d.createBill(input);
    const problem = billProblem(input);
    if (problem) return { success: false, message: problem };
    const f = billFigures(input);
    const cust = billCustomer(input);
    const payload = { ...input };
    delete (payload as { allowOverLimit?: boolean }).allowOverLimit;
    const req = queue('bill', hit.keys, hit.reasons, `Bill for ${cust?.name || 'customer'} — ${rs(f.total)}`, f.total, payload, input.overrideReason);
    return { success: true, message: `Sent for approval: ${hit.reasons.join('; ')}. The bill is posted when a manager approves it.`, pendingApproval: req };
  };

  /**
   * Editing a saved bill: the same approval rules as a new bill. The credit limit is checked by the edit
   * itself (it knows the old bill's unpaid part); any other rule hit means only an approver may make the edit.
   */
  const editBill = (invoiceId: string, input: BillLikeInput): BillResult => {
    if (!d.editBill) return fail('Editing bills is not available.');
    const hit = billRules({ ...input, payments: undefined, paidNow: 0, cheque: undefined });
    const other = hit ? hit.reasons.filter((_r, i) => hit.keys[i] !== 'credit_limit') : [];
    if (other.length && !canApprove) return fail(`This edit needs a manager's approval: ${other.join('; ')}. Ask a manager or admin to make the change.`);
    return d.editBill(invoiceId, input);
  };

  const supplierPaymentApproval = (amount: number): string | null => {
    const limit = Number(rules.supplierPaymentAbove) || 0;
    if (!gated || !(limit > 0) || !(amount > limit)) return null;
    return `Supplier payment of ${rs(amount)} is over the ${rs(limit)} limit`;
  };

  const recordSupplierPayment = (supplierId: string, amount: number, notes?: string, date?: string, opts?: { bankCode?: string }): LedgerEntry | undefined => {
    const why = supplierPaymentApproval(round2(Number(amount) || 0));
    if (!why || !d.suppliers.some((x) => x.id === supplierId)) return d.recordSupplierPayment(supplierId, amount, notes, date, opts);
    queue('supplier_payment', ['supplier_payment'], [why], `Pay ${supName(supplierId)} — ${rs(amount)}`, amount, { supplierId, amount: round2(amount), notes, date: date || todayISO(), ...(opts?.bankCode ? { bankCode: opts.bankCode } : {}) });
    return undefined;
  };

  /** A payment voucher that pays suppliers more than the limit goes to a manager (like a supplier payment). */
  const addVoucher = (input: VoucherInput): Result & { voucher?: JournalEntry; pendingApproval?: ApprovalRequest } => {
    const paid = voucherSupplierPayments(input);
    const why = paid > 0 ? supplierPaymentApproval(paid) : null;
    if (!why) return d.vouchers.addVoucher(input);
    const errors = d.vouchers.validate(input);
    if (errors.length) return fail(errors[0]);
    const req = queue('voucher', ['supplier_payment'], [why], `${voucherTypeInfo(input.type).label} — ${input.narration.trim()} — ${rs(paid)} to suppliers`, paid, input);
    return { success: true, message: `Sent for approval: ${why}. The voucher is posted when a manager approves it.`, pendingApproval: req };
  };

  const issueCheque = (input: { supplierId: string; amount: number; bankName: string; chequeNumber: string; chequeDate: string; date?: string; note?: string }) => {
    const why = supplierPaymentApproval(round2(Number(input.amount) || 0));
    if (!why) return d.issueCheque(input);
    if (!d.suppliers.some((x) => x.id === input.supplierId)) return fail('Pick the supplier.');
    if (!String(input.chequeNumber || '').trim() || !String(input.bankName || '').trim()) return fail('Enter the cheque number and bank.');
    const req = queue('supplier_cheque', ['supplier_payment'], [why], `Cheque ${input.chequeNumber} to ${supName(input.supplierId)} — ${rs(input.amount)}`, input.amount, input, input.note);
    return { success: true, message: `Sent for approval: ${why}. The cheque is recorded when a manager approves it.`, pendingApproval: req };
  };

  const stockLossValue = (input: { productId: string; deltaQty: number; batchId?: string | null; date?: string }) => {
    const delta = Number(input.deltaQty) || 0;
    if (delta >= 0) return 0;
    const p = d.products.find((x) => x.id === input.productId);
    if (!p) return 0;
    const row = input.batchId ? d.stockBatches.find((r) => r.id === input.batchId) : undefined;
    const cost = row?.costPrice && row.costPrice > 0 ? row.costPrice : costPerKgOn(d.purchases, p.id, input.date || todayISO()) ?? (p.costPricePerKg && p.costPricePerKg > 0 ? p.costPricePerKg : 0);
    return round2(-delta * cost);
  };

  const adjustStockBy = (input: { productId: string; deltaQty: number; reason: string; godownId?: string | null; batchId?: string | null; note?: string; date?: string }) => {
    const limit = Number(rules.stockLossAbove) || 0;
    const value = stockLossValue(input);
    if (!gated || !(limit > 0) || !(value > limit)) return d.adjustStockBy(input);
    if (!d.can('stock:adjust')) return fail("You don't have permission to adjust stock. Ask a manager or admin.");
    const date = input.date || todayISO();
    if (date > todayISO()) return fail('The date cannot be in the future.');
    const locked = booksLockedFor(d.settings, date);
    if (locked) return fail(locked);
    const p = d.products.find((x) => x.id === input.productId)!;
    const why = `Stock loss worth ${rs(value)} is over the ${rs(limit)} limit`;
    const req = queue('stock_loss', ['stock_loss'], [why], `Take off ${Math.abs(input.deltaQty)} ${p.unit || 'pcs'} ${p.name} — ${rs(value)}`, value, { ...input, date }, input.note);
    return { success: true, message: `Sent for approval: ${why}. The stock changes when a manager approves it.`, pendingApproval: req };
  };

  // -------------------------------------------------------------------------
  // Deleted records bin
  // -------------------------------------------------------------------------
  const addToBin = (kind: DeletedKind, snap: { recordId: string; label: string; data: unknown; related?: unknown }, reason: string, extra?: string) => {
    const rec: DeletedRecord = {
      id: d.uid('bin'),
      kind,
      recordId: snap.recordId,
      label: snap.label,
      data: clone(snap.data),
      ...(snap.related ? { related: clone(snap.related) } : {}),
      reason: reason || undefined,
      deletedBy: extra ? `${me} (${extra})` : me,
      deletedAt: new Date().toISOString(),
      restoredAt: null,
      restoredBy: null,
    };
    s.setDeletedRecords((prev) => [rec, ...prev].slice(0, BIN_LIMIT));
    if (reason) d.logAuditEvent('Delete Reason', `${snap.label}: ${reason}`, 'info', 'data');
  };

  const wrap = <A extends string, R>(kind: DeletedKind, fn: (id: A) => R, snap: (id: A) => { recordId: string; label: string; data: unknown; related?: unknown } | null, done: (r: R, id: A) => boolean) =>
    (id: A): R => {
      const reason = takeDeleteReason();
      const copy = snap(id);
      const r = fn(id);
      if (copy && done(r, id)) addToBin(kind, copy, reason);
      return r;
    };
  const okResult = (r: Result) => Boolean(r?.success);

  const billSnap = (id: string) => {
    const inv = d.invoices.find((i) => i.id === id);
    return inv ? { recordId: inv.id, label: `Bill ${inv.invoiceNumber} • ${inv.customerName} • ${rs(inv.totalAmount)}`, data: inv, related: { ledger: d.ledger.filter((l) => l.sourceId === inv.id) } } : null;
  };
  const rawBinDeleteBill = wrap('bill', d.deleteBill, billSnap, okResult);

  const pendingDeleteFor = (invoiceId: string) => s.approvals.find((a) => a.status === 'pending' && a.kind === 'delete_bill' && a.payload?.invoiceId === invoiceId);
  const billDeleteNeedsApproval = Boolean(gated && rules.deleteBills);
  const deleteBill = (id: string): Result & { pendingApproval?: ApprovalRequest } => {
    if (!billDeleteNeedsApproval) return rawBinDeleteBill(id);
    const reason = takeDeleteReason();
    const inv = d.invoices.find((i) => i.id === id);
    if (!inv) return fail('Bill not found.');
    if (pendingDeleteFor(id)) return fail(`Deleting ${inv.invoiceNumber} is already waiting for approval.`);
    const req = queue('delete_bill', ['delete_bill'], [`Delete bill ${inv.invoiceNumber}${reason ? ` — ${reason}` : ''}`], `Delete bill ${inv.invoiceNumber} (${inv.customerName}) — ${rs(inv.totalAmount)}`, inv.totalAmount, { invoiceId: id, invoiceNumber: inv.invoiceNumber }, reason);
    return { success: false, message: `A manager must approve deleting ${inv.invoiceNumber}. Your request is in Approvals.`, pendingApproval: req };
  };

  const deleteInvoice = wrap('bill', d.deleteInvoice, billSnap, okResult);
  const deleteCustomer = wrap('customer', d.deleteCustomer, (id) => {
    const c = d.customers.find((x) => x.id === id);
    return c ? { recordId: id, label: `Customer ${c.name}${c.phone ? ` • ${c.phone}` : ''}${c.totalDue ? ` • balance ${rs(c.totalDue)}` : ''}`, data: c, related: { bills: d.invoices.filter((i) => i.customerId === id).map((i) => i.invoiceNumber) } } : null;
  }, (r) => (r?.customers || 0) > 0);
  const deleteSupplier = wrap('supplier', d.deleteSupplier, (id) => {
    const x = d.suppliers.find((v) => v.id === id);
    return x ? { recordId: id, label: `Supplier ${x.company || x.name}${x.totalOwed ? ` • owed ${rs(x.totalOwed)}` : ''}`, data: x } : null;
  }, (r) => (r?.suppliers || 0) > 0);
  const deleteProduct = wrap('item', d.deleteProduct, (id) => {
    const p = d.products.find((v) => v.id === id);
    return p ? { recordId: id, label: `Item ${p.name} • ${p.stockKg} ${p.unit || 'pcs'} in stock`, data: p } : null;
  }, (r) => (r?.products || 0) > 0);
  const deleteExpense = wrap('expense', d.deleteExpense, (id) => {
    const e = d.expenses.find((v) => v.id === id);
    return e ? { recordId: id, label: `Expense ${e.description} • ${rs(e.amount)} • ${formatDate(e.date)}`, data: e } : null;
  }, (_r, id) => {
    const e = d.expenses.find((v) => v.id === id);
    return Boolean(e && !booksLockedFor(d.settings, e.date) && !d.isLinkedRecord(id));
  });
  const deleteCashEntry = wrap('cash_entry', d.deleteCashEntry, (id) => {
    const e = d.cashEntries.find((v) => v.id === id);
    if (!e) return null;
    const legs = e.pairId ? d.cashEntries.filter((c) => c.pairId === e.pairId) : [e];
    return { recordId: id, label: `Cash ${e.direction === 'in' ? 'in' : 'out'} ${rs(e.amount)} • ${e.description} • ${formatDate(e.date)}`, data: legs };
  }, (_r, id) => {
    const e = d.cashEntries.find((v) => v.id === id);
    return Boolean(e && !booksLockedFor(d.settings, e.date) && !d.isLinkedRecord(id));
  });
  const retSnap = (id: string) => {
    const r = d.returns.find((v) => v.id === id);
    return r ? { recordId: id, label: `${r.kind === 'sales' ? 'Return' : 'Debit note'} ${r.returnNumber} • ${r.kind === 'sales' ? custName(r.customerId) : supName(r.supplierId)} • ${rs(r.amount)}`, data: r } : null;
  };
  const deleteReturn = wrap('return', d.deleteReturn, retSnap, okResult);
  const deletePurchaseReturn = wrap('debit_note', d.deletePurchaseReturn, retSnap, okResult);
  const adjSnap = (id: string) => {
    const a = d.adjustments.find((v) => v.id === id);
    const p = a ? d.products.find((x) => x.id === a.productId) : undefined;
    return a ? { recordId: id, label: `Stock adjustment ${p?.name || 'item'} ${a.deltaKg > 0 ? '+' : ''}${a.deltaKg} • ${formatDate(a.date.slice(0, 10))}`, data: a } : null;
  };
  const undoStockAdjustment = wrap('stock_adjustment', d.undoStockAdjustment, adjSnap, okResult);
  const deleteAdjustment = wrap('stock_adjustment', d.deleteAdjustment, adjSnap, (_r, id) => d.adjustments.some((a) => a.id === id));
  const deleteQuotation = wrap('quotation', d.deleteQuotation, (id) => {
    const q = d.quotations.find((v) => v.id === id);
    return q ? { recordId: id, label: `Quotation ${q.quoteNumber} • ${custName(q.customerId)} • ${rs(q.amount)}`, data: q } : null;
  }, (_r, id) => d.quotations.some((q) => q.id === id));
  const deletePurchaseOrder = wrap('purchase_order', d.deletePurchaseOrder, (id) => {
    const po = d.purchaseOrders.find((v) => v.id === id);
    return po ? { recordId: id, label: `Purchase order ${po.poNumber} • ${supName(po.supplierId)} • ${rs(po.amount)}`, data: po } : null;
  }, (_r, id) => d.purchaseOrders.some((p) => p.id === id));
  const deletePurchase = wrap('stock_receipt', d.deletePurchase, (id) => {
    const p = d.purchases.find((v) => v.id === id);
    return p ? { recordId: id, label: `Stock received ${p.receiptNumber} • ${supName(p.supplierId)} • ${rs(p.amount)}`, data: p } : null;
  }, (r) => (r?.purchases || 0) > 0);
  const deleteManualJournal = wrap('journal', d.deleteManualJournal, (id) => {
    const j = d.manualJournals.find((v) => v.id === id);
    return j ? { recordId: id, label: `Journal ${j.ref} • ${j.memo} • ${formatDate(j.date)}`, data: j } : null;
  }, okResult);
  const deleteBooking = wrap('booking', d.deleteBooking, (id) => {
    const b = d.bookings.find((v) => v.id === id);
    return b ? { recordId: id, label: `Booking ${b.bookingNumber} • ${custName(b.customerId)}`, data: b } : null;
  }, (r) => (r?.bookings || 0) > 0);
  const deleteDispatch = wrap('dispatch', d.deleteDispatch, (id) => {
    const x = d.dispatches.find((v) => v.id === id);
    return x ? { recordId: id, label: `Dispatch ${x.dispatchNumber}`, data: x } : null;
  }, (r) => (r?.dispatches || 0) > 0);
  const deleteLedgerEntry = wrap('payment', d.deleteLedgerEntry, (id) => {
    const l = d.ledger.find((v) => v.id === id);
    return l ? { recordId: id, label: `${l.type.replace(/_/g, ' ')} ${l.referenceId} • ${l.entityType === 'customer' ? custName(l.entityId) : supName(l.entityId)} • ${rs(l.debit || l.credit)}`, data: l } : null;
  }, (_r, id) => d.ledger.some((l) => l.id === id));

  // Purchasing, finance, sales team and godowns. A salesman / area still on bills is only switched off: no copy then.
  const m = d.more;
  const kept = (r: Result) => okResult(r) && !/switched off/i.test(r.message);
  const snapOf = <T extends { id: string }>(rows: T[], label: (x: T) => string) => (id: string) => {
    const x = rows.find((v) => v.id === id);
    return x ? { recordId: id, label: label(x), data: x } : null;
  };
  const staffName = (id: string) => m.staff.find((x) => x.id === id)?.name || 'staff';
  const deleteSupplierBill = wrap('supplier_bill', m.deleteSupplierBill, snapOf(m.supplierBills, (b) => `Supplier bill ${b.billNumber} • ${supName(b.supplierId)} • ${rs(b.amount)}`), okResult);
  const deleteSupplierClaim = wrap('supplier_claim', m.deleteSupplierClaim, snapOf(m.supplierClaims, (c) => `Claim ${c.claimNumber} • ${supName(c.supplierId)} • ${c.qty} ${d.products.find((p) => p.id === c.productId)?.name || 'item'}`), okResult);
  const removePurchaseOrder = wrap('purchase_order', m.removePurchaseOrder, (id) => {
    const po = d.purchaseOrders.find((v) => v.id === id);
    return po ? { recordId: id, label: `Purchase order ${po.poNumber} • ${supName(po.supplierId)} • ${rs(po.amount)}`, data: po } : null;
  }, okResult);
  const deleteFixedAsset = wrap('fixed_asset', m.deleteFixedAsset, snapOf(m.fixedAssets, (a) => `Fixed asset ${a.name} • ${rs(a.cost)}`), okResult);
  const deleteStaff = wrap('staff', m.deleteStaff, snapOf(m.staff, (x) => `Staff ${x.name}${x.role ? ` • ${x.role}` : ''}`), okResult);
  const deleteStaffAdvance = wrap('staff_advance', m.deleteStaffAdvance, snapOf(m.staffAdvances, (a) => `Advance to ${staffName(a.staffId)} • ${rs(a.amount)} • ${formatDate(a.date)}`), okResult);
  const deleteCostCentre = wrap('cost_centre', m.deleteCostCentre, snapOf(m.costCentres, (c) => `Cost centre ${c.name}`), okResult);
  const deleteSalesman = wrap('salesman', m.deleteSalesman, snapOf(m.salesmen, (x) => `Salesman ${x.name}`), kept);
  const deleteArea = wrap('area', m.deleteArea, snapOf(m.areas, (x) => `Area ${x.name}`), kept);
  const deleteScheme = wrap('scheme', m.deleteScheme, snapOf(m.schemes, (x) => `Scheme ${x.name}`), okResult);
  const deleteGodown = wrap('godown', m.deleteGodown, snapOf(d.godowns, (g) => `Godown ${g.name}`), okResult);
  const deleteVoucher = wrap('voucher', d.vouchers.deleteVoucher, (id) => {
    const snap = d.vouchers.voucherSnapshot(id);
    if (!snap) return null;
    const v = snap.voucher;
    const amt = round2(v.lines.reduce((a, l) => a + (Number(l.debit) || 0), 0));
    return { recordId: id, label: `Voucher ${v.ref} • ${v.memo} • ${rs(amt)} • ${formatDate(v.date)}`, data: snap };
  }, okResult);

  const deleters: Partial<Record<DeletedKind, (id: string) => unknown>> = {
    bill: deleteBill,
    customer: deleteCustomer,
    supplier: deleteSupplier,
    item: deleteProduct,
    expense: deleteExpense,
    cash_entry: deleteCashEntry,
    return: deleteReturn,
    debit_note: deletePurchaseReturn,
    quotation: deleteQuotation,
    purchase_order: deletePurchaseOrder,
    stock_receipt: deletePurchase,
    stock_adjustment: undoStockAdjustment,
    journal: deleteManualJournal,
    payment: deleteLedgerEntry,
    booking: deleteBooking,
    dispatch: deleteDispatch,
    supplier_bill: deleteSupplierBill,
    supplier_claim: deleteSupplierClaim,
    fixed_asset: deleteFixedAsset,
    staff: deleteStaff,
    staff_advance: deleteStaffAdvance,
    cost_centre: deleteCostCentre,
    salesman: deleteSalesman,
    area: deleteArea,
    scheme: deleteScheme,
    godown: deleteGodown,
    voucher: deleteVoucher,
  };

  const deleteRecord = (kind: DeletedKind, id: string, reason = ''): Result => {
    const fn = deleters[kind];
    if (!fn) return fail('This kind of record cannot be deleted here.');
    setDeleteReason(reason.trim());
    let r: unknown;
    try {
      r = fn(id);
    } finally {
      setDeleteReason('');
    }
    if (r && typeof r === 'object' && 'success' in (r as object)) return r as Result;
    if (r && typeof r === 'object' && typeof (r as { blocked?: unknown }).blocked === 'string') return fail((r as { blocked: string }).blocked);
    if (r && typeof r === 'object') {
      const n = Object.values(r as Record<string, number>).reduce((a, v) => a + (Number(v) || 0), 0);
      return n > 0 ? ok('Deleted.') : fail('Nothing was deleted.');
    }
    return ok('Deleted.');
  };

  const RESTORABLE: DeletedKind[] = ['customer', 'supplier', 'item', 'expense', 'cash_entry'];
  const canRestoreAtAll = d.can('system:backup_restore');

  // ---- Bills and payments: put back through the normal paths, or view-only with the reason ----
  const payLabel = (p: { method: string; notes?: string }) => {
    const first = (p.notes || '').split(' - ')[0].trim();
    if (first) return first;
    return p.method === 'cash' ? 'Cash' : p.method === 'online' ? 'Easypaisa / JazzCash' : 'Bank Transfer';
  };
  /** Why this deleted bill can't be made again by "New bill" with the same lines, or null. */
  const billRestoreBlock = (inv: Invoice): string | null => {
    if (!inv.billKind || inv.items.some((it) => it.qty == null)) return 'This invoice was made from bookings and dispatches, not as a bill. Enter it again from the booking.';
    if (d.invoices.some((i) => i.id === inv.id)) return 'This bill is already in the list.';
    const cust = d.customers.find((c) => c.id === inv.customerId);
    if (!cust) return `The customer ${inv.customerName} has been deleted. Restore the customer first.`;
    const missing = inv.items.find((it) => !d.products.some((p) => p.id === it.productId));
    if (missing) return `The item ${missing.productName} has been deleted. Restore the item first.`;
    const godowns = Array.from(new Set(inv.items.map((it) => it.godownId || '')));
    if (godowns.length > 1) return 'The lines of this bill came from different godowns. Enter it again as new bills.';
    if ((d.settings.taxRatePct ?? 0) !== (inv.taxRatePct ?? 0)) return `The sales tax rate has changed since (${inv.taxRatePct ?? 0}% then, ${d.settings.taxRatePct ?? 0}% now), so the same bill would come to a different total. Enter it again.`;
    const locked = booksLockedFor(d.settings, inv.issueDate);
    if (locked) return `The bill date is in a closed period. ${locked}`;
    const twin = d.invoices.find((i) => i.customerId === inv.customerId && i.issueDate === inv.issueDate && Math.abs(i.totalAmount - inv.totalAmount) < 0.005 && i.status !== 'cancelled');
    if (twin) return `${twin.invoiceNumber} for ${inv.customerName} on the same day for the same ${rs(inv.totalAmount)} is already there. It may have been entered again; check it before restoring.`;
    return null;
  };
  const PAYMENT_TYPES = ['payment_received', 'payment_made'];
  /** Why this deleted payment row can't be put back, or null. */
  const paymentRestoreBlock = (l: LedgerEntry): string | null => {
    if (!PAYMENT_TYPES.includes(l.type)) return 'Only plain payments can be put back. Cheques, bills and notes change other records too: enter them again.';
    if (d.ledger.some((x) => x.id === l.id)) return 'This payment is already in the books.';
    const who = l.entityType === 'customer' ? d.customers.some((c) => c.id === l.entityId) : d.suppliers.some((x) => x.id === l.entityId);
    if (!who) return `The ${l.entityType} of this payment has been deleted.`;
    if (l.sourceId && d.cheques.some((c) => c.id === l.sourceId)) return 'This row belongs to a cheque. Use Money → Cheques instead.';
    if (l.sourceId && l.sourceId.startsWith('inv') && !d.invoices.some((i) => i.id === l.sourceId)) return 'The bill this payment was made against has been deleted.';
    const locked = booksLockedFor(d.settings, l.date);
    if (locked) return `The payment date is in a closed period. ${locked}`;
    const twin = d.ledger.find((x) => x.entityId === l.entityId && x.type === l.type && x.date === l.date && Math.abs((x.credit || 0) - (l.credit || 0)) < 0.005 && Math.abs((x.debit || 0) - (l.debit || 0)) < 0.005);
    if (twin) return `A payment of ${rs(l.credit || l.debit)} on the same day (${twin.referenceId}) is already there. It may have been entered again.`;
    return null;
  };
  const restoreBlockReason = (rec: DeletedRecord): string | null => {
    if (rec.restoredAt) return null;
    if (rec.kind === 'bill') return billRestoreBlock(rec.data as Invoice);
    if (rec.kind === 'payment') return paymentRestoreBlock(rec.data as LedgerEntry);
    if (rec.kind === 'voucher') return d.vouchers.voucherRestoreBlock(rec.data as VoucherSnapshot);
    if (RESTORABLE.includes(rec.kind)) return null;
    return 'Returns, stock and other records change stock and several accounts at once, so they are kept here to view only. Enter them again instead.';
  };
  const canRestore = (rec: DeletedRecord) => canRestoreAtAll && !rec.restoredAt && (RESTORABLE.includes(rec.kind) || ((rec.kind === 'bill' || rec.kind === 'payment' || rec.kind === 'voucher') && !restoreBlockReason(rec)));

  /** A deleted bill is made again through createBill (stock, period lock, credit limit and payments checked again). */
  const restoreBill = (rec: DeletedRecord): Result => {
    const inv = rec.data as Invoice;
    const block = billRestoreBlock(inv);
    if (block) return fail(block);
    const paidSameDay = (inv.payments || []).filter((p) => p.method !== 'cheque' && p.date === inv.issueDate && p.amount > 0);
    const later = (inv.payments || []).filter((p) => p.method !== 'cheque' && p.date !== inv.issueDate && p.amount > 0);
    const cheque = (inv.payments || []).filter((p) => p.method === 'cheque');
    const salesmanOk = inv.salesmanId && d.more.salesmen.some((x) => x.id === inv.salesmanId);
    const areaOk = inv.areaId && d.more.areas.some((x) => x.id === inv.areaId);
    const note = `Restored from deleted bill ${inv.invoiceNumber}.`;
    const r = d.createBill({
      customerId: inv.customerId,
      items: inv.items.map((it) => ({
        productId: it.productId,
        name: it.productName,
        qty: it.qty as number,
        unitPrice: it.unitPrice ?? it.ratePerKg,
        unit: it.unit,
        ...(it.discountAmount ? { discountType: it.discountType, discountValue: it.discountValue } : {}),
        ...(it.customerRate ? { customerRate: true } : {}),
        ...(it.packPrice != null ? { packPrice: it.packPrice } : {}),
        ...(it.free ? { free: true, schemeId: it.schemeId, schemeName: it.schemeName } : {}),
      })),
      discount: inv.discount || 0,
      freightCharges: inv.freightCharges || 0,
      vehicleCharges: inv.handlingCharges || 0,
      payments: paidSameDay.map((p) => ({ method: payLabel(p), amount: p.amount })),
      date: inv.issueDate,
      godownId: inv.items[0]?.godownId,
      notes: inv.notes ? `${inv.notes} ${note}` : note,
      salesmanId: salesmanOk ? inv.salesmanId : null,
      areaId: areaOk ? inv.areaId : null,
      costCentreId: inv.costCentreId || null,
      ...(d.can('override_credit') ? { allowOverLimit: true, overrideReason: `Restored from deleted records by ${me}` } : {}),
    });
    if (!r.success || !r.invoice) return fail(`Could not restore: ${r.message}`);
    const newId = r.invoice.id;
    if (inv.branchId) d.setInvoices((prev) => prev.map((i) => (i.id === newId ? { ...i, branchId: inv.branchId } : i)));
    const extra: string[] = [];
    if (later.length) extra.push(`Payments made on other days (${later.map((p) => `${rs(p.amount)} on ${formatDate(p.date)}`).join(', ')}) were not put back: record them again with Receive payment.`);
    if (cheque.length) extra.push('The cheque on it was cancelled or bounced before the delete, so it is not put back.');
    return ok(`Bill ${inv.invoiceNumber} is back as ${r.invoice.invoiceNumber} (stock and the customer's account updated).${extra.length ? ` ${extra.join(' ')}` : ''}`);
  };

  /**
   * A deleted payment row is put back exactly as it was. Deleting a payment only removed its row (the
   * balance on the customer / supplier was left alone), so recording it again with "Receive payment"
   * would take the money off twice; putting the same row back is the exact reverse of the delete.
   */
  const restorePayment = (rec: DeletedRecord): Result => {
    const l = rec.data as LedgerEntry;
    const block = paymentRestoreBlock(l);
    if (block) return fail(block);
    d.setLedger((prev) => [l, ...prev]);
    return ok(`Payment ${l.referenceId} (${rs(l.credit || l.debit)}, ${formatDate(l.date)}) is back in the books.`);
  };

  const restoreDeletedRecord = (binId: string): Result => {
    const rec = s.deletedRecords.find((r) => r.id === binId);
    if (!rec) return fail('Record not found in the bin.');
    if (!canRestoreAtAll) return fail('Only an admin can restore deleted records.');
    if (rec.restoredAt) return fail('This record was already restored.');
    if (s.deciding.current.has(binId)) return fail('This record is already being restored.');
    if (rec.kind === 'bill' || rec.kind === 'payment' || rec.kind === 'voucher') {
      s.deciding.current.add(binId);
      const r = rec.kind === 'bill' ? restoreBill(rec) : rec.kind === 'voucher' ? d.vouchers.restoreVoucher(rec.data as VoucherSnapshot) : restorePayment(rec);
      if (!r.success) {
        s.deciding.current.delete(binId);
        return r;
      }
      const at = new Date().toISOString();
      s.setDeletedRecords((prev) => prev.map((x) => (x.id === binId ? { ...x, restoredAt: at, restoredBy: me } : x)));
      d.logAuditEvent('Deleted Record Restored', `${rec.label} — ${r.message}`, 'warning', 'data');
      return r;
    }
    if (!RESTORABLE.includes(rec.kind)) return fail(restoreBlockReason(rec) || 'This record cannot be restored.');
    let message = '';
    if (rec.kind === 'customer') {
      const c = rec.data as Customer;
      if (d.customers.some((x) => x.id === c.id)) return fail('That customer is already in the list.');
      const codeTaken = c.code && d.customers.some((x) => x.code && x.code.toLowerCase() === c.code!.toLowerCase());
      d.setCustomers((prev) => [{ ...c, totalDue: 0, ...(codeTaken ? { code: undefined } : {}) }, ...prev]);
      message = `${c.name} is back. Their balance starts at ${rs(0)} (old bills and payments were removed with them).`;
    } else if (rec.kind === 'supplier') {
      const x = rec.data as Supplier;
      if (d.suppliers.some((v) => v.id === x.id)) return fail('That supplier is already in the list.');
      const codeTaken = x.code && d.suppliers.some((v) => v.code && v.code.toLowerCase() === x.code!.toLowerCase());
      d.setSuppliers((prev) => [{ ...x, totalOwed: 0, ...(codeTaken ? { code: undefined } : {}) }, ...prev]);
      message = `${x.company || x.name} is back. What you owe them starts at ${rs(0)}.`;
    } else if (rec.kind === 'item') {
      const p = rec.data as Product;
      if (d.products.some((v) => v.id === p.id)) return fail('That item is already in the list.');
      d.setProducts((prev) => [{ ...p, stockKg: 0 }, ...prev]);
      message = `${p.name} is back with 0 in stock. Use "Adjust stock" or "Receive stock" to put the stock back.`;
    } else if (rec.kind === 'expense') {
      const e = rec.data as Expense;
      if (d.expenses.some((v) => v.id === e.id)) return fail('That expense is already there.');
      const locked = booksLockedFor(d.settings, e.date);
      if (locked) return fail(locked);
      d.setExpenses((prev) => [e, ...prev]);
      message = `Expense "${e.description}" (${rs(e.amount)}) is back.`;
    } else if (rec.kind === 'cash_entry') {
      const legs = (Array.isArray(rec.data) ? rec.data : [rec.data]) as CashEntry[];
      if (legs.some((l) => d.cashEntries.some((v) => v.id === l.id))) return fail('That entry is already there.');
      const locked = legs.map((l) => booksLockedFor(d.settings, l.date)).find(Boolean);
      if (locked) return fail(locked);
      d.setCashEntries((prev) => [...legs, ...prev]);
      message = `Cash entry "${legs[0]?.description}" is back.`;
    }
    const at = new Date().toISOString();
    s.setDeletedRecords((prev) => prev.map((r) => (r.id === binId ? { ...r, restoredAt: at, restoredBy: me } : r)));
    d.logAuditEvent('Deleted Record Restored', rec.label, 'warning', 'data');
    return ok(message);
  };

  // -------------------------------------------------------------------------
  // Approve / reject
  // -------------------------------------------------------------------------
  const decide = (id: string, patch: Partial<ApprovalRequest>) =>
    s.setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch, decidedBy: me, decidedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : a)));

  const approveRequest = (id: string, note = ''): Result => {
    if (!canApprove) return fail('Only a manager or admin can approve.');
    const req = s.approvals.find((a) => a.id === id);
    if (!req) return fail('Request not found.');
    if (req.status !== 'pending') return fail(`This request was already ${req.status}.`);
    if (s.deciding.current.has(id)) return fail('This request is already being approved.');
    s.deciding.current.add(id);
    const p = req.payload || {};
    const approvedNote = note.trim();
    let res: Result = fail('Unknown request.');
    let resultRef: string | undefined;
    if (req.kind === 'bill') {
      const r = d.createBill({ ...p, ...(req.rules.includes('credit_limit') ? { allowOverLimit: true, overrideReason: `Approved by ${me}${approvedNote ? `: ${approvedNote}` : req.note ? ` (${req.note})` : ''}` } : {}) });
      res = r;
      if (r.success && r.invoice) {
        const invId = r.invoice.id;
        resultRef = r.invoice.invoiceNumber;
        d.setInvoices((prev) => prev.map((i) => (i.id === invId ? { ...i, createdBy: req.requestedBy || i.createdBy, ...(req.branchId ? { branchId: req.branchId } : {}), approval: { requestId: req.id, requestedBy: req.requestedBy, approvedBy: me, approvedAt: new Date().toISOString(), ...(approvedNote ? { note: approvedNote } : {}), rules: req.rules } } : i)));
        res = ok(`Approved. Bill ${r.invoice.invoiceNumber} is posted.`);
      }
    } else if (req.kind === 'voucher') {
      const r = d.vouchers.addVoucher(p);
      res = r.success ? ok(`Approved. Voucher ${r.voucher?.ref} is posted.`) : r;
      if (r.success) resultRef = r.voucher?.ref;
    } else if (req.kind === 'supplier_payment') {
      const led = d.recordSupplierPayment(p.supplierId, p.amount, p.notes, p.date, p.bankCode ? { bankCode: p.bankCode } : undefined);
      if (led) {
        resultRef = led.referenceId;
        if (req.branchId) d.setLedger((prev) => prev.map((l) => (l.id === led.id ? { ...l, branchId: req.branchId } : l)));
        res = ok(`Approved. ${rs(p.amount)} paid to ${supName(p.supplierId)}.`);
      } else res = fail('The supplier was not found.');
    } else if (req.kind === 'supplier_cheque') {
      const r = d.issueCheque(p);
      res = r.success ? ok(`Approved. ${r.message}`) : r;
      if (r.success) resultRef = r.cheque?.chequeNumber;
    } else if (req.kind === 'stock_loss') {
      const r = d.adjustStockBy(p);
      res = r.success ? ok(`Approved. ${r.message}`) : r;
    } else if (req.kind === 'delete_bill') {
      setDeleteReason(`${req.note || 'No reason given'} — approved by ${me}${approvedNote ? `: ${approvedNote}` : ''}`);
      try {
        const r = rawBinDeleteBill(p.invoiceId);
        res = r.success ? ok(`Approved. ${r.message}`) : r;
        resultRef = p.invoiceNumber;
      } finally {
        setDeleteReason('');
      }
    }
    if (!res.success) {
      s.deciding.current.delete(id);
      return fail(`Could not approve: ${res.message}`);
    }
    decide(id, { status: 'approved', ...(approvedNote ? { decisionNote: approvedNote } : {}), ...(resultRef ? { resultRef } : {}) });
    d.logAuditEvent('Approved', `${req.title} (asked by ${req.requestedBy || 'staff'})${approvedNote ? ` — ${approvedNote}` : ''}`, 'warning', 'billing');
    return res;
  };

  const rejectRequest = (id: string, note: string): Result => {
    if (!canApprove) return fail('Only a manager or admin can reject.');
    const req = s.approvals.find((a) => a.id === id);
    if (!req) return fail('Request not found.');
    if (req.status !== 'pending') return fail(`This request was already ${req.status}.`);
    if (!note.trim()) return fail('Write a short note saying why it is rejected.');
    decide(id, { status: 'rejected', decisionNote: note.trim() });
    d.logAuditEvent('Rejected', `${req.title} (asked by ${req.requestedBy || 'staff'}) — ${note.trim()}`, 'warning', 'billing');
    return ok('Rejected. Nothing was posted.');
  };

  const cancelRequest = (id: string): Result => {
    const req = s.approvals.find((a) => a.id === id);
    if (!req) return fail('Request not found.');
    if (req.status !== 'pending') return fail(`This request was already ${req.status}.`);
    if (req.requestedById !== d.currentUser?.id && !canApprove) return fail('Only the person who asked can take it back.');
    s.setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'cancelled', decidedBy: me, decidedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : a)));
    return ok('Request taken back.');
  };

  const updateApprovalRules = (next: ApprovalRules): Result => {
    if (!d.can('system:company_settings') && !d.can('roles:manage')) return fail('Only an admin can change approval rules.');
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? round2(n) : null;
    };
    const clean: ApprovalRules = {
      discountPctAbove: num(next.discountPctAbove),
      creditLimit: Boolean(next.creditLimit),
      supplierPaymentAbove: num(next.supplierPaymentAbove),
      stockLossAbove: num(next.stockLossAbove),
      deleteBills: Boolean(next.deleteBills),
    };
    if ((clean.discountPctAbove ?? 0) > 100) return fail('A discount limit must be 100% or less.');
    d.setSettings((prev) => ({ ...prev, approvalRules: clean }));
    d.logAuditEvent('Approval Rules Changed', JSON.stringify(clean), 'warning', 'system');
    return ok('Approval rules saved.');
  };

  // -------------------------------------------------------------------------
  // Document numbers
  // -------------------------------------------------------------------------
  const existingNumbers = (key: DocSeriesKey): string[] => {
    switch (key) {
      case 'bill': return d.invoices.map((i) => i.invoiceNumber);
      case 'credit_note': return d.returns.filter((r) => r.kind === 'sales').map((r) => r.returnNumber);
      case 'debit_note': return d.returns.filter((r) => r.kind === 'purchase').map((r) => r.returnNumber);
      case 'quotation': return d.quotations.map((q) => q.quoteNumber);
      case 'receipt': return receiptNumbersIn(d.ledger);
      case 'supplier_payment': return d.ledger.filter((l) => l.type === 'payment_made').map((l) => l.referenceId);
      case 'po': return d.purchaseOrders.map((p) => p.poNumber);
      case 'purchase_invoice': return (d.purchaseInvoices || []).map((p) => p.invoiceNumber);
      case 'cpv': case 'crv': case 'bpv': case 'brv': case 'jv': return d.manualJournals.map((j) => j.ref);
      default: return [];
    }
  };
  const numberSeries = Object.fromEntries(DOC_SERIES.map((x) => [x.key, seriesConfig(d.settings, x.key)])) as Record<DocSeriesKey, DocSeriesConfig>;
  const previewDocNumber = (key: DocSeriesKey, date = todayISO()) =>
    planDocNumber({ numberSeries: d.settings.numberSeries, docCounters: s.counters.current }, key, date, existingNumbers(key)).number;
  const nextDocNumber = (key: DocSeriesKey, date = todayISO()) => s.nextDocNumber(key, date, existingNumbers(key));

  const updateNumberSeries = (key: DocSeriesKey, cfg: DocSeriesConfig): Result => {
    if (!d.can('system:company_settings')) return fail('Only an admin can change document numbers.');
    const prefix = (cfg.prefix || '').trim();
    if (!prefix) return fail('Enter a prefix, e.g. INV-.');
    if (prefix.length > 12 || /\s/.test(prefix)) return fail('Keep the prefix short, with no spaces (e.g. INV- or BK/).');
    const pad = Math.max(0, Math.min(8, Math.round(Number(cfg.pad) || 0)));
    const clash = DOC_SERIES.find((x) => x.key !== key && seriesConfig(d.settings, x.key).prefix.toLowerCase() === prefix.toLowerCase());
    if (clash) return fail(`${clash.label} already use the prefix ${prefix}.`);
    const nextCfg: DocSeriesConfig = { prefix, yearly: Boolean(cfg.yearly), pad: cfg.yearly && pad === 0 ? 4 : pad };
    const year = todayISO().slice(0, 4);
    const ck = counterKey(key, nextCfg, year);
    const lastUsed = Math.max(s.counters.current[ck] ?? 0, highestExisting(existingNumbers(key), nextCfg, year));
    const start = cfg.startAt != null && String(cfg.startAt) !== '' ? Math.round(Number(cfg.startAt)) : null;
    if (start != null) {
      if (!(start >= 1)) return fail('The next number must be 1 or more.');
      if (start <= lastUsed) return fail(`The next number can only move forward: ${lastUsed} is already used, so it must be ${lastUsed + 1} or more.`);
    }
    // A new setting starts from the highest number already used (so nothing is reused); "next number" can jump ahead.
    const counter = start != null ? start - 1 : lastUsed;
    s.counters.current = { ...s.counters.current, [ck]: counter };
    d.setSettings((prev) => ({
      ...prev,
      numberSeries: { ...(prev.numberSeries || {}), [key]: nextCfg },
      docCounters: { ...(prev.docCounters || {}), [ck]: Math.max(prev.docCounters?.[ck] || 0, counter) },
    }));
    d.logAuditEvent('Document Numbers Changed', `${key}: ${prefix}${nextCfg.yearly ? ' (yearly)' : ''}${start != null ? `, next ${start}` : ''}`, 'warning', 'system');
    return ok(`Saved. The next one will be ${planDocNumber({ numberSeries: { ...(d.settings.numberSeries || {}), [key]: nextCfg }, docCounters: s.counters.current }, key, todayISO(), existingNumbers(key)).number}.`);
  };

  // -------------------------------------------------------------------------
  // Branches
  // -------------------------------------------------------------------------
  const canManageBranches = d.can('system:company_settings');
  const branchName = (id?: string | null) => s.branches.find((b) => b.id === (id || s.mainBranchId))?.name || 'Main';
  const addBranch = (input: { name: string; address?: string; phone?: string }): Result & { branch?: Branch } => {
    if (!canManageBranches) return fail('Only an admin can add branches.');
    const name = input.name.trim();
    if (!name) return fail('Enter the branch name, e.g. Batkhela shop.');
    if (s.branches.some((b) => b.name.trim().toLowerCase() === name.toLowerCase())) return fail('A branch with that name already exists.');
    const branch: Branch = { id: d.uid('br'), name, ...(input.address?.trim() ? { address: input.address.trim() } : {}), ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}), godownIds: [], createdAt: new Date().toISOString() };
    s.setBranches((prev) => [...prev, branch]);
    d.logAuditEvent('Branch Added', name, 'info', 'system');
    return { success: true, message: s.branches.length === 0 ? `${name} added as the main branch. Add a second branch to start recording branches.` : `${name} added.`, branch };
  };
  const updateBranch = (id: string, patch: { name?: string; address?: string; phone?: string }): Result => {
    if (!canManageBranches) return fail('Only an admin can change branches.');
    const b = s.branches.find((x) => x.id === id);
    if (!b) return fail('Branch not found.');
    const name = patch.name != null ? patch.name.trim() : b.name;
    if (!name) return fail('Enter the branch name.');
    if (s.branches.some((x) => x.id !== id && x.name.trim().toLowerCase() === name.toLowerCase())) return fail('A branch with that name already exists.');
    s.setBranches((prev) => prev.map((x) => (x.id === id ? { ...x, name, address: patch.address ?? x.address, phone: patch.phone ?? x.phone, updatedAt: new Date().toISOString() } : x)));
    return ok('Branch saved.');
  };
  const deleteBranch = (id: string): Result => {
    if (!canManageBranches) return fail('Only an admin can remove branches.');
    const b = s.branches.find((x) => x.id === id);
    if (!b) return fail('Branch not found.');
    if (id === s.mainBranchId && s.branches.length > 1) return fail('The main branch cannot be removed while other branches exist.');
    const used = d.invoices.some((i) => i.branchId === id) || d.expenses.some((e) => e.branchId === id) || d.cashEntries.some((c) => c.branchId === id) || d.ledger.some((l) => l.branchId === id);
    if (used) return fail(`${b.name} has bills or money entries. It cannot be removed.`);
    s.setBranches((prev) => prev.filter((x) => x.id !== id));
    d.setUsers((prev) => prev.map((u) => (u.branchId === id ? { ...u, branchId: null, updatedAt: new Date().toISOString() } : u)));
    d.logAuditEvent('Branch Removed', b.name, 'warning', 'system');
    return ok(`${b.name} removed.`);
  };
  const setUserBranch = (userId: string, branchId: string | null): Result => {
    if (!canManageBranches && !d.can('users:edit')) return fail('Only an admin can change a user’s branch.');
    if (branchId && !s.branches.some((b) => b.id === branchId)) return fail('Branch not found.');
    const u = d.users.find((x) => x.id === userId);
    if (!u) return fail('User not found.');
    d.setUsers((prev) => prev.map((x) => (x.id === userId ? { ...x, branchId, updatedAt: new Date().toISOString() } : x)));
    d.logAuditEvent('User Branch Changed', `${u.name}: ${branchId ? branchName(branchId) : 'main branch'}`, 'info', 'users');
    return ok(`${u.name} now works in ${branchId ? branchName(branchId) : branchName(s.mainBranchId)}.`);
  };
  const setGodownBranch = (godownId: string, branchId: string | null): Result => {
    if (!canManageBranches) return fail('Only an admin can change this.');
    if (branchId && !s.branches.some((b) => b.id === branchId)) return fail('Branch not found.');
    s.setBranches((prev) => prev.map((b) => {
      const rest = (b.godownIds || []).filter((g) => g !== godownId);
      return { ...b, godownIds: b.id === branchId ? [...rest, godownId] : rest };
    }));
    const g = d.godowns.find((x) => x.id === godownId);
    return ok(`${g?.name || 'Godown'} ${branchId ? `belongs to ${branchName(branchId)}` : 'is not tied to a branch'}.`);
  };

  // -------------------------------------------------------------------------
  // Automatic backups
  // -------------------------------------------------------------------------
  const backupNow = async (): Promise<Result> => {
    try {
      await saveBackup(getBackupStore(), s.backupBuilder.current(), todayISO(), 'manual');
      await s.refreshAutoBackups();
      return ok('Backup saved on this device.');
    } catch (err) {
      return fail(`Could not save the backup: ${(err as Error)?.message || err}`);
    }
  };
  const restoreAutoBackup = async (id: string): Promise<Result> => {
    if (!d.can('system:backup_restore')) return fail('Only an admin can restore a backup.');
    const rec = await getBackupStore().get(id);
    if (!rec) return fail('That backup is no longer on this device.');
    const r = d.importSystemBackup(rec.json);
    if (r.success) d.logAuditEvent('Auto-backup Restored', `Backup of ${formatDate(rec.date)} (${new Date(rec.createdAt).toLocaleTimeString()}) restored.`, 'warning', 'system');
    return r.success ? ok(`Restored the backup of ${formatDate(rec.date)}.`) : r;
  };
  const deleteAutoBackup = async (id: string): Promise<Result> => {
    if (!d.can('system:backup_restore')) return fail('Only an admin can remove backups.');
    await getBackupStore().remove(id);
    await s.refreshAutoBackups();
    return ok('Backup removed from this device.');
  };
  const exportSystemBackup = () => {
    const json = d.exportSystemBackup();
    const at = new Date().toISOString();
    markDownloaded(at);
    s.setLastDownload(at);
    return json;
  };

  const api: ControlApi = {
    approvals: s.approvals,
    approvalRules: rules,
    updateApprovalRules,
    canApprove,
    approveRequest,
    rejectRequest,
    cancelRequest,
    billApprovalReasons: (input) => billRules(input)?.reasons || null,
    supplierPaymentApproval,
    billDeleteNeedsApproval,
    deletedRecords: s.deletedRecords,
    deleteRecord,
    canRestore,
    restoreBlockReason,
    restoreDeletedRecord,
    numberSeries,
    updateNumberSeries,
    previewDocNumber,
    nextDocNumber,
    branches: s.branches,
    branchesEnabled: s.branchesEnabled,
    mainBranchId: s.mainBranchId,
    currentBranchId: s.currentBranchId,
    branchView: s.branchView,
    setBranchView: s.setBranchView,
    addBranch,
    updateBranch,
    deleteBranch,
    setUserBranch,
    setGodownBranch,
    branchName,
    autoBackups: s.autoBackups,
    refreshAutoBackups: s.refreshAutoBackups,
    backupNow,
    restoreAutoBackup,
    deleteAutoBackup,
    lastBackupDownloadAt: s.lastDownload,
    backupReminderDue: backupReminderDue(s.lastDownload || s.firstUse),
  };

  /** Actions the provider exposes in place of the raw ones (rules + bin). */
  const overrides = {
    createBill,
    editBill,
    recordSupplierPayment,
    issueCheque,
    adjustStockBy,
    deleteBill,
    deleteInvoice,
    deleteCustomer,
    deleteSupplier,
    deleteProduct,
    deleteExpense,
    deleteCashEntry,
    deleteReturn,
    deletePurchaseReturn,
    undoStockAdjustment,
    deleteAdjustment,
    deleteQuotation,
    deletePurchaseOrder,
    deletePurchase,
    deleteManualJournal,
    deleteBooking,
    deleteDispatch,
    deleteLedgerEntry,
    deleteSupplierBill,
    deleteSupplierClaim,
    removePurchaseOrder,
    deleteFixedAsset,
    deleteStaff,
    deleteStaffAdvance,
    deleteCostCentre,
    deleteSalesman,
    deleteArea,
    deleteScheme,
    deleteGodown,
    deleteVoucher,
    addVoucher,
    exportSystemBackup,
  };

  return { api, overrides };
};

export { DEFAULT_SERIES };
