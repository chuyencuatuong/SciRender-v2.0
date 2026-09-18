import type { BlockNode, InlineNode, TableCell } from '@scirender/ast';
import { renderMath } from '@scirender/equation-engine';
import { figureStyle, resolveFigureSrc, type AssetMap } from '@scirender/figure-engine';
import { alignStyle, evaluateTable, normaliseTable, plainCellText } from '@scirender/table-engine';
import { refWord, type TemplateDescriptor } from '@scirender/template-engine';
import { highlightCode } from './highlight.js';
import { escapeAttr, escapeHtml, safeUrl } from './escape.js';

export interface CoreOptions {
  template: TemplateDescriptor;
  assets: AssetMap;
}

function anchorIdForLabel(label: string): string {
  const clean = label.trim().replace(/[^A-Za-z0-9_.:-]+/g, '-');
  return clean ? clean.replace(':', '-') : '';
}

export function attrsOf(node: BlockNode): string {
  const label = 'label' in node && typeof node.label === 'string' ? node.label : '';
  const anchor = label ? anchorIdForLabel(label) : `sr-node-${node.id}`;
  const id = anchor ? ` id="${escapeAttr(anchor)}"` : '';
  return `${id} data-sr-id="${escapeAttr(node.id)}" data-sr-block-id="${escapeAttr(node.id)}" data-sr-line="${node.position.start.line}" data-sr-type="${node.type}"`;
}

export { anchorIdForLabel };

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
      const href = anchorIdForLabel(node.label);
      const target = href ? ` href="#${escapeAttr(href)}"` : '';
      return `<a class="sr-crossref" data-sr-ref="${escapeAttr(node.label)}"${target}>${
        word ? `${escapeHtml(word)}&nbsp;` : ''
      }${escapeHtml(num)}</a>`;
    }
    case 'citation': {
      const authorYearStyle = t.citation.style === 'author-year';
      const rendered = node.keys.map((key, i) => {
        const shown = authorYearStyle ? node.shortForms[i] : node.numbers[i];
        if (shown == null) {
          return `<span class="sr-unresolved" title="Không có trong danh mục tham khảo">${escapeHtml(key)}</span>`;
        }
        const anchor = `sr-ref-${encodeURIComponent(key)}`;
        const citeId = `sr-cite-${node.id}-${i}`;
        return `<a id="${escapeAttr(citeId)}" class="sr-citation-link" href="#${escapeAttr(anchor)}" title="Đi tới tài liệu tham khảo">${escapeHtml(String(shown))}</a>`;
      });
      const open = authorYearStyle ? '(' : t.citation.open;
      const close = authorYearStyle ? ')' : t.citation.close;
      return `<span class="sr-citation">${escapeHtml(open)}${rendered.join(
        authorYearStyle ? '; ' : ', ',
      )}${escapeHtml(close)}</span>`;
    }
    case 'footnoteRef': {
      if (node.number == null) {
        return `<sup class="sr-unresolved" title="Chưa có định nghĩa chú thích">[^${escapeHtml(
          node.label,
        )}]</sup>`;
      }
      // data-sr-fn is what the layout engine keys on to pull the right note
      // down to the foot of whichever page this reference ends up on.
      return `<sup class="sr-footnote-ref" data-sr-fn="${node.number}">${node.number}</sup>`;
    }
    case 'break':
      return '<br>';
    default:
      return '';
  }
}

/* --------------------------------------------------------------- captions */

export function captionHtml(
  word: string,
  number: string | null,
  text: string,
  t: TemplateDescriptor,
  above: boolean,
  extraClass = '',
): string {
  if (!text && !number) return '';
  const label = number
    ? `<span class="sr-caption-label">${escapeHtml(word)} ${escapeHtml(number)}${escapeHtml(
        t.captions.separator,
      )}</span>`
    : '';
  const baseCls = above ? 'sr-caption sr-caption-above' : 'sr-caption';
  const cls = extraClass ? `${baseCls} ${extraClass}` : baseCls;
  return `<figcaption class="${cls}">${label}${text}</figcaption>`;
}

/* ----------------------------------------------------------------- blocks */

const DIRECTION_RE = /^(\s*)(flowchart|graph)([ \t]+)(TB|TD|BT|RL|LR)\b/;

/**
 * Applies the template's default direction to a Mermaid source that does not
 * pin one, or a per-diagram `dir=` attribute that overrides it.
 *
 * P1: the AST keeps the author's original text. Only the copy handed to Mermaid
 * is rewritten, exactly like `table-engine` pads ragged rows for rendering only.
 */
export function applyDiagramDirection(source: string, direction: string): string {
  const m = DIRECTION_RE.exec(source);
  if (!m) return source;
  return source.replace(DIRECTION_RE, `$1$2$3${direction}`);
}

