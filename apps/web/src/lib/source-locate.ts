/**
 * Preview → source: find where a word the user double-clicked in the rendered
 * page lives in the Markdown of its card.
 *
 * The rendered text and the source differ by markup (`**`, `++`, `[x](url)`,
 * `{#fig:id}`, `\`), so counting occurrences is unreliable — and a paragraph
 * split across pages loses its leading text on the continuation. Instead each
 * whole-word occurrence in the source is scored by how much of the rendered
 * context (text just before and after the word) it reproduces once markup
 * characters are skipped. Highest score wins; ties go to the first. Pure and
 * deterministic (P2).
 */

const MARKUP = new Set(['*', '_', '+', '~', '^', '`', '\\', '[', ']', '#', '$', '{', '}', '|', '>']);
const WORD = /[\p{L}\p{N}]/u;

function norm(ch: string): string {
  return /\s/.test(ch) ? ' ' : ch.toLocaleLowerCase('vi');
}

/** Visible-ish characters of `src` walking left from `from` (exclusive). */
function visibleBefore(src: string, from: number, limit: number): string {
  let out = '';
  let lastSpace = false;
  for (let i = from - 1; i >= 0 && out.length < limit; i--) {
    const ch = src[i] as string;
    // Skip a whole `(url)` link target: `)` … `(` immediately after `]`.
    if (ch === ')' ) {
      const open = src.lastIndexOf('](', i);
      if (open !== -1 && open > i - 400) { i = open; continue; }
    }
    if (MARKUP.has(ch)) continue;
    const n = norm(ch);
    if (n === ' ') { if (lastSpace) continue; lastSpace = true; } else lastSpace = false;
    out = n + out;
  }
  return out;
}

function visibleAfter(src: string, from: number, limit: number): string {
  let out = '';
  let lastSpace = false;
  for (let i = from; i < src.length && out.length < limit; i++) {
    const ch = src[i] as string;
    if (ch === ']' && src[i + 1] === '(') {
      const close = src.indexOf(')', i + 2);
      if (close !== -1 && close < i + 400) { i = close; continue; }
    }
    if (MARKUP.has(ch)) continue;
    const n = norm(ch);
    if (n === ' ') { if (lastSpace) continue; lastSpace = true; } else lastSpace = false;
    out += n;
  }
  return out;
}

function squash(text: string): string {
  return Array.from(text).map(norm).join('').replace(/ +/g, ' ');
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

export interface SourceMatch {
  start: number;
  end: number;
  score: number;
}

/**
 * @param source  the editor's text
 * @param word    the double-clicked word as rendered
 * @param before  rendered text immediately before the word (any length)
 * @param after   rendered text immediately after the word
 */
export function locateInSource(source: string, word: string, before = '', after = '', span = 40): SourceMatch | null {
  const target = word.trim();
  if (!target) return null;
  const lowerSrc = source.toLocaleLowerCase('vi');
  const lowerWord = target.toLocaleLowerCase('vi');
  const ctxBefore = squash(before).slice(-span);
  const ctxAfter = squash(after).slice(0, span);

  let best: SourceMatch | null = null;
  let from = 0;
  for (;;) {
    const at = lowerSrc.indexOf(lowerWord, from);
    if (at === -1) break;
    from = at + 1;
    const end = at + target.length;
    // Whole-word only, so "áp" does not land inside "huyết áp kế" → "áp" is fine,
    // but "a" inside "ba" is not.
    if (WORD.test(target[0] as string) && at > 0 && WORD.test(source[at - 1] as string)) continue;
    if (WORD.test(target[target.length - 1] as string) && end < source.length && WORD.test(source[end] as string)) continue;
    const score =
      commonSuffix(visibleBefore(source, at, span), ctxBefore) +
      commonPrefix(visibleAfter(source, end, span), ctxAfter);
    if (!best || score > best.score) best = { start: at, end, score };
  }
  return best;
}
