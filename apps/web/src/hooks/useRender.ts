import { useEffect, useRef, useState } from 'react';
import type { LayoutWarning } from '@scirender/layout-engine';
import type { FrontNumbers } from '@scirender/renderer-html';
import type { FrontSectionKind } from '@scirender/template-engine';
import { countRender, track } from '@scirender/telemetry';
import type { AuditReport } from '@scirender/intelligence';
import { fitDisplayMath } from '~/lib/fit-math';
import { ensureKatexCss } from '~/lib/katex-css';
import { resolveMermaidBlocks } from '~/lib/mermaid';
import type { CompileResult } from '~/lib/pipeline';
import { useStore } from '~/state/store';

export type PageKind = 'cover' | 'front' | 'body';
export type PageOrientation = 'portrait' | 'landscape';

export interface RenderedPage {
  html: string;
  /** Already formatted: "" on covers, "iii" in front matter, "7" in the body. */
  footer: string;
  kind: PageKind;
  orientation: PageOrientation;
}

export interface RenderState {
  result: CompileResult | null;
  audit: AuditReport | null;
  pages: RenderedPage[];
  warnings: LayoutWarning[];
  /** Pages of the body flow only — what the faculty page budget is about. */
  bodyPageCount: number;
  pageOfNode: Record<string, number>;
  running: boolean;
  error: string | null;
  durationMs: number;
}

const EMPTY: RenderState = {
  result: null,
  audit: null,
  pages: [],
  warnings: [],
  bodyPageCount: 0,
  pageOfNode: {},
  running: false,
  error: null,
  durationMs: 0,
};

const MAX_FRONT_PASSES = 3;

async function loadRenderEngine(): Promise<{
  compile: typeof import('~/lib/pipeline')['compile'];
  checkPageBudget: typeof import('@scirender/layout-engine')['checkPageBudget'];
  optionsFromTemplate: typeof import('@scirender/layout-engine')['optionsFromTemplate'];
  paginate: typeof import('@scirender/layout-engine')['paginate'];
  renderFrontMatter: typeof import('@scirender/renderer-html')['renderFrontMatter'];
  formatPageNumber: typeof import('@scirender/template-engine')['formatPageNumber'];
  runPreSubmissionAudit: typeof import('@scirender/intelligence')['runPreSubmissionAudit'];
}> {
  const [pipeline, layout, html, template, intelligence] = await Promise.all([
    import('~/lib/pipeline'),
    import('@scirender/layout-engine'),
    import('@scirender/renderer-html'),
    import('@scirender/template-engine'),
    import('@scirender/intelligence'),
  ]);
  return {
    compile: pipeline.compile,
    checkPageBudget: layout.checkPageBudget,
    optionsFromTemplate: layout.optionsFromTemplate,
    paginate: layout.paginate,
    renderFrontMatter: html.renderFrontMatter,
    formatPageNumber: template.formatPageNumber,
    runPreSubmissionAudit: intelligence.runPreSubmissionAudit,
  };
}

/**
 * Renders on demand.
 *
 * Live rendering was removed on purpose: pagination measures real DOM line
 * boxes, which is far too heavy to run on every keystroke. Rendering now
 * happens when the user asks for it, so typing stays as fast as a plain text
 * editor no matter how long the document is.
 *
 * The front matter needs a fixed point: the table of contents shows page
 * numbers, but adding it changes how many front pages there are, which changes
 * those numbers. Three passes converge for any realistic report; the loop stops
 * early as soon as the numbers stop moving.
 */
