import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { CARD_TEMPLATES, type CardTemplate } from '~/lib/cards';

interface Props {
  onInsert: (template: CardTemplate) => void;
  label?: string;
  compact?: boolean;
}

/** The quick "add a block" menu — one click from any point in the canvas. */
export function InsertMenu({ onInsert, label = 'Thêm khối', compact = false }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          compact
            ? 'inline-flex items-center gap-1 rounded border border-dashed border-ink-300 px-2 py-1 text-[11.5px] text-ink-500 transition hover:border-sky-400 hover:text-deep-700'
            : 'inline-flex items-center gap-1 rounded border border-ink-200 bg-white px-2 py-1 text-[12px] font-medium text-ink-700 transition hover:border-sky-400 hover:text-deep-700'
        }
      >
        <Plus size={13} /> {label}
        <ChevronDown size={12} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 z-30 mt-1 w-[260px] overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg"
        >
          {CARD_TEMPLATES.map((tpl) => (
            <button
              key={`${tpl.kind}-${tpl.label}`}
              type="button"
              role="menuitem"
              onClick={() => {
                onInsert(tpl);
                setOpen(false);
              }}
              className="flex w-full flex-col items-start gap-0 px-2.5 py-1.5 text-left transition hover:bg-sky-50"
            >
              <span className="text-[12.5px] text-ink-800">{tpl.label}</span>
              {tpl.hint ? <span className="text-[11px] text-ink-400">{tpl.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
