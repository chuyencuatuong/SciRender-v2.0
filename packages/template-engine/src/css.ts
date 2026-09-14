import type { TemplateDescriptor } from './types.js';
import { toPx } from './units.js';

/**
 * Compiles a template descriptor into a deterministic stylesheet.
 *
 * All document rules are scoped under `.sr-doc` so that the application shell
 * (Tailwind preflight included) can never leak into the rendered document, and
 * so the same descriptor yields byte-identical CSS on every run (P2).
 */
export function compileCss(t: TemplateDescriptor): string {
  const p = t.page;
  const ty = t.typography;
  const h = t.headings;
  const c = t.captions;
  const col = t.colors;
  const bodyPx = toPx(ty.bodySize, 17.333);
  const linePx = bodyPx * ty.lineHeight;

  const headingRules = h.scale
    .map((scale, idx) => {
      const level = idx + 1;
      const upper = level === 1 && h.uppercaseLevel1 ? 'text-transform:uppercase;' : '';
      return `.sr-doc h${level}{font-family:var(--sr-heading-font);font-size:${round(scale)}em;font-weight:${h.weight};line-height:1.25;margin:${h.spaceBefore} 0 ${h.spaceAfter};${upper}}`;
    })
    .join('\n');

  return `:root{
  --sr-page-width:${p.width};
  --sr-page-height:${p.height};
  --sr-margin-top:${p.margin.top};
  --sr-margin-right:${p.margin.right};
  --sr-margin-bottom:${p.margin.bottom};
  --sr-margin-left:${p.margin.left};
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
.sr-page-body{height:100%;overflow:hidden;${p.columns > 1 ? `column-count:${p.columns};column-gap:${p.columnGap};` : ''}}
.sr-page-footer{
  position:absolute;left:var(--sr-margin-left);right:var(--sr-margin-right);
  bottom:calc(var(--sr-margin-bottom) * 0.42);
  font-family:var(--sr-body-font);font-size:0.8em;color:var(--sr-muted);
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
.sr-doc p{margin:0 0 ${ty.paragraphSpacing};text-indent:${ty.paragraphIndent};}
.sr-doc p.sr-first-paragraph{text-indent:0;}
${headingRules}
.sr-doc h1:first-child,.sr-doc h2:first-child,.sr-doc h3:first-child{margin-top:0;}
.sr-doc .sr-heading-number{margin-right:0.5em;}

/* ------------------------------------------------------------- title block */
.sr-doc .sr-titleblock{text-align:center;margin:0 0 1.4em;}
.sr-doc .sr-title{font-family:var(--sr-heading-font);font-size:1.7em;font-weight:700;line-height:1.25;margin:0 0 .3em;text-align:center;}
.sr-doc .sr-subtitle{font-size:1.05em;color:var(--sr-muted);margin:0 0 .6em;text-align:center;}
.sr-doc .sr-authors{font-size:.95em;margin:0 0 .25em;text-align:center;}
.sr-doc .sr-affiliations{font-size:.85em;color:var(--sr-muted);margin:0;text-align:center;}
.sr-doc .sr-date{font-size:.85em;color:var(--sr-muted);margin:.4em 0 0;text-align:center;}
.sr-doc .sr-abstract{margin:1.1em 0;padding:0 1.2em;font-size:.94em;text-align:justify;}
.sr-doc .sr-abstract-label,.sr-doc .sr-keywords-label{font-weight:700;margin-right:.4em;}
.sr-doc .sr-keywords{font-size:.9em;padding:0 1.2em;margin:0 0 1em;}

/* ---------------------------------------------------------------- figures */
.sr-doc figure{margin:1em 0;text-align:center;break-inside:avoid;page-break-inside:avoid;}
.sr-doc figure img{max-width:100%;height:auto;display:block;margin:0 auto;}
.sr-doc figcaption,.sr-doc .sr-caption{
  font-size:var(--sr-caption-size);
  color:var(--sr-text);
  text-align:${c.align};
  margin:.5em 0 0;
  ${c.italic ? 'font-style:italic;' : ''}
  text-indent:0;
}
.sr-doc .sr-caption-above{margin:0 0 .5em;}
.sr-doc .sr-caption-label{font-weight:700;}

/* ----------------------------------------------------------------- tables */
.sr-doc table{border-collapse:collapse;width:100%;margin:0;font-size:.95em;break-inside:avoid;page-break-inside:avoid;}
.sr-doc .sr-table-wrap{margin:1em 0;break-inside:avoid;page-break-inside:avoid;}
.sr-doc th,.sr-doc td{border:1px solid var(--sr-rule);padding:.35em .55em;vertical-align:top;text-align:left;text-indent:0;}
.sr-doc thead th{background:var(--sr-table-head-bg);font-weight:700;}

/* -------------------------------------------------------------- equations */
.sr-doc .sr-equation{
  display:grid;grid-template-columns:1fr auto;align-items:center;
  gap:1em;margin:.9em 0;break-inside:avoid;page-break-inside:avoid;text-indent:0;
}
.sr-doc .sr-equation-body{overflow-x:auto;overflow-y:hidden;text-align:center;}
.sr-doc .sr-equation-number{font-variant-numeric:tabular-nums;white-space:nowrap;}
.sr-doc .sr-math-error{
  display:inline-block;background:#fdecec;color:#9b1c1c;border:1px dashed #e88;
  padding:0 .3em;border-radius:3px;font-family:var(--sr-mono-font);font-size:.85em;
}

/* ------------------------------------------------------------------ lists */
.sr-doc ul,.sr-doc ol{margin:0 0 ${ty.paragraphSpacing};padding-left:1.7em;text-indent:0;list-style-position:outside;}
.sr-doc ul{list-style-type:disc;}
.sr-doc ol{list-style-type:decimal;}
.sr-doc ul ul{list-style-type:circle;}
.sr-doc ul ul ul{list-style-type:square;}
.sr-doc ol ol{list-style-type:lower-alpha;}
.sr-doc li::marker{color:var(--sr-text);}
.sr-doc li{margin:.15em 0;}
.sr-doc li > p{margin:0 0 .25em;text-indent:0;}

/* ------------------------------------------------------- code & callouts */
.sr-doc pre{
  background:var(--sr-code-bg);border:1px solid var(--sr-rule);border-radius:4px;
  padding:.6em .8em;overflow-x:auto;font-family:var(--sr-mono-font);font-size:.82em;
  line-height:1.45;margin:.9em 0;text-align:left;text-indent:0;white-space:pre;
}
.sr-doc code{font-family:var(--sr-mono-font);font-size:.86em;background:var(--sr-code-bg);padding:.05em .25em;border-radius:3px;}
.sr-doc pre code{background:none;padding:0;font-size:1em;}
.sr-doc blockquote{
  margin:.9em 0;padding:.2em 0 .2em 1em;border-left:3px solid var(--sr-rule);
  color:var(--sr-muted);text-indent:0;
}
.sr-doc .sr-callout{
  margin:1em 0;padding:.7em .9em;border:1px solid var(--sr-rule);border-left:4px solid var(--sr-accent);
  border-radius:4px;background:#fbfcfe;text-indent:0;break-inside:avoid;
}
.sr-doc .sr-callout-title{font-weight:700;margin:0 0 .3em;}
.sr-doc .sr-callout-warning{border-left-color:#c2410c;background:#fff8f3;}
.sr-doc .sr-callout-danger{border-left-color:#b91c1c;background:#fff5f5;}
.sr-doc .sr-callout-tip{border-left-color:#047857;background:#f3fbf7;}
.sr-doc hr{border:0;border-top:1px solid var(--sr-rule);margin:1.2em 0;}

/* -------------------------------------------------- references & crossrefs */
.sr-doc .sr-references{margin-top:1.2em;}
.sr-doc .sr-reference-list{list-style:none;padding-left:0;counter-reset:sr-ref;}
.sr-doc .sr-reference-item{
  display:grid;grid-template-columns:2.4em 1fr;gap:.2em;margin:.35em 0;
  font-size:.92em;text-align:left;text-indent:0;
}
.sr-doc .sr-citation,.sr-doc .sr-crossref{color:var(--sr-accent);white-space:nowrap;}
.sr-doc .sr-unresolved{
  color:#9b1c1c;background:#fdecec;border-bottom:1px dashed #d66;padding:0 .15em;border-radius:2px;
}
.sr-doc .sr-diagram{margin:1em 0;text-align:center;break-inside:avoid;}
.sr-doc .sr-unknown{
  border:1px dashed #c2410c;background:#fff8f3;color:#9a3412;padding:.4em .6em;
  font-family:var(--sr-mono-font);font-size:.82em;white-space:pre-wrap;text-indent:0;
}
.sr-doc sup{font-size:.72em;vertical-align:super;line-height:0;}
.sr-doc sub{font-size:.72em;vertical-align:sub;line-height:0;}
.sr-doc a{color:var(--sr-accent);text-decoration:none;}
.sr-doc .katex{font-size:1.02em;}
.sr-doc .katex-display{margin:0;}
`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Print stylesheet — drives the browser's own paged-media pipeline. */
export function compilePrintCss(t: TemplateDescriptor): string {
  const p = t.page;
  return `@page{size:${p.width} ${p.height};margin:0;}
@media print{
  html,body{margin:0!important;padding:0!important;background:#fff!important;}
  body *{visibility:hidden;}
  #sr-print-root,#sr-print-root *{visibility:visible;}
  #sr-print-root{position:absolute;inset:0 auto auto 0;width:${p.width};}
  .sr-page{
    box-shadow:none!important;margin:0!important;border:0!important;
    break-after:page;page-break-after:always;
  }
  .sr-page:last-child{break-after:auto;page-break-after:auto;}
  .sr-no-print{display:none!important;}
}
`;
}
