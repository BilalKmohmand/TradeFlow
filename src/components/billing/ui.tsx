import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useEscape } from '../../hooks/useEscape';

/** Shared look for the simple-billing screens: one card style, one input style, one modal shell. */
export const inputCls =
  'w-full bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-base sm:text-sm font-semibold text-[#111827] dark:text-white focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 placeholder:font-normal placeholder:text-[#9CA3AF]';
export const labelCls = 'block text-[11px] font-bold text-[#6B7280] dark:text-[#94A3B8] mb-1.5 uppercase tracking-wider';
export const cardCls = 'bg-white dark:bg-[#101A26] rounded-[24px] border border-[#E5E5E1] dark:border-[#203248] shadow-xs';
export const primaryBtn =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap max-sm:min-h-11 px-5 py-3 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-sm font-bold shadow-xs hover:opacity-90 active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none';
export const secondaryBtn =
  'inline-flex items-center justify-center gap-2 max-sm:min-h-11 px-4 py-2.5 rounded-2xl bg-white dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-sm font-semibold text-[#111827] dark:text-white hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40] active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none';
export const dangerBtn =
  'inline-flex items-center justify-center gap-2 max-sm:min-h-11 px-4 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition';

const FOCUSABLE = 'input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; subtitle?: string; wide?: boolean; children: React.ReactNode; footer?: React.ReactNode }> = ({ isOpen, onClose, title, subtitle, wide, children, footer }) => {
  useEscape(isOpen, onClose);
  const box = useRef<HTMLDivElement>(null);
  // Put focus on the first field and keep Tab inside the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      // Only if the user hasn't already started typing somewhere in the dialog.
      if (box.current?.contains(document.activeElement)) return;
      const el = box.current?.querySelector<HTMLElement>('input:not([data-skip-autofocus]),select:not([data-skip-autofocus]),textarea:not([data-skip-autofocus])');
      el?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen]);
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return;
    const items = (Array.from(box.current.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter((n) => n.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" />
          <motion.div
            ref={box}
            onKeyDown={trap}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.18 }}
            className={`relative z-10 w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92dvh] sm:max-h-[90vh] flex flex-col bg-white dark:bg-[#101A26] rounded-t-[28px] sm:rounded-[28px] border border-b-0 sm:border-b border-[#E5E5E1] dark:border-[#203248] shadow-2xl`}
          >
            {/* Grab handle: tells phone users this is a sheet that sits on the page. */}
            <div aria-hidden="true" className="sm:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-[#E5E5E1] dark:bg-[#203248]" />
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-5 pb-3 border-b border-[#E5E5E1] dark:border-[#203248]">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[#111827] dark:text-white leading-tight">{title}</h2>
                {subtitle && <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5">{subtitle}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="p-2.5 -mr-1.5 -mt-1 rounded-xl text-[#6B7280] dark:text-[#94A3B8] hover:bg-[#F4F3EF] dark:hover:bg-[#162436]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className={`flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 ${footer ? '' : 'pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4'}`}>{children}</div>
            {footer && <div className="shrink-0 px-5 sm:px-6 pt-3 sm:pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-[#E5E5E1] dark:border-[#203248] bg-[#FAF9F6] dark:bg-[#0D1520] sm:rounded-b-[28px]">{footer}</div>}
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
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={`${cardCls} p-4 text-left w-full ${onClick ? 'hover:border-teal-500/50 hover:shadow-sm transition' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">{label}</span>
        {icon && <span className="text-[#8E9299]">{icon}</span>}
      </div>
      <div className={`mt-1.5 text-lg sm:text-2xl font-extrabold tabular-nums tracking-tight break-words ${tones[tone]}`}>{value}</div>
      {hint && <div className="text-[11px] text-[#6B7280] dark:text-[#8E9299] mt-1">{hint}</div>}
    </Comp>
  );
};

export const Notice: React.FC<{ kind: 'ok' | 'error'; children: React.ReactNode }> = ({ kind, children }) => (
  <div role="status" className={`rounded-2xl px-4 py-3 text-sm font-semibold ${kind === 'ok' ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-900' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'}`}>
    {children}
  </div>
);

const RS_WHOLE = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
const RS_PAISA = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/**
 * The one money format for the billing screens: "Rs. 1,192,150" when whole, "Rs. 1,037.50" otherwise.
 * Show it in the body font with `tabular-nums` (see `moneyCls`) so columns line up.
 */
export const rs = (n: number) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `Rs. ${(Number.isInteger(v) ? RS_WHOLE : RS_PAISA).format(v)}`;
};
/** Class for money figures: body font, digits of equal width, never broken across lines. */
export const moneyCls = 'tabular-nums whitespace-nowrap';

/** Page title, one-line subtitle, actions on the right (below the title on phones). */
export const PageHeader: React.FC<{ title: string; subtitle?: React.ReactNode; children?: React.ReactNode }> = ({ title, subtitle, children }) => (
  // Many buttons never squeeze the title: they wrap onto the next row instead (title on top).
  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end justify-between gap-3">
    <div className="min-w-0 sm:shrink-0 max-w-full">
      <h1 className="text-2xl font-bold tracking-tight text-[#111827] dark:text-white">{title}</h1>
      {subtitle && <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mt-0.5">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap gap-2 sm:justify-end min-w-0 max-sm:[&>*]:grow max-sm:[&>*:last-child]:order-first max-sm:[&>*:last-child]:basis-full">{children}</div>}
  </div>
);

/** Empty list: icon, one line, one action. */
export const EmptyState: React.FC<{ icon?: React.ReactNode; text: React.ReactNode; action?: React.ReactNode; compact?: boolean }> = ({ icon, text, action, compact }) => (
  <div className={`flex flex-col items-center justify-center text-center gap-3 ${compact ? 'px-5 py-6' : 'px-6 py-10'}`}>
    {icon && <div className="w-11 h-11 rounded-2xl bg-[#F4F3EF] dark:bg-[#162436] text-[#8E9299] dark:text-[#94A3B8] flex items-center justify-center">{icon}</div>}
    <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] max-w-sm">{text}</p>
    {action}
  </div>
);

/** Small labelled action for list rows: icon + text on wider screens, icon only (with a name) on phones. */
export const RowAction: React.FC<{ label: string; icon: React.ReactNode; onClick: () => void; text?: string; tone?: 'default' | 'teal' | 'danger'; alwaysText?: boolean }> = ({ label, icon, onClick, text, tone = 'default', alwaysText }) => {
  const tones = {
    default: 'text-[#4B5563] dark:text-[#CBD5E1] hover:text-[#111827] dark:hover:text-white hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40]',
    teal: 'text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40',
    danger: 'text-[#6B7280] dark:text-[#94A3B8] hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40',
  };
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${tones[tone]}`}>
      {icon}
      {text && <span className={alwaysText ? '' : 'hidden md:inline'}>{text}</span>}
    </button>
  );
};

/** Header cell / number cell helpers for the few real tables. */
export const thCls = 'sticky top-[var(--header-h,4rem)] z-[1] bg-[#FAF9F6] dark:bg-[#162436] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]';

/** Filter / tab pill: one look everywhere (44px tall on phones). */
export const pillCls = (on: boolean, tone: 'dark' | 'teal' | 'amber' = 'dark') =>
  `inline-flex items-center justify-center min-h-11 sm:min-h-9 px-3.5 rounded-2xl text-xs font-bold whitespace-nowrap border transition-colors ${
    on
      ? tone === 'teal'
        ? 'bg-teal-700 text-white border-transparent'
        : tone === 'amber'
          ? 'bg-amber-600 text-white border-transparent'
          : 'bg-[#111827] dark:bg-white text-white dark:text-[#111827] border-transparent'
      : 'bg-white dark:bg-[#101A26] border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-white'
  }`;

/** Card that clips its corners without breaking sticky table headers (overflow: clip is not a scroll box). */
export const tableCardCls = `${cardCls} overflow-clip`;
