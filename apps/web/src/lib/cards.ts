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
  | 'pageBreak'
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
    case 'pageBreak':
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
  /** Stable key used for search, recents and tests. */
  id: string;
  kind: CardKind;
  label: string;
  hint: string;
  /** Extra words the search box should match, beyond the label. */
  keywords: string;
  text: string;
}

/**
 * Ordered by how often a report actually needs them, not by how the parser is
 * organised: text and headings first, then the four things a BTL is made of,
 * then the rest. The menu puts whatever you used recently above all of it.
 */
export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'paragraph',
    kind: 'paragraph',
    label: 'Đoạn văn',
    hint: 'Văn bản thường',
    keywords: 'text doan van paragraph chu noi dung',
    text: 'Nội dung đoạn văn.',
  },
  {
    id: 'heading-2',
    kind: 'heading',
    label: 'Đề mục cấp 2',
    hint: 'Mục 1.1',
    keywords: 'heading h2 de muc tieu de muc con',
    text: '## Tên mục',
  },
  {
    id: 'heading-1',
    kind: 'heading',
    label: 'Đề mục cấp 1',
    hint: 'CHƯƠNG mới, luôn sang trang',
    keywords: 'heading h1 chuong chapter de muc',
    text: '# Tên chương',
  },
  {
    id: 'figure',
    kind: 'figure',
    label: 'Hình ảnh',
    hint: 'Từ tab Tài nguyên hoặc dán ảnh',
    keywords: 'image hinh anh figure picture',
    text: '![Chú thích hình](asset:ten-anh){#fig:ten-nhan width=80%}',
  },
  {
    id: 'table',
    kind: 'table',
    label: 'Bảng',
    hint: 'Dán từ Excel cũng ra bảng này',
    keywords: 'table bang excel du lieu grid',
    text: '| Cột A | Cột B | Cột C |\n|:------|------:|:-----:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\n: Chú thích bảng {#tbl:ten-nhan}',
  },
  {
    id: 'equation',
    kind: 'equation',
    label: 'Công thức',
    hint: 'LaTeX, đánh số tự động',
    keywords: 'equation cong thuc latex math toan',
    text: '$$\n\\frac{a}{b} = c\n$$ {#eq:ten-nhan}',
  },
  {
    id: 'list',
    kind: 'list',
    label: 'Danh sách',
    hint: 'Gạch đầu dòng',
    keywords: 'list danh sach bullet gach dau dong',
    text: '- Mục một\n- Mục hai',
  },
  {
    id: 'diagram',
    kind: 'diagram',
    label: 'Sơ đồ khối',
    hint: 'Mermaid, tự chọn chiều',
    keywords: 'diagram so do khoi flowchart mermaid',
    text: '```mermaid\nflowchart TB\n  A[Đầu vào] --> B[Xử lý]\n  B --> C[Kết quả]\n```\n\n: Chú thích sơ đồ {#dia:ten-nhan}',
  },
  {
    id: 'code',
    kind: 'codeBlock',
    label: 'Khối mã',
    hint: 'Có tô màu cú pháp',
    keywords: 'code khoi ma python source',
    text: '```python\nx = 1\n```\n\n: Chú thích mã nguồn {#lst:ten-nhan}',
  },
  {
    id: 'heading-3',
    kind: 'heading',
    label: 'Đề mục cấp 3',
    hint: 'Mục 1.1.1',
    keywords: 'heading h3 de muc nho',
    text: '### Tên mục nhỏ',
  },
  {
    id: 'columns',
    kind: 'columns',
    label: 'Hàng hai cột',
    hint: 'Hai khối cạnh nhau',
    keywords: 'columns hai cot side by side',
    text: '::: cols\nCột trái.\n|||\nCột phải.\n:::',
  },
  {
    id: 'footnote',
    kind: 'footnote',
    label: 'Chú thích chân trang',
    hint: 'In ở chân trang có tham chiếu',
    keywords: 'footnote chu thich chan trang',
    text: '[^nhan]: Nội dung chú thích.',
  },
  {
    id: 'callout',
    kind: 'callout',
    label: 'Khung ghi chú',
    hint: 'note / tip / warning / danger',
    keywords: 'callout khung ghi chu note warning',
    text: '::: note Tiêu đề\nNội dung ghi chú.\n:::',
  },
  {
    id: 'quote',
    kind: 'blockquote',
    label: 'Trích dẫn',
    hint: 'Khối trích',
    keywords: 'quote trich dan blockquote',
    text: '> Nội dung trích dẫn.',
  },
  {
    id: 'heading-4',
    kind: 'heading',
    label: 'Đề mục cấp 4',
    hint: 'Mục 1.1.1.1',
    keywords: 'heading h4 de muc',
    text: '#### Tên mục',
  },
  {
    id: 'rule',
    kind: 'thematicBreak',
    label: 'Đường kẻ ngang',
    hint: '',
    keywords: 'rule duong ke ngang hr',
    text: '---',
  },
  {
    id: 'pagebreak',
    kind: 'pageBreak',
    label: 'Ngắt trang',
    hint: 'Buộc bắt đầu trang mới ở đây (Ctrl+Enter)',
    keywords: 'pagebreak ngat trang page break trang moi sang trang',
    text: ':::pagebreak:::',
  },
];

