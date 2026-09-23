/**
 * Layout guard: what a user would call "the screen is broken", measured in the browser.
 *
 *   const problems = await layoutProblems(page);   // [] when all is well
 *
 * Checks the open dialog (the top-most one) or, with none open, the page:
 *  - squeezed: a visible text / number / date input that is too narrow for its value, or — when empty —
 *    for a realistic value (qty 1250, rate 7250.50, amount 1250000, code C-0040, a date);
 *  - narrow-number: a number input under 72px wide;
 *  - select: a drop-down under 72px wide, or one that cuts a short choice (≤ 18 letters) short;
 *  - hscroll: the page scrolls sideways (the widest culprit is named);
 *  - offscreen: the dialog does not fit in the window (its Save would be out of reach);
 *  - covered: a button / field is hidden under the fixed header, the bottom tab bar or another fixed bar,
 *    at the top of the page and after scrolling to the very bottom;
 *  - wrapped-button: a short button label ("Save & print") broken onto several lines.
 */
import type { Page } from '@playwright/test';

export interface LayoutProblem {
  kind: 'squeezed' | 'narrow-number' | 'select' | 'hscroll' | 'offscreen' | 'covered' | 'wrapped-button';
  what: string;
  detail: string;
}

/** Runs in the browser. Pure DOM, no closures. */
const measure = (phase: 'top' | 'bottom'): LayoutProblem[] => {
  const out: LayoutProblem[] = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const nameOf = (el: Element): string => {
    const h = el as HTMLInputElement;
    const lab = h.labels && h.labels[0] ? h.labels[0].textContent : '';
    const t = el.getAttribute('aria-label') || lab || h.placeholder || h.name || h.id || el.getAttribute('data-testid') || (el.textContent || '').trim().slice(0, 30) || el.tagName.toLowerCase();
    return t.replace(/\s+/g, ' ').trim().slice(0, 60);
  };
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(shown);
  const root: Element = dialogs.length ? dialogs[dialogs.length - 1] : document.querySelector('main') || document.body;
  const where = dialogs.length ? `dialog "${dialogs[dialogs.length - 1].getAttribute('aria-label') || ''}"` : 'page';

  // ---- clip rect of an element (intersection of its scrolling / clipping ancestors) ----
  const clipOf = (el: Element) => {
    let top = 0, left = 0, right = vw, bottom = vh;
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
        const r = n.getBoundingClientRect();
        top = Math.max(top, r.top); left = Math.max(left, r.left); right = Math.min(right, r.right); bottom = Math.min(bottom, r.bottom);
      }
    }
    return { top, left, right, bottom };
  };

  // ---- inputs ----
  const ctx = document.createElement('canvas').getContext('2d')!;
  const textW = (el: Element, text: string) => {
    const s = getComputedStyle(el);
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const ls = parseFloat(s.letterSpacing) || 0;
    return ctx.measureText(text).width + ls * text.length;
  };
  const sampleFor = (el: HTMLInputElement, name: string): string => {
    const n = name.toLowerCase();
    if (/\b(qty|quantity|packs?|ctns?|cartons?|pcs|bonus|free)\b/.test(n)) return '1250';
    if (/rate|price|cost/.test(n)) return '7250.50';
    if (/amount|total|balance|opening|limit|debit|credit|paid|received|rs\.?|cash|discount|charge|salary|advance/.test(n)) return '1250000';
    if (/%|pct|percent/.test(n)) return '12.5';
    if (/\bcode\b/.test(n)) return 'C-0040';
    if (el.type === 'number' || el.inputMode === 'numeric' || el.inputMode === 'decimal') return '12500';
    return '';
  };
  const fields = Array.from(root.querySelectorAll('input, select')).filter(shown) as (HTMLInputElement | HTMLSelectElement)[];
  for (const el of fields) {
    const r = el.getBoundingClientRect();
    const name = nameOf(el);
    const s = getComputedStyle(el);
    const pad = parseFloat(s.paddingLeft) + parseFloat(s.paddingRight);
    const avail = el.clientWidth - pad;
    if (el instanceof HTMLSelectElement) {
      const text = el.selectedOptions[0]?.textContent?.trim() || '';
      if (r.width < 72) out.push({ kind: 'select', what: `${where} › ${name}`, detail: `${Math.round(r.width)}px wide` });
      else if (text && text.length <= 18 && textW(el, text) > avail - 14) out.push({ kind: 'select', what: `${where} › ${name}`, detail: `"${text}" cut: needs ${Math.round(textW(el, text) + 14)}px, has ${Math.round(avail)}px` });
      continue;
    }
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (!['text', 'number', 'search', 'tel', 'date', 'email', 'password', 'month', 'time', 'datetime-local'].includes(type)) continue;
    if (el.readOnly && !el.value) continue;
    const numeric = type === 'number' || el.inputMode === 'numeric' || el.inputMode === 'decimal';
    if (numeric && r.width < 72) out.push({ kind: 'narrow-number', what: `${where} › ${name}`, detail: `${Math.round(r.width)}px wide (min 72)` });
    let need = 0;
    let sample = '';
    if (type === 'date') { sample = '23/09/2026'; need = textW(el, '23/09/2026') + 22; }
    else if (type === 'month') { sample = 'September 2026'; need = textW(el, sample) + 22; }
    else if (type === 'time') { sample = '12:45 PM'; need = textW(el, sample) + 22; }
    else {
      sample = el.value || sampleFor(el as HTMLInputElement, `${name} ${el.id} ${(el as HTMLInputElement).name}`);
      // Free text (a long name or address) may scroll inside its box; numbers, codes and short values may not.
      if (!sample || (!numeric && sample.length > 16)) continue;
      need = textW(el, sample);
    }
    if (need > avail + 1) out.push({ kind: 'squeezed', what: `${where} › ${name}`, detail: `"${sample}" needs ${Math.round(need)}px, has ${Math.round(avail)}px` });
  }

  // ---- short button labels broken over lines ----
  for (const b of Array.from(root.querySelectorAll('button')).filter(shown)) {
    const text = (b.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 22 || b.children.length > 3) continue;
    const texts = Array.from(b.querySelectorAll('*')).concat([b]).flatMap((n) => Array.from(n.childNodes)).filter((c) => c.nodeType === 3 && (c.textContent || '').trim());
    if (texts.length !== 1) continue; // several text parts (code + name, name + role) are laid out on purpose
    // Rows built of several text parts (code + name, name + role) are laid out on purpose.
    if (Array.from(b.querySelectorAll('*')).filter((n) => n.childNodes.length && Array.from(n.childNodes).every((c) => c.nodeType === 3) && (n.textContent || '').trim()).length > 1) continue;
    if (Array.from(b.querySelectorAll('*')).some((n) => getComputedStyle(n).display === 'block' || getComputedStyle(n).display === 'flex')) continue; // deliberately stacked
    // Lines of the text itself (icons left out): two text boxes more than half a line apart = two lines.
    const tops: number[] = [];
    const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!(t.textContent || '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const r of Array.from(range.getClientRects())) if (r.width > 1 && !tops.some((y) => Math.abs(y - r.top) < r.height / 2)) tops.push(r.top);
    }
    if (tops.length > 1) out.push({ kind: 'wrapped-button', what: `${where} › ${text}`, detail: `label on ${tops.length} lines, button ${Math.round(b.getBoundingClientRect().width)}px wide` });
  }

  // ---- sideways scroll ----
  const docW = document.documentElement.scrollWidth;
  if (docW > vw + 1) {
    let worst: Element | null = null;
    let worstRight = vw;
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.right > worstRight + 1 && clipOf(el).right >= vw - 1) { worst = el; worstRight = r.right; }
    }
    out.push({ kind: 'hscroll', what: where, detail: `page is ${docW}px on a ${vw}px screen; widest: <${worst?.tagName.toLowerCase()} class="${(worst?.getAttribute('class') || '').slice(0, 80)}"> "${(worst?.textContent || '').trim().slice(0, 40)}"` });
  }

  // ---- dialog must fit ----
  if (dialogs.length) {
    const r = dialogs[dialogs.length - 1].getBoundingClientRect();
    if (r.top < -1 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1) out.push({ kind: 'offscreen', what: where, detail: `dialog ${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)} in ${vw}×${vh}` });
  }

  // ---- covered by a fixed bar ----
  const fixedAncestor = (n: Element | null): Element | null => {
    for (; n; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return n;
    }
    return null;
  };
  const controls = Array.from(root.querySelectorAll('button, a[href], input, select, textarea, [role="tab"], [role="menuitem"]')).filter(shown);
  const seen = new Set<string>();
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const c = clipOf(el);
    const cx = Math.min(Math.max(r.left + r.width / 2, c.left + 1), c.right - 1);
    const cy = r.top + r.height / 2;
    if (cy < c.top + 2 || cy > c.bottom - 2 || cx < 0 || cx > vw || cy < 0 || cy > vh) continue; // scrolled out of its box: fine
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || el === hit || el.contains(hit) || hit.contains(el)) continue;
    const bar = fixedAncestor(hit);
    if (!bar || bar.contains(el)) continue;
    // Content below the fold sits under a bottom bar until scrolled (and above the fold under a top bar after
    // scrolling): judge bottom bars at the bottom of the scroll and top bars at the top.
    const br = bar.getBoundingClientRect();
    if (phase === 'top' ? br.top > vh / 2 : br.bottom < vh / 2) continue;
    // A sticky table header / sticky row over a scrolled table is fine; only app bars and other fixed layers count.
    if (getComputedStyle(bar).position === 'sticky' && bar.tagName !== 'HEADER' && !bar.closest('header')) continue;
    const label = `${where} › ${nameOf(el)}`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ kind: 'covered', what: label, detail: `at ${phase}: under <${bar.tagName.toLowerCase()} ${bar.getAttribute('aria-label') ? `aria-label="${bar.getAttribute('aria-label')}"` : `class="${(bar.getAttribute('class') || '').slice(0, 60)}"`}>` });
  }
  return out;
};

