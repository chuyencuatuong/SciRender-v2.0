export type ChartKind = 'scatter' | 'line' | 'bar';
export type RegressionKind = 'none' | 'linear' | 'quadratic';

export interface NumericChartPoint {
  x: number;
  y: number;
}

export interface BarChartPoint {
  label: string;
  y: number;
}

export interface SvgChartOptions {
  kind: ChartKind;
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  title?: string;
  showGrid?: boolean;
  showRegression?: boolean;
  regressionEquation?: string;
  r2?: number;
  regressionPredict?: (x: number) => number;
  points?: NumericChartPoint[];
  bars?: BarChartPoint[];
}

const COLORS = {
  ink: '#111827',
  mid: '#4b5563',
  grid: '#d1d5db',
  accent: '#2563eb',
  regression: '#b42318',
  paper: '#ffffff',
};

export function renderChartSvg(options: SvgChartOptions): string {
  const width = Math.max(520, Math.round(options.width ?? 760));
  const height = Math.max(320, Math.round(options.height ?? 460));
  const margin = { top: options.title ? 48 : 28, right: 28, bottom: 68, left: 74 };
  const plot = {
    x: margin.left,
    y: margin.top,
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom,
  };
  const title = options.title?.trim();
  const xLabel = options.xLabel?.trim() ?? '';
  const yLabel = options.yLabel?.trim() ?? '';

  if (options.kind === 'bar') {
    return renderBarChart(options, width, height, margin, plot, title, xLabel, yLabel);
  }

  const points = options.points ?? [];
  if (!points.length) return emptySvg(width, height, 'Không có dữ liệu số để vẽ.');

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xRange = niceRange(Math.min(...xs), Math.max(...xs));
  const regressionSamples =
    options.showRegression && options.regressionPredict
      ? sampleRegressionPath(xRange.min, xRange.max, options.regressionPredict, 100)
      : [];
  const scaledY = regressionSamples.map((p) => p.y).filter(Number.isFinite);
  const allY = scaledY.length ? [...ys, ...scaledY] : ys;
  const yRange = niceRange(Math.min(...allY), Math.max(...allY));
  const xTicks = ticks(xRange.min, xRange.max, xRange.step);
  const yTicks = ticks(yRange.min, yRange.max, yRange.step);
  const sx = (x: number): number => plot.x + ((x - xRange.min) / (xRange.max - xRange.min || 1)) * plot.w;
  const sy = (y: number): number => plot.y + plot.h - ((y - yRange.min) / (yRange.max - yRange.min || 1)) * plot.h;

  const parts: string[] = [svgOpen(width, height), background(), titleText(title, width)];
  if (options.showGrid !== false) parts.push(gridLines(xTicks, yTicks, sx, sy, plot));
  parts.push(axis(plot), tickLabels(xTicks, yTicks, sx, sy, plot), axisLabels(xLabel, yLabel, width, height, plot));

  if (options.kind === 'line') {
    const ordered = [...points].sort((a, b) => a.x - b.x);
    parts.push(`<path d="${polylinePath(ordered, sx, sy)}" fill="none" stroke="${COLORS.accent}" stroke-width="2"/>`);
  }

  parts.push(
    points
      .map((p) => `<circle cx="${fmt(sx(p.x))}" cy="${fmt(sy(p.y))}" r="4" fill="${COLORS.accent}"/>`)
      .join(''),
  );

  if (options.showRegression && options.regressionPredict) {
    const samples = regressionSamples.length
      ? regressionSamples
      : sampleRegressionPath(xRange.min, xRange.max, options.regressionPredict, 100);
    const path = polylinePath(samples, sx, sy);
    if (path) {
      parts.push(
        `<path d="${path}" fill="none" stroke="${COLORS.regression}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`,
      );
    }
    parts.push(annotation(options.regressionEquation, options.r2, plot));
  }

  parts.push('</svg>');
  return parts.join('');
}

