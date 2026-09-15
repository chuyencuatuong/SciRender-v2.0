import type { TemplateDescriptor } from '@scirender/template-engine';

let loader: Promise<typeof import('mermaid').default> | null = null;
let seq = 0;
const cache = new Map<string, string>();
let configuredKey = '';

export interface DiagramFitMetrics {
  contentWidthPx: number;
  contentHeightPx: number;
}

export interface DiagramWarning {
  code: string;
  message: string;
  nodeId: string | null;
  line: number | null;
}

export interface MermaidResult {
  blocks: string[];
  warnings: DiagramWarning[];
}

/**
 * Mermaid is heavy (~2MB), so it is only fetched the first time a document
 * actually contains a diagram. It ships with the app — nothing is downloaded
 * from the network at runtime (P5).
 */
async function getMermaid(t: TemplateDescriptor): Promise<typeof import('mermaid').default> {
  if (!loader) loader = import('mermaid').then((m) => m.default);
  const mermaid = await loader;
  const d = t.diagrams;
  const fontFamily = d.fontFamily === 'body' ? t.typography.bodyFont : t.typography.headingFont;
  const key = JSON.stringify([
    fontFamily, d.fontSize, d.curve, d.nodeSpacing, d.rankSpacing,
    d.wrappingWidth, t.colors.text, t.colors.rule,
  ]);
  if (key !== configuredKey) {
    // Diagram labels must read as part of the document, not as a foreign
    // widget: same family and size as body text, same ink colour.
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily,
      themeVariables: {
        fontFamily,
        fontSize: d.fontSize,
        primaryColor: '#ffffff',
        primaryBorderColor: t.colors.rule,
        primaryTextColor: t.colors.text,
        lineColor: t.colors.text,
        textColor: t.colors.text,
        mainBkg: '#ffffff',
        nodeBorder: t.colors.rule,
        clusterBkg: '#ffffff',
        clusterBorder: t.colors.rule,
        edgeLabelBackground: '#ffffff',
      },
      flowchart: {
        htmlLabels: false,
        useMaxWidth: true,
        curve: d.curve,
        nodeSpacing: d.nodeSpacing,
        rankSpacing: d.rankSpacing,
        padding: 10,
        wrappingWidth: d.wrappingWidth,
      },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
    });
    configuredKey = key;
    cache.clear();
  }
  return mermaid;
}

export function hasMermaid(blocks: string[]): boolean {
  return blocks.some((b) => b.includes('data-sr-mermaid='));
}

const DIRECTION_RE = /^(\s*)(flowchart|graph)([ \t]+)(TB|TD|BT|RL|LR)\b/;

function currentDirection(source: string): string | null {
  const m = DIRECTION_RE.exec(source);
  return m ? (m[4] as string) : null;
}

function perpendicular(dir: string): string {
  return dir === 'TB' || dir === 'TD' || dir === 'BT' ? 'LR' : 'TB';
}

function withDirection(source: string, dir: string): string {
  return source.replace(DIRECTION_RE, `$1$2$3${dir}`);
}

interface Natural {
  width: number;
  height: number;
}

/** Intrinsic drawing size, read from the SVG's own viewBox. */
function naturalSize(svg: string): Natural | null {
  const m = /viewBox="([^"]+)"/.exec(svg);
  if (!m) return null;
  const parts = (m[1] as string).trim().split(/[\s,]+/).map(Number);
  const w = parts[2];
  const h = parts[3];
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { width: w, height: h };
}

function fitScale(size: Natural, maxW: number, maxH: number): number {
  return Math.min(1, maxW / size.width, maxH / size.height);
}

/**
 * Gives the SVG an explicit, already-fitted size.
 *
 * Mermaid's own `useMaxWidth` only constrains width, so a tall flowchart keeps
 * its full height and overflows the page. Here the drawing is scaled to fit the
 * text block in *both* directions before the layout engine ever measures it —
 * which is what makes the page break land where it should.
 */
