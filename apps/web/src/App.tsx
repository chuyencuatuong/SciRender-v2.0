import { useEffect, useRef, useState } from 'react';
import { CommandPalette } from '~/components/CommandPalette';
import { ShortcutCheatSheet } from '~/components/ShortcutCheatSheet';
import { TopBar } from '~/components/TopBar';
import { SideRail } from '~/components/SideRail';
import { SidePanel } from '~/components/SidePanel';
import { CanvasPane } from '~/components/canvas/CanvasPane';
import { PreviewPane } from '~/components/PreviewPane';
import { StatusBar } from '~/components/StatusBar';
import { useRender } from '~/hooks/useRender';
import { FLOAT_PANEL, SPLIT_PREVIEW, useMediaQuery } from '~/lib/breakpoint';
import { useStore } from '~/state/store';

export function App(): JSX.Element {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const prefs = useStore((s) => s.prefs);
  const setPref = useStore((s) => s.setPref);
  const storageError = useStore((s) => s.storageError);
  const requestRender = useStore((s) => s.render);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const setDiagnosticCount = useStore((s) => s.setDiagnosticCount);

  const render = useRender();

  const floatPanel = useMediaQuery(`(max-width:${FLOAT_PANEL}px)`);
  const overlayPreview = useMediaQuery(`(max-width:${SPLIT_PREVIEW}px)`);
  const [view, setView] = useState<'canvas' | 'preview'>('canvas');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const splitRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // A floating panel that is open when the window shrinks would cover the
  // document with no way back, so entering that mode closes it.
  useEffect(() => {
    if (floatPanel) setPanelOpen(false);
  }, [floatPanel, setPanelOpen]);

  useEffect(() => {
    const list = render.result?.diagnostics ?? [];
    setDiagnosticCount(list.filter((d) => d.severity !== 'info').length);
  }, [render.result?.signature, render.result?.diagnostics.length, setDiagnosticCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        // While the caret is inside a card's own editor, Ctrl+Enter means what
        // it means in Word: insert a page break where you are — CanvasPane's
        // own shortcut handler owns that case. Only outside of typing (nothing
        // focused, or a whole card merely selected) does Ctrl+Enter still mean
        // "Render", as before this feature existed.
        const target = e.target as HTMLElement | null;
        const typing =
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLInputElement ||
          target?.isContentEditable === true;
        if (typing) return;
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
      setPref('editorWidth', Math.min(72, Math.max(24, Math.round(pct))));
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
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <div className="font-serif text-[22px] tracking-[-0.015em] text-ink-900">
            Sci<i className="font-light not-italic text-deep-600">Render</i>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-400">Đang mở không gian làm việc cục bộ…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar render={render} />

      {storageError ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900">
          {storageError}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <SideRail />
        <SidePanel render={render} floating={floatPanel} />

        <div ref={splitRef} className="relative flex min-w-0 flex-1">
          <div
            className="flex min-w-0 flex-1 flex-col bg-ink-50"
            style={overlayPreview ? undefined : { width: `${prefs.editorWidth}%`, flex: '0 0 auto' }}
          >
            <CanvasPane render={render} viewSwitch={overlayPreview ? { view, setView } : null} />
          </div>

          {overlayPreview ? null : (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Kéo để đổi tỉ lệ soạn thảo và bản in"
              onMouseDown={() => setDragging(true)}
              className={`w-1 shrink-0 cursor-col-resize transition ${
                dragging ? 'bg-sky-500' : 'bg-transparent hover:bg-sky-400/50'
              }`}
            />
          )}

          <div
            className={
              overlayPreview
                ? `absolute bottom-0 right-0 top-0 z-[38] flex w-[min(560px,92vw)] flex-col shadow-[-24px_0_48px_-24px_rgb(var(--ink-900)/0.28)] transition-transform duration-300 ${
                    view === 'preview'
                      ? 'translate-x-0'
                      : 'pointer-events-none translate-x-full'
                  }`
                : 'flex min-w-0 flex-1 flex-col'
            }
          >
            <PreviewPane render={render} onBack={overlayPreview ? () => setView('canvas') : null} />
          </div>
        </div>
      </div>

      <StatusBar render={render} />
      <ShortcutCheatSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} onToggle={() => setShortcutsOpen((v) => !v)} />
      <CommandPalette render={render} />
    </div>
  );
}
