/**
 * Memoised dynamic import that can recover from a failed load.
 *
 * The obvious shape —
 *
 * ```ts
 * let loader: Promise<T> | null = null;
 * if (!loader) loader = import('heavy');
 * return loader;
 * ```
 *
 * — has a defect that only shows up when the load actually fails: the
 * *rejected* promise stays memoised. A single failed chunk fetch (the user was
 * offline for a second, the browser was serving a stale index.html whose chunk
 * hashes no longer exist after a deploy, a proxy dropped the request) therefore
 * poisons the module for the rest of the page's life. Every later call returns
 * the same rejection, so the feature stays broken until the user reloads — and
 * nothing in the UI tells them that reloading is the cure.
 *
 * `lazyModule` memoises the *success* only: a rejection clears the slot, so the
 * next call genuinely retries. That is the whole recovery mechanism — there is
 * no automatic retry loop and no silent swallowing, because P6 says a failure
 * must stay visible. The caller still gets the rejection and still has to show
 * it; what changes is that the caller's next attempt is a real attempt.
 *
 * P5 (Local First) is unaffected: every module these loaders reach for is
 * bundled into the app. The network only enters the picture because the chunk
 * is fetched from the app's own origin on first use.
 */
export function lazyModule<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return (): Promise<T> => {
    if (pending) return pending;
    const attempt = load().catch((err: unknown) => {
      // Only clear the slot if it is still *this* attempt: a caller that
      // already started a fresh retry must not have its slot wiped by the
      // older failure landing afterwards.
      if (pending === attempt) pending = null;
      throw err;
    });
    pending = attempt;
    return attempt;
  };
}

/** Human-readable reason for a failed lazy load, for UI that must say why (P6). */
export function lazyLoadMessage(err: unknown, what: string): string {
  const base = err instanceof Error ? err.message : String(err);
  return `Không nạp được ${what}. ${
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Máy đang ngoại tuyến — nối mạng lại rồi thử lại.'
      : 'Thử lại, hoặc tải lại trang nếu lỗi lặp lại.'
  } (${base})`;
}
