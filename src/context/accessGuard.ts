/**
 * The last line of the role rules: whatever a screen, menu, "Find anything" or a keyboard shortcut shows,
 * the actions themselves refuse what the signed-in role may not do.
 *
 *  - A read-only role (Auditor / Viewer, or any role with only "view" rights) changes nothing: every action
 *    of the app is refused except the ones in READ_SAFE (looking, printing, signing in / out, own password).
 *    New actions are refused by default, so a forgotten button can never let a viewer write.
 *  - A role without "Delete records" (e.g. Operator) deletes nothing: every delete / remove / undo / purge is
 *    refused. The one exception is asking a manager to delete a bill when that approval rule is on (the
 *    request goes to Approvals; nothing is deleted until a manager approves).
 */

/** Actions that never change the shop's data (safe for a read-only role). */
export const READ_SAFE: ReadonlySet<string> = new Set([
  // looking things up
  'bankInUse', 'billApprovalReasons', 'branchName', 'can', 'canRestore', 'customerDeleteBlock', 'getCustomerAgreedRate',
  'isBilledReceipt', 'isChequeRecord', 'isFieldVisible', 'isFinanceRecord', 'isLinkedRecord', 'isScreenVisible',
  'previewDocNumber', 'previewInterest', 'previewReceiptNos', 'previewPurchaseInvoiceNumber', 'previewVoucherNumber', 'restoreBlockReason',
  'supplierPaymentApproval', 'validateVoucherInput', 'voucherEditBlock', 'voucherRestoreBlock', 'voucherSnapshot',
  'exportSystemBackup', 'refreshAutoBackups', 'billEditBlock',
  // moving around the app (screens, dialogs, print preview, branch filter)
  'setActiveScreen', 'setBranchView', 'setEditRequest', 'setPrintRequest', 'setSelectedCustomerId', 'setSelectedProductId',
  'setSelectedSupplierId', 'openBooking', 'openBookingsView', 'openOps', 'openReports', 'openSuppliersView',
  'clearRecentAlert', 'clearRequestedReportsTab', 'dismissNumberNotice',
  // own session and password, the audit trail
  'login', 'logout', 'lockScreen', 'lockAdmin', 'unlockScreen', 'signUpOwner', 'changePassword', 'logAuditEvent',
]);

/** Actions that delete or take something back. */
export const isDeleteAction = (name: string): boolean => /^(delete|remove|purge|undo|factoryReset|resetToSampleData)/.test(name);

export const READ_ONLY_MESSAGE = 'Your account can only view. Ask an admin or manager to make this change.';
export const NO_DELETE_MESSAGE = "You don't have permission to delete. Ask a manager or admin.";

/** What a refused action returns: fits both the { success, message } and the delete-summary callers. */
const refusal = (message: string) => ({ success: false, message, error: message, blocked: message });

export interface AccessRules {
  /** Signed in with a role that may change nothing. */
  readOnly: boolean;
  /** May delete records. */
  canDelete: boolean;
  /** Deleting a bill goes to a manager for this user (so asking is allowed). */
  billDeleteNeedsApproval: boolean;
}

/** The context value with the refused actions replaced (the same object when nothing needs guarding). */
export function guardActions<T extends object>(value: T, rules: AccessRules): T {
  if (!rules.readOnly && rules.canDelete) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  Object.entries(out).forEach(([name, fn]) => {
    if (typeof fn !== 'function' || READ_SAFE.has(name)) return;
    if (rules.readOnly) {
      out[name] = () => {
        console.warn(`[access] ${name} refused: read-only role`);
        return refusal(READ_ONLY_MESSAGE);
      };
      return;
    }
    if (!isDeleteAction(name)) return;
    out[name] = (...args: unknown[]) => {
      const billRequest = rules.billDeleteNeedsApproval && (name === 'deleteBill' || (name === 'deleteRecord' && args[0] === 'bill'));
      if (billRequest) return (fn as (...a: unknown[]) => unknown)(...args);
      console.warn(`[access] ${name} refused: no delete permission`);
      return refusal(NO_DELETE_MESSAGE);
    };
  });
  return out as T;
}
