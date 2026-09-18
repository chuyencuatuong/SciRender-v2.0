import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BibEntry, LabelRecord } from '@scirender/ast';
import { caretViewportPosition } from '~/lib/caret';
import { foldDiacritics, searchTemplates, type CardTemplate } from '~/lib/cards';
import { matchesShortcut } from '~/lib/shortcuts';
import { REF_KIND_ICON, REF_KIND_LABEL } from '~/lib/refs';
import { useStore } from '~/state/store';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  minRows?: number;
  ariaLabel?: string;
  /**
   * The document's labelled objects, for the `@`-mention popover. Left
   * `undefined` where that context is not worth threading (nothing breaks —
   * the trigger simply never fires).
   */
  labels?: Record<string, LabelRecord>;
  bibliography?: BibEntry[];
}

type Trigger =
  | { kind: 'mention'; start: number; query: string }
  | { kind: 'citation'; start: number; query: string }
  | { kind: 'slash'; start: number; query: string };

interface Item {
  key: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

const MAX_TRIGGER_QUERY = 40;

// Keeps the most recently focused scientific text editor addressable when the
// user clicks the References panel. We deliberately do not clear it on blur:
// clicking the side panel should still insert into the caret location the user
// just left.
let lastActiveTextarea: HTMLTextAreaElement | null = null;

/** Finds an in-progress `@label` or start-of-line `/command` at the caret. */
function detectTrigger(value: string, cursor: number): Trigger | null {
  const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
  const lineSoFar = value.slice(lineStart, cursor);

  if (/^\/[\w-]{0,40}$/.test(lineSoFar)) {
    return { kind: 'slash', start: lineStart, query: lineSoFar.slice(1) };
  }

  const cite = lineSoFar.lastIndexOf('[@');
  if (cite !== -1) {
    const tail = lineSoFar.slice(cite + 2);
    if (!/[\s\]]/.test(tail) && tail.length <= MAX_TRIGGER_QUERY) {
      return { kind: 'citation', start: lineStart + cite, query: tail };
    }
  }

  let i = cursor - 1;
  while (i >= lineStart) {
    const ch = value[i];
    if (ch === '@') {
      const before = value[i - 1];
      if (before !== undefined && /[\w]/.test(before)) return null;
      const query = value.slice(i + 1, cursor);
      if (query.length > MAX_TRIGGER_QUERY) return null;
      return { kind: 'mention', start: i, query };
    }
    if (ch === undefined || /\s/.test(ch)) return null;
    i--;
  }
  return null;
}

