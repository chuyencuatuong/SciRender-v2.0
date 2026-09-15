import type { HeadingLevelStyle, TemplateDescriptor } from './types.js';

const TIMES =
  '"Times New Roman", "Liberation Serif", "Nimbus Roman", "Tinos", Times, serif';
const MONO_STACK =
  '"JetBrains Mono", "Cascadia Mono", "Liberation Mono", Consolas, "Courier New", monospace';

function heading(partial: Partial<HeadingLevelStyle>): HeadingLevelStyle {
  return {
    size: '13pt',
    weight: 700,
    italic: false,
    uppercase: false,
    spaceBefore: '6pt',
    spaceAfter: '12pt',
    lineHeight: 1,
    align: 'left',
    indent: '0',
    numberFormat: '{n}.',
    numberGap: '0.6em',
    pageBreakBefore: false,
    ...partial,
  };
}

/* ------------------------------------------------------------------- HCMUT */

/**
 * hcmut-btl — Báo cáo Bài tập lớn, Trường Đại học Bách khoa TP.HCM.
 *
 * Every value here is copied from the faculty's "Phụ lục: Mẫu trình bày file
 * Word chung cho BTL", so the template is auditable against that document
 * rather than being someone's approximation of it.
 */
export const HCMUT_BTL: TemplateDescriptor = {
  id: 'hcmut-btl',
  name: 'HCMUT — Báo cáo Bài tập lớn',
  version: '1.0.0',
  description:
    'Đúng quy cách BTL Bách khoa TP.HCM: A4 lề 2,5/1,5/1,5/1,5cm, Times New Roman 13pt giãn 1.5, CHƯƠNG in hoa 14pt, chú thích canh giữa, bìa + phụ bìa, đánh số i/ii/iii cho phần đầu và 1/2/3 cho phần nội dung.',
  page: {
    size: 'A4',
    width: '210mm',
    height: '297mm',
    margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '25mm' },
    footerFromBottom: '5mm',
    columns: 1,
    columnGap: '8mm',
  },
  typography: {
    bodyFont: TIMES,
    headingFont: TIMES,
    monoFont: MONO_STACK,
    bodySize: '13pt',
    lineHeight: 1.5,
    paragraphIndent: '0mm',
    spaceBefore: '10pt',
    spaceAfter: '0pt',
    justify: true,
    hyphenate: false,
  },
  headings: {
    numbering: 'decimal',
    numberDepth: 4,
    levels: [
      heading({
        size: '14pt',
        weight: 700,
        uppercase: true,
        spaceBefore: '24pt',
        spaceAfter: '24pt',
        numberFormat: 'CHƯƠNG {n}.',
        numberGap: '1.4em',
        pageBreakBefore: true,
      }),
      heading({ size: '13pt', weight: 700 }),
      heading({ size: '13pt', weight: 700, italic: true }),
      heading({ size: '13pt', weight: 400, italic: true }),
      heading({ size: '13pt', weight: 400, italic: true, numberFormat: '' }),
      heading({ size: '13pt', weight: 400, italic: true, numberFormat: '' }),
    ],
  },
  numbering: {
    equations: 'all',
    equationStyle: 'section',
    figures: 'section',
    tables: 'section',
    diagrams: 'section',
    listings: 'section',
    resetAtDepth: 1,
  },
  labels: {
    figure: 'Hình',
    table: 'Bảng',
    equation: 'Công thức',
    diagram: 'Hình',
    listing: 'Mã nguồn',
    abstract: 'TÓM TẮT BÀI BÁO CÁO',
    acknowledgement: 'LỜI CẢM ƠN',
    toc: 'MỤC LỤC',
    figureList: 'DANH MỤC CÁC HÌNH ẢNH',
    tableList: 'DANH MỤC BẢNG BIỂU',
    abbreviationList: 'DANH MỤC CÁC TỪ VIẾT TẮT',
    keywords: 'Từ khóa',
    references: 'TÀI LIỆU THAM KHẢO',
    appendix: 'PHỤ LỤC',
    page: '',
    refFigure: 'Hình',
    refTable: 'Bảng',
    refSection: 'Mục',
    refEquation: '',
    refDiagram: 'Hình',
    refListing: 'Mã nguồn',
  },
  captions: {
    figurePosition: 'below',
    tablePosition: 'above',
    listingPosition: 'below',
    separator: ' ',
    italic: false,
    bold: false,
    fontSize: '1em',
    align: 'center',
  },
  layout: {
    orphans: 2,
    widows: 2,
    keepHeadingWithNext: true,
    atomicBlocks: ['figure', 'table', 'equation', 'diagram', 'codeBlock'],
    showPageNumbers: true,
    pageNumberPosition: 'footer-center',
    bodyPageNumbers: 'arabic',
    frontPageNumbers: 'roman-lower',
  },
  code: {
    fontSize: '10pt',
    lineNumbers: true,
    wrap: true,
    border: true,
    background: false,
    highlight: true,
  },
  diagrams: {
    defaultDirection: 'TB',
    autoDirection: true,
    fontSize: '13pt',
    fontFamily: 'body',
    overflow: 'fit',
    minScale: 0.75,
    nodeSpacing: 40,
    rankSpacing: 46,
    curve: 'basis',
    wrappingWidth: 200,
  },
  frontMatter: {
    enabled: true,
    titleAlign: 'center',
    titleSize: '14pt',
    titleUppercase: true,
    leaders: true,
    listLineHeight: 1.15,
    sections: [
      { kind: 'abstract', enabled: true, minItems: 1 },
      { kind: 'acknowledgement', enabled: true, minItems: 1 },
      { kind: 'toc', enabled: true, minItems: 1 },
      { kind: 'figureList', enabled: true, minItems: 3 },
      { kind: 'tableList', enabled: true, minItems: 3 },
      { kind: 'abbreviationList', enabled: true, minItems: 3 },
    ],
  },
  cover: { layout: 'hcmut', innerCover: true, logoHeight: '28mm' },
  citation: { style: 'numeric', open: '[', close: ']', references: 'apa' },
  colors: {
    text: '#000000',
    muted: '#333333',
    rule: '#000000',
    accent: '#000000',
    tableHeaderBg: '#ffffff',
    codeBg: '#f6f6f6',
  },
};

