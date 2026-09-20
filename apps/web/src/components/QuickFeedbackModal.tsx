import { useEffect, useRef, useState } from 'react';
import { Check, Copy, MessageSquarePlus, X } from 'lucide-react';
import { summarise } from '@scirender/telemetry';
import { useStore } from '~/state/store';

/**
 * Quick feedback / bug report, kept entirely on the user's machine.
 *
 * SciRender has no backend to post to, and adding one would break P5 for a
 * feature that does not need it — so this does not "send" anything. It
 * assembles a report the user can paste wherever they actually talk to the
 * author (a message, an issue, an email) and copies it to the clipboard.
 * Reports are also kept locally so a bug noticed at 1am is still there in the
 * morning; nothing is transmitted, ever.
 *
 * The technical context (template, page count, diagnostic count, browser) is
 * attached because it is what makes a bug report actionable, and it is shown
 * in full in the textarea *before* copying — the user can read and delete any
 * of it. Nothing from the document's text is included.
 */

const STORE_KEY = 'scirender.feedback.v1';
const MAX_KEPT = 50;

type Kind = 'bug' | 'idea' | 'other';

const KINDS: Array<{ id: Kind; label: string }> = [
  { id: 'bug', label: 'Báo lỗi' },
  { id: 'idea', label: 'Góp ý' },
  { id: 'other', label: 'Khác' },
];

interface StoredFeedback {
  at: string;
  kind: Kind;
  message: string;
  context: string;
}

function readStored(): StoredFeedback[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredFeedback[]) : [];
  } catch {
    return [];
  }
}

function appendStored(entry: StoredFeedback): void {
  try {
    const next = [...readStored(), entry].slice(-MAX_KEPT);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked — the clipboard copy is the primary path anyway */
  }
}

export interface QuickFeedbackModalProps {
  /** Page count of the current render, so a report says how big the document was. */
  pageCount: number;
}

export function QuickFeedbackModal({ pageCount }: QuickFeedbackModalProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const copyResetRef = useRef<number | null>(null);

  const templateId = useStore((s) => s.templateId);
  const diagnosticCount = useStore((s) => s.diagnosticCount);

  useEffect(() => {
    if (open) textRef.current?.focus();
  }, [open]);

  // Escape closes, like every other dialog in the app.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // The "Đã chép" confirmation resets on a timer; cancel it on unmount so it
  // cannot fire into a component that is gone.
  useEffect(
    () => () => {
      if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
    },
    [],
  );

  const context = (): string => {
    const usage = summarise();
    return [
      `Mẫu: ${templateId}`,
      `Số trang bản dựng gần nhất: ${pageCount}`,
      `Số chẩn đoán đang có: ${diagnosticCount}`,
      `Đã dựng ${usage.documentsRendered} tài liệu, trung bình ${usage.averagePages} trang`,
      `Trình duyệt: ${typeof navigator === 'undefined' ? 'không rõ' : navigator.userAgent}`,
      `Thời điểm: ${new Date().toISOString()}`,
    ].join('\n');
  };

  const [contextText, setContextText] = useState('');
  useEffect(() => {
    if (open) setContextText(context());
    // Rebuilt each time the dialog opens so the numbers are current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (): Promise<void> => {
    const body = message.trim();
    if (!body) return;
    const report = [
      `[SciRender · ${KINDS.find((k) => k.id === kind)?.label ?? kind}]`,
      '',
      body,
      '',
      '--- Bối cảnh kỹ thuật ---',
      contextText,
    ].join('\n');

    appendStored({ at: new Date().toISOString(), kind, message: body, context: contextText });

    let ok = false;
    try {
      await navigator.clipboard.writeText(report);
      ok = true;
    } catch {
      // Clipboard needs a permission some browsers withhold. Fall back to
      // selecting the text so the user can copy it by hand — never fail
      // silently (P6).
      ok = false;
    }
    if (ok) {
      setCopied(true);
      if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => {
        copyResetRef.current = null;
        setCopied(false);
        setOpen(false);
        setMessage('');
      }, 1200);
    } else {
      textRef.current?.focus();
      textRef.current?.select();
      window.alert('Trình duyệt không cho chép tự động. Nội dung đã được chọn sẵn — bấm Ctrl+C để chép.');
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Gửi phản hồi hoặc báo lỗi nhanh"
        aria-label="Gửi phản hồi hoặc báo lỗi nhanh"
        className="fixed bottom-4 right-4 z-40 inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-900/[0.08] bg-[var(--sr-surface)] px-3 text-[11.5px] text-ink-600 shadow-[0_2px_10px_rgb(var(--ink-900)/0.12)] transition hover:bg-ink-900/[0.04] hover:text-ink-800"
      >
        <MessageSquarePlus size={14} strokeWidth={1.5} />
        Phản hồi
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Phản hồi nhanh"
      className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-ink-900/[0.28]"
      />
      <div className="relative w-full max-w-[460px] rounded-xl border border-ink-900/[0.08] bg-[var(--sr-surface)] p-4 shadow-[0_18px_50px_rgb(var(--ink-900)/0.22)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-ink-800">Phản hồi nhanh</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng"
            className="rounded p-1 text-ink-500 hover:bg-ink-900/[0.06] hover:text-ink-800"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div className="mb-2 flex gap-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                kind === k.id
                  ? 'bg-deep-600 text-white'
                  : 'text-ink-600 hover:bg-ink-900/[0.06]'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <textarea
          ref={textRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder={
            kind === 'bug'
              ? 'Bạn đang làm gì thì lỗi xảy ra? Kết quả mong đợi là gì?'
              : 'Bạn muốn SciRender làm được điều gì?'
          }
          className="sr-input w-full resize-y rounded-lg border border-ink-900/[0.1] bg-transparent p-2 text-[12.5px] leading-[1.5] text-ink-800 outline-none placeholder:text-ink-400 focus:border-sky-500"
        />

        <details className="mt-2 text-[11px] text-ink-500">
          <summary className="cursor-pointer select-none hover:text-ink-700">
            Bối cảnh kỹ thuật được kèm theo (sửa hoặc xoá được)
          </summary>
          <textarea
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            rows={6}
            className="sr-input mt-1.5 w-full resize-y rounded-lg border border-ink-900/[0.1] bg-transparent p-2 font-mono text-[10.5px] leading-[1.45] text-ink-600 outline-none"
          />
        </details>

        <p className="mt-2 text-[10.5px] leading-[1.45] text-ink-500">
          Phản hồi được lưu trên máy bạn và chép vào clipboard — SciRender không gửi gì ra
          ngoài. Dán vào tin nhắn hoặc email để gửi cho tác giả.
        </p>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-1.5 text-[12px] text-ink-600 hover:bg-ink-900/[0.06]"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!message.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-deep-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-deep-700 disabled:opacity-40"
          >
            {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.5} />}
            {copied ? 'Đã chép' : 'Chép phản hồi'}
          </button>
        </div>
      </div>
    </div>
  );
}
