import { useRef, useState } from 'react';
import { Copy, ImagePlus, Trash2 } from 'lucide-react';
import { useStore } from '~/state/store';

export function AssetsPanel(): JSX.Element {
  const assets = useStore((s) => s.assets);
  const assetMap = useStore((s) => s.assetMap);
  const addAssets = useStore((s) => s.addAssets);
  const removeAsset = useStore((s) => s.removeAsset);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyRef = async (name: string): Promise<void> => {
    const snippet = `![Chú thích hình](asset:${name}){#fig:${name} width=80%}`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(name);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      window.prompt('Sao chép đoạn sau vào tài liệu:', snippet);
    }
  };

  return (
    <>
      <div className="sr-panel-title">
        <span>Tài nguyên</span>
        <span className="font-normal normal-case tracking-normal text-ink-400">
          {assets.length} tệp
        </span>
      </div>

      <div className="border-b border-ink-200 p-2">
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) void addAssets(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-[12px] transition ${
            dragOver
              ? 'border-sky-500 bg-sky-500/5 text-deep-600'
              : 'border-ink-200 text-ink-400 hover:border-ink-300 hover:text-ink-600'
          }`}
        >
          <ImagePlus size={20} />
          Kéo thả ảnh vào đây hoặc bấm để chọn
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void addAssets(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="mt-2 text-[11px] leading-snug text-ink-400">
          Ảnh được lưu trong IndexedDB của trình duyệt. Trong tài liệu tham chiếu bằng{' '}
          <code className="rounded bg-ink-100 px-1">asset:tên</code>.
        </p>
      </div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {assets.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12px] text-ink-400">Chưa có tài nguyên nào.</p>
        ) : (
          assets.map((a) => (
            <div
              key={a.id}
              className="mb-2 flex items-center gap-2 rounded-md border border-ink-200 p-2"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded bg-ink-100">
                {assetMap[a.name] ? (
                  <img
                    src={assetMap[a.name]}
                    alt={a.name}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[11.5px] text-ink-700">{a.name}</div>
                <div className="text-[10.5px] text-ink-400">
                  {formatBytes(a.size)} · {a.mime.replace('image/', '')}
                </div>
              </div>
              <button
                className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-deep-600"
                title="Chép đoạn chèn hình"
                onClick={() => void copyRef(a.name)}
              >
                <Copy size={14} />
              </button>
              <button
                className="rounded p-1.5 text-ink-400 transition hover:bg-flag-50 hover:text-flag-500"
                title="Xóa"
                onClick={() => void removeAsset(a.id)}
              >
                <Trash2 size={14} />
              </button>
              {copied === a.name ? (
                <span className="absolute right-4 rounded bg-ink-900 px-2 py-1 text-[10px] text-white">
                  Đã chép
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