function renderBarChart(
  options: SvgChartOptions,
  width: number,
  height: number,
  _margin: { top: number; right: number; bottom: number; left: number },
  plot: { x: number; y: number; w: number; h: number },
  title: string | undefined,
  xLabel: string,
  yLabel: string,
): string {
  const bars = (options.bars ?? []).filter((b) => Number.isFinite(b.y));
  if (!bars.length) return emptySvg(width, height, 'Không có dữ liệu số để vẽ.');
  const yMin = Math.min(0, ...bars.map((b) => b.y));
  const yMax = Math.max(0, ...bars.map((b) => b.y));
  const yRange = niceRange(yMin, yMax);
  const yTicks = ticks(yRange.min, yRange.max, yRange.step);
  const sy = (y: number): number => plot.y + plot.h - ((y - yRange.min) / (yRange.max - yRange.min || 1)) * plot.h;
  const zeroY = sy(0);
  const slot = plot.w / bars.length;
  const barW = Math.min(56, Math.max(8, slot * 0.64));
  const parts: string[] = [svgOpen(width, height), background(), titleText(title, width)];
  if (options.showGrid !== false) {
    parts.push(
      yTicks
        .map((v) => `<line x1="${fmt(plot.x)}" x2="${fmt(plot.x + plot.w)}" y1="${fmt(sy(v))}" y2="${fmt(sy(v))}" stroke="${COLORS.grid}" stroke-width="0.7"/>`)
        .join(''),
    );
  }
  parts.push(axis(plot), tickLabelsBar(yTicks, sy, plot));
  parts.push(
    bars
      .map((bar, i) => {
        const x = plot.x + slot * i + (slot - barW) / 2;
        const y = Math.min(sy(bar.y), zeroY);
        const h = Math.abs(sy(bar.y) - zeroY);
        return [
          `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(barW)}" height="${fmt(Math.max(0.5, h))}" rx="1.5" fill="${COLORS.accent}"/>`,
          `<text x="${fmt(x + barW / 2)}" y="${fmt(plot.y + plot.h + 20)}" text-anchor="middle" font-size="10" fill="${COLORS.mid}">${escapeXml(trimLabel(bar.label, 15))}</text>`,
        ].join('');
      })
      .join(''),
  );
  parts.push(axisLabels(xLabel, yLabel, width, height, plot));
  parts.push('</svg>');
  return parts.join('');
}

function svgOpen(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ khoa học"><title>Biểu đồ SciRender</title>`;
}

function background(): string {
  return `<rect x="0" y="0" width="100%" height="100%" fill="${COLORS.paper}"/>`;
}

function axis(plot: { x: number; y: number; w: number; h: number }): string {
  return [
    `<line x1="${fmt(plot.x)}" y1="${fmt(plot.y + plot.h)}" x2="${fmt(plot.x + plot.w)}" y2="${fmt(plot.y + plot.h)}" stroke="${COLORS.ink}" stroke-width="1.2"/>`,
    `<line x1="${fmt(plot.x)}" y1="${fmt(plot.y)}" x2="${fmt(plot.x)}" y2="${fmt(plot.y + plot.h)}" stroke="${COLORS.ink}" stroke-width="1.2"/>`,
  ].join('');
}