/** A textarea that grows with its content — a card must never scroll inside. */
export function AutoTextarea({
  value,
  onChange,
  placeholder,
  mono = false,
  minRows = 1,
  ariaLabel,
  labels,
  bibliography,
}: Props): JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const recentBlocks = useStore((s) => s.prefs.recentBlocks);
  const noteBlockUsed = useStore((s) => s.noteBlockUsed);
  const citationInsertRequest = useStore((s) => s.citationInsertRequest);
  const citationSeen = useRef(citationInsertRequest?.nonce ?? 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || pendingCaret.current === null) return;
    el.selectionStart = el.selectionEnd = pendingCaret.current;
    pendingCaret.current = null;
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (citationInsertRequest?.nonce === citationSeen.current) return;
    citationSeen.current = citationInsertRequest?.nonce ?? citationSeen.current;
    if (!citationInsertRequest || lastActiveTextarea !== el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + citationInsertRequest.text + value.slice(end);
    pendingCaret.current = start + citationInsertRequest.text.length;
    onChange(next);
    setTrigger(null);
  }, [citationInsertRequest?.nonce]);

  useEffect(() => () => {
    if (lastActiveTextarea === ref.current) lastActiveTextarea = null;
  }, []);

  const sync = (el: HTMLTextAreaElement): void => {
    if (el.selectionStart !== el.selectionEnd) {
      setTrigger(null);
      return;
    }
    const next = detectTrigger(el.value, el.selectionStart);
    setTrigger(next);
    setActive(0);
  };

  /* --------------------------------------------------------- candidates */

  const citationCandidates = useMemo(() => {
    if (trigger?.kind !== 'citation' || !bibliography) return [];
    const q = foldDiacritics(trigger.query);
    const scored: Array<{ entry: BibEntry; score: number }> = [];
    for (const entry of bibliography) {
      const key = foldDiacritics(entry.key);
      const title = foldDiacritics(entry.title ?? '');
      const authors = foldDiacritics(entry.authors ?? '');
      let score = 0;
      if (!q) score = 40;
      else if (key.startsWith(q)) score = 100;
      else if (key.includes(q)) score = 80;
      else if (title.includes(q)) score = 60;
      else if (authors.includes(q)) score = 40;
      if (score) scored.push({ entry, score });
    }
    return scored.sort((a, b) => b.score - a.score).map((x) => x.entry).slice(0, 30);
  }, [trigger, bibliography]);

  const mentionCandidates = useMemo(() => {
    if (trigger?.kind !== 'mention' || !labels) return [];
    const q = foldDiacritics(trigger.query);
    const rows = Object.values(labels);
    if (!q) return rows.slice(0, 30);
    const scored: Array<{ rec: LabelRecord; score: number }> = [];
    for (const rec of rows) {
      const id = foldDiacritics(rec.label.slice(rec.label.indexOf(':') + 1));
      const full = foldDiacritics(rec.label);
      const word = foldDiacritics(REF_KIND_LABEL[rec.kind]);
      let score = 0;
      if (id.startsWith(q) || full.startsWith(q)) score = 100;
      else if (id.includes(q) || full.includes(q)) score = 70;
      else if (word.startsWith(q)) score = 50;
      else if (word.includes(q)) score = 30;
      if (score) scored.push({ rec, score });
    }
    return scored.sort((a, b) => b.score - a.score).map((s) => s.rec).slice(0, 30);
  }, [trigger, labels]);

  const slashCandidates = useMemo(() => {
    if (trigger?.kind !== 'slash') return [];
    return searchTemplates(trigger.query, recentBlocks).slice(0, 30);
  }, [trigger, recentBlocks]);

  /* -------------------------------------------------------------- commit */

  const insertCitation = (entry: BibEntry): void => {
    if (trigger?.kind !== 'citation') return;
    const text = `[@${entry.key}]`;
    const next = value.slice(0, trigger.start) + text + value.slice(trigger.start + 2 + trigger.query.length);
    pendingCaret.current = trigger.start + text.length;
    onChange(next);
    setTrigger(null);
  };

  const insertMention = (rec: LabelRecord): void => {
    if (trigger?.kind !== 'mention') return;
    const el = ref.current;
    const cursor = el ? el.selectionStart : trigger.start + 1 + trigger.query.length;
    const text = `@${rec.label} `;
    const next = value.slice(0, trigger.start) + text + value.slice(cursor);
    pendingCaret.current = trigger.start + text.length;
    onChange(next);
    setTrigger(null);
  };

  const applySlash = (tpl: CardTemplate): void => {
    if (trigger?.kind !== 'slash') return;
    noteBlockUsed(tpl.id);
    pendingCaret.current = tpl.text.length;
    onChange(tpl.text);
    setTrigger(null);
  };

  const items: Item[] = useMemo(() => {
    if (trigger?.kind === 'citation') {
      return citationCandidates.map((entry) => ({
        key: entry.key,
        title: entry.key,
        subtitle: `${entry.authors ?? 'Không rõ tác giả'}${entry.year ? ` · ${entry.year}` : ''}`,
        icon: <span className="font-mono text-[10px] text-deep-600">[@]</span>,
        onSelect: () => insertCitation(entry),
      }));
    }
    if (trigger?.kind === 'mention') {
      return mentionCandidates.map((rec) => {
        const Icon = REF_KIND_ICON[rec.kind];
        return {
          key: rec.label,
          title: rec.number ? `${REF_KIND_LABEL[rec.kind]} ${rec.number}` : REF_KIND_LABEL[rec.kind],
          subtitle: rec.label,
          icon: <Icon size={13} />,
          onSelect: () => insertMention(rec),
        };
      });
    }
    if (trigger?.kind === 'slash') {
      return slashCandidates.map((tpl) => ({
        key: tpl.id,
        title: tpl.label,
        subtitle: tpl.hint || undefined,
        icon: <span className="font-mono text-[10px] text-ink-400">/{tpl.id.split('-')[0]}</span>,
        onSelect: () => applySlash(tpl),
      }));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, citationCandidates, mentionCandidates, slashCandidates]);

  useEffect(() => {
    if (active >= items.length) setActive(0);
  }, [items.length, active]);

  /* ------------------------------------------------------------ position */

  const [point, setPoint] = useState<{ left: number; top: number; lineHeight: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!trigger || !el) {
      setPoint(null);
      return;
    }
    setPoint(caretViewportPosition(el, trigger.start));
  }, [trigger]);

  useEffect(() => {
    if (!trigger) return;
    const onScroll = (): void => setTrigger(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [trigger]);

  useEffect(() => {
    if (!trigger) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setTrigger(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [trigger]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (matchesShortcut(e, 'hyperlink')) {
      e.preventDefault();
      const el = ref.current;
      if (!el) return;
      let start = el.selectionStart;
      let end = el.selectionEnd;
      let selected = value.slice(start, end);
      let linkMatch = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(selected);

      if (!linkMatch) {
        for (const match of value.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) {
          const at = match.index ?? -1;
          if (at >= 0 && start >= at && start <= at + match[0].length) {
            start = at;
            end = at + match[0].length;
            selected = match[0];
            linkMatch = match;
            break;
          }
        }
      }

      const existingUrl = linkMatch?.[2] ?? '';
      const label = linkMatch?.[1] ?? selected;
      const url = window.prompt('URL liên kết', existingUrl || 'https://');
      if (url === null) return;
      const cleanUrl = url.trim();
      if (!cleanUrl) return;
      const text = `[${label || 'Liên kết'}](${cleanUrl})`;
      const next = value.slice(0, start) + text + value.slice(end);
      pendingCaret.current = start + text.length;
      onChange(next);
      setTrigger(null);
      return;
    }

    if (!trigger || !items.length) {
      if (trigger && e.key === 'Escape') {
        e.preventDefault();
        setTrigger(null);
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + items.length) % items.length;
      });
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      items[active]?.onSelect();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setTrigger(null);
    }
  };

  const highlightTokens = useMemo(() => {
    if (mono || !value.includes('@')) return null;
    const escape = (text: string): string => text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const escaped = escape(value);
    return escaped.replace(/(@(?:fig|tbl|eq|lst):[A-Za-z0-9_.-]+)/g, '<mark class="sr-ref-token">$1</mark>');
  }, [mono, value]);

  const showPopover = trigger !== null && point !== null;

  return (
    <>
      <div className="relative">
        {highlightTokens ? (
          <pre
            ref={highlightRef}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words p-0 text-[13px] leading-[1.55] text-ink-800 ${mono ? 'font-mono text-[12px]' : ''}`}
            dangerouslySetInnerHTML={{ __html: `${highlightTokens}\n` }}
          />
        ) : null}
        <textarea
          ref={ref}
          rows={minRows}
          value={value}
          aria-label={ariaLabel}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            sync(e.target);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') sync(e.currentTarget);
          }}
          onScroll={(e) => {
            if (highlightRef.current) {
              highlightRef.current.scrollTop = e.currentTarget.scrollTop;
              highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          data-sr-autocomplete-open={trigger ? 'true' : 'false'}
          onFocus={(e) => { lastActiveTextarea = e.currentTarget; sync(e.currentTarget); }}
          onClick={(e) => { lastActiveTextarea = e.currentTarget; sync(e.currentTarget); }}
          onBlur={() => setTrigger(null)}
          className={`${highlightTokens ? 'text-transparent caret-ink-800 selection:bg-sky-500/20 dark:caret-slate-100 dark:selection:bg-sky-500/20' : 'text-ink-800'} relative w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-[1.55] outline-none placeholder:text-ink-400 ${mono ? 'font-mono text-[12px]' : ''}`}
        />
      </div>

      {showPopover
        ? createPortal(
            <div
              ref={popoverRef}
              role="listbox"
              aria-label={trigger?.kind === 'citation' ? 'Chèn trích dẫn' : trigger?.kind === 'mention' ? 'Chèn tham chiếu' : 'Chèn nhanh'}
              className="sr-menu fixed z-[70] w-[260px] overflow-hidden"
              style={{ left: point.left, top: point.top + point.lineHeight + 4 }}
            >
              <div className="sr-scroll max-h-[280px] overflow-y-auto py-1">
                {items.length === 0 ? (
                  <div className="px-3 py-3 text-center text-[11.5px] text-ink-400">
                    {trigger?.kind === 'citation'
                      ? bibliography && bibliography.length === 0
                        ? 'Chưa có tài liệu tham khảo.'
                        : 'Không khớp citation key.'
                      : trigger?.kind === 'mention'
                      ? labels && Object.keys(labels).length === 0
                        ? 'Tài liệu chưa có đối tượng nào có nhãn.'
                        : 'Không khớp nhãn nào.'
                      : 'Không có loại khối khớp.'}
                  </div>
                ) : (
                  items.map((item, i) => (
                    <button
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => item.onSelect()}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition ${
                        i === active ? 'bg-sky-50' : ''
                      }`}
                    >
                      <span className="shrink-0 text-ink-400">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-ink-800">{item.title}</span>
                        {item.subtitle ? (
                          <span className="block truncate font-mono text-[10.5px] text-ink-400">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-ink-100 bg-ink-50/60 px-2.5 py-1 text-[10px] text-ink-400">
                ↑↓ chọn · Enter chèn · Esc đóng
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
