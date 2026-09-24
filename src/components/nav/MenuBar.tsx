import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { NavEntry, NavGroup, NavGroupId, columnsOf } from '../../utils/navMap';
import { somethingOpen } from '../billing/useBillingShortcuts';
import { OPEN_MENU_EVENT, useNavGo, useNavGroups } from './useNavGo';

type OpenedBy = 'hover' | 'click' | 'key';

/** "Coding" with the Alt-key letter underlined, like a desktop program's menu. */
const Mnemonic: React.FC<{ label: string; letter: string }> = ({ label, letter }) => {
  const i = label.toUpperCase().indexOf(letter.toUpperCase());
  if (i < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, i)}
      <span className="underline decoration-1 underline-offset-[3px] decoration-teal-600/70 dark:decoration-teal-400/70">{label[i]}</span>
      {label.slice(i + 1)}
    </>
  );
};

/** One option in a dropdown: our name, the old program's name (muted), a one-line hint and its F-key. */
const MenuItem: React.FC<{ entry: NavEntry; onPick: (e: NavEntry) => void }> = ({ entry: e, onPick }) => {
  // The old program's name, when it says something the label does not.
  const plain = (x: string) => x.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');
  const lab = plain(e.label);
  const old = (e.aka || []).find((a) => { const x = plain(a); return !lab.includes(x) && !x.includes(lab); });
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-nav-item={e.id}
      aria-label={e.label}
      aria-describedby={`nav-hint-${e.id}`}
      onClick={() => onPick(e)}
      className="group w-full flex items-start gap-2 rounded-xl px-2.5 py-1.5 text-left outline-hidden hover:bg-[#F4F3EF] dark:hover:bg-[#162436] focus:bg-[#111827] focus:text-white dark:focus:bg-white dark:focus:text-[#111827]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-snug text-[#111827] dark:text-white group-focus:text-inherit">
          {e.label}
          {old && <span className="ml-1.5 text-[10.5px] font-medium text-[#8E9299] group-focus:text-inherit group-focus:opacity-70">{old}</span>}
        </span>
        <span id={`nav-hint-${e.id}`} className="block text-[11px] leading-snug text-[#6B7280] dark:text-[#94A3B8] truncate group-focus:text-inherit group-focus:opacity-75">{e.hint}</span>
      </span>
      {e.key && <kbd className="mt-0.5 shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] dark:text-[#94A3B8] group-focus:text-inherit">{e.key}</kbd>}
    </button>
  );
};

/**
 * The old program's Invoice menu: a short list ("Purchase Invoice ›", "Sale Invoice ›", "Store Transfer"),
 * each "›" opening its options to the side on hover, click or → (← comes back).
 */
