import type { Diagnostic, DocumentNode } from '@scirender/ast';
import { plainText, walk } from '@scirender/ast';

export type AuditSeverity = 'pass' | 'warning' | 'error';
export type AuditGroup = 'orphan' | 'structure' | 'consistency' | 'layout';

export interface AuditCheck {
  id: string;
  group: AuditGroup;
  severity: AuditSeverity;
  code: string;
  label: string;
  message: string;
  hint?: string;
  nodeId?: string;
  line?: number;
}

export interface AuditStats {
  pages: number;
  bodyPages: number;
  words: number;
  figures: number;
  tables: number;
  equations: number;
  references: number;
  citations: number;
}

export interface AuditTemplateContext {
  tocEnabled: boolean;
  pageBudget: { min: number; max: number } | null;
}

export interface AuditLayoutContext {
  pages: number;
  bodyPages: number;
  warnings: Array<{ code: string; message: string; nodeId: string | null; line: number | null }>;
}

export interface AuditReport {
  checks: AuditCheck[];
  stats: AuditStats;
  passed: number;
  warnings: number;
  errors: number;
  ready: boolean;
}

const SEVERITY_RANK: Record<AuditSeverity, number> = { error: 0, warning: 1, pass: 2 };

/**
 * Deterministic, client-side pre-submission audit. It consumes only the AST,
 * existing compiler diagnostics and pagination metadata — no network, no AI,
 * no source rewriting (P1/P4/P5).
 */
export function runPreSubmissionAudit(
  doc: DocumentNode,
  diagnostics: Diagnostic[],
  template: AuditTemplateContext,
  layout: AuditLayoutContext,
): AuditReport {
  const checks: AuditCheck[] = [];
  const push = (check: AuditCheck): void => { checks.push(check); };

  const statsBase = collectStats(doc);
  const stats: AuditStats = {
    pages: layout.pages,
    bodyPages: layout.bodyPages,
    words: statsBase.words,
    figures: statsBase.figures,
    tables: statsBase.tables,
    equations: statsBase.equations,
    references: doc.meta.bibliography.length,
    citations: statsBase.citations,
  };

  auditOrphansAndRefs(doc, diagnostics, push);
  auditStructure(doc, template, push);
  auditConsistency(doc, push);
  auditLayout(diagnostics, template, layout, push);

  checks.sort((a, b) => {
    const group = a.group.localeCompare(b.group);
    return group || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.code.localeCompare(b.code);
  });

  const errors = checks.filter((x) => x.severity === 'error').length;
  const warnings = checks.filter((x) => x.severity === 'warning').length;
  const passed = checks.filter((x) => x.severity === 'pass').length;

  return { checks, stats, passed, warnings, errors, ready: errors === 0 && warnings === 0 };
}

function auditOrphansAndRefs(
  doc: DocumentNode,
  diagnostics: Diagnostic[],
  push: (check: AuditCheck) => void,
): void {
  const crossRefs = new Set<string>();
  const citations = new Set<string>();
  walk(doc, (node) => {
    if (node.type === 'crossRef') crossRefs.add(node.label);
    if (node.type === 'citation') for (const key of node.keys) citations.add(key);
    return undefined;
  });

  const labelled = Object.values(doc.labels);
  const figTbl = labelled.filter((r) => r.kind === 'fig' || r.kind === 'tbl');
  const orphan = figTbl.filter((r) => !crossRefs.has(r.label));
  if (!orphan.length) {
    push({ id: 'orphan-fig-table', group: 'orphan', severity: 'pass', code: 'AUD-A001', label: 'Hình / bảng được tham chiếu', message: 'Tất cả hình và bảng có nhãn đều được nhắc đến trong nội dung.' });
  } else {
    for (const rec of orphan) {
      const kind = rec.kind === 'fig' ? 'Hình' : 'Bảng';
      push({
        id: `orphan-${rec.label}`,
        group: 'orphan',
        severity: 'warning',
        code: 'AUD-A001',
        label: 'Đối tượng mồ côi',
        message: `${kind} ${rec.number ?? ''} (${rec.label}) tồn tại nhưng chưa được nhắc đến trong nội dung.`.replace(/  /g, ' '),
        hint: `Thêm @${rec.label} tại vị trí phù hợp, hoặc bỏ nhãn nếu không cần tham chiếu.`,
        nodeId: rec.nodeId,
        line: rec.position.start.line,
      });
    }
  }

  const brokenCross = diagnostics.filter((d) => d.code === 'SR-V012');
  if (!brokenCross.length) {
    push({ id: 'broken-crossref', group: 'orphan', severity: 'pass', code: 'AUD-A002', label: 'Tham chiếu chéo', message: 'Không có tham chiếu chéo bị gãy.' });
  } else {
    for (const d of brokenCross) push(diagnosticToAudit(d, 'orphan', 'AUD-A002', 'Tham chiếu chéo bị gãy'));
  }

  const brokenCites = diagnostics.filter((d) => d.code === 'SR-V014');
  if (!brokenCites.length) {
    push({ id: 'broken-citation', group: 'orphan', severity: 'pass', code: 'AUD-A003', label: 'Trích dẫn BibTeX', message: 'Tất cả citation trong bài đều có mục BibTeX tương ứng.' });
  } else {
    for (const d of brokenCites) push(diagnosticToAudit(d, 'orphan', 'AUD-A003', 'Trích dẫn BibTeX bị gãy'));
  }

  const unused = doc.meta.bibliography.filter((entry) => !citations.has(entry.key));
  if (!unused.length) {
    push({ id: 'unused-bib', group: 'orphan', severity: 'pass', code: 'AUD-A004', label: 'Tài liệu tham khảo đã dùng', message: 'Không có mục BibTeX nào được nạp nhưng bỏ quên.' });
  } else {
    for (const entry of unused) {
      push({
        id: `unused-bib-${entry.key}`,
        group: 'orphan',
        severity: 'warning',
        code: 'AUD-A004',
        label: 'Tài liệu chưa được trích dẫn',
        message: `Tài liệu tham khảo "${entry.key}" đã nạp nhưng chưa được trích dẫn trong bài.`,
        hint: `Chèn [@${entry.key}] nếu tài liệu này thực sự được sử dụng, hoặc bỏ mục khỏi bibliography.`,
        line: doc.position.start.line,
      });
    }
  }
}

