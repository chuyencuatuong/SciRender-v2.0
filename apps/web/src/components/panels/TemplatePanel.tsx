import { Bold, Italic, RotateCcw, Type } from 'lucide-react';
import { BUILTIN_TEMPLATES, type HeadingLevelStyle } from '@scirender/template-engine';
import type { CompileResult } from '~/lib/pipeline';
import { useStore } from '~/state/store';

interface Props {
  result: CompileResult | null;
}

const SIDE_LABEL: Record<'top' | 'right' | 'bottom' | 'left', string> = {
  top: 'trên',
  right: 'phải',
  bottom: 'dưới',
  left: 'trái',
};

const FRONT_LABEL: Record<string, string> = {
  abstract: 'Tóm tắt bài báo cáo',
  acknowledgement: 'Lời cảm ơn',
  toc: 'Mục lục',
  figureList: 'Danh mục hình ảnh',
  tableList: 'Danh mục bảng biểu',
  abbreviationList: 'Danh mục từ viết tắt',
};

export function TemplatePanel({ result }: Props): JSX.Element {
  const templateId = useStore((s) => s.templateId);
  const setTemplateId = useStore((s) => s.setTemplateId);
  const overrides = useStore((s) => s.overrides);
  const setOverrides = useStore((s) => s.setOverrides);
  const resetOverrides = useStore((s) => s.resetOverrides);

  const t = result?.template.descriptor;
  const metrics = result?.template.metrics;
  const hasOverrides = Object.keys(overrides).length > 0;

  const patchLevel = (index: number, patch: Partial<HeadingLevelStyle>): void => {
    if (!t) return;
    const levels = t.headings.levels.map((lv, i) => (i === index ? { ...lv, ...patch } : lv));
    setOverrides({ headings: { levels } });
  };

  return (
    <>
      <div className="sr-panel-title">
        <h2>Mẫu trình bày</h2>
        {hasOverrides ? (
          <button
            className="ml-auto flex items-center gap-1 text-[11px] text-ink-400 transition hover:text-deep-600"
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
          <p className="mt-2 rounded border-l-2 border-sky-400 bg-sky-50 px-2 py-1 text-[11px] leading-snug text-deep-700">
            Front matter đang chỉ định <code>template: {result.document.meta.templateId}</code> nên
            lựa chọn ở đây bị ghi đè.
          </p>
        ) : null}

        <Divider label="Chữ và giãn dòng" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cỡ chữ nội dung">
            <select
              className="sr-input"
              value={t?.typography.bodySize ?? '13pt'}
              onChange={(e) => setOverrides({ typography: { bodySize: e.target.value } })}
            >
              {['10pt', '11pt', '12pt', '13pt', '14pt'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Giãn dòng ${t?.typography.lineHeight ?? 1.5}`}>
            <input
              type="range"
              min={1}
              max={2}
              step={0.05}
              className="mt-2 w-full accent-deep-600"
              value={t?.typography.lineHeight ?? 1.5}
              onChange={(e) =>
                setOverrides({ typography: { lineHeight: parseFloat(e.target.value) } })
              }
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cách đoạn trước">
            <input
              className="sr-input"
              value={t?.typography.spaceBefore ?? ''}
              onChange={(e) => setOverrides({ typography: { spaceBefore: e.target.value } })}
            />
          </Field>
          <Field label="Cách đoạn sau">
            <input
              className="sr-input"
              value={t?.typography.spaceAfter ?? ''}
              onChange={(e) => setOverrides({ typography: { spaceAfter: e.target.value } })}
            />
          </Field>
        </div>
        <Field label="Canh đều hai biên">
          <Toggle
            checked={t?.typography.justify ?? true}
            onChange={(v) => setOverrides({ typography: { justify: v } })}
          />
        </Field>

        <Divider label="Đề mục theo từng cấp" />
        <div className="rounded-md border border-ink-200">
          {(t?.headings.levels ?? []).slice(0, 4).map((lv, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 border-b border-ink-100 px-2 py-1.5 last:border-b-0"
            >
              <span className="w-7 shrink-0 font-mono text-[11px] text-ink-400">H{i + 1}</span>
              <input
                className="sr-input !w-16 !px-1.5 !py-1 text-center"
                value={lv.size}
                onChange={(e) => patchLevel(i, { size: e.target.value })}
                title="Cỡ chữ"
              />
              <IconToggle
                active={lv.weight >= 600}
                onClick={() => patchLevel(i, { weight: lv.weight >= 600 ? 400 : 700 })}
                title="Đậm"
              >
                <Bold size={13} />
              </IconToggle>
              <IconToggle
                active={lv.italic}
                onClick={() => patchLevel(i, { italic: !lv.italic })}
                title="Nghiêng"
              >
                <Italic size={13} />
              </IconToggle>
              <IconToggle
                active={lv.uppercase}
                onClick={() => patchLevel(i, { uppercase: !lv.uppercase })}
                title="IN HOA"
              >
                <Type size={13} />
              </IconToggle>
              <IconToggle
                active={lv.pageBreakBefore}
                onClick={() => patchLevel(i, { pageBreakBefore: !lv.pageBreakBefore })}
                title="Sang trang mới"
              >
                <span className="font-mono text-[10px]">PB</span>
              </IconToggle>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-ink-400">
          Quy cách BTL: H1 14pt in hoa sang trang mới · H2 13pt đậm · H3 13pt đậm nghiêng · H4 13pt
          nghiêng.
        </p>

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
        <div className="grid grid-cols-2 gap-2">
          <Field label="Số trang cách đáy">
            <input
              className="sr-input"
              value={t?.page.footerFromBottom ?? ''}
              onChange={(e) => setOverrides({ page: { footerFromBottom: e.target.value } })}
            />
          </Field>
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
        </div>

        <Divider label="Bìa và phần đầu" />
        <Field label="Trang bìa">
          <select
            className="sr-input"
            value={t?.cover.layout ?? 'none'}
            onChange={(e) => setOverrides({ cover: { layout: e.target.value as 'none' | 'hcmut' } })}
          >
            <option value="hcmut">Bìa Bách khoa</option>
            <option value="none">Không có bìa</option>
          </select>
        </Field>
        <Field label="Có phụ bìa (danh sách thành viên)">
          <Toggle
            checked={t?.cover.innerCover ?? false}
            onChange={(v) => setOverrides({ cover: { innerCover: v } })}
          />
        </Field>
        <Field label="Phần đầu (tóm tắt, mục lục, danh mục)">
          <Toggle
            checked={t?.frontMatter.enabled ?? false}
            onChange={(v) => setOverrides({ frontMatter: { enabled: v } })}
          />
        </Field>
        {t?.frontMatter.enabled ? (
          <div className="mb-2 rounded-md border border-ink-200">
            {t.frontMatter.sections.map((sec, i) => (
              <label
                key={sec.kind}
                className="flex items-center gap-2 border-b border-ink-100 px-2 py-1.5 text-[12px] text-ink-700 last:border-b-0"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-deep-600"
                  checked={sec.enabled}
                  onChange={(e) => {
                    const sections = t.frontMatter.sections.map((s, k) =>
                      k === i ? { ...s, enabled: e.target.checked } : s,
                    );
                    setOverrides({ frontMatter: { sections } });
                  }}
                />
                {FRONT_LABEL[sec.kind] ?? sec.kind}
              </label>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Số trang phần đầu">
            <select
              className="sr-input"
              value={t?.layout.frontPageNumbers ?? 'roman-lower'}
              onChange={(e) =>
                setOverrides({ layout: { frontPageNumbers: e.target.value as 'roman-lower' } })
              }
            >
              <option value="roman-lower">i, ii, iii</option>
              <option value="roman-upper">I, II, III</option>
              <option value="arabic">1, 2, 3</option>
              <option value="none">Không đánh số</option>
            </select>
          </Field>
          <Field label="Số trang nội dung">
            <select
              className="sr-input"
              value={t?.layout.bodyPageNumbers ?? 'arabic'}
              onChange={(e) =>
                setOverrides({ layout: { bodyPageNumbers: e.target.value as 'arabic' } })
              }
            >
              <option value="arabic">1, 2, 3</option>
              <option value="roman-lower">i, ii, iii</option>
              <option value="none">Không đánh số</option>
            </select>
          </Field>
        </div>

        <Divider label="Đánh số đối tượng" />
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
        <Field label="Kiểu số hình / bảng / công thức">
          <select
            className="sr-input"
            value={t?.numbering.figures ?? 'section'}
            onChange={(e) => {
              const v = e.target.value as 'section' | 'continuous';
              setOverrides({
                numbering: { figures: v, tables: v, diagrams: v, listings: v, equationStyle: v },
              });
            }}
          >
            <option value="section">Theo chương (1.1, 1.2…)</option>
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

        <Divider label="Sơ đồ khối" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Chiều mặc định">
            <select
              className="sr-input"
              value={t?.diagrams.defaultDirection ?? 'TB'}
              onChange={(e) =>
                setOverrides({ diagrams: { defaultDirection: e.target.value as 'TB' } })
              }
            >
              <option value="TB">Dọc (trên → dưới)</option>
              <option value="LR">Ngang (trái → phải)</option>
              <option value="BT">Dọc ngược</option>
              <option value="RL">Ngang ngược</option>
            </select>
          </Field>
          <Field label="Cỡ chữ trong sơ đồ">
            <input
              className="sr-input"
              value={t?.diagrams.fontSize ?? ''}
              onChange={(e) => setOverrides({ diagrams: { fontSize: e.target.value } })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Khoảng cách nút">
            <input
              type="number"
              className="sr-input"
              value={t?.diagrams.nodeSpacing ?? 40}
              onChange={(e) =>
                setOverrides({ diagrams: { nodeSpacing: parseInt(e.target.value, 10) || 40 } })
              }
            />
          </Field>
          <Field label="Khoảng cách hàng">
            <input
              type="number"
              className="sr-input"
              value={t?.diagrams.rankSpacing ?? 46}
              onChange={(e) =>
                setOverrides({ diagrams: { rankSpacing: parseInt(e.target.value, 10) || 46 } })
              }
            />
          </Field>
        </div>
        <p className="mb-2 text-[11px] leading-snug text-ink-400">
          Đặt riêng cho một sơ đồ bằng thuộc tính{' '}
          <code className="rounded bg-ink-100 px-1">dir=LR</code> trong dòng chú thích.
        </p>

        <Divider label="Khối mã" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cỡ chữ">
            <input
              className="sr-input"
              value={t?.code.fontSize ?? ''}
              onChange={(e) => setOverrides({ code: { fontSize: e.target.value } })}
            />
          </Field>
          <Field label="Đánh số dòng">
            <Toggle
              checked={t?.code.lineNumbers ?? false}
              onChange={(v) => setOverrides({ code: { lineNumbers: v } })}
            />
          </Field>
        </div>
        <Field label="Tự xuống dòng khi quá dài">
          <Toggle
            checked={t?.code.wrap ?? false}
            onChange={(v) => setOverrides({ code: { wrap: v } })}
          />
        </Field>
        <Field label="Tô màu cú pháp (tắt nếu in trắng đen)">
          <Toggle
            checked={t?.code.highlight ?? false}
            onChange={(v) => setOverrides({ code: { highlight: v } })}
          />
        </Field>

        <Divider label="Chống mồ côi / góa" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Orphans (cuối trang)">
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
          <Field label="Widows (đầu trang)">
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
              Vùng nội dung: {Math.round(metrics.contentWidthPx)} ×{' '}
              {Math.round(metrics.contentHeightPx)} px
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
      <span className="text-[11px] font-semibold uppercase tracking-wider text-deep-600">
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
      className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-deep-600' : 'bg-ink-300'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function IconToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-6 w-6 place-items-center rounded transition ${
        active ? 'bg-deep-600 text-white' : 'text-ink-400 hover:bg-ink-100 hover:text-ink-700'
      }`}
    >
      {children}
    </button>
  );
}
