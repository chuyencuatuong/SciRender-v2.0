import { compileCss, compilePrintCss } from './css.js';
import {
  BUILTIN_TEMPLATES,
  findTemplate,
  HCMUT_BTL,
  IEEE_LIKE,
  SCIENTIFIC_STANDARD,
} from './templates.js';
import type {
  PageNumberStyle,
  ResolvedTemplate,
  TemplateDescriptor,
  TemplateOverrides,
} from './types.js';
import { round, toPx } from './units.js';

/**
 * Applies user overrides on top of a base template and derives every metric the
 * layout engine needs. Pure: same (template, overrides) always yields the same
 * ResolvedTemplate, which is what makes pagination reproducible (P2).
 */
export function resolveTemplate(
  base: TemplateDescriptor,
  overrides: TemplateOverrides = {},
): ResolvedTemplate {
  const descriptor = mergeTemplate(base, overrides);
  const p = descriptor.page;
  const pageWidthPx = toPx(p.width, 793.7);
  const pageHeightPx = toPx(p.height, 1122.5);
  const marginTopPx = toPx(p.margin.top);
  const marginRightPx = toPx(p.margin.right);
  const marginBottomPx = toPx(p.margin.bottom);
  const marginLeftPx = toPx(p.margin.left);
  const bodySizePx = toPx(descriptor.typography.bodySize, 17.333);

  return {
    descriptor,
    metrics: {
      pageWidthPx,
      pageHeightPx,
      marginTopPx,
      marginRightPx,
      marginBottomPx,
      marginLeftPx,
      contentWidthPx: round(pageWidthPx - marginLeftPx - marginRightPx),
      contentHeightPx: round(pageHeightPx - marginTopPx - marginBottomPx),
      bodySizePx,
      lineHeightPx: round(bodySizePx * descriptor.typography.lineHeight),
    },
    css: compileCss(descriptor),
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One-level-deep merge — matches the shape of TemplateOverrides. */
export function mergeTemplate(
  base: TemplateDescriptor,
  overrides: TemplateOverrides,
): TemplateDescriptor {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = out[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      const merged = { ...current } as Record<string, unknown>;
      for (const [k2, v2] of Object.entries(value)) {
        if (v2 === undefined) continue;
        const cur2 = merged[k2];
        merged[k2] = isPlainObject(cur2) && isPlainObject(v2) ? { ...cur2, ...v2 } : v2;
      }
      out[key] = merged;
    } else {
      out[key] = value;
    }
  }
  return out as unknown as TemplateDescriptor;
}

export {
  compileCss,
  compilePrintCss,
  BUILTIN_TEMPLATES,
  findTemplate,
  HCMUT_BTL,
  SCIENTIFIC_STANDARD,
  IEEE_LIKE,
  toPx,
  round,
};

const ROMAN: Array<[number, string]> = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

/**
 * Page numbers as the format demands them: the BTL front matter runs i, ii,
 * iii… while the body restarts at 1. Deterministic and allocation-light.
 */
export function formatPageNumber(n: number, style: PageNumberStyle): string {
  if (style === 'none' || n <= 0) return '';
  if (style === 'arabic') return String(n);
  let rest = Math.floor(n);
  let out = '';
  for (const [value, numeral] of ROMAN) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return style === 'roman-upper' ? out.toUpperCase() : out;
}
export * from './types.js';
export { assignNumbers, refWord } from './numbering.js';
export type { NumberingResult } from './numbering.js';
