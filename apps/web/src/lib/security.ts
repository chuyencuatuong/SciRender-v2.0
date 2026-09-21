import DOMPurify from 'dompurify';
import type { Config, UponSanitizeAttributeHookEvent } from 'dompurify';

/**
 * Content Security Policy for the SciRender web client.
 *
 * This policy intentionally does not contain `unsafe-eval`.
 * The CDN hosts are restricted to the Math-related assets that SciRender may
 * load when a CDN-backed Math/KaTeX integration is enabled.
 *
 * For production deployment, prefer sending the same policy as an HTTP
 * Content-Security-Policy response header. A meta tag is still useful as a
 * client-side baseline in a static Vite/GitHub Pages deployment.
 *
 * In apps/web/index.html, place this inside <head>:
 *
 * <meta
 *   http-equiv="Content-Security-Policy"
 *   content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; child-src 'none'; form-action 'self'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' https://cdn.jsdelivr.net https://unpkg.com; style-src-attr 'unsafe-inline'; font-src 'self' data: https://cdn.jsdelivr.net https://unpkg.com; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://unpkg.com; manifest-src 'self'; upgrade-insecure-requests"
 * />
 *
 * Important: frame-ancestors cannot be enforced through a meta tag. Set
 * `frame-ancestors 'none'` in the HTTP response header when the hosting
 * platform allows custom response headers.
 */
export const CSP_DIRECTIVES =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; child-src 'none'; form-action 'self'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' https://cdn.jsdelivr.net https://unpkg.com; style-src-attr 'unsafe-inline'; font-src 'self' data: https://cdn.jsdelivr.net https://unpkg.com; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://unpkg.com; manifest-src 'self'; upgrade-insecure-requests";

const STRICT_HTML_FORBID_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'foreignobject',
  'svg',
  'math',
  'style',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'template',
  'noscript',
];

const MATH_SVG_FORBID_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'foreignobject',
  'style',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'template',
  'noscript',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'mpath',
  'feimage',
];

const SVG_VISUAL_ATTRIBUTES = [
  'viewBox',
  'xmlns',
  'xmlns:xlink',
  'version',
  'preserveAspectRatio',
  'd',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'transform',
  'transform-origin',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'points',
  'pathLength',
  'clip-path',
  'clip-rule',
  'mask',
  'opacity',
  'color',
  'color-interpolation',
  'color-interpolation-filters',
  'color-rendering',
  'flood-color',
  'flood-opacity',
  'lighting-color',
  'marker-end',
  'marker-mid',
  'marker-start',
  'stop-color',
  'stop-opacity',
  'offset',
  'spreadMethod',
  'gradientUnits',
  'gradientTransform',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'viewTarget',
];

const SVG_TAGS_TO_ALLOW = [
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'clipPath',
  'mask',
  'marker',
  'pattern',
  'linearGradient',
  'radialGradient',
  'stop',
  'symbol',
  'use',
];

const MATHML_TAGS_TO_ALLOW = [
  'math',
  'annotation',
  'semantics',
  'mi',
  'mn',
  'mo',
  'mrow',
  'mfrac',
  'msup',
  'msub',
  'msubsup',
  'msqrt',
  'mroot',
  'mstyle',
  'mspace',
  'mtable',
  'mtr',
  'mtd',
  'mtext',
  'mover',
  'munder',
  'munderover',
  'mpadded',
  'mphantom',
  'merror',
  'menclose',
  'mmultiscripts',
];

const MATH_SVG_ADDITIONAL_ATTRIBUTES = [
  ...SVG_VISUAL_ATTRIBUTES,
  'class',
  'id',
  'role',
  'aria-hidden',
  'aria-label',
  'focusable',
  'xlink:href',
  'href',
  'height',
  'width',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-decoration',
  'xml:space',
];

const STRICT_HTML_ADDITIONAL_FORBIDDEN_ATTRIBUTES = [
  'srcdoc',
  'style',
  'formaction',
  'action',
  'http-equiv',
  'content',
];

