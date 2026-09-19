import type { DocumentNode } from '@scirender/ast';
import { plainText, walk } from '@scirender/ast';
import {
  formatPageNumber,
  normaliseHeadingTitle,
  type FrontSectionKind,
  type TemplateDescriptor,
} from '@scirender/template-engine';
import { escapeAttr, escapeHtml } from './escape.js';
import { anchorIdForLabel, inline } from './render-core.js';

export interface OutlineEntry {
  id: string;
  depth: number;
  href: string;
  /** Text as it should appear in the table of contents, number included. */
  text: string;
}

export interface ListEntry {
  id: string;
  href: string;
  /** "Hình 1.1" etc., already formatted. */
  label: string;
  text: string;
}

/** Everything the front matter needs that only exists after pagination. */
export interface FrontNumbers {
  /** nodeId -> body page number (1-based, arabic flow). */
  bodyPageOf: Record<string, number>;
  /** front section kind -> front page number (1-based, roman flow). */
  frontPageOf: Partial<Record<FrontSectionKind, number>>;
  /** Page carrying the "TÀI LIỆU THAM KHẢO" heading. */
  referencesPage?: number;
}

export function collectOutline(doc: DocumentNode, t: TemplateDescriptor): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  walk(doc, (n) => {
    if (n.type !== 'heading') return undefined;
    if (n.depth > Math.min(t.headings.numberDepth, 3)) return undefined;
    const style = t.headings.levels[n.depth - 1];
    const numberText =
      n.number && style && style.numberFormat ? style.numberFormat.replace('{n}', n.number) : '';
    const title = normaliseHeadingTitle(
      plainText(n),
      n.number,
      n.depth,
      t.headings.numbering === 'decimal',
    );
    out.push({
      id: n.id,
      depth: n.depth,
      href: n.label ? anchorIdForLabel(n.label) : `sr-node-${n.id}`,
      text: numberText ? `${numberText}  ${title}` : title,
    });
    return undefined;
  });
  return out;
}

export function collectFigures(doc: DocumentNode, t: TemplateDescriptor): ListEntry[] {
  const out: ListEntry[] = [];
  walk(doc, (n) => {
    if (n.type === 'figure') {
      out.push({
        id: n.id,
        href: n.label ? anchorIdForLabel(n.label) : `sr-node-${n.id}`,
        label: `${t.labels.figure} ${n.number ?? ''}`.trim(),
        text: n.caption.length ? inline(n.caption, t) : escapeHtml(n.alt),
      });
    } else if (n.type === 'diagram' && n.caption.length) {
      out.push({
        id: n.id,
        href: n.label ? anchorIdForLabel(n.label) : `sr-node-${n.id}`,
        label: `${t.labels.diagram} ${n.number ?? ''}`.trim(),
        text: inline(n.caption, t),
      });
    }
    return undefined;
  });
  return out;
}

export function collectTables(doc: DocumentNode, t: TemplateDescriptor): ListEntry[] {
  const out: ListEntry[] = [];
  walk(doc, (n) => {
    if (n.type !== 'table') return undefined;
    out.push({
      id: n.id,
      href: n.label ? anchorIdForLabel(n.label) : `sr-node-${n.id}`,
      label: `${t.labels.table} ${n.number ?? ''}`.trim(),
      text: inline(n.caption, t),
    });
    return undefined;
  });
  return out;
}

export interface FrontInput {
  outline: OutlineEntry[];
  figures: ListEntry[];
  tables: ListEntry[];
  numbers: FrontNumbers;
}

/**
 * Builds the front-matter blocks.
 *
 * Page numbers inside the table of contents depend on pagination, and the table
 * of contents itself changes how many front pages there are — so the caller
 * runs this in a short fixed-point loop, passing better numbers each round.
 * With no numbers yet, entries simply print without a page column.
 */
export function renderFrontMatter(
  doc: DocumentNode,
  t: TemplateDescriptor,
  input: FrontInput,
): string[] {
  if (!t.frontMatter.enabled) return [];
  const blocks: string[] = [];

  for (const section of t.frontMatter.sections) {
    if (!section.enabled) continue;
    const html = renderSection(doc, t, section.kind, section.minItems, input);
    if (html) blocks.push(html);
  }
  return blocks;
}

