/**
 * Smoke test for the pure (DOM-free) half of the pipeline.
 *
 * Run with: pnpm smoke
 *
 * Exercises parser -> numbering -> validator -> intelligence -> renderer on the
 * bundled BTL sample plus adversarial inputs, and asserts the invariants the
 * seven principles depend on — including that the HCMUT template matches the
 * faculty's written spec. Pagination needs a real browser and is checked by
 * `scripts/browser-check.mjs`.
 */
import { analyse } from '../packages/intelligence/src/index.js';
import { parse } from '../packages/parser/src/index.js';
import {
  applyDiagramDirection,
  render,
  renderFrontMatter,
} from '../packages/renderer-html/src/index.js';
import {
  assignNumbers,
  findTemplate,
  formatPageNumber,
  HCMUT_BTL,
  resolveTemplate,
} from '../packages/template-engine/src/index.js';
import { validate } from '../packages/validator/src/index.js';
import { SAMPLE_DOCUMENT } from '../apps/web/src/lib/sample.js';

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail?: string): void {
  checks++;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name: string): void {
  console.log(`\n${name}`);
}

const ASSETS = { 'logo-bk': 'data:image/png;base64,iVBORw0KGgo=' };

function compile(source: string, templateId = 'hcmut-btl') {
  const parsed = parse(source);
  const template = resolveTemplate(findTemplate(parsed.document.meta.templateId ?? templateId));
  const numbering = assignNumbers(parsed.document, template.descriptor);
  const diagnostics = [
    ...parsed.diagnostics,
    ...numbering.diagnostics,
    ...validate(parsed.document, {
      assets: ASSETS,
      requireKeywords: template.descriptor.cover.layout === 'none',
    }),
  ];
  const health = analyse(parsed.document, diagnostics);
  const rendered = render(parsed.document, { template: template.descriptor, assets: ASSETS });
  return { doc: parsed.document, diagnostics, health, rendered, template };
}

/* ---------------------------------------------- HCMUT BTL template contract */

section('Template HCMUT BTL khớp quy cách khoa ban hành');
const t = HCMUT_BTL;
check('là template mặc định', findTemplate(undefined).id === 'hcmut-btl');
check('khổ A4', t.page.width === '210mm' && t.page.height === '297mm');
check(
  'lề trái 25mm, phải/trên/dưới 15mm',
  t.page.margin.left === '25mm' &&
    t.page.margin.right === '15mm' &&
    t.page.margin.top === '15mm' &&
    t.page.margin.bottom === '15mm',
  JSON.stringify(t.page.margin),
);
check('số trang cách đáy 5mm', t.page.footerFromBottom === '5mm');
check('không dùng header', t.layout.pageNumberPosition === 'footer-center');
check('Times New Roman đứng đầu font stack', t.typography.bodyFont.startsWith('"Times New Roman"'));
check('nội dung 13pt, giãn 1.5', t.typography.bodySize === '13pt' && t.typography.lineHeight === 1.5);
check(
  'nội dung cách trước 10pt, sau 0pt',
  t.typography.spaceBefore === '10pt' && t.typography.spaceAfter === '0pt',
);

const [h1, h2, h3, h4] = t.headings.levels;
check(
  'H1 14pt đậm in hoa, before/after 24pt, single',
  h1!.size === '14pt' && h1!.weight === 700 && h1!.uppercase && h1!.spaceBefore === '24pt' &&
    h1!.spaceAfter === '24pt' && h1!.lineHeight === 1,
);
check('H1 đánh số "CHƯƠNG {n}." và sang trang mới', h1!.numberFormat === 'CHƯƠNG {n}.' && h1!.pageBreakBefore);
check(
  'H2 13pt đậm, before 6pt after 12pt',
  h2!.size === '13pt' && h2!.weight === 700 && !h2!.italic && h2!.spaceBefore === '6pt' && h2!.spaceAfter === '12pt',
);
check('H3 13pt đậm + nghiêng', h3!.size === '13pt' && h3!.weight === 700 && h3!.italic);
check('H4 13pt nghiêng, không đậm', h4!.size === '13pt' && h4!.weight === 400 && h4!.italic);
check('đánh số tiểu mục tối đa 4 chữ số', t.headings.numberDepth === 4);
check('chú thích canh giữa, cùng cỡ chữ nội dung', t.captions.align === 'center' && t.captions.fontSize === '1em');
check('phần đầu đánh số i, ii, iii', t.layout.frontPageNumbers === 'roman-lower');
check('nội dung đánh số 1, 2, 3', t.layout.bodyPageNumbers === 'arabic');
check('hình/bảng đánh số theo chương', t.numbering.figures === 'section' && t.numbering.tables === 'section');
check('trích dẫn kiểu số, kiểu APA', t.citation.style === 'numeric' && t.citation.references === 'apa');

