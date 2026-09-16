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
  type TemplateDescriptor,
} from '../packages/template-engine/src/index.js';
import { validate } from '../packages/validator/src/index.js';
import {
  detectKind,
  makeColumns,
  moveCard,
  splitColumns,
  searchTemplates,
  toCards,
  toSource,
  CARD_TEMPLATES,
} from '../apps/web/src/lib/cards.js';
import { detectPaste } from '../apps/web/src/lib/paste.js';
import { needsCover, withCover } from '../apps/web/src/lib/cover.js';
import {
  headingDepth,
  parseCode,
  parseDiagram,
  parseEquation,
  parseFigure,
  parseTable,
  serializeCode,
  serializeDiagram,
  serializeEquation,
  serializeFigure,
  serializeTable,
  setHeadingDepth,
  type CodeForm,
  type DiagramForm,
  type EquationForm,
  type FigureForm,
  type TableForm,
} from '../apps/web/src/lib/card-forms.js';
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

function compile(
  source: string,
  templateId = 'hcmut-btl',
  mutate?: (d: TemplateDescriptor) => TemplateDescriptor,
) {
  const parsed = parse(source);
  const base = findTemplate(parsed.document.meta.templateId ?? templateId);
  const template = resolveTemplate(mutate ? mutate(base) : base);
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
check('4 bảng vào danh mục', s.rendered.tables.length === 4, String(s.rendered.tables.length));

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

/* ------------------------------------------------------ syntax highlighting */

section('Tô màu cú pháp');

const PY_SRC = [
  'def ptt(peak, foot):',
  '    # Khoảng truyền sóng, tính bằng ms',
  '    dt = peak - foot',
  '    if dt <= 0:',
  "        raise ValueError('dt phải dương')",
  '    return 1000 * dt',
].join('\n');

const hlDoc = compile(['```python', PY_SRC, '```', '', ': Tính PTT {#lst:ptt}'].join('\n'));
const codeInner = /<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/.exec(hlDoc.rendered.html)?.[1] ?? '';

check('khối mã python được tô màu', codeInner.includes('sr-hl-keyword'), codeInner.slice(0, 80));
check(
  'chuỗi và chú thích được tô màu',
  codeInner.includes('sr-hl-string') && codeInner.includes('sr-hl-comment'),
);

// P1 — colouring adds markup and nothing else.
const strippedCode = codeInner
  .replace(/<[^>]*>/g, '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');
check(
  'tô màu không đổi một ký tự nào của mã',
  strippedCode === PY_SRC,
  JSON.stringify(strippedCode.slice(0, 60)),
);

check(
  'ngôn ngữ lạ thì để nguyên, không đoán',
  !compile('```khong-co-ngon-ngu-nay\nx = 1\n```').rendered.html.includes('sr-hl-'),
);
check(
  'khối mã không ghi ngôn ngữ thì không tô',
  !compile('```\nx = 1\n```').rendered.html.includes('sr-hl-'),
);
check(
  'tắt tô màu trong template thì mã trở lại đen trắng',
  !compile('```python\nx = 1\n```', 'hcmut-btl', (d) => ({
    ...d,
    code: { ...d.code, highlight: false },
  })).rendered.html.includes('sr-hl-'),
);
check(
  'matlab cũng được tô màu',
  compile('```matlab\nfor i = 1:10\n  disp(i);\nend\n```').rendered.html.includes('sr-hl-keyword'),
);

/* ---------------------------------------------------------------- footnotes */

section('Chú thích chân trang');

const fnDoc = compile(
  [
    'Huyết áp tâm thu[^ht] tỉ lệ nghịch với PTT[^ptt].',
    '',
    '[^ht]: Systolic blood pressure, đo bằng mmHg.',
    '[^ptt]: Pulse transit time — *khoảng truyền sóng mạch*.',
    '  Dòng thụt lề này vẫn thuộc chú thích trên.',
  ].join('\n'),
);
check('định nghĩa chú thích được tách khỏi dòng văn bản', fnDoc.doc.footnotes.length === 2,
  String(fnDoc.doc.footnotes.length));
const fnOrder = fnDoc.doc.footnotes.map((f) => `${f.label}=${f.number}`).join(',');
check('chú thích đánh số theo thứ tự được tham chiếu', fnOrder === 'ht=1,ptt=2', fnOrder);
check('định nghĩa không lọt vào thân bài',
  !fnDoc.rendered.html.includes('[^ht]:'));
check('tham chiếu render thành sup có data-sr-fn',
  fnDoc.rendered.html.includes('data-sr-fn="1"') && fnDoc.rendered.html.includes('data-sr-fn="2"'));
check('nội dung chú thích giữ định dạng nội dòng',
  (fnDoc.rendered.footnotes['2'] ?? '').includes('<em>khoảng truyền sóng mạch</em>'));
check('dòng thụt lề được gộp vào chú thích',
  (fnDoc.rendered.footnotes['2'] ?? '').includes('Dòng thụt lề này'));

const fnMissing = compile('Câu có chú thích lạ[^khong-co].');
check('tham chiếu không có định nghĩa bị báo lỗi',
  fnMissing.diagnostics.some((d) => d.code === 'SR-V015'));
const fnUnused = compile('Không ai dùng.\n\n[^thua]: Nội dung thừa.');
check('định nghĩa không ai dùng được nhắc',
  fnUnused.diagnostics.some((d) => d.code === 'SR-V034'));

/* --------------------------------------------------- author-year citations */

section('Trích dẫn author-year');

const BIB = [
  '---',
  'title: T',
  'bibliography:',
  '  - key: nguyen2020',
  '    authors: Nguyễn Văn A',
  '    year: 2020',
  '    title: Bài một',
  '  - key: tran2019',
  '    authors: Trần B, Lê C',
  '    year: 2019',
  '    title: Bài hai',
  '  - key: pham2021',
  '    authors: Phạm D, Hoàng E, Vũ F',
  '    year: 2021',
  '    title: Bài ba',
  '---',
  '',
  'Một [@nguyen2020], hai [@tran2019], ba [@pham2021].',
].join('\n');

const ayHtml = compile(BIB, 'hcmut-btl', (d) => ({
  ...d,
  citation: { ...d.citation, style: 'author-year' },
})).rendered.html;
check('một tác giả ra "Họ, năm"', ayHtml.includes('(Nguyễn, 2020)'));
check('hai tác giả nối bằng liên từ của template', ayHtml.includes('(Trần và Lê, 2019)'));
check('ba tác giả trở lên rút thành và cs.', ayHtml.includes('(Phạm và cs., 2021)'));
check('danh mục author-year không đánh số [n]',
  !/sr-reference-item"><span>\[1\]/.test(ayHtml));

const numHtml = compile(BIB).rendered.html;
check('kiểu numeric vẫn ra [1] [2] [3]',
  numHtml.includes('[1]') && numHtml.includes('[2]') && numHtml.includes('[3]'));

/* ------------------------------------------------------- cross-ref mã nguồn */

const lstDoc = compile(
  ['```python', 'x = 1', '```', '', ': Chú thích {#lst:x}', '', 'Xem @lst:x.'].join('\n'),
);
check('tham chiếu @lst: phân giải được',
  lstDoc.rendered.html.includes('sr-crossref') && !lstDoc.rendered.html.includes('@lst:x'),
);

/* --------------------------------------------------------- hàng hai cột */

section('Hàng hai cột');

const colsDoc = compile(
  ['::: cols', 'Cột trái có **đậm**.', '|||', '| A | B |', '|---|---|', '| 1 | 2 |', ':::'].join('\n'),
);
const colsNode = colsDoc.doc.children.find((n) => n.type === 'columns');
check('hàng hai cột parse thành node columns', colsNode?.type === 'columns');
check('có đúng hai cột', colsNode?.type === 'columns' && colsNode.columns.length === 2,
  colsNode?.type === 'columns' ? String(colsNode.columns.length) : 'missing');
check('cột phải giữ nguyên là bảng',
  colsNode?.type === 'columns' && colsNode.columns[1]?.[0]?.type === 'table');
check('render ra lưới hai cột', colsDoc.rendered.html.includes('sr-colrow') &&
  (colsDoc.rendered.html.match(/sr-col"/g) ?? []).length === 2);

const colsOne = compile('::: cols\nChỉ một cột.\n:::');
check('thiếu dòng ||| thì được cảnh báo',
  colsOne.diagnostics.some((d) => d.code === 'SR-P013'));
const colsOpen = compile('::: cols\nA\n|||\nB');
check('không đóng ::: thì báo lỗi',
  colsOpen.diagnostics.some((d) => d.code === 'SR-P012'));


const colsRef = compile(
  [
    '---',
    'title: T',
    'bibliography:',
    '  - key: k1',
    '    authors: A',
    '    year: 2020',
    '---',
    '',
    '# C {#sec:c}',
    '',
    '::: cols',
    'Trích dẫn [@k1] và tham chiếu @sec:c.',
    '|||',
    '![Hình trong cột](asset:logo-bk){#fig:trongcot}',
    ':::',
  ].join('\n'),
);
check('trích dẫn trong hàng hai cột được đánh số',
  colsRef.rendered.html.includes('>[1]<') || colsRef.rendered.html.includes('[1]'),
  colsRef.diagnostics.map((d) => d.code).join(','));
check('không sinh lỗi trích dẫn hỏng trong cột',
  !colsRef.diagnostics.some((d) => d.code === 'SR-V014'));
check('tham chiếu chéo trong cột phân giải được',
  !colsRef.rendered.html.includes('@sec:c'));
check('hình trong cột vào danh mục hình',
  colsRef.rendered.figures.length === 1, String(colsRef.rendered.figures.length));

const fnCite = compile(
  [
    '---',
    'title: T',
    'bibliography:',
    '  - key: k9',
    '    authors: B',
    '    year: 2021',
    '---',
    '',
    'Câu[^a].',
    '',
    '[^a]: Xem thêm [@k9].',
  ].join('\n'),
);
check('trích dẫn nằm trong chú thích chân trang vẫn được đánh số',
  !fnCite.diagnostics.some((d) => d.code === 'SR-V014'),
  fnCite.diagnostics.map((d) => d.code).join(','));

/* ------------------------------------------------------------ block canvas */

section('Block canvas');

const canvasSource = SAMPLE_DOCUMENT.replace(/\r\n?/g, '\n');
const canvas = toCards(canvasSource);
check('tài liệu mẫu tách được thành nhiều card', canvas.cards.length > 20,
  String(canvas.cards.length));
check('front matter được giữ riêng', canvas.frontMatter.startsWith('---'));
check('không card nào rỗng', canvas.cards.every((c) => c.text.trim().length > 0));

const rebuilt = toSource(canvas);
const normalise = (s: string) => s.trim().replace(/\n{3,}/g, '\n\n');
check('card ghép lại ra đúng nguồn ban đầu', normalise(rebuilt) === normalise(canvasSource),
  `${normalise(rebuilt).length} vs ${normalise(canvasSource).length}`);

const reparsed = compile(rebuilt);
check('nguồn dựng lại từ card vẫn parse ra cùng số khối',
  reparsed.doc.children.length === compile(canvasSource).doc.children.length,
  `${reparsed.doc.children.length} vs ${compile(canvasSource).doc.children.length}`);
check('nguồn dựng lại không sinh lỗi mới',
  reparsed.diagnostics.filter((d) => d.severity === 'error').length ===
    compile(canvasSource).diagnostics.filter((d) => d.severity === 'error').length);

const capCard = canvas.cards.find((c) => c.kind === 'table');
check('chú thích đi theo bảng, không thành card riêng',
  !!capCard && capCard.text.includes('\n\n: '), capCard?.text.slice(-60));
check('định nghĩa chú thích chân trang là card riêng',
  canvas.cards.some((c) => c.kind === 'footnote'));

check('nhận lại loại card sau khi sửa: bảng', detectKind('| a | b |\n|---|---|') === 'table');
check('nhận lại loại card sau khi sửa: công thức', detectKind('$$\nx=1\n$$') === 'equation');
check('nhận lại loại card sau khi sửa: sơ đồ', detectKind('```mermaid\nflowchart TB\n```') === 'diagram');
check('nhận lại loại card sau khi sửa: mã nguồn', detectKind('```python\nx=1\n```') === 'codeBlock');
check('nhận lại loại card sau khi sửa: hai cột', detectKind('::: cols\nA\n|||\nB\n:::') === 'columns');

const moved = moveCard(canvas.cards, 2, 0);
check('đổi thứ tự card giữ nguyên số lượng', moved.length === canvas.cards.length);
check('đổi thứ tự card đưa đúng khối lên đầu', moved[0]?.id === canvas.cards[2]?.id);

const pair = makeColumns('Trái', 'Phải');
check('gộp hai card thành hàng hai cột', splitColumns(pair)?.join('|') === 'Trái|Phải', pair);

/* ------------------------------------------------------------- dán thông minh */

section('Dán thông minh (Ctrl+V)');

const excel = 'Thông số\tGiá trị\tGhi chú\nTần số\t125 Hz\tđồng bộ\nADC\t16 bit\t';
const pExcel = detectPaste(excel);
check('dán TSV từ Excel ra bảng', pExcel.kind === 'table', pExcel.kind);
check('bảng giữ đúng số cột', (pExcel.markdown.split('\n')[0] ?? '').split('|').length === 5,
  pExcel.markdown.split('\n')[0]);
check('bảng giữ nguyên từng ô', pExcel.markdown.includes('125 Hz') && pExcel.markdown.includes('đồng bộ'));

const csv = 'a,b,c\n1,2,3\n4,5,6';
check('dán CSV cũng ra bảng', detectPaste(csv).kind === 'table');
const csvQuoted = 'Tên,"Giá trị, có phẩy"\nA,"1,5"';
const pQuoted = detectPaste(csvQuoted);
check('CSV có dấu nháy được tách đúng', pQuoted.markdown.includes('Giá trị, có phẩy'), pQuoted.markdown);

const pipeCell = detectPaste('a\tb|c\n1\t2');
check('ô chứa dấu | được thoát, không làm vỡ bảng', pipeCell.markdown.includes('b\\|c'));

const pLatex = detectPaste('\\frac{a}{b} = \\sqrt{c}');
check('dán LaTeX ra khối công thức', pLatex.kind === 'latex', pLatex.kind);
check('công thức được bọc $$ và có nhãn', pLatex.markdown.startsWith('$$') && pLatex.markdown.includes('{#eq:'));
check('LaTeX đã có $$ không bị bọc hai lần',
  (detectPaste('$$\\alpha + \\beta$$').markdown.match(/\$\$/g) ?? []).length === 2);

const prose = 'Hệ số \\alpha được chọn bằng thực nghiệm. Giá trị này ảnh hưởng tới sai số. Ta sẽ bàn ở chương sau.';
check('văn xuôi có nhắc \\alpha không bị nhận nhầm là công thức',
  detectPaste(prose).kind === 'text', detectPaste(prose).kind);

const py = 'def ptt(a, b):\n    if a > b:\n        return a - b\n    return 0';
const pCode = detectPaste(py);
check('dán code python ra khối mã', pCode.kind === 'code', pCode.kind);
check('đoán được ngôn ngữ python', pCode.markdown.startsWith('```python'), pCode.markdown.slice(0, 12));
check('mã giữ nguyên từng ký tự', pCode.markdown.includes(py));

const mer = 'flowchart LR\n  A[X] --> B[Y]';
check('dán mermaid ra sơ đồ', detectPaste(mer).kind === 'diagram');
check('sơ đồ được bọc ```mermaid', detectPaste(mer).markdown.startsWith('```mermaid'));

const plain = 'Một đoạn văn bình thường, không có gì đặc biệt.';
const pPlain = detectPaste(plain);
check('văn bản thường vẫn là văn bản', pPlain.kind === 'text');
check('văn bản thường không bị thêm bớt ký tự', pPlain.markdown === plain);

const mdTable = '| a | b |\n|---|---|\n| 1 | 2 |';
check('bảng Markdown dán vào giữ nguyên', detectPaste(mdTable).markdown === mdTable);

/* --------------------------------------------------- biểu mẫu trong card */

section('Biểu mẫu card (khứ hồi)');

const eqText = '$$\n\\frac{a}{b} = c\n$$ {#eq:ten}';
const eqForm = parseEquation(eqText);
check('công thức parse được', !!eqForm && eqForm.tex === '\\frac{a}{b} = c' && eqForm.label === 'eq:ten',
  JSON.stringify(eqForm));
check('công thức khứ hồi nguyên vẹn', serializeEquation(eqForm as EquationForm) === eqText);

const codeText = '```python\nx = 1\n```\n\n: Chú thích {#lst:ten}';
const codeForm = parseCode(codeText);
check('khối mã parse được', !!codeForm && codeForm.lang === 'python' && codeForm.code === 'x = 1',
  JSON.stringify(codeForm));
check('khối mã khứ hồi nguyên vẹn', serializeCode(codeForm as CodeForm) === codeText,
  serializeCode(codeForm as CodeForm));

const diaText = '```mermaid\nflowchart TB\n  A --> B\n```\n\n: Sơ đồ {#dia:ten}';
const diaForm = parseDiagram(diaText);
check('sơ đồ parse được', !!diaForm && diaForm.source === 'flowchart TB\n  A --> B');
check('sơ đồ khứ hồi nguyên vẹn', serializeDiagram(diaForm as DiagramForm) === diaText,
  serializeDiagram(diaForm as DiagramForm));
const diaDir = parseDiagram('```mermaid\nflowchart TB\n```\n\n: X {#dia:y dir=LR}');
check('đọc được dir= trong chú thích sơ đồ', diaDir?.direction === 'LR', JSON.stringify(diaDir));

const figText = '![Chú thích hình](asset:logo-bk){#fig:x width=80%}';
const figForm = parseFigure(figText);
check('hình parse được', !!figForm && figForm.src === 'asset:logo-bk' && figForm.width === '80%');
check('hình khứ hồi nguyên vẹn', serializeFigure(figForm as FigureForm) === figText,
  serializeFigure(figForm as FigureForm));

const tblText = '| A | B |\n|:---|---:|\n| 1 | 2 |\n| 3 | 4 |\n\n: Bảng thử {#tbl:x}';
const tblForm = parseTable(tblText);
check('bảng parse được', !!tblForm && tblForm.rows.length === 2 && tblForm.align[1] === 'right',
  JSON.stringify(tblForm));
check('bảng khứ hồi nguyên vẹn', serializeTable(tblForm as TableForm) === tblText,
  serializeTable(tblForm as TableForm));
const tblPipe = parseTable('| a | b\\|c |\n|---|---|\n| 1 | 2 |');
check('ô chứa | được đọc đúng', tblPipe?.header[1] === 'b|c', JSON.stringify(tblPipe?.header));
check('ô chứa | được ghi lại có thoát',
  serializeTable(tblPipe as TableForm).includes('b\\|c'));

const oneCol = parseTable('| Chỉ một cột |\n|---|\n| A |\n| B |');
check('bảng một cột vẫn parse được', !!oneCol && oneCol.header.length === 1 && oneCol.rows.length === 2,
  JSON.stringify(oneCol));
check('bảng một cột khứ hồi nguyên vẹn',
  parseTable(serializeTable(oneCol as TableForm))?.rows.length === 2);
const oneRow = parseTable('| A | B |\n|---|---|\n| 1 | 2 |');
check('bảng một dòng dữ liệu vẫn parse được', oneRow?.rows.length === 1);

check('khối không đúng dạng thì biểu mẫu trả null', parseTable('chỉ là đoạn văn') === null);
check('công thức sai dạng thì biểu mẫu trả null', parseEquation('$x$') === null);

check('đổi cấp đề mục', setHeadingDepth('## Tên', 1) === '# Tên');
check('đọc cấp đề mục', headingDepth('### A') === 3);

/* ------------------------------------------------------------ trang bìa tự động */

section('Bìa tự động khi đổi template');

const noCover = ['---', 'title: Đề tài X', 'authors:', '  - Trần Nhật Tường', '  - Nguyễn Văn A', '---', '', '# Mở đầu', '', 'Nội dung.'].join('\n');

check('nhận ra tài liệu thiếu khối bìa', needsCover(noCover, HCMUT_BTL));
check('template không có bìa thì không đòi hỏi gì',
  !needsCover(noCover, findTemplate('scientific-standard')));

const filled = withCover(noCover, HCMUT_BTL);
check('thêm được khối cover', /^cover:$/m.test(filled));
check('giữ nguyên mọi khóa cũ',
  filled.includes('title: Đề tài X') && filled.includes('- Trần Nhật Tường'));
check('giữ nguyên phần thân', filled.includes('# Mở đầu') && filled.includes('Nội dung.'));
check('điền đúng chữ của khoa',
  filled.includes('Trường Đại học Bách khoa') && filled.includes('Báo cáo bài tập lớn'));
check('dùng logo có sẵn, không bắt tải lên', filled.includes('logo: asset:logo-bk'));
check('lấy thành viên từ authors đã khai',
  filled.includes('- name: Trần Nhật Tường') && filled.includes('- name: Nguyễn Văn A'));

const parsedCover = compile(filled);
check('front matter sau khi thêm bìa vẫn parse được',
  !parsedCover.diagnostics.some((d) => d.severity === 'error'),
  parsedCover.diagnostics.map((d) => d.code).join(','));
check('bìa dựng ra trang bìa thật', parsedCover.rendered.coverPages.length === 2,
  String(parsedCover.rendered.coverPages.length));

check('tài liệu đã có bìa thì không đụng vào',
  withCover(SAMPLE_DOCUMENT, HCMUT_BTL) === SAMPLE_DOCUMENT.replace(/\r\n?/g, '\n'));

const bare = '# Chỉ có tiêu đề\n\nKhông có front matter.';
const bareFilled = withCover(bare, HCMUT_BTL);
check('tài liệu không có front matter thì tạo mới', bareFilled.startsWith('---\ntitle: Chỉ có tiêu đề'));
check('thân tài liệu cũ được giữ lại', bareFilled.includes('Không có front matter.'));

/* ---------------------------------------------------- tìm kiếm loại khối */

section('Tìm loại khối');

check('gõ không dấu vẫn ra đúng khối',
  searchTemplates('cong thuc')[0]?.id === 'equation',
  searchTemplates('cong thuc')[0]?.id);
check('gõ tiếng Anh cũng ra', searchTemplates('table')[0]?.id === 'table');
check('gõ tắt vẫn ra', searchTemplates('bang')[0]?.id === 'table');
check('không khớp thì trả về rỗng', searchTemplates('zzzz').length === 0);
check('không gõ gì thì đủ danh sách',
  searchTemplates('').length === CARD_TEMPLATES.length);
check('khối hay dùng được đẩy lên đầu',
  searchTemplates('', ['code'])[0]?.id === 'code');
check('đoạn văn đứng đầu danh sách mặc định', CARD_TEMPLATES[0]?.id === 'paragraph');

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
