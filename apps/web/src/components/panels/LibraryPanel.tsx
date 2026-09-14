import { useEffect } from 'react';
import { FilePlus2, FileText, Sparkles, Trash2 } from 'lucide-react';
import { useStore } from '~/state/store';

export function LibraryPanel(): JSX.Element {
  const library = useStore((s) => s.library);
  const docId = useStore((s) => s.docId);
  const openDocument = useStore((s) => s.openDocument);
  const removeDocument = useStore((s) => s.removeDocument);
  const createDocument = useStore((s) => s.createDocument);
  const refreshLibrary = useStore((s) => s.refreshLibrary);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  return (
    <>
      <div className="sr-panel-title">
        <span>Thư viện tài liệu</span>
        <span className="font-normal normal-case tracking-normal text-ink-400">
          {library.length}
        </span>
      </div>

      <div className="flex gap-1.5 border-b border-ink-200 p-2">
        <button className="sr-btn flex-1" onClick={() => void createDocument(false)}>
          <FilePlus2 size={14} /> Trống
        </button>
        <button className="sr-btn flex-1" onClick={() => void createDocument(true)}>
          <Sparkles size={14} /> Mẫu
        </button>
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto">
        {library.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12px] text-ink-400">Chưa có tài liệu nào.</p>
        ) : (
          library.map((d) => (
            <div
              key={d.id}
              className={`group flex items-start gap-2 border-b border-ink-100 px-3 py-2 transition ${
                d.id === docId ? 'bg-sci-600/5' : 'hover:bg-ink-50'
              }`}
            >
              <FileText
                size={14}
                className={`mt-0.5 shrink-0 ${d.id === docId ? 'text-sci-600' : 'text-ink-300'}`}
              />
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => void openDocument(d.id)}
              >
                <div className="truncate text-[12.5px] font-medium text-ink-800">{d.title}</div>
                <div className="text-[10.5px] text-ink-400">
                  {new Date(d.updatedAt).toLocaleString('vi-VN')} · {d.templateId}
                </div>
              </button>
              <button
                className="rounded p-1 text-ink-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                title="Xóa tài liệu"
                onClick={() => {
                  if (window.confirm(`Xóa "${d.title}"? Thao tác này không hoàn tác được.`)) {
                    void removeDocument(d.id);
                  }
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <p className="border-t border-ink-200 px-3 py-2 text-[11px] leading-snug text-ink-400">
        Mọi tài liệu nằm trong IndexedDB của trình duyệt này. Xóa dữ liệu duyệt web sẽ xóa luôn thư
        viện — hãy xuất Bundle để sao lưu.
      </p>
    </>
  );
}
