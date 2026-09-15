/**
 * Browser-level verification of the half of the pipeline that needs a DOM:
 * the layout engine (pagination, keep-with-next, orphan/widow), the BTL cover
 * and front matter, and the on-demand render flow.
 *
 * Usage:
 *   pnpm build && pnpm preview   # in one terminal
 *   pnpm browser-check           # in another
 */
// Playwright is a dev dependency. Install its browser once with
// `pnpm exec playwright install chromium`, or point PLAYWRIGHT_PATH at an
// existing installation.
const playwright = await import(process.env.PLAYWRIGHT_PATH || 'playwright').catch(() => {
  console.error(
    'Không tìm thấy playwright. Cài bằng: pnpm add -Dw playwright && pnpm exec playwright install chromium',
  );
  process.exit(2);
});
const { chromium } = playwright.chromium ? playwright : playwright.default;

const URL = process.env.SCIRENDER_URL ?? 'http://localhost:4173/';
let failures = 0;
let checks = 0;

function check(name, condition, detail) {
  checks++;
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.sr-page', { timeout: 25000 });
await page.waitForTimeout(3500);

console.log('\nApp shell');
check('editor mounted', (await page.locator('.cm-editor').count()) === 1);
check('side rail rendered', (await page.locator('nav button').count()) >= 7);
check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

/* ------------------------------------------------------------ BTL structure */

console.log('\nCấu trúc BTL');
const pageCount = await page.locator('.sr-page').count();
check('tài liệu được chia nhiều trang', pageCount >= 8, `pages=${pageCount}`);

const covers = await page.locator('.sr-page-cover').count();
check('có 2 trang bìa', covers === 2, `covers=${covers}`);

const coverText = await page.locator('.sr-page-cover').first().innerText();
check('bìa có tên trường', coverText.includes('TRƯỜNG ĐẠI HỌC BÁCH KHOA'), coverText.slice(0, 80));
check('bìa có tên đề tài', coverText.toUpperCase().includes('ƯỚC LƯỢNG HUYẾT ÁP'));
check('bìa có GVHD', coverText.includes('GVHD'));
check(
  'bìa có logo hiển thị được',
  (await page.locator('.sr-page-cover .sr-cover-logo img').count()) >= 1,
);
const innerCoverText = await page.locator('.sr-page-cover').nth(1).innerText();
check('phụ bìa liệt kê MSSV', innerCoverText.includes('MSSV'));

const footers = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page')).map((p) => {
    const f = p.querySelector('.sr-page-footer');
    return f ? f.textContent.trim() : '';
  }),
);
check('hai trang bìa không đánh số', footers[0] === '' && footers[1] === '', JSON.stringify(footers.slice(0, 4)));
check(
  'phần đầu đánh số La Mã bắt đầu từ i',
  footers[2] === 'i' && footers[3] === 'ii',
  JSON.stringify(footers.slice(0, 8)),
);
const firstArabic = footers.findIndex((f) => f === '1');
check('phần nội dung khởi động lại từ 1', firstArabic > 2, `index=${firstArabic}`);
check(
  'số trang nội dung liên tục',
  footers.slice(firstArabic).every((f, i) => f === String(i + 1)),
  JSON.stringify(footers.slice(firstArabic)),
);

const frontTitles = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-front-title')).map((e) => e.textContent.trim()),
);
for (const want of [
  'TÓM TẮT BÀI BÁO CÁO',
  'LỜI CẢM ƠN',
  'MỤC LỤC',
  'DANH MỤC CÁC HÌNH ẢNH',
  'DANH MỤC BẢNG BIỂU',
  'DANH MỤC CÁC TỪ VIẾT TẮT',
]) {
  check(`phần đầu có "${want}"`, frontTitles.includes(want), frontTitles.join(' | '));
}
check(
  'mỗi mục phần đầu nằm trên trang riêng',
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sr-front-title')).every(
      (el) => el.parentElement?.firstElementChild === el,
    ),
  ),
);

/* ------------------------------------------------------- table of contents */

