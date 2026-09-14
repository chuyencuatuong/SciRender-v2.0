import { AssetsPanel } from './panels/AssetsPanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { HealthPanel } from './panels/HealthPanel';
import { LibraryPanel } from './panels/LibraryPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { TemplatePanel } from './panels/TemplatePanel';
import type { PaginationState } from '~/hooks/usePagination';
import type { CompileResult } from '~/lib/pipeline';
import { useStore } from '~/state/store';

interface Props {
  result: CompileResult | null;
  pagination: PaginationState;
}

export function SidePanel({ result, pagination }: Props): JSX.Element {
  const panel = useStore((s) => s.panel);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-ink-200 bg-white">
      {panel === 'outline' && <OutlinePanel result={result} pagination={pagination} />}
      {panel === 'diagnostics' && <DiagnosticsPanel result={result} pagination={pagination} />}
      {panel === 'health' && <HealthPanel result={result} />}
      {panel === 'assets' && <AssetsPanel />}
      {panel === 'template' && <TemplatePanel result={result} />}
      {panel === 'library' && <LibraryPanel />}
      {panel === 'research' && <ResearchPanel />}
    </aside>
  );
}
