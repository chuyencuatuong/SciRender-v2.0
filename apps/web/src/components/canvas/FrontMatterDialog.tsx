import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  value: string;
  onClose: () => void;
  onApply: (value: string) => void;
}

/**
 * Front matter — title, cover, members, bibliography.
 *
 * It stays raw YAML on purpose: it is the one part of the document where a
 * wrong guess by a form would quietly change what the cover page says.
 */
export function FrontMatterDialog({ value, onClose, onApply }: Props): JSX.Element {
  const [text, setText] = useState(value || '---\ntitle: Tài liệu mới\n---');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Thông tin tài liệu"
      className="fixed inset-0 z-40 grid place-items-center bg-ink-900/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-ink-200 bg-[var(--sr-surface)] shadow-xl">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-ink-200 px-3">
          <span className="text-[13px] font-semibold text-ink-800">Thông tin tài liệu</span>
          <span className="text-[11.5px] text-ink-500">
            bìa, thành viên, tài liệu tham khảo — khối YAML giữa hai dòng ---
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onApply(text.trim())}
              className="rounded bg-deep-600 px-2.5 py-1 text-[12px] font-medium text-white"
            >
              Áp dụng
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="grid h-6 w-6 place-items-center rounded text-ink-500 hover:bg-ink-100"
            >
              <X size={14} />
            </button>
          </div>
        </header>
        <textarea
          ref={ref}
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          className="sr-scroll min-h-0 flex-1 resize-none border-0 p-3 font-mono text-[12px] leading-[1.55] text-ink-800 outline-none"
        />
      </div>
    </div>
  );
}
