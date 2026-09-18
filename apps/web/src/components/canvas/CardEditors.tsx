import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpToLine, Plus, Trash2 } from 'lucide-react';
import type { BibEntry, LabelRecord } from '@scirender/ast';
import { renderMath } from '@scirender/equation-engine';
import { evaluateGrid } from '@scirender/table-engine';
import { TABLE_MERGE_MARKER } from '@scirender/parser';
import type { CardKind } from '~/lib/cards';
import {
  headingDepth,
  parseCode,
  parseDiagram,
  parseEquation,
  parseFigure,
  parseTable,
  serializeCode,
  serializeDiagram,
  serializeEquation,
  serializeFigure,
  serializeTable,
  setHeadingDepth,
  type CellAlign,
  type TableForm,
} from '~/lib/card-forms';
import { useStore } from '~/state/store';
import { AutoTextarea } from './AutoTextarea';

export interface EditorProps {
  kind: CardKind;
  text: string;
  onChange: (text: string) => void;
  /** The document's labelled objects — threaded down to `AutoTextarea` for the
   * `@`-mention popover (Hạng mục 1). Absent while nothing has been rendered yet. */
  labels?: Record<string, LabelRecord>;
  bibliography?: BibEntry[];
}

/**
 * Picks the form that fits the card. When the Markdown does not parse into the
 * structured shape — a half-typed table, a fence the author is still writing —
 * the raw editor is shown instead of forcing the text into a grid it does not
 * fit (P1). Nothing is ever silently reshaped.
 */
export function CardEditor(props: EditorProps): JSX.Element {
  switch (props.kind) {
    case 'equation':
      return <EquationEditor {...props} />;
    case 'table':
      return <TableEditor {...props} />;
    case 'codeBlock':
      return <CodeEditor {...props} />;
    case 'diagram':
      return <DiagramEditor {...props} />;
    case 'figure':
      return <FigureEditor {...props} />;
    case 'heading':
      return <HeadingEditor {...props} />;
    case 'pageBreak':
      return <PageBreakEditor {...props} />;
    default:
      return <RawEditor {...props} />;
  }
}

function RawEditor({ text, onChange, kind, labels, bibliography }: EditorProps): JSX.Element {
  return (
    <AutoTextarea
      value={text}
      onChange={onChange}
      ariaLabel={`Nội dung khối ${kind}`}
      placeholder="Nội dung… (gõ @ để chèn tham chiếu, [@ để chèn trích dẫn, / để chèn nhanh khối khác)"
      labels={labels}
      bibliography={bibliography}
    />
  );
}

/* ------------------------------------------------------------- pageBreak */

/**
 * The marker's exact text (`:::pagebreak:::`) is what the parser matches — a
 * free-text box would let one stray keystroke silently turn it back into an
 * ordinary paragraph (P1). There is nothing to type here, so it shows a fixed
 * strip instead of a textarea, the same way a divider is a fact, not prose.
 */
function PageBreakEditor(_props: EditorProps): JSX.Element {
  return (
    <div className="flex items-center gap-2 py-1 text-[12px] font-medium text-flag-600">
      <span className="h-px flex-1 bg-flag-200" aria-hidden="true" />
      <span>Ngắt trang — trang mới bắt đầu ở đây</span>
      <span className="h-px flex-1 bg-flag-200" aria-hidden="true" />
    </div>
  );
}

/* --------------------------------------------------------------- heading */

const DEPTHS = [1, 2, 3, 4];

