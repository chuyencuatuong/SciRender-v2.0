import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { listenForShortcuts } from '~/lib/shortcuts';
import { CommandPalette } from '~/components/CommandPalette';
import { QuickFeedbackModal } from '~/components/QuickFeedbackModal';
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
import { AppLoadingScreen } from '~/components/ui/AppLoadingScreen';
import { LazyDialogProvider } from '~/components/ui/dialog-context';

const AuditDialog = lazy(async () => {
  const module = await import('~/components/AuditDialog');
  return { default: module.AuditDialog };
});

const DiagramDialog = lazy(async () => {
  const module = await import('~/components/canvas/DiagramDialog');
  return { default: module.DiagramDialog };
});

const SourceDialog = lazy(async () => {
  const module = await import('~/components/canvas/SourceDialog');
  return { default: module.SourceDialog };
});

const ChartDialog = lazy(async () => {
  const module = await import('~/components/canvas/ChartDialog');
  return { default: module.ChartDialog };
});

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
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const dragRectRef = useRef<DOMRect | null>(null);
  const dragPctRef = useRef(prefs.editorWidth);
  const dragFrameRef = useRef<number | null>(null);
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
    return listenForShortcuts(onKey);
  }, [requestRender]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent): void => {
      const rect = dragRectRef.current;
      const pane = editorPaneRef.current;
      if (!rect || !pane || rect.width <= 0) return;
      dragPctRef.current = Math.min(72, Math.max(24, ((e.clientX - rect.left) / rect.width) * 100));
      if (dragFrameRef.current !== null) return;
      dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const pct = dragPctRef.current;
        pane.style.width = `${pct}%`;
        pane.style.flexBasis = `${pct}%`;
      });
    };
    const onUp = (): void => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      const pct = Math.round(dragPctRef.current);
      const pane = editorPaneRef.current;
      if (pane) {
        pane.style.width = `${pct}%`;
        pane.style.flexBasis = `${pct}%`;
      }
      setPref('editorWidth', pct);
      dragRectRef.current = null;
      setDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, setPref]);

  const shell = !ready ? (
    <AppLoadingScreen />
  ) : (
    <div className="flex h-full flex-col overflow-hidden bg-sr-workspace text-ink-900">
      <TopBar render={render} />

      {storageError ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900">
          {storageError}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <SideRail />
        <SidePanel render={render} floating={floatPanel} />

        <div ref={splitRef} className="relative flex min-w-0 flex-1 bg-sr-workspace">
          <div
            ref={editorPaneRef}
            className="flex min-w-0 flex-1 flex-col bg-sr-workspace"
            style={overlayPreview ? undefined : { width: `${prefs.editorWidth}%`, flex: '0 0 auto' }}
          >
            <CanvasPane render={render} viewSwitch={overlayPreview ? { view, setView } : null} />
          </div>

          {overlayPreview ? null : (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Kéo để đổi tỉ lệ soạn thảo và bản in"
              onMouseDown={() => {
                const host = splitRef.current;
                if (!host) return;
                dragPctRef.current = prefs.editorWidth;
                dragRectRef.current = host.getBoundingClientRect();
                setDragging(true);
              }}
              className={`w-1 shrink-0 cursor-col-resize border-l border-slate-300/80 transition dark:border-slate-700 ${
                dragging ? 'bg-sky-500' : 'bg-transparent hover:bg-sky-400/50'
              }`}
            />
          )}

          <div
            className={
              overlayPreview
                ? `absolute bottom-0 right-0 top-0 z-[38] flex w-[min(560px,92vw)] flex-col border-l border-slate-300/80 bg-sr-paper shadow-[-24px_0_48px_-24px_rgb(var(--ink-900)/0.28)] transition-transform duration-300 dark:border-slate-700 ${
                    view === 'preview'
                      ? 'translate-x-0'
                      : 'pointer-events-none translate-x-full'
                  }`
                : 'sr-preview-divider flex min-w-0 flex-1 flex-col bg-sr-paper shadow-inner'
            }
          >
            <PreviewPane render={render} onBack={overlayPreview ? () => setView('canvas') : null} />
          </div>
        </div>
      </div>

      <StatusBar render={render} />
      <ShortcutCheatSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} onToggle={() => setShortcutsOpen((v) => !v)} />
      <CommandPalette render={render} />
      <QuickFeedbackModal pageCount={render.pages.length} />
    </div>
  );

  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <LazyDialogProvider
        dialogs={{
          AuditDialog,
          DiagramDialog,
          SourceDialog,
          ChartDialog,
        }}
      >
        {shell}
      </LazyDialogProvider>
    </Suspense>
  );
}