const MATH_SVG_FORBIDDEN_ATTRIBUTES = [
  'srcdoc',
  'style',
  'formaction',
  'action',
  'http-equiv',
  'content',
  'integrity',
  'crossorigin',
  'nonce',
];

/**
 * `document-render` — added during the DAY-1 integration (21/09/2026).
 *
 * Neither of the two original profiles can be put on the editor's render
 * path without breaking it. Measured in Chromium on the sample BTL document
 * (17 pages): `math-svg` removes all 58 `data-sr-*` attributes the layout
 * engine paginates by, all 168 KaTeX `style` attributes (struts, vlist
 * offsets) and every Mermaid label (6 249 characters of text → 0), because
 * Mermaid draws labels inside `<foreignObject>` and styles itself with an
 * SVG-scoped `<style>`.
 *
 * This profile keeps exactly what the render pipeline emits and nothing
 * script-capable: no `<script>`/`<iframe>`/`<object>`/`<embed>`/forms, no SVG
 * animation (which can rewrite `href` to `javascript:`), no `feImage`, no
 * `on*` handlers, `<use>` limited to local fragments, `<style>` emptied unless
 * it sits inside an `<svg>`, and URLs limited to DOMPurify's safe set plus
 * `blob:` (user images are served from IndexedDB as object URLs).
 * Trade-off, stated plainly: this profile accepts HTML inside
 * `<foreignObject>` (Mermaid labels), which `math-svg` refuses as a
 * namespace-confusion hardening. Removing it would blank every diagram.
 * The `style` attribute is kept: modern browsers do not execute script from
 * CSS, and KaTeX cannot lay out without it.
 */
const DOCUMENT_RENDER_FORBID_TAGS = [
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'template',
  'noscript',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'mpath',
  'feimage',
  'discard',
  'handler',
  'listener',
];

const DOCUMENT_RENDER_FORBIDDEN_ATTRIBUTES = [
  'srcdoc',
  'formaction',
  'action',
  'http-equiv',
  'integrity',
  'crossorigin',
  'nonce',
  'ping',
];

/** DOMPurify's default allow-list with `blob:` added. */
const DOCUMENT_RENDER_URI =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

type SanitizeType = 'strict-html' | 'math-svg' | 'document-render';

type SanitizationAttributeData = Pick<
  UponSanitizeAttributeHookEvent,
  'attrName' | 'attrValue' | 'keepAttr'
>;

/**
 * Blocks every inline event handler regardless of whether a new browser event
 * attribute is added in the future. DOMPurify's own allow-list already drops
 * unknown `on*` attributes; this hook makes that invariant explicit.
 */
function removeInlineEventAttributes(
  _currentNode: Element,
  data: SanitizationAttributeData,
): void {
  if (/^on[a-z0-9_-]+$/i.test(data.attrName)) {
    data.keepAttr = false;
  }
}

/**
 * SVG references must stay inside the sanitized document. External hrefs are
 * unnecessary for SciRender's generated mathematical/chart SVG and would
 * expand the resource-loading surface.
 */
function restrictSvgReferences(
  currentNode: Element,
  data: SanitizationAttributeData,
): void {
  const tagName = currentNode.tagName.toLowerCase();
  const attributeName = data.attrName.toLowerCase();

  if (
    tagName === 'use' &&
    (attributeName === 'href' || attributeName === 'xlink:href') &&
    !/^#[a-zA-Z_][\w:.-]*$/.test(data.attrValue.trim())
  ) {
    data.keepAttr = false;
  }
}

/**
 * A `<style>` element is only legitimate in rendered output as Mermaid's
 * SVG-scoped stylesheet. Anywhere else it is emptied (not removed, so the
 * sanitizer's own tree walk is never disturbed).
 */
function confineStyleElementsToSvg(currentNode: Node): void {
  if (currentNode.nodeName.toLowerCase() !== 'style') return;
  const element = currentNode as Element;
  if (typeof element.closest === 'function' && element.closest('svg')) return;
  element.textContent = '';
}

