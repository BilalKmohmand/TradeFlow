import React, { useRef, useState } from 'react';
import { foldText, matcher } from '../../utils/search';

/** One option of a <select> that can be found by typing (name, code, phone…). */
export interface PickOption {
  value: string;
  /** Main text (e.g. the item or customer name). */
  name: string;
  /** Short code typed by people who know it by heart (item / customer code). */
  code?: string;
  /** Anything else worth matching (phone number…). */
  extra?: string;
  /** Barcode on the pack: a USB scanner "types" it (fast digits + Enter) and the exact code wins. */
  barcode?: string;
}

/**
 * Best match for what was typed: barcode, code, then name start, word start, anywhere in the name, then
 * the extra text (shop name, phone with or without spaces, city). Any case; Urdu letter variants and
 * "c0007" for "C-0007" as everywhere else (utils/search.ts).
 */
export const findOption = (options: PickOption[], typed: string): PickOption | undefined => {
  const q = foldText(typed);
  if (!q) return undefined;
  const qs = q.replace(/ /g, '');
  const m = matcher(typed);
  let best: { o: PickOption; score: number } | undefined;
  for (const o of options) {
    const name = foldText(o.name);
    const code = foldText(o.code || '').replace(/ /g, '');
    let score = 99;
    if (o.barcode && o.barcode.trim().toLowerCase() === typed.trim().toLowerCase()) score = -1;
    else if (code && code === qs) score = 0;
    else if (code && code.startsWith(qs)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.split(' ').some((w) => w.startsWith(q))) score = 3;
    else if (name.includes(q)) score = 4;
    else if (m([o.name, o.code, o.extra], [o.extra])) score = 5;
    if (score < 99 && (!best || score < best.score)) best = { o, score };
  }
  return best?.o;
};

/**
 * Type-to-find for a native <select>: typing "ghee" or an item code jumps to the best match,
 * instead of the browser's first-letter-only jump. Keeps the native picker (phones, tests, a11y).
 * Returns the keydown handler and the text typed so far (for a small hint under the field).
 */
export const useQuickPick = (options: PickOption[], onPick: (value: string) => void) => {
  const buf = useRef('');
  const last = useRef(0);
  const [typed, setTyped] = useState('');
  const clearSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const now = Date.now();
    if (now - last.current > 1200) buf.current = '';
    let next: string | null = null;
    if (e.key === 'Backspace') next = buf.current.slice(0, -1);
    else if (e.key === 'Escape' && buf.current) next = '';
    // "+" adds a bill line; a leading space opens the native list — leave both alone.
    else if (e.key.length === 1 && e.key !== '+' && !(e.key === ' ' && !buf.current)) next = buf.current + e.key;
    if (next == null) return;
    e.preventDefault();
    if (e.key === 'Escape') e.stopPropagation();
    buf.current = next;
    last.current = now;
    setTyped(next);
    if (clearSoon.current) clearTimeout(clearSoon.current);
    clearSoon.current = setTimeout(() => { buf.current = ''; setTyped(''); }, 1500);
    const hit = findOption(options, next);
    if (hit) onPick(hit.value);
  };
  return { onKeyDown, typed };
};

/** A native <select> you can search by typing a name or code; shows what was typed under it. */
export const QuickSelect: React.FC<
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { options: PickOption[]; onPick: (value: string) => void; children: React.ReactNode }
> = ({ options, onPick, children, onKeyDown: outerKeyDown, ...rest }) => {
  const { onKeyDown, typed } = useQuickPick(options, onPick);
  return (
    <div className="relative">
      <select
        {...rest}
        onChange={(e) => onPick(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown(e);
          outerKeyDown?.(e);
        }}
      >
        {children}
      </select>
      {typed && (
        <span aria-live="polite" className="absolute right-9 top-1/2 -translate-y-1/2 pointer-events-none rounded-lg bg-teal-600 text-white text-[10px] font-bold px-1.5 py-0.5 max-w-[45%] truncate">
          {typed}
        </span>
      )}
    </div>
  );
};
