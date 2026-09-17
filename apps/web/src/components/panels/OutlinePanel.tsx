import { useMemo } from 'react';
import { Hash } from 'lucide-react';
import { plainText, walk } from '@scirender/ast';
import type { RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

interface OutlineItem {
  id: string;
  depth: number;
  number: string | null;
  text: string;
  line: number;
}

export function OutlinePanel({ render }: Props): JSX.Element {
  const result = render.result;
  const requestGotoLine = useStore((s) => s.requestGotoLine);

  const items = useMemo<OutlineItem[]>(() => {
    if (!result) return [];
    const out: OutlineItem[] = [];
    walk(result.document, (n) => {
      if (n.type === 'heading') {
        out.push({
          id: n.id,
          depth: n.depth,
          number: n.number,
          text: plainText(n) || '(đề mục rỗng)',
          line: n.position.start.line,
        });
      }
      return undefined;
    });
    return out;
  }, [result?.signature]);

  const counts = result?.health.stats;

  return (
    <>
      <div className="sr-panel-title">
        <h2>Dàn ý</h2>
        <span className="ml-auto font-mono text-[11px] text-ink-400">
          {items.length} đề mục
        </span>
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto py-1">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-ink-400">
            Chưa có đề mục nào.
            <br />
            Dùng <code className="rounded bg-ink-100 px-1"># Tên mục</code> để tạo cấu trúc.
          </p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              onClick={() => requestGotoLine(item.line)}
              className="group flex w-full items-start gap-2 px-3 py-1.5 text-left transition hover:bg-ink-50"
              style={{ paddingLeft: `${10 + (item.depth - 1) * 12}px` }}
            >
              <Hash size={12} className="mt-1 shrink-0 text-ink-300 group-hover:text-sky-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink-700 group-hover:text-ink-900">
                  {item.number ? (
                    <span className="mr-1 font-medium text-deep-600">{item.number}</span>
                  ) : null}
                  {item.text}
                </span>
              </span>
              {render.pageOfNode[item.id] ? (
                <span className="mt-0.5 shrink-0 text-[10px] text-ink-400">
                  tr.{render.pageOfNode[item.id]}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>

      {counts ? (
        <div className="grid grid-cols-2 gap-px border-t border-ink-200 bg-ink-200 text-[11px]">
          <Stat label="Hình" value={counts.figures} />
          <Stat label="Bảng" value={counts.tables} />
          <Stat label="Công thức" value={counts.equations} />
          <Stat label="Sơ đồ" value={counts.diagrams} />
          <Stat label="Tham chiếu" value={counts.crossRefs} />
          <Stat label="Trích dẫn" value={counts.citations} />
        </div>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="bg-[var(--sr-surface)] px-3 py-1.5">
      <span className="text-ink-400">{label}: </span>
      <span className="font-medium text-ink-700">{value}</span>
    </div>
  );
}
