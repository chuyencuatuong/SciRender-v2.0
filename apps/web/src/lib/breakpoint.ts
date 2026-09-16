import { useEffect, useState } from 'react';

/**
 * Two widths decide the whole layout, and they are declared once here so the
 * shell, the panel and the preview can never disagree about which mode they
 * are in — that disagreement is what produces panels overlapping content.
 *
 * ≤1180px — the preview stops being a column and slides in over the canvas
 * ≤1000px — the side panel stops pushing and floats over the canvas
 */
export const SPLIT_PREVIEW = 1180;
export const FLOAT_PANEL = 1000;

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent): void => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
