/**
 * Gom CSS phông chữ để nhúng vào tệp xuất tự chứa (HTML độc lập, hoặc HTML
 * gửi cho máy chủ xuất PDF).
 *
 * Ba mặt chữ của app (`apps/web/src/styles/fonts.css`) và phông của KaTeX
 * đều được nạp bằng `url(...)` trỏ tới đường dẫn same-origin (`/fonts/...`
 * hoặc asset đã băm của Vite). Trong trang đang chạy, các đường dẫn đó nạp
 * bình thường. Nhưng khi HTML được tách ra — mở làm tệp .html độc lập,
 * hoặc gửi cho Chromium headless ở một máy chủ khác không có gì ngoài chuỗi
 * HTML — những `url(...)` đó trỏ vào hư không: 404, phông rơi về mặt chữ hệ
 * thống thay thế. `inlineFontUrls` đọc lại từng tệp phông qua `fetch` (vẫn
 * same-origin, đang chạy trong trang thật) và thay `url(...)` bằng
 * `data:` base64, biến CSS thành tự chứa hoàn toàn — không phụ thuộc host
 * nào phục vụ tiếp (P5-style self-containment, áp dụng cho việc xuất).
 */

const FONT_URL_RE = /url\((['"]?)([^'")]+\.(?:woff2|woff|ttf|otf))\1\)/g;

async function inlineFontUrls(css: string): Promise<string> {
  const urls = new Set<string>();
  for (const m of css.matchAll(FONT_URL_RE)) {
    const url = m[2];
    if (url) urls.add(url);
  }
  if (!urls.size) return css;

  const entries = await Promise.all(
    Array.from(urls).map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return [url, null] as const;
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        return [url, dataUrl] as const;
      } catch {
        return [url, null] as const;
      }
    }),
  );

  let out = css;
  for (const [url, dataUrl] of entries) {
    if (!dataUrl) continue; // fetch lỗi — để nguyên url gốc, còn hơn làm hỏng cả khối CSS
    out = out.split(url).join(dataUrl);
  }
  return out;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được tệp phông.'));
    reader.readAsDataURL(blob);
  });
}

/** Bóc cssText của mọi stylesheet mà nội dung khớp ít nhất một trong các `markers`. */
function readStylesheetsMatching(markers: string[]): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      let text = '';
      for (const rule of Array.from(rules)) text += rule.cssText + '\n';
      if (markers.some((m) => text.includes(m))) css += text;
    } catch {
      /* stylesheet cross-origin — bỏ qua */
    }
  }
  return css;
}

/** CSS của KaTeX (đã nạp qua `katex/dist/katex.min.css`), phông đã nhúng base64. */
export async function readKatexCss(): Promise<string> {
  const css = readStylesheetsMatching(['.katex']);
  return inlineFontUrls(css);
}

/** CSS ba mặt chữ riêng của app (`fonts.css`), phông đã nhúng base64. */
export async function readAppFontsCss(): Promise<string> {
  const css = readStylesheetsMatching(['Be Vietnam Pro', 'Literata', 'JetBrains Mono']);
  return inlineFontUrls(css);
}
