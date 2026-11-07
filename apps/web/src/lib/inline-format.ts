/**
 * Bold / italic / underline as Markdown markers on a textarea selection.
 *
 * Pure: (text, selection) in → (text, selection) out, so the canvas, the raw
 * editor and the smoke test share one implementation (P4). Only markers are
 * added or removed — the author's characters are never rewritten (P1).
 *
 *   bold       **text**
 *   italic     *text*
 *   underline  ++text++   (markdown-it-ins convention, parsed by @scirender/parser)
 */

export type InlineFormat = 'bold' | 'italic' | 'underline';

export const FORMAT_MARKER: Record<InlineFormat, string> = {
  bold: '**',
  italic: '*',
  underline: '++',
};

export interface FormatResult {
  value: string;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}_]/u;

/** Is `marker` really sitting at `at`, and not part of a longer run (`*` inside `**`)? */
function markerAt(value: string, at: number, marker: string, side: 'before' | 'after'): boolean {
  if (at < 0 || !value.startsWith(marker, at)) return false;
  const ch = marker[0] as string;
  if (marker.length === 1) {
    // `*` belongs to italic only if it is not half of a `**` — except `***`
    // (bold+italic), where the innermost/outermost star is the italic one.
    const prev = value[at - 1];
    const next = value[at + 1];
    if (side === 'before') return prev !== ch || value[at - 2] === ch;
    return next !== ch || value[at + 2] === ch;
  }
  return true;
}

/**
 * Toggles `format` on the selection [start, end).
 * - Selection already wrapped (markers just outside or just inside) → unwrap.
 * - Empty selection inside a word → the word is the selection.
 * - Empty selection elsewhere → an empty marker pair, caret in the middle.
 * Whitespace at the selection edges stays outside the markers, because
 * `** chữ**` is not valid emphasis and would silently print the stars.
 */
export function toggleInlineFormat(value: string, start: number, end: number, format: InlineFormat): FormatResult {
  const marker = FORMAT_MARKER[format];
  const m = marker.length;
  let s = Math.max(0, Math.min(start, end));
  let e = Math.min(value.length, Math.max(start, end));

  if (s === e) {
    let a = s;
    let b = e;
    while (a > 0 && WORD.test(value[a - 1] as string)) a--;
    while (b < value.length && WORD.test(value[b] as string)) b++;
    if (a === b) {
      // Caret between an empty pair we just inserted → remove it again.
      if (value.slice(s - m, s) === marker && value.slice(s, s + m) === marker) {
        return { value: value.slice(0, s - m) + value.slice(s + m), start: s - m, end: s - m };
      }
      return { value: value.slice(0, s) + marker + marker + value.slice(s), start: s + m, end: s + m };
    }
    s = a;
    e = b;
  }

  // Keep edge whitespace outside the markers.
  while (s < e && /\s/.test(value[s] as string)) s++;
  while (e > s && /\s/.test(value[e - 1] as string)) e--;
  if (s === e) return { value, start, end };

  // Markers just outside the selection: **[chữ]**
  if (markerAt(value, s - m, marker, 'before') && markerAt(value, e, marker, 'after')) {
    const next = value.slice(0, s - m) + value.slice(s, e) + value.slice(e + m);
    return { value: next, start: s - m, end: e - m };
  }
  // Markers inside the selection: [**chữ**]
  const inner = value.slice(s, e);
  if (
    inner.length > 2 * m &&
    inner.startsWith(marker) &&
    inner.endsWith(marker) &&
    markerAt(value, s, marker, 'before') &&
    markerAt(value, e - m, marker, 'after')
  ) {
    const unwrapped = inner.slice(m, inner.length - m);
    return { value: value.slice(0, s) + unwrapped + value.slice(e), start: s, end: s + unwrapped.length };
  }

  const next = value.slice(0, s) + marker + value.slice(s, e) + marker + value.slice(e);
  return { value: next, start: s + m, end: e + m };
}

/** Ctrl/Cmd+B / I / U → format, otherwise null. Shift/Alt combos stay free. */
export function formatFromKey(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; key: string; code?: string }): InlineFormat | null {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'b' || e.code === 'KeyB') return 'bold';
  if (k === 'i' || e.code === 'KeyI') return 'italic';
  if (k === 'u' || e.code === 'KeyU') return 'underline';
  return null;
}
