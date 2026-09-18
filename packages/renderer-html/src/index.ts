import { walk, type DocumentNode } from '@scirender/ast';
import type { AssetMap } from '@scirender/figure-engine';
import type { TemplateDescriptor } from '@scirender/template-engine';
import { formatAPAReference, formatIEEEReference } from '@scirender/citation-engine';
import { renderCoverPages } from './cover.js';
import { escapeAttr, escapeHtml, safeUrl } from './escape.js';
import {
  collectFigures,
  collectOutline,
  collectTables,
  renderFrontMatter,
  type FrontInput,
  type ListEntry,
  type OutlineEntry,
} from './front.js';
import { inline, renderBlock } from './render-core.js';

export interface RenderOptions {
  template: TemplateDescriptor;
  assets?: AssetMap;
  /** Render the inline title block. Ignored when the template has a cover. */
  titleBlock?: boolean;
  /** Render the bibliography section at the end. Default true. */
  references?: boolean;
}

export interface RenderResult {
  /** Full-page cover blocks — one entry per printed page, never paginated. */
  coverPages: string[];
  /** The document body as a flat list of top-level block HTML strings. */
  blocks: string[];
  /** Headings for the table of contents. */
  outline: OutlineEntry[];
  figures: ListEntry[];
  tables: ListEntry[];
  /**
   * Footnote number -> the HTML of that note. The layout engine pulls each one
   * to the bottom of whichever page its reference lands on.
   */
  footnotes: Record<string, string>;
  /** Body blocks concatenated — convenient for a non-paginated preview. */
  html: string;
}

/**
 * AST -> HTML.
 *
 * P2 — a pure function of (document, template, assets). No clock, no
 * randomness, no DOM access. Every top-level block is emitted separately so the
 * layout engine can page them without re-parsing HTML (P4). Every element
 * carries `data-sr-id` and `data-sr-line` so the preview maps back to source.
 *
 * Front matter is NOT produced here: its page numbers depend on pagination.
 * Call `renderFrontMatter` afterwards with the numbers pagination reported.
 */
export function render(doc: DocumentNode, options: RenderOptions): RenderResult {
  const t = options.template;
  const assets = options.assets ?? {};
  const blocks: string[] = [];

  const coverPages = renderCoverPages(doc, t, assets);
  const wantsTitleBlock =
    options.titleBlock !== false && t.cover.layout === 'none' && !t.frontMatter.enabled;

  if (wantsTitleBlock) {
    const head = renderTitleBlock(doc, t);
    if (head) blocks.push(head);
  }

  let previousWasHeading = true;
  for (const node of doc.children) {
    blocks.push(renderBlock(node, t, assets, previousWasHeading));
    previousWasHeading = node.type === 'heading';
  }

  if (options.references !== false && doc.meta.bibliography.length) {
    blocks.push(...renderReferences(doc, t));
  }

  return {
    coverPages,
    blocks,
    outline: collectOutline(doc, t),
    figures: collectFigures(doc, t),
    tables: collectTables(doc, t),
    footnotes: renderFootnotes(doc, t),
    html: blocks.join('\n'),
  };
}

/* -------------------------------------------------------------- footnotes */

function renderFootnotes(doc: DocumentNode, t: TemplateDescriptor): Record<string, string> {
  if (!t.footnotes.enabled) return {};
  const out: Record<string, string> = {};
  for (const def of doc.footnotes) {
    if (def.number == null) continue;
    out[String(def.number)] =
      `<li class="sr-footnote" data-sr-fn-def="${def.number}" data-sr-id="${escapeAttr(def.id)}">` +
      `<span class="sr-footnote-mark">${def.number}</span>` +
      `<span class="sr-footnote-body">${inline(def.children, t)}</span></li>`;
  }
  return out;
}

/* ----------------------------------------------------------- title block */

