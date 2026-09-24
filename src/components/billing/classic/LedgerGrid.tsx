import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * The spreadsheet look of the old desktop program's data-entry screens (Apna Accountant SB), in our colours:
 *
 *   ┌──┬────────┬──────────────────┬────────────┬────────────┬───────────────┐
 *   │  │ CODE   │ TITLE            │      DEBIT │     CREDIT │ NARRATION     │  ← header (never scrolls away)
 *   │ *│ [____] │ [______________] │ [________] │ [________] │ [___________] │  ← entry row, same columns
 *   ├──┼────────┼──────────────────┼────────────┼────────────┼───────────────┤
 *   │ ▸│ 2224   │ MG Edible Oil    │ 222,000.00 │            │ BAHL- Rahmat  │  ← filled rows (click = load)
 *   │  │        │                  │            │            │               │  ← empty ruled rows up to minRows
 *   ├──┴────────┴──────── Totals: ─┼ 222,000.00 ┼       0.00 ┼───────────────┤  ← totals under their columns
 *
 * Thin cell borders, ~28px rows, a narrow row-selector column, numbers right-aligned with 2 decimals and
 * tabular digits. The body scrolls inside a fixed height. On a phone the whole grid (entry row included)
 * scrolls sideways inside its own box, so the page itself never does.
 */

export interface LedgerColumn {
  key: string;
  label: React.ReactNode;
  /** A CSS grid track: '6.5rem', 'minmax(9rem,2fr)', … */
  width: string;
  align?: 'left' | 'right' | 'center';
  /** Money / quantity: right-aligned, tabular digits. */
  numeric?: boolean;
  /** Extra classes for this column's read-only cells. */
  className?: string;
}

export interface LedgerRow {
  key: string | number;
  cells: Record<string, React.ReactNode>;
  selected?: boolean;
  /** Click or Enter on the row (load it into the entry row). */
  onActivate?: () => void;
  /** Delete / Backspace on the row. */
  onDelete?: () => void;
  testId?: string;
  label?: string;
  /** Not focusable (a view-only document). */
  inert?: boolean;
  /** A full-width note under the row's cells (stock note, scheme…). */
  sub?: React.ReactNode;
}

export interface LedgerEntry {
  cells: Record<string, React.ReactNode>;
  /** A grid line is loaded in it (it gets the "changing" colour). */
  editing?: boolean;
  /** Extra attributes for the entry row element (data-entry, data-testid…). */
  props?: Record<string, unknown>;
  /** Full-width lines under the entry row (stock in hand, batch no., notes). */
  below?: React.ReactNode;
}

export interface LedgerTotals {
  cells: Record<string, React.ReactNode>;
  testId?: string;
}

/** Height of one ruled row, in px. */
export const LEDGER_ROW_H = 28;
const SELECTOR = '1.75rem';

const RULE = 'border-[#E4E3DD] dark:border-[#1F3045]';
const INK = 'text-[#111827] dark:text-[#E5EAF1]';

/** 222000 → "222,000.00" (the grid's money format: 2 decimals, no "Rs."). */
const TWO = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt2 = (n: number | null | undefined) => TWO.format(Math.round((Number(n) || 0) * 100) / 100);
/** Blank for nothing, else 2 decimals (a Debit / Credit cell). */
export const fmt2OrBlank = (n: number | null | undefined) => ((Number(n) || 0) === 0 ? '' : fmt2(n));

/** Inputs that sit in an entry-row cell: compact, square-ish, 16px on phones (no iOS zoom). */
export const ledgerInputCls =
  'w-full h-8 min-w-0 bg-white dark:bg-[#0B131D] border border-[#D9D8D2] dark:border-[#2A3E57] rounded-md px-2 text-base sm:text-sm font-semibold text-[#111827] dark:text-white focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 placeholder:font-normal placeholder:text-[#9CA3AF] disabled:opacity-60';
