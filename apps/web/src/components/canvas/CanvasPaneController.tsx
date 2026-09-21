import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
import { headingDepth, parseTable } from '~/lib/card-forms';
import type { RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';
import { CardShell, type DropZone } from './CardShell';
import { InsertMenu } from './InsertMenu';
import { BadgeCheck, X } from 'lucide-react';
import { useCanvasDragDrop } from '~/hooks/canvas/useCanvasDragDrop';
import { useCanvasKeyboard } from '~/hooks/canvas/useCanvasKeyboard';
import { useCanvasStoreSync } from '~/hooks/canvas/useCanvasStoreSync';
import { nextCanvasCardId } from './canvasUtils';

export interface ViewSwitch {
  view: 'canvas' | 'preview';
  setView: (view: 'canvas' | 'preview') => void;
}

export interface CanvasPaneProps {
  viewSwitch: ViewSwitch | null;
  render: RenderState;
}

interface Props extends CanvasPaneProps {}

interface Drag {
  from: number;
  over: number | null;
  zone: DropZone | null;
}

type CardActions = {
  select: (index: number) => void;
  doubleClick: (index: number) => void;
  change: (index: number, text: string) => void;
  move: (index: number, delta: number) => void;
  duplicate: (index: number) => void;
  delete: (index: number) => void;
  chart: (index: number) => void;
  unmerge: (index: number) => void;
  toggleLandscape: (index: number) => void;
  mergeNext: (index: number) => void;
  dragStart: (index: number) => void;
  dragEnd: () => void;
  dragOver: (index: number, zone: DropZone) => void;
  drop: () => void;
  undoRecognition: () => void;
  saveDiagramAsset: (index: number, svg: string, label: string) => Promise<string>;
};

export interface CanvasController {
  viewSwitch: ViewSwitch | null;
  render: RenderState;
  splitView: boolean;
  setSplitView: Dispatch<SetStateAction<boolean>>;
  splitPct: number;
  setSplitDragging: Dispatch<SetStateAction<boolean>>;
  // Assigned from the view's callback ref (the split panes are found by walking
  // the box's children), so these must be mutable — `RefObject` makes `.current`
  // read-only and the assignment is a type error.
  splitBoxRef: MutableRefObject<HTMLDivElement | null>;
  splitLeftRef: MutableRefObject<HTMLDivElement | null>;
  splitRightRef: MutableRefObject<HTMLDivElement | null>;
  splitPctRef: MutableRefObject<number>;
  splitDragRectRef: MutableRefObject<DOMRect | null>;
  listRef: RefObject<HTMLDivElement>;
  listRef2: RefObject<HTMLDivElement>;
  showSource: boolean;
  setShowSource: Dispatch<SetStateAction<boolean>>;
  showFront: boolean;
  setShowFront: Dispatch<SetStateAction<boolean>>;
  chartRequest: { index: number; table: string; label: string } | null;
  setChartRequest: Dispatch<SetStateAction<{ index: number; table: string; label: string } | null>>;
  doc: CanvasDoc;
  undo: () => void;
  redo: () => void;
  toSource: (doc: CanvasDoc) => string;
  mine: MutableRefObject<string>;
  setSource: (source: string) => void;
  commit: (next: CanvasDoc) => void;
  addGeneratedAsset: (content: string, filename: string, mime: string) => Promise<string>;
  insertAt: (index: number, text: string, label?: string) => void;
  viewportInsertIndex: () => number;
  renderPane: (ref: RefObject<HTMLDivElement>) => JSX.Element;
}

export function useCanvasController({ viewSwitch, render }: Props): CanvasController {
  const initialStore = useStore.getState();
  const setSource = useStore((s) => s.setSource);
  const requestRender = useStore((s) => s.render);
  const addAssets = useStore((s) => s.addAssets);
  const addGeneratedAsset = useStore((s) => s.addGeneratedAsset);
  const gotoLine = useStore((s) => s.gotoLine);
  const coverAdded = useStore((s) => s.coverAdded);
  const profileFilled = useStore((s) => s.profileFilled);
  const insertBlockRequest = useStore((s) => s.insertBlockRequest);
  const citationInsertRequest = useStore((s) => s.citationInsertRequest);
  const noteBlockUsed = useStore((s) => s.noteBlockUsed);
  const [coverNoticeSeen, setCoverNoticeSeen] = useState<number | null>(null);
  const [profileNoticeSeen, setProfileNoticeSeen] = useState<number | null>(null);
  const labels = render.result?.document.labels;

  const [doc, setDoc] = useState<CanvasDoc>(() => toCards(initialStore.source));
  const [selected, setSelected] = useState(0);
  const [flashCardId, setFlashCardId] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [showFront, setShowFront] = useState(false);
  const [recognised, setRecognised] = useState<{ id: string; label: string; raw: string } | null>(
    null,
  );
  const [chartRequest, setChartRequest] = useState<{ index: number; table: string; label: string } | null>(null);
  const [pasteToast, setPasteToast] = useState<{ label: string } | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  const reduced = useReducedMotion();
  const mine = useRef(initialStore.source);
  const mineDocId = useRef(initialStore.docId);
  /**
   * Every deferred callback this pane schedules, so unmount can cancel them.
   *
   * Card insert/duplicate each scheduled a `requestAnimationFrame` (scroll the
   * new card into view, focus its editor) and a 1500ms `setTimeout` (clear the
   * flash highlight) and kept neither handle. Inserting cards quickly — the
   * normal way this editor is used — therefore left a growing set of pending
   * callbacks, each holding its card object alive, each calling `setState` on a
   * component that may already be gone. Nothing crashed, which is why it
   * survived: React only logs a warning. The timers still accumulated.
   */
  const pendingFrames = useRef(new Set<number>());
  const pendingTimers = useRef(new Set<number>());

  const scheduleFrame = useCallback((fn: () => void): void => {
    const id = window.requestAnimationFrame(() => {
      pendingFrames.current.delete(id);
      fn();
    });
    pendingFrames.current.add(id);
  }, []);

  const scheduleTimeout = useCallback((fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => {
      pendingTimers.current.delete(id);
      fn();
    }, ms);
    pendingTimers.current.add(id);
  }, []);

  useEffect(
    () => () => {
      for (const id of pendingFrames.current) window.cancelAnimationFrame(id);
      for (const id of pendingTimers.current) window.clearTimeout(id);
      pendingFrames.current.clear();
      pendingTimers.current.clear();
    },
    [],
  );

  const undoStack = useRef<CanvasDoc[]>([]);
  const redoStack = useRef<CanvasDoc[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const setActiveBlockId = useStore((s) => s.setActiveBlockId);

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
  const splitLeftRef = useRef<HTMLDivElement | null>(null);
  const splitRightRef = useRef<HTMLDivElement | null>(null);
  const splitBoxRef = useRef<HTMLDivElement | null>(null);
  const splitDragRectRef = useRef<DOMRect | null>(null);
  const splitPctRef = useRef(55);
  const splitDragFrameRef = useRef<number | null>(null);
  const listRef2 = useRef<HTMLDivElement | null>(null);
  const listRefs = useMemo(() => [listRef, listRef2], [listRef, listRef2]);

  // Re-slice only when the source changed somewhere else (open a document,



  const selectCard = useCallback((index: number): void => {
    const next = Math.max(0, Math.min(index, doc.cards.length - 1));
    setSelected(next);
    setActiveBlockId(doc.cards[next]?.id ?? null);
  }, [doc.cards, setActiveBlockId]);

  const focusCardEditor = useCallback((index: number, caret: 'start' | 'end', origin?: HTMLElement | null): void => {
    if (index < 0 || index >= doc.cards.length) return;
    const host = origin?.closest<HTMLElement>('.sr-scroll') ?? null;
    const roots = host ? [host] : [listRef.current, listRef2.current].filter(Boolean) as HTMLDivElement[];
    let cardEl: HTMLElement | null = null;
    for (const root of roots) {
      cardEl = Array.from(root.querySelectorAll<HTMLElement>('[data-card-index]')).find(
        (el) => Number(el.dataset.cardIndex) === index,
      ) ?? null;
      if (cardEl) break;
    }
    if (!cardEl) return;
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const editor = cardEl.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      'textarea, input[type="text"], input:not([type])',
    );
    if (!editor) return;
    editor.focus({ preventScroll: true });
    const at = caret === 'end' ? editor.value.length : 0;
    editor.setSelectionRange?.(at, at);
  }, [doc.cards.length]);

  const viewportInsertIndex = useCallback((): number => {
    const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeHost = activeEl?.closest<HTMLDivElement>('.sr-scroll');
    const hosts = activeHost ? [activeHost] : [listRef.current, listRef2.current].filter(Boolean) as HTMLDivElement[];
    const host = hosts[0];
    if (!host || !doc.cards.length) return doc.cards.length;
    const hostRect = host.getBoundingClientRect();
    const viewportCenter = hostRect.top + hostRect.height / 2;
    const visible = Array.from(host.querySelectorAll<HTMLElement>('[data-card-index]')).map((el) => {
      const rect = el.getBoundingClientRect();
      return { index: Number(el.dataset.cardIndex), distance: Math.abs((rect.top + rect.bottom) / 2 - viewportCenter) };
    });
    const nearest = visible.sort((a, b) => a.distance - b.distance)[0];
    return nearest ? Math.min(doc.cards.length, nearest.index + 1) : doc.cards.length;
  }, [doc.cards.length]);

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

  const updateCard = (index: number, text: string, forcedKind?: Card['kind']): void => {
    const cards = doc.cards.slice();
    const card = cards[index];
    if (!card) return;
    const preserveEmptyHeading = card.kind === 'heading' && !forcedKind && !text.replace(/^#{1,6}[ \t]?/, '').trim();
    const nextText = preserveEmptyHeading ? `${'#'.repeat(headingDepth(card.text) || 1)} ` : text;
    cards[index] = { ...card, text: nextText, kind: forcedKind ?? (preserveEmptyHeading ? 'heading' : detectKind(nextText)) };
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

  const splitParagraphAt = (index: number, _at: number, left: string, right: string): void => {
    const current = doc.cards[index];
    if (!current) return;
    const cards = doc.cards.slice();
    cards[index] = { ...current, kind: 'paragraph', text: left };
    const nextCard: Card = { id: nextCanvasCardId(), kind: 'paragraph', text: right, line: current.line };
    cards.splice(index + 1, 0, nextCard);
    if (doc.cards[index]) {
      undoStack.current = [...undoStack.current.slice(-49), doc];
      redoStack.current = [];
    }
    setDoc({ ...doc, cards });
    const text = toSource({ ...doc, cards });
    mine.current = text;
    setSource(text);
    setSelected(index + 1);
    setActiveBlockId(nextCard.id);
    scheduleFrame(() => {
      const cardEl = Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]')).find(
        (el) => el.dataset.cardId === nextCard.id,
      );
      cardEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const editor = cardEl?.querySelector<HTMLTextAreaElement | HTMLInputElement>(
        'textarea, input[type="text"], input:not([type])',
      );
      editor?.focus({ preventScroll: true });
      editor?.setSelectionRange?.(0, 0);
    });
    setFlashCardId(nextCard.id);
    scheduleTimeout(() => setFlashCardId((currentId) => (currentId === nextCard.id ? null : currentId)), 1500);
  };

  const insertAt = (index: number, text: string, label?: string): void => {
    const cards = doc.cards.slice();
    const at = Math.max(0, Math.min(index, cards.length));
    const card: Card = { id: nextCanvasCardId(), kind: detectKind(text), text, line: 0 };
    cards.splice(at, 0, card);
    setCards(cards);
    setSelected(at);
    setActiveBlockId(card.id);
    scheduleFrame(() => {
      const cardEl = Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]')).find(
        (el) => el.dataset.cardId === card.id,
      );
      cardEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const editor = cardEl?.querySelector<HTMLTextAreaElement | HTMLInputElement>(
        'textarea, input[type="text"], input:not([type])',
      );
      editor?.focus({ preventScroll: true });
      if (editor) {
        const atCaret = editor.value.length;
        editor.setSelectionRange?.(atCaret, atCaret);
      }
    });
    setFlashCardId(card.id);
    scheduleTimeout(() => setFlashCardId((current) => (current === card.id ? null : current)), 1500);
    if (label) setRecognised({ id: card.id, label, raw: text });
  };

  // The Command Palette cannot call `insertAt` directly — it lives outside
  // this component — so it asks through the store instead, the same way
  // TopBar's Ctrl+P asks the render effect to fire again (a nonce, bumped by
  // the requester, watched here). Reusing `CARD_TEMPLATES` keeps this the
  // exact same insert `InsertMenu` already does — never a second list (P4).

  useCanvasStoreSync({
    mine,
    mineDocId,
    setDoc,
    setSelected,
    setActiveBlockId,
    insertBlockRequest,
    citationInsertRequest,
    gotoLine,
    noteBlockUsed,
    doc,
    undoStack,
    redoStack,
    viewportInsertIndex,
    insertAt,
    selectCard,
    listRefs,
  });


  const removeAt = (index: number): void => {
    const cards = doc.cards.filter((_, i) => i !== index);
    setCards(cards);
    const next = Math.max(0, Math.min(index - 1, cards.length - 1));
    setSelected(next);
    setActiveBlockId(cards[next]?.id ?? null);
    setDeleteConfirmIndex(null);
  };

  const requestDelete = (index: number): void => {
    const card = doc.cards[index];
    if (!card) return;
    const labelMatch = /\{#((?:fig|tbl):[A-Za-z0-9_.-]+)\}/.exec(card.text);
    const label = labelMatch?.[1];
    if (!label) {
      removeAt(index);
      return;
    }
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasReferences = new RegExp(`@${escaped}(?![\\w:-])`).test(mine.current);
    if (hasReferences) {
      setDeleteConfirmIndex(index);
      selectCard(index);
      return;
    }
    removeAt(index);
  };

  const duplicateAt = (index: number): void => {
    const card = doc.cards[index];
    if (!card) return;
    const cards = doc.cards.slice();
    cards.splice(index + 1, 0, { ...card, id: nextCanvasCardId() });
    setCards(cards);
    selectCard(index + 1);
  };

  const moveBy = (index: number, delta: number): void => {
    const to = index + delta + (delta > 0 ? 1 : 0);
    setCards(moveCard(doc.cards, index, to));
    selectCard(Math.min(doc.cards.length - 1, Math.max(0, index + delta)));
  };

  const mergeColumns = (a: number, b: number): void => {
    const left = doc.cards[a];
    const right = doc.cards[b];
    if (!left || !right) return;
    const text = makeColumns(left.text, right.text);
    const cards = doc.cards.filter((_, i) => i !== a && i !== b);
    const at = Math.min(a, b);
    cards.splice(at, 0, { id: nextCanvasCardId(), kind: 'columns', text, line: left.line });
    setCards(cards);
    selectCard(at);
  };

  const unmerge = (index: number): void => {
    const card = doc.cards[index];
    const parts = card ? splitColumns(card.text) : null;
    if (!card || !parts) return;
    const cards = doc.cards.slice();
    cards.splice(index, 1, ...parts.map((text) => ({
      id: nextCanvasCardId(),
      kind: detectKind(text),
      text,
      line: card.line,
    })));
    setCards(cards);
  };

  /* ----------------------------------------------------------------- drag */

  const dragDrop = useCanvasDragDrop({
    doc,
    selected,
    splitView,
    listRefs,
    setCards,
    setSelected,
    setActiveBlockId,
    setPasteToast,
    addAssets,
    insertAt,
    viewportInsertIndex,
    selectCard,
    mergeColumns,
  });
  const {
    drag,
    dragRef,
    setDragBoth,
    stopDragAutoScroll,
    handleDragAutoScroll,
    onDrop,
  } = dragDrop;

  const selectAdjacentCard = useCallback((index: number, caret: 'start' | 'end', origin: HTMLElement | null): void => {
    selectCard(index);
    scheduleFrame(() => focusCardEditor(index, caret, origin));
  }, [focusCardEditor, scheduleFrame, selectCard]);

  /* ------------------------------------------------------------- shortcuts */

  // Keep one capture-phase listener for the lifetime of the Canvas. React re-renders
  // frequently while typing; storing the latest state/actions in a ref avoids
  // repeatedly attaching global keyboard listeners and eliminates stale closures.

  useCanvasKeyboard({
    doc,
    selected,
    updateCard,
    insertAt,
    undo,
    redo,
    duplicateAt,
    moveBy,
    requestDelete,
    selectCard,
    focusCardEditor,
    selectAdjacentCard,
    splitParagraphAt,
  });

  // Dragging the divider between the two split panes — the same bespoke
  // mousemove/mouseup pattern App.tsx uses for the editor/preview divider,
  // resizing horizontally (left-pane width %) — left/right, like VS Code's
  // default split, rather than the earlier top/bottom stack.
  useEffect(() => {
    if (!splitDragging) return;
    const onMove = (e: MouseEvent): void => {
      const rect = splitDragRectRef.current;
      const left = splitLeftRef.current;
      const right = splitRightRef.current;
      if (!rect || !left || !right || rect.width <= 0) return;
      splitPctRef.current = Math.min(80, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100));
      if (splitDragFrameRef.current !== null) return;
      splitDragFrameRef.current = window.requestAnimationFrame(() => {
        splitDragFrameRef.current = null;
        const pct = splitPctRef.current;
        left.style.width = `${pct}%`;
        right.style.width = `${100 - pct}%`;
      });
    };
    const onUp = (): void => {
      if (splitDragFrameRef.current !== null) {
        window.cancelAnimationFrame(splitDragFrameRef.current);
        splitDragFrameRef.current = null;
      }
      setSplitPct(Math.round(splitPctRef.current));
      splitDragRectRef.current = null;
      setSplitDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (splitDragFrameRef.current !== null) {
        window.cancelAnimationFrame(splitDragFrameRef.current);
        splitDragFrameRef.current = null;
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [splitDragging]);


  const cardActionsRef = useRef<CardActions | null>(null);
  cardActionsRef.current = {
    select: selectCard,
    doubleClick: (index) => window.dispatchEvent(new CustomEvent('sr:preview-focus', { detail: { id: doc.cards[index]?.id } })),
    change: updateCard,
    move: moveBy,
    duplicate: duplicateAt,
    delete: requestDelete,
    chart: requestChart,
    unmerge,
    toggleLandscape: (index) => {
      const card = doc.cards[index];
      if (!card) return;
      const pair = splitColumns(card.text);
      if (!pair) return;
      const landscape = /\b(?:landscape|orientation=landscape)\b/.test(card.text);
      updateCard(index, makeColumns(pair[0], pair[1], !landscape), 'columns');
      scheduleFrame(() => requestRender());
    },
    mergeNext: (index) => mergeColumns(index, index + 1),
    dragStart: (index) => {
      stopDragAutoScroll();
      setDragBoth({ from: index, over: null, zone: null });
    },
    dragEnd: () => {
      stopDragAutoScroll();
      setDragBoth(null);
    },
    dragOver: (index, zone) => {
      const d = dragRef.current;
      if (d) setDragBoth({ ...d, over: index, zone });
    },
    drop: onDrop,
    undoRecognition: () => {
      const current = recognised;
      if (!current) return;
      const at = doc.cards.findIndex((c) => c.id === current.id);
      if (at >= 0) updateCard(at, current.raw);
      setRecognised(null);
    },
    saveDiagramAsset: async (index, svg, label) => {
      const safe = label.replace(/^dia:/, '') || `diagram-${index + 1}`;
      return addGeneratedAsset(svg, `diagram-${safe}.svg`, 'image/svg+xml');
    },
  };

  // The scrollable card list — one pane's worth of content. Split view mounts
  // The scrollable card list — one pane's worth of content. Split view mounts
  // this TWICE (independent scroll containers, independent DOM), both fed the
  // exact same `doc`/`selected`/handlers, so editing in either pane edits the
  // one shared document (P1: the canvas is a view, never a second copy).
  const renderPane = (ref: RefObject<HTMLDivElement>): JSX.Element => (

    <div
      ref={ref}
      className="sr-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-6"
      onDragOver={(e) => {
        e.preventDefault();
        handleDragAutoScroll(e.currentTarget, e.clientY);
      }}
      onDragLeave={(e) => {
        const nextTarget = e.relatedTarget;
        if (!(nextTarget instanceof Node) || !e.currentTarget.contains(nextTarget)) stopDragAutoScroll();
      }}
      onDrop={stopDragAutoScroll}
    >
      {/* 660 -> 720px: dòng chữ vẫn trong khoảng đọc thoải mái (~85-90 ký tự),
          chỉ nới thêm một chút để cột soạn thảo bớt trông "trống" trên màn
          rộng khi không chia đôi — không kéo full-width vì hại khả năng đọc. */}
      <div className="mx-auto max-w-[720px]">
        <AnimatePresence>
          {coverAdded && coverAdded !== coverNoticeSeen ? (
            <motion.div
              key="cover-added"
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
          {profileFilled && profileFilled.at !== profileNoticeSeen ? (
            <motion.div
              key="profile-filled"
              initial={reduced ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduced ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="mb-2.5 overflow-hidden"
            >
              <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[12px] text-deep-800">
                <BadgeCheck size={14} className="mt-0.5 shrink-0 text-sky-600" />
                <div className="flex-1">
                  Đã điền trang bìa từ hồ sơ của bạn ({profileFilled.fields
                    .map((f) => ({ members: 'sinh viên thực hiện', mssv: 'MSSV', faculty: 'khoa', major: 'ngành' })[f])
                    .join(', ')}). Chỉ những ô còn trống hoặc giữ chỗ được điền. Mở{' '}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => setShowFront(true)}
                  >
                    Thông tin tài liệu
                  </button>{' '}
                  để xem hoặc sửa.
                </div>
                <button
                  type="button"
                  aria-label="Ẩn thông báo"
                  onClick={() => setProfileNoticeSeen(profileFilled.at)}
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
            <Fragment key={card.id}>
              <motion.div
                layout={reduced || splitView ? false : 'position'}
                initial={reduced || splitView ? false : CARD_IN.initial}
                animate={splitView ? undefined : CARD_IN.animate}
                exit={reduced || splitView ? undefined : CARD_IN.exit}
                transition={splitView ? undefined : CARD_IN.transition}
                className="relative mb-2.5"
              >
                <CanvasCard
                  card={card}
                  index={index}
                  total={doc.cards.length}
                  selected={selected === index}
                  flash={flashCardId === card.id}
                  dropZone={drag && drag.over === index ? drag.zone : null}
                  recognised={recognised?.id === card.id ? recognised.label : null}
                  labels={labels}
                  bibliography={render.result?.document.meta.bibliography}
                  actionsRef={cardActionsRef}
                />
                {deleteConfirmIndex === index ? (
                  <div className="absolute right-2 top-[-8px] z-40 w-[min(360px,90vw)] -translate-y-full rounded-xl border border-flag-200 bg-[var(--sr-surface)] p-3 shadow-xl">
                    <div className="text-[11.5px] font-semibold text-flag-700">Khối này đang được tham chiếu</div>
                    <p className="mt-1 text-[11px] leading-[1.45] text-ink-600">Xóa sẽ làm gãy các liên kết <code>@fig:…</code> hoặc <code>@tbl:…</code> đang có trong tài liệu.</p>
                    <div className="mt-2.5 flex justify-end gap-1.5">
                      <button type="button" className="sr-btn-ghost h-7 !px-2.5 text-[10.5px]" onClick={() => setDeleteConfirmIndex(null)}>Hủy</button>
                      <button type="button" className="sr-btn-render h-7 !border-flag-500 !bg-flag-500 !px-2.5 text-[10.5px] text-white" onClick={() => removeAt(index)}>Xóa và chấp nhận gãy tham chiếu</button>
                    </div>
                  </div>
                ) : null}
              </motion.div>
              {index < doc.cards.length - 1 ? (
                <div className="group relative -my-1 flex h-4 items-center justify-center">
                  <div className="pointer-events-none absolute inset-x-4 h-px bg-sky-500/0 transition-colors duration-150 group-hover:bg-sky-500/25" />
                  <div className="relative z-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                    <InsertMenu
                      compact
                      iconOnly
                      ariaLabel={`Chèn khối giữa khối ${index + 1} và ${index + 2}`}
                      label="Chèn khối vào giữa"
                      onInsert={(tpl: CardTemplate) => insertAt(index + 1, tpl.text)}
                    />
                  </div>
                </div>
              ) : null}
            </Fragment>
          ))}
        </AnimatePresence>

        {pasteToast ? (
          <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-white/10 bg-[var(--sr-panel)] px-3 py-2 text-[11px] text-white shadow-2xl backdrop-blur-md">
            <span>{pasteToast.label}</span> <button type="button" onClick={undo} className="ml-2 font-medium text-sky-300 hover:text-sky-200">Hoàn tác</button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-3">
          <InsertMenu
            compact
            label="Thêm khối"
            onInsert={(tpl: CardTemplate) => insertAt(viewportInsertIndex(), tpl.text)}
          />
          <span className="text-[11px] text-ink-400">
            hoặc Ctrl+V — app tự nhận dạng ảnh, bảng, Mermaid, LaTeX, code và nội dung AI
          </span>
        </div>
      </div>
    </div>
  );

  return {
    viewSwitch,
    render,
    splitView,
    setSplitView,
    splitPct,
    setSplitDragging,
    splitBoxRef,
    splitLeftRef,
    splitRightRef,
    splitPctRef,
    splitDragRectRef,
    listRef,
    listRef2,
    showSource,
    setShowSource,
    showFront,
    setShowFront,
    chartRequest,
    setChartRequest,
    doc,
    undo,
    redo,
    toSource,
    mine,
    setSource,
    commit,
    addGeneratedAsset,
    insertAt,
    viewportInsertIndex,
    renderPane,
  };
}

type CanvasCardProps = {
  card: Card;
  index: number;
  total: number;
  selected: boolean;
  flash: boolean;
  dropZone: DropZone | null;
  recognised: string | null;
  labels?: Record<string, import('@scirender/ast').LabelRecord>;
  bibliography?: import('@scirender/ast').BibEntry[];
  actionsRef: MutableRefObject<CardActions | null>;
};

const CanvasCard = memo(function CanvasCard({
  card,
  index,
  total,
  selected,
  flash,
  dropZone,
  recognised,
  labels,
  bibliography,
  actionsRef,
}: CanvasCardProps): JSX.Element {
  const handlers = useMemo(() => ({
    onSelect: () => actionsRef.current?.select(index),
    onDoubleClick: () => actionsRef.current?.doubleClick(index),
    onChange: (text: string) => actionsRef.current?.change(index, text),
    onMove: (delta: number) => actionsRef.current?.move(index, delta),
    onDuplicate: () => actionsRef.current?.duplicate(index),
    onDelete: () => actionsRef.current?.delete(index),
    onCreateChart: card.kind === 'table' ? () => actionsRef.current?.chart(index) : undefined,
    onUnmerge: () => actionsRef.current?.unmerge(index),
    onToggleLandscape: card.kind === 'columns' ? () => actionsRef.current?.toggleLandscape(index) : undefined,
    onMergeWithNext: () => actionsRef.current?.mergeNext(index),
    onDragStart: () => actionsRef.current?.dragStart(index),
    onDragEnd: () => actionsRef.current?.dragEnd(),
    onDragOver: (zone: DropZone) => actionsRef.current?.dragOver(index, zone),
    onDrop: () => actionsRef.current?.drop(),
    onSaveDiagramAsset: async (svg: string, label: string) => actionsRef.current?.saveDiagramAsset(index, svg, label) ?? '',
    onUndoRecognition: () => actionsRef.current?.undoRecognition(),
  }), [actionsRef, index, card.kind]);

  return (
    <CardShell
      card={card}
      index={index}
      total={total}
      selected={selected}
      flash={flash}
      dropZone={dropZone}
      recognised={recognised}
      labels={labels}
      bibliography={bibliography}
      onSelect={handlers.onSelect}
      onDoubleClick={handlers.onDoubleClick}
      onChange={handlers.onChange}
      onMove={handlers.onMove}
      onDuplicate={handlers.onDuplicate}
      onDelete={handlers.onDelete}
      onCreateChart={handlers.onCreateChart}
      onUnmerge={handlers.onUnmerge}
      onToggleLandscape={handlers.onToggleLandscape}
      onMergeWithNext={handlers.onMergeWithNext}
      onDragStart={handlers.onDragStart}
      onDragEnd={handlers.onDragEnd}
      onDragOver={handlers.onDragOver}
      onDrop={handlers.onDrop}
      onSaveDiagramAsset={handlers.onSaveDiagramAsset}
      onUndoRecognition={handlers.onUndoRecognition}
    />
  );
});

