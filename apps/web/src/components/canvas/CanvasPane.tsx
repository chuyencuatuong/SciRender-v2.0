import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Braces, Columns2, FileText, Redo2, Undo2 } from 'lucide-react';
import { CARD_IN, useReducedMotion } from '~/lib/motion';
import {
  CARD_TEMPLATES,
  detectKind,
  makeColumns,
  moveCard,
  splitColumns,
  toCards,
  toSource,
  type Card,
  type CanvasDoc,
  type CardTemplate,
} from '~/lib/cards';
import { detectPaste } from '~/lib/paste';
import { BadgeCheck, X } from 'lucide-react';
import type { RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';
import { CardShell, type DropZone } from './CardShell';
import { InsertMenu } from './InsertMenu';
import { SourceDialog } from './SourceDialog';
import { FrontMatterDialog } from './FrontMatterDialog';
import { ChartDialog } from './ChartDialog';
import { parseTable, serializeFigure } from '~/lib/card-forms';

let seq = 0;
const nextId = (): string => `card-new-${seq++}`;

export interface ViewSwitch {
  view: 'canvas' | 'preview';
  setView: (view: 'canvas' | 'preview') => void;
}

interface Props {
  /** Shown only below the split breakpoint, where the two panes share the width. */
  viewSwitch: ViewSwitch | null;
  /** Last explicit render, if any — its labelled objects feed the `@`-mention
   * popover (Hạng mục 1). The heavy pipeline itself is never re-run for this. */
  render: RenderState;
}

interface Drag {
  from: number;
  over: number | null;
  zone: DropZone | null;
}

/**
 * The block canvas — the document as a column of cards.
 *
 * The cards are a view of the Markdown source, not a second copy of the
 * document: every edit is serialised straight back to the source the compiler
 * reads, and "Xem mã nguồn" shows exactly that text. This is what keeps the
 * canvas from drifting away from what gets printed (P1, P3).
 */
export function CanvasPane({ viewSwitch, render }: Props): JSX.Element {
  const source = useStore((s) => s.source);
  const docId = useStore((s) => s.docId);
  const setSource = useStore((s) => s.setSource);
  const addAssets = useStore((s) => s.addAssets);
  const addGeneratedAsset = useStore((s) => s.addGeneratedAsset);
  const gotoLine = useStore((s) => s.gotoLine);
  const coverAdded = useStore((s) => s.coverAdded);
  const insertBlockRequest = useStore((s) => s.insertBlockRequest);
  const citationInsertRequest = useStore((s) => s.citationInsertRequest);
  const noteBlockUsed = useStore((s) => s.noteBlockUsed);
  const [coverNoticeSeen, setCoverNoticeSeen] = useState<number | null>(null);
  const labels = render.result?.document.labels;

  const [doc, setDoc] = useState<CanvasDoc>(() => toCards(source));
  const [selected, setSelected] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The drop handler must read what the drag actually is, not what the last
  // render captured: a drag that starts and ends inside one tick would
  // otherwise see a stale null.
  const dragRef = useRef<Drag | null>(null);
  const setDragBoth = (next: Drag | null): void => {
    dragRef.current = next;
    setDrag(next);
  };
  const [showSource, setShowSource] = useState(false);
  const [showFront, setShowFront] = useState(false);
  const [recognised, setRecognised] = useState<{ id: string; label: string; raw: string } | null>(
    null,
  );
  const [chartRequest, setChartRequest] = useState<{ index: number; table: string; label: string } | null>(null);

  const reduced = useReducedMotion();
  const mine = useRef(source);
  const undoStack = useRef<CanvasDoc[]>([]);
  const redoStack = useRef<CanvasDoc[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const insertBlockSeen = useRef(insertBlockRequest?.nonce ?? 0);
  const citationInsertSeen = useRef(citationInsertRequest?.nonce ?? 0);

  // Split view: two independently-scrolled panes of the SAME document, one
  // above the other — for keeping an eye on two places in a long report at
  // once (the intro while writing the conclusion, say), the way VS Code lets
  // you split an editor. Both panes share every piece of state above (doc,
  // selected, undo/redo, shortcuts) — only the scroll position differs, so
  // there is exactly one undo history and one "selected card" no matter which
  // pane you last clicked in, never two documents drifting apart.
  const [splitView, setSplitView] = useState(false);
  const [splitPct, setSplitPct] = useState(55);
  const [splitDragging, setSplitDragging] = useState(false);
  const listRef2 = useRef<HTMLDivElement | null>(null);
  const splitBoxRef = useRef<HTMLDivElement | null>(null);

  // Re-slice only when the source changed somewhere else (open a document,
  // apply an edit from the source view) — never on our own writes, which would
  // rebuild every card mid-keystroke.
  useEffect(() => {
    if (source === mine.current) return;
    mine.current = source;
    setDoc(toCards(source));
    undoStack.current = [];
    redoStack.current = [];
  }, [source, docId]);

  const commit = useCallback(
    (next: CanvasDoc, options: { history?: boolean } = {}): void => {
      if (options.history !== false) {
        undoStack.current = [...undoStack.current.slice(-49), doc];
        redoStack.current = [];
      }
      setDoc(next);
      const text = toSource(next);
      mine.current = text;
      setSource(text);
    },
    [doc, setSource],
  );

  const setCards = useCallback(
    (cards: Card[], options?: { history?: boolean }): void =>
      commit({ ...doc, cards }, options),
    [commit, doc],
  );

  const undo = useCallback((): void => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current = [...redoStack.current.slice(-49), doc];
    setDoc(prev);
    const text = toSource(prev);
    mine.current = text;
    setSource(text);
  }, [doc, setSource]);

  const redo = useCallback((): void => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current = [...undoStack.current.slice(-49), doc];
    setDoc(next);
    const text = toSource(next);
    mine.current = text;
    setSource(text);
  }, [doc, setSource]);

  /* ------------------------------------------------------------ card edits */

  const updateCard = (index: number, text: string): void => {
    const cards = doc.cards.slice();
    const card = cards[index];
    if (!card) return;
    cards[index] = { ...card, text, kind: detectKind(text) };
    setCards(cards);
  };

  const requestChart = (index: number): void => {
    const card = doc.cards[index];
    if (!card || card.kind !== 'table') return;
    const parsed = parseTable(card.text);
    if (!parsed) return;
    const used = new Set(Object.keys(labels ?? {}));
    for (const existing of doc.cards) {
      for (const match of existing.text.matchAll(/\{#(fig:[A-Za-z0-9_.-]+)\}/g)) used.add(match[1]!);
    }
    let n = 1;
    while (used.has(`fig:chart-${n}`)) n++;
    setChartRequest({ index, table: card.text, label: `fig:chart-${n}` });
  };

  const insertAt = (index: number, text: string, label?: string): void => {
    const cards = doc.cards.slice();
    const card: Card = { id: nextId(), kind: detectKind(text), text, line: 0 };
    cards.splice(index, 0, card);
    setCards(cards);
    setSelected(index);
    if (label) setRecognised({ id: card.id, label, raw: text });
  };

  // The Command Palette cannot call `insertAt` directly — it lives outside
  // this component — so it asks through the store instead, the same way
  // TopBar's Ctrl+P asks the render effect to fire again (a nonce, bumped by
  // the requester, watched here). Reusing `CARD_TEMPLATES` keeps this the
  // exact same insert `InsertMenu` already does — never a second list (P4).
  useEffect(() => {
    const nonce = insertBlockRequest?.nonce ?? 0;
    if (nonce === insertBlockSeen.current) return;
    insertBlockSeen.current = nonce;
    const tpl = CARD_TEMPLATES.find((t) => t.id === insertBlockRequest?.templateId);
    if (!tpl) return;
    noteBlockUsed(tpl.id);
    insertAt(doc.cards.length, tpl.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertBlockRequest?.nonce]);

  useEffect(() => {
    const nonce = citationInsertRequest?.nonce ?? 0;
    if (nonce === citationInsertSeen.current) return;
    citationInsertSeen.current = nonce;
    // The focused AutoTextarea owns the actual selection/caret and consumes the
    // request. We still bump the request globally so a side panel can insert
    // without owning another copy of editor state.
  }, [citationInsertRequest?.nonce]);

  const removeAt = (index: number): void => {
    setCards(doc.cards.filter((_, i) => i !== index));
    setSelected(Math.max(0, index - 1));
  };

  const duplicateAt = (index: number): void => {
    const card = doc.cards[index];
    if (!card) return;
    const cards = doc.cards.slice();
    cards.splice(index + 1, 0, { ...card, id: nextId() });
    setCards(cards);
    setSelected(index + 1);
  };

  const moveBy = (index: number, delta: number): void => {
    const to = index + delta + (delta > 0 ? 1 : 0);
    setCards(moveCard(doc.cards, index, to));
    setSelected(Math.min(doc.cards.length - 1, Math.max(0, index + delta)));
  };

  const mergeColumns = (a: number, b: number): void => {
    const left = doc.cards[a];
    const right = doc.cards[b];
    if (!left || !right) return;
    const text = makeColumns(left.text, right.text);
    const cards = doc.cards.filter((_, i) => i !== a && i !== b);
    const at = Math.min(a, b);
    cards.splice(at, 0, { id: nextId(), kind: 'columns', text, line: left.line });
    setCards(cards);
    setSelected(at);
  };

  const unmerge = (index: number): void => {
    const card = doc.cards[index];
    const parts = card ? splitColumns(card.text) : null;
    if (!card || !parts) return;
    const cards = doc.cards.slice();
    cards.splice(index, 1, ...parts.map((text) => ({
      id: nextId(),
      kind: detectKind(text),
      text,
      line: card.line,
    })));
    setCards(cards);
  };

  /* ----------------------------------------------------------------- drag */

  const onDrop = (): void => {
    const current = dragRef.current;
    if (!current || current.over === null || current.zone === null) return;
    const { from, over, zone } = current;
    setDragBoth(null);
    if (from === over) return;
    if (zone === 'left' || zone === 'right') {
      mergeColumns(zone === 'left' ? from : over, zone === 'left' ? over : from);
      return;
    }
    setCards(moveCard(doc.cards, from, zone === 'above' ? over : over + 1));
  };

  /* ---------------------------------------------------------------- paste */

  const smartPaste = useCallback(
    async (e: ClipboardEvent): Promise<void> => {
      const data = e.clipboardData;
      if (!data) return;

      const file = Array.from(data.files).find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        const stamped = new File([file], file.name || `anh-dan-${Date.now()}.png`, {
          type: file.type,
        });
        const [name] = await addAssets([stamped]);
        if (!name) return;
        insertAt(
          selected + 1,
          `![Chú thích hình](asset:${name}){#fig:anh-${name} width=80%}`,
          'Ảnh từ clipboard',
        );
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const inField =
        active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement;
      const fieldIsEmpty = inField && !(active as HTMLTextAreaElement).value.trim();
      // Typing into a field that already has text keeps the plain paste a
      // writer expects; everything else goes through recognition.
      if (inField && !fieldIsEmpty) return;

      const text = data.getData('text/plain');
      if (!text.trim()) return;
      const html = data.getData('text/html');
      const result = detectPaste(text, html || undefined);
      if (result.kind === 'text' && inField) return;

      e.preventDefault();
      insertAt(selected + 1, result.markdown, result.kind === 'text' ? undefined : result.label);
    },
    [addAssets, insertAt, selected],
  );

  useEffect(() => {
    const hosts = [listRef.current, listRef2.current].filter(
      (h): h is HTMLDivElement => h !== null,
    );
    if (!hosts.length) return;
    const handler = (e: ClipboardEvent): void => {
      void smartPaste(e);
    };
    hosts.forEach((h) => h.addEventListener('paste', handler));
    return () => hosts.forEach((h) => h.removeEventListener('paste', handler));
  }, [smartPaste, splitView]);

  /* ------------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;
      // A dialog owns the keyboard while it is open, and Ctrl+Z inside a text
      // field has to undo the text — not silently rewind the whole canvas.
      if (document.querySelector('[role="dialog"]')) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target?.isContentEditable === true;
      // Ctrl+Enter while typing in the document body, the same chord Word uses
      // to force a page break — App.tsx's global Ctrl+Enter (Render) steps
      // aside for this exact case, see the comment there.
      if (typing && mod && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        insertAt(selected + 1, ':::pagebreak:::');
        return;
      }
      if (typing && !e.altKey) return;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateAt(selected);
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        moveBy(selected, e.key === 'ArrowUp' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Clicking a diagnostic or an outline entry scrolls the matching card in.
  useEffect(() => {
    if (!gotoLine) return;
    const index = doc.cards.findIndex((c, i) => {
      const next = doc.cards[i + 1];
      return c.line <= gotoLine.line && (!next || next.line > gotoLine.line);
    });
    if (index < 0) return;
    setSelected(index);
    for (const ref of [listRef, listRef2]) {
      ref.current
        ?.querySelector(`[data-card-index="${index}"]`)
        ?.scrollIntoView({ block: 'center' });
    }
  }, [gotoLine?.nonce]);

  // Dragging the divider between the two split panes — the same bespoke
  // mousemove/mouseup pattern App.tsx uses for the editor/preview divider,
  // resizing horizontally (left-pane width %) — left/right, like VS Code's
  // default split, rather than the earlier top/bottom stack.
  useEffect(() => {
    if (!splitDragging) return;
    const onMove = (e: MouseEvent): void => {
      const box = splitBoxRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(80, Math.max(20, pct)));
    };
    const onUp = (): void => setSplitDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [splitDragging]);

  // The scrollable card list — one pane's worth of content. Split view mounts
  // this TWICE (independent scroll containers, independent DOM), both fed the
  // exact same `doc`/`selected`/handlers, so editing in either pane edits the
  // one shared document (P1: the canvas is a view, never a second copy).
  const renderPane = (ref: React.RefObject<HTMLDivElement>): JSX.Element => (
    <div ref={ref} className="sr-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-6">
      {/* 660 -> 720px: dòng chữ vẫn trong khoảng đọc thoải mái (~85-90 ký tự),
          chỉ nới thêm một chút để cột soạn thảo bớt trông "trống" trên màn
          rộng khi không chia đôi — không kéo full-width vì hại khả năng đọc. */}
      <div className="mx-auto max-w-[720px]">
        <AnimatePresence>
          {coverAdded && coverAdded !== coverNoticeSeen ? (
            <motion.div
              initial={reduced ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduced ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="mb-2.5 overflow-hidden"
            >
              <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[12px] text-deep-800">
                <BadgeCheck size={14} className="mt-0.5 shrink-0 text-sky-600" />
                <div className="flex-1">
                  Mẫu này có trang bìa nên khối <strong>cover</strong> đã được thêm vào front
                  matter với đúng chữ của khoa. Mở{' '}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => setShowFront(true)}
                  >
                    Thông tin tài liệu
                  </button>{' '}
                  để điền tên nhóm, GVHD và MSSV.
                </div>
                <button
                  type="button"
                  aria-label="Ẩn thông báo"
                  onClick={() => setCoverNoticeSeen(coverAdded)}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-deep-500 hover:bg-[var(--sr-surface)]"
                >
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {doc.cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-300 px-4 py-10 text-center">
            <div className="text-[13px] font-medium text-ink-700">Tài liệu đang trống</div>
            <p className="mx-auto mt-1 max-w-[320px] text-[12px] text-ink-500">
              Thêm khối đầu tiên bằng menu bên trên, hoặc dán thẳng nội dung từ Word, Excel
              hay ảnh chụp màn hình vào đây.
            </p>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {doc.cards.map((card, index) => (
            <motion.div
              key={card.id}
              layout={reduced ? false : 'position'}
              initial={reduced ? false : CARD_IN.initial}
              animate={CARD_IN.animate}
              exit={reduced ? undefined : CARD_IN.exit}
              transition={CARD_IN.transition}
              className="mb-2.5"
            >
              <CardShell
                card={card}
                index={index}
                total={doc.cards.length}
                selected={selected === index}
                dropZone={drag?.over === index ? drag.zone : null}
                recognised={recognised?.id === card.id ? recognised.label : null}
                labels={labels}
                bibliography={render.result?.document.meta.bibliography}
                onSelect={() => setSelected(index)}
                onChange={(text) => updateCard(index, text)}
                onMove={(delta) => moveBy(index, delta)}
                onDuplicate={() => duplicateAt(index)}
                onDelete={() => removeAt(index)}
                onCreateChart={card.kind === 'table' ? () => requestChart(index) : undefined}
                onUnmerge={() => unmerge(index)}
                onMergeWithNext={() => mergeColumns(index, index + 1)}
                onDragStart={() => setDragBoth({ from: index, over: null, zone: null })}
                onDragEnd={() => setDragBoth(null)}
                onDragOver={(zone) => {
                  const d = dragRef.current;
                  if (d) setDragBoth({ ...d, over: index, zone });
                }}
                onDrop={onDrop}
                onUndoRecognition={() => {
                  if (!recognised) return;
                  const at = doc.cards.findIndex((c) => c.id === recognised.id);
                  if (at >= 0) updateCard(at, recognised.raw);
                  setRecognised(null);
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-2 pt-3">
          <InsertMenu
            compact
            label="Thêm khối ở cuối"
            onInsert={(tpl: CardTemplate) => insertAt(doc.cards.length, tpl.text)}
          />
          <span className="text-[11px] text-ink-400">
            hoặc bấm vào một khối rồi Ctrl+V — app tự nhận dạng ảnh, bảng Excel, LaTeX, code
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-1.5 overflow-hidden border-b border-ink-900/[0.045] px-3">
        <InsertMenu onInsert={(tpl) => insertAt(doc.cards.length, tpl.text)} />
        <button
          type="button"
          onClick={() => setShowFront(true)}
          title="Thông tin tài liệu — tên nhóm, GVHD, MSSV"
          className="inline-flex h-[27px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 text-[12px] text-ink-500 transition hover:bg-ink-900/[0.04] hover:text-ink-900"
        >
          <FileText size={13} strokeWidth={1.5} /> Thông tin
        </button>
        <button
          type="button"
          onClick={() => setShowSource(true)}
          title="Xem mã nguồn Markdown của tài liệu"
          className="inline-flex h-[27px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 text-[12px] text-ink-500 transition hover:bg-ink-900/[0.04] hover:text-ink-900"
        >
          <Braces size={13} strokeWidth={1.5} /> Mã nguồn
        </button>
        <button
          type="button"
          onClick={() => setSplitView((v) => !v)}
          aria-pressed={splitView}
          title="Chia đôi khung soạn — xem hai chỗ trong cùng tài liệu cùng lúc"
          className={`inline-flex h-[27px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 text-[12px] transition ${
            splitView
              ? 'bg-deep-50 text-deep-700'
              : 'text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900'
          }`}
        >
          <Columns2 size={13} strokeWidth={1.5} /> Chia đôi
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {viewSwitch ? (
            <div
              role="tablist"
              aria-label="Khung nhìn"
              className="mr-1 flex h-[28px] items-center gap-0.5 rounded-[9px] bg-ink-900/[0.05] px-[3px]"
            >
              {(['canvas', 'preview'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={viewSwitch.view === v}
                  onClick={() => viewSwitch.setView(v)}
                  className={`h-[22px] rounded-[7px] px-2.5 text-[11.5px] transition ${
                    viewSwitch.view === v
                      ? 'bg-[var(--sr-surface)] font-medium text-deep-600 shadow-[0_1px_2px_rgb(var(--ink-900)/0.08)]'
                      : 'text-ink-500'
                  }`}
                >
                  {v === 'canvas' ? 'Soạn' : 'Bản in'}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            title="Hoàn tác (Ctrl+Z)"
            aria-label="Hoàn tác"
            onClick={undo}
            className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-ink-400 transition hover:bg-ink-900/[0.04] hover:text-deep-600"
          >
            <Undo2 size={13} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            title="Làm lại (Ctrl+Y)"
            aria-label="Làm lại"
            onClick={redo}
            className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-ink-400 transition hover:bg-ink-900/[0.04] hover:text-deep-600"
          >
            <Redo2 size={13} strokeWidth={1.5} />
          </button>
          <span className="ml-1 whitespace-nowrap font-mono text-[10.5px] text-ink-300">
            {doc.cards.length} khối
          </span>
        </div>
      </div>

      {splitView ? (
        <div ref={splitBoxRef} className="flex min-h-0 flex-1 flex-row">
          <div style={{ width: `${splitPct}%` }} className="flex min-h-0 flex-col">
            {renderPane(listRef)}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để đổi chiều rộng hai khung"
            onMouseDown={() => setSplitDragging(true)}
            className="w-[5px] shrink-0 cursor-col-resize border-x border-ink-900/[0.06] bg-ink-900/[0.03] hover:bg-deep-100"
          />
          <div style={{ width: `${100 - splitPct}%` }} className="flex min-h-0 flex-col">
            {renderPane(listRef2)}
          </div>
        </div>
      ) : (
        renderPane(listRef)
      )}

      {showSource ? (
        <SourceDialog
          source={toSource(doc)}
          onClose={() => setShowSource(false)}
          onApply={(text) => {
            mine.current = '';
            setSource(text);
            setShowSource(false);
          }}
        />
      ) : null}

      {showFront ? (
        <FrontMatterDialog
          value={doc.frontMatter}
          onClose={() => setShowFront(false)}
          onApply={(frontMatter) => {
            commit({ ...doc, frontMatter });
            setShowFront(false);
          }}
        />
      ) : null}

      {chartRequest ? (
        (() => {
          const form = parseTable(chartRequest.table);
          if (!form) return null;
          return (
            <ChartDialog
              form={form}
              defaultLabel={chartRequest.label}
              onClose={() => setChartRequest(null)}
              onCreate={async (svg, meta) => {
                const safeBase = meta.label.replace(/^fig:/, '') || `chart-${chartRequest.index + 1}`;
                const assetName = await addGeneratedAsset(svg, `chart-${safeBase}.svg`, 'image/svg+xml');
                const markdown = serializeFigure({
                  alt: meta.caption,
                  src: `asset:${assetName}`,
                  label: meta.label,
                  width: meta.width,
                });
                insertAt(chartRequest.index + 1, markdown, meta.label);
                setChartRequest(null);
              }}
            />
          );
        })()
      ) : null}
    </>
  );
}