function auditStructure(
  doc: DocumentNode,
  template: AuditTemplateContext,
  push: (check: AuditCheck) => void,
): void {
  const headings = doc.children.filter((n) => n.type === 'heading');
  let jumpCount = 0;
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1];
    const cur = headings[i];
    if (prev?.type === 'heading' && cur?.type === 'heading' && cur.depth > prev.depth + 1) {
      jumpCount++;
      push({
        id: `heading-jump-${cur.id}`,
        group: 'structure',
        severity: 'warning',
        code: 'AUD-B002',
        label: 'Nhảy cấp đề mục',
        message: `Đề mục cấp ${cur.depth} xuất hiện ngay sau cấp ${prev.depth}; thiếu một cấp trung gian.`,
        hint: `Nên thêm đề mục cấp ${prev.depth + 1} hoặc hạ cấp tiêu đề hiện tại.`,
        nodeId: cur.id,
        line: cur.position.start.line,
      });
    }
  }
  if (!jumpCount) push({ id: 'heading-jumps', group: 'structure', severity: 'pass', code: 'AUD-B002', label: 'Phân cấp đề mục', message: 'Không phát hiện nhảy cóc cấp độ đề mục.' });

  const empty: Array<{ id: string; line: number; title: string }> = [];
  for (let i = 0; i < doc.children.length; i++) {
    const current = doc.children[i];
    if (!current || current.type !== 'heading') continue;
    const next = doc.children[i + 1];
    if (!next || next.type !== 'heading' || next.depth <= current.depth) {
      if (!next) empty.push({ id: current.id, line: current.position.start.line, title: plainText(current) });
      else if (next.type === 'heading' && next.depth <= current.depth) empty.push({ id: current.id, line: current.position.start.line, title: plainText(current) });
    }
  }
  if (!empty.length) push({ id: 'empty-sections', group: 'structure', severity: 'pass', code: 'AUD-B001', label: 'Đề mục có nội dung', message: 'Các đề mục đều có nội dung trước khi chuyển sang mục ngang cấp/cấp cao hơn.' });
  else for (const item of empty) push({
    id: `empty-section-${item.id}`,
    group: 'structure',
    severity: 'warning',
    code: 'AUD-B001',
    label: 'Đề mục rỗng',
    message: `Mục "${item.title || 'không tên'}" không có nội dung trước đề mục tiếp theo.`,
    hint: 'Thêm nội dung, hoặc xóa đề mục nếu không dùng.',
    nodeId: item.id,
    line: item.line,
  });

  const hasAbstract = Boolean(doc.meta.abstract?.trim());
  push(hasAbstract
    ? { id: 'abstract', group: 'structure', severity: 'pass', code: 'AUD-B003', label: 'Tóm tắt', message: 'Đã có phần Tóm tắt.' }
    : { id: 'abstract', group: 'structure', severity: 'warning', code: 'AUD-B003', label: 'Tóm tắt', message: 'Chưa có phần Tóm tắt (abstract).', hint: 'Thêm trường abstract trong front matter.' });

  const conclusion = doc.children.find((n) => n.type === 'heading' && /\b(kết luận|conclusion)\b/i.test(plainText(n)));
  push(conclusion
    ? { id: 'conclusion', group: 'structure', severity: 'pass', code: 'AUD-B004', label: 'Kết luận', message: 'Đã có phần Kết luận.' }
    : { id: 'conclusion', group: 'structure', severity: 'warning', code: 'AUD-B004', label: 'Kết luận', message: 'Chưa phát hiện đề mục Kết luận / Conclusion.', hint: 'Thêm một heading với tiêu đề "Kết luận" hoặc "Conclusion".', });

  push(template.tocEnabled && headings.length
    ? { id: 'toc', group: 'structure', severity: 'pass', code: 'AUD-B005', label: 'Mục lục', message: 'Template hiện tại đã bật Mục lục tự động.' }
    : { id: 'toc', group: 'structure', severity: 'warning', code: 'AUD-B005', label: 'Mục lục', message: template.tocEnabled ? 'Template có bật Mục lục nhưng tài liệu chưa có đề mục để tạo mục lục.' : 'Template hiện tại chưa bật Mục lục.', hint: 'Bật phần TOC trong template và bảo đảm tài liệu có các đề mục.' });
}

