import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileCode2,
  FilePlus2,
  Loader2,
  Moon,
  Package,
  Play,
  Printer,
  Save,
  Sun,
  TriangleAlert,
  Upload,
  ClipboardCheck,
} from 'lucide-react';
import { exportStandaloneHtml, printDocument, slug } from '@scirender/renderer-pdf';
import { importBundle, exportBundle } from '@scirender/storage';
import { track } from '@scirender/telemetry';
import type { RenderState } from '~/hooks/useRender';
import { Menu } from '~/components/ui/Menu';
import { useStore } from '~/state/store';
import { readAppFontsCss, readKatexCss } from '~/lib/export-fonts';
import { AuditDialog } from '~/components/AuditDialog';

/** Đánh dấu đã hiện lời nhắc "chọn Save as PDF" một lần trên máy này (P5-friendly, không cần server). */
const PRINT_HINT_SEEN_KEY = 'sr:print-hint-seen';

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
  const theme = useStore((s) => s.prefs.theme);
  const setPref = useStore((s) => s.setPref);
  const printNonce = useStore((s) => s.printNonce);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);
  const printNonceSeen = useRef(printNonce);
  const [auditOpen, setAuditOpen] = useState(false);

  const stale = source !== renderedSource;
  const result = render.result;
  const errors = result?.diagnostics.filter((d) => d.severity === 'error').length ?? 0;
  const warnings = result?.diagnostics.filter((d) => d.severity === 'warning').length ?? 0;

  const pageHtml = render.pages.map((p) => p.html);
  const footers = render.pages.map((p) => p.footer);

  const onPrint = (): void => {
    if (!result || !render.pages.length) return;
    track('export.print', { pages: render.pages.length });
    // Chỉ ai chưa từng thấy hộp thoại in của app mới cần nhắc — tránh làm
    // phiền người đã biết. Nhắc bằng alert (không phải toast tự ẩn) vì đây
    // là bước dễ làm sai nhất (chọn nhầm máy in thật) và không được bỏ lỡ.
    try {
      if (!window.localStorage.getItem(PRINT_HINT_SEEN_KEY)) {
        window.alert(
          'Hộp thoại In của trình duyệt sẽ mở ra.\n\n' +
            'Ở mục "Destination" (Đích), chọn "Save as PDF" — KHÔNG chọn tên máy in — rồi bấm "Save".\n' +
            'Cách này cho PDF chữ thật, chọn và tìm được, không cần mạng.',
        );
        window.localStorage.setItem(PRINT_HINT_SEEN_KEY, '1');
      }
    } catch {
      // localStorage có thể bị chặn (chế độ ẩn danh nghiêm ngặt) — bỏ qua,
      // không để việc nhắc nhở làm hỏng luồng in.
    }
    printDocument({
      pages: pageHtml,
      template: result.template,
      footers,
      documentTitle: result.document.meta.title || title,
    });
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

  // Ctrl+P luôn là In / Lưu PDF — không còn lối tải PDF riêng để hai phím tắt
  // phải phân biệt nữa (bỏ hẳn Ctrl+Shift+P, xem Đợt 8).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'p') return;
      e.preventDefault();
      onPrint();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Anything outside this component — the Command Palette, say — asks for
  // "In / Lưu PDF" the same way: bump `printNonce` in the store. That keeps
  // the print-dialog flow (and its once-only hint) in this one place (P4)
  // instead of a second copy living wherever else wants to trigger it.
  useEffect(() => {
    if (printNonce === printNonceSeen.current) return;
    printNonceSeen.current = printNonce;
    onPrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printNonce]);

  const noPages = !render.pages.length;

  return (
    <header
      data-sr-topbar
      className="sr-frost relative z-50 flex h-[60px] shrink-0 items-center gap-3 border-b border-ink-900/[0.05] pl-2.5 pr-3.5"
    >
      <div className="flex shrink-0 items-baseline gap-2 pl-1">
        <span className="font-serif text-[20px] font-normal tracking-[-0.015em] text-ink-900">
          Sci<i className="font-light not-italic text-deep-600">Render</i>
        </span>
        <span className="hidden -translate-y-px rounded-full px-[5px] py-px font-mono text-[9.5px] tracking-wide text-ink-400 ring-1 ring-ink-900/[0.07] sm:inline">
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
            {
              id: 'html',
              label: 'Tệp HTML độc lập',
              icon: <FileCode2 size={13} />,
              disabled: !result,
              onSelect: () => void onExportHtml(),
            },
          ]}
        />

        {/* Một nút duy nhất — không còn menu chẻ với các lối tải PDF ảnh
            (qua máy chủ / ngoại tuyến). "In…" luôn cho chữ thật, không cần
            server, không cần mạng; chỉ có một bước thủ công là chọn "Save
            as PDF" ở hộp thoại in (đã có lời nhắc một lần, xem onPrint). */}
        <button
          type="button"
          className="sr-btn-ghost"
          onClick={() => setAuditOpen(true)}
          disabled={!result && render.running}
          title="Kiểm tra trước khi nộp"
        >
          <ClipboardCheck size={14} />
          <span className="hidden lg:inline">Kiểm tra trước khi nộp</span>
        </button>

        <button
          className="sr-btn-render"
          onClick={onPrint}
          disabled={noPages}
          title='Mở hộp thoại in — chọn "Save as PDF" để lưu PDF chữ thật (Ctrl + P)'
        >
          <Printer size={14} />
          <span className="hidden sm:inline">In / Lưu PDF</span>
        </button>

        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-ink-900/[0.07]" />

        {/* Sáng/Tối — chỉ đổi data-theme trên <html>, không đụng tới trang in
            (trang A4 luôn trắng, xem index.css). Lưu lại nên mở app lần sau
            vẫn giữ đúng lựa chọn (xem storage.loadPreferences). */}
        <button
          type="button"
          className="sr-rail-btn !h-[34px] !w-[34px]"
          onClick={() => setPref('theme', theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Chuyển sang nền Sáng' : 'Chuyển sang nền Tối'}
          aria-label="Đổi nền sáng/tối"
        >
          {theme === 'dark' ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
        </button>

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
      <AuditDialog
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        render={render}
        stale={stale}
        onRender={requestRender}
      />
    </header>
  );
}

function SaveState({ dirty, savedAt }: { dirty: boolean; savedAt: number | null }): JSX.Element {
  const base =
    'inline-flex h-[25px] shrink-0 items-center gap-1.5 rounded-full bg-[var(--sr-surface)] px-2.5 text-[11px] shadow-card';
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
