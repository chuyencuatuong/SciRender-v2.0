import { useEffect, useRef, useState } from 'react';
import {
  optionsFromTemplate,
  paginate,
  type LayoutWarning,
} from '@scirender/layout-engine';
import { renderFrontMatter, type FrontNumbers } from '@scirender/renderer-html';
import { formatPageNumber, type FrontSectionKind } from '@scirender/template-engine';
import { track } from '@scirender/telemetry';
import { resolveMermaidBlocks } from '~/lib/mermaid';
import { compile, type CompileResult } from '~/lib/pipeline';
import { useStore } from '~/state/store';

export type PageKind = 'cover' | 'front' | 'body';

export interface RenderedPage {
  html: string;
  /** Already formatted: "" on covers, "iii" in front matter, "7" in the body. */
  footer: string;
  kind: PageKind;
}

export interface RenderState {
  result: CompileResult | null;
  pages: RenderedPage[];
  warnings: LayoutWarning[];
  pageOfNode: Record<string, number>;
  running: boolean;
  error: string | null;
  durationMs: number;
}

const EMPTY: RenderState = {
  result: null,
  pages: [],
  warnings: [],
  pageOfNode: {},
  running: false,
  error: null,
  durationMs: 0,
};

const MAX_FRONT_PASSES = 3;

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
    setState((s) => ({ ...s, running: true, error: null }));

    const run = async (): Promise<void> => {
      const started = performance.now();
      let result: CompileResult;
      try {
        result = compile({ source: renderedSource, templateId, overrides, assets: assetMap });
      } catch (err) {
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
      const mermaid = await resolveMermaidBlocks(result.blocks, t.descriptor, {
        contentWidthPx: t.metrics.contentWidthPx,
        contentHeightPx: t.metrics.contentHeightPx,
      });
      const bodyBlocks = mermaid.blocks;
      if (cancelled || !hostRef.current) return;

      // Two frames so the template stylesheet and web fonts are applied before
      // anything is measured.
      await nextFrame();
      await nextFrame();
      if (cancelled || !hostRef.current) return;

      const opts = optionsFromTemplate(t);
      const warnings: LayoutWarning[] = [...mermaid.warnings];

      const body = paginate(bodyBlocks, opts, hostRef.current);
      warnings.push(...body.warnings);

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
          const frontBlocks = renderFrontMatter(result.document, t.descriptor, {
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
          const front = paginate(frontBlocks, opts, hostRef.current);
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
        ...result.coverPages.map((html) => ({ html, footer: '', kind: 'cover' as const })),
        ...frontPages.map((html, i) => ({
          html,
          footer: formatPageNumber(i + 1, d.layout.frontPageNumbers),
          kind: 'front' as const,
        })),
        ...body.pages.map((html, i) => ({
          html,
          footer: formatPageNumber(i + 1, d.layout.bodyPageNumbers),
          kind: 'body' as const,
        })),
      ];

      const durationMs = Math.round((performance.now() - started) * 10) / 10;
      setState({
        result,
        pages,
        warnings,
        pageOfNode: body.pageOfNode,
        running: false,
        error: null,
        durationMs,
      });
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderNonce, renderedSource, templateId, overrides, assetMap]);

  return state;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
