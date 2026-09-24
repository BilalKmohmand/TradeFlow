import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, inputCls, labelCls, secondaryBtn } from '../ui';
import { filterParties } from '../../../utils/vouchers';

export interface SearchParty {
  id: string;
  code?: string;
  name: string;
  city?: string;
  phone?: string;
  company?: string;
}

/**
 * "Search Party By City" (Apna Accountant SB): a city list and a search box over a grid of
 * PartyID # | Party Name. Type to narrow it (ID, name, phone, shop), ↑ ↓ to move, Enter or a double-click
 * picks. Used by the Sale Invoice (customers) and the Purchase Invoice (suppliers).
 */
export const SearchPartyDialog: React.FC<{
  isOpen: boolean;
  parties: SearchParty[];
  cities: string[];
  /** What was typed in the party box that opened it. */
  initialText?: string;
  onPick: (id: string) => void;
  onClose: () => void;
  title?: string;
}> = ({ isOpen, parties, cities, initialText = '', onPick, onClose, title = 'Search Party By City' }) => {
  const [city, setCity] = useState('');
  const [q, setQ] = useState(initialText);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    setQ(initialText);
    setAt(0);
    // Type straight on: the cursor goes to the search box, after what was already typed.
    const t = setTimeout(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 60);
    return () => clearTimeout(t);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => filterParties(parties, q, city).sort((a, b) => a.name.localeCompare(b.name)), [parties, q, city]);
  useEffect(() => setAt(0), [q, city]);
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>(`[data-idx="${at}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [at]);
  const pick = (id?: string) => {
    if (!id) return;
    onPick(id);
  };
  const onKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      pick(rows[at]?.id);
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} subtitle="Pick the city, type part of the name or ID, then Enter (or double-click the party)." wide>
      <div className="space-y-3" onKeyDown={onKeys} data-testid="search-party">
        <div className="grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)] gap-2">
          <div>
            <label className={labelCls} htmlFor="sp-city">City</label>
            <select id="sp-city" data-skip-autofocus value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
              <option value="">All cities</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="sp-search">Search</label>
            <input id="sp-search" ref={input} value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} placeholder="Name, ID or phone" autoComplete="off" />
          </div>
        </div>
        <div ref={grid} role="grid" aria-label="Parties" aria-rowcount={rows.length} className="max-h-[50vh] overflow-y-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
          <div role="row" className="sticky top-0 grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)_9rem] gap-2 px-3 py-2 bg-[#FAF9F6] dark:bg-[#162436] text-[11px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#94A3B8]">
            <span role="columnheader">PartyID #</span>
            <span role="columnheader">Party Name</span>
            <span role="columnheader" className="hidden sm:block">City</span>
          </div>
          {rows.length === 0 && <p className="px-3 py-4 text-sm text-[#6B7280] dark:text-[#94A3B8]">No party matches.</p>}
          {rows.map((p, i) => (
            <div
              key={p.id}
              role="row"
              data-idx={i}
              aria-selected={i === at}
              onClick={() => setAt(i)}
              onDoubleClick={() => pick(p.id)}
              className={`grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)_9rem] gap-2 px-3 py-2 text-sm cursor-pointer border-t border-[#F1F0EC] dark:border-[#1E2E40] ${i === at ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-100' : 'text-[#111827] dark:text-white hover:bg-[#FAF9F6] dark:hover:bg-[#162436]'}`}
            >
              <span role="gridcell" className="tabular-nums font-mono text-xs self-center">{p.code || '—'}</span>
              <span role="gridcell" className="font-semibold truncate">{p.name}{p.company && p.company !== p.name ? <span className="font-normal text-[#6B7280] dark:text-[#94A3B8]"> • {p.company}</span> : null}</span>
              <span role="gridcell" className="hidden sm:block text-xs self-center text-[#6B7280] dark:text-[#94A3B8] truncate">{p.city || ''}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center gap-2">
          <span className="text-[11px] text-[#8E9299]">{rows.length} of {parties.length} • ↑ ↓ move • Enter pick • Esc close</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>Close</button>
            <button type="button" onClick={() => pick(rows[at]?.id)} disabled={!rows[at]} className={secondaryBtn}>Select</button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
