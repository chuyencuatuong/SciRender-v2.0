import { Activity, Clock, Fingerprint, HardDrive } from 'lucide-react';
import type { RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

export function StatusBar({ render }: Props): JSX.Element {
  const source = useStore((s) => s.source);
  const renderedSource = useStore((s) => s.renderedSource);
  const stale = source !== renderedSource;
  const result = render.result;
  const compileMs = result ? result.timings.reduce((a, t) => a + t.ms, 0) : 0;
  const budget = result?.template.descriptor.layout.pageBudget ?? null;
  const bodyPages = render.bodyPageCount;
  const budgetState = !budget || !bodyPages
    ? null
    : bodyPages < budget.min
      ? 'thiếu'
      : bodyPages > budget.max
        ? 'vượt'
        : 'đạt';

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-ink-200 bg-white px-3 text-[11px] text-ink-500">
      <span className="flex items-center gap-1">
        <HardDrive size={11} /> Local-first · không máy chủ
      </span>

      <span className="h-3.5 w-px bg-ink-200" />

      {result ? (
        <>
          <span className="flex items-center gap-1" title="Thời gian từng giai đoạn của pipeline">
            <Clock size={11} />
            {result.timings.map((t) => `${t.stage} ${t.ms}ms`).join(' · ')}
          </span>
          <span className="font-medium text-ink-600">
            biên dịch {compileMs.toFixed(1)} ms · dựng trang {render.durationMs} ms
          </span>

          <span className="h-3.5 w-px bg-ink-200" />

          <span className="flex items-center gap-1">
            <Activity size={11} /> {result.health.stats.words} từ · {render.pages.length} trang ·{' '}
            {result.health.stats.readingMinutes} phút đọc
          </span>

          {budget && budgetState ? (
            <span
              className={
                budgetState === 'đạt'
                  ? 'rounded bg-ink-100 px-1.5 py-0.5 text-ink-600'
                  : 'rounded bg-flag-50 px-1.5 py-0.5 font-medium text-flag-600'
              }
              title={`Điều 1.2.2: phần nội dung ${budget.min}–${budget.max} trang. Đang có ${bodyPages}.`}
            >
              nội dung {bodyPages}/{budget.min}–{budget.max} trang · {budgetState}
            </span>
          ) : null}

          <span
            className="ml-auto flex items-center gap-1 font-mono"
            title="Chữ ký đầu vào: cùng chữ ký ⇒ cùng kết quả bố cục (P2 — Deterministic Rendering)"
          >
            <Fingerprint size={11} /> {result.signature}
            {stale ? <span className="ml-1 text-sky-600">• chưa dựng lại</span> : null}
          </span>
        </>
      ) : (
        <span>Chưa dựng trang. Bấm “Dựng trang” hoặc Ctrl + Enter.</span>
      )}
    </footer>
  );
}
