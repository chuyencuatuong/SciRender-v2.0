import { detectKind, type CardKind } from './cards';

/**
 * Smart paste.
 *
 * Ctrl+V has to do the obvious thing with whatever is on the clipboard — a
 * screenshot, a block of LaTeX, a range copied out of Excel — without the user
 * first telling the app what it is.
 *
 * Two rules keep that from turning into guesswork the author cannot undo:
 *
 * - **P1.** Recognition only ever *wraps* the pasted text; not one character of
 *   it is rewritten. A table built from TSV keeps every cell verbatim, escaping
 *   only the pipe that would otherwise break the row.
 * - **P6.** Every recognition is announced on the card and can be undone in one
 *   click, so a wrong guess is visible and cheap, never silent.
 */
export type PasteKind = 'text' | 'latex' | 'table' | 'code' | 'diagram' | 'image';

export function normalizeLatex(text: string): string {
  return text
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, body: string) => `$${body}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$\n$1\n$$')
    .replace(/\r\n?/g, '\n');
}

export interface BulkPasteItem {
  markdown: string;
  label: string;
  cardKind: CardKind;
}

export function parseBulkMarkdown(text: string): BulkPasteItem[] | null {
  const source = normalizeLatex(text).trim();
  if (!source) return null;
  const lines = source.split('\n');
  const blocks: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  const flush = (): void => {
    const value = buf.join('\n').trim();
    if (value) blocks.push(value);
    buf = [];
  };
  for (const line of lines) {
    const f = /^\s*(```|~~~)(.*)$/.exec(line);
    if (fence) {
      buf.push(line);
      if (f && f[1] === fence) { fence = null; flush(); }
      continue;
    }
    if (f) { flush(); fence = f[1]!; buf.push(line); continue; }
    if (/^#{1,6}\s+/.test(line) && buf.length) flush();
    if (/^#{1,6}\s+/.test(line) || /^\$\$/.test(line) || /^\|.*\|\s*$/.test(line)) {
      if (buf.length && /^\|/.test(line) !== /^\|/.test(buf[0] ?? '')) flush();
    }
    if (!line.trim()) { flush(); continue; }
    buf.push(line);
  }
  flush();
  if (blocks.length < 2) return null;
  const items: BulkPasteItem[] = [];
  for (const block of blocks) {
    const kind = detectPaste(block).cardKind;
    const label = detectPaste(block).label;
    items.push({ markdown: block, label, cardKind: kind });
  }
  const structural = items.filter((item) => item.cardKind !== 'paragraph').length;
  return structural || blocks.length > 2 ? items : null;
}

export interface PasteResult {
  kind: PasteKind;
  /** Markdown ready to go into a card. Empty for images (the file is handled). */
  markdown: string;
  /** What the card should say it recognised. */
  label: string;
  /** The card kind the text should live in. */
  cardKind: CardKind;
}

const LATEX_HINTS =
  /\\(frac|sum|int|sqrt|alpha|beta|gamma|delta|theta|lambda|mu|sigma|omega|partial|nabla|cdot|times|leq|geq|neq|approx|begin|end|left|right|mathrm|mathbf|text|hat|bar|vec)\b/;

export function looksLikeLatex(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\$\$[\s\S]*\$\$$/.test(t)) return true;
  if (/^\\begin\{(equation|align|gather|matrix|bmatrix|pmatrix|cases)/.test(t)) return true;
  if (!LATEX_HINTS.test(t)) return false;
  // A sentence that merely mentions \alpha is prose, not an equation.
  return t.split(/\s+/).length <= 40 && !/[.!?]\s+[A-ZĐÀ-Ỹ]/.test(t);
}

export function looksLikeMermaid(text: string): boolean {
  return /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey)\b/.test(
    text,
  );
}

