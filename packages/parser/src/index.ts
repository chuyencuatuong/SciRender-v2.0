import type { Diagnostic, DocumentNode } from '@scirender/ast';
import { emptyDocument, sortDiagnostics } from '@scirender/ast';
import { parseFrontMatter } from './frontmatter.js';
import { parseBlocks, toLines, type BlockParseState } from './blocks.js';

export { TABLE_HORIZONTAL_MERGE_MARKER, TABLE_MERGE_MARKER } from './blocks.js';

export interface ParseResult {
  document: DocumentNode;
  diagnostics: Diagnostic[];
}

export interface ParseOptions {
  /** Normalise CRLF before parsing so positions stay stable across platforms. */
  normaliseNewlines?: boolean;
}

/**
 * Scientific Markdown -> Document AST.
 *
 * P2 (Deterministic): the parser has no clock, no randomness and no I/O.
 * P1 (Content Integrity): text, TeX and code are carried through verbatim;
 *     the parser never rewrites the author's content, it only structures it.
 */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const src = options.normaliseNewlines === false ? source : source.replace(/\r\n?/g, '\n');
  const fm = parseFrontMatter(src);
  const doc: DocumentNode = emptyDocument();
  doc.meta = fm.meta;

  const body = src.slice(fm.bodyOffset);
  const state: BlockParseState = { diagnostics: [], ordinal: { n: 0 }, footnotes: [] };
  const lines = toLines(body, fm.bodyLine, fm.bodyOffset);
  doc.children = parseBlocks(lines, state);
  doc.footnotes = state.footnotes ?? [];

  const lastLine = lines.length ? (lines[lines.length - 1] as { line: number; text: string }) : null;
  doc.position = {
    start: { line: 1, column: 1, offset: 0 },
    end: {
      line: lastLine ? lastLine.line : 1,
      column: lastLine ? lastLine.text.length + 1 : 1,
      offset: src.length,
    },
  };

  // A document with no explicit `title:` may still start with a level-1 heading.
  if (!doc.meta.title) {
    const firstHeading = doc.children.find((n) => n.type === 'heading' && n.depth === 1);
    if (firstHeading && firstHeading.type === 'heading') {
      doc.meta.title = firstHeading.children
        .map((c) => (c.type === 'text' ? c.value : ''))
        .join('')
        .trim();
    }
  }

  return {
    document: doc,
    diagnostics: sortDiagnostics([...fm.diagnostics, ...state.diagnostics]),
  };
}

export { parseInline } from './inline.js';
export { parseFrontMatter } from './frontmatter.js';
export { extractTrailingAttrs, parseAttrBody } from './attrs.js';
export type { AttrSpec } from './attrs.js';
