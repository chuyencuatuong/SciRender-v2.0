/**
 * Neutralises template values before they are interpolated into a stylesheet.
 *
 * ## The hole this closes
 *
 * A `TemplateDescriptor` is mostly strings: font stacks, lengths, colours,
 * caption words. `compileCss()` drops them straight into CSS text
 * (`--sr-body-font:${ty.bodyFont};` and ~60 more sites). Those strings are not
 * all authored by the person exporting the document:
 *
 *   1. `importBundle()` (packages/storage) takes `bundle.document.overrides`
 *      verbatim out of a `.srbundle` file — a file that travels between people,
 *      exactly like the document itself.
 *   2. `mergeTemplate()` merges it over the base template.
 *   3. `compileCss()` interpolates it.
 *   4. `exportStandaloneHtml()` (packages/renderer-pdf) embeds the result as
 *      `<style>${template.css}</style>` inside a **raw HTML string**.
 *
 * At step 4 a value of `serif}</style><img src=x onerror=...>` stops being a
 * font stack and becomes markup: `</style>` terminates the element and the rest
 * is parsed as HTML. The payload then runs in whoever opens the shared `.html`
 * file — Stored XSS — and, more sharply, inside `pdf-server`'s headless
 * Chromium, which loads the same HTML with `waitUntil: 'networkidle'` and so
 * politely waits for the attacker's requests to finish.
 *
 * The live preview was never exposed: `applyTemplateCss` assigns
 * `style.textContent`, and `textContent` does not parse markup. That is why the
 * defect could sit here unnoticed — it only appears on the export path, which
 * is precisely the path a document takes when it is shared.
 *
 * ## The rule
 *
 * Sanitising at 60 interpolation sites is a defect waiting to happen; the 61st
 * gets forgotten. This sanitises the descriptor once, where every override is
 * merged, so `compileCss` can keep interpolating freely and any future
 * interpolation is covered by construction.
 *
 * Nothing legitimate is lost. No template value needs `<`, `>`, `{`, `}`, `;`,
 * `@`, a backslash or a CSS comment marker: font stacks need quotes and commas
 * (kept), lengths need digits and units, colours need `#`, `rgb(` and `%`.
 * `url(` and `expression(` are dropped as well — a descriptor has no business
 * fetching anything, and allowing it would re-open the P5 (local-first)
 * guarantee from a different direction.
 */

/** Characters that let a value escape its declaration, its rule, or the <style> element. */
const CSS_BREAKOUT = /[<>{}\\;@]/g;
const CSS_COMMENT = /\/\*|\*\//g;
/** Functional notations that can make CSS reach the network. */
const CSS_FETCHERS = /\b(?:url|expression|image-set|-moz-binding|element)\s*\(/gi;

/** Cleans a single value destined for a CSS declaration. */
export function sanitizeCssValue(value: string): string {
  return value
    .replace(CSS_COMMENT, ' ')
    .replace(CSS_FETCHERS, ' ')
    .replace(CSS_BREAKOUT, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Returns true when `sanitizeCssValue` would change the string — i.e. the value
 * carried something that does not belong in a stylesheet. Callers use it to
 * report the rejection instead of silently repairing it (P6).
 */
export function isUnsafeCssValue(value: string): boolean {
  return sanitizeCssValue(value) !== value.trim();
}

/**
 * Deep-cleans every string leaf of a template descriptor (or a partial
 * override). Numbers, booleans, null and undefined pass through untouched;
 * arrays and nested objects are walked.
 *
 * Returns a new structure — the input is never mutated, so a caller can still
 * diff the two to see whether anything was stripped.
 */
export function sanitizeTemplateStrings<T>(input: T): T {
  if (typeof input === 'string') return sanitizeCssValue(input) as unknown as T;
  if (Array.isArray(input)) return input.map((v) => sanitizeTemplateStrings(v)) as unknown as T;
  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = sanitizeTemplateStrings(value);
    }
    return out as unknown as T;
  }
  return input;
}
