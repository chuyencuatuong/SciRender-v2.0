import { printDocument, type PrintOptions } from './print.js';

export interface PdfOptions extends PrintOptions {
  /** Kept for source compatibility with the former raster exporter. Ignored. */
  scale?: number;
  /** Kept for source compatibility. Browser print does not expose byte progress. */
  onProgress?: (done: number, total: number) => void;
}

export interface PdfResult {
  fileName: string;
  pages: number;
  /** Browser print owns PDF serialization, so byte size is not observable here. */
  bytes: number;
}

/**
 * Opens the browser's native print-to-PDF pipeline.
 *
 * This intentionally does not rasterize the page. The previous implementation
 * used html2canvas + jsPDF, which turned every page into one JPEG image. The
 * native browser PDF path serializes the laid-out HTML/CSS as real PDF content,
 * preserving selectable/searchable text, links, and vector content where the
 * browser can represent it.
 *
 * A web page cannot silently choose a user's PDF destination or save-dialog
 * options, so the final save step remains the browser's print UI.
 */
export function downloadPdf(options: PdfOptions): Promise<PdfResult> {
  const fileName = `${slug(options.documentTitle ?? 'scirender')}.pdf`;
  printDocument(options);
  options.onProgress?.(options.pages.length, options.pages.length);
  return Promise.resolve({
    fileName,
    pages: options.pages.length,
    bytes: 0,
  });
}

/** CSS length -> millimetres. Kept as a public helper for downstream callers. */
export function toMm(value: string, fallback: number): number {
  const m = /^(-?[\d.]+)\s*(mm|cm|in|pt|px)?$/.exec(String(value).trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return fallback;
  switch (m[2]) {
    case 'cm':
      return n * 10;
    case 'in':
      return n * 25.4;
    case 'pt':
      return (n / 72) * 25.4;
    case 'px':
      return (n / 96) * 25.4;
    default:
      return n;
  }
}

export function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'scirender-document'
  );
}
