import {
  FlaskConical,
  Gauge,
  Image,
  LayoutTemplate,
  Library,
  ListTree,
  Stethoscope,
} from 'lucide-react';
import { useStore, type PanelId } from '~/state/store';

const ITEMS: Array<{ id: PanelId; label: string; icon: typeof ListTree }> = [
  { id: 'outline', label: 'Cấu trúc tài liệu', icon: ListTree },
  { id: 'diagnostics', label: 'Chẩn đoán', icon: Stethoscope },
  { id: 'health', label: 'Document Health', icon: Gauge },
  { id: 'assets', label: 'Tài nguyên', icon: Image },
  { id: 'template', label: 'Template', icon: LayoutTemplate },
  { id: 'library', label: 'Thư viện tài liệu', icon: Library },
  { id: 'research', label: 'Dữ liệu nghiên cứu', icon: FlaskConical },
];

export function SideRail(): JSX.Element {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-ink-200 bg-white py-2">
      {ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={`sr-rail-btn ${panel === id ? 'sr-rail-btn-active' : ''}`}
          onClick={() => setPanel(id)}
          title={label}
          aria-label={label}
          aria-pressed={panel === id}
        >
          <Icon size={17} />
        </button>
      ))}
    </nav>
  );
}
