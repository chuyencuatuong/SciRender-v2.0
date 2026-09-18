export type DiagramStudioCurve = 'linear' | 'basis' | 'step';
export type DiagramStudioTheme = 'academic' | 'obsidian' | 'blueprint';

export interface DiagramPreset {
  id: string;
  label: string;
  hint: string;
  source: string;
}

export const DIAGRAM_PRESETS: DiagramPreset[] = [
  {
    id: 'org',
    label: 'Sơ đồ tổ chức',
    hint: 'Đại hội đồng → HĐQT → Ban điều hành → phòng ban',
    source: `flowchart TB\n  A[Đại hội đồng cổ đông] --> B[HĐQT]\n  B --> C[Ban điều hành]\n  C --> D[Phòng Kỹ thuật]\n  C --> E[Phòng Tài chính]\n  C --> F[Phòng Vận hành]`,
  },
  {
    id: 'flowchart',
    label: 'Lưu đồ thuật toán',
    hint: 'Bắt đầu → Nhập → Điều kiện → Xử lý → Kết thúc',
    source: `flowchart TD\n  A([Bắt đầu]) --> B[/Nhập dữ liệu/]\n  B --> C{Điều kiện?}\n  C -- Có --> D[Hiển thị kết quả]\n  C -- Không --> E[Xử lý lại]\n  E --> B\n  D --> F([Kết thúc])`,
  },
  {
    id: 'system',
    label: 'Sơ đồ khối hệ thống',
    hint: 'Vi điều khiển · cảm biến · nguồn · bus',
    source: `flowchart LR\n  P[Mạch nguồn] --> M[Vi điều khiển]\n  S[Cảm biến] -->|Dữ liệu| M\n  M -->|Lệnh| A[Cơ cấu chấp hành]\n  M <-->|SPI / I2C / UART| B[Bus giao tiếp]`,
  },
  {
    id: 'mindmap',
    label: 'Sơ đồ tư duy',
    hint: 'Chủ đề trung tâm và các nhánh ý tưởng',
    source: `mindmap\n  root((Đề tài))\n    Cơ sở lý thuyết\n      Khái niệm\n      Mô hình\n    Phương pháp\n      Thiết kế\n      Thí nghiệm\n    Kết quả\n      Số liệu\n      Phân tích`,
  },
];

let renderSeq = 0;
let mermaidLoader: Promise<typeof import('mermaid').default> | null = null;
let configuredKey = '';
const MAX_RENDER_CACHE = 64;
const renderCache = new Map<string, string>();

const THEME_VARS: Record<DiagramStudioTheme, Record<string, string>> = {
  academic: {
    primaryColor: '#eff6ff',
    primaryBorderColor: '#1d4ed8',
    primaryTextColor: '#0f172a',
    lineColor: '#dc2626',
    textColor: '#0f172a',
    mainBkg: '#ffffff',
    nodeBorder: '#1d4ed8',
    clusterBkg: '#f8fafc',
    clusterBorder: '#1e3a8a',
    edgeLabelBackground: '#ffffff',
  },
  obsidian: {
    primaryColor: '#161922',
    primaryBorderColor: '#38bdf8',
    primaryTextColor: '#f8fafc',
    lineColor: '#94a3b8',
    textColor: '#f8fafc',
    mainBkg: '#161922',
    nodeBorder: '#38bdf8',
    clusterBkg: '#0e1017',
    clusterBorder: '#475569',
    edgeLabelBackground: '#161922',
  },
  blueprint: {
    primaryColor: '#dbeafe',
    primaryBorderColor: '#1d4ed8',
    primaryTextColor: '#0f172a',
    lineColor: '#1d4ed8',
    textColor: '#0f172a',
    mainBkg: '#eff6ff',
    nodeBorder: '#1d4ed8',
    clusterBkg: '#e0f2fe',
    clusterBorder: '#2563eb',
    edgeLabelBackground: '#eff6ff',
  },
};

