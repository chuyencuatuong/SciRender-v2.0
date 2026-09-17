import type { AlignMode, TableCell, TableNode } from '@scirender/ast';

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

export function alignStyle(mode: AlignMode | 'decimal'): string {
  switch (mode) {
    case 'left':
      return 'text-align:left';
    case 'right':
      return 'text-align:right';
    case 'center':
      return 'text-align:center';
    case 'decimal':
      return 'text-align:right;font-variant-numeric:tabular-nums';
    default:
      return '';
  }
}


export * from './formulas.js';
export * from './statistics.js';


