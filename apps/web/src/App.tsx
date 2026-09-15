import { useEffect, useRef, useState } from 'react';
import { TopBar } from '~/components/TopBar';
import { SideRail } from '~/components/SideRail';
import { SidePanel } from '~/components/SidePanel';
import { CanvasPane } from '~/components/canvas/CanvasPane';
import { PreviewPane } from '~/components/PreviewPane';
import { StatusBar } from '~/components/StatusBar';
import { useRender } from '~/hooks/useRender';
import { useStore } from '~/state/store';

export function App(): JSX.Element {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const prefs = useStore((s) => s.prefs);
  const setPref = useStore((s) => s.setPref);
  const storageError = useStore((s) => s.storageError);
  const requestRender = useStore((s) => s.render);

  const render = useRender();

  const splitRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // The template stylesheet is installed by the render pipeline itself, before
  // it measures anything — see applyTemplateCss in useRender.

  // Ctrl/Cmd+Enter renders from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        requestRender();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestRender]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent): void => {
      const host = splitRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setPref('editorWidth', Math.min(72, Math.max(22, Math.round(pct))));
    };
    const onUp = (): void => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, setPref]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Đang khởi tạo không gian làm việc cục bộ…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar render={render} />

      {storageError ? (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900">
          {storageError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <SideRail />
        <SidePanel render={render} />

        <div ref={splitRef} className="flex min-w-0 flex-1">
          <div
            className="flex min-w-0 flex-col border-r border-ink-200 bg-white"
            style={{ width: `${prefs.editorWidth}%` }}
          >
            <CanvasPane />
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để đổi tỉ lệ trình soạn thảo và bản xem trước"
            onMouseDown={() => setDragging(true)}
            className={`w-1 shrink-0 cursor-col-resize transition ${
              dragging ? 'bg-sky-500' : 'bg-transparent hover:bg-sky-400/60'
            }`}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <PreviewPane render={render} />
          </div>
        </div>
      </div>

      <StatusBar render={render} />
    </div>
  );
}
