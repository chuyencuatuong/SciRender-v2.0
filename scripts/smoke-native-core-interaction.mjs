import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failures = 0;
function check(name, value) {
  if (value) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}`); }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

console.log('\nNative Core Interaction smoke');
const audit = read('apps/web/src/components/AuditDialog.tsx');
const command = read('apps/web/src/components/CommandPalette.tsx');
const canvas = read('apps/web/src/components/canvas/CanvasPane.tsx');
const auto = read('apps/web/src/components/canvas/AutoTextarea.tsx');
const shortcuts = read('apps/web/src/lib/shortcuts.ts');
const app = read('apps/web/src/App.tsx');
const cardsEditors = read('apps/web/src/components/canvas/CardEditors.tsx');
const cardShell = read('apps/web/src/components/canvas/CardShell.tsx');
const topbar = read('apps/web/src/components/TopBar.tsx');
const css = read('apps/web/src/index.css');
const store = read('apps/web/src/state/store.ts');

const diagramStudio = read('apps/web/src/lib/diagram-studio.ts');
const diagramForms = read('apps/web/src/lib/card-forms.ts');
const parserBlocks = read('packages/parser/src/blocks.ts');
const splitTable = read('packages/layout-engine/src/split.ts');
const layout = read('packages/layout-engine/src/index.ts');
const rendererHtml = read('packages/renderer-html/src/render-core.ts');
const rendererCss = read('packages/template-engine/src/css.ts');
const pdf = read('packages/renderer-pdf/src/pdf.ts');
const print = read('packages/renderer-pdf/src/print.ts');

check('audit modal centered flex backdrop', audit.includes('fixed inset-0 z-50 flex items-center justify-center'));
check('audit modal portals to document.body', audit.includes('createPortal(') && audit.includes('document.body'));
check('audit modal viewport-safe height', audit.includes('max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-2xl'));
check('audit findings have independent scrolling', audit.includes('flex-1 overflow-y-auto p-6 space-y-3'));
check('command palette uses Ctrl+Shift+P/F1 registry', command.includes("matchesShortcut(e, 'command-palette')"));
check('Ctrl+K is hyperlink action', auto.includes("matchesShortcut(e, 'hyperlink')"));
check('Ctrl+Shift+V clean paste path', canvas.includes("matchesShortcut(e, 'clean-paste')"));
check('zero-prompt smart paste + undo toast', canvas.includes('parseBulkMarkdown(text)') && canvas.includes('Đã nhận') && canvas.includes('Hoàn tác'));
check('semantic Enter creates paragraph after non-text block', canvas.includes("['figure', 'table', 'equation', 'codeBlock', 'diagram']") && canvas.includes("insertAt(activeIndex + 1, 'Nội dung đoạn văn.')"));
check('referenced delete confirmation exists', canvas.includes('deleteConfirmIndex') && canvas.includes('Khối này đang được tham chiếu'));
check('Ctrl+Alt heading registry entries', shortcuts.includes("Ctrl+Alt+1") && shortcuts.includes("Ctrl+Alt+0"));
check('shortcut listener uses capture phase', shortcuts.includes("window.addEventListener('keydown', handler, true)"));
check('heading shortcut matchers exist', ['heading-1', 'heading-2', 'heading-3', 'paragraph'].every((id) => shortcuts.includes(`case '${id}':`)));
check('between-card insert divider', canvas.includes('h-4 items-center justify-center') && canvas.includes('insertAt(index + 1, tpl.text)'));
check('drag auto-scroll near viewport edges', canvas.includes('const edge = 80') && canvas.includes('requestAnimationFrame(stepDragAutoScroll)'));
check('shortcut cheat sheet mounted', fs.existsSync(path.join(root, 'apps/web/src/components/ShortcutCheatSheet.tsx')) && app.includes('<ShortcutCheatSheet'));
check('native word navigation left to browser', !canvas.includes('Ctrl+Arrow') && !auto.includes('Ctrl+Arrow'));
check('Obsidian Studio base surface tokens', css.includes('--sr-workspace-base: rgb(11 13 17)') && css.includes('--sr-paper-ground: rgb(19 22 31)') && css.includes('--sr-card: rgb(22 25 34)'));
check('Obsidian Studio chrome border token', css.includes('rgb(17 20 26 / 0.80)') && css.includes('rgb(255 255 255 / 0.07)'));
check('card elevation shadow token', css.includes('0 4px 20px -4px rgba(0, 0, 0, 0.5)'));
check('logo electric glow', css.includes('drop-shadow(0 0 8px rgba(26, 143, 227, 0.35))') && topbar.includes('sr-logo-mark'));
check('heading editor preserves trailing spaces', cardsEditors.includes("const body = text.replace(/^#{1,6}[ \\t]?/, '')"));
check('markdown space transforms heading/list/quote markers', canvas.includes("/^(#{1,3}|>|[-*+]|\\d+[.)])$/"));
check('Enter inside heading/special card inserts paragraph', canvas.includes("card.kind === 'heading' || ['figure', 'table', 'equation', 'codeBlock', 'diagram']"));
check('Backspace unwraps non-empty heading', canvas.includes("if (!body.trim()) return;") && canvas.includes("context.updateCard(activeIndex, body)"));
check('empty paragraph Backspace deletes current block', canvas.includes("card.kind === 'paragraph' && editor.value.length === 0"));
check('vertical caret navigation jumps between cards', canvas.includes("e.key === 'ArrowUp' && firstLine") && canvas.includes("e.key === 'ArrowDown' && lastLine"));
check('Ctrl+Alt+0 can force empty heading to paragraph', canvas.includes("headingShortcut.depth === 0 ? 'paragraph' : undefined"));
check('contextual insert stores anchor block id', store.includes('afterBlockId: s.activeBlockId') && store.includes('activeBlockId: string | null'));
check('top InsertMenu uses viewport context', canvas.includes('<InsertMenu onInsert={(tpl) => insertAt(viewportInsertIndex(), tpl.text)} />'));
check('new block auto-focuses and flashes', canvas.includes("scrollIntoView({ behavior: 'smooth', block: 'center' })") && canvas.includes('setFlashCardId(card.id)') && cardShell.includes('ring-2 ring-sky-400 animate-pulse'));
check('floating toolbar has no rough plus button', !cardShell.includes('onInsertBelow') && !cardShell.includes('Thêm khối bên dưới') && !cardShell.includes('iconOnly'));
check('reduced-motion compatible animation tokens', css.includes('transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-out'));

check('Shift+Enter split paragraph is wired into live shortcut context', canvas.includes("e.key === 'Enter' && e.shiftKey") && canvas.includes('context.splitParagraphAt') && canvas.includes('const splitParagraphAt'));
check('paragraph split persists the left side and focuses the new paragraph', canvas.includes("kind: 'paragraph', text: right") && canvas.includes('setActiveBlockId(nextCard.id)'));
check('table horizontal merge marker is parsed as colspan', parserBlocks.includes("raw === TABLE_HORIZONTAL_MERGE_MARKER") && parserBlocks.includes('owner.colspan = (owner.colspan ?? 1) + 1'));
check('table vertical merge marker is parsed as rowspan', parserBlocks.includes("raw === TABLE_MERGE_MARKER") && parserBlocks.includes('ownerAbove.rowspan = (ownerAbove.rowspan ?? 1) + 1'));
check('table multi-cell marquee + shift/meta selection exists', cardsEditors.includes('draggingRef.current') && cardsEditors.includes('e.shiftKey && anchorRef.current') && cardsEditors.includes('e.ctrlKey || e.metaKey'));
check('table whole row/column selectors exist', cardsEditors.includes('selectWholeColumn') && cardsEditors.includes('selectWholeRow'));
check('table TSV copy/paste exists', cardsEditors.includes("join('\\t')") && cardsEditors.includes('applyMatrix') && cardsEditors.includes('onPasteCapture'));
check('table Delete clears the selected matrix', cardsEditors.includes("e.key === 'Delete' || e.key === 'Backspace'") && cardsEditors.includes("writeCellOn(next, cell, '')"));
check('table keyboard navigation and Alt+Enter exist', cardsEditors.includes("e.key === 'Tab'") && cardsEditors.includes('e.shiftKey') && cardsEditors.includes("e.key === 'Enter'") && cardsEditors.includes("e.altKey && e.key === 'Enter'"));
check('table split safety accounts for colspan and rowspan', splitTable.includes('colSpan') && splitTable.includes('rowSpan') && splitTable.includes('computeRowSafety'));
check('table split logical width accounts for colspans', splitTable.includes('rowLogicalWidth') && splitTable.includes('Math.max(1, cell.colSpan || 1)'));
check("diagram studio ships required presets", diagramStudio.includes("id: 'org'") && diagramStudio.includes("id: 'flowchart'") && diagramStudio.includes("id: 'system'") && diagramStudio.includes("id: 'mindmap'"));
check('diagram studio supports direction, curve, theme', diagramStudio.includes('applyDirection') && diagramStudio.includes("curve?: DiagramStudioCurve") && diagramStudio.includes("theme?: DiagramStudioTheme"));
check('diagram editor has landscape toggle and asset-save conversion', cardsEditors.includes('Khổ giấy ngang') && cardsEditors.includes('serializeFigure') && cardsEditors.includes('asset:${name}'));
check('diagram IndexedDB asset path exists', store.includes('addGeneratedAsset') && store.includes('putAsset') && store.includes('asset.generated'));
check('landscape page sizing reaches preview and renderer', rendererHtml.includes('data-sr-landscape') && layout.includes("type PageOrientation = 'portrait' | 'landscape'") && rendererCss.includes('.sr-page-landscape'));
check('landscape browser print and direct PDF paths exist', print.includes('sr-page-landscape') && rendererCss.includes('landscape-page') && pdf.includes('doc.addPage([page.widthMm, page.heightMm], page.orientation)'));
check('TopBar dropdown is explicit absolute overlay', topbar.includes('overflow-visible') && fs.readFileSync(path.join(root, 'apps/web/src/components/ui/Menu.tsx'), 'utf8').includes('top-[calc(100%+4px)]'));
check('@ reference syntax highlight + autocomplete', fs.readFileSync(path.join(root, 'apps/web/src/components/canvas/AutoTextarea.tsx'), 'utf8').includes('sr-ref-token') && auto.includes('detectTrigger') && auto.includes('mentionCandidates'));
check('table context menu + fill handle', cardsEditors.includes('Căn trái') && cardsEditors.includes('Căn theo dấu thập phân') && cardsEditors.includes('Kéo để điền dữ liệu'));
check('columns ungroup preserves landscape', read('apps/web/src/lib/cards.ts').includes('orientation=landscape') && cardShell.includes('makeColumns(pair[0], pair[1]'));
check('print links + landscape page breaks', rendererHtml.includes('href="#') && rendererCss.includes('break-before:page') && rendererCss.includes('@page landscape-page{size:${p.height} ${p.width};margin:0!important;}'));

if (failures) process.exit(1);
console.log('Native interaction source smoke: PASS');