export async function renderDiagramSvg(
  source: string,
  options: { curve?: DiagramStudioCurve; theme?: DiagramStudioTheme; direction?: 'TB' | 'TD' | 'BT' | 'LR' | 'RL'; fontFamily?: string; nodeSpacing?: number; rankSpacing?: number } = {},
): Promise<string> {
  if (!mermaidLoader) mermaidLoader = import('mermaid').then((m) => m.default);
  const mermaid = await mermaidLoader;
  const curve = options.curve ?? 'basis';
  const theme = options.theme ?? 'academic';
  const direction = options.direction;
  const directedSource = direction ? applyDirection(source, direction) : source;
  const fontFamily = '"Times New Roman", Times, serif';
  const tv = THEME_VARS[theme];
  const nodeSpacing = options.nodeSpacing ?? 32;
  const rankSpacing = options.rankSpacing ?? 36;
  const configKey = JSON.stringify([curve, theme, nodeSpacing, rankSpacing]);
  if (configuredKey !== configKey) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily,
      themeVariables: { fontFamily, fontSize: '13px', ...tv },
      flowchart: { htmlLabels: false, useMaxWidth: true, curve, nodeSpacing, rankSpacing, padding: 10 },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
    });
    configuredKey = configKey;
    renderCache.clear();
  }
  const cacheKey = `${configuredKey}:${hash(directedSource)}`;
  const hit = renderCache.get(cacheKey);
  if (hit) return hit;
  const id = `sr-studio-${renderSeq++}`;
  const svg = (await mermaid.render(id, directedSource)).svg;
  const root = /<svg\b[^>]*>/i.exec(svg);
  if (!root) return svg;
  const css = `<style>text, tspan, .nodeLabel, .edgeLabel, foreignObject, foreignObject * { font-family: \"Times New Roman\", Times, serif !important; }</style>`;
  const value = svg.slice(0, (root.index ?? 0) + root[0].length) + css + svg.slice((root.index ?? 0) + root[0].length);
  renderCache.set(cacheKey, value);
  if (renderCache.size > MAX_RENDER_CACHE) {
    const oldest = renderCache.keys().next().value as string | undefined;
    if (oldest) renderCache.delete(oldest);
  }
  return value;
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Applies the editor viewpoint to the saved SVG by narrowing its viewBox. */
export function applyDiagramViewport(svg: string, panXPercent: number, panYPercent: number, zoom: number): string {
  const root = /<svg\b[^>]*>/i.exec(svg);
  if (!root) return svg;
  const tag = root[0];
  const vb = /\bviewBox="([^"]+)"/i.exec(tag);
  if (!vb) return svg;
  const viewBox = vb[1];
  if (!viewBox) return svg;
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length < 4) return svg;
  const x = parts[0] as number;
  const y = parts[1] as number;
  const w = parts[2] as number;
  const h = parts[3] as number;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return svg;
  const z = Math.max(0.25, Math.min(2.5, zoom));
  const viewW = w / z;
  const viewH = h / z;
  const centerX = x + w / 2 - (panXPercent / 100) * w;
  const centerY = y + h / 2 - (panYPercent / 100) * h;
  const nextX = centerX - viewW / 2;
  const nextY = centerY - viewH / 2;
  const next = `${nextX} ${nextY} ${viewW} ${viewH}`;
  const rebuilt = tag.replace(/\bviewBox="[^"]+"/i, `viewBox="${next}"`);
  return svg.slice(0, root.index) + rebuilt + svg.slice(root.index + tag.length);
}


function applyDirection(source: string, direction: string): string {
  const re = /^(\s*)(flowchart|graph)([ \t]+)(TB|TD|BT|RL|LR)\b/;
  if (re.test(source)) return source.replace(re, `$1$2$3${direction}`);
  if (/^\s*(flowchart|graph)\b/.test(source)) return source.replace(/^(\s*)(flowchart|graph)\b/, `$1$2 ${direction}`);
  return source;
}

