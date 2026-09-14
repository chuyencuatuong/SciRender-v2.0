/**
 * Browser-level verification of the half of the pipeline that needs a DOM:
 * the layout engine (pagination, keep-with-next, orphan/widow) and the app shell.
 *
 * Usage:
 *   npm run build && npm run preview   # in one terminal
 *   node scripts/browser-check.mjs     # in another
 */
// Playwright is an optional dev tool, not a dependency of the app. Install it
// with `npm i -D playwright` (then `npx playwright install chromium`), or point
// PLAYWRIGHT_PATH at an existing installation.
const playwright = await import(process.env.PLAYWRIGHT_PATH || 'playwright').catch(() => {
  console.error(
    'Không tìm thấy playwright. Cài bằng: npm i -D playwright && npx playwright install chromium',
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.sr-page', { timeout: 20000 });
await page.waitForTimeout(2500);

console.log('\nApp shell');
check('editor mounted', (await page.locator('.cm-editor').count()) === 1);
check('side rail rendered', (await page.locator('nav button').count()) >= 7);
check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log('\nLayout engine');
const pageCount = await page.locator('.sr-page').count();
check('document paginated into several pages', pageCount >= 3, `pages=${pageCount}`);

const overflow = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body')).map(
    (el) => Math.round(el.scrollHeight - el.clientHeight),
  ),
);
check(
  'no page body overflows its text area',
  overflow.every((v) => v <= 2),
  `overflow px per page: ${overflow.join(', ')}`,
);

const orphanWidow = await page.evaluate(() => {
  // Same vertical-overlap clustering the layout engine uses: an inline KaTeX
  // span sits at a different `top` than its own line and must not be counted
  // as an extra line.
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
      if (n < 2) problems.push(`page ${i + 1}: orphan (${n} dòng cuối trang)`);
    }
    if (next?.getAttribute('data-sr-split') === 'tail') {
      const n = countLines(next);
      if (n < 2) problems.push(`page ${i + 2}: widow (${n} dòng đầu trang)`);
    }
  });
  return problems;
});
check('orphan/widow rules respected', orphanWidow.length === 0, orphanWidow.join('; '));

const danglingHeading = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body'))
    .map((body, i) =>
      body.lastElementChild?.getAttribute('data-sr-type') === 'heading' &&
      body.children.length > 1
        ? i + 1
        : null,
    )
    .filter(Boolean),
);
check('no heading left alone at a page bottom', danglingHeading.length === 0, `pages ${danglingHeading.join(',')}`);

const atomic = await page.evaluate(() => {
  const types = ['figure', 'table', 'equation', 'diagram', 'codeBlock'];
  const seen = new Map();
  const dupes = [];
  document.querySelectorAll('.sr-page-body [data-sr-id]').forEach((el) => {
    const type = el.getAttribute('data-sr-type');
    if (!types.includes(type ?? '')) return;
    const id = el.getAttribute('data-sr-id');
    if (seen.has(id)) dupes.push(`${type}:${id}`);
    seen.set(id, true);
  });
  return dupes;
});
check('atomic blocks never split across pages', atomic.length === 0, atomic.join(', '));

console.log('\nRendering');
check('KaTeX rendered', (await page.locator('.sr-page .katex').count()) > 0);
check('mermaid diagram rendered as SVG', (await page.locator('.sr-page .sr-mermaid svg').count()) > 0);
check('tables rendered', (await page.locator('.sr-page table').count()) >= 2);
check(
  'equation numbers present',
  (await page.locator('.sr-page .sr-equation-number').count()) >= 3,
);
check('no unresolved reference markers', (await page.locator('.sr-page .sr-unresolved').count()) === 0);
check('no LaTeX error markers', (await page.locator('.sr-page .sr-math-error').count()) === 0);

console.log('\nDeterminism');
const first = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body')).map((el) => el.innerHTML.length),
);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sr-page');
await page.waitForTimeout(2500);
const second = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sr-page-body')).map((el) => el.innerHTML.length),
);
check(
  'same input yields the same pagination after reload',
  JSON.stringify(first) === JSON.stringify(second),
  `${JSON.stringify(first)} vs ${JSON.stringify(second)}`,
);

console.log('\nInteraction');
await page.locator('nav button').nth(2).click(); // Document Health
await page.waitForTimeout(300);
check('health panel opens', (await page.getByText('trên 100 điểm').count()) > 0);
await page.locator('nav button').nth(1).click(); // Diagnostics
await page.waitForTimeout(300);
check('diagnostics panel opens', (await page.getByText('Chẩn đoán').count()) > 0);

await page.screenshot({ path: 'scripts/screenshot.png', fullPage: false });
console.log('\nẢnh chụp màn hình: scripts/screenshot.png');

console.log(`\n${checks - failures}/${checks} kiểm tra đạt.`);
await browser.close();
process.exit(failures ? 1 : 0);