function HeadingEditor({ text, onChange }: EditorProps): JSX.Element {
  const depth = headingDepth(text) || 1;
  const body = text.trim().replace(/^#{1,6}\s+/, '');
  return (
    <div className="flex items-start gap-2">
      <select
        className="sr-input h-7 !w-[86px] shrink-0 text-[12px]"
        value={depth}
        aria-label="Cấp đề mục"
        onChange={(e) => onChange(setHeadingDepth(text, Number(e.target.value)))}
      >
        {DEPTHS.map((d) => (
          <option key={d} value={d}>
            Cấp {d}
          </option>
        ))}
      </select>
      <input
        className="sr-input min-w-0 flex-1 font-semibold"
        value={body}
        aria-label="Tên đề mục"
        onChange={(e) => onChange(`${'#'.repeat(depth)} ${e.target.value}`)}
      />
    </div>
  );
}

/* -------------------------------------------------------------- equation */

function EquationEditor({ text, onChange, kind, labels, bibliography }: EditorProps): JSX.Element {
  const form = parseEquation(text);
  const [tab, setTab] = useState<'code' | 'preview'>('preview');
  const preview = useMemo(() => (form ? renderMath(form.tex, true) : null), [form?.tex]);
  if (!form) return <RawEditor text={text} onChange={onChange} kind={kind} labels={labels} bibliography={bibliography} />;

  return (
    <div className="overflow-hidden rounded-[12px] bg-ink-50">
      <div className="flex items-center gap-0.5 px-2 pt-1.5" role="tablist" aria-label="Chế độ xem công thức">
        {(['code', 'preview'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`h-6 rounded-t-[7px] px-2.5 font-mono text-[11px] tracking-[0.02em] transition ${
              tab === k ? 'bg-[rgb(var(--ink-50)/0.9)] text-deep-600' : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            {k === 'code' ? 'LaTeX' : 'Xem trước'}
          </button>
        ))}
        {form.label ? (
          <span className="ml-auto pr-1 font-mono text-[10px] text-ink-300">{form.label}</span>
        ) : null}
      </div>

      <div className="px-3 pb-3 pt-1.5">
        {tab === 'code' ? (
          <AutoTextarea
            value={form.tex}
            mono
            ariaLabel="Mã LaTeX"
            bibliography={bibliography}
            onChange={(tex) => onChange(serializeEquation({ ...form, tex }))}
          />
        ) : (
          <div className="min-h-[2rem] overflow-x-auto py-1 text-center">
            {preview?.error ? (
              <span className="text-[12px] text-flag-600">{preview.error}</span>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: preview?.html ?? '' }} />
            )}
          </div>
        )}
        <div className="mt-2">
          <LabelField
            value={form.label}
            placeholder="eq:ten-nhan"
            onChange={(label) => onChange(serializeEquation({ ...form, label }))}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ code block */

const LANGS = [
  '', 'python', 'matlab', 'c', 'cpp', 'arduino', 'java', 'csharp',
  'javascript', 'typescript', 'bash', 'sql', 'json', 'yaml', 'xml', 'r', 'verilog', 'latex',
];

function CodeEditor({ text, onChange, kind, labels, bibliography }: EditorProps): JSX.Element {
  const form = parseCode(text);
  if (!form) return <RawEditor text={text} onChange={onChange} kind={kind} labels={labels} bibliography={bibliography} />;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          className="sr-input h-7 !w-[140px] text-[12px]"
          value={form.lang}
          aria-label="Ngôn ngữ"
          onChange={(e) => onChange(serializeCode({ ...form, lang: e.target.value }))}
        >
          {LANGS.map((l) => (
            <option key={l || 'plain'} value={l}>
              {l || 'không tô màu'}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-[10px] bg-ink-50 px-3 py-2">
        <AutoTextarea
          value={form.code}
          mono
          ariaLabel="Mã nguồn"
          bibliography={bibliography}
          onChange={(code) => onChange(serializeCode({ ...form, code }))}
        />
      </div>
      <CaptionField
        caption={form.caption}
        label={form.label}
        labelHint="lst:ten-nhan"
        onChange={(caption, label) => onChange(serializeCode({ ...form, caption, label }))}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- diagram */

const DIRECTIONS: Array<[string, string]> = [
  ['', 'tự chọn chiều'],
  ['TB', 'dọc (TB)'],
  ['LR', 'ngang (LR)'],
  ['BT', 'dọc ngược (BT)'],
  ['RL', 'ngang ngược (RL)'],
];

function DiagramEditor({ text, onChange, kind, labels, bibliography }: EditorProps): JSX.Element {
  const form = parseDiagram(text);
  if (!form) return <RawEditor text={text} onChange={onChange} kind={kind} labels={labels} bibliography={bibliography} />;
  return (
    <div className="space-y-2">
      <select
        className="sr-input h-7 !w-[170px] text-[12px]"
        value={form.direction}
        aria-label="Chiều sơ đồ"
        onChange={(e) => onChange(serializeDiagram({ ...form, direction: e.target.value }))}
      >
        {DIRECTIONS.map(([v, l]) => (
          <option key={v || 'auto'} value={v}>
            {l}
          </option>
        ))}
      </select>
      <div className="rounded-[10px] bg-ink-50 px-3 py-2">
        <AutoTextarea
          value={form.source}
          mono
          ariaLabel="Mã Mermaid"
          bibliography={bibliography}
          onChange={(source) => onChange(serializeDiagram({ ...form, source }))}
        />
      </div>
      <CaptionField
        caption={form.caption}
        label={form.label}
        labelHint="dia:ten-nhan"
        onChange={(caption, label) => onChange(serializeDiagram({ ...form, caption, label }))}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- figure */

function FigureEditor({ text, onChange, kind, labels, bibliography }: EditorProps): JSX.Element {
  const form = parseFigure(text);
  const assets = useStore((s) => s.assets);
  const assetMap = useStore((s) => s.assetMap);
  if (!form) return <RawEditor text={text} onChange={onChange} kind={kind} labels={labels} bibliography={bibliography} />;

  const src = form.src.startsWith('asset:') ? assetMap[form.src.slice(6)] : form.src;
  return (
    <div className="space-y-2">
      <div className="grid min-h-[80px] place-items-center rounded-[10px] bg-ink-50 p-3">
        {src ? (
          <img src={src} alt={form.alt} className="max-h-40 max-w-full object-contain" />
        ) : (
          <span className="text-[12px] text-flag-600">Không tìm thấy tài nguyên “{form.src}”</span>
        )}
      </div>
      <div className="flex gap-2">
        <select
          className="sr-input h-7 min-w-0 flex-1 text-[12px]"
          value={form.src}
          aria-label="Nguồn ảnh"
          onChange={(e) => onChange(serializeFigure({ ...form, src: e.target.value }))}
        >
          <option value={form.src}>{form.src}</option>
          {assets
            .filter((a) => `asset:${a.name}` !== form.src)
            .map((a) => (
              <option key={a.id} value={`asset:${a.name}`}>
                asset:{a.name}
              </option>
            ))}
        </select>
        <input
          className="sr-input h-7 !w-[90px] shrink-0 text-[12px]"
          value={form.width}
          placeholder="80%"
          aria-label="Chiều rộng"
          onChange={(e) => onChange(serializeFigure({ ...form, width: e.target.value }))}
        />
      </div>
      <input
        className="sr-input"
        value={form.alt}
        placeholder="Chú thích hình"
        aria-label="Chú thích hình"
        onChange={(e) => onChange(serializeFigure({ ...form, alt: e.target.value }))}
      />
      <LabelField
        value={form.label}
        placeholder="fig:ten-nhan"
        onChange={(label) => onChange(serializeFigure({ ...form, label }))}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ table */

const ALIGNS: Array<[CellAlign, string]> = [
  ['default', '—'],
  ['left', '⇤'],
  ['center', '↔'],
  ['right', '⇥'],
  ['decimal', '1.2'],
];

function TableEditor({ text, onChange, kind, labels, bibliography }: EditorProps): JSX.Element {
  const form = parseTable(text);
  if (!form) return <RawEditor text={text} onChange={onChange} kind={kind} labels={labels} bibliography={bibliography} />;
  const width = form.header.length;
  const evaluated = evaluateGrid({ header: form.header, rows: form.rows });

  const push = (next: TableForm): void => onChange(serializeTable(next));

  const setCell = (row: number, col: number, value: string): void => {
    if (row === -1) {
      const header = form.header.slice();
      header[col] = value;
      push({ ...form, header });
      return;
    }
    const rows = form.rows.map((r) => r.slice());
    const target = rows[row] ?? [];
    target[col] = value;
    rows[row] = target;
    push({ ...form, rows });
  };

  const addRow = (): void =>
    push({ ...form, rows: [...form.rows, Array.from({ length: width }, () => '')] });
  const addCol = (): void =>
    push({
      ...form,
      header: [...form.header, ''],
      align: [...form.align, 'default'],
      rows: form.rows.map((r) => [...r, '']),
    });
  const dropRow = (i: number): void =>
    push({ ...form, rows: form.rows.filter((_, k) => k !== i) });
  const dropCol = (i: number): void =>
    push({
      ...form,
      header: form.header.filter((_, k) => k !== i),
      align: form.align.filter((_, k) => k !== i),
      rows: form.rows.map((r) => r.filter((_, k) => k !== i)),
    });

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {form.header.map((h, c) => (
                <th key={c} className="border-b border-ink-900/[0.08] bg-ink-50 p-0 align-top first:rounded-tl-[8px] last:rounded-tr-[8px]">
                  <input
                    className="w-full min-w-[80px] bg-transparent px-1.5 py-1 font-semibold outline-none"
                    value={h}
                    aria-label={`Tiêu đề cột ${c + 1}`}
                    onChange={(e) => setCell(-1, c, e.target.value)}
                  />
                  <div className="flex items-center justify-between border-t border-ink-900/[0.06] px-1 py-0.5">
                    <select
                      className="bg-transparent text-[10px] text-ink-500 outline-none"
                      value={form.align[c] ?? 'default'}
                      aria-label={`Căn lề cột ${c + 1}`}
                      onChange={(e) => {
                        const align = form.align.slice();
                        align[c] = e.target.value as CellAlign;
                        push({ ...form, align });
                      }}
                    >
                      {ALIGNS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-ink-400 hover:text-flag-600 disabled:opacity-25"
                      title={width > 1 ? 'Xóa cột' : 'Bảng phải còn ít nhất một cột'}
                      disabled={width <= 1}
                      onClick={() => dropCol(c)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {form.rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: width }, (_, c) => {
                  const merged = (row[c] ?? '') === TABLE_MERGE_MARKER;
                  return (
                  <td key={c} className="border-b border-ink-900/[0.045] p-0 align-top">
                    <div className="flex items-center">
                      {r > 0 ? (
                        <button
                          type="button"
                          className={`shrink-0 px-1 ${merged ? 'text-deep-600' : 'text-ink-300 hover:text-deep-600'}`}
                          title={
                            merged
                              ? 'Đang gộp với ô phía trên — bấm để bỏ gộp'
                              : 'Gộp với ô phía trên (dòng nhóm)'
                          }
                          onClick={() => setCell(r, c, merged ? '' : TABLE_MERGE_MARKER)}
                        >
                          <ArrowUpToLine size={11} />
                        </button>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <input
                          className="w-full min-w-[80px] bg-transparent px-1.5 py-1 outline-none disabled:text-ink-300"
                          value={row[c] ?? ''}
                          disabled={merged}
                          placeholder={merged ? '(gộp với ô trên)' : undefined}
                          aria-label={`Ô dòng ${r + 1} cột ${c + 1}`}
                          onChange={(e) => setCell(r, c, e.target.value)}
                        />
                        {evaluated.evaluations[r]?.[c]?.formula ? (
                          <div
                            className={`truncate px-1.5 pb-1 text-[9.5px] ${
                              evaluated.evaluations[r]?.[c]?.error ? 'text-flag-600' : 'text-emerald-600'
                            }`}
                            title={evaluated.evaluations[r]?.[c]?.error ?? undefined}
                          >
                            → {evaluated.values[r]?.[c]}
                          </div>
                        ) : null}
                      </div>
                      {c === width - 1 ? (
                        <button
                          type="button"
                          className="px-1 text-ink-300 hover:text-flag-600 disabled:opacity-25"
                          title={form.rows.length > 1 ? 'Xóa dòng' : 'Bảng phải còn ít nhất một dòng'}
                          disabled={form.rows.length <= 1}
                          onClick={() => dropRow(r)}
                        >
                          <Trash2 size={11} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-1.5">
        <MiniBtn onClick={addRow}>
          <Plus size={11} /> dòng
        </MiniBtn>
        <MiniBtn onClick={addCol}>
          <Plus size={11} /> cột
        </MiniBtn>
      </div>
      <CaptionField
        caption={form.caption}
        label={form.label}
        labelHint="tbl:ten-nhan"
        onChange={(caption, label) => push({ ...form, caption, label })}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

function MiniBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-[7px] bg-ink-900/[0.04] px-2 py-1 text-[11px] text-ink-600 transition hover:bg-sky-500/10 hover:text-deep-600"
    >
      {children}
    </button>
  );
}

function LabelField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
      nhãn
      <input
        className="sr-input h-6 min-w-0 flex-1 font-mono text-[11px]"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.trim())}
      />
    </label>
  );
}

function CaptionField({
  caption,
  label,
  labelHint,
  onChange,
}: {
  caption: string;
  label: string;
  labelHint: string;
  onChange: (caption: string, label: string) => void;
}): JSX.Element {
  const [local, setLocal] = useState(caption);
  const last = useRef(caption);
  useEffect(() => {
    if (caption !== last.current) {
      last.current = caption;
      setLocal(caption);
    }
  }, [caption]);

  return (
    <div className="space-y-1.5">
      <input
        className="sr-input"
        value={local}
        placeholder="Chú thích"
        aria-label="Chú thích"
        onChange={(e) => {
          setLocal(e.target.value);
          last.current = e.target.value;
          onChange(e.target.value, label);
        }}
      />
      <LabelField value={label} placeholder={labelHint} onChange={(l) => onChange(caption, l)} />
    </div>
  );
}