/* ------------------------------------------------------- scientific-standard */

export const SCIENTIFIC_STANDARD: TemplateDescriptor = {
  id: 'scientific-standard',
  name: 'Scientific Standard (A4 · 13pt · 1.5)',
  version: '2.0.0',
  description:
    'Bố cục báo cáo khoa học chung: A4, lề 25/20/25/30mm, serif 13pt, giãn dòng 1.5, không bìa, không phần đầu.',
  page: {
    size: 'A4',
    width: '210mm',
    height: '297mm',
    margin: { top: '25mm', right: '20mm', bottom: '25mm', left: '30mm' },
    footerFromBottom: '10mm',
    columns: 1,
    columnGap: '8mm',
  },
  typography: {
    bodyFont: TIMES,
    headingFont: TIMES,
    monoFont: MONO_STACK,
    bodySize: '13pt',
    lineHeight: 1.5,
    paragraphIndent: '0mm',
    spaceBefore: '0pt',
    spaceAfter: '8pt',
    justify: true,
    hyphenate: false,
  },
  headings: {
    numbering: 'decimal',
    numberDepth: 4,
    levels: [
      heading({
        size: '1.55em',
        weight: 700,
        uppercase: true,
        spaceBefore: '18pt',
        spaceAfter: '8pt',
        lineHeight: 1.25,
      }),
      heading({ size: '1.3em', spaceBefore: '14pt', spaceAfter: '6pt', lineHeight: 1.25 }),
      heading({ size: '1.14em', spaceBefore: '12pt', spaceAfter: '6pt', lineHeight: 1.25 }),
      heading({ size: '1.05em', spaceBefore: '10pt', spaceAfter: '5pt', lineHeight: 1.25 }),
      heading({ size: '1em', numberFormat: '' }),
      heading({ size: '1em', numberFormat: '' }),
    ],
  },
  numbering: {
    equations: 'all',
    equationStyle: 'section',
    figures: 'section',
    tables: 'section',
    diagrams: 'section',
    listings: 'section',
    resetAtDepth: 1,
  },
  labels: {
    figure: 'Hình',
    table: 'Bảng',
    equation: 'Công thức',
    diagram: 'Sơ đồ',
    listing: 'Mã nguồn',
    abstract: 'Tóm tắt',
    acknowledgement: 'Lời cảm ơn',
    toc: 'Mục lục',
    figureList: 'Danh mục hình',
    tableList: 'Danh mục bảng',
    abbreviationList: 'Danh mục từ viết tắt',
    keywords: 'Từ khóa',
    references: 'Tài liệu tham khảo',
    appendix: 'Phụ lục',
    page: 'Trang',
    refFigure: 'Hình',
    refTable: 'Bảng',
    refSection: 'Mục',
    refEquation: '',
    refDiagram: 'Sơ đồ',
    refListing: 'Mã nguồn',
  },
  captions: {
    figurePosition: 'below',
    tablePosition: 'above',
    listingPosition: 'below',
    separator: '. ',
    italic: false,
    bold: false,
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
    bodyPageNumbers: 'arabic',
    frontPageNumbers: 'roman-lower',
  },
  code: { fontSize: '0.82em', lineNumbers: false, wrap: false, border: true, background: true, highlight: true },
  diagrams: {
    defaultDirection: 'LR',
    autoDirection: true,
    fontSize: '11pt',
    fontFamily: 'sans',
    overflow: 'fit',
    minScale: 0.7,
    nodeSpacing: 36,
    rankSpacing: 40,
    curve: 'basis',
    wrappingWidth: 200,
  },
  frontMatter: {
    enabled: false,
    titleAlign: 'center',
    titleSize: '1.3em',
    titleUppercase: true,
    leaders: true,
    listLineHeight: 1.15,
    sections: [
      { kind: 'toc', enabled: true, minItems: 1 },
      { kind: 'figureList', enabled: true, minItems: 3 },
      { kind: 'tableList', enabled: true, minItems: 3 },
      { kind: 'abbreviationList', enabled: true, minItems: 3 },
    ],
  },
  cover: { layout: 'none', innerCover: false, logoHeight: '26mm' },
  citation: { style: 'numeric', open: '[', close: ']', references: 'plain' },
  colors: {
    text: '#111418',
    muted: '#5b6472',
    rule: '#c8cfd8',
    accent: '#0b2c7f',
    tableHeaderBg: '#eef2f7',
    codeBg: '#f5f7fa',
  },
};

