import { compilePrintCss, type ResolvedTemplate } from '@scirender/template-engine';

export interface PrintOptions {
  pages: string[];
  template: ResolvedTemplate;
  /** Page-number labels, one per page. Omit for no footers. */
  footers?: string[];
  documentTitle?: string;
}

const PRINT_ROOT_ID = 'sr-print-root';
const PRINT_STYLE_ID = 'sr-print-style';

/**
 * Print / PDF pipeline.
 *
 * SciRender prints the *already paginated* pages rather than handing a long
 * flow to the browser: the page breaks the user saw in the preview are the page
 * breaks in the PDF (P2). The browser only rasterises.
 */
export function printDocument(options: PrintOptions): void {
  const { pages, template } = options;
  const previousTitle = document.title;
  if (options.documentTitle) document.title = options.documentTitle;

  let style = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = template.css + '\n' + compilePrintCss(template.descriptor);

  let root = document.getElementById(PRINT_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = PRINT_ROOT_ID;
    document.body.appendChild(root);
  }
  root.innerHTML = pages
    .map((html, i) => {
      const footer = options.footers?.[i];
      return `<section class="sr-page"><div class="sr-page-body sr-doc">${html}</div>${
        footer ? `<div class="sr-page-footer">${escapeHtml(footer)}</div>` : ''
      }</section>`;
    })
    .join('');

  const cleanup = (): void => {
    document.title = previousTitle;
    root?.remove();
    style?.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  // Give the browser one frame to apply the print stylesheet before opening the
  // dialog; otherwise Chromium occasionally measures the pre-print layout.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.print();
      // Safari never fires afterprint in some configurations.
      window.setTimeout(cleanup, 1500);
    });
  });
}

export interface StandaloneOptions extends PrintOptions {
  /** KaTeX stylesheet source, inlined so the export works offline (P5). */
  katexCss?: string;
  /**
   * Extra CSS to inline verbatim, after `katexCss` — used for the app's own
   * @font-face rules (Be Vietnam Pro / Literata / JetBrains Mono) with every
   * `url(...)` already rewritten to a `data:` URI. Needed so the standalone
   * export (and the PDF server, which renders this same HTML with no access
   * to the app's `/fonts/*.woff2`) don't silently fall back to a substitute
   * typeface for code blocks — see `apps/web/src/lib/export-fonts.ts`.
   */
  extraCss?: string;
  lang?: string;
}

/** Produces a single self-contained .html file — no network, no assets folder. */
export function exportStandaloneHtml(options: StandaloneOptions): string {
  const { pages, template } = options;
  const title = options.documentTitle ?? 'SciRender document';
  const body = pages
    .map((html, i) => {
      const footer = options.footers?.[i];
      return `<section class="sr-page"><div class="sr-page-body sr-doc">${html}</div>${
        footer ? `<div class="sr-page-footer">${escapeHtml(footer)}</div>` : ''
      }</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="${escapeAttr(options.lang ?? 'vi')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="SciRender 2.0">
<title>${escapeHtml(title)}</title>
<style>${options.katexCss ?? ''}</style>
<style>${options.extraCss ?? ''}</style>
<style>
html,body{margin:0;padding:0;background:#525659;}
.sr-pages{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px;}
.sr-page{box-shadow:0 2px 14px rgba(0,0,0,.35);}
@media print{html,body{background:#fff;}.sr-pages{gap:0;padding:0;}}
${template.css}
${compilePrintCss(template.descriptor)}
</style>
</head>
<body>
<div class="sr-pages" id="sr-print-root">
${body}
</div>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

export { compilePrintCss };

export { downloadPdf, toMm, slug } from './pdf.js';
export type { PdfOptions, PdfResult } from './pdf.js';

export { downloadPdfServer } from './server-pdf.js';
export type { ServerPdfOptions } from './server-pdf.js';
