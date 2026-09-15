import type { DocumentNode } from '@scirender/ast';
import { parse } from '@scirender/parser';

/**
 * The block canvas, and why it is a *view* over Markdown rather than a second
 * document model.
 *
 * Each card owns one slice of the Markdown source. Splitting is done from the
 * parser's own node positions, so a card is exactly the text the parser saw —
 * and putting the cards back together reproduces the file. That keeps P1
 * (nothing of the author's text is invented or dropped by the editor) and P3
 * (the AST stays the single source of truth) intact: the canvas never becomes a
 * parallel truth that can drift from the source.
 *
 * A caption line (`: …`) belongs to the block above it, and a footnote
 * definition is its own card even though the parser lifts it out of the block
 * flow — both fall out of slicing by position rather than by blank lines.
 */
export type CardKind =
  | 'heading'
  | 'paragraph'
  | 'equation'
  | 'figure'
  | 'table'
  | 'diagram'
  | 'codeBlock'
  | 'list'
  | 'blockquote'
  | 'callout'
  | 'thematicBreak'
  | 'footnote'
  | 'columns'
  | 'unknown';

export interface Card {
  /** Stable within one parse; regenerated whenever the source is re-sliced. */
  id: string;
  kind: CardKind;
  /** The exact Markdown of this block, trimmed of surrounding blank lines. */
  text: string;
  /** 1-based line of the first line of the card in the full source. */
  line: number;
}

export interface CanvasDoc {
  /** `---\n…\n---` front matter, verbatim and unparsed. Empty when absent. */
  frontMatter: string;
  cards: Card[];
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitFrontMatter(source: string): { frontMatter: string; bodyOffset: number } {
  const m = FRONT_MATTER.exec(source);
  if (!m) return { frontMatter: '', bodyOffset: 0 };
  return { frontMatter: m[0].trimEnd(), bodyOffset: m[0].length };
}

interface Piece {
  kind: CardKind;
  start: number;
  line: number;
}

function kindOf(type: string): CardKind {
  switch (type) {
    case 'heading':
    case 'paragraph':
    case 'equation':
    case 'figure':
    case 'table':
    case 'diagram':
    case 'codeBlock':
    case 'list':
    case 'blockquote':
    case 'callout':
    case 'thematicBreak':
    case 'columns':
      return type;
    default:
      return 'unknown';
  }
}

/** Slices a Markdown document into cards, using the parser's block positions. */
export function toCards(source: string, parsed?: DocumentNode): CanvasDoc {
  const src = source.replace(/\r\n?/g, '\n');
  const { frontMatter } = splitFrontMatter(src);
  const doc = parsed ?? parse(src).document;

  const pieces: Piece[] = [
    ...doc.children.map((n) => ({
      kind: kindOf(n.type),
      start: n.position.start.offset,
      line: n.position.start.line,
    })),
    ...doc.footnotes.map((f) => ({
      kind: 'footnote' as CardKind,
      start: f.position.start.offset,
      line: f.position.start.line,
    })),
  ].sort((a, b) => a.start - b.start);

  const cards: Card[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i] as Piece;
    const next = pieces[i + 1];
    // Everything up to the next block belongs to this one — which is how a
    // trailing caption line stays attached to its table or figure.
    const end = next ? next.start : src.length;
    const text = src.slice(piece.start, end).replace(/\s+$/, '');
    if (!text.trim()) continue;
    cards.push({ id: `card-${i}-${piece.start}`, kind: piece.kind, text, line: piece.line });
  }

  return { frontMatter, cards };
}

/** Cards back to Markdown. One blank line between cards, nothing else added. */
export function toSource(doc: CanvasDoc): string {
  const body = doc.cards
    .map((c) => c.text.replace(/\s+$/, ''))
    .filter((t) => t.trim())
    .join('\n\n');
  const head = doc.frontMatter.trim();
  if (!head) return `${body}\n`;
  return body ? `${head}\n\n${body}\n` : `${head}\n`;
}

/* ------------------------------------------------------------ new material */

export interface CardTemplate {
  kind: CardKind;
  label: string;
  hint: string;
  text: string;
}

