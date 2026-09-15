/**
 * SciRender Document AST — P3: the AST is the single source of truth.
 * Nothing downstream (HTML, PDF, layout) is allowed to become authoritative.
 *
 * Invariants:
 *  - Every node carries a deterministic `id` derived from its type + source position
 *    + ordinal (see `makeNodeId`). The same input always yields the same ids (P2).
 *  - Every node carries `position` pointing back into the original source so that
 *    diagnostics can be reported against a real line (P6).
 *  - Numbering (`number`) is NOT assigned by the parser. It is assigned by the
 *    numbering pass so that template rules can change numbering without reparsing.
 */

export interface Point {
  line: number; // 1-based
  column: number; // 1-based
  offset: number; // 0-based absolute offset into the source
}

export interface Position {
  start: Point;
  end: Point;
}

export type AlignMode = 'left' | 'center' | 'right' | 'default';

export interface NodeBase {
  type: string;
  id: string;
  position: Position;
}

/* ------------------------------------------------------------------ inline */

export interface TextNode extends NodeBase {
  type: 'text';
  value: string;
}

export interface StrongNode extends NodeBase {
  type: 'strong';
  children: InlineNode[];
}

export interface EmphasisNode extends NodeBase {
  type: 'emphasis';
  children: InlineNode[];
}

export interface SuperscriptNode extends NodeBase {
  type: 'superscript';
  children: InlineNode[];
}

export interface SubscriptNode extends NodeBase {
  type: 'subscript';
  children: InlineNode[];
}

export interface InlineCodeNode extends NodeBase {
  type: 'inlineCode';
  value: string;
}

export interface InlineMathNode extends NodeBase {
  type: 'inlineMath';
  value: string;
}

export interface LinkNode extends NodeBase {
  type: 'link';
  url: string;
  title?: string;
  children: InlineNode[];
}

/** Cross reference such as `@eq:mass`, `@fig:setup`, `@tbl:results`, `@sec:method`. */
export interface CrossRefNode extends NodeBase {
  type: 'crossRef';
  /** Full label including the kind prefix, e.g. `eq:mass`. */
  label: string;
  kind: RefKind;
  /** Filled by the numbering pass; null when the label could not be resolved. */
  resolved: ResolvedRef | null;
}

export interface CitationNode extends NodeBase {
  type: 'citation';
  keys: string[];
  /** Filled by the numbering pass: bibliography index per key, 1-based. */
  numbers: (number | null)[];
  /**
   * Filled by the numbering pass for author-year styles: the short form shown
   * in the text, e.g. `Nguyễn và cs., 2020`. Null when the key is unknown.
   */
  shortForms: (string | null)[];
}

/** `[^1]` in running text. The definition lives in `DocumentNode.footnotes`. */
export interface FootnoteRefNode extends NodeBase {
  type: 'footnoteRef';
  label: string;
  /** Filled by the numbering pass, 1-based, in order of first reference. */
  number: number | null;
}

export interface LineBreakNode extends NodeBase {
  type: 'break';
}

export type InlineNode =
  | TextNode
  | StrongNode
  | EmphasisNode
  | SuperscriptNode
  | SubscriptNode
  | InlineCodeNode
  | InlineMathNode
  | LinkNode
  | CrossRefNode
  | CitationNode
  | FootnoteRefNode
  | LineBreakNode;

/* ------------------------------------------------------------------- block */

export interface HeadingNode extends NodeBase {
  type: 'heading';
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
  label: string | null; // `{#sec:method}`
  /** Assigned by the numbering pass, e.g. "2.1". Null when unnumbered. */
  number: string | null;
  /** `{-}` or `{.unnumbered}` opts a heading out of numbering. */
  unnumbered: boolean;
}

export interface ParagraphNode extends NodeBase {
  type: 'paragraph';
  children: InlineNode[];
}

export interface EquationNode extends NodeBase {
  type: 'equation';
  /** Raw TeX, exactly as authored. P1: never rewritten. */
  value: string;
  label: string | null;
  number: string | null;
  unnumbered: boolean;
}

export interface FigureNode extends NodeBase {
  type: 'figure';
  src: string;
  alt: string;
  caption: InlineNode[];
  label: string | null;
  number: string | null;
  attrs: Record<string, string>; // width, height, ...
}

export interface TableCell {
  children: InlineNode[];
}

export interface TableNode extends NodeBase {
  type: 'table';
  header: TableCell[];
  rows: TableCell[][];
  align: AlignMode[];
  caption: InlineNode[];
  label: string | null;
  number: string | null;
}

export interface CodeBlockNode extends NodeBase {
  type: 'codeBlock';
  lang: string | null;
  value: string;
  /** A captioned listing is numbered like a figure ("Mã nguồn 2.1"). */
  caption: InlineNode[];
  label: string | null;
  number: string | null;
}

