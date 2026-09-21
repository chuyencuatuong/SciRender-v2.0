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
import { getDocument, listDocuments, loadPreferences, savePreferences } from '@scirender/storage';
import { useAuth } from '~/hooks/useAuth';
import { navigate } from '~/lib/hash-route';
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

export interface EditorShellProps {
  /** `#app?doc=<id>` — a local document the portal asked to open. */
  openDocId?: string | null;
  /** `#app?doc=<id>&action=print` — open, render, then run "In / Lưu PDF". */
  printAfterOpen?: boolean;
}

/**
 * The Core Editor exactly as v2.8 shipped it as `App` — moved here unchanged
 * so the hash router in `App.tsx` can lazy-load it. DAY-1 additions are
 * limited to: not re-running `init()` when the route is re-entered, opening a
 * document requested by the portal, and passing the profile to the store for
 * the BTL cover auto-fill.
 */
export function EditorShell({ openDocId = null, printAfterOpen = false }: EditorShellProps): JSX.Element {
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

  // The store outlives this component (it is a module singleton), so coming
  // back from #dashboard must not re-run init(): that would reload the last
  // document from IndexedDB over edits still waiting for the 900 ms autosave.
  useEffect(() => {
    if (useStore.getState().ready) return;
    if (openDocId) {
      // init() opens `lastDocumentId`; pointing it at the requested document
      // avoids opening one document and then immediately another.
      savePreferences({ ...loadPreferences(), lastDocumentId: openDocId });
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init]);

  // Portal → editor hand-off, for when the store was already initialised.
  const openDocument = useStore((s) => s.openDocument);
  const docId = useStore((s) => s.docId);
  const pendingPrint = useRef(false);
  useEffect(() => {
    if (!ready || !openDocId) return;
    let cancelled = false;
    void (async () => {
      if (useStore.getState().docId !== openDocId) await openDocument(openDocId);
      if (cancelled) return;
      pendingPrint.current = printAfterOpen && useStore.getState().docId === openDocId;
      navigate('app', undefined, true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, openDocId, printAfterOpen, openDocument]);

  // "PDF" from the portal: print once the requested document has rendered.
  const requestPrint = useStore((s) => s.requestPrint);
  useEffect(() => {
    if (!pendingPrint.current || render.running || !render.pages.length) return;
    const { source, renderedSource } = useStore.getState();
    if (source !== renderedSource) return;
    pendingPrint.current = false;
    requestPrint();
  }, [render.running, render.pages.length, render.result?.signature, requestPrint]);

  // A document deleted from the portal while it was the open one must not be
  // resurrected by the next autosave.
  useEffect(() => {
    if (!ready || openDocId || !docId) return;
    void (async () => {
      if (await getDocument(docId).catch(() => true)) return;
      const next = (await listDocuments().catch(() => []))[0];
      const store = useStore.getState();
      if (next) await store.openDocument(next.id);
      else await store.createDocument(false);
    })();
    // Only on (re)entry into the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Profile → BTL cover. Only when the student opted in (auto_fill_cover).
  const { profile } = useAuth();
  const setCoverProfile = useStore((s) => s.setCoverProfile);
  useEffect(() => {
    setCoverProfile(
      profile?.auto_fill_cover
        ? {
            full_name: profile.full_name ?? '',
            student_id: profile.student_id ?? '',
            faculty: profile.faculty ?? '',
            major: profile.major ?? '',
          }
        : null,
    );
  }, [profile, setCoverProfile]);

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
