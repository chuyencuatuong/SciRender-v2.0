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
const page = await browser.newPage({
  viewport: { width: 1680, height: 1000 },
  acceptDownloads: true,
});

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.sr-page', { timeout: 25000 });
await page.waitForTimeout(3500);

console.log('\nApp shell');
check('canvas mounted', (await page.locator('[data-card-index]').count()) > 0);
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

/* ------------------------------------------------- footnotes & long tables */

console.log('\nChú thích chân trang và bảng dài');

const footnotes = await page.evaluate(() => {
  const blocks = Array.from(document.querySelectorAll('.sr-page-body > .sr-footnotes'));
  return blocks.map((ol) => {
    const body = ol.closest('.sr-page-body');
    const marks = Array.from(ol.querySelectorAll('.sr-footnote')).map((li) =>
      li.getAttribute('data-sr-fn-def'),
    );
    const refs = Array.from(body.querySelectorAll('.sr-footnote-ref')).map((s) =>
      s.getAttribute('data-sr-fn'),
    );
    const r = ol.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    return { marks, refs, bottomGap: Math.round(br.bottom - r.bottom) };
  });
});
check('có chú thích chân trang được in ra', footnotes.length >= 1, JSON.stringify(footnotes));
check(
  'mỗi chú thích nằm đúng trang có tham chiếu của nó',
  footnotes.every((f) => f.marks.every((m) => f.refs.includes(m))),
  JSON.stringify(footnotes.map((f) => [f.marks, f.refs])),
);
check(
  'chú thích được ghim sát đáy vùng nội dung',
  footnotes.every((f) => Math.abs(f.bottomGap) <= 2),
  JSON.stringify(footnotes.map((f) => f.bottomGap)),
);

const tableSplit = await page.evaluate(() => {
  const head = document.querySelector('[data-sr-type="table"][data-sr-split="head"]');
  const tail = document.querySelector('[data-sr-split="tail"]');
  if (!head || !tail) return null;
  const bodies = Array.from(document.querySelectorAll('.sr-page-body'));
  const rows = (el) => el.querySelectorAll('tbody tr').length;
  return {
    headRows: rows(head),
    tailRows: rows(tail),
    tailHasHeader: !!tail.querySelector('thead th'),
    tailCaption: tail.querySelector('.sr-caption')?.textContent ?? '',
    headPage: bodies.findIndex((b) => b.contains(head)),
    tailPage: bodies.findIndex((b) => b.contains(tail)),
  };
});
check('bảng dài được cắt qua trang', !!tableSplit && tableSplit.headRows > 0 && tableSplit.tailRows > 0,
  JSON.stringify(tableSplit));
check('phần tiếp của bảng lặp lại dòng tiêu đề', !!tableSplit?.tailHasHeader);
check('phần tiếp của bảng ghi "tiếp theo"', (tableSplit?.tailCaption ?? '').includes('tiếp theo'),
  tableSplit?.tailCaption);
check('hai phần của bảng nằm trên hai trang liên tiếp',
  !!tableSplit && tableSplit.tailPage === tableSplit.headPage + 1,
  JSON.stringify([tableSplit?.headPage, tableSplit?.tailPage]));

// --- long formulas must fit the column ------------------------------------
const mathFit = await page.evaluate(() => {
  const out = [];
  for (const disp of document.querySelectorAll('.sr-page-body .katex-display')) {
    const kx = disp.querySelector('.katex');
    if (!kx) continue;
    const body = disp.closest('.sr-page-body');
    const b = body.getBoundingClientRect();
    const k = kx.getBoundingClientRect();
    out.push({
      spill: Math.round(Math.max(k.right - b.right, b.left - k.left)),
      scaled: (kx.style.transform || '').startsWith('scale('),
      clipped: Math.round(disp.scrollWidth - disp.clientWidth) > 1 && !kx.style.transform,
    });
  }
  return out;
});
check('không công thức nào tràn ra ngoài vùng nội dung',
  mathFit.every((m) => m.spill <= 1), JSON.stringify(mathFit));
check('công thức dài được thu vừa cột thay vì bị cắt',
  mathFit.some((m) => m.scaled) && mathFit.every((m) => !m.clipped),
  JSON.stringify(mathFit));