/** Strips Vietnamese diacritics so "cong thuc" finds "Công thức". */
export function foldDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Ranks block templates against what was typed. Matching is accent-insensitive
 * and prefix-weighted, so two or three letters are enough to land on the right
 * block without reading the whole list.
 */
export function searchTemplates(query: string, recent: string[] = []): CardTemplate[] {
  const q = foldDiacritics(query.trim());
  if (!q) {
    const pinned = recent
      .map((id) => CARD_TEMPLATES.find((t) => t.id === id))
      .filter((t): t is CardTemplate => !!t);
    const rest = CARD_TEMPLATES.filter((t) => !recent.includes(t.id));
    return [...pinned, ...rest];
  }
  const scored: Array<{ t: CardTemplate; score: number }> = [];
  for (const t of CARD_TEMPLATES) {
    const label = foldDiacritics(t.label);
    const hay = `${label} ${foldDiacritics(t.hint)} ${t.keywords}`;
    let score = 0;
    if (label.startsWith(q)) score = 100;
    else if (label.includes(q)) score = 70;
    else if (hay.includes(q)) score = 40;
    else if (q.split(/\s+/).every((w) => hay.includes(w))) score = 20;
    if (!score) continue;
    const recentBoost = Math.max(0, 8 - recent.indexOf(t.id)) * (recent.includes(t.id) ? 1 : 0);
    scored.push({ t, score: score + recentBoost });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.t);
}

/** A quiet colour per block type — enough to scan the column, not a rainbow. */
export const KIND_TONE: Record<CardKind, string> = {
  heading: 'bg-deep-50 text-deep-700',
  paragraph: 'bg-ink-100 text-ink-600',
  equation: 'bg-violet-50 text-violet-700',
  figure: 'bg-sky-50 text-sky-700',
  table: 'bg-emerald-50 text-emerald-700',
  diagram: 'bg-sky-50 text-sky-700',
  codeBlock: 'bg-amber-50 text-amber-700',
  list: 'bg-ink-100 text-ink-600',
  blockquote: 'bg-ink-100 text-ink-600',
  callout: 'bg-amber-50 text-amber-700',
  thematicBreak: 'bg-ink-100 text-ink-500',
  pageBreak: 'bg-flag-50 text-flag-700',
  footnote: 'bg-flag-50 text-flag-600',
  columns: 'bg-deep-50 text-deep-700',
  unknown: 'bg-ink-100 text-ink-500',
};

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
  pageBreak: 'Ngắt trang',
  footnote: 'Chú thích',
  columns: 'Hai cột',
  unknown: 'Khối',
};

/** Re-detects the kind of a card after its text was edited. */
export function detectKind(text: string): CardKind {
  const raw = text.replace(/\r\n?/g, '\n');
  const t = raw.trim();
  if (!t) return 'paragraph';
  if (/^\[\^[A-Za-z0-9_-]+\]:/.test(t)) return 'footnote';
  // Keep the in-progress marker (`# `) as a heading while the user is still typing.
  if (/^#{1,6}(?:[ \t]+|$)/.test(raw)) return 'heading';
  if (/^:::\s*pagebreak\s*:::$/i.test(t)) return 'pageBreak';
  if (/^:::\s*cols\b/.test(t)) return 'columns';
  if (/^:::/.test(t)) return 'callout';
  if (/^\$\$/.test(t)) return 'equation';
  if (/^```mermaid\b/.test(t)) return 'diagram';
  if (/^(```|~~~)/.test(t)) return 'codeBlock';
  if (/^!\[/.test(t)) return 'figure';
  if (/^\|/.test(t)) return 'table';
  if(/^>[ \t]+/.test(raw)) return 'blockquote';
  if (/^(\s*[-*+]\s|\s*\d{1,9}[.)]\s)/.test(raw)) return 'list';
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
