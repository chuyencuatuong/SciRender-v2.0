import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ChevronRight, HardDrive } from 'lucide-react';
import type { RenderState } from '~/hooks/useRender';
import { useReducedMotion } from '~/lib/motion';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

/**
 * The status bar answers one question at a glance — "is my report the right
 * length, and is what I see current?" — and keeps the engineering numbers
 * behind a toggle. They were the noisiest thing on screen and mattered on
 * roughly none of the occasions they were shown.
 */
export function StatusBar({ render }: Props): JSX.Element {
  const source = useStore((s) => s.source);
  const renderedSource = useStore((s) => s.renderedSource);
  const showTech = useStore((s) => s.prefs.showTechStats);
  const setPref = useStore((s) => s.setPref);
  const reduced = useReducedMotion();

  const stale = source !== renderedSource;
  const result = render.result;
  const compileMs = result ? result.timings.reduce((a, t) => a + t.ms, 0) : 0;
  const budget = result?.template.descriptor.layout.pageBudget ?? null;
  const bodyPages = render.bodyPageCount;
  const budgetState =
    !budget || !bodyPages
      ? null
      : bodyPages < budget.min
        ? 'thiếu'
        : bodyPages > budget.max
          ? 'vượt'
          : 'đạt';

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-ink-200 bg-white px-3 text-[11px] text-ink-500">
      {result ? (
        <>
          <span className="flex items-center gap-1 font-medium text-ink-700">
            <Activity size={11} /> {render.pages.length} trang
          </span>
          <span className="text-ink-500">
            {result.health.stats.words} từ · {result.health.stats.readingMinutes} phút đọc
          </span>

          {budget && budgetState ? (
            <span
              className={
                budgetState === 'đạt'
                  ? 'rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700'
                  : 'rounded bg-flag-50 px-1.5 py-0.5 font-medium text-flag-600'
              }
              title={`Điều 1.2.2: phần nội dung ${budget.min}–${budget.max} trang. Đang có ${bodyPages}.`}
            >
              nội dung {bodyPages}/{budget.min}–{budget.max} trang · {budgetState}
            </span>
          ) : null}

          {stale ? (
            <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">
              chưa dựng lại · Ctrl + Enter
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => setPref('showTechStats', !showTech)}
            aria-expanded={showTech}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <ChevronRight
              size={11}
              className={`transition-transform duration-150 ${showTech ? 'rotate-90' : ''}`}
            />
            Chi tiết kỹ thuật
          </button>

          <AnimatePresence initial={false}>
            {showTech ? (
              <motion.span
                initial={reduced ? false : { opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={reduced ? undefined : { opacity: 0, width: 0 }}
                transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                className="flex items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[10.5px] text-ink-400"
              >
                <span title="Thời gian từng giai đoạn của pipeline">
                  {result.timings.map((t) => `${t.stage} ${t.ms}ms`).join(' · ')}
                </span>
                <span className="text-ink-500">
                  biên dịch {compileMs.toFixed(1)}ms · dựng {render.durationMs}ms
                </span>
                <span
                  title="Chữ ký đầu vào: cùng chữ ký ⇒ cùng kết quả bố cục (P2 — Deterministic Rendering)"
                  className="rounded bg-ink-100 px-1 py-0.5"
                >
                  {result.signature}
                </span>
                <span className="flex items-center gap-1 text-ink-400">
                  <HardDrive size={10} /> local-first
                </span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </>
      ) : (
        <span>Chưa dựng trang. Bấm “Dựng trang” hoặc Ctrl + Enter.</span>
      )}
    </footer>
  );
}
