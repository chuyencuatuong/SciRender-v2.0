import { ChevronLeft } from 'lucide-react';
import { AssetsPanel } from './panels/AssetsPanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { HealthPanel } from './panels/HealthPanel';
import { LibraryPanel } from './panels/LibraryPanel';
import { ObjectsPanel } from './panels/ObjectsPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { CitationPanel } from './panels/CitationPanel';
import { TemplatePanel } from './panels/TemplatePanel';
import type { RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
  /** True below 1000px, where the panel floats over the canvas instead of pushing it. */
  floating: boolean;
}

/**
 * The side panel pushes the canvas on a wide screen and floats over it on a
 * narrow one. Both states are the same element — only its positioning changes —
 * so nothing can end up half-open in one mode and stuck in the other.
 */
export function SidePanel({ render, floating }: Props): JSX.Element {
  const panel = useStore((s) => s.panel);
  const open = useStore((s) => s.panelOpen);
  const setPanelOpen = useStore((s) => s.setPanelOpen);

  return (
    <>
      <aside
        data-panel-open={open}
        aria-hidden={!open}
        className={
          floating
            ? `fixed bottom-[30px] left-[56px] top-[60px] z-[41] w-[min(300px,84vw)] flex-col rounded-r-2xl bg-sr-card shadow-elevation-float transition-[transform,opacity] duration-200 ${
                open ? 'flex translate-x-0 opacity-100' : 'pointer-events-none flex -translate-x-2 opacity-0'
              }`
            : `sr-chrome flex w-[272px] shrink-0 flex-col border-r transition-[margin-left,opacity] duration-300 ${
                open ? 'ml-0 opacity-100' : 'pointer-events-none -ml-[272px] opacity-0'
              }`
        }
      >
        {panel === 'outline' && <OutlinePanel render={render} />}
        {panel === 'objects' && <ObjectsPanel render={render} />}
        {panel === 'diagnostics' && <DiagnosticsPanel render={render} />}
        {panel === 'health' && <HealthPanel result={render.result} />}
        {panel === 'assets' && <AssetsPanel />}
        {panel === 'template' && <TemplatePanel result={render.result} />}
        {panel === 'library' && <LibraryPanel />}
        {panel === 'research' && <ResearchPanel />}
        {panel === 'references' && <CitationPanel render={render} />}
      </aside>

      {floating ? (
        <button
          aria-label="Đóng bảng bên"
          onClick={() => setPanelOpen(false)}
          className={`fixed inset-0 z-40 bg-ink-900/25 transition-[opacity] duration-200 ${
            open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />
      ) : (
        <button
          onClick={() => setPanelOpen(!open)}
          aria-label={open ? 'Thu gọn bảng bên' : 'Mở bảng bên'}
          style={{ left: open ? 'calc(56px + 272px)' : '56px' }}
          className="absolute top-1/2 z-[45] grid h-11 w-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[9px] bg-[var(--sr-surface)] text-ink-400 shadow-card transition-[left,color] duration-300 hover:text-deep-600"
        >
          <ChevronLeft
            size={12}
            strokeWidth={2}
            className={open ? '' : 'rotate-180'}
          />
        </button>
      )}
    </>
  );
}
