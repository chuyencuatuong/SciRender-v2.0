import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { useReducedMotion } from '~/lib/motion';
import type { CompileResult } from '~/lib/pipeline';

interface Props {
  result: CompileResult | null;
}

const GRADE_TONE: Record<string, string> = {
  A: 'text-emerald-600',
  B: 'text-sky-600',
  C: 'text-amber-600',
  D: 'text-flag-500',
};

const PRIORITY_TONE: Record<string, string> = {
  high: 'bg-flag-50 text-flag-600',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-sky-50 text-sky-700',
};

export function HealthPanel({ result }: Props): JSX.Element {
  if (!result) {
    return (
      <>
        <div className="sr-panel-title"><h2>Sức khỏe tài liệu</h2></div>
        <p className="px-3 py-8 text-center text-[12px] text-ink-400">Chưa có dữ liệu.</p>
      </>
    );
  }

  const { health } = result;
  const s = health.stats;

  return (
    <>
      <div className="sr-panel-title">
        <h2>Sức khỏe tài liệu</h2>
        <span className={`ml-auto font-serif text-[15px] ${GRADE_TONE[health.grade] ?? ''}`}>
          {health.grade}
        </span>
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="mb-3 flex items-center gap-4 rounded-[14px] bg-[var(--sr-surface)] p-4 shadow-card">
          <ScoreRing score={health.score} />
          <div className="min-w-0">
            <h3 className="m-0 text-[12.5px] font-medium text-ink-900">
              {health.score >= 85
                ? 'Tốt — gần như không còn gì phải sửa'
                : health.score >= 70
                  ? 'Khá — còn vài chỗ nên sửa'
                  : 'Cần rà lại trước khi nộp'}
            </h3>
            <p className="m-0 mt-1 text-[11.5px] leading-[1.45] text-ink-500">
              Điểm đo chất lượng kỹ thuật: cấu trúc, tính đầy đủ, nhất quán. Không đánh giá nội
              dung khoa học.
            </p>
          </div>
        </div>

        <div className="px-1">
          {health.dimensions.map((d) => (
            <div key={d.id} className="py-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12.5px] font-medium text-ink-700">{d.label}</span>
                <span className="font-mono text-[11px] text-ink-500">
                  {d.score}/{d.max}
                </span>
              </div>
              <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-ink-900/[0.07]">
                <motion.div
                  className={`h-full rounded-full ${
                    d.score / d.max >= 0.8
                      ? 'bg-gradient-to-r from-sky-500 to-deep-600'
                      : d.score / d.max >= 0.5
                        ? 'bg-gradient-to-r from-amber-400 to-amber-600'
                        : 'bg-gradient-to-r from-flag-400 to-flag-600'
                  }`}
                  initial={false}
                  animate={{ width: `${(d.score / d.max) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-ink-400">{d.detail}</p>
            </div>
          ))}
        </div>

        {health.suggestions.length > 0 ? (
          <div className="px-1 pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 px-1.5 text-[10px] font-medium uppercase tracking-[0.09em] text-ink-400">
              <Lightbulb size={11} strokeWidth={1.5} className="sr-glow-hint text-amber-600" /> Gợi ý cải thiện
            </div>
            {health.suggestions.map((sg) => (
              <div key={sg.id} className="mb-1.5 rounded-[11px] bg-[var(--sr-surface)] p-2.5 shadow-card">
                <div className="flex items-start gap-1.5">
                  <span className={`sr-chip shrink-0 ${PRIORITY_TONE[sg.priority] ?? ''}`}>
                    {sg.priority === 'high' ? 'Cao' : sg.priority === 'medium' ? 'Vừa' : 'Thấp'}
                  </span>
                  <p className="text-[12px] leading-snug text-ink-700">{sg.message}</p>
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-500">{sg.action}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="px-1 pt-3">
          <div className="mb-1.5 px-1.5 text-[10px] font-medium uppercase tracking-[0.09em] text-ink-400">
            Thống kê
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-1.5 text-[12px]">
            <Row k="Số từ" v={s.words} />
            <Row k="Số đoạn" v={s.paragraphs} />
            <Row k="Đề mục" v={s.headings} />
            <Row k="Độ sâu tối đa" v={s.maxDepth} />
            <Row k="Từ/đoạn (TB)" v={s.avgWordsPerParagraph} />
            <Row k="Từ/câu (TB)" v={s.avgWordsPerSentence} />
            <Row k="Đoạn dài nhất" v={`${s.longestParagraphWords} từ`} />
            <Row k="Thời lượng đọc" v={`${s.readingMinutes} phút`} />
            <Row k="Tài liệu tham khảo" v={s.references} />
            <Row k="Lượt trích dẫn" v={s.citations} />
          </dl>
        </div>
      </div>
    </>
  );
}

/**
 * The score as a ring rather than a bar: it is one number out of a hundred, and
 * a ring says "out of a whole" without a second label. It sweeps once on open,
 * and not at all when the system asks for reduced motion.
 */
function ScoreRing({ score }: { score: number }): JSX.Element {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? score : 0);
  const R = 35;
  const C = 2 * Math.PI * R;

  useEffect(() => {
    if (reduced) {
      setShown(score);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const step = (ts: number): void => {
      if (!t0) t0 = ts;
      const k = Math.min(1, (ts - t0) / 900);
      setShown(Math.round(score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [score, reduced]);

  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
        <defs>
          <linearGradient id="sr-health-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--sky-500))" />
            <stop offset="60%" stopColor="rgb(var(--deep-600))" />
            <stop offset="100%" stopColor="rgb(var(--deep-700))" />
          </linearGradient>
        </defs>
        <circle cx="42" cy="42" r={R} fill="none" stroke="rgb(var(--ink-900) / 0.07)" strokeWidth="6" />
        <circle
          cx="42"
          cy="42"
          r={R}
          fill="none"
          stroke="url(#sr-health-ring)"
          strokeWidth="6"
          strokeLinecap="round"
          transform="rotate(-90 42 42)"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - shown / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <b className="font-serif text-[26px] font-normal tracking-[-0.02em] tabular-nums">
            {shown}
          </b>
          <span className="mt-[3px] block font-mono text-[9px] text-ink-400">/ 100</span>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: number | string }): JSX.Element {
  return (
    <>
      <dt className="text-ink-400">{k}</dt>
      <dd className="text-right font-medium text-ink-700">{v}</dd>
    </>
  );
}
