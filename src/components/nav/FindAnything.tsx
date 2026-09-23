import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CornerDownLeft, Compass, Users, Layers, Package, FileText, PackagePlus, ScrollText } from 'lucide-react';
import { FUNCTION_KEYS } from '../billing/useBillingShortcuts';
import { useReturnFocus } from '../billing/ui';
import { FindItem, FindKind, FindSection, useFindAnything } from './useFindAnything';
import { useNavAccess } from './useNavGo';
import { targetAllowed } from '../../utils/navMap';

const ICON: Record<FindKind, React.FC<{ className?: string }>> = {
  option: Compass,
  customer: Users,
  supplier: Layers,
  item: Package,
  bill: FileText,
  purchase: PackagePlus,
  voucher: ScrollText,
};

/**
 * The result list shared by the Find-anything dialog and the phone More sheet: grouped results, one
 * highlighted row (arrow keys), Enter opens it.
 */
export const FindResults: React.FC<{ sections: FindSection[]; active: number; onHover?: (i: number) => void; onPick: (item: FindItem) => void; idPrefix: string; compact?: boolean }> = ({ sections, active, onHover, onPick, idPrefix, compact }) => {
  let i = -1;
  return (
    <div role="listbox" id={`${idPrefix}-list`} aria-label="Results" className="space-y-3">
      {sections.map((s) => (
        <div key={s.id} role="group" aria-label={s.label} data-testid={`find-section-${s.id}`}>
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8E9299] dark:text-[#64748B]">{s.label}</div>
          <ul className="space-y-0.5">
            {s.items.map((it) => {
              i += 1;
              const idx = i;
              const on = idx === active;
              const I = ICON[it.kind];
              return (
                <li
                  key={it.id}
                  id={`${idPrefix}-opt-${idx}`}
                  role="option"
                  aria-selected={on}
                  data-index={idx}
                  onMouseMove={() => { if (!on) onHover?.(idx); }}
                  onClick={() => onPick(it)}
                  className={`flex items-center gap-3 rounded-2xl cursor-pointer ${compact ? 'px-2.5 py-2 min-h-12' : 'px-3 py-2.5'} ${on ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : 'hover:bg-[#FAF9F6] dark:hover:bg-[#18283A] text-[#111827] dark:text-white'}`}
                >
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-white/10 dark:bg-black/10 text-teal-300 dark:text-teal-700' : 'bg-[#F4F3EF] dark:bg-[#0D1520] text-teal-700 dark:text-teal-400'}`}><I className="w-4 h-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{it.title}</span>
                    {it.subtitle && <span className={`block text-[11px] truncate ${on ? 'text-gray-300 dark:text-gray-600' : 'text-[#6B7280] dark:text-[#94A3B8]'}`}>{it.subtitle}</span>}
                  </span>
                  {it.keyHint && <kbd className={`hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded border ${on ? 'border-white/30 dark:border-black/20' : 'border-[#E5E5E1] dark:border-[#203248] text-[#6B7280]'}`}>{it.keyHint}</kbd>}
                  {it.badge && <span className={`hidden sm:inline shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${on ? 'bg-white/20 dark:bg-black/10' : 'bg-[#F4F3EF] dark:bg-[#0D1520] text-[#6B7280] dark:text-[#94A3B8]'}`}>{it.badge}</span>}
                  {on && !compact && <CornerDownLeft className="w-3.5 h-3.5 hidden sm:block shrink-0" />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
};

/** Arrow keys / Enter over a flat list of results; resets to the first row when the query changes. */
export const useResultKeys = (sections: FindSection[], query: string, onPick: (it: FindItem) => void) => {
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [query]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (flat.length ? (a + 1) % flat.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === 'Enter') { const it = flat[active]; if (it) { e.preventDefault(); onPick(it); } }
  };
  return { flat, active, setActive, onKeyDown };
};

/**
 * "Find anything" (Ctrl/⌘ K, "/" or the header search box) in simple billing: every menu option — by our
 * name, the old program's name or the Urdu word — plus customers, suppliers, items, bills and vouchers.
 */
export const FindAnythingDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sections = useFindAnything(query);
  useReturnFocus(isOpen);
  const access = useNavAccess();
  const pick = (it: FindItem) => { onClose(); it.run(); };
  const { flat, active, setActive, onKeyDown } = useResultKeys(sections, query, pick);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [isOpen]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!isOpen) return null;
  return (
    <div data-command-bar className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-20 px-3 sm:px-4 print:hidden">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Find anything" className="relative w-full max-w-2xl bg-white dark:bg-[#111C28] rounded-3xl shadow-2xl border border-[#E5E5E1] dark:border-[#22354A] overflow-hidden flex flex-col max-h-[85dvh]">
        <div className="p-3 sm:p-4 border-b border-[#E5E5E1] dark:border-[#22354A] flex items-center gap-3">
          <Search className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } else onKeyDown(e); }}
            placeholder="Find anything: a menu option, customer, item, bill no., voucher no. (try “udhaar”, “CPV”)"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="find-list"
            aria-activedescendant={flat.length ? `find-opt-${active}` : undefined}
            className="flex-1 min-w-0 bg-transparent text-base font-sans text-[#111827] dark:text-white placeholder-[#8E9299] dark:placeholder-[#64748B] focus:outline-hidden"
          />
          {query ? (
            <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear search" className="p-1.5 rounded-lg text-[#8E9299] hover:text-[#111827] dark:hover:text-white"><X className="w-4 h-4" /></button>
          ) : (
            <button type="button" onClick={onClose} className="text-[10px] font-mono text-[#8E9299] bg-[#FAF9F6] dark:bg-[#18283A] px-2 py-1 rounded-lg border border-[#E5E5E1] dark:border-[#22354A]">ESC</button>
          )}
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 sm:p-3">
          {flat.length === 0 ? (
            <div className="py-10 text-center space-y-1.5">
              <p className="text-sm font-semibold text-[#111827] dark:text-white">Nothing found for “{query}”</p>
              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Try another word: bill, khata, udhaar, cheque, stock, kharcha… or open a menu with Alt + C / I / A / R / S.</p>
            </div>
          ) : (
            <FindResults sections={sections} active={active} onHover={setActive} onPick={pick} idPrefix="find" />
          )}
        </div>
        <div data-testid="command-bar-fkeys" className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-t border-[#E5E5E1] dark:border-[#22354A] text-[10.5px] text-[#6B7280] dark:text-[#94A3B8]">
          {FUNCTION_KEYS.filter((k) => targetAllowed(k.target, access)).map((k) => (
            <span key={k.key} className="inline-flex items-center gap-1"><kbd className="font-mono bg-white dark:bg-[#111C28] px-1.5 py-0.5 rounded border border-[#E5E5E1] dark:border-[#22354A]">{k.key}</kbd> {k.label}</span>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-4 px-4 py-2 bg-[#FAF9F6] dark:bg-[#0D1520] border-t border-[#E5E5E1] dark:border-[#22354A] text-[11px] text-[#8E9299]">
          <span><kbd className="font-mono">↑↓</kbd> move</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
          <span className="ml-auto">Menus: Alt + C · I · A · R · S</span>
        </div>
      </div>
    </div>
  );
};