section('Số trang La Mã');
check('1 -> i', formatPageNumber(1, 'roman-lower') === 'i');
check('4 -> iv', formatPageNumber(4, 'roman-lower') === 'iv');
check('9 -> ix', formatPageNumber(9, 'roman-lower') === 'ix');
check('14 -> xiv', formatPageNumber(14, 'roman-lower') === 'xiv');
check('4 -> IV (hoa)', formatPageNumber(4, 'roman-upper') === 'IV');
check('7 -> 7 (arabic)', formatPageNumber(7, 'arabic') === '7');
check('none -> rỗng', formatPageNumber(3, 'none') === '');

/* ------------------------------------------------------------ sample document */

section('Bài mẫu BTL');
const s = compile(SAMPLE_DOCUMENT);

check('front matter parsed', s.doc.meta.title.startsWith('Ước lượng huyết áp'));
check('template lấy từ front matter', s.template.descriptor.id === 'hcmut-btl');
check('có lời cảm ơn', Boolean(s.doc.meta.acknowledgement));
check('có 4 từ viết tắt', s.doc.meta.abbreviations.length === 4, String(s.doc.meta.abbreviations.length));
check('bibliography parsed', s.doc.meta.bibliography.length === 3);
check(
  'thành viên bìa được tính là tác giả',
  !s.diagnostics.some((d) => d.code === 'SR-V002'),
  s.diagnostics.filter((d) => d.code === 'SR-V002').map((d) => d.message).join(' | '),
);
check(
  'mẫu có bìa thì không nhắc từ khóa',
  !s.diagnostics.some((d) => d.code === 'SR-V005'),
);

const cover = s.doc.meta.cover;
check('cover parsed', Boolean(cover));
check('trường và khoa', cover?.school === 'Trường Đại học Bách khoa' && Boolean(cover?.faculty));
check('3 thành viên có MSSV', cover?.members.length === 3 && cover?.members.every((m) => m.studentId));
check('GVHD và lớp/nhóm', Boolean(cover?.advisor) && cover?.class === 'L01' && cover?.group === 'Nhóm 1');

check('dựng 2 trang bìa', s.rendered.coverPages.length === 2, String(s.rendered.coverPages.length));
check('bìa có tên trường', s.rendered.coverPages[0]!.includes('Trường Đại học Bách khoa'));
check('bìa có logo', s.rendered.coverPages[0]!.includes('sr-cover-logo'));
check('phụ bìa có MSSV', s.rendered.coverPages[1]!.includes('MSSV'));
check('bìa không nằm trong phần thân', !s.rendered.html.includes('sr-cover-org'));