const figureFit = await page.evaluate(() => {
  const imgs = Array.from(document.querySelectorAll('.sr-page-body figure img'));
  const body = document.querySelector('.sr-page-body');
  const limit = body ? body.getBoundingClientRect().height : 0;
  return imgs.map((i) => Math.round(i.getBoundingClientRect().height - limit));
});
check('không ảnh nào cao hơn vùng nội dung', figureFit.every((d) => d <= 0), JSON.stringify(figureFit));

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

const codeColour = await page.evaluate(() => {
  const kw = document.querySelector('.sr-page pre code.sr-hl .sr-hl-keyword');
  if (!kw) return null;
  const plain = getComputedStyle(kw.closest('pre')).color;
  return { keyword: getComputedStyle(kw).color, plain };
});
check(
  'khối mã được tô màu cú pháp',
  !!codeColour && codeColour.keyword !== codeColour.plain,
  JSON.stringify(codeColour),
);
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

// Regression: applyFittedSize used to strip width/height from EVERY element in
// the SVG, not just the root <svg>, which collapsed every node box and label to
// 0x0 and left nothing on the page but the arrows.
const diagramNodes = await page.evaluate(() => {
  const svg = document.querySelector('.sr-page .sr-mermaid svg');
  if (!svg) return null;
  return Array.from(svg.querySelectorAll('.node')).map((n) => {
    const box = n.getBBox();
    return {
      w: Math.round(box.width),
      h: Math.round(box.height),
      label: n.textContent.trim(),
    };
  });
});
check(
  'sơ đồ có khung và nhãn, không chỉ còn mũi tên',
  Array.isArray(diagramNodes) &&
    diagramNodes.length >= 3 &&
    diagramNodes.every((n) => n.w > 20 && n.h > 20 && n.label.length > 0),
  JSON.stringify(diagramNodes?.slice(0, 3)),
);

// Regression: mermaid measures wrappingWidth in PIXELS. Setting it to a
// character count (26) wrapped every label one word per line, so the boxes came
// out tall and narrow.
const widest = (diagramNodes ?? []).reduce(
  (best, n) => (n.label.length > (best?.label.length ?? 0) ? n : best),
  null,
);
check(
  'nhãn sơ đồ không bị xuống dòng từng chữ',
  !!widest && widest.w > widest.h,
  widest ? `${widest.label}: ${widest.w}x${widest.h}` : 'không có nhãn',
);

// Regression: the template stylesheet used to be installed by an effect that
// ran only AFTER the first render, so the first pagination of a session
// measured every block at the browser default of 16px.
const bodySize = await page.evaluate(() => {
  const el = document.querySelector('.sr-page-body p');
  return el ? Number.parseFloat(getComputedStyle(el).fontSize) : 0;
});
check(
  'lần dựng đầu tiên đo bằng cỡ chữ của template',
  Math.abs(bodySize - (13 * 96) / 72) < 0.6,
  `${bodySize}px`,
);

/* ------------------------------------------------------------------ giao diện */

console.log('\nGiao diện');

const headerButtons = await page.evaluate(
  () => document.querySelectorAll('[data-sr-topbar] button, [data-sr-topbar] label').length,
);
check('thanh trên gom còn tối đa 4 nút', headerButtons <= 4, `buttons=${headerButtons}`);

check(
  'menu Tệp và Xuất có mặt',
  (await page.getByRole('button', { name: 'Tệp' }).count()) === 1 &&
    (await page.getByRole('button', { name: 'Xuất', exact: true }).count()) === 1,
);

