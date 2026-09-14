import type { Diagnostic, DocumentNode, HeadingNode } from '@scirender/ast';
import { plainText, sortDiagnostics, walk } from '@scirender/ast';
import { checkMath } from '@scirender/equation-engine';
import { checkFigure, type AssetMap } from '@scirender/figure-engine';
import { checkTable } from '@scirender/table-engine';

export interface ValidateOptions {
  assets?: AssetMap;
  /** Soft limits — reported as warnings, never enforced. */
  maxAbstractWords?: number;
  maxParagraphWords?: number;
  requireAbstract?: boolean;
  requireKeywords?: boolean;
}

const DEFAULTS: Required<Omit<ValidateOptions, 'assets'>> = {
  maxAbstractWords: 300,
  maxParagraphWords: 180,
  requireAbstract: true,
  requireKeywords: true,
};

/**
 * Structural, syntactic and asset validation.
 *
 * P6 — Fail Loudly: every rule reports; no rule repairs. The validator is a
 * read-only consumer of the AST and never mutates it.
 * Run it AFTER `assignNumbers`, so label/reference diagnostics are complete.
 */
export function validate(doc: DocumentNode, options: ValidateOptions = {}): Diagnostic[] {
  const opts = { ...DEFAULTS, ...options };
  const assets: AssetMap = options.assets ?? {};
  const out: Diagnostic[] = [];
  const docPos = doc.position;

  // ------------------------------------------------------------- metadata --
  if (!doc.meta.title.trim()) {
    out.push({
      code: 'SR-V001',
      severity: 'error',
      stage: 'validator',
      message: 'Tài liệu chưa có tiêu đề.',
      hint: 'Thêm "title: ..." vào front matter, hoặc mở đầu bằng một đề mục cấp 1.',
      position: docPos,
    });
  }
  if (!doc.meta.authors.length) {
    out.push({
      code: 'SR-V002',
      severity: 'warning',
      stage: 'validator',
      message: 'Tài liệu chưa khai báo tác giả.',
      hint: 'Thêm mục "authors:" vào front matter.',
      position: docPos,
    });
  }
  if (opts.requireAbstract && !doc.meta.abstract) {
    out.push({
      code: 'SR-V003',
      severity: 'warning',
      stage: 'validator',
      message: 'Tài liệu chưa có phần tóm tắt (abstract).',
      position: docPos,
    });
  } else if (doc.meta.abstract) {
    const words = countWords(doc.meta.abstract);
    if (words > opts.maxAbstractWords) {
      out.push({
        code: 'SR-V004',
        severity: 'warning',
        stage: 'validator',
        message: `Tóm tắt dài ${words} từ, vượt ngưỡng khuyến nghị ${opts.maxAbstractWords} từ.`,
        position: docPos,
      });
    }
  }
  if (opts.requireKeywords && !doc.meta.keywords.length) {
    out.push({
      code: 'SR-V005',
      severity: 'info',
      stage: 'validator',
      message: 'Tài liệu chưa có từ khóa.',
      position: docPos,
    });
  }

  // ------------------------------------------------------------ structure --
  const headings: HeadingNode[] = [];
  walk(doc, (n) => {
    if (n.type === 'heading') headings.push(n);
    return undefined;
  });

  if (!headings.length) {
    out.push({
      code: 'SR-V006',
      severity: 'warning',
      stage: 'validator',
      message: 'Tài liệu không có đề mục nào nên không thể lập cấu trúc chương mục.',
      position: docPos,
    });
  } else {
    const first = headings[0] as HeadingNode;
    if (first.depth !== 1) {
      out.push({
        code: 'SR-V007',
        severity: 'warning',
        stage: 'validator',
        nodeId: first.id,
        message: `Đề mục đầu tiên ở cấp ${first.depth}; tài liệu khoa học nên bắt đầu từ cấp 1.`,
        position: first.position,
      });
    }
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1] as HeadingNode;
      const cur = headings[i] as HeadingNode;
      if (cur.depth > prev.depth + 1) {
        out.push({
          code: 'SR-V008',
          severity: 'warning',
          stage: 'validator',
          nodeId: cur.id,
          message: `Nhảy cấp đề mục: từ cấp ${prev.depth} xuống thẳng cấp ${cur.depth}.`,
          hint: `Dùng cấp ${prev.depth + 1} để giữ cấu trúc liên tục.`,
          position: cur.position,
        });
      }
      if (!plainText(cur)) {
        out.push({
          code: 'SR-V009',
          severity: 'error',
          stage: 'validator',
          nodeId: cur.id,
          message: 'Đề mục rỗng.',
          position: cur.position,
        });
      }
    }
    // A heading immediately followed by another heading has no body text.
    const flat = doc.children;
    for (let i = 0; i < flat.length - 1; i++) {
      const a = flat[i];
      const b = flat[i + 1];
      if (a && b && a.type === 'heading' && b.type === 'heading' && b.depth <= a.depth) {
        out.push({
          code: 'SR-V015',
          severity: 'info',
          stage: 'validator',
          nodeId: a.id,
          message: `Mục "${plainText(a)}" không có nội dung.`,
          position: a.position,
        });
      }
    }
  }

  // ------------------------------------------------------- node-level rules --
  const usedLabels = new Set<string>();
  walk(doc, (n) => {
    switch (n.type) {
      case 'crossRef':
        usedLabels.add(n.label);
        break;
      case 'equation': {
        if (!n.value.trim()) {
          out.push({
            code: 'SR-V020',
            severity: 'error',
            stage: 'validator',
            nodeId: n.id,
            message: 'Khối công thức rỗng.',
            position: n.position,
          });
          break;
        }
        const res = checkMath(n.value, true);
        if (!res.ok) {
          out.push({
            code: 'SR-V021',
            severity: 'error',
            stage: 'equation',
            nodeId: n.id,
            message: `Lỗi cú pháp LaTeX: ${res.error}`,
            position: n.position,
          });
        }
        break;
      }
      case 'inlineMath': {
        const res = checkMath(n.value, false);
        if (!res.ok) {
          out.push({
            code: 'SR-V022',
            severity: 'error',
            stage: 'equation',
            nodeId: n.id,
            message: `Lỗi cú pháp LaTeX nội dòng: ${res.error}`,
            position: n.position,
          });
        }
        break;
      }
      case 'figure':
        out.push(...checkFigure(n, assets));
        break;
      case 'table':
        out.push(...checkTable(n));
        break;
      case 'paragraph': {
        const words = countWords(plainText(n));
        if (words > opts.maxParagraphWords) {
          out.push({
            code: 'SR-V030',
            severity: 'info',
            stage: 'validator',
            nodeId: n.id,
            message: `Đoạn văn dài ${words} từ; cân nhắc tách thành nhiều đoạn.`,
            position: n.position,
          });
        }
        break;
      }
      case 'unknownBlock':
        out.push({
          code: 'SR-V040',
          severity: 'error',
          stage: 'parser',
          nodeId: n.id,
          message: `Không hiểu khối nội dung: ${n.reason}`,
          position: n.position,
        });
        break;
      default:
        break;
    }
    return undefined;
  });

  // -------------------------------------------------------- unused labels --
  for (const [label, rec] of Object.entries(doc.labels)) {
    if (!usedLabels.has(label)) {
      out.push({
        code: 'SR-V031',
        severity: 'info',
        stage: 'validator',
        nodeId: rec.nodeId,
        message: `Nhãn "${label}" được khai báo nhưng chưa được tham chiếu ở đâu.`,
        position: rec.position,
      });
    }
  }

  // ---------------------------------------------------- uncited references --
  for (const entry of doc.meta.bibliography) {
    if (!doc.citationOrder.includes(entry.key)) {
      out.push({
        code: 'SR-V032',
        severity: 'info',
        stage: 'validator',
        message: `Tài liệu tham khảo "${entry.key}" chưa được trích dẫn trong bài.`,
        position: docPos,
      });
    }
  }

  return sortDiagnostics(out);
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