const html = s.rendered.html;
check('H1 in ra "CHƯƠNG 1."', html.includes('CHƯƠNG 1.'), html.slice(0, 120));
check('H1 mang cờ sang trang', html.includes('data-sr-break="page"'));
check('hình đánh số theo chương', s.doc.labels['fig:logo']?.number === '1.1', s.doc.labels['fig:logo']?.number);
check('công thức 2.1', s.doc.labels['eq:sbp']?.number === '2.1', s.doc.labels['eq:sbp']?.number);
check('bảng chương 2 là 2.1', s.doc.labels['tbl:thietbi']?.number === '2.1', s.doc.labels['tbl:thietbi']?.number);
check('bảng chương 3 là 3.1', s.doc.labels['tbl:dulieu']?.number === '3.1', s.doc.labels['tbl:dulieu']?.number);
check('mã nguồn được đánh số', s.doc.labels['lst:ptt']?.number === '3.1', s.doc.labels['lst:ptt']?.number);
check('sơ đồ có nhãn', Boolean(s.doc.labels['dia:pipeline']));
check('caption "Hình 1.1"', html.includes('Hình 1.1'));
check('caption "Bảng 3.1"', html.includes('Bảng 3.1'));
check('caption "Mã nguồn 3.1"', html.includes('Mã nguồn 3.1'));
check('khối mã có máng số dòng', html.includes('sr-code-gutter'));

const unresolved = s.diagnostics.filter((d) => d.code === 'SR-V012');
check('mọi tham chiếu chéo phân giải được', unresolved.length === 0, unresolved.map((d) => d.message).join(' | '));
const badCitations = s.diagnostics.filter((d) => d.code === 'SR-V014');
check('mọi trích dẫn phân giải được', badCitations.length === 0, badCitations.map((d) => d.message).join(' | '));
const mathErrors = s.diagnostics.filter((d) => d.stage === 'equation');
check('mọi công thức LaTeX biên dịch được', mathErrors.length === 0, mathErrors.map((d) => d.message).join(' | '));
check('không có dấu hiệu chưa phân giải trên trang', !html.includes('sr-unresolved'));

/* ------------------------------------------------------------- front matter */

section('Phần đầu (mục lục, danh mục)');
const numbers = {
  bodyPageOf: Object.fromEntries(
    [...s.rendered.outline.map((o) => o.id), ...s.rendered.figures.map((f) => f.id),
     ...s.rendered.tables.map((t2) => t2.id)].map((id, i) => [id, i + 1]),
  ),
  frontPageOf: { figureList: 4, tableList: 5, abbreviationList: 6 } as Record<string, number>,
  referencesPage: 9,
};
const front = renderFrontMatter(s.doc, s.template.descriptor, {
  outline: s.rendered.outline,
  figures: s.rendered.figures,
  tables: s.rendered.tables,
  numbers: numbers as never,
});
const frontHtml = front.join('\n');

check('6 khối phần đầu', front.length === 6, String(front.length));
check('có TÓM TẮT BÀI BÁO CÁO', frontHtml.includes('TÓM TẮT BÀI BÁO CÁO'));
check('có LỜI CẢM ƠN', frontHtml.includes('LỜI CẢM ƠN'));
check('có MỤC LỤC', frontHtml.includes('MỤC LỤC'));
check('có DANH MỤC CÁC HÌNH ẢNH', frontHtml.includes('DANH MỤC CÁC HÌNH ẢNH'));
check('có DANH MỤC BẢNG BIỂU', frontHtml.includes('DANH MỤC BẢNG BIỂU'));
check('có DANH MỤC CÁC TỪ VIẾT TẮT', frontHtml.includes('DANH MỤC CÁC TỪ VIẾT TẮT'));
check('mỗi mục phần đầu sang trang mới', (frontHtml.match(/data-sr-break="page"/g) ?? []).length === 6);
check('mục lục dẫn danh mục hình kèm số La Mã', frontHtml.includes('>iv<'));
check('mục lục có CHƯƠNG 1.', frontHtml.includes('CHƯƠNG 1.'));
check('mục lục có TÀI LIỆU THAM KHẢO trang 9', frontHtml.includes('TÀI LIỆU THAM KHẢO') && frontHtml.includes('>9<'));
check('có dấu chấm dẫn (leaders)', frontHtml.includes('sr-list-fill'));
check('3 hình vào danh mục', s.rendered.figures.length === 3, String(s.rendered.figures.length));
check('3 bảng vào danh mục', s.rendered.tables.length === 3, String(s.rendered.tables.length));

