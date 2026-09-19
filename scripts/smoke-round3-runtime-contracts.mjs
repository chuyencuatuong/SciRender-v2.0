import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failures = 0;
let checks = 0;
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function check(name, value, detail = '') {
  checks++;
  if (value) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\nSciRender v2.0 Round 3 runtime-contract smoke');
const numbering = read('packages/template-engine/src/numbering.ts');
const front = read('packages/renderer-html/src/front.ts');
const renderCore = read('packages/renderer-html/src/render-core.ts');
const cardEditors = read('apps/web/src/components/canvas/CardEditors.tsx');
const diagramDialog = read('apps/web/src/components/canvas/DiagramDialog.tsx');
const diagramStudio = read('apps/web/src/lib/diagram-studio.ts');
const css = read('packages/template-engine/src/css.ts');
const pdf = read('packages/renderer-pdf/src/index.ts');
const print = read('packages/renderer-pdf/src/print.ts');
const serverPdf = read('packages/pdf-server/src/server.ts');
const topbar = read('apps/web/src/components/TopBar.tsx');
const canvas = read('apps/web/src/components/canvas/CanvasPane.tsx');
const forms = read('apps/web/src/lib/card-forms.ts');

// TOC / heading normalization.
check('heading normalization strips markdown syntax', numbering.includes('stripInlineMarkdownSyntax') && numbering.includes('`{1,3}') && numbering.includes('(\\*{1,3}|_{1,3})'));
check('heading normalization removes duplicate CHƯƠNG prefix', numbering.includes('const chapter = new RegExp') && numbering.includes('value = value.replace(chapter')) ;
check('heading normalization removes decimal/manual prefixes', numbering.includes('const decimal = /^\\s*\\d+(?:\\.\\d+)*') && numbering.includes('const roman = /^\\s*[IVXLCDM]+'));
check('TOC uses normalized heading title', front.includes('normaliseHeadingTitle(\n      plainText(n),'));
check('rendered heading strips the normalized prefix from formatted inline HTML', renderCore.includes('stripHeadingPrefixHtml(inline(node.children, t), titleRaw, titleClean)'));

// Table context menu: selection snapshot + portal isolation + pointer-safe action execution.
check('context menu snapshots selected cells before portal opens', cardEditors.includes('contextSelectionRef.current = new Set(selectedCells)'));
check('outside listener explicitly ignores context-menu portal', cardEditors.includes("closest('[data-sr-table-context-menu]')"));
check('menu root stops pointer/mouse capture', cardEditors.includes('onPointerDownCapture={(event) => event.stopPropagation()}') && cardEditors.includes('onMouseDownCapture={(event) => event.stopPropagation()}'));
check('menu actions stop default focus/propagation and invoke action from click', cardEditors.includes('onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}') && cardEditors.includes('onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick(); }}'));
check('context actions operate from frozen selection model', cardEditors.includes('contextModel.selectedList') && cardEditors.includes('contextModel.bounds'));

// PDF pipeline: cover/front/body identity and both browser/server paths.
check('rendered PDF page payload carries page kinds', pdf.includes('pageKinds?: PageKind[]') && print.includes('pageKinds?: PageKind[]'));
check('print renderer emits explicit page-kind classes', pdf.includes('sr-page-${kind}') && print.includes('sr-page-${kind}'));
check('print CSS keeps cover as first physical page', css.includes('.sr-page-cover{page:auto!important;break-before:auto!important;'));
check('browser print does not remove print DOM immediately after window.print', pdf.includes('window.setTimeout(cleanup, 60_000)') && print.includes('window.setTimeout(cleanup, 60_000)'));
check('standalone/server PDF path waits fonts and prefers CSS page size', serverPdf.includes('document?.fonts?.ready') && serverPdf.includes('preferCSSPageSize: true'));
check('PDF page orientation is forwarded from render pages', topbar.includes('const pageOrientations = render.pages.map((p) => p.orientation)') && topbar.includes('pageOrientations'));
check('PDF page kind is forwarded from render pages', topbar.includes('const pageKinds = render.pages.map((p) => p.kind)') && topbar.includes('pageKinds'));
check('same-document anchors are emitted in renderer HTML', renderCore.includes('href="#${escapeAttr(href)}"') && renderCore.includes('id="${escapeAttr(anchor)}"'));

// Diagram: full viewport + vector-native SVG + wrapped Mermaid labels + isolated wheel.
check('diagram preview fills modal viewport', diagramDialog.includes('h-full w-full') && diagramDialog.includes('[&>svg]:h-full [&>svg]:w-full'));
check('diagram wheel always prevents page propagation', diagramDialog.includes('event.preventDefault();') && diagramDialog.includes('event.stopPropagation();'));
check('Mermaid enables HTML labels and does not cap SVG width', diagramStudio.includes('htmlLabels: true') && diagramStudio.includes('useMaxWidth: false'));
check('Mermaid node labels wrap and node overflow is visible', diagramStudio.includes('.nodeLabel{white-space:normal') && diagramStudio.includes('.node foreignObject{overflow:visible'));
check('SVG viewport is explicitly 100% x 100%', diagramStudio.includes('width="100%" height="100%" preserveAspectRatio="xMidYMid meet"'));
check('direction controls use light-on-dark contrast tokens', read('apps/web/src/index.css').includes('--sr-diagram-control-ink') && read('apps/web/src/index.css').includes('border:1px solid rgb(255 255 255 / 0.30)'));

// Landscape: reversible source representation + persisted table/diagram attrs + rerender.
check('column landscape toggle is two-way', canvas.includes('const landscape = /\\b(?:landscape|orientation=landscape)\\b/.test(card.text)') && canvas.includes('makeColumns(pair[0], pair[1], !landscape)'));
check('landscape toggle requests a render after source commit', canvas.includes('window.requestAnimationFrame(() => requestRender())'));
check('table landscape state persists through source attrs', forms.includes("attrs.orientation === 'landscape'") && forms.includes('serialisedTableAttrs'));
check('print CSS supports portrait and landscape page boxes', css.includes('@page landscape-page{size:${p.height} ${p.width};') && css.includes('page:landscape-page!important'));

// Static syntax smoke for the newly added stress/runtime contract fixture.
const stress = read('scripts/fixtures/stress-35-page.md');
check('stress fixture is present', stress.length > 120_000, `bytes=${stress.length}`);

if (failures) {
  console.error(`Round-3 runtime-contract smoke: FAIL (${failures}/${checks})`);
  process.exit(1);
}
console.log(`Round-3 runtime-contract smoke: PASS (${checks} checks)`);
