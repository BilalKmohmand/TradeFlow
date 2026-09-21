import { useEffect, useState } from 'react';

/** True while the CSS media query matches (e.g. '(min-width: 768px)'); updates on resize / rotate. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}

/** Lists render as a table from the `md` breakpoint (768px) up, as cards below it. Only one is in the page. */
export const useWideLayout = () => useMediaQuery('(min-width: 768px)');
