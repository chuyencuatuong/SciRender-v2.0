import { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

export interface SourceDialogProps {
  source: string;
  onClose: () => void;
  onApply: (source: string) => void;
}

/**
 * "Xem mã nguồn" — the Markdown the compiler actually reads.
 *
 * The canvas is the place to write; this is the place to check, copy out, or
 * paste a whole document in. It is not a second editor competing with the
 * cards: applying here re-slices the canvas from the text.
 */
export function SourceDialog({ source, onClose, onApply }: SourceDialogProps): JSX.Element {
  const [text, setText] = useState(source);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      ref.current?.select();
    }
  };

  const dirty = text !== source;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mã nguồn Markdown"
      className="fixed inset-0 z-40 grid place-items-center bg-ink-900/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-ink-200 bg-[var(--sr-surface)] shadow-xl">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-ink-200 px-3">
          <span className="text-[13px] font-semibold text-ink-800">Mã nguồn Markdown</span>
          <span className="text-[11.5px] text-ink-500">
            đúng văn bản mà trình biên dịch đọc — sửa ở đây rồi Áp dụng sẽ dựng lại các khối
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1 rounded border border-ink-200 px-2 py-1 text-[12px] text-ink-700 hover:border-sky-400"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Đã chép' : 'Chép'}
            </button>
            <button
              type="button"
              disabled={!dirty}
              onClick={() => onApply(text)}
              className="rounded bg-deep-600 px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-40"
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
          className="sr-scroll min-h-0 flex-1 resize-none border-0 bg-[var(--sr-surface)] p-3 font-mono text-[12px] leading-[1.55] text-ink-800 outline-none"
        />

        <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-ink-200 bg-ink-50/60 px-3 text-[11px] text-ink-500">
          {text.split('\n').length} dòng · {text.length} ký tự
          {dirty ? <span className="text-flag-600">• đã sửa, chưa áp dụng</span> : null}
        </footer>
      </div>
    </div>
  );
}
