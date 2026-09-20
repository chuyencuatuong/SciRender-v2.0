import { compilePrintCss, type ResolvedTemplate } from '@scirender/template-engine';

import type { PageOrientation } from '@scirender/ast';

export interface PdfOptions {
  /** Inner HTML of each already-paginated page body. */
  pages: string[];
  /** Orientation for each already-paginated page. */
  pageOrientations?: PageOrientation[];
  template: ResolvedTemplate;
  footers?: string[];
  documentTitle?: string;
  /** Độ nét: 2 = nhanh và nhẹ, 3 = nét hơn nhưng tệp nặng hơn. */
  scale?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface PdfResult {
  fileName: string;
  pages: number;
  bytes: number;
}

/**
 * Tải thẳng tệp PDF về máy — khác với In.
 *
 * **In** giao việc cho hộp thoại in của trình duyệt: chữ trong PDF là chữ thật,
 * chọn và tìm kiếm được, nhưng người dùng phải tự chọn "Save as PDF", tự đặt lề
 * = None và tắt header/footer, và trên một số máy không có lựa chọn đó.
 *
 * **Tải PDF** dựng tệp ngay trong trình duyệt: bấm một cái là có tệp, lề và khổ
 * giấy đã đúng sẵn, không phụ thuộc hộp thoại in. Cái giá phải trả là mỗi trang
 * được chụp thành ảnh nên **chữ không chọn hay tìm kiếm được**. Giao diện nói rõ
 * điều đó ở ngay chỗ bấm chứ không giấu (P6).
 *
 * Cả hai đều in *đúng những trang đã phân*, không đưa dòng chảy dài cho trình
 * duyệt tự ngắt — chỗ ngắt trang trong bản xem trước là chỗ ngắt trang trong tệp
 * (P2). jsPDF và html2canvas chỉ được nạp khi thật sự bấm xuất, nên không nằm
 * trong gói khởi động.
 */
export async function downloadPdf(options: PdfOptions): Promise<PdfResult> {
  const { pages, template } = options;
  if (!pages.length) throw new Error('Chưa có trang nào để xuất. Hãy dựng trang trước.');

  const scale = options.scale ?? 2;
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import('jspdf'),
    import('html2canvas').then((m) => m.default),
  ]);

  const portraitWidthMm = toMm(template.descriptor.page.width, 210);
  const portraitHeightMm = toMm(template.descriptor.page.height, 297);
  const dims = (index: number): { widthMm: number; heightMm: number; orientation: 'portrait' | 'landscape' } =>
    options.pageOrientations?.[index] === 'landscape'
      ? { widthMm: portraitHeightMm, heightMm: portraitWidthMm, orientation: 'landscape' }
      : { widthMm: portraitWidthMm, heightMm: portraitHeightMm, orientation: 'portrait' };

  const style = document.createElement('style');
  style.textContent = template.css + '\n' + compilePrintCss(template.descriptor);

  // Off-screen but really laid out: html2canvas measures what the browser drew,
  // so anything hidden with display:none would come back blank.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-20000px;top:0;z-index:-1;background:#fff;pointer-events:none;';
  host.innerHTML = pages
    .map((html, i) => {
      const footer = options.footers?.[i];
      return (
        `<section class="sr-page sr-pdf-page${options.pageOrientations?.[i] === 'landscape' ? ' sr-page-landscape' : ''}">` +
        `<div class="sr-page-body sr-doc">${html}</div>` +
        (footer ? `<div class="sr-page-footer">${escapeHtml(footer)}</div>` : '') +
        `</section>`
      );
    })
    .join('');

  document.head.appendChild(style);
  document.body.appendChild(host);

  try {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        /* font loading is best effort */
      }
    }
    await nextFrame();
    await nextFrame();

    const sheets = Array.from(host.querySelectorAll<HTMLElement>('.sr-pdf-page'));
    const first = dims(0);
    const doc = new jsPDF({
      unit: 'mm',
      format: [first.widthMm, first.heightMm],
      orientation: first.orientation,
      compress: true,
    });
    doc.setProperties({ title: options.documentTitle ?? 'SciRender' });

    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i] as HTMLElement;
      const canvas = await html2canvas(sheet, {
        scale,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        windowWidth: sheet.offsetWidth,
        windowHeight: sheet.offsetHeight,
      });
      const page = dims(i);
      if (i > 0) doc.addPage([page.widthMm, page.heightMm], page.orientation);
      doc.addImage(
        canvas.toDataURL('image/jpeg', 0.94),
        'JPEG',
        0,
        0,
        page.widthMm,
        page.heightMm,
        undefined,
        'FAST',
      );
      options.onProgress?.(i + 1, sheets.length);
    }

    const fileName = `${slug(options.documentTitle ?? 'scirender')}.pdf`;
    const blob = doc.output('blob') as Blob;
    saveBlob(fileName, blob);
    return { fileName, pages: sheets.length, bytes: blob.size };
  } finally {
    host.remove();
    style.remove();
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

/** CSS length -> millimetres. Only the units a page size is ever written in. */
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
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'scirender-document'
  );
}

export function saveBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