function gridLines(
  xTicks: number[],
  yTicks: number[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  plot: { x: number; y: number; w: number; h: number },
): string {
  const vertical = xTicks
    .map((v) => `<line x1="${fmt(sx(v))}" x2="${fmt(sx(v))}" y1="${fmt(plot.y)}" y2="${fmt(plot.y + plot.h)}" stroke="${COLORS.grid}" stroke-width="0.65"/>`)
    .join('');
  const horizontal = yTicks
    .map((v) => `<line x1="${fmt(plot.x)}" x2="${fmt(plot.x + plot.w)}" y1="${fmt(sy(v))}" y2="${fmt(sy(v))}" stroke="${COLORS.grid}" stroke-width="0.65"/>`)
    .join('');
  return vertical + horizontal;
}

function tickLabels(
  xTicks: number[],
  yTicks: number[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  plot: { x: number; y: number; w: number; h: number },
): string {
  const x = xTicks.map((v) => `<text x="${fmt(sx(v))}" y="${fmt(plot.y + plot.h + 20)}" text-anchor="middle" font-size="10" fill="${COLORS.mid}">${escapeXml(formatTick(v))}</text>`).join('');
  const y = yTicks.map((v) => `<text x="${fmt(plot.x - 10)}" y="${fmt(sy(v) + 3)}" text-anchor="end" font-size="10" fill="${COLORS.mid}">${escapeXml(formatTick(v))}</text>`).join('');
  return x + y;
}

function tickLabelsBar(yTicks: number[], sy: (y: number) => number, plot: { x: number; y: number; w: number; h: number }): string {
  return yTicks.map((v) => `<text x="${fmt(plot.x - 10)}" y="${fmt(sy(v) + 3)}" text-anchor="end" font-size="10" fill="${COLORS.mid}">${escapeXml(formatTick(v))}</text>`).join('');
}

function axisLabels(
  xLabel: string,
  yLabel: string,
  width: number,
  height: number,
  plot: { x: number; y: number; w: number; h: number },
): string {
  const x = xLabel ? `<text x="${fmt(plot.x + plot.w / 2)}" y="${height - 18}" text-anchor="middle" font-size="11" font-weight="600" fill="${COLORS.ink}">${escapeXml(xLabel)}</text>` : '';
  const y = yLabel ? `<text x="18" y="${fmt(plot.y + plot.h / 2)}" transform="rotate(-90 18 ${fmt(plot.y + plot.h / 2)})" text-anchor="middle" font-size="11" font-weight="600" fill="${COLORS.ink}">${escapeXml(yLabel)}</text>` : '';
  return x + y;
}

function titleText(title: string | undefined, width: number): string {
  return title ? `<text x="${fmt(width / 2)}" y="23" text-anchor="middle" font-size="14" font-weight="700" fill="${COLORS.ink}">${escapeXml(title)}</text>` : '';
}

function annotation(equation: string | undefined, r2: number | undefined, plot: { x: number; y: number; w: number; h: number }): string {
  if (!equation && r2 == null) return '';
  const lines = [equation ?? '', r2 == null ? '' : `R² = ${formatTick(r2)}`].filter(Boolean);
  return `<g transform="translate(${fmt(plot.x + plot.w - 150)},${fmt(plot.y + 12)})"><rect width="142" height="${26 + lines.length * 15}" rx="6" fill="#ffffff" stroke="${COLORS.grid}"/><text x="10" y="20" font-size="10.5" fill="${COLORS.ink}">${lines.map((line, i) => `<tspan x="10" dy="${i === 0 ? 0 : 15}">${escapeXml(line)}</tspan>`).join('')}</text></g>`;
}

function sampleRegressionPath(
  xMin: number,
  xMax: number,
  predict: (x: number) => number,
  samples: number,
): NumericChartPoint[] {
  const count = Math.max(50, Math.floor(samples));
  const span = xMax - xMin;
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !Number.isFinite(span)) return [];
  if (span === 0) {
    const y = predict(xMin);
    return Number.isFinite(y) ? [{ x: xMin, y }] : [];
  }
  const out: NumericChartPoint[] = [];
  for (let i = 0; i < count; i++) {
    const x = xMin + (span * i) / (count - 1);
    const y = predict(x);
    if (Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

function polylinePath(points: NumericChartPoint[], sx: (x: number) => number, sy: (y: number) => number): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${fmt(sx(p.x))},${fmt(sy(p.y))}`).join(' ');
}

function emptySvg(width: number, height: number, message: string): string {
  return `${svgOpen(width, height)}${background()}<text x="${fmt(width / 2)}" y="${fmt(height / 2)}" text-anchor="middle" font-size="13" fill="${COLORS.mid}">${escapeXml(message)}</text></svg>`;
}

function niceRange(min: number, max: number): { min: number; max: number; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 0.2 };
  if (min === max) {
    const pad = Math.abs(min || 1) * 0.5;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / 6;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep || 1));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const start = Math.ceil((min - 1e-10) / step) * step;
  for (let v = start, i = 0; v <= max + step * 0.25 && i < 24; v += step, i++) out.push(Number(v.toPrecision(12)));
  return out;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(2);
  return String(Number(value.toFixed(6)));
}

function fmt(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function trimLabel(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Safe local data URI for transient preview/test use. New generated charts are
 * persisted through the document AssetMap instead of putting this URI in Markdown.
 * @deprecated Keep for backwards compatibility and callers that explicitly need a data URI.
 */
export function svgDataUri(svg: string): string {
  // Encode parentheses as well: the block-level Markdown image parser treats
  // the first unescaped `)` as the end of the URL. Percent-encoding keeps the
  // generated SVG a valid data URI while preserving the existing Figure parser.
  const encoded = encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}