// Nút chính của "Xuất" tải PDF thật, nên ở đây chỉ mở phần menu bên cạnh.
await page.getByLabel('Thêm cách xuất').click();
await page.waitForTimeout(250);
const exportItems = await page.locator('[role="menu"] [role="menuitem"]').allTextContents();
check(
  'menu Xuất liệt kê đủ các cách xuất',
  exportItems.length === 5,
  String(exportItems.length),
);
check(
  'In và Tải PDF là hai mục tách bạch',
  exportItems.some((t) => t.includes('Tải PDF về máy')) &&
    exportItems.some((t) => t.trim().startsWith('In')) &&
    exportItems.some((t) => t.includes('nét cao')),
  JSON.stringify(exportItems.map((t) => t.split('\n')[0]?.trim())),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

const techVisible = async () =>
  page.evaluate(() => /parser \d/.test(document.querySelector('footer')?.textContent ?? ''));
check('thanh trạng thái KHÔNG hiện chỉ số kỹ thuật mặc định', !(await techVisible()));
check(
  'thanh trạng thái vẫn hiện số trang và hạn mức',
  await page.evaluate(() => {
    const t = document.querySelector('footer')?.textContent ?? '';
    return t.includes('trang') && t.includes('nội dung');
  }),
);
await page.getByRole('button', { name: 'Chi tiết kỹ thuật' }).click();
await page.waitForTimeout(400);
check('bật “Chi tiết kỹ thuật” mới hiện thời gian pipeline', await techVisible());
await page.getByRole('button', { name: 'Chi tiết kỹ thuật' }).click();
await page.waitForTimeout(400);
check('tắt lại thì ẩn đi', !(await techVisible()));

// --- search in the insert menu --------------------------------------------
await page.getByRole('button', { name: /^Thêm khối$/ }).first().click();
await page.waitForTimeout(300);
const allBlocks = await page.locator('[role="menu"] [role="menuitem"]').count();
await page.getByLabel('Tìm loại khối').fill('cong thuc');
await page.waitForTimeout(250);
const filtered = await page.locator('[role="menu"] [role="menuitem"]').allTextContents();
check(
  'ô tìm kiếm lọc được loại khối, bỏ dấu vẫn ra',
  filtered.length < allBlocks && filtered[0]?.includes('Công thức'),
  JSON.stringify(filtered.slice(0, 3)),
);
const cardsBeforeEnter = await page.locator('[data-card-index]').count();
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check(
  'Enter thêm ngay khối đang chọn',
  (await page.locator('[data-card-index]').count()) === cardsBeforeEnter + 1,
);
await page.getByRole('button', { name: /^Thêm khối$/ }).first().click();
await page.waitForTimeout(300);
check(
  'khối vừa dùng được ghim lên nhóm “Hay dùng”',
  await page.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    return (menu?.textContent ?? '').includes('Hay dùng');
  }),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);

/* -------------------------------------------------------------- block canvas */

console.log('\nBlock canvas');

const cardCount = await page.locator('[data-card-index]').count();
check('tài liệu hiện thành các khối card', cardCount >= 20, `cards=${cardCount}`);
check(
  'card có nhãn loại',
  await page.evaluate(() => {
    const h = document.querySelector('[data-card-index] header');
    return !!h && (h.textContent ?? '').trim().length > 0;
  }),
);
check(
  'nút thao tác trên card ẩn cho tới khi cần',
  await page.evaluate(() => {
    const bar = document.querySelector('[data-card-index="1"] header');
    if (!bar) return false;
    const cs = getComputedStyle(bar);
    return cs.opacity === '0' && cs.pointerEvents === 'none';
  }),
);
await page.locator('[data-card-index="1"]').hover();
await page.waitForTimeout(220);
check(
  'rê chuột lên khối thì thanh thao tác nổi lên',
  await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-card-index="1"] header')).opacity === '1',
  ),
);
check('card bảng hiện thành lưới sửa được', (await page.locator('[data-card-index] table input').count()) > 0);
check('card công thức có xem trước KaTeX', (await page.locator('[data-card-index] .katex').count()) > 0);

// --- quick insert ----------------------------------------------------------
await page.getByRole('button', { name: /Thêm khối$/ }).first().click();
await page.getByRole('menuitem', { name: /Bảng/ }).first().click();
await page.waitForTimeout(400);
check(
  'menu thả xuống thêm được khối mới',
  (await page.locator('[data-card-index]').count()) === cardCount + 1,
  `${cardCount} -> ${await page.locator('[data-card-index]').count()}`,
);

// --- undo ------------------------------------------------------------------
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
check(
  'Ctrl+Z hoàn tác được thao tác trên canvas',
  (await page.locator('[data-card-index]').count()) === cardCount,
  String(await page.locator('[data-card-index]').count()),
);

