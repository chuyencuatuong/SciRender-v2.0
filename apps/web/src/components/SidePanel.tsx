import { AssetsPanel } from './panels/AssetsPanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { HealthPanel } from './panels/HealthPanel';
import { LibraryPanel } from './panels/LibraryPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { TemplatePanel } from './panels/TemplatePanel';
import type { RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

export function SidePanel({ render }: Props): JSX.Element {
  const panel = useStore((s) => s.panel);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-ink-200 bg-white">
      {panel === 'outline' && <OutlinePanel render={render} />}
      {panel === 'diagnostics' && <DiagnosticsPanel render={render} />}
      {panel === 'health' && <HealthPanel result={render.result} />}
      {panel === 'assets' && <AssetsPanel />}
      {panel === 'template' && <TemplatePanel result={render.result} />}
      {panel === 'library' && <LibraryPanel />}
      {panel === 'research' && <ResearchPanel />}
    </aside>
  );
}
