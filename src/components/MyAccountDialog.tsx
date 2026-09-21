import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal, labelCls, primaryBtn, secondaryBtn } from './billing/ui';
import { PasswordInput } from './AuthGate';
import { useTrading } from '../context/TradingContext';
import { MIN_PASSWORD_LENGTH } from '../lib/password';

/** "My account": who you are signed in as, and change your own password. */
export const MyAccountDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { currentUser, roles, changePassword } = useTrading();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const ids = { current: useId(), next: useId(), confirm: useId() };

  useEffect(() => {
    if (!isOpen) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setFeedback(null);
  }, [isOpen]);

  if (!currentUser) return null;
  const roleNames = (currentUser.roles?.length ? currentUser.roles : [currentUser.role]).map((r) => roles.find((x) => x.id === r)?.name || r).join(', ');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await changePassword(current, next, confirm);
      setFeedback(res.success ? { ok: true, text: 'Password changed. Use the new password next time you sign in.' } : { ok: false, text: res.error || 'Could not change the password.' });
      if (res.success) {
        setCurrent('');
        setNext('');
        setConfirm('');
      }
    } finally {
      setBusy(false);
    }
  };

  // Portal: the header uses backdrop-blur, which would trap a fixed-position dialog inside it.
  return createPortal(
    <Modal isOpen={isOpen} onClose={onClose} title="My account" subtitle="Your sign-in details">
      <div className="space-y-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm p-4 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248]">
          <dt className="text-[#6B7280] dark:text-[#94A3B8]">Name</dt>
          <dd className="font-semibold text-[#111827] dark:text-white min-w-0 truncate">{currentUser.name}</dd>
          <dt className="text-[#6B7280] dark:text-[#94A3B8]">Username</dt>
          <dd className="font-mono font-semibold text-[#111827] dark:text-white min-w-0 truncate" data-testid="my-username">
            {currentUser.username}
          </dd>
          <dt className="text-[#6B7280] dark:text-[#94A3B8]">Role</dt>
          <dd className="font-semibold text-[#111827] dark:text-white min-w-0 truncate">{roleNames}</dd>
        </dl>

        <form onSubmit={submit} className="space-y-3" noValidate>
          <h3 className="text-sm font-bold text-[#111827] dark:text-white">Change password</h3>
          <input type="text" name="username" autoComplete="username" value={currentUser.username || ''} readOnly hidden />
          <div>
            <label htmlFor={ids.current} className={labelCls}>
              Current password
            </label>
            <PasswordInput id={ids.current} value={current} onChange={setCurrent} autoComplete="current-password" disabled={busy} />
          </div>
          <div>
            <label htmlFor={ids.next} className={labelCls}>
              New password
            </label>
            <PasswordInput id={ids.next} value={next} onChange={setNext} autoComplete="new-password" disabled={busy} />
            <p className="mt-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">At least {MIN_PASSWORD_LENGTH} characters.</p>
          </div>
          <div>
            <label htmlFor={ids.confirm} className={labelCls}>
              Confirm new password
            </label>
            <PasswordInput id={ids.confirm} value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={busy} />
          </div>
          {feedback && (
            <div
              role={feedback.ok ? 'status' : 'alert'}
              className={`p-3 rounded-2xl text-xs font-semibold flex items-start gap-2 border ${
                feedback.ok
                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900'
              }`}
            >
              {feedback.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{feedback.text}</span>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={secondaryBtn}>
              Close
            </button>
            <button type="submit" className={primaryBtn} disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </Modal>,
    document.body
  );
};
