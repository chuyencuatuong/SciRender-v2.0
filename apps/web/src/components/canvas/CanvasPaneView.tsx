import { Suspense } from 'react';
import { Braces, Columns2, FileText, Redo2, Undo2 } from 'lucide-react';
import { FrontMatterDialog } from './FrontMatterDialog';
import { InsertMenu } from './InsertMenu';
import { parseTable, serializeFigure } from '~/lib/card-forms';
import type { CanvasController } from './CanvasPaneController';
import { AppLoadingScreen } from '~/components/ui/AppLoadingScreen';
import { useLazyDialogs } from '~/components/ui/dialog-context';

interface Props {
  controller: CanvasController;
}

export function CanvasPaneView({ controller }: Props): JSX.Element {
  const { SourceDialog, ChartDialog } = useLazyDialogs();
  const viewSwitch = controller.viewSwitch;
  const chartRequest = controller.chartRequest;
  return (
    <>
      <div className="sr-canvas-toolbar flex h-11 shrink-0 items-center gap-1.5 overflow-hidden border-b border-slate-200/80 px-3 dark:border-slate-800">
        <InsertMenu onInsert={(tpl) => controller.insertAt(controller.viewportInsertIndex(), tpl.text)} />
        <button
          type="button"
          onClick={() => controller.setSplitView((v) => !v)}
          aria-pressed={controller.splitView}
          title="Chia đôi khung soạn — xem hai chỗ trong cùng tài liệu cùng lúc"
          className={`inline-flex h-[28px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-medium transition ${
            controller.splitView
              ? 'border-sky-200 bg-sky-50 text-sky-700 shadow-sm dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300'
              : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100'
          }`}
        >
          <Columns2 size={13} strokeWidth={1.5} /> Chia đôi
        </button>

        {viewSwitch ? (
          <div
            role="tablist"
            aria-label="Khung nhìn"
            className="flex h-[30px] items-center gap-0.5 rounded-full border border-slate-200/80 bg-slate-100/80 px-[3px] dark:border-slate-700 dark:bg-slate-900/70"
          >
            {(['canvas', 'preview'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={viewSwitch.view === v}
                onClick={() => viewSwitch.setView(v)}
                className={`h-[24px] rounded-full px-2.5 text-[11.5px] transition ${
                  viewSwitch.view === v
                    ? 'bg-white font-medium text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {v === 'canvas' ? 'Soạn' : 'Bản in'}
              </button>
            ))}
          </div>
        ) : null}

        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-slate-200 md:block dark:bg-slate-700" />
        <button
          type="button"
          onClick={() => controller.setShowFront(true)}
          title="Thông tin tài liệu — tên nhóm, GVHD, MSSV"
          className="hidden h-[28px] shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[11.5px] text-slate-500 transition hover:border-slate-200 hover:bg-white hover:text-slate-900 md:inline-flex dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <FileText size={13} strokeWidth={1.5} /> Thông tin
        </button>
        <button
          type="button"
          onClick={() => controller.setShowSource(true)}
          title="Xem mã nguồn Markdown của tài liệu"
          className="hidden h-[28px] shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[11.5px] text-slate-500 transition hover:border-slate-200 hover:bg-white hover:text-slate-900 lg:inline-flex dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <Braces size={13} strokeWidth={1.5} /> Mã nguồn
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-slate-200/80 bg-white/70 p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
          <button
            type="button"
            title="Hoàn tác (Ctrl+Z)"
            aria-label="Hoàn tác"
            onClick={controller.undo}
            className="grid h-[26px] w-[26px] place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Undo2 size={13} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            title="Làm lại (Ctrl+Y)"
            aria-label="Làm lại"
            onClick={controller.redo}
            className="grid h-[26px] w-[26px] place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Redo2 size={13} strokeWidth={1.5} />
          </button>
          <span className="whitespace-nowrap px-2 font-mono text-[10.5px] text-slate-400">
            {controller.doc.cards.length} khối
          </span>
        </div>
      </div>

      {controller.splitView ? (
        <div
          ref={(node) => {
            controller.splitBoxRef.current = node;
            if (node) {
              controller.splitPctRef.current = controller.splitPct;
              controller.splitLeftRef.current = node.firstElementChild as HTMLDivElement | null;
              controller.splitRightRef.current = node.lastElementChild as HTMLDivElement | null;
            }
          }}
          className="flex min-h-0 flex-1 flex-row"
        >
          <div ref={controller.splitLeftRef} style={{ width: `${controller.splitPct}%` }} className="flex min-h-0 flex-col">
            {controller.renderPane(controller.listRef)}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để đổi chiều rộng hai khung"
            onMouseDown={() => {
              const box = controller.splitBoxRef.current;
              if (!box) return;
              controller.splitPctRef.current = controller.splitPct;
              controller.splitDragRectRef.current = box.getBoundingClientRect();
              controller.setSplitDragging(true);
            }}
            className="w-[5px] shrink-0 cursor-col-resize border-x border-ink-900/[0.06] bg-ink-900/[0.03] hover:bg-deep-100"
          />
          <div ref={controller.splitRightRef} style={{ width: `${100 - controller.splitPct}%` }} className="flex min-h-0 flex-col">
            {controller.renderPane(controller.listRef2)}
          </div>
        </div>
      ) : (
        controller.renderPane(controller.listRef)
      )}

      {controller.showSource ? (
        <Suspense fallback={<AppLoadingScreen compact />}>
          <SourceDialog
            source={controller.toSource(controller.doc)}
            onClose={() => controller.setShowSource(false)}
            onApply={(text) => {
              controller.mine.current = '';
              controller.setSource(text);
              controller.setShowSource(false);
            }}
          />
        </Suspense>
      ) : null}

      {controller.showFront ? (
        <FrontMatterDialog
          value={controller.doc.frontMatter}
          onClose={() => controller.setShowFront(false)}
          onApply={(frontMatter) => {
            controller.commit({ ...controller.doc, frontMatter });
            controller.setShowFront(false);
          }}
        />
      ) : null}

      {chartRequest ? (
        (() => {
          const form = parseTable(chartRequest.table);
          if (!form) return null;
          return (
            <Suspense fallback={<AppLoadingScreen compact />}>
              <ChartDialog
                form={form}
                defaultLabel={chartRequest.label}
                onClose={() => controller.setChartRequest(null)}
                onCreate={async (svg, meta) => {
                  const safeBase = meta.label.replace(/^fig:/, '') || `chart-${chartRequest.index + 1}`;
                  const assetName = await controller.addGeneratedAsset(svg, `chart-${safeBase}.svg`, 'image/svg+xml');
                  const markdown = serializeFigure({
                    alt: meta.caption,
                    src: `asset:${assetName}`,
                    label: meta.label,
                    width: meta.width,
                  });
                  controller.insertAt(chartRequest.index + 1, markdown, meta.label);
                  controller.setChartRequest(null);
                }}
              />
            </Suspense>
          );
        })()
      ) : null}
    </>
  );
}
