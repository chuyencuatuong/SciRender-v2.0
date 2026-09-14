import type {
  BlockNode,
  DocumentNode,
  InlineNode,
  TableCell,
} from '@scirender/ast';
import { renderMath } from '@scirender/equation-engine';
import { figureStyle, resolveFigureSrc, type AssetMap } from '@scirender/figure-engine';
import { alignStyle, normaliseTable } from '@scirender/table-engine';
import { refWord, type TemplateDescriptor } from '@scirender/template-engine';
import { escapeAttr, escapeHtml, safeUrl } from './escape.js';

export interface RenderOptions {
  template: TemplateDescriptor;
  assets?: AssetMap;
  /** Render the title block (title, authors, abstract, keywords). Default true. */
  titleBlock?: boolean;
  /** Render the bibliography section at the end. Default true. */
  references?: boolean;
}

export interface RenderResult {
  /** The document body as a flat list of top-level block HTML strings. */
  blocks: string[];
  /** Everything concatenated — convenient for a non-paginated preview. */
  html: string;
}

/**
 * AST -> HTML.
 *
 * P2 — the renderer is a pure function of (document, template, assets). No
 * clock, no randomness, no DOM access. Every top-level block is emitted
 * separately so the layout engine can page them without re-parsing HTML (P4).
 * Every element carries `data-sr-id` and `data-sr-line` so the preview can be
 * mapped back to the source.
 */
export function render(doc: DocumentNode, options: RenderOptions): RenderResult {
  const t = options.template;
  const assets = options.assets ?? {};
  const blocks: string[] = [];

  if (options.titleBlock !== false) {
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

  return { blocks, html: blocks.join('\n') };
}

/* ----------------------------------------------------------- title block */

function renderTitleBlock(doc: DocumentNode, t: TemplateDescriptor): string {
  const m = doc.meta;
  if (!m.title && !m.authors.length && !m.abstract) return '';
  const parts: string[] = ['<header class="sr-titleblock" data-sr-block="title">'];
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
    const corresponding = m.authors.find((a) => a.corresponding && a.email);
    if (corresponding?.email) {
      parts.push(
        `<div class="sr-date"><sup>*</sup>Tác giả liên hệ: ${escapeHtml(corresponding.email)}</div>`,
      );
    }
  }
  if (m.date) parts.push(`<div class="sr-date">${escapeHtml(m.date)}</div>`);
  parts.push('</header>');

  if (m.abstract) {
    parts.push(
      `<div class="sr-abstract" data-sr-block="abstract"><span class="sr-abstract-label">${escapeHtml(
        t.labels.abstract,
      )}.</span>${escapeHtml(m.abstract).replace(/\n{2,}/g, '<br><br>')}</div>`,
    );
  }
  if (m.keywords.length) {
    parts.push(
      `<div class="sr-keywords" data-sr-block="keywords"><span class="sr-keywords-label">${escapeHtml(
        t.labels.keywords,
      )}:</span>${escapeHtml(m.keywords.join(', '))}</div>`,
    );
  }
  return parts.join('\n');
}

/* ----------------------------------------------------------------- blocks */

function attrsOf(node: BlockNode): string {
  return ` data-sr-id="${escapeAttr(node.id)}" data-sr-line="${node.position.start.line}" data-sr-type="${node.type}"`;
}

