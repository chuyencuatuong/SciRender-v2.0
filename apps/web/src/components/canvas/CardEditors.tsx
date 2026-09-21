import { Suspense, useEffect, useState } from 'react';
import { sanitizeContent } from '~/lib/security';
import { Code2 } from 'lucide-react';
import {
  headingDepth,
  parseCode,
  parseDiagram,
  parseEquation,
  parseFigure,
  serializeCode,
  serializeDiagram,
  serializeEquation,
  serializeFigure,
  setHeadingDepth,
} from '~/lib/card-forms';
import { useStore } from '~/state/store';
import { AutoTextarea } from './AutoTextarea';
import { applyDiagramViewport, renderDiagramSvg } from '~/lib/diagram-studio';
import { AppLoadingScreen } from '~/components/ui/AppLoadingScreen';
import { ensureKatexCss } from '~/lib/katex-css';
import { useLazyDialogs } from '~/components/ui/dialog-context';
import { CaptionField, LabelField } from '../editors/EditorFields';
import { RawEditor } from '../editors/RawEditor';
import { TableEditor } from '../editors/table/TableEditor';
import type { EditorProps } from '../editors/types';

export type { EditorProps } from '../editors/types';

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
  // Never trim the editable body: trailing spaces are real caret input.
  // Trimming here caused the last character/space to disappear on each render.
  const body = text.replace(/^#{1,6}[ \t]?/, '');
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
          <EquationPreview tex={form.tex} />
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

function EquationPreview({ tex }: { tex: string }): JSX.Element {
  const [preview, setPreview] = useState<{ html: string; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    void Promise.all([ensureKatexCss(), import('@scirender/equation-engine')])
      .then(([, { renderMath }]) => renderMath(tex, true))
      .then((value) => {
        if (!cancelled) setPreview({ ...value, html: sanitizeContent(value.html, 'document-render') });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreview({ html: '', error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [tex]);

  return (
    <div className="min-h-[2rem] overflow-x-auto py-1 text-center">
      {preview === null ? (
        <span className="text-[11px] text-ink-400">Đang biên dịch công thức…</span>
      ) : preview.error ? (
        <span className="text-[12px] text-flag-600">{preview.error}</span>
      ) : (
        <span dangerouslySetInnerHTML={{ __html: preview.html }} />
      )}
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

function DiagramEditor({ text, onChange, kind, labels, bibliography, onSaveDiagramAsset, suppressLandscape }: EditorProps): JSX.Element {
  const form = parseDiagram(text);
  const { DiagramDialog } = useLazyDialogs();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const previewSource = form?.source ?? '';
  const [thumb, setThumb] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!previewSource.trim()) { setThumb(''); return () => { cancelled = true; }; }
    const timer = window.setTimeout(() => {
      void renderDiagramSvg(previewSource, { curve: form?.curve, theme: form?.theme, direction: (form?.direction || undefined) as 'TB' | 'BT' | 'LR' | 'RL' | undefined })
        .then((svg) => { if (!cancelled) setThumb(sanitizeContent(svg, 'document-render')); })
        .catch(() => { if (!cancelled) setThumb(''); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [previewSource, form?.curve, form?.theme, form?.direction]);

  if (!form) return <RawEditor text={text} onChange={onChange} kind={kind} labels={labels} bibliography={bibliography} />;
  const setForm = (patch: Partial<typeof form>): void => onChange(serializeDiagram({ ...form, ...patch }));
  const saveAsset = async (options: { nodeSpacing: number; rankSpacing: number; viewX: number; viewY: number; viewZoom: number } = { nodeSpacing: 32, rankSpacing: 36, viewX: 0, viewY: 0, viewZoom: 1 }): Promise<void> => {
    if (!onSaveDiagramAsset || !form.source.trim()) return;
    setBusy(true);
    try {
      let svg = await renderDiagramSvg(form.source, { curve: form.curve, theme: form.theme, direction: (form.direction || undefined) as 'TB' | 'BT' | 'LR' | 'RL' | undefined, nodeSpacing: options.nodeSpacing, rankSpacing: options.rankSpacing });
      svg = applyDiagramViewport(svg, options.viewX, options.viewY, options.viewZoom);
      const name = await onSaveDiagramAsset(svg, form.label || 'dia:technical-diagram');
      if (name) {
        setForm({
          asset: `asset:${name}`,
          attrs: {
            ...form.attrs,
            'view-x': String(Math.round(options.viewX * 100) / 100),
            'view-y': String(Math.round(options.viewY * 100) / 100),
            'view-zoom': String(Math.round(options.viewZoom * 1000) / 1000),
          },
        });
      }
      setSaved(Boolean(name));
      if (name) window.setTimeout(() => setSaved(false), 1800);
    } finally { setBusy(false); }
  };
  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-[var(--sr-card)] dark:border-white/[.07] dark:bg-[var(--sr-panel)]">
        <div className="relative min-h-[138px] overflow-hidden bg-[var(--sr-sunk)] p-3">
          {thumb ? <div className="pointer-events-none flex max-h-[138px] items-center justify-center overflow-hidden opacity-90" dangerouslySetInnerHTML={{ __html: thumb }} /> : <div className="grid min-h-[110px] place-items-center text-[11px] text-slate-500">Chưa có bản xem trước sơ đồ</div>}
          <button type="button" onClick={() => setOpen(true)} className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--sr-panel)] px-2.5 py-1.5 text-[10.5px] font-medium text-white shadow-lg backdrop-blur-md hover:bg-white/10"><Code2 size={12}/> Mở Diagram Studio</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/80 px-3 py-2 dark:border-white/[.07]">
          <span className="font-mono text-[10px] text-slate-400">{form.label || 'dia:ten-nhan'}</span>
          <span className="ml-auto text-[10px] text-slate-400">{form.direction || 'Auto'} · {form.curve}</span>
          {!suppressLandscape ? <label className="inline-flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-300"><input type="checkbox" checked={form.landscape} onChange={(e) => setForm({ landscape: e.target.checked })} />Khổ ngang</label> : null}
        </div>
      </div>
      <Suspense fallback={<AppLoadingScreen compact />}>
        <DiagramDialog open={open} form={form} bibliography={bibliography} labels={labels} onChange={setForm} onSave={saveAsset} onClose={() => setOpen(false)} busy={busy} saved={saved} />
      </Suspense>
    </>
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
