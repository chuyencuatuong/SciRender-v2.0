let loader: Promise<typeof import('mermaid').default> | null = null;
let seq = 0;
const cache = new Map<string, string>();

/**
 * Mermaid is heavy (~2MB), so it is only fetched the first time a document
 * actually contains a diagram. It ships with the app — nothing is downloaded
 * from the network at runtime (P5).
 */
async function getMermaid(): Promise<typeof import('mermaid').default> {
  if (!loader) {
    loader = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'Inter, Segoe UI, sans-serif',
        flowchart: { htmlLabels: false, useMaxWidth: true },
      });
      return m.default;
    });
  }
  return loader;
}

export function hasMermaid(blocks: string[]): boolean {
  return blocks.some((b) => b.includes('data-sr-mermaid='));
}

/**
 * Replaces every mermaid placeholder with its rendered SVG *before* the layout
 * engine measures anything. Diagrams therefore occupy their real height during
 * pagination, which is what keeps preview and print identical (P2).
 */
export async function resolveMermaidBlocks(blocks: string[]): Promise<string[]> {
  if (!hasMermaid(blocks)) return blocks;
  const mermaid = await getMermaid();
  const host = document.createElement('div');

  const out: string[] = [];
  for (const block of blocks) {
    if (!block.includes('data-sr-mermaid=')) {
      out.push(block);
      continue;
    }
    host.innerHTML = block;
    const targets = Array.from(host.querySelectorAll<HTMLElement>('.sr-mermaid[data-sr-mermaid]'));
    for (const target of targets) {
      const source = target.getAttribute('data-sr-mermaid') ?? '';
      target.removeAttribute('data-sr-mermaid');
      if (!source.trim()) continue;
      const key = hash(source);
      let svg = cache.get(key);
      if (svg === undefined) {
        try {
          const rendered = await mermaid.render(`sr-mmd-${seq++}`, source);
          svg = rendered.svg;
        } catch (err) {
          // P6 — a broken diagram is shown as broken, never as blank space.
          svg = `<div class="sr-unknown">Lỗi sơ đồ Mermaid: ${escapeHtml(
            (err as Error).message,
          )}</div>`;
        }
        cache.set(key, svg);
      }
      target.innerHTML = svg;
    }
    out.push(host.innerHTML);
  }
  host.remove();
  return out;
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