// --- reorder ---------------------------------------------------------------
const firstHeadingBefore = await page.evaluate(
  () => document.querySelector('[data-card-index="0"] input')?.value ?? '',
);
await page.locator('[data-card-index="0"]').hover();
await page.waitForTimeout(200);
await page.locator('[data-card-index="0"] button[aria-label^="Xuống"]').click();
await page.waitForTimeout(400);
const firstHeadingAfter = await page.evaluate(
  () => document.querySelector('[data-card-index="0"] input')?.value ?? '',
);
check('nút xuống đổi được thứ tự khối', firstHeadingBefore !== firstHeadingAfter,
  `${firstHeadingBefore} -> ${firstHeadingAfter}`);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
check(
  'hoàn tác trả lại đúng thứ tự cũ',
  (await page.evaluate(() => document.querySelector('[data-card-index="0"] input')?.value ?? '')) ===
    firstHeadingBefore,
);

// --- the table grid must never destroy itself ------------------------------
const tableCardIndex = await page.evaluate(
  () => [...document.querySelectorAll('[data-card-index]')].findIndex((c) => c.querySelector('table input')),
);
const tableCard = page.locator(`[data-card-index="${tableCardIndex}"]`);
const tableDims = () =>
  tableCard.evaluate((el) => ({
    rows: el.querySelectorAll('tbody tr').length,
    cols: el.querySelectorAll('thead th').length,
    grid: !!el.querySelector('table input'),
  }));
for (let i = 0; i < 8; i++) {
  const btn = tableCard.locator('button[title="Xóa cột"]:not([disabled])').first();
  if ((await btn.count()) === 0) break;
  await btn.click();
  await page.waitForTimeout(150);
}
for (let i = 0; i < 8; i++) {
  const btn = tableCard.locator('button[title="Xóa dòng"]:not([disabled])').first();
  if ((await btn.count()) === 0) break;
  await btn.click();
  await page.waitForTimeout(150);
}
const floor = await tableDims();
check(
  'xóa hết dòng/cột vẫn còn một bảng hợp lệ, không rơi về Markdown thô',
  floor.grid && floor.rows >= 1 && floor.cols >= 1,
  JSON.stringify(floor),
);
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(90);
}
await page.waitForTimeout(300);

// --- a plain paste inside a field stays a plain paste ----------------------
const cardsBeforePlain = await page.locator('[data-card-index]').count();
await page.locator('[data-card-index="2"] textarea').first().click();
await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData('text/plain', 'chuoi dan thu');
  document.activeElement?.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }),
  );
});
await page.waitForTimeout(400);
check(
  'dán chữ vào ô đang gõ dở thì dán thường, không tạo khối mới',
  (await page.locator('[data-card-index]').count()) === cardsBeforePlain,
);

// --- source view -----------------------------------------------------------
await page.getByRole('button', { name: 'Mã nguồn' }).click();
await page.waitForTimeout(300);
const sourceText = await page.evaluate(
  () => document.querySelector('[role="dialog"] textarea')?.value ?? '',
);
check('“Xem mã nguồn” mở ra Markdown thật', sourceText.startsWith('---') && sourceText.includes('# '),
  sourceText.slice(0, 40));
check('mã nguồn giữ nguyên nội dung tài liệu', sourceText.includes('Ước lượng huyết áp'),
  sourceText.slice(0, 120));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('đóng hộp thoại bằng Escape', (await page.locator('[role="dialog"]').count()) === 0);

// --- smart paste -----------------------------------------------------------
const pasteInto = async (text, html) => {
  await page.evaluate(
    ([t, h]) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', t);
      if (h) dt.setData('text/html', h);
      const target = document.querySelector('[data-card-index="2"]');
      target?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    },
    [text, html ?? ''],
  );
  await page.waitForTimeout(500);
};

