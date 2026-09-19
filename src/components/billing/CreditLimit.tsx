import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Customer } from '../../types';
import { CreditCheck, creditUsage } from '../../utils/credit';
import { inputCls, rs } from './ui';

/**
 * New Bill: "Credit limit Rs. X · owes Rs. Y · available Rs. Z", and when this bill would go over,
 * a warning plus (for users allowed to override) an "Allow over limit" tick and a reason box.
 */
export const BillCreditPanel: React.FC<{
  check: CreditCheck;
  canOverride: boolean;
  allow: boolean;
  onAllow: (v: boolean) => void;
  reason: string;
  onReason: (v: string) => void;
}> = ({ check, canOverride, allow, onAllow, reason, onReason }) => {
  if (!check.hasLimit) return null;
  return (
    <div data-testid="bill-credit" className={`rounded-2xl border px-3.5 py-2.5 text-xs space-y-2 ${check.over ? 'border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40' : 'border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#162436]'}`}>
      <div className="font-semibold text-[#374151] dark:text-[#CBD5E1]">
        Credit limit <span className="font-mono">{rs(check.limit)}</span> · owes <span className="font-mono">{rs(check.owes)}</span> · available <span className="font-mono">{rs(check.available)}</span>
      </div>
      {check.over && (
        <>
          <div role="alert" className="flex items-start gap-2 font-bold text-rose-800 dark:text-rose-300">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-px" />
            <span>Over the credit limit: this bill puts {rs(check.billCredit)} on credit, so they would owe {rs(check.after)} — {rs(check.exceededBy)} more than allowed. Take more payment now{canOverride ? ', or allow it below.' : ', or ask a manager to allow it.'}</span>
          </div>
          {canOverride && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 font-semibold text-rose-900 dark:text-rose-200 cursor-pointer">
                <input type="checkbox" checked={allow} onChange={(e) => onAllow(e.target.checked)} className="w-4 h-4 accent-rose-600" />
                Allow over limit
              </label>
              {allow && (
                <input aria-label="Reason for allowing over limit" value={reason} onChange={(e) => onReason(e.target.value)} className={inputCls} placeholder="Short reason, e.g. old customer, pays on Friday" />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** Small "Over limit" pill for customer lists. */
export const OverLimitBadge: React.FC<{ customer: Customer }> = ({ customer }) =>
  creditUsage(customer).over ? <span className="inline-block px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold uppercase tracking-wide">Over limit</span> : null;

/** Customer detail: limit and a usage bar ("80% of limit used"). */
export const CreditUsageBar: React.FC<{ customer: Customer }> = ({ customer }) => {
  const u = creditUsage(customer);
  if (u.limit <= 0) return <p className="text-xs text-[#8E9299]">No credit limit set. Edit the customer to set one.</p>;
  const tone = u.over ? 'bg-rose-600' : u.pct >= 80 ? 'bg-amber-500' : 'bg-teal-600';
  return (
    <div data-testid="credit-usage" className="rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] p-3 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-bold text-[#374151] dark:text-[#CBD5E1]">Credit limit <span className="font-mono">{rs(u.limit)}</span></span>
        <span className={`px-2 py-0.5 rounded-full font-bold ${u.over ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : u.pct >= 80 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'}`}>
          {u.over ? `Over limit by ${rs(Math.round((u.owes - u.limit) * 100) / 100)}` : `${u.pct}% of limit used`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#E5E5E1] dark:bg-[#203248] overflow-hidden" role="progressbar" aria-label="Credit limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, u.pct)}>
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, u.pct)}%` }} />
      </div>
    </div>
  );
};
