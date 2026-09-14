/** CSS absolute-length conversion at the CSS reference resolution of 96dpi. */
const PX_PER_UNIT: Record<string, number> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 25.4 / 4,
};

/**
 * Converts an absolute CSS length to px. Deterministic and side-effect free —
 * the layout engine must never read computed styles to learn page geometry (P2).
 * Relative units (em/rem/%) are rejected: they would make page size depend on
 * cascade order.
 */
export function toPx(value: string, fallback = 0): number {
  const m = /^\s*(-?\d*\.?\d+)\s*([a-zA-Z]*)\s*$/.exec(value);
  if (!m) return fallback;
  const n = parseFloat(m[1] as string);
  const unit = (m[2] ?? 'px').toLowerCase();
  if (!unit) return n;
  const factor = PX_PER_UNIT[unit];
  if (factor === undefined) return fallback;
  return round(n * factor);
}

/** 3 decimal places — enough for sub-pixel layout, stable across runs. */
export function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
