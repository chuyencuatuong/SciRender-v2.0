import type { MermaidConfig } from 'mermaid';
import { lazyModule } from './lazy-module';

/**
 * The one door to the mermaid singleton.
 *
 * `mermaid.initialize()` mutates module-global state. Two callers configure it
 * differently — the document renderer (`lib/mermaid.ts`: body font size,
 * `htmlLabels:false`, wrappingWidth) and Diagram Studio / card thumbnails
 * (`lib/diagram-studio.ts`). Each used to remember "I already configured it"
 * in its own variable, so after a thumbnail rendered, the next page render
 * skipped re-initialising and drew new diagrams with the Studio's settings:
 * smaller labels, HTML labels, different wrapping — two diagrams in one report
 * looking different, and the measured size no longer matching (P2).
 *
 * Here configure + render is one queued step: the config is applied right
 * before the caller's render, and nobody else's initialize can land between
 * them, even when a thumbnail and a page render are in flight together.
 */
const loadMermaid = lazyModule(() => import('mermaid').then((m) => m.default));
type Mermaid = Awaited<ReturnType<typeof loadMermaid>>;

let activeKey = '';
let queue: Promise<unknown> = Promise.resolve();

export function withMermaid<T>(config: MermaidConfig, fn: (mermaid: Mermaid) => Promise<T>): Promise<T> {
  const key = JSON.stringify(config);
  const task = queue.then(async () => {
    const mermaid = await loadMermaid();
    if (key !== activeKey) {
      mermaid.initialize(config);
      activeKey = key;
    }
    return fn(mermaid);
  });
  // A failed render must not jam the queue for every later diagram.
  queue = task.catch(() => undefined);
  return task;
}

/** Stable key for a config — callers use it to scope their SVG caches. */
export function mermaidConfigKey(config: MermaidConfig): string {
  return JSON.stringify(config);
}