export function renderBlock(
  node: BlockNode,
  t: TemplateDescriptor,
  assets: AssetMap,
  afterHeading = false,
): string {
  switch (node.type) {
    case 'heading': {
      const num = node.number
        ? `<span class="sr-heading-number">${escapeHtml(node.number)}.</span>`
        : '';
      return `<h${node.depth}${attrsOf(node)}>${num}${inline(node.children, t)}</h${node.depth}>`;
    }
    case 'paragraph': {
      const cls = afterHeading ? ' class="sr-first-paragraph"' : '';
      return `<p${cls}${attrsOf(node)}>${inline(node.children, t)}</p>`;
    }
    case 'equation': {
      const math = renderMath(node.value, true);
      const number = node.number
        ? `<span class="sr-equation-number">(${escapeHtml(node.number)})</span>`
        : '<span class="sr-equation-number"></span>';
      return `<div class="sr-equation"${attrsOf(node)}><div class="sr-equation-body">${math.html}</div>${number}</div>`;
    }
    case 'figure': {
      const resolved = resolveFigureSrc(node.src, assets);
      const style = figureStyle(node.attrs);
      const src = safeUrl(resolved.url);
      const img = src
        ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(node.alt)}"${style ? ` style="${escapeAttr(style)}"` : ''}>`
        : `<div class="sr-unknown">Thiếu tài nguyên hình: ${escapeHtml(node.src)}</div>`;
      const cap = captionHtml(
        t.labels.figure,
        node.number,
        node.caption.length ? inline(node.caption, t) : escapeHtml(node.alt),
        t,
        false,
      );
      const body =
        t.captions.figurePosition === 'above' ? `${cap}${img}` : `${img}${cap}`;
      return `<figure${attrsOf(node)}>${body}</figure>`;
    }
    case 'table': {
      const norm = normaliseTable(node);
      const head = `<thead><tr>${norm.header
        .map((c, i) => cellHtml('th', c, norm.align[i] ?? 'default', t))
        .join('')}</tr></thead>`;
      const body = `<tbody>${norm.rows
        .map(
          (r) =>
            `<tr>${r.map((c, i) => cellHtml('td', c, norm.align[i] ?? 'default', t)).join('')}</tr>`,
        )
        .join('')}</tbody>`;
      const cap = captionHtml(
        t.labels.table,
        node.number,
        inline(node.caption, t),
        t,
        t.captions.tablePosition === 'above',
      );
      const table = `<table>${head}${body}</table>`;
      const inner = t.captions.tablePosition === 'above' ? `${cap}${table}` : `${table}${cap}`;
      return `<div class="sr-table-wrap"${attrsOf(node)}>${inner}</div>`;
    }
    case 'codeBlock':
      return `<pre${attrsOf(node)}><code${
        node.lang ? ` class="language-${escapeAttr(node.lang)}"` : ''
      }>${escapeHtml(node.value)}</code></pre>`;
    case 'diagram': {
      const cap = node.caption.length
        ? captionHtml(t.labels.diagram, node.number, inline(node.caption, t), t, false)
        : '';
      return `<div class="sr-diagram"${attrsOf(node)}><div class="sr-mermaid" data-sr-mermaid="${escapeAttr(
        node.value,
      )}"></div>${cap}</div>`;
    }
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const start = node.ordered && node.start !== 1 ? ` start="${node.start}"` : '';
      const items = node.items
        .map(
          (it) =>
            `<li data-sr-id="${escapeAttr(it.id)}" data-sr-line="${it.position.start.line}">${it.children
              .map((c) => renderBlock(c, t, assets))
              .join('')}</li>`,
        )
        .join('');
      return `<${tag}${start}${attrsOf(node)}>${items}</${tag}>`;
    }
    case 'blockquote':
      return `<blockquote${attrsOf(node)}>${node.children
        .map((c) => renderBlock(c, t, assets))
        .join('')}</blockquote>`;
    case 'callout': {
      const title = node.title
        ? `<div class="sr-callout-title">${escapeHtml(node.title)}</div>`
        : '';
      return `<div class="sr-callout sr-callout-${escapeAttr(node.variant)}"${attrsOf(
        node,
      )}>${title}${node.children.map((c) => renderBlock(c, t, assets)).join('')}</div>`;
    }
    case 'thematicBreak':
      return `<hr${attrsOf(node)}>`;
    case 'unknownBlock':
      return `<div class="sr-unknown"${attrsOf(node)}>${escapeHtml(node.reason)}\n${escapeHtml(
        node.raw,
      )}</div>`;
    default:
      return '';
  }
}

function cellHtml(
  tag: 'th' | 'td',
  cell: TableCell,
  align: Parameters<typeof alignStyle>[0],
  t: TemplateDescriptor,
): string {
  const style = alignStyle(align);
  return `<${tag}${style ? ` style="${escapeAttr(style)}"` : ''}>${inline(cell.children, t)}</${tag}>`;
}

function captionHtml(
  word: string,
  number: string | null,
  text: string,
  t: TemplateDescriptor,
  above: boolean,
): string {
  if (!text && !number) return '';
  const label = number
    ? `<span class="sr-caption-label">${escapeHtml(word)} ${escapeHtml(number)}${escapeHtml(
        t.captions.separator,
      )}</span>`
    : '';
  const cls = above ? 'sr-caption sr-caption-above' : 'sr-caption';
  return `<figcaption class="${cls}">${label}${text}</figcaption>`;
}

