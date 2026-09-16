import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { chromium, type Browser } from 'playwright';

/**
 * Máy chủ xuất PDF của SciRender.
 *
 * Việc duy nhất: nhận một chuỗi HTML đã dựng sẵn (đúng những trang đã phân,
 * đúng CSS `@page` của template — xem `exportStandaloneHtml` trong
 * `@scirender/renderer-pdf`), mở bằng Chromium headless và gọi `page.pdf()`.
 * Đây chính là việc trình duyệt làm khi người dùng bấm In… → Save as PDF,
 * chỉ khác là tự động và không cần hộp thoại — nên chữ trong tệp là chữ thật,
 * chọn và tìm kiếm được, giống Word.
 *
 * Máy chủ không lưu trữ tài liệu: không database, không đĩa, không log nội
 * dung. Một yêu cầu vào, một tệp PDF ra, rồi quên — giữ đúng tinh thần P1
 * (không giữ dữ liệu người dùng lâu hơn mức cần thiết) dù đã phải đánh đổi
 * P5 (Local First) để có PDF chữ thật.
 */

const PORT = Number(process.env.PORT ?? 8787);
const MAX_HTML_BYTES = 20 * 1024 * 1024; // 20MB — đủ cho tài liệu dài kèm phông nhúng base64
const RENDER_TIMEOUT_MS = 60_000;
const MAX_CONCURRENT_RENDERS = Number(process.env.MAX_CONCURRENT_RENDERS ?? 2);
const EXPORT_TOKEN = process.env.EXPORT_TOKEN?.trim() || null;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN?.trim() || '*';

if (ALLOWED_ORIGIN === '*') {
  // eslint-disable-next-line no-console
  console.warn(
    '[pdf-server] ALLOWED_ORIGIN chưa được đặt — đang chấp nhận mọi origin (*). ' +
      'Đặt biến môi trường ALLOWED_ORIGIN thành domain thật của app khi triển khai thật.',
  );
}
if (!EXPORT_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn(
    '[pdf-server] EXPORT_TOKEN chưa được đặt — endpoint xuất PDF đang mở công khai, ' +
      'ai có URL cũng gọi được. Đặt EXPORT_TOKEN để yêu cầu client gửi kèm header x-export-token.',
  );
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: ['--disable-dev-shm-usage'],
      // Lối thoát cho triển khai tự quản lý không dùng ảnh Docker chính thức
      // của Playwright (vd. Chromium đã có sẵn ở một đường dẫn khác).
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    });
  }
  return browserPromise;
}

/** Giới hạn số phiên dựng PDF chạy song song — Chromium ngốn RAM, máy nhỏ dễ sập nếu không chặn. */
let inFlight = 0;
const queue: Array<() => void> = [];

async function acquireSlot(): Promise<() => void> {
  if (inFlight < MAX_CONCURRENT_RENDERS) {
    inFlight++;
    return () => release();
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  inFlight++;
  return () => release();
}

function release(): void {
  inFlight--;
  const next = queue.shift();
  if (next) next();
}

function checkToken(req: Request, res: Response, next: NextFunction): void {
  if (!EXPORT_TOKEN) return next();
  const header = req.header('x-export-token');
  if (header !== EXPORT_TOKEN) {
    res.status(401).json({ error: 'Thiếu hoặc sai x-export-token.' });
    return;
  }
  next();
}

const app = express();
app.use(
  cors({
    origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',').map((s) => s.trim()),
  }),
);
app.use(express.json({ limit: MAX_HTML_BYTES }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, inFlight, queued: queue.length });
});

app.post('/export-pdf', checkToken, async (req: Request, res: Response) => {
  const html = (req.body as { html?: unknown } | undefined)?.html;
  if (typeof html !== 'string' || !html.trim()) {
    res.status(400).json({ error: 'Thiếu trường "html" (chuỗi HTML đã dựng sẵn).' });
    return;
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    res.status(413).json({ error: `Tài liệu vượt quá ${MAX_HTML_BYTES / 1024 / 1024}MB.` });
    return;
  }

  const release = await acquireSlot();
  const start = Date.now();
  let context: Awaited<ReturnType<Browser['newContext']>> | null = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext();
    const page = await context.newPage();

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Hết thời gian dựng PDF (60 giây).')), RENDER_TIMEOUT_MS),
    );

    const pdf = await Promise.race([
      (async () => {
        await page.setContent(html, { waitUntil: 'networkidle', timeout: RENDER_TIMEOUT_MS });
        // Đợi phông chữ nhúng (base64) nạp xong trước khi in — tương tự
        // `document.fonts.ready` mà bản tải PDF ảnh phía trình duyệt đã làm.
        // Chạy trong ngữ cảnh trang (trình duyệt), không phải Node — tsconfig
        // của package này chỉ có lib Node nên tránh nhắc thẳng tên `document`
        // và đi qua `globalThis` để không cần kéo theo lib DOM.
        await page.evaluate(() => {
          const w = globalThis as unknown as {
            document?: { fonts?: { ready?: Promise<unknown> } };
          };
          return w.document?.fonts?.ready ?? Promise.resolve();
        });
        return page.pdf({
          printBackground: true,
          preferCSSPageSize: true,
        });
      })(),
      timeout,
    ]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdf.length));
    res.send(pdf);
    // eslint-disable-next-line no-console
    console.log(`[pdf-server] xuất OK, ${pdf.length} byte, ${Date.now() - start}ms`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[pdf-server] lỗi dựng PDF:', err);
    res.status(500).json({
      error: `Không dựng được PDF: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    await context?.close().catch(() => undefined);
    release();
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[pdf-server] đang lắng nghe ở cổng ${PORT}`);
  void getBrowser(); // khởi động Chromium ngay, để yêu cầu đầu tiên không phải chờ cold start
});

function shutdown(): void {
  void browserPromise?.then((b) => b.close());
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
