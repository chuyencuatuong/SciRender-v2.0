import { RotateCcw } from 'lucide-react';
import { BUILTIN_TEMPLATES } from '@scirender/template-engine';
import type { CompileResult } from '~/lib/pipeline';
import { useStore } from '~/state/store';

interface Props {
  result: CompileResult | null;
}

export function TemplatePanel({ result }: Props): JSX.Element {
  const templateId = useStore((s) => s.templateId);
  const setTemplateId = useStore((s) => s.setTemplateId);
  const overrides = useStore((s) => s.overrides);
  const setOverrides = useStore((s) => s.setOverrides);
  const resetOverrides = useStore((s) => s.resetOverrides);

  const t = result?.template.descriptor;
  const metrics = result?.template.metrics;
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <>
      <div className="sr-panel-title">
        <span>Template</span>
        {hasOverrides ? (
          <button
            className="flex items-center gap-1 normal-case tracking-normal text-ink-400 hover:text-ink-700"
            onClick={resetOverrides}
          >
            <RotateCcw size={11} /> Đặt lại
          </button>
        ) : null}
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <label className="sr-field-label">Bố cục cơ sở</label>
        <select
          className="sr-input"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          {BUILTIN_TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
        {t ? <p className="mt-1.5 text-[11px] leading-snug text-ink-400">{t.description}</p> : null}

        {result?.document.meta.templateId ? (
          <p className="mt-2 rounded border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800">
            Front matter đang chỉ định <code>template: {result.document.meta.templateId}</code> nên
            lựa chọn ở đây bị ghi đè.
          </p>
        ) : null}

        <Divider label="Chữ và giãn dòng" />
        <Field label="Cỡ chữ nội dung">
          <select
            className="sr-input"
            value={t?.typography.bodySize ?? '13pt'}
            onChange={(e) => setOverrides({ typography: { bodySize: e.target.value } })}
          >
            {['10pt', '11pt', '11.5pt', '12pt', '13pt', '14pt'].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Giãn dòng: ${t?.typography.lineHeight ?? 1.5}`}>
          <input
            type="range"
            min={1}
            max={2}
            step={0.05}
            className="w-full accent-sci-600"
            value={t?.typography.lineHeight ?? 1.5}
            onChange={(e) =>
              setOverrides({ typography: { lineHeight: parseFloat(e.target.value) } })
            }
          />
        </Field>
        <Field label="Canh đều hai biên">
          <Toggle
            checked={t?.typography.justify ?? true}
            onChange={(v) => setOverrides({ typography: { justify: v } })}
          />
        </Field>

        <Divider label="Trang" />
        <div className="grid grid-cols-2 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <Field key={side} label={`Lề ${SIDE_LABEL[side]}`}>
              <input
                className="sr-input"
                value={t?.page.margin[side] ?? ''}
                onChange={(e) =>
                  setOverrides({
                    page: {
                      margin: {
                        top: t?.page.margin.top ?? '0mm',
                        right: t?.page.margin.right ?? '0mm',
                        bottom: t?.page.margin.bottom ?? '0mm',
                        left: t?.page.margin.left ?? '0mm',
                        [side]: e.target.value,
                      },
                    },
                  })
                }
              />
            </Field>
          ))}
        </div>
        <Field label="Số cột">
          <select
            className="sr-input"
            value={t?.page.columns ?? 1}
            onChange={(e) => setOverrides({ page: { columns: parseInt(e.target.value, 10) } })}
          >
            <option value={1}>1 cột</option>
            <option value={2}>2 cột</option>
          </select>
        </Field>

        <Divider label="Đánh số" />
        <Field label="Công thức">
          <select
            className="sr-input"
            value={t?.numbering.equations ?? 'all'}
            onChange={(e) =>
              setOverrides({
                numbering: { equations: e.target.value as 'all' | 'labelled' | 'none' },
              })
            }
          >
            <option value="all">Đánh số mọi công thức khối</option>
            <option value="labelled">Chỉ công thức có nhãn</option>
            <option value="none">Không đánh số</option>
          </select>
        </Field>
        <Field label="Kiểu số hình/bảng/công thức">
          <select
            className="sr-input"
            value={t?.numbering.figures ?? 'section'}
            onChange={(e) => {
              const v = e.target.value as 'section' | 'continuous';
              setOverrides({
                numbering: { figures: v, tables: v, diagrams: v, equationStyle: v },
              });
            }}
          >
            <option value="section">Theo mục (1.1, 1.2…)</option>
            <option value="continuous">Liên tục (1, 2, 3…)</option>
          </select>
        </Field>
        <Field label="Độ sâu đánh số đề mục">
          <select
            className="sr-input"
            value={t?.headings.numberDepth ?? 4}
            onChange={(e) =>
              setOverrides({ headings: { numberDepth: parseInt(e.target.value, 10) } })
            }
          >
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {d === 0 ? 'Không đánh số' : `Tới cấp ${d}`}
              </option>
            ))}
          </select>
        </Field>

        <Divider label="Chống mồ côi / góa" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Orphans (dòng tối thiểu cuối trang)">
            <input
              type="number"
              min={1}
              max={6}
              className="sr-input"
              value={t?.layout.orphans ?? 2}
              onChange={(e) =>
                setOverrides({ layout: { orphans: Math.max(1, parseInt(e.target.value, 10) || 1) } })
              }
            />
          </Field>
          <Field label="Widows (dòng tối thiểu đầu trang)">
            <input
              type="number"
              min={1}
              max={6}
              className="sr-input"
              value={t?.layout.widows ?? 2}
              onChange={(e) =>
                setOverrides({ layout: { widows: Math.max(1, parseInt(e.target.value, 10) || 1) } })
              }
            />
          </Field>
        </div>
        <Field label="Giữ đề mục cùng nội dung kế tiếp">
          <Toggle
            checked={t?.layout.keepHeadingWithNext ?? true}
            onChange={(v) => setOverrides({ layout: { keepHeadingWithNext: v } })}
          />
        </Field>
        <Field label="Hiện số trang">
          <Toggle
            checked={t?.layout.showPageNumbers ?? true}
            onChange={(v) => setOverrides({ layout: { showPageNumbers: v } })}
          />
        </Field>

        <Divider label="Nhãn tiếng Việt" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Hình">
            <input
              className="sr-input"
              value={t?.labels.figure ?? ''}
              onChange={(e) =>
                setOverrides({ labels: { figure: e.target.value, refFigure: e.target.value } })
              }
            />
          </Field>
          <Field label="Bảng">
            <input
              className="sr-input"
              value={t?.labels.table ?? ''}
              onChange={(e) =>
                setOverrides({ labels: { table: e.target.value, refTable: e.target.value } })
              }
            />
          </Field>
        </div>
        <Field label="Tiêu đề mục tài liệu tham khảo">
          <input
            className="sr-input"
            value={t?.labels.references ?? ''}
            onChange={(e) => setOverrides({ labels: { references: e.target.value } })}
          />
        </Field>

        {metrics ? (
          <div className="mt-4 rounded-md border border-ink-200 bg-ink-50 p-2 text-[11px] text-ink-500">
            <div className="mb-1 font-semibold uppercase tracking-wider">Số đo dẫn xuất</div>
            <div>
              Vùng nội dung: {Math.round(metrics.contentWidthPx)} × {Math.round(metrics.contentHeightPx)} px
            </div>
            <div>Chiều cao một dòng: {metrics.lineHeightPx.toFixed(2)} px</div>
            <div>
              Ước lượng {Math.floor(metrics.contentHeightPx / metrics.lineHeightPx)} dòng/trang
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

const SIDE_LABEL: Record<'top' | 'right' | 'bottom' | 'left', string> = {
  top: 'trên',
  right: 'phải',
  bottom: 'dưới',
  left: 'trái',
};

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-2.5">
      <label className="sr-field-label">{label}</label>
      {children}
    </div>
  );
}

function Divider({ label }: { label: string }): JSX.Element {
  return (
    <div className="mb-2 mt-4 flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </span>
      <span className="h-px flex-1 bg-ink-200" />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-sci-600' : 'bg-ink-300'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
