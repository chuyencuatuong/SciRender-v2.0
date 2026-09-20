import { lazyModule } from './lazy-module';

/**
 * Loads KaTeX CSS only when a math renderer is actually needed.
 *
 * Via `lazyModule`, a failed load is not cached: the next equation the user
 * touches retries instead of inheriting a permanently rejected promise.
 */
const load = lazyModule<void>(() =>
  import('katex/dist/katex.min.css').then(() => undefined),
);

export function ensureKatexCss(): Promise<void> {
  return load();
}