export interface DiagramNode extends NodeBase {
  type: 'diagram';
  /** Currently only `mermaid`. */
  engine: 'mermaid';
  value: string;
  caption: InlineNode[];
  label: string | null;
  number: string | null;
  /** `dir=TB|LR|BT|RL` from the caption attributes; null = use the template default. */
  direction: string | null;
}

export interface ListItemNode extends NodeBase {
  type: 'listItem';
  children: BlockNode[];
}

export interface ListNode extends NodeBase {
  type: 'list';
  ordered: boolean;
  start: number;
  items: ListItemNode[];
}

export interface BlockquoteNode extends NodeBase {
  type: 'blockquote';
  children: BlockNode[];
}

/** `::: note` … `:::` */
export interface CalloutNode extends NodeBase {
  type: 'callout';
  variant: string;
  title: string | null;
  children: BlockNode[];
}

/** A row of blocks laid side by side: `::: cols … ||| … :::`. */
export interface ColumnsNode extends NodeBase {
  type: 'columns';
  /** One entry per column; two in practice, but the shape allows more. */
  columns: BlockNode[][];
}

export interface ThematicBreakNode extends NodeBase {
  type: 'thematicBreak';
}

/** Emitted when the parser refuses to guess. P6: never silently dropped. */
export interface UnknownBlockNode extends NodeBase {
  type: 'unknownBlock';
  raw: string;
  reason: string;
}

export type BlockNode =
  | HeadingNode
  | ParagraphNode
  | EquationNode
  | FigureNode
  | TableNode
  | CodeBlockNode
  | DiagramNode
  | ListNode
  | BlockquoteNode
  | CalloutNode
  | ColumnsNode
  | ThematicBreakNode
  | UnknownBlockNode;

export type AnyNode = BlockNode | InlineNode | ListItemNode | DocumentNode;

/* ---------------------------------------------------------------- document */

export interface Author {
  name: string;
  affiliation?: string;
  email?: string;
  orcid?: string;
  corresponding?: boolean;
}

export interface BibEntry {
  key: string;
  authors?: string;
  title?: string;
  year?: string | number;
  source?: string; // journal / publisher / conference
  volume?: string;
  pages?: string;
  doi?: string;
  url?: string;
}

/** One member of the group, as printed on the HCMUT inner cover page. */
export interface CoverMember {
  name: string;
  studentId?: string;
}

/**
 * Everything the HCMUT "Báo cáo bài tập lớn" cover pages need.
 * Ignored by templates that render no cover.
 */
export interface CoverMeta {
  university?: string; // ĐẠI HỌC QUỐC GIA TP. HỒ CHÍ MINH
  school?: string; // TRƯỜNG ĐẠI HỌC BÁCH KHOA
  faculty?: string; // KHOA KHOA HỌC ỨNG DỤNG
  reportType?: string; // BÁO CÁO BÀI TẬP LỚN
  course?: string; // môn học
  class?: string; // L01
  group?: string; // Nhóm 1
  advisor?: string; // GVHD
  members: CoverMember[];
  place?: string; // Tp. HCM
  /** Logo source, same resolution rules as a figure (`asset:` / https: / data:). */
  logo?: string;
}

export interface DocumentMeta {
  title: string;
  subtitle?: string;
  authors: Author[];
  abstract?: string;
  /** Lời cảm ơn — front-matter section in the BTL structure. */
  acknowledgement?: string;
  /** Danh mục các từ viết tắt: term -> meaning, order preserved. */
  abbreviations: Array<{ term: string; meaning: string }>;
  keywords: string[];
  date?: string;
  language: string; // BCP-47-ish; drives caption words when the template defers
  templateId?: string;
  bibliography: BibEntry[];
  cover?: CoverMeta;
  /** Any front-matter key the schema does not know. Kept verbatim (P1). */
  extra: Record<string, unknown>;
}

export type RefKind = 'eq' | 'fig' | 'tbl' | 'sec' | 'dia' | 'lst';

export interface ResolvedRef {
  kind: RefKind;
  number: string;
  nodeId: string;
}

export interface LabelRecord extends ResolvedRef {
  label: string;
  /** Source position of the definition, for duplicate-label diagnostics. */
  position: Position;
}

export interface DocumentNode {
  type: 'document';
  id: string;
  meta: DocumentMeta;
  children: BlockNode[];
  /** label -> record. Populated by the numbering pass, empty after parse. */
  labels: Record<string, LabelRecord>;
  /** Citation keys in order of first appearance. Drives numeric bibliography. */
  citationOrder: string[];
  /** `[^label]: …` definitions, in source order. */
  footnotes: FootnoteDefinition[];
  position: Position;
}

export interface FootnoteDefinition {
  id: string;
  label: string;
  children: InlineNode[];
  /** Filled by the numbering pass; null when nothing references it. */
  number: number | null;
  position: Position;
}
