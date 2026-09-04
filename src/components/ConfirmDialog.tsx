import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  /** Bullet list of consequences shown under the message. */
  details?: string[];
  confirmLabel?: string;
  /** When set, the user must type this exact text before the confirm button enables. */
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Destructive-action confirmation. Used by every admin delete so the wording and the
 * "type to confirm" guard are consistent across the app.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  details,
  confirmLabel = 'Delete',
  requireText,
  onConfirm,
  onCancel,
}) => {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (isOpen) setTyped('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  const canConfirm = !requireText || typed.trim() === requireText;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="relative z-10 w-full max-w-md bg-white dark:bg-[#101A26] rounded-3xl border border-[#E5E5E1] dark:border-[#203248] shadow-2xl p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="confirm-dialog-title" className="text-base font-bold text-[#111827] dark:text-white">
                    {title}
                  </h3>
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1 leading-relaxed">{message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Close"
                className="p-1.5 rounded-xl text-[#8E9299] hover:text-[#111827] dark:hover:text-white hover:bg-[#FAF9F6] dark:hover:bg-[#162436]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {details && details.length > 0 && (
              <ul className="mt-4 space-y-1.5 bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl p-3.5 text-xs text-[#374151] dark:text-[#CBD5E1]">
                {details.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}

            {requireText && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-[#111827] dark:text-white mb-1.5">
                  Type <span className="font-mono text-rose-600 dark:text-rose-400">{requireText}</span> to confirm
                </label>
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-xs font-mono text-[#111827] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/40"
                />
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:bg-[#FAF9F6] dark:hover:bg-[#162436]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={onConfirm}
                className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{confirmLabel}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
