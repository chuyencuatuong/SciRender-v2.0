import { useMemo, useState } from 'react';
import { Check, Pencil, TriangleAlert, X } from 'lucide-react';
import type { LabelRecord } from '@scirender/ast';
import type { RenderState } from '~/hooks/useRender';
import { REF_KIND_ICON, REF_KIND_LABEL, REF_KIND_ORDER } from '~/lib/refs';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

/**
 * The object manager half of Hạng mục 1 — the cross-reference *engine* (AST
 * node, two-pass numbering, orphan/broken-ref diagnostics) already existed
 * before this panel; this only surfaces what it already computes: every
 * `{#kind:id}` in the document, grouped by kind, click-to-scroll, a warning
 * on whatever nothing `@`-references yet (reusing the validator's own
 * SR-V031 orphan check — never a second orphan scan), and rename-in-place.
 */
export function ObjectsPanel({ render }: Props): JSX.Element {
  const result = render.result;
  const requestGotoLine = useStore((s) => s.requestGotoLine);
  const renameLabel = useStore((s) => s.renameLabel);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const labels = result?.document.labels ?? {};

  const orphanNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const d of result?.diagnostics ?? []) {
      if (d.code === 'SR-V031' && d.nodeId) set.add(d.nodeId);
    }
    return set;
  }, [result?.signature]);

  const groups = useMemo(() => {
    const rows = Object.values(labels).sort((a, b) => a.position.start.line - b.position.start.line);
    const byKind = new Map<string, LabelRecord[]>();
    for (const rec of rows) {
      const list = byKind.get(rec.kind) ?? [];
      list.push(rec);
      byKind.set(rec.kind, list);
    }
    return REF_KIND_ORDER.map((kind) => ({ kind, rows: byKind.get(kind) ?? [] })).filter(
      (g) => g.rows.length > 0,
    );
  }, [labels]);

  const total = Object.keys(labels).length;
  const orphanCount = Object.values(labels).filter((r) => orphanNodeIds.has(r.nodeId)).length;

  const startEdit = (rec: LabelRecord): void => {
    setEditing(rec.label);
    setDraft(rec.label.slice(rec.label.indexOf(':') + 1));
  };

  const commitEdit = (rec: LabelRecord): void => {
    const newId = draft.trim();
    setEditing(null);
    if (!newId || newId === rec.label.slice(rec.label.indexOf(':') + 1)) return;
    if (!/^[A-Za-z0-9_-]+$/.test(newId)) {
      window.alert('Nhãn chỉ nên gồm chữ, số, gạch ngang và gạch dưới.');
      return;
    }
    const newFull = `${rec.kind}:${newId}`;
    if (labels[newFull] && labels[newFull]?.nodeId !== rec.nodeId) {
      window.alert(`Nhãn "${newFull}" đã được dùng cho một đối tượng khác.`);
      return;
    }
    const ok = renameLabel(rec.label, newFull, rec.position.start.line);
    if (!ok) {
      window.alert(
        `Không tìm thấy khai báo "#${rec.label}" ở dòng ${rec.position.start.line} để đổi tên — có thể tài liệu đã thay đổi, hãy bấm "Dựng trang" rồi thử lại.`,
      );
    }
  };

  return (
    <>
      <div className="sr-panel-title">
        <h2>Đối tượng</h2>
        <span className="ml-auto font-mono text-[11px] text-ink-400">{total} đối tượng</span>
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto py-1">
        {total === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-ink-400">
            Chưa có đối tượng nào có nhãn.
            <br />
            Thêm <code className="rounded bg-ink-100 px-1">{'{#fig:ten-nhan}'}</code> vào cuối hình,
            bảng, công thức… rồi tham chiếu bằng <code className="rounded bg-ink-100 px-1">@fig:ten-nhan</code>.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.kind} className="pb-1">
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-[0.09em] text-ink-400">
                {REF_KIND_LABEL[g.kind]} · {g.rows.length}
              </div>
              {g.rows.map((rec) => {
                const Icon = REF_KIND_ICON[rec.kind];
                const isOrphan = orphanNodeIds.has(rec.nodeId);
                const isEditing = editing === rec.label;
                return (
                  <div
                    key={rec.label}
                    className="group flex items-center gap-2 px-3 py-1.5 hover:bg-ink-50"
                  >
                    <button
                      type="button"
                      title={isOrphan ? 'Chưa được tham chiếu ở đâu — bấm để cuộn tới' : 'Cuộn tới đối tượng'}
                      onClick={() => requestGotoLine(rec.position.start.line)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <Icon size={13} className="mt-0.5 shrink-0 text-ink-300 group-hover:text-sky-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-ink-700 group-hover:text-ink-900">
                          {rec.number ? (
                            <span className="mr-1 font-medium text-deep-600">
                              {REF_KIND_LABEL[rec.kind]} {rec.number}
                            </span>
                          ) : null}
                        </span>
                        {isEditing ? (
                          <span className="mt-0.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <span className="shrink-0 font-mono text-[10.5px] text-ink-400">{rec.kind}:</span>
                            <input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit(rec);
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              className="sr-input h-5 min-w-0 flex-1 !px-1 font-mono text-[10.5px]"
                            />
                            <button
                              type="button"
                              title="Lưu"
                              onClick={(e) => {
                                e.stopPropagation();
                                commitEdit(rec);
                              }}
                              className="shrink-0 text-emerald-600"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              title="Hủy"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(null);
                              }}
                              className="shrink-0 text-ink-400"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ) : (
                          <span className="block truncate font-mono text-[10.5px] text-ink-400">
                            {rec.label}
                          </span>
                        )}
                      </span>
                    </button>

                    {!isEditing ? (
                      <>
                        {isOrphan ? (
                          <TriangleAlert
                            size={12}
                            className="shrink-0 text-amber-500"
                            aria-label="Chưa được tham chiếu ở đâu"
                          />
                        ) : null}
                        <button
                          type="button"
                          title="Đổi nhãn"
                          onClick={() => startEdit(rec)}
                          className="shrink-0 text-ink-300 opacity-0 transition hover:text-deep-600 group-hover:opacity-100"
                        >
                          <Pencil size={12} />
                        </button>
                        {render.pageOfNode[rec.nodeId] ? (
                          <span className="shrink-0 text-[10px] text-ink-400">
                            tr.{render.pageOfNode[rec.nodeId]}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {orphanCount > 0 ? (
        <div className="flex items-center gap-1.5 border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
          <TriangleAlert size={12} className="shrink-0" />
          {orphanCount} đối tượng chưa được <code className="font-mono">@</code>-tham chiếu ở đâu.
        </div>
      ) : null}
    </>
  );
}