const FlyoutPanel = React.forwardRef<HTMLDivElement, { group: NavGroup; onPick: (e: NavEntry) => void; onKeyDown: (e: React.KeyboardEvent) => void; left: number }>(({ group, onPick, onKeyDown, left }, ref) => {
  const [openSub, setOpenSub] = useState<string | null>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const trigRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const entries = group.sections.flatMap((s) => s.entries);
  // Top rows, in order: one per sub-menu (first time it appears) and every entry without one.
  const rows: ({ kind: 'sub'; label: string } | { kind: 'item'; entry: NavEntry })[] = [];
  const seen = new Set<string>();
  entries.forEach((e) => {
    if (e.sub) {
      if (!seen.has(e.sub)) { seen.add(e.sub); rows.push({ kind: 'sub', label: e.sub }); }
    } else rows.push({ kind: 'item', entry: e });
  });
  const focusSub = () => setTimeout(() => subRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 0);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={group.label}
      id={`nav-menu-${group.id}`}
      onKeyDown={onKeyDown}
      style={{ left }}
      data-testid={`nav-menu-${group.id}`}
      className="absolute top-full mt-1 z-40 rounded-3xl border border-[#E5E5E1] dark:border-[#203248] bg-white dark:bg-[#101A26] shadow-2xl shadow-slate-900/10 p-2 w-64"
    >
      <div role="group" aria-label={group.label}>
        {rows.map((r) => {
          if (r.kind === 'item') return <div key={r.entry.id} onMouseEnter={() => setOpenSub(null)}><MenuItem entry={r.entry} onPick={onPick} /></div>;
          const on = openSub === r.label;
          const subEntries = entries.filter((e) => e.sub === r.label);
          return (
            <div key={r.label} className="relative" onMouseEnter={() => setOpenSub(r.label)}>
              <button
                ref={(el) => { trigRefs.current[r.label] = el; }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-haspopup="menu"
                aria-expanded={on}
                aria-label={r.label}
                data-nav-sub={r.label}
                onClick={() => { setOpenSub(r.label); focusSub(); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpenSub(r.label); focusSub(); }
                }}
                className={`w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold outline-hidden ${on ? 'bg-[#F4F3EF] dark:bg-[#162436]' : ''} hover:bg-[#F4F3EF] dark:hover:bg-[#162436] focus:bg-[#111827] focus:text-white dark:focus:bg-white dark:focus:text-[#111827] text-[#111827] dark:text-white`}
              >
                <span>{r.label}</span><span aria-hidden="true">›</span>
              </button>
              {on && (
                <div
                  ref={subRef}
                  role="menu"
                  aria-label={r.label}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpenSub(null); trigRefs.current[r.label]?.focus(); return; }
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault(); e.stopPropagation();
                      const list: HTMLElement[] = subRef.current ? Array.from(subRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
                      const i = list.indexOf(document.activeElement as HTMLElement);
                      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
                    }
                  }}
                  className="absolute left-full top-0 ml-1 w-72 max-h-[calc(100vh-var(--header-h,7rem)-2rem)] overflow-y-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248] bg-white dark:bg-[#101A26] shadow-2xl shadow-slate-900/10 p-2"
                >
                  <div role="group" aria-label={r.label}>
                    {subEntries.map((e) => <MenuItem key={e.id} entry={e} onPick={onPick} />)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div role="presentation" className="mt-2 pt-2 px-2.5 border-t border-[#F1F0EC] dark:border-[#1E2E40] text-[10.5px] text-[#8E9299]">→ opens a › menu · Alt + {group.key}</div>
    </div>
  );
});
FlyoutPanel.displayName = 'FlyoutPanel';

/** The dropdown of one group: columns of sections, with sub-headings (Reports › Stock Reports…). */
const MenuPanel = React.forwardRef<HTMLDivElement, { group: NavGroup; onPick: (e: NavEntry) => void; onKeyDown: (e: React.KeyboardEvent) => void; left: number }>(({ group, onPick, onKeyDown, left }, ref) => {
  const cols = columnsOf(group.sections, Math.min(group.cols, Math.max(1, group.sections.length + (group.sections.some((s) => s.entries.length >= 16) ? 1 : 0))));
  if (group.flyout) return <FlyoutPanel ref={ref} group={group} onPick={onPick} onKeyDown={onKeyDown} left={left} />;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={group.label}
      id={`nav-menu-${group.id}`}
      onKeyDown={onKeyDown}
      style={{ left }}
      data-testid={`nav-menu-${group.id}`}
      className="absolute top-full mt-1 z-40 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-var(--header-h,7rem)-1.5rem)] overflow-y-auto rounded-3xl border border-[#E5E5E1] dark:border-[#203248] bg-white dark:bg-[#101A26] shadow-2xl shadow-slate-900/10 p-3"
    >
      <div className="grid gap-x-3" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(13.5rem, 16rem))` }}>
        {cols.map((col, ci) => (
          <div key={ci} className="space-y-3 min-w-0">
            {col.map((s) => {
              let lastSub: string | undefined;
              return (
                <div key={s.label} role="group" aria-label={s.label}>
                  <div className="px-2.5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800 dark:text-teal-300">{s.label}</div>
                  {s.entries.map((e) => {
                    const head = e.sub && e.sub !== lastSub ? e.sub : null;
                    lastSub = e.sub;
                    return (
                      <React.Fragment key={e.id}>
                        {head && <div role="presentation" className="px-2.5 pt-2 pb-0.5 text-[11px] font-bold text-[#374151] dark:text-[#CBD5E1]">{head} ›</div>}
                        <MenuItem entry={e} onPick={onPick} />
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div role="presentation" className="mt-2 pt-2 px-2.5 border-t border-[#F1F0EC] dark:border-[#1E2E40] flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-[#8E9299]">
        <span>Alt + {group.key} opens this menu</span>
        <span>↑ ↓ move · ← → other menus · Enter open · Esc close</span>
        <span className="ml-auto">Can’t see it? Press / and type</span>
      </div>
    </div>
  );
});
MenuPanel.displayName = 'MenuPanel';

/**
 * Desktop top menu bar (simple billing, lg and up): the old program's five menus — Coding · Invoice ·
 * Accounts · Reports · System — as our own dropdown panels. Click or hover opens; Alt + C/I/A/R/S opens from
 * anywhere; arrows, Enter, Esc, Home/End and first-letter typing work inside (WAI-ARIA menubar pattern).
 */
export const MenuBar: React.FC = () => {
  const groups = useNavGroups();
  const go = useNavGo();
  const [open, setOpen] = useState<NavGroupId | null>(null);
  const [openedBy, setOpenedBy] = useState<OpenedBy>('click');
  const [focusIdx, setFocusIdx] = useState(0);
  const [left, setLeft] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const topRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** After opening from the keyboard: which item to focus ('first' | 'last'). */
  const pendingFocus = useRef<'first' | 'last' | null>(null);

  const idxOf = (id: NavGroupId) => groups.findIndex((g) => g.id === id);
  const items = (): HTMLElement[] => (panelRef.current ? Array.from(panelRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')) : []);
  const clearTimers = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  };

  const openGroup = (id: NavGroupId, by: OpenedBy, focus: 'first' | 'last' | null = null) => {
    clearTimers();
    setOpen(id);
    setOpenedBy(by);
    setFocusIdx(idxOf(id));
    if (open === id && focus) {
      // Already open (no re-render of the panel): focus now.
      const list = items();
      (focus === 'first' ? list[0] : list[list.length - 1])?.focus();
      return;
    }
    pendingFocus.current = focus;
  };
  const close = (refocus = false) => {
    clearTimers();
    const i = open ? idxOf(open) : focusIdx;
    setOpen(null);
    if (refocus) topRefs.current[i]?.focus();
  };

  // Position the panel under its button, kept inside the bar; focus the first / last item when asked.
  useLayoutEffect(() => {
    if (!open) return;
    const btn = topRefs.current[idxOf(open)];
    const bar = barRef.current;
    const panel = panelRef.current;
    if (btn && bar && panel) {
      const room = bar.clientWidth - panel.offsetWidth;
      setLeft(Math.max(0, Math.min(btn.offsetLeft, room)));
    }
    if (pendingFocus.current) {
      const list = items();
      (pendingFocus.current === 'first' ? list[0] : list[list.length - 1])?.focus();
      pendingFocus.current = null;
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alt + letter from anywhere; the breadcrumb can open a menu too; clicks outside close it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const letter = e.code?.startsWith('Key') ? e.code.slice(3) : e.key.toUpperCase();
      const g = groups.find((x) => x.key === letter);
      if (!g) return;
      if (somethingOpen()) return;
      e.preventDefault();
      openGroup(g.id, 'key', 'first');
    };
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent).detail as NavGroupId;
      if (idxOf(id) >= 0) openGroup(id, 'key', 'first');
    };
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_MENU_EVENT, onOpen);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_MENU_EVENT, onOpen);
      document.removeEventListener('mousedown', onDown);
    };
  }); // re-bound every render: cheap, and always sees the current groups

  useEffect(() => () => clearTimers(), []);

  const pick = (e: NavEntry) => {
    setOpen(null);
    go(e.target);
  };

  const moveTop = (delta: number, keepOpen: boolean) => {
    const n = groups.length;
    const i = (focusIdx + delta + n) % n;
    setFocusIdx(i);
    topRefs.current[i]?.focus();
    if (keepOpen) openGroup(groups[i].id, 'key', 'first');
  };

  const onTopKey = (e: React.KeyboardEvent, g: NavGroup) => {
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); moveTop(1, open !== null); break;
      case 'ArrowLeft': e.preventDefault(); moveTop(-1, open !== null); break;
      case 'ArrowDown': case 'Enter': case ' ': e.preventDefault(); openGroup(g.id, 'key', 'first'); break;
      case 'ArrowUp': e.preventDefault(); openGroup(g.id, 'key', 'last'); break;
      case 'Home': e.preventDefault(); setFocusIdx(0); topRefs.current[0]?.focus(); break;
      case 'End': e.preventDefault(); setFocusIdx(groups.length - 1); topRefs.current[groups.length - 1]?.focus(); break;
      case 'Escape': if (open) { e.preventDefault(); close(true); } break;
    }
  };

  const onPanelKey = (e: React.KeyboardEvent) => {
    const list = items();
    const cur = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(cur + 1); break;
      case 'ArrowUp': e.preventDefault(); focusAt(cur < 0 ? list.length - 1 : cur - 1); break;
      case 'Home': e.preventDefault(); focusAt(0); break;
      case 'End': e.preventDefault(); focusAt(list.length - 1); break;
      case 'ArrowRight': e.preventDefault(); moveTop(1, true); break;
      case 'ArrowLeft': e.preventDefault(); moveTop(-1, true); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(true); break;
      case 'Tab': setOpen(null); break;
      default:
        // Type the first letter to jump to the next option starting with it.
        if (e.key.length === 1 && /\S/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
          const k = e.key.toLowerCase();
          const n = list.length;
          for (let s = 1; s <= n; s++) {
            const el = list[(cur + s) % n];
            if ((el.getAttribute('aria-label') || '').toLowerCase().startsWith(k)) { el.focus(); break; }
          }
        }
    }
  };

  const group = open ? groups.find((g) => g.id === open) || null : null;

  return (
    <div
      ref={barRef}
      className="relative"
      onMouseLeave={() => {
        if (open && openedBy === 'hover') leaveTimer.current = setTimeout(() => setOpen(null), 320);
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
      }}
      onMouseEnter={() => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }}
    >
      <nav aria-label="Menu bar" className="flex items-center gap-3 h-11">
        <ul role="menubar" aria-label="Menu bar" className="flex items-center gap-1">
          {groups.map((g, i) => {
            const on = open === g.id;
            return (
              <li key={g.id} role="none">
                <button
                  ref={(el) => { topRefs.current[i] = el; }}
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={on}
                  aria-controls={on ? `nav-menu-${g.id}` : undefined}
                  aria-keyshortcuts={`Alt+${g.key}`}
                  tabIndex={i === focusIdx ? 0 : -1}
                  title={`${g.hint} (Alt+${g.key})`}
                  data-testid={`nav-top-${g.id}`}
                  onClick={() => (on && openedBy !== 'hover' ? setOpen(null) : openGroup(g.id, 'click'))}
                  onMouseEnter={() => {
                    // Only switch between menus while one is already open. A menu never opens just
                    // because the mouse passed over the bar: that panel would cover the page and
                    // swallow the next click.
                    if (leaveTimer.current) clearTimeout(leaveTimer.current);
                    if (open && open !== g.id) openGroup(g.id, openedBy);
                  }}
                  onMouseLeave={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }}
                  onKeyDown={(e) => onTopKey(e, g)}
                  className={`inline-flex items-center gap-1 h-9 px-3.5 rounded-xl text-sm font-bold transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-teal-600 ${on ? 'bg-[#111827] dark:bg-white text-white dark:text-[#111827]' : 'text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F4F3EF] dark:hover:bg-[#162436]'}`}
                >
                  <span><Mnemonic label={g.label} letter={g.key} /></span>
                  <ChevronDown aria-hidden="true" className={`w-3.5 h-3.5 transition-transform ${on ? 'rotate-180' : 'opacity-50'}`} />
                </button>
              </li>
            );
          })}
        </ul>
        <span className="ml-auto hidden xl:inline text-[11px] text-[#8E9299] dark:text-[#64748B]">Alt + underlined letter opens a menu · / finds anything</span>
      </nav>
      {group && <MenuPanel ref={panelRef} group={group} onPick={pick} onKeyDown={onPanelKey} left={left} />}
    </div>
  );
};
