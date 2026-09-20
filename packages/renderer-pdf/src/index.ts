import { compilePrintCss, type ResolvedTemplate } from '@scirender/template-engine';

export type { PageKind, PageOrientation } from '@scirender/ast';
import type { PageKind, PageOrientation } from '@scirender/ast';

export interface PrintOptions {
  pages: string[];
  pageOrientations?: PageOrientation[];
  pageKinds?: PageKind[];
  template: ResolvedTemplate;
  /** Page-number labels, one per page. Omit for no footers. */
  footers?: string[];
  documentTitle?: string;
}

const PRINT_ROOT_ID = 'sr-print-root';
const PRINT_STYLE_ID = 'sr-print-style';
let activePrintCleanup: (() => void) | null = null;

/**
 * Print / PDF pipeline.
 *
 * SciRender prints the *already paginated* pages rather than handing a long
 * flow to the browser: the page breaks the user saw in the preview are the page
 * breaks in the PDF (P2). The browser only rasterises.
 */
export function printDocument(options: PrintOptions): void {
  activePrintCleanup?.();
  activePrintCleanup = null;
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
      return `<section class="sr-page${options.pageOrientations?.[i] === 'landscape' ? ' sr-page-landscape' : ''}"><div class="sr-page-body sr-doc">${html}</div>${
        footer ? `<div class="sr-page-footer">${escapeHtml(footer)}</div>` : ''
      }</section>`;
    })
    .join('');

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    document.title = previousTitle;
    root?.remove();
    style?.remove();
    window.removeEventListener('afterprint', cleanup);
    if (activePrintCleanup === cleanup) activePrintCleanup = null;
  };
  activePrintCleanup = cleanup;
  window.addEventListener('afterprint', cleanup);

  // Chờ mọi phông chữ (kể cả các @font-face vừa được browser tải/parse cho
  // nội dung mới chèn vào #sr-print-root) báo "ready" trước khi mở hộp thoại
  // in — nếu không, Chromium có thể rasterize bằng phông thay thế cho phần
  // chưa tải xong (chữ trông đúng trên màn hình nhưng sai trong PDF xuất ra).
  // Cùng lý do máy chủ PDF (server.ts) đợi `document.fonts.ready` trước khi in.
  const ready = (document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
  void ready.then(() => {
    // Cho browser thêm một khung hình để áp dụng stylesheet in; nếu không
    // Chromium đôi lúc đo layout theo trạng thái trước khi in.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
        // `afterprint` is the authoritative cleanup signal. A very long
        // fallback prevents stale print DOM from surviving forever on
        // browsers that fail to emit it, without racing the PDF snapshot.
        window.setTimeout(cleanup, 60_000);
      });
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
/**
 * Guards a stylesheet that is about to be embedded in a raw `<style>` element.
 *
 * `mergeTemplate` already sanitises every descriptor value, so in a correct
 * build nothing reaches here that needs changing. This is the second layer, and
 * it is here for a specific reason rather than out of habit: this function is
 * the *only* place in SciRender where CSS is concatenated into an HTML string
 * instead of being assigned to `style.textContent`. Everywhere else the DOM
 * does the escaping. If a future change adds a stylesheet source that skips the
 * descriptor path — a user stylesheet, a theme file, CSS pasted into an export
 * option — it would land straight in this string, and this catch keeps that
 * from becoming an executable `</style>`.
 *
 * Only the element-terminating sequence is neutralised. The CSS itself is left
 * alone, because at this point it is machine-generated and rewriting it would
 * change what prints.
 */
function embedStyle(css: string): string {
  // `</style` in any casing ends the element, with or without the closing
  // bracket. Breaking the `<` is enough and leaves valid (if inert) CSS.
  return css.replace(/<\s*\/\s*(style|script)/gi, '<\\/$1');
}

export function exportStandaloneHtml(options: StandaloneOptions): string {
  const { pages, template } = options;
  const title = options.documentTitle ?? 'SciRender document';
  const body = pages
    .map((html, i) => {
      const footer = options.footers?.[i];
      const kind = options.pageKinds?.[i] ?? 'body';
      const classes = ['sr-page', `sr-page-${kind}`];
      if (options.pageOrientations?.[i] === 'landscape') classes.push('sr-page-landscape');
      return `<section class="${classes.join(' ')}"><div class="sr-page-body sr-doc">${html}</div>${
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
<style>${embedStyle(options.katexCss ?? '')}</style>
<style>${embedStyle(options.extraCss ?? '')}</style>
<style>
html,body{margin:0;padding:0;background:rgb(82 86 89);}
.sr-pages{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px;}
.sr-page{box-shadow:0 2px 14px rgba(0,0,0,.35);}
@media print{@page{size:A4 portrait;margin:0!important;}@page landscape-page{size:A4 landscape;margin:0!important;}html,body{margin:0!important;padding:0!important;background:rgb(255 255 255);}.sr-pages{gap:0;padding:0;}}
${embedStyle(template.css)}
${embedStyle(compilePrintCss(template.descriptor))}
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
