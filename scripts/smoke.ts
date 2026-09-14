/**
 * Smoke test for the pure (DOM-free) half of the pipeline.
 *
 * Run with: npm run smoke
 *
 * It exercises parser -> numbering -> validator -> intelligence -> renderer on
 * the bundled sample document plus a set of adversarial inputs, and asserts the
 * invariants the seven principles depend on. The layout engine needs a real
 * browser and is verified in the app itself.
 */
import { analyse } from '../packages/intelligence/src/index.js';
import { parse } from '../packages/parser/src/index.js';
import { render } from '../packages/renderer-html/src/index.js';
import {
  assignNumbers,
  findTemplate,
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

function compile(source: string, templateId = 'scientific-standard') {
  const parsed = parse(source);
  const template = resolveTemplate(findTemplate(parsed.document.meta.templateId ?? templateId));
  const numbering = assignNumbers(parsed.document, template.descriptor);
  const diagnostics = [
    ...parsed.diagnostics,
    ...numbering.diagnostics,
    ...validate(parsed.document, { assets: {} }),
  ];
  const health = analyse(parsed.document, diagnostics);
  const rendered = render(parsed.document, { template: template.descriptor, assets: {} });
  return { doc: parsed.document, diagnostics, health, rendered, template };
}

/* ------------------------------------------------------------ sample document */

section('Sample document');
const s = compile(SAMPLE_DOCUMENT);

check('front matter parsed', s.doc.meta.title.startsWith('Ước lượng huyết áp'));
check('authors parsed', s.doc.meta.authors.length === 2, `got ${s.doc.meta.authors.length}`);
check('bibliography parsed', s.doc.meta.bibliography.length === 3);
check('abstract parsed', Boolean(s.doc.meta.abstract && s.doc.meta.abstract.length > 100));
check('keywords parsed', s.doc.meta.keywords.length === 5, `got ${s.doc.meta.keywords.length}`);

const headings = s.doc.children.filter((n) => n.type === 'heading');
check('headings found', headings.length >= 8, `got ${headings.length}`);
const h1s = headings.filter((h) => h.type === 'heading' && h.depth === 1);
check(
  'top-level headings numbered 1..5',
  h1s.every((h, i) => h.type === 'heading' && h.number === String(i + 1)),
  h1s.map((h) => (h.type === 'heading' ? h.number : '')).join(','),
);

const labels = Object.keys(s.doc.labels).sort();
check(
  'labels registered',
  ['dia:pipeline', 'eq:loss', 'eq:ptt', 'eq:sbp', 'tbl:dataset', 'tbl:results'].every((l) =>
    labels.includes(l),
  ),
  labels.join(' '),
);
check('eq:sbp numbered 2.1', s.doc.labels['eq:sbp']?.number === '2.1', s.doc.labels['eq:sbp']?.number);
check('eq:ptt numbered 2.2', s.doc.labels['eq:ptt']?.number === '2.2', s.doc.labels['eq:ptt']?.number);
check('eq:loss numbered 3.1', s.doc.labels['eq:loss']?.number === '3.1', s.doc.labels['eq:loss']?.number);
check(
  'tbl:dataset numbered 3.1',
  s.doc.labels['tbl:dataset']?.number === '3.1',
  s.doc.labels['tbl:dataset']?.number,
);
check(
  'tbl:results numbered 4.1',
  s.doc.labels['tbl:results']?.number === '4.1',
  s.doc.labels['tbl:results']?.number,
);

const unresolved = s.diagnostics.filter((d) => d.code === 'SR-V012');
check('every cross reference resolves', unresolved.length === 0, unresolved.map((d) => d.message).join(' | '));

const badCitations = s.diagnostics.filter((d) => d.code === 'SR-V014');
check('every citation resolves', badCitations.length === 0, badCitations.map((d) => d.message).join(' | '));

const mathErrors = s.diagnostics.filter((d) => d.stage === 'equation');
check('all LaTeX compiles', mathErrors.length === 0, mathErrors.map((d) => d.message).join(' | '));

check('citation order by first appearance', s.doc.citationOrder.join(',') === 'mukkamala2015,elgendi2019,aami2013', s.doc.citationOrder.join(','));

const html = s.rendered.html;
check('table rendered', html.includes('<table>'));
check('figure caption label present', html.includes('Bảng 3.1') || html.includes('sr-caption-label'));
check('equation number rendered', html.includes('(2.1)'));
check('cross reference rendered as number', html.includes('sr-crossref'));
check('mermaid block emitted', html.includes('data-sr-mermaid'));
check('references list rendered', html.includes('sr-reference-list'));
check('no unresolved markers in sample', !html.includes('sr-unresolved'));
check('health score is high', s.health.score >= 70, `score=${s.health.score} grade=${s.health.grade}`);

/* --------------------------------------------------------------- determinism */

section('P2 — Deterministic rendering');
const a = compile(SAMPLE_DOCUMENT);
const b = compile(SAMPLE_DOCUMENT);
check('identical HTML across runs', a.rendered.html === b.rendered.html);
check(
  'identical diagnostics across runs',
  JSON.stringify(a.diagnostics) === JSON.stringify(b.diagnostics),
);
check('identical health score across runs', a.health.score === b.health.score);

const asIeee = compile(SAMPLE_DOCUMENT.replace('language: vi', 'language: vi\ntemplate: ieee-like'));
check('template swap changes numbering', asIeee.doc.labels['eq:loss']?.number === '3', asIeee.doc.labels['eq:loss']?.number);
check('template swap keeps the same AST shape', asIeee.doc.children.length === s.doc.children.length);

/* ------------------------------------------------------------- fail loudly */

section('P6 — Fail loudly');
const broken = compile(`---
title: Tài liệu hỏng
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
check('unresolved cross reference reported', codes.has('SR-V012'));
check('unknown citation key reported', codes.has('SR-V014'));
check('LaTeX error reported', codes.has('SR-V021'));
check('heading level skip reported', codes.has('SR-V008'));
check('ragged table row reported', codes.has('SR-P020'));
check('missing figure/table caption reported', codes.has('SR-T002'));
check(
  'broken math still renders a visible error marker',
  broken.rendered.html.includes('sr-math-error'),
);
check('broken references rendered visibly', broken.rendered.html.includes('sr-unresolved'));
check('health score penalised', broken.health.score < s.health.score, `${broken.health.score} vs ${s.health.score}`);

/* ------------------------------------------------------- content integrity */

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
check('raw HTML is escaped, not executed', !tricky.rendered.html.includes('<script>alert'));
check('ampersand escaped', tricky.rendered.html.includes('&amp;'));
const codeNode = tricky.doc.children.find((n) => n.type === 'codeBlock');
check(
  'code block content preserved verbatim',
  codeNode?.type === 'codeBlock' && codeNode.value === 'x = {"a": 1 & 2}  # < > &',
  codeNode?.type === 'codeBlock' ? JSON.stringify(codeNode.value) : 'missing',
);

/* -------------------------------------------------------------- edge cases */

section('Edge cases');
check('empty input does not throw', compile('').doc.children.length === 0);
check('front matter only', compile('---\ntitle: X\n---\n').doc.meta.title === 'X');
const noFm = compile('# Tiêu đề từ H1\n\nNội dung.');
check('title falls back to first H1', noFm.doc.meta.title === 'Tiêu đề từ H1', noFm.doc.meta.title);
const dup = compile(`# A {#sec:x}\n\n# B {#sec:x}\n`);
check('duplicate label reported', dup.diagnostics.some((d) => d.code === 'SR-V011'));
const nested = compile('- một\n  - lồng nhau\n- hai\n\n1. số\n2. số hai\n');
check('lists parsed', nested.doc.children.filter((n) => n.type === 'list').length === 2);
check(
  'nested list produces a child list',
  nested.rendered.html.includes('<ul') && nested.rendered.html.includes('<ol'),
);
const inlineHeavy = compile(
  '# H\n\n**đậm** *nghiêng* `mã` H~2~O E^2^ [liên kết](https://example.com) $a+b$\n',
);
for (const tag of ['<strong>', '<em>', '<code>', '<sub>', '<sup>', '<a href=', 'katex']) {
  check(`inline ${tag} rendered`, inlineHeavy.rendered.html.includes(tag));
}
const unclosed = compile('$$\na = b\n');
check('unclosed math block reported', unclosed.diagnostics.some((d) => d.code === 'SR-P010'));

/* ----------------------------------------------------------------- summary */

console.log(`\n${checks - failures}/${checks} kiểm tra đạt.`);
if (failures) {
  console.log(`${failures} kiểm tra THẤT BẠI.`);
  process.exit(1);
}
console.log('Toàn bộ kiểm tra đạt.');