export const ledgerNumCls = `${ledgerInputCls} tabular-nums text-right !px-1.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
export const ledgerSelectCls = `${ledgerInputCls} !px-1.5 !pr-6`;

const template = (columns: LedgerColumn[]) => `${SELECTOR} ${columns.map((c) => c.width).join(' ')}`;
/** A small button column (remove, add) keeps its button whole; text columns cut long text with an ellipsis. */
const fit = (c: LedgerColumn) => (c.align === 'center' ? 'px-0 overflow-hidden' : 'px-2 truncate');
const alignCls = (c: LedgerColumn) => (c.align === 'center' ? 'text-center' : c.align === 'right' || c.numeric ? 'text-right' : 'text-left');

export const LedgerGrid: React.FC<{
  columns: LedgerColumn[];
  rows: LedgerRow[];
  /** Name of the grid (screen readers, tests). */
  ariaLabel: string;
  entry?: LedgerEntry;
  totals?: LedgerTotals;
  /** Ruled rows shown even when fewer lines are filled. */
  minRows?: number;
  /** Below this width the grid scrolls sideways in its box. */
  minWidth?: number;
  /** Hint in the first empty row when nothing is filled. */
  empty?: React.ReactNode;
  testId?: string;
  className?: string;
}> = ({ columns, rows, ariaLabel, entry, totals, minRows = 15, minWidth = 640, empty, testId, className = '' }) => {
  const cols = template(columns);
  // Never narrower than its columns' own minimum widths (below that the box scrolls sideways).
  const least = Math.ceil(columns.reduce((sum, c) => sum + (parseFloat((/(?:minmax\()?([\d.]+)rem/.exec(c.width) || [])[1] || '0') || 0), 1.75) * 16) + 2;
  const width = Math.max(minWidth, least);
  const fillers = Math.max(0, minRows - rows.length);
  const last = columns.length - 1;
  const cellBorder = (i: number) => (i === last ? '' : `border-r ${RULE}`);
  // Where the body shows a scroll bar that takes room (Windows), the header, entry row and totals get the
  // same room on the right, so every column stays exactly above / below its cells.
  const body = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState(0);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setBar(Math.max(0, el.offsetWidth - el.clientWidth));
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [rows.length, minRows]);
  const pad = bar ? { paddingRight: bar } : undefined;
  return (
    <div className={`rounded-xl border border-[#D9D8D2] dark:border-[#26384F] bg-white dark:bg-[#0F1924] overflow-x-auto overscroll-x-contain ${className}`} data-testid={testId} data-ledger-grid>
      <div style={{ minWidth: width }} className="text-sm">
        {/* Header */}
        <div role="presentation" style={pad} className={`bg-[#F1F0EB] dark:bg-[#15212F] border-b ${RULE}`}>
          <div className="grid" style={{ gridTemplateColumns: cols }} aria-hidden="true">
            <div className={`border-r ${RULE}`} />
            {columns.map((c, i) => (
              <div key={c.key} className={`h-8 leading-8 px-2 truncate text-[10.5px] font-bold uppercase tracking-wider text-[#4B5563] dark:text-[#94A3B8] ${alignCls(c)} ${cellBorder(i)}`}>{c.label}</div>
            ))}
          </div>
        </div>

        {/* Entry row: same columns as the grid */}
        {entry && (
          <div style={pad} className={`border-b-2 ${entry.editing ? 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/25' : 'border-teal-600/40 dark:border-teal-700/50 bg-teal-50/40 dark:bg-teal-950/15'}`}>
            <div role="group" aria-label={entry.editing ? 'Entry row (changing a line)' : 'Entry row'} className="grid items-start" style={{ gridTemplateColumns: cols }} {...(entry.props || {})}>
              <div aria-hidden="true" className={`self-stretch border-r ${RULE} flex items-start justify-center pt-2 text-[11px] font-black ${entry.editing ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{entry.editing ? '✎' : '*'}</div>
              {columns.map((c, i) => (
                <div key={c.key} className={`min-w-0 p-1 self-stretch ${alignCls(c)} ${cellBorder(i)}`}>{entry.cells[c.key]}</div>
              ))}
              {entry.below && <div className="col-span-full min-w-0 px-2 pb-1.5 pl-[calc(1.75rem+0.5rem)] space-y-1">{entry.below}</div>}
            </div>
          </div>
        )}

        {/* Body: filled rows then empty ruled rows; scrolls inside a fixed height */}
        <div role="grid" aria-label={ariaLabel} aria-rowcount={rows.length} ref={body} className="overflow-y-auto overflow-x-hidden max-sm:max-h-[45dvh]" style={{ height: minRows * LEDGER_ROW_H }}>
          {rows.map((r) => (
            <div
              key={r.key}
              role="row"
              tabIndex={r.inert ? -1 : 0}
              aria-selected={r.selected || false}
              aria-label={r.label}
              data-testid={r.testId}
              onClick={r.onActivate}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if ((e.key === 'Delete' || e.key === 'Backspace') && r.onDelete) { e.preventDefault(); e.stopPropagation(); r.onDelete(); }
                else if (e.key === 'Enter' && r.onActivate) { e.preventDefault(); e.stopPropagation(); r.onActivate(); }
              }}
              className={`grid border-b ${RULE} outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 ${r.onActivate ? 'cursor-pointer' : ''} ${r.selected ? 'bg-teal-50 dark:bg-teal-900/30' : 'hover:bg-[#F8F7F3] dark:hover:bg-[#132132]'}`}
              style={{ gridTemplateColumns: cols }}
            >
              <div aria-hidden="true" className={`border-r ${RULE} text-center text-[10px] leading-[27px] ${r.selected ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-[#0B131D]' : 'bg-[#F7F6F2] dark:bg-[#131E2B] text-transparent'}`}>▶</div>
              {columns.map((c, i) => (
                <div key={c.key} role="gridcell" className={`min-w-0 leading-[27px] ${fit(c)} ${alignCls(c)} ${c.numeric ? 'tabular-nums' : ''} ${INK} ${cellBorder(i)} ${c.className || ''}`}>{r.cells[c.key]}</div>
              ))}
              {r.sub && <div className={`col-span-full min-w-0 px-2 pb-1 pl-[calc(1.75rem+0.5rem)] border-t border-dashed ${RULE}`}>{r.sub}</div>}
            </div>
          ))}
          {Array.from({ length: fillers }, (_, f) => (
            <div key={`fill${f}`} aria-hidden="true" className={`grid border-b ${RULE}`} style={{ gridTemplateColumns: cols, height: LEDGER_ROW_H }}>
              <div className={`border-r ${RULE} bg-[#F7F6F2] dark:bg-[#131E2B]`} />
              {f === 0 && rows.length === 0 && empty ? (
                <div className="px-2 leading-[27px] truncate text-xs text-[#9CA3AF] dark:text-[#64748B]" style={{ gridColumn: `2 / span ${columns.length}` }}>{empty}</div>
              ) : (
                columns.map((c, i) => <div key={c.key} className={cellBorder(i)} />)
              )}
            </div>
          ))}
        </div>

        {/* Totals, each under its own column */}
        {totals && (
          <div style={pad} className={`border-t-2 border-[#CFCEC7] dark:border-[#2A3E57] bg-[#F1F0EB] dark:bg-[#15212F]`}>
            <div className="grid font-bold" style={{ gridTemplateColumns: cols }} data-testid={totals.testId}>
              <div className={`border-r ${RULE}`} />
              {columns.map((c, i) => (
                <div key={c.key} className={`min-w-0 leading-8 ${fit(c)} ${alignCls(c)} ${c.numeric ? 'tabular-nums' : ''} ${INK} ${cellBorder(i)}`}>{totals.cells[c.key]}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** "Totals:" as the label cell of a totals row (right-aligned, so it sits against the first figure). */
export const TotalsLabel: React.FC<{ children?: React.ReactNode }> = ({ children = 'Totals:' }) => (
  <span className="block text-right text-[11px] font-bold uppercase tracking-wider text-[#4B5563] dark:text-[#94A3B8]">{children}</span>
);
