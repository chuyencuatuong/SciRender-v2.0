export type CaptionPosition = 'above' | 'below';
export type CounterStyle = 'continuous' | 'section';
export type EquationNumbering = 'all' | 'labelled' | 'none';
export type CitationStyle = 'numeric' | 'author-year';

export interface PageSpec {
  /** Informative label; width/height are authoritative. */
  size: string;
  width: string; // CSS length, e.g. "210mm"
  height: string; // "297mm"
  margin: { top: string; right: string; bottom: string; left: string };
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
  paragraphSpacing: string; // "0.35em"
  justify: boolean;
  hyphenate: boolean;
}

export interface HeadingSpec {
  /** Relative size per depth 1..6, in em of body size. */
  scale: [number, number, number, number, number, number];
  weight: number;
  spaceBefore: string;
  spaceAfter: string;
  numbering: 'decimal' | 'none';
  /** Deepest level that receives a number (1..6). */
  numberDepth: number;
  uppercaseLevel1: boolean;
}

export interface NumberingSpec {
  equations: EquationNumbering;
  equationStyle: CounterStyle;
  figures: CounterStyle;
  tables: CounterStyle;
  diagrams: CounterStyle;
  /** Heading depth whose increment resets section-scoped counters. */
  resetAtDepth: number;
}

export interface LabelSpec {
  figure: string;
  table: string;
  equation: string;
  diagram: string;
  abstract: string;
  keywords: string;
  references: string;
  page: string;
  /** Word used when a cross-reference is rendered, e.g. "Hình 3". */
  refFigure: string;
  refTable: string;
  refSection: string;
  refEquation: string;
  refDiagram: string;
}

export interface CaptionSpec {
  figurePosition: CaptionPosition;
  tablePosition: CaptionPosition;
  separator: string; // between "Hình 1" and the caption text
  italic: boolean;
  fontSize: string;
  align: 'left' | 'center';
}

export interface LayoutSpec {
  orphans: number; // minimum lines left at the bottom of a page
  widows: number; // minimum lines carried to the next page
  keepHeadingWithNext: boolean;
  /** Block types that must never be split across a page break. */
  atomicBlocks: string[];
  showPageNumbers: boolean;
  pageNumberPosition: 'footer-center' | 'footer-right' | 'none';
}

export interface ColorSpec {
  text: string;
  muted: string;
  rule: string;
  accent: string;
  tableHeaderBg: string;
  codeBg: string;
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
  citation: { style: CitationStyle; open: string; close: string };
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
  };
  css: string;
}

export type TemplateOverrides = {
  [K in keyof TemplateDescriptor]?: TemplateDescriptor[K] extends object
    ? Partial<TemplateDescriptor[K]>
    : TemplateDescriptor[K];
};
