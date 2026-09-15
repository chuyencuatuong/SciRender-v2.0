import { useState } from 'react';
import {
  CheckCircle2,
  FileDown,
  FilePlus2,
  Loader2,
  Play,
  Printer,
  Save,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { exportStandaloneHtml, printDocument } from '@scirender/renderer-pdf';
import { importBundle, exportBundle } from '@scirender/storage';
import { track } from '@scirender/telemetry';
import type { RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

export function TopBar({ render }: Props): JSX.Element {
  const title = useStore((s) => s.title);
  const dirty = useStore((s) => s.dirty);
  const savedAt = useStore((s) => s.savedAt);
  const save = useStore((s) => s.save);
  const createDocument = useStore((s) => s.createDocument);
  const docId = useStore((s) => s.docId);
  const refreshLibrary = useStore((s) => s.refreshLibrary);
  const openDocument = useStore((s) => s.openDocument);
  const requestRender = useStore((s) => s.render);
  const source = useStore((s) => s.source);
  const renderedSource = useStore((s) => s.renderedSource);
  const [busy, setBusy] = useState(false);

  const stale = source !== renderedSource;
  const result = render.result;
  const errors = result?.diagnostics.filter((d) => d.severity === 'error').length ?? 0;
  const warnings = result?.diagnostics.filter((d) => d.severity === 'warning').length ?? 0;

  const pageHtml = render.pages.map((p) => p.html);
  const footers = render.pages.map((p) => p.footer);

  const onPrint = (): void => {
    if (!result || !render.pages.length) return;
    track('export.print', { pages: render.pages.length });
    printDocument({
      pages: pageHtml,
      template: result.template,
      footers,
      documentTitle: result.document.meta.title || title,
    });
  };

  const onExportHtml = (): void => {
    if (!result) return;
    const html = exportStandaloneHtml({
      pages: pageHtml.length ? pageHtml : result.blocks,
      template: result.template,
      footers,
      documentTitle: result.document.meta.title || title,
      katexCss: readKatexCss(),
      lang: result.document.meta.language,
    });
    download(`${slug(title)}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
    track('export.html', { pages: render.pages.length, bytes: html.length });
  };

  const onExportBundle = async (): Promise<void> => {
    setBusy(true);
    try {
      const bundle = await exportBundle(docId);
      if (!bundle) return;
      download(
        `${slug(title)}.scirender.json`,
        new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
      );
      track('export.bundle', { assets: bundle.assets.length });
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (file: File): Promise<void> => {
    setBusy(true);
    try {
      const text = await file.text();
      const id = await importBundle(JSON.parse(text));
      await refreshLibrary();
      await openDocument(id);
    } catch (err) {
      window.alert(`Không nhập được tệp: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-3">
      <div className="flex items-center gap-2 pr-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-deep-600 text-[13px] font-bold text-white">
          S
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-ink-900">SciRender</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-400">
            Document Intelligence Studio
          </div>
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-ink-200" />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[13px] font-medium text-ink-800" title={title}>
          {title}
        </span>
        <SaveState dirty={dirty} savedAt={savedAt} />
      </div>

      <div className="flex items-center gap-2">
        {result ? (
          errors > 0 ? (
            <span className="sr-chip bg-flag-50 text-flag-600">
              <TriangleAlert size={12} /> {errors} lỗi
            </span>
          ) : (
            <span className="sr-chip bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={12} /> Không lỗi
            </span>
          )
        ) : null}
        {warnings > 0 ? (
          <span className="sr-chip bg-amber-50 text-amber-700">{warnings} cảnh báo</span>
        ) : null}

        <button
          className={stale ? 'sr-btn-render' : 'sr-btn'}
          onClick={requestRender}
          disabled={render.running}
          title="Dựng lại trang (Ctrl + Enter)"
        >
          {render.running ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          Dựng trang
        </button>

        <div className="mx-1 h-6 w-px bg-ink-200" />

        <button className="sr-btn" onClick={() => void createDocument(false)} title="Tài liệu mới">
          <FilePlus2 size={14} /> Mới
        </button>
        <button className="sr-btn" onClick={() => void save()} disabled={!dirty}>
          <Save size={14} /> Lưu
        </button>

        <label className="sr-btn cursor-pointer">
          <Upload size={14} /> Nhập
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
        </label>

        <button className="sr-btn" onClick={() => void onExportBundle()} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Bundle
        </button>
        <button className="sr-btn" onClick={onExportHtml} disabled={!result}>
          <FileDown size={14} /> HTML
        </button>
        <button
          className="sr-btn-primary"
          onClick={onPrint}
          disabled={!render.pages.length}
          title="Mở hộp thoại in của trình duyệt — chọn 'Save as PDF'"
        >
          <Printer size={14} /> In / PDF
        </button>
      </div>
    </header>
  );
}

function SaveState({ dirty, savedAt }: { dirty: boolean; savedAt: number | null }): JSX.Element {
  if (dirty) {
    return <span className="sr-chip bg-ink-100 text-ink-500">Đang chỉnh sửa…</span>;
  }
  if (!savedAt) return <span className="sr-chip bg-ink-100 text-ink-500">Chưa lưu</span>;
  return (
    <span className="sr-chip bg-ink-100 text-ink-500">
      Đã lưu cục bộ {new Date(savedAt).toLocaleTimeString('vi-VN')}
    </span>
  );
}

function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'scirender-document'
  );
}

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Pulls the already-loaded KaTeX stylesheet out of the page for HTML export. */
function readKatexCss(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      let text = '';
      for (const rule of Array.from(rules)) text += rule.cssText + '\n';
      if (text.includes('.katex')) css += text;
    } catch {
      /* cross-origin stylesheet — skip */
    }
  }
  return css;
}
