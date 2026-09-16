import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { searchTemplates, type CardTemplate } from '~/lib/cards';
import { POP_IN, useReducedMotion } from '~/lib/motion';
import { useStore } from '~/state/store';

interface Props {
  onInsert: (template: CardTemplate) => void;
  label?: string;
  compact?: boolean;
}

/**
 * Add-a-block, built for speed: it opens with the cursor already in the search
 * box, ranks accent-insensitively (typing "cong thuc" finds "Công thức"), and
 * pins whatever you reached for recently above everything else.
 */
export function InsertMenu({ onInsert, label = 'Thêm khối', compact = false }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reduced = useReducedMotion();

  const recent = useStore((s) => s.prefs.recentBlocks);
  const noteBlockUsed = useStore((s) => s.noteBlockUsed);

  const results = useMemo(() => searchTemplates(query, recent), [query, recent]);
  const pinned = query.trim() ? 0 : recent.filter((id) => results.some((r) => r.id === id)).length;

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (tpl: CardTemplate | undefined): void => {
    if (!tpl) return;
    noteBlockUsed(tpl.id);
    onInsert(tpl);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + results.length) % Math.max(1, results.length);
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          compact
            ? 'inline-flex items-center gap-1 rounded-md border border-dashed border-ink-300 px-2 py-1 text-[11.5px] text-ink-500 transition hover:border-sky-400 hover:bg-sky-50/60 hover:text-deep-700'
            : 'inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] font-medium text-ink-700 transition hover:border-sky-400 hover:bg-sky-50/60 hover:text-deep-700'
        }
      >
        <Plus size={13} /> {label}
        <ChevronDown
          size={12}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={reduced ? false : POP_IN.initial}
            animate={POP_IN.animate}
            exit={reduced ? undefined : POP_IN.exit}
            transition={POP_IN.transition}
            className="absolute left-0 z-40 mt-1 w-[300px] overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xl"
          >
            <div className="flex items-center gap-1.5 border-b border-ink-100 px-2.5 py-2">
              <Search size={13} className="text-ink-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKey}
                placeholder="Tìm loại khối… (bảng, công thức, hình)"
                aria-label="Tìm loại khối"
                className="w-full bg-transparent text-[12.5px] text-ink-800 outline-none placeholder:text-ink-400"
              />
            </div>

            <div className="sr-scroll max-h-[320px] overflow-y-auto py-1">
              {results.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-ink-400">
                  Không có loại khối nào khớp “{query}”.
                </div>
              ) : (
                results.map((tpl, i) => (
                  <div key={tpl.id}>
                    {pinned > 0 && i === 0 ? <GroupLabel>Hay dùng</GroupLabel> : null}
                    {pinned > 0 && i === pinned ? <GroupLabel>Tất cả</GroupLabel> : null}
                    <button
                      type="button"
                      role="menuitem"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(tpl)}
                      className={`flex w-full flex-col items-start gap-0 px-2.5 py-1.5 text-left transition ${
                        i === active ? 'bg-sky-50' : ''
                      }`}
                    >
                      <span className="text-[12.5px] text-ink-800">{tpl.label}</span>
                      {tpl.hint ? (
                        <span className="text-[11px] text-ink-400">{tpl.hint}</span>
                      ) : null}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-ink-100 bg-ink-50/60 px-2.5 py-1 text-[10.5px] text-ink-400">
              ↑↓ chọn · Enter thêm · Esc đóng
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
      {children}
    </div>
  );
}