export function renderBlock(
  node: BlockNode,
  t: TemplateDescriptor,
  assets: AssetMap,
  afterHeading = false,
): string {
  switch (node.type) {
    case 'heading': {
      const style = t.headings.levels[node.depth - 1] ?? t.headings.levels[0];
      const numberText =
        node.number && style && style.numberFormat
          ? style.numberFormat.replace('{n}', node.number)
          : '';
      const num = numberText
        ? `<span class="sr-heading-number">${escapeHtml(numberText)}</span>`
        : '';
      const brk = style?.pageBreakBefore ? ' data-sr-break="page"' : '';
      return `<h${node.depth}${attrsOf(node)}${brk}>${num}${inline(node.children, t)}</h${node.depth}>`;
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
        ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(node.alt)}"${
            style ? ` style="${escapeAttr(style)}"` : ''
          }>`
        : `<div class="sr-unknown">Thiếu tài nguyên hình: ${escapeHtml(node.src)}</div>`;
      const cap = captionHtml(
        t.labels.figure,
        node.number,
        node.caption.length ? inline(node.caption, t) : escapeHtml(node.alt),
        t,
        false,
      );
      const body = t.captions.figurePosition === 'above' ? `${cap}${img}` : `${img}${cap}`;
      return `<figure${attrsOf(node)}>${body}</figure>`;
    }
    case 'table': {
      const norm = normaliseTable(node);
      const evaluated = evaluateTable(node);
      const decimalCols = new Set(
        (node.attrs?.['decimal-cols'] ?? '')
          .split(',')
          .map((v) => Number(v.trim()) - 1)
          .filter((v) => Number.isInteger(v) && v >= 0),
      );
      const head = `<thead><tr>${norm.header
        .map((c, i) => c.covered ? '' : cellHtml('th', c, decimalCols.has(i) ? 'decimal' : norm.align[i] ?? 'default', t))
        .join('')}</tr></thead>`;
      const body = `<tbody>${norm.rows
        .map(
          (r, ri) =>
            // A cell `covered` by a rowspan from above gets no <td> at all —
            // the spanning cell above already reaches down over this slot,
            // exactly as plain HTML rowspan requires. The alignment lookup
            // must stay keyed on the ORIGINAL column index, so it is read
            // before filtering, not after (a filtered index would drift left
            // by one for every merged column to its left).
            `<tr>${r
              .map((c, i) =>
                c.covered
                  ? ''
                  : cellHtml(
                      'td',
                      c,
                      decimalCols.has(i) ? 'decimal' : norm.align[i] ?? 'default',
                      t,
                      evaluated.evaluations[ri]?.[i],
                      node.attrs?.['number-format'] ?? 'auto',
                    ),
              )
              .join('')}</tr>`,
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
      const landscape = node.attrs?.landscape === 'true' || node.attrs?.orientation === 'landscape' ? ' data-sr-landscape="1"' : '';
      return `<div class="sr-table-wrap"${attrsOf(node)}${landscape}>${inner}</div>`;
    }
    case 'codeBlock': {
      const lines = node.value.split('\n');
      const hl = t.code.highlight
        ? highlightCode(node.value, node.lang)
        : { html: escapeHtml(node.value), language: null };
      const codeClass = [
        node.lang ? `language-${escapeAttr(node.lang)}` : '',
        hl.language ? 'sr-hl' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const codeHtml = `<pre><code${codeClass ? ` class="${codeClass}"` : ''}>${
        hl.html
      }</code></pre>`;
      const withGutter = t.code.lineNumbers
        ? `<div class="sr-code-lines"><div class="sr-code-gutter">${lines
            .map((_, i) => i + 1)
            .join('\n')}</div>${codeHtml}</div>`
        : codeHtml;
      const cap = captionHtml(
        t.labels.listing,
        node.number,
        inline(node.caption, t),
        t,
        t.captions.listingPosition === 'above',
        'sr-code-caption',
      );
      const inner =
        t.captions.listingPosition === 'above' ? `${cap}${withGutter}` : `${withGutter}${cap}`;
      return `<div class="sr-code"${attrsOf(node)}>${inner}</div>`;
    }
    case 'diagram': {
      const direction = node.direction ?? t.diagrams.defaultDirection;
      const source = applyDiagramDirection(node.value, direction);
      // Marked auto when the author did not pin a direction: the renderer may
      // then try the perpendicular layout and keep whichever fits better.
      const auto = !node.direction && t.diagrams.autoDirection ? ' data-sr-mermaid-auto="1"' : '';
      const cap = node.caption.length
        ? captionHtml(t.labels.diagram, node.number, inline(node.caption, t), t, false)
        : '';
      const diagramAttrs = node.attrs ?? {};
      const attr = (key: string): string => diagramAttrs[key] ? ` data-sr-mermaid-${key}="${escapeAttr(diagramAttrs[key])}"` : '';
      const landscape = diagramAttrs.landscape === 'true' || diagramAttrs.orientation === 'landscape' ? ' data-sr-landscape="1"' : '';
      if (node.src) {
        const resolved = resolveFigureSrc(node.src, assets);
        const url = safeUrl(resolved.url);
        const img = url
          ? `<img class="sr-diagram-asset" src="${escapeAttr(url)}" alt="${escapeAttr(node.label ?? 'Sơ đồ kỹ thuật')}">`
          : `<div class="sr-unknown">Thiếu tài nguyên sơ đồ: ${escapeHtml(node.src)}</div>`;
        return `<div class="sr-diagram"${attrsOf(node)}${landscape}>${img}${cap}</div>`;
      }
      return `<div class="sr-diagram"${attrsOf(node)}${landscape}><div class="sr-mermaid"${auto}${attr('curve')}${attr('theme')} data-sr-mermaid="${escapeAttr(
        source,
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
      if (node.variant === 'landscape') {
        return `<div class="sr-landscape-block"${attrsOf(node)} data-sr-landscape="1">${node.children
          .map((c) => renderBlock(c, t, assets))
          .join('')}</div>`;
      }
      const title = node.title
        ? `<div class="sr-callout-title">${escapeHtml(node.title)}</div>`
        : '';
      return `<div class="sr-callout sr-callout-${escapeAttr(node.variant)}"${attrsOf(
        node,
      )}>${title}${node.children.map((c) => renderBlock(c, t, assets)).join('')}</div>`;
    }
    case 'columns': {
      // A row of blocks side by side. It is one unit as far as pagination is
      // concerned, which is why it never gets split.
      const cells = node.columns
        .map(
          (col) =>
            `<div class="sr-col">${col.map((c) => renderBlock(c, t, assets)).join('')}</div>`,
        )
        .join('');
      const landscape = node.landscape ? ' data-sr-landscape="1"' : '';
      return `<div class="sr-colrow" style="--sr-colrow:${node.columns.length}"${attrsOf(
        node,
      )}${landscape}>${cells}</div>`;
    }
    case 'thematicBreak':
      return `<hr${attrsOf(node)}>`;
    case 'pageBreak':
      // Zero-height on purpose (see .sr-doc [data-sr-type="pageBreak"] in the
      // template CSS) — it never occupies space itself. `data-sr-break="page"`
      // is the one thing that matters: it is the exact attribute `paginate()`
      // already honors for a chapter heading's forced break (P4: one
      // mechanism, not a parallel one just for this).
      return `<div${attrsOf(node)} data-sr-break="page" aria-hidden="true"></div>`;
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
  evaluated?: { value: number | null; display: string; formula: string | null; error: string | null },
  numberFormat = 'auto',
): string {
  const style = alignStyle(align);
  const span = cell.rowspan && cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '';
  const colspan = cell.colspan && cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
  const raw = plainCellText(cell.children);
  const isFormula = Boolean(evaluated?.formula);
  const display = evaluated && !evaluated.error && evaluated.value != null ? formatNumberDisplay(evaluated.value, evaluated.display, numberFormat) : null;
  const decimal = align === 'decimal' && display != null ? decimalHtml(display) : null;
  const renderedInline = inline(cell.children, t).replace(/&lt;br\s*\/?&gt;/gi, '<br/>');
  const content = decimal ?? (isFormula && evaluated ? escapeHtml(evaluated.display) : renderedInline);
  const title = isFormula && evaluated?.error ? ` title="${escapeAttr(evaluated.formula ?? raw)}"` : '';
  const cls = align === 'decimal' ? ' class="sr-decimal-cell"' : '';
  return `<${tag}${span}${colspan}${cls}${style ? ` style="${escapeAttr(style)}"` : ''}${title}>${content}</${tag}>`;
}

function formatNumberDisplay(value: number, fallback: string, format: string): string {
  if (!Number.isFinite(value) || format === 'auto') return fallback;
  if (!/^0\.(?:0{1,3})$/.test(format)) return fallback;
  const digits = format.length - 2;
  return value.toFixed(digits);
}

function decimalHtml(value: string): string {
  const text = value.trim().replace(',', '.');
  const m = /^([+-]?[0-9]+)(?:\.([0-9]+))?$/.exec(text);
  if (!m) return escapeHtml(value);
  const integer = m[1] ?? '';
  const fraction = m[2] ?? '';
  return `<span class="sr-decimal-wrap"><span class="sr-decimal-int">${escapeHtml(integer)}</span><span class="sr-decimal-sep">${fraction ? '.' : ''}</span><span class="sr-decimal-frac">${escapeHtml(fraction)}</span></span>`;
}