/* ----------------------------------------------------------------- inline */

export function inline(nodes: InlineNode[], t: TemplateDescriptor): string {
  return nodes.map((n) => inlineOne(n, t)).join('');
}

function inlineOne(node: InlineNode, t: TemplateDescriptor): string {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value);
    case 'strong':
      return `<strong>${inline(node.children, t)}</strong>`;
    case 'emphasis':
      return `<em>${inline(node.children, t)}</em>`;
    case 'superscript':
      return `<sup>${inline(node.children, t)}</sup>`;
    case 'subscript':
      return `<sub>${inline(node.children, t)}</sub>`;
    case 'inlineCode':
      return `<code>${escapeHtml(node.value)}</code>`;
    case 'inlineMath':
      return renderMath(node.value, false).html;
    case 'link': {
      const url = safeUrl(node.url);
      const text = inline(node.children, t);
      if (!url) return text;
      return `<a href="${escapeAttr(url)}"${
        node.title ? ` title="${escapeAttr(node.title)}"` : ''
      } rel="noreferrer noopener">${text}</a>`;
    }
    case 'crossRef': {
      if (!node.resolved) {
        return `<span class="sr-unresolved" title="Không tìm thấy nhãn">@${escapeHtml(node.label)}</span>`;
      }
      const word = refWord(node.resolved.kind, t);
      const num =
        node.resolved.kind === 'eq' ? `(${node.resolved.number})` : node.resolved.number;
      return `<span class="sr-crossref" data-sr-ref="${escapeAttr(node.label)}">${
        word ? `${escapeHtml(word)}&nbsp;` : ''
      }${escapeHtml(num)}</span>`;
    }
    case 'citation': {
      const rendered = node.keys.map((key, i) => {
        const n = node.numbers[i];
        if (n == null) {
          return `<span class="sr-unresolved" title="Không có trong danh mục tham khảo">${escapeHtml(key)}</span>`;
        }
        return String(n);
      });
      const { open, close } = t.citation;
      return `<span class="sr-citation">${escapeHtml(open)}${rendered.join(', ')}${escapeHtml(
        close,
      )}</span>`;
    }
    case 'break':
      return '<br>';
    default:
      return '';
  }
}

/* ------------------------------------------------------------- references */

function renderReferences(doc: DocumentNode, t: TemplateDescriptor): string[] {
  const byKey = new Map(doc.meta.bibliography.map((b) => [b.key, b]));
  const ordered = [
    ...doc.citationOrder,
    ...doc.meta.bibliography.map((b) => b.key).filter((k) => !doc.citationOrder.includes(k)),
  ];
  const items = ordered
    .map((key, i) => {
      const e = byKey.get(key);
      if (!e) return '';
      const bits: string[] = [];
      if (e.authors) bits.push(escapeHtml(e.authors));
      if (e.year) bits.push(`(${escapeHtml(String(e.year))})`);
      if (e.title) bits.push(`<em>${escapeHtml(e.title)}</em>`);
      if (e.source) bits.push(escapeHtml(e.source));
      if (e.volume) bits.push(`vol. ${escapeHtml(e.volume)}`);
      if (e.pages) bits.push(`tr. ${escapeHtml(e.pages)}`);
      if (e.doi) bits.push(`DOI: ${escapeHtml(e.doi)}`);
      else if (e.url) {
        const u = safeUrl(e.url);
        if (u) bits.push(`<a href="${escapeAttr(u)}" rel="noreferrer noopener">${escapeHtml(u)}</a>`);
      }
      return `<li class="sr-reference-item"><span>[${i + 1}]</span><span>${bits.join(
        '. ',
      )}.</span></li>`;
    })
    .filter(Boolean);

  if (!items.length) return [];
  return [
    `<h1 class="sr-references-heading" data-sr-block="references">${escapeHtml(
      t.labels.references,
    )}</h1>`,
    `<ul class="sr-reference-list" data-sr-block="reference-list">${items.join('')}</ul>`,
  ];
}

export { escapeHtml, escapeAttr, safeUrl } from './escape.js';
