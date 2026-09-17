import type { Diagnostic, DocumentNode, HeadingNode } from '@scirender/ast';
import { plainText, walk } from '@scirender/ast';

export interface DocumentStats {
  words: number;
  characters: number;
  paragraphs: number;
  headings: number;
  maxDepth: number;
  figures: number;
  tables: number;
  equations: number;
  diagrams: number;
  citations: number;
  references: number;
  crossRefs: number;
  unresolvedCrossRefs: number;
  captionedFigures: number;
  captionedTables: number;
  labelledObjects: number;
  numberedObjects: number;
  avgWordsPerParagraph: number;
  avgWordsPerSentence: number;
  longestParagraphWords: number;
  readingMinutes: number;
}

export interface HealthDimension {
  id: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface Suggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  message: string;
  action: string;
}

export interface HealthReport {
  score: number; // 0..100
  grade: 'A' | 'B' | 'C' | 'D';
  dimensions: HealthDimension[];
  suggestions: Suggestion[];
  stats: DocumentStats;
}

const WORDS_PER_MINUTE = 200;

/**
 * Document Health Score.
 *
 * Deliberately rule-based and fully deterministic — no model, no network, no
 * randomness (P2, P5). It measures *document engineering quality*: structure,
 * completeness, internal consistency, formal rigour and readability. It never
 * judges the science itself and never edits the document (P1).
 */
export function analyse(doc: DocumentNode, diagnostics: Diagnostic[] = []): HealthReport {
  const stats = collectStats(doc);
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;

  const dimensions: HealthDimension[] = [
    scoreStructure(doc, stats),
    scoreCompleteness(doc, stats),
    scoreConsistency(stats),
    scoreRigour(stats, errors),
    scoreReadability(stats),
  ];

  const raw = dimensions.reduce((a, d) => a + d.score, 0);
  const max = dimensions.reduce((a, d) => a + d.max, 0);
  // Unresolved errors cap the score: a document that does not compile cleanly
  // cannot be "publication ready", however well-structured it is (P6).
  const penalty = Math.min(20, errors * 4 + warnings);
  const score = clamp(Math.round((raw / max) * 100) - penalty, 0, 100);

  return {
    score,
    grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D',
    dimensions,
    suggestions: buildSuggestions(doc, stats, diagnostics),
    stats,
  };
}

/* --------------------------------------------------------------- statistics */

export function collectStats(doc: DocumentNode): DocumentStats {
  let words = 0;
  let characters = 0;
  let paragraphs = 0;
  let headings = 0;
  let maxDepth = 0;
  let figures = 0;
  let tables = 0;
  let equations = 0;
  let diagrams = 0;
  let citations = 0;
  let crossRefs = 0;
  let unresolvedCrossRefs = 0;
  let captionedFigures = 0;
  let captionedTables = 0;
  let labelledObjects = 0;
  let numberedObjects = 0;
  let longestParagraphWords = 0;
  let sentences = 0;

  walk(doc, (n) => {
    switch (n.type) {
      case 'paragraph': {
        paragraphs++;
        const text = plainText(n);
        const w = countWords(text);
        words += w;
        characters += text.length;
        longestParagraphWords = Math.max(longestParagraphWords, w);
        sentences += countSentences(text);
        break;
      }
      case 'heading': {
        headings++;
        maxDepth = Math.max(maxDepth, n.depth);
        const text = plainText(n);
        words += countWords(text);
        characters += text.length;
        if (n.label) labelledObjects++;
        if (n.number) numberedObjects++;
        break;
      }
      case 'figure':
        figures++;
        if (n.caption.length || n.alt.trim()) captionedFigures++;
        if (n.label) labelledObjects++;
        if (n.number) numberedObjects++;
        break;
      case 'table':
        tables++;
        if (n.caption.length) captionedTables++;
        if (n.label) labelledObjects++;
        if (n.number) numberedObjects++;
        break;
      case 'equation':
        equations++;
        if (n.label) labelledObjects++;
        if (n.number) numberedObjects++;
        break;
      case 'diagram':
        diagrams++;
        if (n.label) labelledObjects++;
        break;
      case 'citation':
        citations += n.keys.length;
        break;
      case 'crossRef':
        crossRefs++;
        if (!n.resolved) unresolvedCrossRefs++;
        break;
      default:
        break;
    }
    return undefined;
  });

  const abstractWords = doc.meta.abstract ? countWords(doc.meta.abstract) : 0;
  words += abstractWords;

  return {
    words,
    characters,
    paragraphs,
    headings,
    maxDepth,
    figures,
    tables,
    equations,
    diagrams,
    citations,
    references: doc.meta.bibliography.length,
    crossRefs,
    unresolvedCrossRefs,
    captionedFigures,
    captionedTables,
    labelledObjects,
    numberedObjects,
    avgWordsPerParagraph: paragraphs ? round1(words / paragraphs) : 0,
    avgWordsPerSentence: sentences ? round1(words / sentences) : 0,
    longestParagraphWords,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
  };
}

