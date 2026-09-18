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

if (failures) process.exit(1);
console.log('Native interaction source smoke: PASS');
