# Native Core Interaction — Word-style shortcuts & audit modal

## Modal
`AuditDialog` now uses a viewport-sized flex backdrop, centered `max-w-2xl` dialog, a non-shrinking header and an independently scrollable findings area. Clicking the backdrop closes the dialog.

## Shortcut registry
`apps/web/src/lib/shortcuts.ts` is the single registry used by the cheat sheet. The Command Palette is `Ctrl+Shift+P` / `F1`; `Ctrl+K` is reserved for links; `Ctrl+Alt+1/2/3/0` map to Heading 1/2/3/Body.

## Paste
`Ctrl+Shift+V` forces plain-text insertion. Rich/structured `Ctrl+V` pastes can surface a compact three-choice toolbar: SciRender format, plain text or raw Markdown.

## Semantic keyboard behavior
Enter on a selected non-text block inserts a paragraph below. Delete/Backspace on a selected figure/table checks for existing `@fig:`/`@tbl:` references and asks for confirmation before deleting. Native browser textarea word navigation (`Ctrl+Left/Right` and `Ctrl+Shift+Left/Right`) is deliberately left untouched.