console.log('\nMục lục');
const toc = await page.evaluate(() => {
  const title = Array.from(document.querySelectorAll('.sr-front-title')).find(
    (e) => e.textContent.trim() === 'MỤC LỤC',
  );
  const list = title?.parentElement?.querySelector('.sr-list');
  if (!list) return null;
  return Array.from(list.querySelectorAll('li')).map((li) => ({
    text: li.querySelector('.sr-list-text')?.textContent?.trim() ?? '',
    page: li.querySelector('.sr-list-page')?.textContent?.trim() ?? '',
  }));
});
check('mục lục dựng được', Array.isArray(toc) && toc.length > 3, `entries=${toc?.length}`);
check(
  'mọi dòng mục lục đều có số trang',
  Boolean(toc) && toc.every((r) => r.page !== ''),
  JSON.stringify(toc?.filter((r) => !r.page)),
);
check(
  'mục lục dẫn các danh mục bằng số La Mã',
  Boolean(toc) &&
    toc.some((r) => r.text.includes('DANH MỤC CÁC HÌNH ẢNH') && /^[ivx]+$/.test(r.page)),
  JSON.stringify(toc?.slice(0, 4)),
);
check(
  'mục lục dẫn chương bằng số thường',
  Boolean(toc) && toc.some((r) => r.text.startsWith('CHƯƠNG 1.') && /^\d+$/.test(r.page)),
  JSON.stringify(toc?.find((r) => r.text.startsWith('CHƯƠNG 1.'))),
);

const tocPageClaim = toc?.find((r) => r.text.startsWith('CHƯƠNG 1.'))?.page;
const actualChapterPage = await page.evaluate(() => {
  const pages = Array.from(document.querySelectorAll('.sr-page'));
  for (const p of pages) {
    const h1 = p.querySelector('h1[data-sr-type="heading"]');
    if (h1 && h1.textContent.includes('CHƯƠNG 1.')) {
      return p.querySelector('.sr-page-footer')?.textContent?.trim() ?? '';
    }
  }
  return '';
});
check(
  'số trang trong mục lục khớp trang thật',
  tocPageClaim === actualChapterPage,
  `mục lục nói ${tocPageClaim}, thực tế ${actualChapterPage}`,
);

/* ------------------------------------------------------------ layout engine */

console.log('\nLayout engine');
const overflow = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body')).map((el) =>
    Math.round(el.scrollHeight - el.clientHeight),
  ),
);
check(
  'không trang nào tràn vùng nội dung',
  overflow.every((v) => v <= 2),
  `overflow px: ${overflow.join(', ')}`,
);

check(
  'mỗi CHƯƠNG bắt đầu ở đầu trang',
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sr-page-body')).every((body) => {
      const h1s = Array.from(body.querySelectorAll('h1[data-sr-type="heading"]'));
      return h1s.every((h) => body.firstElementChild === h);
    }),
  ),
);

const orphanWidow = await page.evaluate(() => {
  const countLines = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.height > 0)
      .sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const r of rects) {
      const last = lines[lines.length - 1];
      if (last) {
        const overlap = Math.min(last.bottom, r.bottom) - Math.max(last.top, r.top);
        const smaller = Math.min(last.bottom - last.top, r.bottom - r.top);
        if (smaller > 0 && overlap > smaller * 0.5) {
          last.bottom = Math.max(last.bottom, r.bottom);
          continue;
        }
      }
      lines.push({ top: r.top, bottom: r.bottom });
    }
    return lines.length;
  };
  const bodies = Array.from(document.querySelectorAll('.sr-page-body'));
  const problems = [];
  bodies.forEach((body, i) => {
    const last = body.lastElementChild;
    const next = bodies[i + 1]?.firstElementChild;
    if (last?.getAttribute('data-sr-split') === 'head') {
      const n = countLines(last);
      if (n < 2) problems.push(`page ${i + 1}: orphan (${n} dòng)`);
    }
    if (next?.getAttribute('data-sr-split') === 'tail') {
      const n = countLines(next);
      if (n < 2) problems.push(`page ${i + 2}: widow (${n} dòng)`);
    }
  });
  return problems;
});
check('orphan/widow được tôn trọng', orphanWidow.length === 0, orphanWidow.join('; '));

const dangling = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body'))
    .map((body, i) =>
      body.lastElementChild?.getAttribute('data-sr-type') === 'heading' && body.children.length > 1
        ? i + 1
        : null,
    )
    .filter(Boolean),
);
check('không có đề mục trơ trọi cuối trang', dangling.length === 0, `pages ${dangling.join(',')}`);

