import { useEffect } from 'react';

/**
 * Escape-key stack: only the most recently opened layer (modal, preview, dialog) responds to
 * Escape, so pressing it once closes the top layer instead of everything underneath.
 */
const stack: Array<() => void> = [];
let listening = false;

const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.stopPropagation();
  stack[stack.length - 1]();
};

export const useEscape = (active: boolean, onClose: () => void) => {
  useEffect(() => {
    if (!active) return;
    stack.push(onClose);
    if (!listening) {
      window.addEventListener('keydown', onKey);
      listening = true;
    }
    return () => {
      const i = stack.lastIndexOf(onClose);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0 && listening) {
        window.removeEventListener('keydown', onKey);
        listening = false;
      }
    };
  }, [active, onClose]);
};
