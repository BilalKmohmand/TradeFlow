import React, { useEffect, useState } from 'react';
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
 * Enter on a code that was found moves on, like the old program: to `nextId` when given, else to the next
 * field after the paired name list (`pairId`).
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
  /** Field to jump to after Enter found the code. */
  nextId?: string;
  /** Id of the name list this box sits beside (skipped when moving on with Enter). */
  pairId?: string;
  /** Let a dialog put the cursor in the name list first (it finds codes too), not in this box. */
  skipAutofocus?: boolean;
}> = ({ id, label, items, value, onPick, placeholder = 'Code', className = '', nextId, pairId, skipAutofocus }) => {
  const current = items.find((x) => x.id === value);
  const [text, setText] = useState(current?.code || '');
  const [miss, setMiss] = useState(false);

  // Picked by name (or cleared) somewhere else: show that item's code.
  useEffect(() => {
    setText(current?.code || '');
    setMiss(false);
  }, [value, current?.code]);

  const commit = (): boolean => {
    if (!text.trim()) return false;
    const hit = findByCode(items, text);
    if (hit) {
      setMiss(false);
      if (hit.id !== value) onPick(hit.id);
      else setText(hit.code || text);
      return true;
    }
    setMiss(true);
    return false;
  };

  return (
    <div className={`min-w-0 ${className}`}>
      <input
        id={id}
        aria-label={label}
        data-skip-autofocus={skipAutofocus || undefined}
        value={text}
        onChange={(e) => { setText(e.target.value); setMiss(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const el = e.currentTarget;
            if (!commit()) return;
            // After React has shown the pick (the next field may only appear once something is picked).
            setTimeout(() => {
              const target = nextId ? document.getElementById(nextId) : null;
              if (target) {
                target.focus();
                if (target instanceof HTMLInputElement) target.select();
              } else focusNextField(el, pairId);
            }, 0);
          }
        }}
        onBlur={commit}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className={`${inputCls} tabular-nums !px-2 ${miss ? '!border-rose-400 dark:!border-rose-500' : ''}`}
        placeholder={placeholder}
        title="Type the code and press Enter"
        aria-invalid={miss || undefined}
      />
      {miss && <p className="mt-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300" role="alert">No code "{text.trim()}"</p>}
    </div>
  );
};
