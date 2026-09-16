import { useEffect, useRef } from 'react';
import { Loader2, Minus, Play, Plus, RefreshCw } from 'lucide-react';
import type { PageKind, RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

const ZOOM_STEPS = [0.4, 0.5, 0.65, 0.75, 0.85, 1, 1.15, 1.35, 1.6];

const KIND_LABEL: Record<PageKind, string> = {
  cover: 'Bìa',
  front: 'Phần đầu',
  body: 'Nội dung',
};

export function PreviewPane({ render }: Props): JSX.Element {
  const prefs = useStore((s) => s.prefs);
  const showTech = useStore((s) => s.prefs.showTechStats);
  const setPref = useStore((s) => s.setPref);
  const requestGotoLine = useStore((s) => s.requestGotoLine);
  const requestRender = useStore((s) => s.render);
  const source = useStore((s) => s.source);
  const renderedSource = useStore((s) => s.renderedSource);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const stale = source !== renderedSource;

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
      Math.max(0, (zoomIndex === -1 ? 5 : zoomIndex) + delta),
    );
    setPref('zoom', ZOOM_STEPS[idx] ?? 1);
  };

  const t = render.result?.template;
  const pages = render.pages;

  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-ink-200 bg-ink-50 px-2">
        <span className="text-[11.5px] font-medium text-ink-600">
          {pages.length ? `${pages.length} trang` : 'Chưa dựng trang'}
        </span>
        {render.running ? (
          <span className="flex items-center gap-1 text-[11px] text-ink-400">
            <Loader2 size={11} className="animate-spin" /> đang dựng
          </span>
        ) : showTech && render.durationMs ? (
          <span className="font-mono text-[10.5px] text-ink-400">{render.durationMs} ms</span>
        ) : null}

        {stale ? (
          <button
            className="sr-btn-render !py-1 !text-[11.5px]"
            onClick={requestRender}
            title="Ctrl + Enter"
          >
            <Play size={12} /> Có thay đổi — dựng lại
          </button>
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
        {render.error ? (
          <div className="m-4 rounded-md border border-flag-300 bg-flag-50 p-3">
            <div className="mb-1 text-[12.5px] font-semibold text-flag-700">
              Bộ biên dịch gặp lỗi không xử lý được
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-snug text-flag-600">
              {render.error}
            </pre>
          </div>
        ) : null}

        {!render.result ? (
          <div className="grid h-full place-items-center text-[13px] text-white/70">
            {render.running ? 'Đang dựng tài liệu…' : 'Bấm Dựng trang để xem kết quả.'}
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
            {(pages.length ? pages : [{ html: '', footer: '', kind: 'body' as PageKind }]).map(
              (page, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <section
                    className={`sr-page sr-page-shell${page.kind === 'cover' ? ' sr-page-cover' : ''}`}
                    style={
                      t
                        ? { width: t.descriptor.page.width, height: t.descriptor.page.height }
                        : undefined
                    }
                  >
                    <div
                      className="sr-page-body sr-doc"
                      dangerouslySetInnerHTML={{ __html: page.html }}
                    />
                    {page.footer ? <div className="sr-page-footer">{page.footer}</div> : null}
                  </section>
                  <span className="sr-page-marker">
                    <span className="sr-page-kind">{KIND_LABEL[page.kind]}</span>
                    {page.footer ? ` · ${page.footer}` : ''} · {i + 1}/{pages.length || 1}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </>
  );
}
