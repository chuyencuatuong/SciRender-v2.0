import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Loader2, Maximize2, Minus, Play, Plus } from 'lucide-react';
import type { PageKind, RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
  /**
   * Dưới 1180px bản in trượt lên che mất thanh công cụ bên soạn thảo, nên lối
   * quay về phải nằm ngay trong đầu bản in — nếu không người dùng bị kẹt.
   */
  onBack?: (() => void) | null;
}

const ZOOM_STEPS = [0.4, 0.5, 0.65, 0.75, 0.85, 1, 1.15, 1.35, 1.6];
const MAX_FIT_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 1.6;

const KIND_LABEL: Record<PageKind, string> = {
  cover: 'Bìa',
  front: 'Phần đầu',
  body: 'Nội dung',
};

export function PreviewPane({ render, onBack = null }: Props): JSX.Element {
  const prefs = useStore((s) => s.prefs);
  const showTech = useStore((s) => s.prefs.showTechStats);
  const setPref = useStore((s) => s.setPref);
  const requestGotoLine = useStore((s) => s.requestGotoLine);
  const requestRender = useStore((s) => s.render);
  const source = useStore((s) => s.source);
  const renderedSource = useStore((s) => s.renderedSource);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Zoom follows the column width until the reader takes over; after that it is
  // theirs. A page wider than its column is the one thing a preview must not do.
  const [manualZoom, setManualZoom] = useState(false);

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
    setManualZoom(true);
    setPref('zoom', ZOOM_STEPS[idx] ?? 1);
  };

  const fitToWidth = useCallback((): void => {
    const host = scrollRef.current;
    const page = host?.querySelector('.sr-page') as HTMLElement | null;
    if (!host || !page) return;
    const natural = page.getBoundingClientRect().width / (prefs.zoom || 1);
    if (!natural) return;
    // Trần cũ là 1 (100%) — trên màn rộng, cột xem trước thường rộng hơn khổ
    // A4 thật ở 100%, nên trang bị kẹt nhỏ giữa một cột rộng hơn nhiều, để lại
    // khoảng xám thừa hai bên. Cho leo tới đúng mức cao nhất của ZOOM_STEPS để
    // trang luôn lấp gần hết chiều rộng cột thay vì lơ lửng giữa khoảng trống.
    const next = Math.min(MAX_FIT_ZOOM, Math.max(0.3, (host.clientWidth - 72) / natural));
    if (Math.abs(next - prefs.zoom) > 0.005) setPref('zoom', Math.round(next * 100) / 100);
  }, [prefs.zoom, setPref]);

  useEffect(() => {
    if (manualZoom) return;
    const host = scrollRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    fitToWidth();
    const ro = new ResizeObserver(() => fitToWidth());
    ro.observe(host);
    return () => ro.disconnect();
  }, [fitToWidth, manualZoom, render.pages.length]);

  const t = render.result?.template;
  const pages = render.pages;

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-ink-900/[0.045] bg-ink-50 px-4">
        {/* Số trang nằm ở đảo thu phóng dưới chân giấy, nên ở đây chỉ còn
            trạng thái: thanh này trả lời "bản in đã mới chưa", không đếm. */}
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1.5 inline-flex h-[27px] items-center gap-1 whitespace-nowrap rounded-[8px] px-2 text-[12px] font-medium text-ink-600 transition hover:bg-ink-900/[0.04] hover:text-deep-600"
          >
            <ChevronLeft size={14} strokeWidth={1.8} /> Soạn thảo
          </button>
        ) : (
          <span className="text-[11.5px] font-medium text-ink-600">Bản in</span>
        )}
        {render.running ? (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-400">
            <Loader2 size={11} className="animate-spin" /> đang dựng
          </span>
        ) : showTech && render.durationMs ? (
          <span className="font-mono text-[10.5px] text-ink-300">{render.durationMs} ms</span>
        ) : null}

        {stale ? (
          <button className="sr-btn-render !px-2.5 !py-1 !text-[11.5px]" onClick={requestRender} title="Ctrl + Enter">
            <Play size={12} /> Có thay đổi — dựng lại
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="sr-canvas sr-scroll relative min-h-0 flex-1 overflow-auto">
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
          // `zoom` chứ không phải `transform: scale`: zoom tham gia vào bố cục nên
          // trang tự căn giữa và vùng cuộn đúng chiều cao. Bản xem trước chỉ để
          // nhìn — việc đo trang diễn ra ở host đo riêng, nên dùng zoom là an toàn.
          <div
            className="flex flex-col items-center gap-6 py-8"
            style={{ zoom: prefs.zoom }}
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

        {/* Đảo nổi: thu phóng đặt trên nền giấy chứ không chen vào thanh trên,
            vì nó là việc của mắt chứ không phải của tài liệu. */}
        <div
          role="group"
          aria-label="Thu phóng bản in"
          className="sr-frost pointer-events-auto sticky bottom-5 z-30 mx-auto flex h-[38px] w-fit items-center gap-0.5 rounded-full px-1.5 shadow-island"
        >
          <span className="px-2 text-[11px] text-ink-500">
            {pages.length ? `${pages.length} trang` : '—'}
          </span>
          <span className="mx-1 h-4 w-px bg-ink-900/[0.07]" />
          <button
            onClick={() => stepZoom(-1)}
            title="Thu nhỏ"
            aria-label="Thu nhỏ"
            className="grid h-7 w-7 place-items-center rounded-full text-ink-500 transition hover:bg-sky-500/10 hover:text-deep-600"
          >
            <Minus size={14} strokeWidth={1.8} />
          </button>
          <span className="min-w-[46px] text-center font-mono text-[11px] tabular-nums text-ink-700">
            {Math.round(prefs.zoom * 100)}%
          </span>
          <button
            onClick={() => stepZoom(1)}
            title="Phóng to"
            aria-label="Phóng to"
            className="grid h-7 w-7 place-items-center rounded-full text-ink-500 transition hover:bg-sky-500/10 hover:text-deep-600"
          >
            <Plus size={14} strokeWidth={1.8} />
          </button>
          <span className="mx-1 h-4 w-px bg-ink-900/[0.07]" />
          <button
            onClick={() => {
              setManualZoom(false);
              fitToWidth();
            }}
            title="Vừa khung"
            aria-label="Vừa khung"
            className="grid h-7 w-7 place-items-center rounded-full text-ink-500 transition hover:bg-sky-500/10 hover:text-deep-600"
          >
            <Maximize2 size={13} strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </>
  );
}