/* ---------------------------------------------------------------- IEEE-like */

export const IEEE_LIKE: TemplateDescriptor = {
  ...SCIENTIFIC_STANDARD,
  id: 'ieee-like',
  name: 'IEEE-like (A4 · 2 cột · 10pt)',
  description:
    'Bố cục hai cột kiểu hội nghị: A4, lề 19mm, chữ 10pt, giãn dòng 1.15, đánh số công thức liên tục.',
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
    spaceBefore: '0pt',
    spaceAfter: '0pt',
  },
  headings: {
    ...SCIENTIFIC_STANDARD.headings,
    numberDepth: 3,
    levels: [
      heading({ size: '1.25em', uppercase: true, spaceBefore: '12pt', spaceAfter: '6pt', lineHeight: 1.2 }),
      heading({ size: '1.12em', spaceBefore: '10pt', spaceAfter: '4pt', lineHeight: 1.2 }),
      heading({ size: '1.04em', spaceBefore: '8pt', spaceAfter: '4pt', lineHeight: 1.2 }),
      heading({ size: '1em', spaceBefore: '8pt', spaceAfter: '4pt', lineHeight: 1.2 }),
      heading({ size: '1em', numberFormat: '' }),
      heading({ size: '1em', numberFormat: '' }),
    ],
  },
  numbering: {
    ...SCIENTIFIC_STANDARD.numbering,
    equationStyle: 'continuous',
    figures: 'continuous',
    tables: 'continuous',
    diagrams: 'continuous',
    listings: 'continuous',
  },
  captions: { ...SCIENTIFIC_STANDARD.captions, fontSize: '0.85em', align: 'left' },
  diagrams: { ...SCIENTIFIC_STANDARD.diagrams, fontSize: '9pt', wrappingWidth: 150 },
};

export const BUILTIN_TEMPLATES: TemplateDescriptor[] = [
  HCMUT_BTL,
  SCIENTIFIC_STANDARD,
  IEEE_LIKE,
];

export function findTemplate(id: string | undefined): TemplateDescriptor {
  if (!id) return HCMUT_BTL;
  return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? HCMUT_BTL;
}
