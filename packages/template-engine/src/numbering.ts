import type {
  AnyNode,
  Diagnostic,
  DocumentNode,
  LabelRecord,
  RefKind,
} from '@scirender/ast';
import { walk } from '@scirender/ast';
import type { CounterStyle, TemplateDescriptor } from './types.js';

export interface NumberingResult {
  labels: Record<string, LabelRecord>;
  citationOrder: string[];
  diagnostics: Diagnostic[];
}

const KIND_OF_TYPE: Record<string, RefKind> = {
  heading: 'sec',
  equation: 'eq',
  figure: 'fig',
  table: 'tbl',
  diagram: 'dia',
  codeBlock: 'lst',
};

/**
 * Single numbering pass over the AST.
 *
 * Numbering is a *template decision*, not a parsing decision: changing the
 * template changes the numbers without touching the source (P3 + P4).
 * The pass mutates `number`, `resolved`, `numbers`, `labels` and
 * `citationOrder` on the document it is given, and returns the diagnostics it
 * produced. It is deterministic: a pure function of (document, template).
 */
export function assignNumbers(doc: DocumentNode, t: TemplateDescriptor): NumberingResult {
  const diagnostics: Diagnostic[] = [];
  const labels: Record<string, LabelRecord> = {};
  const citationOrder: string[] = [];

  const headingCounters = [0, 0, 0, 0, 0, 0];
  let eq = 0;
  let fig = 0;
  let tbl = 0;
  let dia = 0;
  let lst = 0;
  let sectionPrefix = '';

  const register = (
    label: string | null,
    kind: RefKind,
    number: string,
    node: AnyNode,
  ): void => {
    if (!label) return;
    const normalised = label.includes(':') ? label : `${kind}:${label}`;
    const prefix = normalised.slice(0, normalised.indexOf(':'));
    if (prefix !== kind) {
      diagnostics.push({
        code: 'SR-V010',
        severity: 'warning',
        stage: 'validator',
        nodeId: node.id,
        message: `Nhãn "${normalised}" dùng tiền tố "${prefix}" nhưng gắn vào đối tượng loại "${kind}".`,
        hint: `Đổi thành "${kind}:${normalised.slice(prefix.length + 1)}".`,
        position: node.position,
      });
    }
    const existing = labels[normalised];
    if (existing) {
      diagnostics.push({
        code: 'SR-V011',
        severity: 'error',
        stage: 'validator',
        nodeId: node.id,
        message: `Nhãn "${normalised}" bị trùng (đã khai báo ở dòng ${existing.position.start.line}).`,
        hint: 'Mỗi nhãn chỉ được dùng cho một đối tượng.',
        position: node.position,
      });
      return;
    }
    labels[normalised] = {
      label: normalised,
      kind,
      number,
      nodeId: node.id,
      position: node.position,
    };
  };

  const resetSectionCounters = (): void => {
    if (t.numbering.equationStyle === 'section') eq = 0;
    if (t.numbering.figures === 'section') fig = 0;
    if (t.numbering.tables === 'section') tbl = 0;
    if (t.numbering.diagrams === 'section') dia = 0;
    if (t.numbering.listings === 'section') lst = 0;
  };

  walk(doc, (node) => {
    switch (node.type) {
      case 'heading': {
        const d = node.depth;
        if (t.headings.numbering === 'decimal' && !node.unnumbered && d <= t.headings.numberDepth) {
          headingCounters[d - 1] = (headingCounters[d - 1] ?? 0) + 1;
          for (let k = d; k < 6; k++) headingCounters[k] = 0;
          node.number = headingCounters.slice(0, d).join('.');
        } else {
          node.number = null;
        }
        if (d <= t.numbering.resetAtDepth) {
          sectionPrefix = headingCounters.slice(0, t.numbering.resetAtDepth).join('.');
          resetSectionCounters();
        }
        register(node.label, 'sec', node.number ?? '', node);
        break;
      }
      case 'equation': {
        const mode = t.numbering.equations;
        const shouldNumber =
          mode === 'all' ? !node.unnumbered : mode === 'labelled' ? Boolean(node.label) : false;
        if (shouldNumber) {
          eq += 1;
          node.number = format(eq, t.numbering.equationStyle, sectionPrefix);
        } else {
          node.number = null;
        }
        register(node.label, 'eq', node.number ?? '', node);
        break;
      }
      case 'figure': {
        fig += 1;
        node.number = format(fig, t.numbering.figures, sectionPrefix);
        register(node.label, 'fig', node.number, node);
        break;
      }
      case 'table': {
        tbl += 1;
        node.number = format(tbl, t.numbering.tables, sectionPrefix);
        register(node.label, 'tbl', node.number, node);
        break;
      }
      case 'diagram': {
        dia += 1;
        node.number = format(dia, t.numbering.diagrams, sectionPrefix);
        register(node.label, 'dia', node.number, node);
        break;
      }
      case 'codeBlock': {
        // Only captioned listings are numbered; a bare snippet stays unnumbered.
        if (node.caption.length || node.label) {
          lst += 1;
          node.number = format(lst, t.numbering.listings, sectionPrefix);
          register(node.label, 'lst', node.number, node);
        } else {
          node.number = null;
        }
        break;
      }
      case 'citation': {
        for (const key of node.keys) {
          if (!citationOrder.includes(key)) citationOrder.push(key);
        }
        break;
      }
      default:
        break;
    }
    return undefined;
  });

  // ---- second pass: resolve cross references and citation numbers ----------
  const bibKeys = new Set(doc.meta.bibliography.map((b) => b.key));
  walk(doc, (node) => {
    if (node.type === 'crossRef') {
      const rec = labels[node.label];
      if (rec && rec.number) {
        node.resolved = { kind: rec.kind, number: rec.number, nodeId: rec.nodeId };
      } else {
        node.resolved = null;
        diagnostics.push({
          code: rec ? 'SR-V013' : 'SR-V012',
          severity: rec ? 'warning' : 'error',
          stage: 'validator',
          nodeId: node.id,
          message: rec
            ? `Tham chiếu "@${node.label}" trỏ tới đối tượng không được đánh số.`
            : `Không tìm thấy nhãn "@${node.label}".`,
          hint: rec
            ? 'Bỏ thuộc tính "-" (unnumbered) ở đối tượng được tham chiếu.'
            : `Khai báo nhãn bằng {#${node.label}} ở đối tượng tương ứng.`,
          position: node.position,
        });
      }
    } else if (node.type === 'citation') {
      node.numbers = node.keys.map((k) => {
        if (!bibKeys.has(k)) {
          diagnostics.push({
            code: 'SR-V014',
            severity: 'error',
            stage: 'validator',
            nodeId: node.id,
            message: `Khóa trích dẫn "@${k}" không có trong danh mục tài liệu tham khảo.`,
            hint: 'Thêm mục có "key: ' + k + '" vào trường bibliography ở front matter.',
            position: node.position,
          });
          return null;
        }
        return citationOrder.indexOf(k) + 1;
      });
    }
    return undefined;
  });

  doc.labels = labels;
  doc.citationOrder = citationOrder;
  return { labels, citationOrder, diagnostics };
}

function format(counter: number, style: CounterStyle, sectionPrefix: string): string {
  if (style === 'section' && sectionPrefix && sectionPrefix !== '0') {
    return `${sectionPrefix}.${counter}`;
  }
  return String(counter);
}

/** Word shown in front of a cross-reference number, e.g. "Hình" for `@fig:x`. */
export function refWord(kind: RefKind, t: TemplateDescriptor): string {
  switch (kind) {
    case 'fig': return t.labels.refFigure;
    case 'tbl': return t.labels.refTable;
    case 'sec': return t.labels.refSection;
    case 'dia': return t.labels.refDiagram;
    case 'eq': return t.labels.refEquation;
    case 'lst': return t.labels.refListing;
    default: return '';
  }
}
