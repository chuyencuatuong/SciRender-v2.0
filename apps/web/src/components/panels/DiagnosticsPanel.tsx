import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, LayoutPanelTop, Lightbulb } from 'lucide-react';
import type { Diagnostic, Severity } from '@scirender/ast';
import type { RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

const ICONS: Record<Severity, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Lightbulb,
};

/**
 * Severity reads from the icon's tile, not from a border around the row.
 * The bulb glows faintly because a suggestion is an offer, not an alarm — the
 * two error tones stay flat so they never compete with it for attention.
 */
const TILE: Record<Severity, string> = {
  error: 'bg-flag-50 text-flag-600',
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-amber-50 text-amber-600 sr-glow-hint',
};

export function DiagnosticsPanel({ render }: Props): JSX.Element {
  const result = render.result;
  const requestGotoLine = useStore((s) => s.requestGotoLine);
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  const diagnostics = result?.diagnostics ?? [];
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    for (const d of diagnostics) c[d.severity]++;
    return c;
  }, [diagnostics]);

  const visible = filter === 'all' ? diagnostics : diagnostics.filter((d) => d.severity === filter);

  return (
    <>
      <div className="sr-panel-title">
        <h2>Chẩn đoán</h2>
        <span className="ml-auto font-mono text-[11px] text-ink-400">{diagnostics.length} mục</span>
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="flex flex-wrap gap-1 px-1 pb-3" role="group" aria-label="Lọc chẩn đoán">
          <Pill on={filter === 'all'} onClick={() => setFilter('all')} label="Tất cả" n={diagnostics.length} />
          <Pill on={filter === 'error'} onClick={() => setFilter('error')} label="Lỗi" n={counts.error} />
          <Pill on={filter === 'warning'} onClick={() => setFilter('warning')} label="Cảnh báo" n={counts.warning} />
          <Pill on={filter === 'info'} onClick={() => setFilter('info')} label="Gợi ý" n={counts.info} />
        </div>

        {render.warnings.length > 0 ? (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.09em] text-ink-400">
              <LayoutPanelTop size={11} strokeWidth={1.5} /> Bố cục
            </div>
            {render.warnings.map((w, i) => (
              <button
                key={`${w.code}-${i}`}
                onClick={() => w.line && requestGotoLine(w.line)}
                className="flex w-full gap-2.5 rounded-[11px] px-2.5 py-[11px] text-left transition hover:bg-[var(--sr-surface)] hover:shadow-card"
              >
                <span className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-[8px] bg-sky-500/10 text-deep-600">
                  <LayoutPanelTop size={13} strokeWidth={1.6} />
                </span>
                <span className="min-w-0">
                  <span className="mb-0.5 flex items-center gap-1.5">
                    <span className="sr-code">{w.code}</span>
                  </span>
                  <span className="block text-[12px] leading-[1.45] text-ink-700">{w.message}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="px-3 py-10 text-center text-[12px] leading-relaxed text-ink-400">
            {diagnostics.length === 0
              ? 'Tài liệu biên dịch sạch. Không có vấn đề nào.'
              : 'Không có mục nào ở bộ lọc này.'}
          </p>
        ) : (
          visible.map((d, i) => (
            <DiagnosticRow key={`${d.code}-${i}`} d={d} onGoto={requestGotoLine} />
          ))
        )}
      </div>
    </>
  );
}

function DiagnosticRow({
  d,
  onGoto,
}: {
  d: Diagnostic;
  onGoto: (line: number) => void;
}): JSX.Element {
  const Icon = ICONS[d.severity];
  return (
    <button
      onClick={() => onGoto(d.position.start.line)}
      className="flex w-full gap-2.5 rounded-[11px] px-2.5 py-[11px] text-left transition hover:bg-[var(--sr-surface)] hover:shadow-card"
    >
      <span className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-[8px] ${TILE[d.severity]}`}>
        <Icon size={13} strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 flex items-center gap-1.5">
          <span className="sr-code">{d.code}</span>
          <span className="ml-auto font-mono text-[10.5px] text-ink-400">
            d{d.position.start.line}
          </span>
        </span>
        <span className="block text-[12px] leading-[1.45] text-ink-700">{d.message}</span>
        {d.hint ? (
          <span className="mt-1.5 block rounded-[7px] bg-ink-900/[0.03] px-2 py-1.5 text-[11.5px] leading-[1.45] text-ink-500">
            {d.hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Pill({
  on,
  onClick,
  label,
  n,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  n: number;
}): JSX.Element {
  return (
    <button className="sr-pill" aria-pressed={on} onClick={onClick}>
      {label}
      <span className="ml-1 font-mono text-[10px] opacity-60">{n}</span>
    </button>
  );
}
