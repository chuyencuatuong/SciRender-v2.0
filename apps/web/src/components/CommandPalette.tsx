import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CornerDownLeft,
  FilePlus2,
  Hash,
  Moon,
  Play,
  Printer,
  Save,
  Search,
  Sun,
} from 'lucide-react';
import { plainText, walk } from '@scirender/ast';
import { CARD_TEMPLATES, foldDiacritics } from '~/lib/cards';
import { REF_KIND_ICON, REF_KIND_LABEL } from '~/lib/refs';
import { POP_IN, useReducedMotion } from '~/lib/motion';
import { listenForShortcuts, matchesShortcut } from '~/lib/shortcuts';
import type { RenderState } from '~/hooks/useRender';
import { ITEMS as PANEL_ITEMS } from './SideRail';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

interface Action {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  keywords?: string;
  run: () => void;
}

/**
 * `Ctrl/Cmd+Shift+P` / `F1` — Hạng mục 6. Every action here goes through the same store
 * methods the toolbar and panels already call (render/save/print/panel
 * toggles), or the two small nonce-based requests added alongside this
 * (`requestPrint`, `requestInsertBlock`) for the two things that live in a
 * component the palette cannot reach directly — never a second
 * implementation of what a button elsewhere already does (P4).
 *
 * "Chèn khối" and "Đi tới" only READ `render.result` — the last explicit
 * "Dựng trang" — the same as the Outline/Objects panels; opening the palette
 * never triggers the heavy render pipeline itself.
 */
