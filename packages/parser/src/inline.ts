import type { InlineNode, Point, RefKind } from '@scirender/ast';
import { makeNodeId } from '@scirender/ast';
import { Locator } from './locator.js';

const REF_KINDS = new Set<string>(['eq', 'fig', 'tbl', 'sec', 'dia']);

interface Ctx {
  src: string;
  loc: Locator;
  /** Monotonic counter making ids unique when several nodes share a position. */
  ordinal: { n: number };
}

function id(ctx: Ctx, type: string, start: number): string {
  return makeNodeId(type, ctx.loc.span(start, start), ctx.ordinal.n++);
}

function isEscaped(src: string, i: number): boolean {
  let backslashes = 0;
  for (let k = i - 1; k >= 0 && src.charCodeAt(k) === 92; k--) backslashes++;
  return backslashes % 2 === 1;
}

function textNode(ctx: Ctx, value: string, start: number, end: number): InlineNode {
  return { type: 'text', id: id(ctx, 'text', start), position: ctx.loc.span(start, end), value };
}

/**
 * Inline scanner. Deterministic, single pass, no backtracking beyond a bounded
 * lookahead for the matching delimiter. Anything unmatched degrades to text —
 * the parser never invents markup the author did not write (P1).
 */
export function parseInline(src: string, base: Point, ordinal = { n: 0 }): InlineNode[] {
  const ctx: Ctx = { src, loc: new Locator(src, base), ordinal };
  return scan(ctx, 0, src.length);
}

