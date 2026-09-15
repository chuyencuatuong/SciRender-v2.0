export type CaptionPosition = 'above' | 'below';
export type CounterStyle = 'continuous' | 'section';
export type EquationNumbering = 'all' | 'labelled' | 'none';
export type CitationStyle = 'numeric' | 'author-year';
export type ReferenceStyle = 'apa' | 'ieee' | 'plain';
export type PageNumberStyle = 'arabic' | 'roman-lower' | 'roman-upper' | 'none';

export interface PageSpec {
  /** Informative label; width/height are authoritative. */
  size: string;
  width: string; // CSS length, e.g. "210mm"
  height: string; // "297mm"
  margin: { top: string; right: string; bottom: string; left: string };
  /** Distance from the paper edge to the page-number line (Word: Footer from bottom). */
  footerFromBottom: string;
  columns: number;
  columnGap: string;
}

export interface TypographySpec {
  bodyFont: string;
  headingFont: string;
  monoFont: string;
  bodySize: string; // "13pt"
  lineHeight: number; // 1.5
  paragraphIndent: string; // "0" | "1cm"
  /** Word's "Spacing Before" / "Spacing After" for body paragraphs. */
  spaceBefore: string; // "10pt"
  spaceAfter: string; // "0pt"
  justify: boolean;
  hyphenate: boolean;
}

/**
 * Per-level heading style. Word's Heading 1..6 styles map one-to-one onto this,
 * which is what makes a university format like the HCMUT BTL spec expressible
 * as data instead of code.
 */
export interface HeadingLevelStyle {
  size: string; // "14pt"
  weight: number; // 700
  italic: boolean;
  uppercase: boolean;
  spaceBefore: string; // "24pt"
  spaceAfter: string; // "24pt"
  lineHeight: number; // 1 = single
  align: 'left' | 'center';
  indent: string;
  /** `{n}` is replaced by the computed number. Empty string = number hidden. */
  numberFormat: string; // "CHƯƠNG {n}." or "{n}."
  /** Horizontal gap between the number and the title text. */
  numberGap: string;
  /** Start this heading level on a fresh page (chapters usually do). */
  pageBreakBefore: boolean;
}

export interface HeadingSpec {
  /** Exactly six entries, index 0 = level 1. */
  levels: HeadingLevelStyle[];
  numbering: 'decimal' | 'none';
  /** Deepest level that receives a number (1..6). */
  numberDepth: number;
}

export interface NumberingSpec {
  equations: EquationNumbering;
  equationStyle: CounterStyle;
  figures: CounterStyle;
  tables: CounterStyle;
  diagrams: CounterStyle;
  listings: CounterStyle;
  /** Heading depth whose increment resets section-scoped counters. */
  resetAtDepth: number;
}

export interface LabelSpec {
  figure: string;
  table: string;
  equation: string;
  diagram: string;
  listing: string;
  abstract: string;
  acknowledgement: string;
  toc: string;
  figureList: string;
  tableList: string;
  abbreviationList: string;
  keywords: string;
  references: string;
  appendix: string;
  page: string;
  /** Appended to a caption when a table carries over to the next page. */
  continued: string;
  /** Word used when a cross-reference is rendered, e.g. "Hình 3". */
  refFigure: string;
  refTable: string;
  refSection: string;
  refEquation: string;
  refDiagram: string;
  refListing: string;
}

export interface CaptionSpec {
  figurePosition: CaptionPosition;
  tablePosition: CaptionPosition;
  listingPosition: CaptionPosition;
  separator: string; // between "Hình 1" and the caption text
  italic: boolean;
  bold: boolean;
  fontSize: string;
  align: 'left' | 'center';
}

export interface FootnoteSpec {
  enabled: boolean;
  fontSize: string;
  lineHeight: number;
  /** Rule drawn between the text block and the notes. */
  separator: boolean;
  separatorWidth: string;
  gap: string;
}

export interface PageBudget {
  /** Minimum body pages the faculty expects. */
  min: number;
  /** Maximum body pages. */
  max: number;
}