export const CARD_TEMPLATES: CardTemplate[] = [
  { kind: 'heading', label: 'Đề mục cấp 1', hint: 'CHƯƠNG mới, luôn sang trang', text: '# Tên chương' },
  { kind: 'heading', label: 'Đề mục cấp 2', hint: 'Mục 1.1', text: '## Tên mục' },
  { kind: 'heading', label: 'Đề mục cấp 3', hint: 'Mục 1.1.1', text: '### Tên mục nhỏ' },
  { kind: 'paragraph', label: 'Đoạn văn', hint: 'Văn bản thường', text: 'Nội dung đoạn văn.' },
  {
    kind: 'equation',
    label: 'Công thức',
    hint: 'LaTeX, đánh số tự động',
    text: '$$\n\\frac{a}{b} = c\n$$ {#eq:ten-nhan}',
  },
  {
    kind: 'figure',
    label: 'Hình ảnh',
    hint: 'Từ tab Tài nguyên hoặc dán ảnh',
    text: '![Chú thích hình](asset:ten-anh){#fig:ten-nhan width=80%}',
  },
  {
    kind: 'table',
    label: 'Bảng',
    hint: 'Dán từ Excel cũng ra bảng này',
    text: '| Cột A | Cột B | Cột C |\n|:------|------:|:-----:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\n: Chú thích bảng {#tbl:ten-nhan}',
  },
  {
    kind: 'diagram',
    label: 'Sơ đồ khối',
    hint: 'Mermaid, tự chọn chiều',
    text: '```mermaid\nflowchart TB\n  A[Đầu vào] --> B[Xử lý]\n  B --> C[Kết quả]\n```\n\n: Chú thích sơ đồ {#dia:ten-nhan}',
  },
  {
    kind: 'codeBlock',
    label: 'Khối mã',
    hint: 'Có tô màu cú pháp',
    text: '```python\nx = 1\n```\n\n: Chú thích mã nguồn {#lst:ten-nhan}',
  },
  { kind: 'list', label: 'Danh sách', hint: 'Gạch đầu dòng', text: '- Mục một\n- Mục hai' },
  { kind: 'blockquote', label: 'Trích dẫn', hint: 'Khối trích', text: '> Nội dung trích dẫn.' },
  {
    kind: 'callout',
    label: 'Khung ghi chú',
    hint: 'note / tip / warning / danger',
    text: '::: note Tiêu đề\nNội dung ghi chú.\n:::',
  },
  {
    kind: 'columns',
    label: 'Hàng hai cột',
    hint: 'Hai khối cạnh nhau',
    text: '::: cols\nCột trái.\n|||\nCột phải.\n:::',
  },
  {
    kind: 'footnote',
    label: 'Chú thích chân trang',
    hint: 'In ở chân trang có tham chiếu',
    text: '[^nhan]: Nội dung chú thích.',
  },
  { kind: 'thematicBreak', label: 'Đường kẻ ngang', hint: '', text: '---' },
];

export const KIND_LABEL: Record<CardKind, string> = {
  heading: 'Đề mục',
  paragraph: 'Đoạn văn',
  equation: 'Công thức',
  figure: 'Hình',
  table: 'Bảng',
  diagram: 'Sơ đồ',
  codeBlock: 'Mã nguồn',
  list: 'Danh sách',
  blockquote: 'Trích dẫn',
  callout: 'Ghi chú',
  thematicBreak: 'Đường kẻ',
  footnote: 'Chú thích',
  columns: 'Hai cột',
  unknown: 'Khối',
};

/** Re-detects the kind of a card after its text was edited. */
export function detectKind(text: string): CardKind {
  const t = text.trim();
  if (!t) return 'paragraph';
  if (/^\[\^[A-Za-z0-9_-]+\]:/.test(t)) return 'footnote';
  if (/^#{1,6}\s/.test(t)) return 'heading';
  if (/^:::\s*cols\b/.test(t)) return 'columns';
  if (/^:::/.test(t)) return 'callout';
  if (/^\$\$/.test(t)) return 'equation';
  if (/^```mermaid\b/.test(t)) return 'diagram';
  if (/^(```|~~~)/.test(t)) return 'codeBlock';
  if (/^!\[/.test(t)) return 'figure';
  if (/^\|/.test(t)) return 'table';
  if (/^>/.test(t)) return 'blockquote';
  if (/^(\s*[-*+]\s|\s*\d{1,9}[.)]\s)/.test(t)) return 'list';
  if (/^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(t)) return 'thematicBreak';
  return 'paragraph';
}

/** Moves a card, returning a new array. Out-of-range indexes are a no-op. */
export function moveCard(cards: Card[], from: number, to: number): Card[] {
  if (from === to || from < 0 || to < 0 || from >= cards.length || to > cards.length) return cards;
  const next = cards.slice();
  const [item] = next.splice(from, 1);
  if (!item) return cards;
  next.splice(from < to ? to - 1 : to, 0, item);
  return next;
}

/** Wraps two cards into one two-column row. */
export function makeColumns(left: string, right: string): string {
  return `::: cols\n${left.trim()}\n|||\n${right.trim()}\n:::`;
}

/** Splits a two-column row back into its two halves; null when not a row. */
export function splitColumns(text: string): [string, string] | null {
  const m = /^:::\s*cols[ \t]*\n([\s\S]*?)\n:::\s*$/.exec(text.trim());
  if (!m) return null;
  const parts = (m[1] as string).split(/^\|\|\|[ \t]*$/m);
  if (parts.length !== 2) return null;
  return [(parts[0] ?? '').trim(), (parts[1] ?? '').trim()];
}
