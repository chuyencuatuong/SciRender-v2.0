import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, FileText, Hash, Table2, X, XCircle } from 'lucide-react';
import type { AuditCheck, AuditReport } from '@scirender/intelligence';
import { useStore } from '~/state/store';
import type { RenderState } from '~/hooks/useRender';

interface Props {
  open: boolean;
  onClose: () => void;
  render: RenderState;
  stale: boolean;
  onRender: () => void;
}

const GROUPS: Array<{ id: AuditCheck['group']; title: string }> = [
  { id: 'orphan', title: 'Đối tượng & trích dẫn' },
  { id: 'structure', title: 'Cấu trúc tài liệu' },
  { id: 'consistency', title: 'Tính nhất quán' },
  { id: 'layout', title: 'Dàn trang & công thức' },
];

export function AuditDialog({ open, onClose, render, stale, onRender }: Props): JSX.Element | null {
  if (!open) return null;
  const audit = render.audit;
  const requestGotoLine = useStore((s) => s.requestGotoLine);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Kiểm tra trước khi nộp"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink-900/[0.1] bg-[var(--sr-surface)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-ink-900/[0.06] px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <ClipboardCheck size={18} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-ink-900">Kiểm tra trước khi nộp</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-400">Quét AST + metadata + dàn trang bằng luật local-first, không dùng AI.</p>
          </div>
          <button type="button" className="sr-rail-btn ml-auto !h-8 !w-8" onClick={onClose} aria-label="Đóng">
            <X size={15} />
          </button>
        </div>

        {stale ? (
          <div className="flex items-center gap-3 border-b border-amber-500/15 bg-amber-500/10 px-5 py-3 text-[12px] text-amber-800">
            <AlertTriangle size={15} />
            <span className="min-w-0 flex-1">Nội dung đang chỉnh sửa khác với bản đã dựng. Báo cáo kiểm toán hiện dựa trên lần dựng gần nhất.</span>
            <button type="button" className="sr-btn-ghost !h-8 !px-2.5" onClick={onRender} disabled={render.running}>
              Dựng lại
            </button>
          </div>
        ) : null}

        {!audit ? (
          <div className="grid min-h-[260px] place-items-center p-8 text-center text-[12px] text-ink-400">
            <div>
              <FileText size={24} className="mx-auto mb-2 opacity-50" />
              <p>Chưa có kết quả kiểm toán.</p>
              <button type="button" className="sr-btn-render mt-3" onClick={onRender}>Dựng và kiểm tra</button>
            </div>
          </div>
        ) : (
          <AuditBody audit={audit} onGoto={requestGotoLine} />
        )}
      </div>
    </div>
  );
}

function AuditBody({ audit, onGoto }: { audit: AuditReport; onGoto: (line: number) => void }): JSX.Element {
  const stats = audit.stats;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 border-b border-ink-900/[0.06] p-4 sm:grid-cols-4 lg:grid-cols-7">
        <Stat icon={<FileText size={13} />} label="Trang" value={stats.pages} />
        <Stat icon={<Hash size={13} />} label="Từ" value={stats.words} />
        <Stat icon={<FileText size={13} />} label="Hình" value={stats.figures} />
        <Stat icon={<Table2 size={13} />} label="Bảng" value={stats.tables} />
        <Stat icon={<Hash size={13} />} label="Công thức" value={stats.equations} />
        <Stat icon={<FileText size={13} />} label="Trích dẫn" value={stats.citations} />
        <Stat icon={<FileText size={13} />} label="Tài liệu" value={stats.references} />
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-ink-900/[0.06] px-4 py-3">
        <Summary tone="pass" label="ĐẠT" value={audit.passed} />
        <Summary tone="warning" label="CẢNH BÁO" value={audit.warnings} />
        <Summary tone="error" label="LỖI" value={audit.errors} />
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto p-6 space-y-3">
        {audit.ready ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-3 text-[12px] text-emerald-700">
            <CheckCircle2 size={15} />
            <span>Tài liệu không còn cảnh báo trong các quy tắc kiểm toán hiện tại.</span>
          </div>
        ) : null}

        <div className="space-y-5">
          {GROUPS.map((group) => {
            const rows = audit.checks.filter((check) => check.group === group.id);
            if (!rows.length) return null;
            return (
              <section key={group.id}>
                <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-400">{group.title}</h3>
                <div className="overflow-hidden rounded-xl border border-ink-900/[0.06]">
                  {rows.map((check) => <AuditRow key={check.id} check={check} onGoto={onGoto} />)}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

function AuditRow({ check, onGoto }: { check: AuditCheck; onGoto: (line: number) => void }): JSX.Element {
  const pass = check.severity === 'pass';
  const error = check.severity === 'error';
  const icon = pass ? <CheckCircle2 size={15} /> : error ? <XCircle size={15} /> : <AlertTriangle size={15} />;
  const tone = pass ? 'text-emerald-600 bg-emerald-500/10' : error ? 'text-flag-600 bg-flag-500/10' : 'text-amber-700 bg-amber-500/10';
  return (
    <div className="flex gap-2.5 border-b border-ink-900/[0.05] px-3.5 py-3 last:border-b-0">
      <span className={`mt-px grid h-7 w-7 shrink-0 place-items-center rounded-[8px] ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-ink-900">{check.label}</span>
          <span className="sr-code">{check.code}</span>
          {check.line ? <span className="ml-auto font-mono text-[10px] text-ink-400">d{check.line}</span> : null}
        </div>
        <p className="mt-0.5 text-[12px] leading-[1.5] text-ink-600">{check.message}</p>
        {check.hint ? <p className="mt-1 text-[11px] leading-[1.45] text-ink-400">{check.hint}</p> : null}
      </div>
      {check.line && !pass ? (
        <button type="button" className="sr-btn-ghost h-7 shrink-0 !px-2 text-[10.5px]" onClick={() => onGoto(check.line!)}>
          <ArrowRight size={12} /> Đi tới
        </button>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }): JSX.Element {
  return <div className="rounded-xl bg-ink-900/[0.025] px-2.5 py-2"><div className="flex items-center gap-1 text-[10px] text-ink-400">{icon}{label}</div><div className="mt-0.5 font-mono text-[14px] font-semibold text-ink-800">{value}</div></div>;
}

function Summary({ tone, label, value }: { tone: 'pass' | 'warning' | 'error'; label: string; value: number }): JSX.Element {
  const cls = tone === 'pass' ? 'text-emerald-700 bg-emerald-500/10' : tone === 'warning' ? 'text-amber-700 bg-amber-500/10' : 'text-flag-600 bg-flag-500/10';
  return <div className={`rounded-xl px-3 py-2 text-center ${cls}`}><div className="text-[10px] font-medium tracking-wide">{label}</div><div className="mt-0.5 font-mono text-[15px] font-semibold">{value}</div></div>;
}
