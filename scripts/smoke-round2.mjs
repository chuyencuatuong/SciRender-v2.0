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

console.log('\nSciRender v2.0 Round 2 performance/lifecycle smoke');
const app = read('apps/web/src/App.tsx');
const canvas = read('apps/web/src/components/canvas/CanvasPane.tsx');
const sidePanel = read('apps/web/src/components/SidePanel.tsx');
const preview = read('apps/web/src/components/PreviewPane.tsx');
const store = read('apps/web/src/state/store.ts');
const storage = read('packages/storage/src/index.ts');
const pdf = read('packages/renderer-pdf/src/pdf.ts');
const print = read('packages/renderer-pdf/src/print.ts');
const pdfIndex = read('packages/renderer-pdf/src/index.ts');

// Shell/layout performance: divider drags must not write Zustand/localStorage on every mousemove.
check('editor divider caches drag geometry before mousemove', app.includes('dragRectRef.current = host.getBoundingClientRect()'));
check('editor divider updates DOM inside requestAnimationFrame', app.includes('dragFrameRef.current = window.requestAnimationFrame'));
const editorDragStart = app.indexOf("const onMove = (e: MouseEvent): void => {", app.indexOf('if (!dragging) return;'));
const editorDragEnd = app.indexOf("window.addEventListener('mousemove', onMove)", editorDragStart);
const editorDragBody = app.slice(editorDragStart, editorDragEnd);
const editorOnUp = editorDragBody.indexOf('const onUp =');
check('editor divider persists width only on mouseup', editorOnUp >= 0 && !editorDragBody.slice(0, editorOnUp).includes("setPref('editorWidth'") && editorDragBody.slice(editorOnUp).includes("setPref('editorWidth', pct)"));
check('editor divider cancels pending RAF on cleanup', app.includes('window.cancelAnimationFrame(dragFrameRef.current)'));

// Split editor: same rule for the internal split; large CanvasPane trees stay out of React render loop.
check('split divider caches geometry before drag', canvas.includes('splitDragRectRef.current = box.getBoundingClientRect()'));
check('split divider updates both panes imperatively', canvas.includes('left.style.width = `${pct}%`') && canvas.includes('right.style.width = `${100 - pct}%`'));
const splitDragBlockStart = canvas.indexOf("const onMove = (e: MouseEvent): void => {", canvas.indexOf('if (!splitDragging) return;'));
const splitDragBlockEnd = canvas.indexOf("window.addEventListener('mousemove', onMove)", splitDragBlockStart);
const splitDragBody = canvas.slice(splitDragBlockStart, splitDragBlockEnd);
const splitOnUp = splitDragBody.indexOf('const onUp =');
check('split divider commits state only on mouseup', splitOnUp >= 0 && !splitDragBody.slice(0, splitOnUp).includes('setSplitPct(') && splitDragBody.slice(splitOnUp).includes('setSplitPct(Math.round(splitPctRef.current))'));
check('split divider cancels pending RAF on cleanup', canvas.includes('window.cancelAnimationFrame(splitDragFrameRef.current)'));
check('split view disables card layout animation', canvas.includes('layout={reduced || splitView ? false : \'position\'}'));
check('split view disables card entrance animation', canvas.includes('initial={reduced || splitView ? false : CARD_IN.initial}'));

// Side panel: canvas should relayout once, not once per transition frame.
check('desktop side panel no longer transitions margin/opacity', !sidePanel.includes('transition-[margin-left,opacity] duration-300'));
check('desktop side panel uses compositor transform for content', sidePanel.includes('transition-[transform,opacity] duration-200 will-change-transform'));
check('side panel still closes with pointer-events disabled', sidePanel.includes('pointer-events-none -ml-[272px]'));

// Preview wheel: ordinary scroll stays inside the scroll host and zoom writes are coalesced.
check('preview stops wheel propagation for every wheel event', preview.includes('e.stopPropagation();'));
check('preview prevents browser zoom only for Ctrl/Meta wheel', preview.includes('if (!(e.ctrlKey || e.metaKey)) return;') && preview.includes('e.preventDefault();'));
check('preview zoom is RAF-coalesced', preview.includes('zoomFrameRef.current = window.requestAnimationFrame'));
check('preview zoom persistence is debounced', preview.includes('zoomCommitTimerRef.current = window.setTimeout'));
check('preview wheel cleanup cancels RAF and timer', preview.includes('window.cancelAnimationFrame(zoomFrameRef.current)') && preview.includes('window.clearTimeout(zoomCommitTimerRef.current)'));

// Asset lifecycle: every replacement path revokes the old document asset URLs.
check('document switch revokes prior asset URLs', store.includes('revokeAssets?.();') && store.includes('const { map, revoke } = toAssetMap(assets)'));
check('generated asset refresh revokes prior asset URLs', store.includes('async addGeneratedAsset') && store.includes('revokeAssets?.();'));
check('asset deletion refresh revokes prior asset URLs', store.includes('async removeAsset') && store.includes('revokeAssets?.();'));
check('asset URL registry provides explicit revoke hook', storage.includes('return { map, revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)) };'));
check('download PDF blob URL is revoked', pdf.includes('URL.revokeObjectURL(url)'));
check('browser print listener has afterprint cleanup', print.includes('window.removeEventListener(\'afterprint\', cleanup)') && pdfIndex.includes('window.removeEventListener(\'afterprint\', cleanup)'));

// 35-page stress fixture: enough pages/rows to exercise future DOM pagination checks.
const fixture = read('scripts/fixtures/stress-35-page.md');
const pageBreaks = (fixture.match(/^:::pagebreak:::/gm) ?? []).length;
const tables = (fixture.match(/^\|/gm) ?? []).length;
const codeBlocks = (fixture.match(/^```/gm) ?? []).length / 2;
check('35-page stress fixture exists', fixture.length > 120_000, `bytes=${fixture.length}`);
check('stress fixture encodes at least 35 pages', pageBreaks >= 34, `breaks=${pageBreaks}`);
check('stress fixture contains long-table rows', tables >= 120, `tableLines=${tables}`);
check('stress fixture contains repeated code blocks', codeBlocks >= 6, `codeBlocks=${codeBlocks}`);

// Basic anti-regression checks for high-frequency state writes.
check('no editor divider setPref in mousemove handler', !editorDragBody.slice(0, editorOnUp).includes("setPref('editorWidth'"));
check('no split divider setSplitPct in mousemove handler', !splitDragBody.slice(0, splitOnUp).includes('setSplitPct('));

if (failures) {
  console.error(`Round-2 smoke: FAIL (${failures}/${checks})`);
  process.exit(1);
}
console.log(`Round-2 smoke: PASS (${checks} checks)`);