export function useRender(): RenderState {
  const renderedSource = useStore((s) => s.renderedSource);
  const renderNonce = useStore((s) => s.renderNonce);
  const templateId = useStore((s) => s.templateId);
  const overrides = useStore((s) => s.overrides);
  const assetMap = useStore((s) => s.assetMap);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<RenderState>(EMPTY);

  useEffect(() => {
    const host = document.createElement('div');
    host.id = 'sr-measure-host';
    document.body.appendChild(host);
    hostRef.current = host;
    return () => {
      host.remove();
      hostRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState((s) => ({ ...s, running: true, error: null }));

    const run = async (): Promise<void> => {
      const started = performance.now();
      let engine: Awaited<ReturnType<typeof loadRenderEngine>>;
      try {
        engine = await loadRenderEngine();
      } catch (err) {
        countRender(null);
        if (!cancelled) {
          setState((s) => ({
            ...s,
            running: false,
            error: err instanceof Error ? err.stack ?? err.message : String(err),
          }));
        }
        return;
      }
      if (cancelled || controller.signal.aborted) return;
      let result: CompileResult;
      try {
        result = engine.compile({ source: renderedSource, templateId, overrides, assets: assetMap });
      } catch (err) {
        countRender(null);
        if (!cancelled) {
          setState((s) => ({
            ...s,
            running: false,
            error: (err as Error).stack ?? (err as Error).message,
          }));
        }
        return;
      }
      if (cancelled) return;

      const t = result.template;

      // The template stylesheet and KaTeX stylesheet must be present BEFORE
      // anything is measured. Both are explicit render-time assets: neither is
      // part of the initial application payload.
      try {
        applyTemplateCss(t.css);
        await ensureKatexCss();
      } catch (err) {
        countRender(null);
        if (!cancelled) {
          setState((s) => ({
            ...s,
            running: false,
            error: err instanceof Error ? err.stack ?? err.message : String(err),
          }));
        }
        return;
      }
      if (cancelled || controller.signal.aborted) return;

      const mermaid = await resolveMermaidBlocks(result.blocks, t.descriptor, {
        contentWidthPx: t.metrics.contentWidthPx,
        contentHeightPx: t.metrics.contentHeightPx,
      });
      const bodyBlocks = mermaid.blocks;
      if (cancelled || !hostRef.current) return;

      // Nothing may be measured until every font AND every image the document
      // uses has loaded. An <img> that has not decoded yet reports height 0, so
      // the page looks emptier than it is and the next block is accepted onto a
      // page it does not fit — the same document would paginate two different
      // ways depending on the browser cache (P2).
      const mathWarnings: LayoutWarning[] = [];
      const bodyElements = await settleMedia(
        hostRef.current,
        bodyBlocks,
        t.metrics.bodySizePx,
        t.metrics.contentWidthPx,
        mathWarnings,
        controller.signal,
      );
      if (cancelled || controller.signal.aborted || !hostRef.current) return;
      await nextFrame();
      if (cancelled || controller.signal.aborted) return;

      const opts = {
        ...engine.optionsFromTemplate(t),
        footnotes: t.descriptor.footnotes.enabled ? result.footnotes : {},
      };
      const warnings: LayoutWarning[] = [...mermaid.warnings, ...mathWarnings];

      const body = engine.paginate(bodyElements, opts, hostRef.current);
      warnings.push(...body.warnings);
      warnings.push(...engine.checkPageBudget(body.pages.length, t.descriptor.layout.pageBudget));

      const numbers: FrontNumbers = {
        bodyPageOf: body.pageOfNode,
        frontPageOf: {},
      };
      const refPage = body.pageOfNode['body-references'];
      if (refPage) numbers.referencesPage = refPage;

      let frontPages: string[] = [];
      if (t.descriptor.frontMatter.enabled) {
        let previousKey = '';
        for (let pass = 0; pass < MAX_FRONT_PASSES; pass++) {
          const frontBlocks = engine.renderFrontMatter(result.document, t.descriptor, {
            outline: result.outline,
            figures: result.figures,
            tables: result.tables,
            numbers,
          });
          if (!frontBlocks.length) {
            frontPages = [];
            break;
          }
          if (cancelled || !hostRef.current) return;
          const front = engine.paginate(frontBlocks, { ...opts, footnotes: {} }, hostRef.current);
          frontPages = front.pages;

          const nextFrontPageOf: Partial<Record<FrontSectionKind, number>> = {};
          for (const [nodeId, page] of Object.entries(front.pageOfNode)) {
            if (!nodeId.startsWith('front-')) continue;
            nextFrontPageOf[nodeId.slice(6) as FrontSectionKind] = page;
          }
          const key = JSON.stringify(nextFrontPageOf);
          numbers.frontPageOf = nextFrontPageOf;
          if (key === previousKey) break;
          previousKey = key;
          if (pass === MAX_FRONT_PASSES - 1) warnings.push(...front.warnings);
        }
      }

      if (cancelled) return;

      const d = t.descriptor;
      const pages: RenderedPage[] = [
        ...result.coverPages.map((html) => ({ html, footer: '', kind: 'cover' as const, orientation: 'portrait' as const })),
        ...frontPages.map((html, i) => ({
          html,
          footer: engine.formatPageNumber(i + 1, d.layout.frontPageNumbers),
          kind: 'front' as const,
          orientation: 'portrait' as const,
        })),
        ...body.pages.map((html, i) => ({
          html,
          footer: engine.formatPageNumber(i + 1, d.layout.bodyPageNumbers),
          kind: 'body' as const,
          orientation: body.pageOrientations[i] ?? 'portrait',
        })),
      ];

      const audit = engine.runPreSubmissionAudit(result.document, result.diagnostics, {
        tocEnabled: Boolean(d.frontMatter.enabled && d.frontMatter.sections.some((section) => section.kind === 'toc' && section.enabled)),
        pageBudget: d.layout.pageBudget,
      }, {
        pages: pages.length,
        bodyPages: body.pages.length,
        warnings,
      });

      const durationMs = Math.round((performance.now() - started) * 10) / 10;
      setState({
        result,
        audit,
        pages,
        warnings,
        bodyPageCount: body.pages.length,
        pageOfNode: body.pageOfNode,
        running: false,
        error: null,
        durationMs,
      });
      // Aggregate counters, separate from the event log above: this is the
      // figure the Research panel reports (documents rendered, average pages).
      countRender(pages.length);
      track('render', {
        ms: durationMs,
        pages: pages.length,
        cover: result.coverPages.length,
        front: frontPages.length,
        body: body.pages.length,
        errors: result.diagnostics.filter((x) => x.severity === 'error').length,
        score: result.health.score,
      });
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderNonce, renderedSource, templateId, overrides, assetMap]);

  return state;
}

/** Installs (or refreshes) the single stylesheet that both the visible pages
 * and the offscreen measuring host are laid out with. */
function applyTemplateCss(css: string): void {
  let style = document.getElementById('sr-template-css') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'sr-template-css';
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Builds the block elements once, inside the measuring host, and waits until
 * every image has decoded and every font has loaded before handing them back.
 *
 * The elements themselves are returned — not their HTML — because a fresh <img>
 * parsed from a string reports height 0 until it decodes, and a page measured
 * that way accepts a block that does not fit. Reusing the settled elements is
 * what makes pagination reproducible across reloads (P2).
 */
async function settleMedia(
  host: HTMLElement,
  blocks: string[],
  bodySizePx: number,
  contentWidthPx: number,
  mathWarnings: LayoutWarning[],
  signal?: AbortSignal,
): Promise<Element[]> {
  host.textContent = '';
  // The measuring host must already be exactly one text column wide: formulas
  // are fitted against it here, and a host sized by whatever the body happened
  // to be would fit them to the wrong width — and to a different width on the
  // next run, which is how a document paginates two ways (P2).
  host.style.position = 'absolute';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${contentWidthPx}px`;
  host.style.visibility = 'hidden';
  host.style.pointerEvents = 'none';
  const staging = document.createElement('div');
  staging.className = 'sr-doc';
  staging.style.width = '100%';
  staging.innerHTML = blocks.join('');
  const elements = Array.from(staging.children);
  host.appendChild(staging);

  // Wait until the template stylesheet has actually taken effect. Asking for a
  // frame is not proof; asking the browser what a document-level element now
  // computes to is.
  const probe = document.createElement('div');
  probe.textContent = '\u00a0';
  staging.appendChild(probe);
  for (let i = 0; i < 30; i++) {
    if (signal?.aborted) { probe.remove(); return []; }
    await nextFrame();
    if (signal?.aborted) { probe.remove(); return []; }
    const size = Number.parseFloat(getComputedStyle(probe).fontSize);
    if (Number.isFinite(size) && Math.abs(size - bodySizePx) < 0.5) break;
  }
  probe.remove();

  await Promise.all(
    Array.from(staging.querySelectorAll('img')).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (signal?.aborted || (img.complete && img.naturalWidth > 0)) {
            resolve();
            return;
          }
          const cleanup = (): void => {
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            signal?.removeEventListener('abort', abort);
          };
          const done = (): void => { cleanup(); resolve(); };
          const abort = (): void => { cleanup(); resolve(); };
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          signal?.addEventListener('abort', abort, { once: true });
        }),
    ),
  );
  if (signal?.aborted) { staging.remove(); return []; }

  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts) {
    try {
      await fonts.ready;
    } catch {
      /* font loading is best effort — never block a render on it */
    }
  }
  if (signal?.aborted) { staging.remove(); return []; }

  // Long formulas are fitted to the column while the document is still laid
  // out here, so pagination measures the height that will actually print.
  mathWarnings.push(...fitDisplayMath(staging));

  if (signal?.aborted) { staging.remove(); return []; }
  await nextFrame();
  if (signal?.aborted) { staging.remove(); return []; }
  staging.remove();
  host.textContent = '';
  return elements;
}
