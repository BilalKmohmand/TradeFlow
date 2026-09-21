import { useEffect, useRef } from 'react';

/** Desktop function keys for the everyday actions (also shown in tooltips and the Cmd+K list). */
export const BILLING_SHORTCUTS = {
  newBill: 'F2',
  receive: 'F3',
  expense: 'F4',
  receiveStock: 'F6',
} as const;

/** True while a dialog, confirmation or print preview is open: the function keys then do nothing. */
export const somethingOpen = (): boolean =>
  typeof document !== 'undefined' && Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], #print-root, [data-command-bar]'));

/**
 * F2 new bill, F3 receive payment, F4 add expense, F6 receive stock — only when signed in (the
 * providers only mount then), in billing mode, and with no dialog open.
 */
export const useBillingShortcuts = (enabled: boolean, actions: { newBill: () => void; receive: () => void; expense: () => void; receiveStock?: () => void }) => {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const map: Record<string, (() => void) | undefined> = {
        [BILLING_SHORTCUTS.newBill]: latest.current.newBill,
        [BILLING_SHORTCUTS.receive]: latest.current.receive,
        [BILLING_SHORTCUTS.expense]: latest.current.expense,
        [BILLING_SHORTCUTS.receiveStock]: latest.current.receiveStock,
      };
      const run = map[e.key];
      if (!run) return;
      e.preventDefault();
      if (somethingOpen()) return;
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
};
