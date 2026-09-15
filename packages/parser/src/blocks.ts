import type {
  AlignMode,
  BlockNode,
  Diagnostic,
  InlineNode,
  ListItemNode,
  Point,
  Position,
  TableCell,
} from '@scirender/ast';
import { makeNodeId } from '@scirender/ast';
import { parseInline } from './inline.js';
import { extractTrailingAttrs, type AttrSpec } from './attrs.js';

export interface SrcLine {
  text: string;
  line: number; // 1-based absolute
  col: number; // 1-based column of text[0] in the original line
  offset: number; // absolute offset of text[0]
}

export interface BlockParseState {
  diagnostics: Diagnostic[];
  ordinal: { n: number };
}

const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_FENCE = /^(```|~~~)\s*([A-Za-z0-9_+-]*)\s*$/;
const RE_THEMATIC = /^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/;
const RE_BULLET = /^(\s*)([-*+])\s+(.*)$/;
const RE_ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const RE_CAPTION = /^:\s+(.*)$/;
const RE_IMAGE_ONLY = /^!\[([^\]]*)\]\(([^)]*)\)\s*(\{[^{}]*\})?\s*$/;

export function toLines(body: string, firstLine: number, firstOffset: number): SrcLine[] {
  const out: SrcLine[] = [];
  let offset = firstOffset;
  const raw = body.split('\n');
  for (let i = 0; i < raw.length; i++) {
    const text = raw[i] ?? '';
    out.push({ text, line: firstLine + i, col: 1, offset });
    offset += text.length + 1;
  }
  return out;
}

function startPoint(l: SrcLine): Point {
  return { line: l.line, column: l.col, offset: l.offset };
}

function endPoint(l: SrcLine): Point {
  return { line: l.line, column: l.col + l.text.length, offset: l.offset + l.text.length };
}

function span(a: SrcLine, b: SrcLine): Position {
  return { start: startPoint(a), end: endPoint(b) };
}

function inlineOf(text: string, l: SrcLine, st: BlockParseState, colShift = 0): InlineNode[] {
  return parseInline(text, { line: l.line, column: l.col + colShift, offset: l.offset + colShift }, st.ordinal);
}

function nid(type: string, pos: Position, st: BlockParseState): string {
  return makeNodeId(type, pos, st.ordinal.n++);
}

function isBlank(l: SrcLine | undefined): boolean {
  return !l || l.text.trim() === '';
}

/** Dedents a slice of lines by `n` characters, keeping absolute positions right. */
function dedent(lines: SrcLine[], n: number): SrcLine[] {
  return lines.map((l) => {
    const cut = Math.min(n, l.text.length - l.text.trimStart().length);
    return { text: l.text.slice(cut), line: l.line, col: l.col + cut, offset: l.offset + cut };
  });
}

export function parseBlocks(lines: SrcLine[], st: BlockParseState): BlockNode[] {
  const out: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] as SrcLine;
    if (isBlank(line)) { i++; continue; }
    const t = line.text;

    // ---------------------------------------------------------- display math
    if (/^\$\$/.test(t.trim())) {
      i = readDisplayMath(lines, i, out, st);
      continue;
    }

    // ------------------------------------------------------------ code fence
    const fence = RE_FENCE.exec(t.trim());
    if (fence) {
      i = readFence(lines, i, out, st, fence[1] as string, (fence[2] ?? '').toLowerCase());
      continue;
    }

    // --------------------------------------------------------------- heading
    const h = RE_HEADING.exec(t);
    if (h) {
      const { text: body, spec } = extractTrailingAttrs((h[2] ?? '').trim());
      const pos = span(line, line);
      out.push({
        type: 'heading',
        id: nid('heading', pos, st),
        position: pos,
        depth: Math.min(6, (h[1] as string).length) as 1 | 2 | 3 | 4 | 5 | 6,
        children: inlineOf(body, line, st, (h[1] as string).length + 1),
        label: spec.label,
        number: null,
        unnumbered: spec.unnumbered,
      });
      i++;
      continue;
    }

    // ---------------------------------------------------------- thematic rule
    if (RE_THEMATIC.test(t)) {
      const pos = span(line, line);
      out.push({ type: 'thematicBreak', id: nid('thematicBreak', pos, st), position: pos });
      i++;
      continue;
    }

    // ------------------------------------------------------------- blockquote
    if (/^\s{0,3}>/.test(t)) {
      const start = i;
      const inner: SrcLine[] = [];
      while (i < lines.length && /^\s{0,3}>/.test((lines[i] as SrcLine).text)) {
        const cur = lines[i] as SrcLine;
        const m = /^(\s{0,3}>\s?)/.exec(cur.text) as RegExpExecArray;
        const cut = (m[1] as string).length;
        inner.push({ text: cur.text.slice(cut), line: cur.line, col: cur.col + cut, offset: cur.offset + cut });
        i++;
      }
      const pos = span(lines[start] as SrcLine, lines[i - 1] as SrcLine);
      out.push({
        type: 'blockquote',
        id: nid('blockquote', pos, st),
        position: pos,
        children: parseBlocks(inner, st),
      });
      continue;
    }

    // ---------------------------------------------------------------- callout
    if (/^:::/.test(t.trim())) {
      i = readCallout(lines, i, out, st);
      continue;
    }

    // ------------------------------------------------------------------ table
    if (t.trimStart().startsWith('|') && isDelimiterRow(lines[i + 1]?.text)) {
      i = readTable(lines, i, out, st);
      continue;
    }

    // ----------------------------------------------------------------- figure
    const img = RE_IMAGE_ONLY.exec(t.trim());
    if (img) {
      i = readFigure(lines, i, out, st, img);
      continue;
    }

    // ------------------------------------------------------------------- list
    if (RE_BULLET.test(t) || RE_ORDERED.test(t)) {
      i = readList(lines, i, out, st);
      continue;
    }

    // -------------------------------------------------------------- paragraph
    i = readParagraph(lines, i, out, st);
  }

  return out;
}

/* ------------------------------------------------------------------ readers */

function readDisplayMath(
  lines: SrcLine[],
  i: number,
  out: BlockNode[],
  st: BlockParseState,
): number {
  const first = lines[i] as SrcLine;
  const trimmed = first.text.trim();

  // Single-line form: `$$ a = b $$ {#eq:x}`
  const single = /^\$\$(.*)\$\$\s*(\{[^{}]*\})?\s*$/.exec(trimmed);
  if (single && (single[1] ?? '').trim()) {
    const spec = specOf(single[2]);
    pushEquation(out, st, (single[1] as string).trim(), spec, span(first, first));
    return i + 1;
  }

  const openRest = trimmed.slice(2).trim();
  const openSpec = openRest.startsWith('{') ? specOf(openRest) : null;
  const buf: string[] = [];
  let j = i + 1;
  let closed = false;
  let closeSpec: AttrSpec | null = null;
  while (j < lines.length) {
    const cur = (lines[j] as SrcLine).text;
    const closeMatch = /^\s*\$\$\s*(\{[^{}]*\})?\s*$/.exec(cur);
    if (closeMatch) {
      closed = true;
      closeSpec = specOf(closeMatch[1]);
      break;
    }
    buf.push(cur);
    j++;
  }
  const last = (lines[Math.min(j, lines.length - 1)] ?? first) as SrcLine;
  const pos = span(first, last);

  if (!closed) {
    st.diagnostics.push({
      code: 'SR-P010',
      severity: 'error',
      stage: 'parser',
      message: 'Khối công thức mở bằng "$$" nhưng không có "$$" đóng.',
      hint: 'Thêm dòng "$$" để đóng khối công thức.',
      position: pos,
    });
  }
  pushEquation(out, st, buf.join('\n').trim(), closeSpec ?? openSpec, pos);
  return closed ? j + 1 : j;
}

function specOf(raw: string | undefined | null): AttrSpec | null {
  if (!raw) return null;
  const { spec } = extractTrailingAttrs(raw.trim());
  return spec.label || spec.unnumbered || Object.keys(spec.attrs).length ? spec : null;
}

function pushEquation(
  out: BlockNode[],
  st: BlockParseState,
  value: string,
  spec: AttrSpec | null,
  pos: Position,
): void {
  out.push({
    type: 'equation',
    id: nid('equation', pos, st),
    position: pos,
    value,
    label: spec?.label ?? null,
    number: null,
    unnumbered: spec?.unnumbered ?? false,
  });
}

function readFence(
  lines: SrcLine[],
  i: number,
  out: BlockNode[],
  st: BlockParseState,
  marker: string,
  lang: string,
): number {
  const first = lines[i] as SrcLine;
  const buf: string[] = [];
  let j = i + 1;
  let closed = false;
  while (j < lines.length) {
    if ((lines[j] as SrcLine).text.trim().startsWith(marker)) { closed = true; break; }
    buf.push((lines[j] as SrcLine).text);
    j++;
  }
  const last = (lines[Math.min(j, lines.length - 1)] ?? first) as SrcLine;
  const pos = span(first, last);
  if (!closed) {
    st.diagnostics.push({
      code: 'SR-P011',
      severity: 'error',
      stage: 'parser',
      message: `Khối mã mở bằng "${marker}" nhưng không được đóng.`,
      position: pos,
    });
  }
  let next = closed ? j + 1 : j;

  if (lang === 'mermaid') {
    const cap = readCaptionLine(lines, next, st);
    const dir = (cap?.spec.attrs.dir ?? '').toUpperCase();
    out.push({
      type: 'diagram',
      id: nid('diagram', pos, st),
      position: pos,
      engine: 'mermaid',
      value: buf.join('\n'),
      caption: cap?.caption ?? [],
      label: cap?.spec.label ?? null,
      number: null,
      direction: ['TB', 'TD', 'BT', 'LR', 'RL'].includes(dir) ? dir : null,
    });
    if (cap) next = cap.next;
    return next;
  }

  const codeCaption = readCaptionLine(lines, next, st);
  out.push({
    type: 'codeBlock',
    id: nid('codeBlock', pos, st),
    position: pos,
    lang: lang || null,
    value: buf.join('\n'),
    caption: codeCaption?.caption ?? [],
    label: codeCaption?.spec.label ?? null,
    number: null,
  });
  return codeCaption ? codeCaption.next : next;
}

function readCallout(
  lines: SrcLine[],
  i: number,
  out: BlockNode[],
  st: BlockParseState,
): number {
  const first = lines[i] as SrcLine;
  const header = first.text.trim().replace(/^:::+\s*/, '');
  const m = /^([A-Za-z0-9_-]+)?\s*(.*)$/.exec(header) as RegExpExecArray;
  const variant = (m[1] ?? 'note').toLowerCase();
  const title = (m[2] ?? '').trim() || null;
  const inner: SrcLine[] = [];
  let j = i + 1;
  let closed = false;
  while (j < lines.length) {
    if (/^:::+\s*$/.test((lines[j] as SrcLine).text.trim())) { closed = true; break; }
    inner.push(lines[j] as SrcLine);
    j++;
  }
  const last = (lines[Math.min(j, lines.length - 1)] ?? first) as SrcLine;
  const pos = span(first, last);
  if (!closed) {
    st.diagnostics.push({
      code: 'SR-P012',
      severity: 'error',
      stage: 'parser',
      message: 'Khối ":::" không được đóng.',
      position: pos,
    });
  }
  out.push({
    type: 'callout',
    id: nid('callout', pos, st),
    position: pos,
    variant,
    title,
    children: parseBlocks(inner, st),
  });
  return closed ? j + 1 : j;
}

function isDelimiterRow(text: string | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (!t.startsWith('|') && !t.includes('|')) return false;
  return /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/.test(t);
}

function splitRow(text: string): string[] {
  let t = text.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i] as string;
    if (ch === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '|') { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function readTable(
  lines: SrcLine[],
  i: number,
  out: BlockNode[],
  st: BlockParseState,
): number {
  const first = lines[i] as SrcLine;
  const headerCells = splitRow(first.text);
  const delim = splitRow((lines[i + 1] as SrcLine).text);
  const align: AlignMode[] = delim.map((d) => {
    const l = d.startsWith(':');
    const r = d.endsWith(':');
    if (l && r) return 'center';
    if (r) return 'right';
    if (l) return 'left';
    return 'default';
  });

  const rows: TableCell[][] = [];
  let j = i + 2;
  while (j < lines.length && (lines[j] as SrcLine).text.trim().includes('|') && !isBlank(lines[j])) {
    const cur = lines[j] as SrcLine;
    const cells = splitRow(cur.text);
    if (cells.length !== headerCells.length) {
      st.diagnostics.push({
        code: 'SR-P020',
        severity: 'warning',
        stage: 'parser',
        message: `Dòng bảng có ${cells.length} ô nhưng tiêu đề có ${headerCells.length} ô.`,
        hint: 'Số ô mỗi dòng phải khớp với dòng tiêu đề.',
        position: span(cur, cur),
      });
    }
    rows.push(
      Array.from({ length: headerCells.length }, (_, k) => ({
        children: inlineOf(cells[k] ?? '', cur, st),
      })),
    );
    j++;
  }

  const cap = readCaptionLine(lines, j, st);
  const last = (lines[Math.max(i, j - 1)] ?? first) as SrcLine;
  const pos = span(first, last);
  out.push({
    type: 'table',
    id: nid('table', pos, st),
    position: pos,
    header: headerCells.map((c) => ({ children: inlineOf(c, first, st) })),
    rows,
    align,
    caption: cap?.caption ?? [],
    label: cap?.spec.label ?? null,
    number: null,
  });
  return cap ? cap.next : j;
}

function readCaptionLine(
  lines: SrcLine[],
  i: number,
  st: BlockParseState,
): { caption: InlineNode[]; spec: AttrSpec; next: number } | null {
  let k = i;
  if (isBlank(lines[k])) k++; // allow one blank line before the caption
  const line = lines[k];
  if (!line) return null;
  const m = RE_CAPTION.exec(line.text.trim());
  if (!m) return null;
  const { text, spec } = extractTrailingAttrs((m[1] as string).trim());
  return { caption: inlineOf(text, line, st, 2), spec, next: k + 1 };
}

function readFigure(
  lines: SrcLine[],
  i: number,
  out: BlockNode[],
  st: BlockParseState,
  m: RegExpExecArray,
): number {
  const line = lines[i] as SrcLine;
  const alt = m[1] ?? '';
  const src = (m[2] ?? '').trim();
  const spec = specOf(m[3]) ?? { label: null, classes: [], attrs: {}, unnumbered: false };
  const cap = readCaptionLine(lines, i + 1, st);
  const pos = span(line, line);
  out.push({
    type: 'figure',
    id: nid('figure', pos, st),
    position: pos,
    src,
    alt,
    caption: cap ? cap.caption : inlineOf(alt, line, st, 2),
    label: cap?.spec.label ?? spec.label,
    number: null,
    attrs: { ...spec.attrs, ...(cap?.spec.attrs ?? {}) },
  });
  return cap ? cap.next : i + 1;
}

function markerInfo(text: string): { indent: number; ordered: boolean; start: number; rest: string; width: number } | null {
  const b = RE_BULLET.exec(text);
  if (b) {
    return {
      indent: (b[1] as string).length,
      ordered: false,
      start: 1,
      rest: b[3] as string,
      width: (b[1] as string).length + 2,
    };
  }
  const o = RE_ORDERED.exec(text);
  if (o) {
    return {
      indent: (o[1] as string).length,
      ordered: true,
      start: parseInt(o[2] as string, 10),
      rest: o[3] as string,
      width: (o[1] as string).length + (o[2] as string).length + 2,
    };
  }
  return null;
}

function readList(
  lines: SrcLine[],
  i: number,
  out: BlockNode[],
  st: BlockParseState,
): number {
  const firstInfo = markerInfo((lines[i] as SrcLine).text);
  if (!firstInfo) return readParagraph(lines, i, out, st);
  const baseIndent = firstInfo.indent;
  const ordered = firstInfo.ordered;
  const items: ListItemNode[] = [];
  const startLine = lines[i] as SrcLine;
  let j = i;

  while (j < lines.length) {
    const cur = lines[j];
    if (isBlank(cur)) {
      const next = lines[j + 1];
      const nextInfo = next ? markerInfo(next.text) : null;
      if (nextInfo && nextInfo.indent >= baseIndent) { j++; continue; }
      break;
    }
    const info = markerInfo((cur as SrcLine).text);
    if (!info || info.indent < baseIndent || info.ordered !== ordered) break;
    if (info.indent > baseIndent) break;

    const itemLines: SrcLine[] = [];
    const head = cur as SrcLine;
    itemLines.push({
      text: info.rest,
      line: head.line,
      col: head.col + info.width,
      offset: head.offset + info.width,
    });
    let k = j + 1;
    while (k < lines.length) {
      const l = lines[k] as SrcLine;
      if (isBlank(l)) {
        const after = lines[k + 1];
        if (after && !isBlank(after) && leadingSpaces(after.text) > baseIndent) {
          itemLines.push(l);
          k++;
          continue;
        }
        break;
      }
      if (markerInfo(l.text) && leadingSpaces(l.text) <= baseIndent) break;
      if (leadingSpaces(l.text) <= baseIndent && !markerInfo(l.text)) {
        // lazy continuation of the item paragraph
        itemLines.push(l);
        k++;
        continue;
      }
      itemLines.push(l);
      k++;
    }

    const itemPos = span(head, (lines[k - 1] ?? head) as SrcLine);
    items.push({
      type: 'listItem',
      id: nid('listItem', itemPos, st),
      position: itemPos,
      children: parseBlocks(dedent(itemLines, info.width), st),
    });
    j = k;
  }

  const pos = span(startLine, (lines[Math.max(i, j - 1)] ?? startLine) as SrcLine);
  out.push({
    type: 'list',
    id: nid('list', pos, st),
    position: pos,
    ordered,
    start: firstInfo.start,
    items,
  });
  return j;
}

function leadingSpaces(text: string): number {
  return text.length - text.trimStart().length;
}

function readParagraph(
  lines: SrcLine[],
  i: number,
  out: BlockNode[],
  st: BlockParseState,
): number {
  const first = lines[i] as SrcLine;
  const buf: string[] = [];
  let j = i;
  while (j < lines.length) {
    const cur = lines[j] as SrcLine;
    if (isBlank(cur)) break;
    const t = cur.text;
    if (j > i) {
      if (
        RE_HEADING.test(t) ||
        RE_FENCE.test(t.trim()) ||
        /^\$\$/.test(t.trim()) ||
        /^:::/.test(t.trim()) ||
        RE_THEMATIC.test(t) ||
        /^\s{0,3}>/.test(t) ||
        markerInfo(t) ||
        RE_IMAGE_ONLY.test(t.trim()) ||
        (t.trimStart().startsWith('|') && isDelimiterRow(lines[j + 1]?.text))
      ) {
        break;
      }
    }
    buf.push(t);
    j++;
  }
  const last = (lines[j - 1] ?? first) as SrcLine;
  const pos = span(first, last);
  out.push({
    type: 'paragraph',
    id: nid('paragraph', pos, st),
    position: pos,
    children: parseInline(buf.join('\n'), startPoint(first), st.ordinal),
  });
  return j;
}
