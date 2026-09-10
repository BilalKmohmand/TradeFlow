import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useEscape } from '../../hooks/useEscape';

/** Shared look for the simple-billing screens: one card style, one input style, one modal shell. */
export const inputCls =
  'w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-[#111827] dark:text-white focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 placeholder:font-normal placeholder:text-[#9CA3AF]';
export const labelCls = 'block text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] mb-1.5 uppercase tracking-wider';
export const cardCls = 'bg-white dark:bg-[#101A26] rounded-[24px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs';
export const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-sm font-bold shadow-xs hover:opacity-90 active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none';
export const secondaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-sm font-semibold text-[#111827] dark:text-white hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none';
export const dangerBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition';

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; subtitle?: string; wide?: boolean; children: React.ReactNode; footer?: React.ReactNode }> = ({ isOpen, onClose, title, subtitle, wide, children, footer }) => {
  useEscape(isOpen, onClose);
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.18 }}
            className={`relative z-10 w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[94vh] sm:max-h-[90vh] flex flex-col bg-white dark:bg-[#101A26] rounded-t-[28px] sm:rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-2xl`}
          >
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-[#E5E5E1] dark:border-[#203248]">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[#111827] dark:text-white leading-tight">{title}</h2>
                {subtitle && <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5">{subtitle}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-[#6B7280] hover:bg-[#F4F3EF] dark:hover:bg-[#162436]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">{children}</div>
            {footer && <div className="px-5 sm:px-6 py-4 border-t border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6]/60 dark:bg-[#0D1520]/60 rounded-b-[28px]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/** Big number tile used on Home, Daily Sheet and Money. */
export const Tile: React.FC<{ label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'bad' | 'warn'; icon?: React.ReactNode; onClick?: () => void }> = ({ label, value, hint, tone = 'default', icon, onClick }) => {
  const tones = {
    default: 'text-[#111827] dark:text-white',
    good: 'text-teal-700 dark:text-teal-300',
    bad: 'text-rose-700 dark:text-rose-300',
    warn: 'text-amber-700 dark:text-amber-300',
  };
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={`${cardCls} p-4 text-left w-full ${onClick ? 'hover:border-teal-500/50 transition' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">{label}</span>
        {icon && <span className="text-[#8E9299]">{icon}</span>}
      </div>
      <div className={`mt-1.5 text-xl sm:text-2xl font-extrabold font-mono tracking-tight ${tones[tone]}`}>{value}</div>
      {hint && <div className="text-[11px] text-[#8E9299] mt-1">{hint}</div>}
    </Comp>
  );
};

export const Notice: React.FC<{ kind: 'ok' | 'error'; children: React.ReactNode }> = ({ kind, children }) => (
  <div role="status" className={`rounded-2xl px-4 py-3 text-sm font-semibold ${kind === 'ok' ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-900' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'}`}>
    {children}
  </div>
);

/** "Rs. 1,192,150" style number without the currency symbol clutter. */
export const rs = (n: number) => `Rs. ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n)}`;
