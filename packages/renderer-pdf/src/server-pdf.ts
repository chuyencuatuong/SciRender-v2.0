import { exportStandaloneHtml, type StandaloneOptions } from './index.js';
import { saveBlob, slug } from './pdf.js';
import type { PdfResult } from './pdf.js';

export interface ServerPdfOptions extends StandaloneOptions {
  /** URL of the `@scirender/pdf-server` `/export-pdf` endpoint. */
  endpoint: string;
  /** Value sent as `x-export-token`, when the server requires one. */
  token?: string;
  /** Aborts the request — wired to a "Hủy" button if the export menu ever gets one. */
  signal?: AbortSignal;
}

/**
 * Tải PDF **chữ thật** qua máy chủ xuất PDF (`@scirender/pdf-server`).
 *
 * Khác với `downloadPdf()` trong `pdf.ts` (chụp ảnh từng trang bằng
 * html2canvas), hàm này gửi đúng HTML đã dựng sẵn — same nguồn với
 * `exportStandaloneHtml()` — cho một Chromium headless ở xa in bằng
 * `page.pdf()`. Kết quả là PDF vector, chữ chọn/tìm được, đúng như bấm
 * In… → Save as PDF nhưng không cần hộp thoại.
 *
 * Cần mạng và cần máy chủ đang chạy — đây là điểm duy nhất trong SciRender
 * phá vỡ P5 (Local First), đổi lấy PDF đúng nghĩa. Khi máy chủ không tới
 * được, gọi hàm này sẽ ném lỗi rõ ràng (P6) để giao diện gợi ý người dùng
 * quay lại "Tải PDF (ngoại tuyến, ảnh)" hoặc "In… → Save as PDF".
 */
export async function downloadPdfServer(options: ServerPdfOptions): Promise<PdfResult> {
  const { pages, endpoint } = options;
  if (!pages.length) throw new Error('Chưa có trang nào để xuất. Hãy dựng trang trước.');
  if (!endpoint) throw new Error('Chưa cấu hình máy chủ xuất PDF (VITE_PDF_SERVER_URL).');

  const html = exportStandaloneHtml(options);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { 'x-export-token': options.token } : {}),
      },
      body: JSON.stringify({ html }),
      signal: options.signal,
    });
  } catch (err) {
    throw new Error(
      `Không kết nối được tới máy chủ xuất PDF: ${
        err instanceof Error ? err.message : String(err)
      }. Kiểm tra kết nối mạng, hoặc dùng "Tải PDF (ngoại tuyến, ảnh)" / "In… → Save as PDF".`,
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: string };
      detail = body.error ?? '';
    } catch {
      /* phản hồi không phải JSON — bỏ qua, dùng thông báo mặc định */
    }
    throw new Error(
      `Máy chủ xuất PDF báo lỗi (${response.status}): ${detail || 'không rõ nguyên nhân'}.`,
    );
  }

  const blob = await response.blob();
  const fileName = `${slug(options.documentTitle ?? 'scirender')}.pdf`;
  saveBlob(fileName, blob);
  return { fileName, pages: pages.length, bytes: blob.size };
}