const CODE_HINTS = [
  /^\s*(def|class|import|from|return|if|for|while|elif|else)\b.*:\s*$/m,
  /^\s*(function|const|let|var|export|import)\b.*[;{]\s*$/m,
  /^\s*#include\b/m,
  /^\s*(public|private|protected)\s+(static\s+)?\w+\s+\w+\s*\(/m,
  /^\s*<\?php\b/m,
  /[;{}]\s*$/m,
];

export function looksLikeCode(text: string): boolean {
  const lines = text.replace(/\s+$/, '').split('\n');
  if (lines.length < 2) return false;
  const indented = lines.filter((l) => /^(\t| {2,})\S/.test(l)).length;
  const hits = CODE_HINTS.filter((re) => re.test(text)).length;
  return hits >= 2 || (hits >= 1 && indented >= 1) || indented >= Math.ceil(lines.length / 2);
}

/** Guesses the language so the block gets syntax colours; null when unsure. */
export function guessLanguage(text: string): string | null {
  if (/^\s*#include\b|->|std::/m.test(text)) return 'cpp';
  if (/^\s*(def|class)\s+\w+.*:\s*$/m.test(text) || /^\s*import\s+\w+\s*$/m.test(text)) {
    return 'python';
  }
  if (/\bfunction\b|=>|\bconst\b|\blet\b/.test(text)) return 'javascript';
  if (/^\s*(public|private)\s+class\b/m.test(text)) return 'java';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/im.test(text)) return 'sql';
  if (/^\s*%|\bend\s*$/m.test(text) && /\bfor\b|\bfunction\b/.test(text)) return 'matlab';
  return null;
}

/* ---------------------------------------------------------------- tables */

/** Cell text is never rewritten — only a literal pipe is escaped. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

export function rowsToMarkdown(rows: string[][]): string {
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]): string[] =>
    Array.from({ length: width }, (_, i) => cell(r[i] ?? ''));
  const [first, ...rest] = rows;
  const header = pad(first ?? []);
  const lines = [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rest.map((r) => `| ${pad(r).join(' | ')} |`),
  ];
  return `${lines.join('\n')}\n\n: Chú thích bảng {#tbl:ten-nhan}`;
}

/** Splits a delimited paste. Returns null when the shape is not a table. */
export function parseDelimited(text: string): string[][] | null {
  // Only trailing newlines go: a trailing tab is an empty last column, and
  // eating it would make the row ragged and the table unrecognised.
  const lines = text.replace(/\n+$/, '').split('\n');
  if (lines.length < 2) return null;
  for (const sep of ['\t', ';', ','] as const) {
    const rows = lines.map((l) => splitLine(l, sep));
    const width = rows[0]?.length ?? 0;
    if (width < 2) continue;
    // Every row must agree on the column count; anything ragged is prose.
    if (!rows.every((r) => r.length === width)) continue;
    return rows;
  }
  return null;
}

/** Splits one line, honouring the quoting rules Excel and CSV exports use. */
function splitLine(line: string, sep: string): string[] {
  if (sep === '\t') return line.split('\t');
  const out: string[] = [];
  let buf = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          buf += '"';
          i++;
        } else quoted = false;
      } else buf += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === sep) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out;
}

/** Reads a real `<table>` out of clipboard HTML (Excel, Word, web pages). */
export function tableFromHtml(html: string): string[][] | null {
  if (typeof DOMParser === 'undefined' || !/<table/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th,td')).map((td) => td.textContent ?? ''),
  );
  if (rows.length < 2 || (rows[0]?.length ?? 0) < 2) return null;
  return rows;
}

/* ------------------------------------------------------------- dispatcher */

export function detectPaste(text: string, html?: string): PasteResult {
  const clean = normalizeLatex(text);
  const trimmed = clean.trim();

  const htmlRows = html ? tableFromHtml(html) : null;
  if (htmlRows) {
    return {
      kind: 'table',
      markdown: rowsToMarkdown(htmlRows),
      label: 'Bảng dán từ Excel / trang web',
      cardKind: 'table',
    };
  }

  // Markdown that already is a table stays exactly as it is.
  if (/^\|.*\|\s*$/m.test(trimmed) && /^\s*\|?[:\- |]+\|/m.test(trimmed)) {
    return { kind: 'table', markdown: trimmed, label: 'Bảng Markdown', cardKind: 'table' };
  }

  const rows = parseDelimited(clean);
  if (rows) {
    return {
      kind: 'table',
      markdown: rowsToMarkdown(rows),
      label: 'Bảng dán từ dữ liệu phân tách',
      cardKind: 'table',
    };
  }

  if (looksLikeMermaid(trimmed)) {
    return {
      kind: 'diagram',
      markdown: `\`\`\`mermaid\n${trimmed}\n\`\`\`\n\n: Chú thích sơ đồ {#dia:ten-nhan}`,
      label: 'Sơ đồ Mermaid',
      cardKind: 'diagram',
    };
  }

  if (looksLikeLatex(trimmed)) {
    const body = trimmed.replace(/^\$\$\s*/, '').replace(/\s*\$\$$/, '');
    return {
      kind: 'latex',
      markdown: `$$\n${body}\n$$ {#eq:ten-nhan}`,
      label: 'Công thức LaTeX',
      cardKind: 'equation',
    };
  }

  if (looksLikeCode(clean)) {
    const lang = guessLanguage(clean);
    return {
      kind: 'code',
      markdown: `\`\`\`${lang ?? ''}\n${clean.replace(/\s+$/, '')}\n\`\`\``,
      label: lang ? `Khối mã (${lang})` : 'Khối mã',
      cardKind: 'codeBlock',
    };
  }

  return {
    kind: 'text',
    markdown: trimmed,
    label: 'Văn bản',
    cardKind: detectKind(trimmed),
  };
}
