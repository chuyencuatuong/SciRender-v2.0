import katex from 'katex';

export type NumberStyle = 'continuous' | 'section';
export type EquationNumbering = 'all' | 'labelled' | 'none';

export interface MathRenderResult {
  html: string;
  ok: boolean;
  error?: string;
}

const CACHE = new Map<string, MathRenderResult>();

/**
 * KaTeX wrapper.
 *
 * P6 — Fail Loudly: a TeX error is surfaced as a visible, styled error box and
 * an `ok: false` result. It is never swallowed and never silently "fixed".
 * P2 — Deterministic: the result depends only on (tex, displayMode); results
 * are memoised so re-renders of an unchanged document produce identical HTML.
 */
export function renderMath(tex: string, displayMode: boolean): MathRenderResult {
  const key = (displayMode ? 'D>' : 'I>') + tex;
  const hit = CACHE.get(key);
  if (hit) return hit;

  let result: MathRenderResult;
  try {
    const html = katex.renderToString(tex, {
      displayMode,
      throwOnError: true,
      strict: false,
      output: 'html',
      trust: false,
      macros: {},
    });
    result = { html, ok: true };
  } catch (err) {
    const message = (err as Error).message ?? 'Lỗi biên dịch công thức';
    result = {
      ok: false,
      error: message,
      html:
        '<span class="sr-math-error" title="' +
        escapeAttr(message) +
        '">' +
        escapeHtml(displayMode ? '$$' + tex + '$$' : '$' + tex + '$') +
        '</span>',
    };
  }
  if (CACHE.size > 4000) CACHE.clear();
  CACHE.set(key, result);
  return result;
}

/** Validation only — used by the validator so it does not have to build HTML. */
export function checkMath(tex: string, displayMode: boolean): { ok: boolean; error?: string } {
  const r = renderMath(tex, displayMode);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'unknown' };
}

export function formatEquationNumber(
  counter: number,
  style: NumberStyle,
  sectionPrefix: string,
): string {
  if (style === 'section' && sectionPrefix) return `${sectionPrefix}.${counter}`;
  return String(counter);
}

export function wrapEquationNumber(num: string): string {
  return `(${num})`;
}

export function clearMathCache(): void {
  CACHE.clear();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
