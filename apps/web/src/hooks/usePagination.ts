import { useEffect, useRef, useState } from 'react';
import {
  optionsFromTemplate,
  paginate,
  type LayoutWarning,
} from '@scirender/layout-engine';
import type { ResolvedTemplate } from '@scirender/template-engine';
import { track } from '@scirender/telemetry';

export interface PaginationState {
  pages: string[];
  warnings: LayoutWarning[];
  pageOfNode: Record<string, number>;
  running: boolean;
  durationMs: number;
}

const EMPTY: PaginationState = {
  pages: [],
  warnings: [],
  pageOfNode: {},
  running: false,
  durationMs: 0,
};

/**
 * Runs the layout engine against a hidden measuring host.
 *
 * Pagination touches the DOM, so it cannot live in the pure compiler. It runs
 * after paint, is cancelled when inputs change mid-flight, and reuses one host
 * element for the whole session.
 */
export function usePagination(
  blocks: string[],
  template: ResolvedTemplate | null,
  enabled: boolean,
): PaginationState {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<PaginationState>(EMPTY);

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

  const signature = `${template?.descriptor.id ?? ''}|${template?.metrics.contentHeightPx ?? 0}|${
    template?.metrics.contentWidthPx ?? 0
  }|${blocks.length}|${blocks.join('').length}`;

  useEffect(() => {
    if (!enabled || !template || !hostRef.current) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, running: true }));

    // Two frames: one for the template stylesheet, one for font metrics.
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || !hostRef.current) return;
        try {
          const result = paginate(blocks, optionsFromTemplate(template), hostRef.current);
          if (cancelled) return;
          setState({
            pages: result.pages,
            warnings: result.warnings,
            pageOfNode: result.pageOfNode,
            running: false,
            durationMs: result.durationMs,
          });
          track('paginate', { pages: result.pages.length, ms: result.durationMs });
        } catch (err) {
          if (cancelled) return;
          setState({
            pages: blocks,
            warnings: [
              {
                code: 'SR-L999',
                message: `Phân trang lỗi: ${(err as Error).message}. Đang hiển thị ở chế độ dòng chảy liên tục.`,
                nodeId: null,
                line: null,
              },
            ],
            pageOfNode: {},
            running: false,
            durationMs: 0,
          });
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled]);

  return state;
}