const fewFigures = compile(
  SAMPLE_DOCUMENT.replace(/\n: Quy trình hiệu chuẩn theo từng đối tượng \{#dia:hieuchuan\}\n/, '\n'),
);
const frontFew = renderFrontMatter(fewFigures.doc, fewFigures.template.descriptor, {
  outline: fewFigures.rendered.outline,
  figures: fewFigures.rendered.figures,
  tables: fewFigures.rendered.tables,
  numbers: { bodyPageOf: {}, frontPageOf: {} },
}).join('\n');
check(
  'dưới 3 hình thì không in danh mục hình',
  !frontFew.includes('DANH MỤC CÁC HÌNH ẢNH'),
  `figures=${fewFigures.rendered.figures.length}`,
);

/* ---------------------------------------------------------------- diagrams */

section('Sơ đồ khối');
check(
  'đổi LR sang TB cho bản render',
  applyDiagramDirection('flowchart LR\n  A --> B', 'TB') === 'flowchart TB\n  A --> B',
);
check(
  'giữ nguyên khi không phải flowchart',
  applyDiagramDirection('sequenceDiagram\n  A->>B: x', 'TB') === 'sequenceDiagram\n  A->>B: x',
);
check('graph cũng đổi được', applyDiagramDirection('graph TD\n  A-->B', 'LR') === 'graph LR\n  A-->B');
const dirDoc = compile(`---
title: T
---

# C

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

: Sơ đồ {#dia:x dir=LR}
`);
const diagramNode = dirDoc.doc.children.find((n) => n.type === 'diagram');
check(
  'thuộc tính dir được đọc',
  diagramNode?.type === 'diagram' && diagramNode.direction === 'LR',
  diagramNode?.type === 'diagram' ? String(diagramNode.direction) : 'missing',
);
check(
  'AST giữ nguyên nguồn gốc (P1)',
  diagramNode?.type === 'diagram' && diagramNode.value.includes('flowchart LR'),
);

/* --------------------------------------------------------------------- CSS */

section('CSS sinh ra từ template');
const css = s.template.css;
check('lề trái 25mm', css.includes('--sr-margin-left:25mm'));
check('footer cách đáy 5mm', css.includes('--sr-footer-bottom:5mm'));
check('cỡ chữ 13pt', css.includes('--sr-body-size:13pt'));
check('Times New Roman', css.includes('"Times New Roman"'));
check('h1 in hoa', /\.sr-doc h1\{[^}]*text-transform:uppercase/.test(css));
check('h3 nghiêng', /\.sr-doc h3\{[^}]*font-style:italic/.test(css));
check('h4 không đậm', /\.sr-doc h4\{[^}]*font-weight:400/.test(css));
check('chú thích canh giữa', /\.sr-doc figcaption[^{]*\{[^}]*text-align:center/.test(css));

/* --------------------------------------------------------------- determinism */

section('P2 — Deterministic rendering');
const a = compile(SAMPLE_DOCUMENT);
const b = compile(SAMPLE_DOCUMENT);
check('HTML giống hệt giữa hai lần chạy', a.rendered.html === b.rendered.html);
check('bìa giống hệt', JSON.stringify(a.rendered.coverPages) === JSON.stringify(b.rendered.coverPages));
check('chẩn đoán giống hệt', JSON.stringify(a.diagnostics) === JSON.stringify(b.diagnostics));
check('điểm health giống hệt', a.health.score === b.health.score);

const asStandard = compile(SAMPLE_DOCUMENT.replace('template: hcmut-btl', 'template: scientific-standard'));
check('đổi template thì bỏ bìa', asStandard.rendered.coverPages.length === 0);
check('đổi template giữ nguyên cấu trúc AST', asStandard.doc.children.length === s.doc.children.length);
check('đổi template đổi cách đánh số đề mục', !asStandard.rendered.html.includes('CHƯƠNG 1.'));

/* ------------------------------------------------------------- fail loudly */

section('P6 — Fail loudly');
const broken = compile(`---
title: Tài liệu hỏng
template: scientific-standard
---

# Mục một

Tham chiếu hỏng @fig:khong-ton-tai và trích dẫn hỏng [@khong-co].

$$
\\frac{1}{
$$ {#eq:hong}

### Nhảy thẳng xuống cấp 3

| a | b |
|---|---|
| 1 |
`);
const codes = new Set(broken.diagnostics.map((d) => d.code));
check('tham chiếu chéo hỏng được báo', codes.has('SR-V012'));
check('khoá trích dẫn lạ được báo', codes.has('SR-V014'));
check('lỗi LaTeX được báo', codes.has('SR-V021'));
check('nhảy cấp đề mục được báo', codes.has('SR-V008'));
check('dòng bảng lệch ô được báo', codes.has('SR-P020'));
check('công thức hỏng vẫn hiện dấu hiệu lỗi', broken.rendered.html.includes('sr-math-error'));
check('tham chiếu hỏng hiện rõ', broken.rendered.html.includes('sr-unresolved'));
check('điểm health bị phạt', broken.health.score < s.health.score, `${broken.health.score} vs ${s.health.score}`);

/* --------------------------------------------------------- content integrity */

section('P1 — Content integrity');
const tricky = compile(`---
title: Ký tự đặc biệt
---

# Kiểm tra

Văn bản có <script>alert(1)</script> và & và ký tự "nháy".

\`\`\`python
x = {"a": 1 & 2}  # < > &
\`\`\`

Công thức giữ nguyên: $a \\le b$ và $x^{2}_{i}$.
`);
check('HTML thô bị escape, không thực thi', !tricky.rendered.html.includes('<script>alert'));
check('dấu & được escape', tricky.rendered.html.includes('&amp;'));
const codeNode = tricky.doc.children.find((n) => n.type === 'codeBlock');
check(
  'nội dung khối mã giữ nguyên từng ký tự',
  codeNode?.type === 'codeBlock' && codeNode.value === 'x = {"a": 1 & 2}  # < > &',
  codeNode?.type === 'codeBlock' ? JSON.stringify(codeNode.value) : 'missing',
);

/* -------------------------------------------------------------- edge cases */

section('Trường hợp biên');
check('đầu vào rỗng không ném lỗi', compile('').doc.children.length === 0);
check('chỉ có front matter', compile('---\ntitle: X\n---\n').doc.meta.title === 'X');
const noFm = compile('# Tiêu đề từ H1\n\nNội dung.');
check('tiêu đề lấy từ H1 đầu tiên', noFm.doc.meta.title === 'Tiêu đề từ H1', noFm.doc.meta.title);
const dup = compile(`# A {#sec:x}\n\n# B {#sec:x}\n`);
check('nhãn trùng được báo', dup.diagnostics.some((d) => d.code === 'SR-V011'));
const nested = compile('- một\n  - lồng nhau\n- hai\n\n1. số\n2. số hai\n');
check('danh sách parse được', nested.doc.children.filter((n) => n.type === 'list').length === 2);
const inlineHeavy = compile(
  '# H\n\n**đậm** *nghiêng* `mã` H~2~O E^2^ [liên kết](https://example.com) $a+b$\n',
);
for (const tag of ['<strong>', '<em>', '<code>', '<sub>', '<sup>', '<a href=', 'katex']) {
  check(`inline ${tag} render được`, inlineHeavy.rendered.html.includes(tag));
}
const unclosed = compile('$$\na = b\n');
check('khối công thức chưa đóng được báo', unclosed.diagnostics.some((d) => d.code === 'SR-P010'));
const refDot = compile(`# A

Xem @tbl:x. Hết câu.

| a |
|---|
| 1 |

: B {#tbl:x}
`);
check(
  'tham chiếu cuối câu giữ dấu chấm',
  refDot.rendered.html.includes('. Hết câu.') && !refDot.rendered.html.includes('sr-unresolved'),
);

/* ----------------------------------------------------------------- summary */

console.log(`\n${checks - failures}/${checks} kiểm tra đạt.`);
if (failures) {
  console.log(`${failures} kiểm tra THẤT BẠI.`);
  process.exit(1);
}
console.log('Toàn bộ kiểm tra đạt.');