/* ------------------------------------------------------------- dimensions */

function scoreStructure(doc: DocumentNode, s: DocumentStats): HealthDimension {
  const max = 25;
  let score = 0;
  const notes: string[] = [];

  if (s.headings > 0) score += 6;
  else notes.push('chưa có đề mục');

  if (s.headings >= 3) score += 5;
  else if (s.headings > 0) notes.push('ít hơn 3 đề mục');

  const depths: number[] = [];
  walk(doc, (n) => {
    if (n.type === 'heading') depths.push((n as HeadingNode).depth);
    return undefined;
  });
  const skips = depths.filter((d, i) => i > 0 && d > (depths[i - 1] as number) + 1).length;
  if (!skips) score += 7;
  else notes.push(`${skips} chỗ nhảy cấp đề mục`);

  if (s.maxDepth >= 2) score += 4;
  else if (s.headings) notes.push('cấu trúc phẳng, chưa có mục con');

  const first = depths[0];
  if (first === 1) score += 3;
  else if (depths.length) notes.push('không bắt đầu từ cấp 1');

  return {
    id: 'structure',
    label: 'Cấu trúc',
    score: clamp(score, 0, max),
    max,
    detail: notes.length ? notes.join('; ') : 'Phân cấp đề mục liên tục và hợp lý.',
  };
}

function scoreCompleteness(doc: DocumentNode, s: DocumentStats): HealthDimension {
  const max = 25;
  let score = 0;
  const missing: string[] = [];

  if (doc.meta.title.trim()) score += 5; else missing.push('tiêu đề');
  if (doc.meta.authors.length) score += 4; else missing.push('tác giả');
  if (doc.meta.abstract) score += 5; else missing.push('tóm tắt');
  if (doc.meta.keywords.length) score += 3; else missing.push('từ khóa');
  if (s.references > 0) score += 5; else missing.push('tài liệu tham khảo');
  if (s.words >= 300) score += 3;
  else missing.push('nội dung còn quá ngắn');

  return {
    id: 'completeness',
    label: 'Đầy đủ',
    score: clamp(score, 0, max),
    max,
    detail: missing.length ? `Thiếu: ${missing.join(', ')}.` : 'Đủ các thành phần chuẩn.',
  };
}

function scoreConsistency(s: DocumentStats): HealthDimension {
  const max = 20;
  let score = 0;
  const notes: string[] = [];

  const figOk = s.figures === 0 ? 1 : s.captionedFigures / s.figures;
  const tblOk = s.tables === 0 ? 1 : s.captionedTables / s.tables;
  score += Math.round(figOk * 5);
  score += Math.round(tblOk * 5);
  if (figOk < 1) notes.push(`${s.figures - s.captionedFigures} hình thiếu chú thích`);
  if (tblOk < 1) notes.push(`${s.tables - s.captionedTables} bảng thiếu chú thích`);

  if (!s.unresolvedCrossRefs) score += 6;
  else notes.push(`${s.unresolvedCrossRefs} tham chiếu chéo không phân giải được`);

  const objects = s.figures + s.tables + s.equations;
  if (objects === 0 || s.crossRefs > 0) score += 4;
  else notes.push('có hình/bảng/công thức nhưng không được nhắc tới trong nội dung');

  return {
    id: 'consistency',
    label: 'Nhất quán',
    score: clamp(score, 0, max),
    max,
    detail: notes.length ? notes.join('; ') : 'Chú thích, nhãn và tham chiếu khớp nhau.',
  };
}

function scoreRigour(s: DocumentStats, errors: number): HealthDimension {
  const max = 15;
  let score = 15;
  const notes: string[] = [];
  if (errors > 0) {
    score -= Math.min(10, errors * 2);
    notes.push(`${errors} lỗi biên dịch cần xử lý`);
  }
  if (s.references === 0 && s.words > 800) {
    score -= 3;
    notes.push('bài dài nhưng không có trích dẫn');
  }
  if (s.citations === 0 && s.references > 0) {
    score -= 2;
    notes.push('có danh mục tham khảo nhưng chưa trích dẫn trong bài');
  }
  return {
    id: 'rigour',
    label: 'Chặt chẽ',
    score: clamp(score, 0, max),
    max,
    detail: notes.length ? notes.join('; ') : 'Không có lỗi biên dịch; trích dẫn nhất quán.',
  };
}

