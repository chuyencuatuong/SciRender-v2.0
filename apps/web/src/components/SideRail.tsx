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
  { id: 'outline', label: 'Dàn ý', icon: ListTree },
  { id: 'diagnostics', label: 'Chẩn đoán', icon: Stethoscope },
  { id: 'health', label: 'Sức khỏe tài liệu', icon: Gauge },
  { id: 'assets', label: 'Tài nguyên', icon: Image },
  { id: 'template', label: 'Mẫu trình bày', icon: LayoutTemplate },
  { id: 'library', label: 'Thư viện', icon: Library },
  { id: 'research', label: 'Dữ liệu nghiên cứu', icon: FlaskConical },
];

/**
 * The dock. Clicking the tab you are already on closes the panel, so the icon
 * bar doubles as the show/hide control — one target instead of two.
 */
export function SideRail(): JSX.Element {
  const panel = useStore((s) => s.panel);
  const panelOpen = useStore((s) => s.panelOpen);
  const setPanel = useStore((s) => s.setPanel);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const errors = useStore((s) => s.diagnosticCount);

  return (
    <nav
      className="sr-frost-soft z-40 flex w-[56px] shrink-0 flex-col items-center gap-1 border-r border-ink-900/[0.06] py-2.5"
      aria-label="Bảng bên"
    >
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const selected = panel === id && panelOpen;
        return (
          <button
            key={id}
            className={`sr-rail-btn group ${selected ? 'sr-rail-btn-active' : ''}`}
            onClick={() => {
              if (panel === id && panelOpen) setPanelOpen(false);
              else {
                setPanel(id);
                setPanelOpen(true);
              }
            }}
            aria-label={label}
            aria-pressed={selected}
          >
            <Icon size={19} strokeWidth={1.5} />
            {id === 'diagnostics' && errors > 0 ? (
              <span className="absolute right-1 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-flag-500 px-[3px] text-[9px] font-semibold leading-none text-white ring-2 ring-white/90">
                {errors}
              </span>
            ) : null}
            <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-[7px] bg-ink-900 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