function sanitizeWithHooks(
  rawInput: string,
  config: Config,
  restrictReferences: boolean,
  confineStyles = false,
): string {
  DOMPurify.addHook('uponSanitizeAttribute', removeInlineEventAttributes);

  if (restrictReferences) {
    DOMPurify.addHook('uponSanitizeAttribute', restrictSvgReferences);
  }

  if (confineStyles) {
    DOMPurify.addHook('uponSanitizeElement', confineStyleElementsToSvg);
  }

  try {
    return DOMPurify.sanitize(rawInput, config) as string;
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute', removeInlineEventAttributes);

    if (restrictReferences) {
      DOMPurify.removeHook('uponSanitizeAttribute', restrictSvgReferences);
    }

    if (confineStyles) {
      DOMPurify.removeHook('uponSanitizeElement', confineStyleElementsToSvg);
    }
  }
}

/**
 * Sanitizes untrusted markup before rendering it with a DOM HTML sink such as
 * dangerouslySetInnerHTML.
 *
 * `strict-html` deliberately removes SVG and MathML. It is intended for normal
 * user-authored rich text where vector markup is not required.
 *
 * `math-svg` permits only the HTML/MathML/SVG surface needed for KaTeX and
 * generated scientific vector graphics. Script-capable and active SVG content
 * is explicitly forbidden, all inline event handlers are removed, and SVG
 * <use> references are limited to local fragment identifiers.
 */
export function sanitizeContent(rawInput: string, type: SanitizeType): string {
  if (typeof rawInput !== 'string' || rawInput.length === 0) {
    return '';
  }

  if (type === 'strict-html') {
    return sanitizeWithHooks(
      rawInput,
      {
        USE_PROFILES: { html: true },
        FORBID_TAGS: STRICT_HTML_FORBID_TAGS,
        FORBID_ATTR: STRICT_HTML_ADDITIONAL_FORBIDDEN_ATTRIBUTES,
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: true,
        KEEP_CONTENT: true,
      },
      false,
    );
  }

  if (type === 'document-render') {
    return sanitizeWithHooks(
      rawInput,
      {
        USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true },
        ADD_TAGS: [...SVG_TAGS_TO_ALLOW, ...MATHML_TAGS_TO_ALLOW, 'foreignObject', 'style'],
        ADD_ATTR: [...MATH_SVG_ADDITIONAL_ATTRIBUTES, 'style', 'encoding', 'colspan', 'rowspan'],
        FORBID_TAGS: DOCUMENT_RENDER_FORBID_TAGS,
        FORBID_ATTR: DOCUMENT_RENDER_FORBIDDEN_ATTRIBUTES,
        ALLOWED_URI_REGEXP: DOCUMENT_RENDER_URI,
        // Mermaid's labels are HTML inside <foreignObject>. DOMPurify ≥3.1
        // drops that subtree unless foreignObject is declared an HTML
        // integration point. The subtree is still sanitized by every rule
        // above; this only stops it from being deleted wholesale.
        HTML_INTEGRATION_POINTS: { 'annotation-xml': true, foreignobject: true },
        ALLOW_DATA_ATTR: true,
        ALLOW_ARIA_ATTR: true,
        KEEP_CONTENT: true,
      },
      true,
      true,
    );
  }

  return sanitizeWithHooks(
    rawInput,
    {
      USE_PROFILES: { html: true, mathMl: true, svg: true },
      ADD_TAGS: [...SVG_TAGS_TO_ALLOW, ...MATHML_TAGS_TO_ALLOW],
      ADD_ATTR: MATH_SVG_ADDITIONAL_ATTRIBUTES,
      FORBID_TAGS: MATH_SVG_FORBID_TAGS,
      FORBID_ATTR: MATH_SVG_FORBIDDEN_ATTRIBUTES,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: true,
      KEEP_CONTENT: true,
    },
    true,
  );
}
