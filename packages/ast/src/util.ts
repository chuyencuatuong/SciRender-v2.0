import type {
  AnyNode,
  BlockNode,
  DocumentNode,
  InlineNode,
  Point,
  Position,
} from './nodes.js';

/** FNV-1a 32-bit. Deterministic, dependency-free, stable across runs (P2). */
export function hash32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

/**
 * Node ids are a pure function of (type, source line, ordinal within that line).
 * Same source => same ids => same DOM keys => same layout.
 */
export function makeNodeId(type: string, position: Position, ordinal = 0): string {
  return `${type}-${hash32(`${type}|${position.start.line}|${position.start.column}|${ordinal}`)}`;
}

export function point(line: number, column: number, offset: number): Point {
  return { line, column, offset };
}

export function position(start: Point, end: Point): Position {
  return { start, end };
}

export function emptyPosition(): Position {
  return { start: point(1, 1, 0), end: point(1, 1, 0) };
}

function childrenOf(node: AnyNode): AnyNode[] {
  const out: AnyNode[] = [];
  const n = node as unknown as Record<string, unknown>;
  for (const key of ['children', 'items', 'caption'] as const) {
    const v = n[key];
    if (Array.isArray(v)) out.push(...(v as AnyNode[]));
  }
  if (node.type === 'table') {
    for (const cell of node.header) out.push(...cell.children);
    for (const row of node.rows) for (const cell of row) out.push(...cell.children);
  }
  return out;
}

/** Depth-first walk in document order. Return `false` from `visit` to skip subtree. */
export function walk(root: AnyNode, visit: (node: AnyNode, parent: AnyNode | null) => void | false): void {
  const stack: Array<[AnyNode, AnyNode | null]> = [[root, null]];
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) break;
    const [node, parent] = entry;
    if (visit(node, parent) === false) continue;
    const kids = childrenOf(node);
    for (let i = kids.length - 1; i >= 0; i--) {
      const k = kids[i];
      if (k) stack.push([k, node]);
    }
  }
}

/** Flattens all inline text of a node — used for word counts and outline titles. */
export function plainText(node: AnyNode): string {
  let out = '';
  walk(node, (n) => {
    if (n.type === 'text') out += n.value;
    else if (n.type === 'inlineCode') out += n.value;
    else if (n.type === 'inlineMath') out += ' ';
    else if (n.type === 'break') out += ' ';
  });
  return out.replace(/\s+/g, ' ').trim();
}

export function isBlock(node: AnyNode): node is BlockNode {
  return (
    node.type === 'heading' ||
    node.type === 'paragraph' ||
    node.type === 'equation' ||
    node.type === 'figure' ||
    node.type === 'table' ||
    node.type === 'codeBlock' ||
    node.type === 'diagram' ||
    node.type === 'list' ||
    node.type === 'blockquote' ||
    node.type === 'callout' ||
    node.type === 'thematicBreak' ||
    node.type === 'unknownBlock'
  );
}

export function isInline(node: AnyNode): node is InlineNode {
  return !isBlock(node) && node.type !== 'document' && node.type !== 'listItem';
}

export function emptyDocument(title = ''): DocumentNode {
  return {
    type: 'document',
    id: 'document-root',
    meta: {
      title,
      authors: [],
      abbreviations: [],
      keywords: [],
      language: 'vi',
      bibliography: [],
      extra: {},
    },
    children: [],
    labels: {},
    citationOrder: [],
    position: emptyPosition(),
  };
}

export const AST_SCHEMA_VERSION = '2.0.0';
