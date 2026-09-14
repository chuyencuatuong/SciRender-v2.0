import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import type { CompileResult } from '~/lib/pipeline';

interface Props {
  result: CompileResult | null;
}

const GRADE_TONE: Record<string, string> = {
  A: 'text-emerald-600',
  B: 'text-sky-600',
  C: 'text-amber-600',
  D: 'text-red-600',
};

const PRIORITY_TONE: Record<string, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-sky-50 text-sky-700',
};

export function HealthPanel({ result }: Props): JSX.Element {
  if (!result) {
    return (
      <>
        <div className="sr-panel-title">Document Health</div>
        <p className="px-3 py-8 text-center text-[12px] text-ink-400">Chưa có dữ liệu.</p>
      </>
    );
  }

  const { health } = result;
  const s = health.stats;

  return (
    <>
      <div className="sr-panel-title">
        <span>Document Health</span>
        <span className={`text-sm font-bold normal-case ${GRADE_TONE[health.grade] ?? ''}`}>
          {health.grade}
        </span>
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-ink-200 px-3 py-4 text-center">
          <div className="text-[34px] font-bold leading-none text-ink-900">{health.score}</div>
          <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-400">trên 100 điểm</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
            <motion.div
              className="h-full rounded-full bg-sci-500"
              initial={false}
              animate={{ width: `${health.score}%` }}
              transition={{ type: 'spring', stiffness: 160, damping: 22 }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-ink-400">
            Điểm đo chất lượng kỹ thuật của tài liệu (cấu trúc, tính đầy đủ, nhất quán), không đánh
            giá nội dung khoa học.
          </p>
        </div>

        <div className="border-b border-ink-200 px-3 py-2">
          {health.dimensions.map((d) => (
            <div key={d.id} className="py-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12.5px] font-medium text-ink-700">{d.label}</span>
                <span className="font-mono text-[11px] text-ink-500">
                  {d.score}/{d.max}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                <motion.div
                  className={`h-full rounded-full ${
                    d.score / d.max >= 0.8
                      ? 'bg-emerald-500'
                      : d.score / d.max >= 0.5
                        ? 'bg-amber-500'
                        : 'bg-red-500'
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
          <div className="border-b border-ink-200 px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              <Lightbulb size={12} /> Gợi ý cải thiện
            </div>
            {health.suggestions.map((sg) => (
              <div key={sg.id} className="mb-2 rounded-md border border-ink-200 p-2">
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

        <div className="px-3 py-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Thống kê
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
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

function Row({ k, v }: { k: string; v: number | string }): JSX.Element {
  return (
    <>
      <dt className="text-ink-400">{k}</dt>
      <dd className="text-right font-medium text-ink-700">{v}</dd>
    </>
  );
}