function auditConsistency(doc: DocumentNode, push: (check: AuditCheck) => void): void {
  const captionNodes: Array<{ nodeId: string; line: number; text: string }> = [];
  const chapterCases = new Set<'upper' | 'title'>();

  walk(doc, (n) => {
    if ((n.type === 'figure' || n.type === 'table' || n.type === 'diagram' || n.type === 'codeBlock') && n.caption.length) {
      captionNodes.push({ nodeId: n.id, line: n.position.start.line, text: n.caption.map((child) => plainText(child)).join(' ') });
    }
    if (n.type === 'heading' && n.depth === 1) {
      const text = plainText(n).trim();
      const m = /^(CHƯƠNG|Chương|chương)\s+\d+/u.exec(text);
      if (m) chapterCases.add(m[1] === 'CHƯƠNG' ? 'upper' : 'title');
    }
    return undefined;
  });

  const hasFigure = captionNodes.some((x) => /\bfigure\b/i.test(x.text));
  const hasVietnameseFigure = captionNodes.some((x) => /\bhình\b/i.test(x.text));
  const hasTable = captionNodes.some((x) => /\btable\b/i.test(x.text));
  const hasVietnameseTable = captionNodes.some((x) => /\bbảng\b/i.test(x.text));
  const mixedCaption = (hasFigure && hasVietnameseFigure) || (hasTable && hasVietnameseTable);
  push(mixedCaption
    ? {
        id: 'caption-language',
        group: 'consistency',
        severity: 'warning',
        code: 'AUD-C001',
        label: 'Ngôn ngữ caption',
        message: 'Caption đang pha trộn tiếng Việt và tiếng Anh (ví dụ Hình/Figure hoặc Bảng/Table).',
        hint: 'Chọn một phong cách caption và dùng thống nhất toàn tài liệu.',
        nodeId: captionNodes[0]?.nodeId,
        line: captionNodes[0]?.line,
      }
    : { id: 'caption-language', group: 'consistency', severity: 'pass', code: 'AUD-C001', label: 'Ngôn ngữ caption', message: 'Ngôn ngữ caption nhất quán.' });

  push(chapterCases.size > 1
    ? { id: 'chapter-case', group: 'consistency', severity: 'warning', code: 'AUD-C002', label: 'Viết hoa tiêu đề chương', message: 'Các tiêu đề CHƯƠNG đang dùng không đồng nhất kiểu viết hoa.', hint: 'Thống nhất "CHƯƠNG 1" hoặc "Chương 1" cho toàn bộ chương.' }
    : { id: 'chapter-case', group: 'consistency', severity: 'pass', code: 'AUD-C002', label: 'Viết hoa tiêu đề chương', message: 'Kiểu viết hoa tiêu đề chương nhất quán.' });

  const allText = plainText(doc);
  const mps2 = /m\/s2/.test(allText);
  const mpsSup = /m\/s²/.test(allText);
  const ohmWord = /\b(?:Ohm|ohm)\b/.test(allText);
  const ohmSymbol = /Ω/.test(allText);
  const mixedUnits = (mps2 && mpsSup) || (ohmWord && ohmSymbol);
  push(mixedUnits
    ? { id: 'units', group: 'consistency', severity: 'warning', code: 'AUD-C003', label: 'Đơn vị đo lường', message: 'Phát hiện cách viết đơn vị không đồng nhất (ví dụ m/s2 ↔ m/s² hoặc Ohm ↔ Ω).', hint: 'Nên chọn một ký hiệu SI/Unicode và dùng nhất quán.' }
    : { id: 'units', group: 'consistency', severity: 'pass', code: 'AUD-C003', label: 'Đơn vị đo lường', message: 'Không phát hiện cặp ký hiệu đơn vị mâu thuẫn trong các quy tắc hiện tại.' });
}

