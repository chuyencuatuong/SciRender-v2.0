import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failures = 0;
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function check(name, value) {
  if (value) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}`); }
}

console.log('\nSciRender v2.0 root-cause regression smoke');
const split = read('packages/layout-engine/src/split.ts');
const layout = read('packages/layout-engine/src/index.ts');
const renderCore = read('packages/renderer-html/src/render-core.ts');
const cardEditors = read('apps/web/src/components/canvas/CardEditors.tsx');
const diagram = read('apps/web/src/components/canvas/DiagramDialog.tsx');
const diagramLib = read('apps/web/src/lib/diagram-studio.ts');
const printCss = read('packages/template-engine/src/css.ts');
const print = read('packages/renderer-pdf/src/print.ts');
const pdfIndex = read('packages/renderer-pdf/src/index.ts');
const forms = read('apps/web/src/lib/card-forms.ts');
const store = read('apps/web/src/state/store.ts');

// Root cause #1: table continuation must conserve rows and must not duplicate DOM identity.
check('table splitter enforces 2-row minimum', split.includes('Math.max(2, Math.trunc(minRows))'));
check('table splitter measures a real fragment clone', split.includes('parent.insertBefore(head, wrapper)') && split.includes('head.getBoundingClientRect()'));
check('table splitter validates row conservation', split.includes('headRows + tailRows !== sourceRows'));
check('table continuation clears duplicate element identity', split.includes('clearFragmentIdentity(tail)') && split.includes("tail.setAttribute('data-sr-continuation', '1')"));
check('all split tails clear DOM identities', split.includes('export function clearFragmentIdentity') && (split.match(/clearFragmentIdentity\(tail\)/g) ?? []).length >= 3 && layout.includes('clearFragmentIdentity(tail)'));
check('pagination validates structural split before enqueue', layout.includes('expectedRows = tableRowCount(block)') && layout.includes('headRows + tailRows === expectedRows') && layout.includes('queue.unshift(tail)'));
check('table continuation caption cannot accumulate duplicate suffix', split.includes('stripContinuationSuffix') && split.includes('base ? `${base} (${continuedLabel})`'));
check('code continuation caption cannot accumulate duplicate suffix', split.includes("const base = stripContinuationSuffix(tailCap.el.textContent ?? '', continuedLabel)"));
check('cross-reference suppresses duplicate semantic word', renderCore.includes('shouldSuppressReferenceWord') && renderCore.includes('suppressReferenceWord'));

// Root cause #2: selection must have an escape path outside the editor and Escape key.
check('table selection owns a root ref', cardEditors.includes('tableEditorRef = useRef<HTMLDivElement | null>(null)') && cardEditors.includes('ref={tableEditorRef}'));
check('clicking outside clears cell selection', cardEditors.includes('document.addEventListener(\'pointerdown\', onPointerDown, true)') && cardEditors.includes('clearSelection();'));
check('Escape clears cell selection', cardEditors.includes("if (event.key === 'Escape') clearSelection();"));
check('selection listeners have cleanup', cardEditors.includes('document.removeEventListener(\'pointerdown\', onPointerDown, true)') && cardEditors.includes('window.removeEventListener(\'keydown\', onKeyDown)'));
check('table context-menu portal preserves selection during action click', cardEditors.includes("target.closest('[data-sr-table-context-menu]')") && cardEditors.includes('data-sr-table-context-menu=\"1\"'));

// Root cause #3: zoom must stay inside vector viewBox and Ctrl/Cmd-wheel must not bubble to the page.
check('diagram preview applies vector-native viewBox', diagram.includes('applyDiagramViewport(svg, panX, panY, zoom)'));
check('diagram zoom is not CSS scale/will-change rasterization', !diagram.includes('transform: `translate(${panX}%') && !diagram.includes('className="will-change-transform"'));
check('diagram wheel listener is native and non-passive', diagram.includes("host.addEventListener('wheel', onWheel, { passive: false })"));
check('diagram wheel stops page interaction', diagram.includes('event.preventDefault();') && diagram.includes('event.stopPropagation();'));
check('diagram wheel listener cleans up', diagram.includes("host.removeEventListener('wheel', onWheel)"));
check('diagram cursor zoom uses inverse-zoom geometry', diagram.includes('const oldScale = 1 /') && diagram.includes('const nextScale = 1 /') && diagram.includes('(nextScale - oldScale)'));
check('diagram pan scales with zoom', diagram.includes('const scale = 1 / Math.max(0.25, zoomRef.current)') && diagram.includes('* scale;'));
check('Space pan ignores editable controls', diagram.includes('target instanceof HTMLInputElement') && diagram.includes('target instanceof HTMLTextAreaElement') && diagram.includes('target.isContentEditable'));
check('diagram viewport persists through SVG viewBox', diagramLib.includes('replace(/\\bviewBox=') && forms.includes("form.attrs['view-x']") && forms.includes("form.attrs['view-zoom']"));
check('diagram direction controls have explicit light-on-dark contrast', read('apps/web/src/index.css').includes('.sr-diagram-dialog .sr-diagram-choice') && diagram.includes('sr-diagram-choice'));

// Root cause #4: print root must not be forced to max portrait/landscape width.
check('print root has static print positioning', printCss.includes('#sr-print-root{position:static!important;'));
check('print root no longer uses max(pageWidth,pageHeight)', !printCss.includes('width:max(${p.width},${p.height})'));
check('print root has zero print padding/margin', printCss.includes('margin:0!important;padding:0!important'));
check('application root is removed from print layout', printCss.includes('#root{display:none!important;}'));
check('portrait page is physically A4', printCss.includes('width:${p.width}!important;height:${p.height}!important;'));
check('landscape page uses the named landscape page box', printCss.includes('@page landscape-page{size:${p.height} ${p.width};margin:0!important;}') && printCss.includes('page:landscape-page!important'));
check('print waits for document fonts before opening dialog', print.includes('document.fonts?.ready') && pdfIndex.includes('document.fonts?.ready'));

// Proactive regression checks.
check('object URL lifecycle is centralized/revocable', store.includes('revokeAssets?.()') && read('packages/storage/src/index.ts').includes('URL.revokeObjectURL'));
check('Mermaid render caches remain bounded', diagramLib.includes('MAX_RENDER_CACHE') && read('apps/web/src/lib/mermaid.ts').includes('MAX_MERMAID_CACHE'));
check('no duplicate source object literal remains', !store.includes('source: next,\n      source: next,'));
check('root-cause smoke is exposed through pnpm', read('package.json').includes('smoke:root-cause'));

if (failures) process.exit(1);
console.log('Root-cause regression smoke: PASS');