export interface LayoutSpec {
  orphans: number; // minimum lines left at the bottom of a page
  widows: number; // minimum lines carried to the next page
  keepHeadingWithNext: boolean;
  /** Block types that must never be split across a page break. */
  atomicBlocks: string[];
  /** Carry a long table over a page break, repeating its header row. */
  splitTables: boolean;
  /** Minimum body rows kept on each side of a table split. */
  tableOrphans: number;
  /** Split a long list between items instead of pushing it whole. */
  splitLists: boolean;
  /** Expected body-page range, checked after pagination. Null = no check. */
  pageBudget: PageBudget | null;
  showPageNumbers: boolean;
  pageNumberPosition: 'footer-center' | 'footer-right' | 'none';
  /** Numbering used for the body flow. */
  bodyPageNumbers: PageNumberStyle;
  /** Numbering used for the front matter (Tóm tắt, Mục lục, …). */
  frontPageNumbers: PageNumberStyle;
}

export interface ColorSpec {
  text: string;
  muted: string;
  rule: string;
  accent: string;
  tableHeaderBg: string;
  codeBg: string;
}

export interface CodeSpec {
  fontSize: string;
  lineNumbers: boolean;
  wrap: boolean;
  border: boolean;
  background: boolean;
  /** Colour the tokens of a fenced block whose language is recognised. */
  highlight: boolean;
}

export type DiagramDirection = 'LR' | 'TB' | 'RL' | 'BT';

export interface DiagramSpec {
  /** Direction applied when a diagram does not request one itself. */
  defaultDirection: DiagramDirection;
  /**
   * Try the perpendicular direction too and keep whichever fits the text block
   * at a larger scale. Only applies to diagrams that do not pin `dir=`.
   */
  autoDirection: boolean;
  /** Diagram label text takes the document's font at this size. */
  fontSize: string;
  fontFamily: 'body' | 'sans';
  /** `fit` scales the drawing down to the text width; `scroll` keeps it full size. */
  overflow: 'fit' | 'scroll';
  /** Warn when fitting shrinks a diagram below this factor (labels get unreadable). */
  minScale: number;
  nodeSpacing: number;
  rankSpacing: number;
  curve: 'basis' | 'linear' | 'cardinal';
  /** Wrap node labels wider than this many CSS pixels (mermaid measures in px, not characters). */
  wrappingWidth: number;
}

export type FrontSectionKind =
  | 'abstract'
  | 'acknowledgement'
  | 'toc'
  | 'figureList'
  | 'tableList'
  | 'abbreviationList';

export interface FrontSection {
  kind: FrontSectionKind;
  enabled: boolean;
  /** Lists are only printed when they hold at least this many entries. */
  minItems: number;
}

export interface FrontMatterSpec {
  enabled: boolean;
  sections: FrontSection[];
  /** Heading style for front-matter section titles. */
  titleAlign: 'left' | 'center';
  titleSize: string;
  titleUppercase: boolean;
  /** Dot leaders between an entry and its page number in the lists. */
  leaders: boolean;
  /** Line spacing inside the generated lists (BTL: 1.15). */
  listLineHeight: number;
}

export interface CoverSpec {
  /** `none` renders no cover at all; `hcmut` is the BTL layout. */
  layout: 'none' | 'hcmut';
  /** Second cover page carrying the member list. */
  innerCover: boolean;
  /** Logo height on the cover. */
  logoHeight: string;
}

export interface TemplateDescriptor {
  id: string;
  name: string;
  version: string;
  description: string;
  page: PageSpec;
  typography: TypographySpec;
  headings: HeadingSpec;
  numbering: NumberingSpec;
  labels: LabelSpec;
  captions: CaptionSpec;
  layout: LayoutSpec;
  code: CodeSpec;
  diagrams: DiagramSpec;
  frontMatter: FrontMatterSpec;
  cover: CoverSpec;
  citation: {
    style: CitationStyle;
    open: string;
    close: string;
    references: ReferenceStyle;
    /** Joiner for exactly two authors in an author-year citation. */
    and: string;
    /** Suffix for three or more authors, e.g. "và cs." or "et al.". */
    etAl: string;
  };
  footnotes: FootnoteSpec;
  colors: ColorSpec;
}

/** A template plus everything derived from it. Pure function of the template. */
export interface ResolvedTemplate {
  descriptor: TemplateDescriptor;
  metrics: {
    pageWidthPx: number;
    pageHeightPx: number;
    marginTopPx: number;
    marginRightPx: number;
    marginBottomPx: number;
    marginLeftPx: number;
    contentWidthPx: number;
    contentHeightPx: number;
    bodySizePx: number;
    lineHeightPx: number;
    columnGapPx: number;
  };
  css: string;
}

export type TemplateOverrides = {
  [K in keyof TemplateDescriptor]?: TemplateDescriptor[K] extends object
    ? Partial<TemplateDescriptor[K]>
    : TemplateDescriptor[K];
};