function scoreReadability(s: DocumentStats): HealthDimension {
  const max = 15;
  let score = 15;
  const notes: string[] = [];
  if (s.avgWordsPerSentence > 34) {
    score -= 5;
    notes.push(`câu trung bình ${s.avgWordsPerSentence} từ, khá dài`);
  } else if (s.avgWordsPerSentence > 26) {
    score -= 2;
    notes.push(`câu trung bình ${s.avgWordsPerSentence} từ`);
  }
  if (s.longestParagraphWords > 250) {
    score -= 5;
    notes.push(`có đoạn dài ${s.longestParagraphWords} từ`);
  } else if (s.longestParagraphWords > 180) {
    score -= 2;
    notes.push(`đoạn dài nhất ${s.longestParagraphWords} từ`);
  }
  if (s.paragraphs === 0) {
    score = 0;
    notes.push('chưa có nội dung văn xuôi');
  }
  return {
    id: 'readability',
    label: 'Dễ đọc',
    score: clamp(score, 0, max),
    max,
    detail: notes.length ? notes.join('; ') : 'Độ dài câu và đoạn nằm trong ngưỡng dễ đọc.',
  };
}

/* ------------------------------------------------------------ suggestions */

function buildSuggestions(
  doc: DocumentNode,
  s: DocumentStats,
  diagnostics: Diagnostic[],
): Suggestion[] {
  const out: Suggestion[] = [];
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;

  if (errorCount) {
    out.push({
      id: 'fix-errors',
      priority: 'high',
      message: `Còn ${errorCount} lỗi chặn xuất bản.`,
      action: 'Mở tab Chẩn đoán và xử lý các mục màu đỏ trước.',
    });
  }
  if (s.unresolvedCrossRefs) {
    out.push({
      id: 'unresolved-refs',
      priority: 'high',
      message: `${s.unresolvedCrossRefs} tham chiếu chéo không tìm thấy nhãn.`,
      action: 'Khai báo nhãn {#fig:...}, {#tbl:...}, {#eq:...} ở đối tượng được trỏ tới.',
    });
  }
  if (!doc.meta.abstract) {
    out.push({
      id: 'add-abstract',
      priority: 'medium',
      message: 'Chưa có phần tóm tắt.',
      action: 'Thêm "abstract: |" vào front matter, độ dài khuyến nghị 150–250 từ.',
    });
  }
  if (s.figures && s.captionedFigures < s.figures) {
    out.push({
      id: 'caption-figures',
      priority: 'medium',
      message: `${s.figures - s.captionedFigures} hình chưa có chú thích.`,
      action: 'Viết chú thích trong alt của hình hoặc thêm dòng ": Chú thích" ngay dưới.',
    });
  }
  if (s.tables && s.captionedTables < s.tables) {
    out.push({
      id: 'caption-tables',
      priority: 'medium',
      message: `${s.tables - s.captionedTables} bảng chưa có chú thích.`,
      action: 'Thêm dòng ": Chú thích bảng {#tbl:ten}" ngay dưới bảng.',
    });
  }
  if (s.references === 0 && s.words > 500) {
    out.push({
      id: 'add-references',
      priority: 'medium',
      message: 'Bài chưa có tài liệu tham khảo.',
      action: 'Khai báo danh mục ở front matter qua trường "bibliography:".',
    });
  }
  if (s.longestParagraphWords > 200) {
    out.push({
      id: 'split-paragraph',
      priority: 'low',
      message: `Đoạn dài nhất có ${s.longestParagraphWords} từ.`,
      action: 'Tách thành các đoạn 80–150 từ để người đọc dễ theo dõi.',
    });
  }
  if (!s.crossRefs && s.figures + s.tables > 0) {
    out.push({
      id: 'reference-objects',
      priority: 'low',
      message: 'Hình và bảng chưa được nhắc tới trong phần nội dung.',
      action: 'Dùng @fig:ten / @tbl:ten trong câu văn để dẫn người đọc tới đối tượng.',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ utils */

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?…]+(\s|$)/g);
  const n = matches ? matches.length : 0;
  return n || (text.trim() ? 1 : 0);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export * from './pre-submission-audit.js';
