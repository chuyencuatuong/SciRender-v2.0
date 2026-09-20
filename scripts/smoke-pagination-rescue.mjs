/**
 * Regression guard for the table/code "last resort" page split.
 *
 * The bug: a table whose next row does not fit could not be split at all when
 * `layout.tableOrphans` demanded more rows per side than the page had room
 * for. `splitTable` returned null, `paginate` fell through to the atomic
 * branch, and the table was committed to a page it did not fit on — the
 * overflowing rows clipped away by the page box's `overflow: hidden`. Only an
 * SR-L001 warning marked the loss.
 *
 * Case A must split. Case B proves a `rowspan` group is still never cut
 * through. Case C proves a genuinely oversized single row still warns rather
 * than looping or pretending to succeed.
 *
 * Needs a DOM, so it runs in Chromium like `browser-check.mjs`, but it needs
 * no dev server: the layout engine is bundled with esbuild and evaluated in a
 * blank page.
 *
 * Usage:  node scripts/smoke-pagination-rescue.mjs
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const playwright = await import(process.env.PLAYWRIGHT_PATH || 'playwright').catch(() => {
  console.error('Không tìm thấy playwright. Cài: pnpm exec playwright install chromium');
  process.exit(2);
});
const { chromium } = playwright.chromium ? playwright : playwright.default;

const dir = join('node_modules', '.cache', 'scirender-pagination');
mkdirSync(dir, { recursive: true });
const outfile = join(dir, 'layout.js');

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

try {
  await build({
    stdin: {
      contents: `
        import { paginate, optionsFromTemplate } from '@scirender/layout-engine';
        import { findTemplate, resolveTemplate } from '@scirender/template-engine';
        globalThis.SR = { paginate, optionsFromTemplate, findTemplate, resolveTemplate };
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    logLevel: 'error',
  });

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body><div id="host"></div></body></html>');
  await page.addScriptTag({ content: readFileSync(outfile, 'utf8') });

  const results = await page.evaluate(() => {
    const SR = globalThis.SR;
    const tpl = SR.resolveTemplate(SR.findTemplate('hcmut-btl'));
    const style = document.createElement('style');
    style.textContent = tpl.css;
    document.head.appendChild(style);
    const host = document.getElementById('host');
    const opts = SR.optionsFromTemplate(tpl);

    const inspect = (html, tokens) => {
      const r = SR.paginate([html], opts, host);
      const joined = r.pages.join('');
      const text = joined.replace(/<[^>]+>/g, ' ');
      const tbody = (joined.match(/<tbody>[\s\S]*?<\/tbody>/g) ?? []).join('');
      return {
        pages: r.pages.length,
        warnings: r.warnings.map((w) => w.code),
        bodyRows: tbody.match(/<tr/g)?.length ?? 0,
        rowspanCells: (joined.match(/rowspan="\d+"/g) ?? []).length,
        continuation: joined.includes('data-sr-continuation'),
        missing: tokens.filter((t) => !text.includes(t)),
      };
    };

    const tallRow = `
      <div class="sr-table-wrap" data-sr-type="table" data-sr-id="t1">
        <table><thead><tr><th>Đại lượng</th><th>Giá trị</th></tr></thead><tbody>
          <tr><td><div style="height:700px">CT-CAO</div></td><td>V1</td></tr>
          <tr><td><div style="height:400px">HANG-2</div></td><td>V2</td></tr>
          <tr><td><div style="height:400px">HANG-3</div></td><td>V3</td></tr>
        </tbody></table>
        <div class="sr-caption">Bảng 1. Thông số</div>
      </div>`;

    const rowspanGroups = `
      <div class="sr-table-wrap" data-sr-type="table" data-sr-id="t2">
        <table><thead><tr><th>Nhóm</th><th>Thành viên</th></tr></thead><tbody>
          ${Array.from({ length: 4 }, (_, g) =>
            Array.from({ length: 6 }, (_, i) =>
              `<tr>${i === 0 ? `<td rowspan="6">Nhom${g + 1}</td>` : ''}<td><div style="height:90px">TV${g * 6 + i + 1}</div></td></tr>`,
            ).join(''),
          ).join('')}
        </tbody></table>
      </div>`;

    const impossible = `
      <div class="sr-table-wrap" data-sr-type="table" data-sr-id="t3">
        <table><thead><tr><th>A</th></tr></thead><tbody>
          <tr><td><div style="height:1400px">QUA-CAO</div></td></tr>
          <tr><td><div style="height:200px">BINH-THUONG</div></td></tr>
        </tbody></table>
      </div>`;

    return {
      A: inspect(tallRow, ['CT-CAO', 'HANG-2', 'HANG-3']),
      B: inspect(rowspanGroups, Array.from({ length: 24 }, (_, i) => `TV${i + 1}`)),
      C: inspect(impossible, ['QUA-CAO', 'BINH-THUONG']),
    };
  });

  await browser.close();

  console.log('\nCứu hộ chia trang (bảng cao hơn chỗ còn lại)');
  const { A, B, C } = results;
  check('A · bảng có dòng cao được chia sang 2 trang', A.pages === 2, JSON.stringify(A));
  check('A · không còn cảnh báo tràn SR-L001', !A.warnings.includes('SR-L001'), A.warnings.join());
  check('A · nửa sau được đánh dấu là phần tiếp theo', A.continuation === true);
  check('A · đủ 3 dòng, không mất dòng nào', A.bodyRows === 3 && A.missing.length === 0, JSON.stringify(A));

  check('B · nhóm rowspan không bị cắt ngang', B.rowspanCells === 4, `rowspanCells=${B.rowspanCells}`);
  check('B · đủ 24 dòng qua các trang', B.bodyRows === 24 && B.missing.length === 0, JSON.stringify(B));
  check('B · không có cảnh báo', B.warnings.length === 0, B.warnings.join());

  check('C · một dòng cao hơn cả trang vẫn báo SR-L001', C.warnings.includes('SR-L001'), C.warnings.join());
  check('C · không dựng ra trang thừa', C.pages === 1, `pages=${C.pages}`);

  console.log(failures ? `\n${failures} kiểm tra THẤT BẠI.` : '\nToàn bộ kiểm tra đạt.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failures ? 1 : 0);