function applyFittedSize(svg: string, size: Natural, scale: number): string {
  const w = Math.round(size.width * scale);
  const h = Math.round(size.height * scale);
  // Only the ROOT <svg> tag may be touched. Stripping width/height across the
  // whole string also emptied every <rect> and <foreignObject> inside, which
  // made node boxes and labels collapse to 0x0 — the arrows were all that was
  // left on the page.
  const open = /<svg\b[^>]*>/.exec(svg);
  if (!open) return svg;
  const tag = open[0];
  const attrs = tag
    .slice(4, tag.endsWith('/>') ? -2 : -1)
    .replace(/\s(?:width|height|style)="[^"]*"/g, '');
  const rebuilt = `<svg${attrs} width="${w}" height="${h}" style="max-width:100%">`;
  return svg.slice(0, open.index) + rebuilt + svg.slice(open.index + tag.length);
}

/**
 * Replaces every mermaid placeholder with its rendered SVG *before* the layout
 * engine measures anything (P2), fitting each drawing to the text block.
 *
 * When the author did not pin a direction, the perpendicular layout is rendered
 * too and whichever fits at a larger scale wins — a wide flowchart becomes a
 * tall one automatically instead of shrinking its labels into illegibility.
 */
export async function resolveMermaidBlocks(
  blocks: string[],
  template: TemplateDescriptor,
  metrics: DiagramFitMetrics,
): Promise<MermaidResult> {
  if (!hasMermaid(blocks)) return { blocks, warnings: [] };
  const mermaid = await getMermaid(template);
  const host = document.createElement('div');
  const warnings: DiagramWarning[] = [];

  // Leave room for the caption line and a little breathing space.
  const maxW = metrics.contentWidthPx;
  const maxH = metrics.contentHeightPx * 0.86;

  const renderOnce = async (source: string): Promise<string> => {
    const key = `${configuredKey.length}:${hash(source)}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let svg: string;
    try {
      svg = (await mermaid.render(`sr-mmd-${seq++}`, source)).svg;
    } catch (err) {
      // P6 — a broken diagram is shown as broken, never as blank space.
      svg = `<div class="sr-unknown">Lỗi sơ đồ Mermaid: ${escapeHtml((err as Error).message)}</div>`;
    }
    cache.set(key, svg);
    return svg;
  };

  const out: string[] = [];
  for (const block of blocks) {
    if (!block.includes('data-sr-mermaid=')) {
      out.push(block);
      continue;
    }
    host.innerHTML = block;
    const container = host.querySelector('[data-sr-id]');
    const nodeId = container?.getAttribute('data-sr-id') ?? null;
    const line = Number(container?.getAttribute('data-sr-line')) || null;

    for (const target of Array.from(host.querySelectorAll<HTMLElement>('.sr-mermaid[data-sr-mermaid]'))) {
      const source = target.getAttribute('data-sr-mermaid') ?? '';
      const auto = target.getAttribute('data-sr-mermaid-auto') === '1';
      target.removeAttribute('data-sr-mermaid');
      target.removeAttribute('data-sr-mermaid-auto');
      if (!source.trim()) continue;

      let svg = await renderOnce(source);
      let size = naturalSize(svg);
      let scale = size ? fitScale(size, maxW, maxH) : 1;
      let chosen = currentDirection(source);

      if (auto && size && scale < 1 && chosen) {
        const altDir = perpendicular(chosen);
        const altSource = withDirection(source, altDir);
        const altSvg = await renderOnce(altSource);
        const altSize = naturalSize(altSvg);
        if (altSize) {
          const altScale = fitScale(altSize, maxW, maxH);
          if (altScale > scale + 0.01) {
            svg = altSvg;
            size = altSize;
            scale = altScale;
            chosen = altDir;
          }
        }
      }

      if (size) svg = applyFittedSize(svg, size, scale);
      target.innerHTML = svg;

      if (size && scale < template.diagrams.minScale) {
        warnings.push({
          code: 'SR-L003',
          message:
            `Sơ đồ phải thu còn ${Math.round(scale * 100)}% mới vừa trang nên chữ sẽ khó đọc. ` +
            'Hãy tách bớt nhánh, hoặc ép chiều bằng dir=TB / dir=LR trong dòng chú thích.',
          nodeId,
          line,
        });
      }
    }
    out.push(host.innerHTML);
  }
  host.remove();
  return { blocks: out, warnings };
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