const beforePaste = await page.locator('[data-card-index]').count();
await page.locator('[data-card-index="2"] header').click();
await pasteInto('A\tB\tC\n1\t2\t3\n4\t5\t6');
check(
  'Ctrl+V dữ liệu Excel tạo khối bảng mới',
  (await page.locator('[data-card-index]').count()) === beforePaste + 1,
  `${beforePaste} -> ${await page.locator('[data-card-index]').count()}`,
);
check(
  'khối vừa dán được gắn nhãn đã nhận dạng',
  await page.evaluate(() => document.body.innerText.includes('nhận dạng:')),
);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);

await page.locator('[data-card-index="2"] header').click();
await pasteInto('\\frac{a}{b} = \\sqrt{c}');
check(
  // Khối công thức mở ở tab "Xem trước", nên LaTeX gốc nằm trong ô nhập chứ
  // không nằm trong textContent — phải soi cả value của textarea.
  'Ctrl+V LaTeX tạo khối công thức',
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-card-index]')).some(
      (c) =>
        (c.textContent ?? '').includes('\\sqrt{c}') ||
        Array.from(c.querySelectorAll('textarea')).some((t) => t.value.includes('\\sqrt{c}')) ||
        !!c.querySelector('.katex .sqrt'),
    ),
  ),
);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);

// --- paste an image --------------------------------------------------------
const cardsBeforeImage = await page.locator('[data-card-index]').count();
await page.locator('[data-card-index="2"] header').click();
await page.evaluate(() => {
  // 1x1 transparent PNG
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], 'anh-chup.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  document
    .querySelector('[data-card-index="2"]')
    ?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
});
await page.waitForTimeout(1200);
check(
  'Ctrl+V ảnh từ clipboard tạo khối hình',
  (await page.locator('[data-card-index]').count()) === cardsBeforeImage + 1,
  `${cardsBeforeImage} -> ${await page.locator('[data-card-index]').count()}`,
);
check(
  'ảnh dán vào được lưu thành tài nguyên và hiển thị',
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-card-index] img')).some((i) =>
      i.src.startsWith('blob:'),
    ),
  ),
);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);

// --- drag one card onto another's edge to make a two-column row ------------
const beforeCols = await page.locator('[data-card-index]').count();
await page.evaluate(() => {
  const from = document.querySelector('[data-card-index="3"]');
  const to = document.querySelector('[data-card-index="2"]');
  if (!from || !to) return;
  const dt = new DataTransfer();
  const rect = to.getBoundingClientRect();
  from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
  const right = rect.left + rect.width * 0.9;
  const mid = rect.top + rect.height / 2;
  to.dispatchEvent(
    new DragEvent('dragover', { dataTransfer: dt, bubbles: true, clientX: right, clientY: mid }),
  );
  to.dispatchEvent(
    new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: right, clientY: mid }),
  );
});
await page.waitForTimeout(500);
check(
  'kéo ngang gộp hai khối thành hàng hai cột',
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-card-index] header')).some((h) =>
      (h.textContent ?? '').includes('Hai cột'),
    ),
  ),
  `cards ${beforeCols} -> ${await page.locator('[data-card-index]').count()}`,
);

await page.keyboard.press('Control+Enter');
await page.waitForTimeout(3500);
check(
  'hàng hai cột in ra thành lưới hai cột',
  (await page.locator('.sr-page-body .sr-colrow').count()) >= 1,
);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(3000);

/* -------------------------------------------------------- bìa theo template */

console.log('\nBìa tự động');

// Strip the cover, then switch template away and back.
await page.getByRole('button', { name: 'Mã nguồn' }).click();
await page.waitForTimeout(300);
const full = await page.evaluate(() => document.querySelector('[role="dialog"] textarea')?.value ?? '');
const stripped = full.replace(/^cover:\n(?:[ \t]+.*\n|\n)*/m, '');
await page.locator('[role="dialog"] textarea').fill(stripped);
await page.getByRole('button', { name: 'Áp dụng' }).click();
await page.waitForTimeout(700);
check('bỏ được khối cover để thử', !stripped.includes('\ncover:'));

await page.locator('nav button').nth(4).click();
await page.waitForTimeout(300);
const templateSelect = page.locator('select').first();
await templateSelect.selectOption('scientific-standard');
await page.waitForTimeout(600);
await templateSelect.selectOption('hcmut-btl');
await page.waitForTimeout(900);

