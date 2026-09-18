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

check('audit modal centered flex backdrop', audit.includes('fixed inset-0 z-50 flex items-center justify-center'));
check('audit modal portals to document.body', audit.includes('createPortal(') && audit.includes('document.body'));
check('audit modal viewport-safe height', audit.includes('max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-2xl'));
check('audit findings have independent scrolling', audit.includes('flex-1 overflow-y-auto p-6 space-y-3'));
check('command palette uses Ctrl+Shift+P/F1 registry', command.includes("matchesShortcut(e, 'command-palette')"));
check('Ctrl+K is hyperlink action', auto.includes("matchesShortcut(e, 'hyperlink')"));
check('Ctrl+Shift+V clean paste path', canvas.includes("matchesShortcut(e, 'clean-paste')"));
check('rich paste micro-toolbar', canvas.includes('Theo định dạng SciRender') && canvas.includes('Markdown thô'));
check('semantic Enter creates paragraph after non-text block', canvas.includes("['figure', 'table', 'equation', 'codeBlock', 'diagram']") && canvas.includes("insertAt(activeIndex + 1, 'Nội dung đoạn văn.')"));
check('referenced delete confirmation exists', canvas.includes('deleteConfirmIndex') && canvas.includes('Khối này đang được tham chiếu'));
check('Ctrl+Alt heading registry entries', shortcuts.includes("Ctrl+Alt+1") && shortcuts.includes("Ctrl+Alt+0"));
check('shortcut listener uses capture phase', shortcuts.includes("window.addEventListener('keydown', handler, true)"));
check('heading shortcut matchers exist', ['heading-1', 'heading-2', 'heading-3', 'paragraph'].every((id) => shortcuts.includes(`case '${id}':`)));
check('between-card insert divider', canvas.includes('h-4 items-center justify-center') && canvas.includes('insertAt(index + 1, tpl.text)'));
check('drag auto-scroll near viewport edges', canvas.includes('const edge = 80') && canvas.includes('requestAnimationFrame(stepDragAutoScroll)'));
check('shortcut cheat sheet mounted', fs.existsSync(path.join(root, 'apps/web/src/components/ShortcutCheatSheet.tsx')) && app.includes('<ShortcutCheatSheet'));
check('native word navigation left to browser', !canvas.includes('Ctrl+Arrow') && !auto.includes('Ctrl+Arrow'));
check('Obsidian Studio base surface tokens', css.includes('--sr-workspace-base: #0b0d11') && css.includes('--sr-paper-ground: #13161f') && css.includes('--sr-card: #161922'));
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
check('per-card insert below control', cardShell.includes('onInsertBelow') && cardShell.includes('Thêm khối bên dưới'));
check('reduced-motion compatible animation tokens', css.includes('transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-out'));

if (failures) process.exit(1);
console.log('Native interaction source smoke: PASS');
