import { useEffect, useRef } from 'react';
import { Loader2, Minus, Plus, RefreshCw } from 'lucide-react';
import type { PaginationState } from '~/hooks/usePagination';
import type { CompileResult } from '~/lib/pipeline';
import { useStore } from '~/state/store';

interface Props {
  result: CompileResult | null;
  pagination: PaginationState;
  compileError: string | null;
  stale: boolean;
}

const ZOOM_STEPS = [0.5, 0.65, 0.75, 0.85, 1, 1.15, 1.35, 1.6];

export function PreviewPane({ result, pagination, compileError, stale }: Props): JSX.Element {
  const prefs = useStore((s) => s.prefs);
  const setPref = useStore((s) => s.setPref);
  const requestGotoLine = useStore((s) => s.requestGotoLine);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Clicking anywhere in the rendered page jumps the editor to that source line.
  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const onClick = (e: MouseEvent): void => {
      const target = (e.target as HTMLElement | null)?.closest('[data-sr-line]');
      if (!target) return;
      const line = parseInt(target.getAttribute('data-sr-line') ?? '', 10);
      if (Number.isFinite(line)) requestGotoLine(line);
    };
    host.addEventListener('click', onClick);
    return () => host.removeEventListener('click', onClick);
  }, [requestGotoLine]);

  const zoomIndex = ZOOM_STEPS.findIndex((z) => Math.abs(z - prefs.zoom) < 0.001);
  const stepZoom = (delta: number): void => {
    const idx = Math.min(
      ZOOM_STEPS.length - 1,
      Math.max(0, (zoomIndex === -1 ? 4 : zoomIndex) + delta),
    );
    setPref('zoom', ZOOM_STEPS[idx] ?? 1);
  };

  const t = result?.template;
  const pages = pagination.pages;

  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-ink-200 bg-ink-50/60 px-2">
        <span className="text-[11.5px] font-medium text-ink-600">
          {pages.length ? `${pages.length} trang` : 'Chưa phân trang'}
        </span>
        {pagination.running || stale ? (
          <span className="flex items-center gap-1 text-[11px] text-ink-400">
            <Loader2 size={11} className="animate-spin" /> đang tính bố cục
          </span>
        ) : pagination.durationMs ? (
          <span className="text-[11px] text-ink-400">{pagination.durationMs} ms</span>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <button className="sr-btn !px-1.5 !py-1" onClick={() => stepZoom(-1)} title="Thu nhỏ">
            <Minus size={13} />
          </button>
          <span className="w-12 text-center text-[11.5px] tabular-nums text-ink-600">
            {Math.round(prefs.zoom * 100)}%
          </span>
          <button className="sr-btn !px-1.5 !py-1" onClick={() => stepZoom(1)} title="Phóng to">
            <Plus size={13} />
          </button>
          <button
            className="sr-btn !px-1.5 !py-1"
            onClick={() => setPref('zoom', 1)}
            title="Về 100%"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="sr-canvas sr-scroll min-h-0 flex-1 overflow-auto">
        {compileError ? (
          <div className="m-4 rounded-md border border-red-300 bg-red-50 p-3">
            <div className="mb-1 text-[12.5px] font-semibold text-red-800">
              Bộ biên dịch gặp lỗi không xử lý được
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-snug text-red-700">
              {compileError}
            </pre>
          </div>
        ) : null}

        {!result ? (
          <div className="grid h-full place-items-center text-[13px] text-white/70">
            Đang biên dịch…
          </div>
        ) : (
          <div
            className="flex flex-col items-center gap-6 py-6"
            style={{
              transform: `scale(${prefs.zoom})`,
              transformOrigin: 'top center',
              width: `${100 / prefs.zoom}%`,
            }}
          >
            {(pages.length ? pages : ['']).map((html, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <section
                  className="sr-page sr-page-shell"
                  style={
                    t
                      ? {
                          width: t.descriptor.page.width,
                          height: t.descriptor.page.height,
                        }
                      : undefined
                  }
                >
                  <div
                    className="sr-page-body sr-doc"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                  {t?.descriptor.layout.showPageNumbers ? (
                    <div className="sr-page-footer">
                      {t.descriptor.labels.page} {i + 1}/{pages.length || 1}
                    </div>
                  ) : null}
                </section>
                <span className="sr-page-marker">
                  {i + 1} / {pages.length || 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
