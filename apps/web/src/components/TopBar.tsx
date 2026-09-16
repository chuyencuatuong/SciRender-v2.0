import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  FilePlus2,
  Loader2,
  Package,
  Play,
  Printer,
  Save,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import {
  downloadPdf,
  downloadPdfServer,
  exportStandaloneHtml,
  printDocument,
  slug,
} from '@scirender/renderer-pdf';
import { importBundle, exportBundle } from '@scirender/storage';
import { track } from '@scirender/telemetry';
import type { RenderState } from '~/hooks/useRender';
import { Menu, SplitMenu } from '~/components/ui/Menu';
import { useStore } from '~/state/store';
import { readAppFontsCss, readKatexCss } from '~/lib/export-fonts';

/**
 * URL của @scirender/pdf-server (biến VITE_PDF_SERVER_URL, đặt trong
 * apps/web/.env — xem .env.example). Không cấu hình thì mục "Tải PDF (chữ
 * thật)" ẩn đi, chỉ còn bản ảnh ngoại tuyến và In… → Save as PDF.
 */
const PDF_SERVER_URL = (import.meta.env.VITE_PDF_SERVER_URL as string | undefined)?.trim();
const PDF_SERVER_TOKEN = (import.meta.env.VITE_PDF_SERVER_TOKEN as string | undefined)?.trim();

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
  const [pdf, setPdf] = useState<{ done: number; total: number } | null>(null);
  const [pdfServerStage, setPdfServerStage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

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

  const onDownloadPdf = async (scale: number): Promise<void> => {
    if (!result || !render.pages.length) return;
    setPdf({ done: 0, total: render.pages.length });
    try {
      const out = await downloadPdf({
        pages: pageHtml,
        template: result.template,
        footers,
        documentTitle: result.document.meta.title || title,
        scale,
        onProgress: (done, total) => setPdf({ done, total }),
      });
      track('export.pdf', { pages: out.pages, bytes: out.bytes, scale });
    } catch (err) {
      window.alert(`Không tạo được tệp PDF: ${(err as Error).message}`);
    } finally {
      setPdf(null);
    }
  };

  const onDownloadPdfServer = async (): Promise<void> => {
    if (!result || !render.pages.length) return;
    if (!PDF_SERVER_URL) {
      window.alert(
        'Chưa cấu hình máy chủ xuất PDF (VITE_PDF_SERVER_URL). Dùng "Tải PDF (ngoại tuyến, ảnh)" hoặc "In… → Save as PDF" thay thế.',
      );
      return;
    }
    setPdfServerStage('Đang chuẩn bị phông chữ…');
    try {
      const [katexCss, fontsCss] = await Promise.all([readKatexCss(), readAppFontsCss()]);
      setPdfServerStage('Đang dựng PDF trên máy chủ…');
      const out = await downloadPdfServer({
        pages: pageHtml,
        template: result.template,
        footers,
        documentTitle: result.document.meta.title || title,
        katexCss,
        extraCss: fontsCss,
        lang: result.document.meta.language,
        endpoint: PDF_SERVER_URL,
        token: PDF_SERVER_TOKEN,
      });
      track('export.pdf-server', { pages: out.pages, bytes: out.bytes });
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setPdfServerStage(null);
    }
  };

  const onExportHtml = async (): Promise<void> => {
    if (!result) return;
    const [katexCss, fontsCss] = await Promise.all([readKatexCss(), readAppFontsCss()]);
    const html = exportStandaloneHtml({
      pages: pageHtml.length ? pageHtml : result.blocks,
      template: result.template,
      footers,
      documentTitle: result.document.meta.title || title,
      katexCss,
      extraCss: fontsCss,
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

  // Ctrl+P in / Ctrl+Shift+P tải PDF — hai việc khác nhau nên hai phím khác nhau.
  // Ctrl+Shift+P ưu tiên PDF chữ thật (máy chủ) khi đã cấu hình, còn không thì
  // rơi về bản ảnh ngoại tuyến cũ — không để phím tắt im lặng không làm gì.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'p') return;
      e.preventDefault();
      if (e.shiftKey) {
        if (PDF_SERVER_URL) void onDownloadPdfServer();
        else void onDownloadPdf(2);
      } else onPrint();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const noPages = !render.pages.length;
  const pdfBusy = !!pdf || !!pdfServerStage;

  return (
    <header
      data-sr-topbar
      className="sr-frost relative z-50 flex h-[60px] shrink-0 items-center gap-3 border-b border-black/[0.05] pl-2.5 pr-3.5"
    >
      <div className="flex shrink-0 items-baseline gap-2 pl-1">
        <span className="font-serif text-[20px] font-normal tracking-[-0.015em] text-ink-900">
          Sci<i className="font-light not-italic text-deep-600">Render</i>
        </span>
        <span className="hidden -translate-y-px rounded-full px-[5px] py-px font-mono text-[9.5px] tracking-wide text-ink-400 ring-1 ring-black/[0.07] sm:inline">
          v2.4
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <h1
          className="hidden min-w-0 truncate text-[13.5px] font-medium tracking-[-0.005em] text-ink-900 md:block"
          title={title}
        >
          {title}
        </h1>
        <SaveState dirty={dirty} savedAt={savedAt} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {result ? (
          errors > 0 ? (
            <span className="sr-chip hidden bg-flag-50 text-flag-600 lg:inline-flex">
              <TriangleAlert size={12} /> {errors} lỗi
            </span>
          ) : warnings > 0 ? (
            <span className="sr-chip hidden bg-amber-50 text-amber-700 lg:inline-flex">
              {warnings} cảnh báo
            </span>
          ) : (
            <span className="sr-chip hidden bg-emerald-50 text-emerald-700 lg:inline-flex">
              <CheckCircle2 size={12} /> Không lỗi
            </span>
          )
        ) : null}

        <button
          className={stale ? 'sr-btn-render' : 'sr-btn-ghost'}
          onClick={requestRender}
          disabled={render.running}
          title="Dựng lại trang (Ctrl + Enter)"
        >
          {render.running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          <span className="hidden sm:inline">Dựng trang</span>
        </button>

        <Menu
          label="Tệp"
          icon={<FilePlus2 size={14} />}
          width={236}
          items={[
            {
              id: 'new',
              label: 'Tài liệu mới',
              icon: <FilePlus2 size={13} />,
              onSelect: () => void createDocument(false),
            },
            {
              id: 'save',
              label: 'Lưu ngay',
              hint: 'tự động',
              icon: <Save size={13} />,
              disabled: !dirty,
              onSelect: () => void save(),
            },
            'separator',
            {
              id: 'import',
              label: 'Nhập bundle…',
              icon: <Upload size={13} />,
              onSelect: () => importRef.current?.click(),
            },
            {
              id: 'bundle',
              label: 'Xuất bundle sao lưu',
              icon: <Package size={13} />,
              disabled: busy,
              onSelect: () => void onExportBundle(),
            },
          ]}
        />

        {/* In và Tải PDF là hai việc khác nhau, nên là hai mục khác nhau chứ
            không phải một nút "In / PDF" mập mờ như trước. Tải PDF (chữ thật)
            là mặc định khi có máy chủ; bản ảnh cũ vẫn còn cho lúc không có mạng. */}
        <SplitMenu
          label={
            pdfServerStage
              ? pdfServerStage
              : pdf
                ? `Đang tạo PDF ${pdf.done}/${pdf.total}`
                : 'Xuất'
          }
          icon={pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          onPrimary={() => void (PDF_SERVER_URL ? onDownloadPdfServer() : onDownloadPdf(2))}
          primaryTitle={
            PDF_SERVER_URL
              ? 'Tải PDF chữ thật, chọn/tìm được (Ctrl + Shift + P)'
              : 'Tải tệp PDF về máy — chữ là ảnh (Ctrl + Shift + P)'
          }
          disabled={noPages || pdfBusy}
          width={320}
          items={[
            {
              id: 'pdf-server',
              label: 'Tải PDF (chữ thật)',
              description: PDF_SERVER_URL
                ? 'Chữ chọn/tìm được, giống Word. Cần mạng.'
                : 'Chưa cấu hình máy chủ xuất PDF (VITE_PDF_SERVER_URL).',
              icon: <Download size={13} />,
              hint: '⌘⇧P',
              disabled: noPages || pdfBusy || !PDF_SERVER_URL,
              onSelect: () => void onDownloadPdfServer(),
            },
            {
              id: 'pdf-image',
              label: 'Tải PDF (ngoại tuyến, ảnh)',
              description: 'Không cần mạng, có tệp ngay. Chữ trong tệp là ảnh.',
              icon: <Download size={13} />,
              disabled: noPages || pdfBusy,
              onSelect: () => void onDownloadPdf(2),
            },
            {
              id: 'pdf-image-hi',
              label: 'Tải PDF ngoại tuyến, nét cao',
              description: 'Gấp rưỡi độ nét, tệp nặng hơn và lâu hơn. Vẫn là ảnh.',
              icon: <Download size={13} />,
              disabled: noPages || pdfBusy,
              onSelect: () => void onDownloadPdf(3),
            },
            'separator',
            {
              id: 'print',
              label: 'In…',
              description: 'Mở hộp thoại in. Chọn “Save as PDF” nếu muốn chữ chọn được.',
              icon: <Printer size={13} />,
              hint: '⌘P',
              disabled: noPages,
              onSelect: onPrint,
            },
            'separator',
            {
              id: 'html',
              label: 'Tệp HTML độc lập',
              icon: <FileCode2 size={13} />,
              hint: '⌘E',
              disabled: !result,
              onSelect: () => void onExportHtml(),
            },
            {
              id: 'bundle2',
              label: 'Bundle sao lưu',
              icon: <Package size={13} />,
              disabled: busy,
              onSelect: () => void onExportBundle(),
            },
          ]}
        />

        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}

function SaveState({ dirty, savedAt }: { dirty: boolean; savedAt: number | null }): JSX.Element {
  const base =
    'inline-flex h-[25px] shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 text-[11px] shadow-card';
  if (dirty) {
    return (
      <span className={`${base} text-ink-500`}>
        <span className="h-[5px] w-[5px] rounded-full bg-sky-500" /> Đang chỉnh sửa…
      </span>
    );
  }
  if (!savedAt) {
    return (
      <span className={`${base} text-ink-400`}>
        <span className="h-[5px] w-[5px] rounded-full bg-ink-300" /> Chưa lưu
      </span>
    );
  }
  return (
    <span className={`${base} text-ink-500`}>
      <span className="h-[5px] w-[5px] rounded-full bg-emerald-500" /> Đã lưu cục bộ{' '}
      {new Date(savedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
    </span>
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