function auditLayout(
  diagnostics: Diagnostic[],
  template: AuditTemplateContext,
  layout: AuditLayoutContext,
  push: (check: AuditCheck) => void,
): void {
  const budget = template.pageBudget;
  if (!budget) {
    push({ id: 'page-budget', group: 'layout', severity: 'pass', code: 'AUD-D001', label: 'Ngân sách trang', message: 'Template hiện tại không đặt giới hạn số trang.' });
  } else if (layout.bodyPages < budget.min || layout.bodyPages > budget.max) {
    push({ id: 'page-budget', group: 'layout', severity: 'warning', code: layout.bodyPages > budget.max ? 'SR-L010' : 'SR-L011', label: 'Ngân sách trang', message: `Tài liệu có ${layout.bodyPages} trang nội dung; yêu cầu là ${budget.min}–${budget.max} trang.`, hint: layout.bodyPages > budget.max ? 'Rút gọn nội dung hoặc bố cục; không nên ép font/lề chỉ để giảm trang.' : 'Kiểm tra xem tài liệu đã đủ nội dung theo yêu cầu của môn học chưa.' });
  } else {
    push({ id: 'page-budget', group: 'layout', severity: 'pass', code: 'AUD-D001', label: 'Ngân sách trang', message: `Độ dài ${layout.bodyPages} trang nằm trong giới hạn ${budget.min}–${budget.max}.` });
  }

  const hasMathScaleWarning = layout.warnings.some((w) => w.code === 'SR-L004');
  if (!hasMathScaleWarning) {
    push({ id: 'equation-scale', group: 'layout', severity: 'pass', code: 'AUD-D002', label: 'Độ co công thức', message: 'Không có công thức nào bị thu nhỏ xuống mức cảnh báo.' });
  }

  const tableFormula = diagnostics.filter((d) => /^SR-T11[0-5]$/.test(d.code));
  if (!tableFormula.length) {
    push({ id: 'table-formula', group: 'layout', severity: 'pass', code: 'AUD-D003', label: 'Công thức trong bảng', message: 'Không phát hiện #DIV/0!, tham chiếu vòng hoặc lỗi công thức bảng.' });
  } else {
    for (const d of tableFormula) push(diagnosticToAudit(d, 'layout', 'AUD-D003', 'Lỗi công thức bảng'));
  }

  for (const w of layout.warnings.filter((item) => item.code !== 'SR-L010' && item.code !== 'SR-L011')) {
    const isMathScale = w.code === 'SR-L004';
    push({
      id: `layout-${w.code}-${w.line ?? 0}-${w.nodeId ?? ''}`,
      group: 'layout',
      severity: 'warning',
      code: isMathScale ? 'SR-L004' : w.code,
      label: isMathScale ? 'Công thức bị co quá mức' : 'Cảnh báo dàn trang',
      message: w.message,
      nodeId: w.nodeId ?? undefined,
      line: w.line ?? undefined,
    });
  }
}

function diagnosticToAudit(d: Diagnostic, group: AuditGroup, code: string, label: string): AuditCheck {
  return {
    id: `${code}-${d.position.start.line}-${d.nodeId ?? ''}`,
    group,
    severity: d.severity === 'error' ? 'error' : 'warning',
    code,
    label,
    message: d.message,
    hint: d.hint,
    nodeId: d.nodeId,
    line: d.position.start.line,
  };
}

function collectStats(doc: DocumentNode): { words: number; figures: number; tables: number; equations: number; citations: number } {
  let words = 0;
  let figures = 0;
  let tables = 0;
  let equations = 0;
  let citations = 0;
  walk(doc, (n) => {
    if (n.type === 'paragraph' || n.type === 'heading') words += countWords(plainText(n));
    if (n.type === 'figure') figures++;
    if (n.type === 'table') tables++;
    if (n.type === 'equation') equations++;
    if (n.type === 'citation') citations += n.keys.length;
    return undefined;
  });
  if (doc.meta.abstract) words += countWords(doc.meta.abstract);
  return { words, figures, tables, equations, citations };
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
