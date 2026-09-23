import React, { useEffect, useRef, useState } from 'react';
import { inputCls } from './ui';

export interface CodeItem {
  id: string;
  code?: string;
  barcode?: string;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const digits = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');

/**
 * Find one item by what was typed in a Code box, the way the old desktop program worked:
 * the exact code (any case, spaces ignored), a barcode, or just the number part ("2" → S-0002).
 * Returns undefined when nothing matches or when the number part matches more than one item.
 */
export const findByCode = <T extends CodeItem>(items: T[], typed: string): T | undefined => {
  const q = norm(typed);
  if (!q) return undefined;
  const exact = items.find((x) => x.code && norm(x.code) === q) || items.find((x) => x.barcode && norm(x.barcode) === q);
  if (exact) return exact;
  const d = digits(q);
  if (!d) return undefined;
  const byNumber = items.filter((x) => x.code && digits(x.code) === d);
  return byNumber.length === 1 ? byNumber[0] : undefined;
};

/** Focus the field after `from` in its dialog / form (skipping `skipId`, the name list it is paired with). */
const focusNextField = (from: HTMLElement, skipId?: string) => {
  const scope = from.closest('[role="dialog"], form') || document.body;
  const list = (Array.from(scope.querySelectorAll('input:not([disabled]):not([type="hidden"]):not([type="checkbox"]),select:not([disabled]),textarea:not([disabled])')) as HTMLElement[]).filter(
    (n) => n === from || (n.offsetParent !== null && n.id !== skipId)
  );
  const next = list[list.indexOf(from) + 1];
  next?.focus();
  if (next instanceof HTMLInputElement) next.select();
};

/**
 * A small "Code" box beside a name picker. Type a code and press Enter or Tab (or leave the box):
 * the matching supplier / customer / product is picked. Picking by name fills the box with its code.
 *
 * `fallback` lets the box also take a name when no code matches (the bill's item box does this, so a
 * shopkeeper who types "dalda" there still gets the item). `onEnter` runs after Enter with the id that
 * was picked (undefined when the box was empty or nothing matched), so a form can move the cursor on.
 */
export const CodeBox: React.FC<{
  id: string;
  label: string;
  items: CodeItem[];
  /** The id currently picked in the name list. */
  value: string;
  onPick: (id: string) => void;
  placeholder?: string;
  className?: string;
  fallback?: (typed: string) => string | undefined;
  /** Enter was pressed: the id it picked (undefined if none) and what was typed. */
  onEnter?: (pickedId: string | undefined, typed: string) => void;
  /**
   * Enter was pressed: 'found' (an item is picked — move on), 'empty' (nothing typed) or 'miss'
   * (wrong code — stay here). Used by the purchase invoice's keyboard flow.
   */
  onEnterResult?: (result: 'found' | 'empty' | 'miss') => void;
  /** For the form's keyboard navigation (data-nav). */
  nav?: string;
  /** Leave the dialog's first-field focus to the name list next to it. */
  skipAutofocus?: boolean;
  /** With no onEnter / onEnterResult: after Enter found a code, jump here (else to the next field after `pairId`). */
  nextId?: string;
  /** Id of the name list this box sits beside (skipped when moving on with Enter). */
  pairId?: string;
}> = ({ id, label, items, value, onPick, placeholder = 'Code', className = '', fallback, onEnter, onEnterResult, nav, skipAutofocus, nextId, pairId }) => {
  const current = items.find((x) => x.id === value);
  const [text, setText] = useState(current?.code || '');
  const [miss, setMiss] = useState(false);
  // What this box picked last: Enter and then leaving the box must not pick it a second time.
  const picked = useRef('');

  // Picked by name (or cleared) somewhere else: show that item's code.
  useEffect(() => {
    setText(current?.code || '');
    setMiss(false);
    picked.current = '';
  }, [value, current?.code]);

  const commit = (): string | undefined => {
    if (!text.trim()) return undefined;
    const hitId = findByCode(items, text)?.id || fallback?.(text);
    if (!hitId) {
      setMiss(true);
      return undefined;
    }
    setMiss(false);
    if (hitId === value) setText(current?.code || text);
    else if (hitId !== picked.current) {
      picked.current = hitId;
      onPick(hitId);
    }
    return hitId;
  };

  return (
    <div className={`min-w-0 ${className}`}>
      <input
        id={id}
        aria-label={label}
        data-code
        data-skip-autofocus={skipAutofocus || undefined}
        value={text}
        onChange={(e) => { setText(e.target.value); setMiss(false); picked.current = ''; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            const hit = commit();
            onEnter?.(hit, text.trim());
            onEnterResult?.(hit ? 'found' : text.trim() ? 'miss' : 'empty');
            if (hit && !onEnter && !onEnterResult) {
              // Move on like the old program, once React has shown the pick.
              const el = e.currentTarget;
              setTimeout(() => {
                const target = nextId ? document.getElementById(nextId) : null;
                if (target) {
                  target.focus();
                  if (target instanceof HTMLInputElement) target.select();
                } else focusNextField(el, pairId);
              }, 0);
            }
          }
        }}
        onBlur={() => { commit(); }}
        data-nav={nav}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className={`${inputCls} tabular-nums !px-2 ${miss ? '!border-rose-400 dark:!border-rose-500' : ''}`}
        placeholder={placeholder}
        title={fallback ? 'Type the code, barcode or name and press Enter' : 'Type the code and press Enter'}
        aria-invalid={miss || undefined}
      />
      {miss && <p className="mt-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300" role="alert">No code "{text.trim()}"</p>}
    </div>
  );
};