await page.getByRole('button', { name: 'Mã nguồn' }).click();
await page.waitForTimeout(400);
const afterSwitch = await page.evaluate(
  () => document.querySelector('[role="dialog"] textarea')?.value ?? '',
);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check('đổi sang mẫu BTL tự thêm khối bìa', /^cover:$/m.test(afterSwitch), afterSwitch.slice(0, 80));
check('bìa mới dùng đúng chữ của khoa', afterSwitch.includes('Trường Đại học Bách khoa'));
check(
  'có báo cho người dùng biết bìa vừa được thêm',
  await page.evaluate(() => document.body.innerText.includes('đã được thêm vào front')),
);

await page.keyboard.press('Control+Enter');
await page.waitForTimeout(3500);
check('trang bìa dựng ra thật', (await page.locator('.sr-page-cover').count()) === 2,
  String(await page.locator('.sr-page-cover').count()));

/* ----------------------------------------------------------- render on demand */

console.log('\nRender theo yêu cầu');
const before = await page.locator('.sr-page').count();
const lastCard = (await page.locator('[data-card-index]').count()) - 1;
await page.locator(`[data-card-index="${lastCard}"] textarea`).last().click();
await page.keyboard.type(' Một đoạn mới vừa được gõ thêm vào cuối tài liệu.');
await page.waitForTimeout(800);

const afterTyping = await page.locator('.sr-page').count();
const typedVisible = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-card-index] textarea')).some((t) =>
    t.value.includes('Một đoạn mới vừa được gõ thêm'),
  ),
);
const previewHasIt = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body')).some((p) =>
    p.textContent.includes('Một đoạn mới vừa được gõ thêm'),
  ),
);
check('gõ chữ KHÔNG tự render lại', !previewHasIt && afterTyping === before, `pages ${before}->${afterTyping}`);
check('nội dung vừa gõ có trong canvas', typedVisible);
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

/* ------------------------------------------------- thiết kế & khổ màn hình */

console.log('\nThiết kế & khổ màn hình');

const fonts = await page.evaluate(() => {
  const loaded = Array.from(document.fonts)
    .filter((f) => f.status === 'loaded')
    .map((f) => f.family);
  const probe = document.createElement('span');
  probe.textContent = 'Đường kính ống nghiệm ẩm ướt';
  probe.style.cssText = 'position:absolute;left:-9999px;font-size:40px;white-space:nowrap';
  document.body.appendChild(probe);
  probe.style.fontFamily = "'Be Vietnam Pro'";
  const withFont = probe.getBoundingClientRect().width;
  probe.style.fontFamily = 'monospace';
  const fallback = probe.getBoundingClientRect().width;
  probe.remove();
  return { loaded: Array.from(new Set(loaded)), withFont, fallback };
});
check(
  'ba mặt chữ tự lưu trong app đều nạp được',
  ['Be Vietnam Pro', 'Literata', 'JetBrains Mono'].every((f) => fonts.loaded.includes(f)),
  JSON.stringify(fonts.loaded),
);
check(
  'chữ có dấu tiếng Việt dựng bằng mặt chữ thật, không rơi về font hệ thống',
  Math.abs(fonts.withFont - fonts.fallback) > 4,
  `${Math.round(fonts.withFont)} vs ${Math.round(fonts.fallback)}`,
);

const paper = await page.evaluate(() => {
  const host = document.querySelector('.sr-canvas');
  const sheet = document.querySelector('.sr-page');
  if (!host || !sheet) return null;
  const h = host.getBoundingClientRect();
  const g = sheet.getBoundingClientRect();
  return {
    left: g.left - h.left,
    right: h.right - g.right,
    overflow: host.scrollWidth - host.clientWidth,
    ground: getComputedStyle(host).backgroundColor,
  };
});
check(
  'tờ A4 nằm chính giữa cột xem trước',
  !!paper && Math.abs(paper.left - paper.right) <= 2,
  paper ? `${Math.round(paper.left)} / ${Math.round(paper.right)}` : 'không thấy trang',
);
check(
  'không sinh thanh cuộn ngang khi thu phóng',
  !!paper && paper.overflow <= 1,
  String(paper?.overflow),
);
check('giấy đặt trên nền xám trung tính', paper?.ground !== 'rgb(255, 255, 255)', paper?.ground);

