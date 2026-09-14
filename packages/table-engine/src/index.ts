import type { AlignMode, Diagnostic, TableCell, TableNode } from '@scirender/ast';

export interface NormalisedTable {
  header: TableCell[];
  rows: TableCell[][];
  align: AlignMode[];
  columns: number;
}

/**
 * Pads short rows and trims long ones so the renderer can emit a well-formed
 * table. The original AST is NOT mutated — the mismatch is already reported as
 * a diagnostic by the parser (P1 + P6: report, do not silently rewrite source).
 */
export function normaliseTable(node: TableNode): NormalisedTable {
  const columns = Math.max(node.header.length, ...node.rows.map((r) => r.length), 1);
  const pad = (cells: TableCell[]): TableCell[] =>
    Array.from({ length: columns }, (_, i) => cells[i] ?? { children: [] });
  const align: AlignMode[] = Array.from(
    { length: columns },
    (_, i) => node.align[i] ?? 'default',
  );
  return {
    header: pad(node.header),
    rows: node.rows.map(pad),
    align,
    columns,
  };
}

export function alignStyle(mode: AlignMode): string {
  switch (mode) {
    case 'left':
      return 'text-align:left';
    case 'right':
      return 'text-align:right';
    case 'center':
      return 'text-align:center';
    default:
      return '';
  }
}

export function checkTable(node: TableNode): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!node.rows.length) {
    out.push({
      code: 'SR-T001',
      severity: 'warning',
      stage: 'validator',
      nodeId: node.id,
      message: 'Bảng chỉ có dòng tiêu đề, không có dữ liệu.',
      position: node.position,
    });
  }
  if (!node.caption.length) {
    out.push({
      code: 'SR-T002',
      severity: 'warning',
      stage: 'validator',
      nodeId: node.id,
      message: 'Bảng chưa có chú thích (caption).',
      hint: 'Thêm dòng ": Chú thích bảng {#tbl:ten}" ngay dưới bảng.',
      position: node.position,
    });
  }
  const widths = new Set(node.rows.map((r) => r.length));
  if (widths.size > 1) {
    out.push({
      code: 'SR-T003',
      severity: 'error',
      stage: 'validator',
      nodeId: node.id,
      message: 'Các dòng trong bảng có số ô không đồng nhất.',
      position: node.position,
    });
  }
  return out;
}