export function CommandPalette({ render }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  const theme = useStore((s) => s.prefs.theme);
  const createDocument = useStore((s) => s.createDocument);
  const save = useStore((s) => s.save);
  const requestRender = useStore((s) => s.render);
  const requestPrint = useStore((s) => s.requestPrint);
  const requestInsertBlock = useStore((s) => s.requestInsertBlock);
  const requestGotoLine = useStore((s) => s.requestGotoLine);
  const setPanel = useStore((s) => s.setPanel);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const setPref = useStore((s) => s.setPref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (matchesShortcut(e, 'command-palette')) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    return listenForShortcuts(onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  const result = render.result;

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [
      {
        id: 'doc.new',
        group: 'Tài liệu',
        title: 'Tài liệu mới',
        icon: <FilePlus2 size={14} />,
        run: () => void createDocument(false),
      },
      {
        id: 'doc.save',
        group: 'Tài liệu',
        title: 'Lưu ngay',
        icon: <Save size={14} />,
        run: () => void save(),
      },
      {
        id: 'doc.render',
        group: 'Tài liệu',
        title: 'Dựng trang',
        subtitle: 'Ctrl+Enter',
        keywords: 'render compile build',
        icon: <Play size={14} />,
        run: () => requestRender(),
      },
      {
        id: 'doc.print',
        group: 'Tài liệu',
        title: 'In / Lưu PDF',
        subtitle: 'Ctrl+P',
        keywords: 'export pdf xuat',
        icon: <Printer size={14} />,
        run: () => requestPrint(),
      },
      {
        id: 'doc.theme',
        group: 'Tài liệu',
        title: theme === 'dark' ? 'Chuyển sang nền Sáng' : 'Chuyển sang nền Tối',
        keywords: 'theme dark light sang toi giao dien',
        icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
        run: () => setPref('theme', theme === 'dark' ? 'light' : 'dark'),
      },
    ];

    for (const item of PANEL_ITEMS) {
      list.push({
        id: `panel.${item.id}`,
        group: 'Bảng bên',
        title: `Mở ${item.label}`,
        icon: <item.icon size={14} />,
        run: () => {
          setPanel(item.id);
          setPanelOpen(true);
        },
      });
    }

    for (const tpl of CARD_TEMPLATES) {
      list.push({
        id: `insert.${tpl.id}`,
        group: 'Chèn khối',
        title: `Chèn: ${tpl.label}`,
        subtitle: tpl.hint || undefined,
        keywords: tpl.keywords,
        icon: <span className="font-mono text-[10px] text-ink-400">＋</span>,
        run: () => requestInsertBlock(tpl.id),
      });
    }

    if (result) {
      walk(result.document, (n) => {
        if (n.type === 'heading') {
          list.push({
            id: `goto.h.${n.id}`,
            group: 'Đi tới',
            title: n.number ? `${n.number} ${plainText(n)}` : plainText(n) || '(đề mục rỗng)',
            icon: <Hash size={13} />,
            run: () => requestGotoLine(n.position.start.line),
          });
        }
        return undefined;
      });

      for (const rec of Object.values(result.document.labels)) {
        const Icon = REF_KIND_ICON[rec.kind];
        list.push({
          id: `goto.o.${rec.label}`,
          group: 'Đi tới',
          title: rec.number ? `${REF_KIND_LABEL[rec.kind]} ${rec.number}` : REF_KIND_LABEL[rec.kind],
          subtitle: rec.label,
          icon: <Icon size={13} />,
          run: () => requestGotoLine(rec.position.start.line),
        });
      }
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.signature, theme]);

  const results = useMemo(() => {
    const q = foldDiacritics(query.trim());
    if (!q) return actions.slice(0, 60);
    const scored: Array<{ a: Action; score: number }> = [];
    for (const a of actions) {
      const title = foldDiacritics(a.title);
      const hay = `${title} ${foldDiacritics(a.subtitle ?? '')} ${foldDiacritics(a.group)} ${a.keywords ?? ''}`;
      let score = 0;
      if (title.startsWith(q)) score = 100;
      else if (title.includes(q)) score = 70;
      else if (hay.includes(q)) score = 40;
      else if (q.split(/\s+/).every((w) => hay.includes(w))) score = 20;
      if (score) scored.push({ a, score });
    }
    return scored.sort((x, y) => y.score - x.score).map((s) => s.a).slice(0, 60);
  }, [actions, query]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results.length, active]);

  const choose = (a: Action | undefined): void => {
    if (!a) return;
    a.run();
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent): void => {
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

  let lastGroup = '';

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="presentation"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? undefined : { opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[80] flex items-start justify-center bg-ink-900/30 pt-[14vh]"
          onMouseDown={(e) => {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
          }}
        >
          <motion.div
            ref={boxRef}
            role="dialog"
            aria-modal="true"
            aria-label="Bảng lệnh"
            initial={reduced ? false : POP_IN.initial}
            animate={POP_IN.animate}
            exit={reduced ? undefined : POP_IN.exit}
            transition={POP_IN.transition}
            className="sr-menu w-[min(520px,92vw)] overflow-hidden"
          >
            <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
              <Search size={14} className="text-ink-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKey}
                placeholder="Gõ lệnh, tên đối tượng hoặc đề mục…"
                aria-label="Tìm lệnh"
                className="w-full bg-transparent text-[13px] text-ink-800 outline-none placeholder:text-ink-400"
              />
              <kbd className="rounded border border-ink-200 px-1.5 py-0.5 font-mono text-[10px] text-ink-400">
                Esc
              </kbd>
            </div>

            <div className="sr-scroll max-h-[400px] overflow-y-auto py-1">
              {results.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-ink-400">
                  Không có lệnh nào khớp “{query}”.
                </div>
              ) : (
                results.map((a, i) => {
                  const showGroup = a.group !== lastGroup;
                  lastGroup = a.group;
                  return (
                    <div key={a.id}>
                      {showGroup ? (
                        <div className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-[0.09em] text-ink-400">
                          {a.group}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(a)}
                        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition ${
                          i === active ? 'bg-sky-50' : ''
                        }`}
                      >
                        <span className="shrink-0 text-ink-400">{a.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-ink-800">{a.title}</span>
                          {a.subtitle ? (
                            <span className="block truncate text-[11px] text-ink-400">{a.subtitle}</span>
                          ) : null}
                        </span>
                        {i === active ? <CornerDownLeft size={12} className="shrink-0 text-ink-300" /> : null}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-ink-100 bg-ink-50/60 px-3 py-1 text-[10.5px] text-ink-400">
              ↑↓ chọn · Enter thực hiện · Esc đóng
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