const atomic = await page.evaluate(() => {
  const types = ['figure', 'table', 'equation', 'diagram', 'codeBlock'];
  const seen = new Set();
  const dupes = [];
  document.querySelectorAll('.sr-page-body [data-sr-id]').forEach((el) => {
    const type = el.getAttribute('data-sr-type');
    if (!types.includes(type ?? '')) return;
    const id = el.getAttribute('data-sr-id');
    if (seen.has(id)) dupes.push(`${type}:${id}`);
    seen.add(id);
  });
  return dupes;
});
check('khối nguyên không bị cắt qua trang', atomic.length === 0, atomic.join(', '));

/* ---------------------------------------------------------------- rendering */

console.log('\nHiển thị');
check('KaTeX render được', (await page.locator('.sr-page .katex').count()) > 0);
check('Mermaid ra SVG', (await page.locator('.sr-page .sr-mermaid svg').count()) >= 2);
check('bảng render được', (await page.locator('.sr-page table').count()) >= 3);
check('số công thức hiển thị', (await page.locator('.sr-page .sr-equation-number').count()) >= 3);
check('khối mã có số dòng', (await page.locator('.sr-page .sr-code-gutter').count()) >= 1);
check('không có tham chiếu hỏng', (await page.locator('.sr-page .sr-unresolved').count()) === 0);
check('không có lỗi LaTeX', (await page.locator('.sr-page .sr-math-error').count()) === 0);

const bodyFont = await page.evaluate(() => {
  const el = document.querySelector('.sr-page-body p');
  return el ? getComputedStyle(el).fontFamily : '';
});
check('thân bài dùng Times New Roman', bodyFont.includes('Times New Roman'), bodyFont);

const diagramFont = await page.evaluate(() => {
  const el = document.querySelector('.sr-mermaid svg text');
  return el ? getComputedStyle(el).fontFamily : '';
});
check('chữ trong sơ đồ cùng font với văn bản', diagramFont.includes('Times New Roman'), diagramFont);

/* ----------------------------------------------------------- render on demand */

console.log('\nRender theo yêu cầu');
const before = await page.locator('.sr-page').count();
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.type('\n\nMột đoạn mới vừa được gõ thêm vào cuối tài liệu.');
await page.waitForTimeout(800);

const afterTyping = await page.locator('.sr-page').count();
const typedVisible = await page.evaluate(() =>
  document.body.innerText.includes('Một đoạn mới vừa được gõ thêm'),
);
const previewHasIt = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body')).some((p) =>
    p.textContent.includes('Một đoạn mới vừa được gõ thêm'),
  ),
);
check('gõ chữ KHÔNG tự render lại', !previewHasIt && afterTyping === before, `pages ${before}->${afterTyping}`);
check('nội dung vừa gõ có trong editor', typedVisible);
check(
  'có báo hiệu chưa dựng lại',
  await page.evaluate(() => document.body.innerText.includes('chưa dựng lại')),
);

await page.keyboard.press('Control+Enter');
await page.waitForTimeout(3000);
const nowHasIt = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body')).some((p) =>
    p.textContent.includes('Một đoạn mới vừa được gõ thêm'),
  ),
);
check('Ctrl+Enter dựng lại và đưa nội dung mới vào trang', nowHasIt);

/* --------------------------------------------------------------- determinism */

console.log('\nTính xác định');
const first = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body')).map((el) => el.innerHTML.length),
);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sr-page');
await page.waitForTimeout(3500);
const second = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body')).map((el) => el.innerHTML.length),
);
check(
  'cùng đầu vào cho cùng cách chia trang sau khi tải lại',
  JSON.stringify(first) === JSON.stringify(second),
  `${JSON.stringify(first)} vs ${JSON.stringify(second)}`,
);

await page.screenshot({ path: 'scripts/screenshot.png', fullPage: false });
console.log('\nẢnh chụp màn hình: scripts/screenshot.png');

console.log(`\n${checks - failures}/${checks} kiểm tra đạt.`);
await browser.close();
process.exit(failures ? 1 : 0);
