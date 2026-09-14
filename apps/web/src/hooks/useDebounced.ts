import { useEffect, useRef, useState } from 'react';

/** Returns `value` after it has stopped changing for `delay` ms. */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Fires `fn` at most once per animation frame. */
export function useRafCallback(fn: () => void): () => void {
  const ref = useRef(fn);
  ref.current = fn;
  const pending = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pending.current !== null) cancelAnimationFrame(pending.current);
    },
    [],
  );
  return () => {
    if (pending.current !== null) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      ref.current();
    });
  };
}
