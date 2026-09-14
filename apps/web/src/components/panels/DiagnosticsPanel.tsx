import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, LayoutPanelTop } from 'lucide-react';
import type { Diagnostic, Severity } from '@scirender/ast';
import type { PaginationState } from '~/hooks/usePagination';
import type { CompileResult } from '~/lib/pipeline';
import { useStore } from '~/state/store';

interface Props {
  result: CompileResult | null;
  pagination: PaginationState;
}

const ICONS: Record<Severity, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE: Record<Severity, string> = {
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-sky-600',
};

const LABEL: Record<Severity, string> = {
  error: 'Lỗi',
  warning: 'Cảnh báo',
  info: 'Gợi ý',
};

export function DiagnosticsPanel({ result, pagination }: Props): JSX.Element {
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
        <span>Chẩn đoán</span>
        <span className="font-normal normal-case tracking-normal text-ink-400">
          {diagnostics.length} mục
        </span>
      </div>

      <div className="flex gap-1 border-b border-ink-200 px-2 py-1.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="Tất cả" count={diagnostics.length} tone="text-ink-600" />
        <FilterChip active={filter === 'error'} onClick={() => setFilter('error')} label="Lỗi" count={counts.error} tone="text-red-600" />
        <FilterChip active={filter === 'warning'} onClick={() => setFilter('warning')} label="Cảnh báo" count={counts.warning} tone="text-amber-600" />
        <FilterChip active={filter === 'info'} onClick={() => setFilter('info')} label="Gợi ý" count={counts.info} tone="text-sky-600" />
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto">
        {pagination.warnings.length > 0 ? (
          <div className="border-b border-ink-200 bg-ink-50 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              <LayoutPanelTop size={12} /> Bố cục
            </div>
            {pagination.warnings.map((w, i) => (
              <button
                key={`${w.code}-${i}`}
                onClick={() => w.line && requestGotoLine(w.line)}
                className="block w-full text-left text-[12px] leading-snug text-ink-600 hover:text-ink-900"
              >
                <span className="font-mono text-[10px] text-ink-400">{w.code}</span> {w.message}
              </button>
            ))}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12px] text-ink-400">
            {diagnostics.length === 0
              ? 'Tài liệu biên dịch sạch. Không có vấn đề nào.'
              : 'Không có mục nào ở bộ lọc này.'}
          </p>
        ) : (
          visible.map((d, i) => <DiagnosticRow key={`${d.code}-${i}`} d={d} onGoto={requestGotoLine} />)
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
      className="flex w-full items-start gap-2 border-b border-ink-100 px-3 py-2 text-left transition hover:bg-ink-50"
    >
      <Icon size={13} className={`mt-0.5 shrink-0 ${TONE[d.severity]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[10px] font-semibold uppercase ${TONE[d.severity]}`}>
            {LABEL[d.severity]}
          </span>
          <span className="font-mono text-[10px] text-ink-400">{d.code}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-400">
            d{d.position.start.line}
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-700">{d.message}</p>
        {d.hint ? (
          <p className="mt-1 rounded border-l-2 border-ink-200 bg-ink-50 px-2 py-1 text-[11.5px] leading-snug text-ink-500">
            {d.hint}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded px-1.5 py-1 text-[11px] font-medium transition ${
        active ? 'bg-ink-100 text-ink-800' : 'text-ink-500 hover:bg-ink-50'
      }`}
    >
      {label} <span className={tone}>{count}</span>
    </button>
  );
}
