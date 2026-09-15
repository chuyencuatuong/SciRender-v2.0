import type { Diagnostic, DocumentNode } from '@scirender/ast';
import { sortDiagnostics } from '@scirender/ast';
import type { AssetMap } from '@scirender/figure-engine';
import { analyse, type HealthReport } from '@scirender/intelligence';
import { parse } from '@scirender/parser';
import {
  collectFigures,
  collectOutline,
  collectTables,
  render,
  type ListEntry,
  type OutlineEntry,
} from '@scirender/renderer-html';
import {
  assignNumbers,
  findTemplate,
  resolveTemplate,
  type ResolvedTemplate,
  type TemplateOverrides,
} from '@scirender/template-engine';
import { validate } from '@scirender/validator';

export interface CompileInput {
  source: string;
  templateId: string;
  overrides: TemplateOverrides;
  assets: AssetMap;
}

export interface StageTiming {
  stage: string;
  ms: number;
}

export interface CompileResult {
  document: DocumentNode;
  template: ResolvedTemplate;
  diagnostics: Diagnostic[];
  health: HealthReport;
  /** Full-page cover blocks, already final — never paginated. */
  coverPages: string[];
  /** Body blocks, ready for the layout engine. */
  blocks: string[];
  outline: OutlineEntry[];
  figures: ListEntry[];
  tables: ListEntry[];
  /** Footnote number -> its HTML, handed to the layout engine. */
  footnotes: Record<string, string>;
  timings: StageTiming[];
  /** Input hash — identical inputs produce an identical hash and result (P2). */
  signature: string;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The SciRender compiler.
 *
 * Content -> Parser -> AST -> Template -> Numbering -> Validation ->
 * Intelligence -> Renderer. Each stage consumes the stage before it and nothing
 * else (P4).
 *
 * Neither pagination nor the front matter is produced here: both need a live
 * DOM (the table of contents needs page numbers, which only pagination knows).
 * See `useRender`.
 */
export function compile(input: CompileInput): CompileResult {
  const timings: StageTiming[] = [];
  const step = <T,>(stage: string, fn: () => T): T => {
    const t0 = now();
    const value = fn();
    timings.push({ stage, ms: Math.round((now() - t0) * 100) / 100 });
    return value;
  };

  const parsed = step('parser', () => parse(input.source));
  const document = parsed.document;

  const template = step('template', () => {
    const base = findTemplate(document.meta.templateId ?? input.templateId);
    return resolveTemplate(base, input.overrides);
  });

  const numbering = step('numbering', () => assignNumbers(document, template.descriptor));
  const validation = step('validator', () =>
    validate(document, {
      assets: input.assets,
      // Formats built around a cover page list their keywords on the cover or
      // not at all, so the reminder would be noise there.
      requireKeywords: template.descriptor.cover.layout === 'none',
    }),
  );

  const diagnostics = sortDiagnostics([
    ...parsed.diagnostics,
    ...numbering.diagnostics,
    ...validation,
  ]);

  const health = step('intelligence', () => analyse(document, diagnostics));

  const rendered = step('renderer', () =>
    render(document, { template: template.descriptor, assets: input.assets }),
  );

  return {
    document,
    template,
    diagnostics: dedupe(diagnostics),
    health,
    coverPages: rendered.coverPages,
    blocks: rendered.blocks,
    outline: rendered.outline.length
      ? rendered.outline
      : collectOutline(document, template.descriptor),
    figures: rendered.figures.length
      ? rendered.figures
      : collectFigures(document, template.descriptor),
    tables: rendered.tables.length
      ? rendered.tables
      : collectTables(document, template.descriptor),
    footnotes: rendered.footnotes,
    timings,
    signature: signatureOf(input),
  };
}

/** The same rule can be raised by two stages; keep the first occurrence only. */
function dedupe(list: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const d of list) {
    const key = `${d.code}|${d.position.start.line}|${d.position.start.column}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

export function signatureOf(input: CompileInput): string {
  const payload = [
    input.source,
    input.templateId,
    JSON.stringify(input.overrides),
    Object.keys(input.assets).sort().join(','),
  ].join('\u0000');
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