function renderSection(
  doc: DocumentNode,
  t: TemplateDescriptor,
  kind: FrontSectionKind,
  minItems: number,
  input: FrontInput,
): string {
  const title = (label: string): string =>
    `<div id="front-${kind}" class="sr-front-title" data-sr-id="front-${kind}" data-sr-type="frontTitle" data-sr-break="page">${escapeHtml(
      label,
    )}</div>`;

  switch (kind) {
    case 'abstract': {
      if (!doc.meta.abstract) return '';
      return (
        title(t.labels.abstract) +
        paragraphs(doc.meta.abstract)
      );
    }
    case 'acknowledgement': {
      if (!doc.meta.acknowledgement) return '';
      return title(t.labels.acknowledgement) + paragraphs(doc.meta.acknowledgement);
    }
    case 'toc': {
      const rows: string[] = [];
      // Front lists that come after the table of contents appear inside it.
      for (const later of ['figureList', 'tableList', 'abbreviationList'] as FrontSectionKind[]) {
        const spec = t.frontMatter.sections.find((s) => s.kind === later);
        if (!spec?.enabled) continue;
        if (!sectionHasContent(doc, later, spec.minItems, input)) continue;
        rows.push(
          listRow(
            labelOf(t, later),
            pageText(input.numbers.frontPageOf[later], t.layout.frontPageNumbers),
            1,
            false,
            `front-${later}`,
          ),
        );
      }
      for (const entry of input.outline) {
        rows.push(
          listRow(
            entry.text,
            pageText(input.numbers.bodyPageOf[entry.id], t.layout.bodyPageNumbers),
            entry.depth,
            false,
            entry.href,
          ),
        );
      }
      if (doc.meta.bibliography.length) {
        rows.push(
          listRow(
            t.labels.references,
            pageText(input.numbers.referencesPage, t.layout.bodyPageNumbers),
            1,
            false,
            'body-references',
          ),
        );
      }
      if (!rows.length) return '';
      return title(t.labels.toc) + `<ul class="sr-list">${rows.join('')}</ul>`;
    }
    case 'figureList': {
      if (input.figures.length < minItems) return '';
      const rows = input.figures.map((f) =>
        listRow(
          `${escapeHtml(f.label)} ${f.text}`,
          pageText(input.numbers.bodyPageOf[f.id], t.layout.bodyPageNumbers),
          1,
          true,
          f.href,
        ),
      );
      return title(t.labels.figureList) + `<ul class="sr-list">${rows.join('')}</ul>`;
    }
    case 'tableList': {
      if (input.tables.length < minItems) return '';
      const rows = input.tables.map((f) =>
        listRow(
          `${escapeHtml(f.label)} ${f.text}`,
          pageText(input.numbers.bodyPageOf[f.id], t.layout.bodyPageNumbers),
          1,
          true,
          f.href,
        ),
      );
      return title(t.labels.tableList) + `<ul class="sr-list">${rows.join('')}</ul>`;
    }
    case 'abbreviationList': {
      const items = doc.meta.abbreviations;
      if (items.length < minItems) return '';
      const rows = items
        .map(
          (a) =>
            `<dt>${escapeHtml(a.term)}</dt><dd>${escapeHtml(a.meaning)}</dd>`,
        )
        .join('');
      return title(t.labels.abbreviationList) + `<dl class="sr-abbr">${rows}</dl>`;
    }
    default:
      return '';
  }
}

function sectionHasContent(
  doc: DocumentNode,
  kind: FrontSectionKind,
  minItems: number,
  input: FrontInput,
): boolean {
  switch (kind) {
    case 'figureList':
      return input.figures.length >= minItems;
    case 'tableList':
      return input.tables.length >= minItems;
    case 'abbreviationList':
      return doc.meta.abbreviations.length >= minItems;
    case 'abstract':
      return Boolean(doc.meta.abstract);
    case 'acknowledgement':
      return Boolean(doc.meta.acknowledgement);
    default:
      return true;
  }
}

function labelOf(t: TemplateDescriptor, kind: FrontSectionKind): string {
  switch (kind) {
    case 'figureList': return t.labels.figureList;
    case 'tableList': return t.labels.tableList;
    case 'abbreviationList': return t.labels.abbreviationList;
    case 'abstract': return t.labels.abstract;
    case 'acknowledgement': return t.labels.acknowledgement;
    case 'toc': return t.labels.toc;
    default: return '';
  }
}

function pageText(page: number | undefined, style: string): string {
  if (!page) return '';
  return formatPageNumber(page, style as Parameters<typeof formatPageNumber>[1]);
}

function listRow(text: string, page: string, depth: number, rawText = false, href?: string): string {
  const label = rawText ? text : escapeHtml(text);
  const linked = href ? `<a href="#${escapeAttr(href)}">${label}</a>` : label;
  return `<li class="sr-toc-${Math.min(4, depth)}"><span class="sr-list-row"><span class="sr-list-text">${linked}</span><span class="sr-list-fill"></span><span class="sr-list-page">${escapeAttr(
    page,
  )}</span></span></li>`;
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p class="sr-front-body">${escapeHtml(para).replace(/\n/g, ' ')}</p>`)
    .join('');
}