function renderTitleBlock(doc: DocumentNode, t: TemplateDescriptor): string {
  const m = doc.meta;
  if (!m.title && !m.authors.length && !m.abstract) return '';
  // In a multi-column layout the title, abstract and keywords span the page.
  const span = t.page.columns > 1 ? ' data-sr-span="page"' : '';
  const parts: string[] = [
    `<header class="sr-titleblock" data-sr-id="title-block" data-sr-type="titleBlock"${span}>`,
  ];
  if (m.title) parts.push(`<div class="sr-title">${escapeHtml(m.title)}</div>`);
  if (m.subtitle) parts.push(`<div class="sr-subtitle">${escapeHtml(m.subtitle)}</div>`);

  if (m.authors.length) {
    const affiliations: string[] = [];
    const names = m.authors.map((a) => {
      let mark = '';
      if (a.affiliation) {
        let idx = affiliations.indexOf(a.affiliation);
        if (idx === -1) {
          affiliations.push(a.affiliation);
          idx = affiliations.length - 1;
        }
        mark = `<sup>${idx + 1}</sup>`;
      }
      const star = a.corresponding ? '<sup>*</sup>' : '';
      return `${escapeHtml(a.name)}${mark}${star}`;
    });
    parts.push(`<div class="sr-authors">${names.join(', ')}</div>`);
    if (affiliations.length) {
      parts.push(
        `<div class="sr-affiliations">${affiliations
          .map((a, i) => `<sup>${i + 1}</sup>${escapeHtml(a)}`)
          .join(' · ')}</div>`,
      );
    }
  }
  if (m.date) parts.push(`<div class="sr-date">${escapeHtml(m.date)}</div>`);
  parts.push('</header>');

  if (m.abstract) {
    parts.push(
      `<div class="sr-abstract" data-sr-id="abstract-block" data-sr-type="abstract"><span class="sr-abstract-label">${escapeHtml(
        t.labels.abstract,
      )}.</span>${escapeHtml(m.abstract).replace(/\n{2,}/g, '<br><br>')}</div>`,
    );
  }
  if (m.keywords.length) {
    parts.push(
      `<div class="sr-keywords" data-sr-id="keywords-block" data-sr-type="keywords"><span class="sr-keywords-label">${escapeHtml(
        t.labels.keywords,
      )}:</span>${escapeHtml(m.keywords.join(', '))}</div>`,
    );
  }
  return parts.join('\n');
}

/* ------------------------------------------------------------- references */

function renderReferences(doc: DocumentNode, t: TemplateDescriptor): string[] {
  const byKey = new Map(doc.meta.bibliography.map((b) => [b.key, b]));
  const authorYearStyle = t.citation.style === 'author-year';
  const firstCitation = new Map<string, string>();
  walk(doc, (node) => {
    if (node.type === 'citation') {
      node.keys.forEach((key, i) => {
        if (!firstCitation.has(key)) firstCitation.set(key, `sr-cite-${node.id}-${i}`);
      });
    }
    return undefined;
  });

  const ordered = authorYearStyle
    ? [...doc.meta.bibliography]
        .sort((a, b) =>
          `${a.authors ?? ''}|${a.year ?? ''}`.localeCompare(
            `${b.authors ?? ''}|${b.year ?? ''}`,
            'vi',
          ),
        )
        .map((b) => b.key)
    : [
        ...doc.citationOrder,
        ...doc.meta.bibliography.map((b) => b.key).filter((k) => !doc.citationOrder.includes(k)),
      ];

  const items = ordered
    .map((key, i) => {
      const e = byKey.get(key);
      if (!e) return '';
      const anchor = `sr-ref-${encodeURIComponent(key)}`;
      const back = firstCitation.get(key);
      let body: string;
      if (t.citation.references === 'ieee') {
        body = formatIEEEReference(e, i + 1);
      } else if (t.citation.references === 'apa') {
        body = formatAPAReference(e);
      } else {
        const bits: string[] = [];
        if (e.authors) bits.push(e.authors);
        if (e.year) bits.push(String(e.year));
        if (e.title) bits.push(e.title);
        if (e.source) bits.push(e.source);
        if (e.volume) bits.push(`vol. ${e.volume}`);
        if (e.pages) bits.push(`pp. ${e.pages}`);
        if (e.doi) bits.push(`doi: ${e.doi}`);
        body = bits.join('. ') + (bits.length ? '.' : '');
      }
      if (e.url && !e.doi) {
        const u = safeUrl(e.url);
        if (u) body += ` ${u}`;
      }
      const numberedPrefix = authorYearStyle || t.citation.references === 'ieee'
        ? ''
        : `<span class="sr-bibliography-item-label sr-reference-item-label">[${i + 1}]</span>`;
      const backLink = back
        ? `<a class="sr-reference-back" href="#${escapeAttr(back)}" title="Quay lại vị trí trích dẫn">↩</a>`
        : '';
      const contentClass = 'sr-bibliography-item-content sr-reference-item-content';
      return `<li id="${escapeAttr(anchor)}" class="sr-bibliography-item sr-reference-item${
        authorYearStyle ? ' sr-reference-hanging' : ''
      }">${numberedPrefix}<span class="${contentClass}">${escapeHtml(body)}${backLink}</span></li>`;
    })
    .filter(Boolean);

  if (!items.length) return [];
  const style = t.headings.levels[0];
  return [
    `<h1 id="body-references" data-sr-id="body-references" data-sr-type="heading"${
      style?.pageBreakBefore ? ' data-sr-break="page"' : ''
    }>${escapeHtml(t.labels.references)}</h1>`,
    `<ul class="sr-reference-list" data-sr-id="body-reference-list" data-sr-type="referenceList">${items.join(
      '',
    )}</ul>`,
  ];
}

export { escapeHtml, escapeAttr, safeUrl } from './escape.js';
export { inline, renderBlock, applyDiagramDirection } from './render-core.js';
export {
  renderFrontMatter,
  collectOutline,
  collectFigures,
  collectTables,
} from './front.js';
export type { FrontInput, FrontNumbers, ListEntry, OutlineEntry } from './front.js';
export { renderCoverPages } from './cover.js';