/** Scroll a dialog's body (or the page) to the top or to the very bottom. */
const scrollAll = (to: 'top' | 'bottom') => {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = dialogs[dialogs.length - 1];
  if (d) {
    d.querySelectorAll('*').forEach((n) => {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) n.scrollTop = to === 'top' ? 0 : n.scrollHeight;
    });
  } else window.scrollTo(0, to === 'top' ? 0 : document.documentElement.scrollHeight);
};

/** Every layout problem of what is on screen now, at the top and after scrolling to the bottom. */
export async function layoutProblems(page: Page): Promise<LayoutProblem[]> {
  await page.waitForTimeout(300); // let a dialog finish sliding in
  // Some TS runners (tsx / esbuild keepNames) wrap inner functions in __name(): give the page a no-op one.
  await page.evaluate('window.__name = window.__name || ((f) => f)');
  await page.evaluate(scrollAll, 'top');
  await page.waitForTimeout(60);
  const top = await page.evaluate(measure, 'top');
  await page.evaluate(scrollAll, 'bottom');
  await page.waitForTimeout(120);
  const bottom = (await page.evaluate(measure, 'bottom')).filter((p) => p.kind === 'covered' || p.kind === 'hscroll');
  await page.evaluate(scrollAll, 'top');
  const key = (p: LayoutProblem) => `${p.kind}|${p.what}`;
  const all = new Map<string, LayoutProblem>();
  for (const p of [...top, ...bottom]) if (!all.has(key(p))) all.set(key(p), p);
  return [...all.values()];
}

export const describeProblems = (list: LayoutProblem[]) => list.map((p) => `[${p.kind}] ${p.what}: ${p.detail}`).join('\n');
