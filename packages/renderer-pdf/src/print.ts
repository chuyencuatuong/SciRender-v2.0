import { compilePrintCss, type ResolvedTemplate } from '@scirender/template-engine';

const PRINT_ROOT_ID = 'sr-print-root';
const PRINT_STYLE_ID = 'sr-print-style';
let activePrintCleanup: (() => void) | null = null;

export type PageOrientation = 'portrait' | 'landscape';
export type PageKind = 'cover' | 'front' | 'body';

export interface PrintOptions {
  pages: string[];
  pageOrientations?: PageOrientation[];
  pageKinds?: PageKind[];
  template: ResolvedTemplate;
  /** Page-number labels, one per page. Omit for no footers. */
  footers?: string[];
  documentTitle?: string;
}

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
      const kind = options.pageKinds?.[i] ?? 'body';
      const classes = ['sr-page', `sr-page-${kind}`];
      if (options.pageOrientations?.[i] === 'landscape') classes.push('sr-page-landscape');
      return `<section class="${classes.join(' ')}"><div class="sr-page-body sr-doc">${html}</div>${
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

  // Fonts are part of physical page geometry. Open the print dialog only after
  // the document has reported them ready, then give the browser two frames to
  // apply the print stylesheet before it snapshots the page.
  const ready = (document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
  void ready.then(() => {
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


function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