// --- dưới 1180px: bản in trượt lên thành lớp phủ ---------------------------
await page.setViewportSize({ width: 1100, height: 900 });
await page.waitForTimeout(500);
check(
  'dưới 1180px có nút chuyển Soạn / Bản in',
  (await page.getByRole('tab', { name: 'Bản in' }).count()) === 1,
);
await page.getByRole('tab', { name: 'Bản in' }).click();
await page.waitForTimeout(500);
check(
  'chuyển sang Bản in thì thấy trang giấy',
  await page.locator('.sr-page').first().isVisible(),
);
check(
  'bản in che mất thanh công cụ nên có lối quay lại ngay trong đầu bản in',
  (await page.getByRole('button', { name: 'Soạn thảo' }).count()) === 1,
);
await page.getByRole('button', { name: 'Soạn thảo' }).click();
await page.waitForTimeout(450);
check(
  'quay lại được khung soạn thảo',
  await page.evaluate(() => (document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? '') === 'Soạn'),
);

// --- dưới 1000px: bảng bên nổi lên trên canvas, có lớp mờ ------------------
await page.setViewportSize({ width: 920, height: 900 });
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Chẩn đoán' }).click();
await page.waitForTimeout(450);
const flyout = await page.evaluate(() => {
  const aside = document.querySelector('aside[data-panel-open="true"]');
  if (!aside) return null;
  const scrim = document.querySelector('button[aria-label="Đóng bảng bên"]');
  return {
    position: getComputedStyle(aside).position,
    scrim: !!scrim && getComputedStyle(scrim).opacity === '1',
  };
});
check('dưới 1000px bảng bên nổi lên trên canvas', flyout?.position === 'fixed', JSON.stringify(flyout));
check('lớp mờ phía sau bảng bên hiện ra', flyout?.scrim === true);
await page.keyboard.press('Escape');
await page.locator('button[aria-label="Đóng bảng bên"]').click({ force: true });
await page.waitForTimeout(350);
check(
  'bấm ra ngoài thì bảng bên đóng lại',
  await page.evaluate(() => !document.querySelector('aside[data-panel-open="true"]')),
);
await page.setViewportSize({ width: 1500, height: 940 });
await page.waitForTimeout(500);

/* ------------------------------------------------------------ tải PDF thật */

console.log('\nTải PDF về máy');

const uiPages = await page.locator('.sr-page').count();
const [downloaded] = await Promise.all([
  page.waitForEvent('download', { timeout: 240_000 }),
  page.getByRole('button', { name: 'Xuất', exact: true }).click(),
]);
const pdfPath = await downloaded.path();
const { readFileSync } = await import('node:fs');
const pdfBuf = readFileSync(pdfPath);
const pdfText = pdfBuf.toString('latin1');
const mediaBoxes = [...pdfText.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((m) => m[1].trim());
check(
  'nút Xuất tải thẳng ra tệp .pdf, không chỉ mở hộp thoại in',
  downloaded.suggestedFilename().endsWith('.pdf') && pdfText.startsWith('%PDF-'),
  downloaded.suggestedFilename(),
);
check(
  'tệp PDF có đúng số trang như bản xem trước',
  mediaBoxes.length === uiPages,
  `${mediaBoxes.length} vs ${uiPages}`,
);
check(
  'mỗi trang PDF đúng khổ A4',
  new Set(mediaBoxes).size === 1 &&
    /^0 0 595\.\d+ 841\.\d+$/.test(mediaBoxes[0] ?? ''),
  mediaBoxes[0],
);
check('tệp PDF không rỗng', pdfBuf.length > 50_000, `${Math.round(pdfBuf.length / 1024)} KB`);

await page.screenshot({ path: 'scripts/screenshot.png', fullPage: false });
console.log('\nẢnh chụp màn hình: scripts/screenshot.png');

console.log(`\n${checks - failures}/${checks} kiểm tra đạt.`);
await browser.close();
process.exit(failures ? 1 : 0);
