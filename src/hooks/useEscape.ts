import { useEffect, useRef } from 'react';

/**
 * Escape-key stack: only the most recently opened layer (modal, preview, dialog) responds to
 * Escape, so pressing it once closes the top layer instead of everything underneath.
 * A layer registers once when it becomes active (not on every render), and always calls the
 * latest onClose it was given. A layer with a higher `priority` (the print preview, which is drawn
 * above every dialog) is always closed first, whatever order the layers opened in.
 */
const stack: Array<{ close: () => void; priority: number }> = [];
let listening = false;

const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.stopPropagation();
  let top = stack[stack.length - 1];
  for (const layer of stack) if (layer.priority > top.priority) top = layer;
  top.close();
};

export const useEscape = (active: boolean, onClose: () => void, priority = 0) => {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!active) return;
    const layer = { close: () => latest.current(), priority };
    stack.push(layer);
    if (!listening) {
      window.addEventListener('keydown', onKey);
      listening = true;
    }
    return () => {
      const i = stack.lastIndexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0 && listening) {
        window.removeEventListener('keydown', onKey);
        listening = false;
      }
    };
  }, [active]);
};
