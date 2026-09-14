import type { TemplateDescriptor } from './types.js';

const SERIF_STACK =
  '"Times New Roman", "Liberation Serif", "Nimbus Roman", Times, "Noto Serif", serif';
const MONO_STACK =
  '"JetBrains Mono", "Cascadia Mono", "Liberation Mono", Consolas, "Courier New", monospace';

/**
 * scientific-standard — A4, 13pt serif, 1.5 line spacing.
 * The reference template every SciRender document falls back to.
 */
export const SCIENTIFIC_STANDARD: TemplateDescriptor = {
  id: 'scientific-standard',
  name: 'Scientific Standard (A4 · 13pt · 1.5)',
  version: '2.0.0',
  description:
    'Bố cục báo cáo khoa học chuẩn: A4, lề 25/20/25/30mm, chữ serif 13pt, giãn dòng 1.5, đánh số mục theo hệ thập phân, chú thích hình dưới - bảng trên.',
  page: {
    size: 'A4',
    width: '210mm',
    height: '297mm',
    margin: { top: '25mm', right: '20mm', bottom: '25mm', left: '30mm' },
    columns: 1,
    columnGap: '8mm',
  },
  typography: {
    bodyFont: SERIF_STACK,
    headingFont: SERIF_STACK,
    monoFont: MONO_STACK,
    bodySize: '13pt',
    lineHeight: 1.5,
    paragraphIndent: '0mm',
    paragraphSpacing: '0.6em',
    justify: true,
    hyphenate: false,
  },
  headings: {
    scale: [1.55, 1.3, 1.14, 1.05, 1, 1],
    weight: 700,
    spaceBefore: '1.1em',
    spaceAfter: '0.5em',
    numbering: 'decimal',
    numberDepth: 4,
    uppercaseLevel1: true,
  },
  numbering: {
    equations: 'all',
    equationStyle: 'section',
    figures: 'section',
    tables: 'section',
    diagrams: 'section',
    resetAtDepth: 1,
  },
  labels: {
    figure: 'Hình',
    table: 'Bảng',
    equation: 'Công thức',
    diagram: 'Sơ đồ',
    abstract: 'Tóm tắt',
    keywords: 'Từ khóa',
    references: 'Tài liệu tham khảo',
    page: 'Trang',
    refFigure: 'Hình',
    refTable: 'Bảng',
    refSection: 'Mục',
    refEquation: '',
    refDiagram: 'Sơ đồ',
  },
  captions: {
    figurePosition: 'below',
    tablePosition: 'above',
    separator: '. ',
    italic: false,
    fontSize: '0.88em',
    align: 'center',
  },
  layout: {
    orphans: 2,
    widows: 2,
    keepHeadingWithNext: true,
    atomicBlocks: ['figure', 'table', 'equation', 'diagram', 'codeBlock'],
    showPageNumbers: true,
    pageNumberPosition: 'footer-center',
  },
  citation: { style: 'numeric', open: '[', close: ']' },
  colors: {
    text: '#111418',
    muted: '#5b6472',
    rule: '#c8cfd8',
    accent: '#1b4f9c',
    tableHeaderBg: '#eef2f7',
    codeBg: '#f5f7fa',
  },
};

/** IEEE-like two-column variant, kept deliberately small — same schema, different values. */
export const IEEE_LIKE: TemplateDescriptor = {
  ...SCIENTIFIC_STANDARD,
  id: 'ieee-like',
  name: 'IEEE-like (A4 · 2 cột · 10pt)',
  description:
    'Bố cục hai cột kiểu hội nghị: A4, lề 19mm, chữ 10pt, giãn dòng 1.1, đánh số công thức liên tục.',
  page: {
    ...SCIENTIFIC_STANDARD.page,
    margin: { top: '19mm', right: '16mm', bottom: '19mm', left: '16mm' },
    columns: 2,
    columnGap: '6mm',
  },
  typography: {
    ...SCIENTIFIC_STANDARD.typography,
    bodySize: '10pt',
    lineHeight: 1.15,
    paragraphIndent: '3.5mm',
    paragraphSpacing: '0em',
  },
  headings: {
    ...SCIENTIFIC_STANDARD.headings,
    scale: [1.25, 1.12, 1.04, 1, 1, 1],
    numberDepth: 3,
  },
  numbering: {
    ...SCIENTIFIC_STANDARD.numbering,
    equationStyle: 'continuous',
    figures: 'continuous',
    tables: 'continuous',
    diagrams: 'continuous',
  },
  captions: { ...SCIENTIFIC_STANDARD.captions, fontSize: '0.85em', align: 'left' },
};

export const BUILTIN_TEMPLATES: TemplateDescriptor[] = [SCIENTIFIC_STANDARD, IEEE_LIKE];

export function findTemplate(id: string | undefined): TemplateDescriptor {
  if (!id) return SCIENTIFIC_STANDARD;
  return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? SCIENTIFIC_STANDARD;
}
