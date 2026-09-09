import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Clock,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Shield,
} from 'lucide-react';
import { SecurityPolicySettings } from '../../types';
import { useTrading } from '../../context/TradingContext';

export const SecurityPolicyTab: React.FC = () => {
  const { securityPolicy, updateSecurityPolicy } = useTrading();

  const [policyForm, setPolicyForm] = useState<SecurityPolicySettings>(() => ({
    ...securityPolicy,
  }));

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = updateSecurityPolicy({
      maxFailedAttempts: Math.max(1, policyForm.maxFailedAttempts),
      lockoutDurationMinutes: Math.max(1, policyForm.lockoutDurationMinutes),
      sessionTimeoutMinutes: Math.max(5, policyForm.sessionTimeoutMinutes),
      require2FAForAdmin: policyForm.require2FAForAdmin,
      passwordMinLength: Math.max(6, policyForm.passwordMinLength),
      passwordRequireSpecial: policyForm.passwordRequireSpecial,
      passwordRequireNumbers: policyForm.passwordRequireNumbers,
    });

    setFeedback({ type: res.success ? 'success' : 'error', message: res.message });
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Top save bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF9F6] dark:bg-[#162436] p-4 rounded-3xl border border-[#E5E5E1] dark:border-[#203248]">
          <div>
            <h3 className="text-sm font-bold text-[#111827] dark:text-white">
              Organizational Security & Lockout Policy
            </h3>
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
              Automated account lockout rules, 2FA mandates, and password requirements.
            </p>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-2xl bg-[#111827] dark:bg-white hover:bg-black dark:hover:bg-slate-100 text-white dark:text-[#111827] text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0"
          >
            <CheckCircle2 className="w-4 h-4 text-teal-400 dark:text-teal-700" />
            <span>Apply Security Policy</span>
          </button>
        </div>

        {feedback && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Account Lockout Rules */}
          <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#111827] dark:text-white">Account Lockout Parameters</h4>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Protect against brute-force credential attacks.</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  Max Failed Login Attempts
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={policyForm.maxFailedAttempts}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, maxFailedAttempts: parseInt(e.target.value, 10) || 5 })
                  }
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                />
                <p className="text-[11px] text-[#8E9299] dark:text-[#94A3B8] mt-1">
                  Account is locked after this many consecutive incorrect password attempts.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  Lockout Duration (Minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={policyForm.lockoutDurationMinutes}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, lockoutDurationMinutes: parseInt(e.target.value, 10) || 15 })
                  }
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                />
                <p className="text-[11px] text-[#8E9299] dark:text-[#94A3B8] mt-1">
                  How long the user remains blocked before another login attempt is allowed.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  Session Token Inactivity Timeout (Minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={policyForm.sessionTimeoutMinutes}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, sessionTimeoutMinutes: parseInt(e.target.value, 10) || 60 })
                  }
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
            </div>
          </div>

          {/* 2FA and Password Rules */}
          <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#111827] dark:text-white">Authentication & Passwords</h4>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Complexity policies and admin 2FA mandates.</p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248]">
                <div>
                  <div className="text-xs font-bold text-[#111827] dark:text-white">
                    Mandatory 2FA for Admin Roles
                  </div>
                  <div className="text-[11px] text-[#8E9299] dark:text-[#94A3B8]">
                    Require 6-digit TOTP verification on Super Admin and Administrator accounts.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={policyForm.require2FAForAdmin}
                  onChange={(e) => setPolicyForm({ ...policyForm, require2FAForAdmin: e.target.checked })}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  Minimum Password Length
                </label>
                <input
                  type="number"
                  min={6}
                  max={32}
                  value={policyForm.passwordMinLength}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, passwordMinLength: parseInt(e.target.value, 10) || 8 })
                  }
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/50"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248]">
                <div>
                  <div className="text-xs font-bold text-[#111827] dark:text-white">
                    Require Numeric Digits (0-9)
                  </div>
                  <div className="text-[11px] text-[#8E9299]">Password must contain at least one number.</div>
                </div>
                <input
                  type="checkbox"
                  checked={policyForm.passwordRequireNumbers}
                  onChange={(e) => setPolicyForm({ ...policyForm, passwordRequireNumbers: e.target.checked })}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248]">
                <div>
                  <div className="text-xs font-bold text-[#111827] dark:text-white">
                    Require Special Characters (!@#$%^&*)
                  </div>
                  <div className="text-[11px] text-[#8E9299]">Enhances entropy and prevents common dictionary attacks.</div>
                </div>
                <input
                  type="checkbox"
                  checked={policyForm.passwordRequireSpecial}
                  onChange={(e) => setPolicyForm({ ...policyForm, passwordRequireSpecial: e.target.checked })}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
