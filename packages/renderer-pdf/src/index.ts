import { compilePrintCss, type ResolvedTemplate } from '@scirender/template-engine';
import type { PrintOptions } from './print.js';

export { printDocument } from './print.js';
export type { PrintOptions } from './print.js';

export interface StandaloneOptions extends PrintOptions {
  /** KaTeX stylesheet source, inlined so the export works offline (P5). */
  katexCss?: string;
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