function scan(ctx: Ctx, from: number, to: number): InlineNode[] {
  const { src } = ctx;
  const out: InlineNode[] = [];
  let buf = '';
  let bufStart = from;

  const flush = (at: number) => {
    if (buf.length) {
      out.push(textNode(ctx, buf, bufStart, at));
      buf = '';
    }
  };

  let i = from;
  while (i < to) {
    const ch = src[i] as string;

    // --- escapes -----------------------------------------------------------
    if (ch === '\\' && i + 1 < to) {
      const next = src[i + 1] as string;
      if (/[\\`*_{}\[\]()#+\-.!$~^@|]/.test(next)) {
        if (!buf.length) bufStart = i;
        buf += next;
        i += 2;
        continue;
      }
    }

    // --- hard line break ---------------------------------------------------
    if (ch === '\n') {
      const twoSpaces = src.slice(Math.max(from, i - 2), i) === '  ';
      flush(twoSpaces ? i - 2 : i);
      if (twoSpaces) {
        out.push({ type: 'break', id: id(ctx, 'break', i), position: ctx.loc.span(i, i + 1) });
      } else {
        out.push(textNode(ctx, ' ', i, i + 1));
      }
      i += 1;
      bufStart = i;
      continue;
    }

    // --- inline code -------------------------------------------------------
    if (ch === '`') {
      let ticks = 0;
      while (i + ticks < to && src[i + ticks] === '`') ticks++;
      const fence = '`'.repeat(ticks);
      const close = src.indexOf(fence, i + ticks);
      if (close !== -1 && close < to) {
        flush(i);
        const value = src.slice(i + ticks, close);
        out.push({
          type: 'inlineCode',
          id: id(ctx, 'inlineCode', i),
          position: ctx.loc.span(i, close + ticks),
          value,
        });
        i = close + ticks;
        bufStart = i;
        continue;
      }
    }

    // --- inline math -------------------------------------------------------
    if (ch === '$' && src[i + 1] !== '$') {
      let j = i + 1;
      while (j < to) {
        if (src[j] === '$' && !isEscaped(src, j)) break;
        if (src[j] === '\n' && src[j + 1] === '\n') { j = -1; break; }
        j++;
      }
      if (j > i && j < to && src[j] === '$') {
        const value = src.slice(i + 1, j);
        if (value.trim().length) {
          flush(i);
          out.push({
            type: 'inlineMath',
            id: id(ctx, 'inlineMath', i),
            position: ctx.loc.span(i, j + 1),
            value,
          });
          i = j + 1;
          bufStart = i;
          continue;
        }
      }
    }

    // --- strong / emphasis -------------------------------------------------
    if (ch === '*' || ch === '_') {
      const strong = src[i + 1] === ch;
      const marker = strong ? ch + ch : ch;
      const close = findClosing(src, i + marker.length, to, marker);
      if (close !== -1) {
        flush(i);
        const children = scan(ctx, i + marker.length, close);
        const type = strong ? 'strong' : 'emphasis';
        out.push({
          type,
          id: id(ctx, type, i),
          position: ctx.loc.span(i, close + marker.length),
          children,
        } as InlineNode);
        i = close + marker.length;
        bufStart = i;
        continue;
      }
    }

    // --- superscript / subscript ------------------------------------------
    if (ch === '^' || ch === '~') {
      const close = findClosing(src, i + 1, to, ch);
      if (close !== -1 && close > i + 1 && !/\s/.test(src.slice(i + 1, close))) {
        flush(i);
        const type = ch === '^' ? 'superscript' : 'subscript';
        out.push({
          type,
          id: id(ctx, type, i),
          position: ctx.loc.span(i, close + 1),
          children: scan(ctx, i + 1, close),
        } as InlineNode);
        i = close + 1;
        bufStart = i;
        continue;
      }
    }

    // --- citation `[@key; @key2]` or link `[text](url)` --------------------
    if (ch === '[') {
      const close = matchBracket(src, i, to, '[', ']');
      if (close !== -1) {
        const inner = src.slice(i + 1, close);
        const citeKeys = parseCitationKeys(inner);
        if (citeKeys) {
          flush(i);
          out.push({
            type: 'citation',
            id: id(ctx, 'citation', i),
            position: ctx.loc.span(i, close + 1),
            keys: citeKeys,
            numbers: citeKeys.map(() => null),
          });
          i = close + 1;
          bufStart = i;
          continue;
        }
        if (src[close + 1] === '(') {
          const pclose = matchBracket(src, close + 1, to, '(', ')');
          if (pclose !== -1) {
            flush(i);
            const target = src.slice(close + 2, pclose).trim();
            const m = /^(\S+)(?:\s+"([^"]*)")?$/.exec(target);
            out.push({
              type: 'link',
              id: id(ctx, 'link', i),
              position: ctx.loc.span(i, pclose + 1),
              url: m?.[1] ?? target,
              ...(m?.[2] ? { title: m[2] } : {}),
              children: scan(ctx, i + 1, close),
            });
            i = pclose + 1;
            bufStart = i;
            continue;
          }
        }
      }
    }

    // --- cross reference `@fig:setup` -------------------------------------
    if (ch === '@') {
      // The label may contain dots and dashes internally but must not end with
      // one, so that `@tbl:dataset.` at the end of a sentence keeps the period.
      const m = /^@([a-z]+):([A-Za-z0-9_]+(?:[.\-]+[A-Za-z0-9_]+)*)/.exec(src.slice(i, to));
      if (m && REF_KINDS.has(m[1] as string)) {
        flush(i);
        const label = `${m[1]}:${m[2]}`;
        out.push({
          type: 'crossRef',
          id: id(ctx, 'crossRef', i),
          position: ctx.loc.span(i, i + m[0].length),
          label,
          kind: m[1] as RefKind,
          resolved: null,
        });
        i += m[0].length;
        bufStart = i;
        continue;
      }
    }

    if (!buf.length) bufStart = i;
    buf += ch;
    i++;
  }
  flush(i);
  return out;
}

/** Finds a closing delimiter, skipping escaped ones, code spans and math. */
function findClosing(src: string, from: number, to: number, marker: string): number {
  let i = from;
  while (i < to) {
    const ch = src[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '`') {
      const next = src.indexOf('`', i + 1);
      if (next === -1 || next >= to) return -1;
      i = next + 1;
      continue;
    }
    if (ch === '$') {
      const next = src.indexOf('$', i + 1);
      if (next !== -1 && next < to) { i = next + 1; continue; }
    }
    if (src.startsWith(marker, i) && !isEscaped(src, i)) {
      // An opening marker immediately followed by whitespace is not emphasis.
      if (i === from) return -1;
      return i;
    }
    if (ch === '\n' && src[i + 1] === '\n') return -1;
    i++;
  }
  return -1;
}

function matchBracket(src: string, from: number, to: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i < to; i++) {
    const ch = src[i];
    if (ch === '\\') { i++; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseCitationKeys(inner: string): string[] | null {
  const parts = inner.split(';').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const keys: string[] = [];
  for (const part of parts) {
    const m = /^@([A-Za-z0-9_:.\-]+)/.exec(part);
    if (!m) return null;
    keys.push(m[1] as string);
  }
  return keys;
}
