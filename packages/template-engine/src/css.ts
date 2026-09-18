import type { TemplateDescriptor } from './types.js';
import { toPx } from './units.js';

/**
 * Compiles a template descriptor into a deterministic stylesheet.
 *
 * All document rules are scoped under `.sr-doc` so that the application shell
 * (Tailwind preflight included) can never leak into the rendered document, and
 * so the same descriptor yields byte-identical CSS on every run (P2).
 *
 * Word's "Spacing Before / After" maps onto `margin-top` / `margin-bottom`.
 * CSS collapses adjacent margins to their maximum, which matches Word for the
 * one-sided spacing that university formats use (before N, after 0).
 */
export function compileCss(t: TemplateDescriptor): string {
  const p = t.page;
  const ty = t.typography;
  const c = t.captions;
  const col = t.colors;
  const code = t.code;
  const fn = t.footnotes;
  const fm = t.frontMatter;
  const bodyPx = toPx(ty.bodySize, 17.333);
  const linePx = bodyPx * ty.lineHeight;

  const headingRules = t.headings.levels
    .map((h, idx) => {
      const level = idx + 1;
      return `.sr-doc h${level}{
  font-family:var(--sr-heading-font);
  font-size:${h.size};
  font-weight:${h.weight};
  font-style:${h.italic ? 'italic' : 'normal'};
  line-height:${round(h.lineHeight)};
  margin:${h.spaceBefore} 0 ${h.spaceAfter};
  text-align:${h.align};
  text-indent:${h.indent};
  ${h.uppercase ? 'text-transform:uppercase;' : ''}
}
.sr-doc h${level} .sr-heading-number{margin-right:${h.numberGap};}`;
    })
    .join('\n');

  return `:root{
  --sr-page-width:${p.width};
  --sr-page-height:${p.height};
  --sr-margin-top:${p.margin.top};
  --sr-margin-right:${p.margin.right};
  --sr-margin-bottom:${p.margin.bottom};
  --sr-margin-left:${p.margin.left};
  --sr-footer-bottom:${p.footerFromBottom};
  --sr-body-font:${ty.bodyFont};
  --sr-heading-font:${ty.headingFont};
  --sr-mono-font:${ty.monoFont};
  --sr-body-size:${ty.bodySize};
  --sr-line-height:${ty.lineHeight};
  --sr-line-px:${round(linePx)}px;
  --sr-text:${col.text};
  --sr-muted:${col.muted};
  --sr-rule:${col.rule};
  --sr-accent:${col.accent};
  --sr-table-head-bg:${col.tableHeaderBg};
  --sr-code-bg:${col.codeBg};
  --sr-caption-size:${c.fontSize};
}

/* ---------------------------------------------------------------- page box */
.sr-page{
  position:relative;
  width:var(--sr-page-width);
  height:var(--sr-page-height);
  background:#fff;
  color:var(--sr-text);
  box-sizing:border-box;
  padding:var(--sr-margin-top) var(--sr-margin-right) var(--sr-margin-bottom) var(--sr-margin-left);
  overflow:hidden;
}
/* Columns are produced by the layout engine, not by CSS column-count: the
   engine fills one column at a time so a break can be measured and controlled.
   The page body only lays the finished columns out side by side. */
.sr-page-body{height:100%;overflow:hidden;position:relative;}
.sr-page-landscape{width:${p.height};height:${p.width};page:landscape-page;}
.sr-page-landscape .sr-page-body{height:100%;}
.sr-columns{
  display:grid;
  grid-template-columns:repeat(var(--sr-columns,${p.columns}),1fr);
  gap:0 ${p.columnGap};
  height:100%;
}
.sr-column{position:relative;overflow:hidden;}
.sr-span{width:100%;display:flow-root;}
.sr-page-body:has(> .sr-span) .sr-columns{height:auto;}
.sr-page-footer{
  position:absolute;left:var(--sr-margin-left);right:var(--sr-margin-right);
  bottom:var(--sr-footer-bottom);
  font-family:var(--sr-body-font);font-size:var(--sr-body-size);color:var(--sr-text);
  line-height:1;
  text-align:${t.layout.pageNumberPosition === 'footer-right' ? 'right' : 'center'};
  ${t.layout.showPageNumbers && t.layout.pageNumberPosition !== 'none' ? '' : 'display:none;'}
}

/* ------------------------------------------------------------------- body */
.sr-doc{
  font-family:var(--sr-body-font);
  font-size:var(--sr-body-size);
  line-height:var(--sr-line-height);
  color:var(--sr-text);
  text-align:${ty.justify ? 'justify' : 'left'};
  hyphens:${ty.hyphenate ? 'auto' : 'manual'};
  word-break:normal;
  overflow-wrap:break-word;
}
.sr-doc p{margin:${ty.spaceBefore} 0 ${ty.spaceAfter};text-indent:${ty.paragraphIndent};}
.sr-doc p.sr-first-paragraph{text-indent:0;}
${headingRules}
.sr-doc h1:first-child,.sr-doc h2:first-child,.sr-doc h3:first-child{margin-top:0;}

/* ------------------------------------------------------------ cover pages */
.sr-doc .sr-cover{
  display:flex;flex-direction:column;align-items:center;text-align:center;
  height:100%;font-family:var(--sr-heading-font);text-indent:0;
}
.sr-doc .sr-cover *{text-align:center;text-indent:0;}
.sr-doc .sr-cover-org{font-size:16pt;font-weight:700;line-height:1.35;text-transform:uppercase;}
.sr-doc .sr-cover-logo{margin:10mm 0 0;height:${t.cover.logoHeight};}
.sr-doc .sr-cover-logo img{height:100%;width:auto;display:block;}
.sr-doc .sr-cover-type{font-size:18pt;font-weight:700;margin-top:18mm;text-transform:uppercase;}
.sr-doc .sr-cover-title{font-size:21pt;font-weight:700;margin-top:16mm;line-height:1.3;text-transform:uppercase;}
.sr-doc .sr-cover-course{font-size:14pt;font-weight:700;margin-top:6mm;}
.sr-doc .sr-cover-meta{font-size:16pt;font-weight:700;margin-top:20mm;line-height:1.6;}
.sr-doc .sr-cover-advisor{font-size:16pt;font-weight:700;margin-top:4mm;}
.sr-doc .sr-cover-members{
  margin-top:16mm;font-size:13pt;font-weight:700;
  display:grid;grid-template-columns:auto auto;gap:2mm 8mm;justify-content:center;
}
.sr-doc .sr-cover-members span{text-align:left !important;}
.sr-doc .sr-cover-group{font-size:14pt;font-weight:700;margin-top:14mm;}
.sr-doc .sr-cover-place{font-size:13pt;font-weight:700;margin-top:auto;padding-bottom:4mm;}

/* ------------------------------------------------------------ front matter */
.sr-doc .sr-front-title{
  font-family:var(--sr-heading-font);
  font-size:${fm.titleSize};
  font-weight:700;
  text-align:${fm.titleAlign};
  text-indent:0;
  margin:0 0 12pt;
  line-height:1.3;
  ${fm.titleUppercase ? 'text-transform:uppercase;' : ''}
}
.sr-doc .sr-front-body{text-align:justify;}
.sr-doc .sr-list{list-style:none;margin:0;padding:0;line-height:${round(fm.listLineHeight)};text-align:left;}
.sr-doc .sr-list li{margin:0 0 6pt;text-indent:0;}
.sr-doc .sr-list-row{display:flex;align-items:baseline;gap:0;}
.sr-doc .sr-list-text{flex:0 1 auto;}
.sr-doc .sr-list-fill{
  flex:1 1 auto;min-width:1.5em;margin:0 .35em;
  border-bottom:${fm.leaders ? '1px dotted var(--sr-text)' : '0'};
  transform:translateY(-0.28em);
}
.sr-doc .sr-list-page{flex:0 0 auto;font-variant-numeric:tabular-nums;}
.sr-doc .sr-toc-1{font-weight:400;}
.sr-doc .sr-toc-2{padding-left:1.2em;}
.sr-doc .sr-toc-3{padding-left:2.4em;}
.sr-doc .sr-toc-4{padding-left:3.6em;}
.sr-doc .sr-abbr{display:grid;grid-template-columns:auto 1fr;gap:6pt 1.2em;text-align:left;}
.sr-doc .sr-abbr dt{font-weight:400;}
.sr-doc .sr-abbr dd{margin:0;}

/* ------------------------------------------------------------ title block */
.sr-doc .sr-titleblock{text-align:center;margin:0 0 1.4em;}
.sr-doc .sr-title{font-family:var(--sr-heading-font);font-size:1.7em;font-weight:700;line-height:1.25;margin:0 0 .3em;text-align:center;}
.sr-doc .sr-subtitle{font-size:1.05em;color:var(--sr-muted);margin:0 0 .6em;text-align:center;}
.sr-doc .sr-authors{font-size:.95em;margin:0 0 .25em;text-align:center;}
.sr-doc .sr-affiliations{font-size:.85em;color:var(--sr-muted);margin:0;text-align:center;}
.sr-doc .sr-date{font-size:.85em;color:var(--sr-muted);margin:.4em 0 0;text-align:center;}
.sr-doc .sr-abstract{margin:1.1em 0;font-size:1em;text-align:justify;}
.sr-doc .sr-abstract-label,.sr-doc .sr-keywords-label{font-weight:700;margin-right:.4em;}
.sr-doc .sr-keywords{margin:0 0 1em;text-align:left;}

/* ---------------------------------------------------------------- figures */
.sr-doc figure{margin:12pt 0;text-align:center;break-inside:avoid;page-break-inside:avoid;}
/* A figure is never cut in half — so an oversized one is capped at the text
   block instead, leaving room for its caption. Without this an image taller
   than the page simply ran off the bottom. */
.sr-doc figure img{
  max-width:100%;
  max-height:calc(var(--sr-page-height) - var(--sr-margin-top) - var(--sr-margin-bottom) - 5.5em);
  height:auto;width:auto;display:block;margin:0 auto;object-fit:contain;
}
.sr-doc .sr-diagram svg{
  max-height:calc(var(--sr-page-height) - var(--sr-margin-top) - var(--sr-margin-bottom) - 5.5em);
}
.sr-doc figcaption,.sr-doc .sr-caption{
  font-family:var(--sr-body-font);
  font-size:var(--sr-caption-size);
  color:var(--sr-text);
  text-align:${c.align};
  line-height:1;
  margin:6pt 0 0;
  ${c.italic ? 'font-style:italic;' : ''}
  ${c.bold ? 'font-weight:700;' : ''}
  text-indent:0;
}
.sr-doc .sr-caption-above{margin:0 0 6pt;}
.sr-doc .sr-caption-label{font-weight:${c.bold ? 700 : 400};}

/* ----------------------------------------------------------------- tables */
.sr-doc table{border-collapse:collapse;width:100%;margin:0;break-inside:avoid;page-break-inside:avoid;}
.sr-doc .sr-table-wrap{margin:12pt 0;break-inside:avoid;page-break-inside:avoid;}
.sr-doc th,.sr-doc td{border:1px solid var(--sr-rule);padding:3pt 5pt;vertical-align:top;text-align:left;text-indent:0;line-height:1.2;}
.sr-doc .sr-decimal-cell{text-align:right;font-variant-numeric:tabular-nums;}
.sr-doc .sr-decimal-wrap{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,auto);width:100%;font-variant-numeric:tabular-nums;}
.sr-doc .sr-decimal-int{text-align:right;}
.sr-doc .sr-decimal-sep{text-align:center;}
.sr-doc .sr-decimal-frac{text-align:left;}
.sr-doc thead th{background:var(--sr-table-head-bg);font-weight:700;}

/* -------------------------------------------------------------- equations */
.sr-doc .sr-equation{
  display:grid;grid-template-columns:1fr auto;align-items:center;
  gap:1em;margin:10pt 0;break-inside:avoid;page-break-inside:avoid;text-indent:0;
}
.sr-doc .sr-equation-body{overflow-x:auto;overflow-y:hidden;text-align:center;}
.sr-doc .sr-equation-number{font-variant-numeric:tabular-nums;white-space:nowrap;}
.sr-doc .sr-math-error{
  display:inline-block;background:#fdecec;color:#9b1c1c;border:1px dashed #e88;
  padding:0 .3em;border-radius:3px;font-family:var(--sr-mono-font);font-size:.85em;
}

/* ------------------------------------------------------------------ lists */
.sr-doc ul,.sr-doc ol{margin:${ty.spaceBefore} 0 ${ty.spaceAfter};padding-left:1.7em;text-indent:0;list-style-position:outside;}
.sr-doc ul{list-style-type:disc;}
.sr-doc ol{list-style-type:decimal;}
.sr-doc ul ul{list-style-type:circle;}
.sr-doc ul ul ul{list-style-type:square;}
.sr-doc ol ol{list-style-type:lower-alpha;}
.sr-doc li{margin:.15em 0;}
.sr-doc li > p{margin:0 0 .25em;text-indent:0;}
.sr-doc li::marker{color:var(--sr-text);}

/* ------------------------------------------------------------------- code */
.sr-doc .sr-code{margin:10pt 0;break-inside:avoid;page-break-inside:avoid;text-indent:0;}
.sr-doc pre{
  ${code.background ? 'background:var(--sr-code-bg);' : 'background:none;'}
  ${code.border ? 'border:1px solid var(--sr-rule);' : 'border:0;'}
  padding:${code.border ? '6pt 8pt' : '0'};
  margin:0;
  overflow-x:${code.wrap ? 'visible' : 'auto'};
  font-family:var(--sr-mono-font);
  font-size:${code.fontSize};
  line-height:1.35;
  text-align:left;text-indent:0;
  white-space:${code.wrap ? 'pre-wrap' : 'pre'};
  ${code.wrap ? 'overflow-wrap:break-word;word-break:break-word;' : ''}
  tab-size:2;
}
.sr-doc .sr-code-lines{display:grid;grid-template-columns:auto 1fr;gap:0 8pt;}
.sr-doc .sr-code-gutter{
  font-family:var(--sr-mono-font);font-size:${code.fontSize};line-height:1.35;
  text-align:right;color:var(--sr-muted);user-select:none;white-space:pre;
  border-right:1px solid var(--sr-rule);padding-right:6pt;
}
.sr-doc code{font-family:var(--sr-mono-font);font-size:.9em;}
.sr-doc pre code{font-size:1em;}
${
  code.highlight
    ? `
/* Token colours. Chosen so the block still reads when the report is printed in
   black and white: each class lands on a clearly different grey. */
.sr-doc pre code.sr-hl .sr-hl-comment,
.sr-doc pre code.sr-hl .sr-hl-quote{color:#5b6472;font-style:italic;}
.sr-doc pre code.sr-hl .sr-hl-keyword,
.sr-doc pre code.sr-hl .sr-hl-selector-tag,
.sr-doc pre code.sr-hl .sr-hl-literal,
.sr-doc pre code.sr-hl .sr-hl-doctag{color:#0b2c7f;font-weight:600;}
.sr-doc pre code.sr-hl .sr-hl-string,
.sr-doc pre code.sr-hl .sr-hl-regexp,
.sr-doc pre code.sr-hl .sr-hl-addition{color:#a3161a;}
.sr-doc pre code.sr-hl .sr-hl-number,
.sr-doc pre code.sr-hl .sr-hl-symbol,
.sr-doc pre code.sr-hl .sr-hl-bullet{color:#0a6b4a;}
.sr-doc pre code.sr-hl .sr-hl-title,
.sr-doc pre code.sr-hl .sr-hl-title.function_,
.sr-doc pre code.sr-hl .sr-hl-section{color:#5b2d8e;font-weight:600;}
.sr-doc pre code.sr-hl .sr-hl-built_in,
.sr-doc pre code.sr-hl .sr-hl-type,
.sr-doc pre code.sr-hl .sr-hl-class .sr-hl-title{color:#0f6b73;}
.sr-doc pre code.sr-hl .sr-hl-attr,
.sr-doc pre code.sr-hl .sr-hl-attribute,
.sr-doc pre code.sr-hl .sr-hl-property,
.sr-doc pre code.sr-hl .sr-hl-variable,
.sr-doc pre code.sr-hl .sr-hl-params{color:#7a4a00;}
.sr-doc pre code.sr-hl .sr-hl-meta,
.sr-doc pre code.sr-hl .sr-hl-meta .sr-hl-keyword{color:#7a3fa8;}
.sr-doc pre code.sr-hl .sr-hl-deletion{color:#a3161a;text-decoration:line-through;}
.sr-doc pre code.sr-hl .sr-hl-emphasis{font-style:italic;}
.sr-doc pre code.sr-hl .sr-hl-strong{font-weight:700;}
`
    : ''
}
.sr-doc .sr-code-lang{
  font-family:var(--sr-body-font);font-size:.85em;color:var(--sr-muted);
  text-align:left;text-indent:0;margin:0 0 3pt;
}

/* --------------------------------------------------- quotes & callouts */
.sr-doc blockquote{
  margin:10pt 0;padding:.2em 0 .2em 1em;border-left:3px solid var(--sr-rule);
  text-indent:0;
}
.sr-doc .sr-callout{
  margin:10pt 0;padding:6pt 8pt;border:1px solid var(--sr-rule);
  text-indent:0;break-inside:avoid;
}
.sr-doc .sr-callout-title{font-weight:700;margin:0 0 .3em;}
.sr-doc hr{border:0;border-top:1px solid var(--sr-rule);margin:12pt 0;}
/* A manual page break carries no ink of its own — it only ever tells
   paginate() (via data-sr-break="page") to start a fresh page before it. */
.sr-doc [data-sr-type="pageBreak"]{display:none;margin:0;padding:0;}

/* ------------------------------------------------- side-by-side block row */
.sr-doc .sr-colrow{
  display:grid;grid-template-columns:repeat(var(--sr-colrow,2),1fr);
  gap:0 ${p.columnGap};margin:10pt 0;text-indent:0;
  break-inside:avoid;page-break-inside:avoid;
}
.sr-doc .sr-colrow .sr-col > :first-child{margin-top:0;}
.sr-doc .sr-colrow .sr-col > :last-child{margin-bottom:0;}

/* -------------------------------------------------- references & crossrefs */
.sr-doc .sr-reference-list{
  display:block;
  width:100%;
  max-width:100%;
  list-style:none;
  padding-left:0;
  margin:0;
}
/* Keep bibliography entries to exactly two grid columns. The content
   column must be min-width:0 so long unbroken tokens cannot force an
   implicit grid column and collapse the text width. */
.sr-doc .sr-bibliography-item,.sr-doc .sr-reference-item{
  display:grid;
  grid-template-columns:2.5rem minmax(0,1fr);
  column-gap:.5rem;
  width:100%;
  max-width:100%;
  box-sizing:border-box;
  margin:0 0 6pt;
  text-align:justify;
  text-indent:0;
  align-items:start;
}
.sr-doc .sr-bibliography-item-label,.sr-doc .sr-reference-item-label{
  grid-column:1;
  min-width:0;
  font-weight:500;
  white-space:nowrap;
}
.sr-doc .sr-bibliography-item-content,.sr-doc .sr-reference-item-content{
  grid-column:2;
  min-width:0;
  width:100%;
  max-width:100%;
  overflow-wrap:anywhere;
  word-break:break-word;
}
/* Author-year lists carry no numeric marker, so they use the traditional
   hanging indent and the same full-width content safeguards. */
.sr-doc .sr-reference-item.sr-reference-hanging{
  display:block;
  width:100%;
  max-width:100%;
  padding-left:2.5rem;
  text-indent:-2.5rem;
}
.sr-doc .sr-reference-item.sr-reference-hanging .sr-reference-item-content{
  display:inline;
  width:auto;
  max-width:none;
}
.sr-doc .sr-citation,.sr-doc .sr-crossref{color:var(--sr-accent);white-space:nowrap;}

/* ------------------------------------------------------------- footnotes */
/* Printed at the foot of whichever page (or column) references them. The
   layout engine measures this list in normal flow; here it is pinned to the
   bottom. Same content and width, so measurement and print agree. */
.sr-doc .sr-footnotes{
  list-style:none;margin:${fn.gap} 0 0;padding:0;
  font-family:var(--sr-body-font);
  font-size:${fn.fontSize};
  line-height:${fn.lineHeight};
  text-align:left;text-indent:0;
  ${fn.separator ? `border-top:0.5pt solid var(--sr-rule);padding-top:${fn.gap};` : ''}
  ${fn.separator ? `max-width:100%;` : ''}
}
.sr-doc .sr-footnote{
  display:grid;grid-template-columns:1.6em 1fr;gap:0 .2em;margin:0 0 .25em;
}
.sr-doc .sr-footnote-mark{font-size:.85em;vertical-align:super;line-height:1;}
.sr-doc .sr-footnote-body p{margin:0;text-indent:0;}
.sr-doc .sr-footnote-ref{font-size:.75em;line-height:0;vertical-align:super;}
.sr-page-body > .sr-footnotes,
.sr-column > .sr-footnotes{position:absolute;left:0;right:0;bottom:0;margin-bottom:0;}
.sr-doc .sr-unresolved{
  color:#9b1c1c;background:#fdecec;border-bottom:1px dashed #d66;padding:0 .15em;
}

/* --------------------------------------------------------------- diagrams */
.sr-doc .sr-diagram{margin:12pt 0;text-align:center;break-inside:avoid;text-indent:0;}
.sr-doc .sr-mermaid{
  display:flex;justify-content:center;
  ${t.diagrams.overflow === 'scroll' ? 'overflow-x:auto;' : ''}
}
.sr-doc .sr-mermaid svg{max-width:100%;height:auto;}
.sr-doc .sr-mermaid svg text,
.sr-doc .sr-mermaid svg .nodeLabel,
.sr-doc .sr-mermaid svg .edgeLabel{
  font-family:${t.diagrams.fontFamily === 'body' ? 'var(--sr-body-font)' : 'var(--sr-heading-font)'} !important;
  font-size:${t.diagrams.fontSize} !important;
  fill:var(--sr-text) !important;
}
.sr-doc .sr-unknown{
  border:1px dashed #c2410c;background:#fff8f3;color:#9a3412;padding:.4em .6em;
  font-family:var(--sr-mono-font);font-size:.82em;white-space:pre-wrap;text-indent:0;
}
.sr-doc sup{font-size:.72em;vertical-align:super;line-height:0;}
.sr-doc sub{font-size:.72em;vertical-align:sub;line-height:0;}
.sr-doc a{color:var(--sr-accent);text-decoration:none;}
.sr-doc .katex{font-size:1.02em;}
.sr-doc .katex-display{margin:0;}

.sr-doc .sr-citation-link,.sr-doc .sr-reference-back{color:var(--sr-accent);text-decoration:none;}
.sr-doc .sr-citation-link:hover,.sr-doc .sr-reference-back:hover{text-decoration:underline;}
.sr-doc .sr-reference-back{margin-left:.45em;font-size:.82em;white-space:nowrap;}
`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Print stylesheet — drives the browser's own paged-media pipeline. */
export function compilePrintCss(t: TemplateDescriptor): string {
  const p = t.page;
  return `@page{size:${p.width} ${p.height};margin:0;}
@page landscape-page{size:${p.height} ${p.width};margin:0;}
@media print{
  html,body{margin:0!important;padding:0!important;background:#fff!important;}
  body *{visibility:hidden;}
  #sr-print-root,#sr-print-root *{visibility:visible;}
  #sr-print-root{position:absolute;inset:0 auto auto 0;width:max(${p.width},${p.height});}
  .sr-page{
    box-shadow:none!important;margin:0!important;border:0!important;
    break-after:page;page-break-after:always;
  }
  .sr-page-landscape{page:landscape-page!important;width:${p.height}!important;height:${p.width}!important;}
  .sr-page:last-child{break-after:auto;page-break-after:auto;}
  .sr-no-print{display:none!important;}
}
`;
}
