import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
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
import { headingDepth, setHeadingDepth } from '~/lib/card-forms';
import { isEditableTarget, listenForShortcuts, matchesShortcut } from '~/lib/shortcuts';
import { detectPaste, parseBulkMarkdown } from '~/lib/paste';
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

/**
 * The block canvas — the document as a column of cards.
 *
 * The cards are a view of the Markdown source, not a second copy of the
 * document: every edit is serialised straight back to the source the compiler
 * reads, and "Xem mã nguồn" shows exactly that text. This is what keeps the
 * canvas from drifting away from what gets printed (P1, P3).
 */
export function CanvasPane({ viewSwitch, render }: Props): JSX.Element {
  const initialStore = useStore.getState();
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

  const [doc, setDoc] = useState<CanvasDoc>(() => toCards(initialStore.source));
  const [selected, setSelected] = useState(0);
  const [flashCardId, setFlashCardId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The drop handler must read what the drag actually is, not what the last
  // render captured: a drag that starts and ends inside one tick would
  // otherwise see a stale null.
  const dragRef = useRef<Drag | null>(null);
  const dragScrollRef = useRef<{ host: HTMLDivElement; clientY: number } | null>(null);
  const dragScrollFrame = useRef<number | null>(null);
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
  const [pasteToast, setPasteToast] = useState<{ label: string } | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  const reduced = useReducedMotion();
  const mine = useRef(initialStore.source);
  const mineDocId = useRef(initialStore.docId);
  const undoStack = useRef<CanvasDoc[]>([]);
  const redoStack = useRef<CanvasDoc[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const insertBlockSeen = useRef(insertBlockRequest?.nonce ?? 0);
  const citationInsertSeen = useRef(citationInsertRequest?.nonce ?? 0);
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

  // Re-slice only when the source changed somewhere else (open a document,
  // apply an edit from the source view) — never on our own writes, which would
  // rebuild every card mid-keystroke.
  useEffect(() => {
    return useStore.subscribe((state) => {
      if (state.source === mine.current && state.docId === mineDocId.current) return;
      mine.current = state.source;
      mineDocId.current = state.docId;
      setDoc(toCards(state.source));
      undoStack.current = [];
      redoStack.current = [];
      setSelected(0);
      setActiveBlockId(null);
    });
  }, [setActiveBlockId]);

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
    const nextCard: Card = { id: nextId(), kind: 'paragraph', text: right, line: current.line };
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
    requestAnimationFrame(() => {
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
    window.setTimeout(() => setFlashCardId((currentId) => currentId === nextCard.id ? null : currentId), 1500);
  };

  const insertAt = (index: number, text: string, label?: string): void => {
    const cards = doc.cards.slice();
    const at = Math.max(0, Math.min(index, cards.length));
    const card: Card = { id: nextId(), kind: detectKind(text), text, line: 0 };
    cards.splice(at, 0, card);
    setCards(cards);
    setSelected(at);
    setActiveBlockId(card.id);
    requestAnimationFrame(() => {
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
    window.setTimeout(() => setFlashCardId((current) => current === card.id ? null : current), 1500);
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
    const anchorId = insertBlockRequest?.afterBlockId ?? null;
    const anchorIndex = anchorId ? doc.cards.findIndex((c) => c.id === anchorId) : -1;
    const at = anchorIndex >= 0 ? anchorIndex + 1 : viewportInsertIndex();
    insertAt(at, tpl.text);
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
    cards.splice(index + 1, 0, { ...card, id: nextId() });
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
    cards.splice(at, 0, { id: nextId(), kind: 'columns', text, line: left.line });
    setCards(cards);
    selectCard(at);
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

  const stopDragAutoScroll = useCallback((): void => {
    dragScrollRef.current = null;
    if (dragScrollFrame.current !== null) {
      window.cancelAnimationFrame(dragScrollFrame.current);
      dragScrollFrame.current = null;
    }
  }, []);

  const stepDragAutoScroll = useCallback((): void => {
    const state = dragScrollRef.current;
    if (!state || !dragRef.current) {
      dragScrollFrame.current = null;
      return;
    }
    const rect = state.host.getBoundingClientRect();
    const edge = 80;
    const maxStep = 18;
    const topDistance = state.clientY - rect.top;
    const bottomDistance = rect.bottom - state.clientY;
    let delta = 0;
    if (topDistance < edge) {
      delta = -Math.ceil(maxStep * Math.min(1, (edge - topDistance) / edge));
    } else if (bottomDistance < edge) {
      delta = Math.ceil(maxStep * Math.min(1, (edge - bottomDistance) / edge));
    }
    if (delta === 0) {
      dragScrollFrame.current = null;
      return;
    }
    state.host.scrollTop += delta;
    dragScrollFrame.current = window.requestAnimationFrame(stepDragAutoScroll);
  }, []);

  const handleDragAutoScroll = useCallback((host: HTMLDivElement, clientY: number): void => {
    if (!dragRef.current) return;
    dragScrollRef.current = { host, clientY };
    if (dragScrollFrame.current === null) {
      dragScrollFrame.current = window.requestAnimationFrame(stepDragAutoScroll);
    }
  }, [stepDragAutoScroll]);

  useEffect(() => stopDragAutoScroll, [stopDragAutoScroll]);

  const onDrop = (): void => {
    stopDragAutoScroll();
    const current = dragRef.current;
    if (!current || current.over === null || current.zone === null) return;
    const { from, over, zone } = current;
    setDragBoth(null);
    if (from === over) return;
    if (zone === 'left' || zone === 'right') {
      mergeColumns(zone === 'left' ? from : over, zone === 'left' ? over : from);
      return;
    }
    const target = zone === 'above' ? over : over + 1;
    setCards(moveCard(doc.cards, from, target));
    selectCard(Math.min(doc.cards.length - 1, Math.max(0, from < target ? target - 1 : target)));
  };

  /* ---------------------------------------------------------------- paste */

  const smartPaste = useCallback(
    async (e: ClipboardEvent): Promise<void> => {
      const data = e.clipboardData;
      if (!data) return;
      const file = Array.from(data.files).find((f) => f.type.startsWith('image/'));
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeCardEl = active?.closest<HTMLElement>('[data-card-id]');
      const activeId = activeCardEl?.dataset.cardId ?? null;
      const activeIndex = activeId ? doc.cards.findIndex((c) => c.id === activeId) : selected;
      const insertionIndex = activeIndex >= 0 ? activeIndex + 1 : viewportInsertIndex();

      if (file) {
        e.preventDefault();
        const stamped = new File([file], file.name || `anh-dan-${Date.now()}.png`, { type: file.type });
        const [name] = await addAssets([stamped]);
        if (!name) return;
        insertAt(insertionIndex, `![Chú thích hình](asset:${name}){#fig:anh-${name} width=80%}`, 'Ảnh từ clipboard');
        setPasteToast({ label: 'Đã chèn Hình ảnh từ clipboard' });
        window.setTimeout(() => setPasteToast(null), 1800);
        return;
      }

      const inField = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement;
      const fieldIsEmpty = inField ? active.value.trim() === '' : true;
      if (inField && !fieldIsEmpty) return;
      const text = data.getData('text/plain');
      if (!text.trim()) return;
      const html = data.getData('text/html');

      if (!inField || fieldIsEmpty) {
        const bulk = parseBulkMarkdown(text);
        if (bulk && bulk.length > 1) {
          e.preventDefault();
          const cards = doc.cards.slice();
          let at = insertionIndex;
          for (const item of bulk) {
            const card: Card = { id: nextId(), kind: item.cardKind, text: item.markdown, line: 0 };
            cards.splice(Math.min(at, cards.length), 0, card);
            at++;
          }
          setCards(cards);
          const focusCard = cards[Math.min(at - 1, cards.length - 1)];
          setSelected(Math.max(0, at - 1));
          setActiveBlockId(focusCard?.id ?? null);
          setPasteToast({ label: `Đã nhận ${bulk.length} khối từ nội dung AI` });
          window.setTimeout(() => setPasteToast(null), 2200);
          requestAnimationFrame(() => {
            const first = document.querySelector<HTMLElement>(`[data-card-id="${focusCard?.id ?? ''}"]`);
            first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          return;
        }
      }

      const result = detectPaste(text, html || undefined);
      if (result.kind === 'text' && !html) return;
      e.preventDefault();
      if (inField && active) {
        const start = active.selectionStart ?? active.value.length;
        const end = active.selectionEnd ?? start;
        active.focus();
        const inserted = result.markdown || text;
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(active), 'value')?.set;
        setter?.call(active, active.value.slice(0, start) + inserted + active.value.slice(end));
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.setSelectionRange?.(start + inserted.length, start + inserted.length);
      } else {
        insertAt(insertionIndex, result.markdown, result.label);
      }
      setPasteToast({ label: `Đã chèn ${result.label}` });
      window.setTimeout(() => setPasteToast(null), 1800);
    },
    [addAssets, doc.cards, insertAt, selected, setActiveBlockId, setCards, viewportInsertIndex],
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

  const selectAdjacentCard = useCallback((index: number, caret: 'start' | 'end', origin: HTMLElement | null): void => {
    selectCard(index);
    requestAnimationFrame(() => focusCardEditor(index, caret, origin));
  }, [focusCardEditor, selectCard]);

  /* ------------------------------------------------------------- shortcuts */

  // Keep one capture-phase listener for the lifetime of the Canvas. React re-renders
  // frequently while typing; storing the latest state/actions in a ref avoids
  // repeatedly attaching global keyboard listeners and eliminates stale closures.
  const shortcutContextRef = useRef({
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
  shortcutContextRef.current = {
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
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const context = shortcutContextRef.current;
      const currentDoc = context.doc;
      const currentSelected = context.selected;
      // These are global-first commands; their own handlers also use capture phase.
      if (matchesShortcut(e, 'command-palette') || matchesShortcut(e, 'shortcuts')) return;
      if (document.querySelector('[role="dialog"]')) return;

      const target = e.target instanceof HTMLElement ? e.target : null;
      const typing = isEditableTarget(target);
      const interactive = Boolean(target?.closest('button, select, option, [contenteditable="true"]'));
      const focusedCardEl = target?.closest<HTMLElement>('[data-card-index]');
      const parsedIndex = focusedCardEl ? Number(focusedCardEl.dataset.cardIndex) : NaN;
      const activeIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < currentDoc.cards.length
        ? parsedIndex
        : currentSelected;
      if (activeIndex !== currentSelected && Number.isInteger(parsedIndex)) context.selectCard(activeIndex);

      if (typing && matchesShortcut(e, 'clean-paste')) {
        e.preventDefault();
        const clipboard = navigator.clipboard;
        if (!clipboard) return;
        void clipboard.readText().then((text) => {
          if (!text) return;
          try {
            document.execCommand('insertText', false, text);
          } catch {
            // Regular paste remains available on browsers without execCommand.
          }
        });
        return;
      }

      if (typing) {
        const headingShortcuts: Array<{ id: 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3'; depth: number }> = [
          { id: 'heading-1', depth: 1 },
          { id: 'heading-2', depth: 2 },
          { id: 'heading-3', depth: 3 },
          { id: 'paragraph', depth: 0 },
        ];
        const headingShortcut = headingShortcuts.find((shortcut) => matchesShortcut(e, shortcut.id));
        if (headingShortcut) {
          const card = currentDoc.cards[activeIndex];
          const textual = card && ['paragraph', 'heading', 'blockquote', 'list', 'callout'].includes(card.kind);
          if (textual) {
            e.preventDefault();
            const nextText = headingShortcut.depth === 0
              ? card!.text.replace(/^#{1,6}[ \t]?/, '')
              : setHeadingDepth(card!.text, headingShortcut.depth);
            context.updateCard(activeIndex, nextText, headingShortcut.depth === 0 ? 'paragraph' : undefined);
          }
          return;
        }
      }

      if (matchesShortcut(e, 'page-break')) {
        if (typing) {
          e.preventDefault();
          context.insertAt(activeIndex + 1, ':::pagebreak:::');
        }
        // Outside an editor, App owns Ctrl+Enter for render. Do not reinterpret
        // it as the selected-card Enter behavior below.
        return;
      }

      // Editing commands stay global even when the caret is inside a textarea.
      // The old `if (typing && !e.altKey) return` ran before these cases and
      // silently disabled Ctrl+Z/Ctrl+Y/Ctrl+D while writing.
      if (matchesShortcut(e, 'undo')) {
        e.preventDefault();
        context.undo();
        return;
      }
      if (matchesShortcut(e, 'redo')) {
        e.preventDefault();
        context.redo();
        return;
      }
      if (matchesShortcut(e, 'duplicate')) {
        e.preventDefault();
        context.duplicateAt(activeIndex);
        return;
      }
      if (matchesShortcut(e, 'move-up-down')) {
        e.preventDefault();
        context.moveBy(activeIndex, e.key === 'ArrowUp' ? -1 : 1);
        return;
      }

      const autoCompleteOpen = target?.dataset.srAutocompleteOpen === 'true';
      if (autoCompleteOpen) return;

      const inTableEditor = Boolean(target?.closest('[data-sr-table-editor-active]'));
      if (inTableEditor) return;

      if (typing && e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const card = currentDoc.cards[activeIndex];
        const editor = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement ? target : null;
        if (card?.kind === 'paragraph' && editor) {
          e.preventDefault();
          const at = editor.selectionStart ?? editor.value.length;
          const left = editor.value.slice(0, at);
          const right = editor.value.slice(at);
          const cards = currentDoc.cards.slice();
          const current = cards[activeIndex];
          if (current) {
            cards[activeIndex] = { ...current, text: left };
            const newCard: Card = { id: nextId(), kind: 'paragraph', text: right, line: current.line };
            cards.splice(activeIndex + 1, 0, newCard);
            context.splitParagraphAt(activeIndex, at, left, right);
          }
          return;
        }
      }

      if (typing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key === ' ') {
        const editor = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement ? target : null;
        const card = currentDoc.cards[activeIndex];
        if (editor && card?.kind === 'paragraph' && editor.selectionStart === editor.selectionEnd) {
          const cursor = editor.selectionStart ?? 0;
          const lineStart = editor.value.lastIndexOf('\n', cursor - 1) + 1;
          const line = editor.value.slice(lineStart, cursor);
          const marker = /^(#{1,3}|>|[-*+]|\d+[.)])$/.exec(line)?.[1];
          if (marker) {
            e.preventDefault();
            const markerText = `${marker} `;
            context.updateCard(activeIndex, markerText);
            requestAnimationFrame(() => {
              const cardEl = editor.closest<HTMLElement>('[data-card-index]');
              const field = cardEl?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
                'input[type="text"], input:not([type]), textarea',
              );
              field?.focus({ preventScroll: true });
              const pos = markerText.length;
              field?.setSelectionRange?.(pos, pos);
            });
            return;
          }
        }
      }

      if (typing && e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const card = currentDoc.cards[activeIndex];
        if (card && (card.kind === 'heading' || ['figure', 'table', 'equation', 'codeBlock', 'diagram'].includes(card.kind))) {
          e.preventDefault();
          context.insertAt(activeIndex + 1, 'Nội dung đoạn văn.');
          return;
        }
      }

      if (typing && e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const editor = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement ? target : null;
        const card = currentDoc.cards[activeIndex];
        if (editor && card && editor.selectionStart === 0 && editor.selectionEnd === 0) {
          if (card.kind === 'heading') {
            const body = card.text.replace(/^#{1,6}[ \t]?/, '');
            // An empty heading is still a heading marker: backspace must not make
            // the block disappear while the author is starting a new title.
            if (!body.trim()) return;
            e.preventDefault();
            context.updateCard(activeIndex, body);
            requestAnimationFrame(() => context.focusCardEditor(activeIndex, 'start', target));
            return;
          }
          if (card.kind === 'paragraph' && editor.value.length === 0) {
            if (currentDoc.cards.length <= 1) return;
            e.preventDefault();
            context.requestDelete(activeIndex);
            const prev = Math.max(0, activeIndex - 1);
            const prevId = currentDoc.cards[prev]?.id;
            if (prevId) {
              requestAnimationFrame(() => focusCardEditor(prev, 'end', target));
            }
            return;
          }
        }
      }

      if (typing && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const editor = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement ? target : null;
        if (editor && editor.selectionStart === editor.selectionEnd) {
          const cursor = editor.selectionStart ?? 0;
          const lineStart = editor.value.lastIndexOf('\n', cursor - 1) + 1;
          const lineBreak = editor.value.indexOf('\n', cursor);
          const lineEnd = lineBreak < 0 ? editor.value.length : lineBreak;
          const firstLine = cursor === lineStart;
          const lastLine = lineBreak < 0 && cursor === lineEnd;
          if (e.key === 'ArrowUp' && firstLine && activeIndex > 0) {
            e.preventDefault();
            context.selectAdjacentCard(activeIndex - 1, 'end', target);
            return;
          }
          if (e.key === 'ArrowDown' && lastLine && activeIndex < currentDoc.cards.length - 1) {
            e.preventDefault();
            context.selectAdjacentCard(activeIndex + 1, 'start', target);
            return;
          }
        }
      }

      if (typing && !e.altKey) return;

      if (!typing && !interactive && e.key === 'Backspace') {
        const card = currentDoc.cards[activeIndex];
        if (card) {
          e.preventDefault();
          context.requestDelete(activeIndex);
          return;
        }
      }

    };
    return listenForShortcuts(onKey);
  }, []);

  // Clicking a diagnostic or an outline entry scrolls the matching card in.
  useEffect(() => {
    if (!gotoLine) return;
    const index = doc.cards.findIndex((c, i) => {
      const next = doc.cards[i + 1];
      return c.line <= gotoLine.line && (!next || next.line > gotoLine.line);
    });
    if (index < 0) return;
    selectCard(index);
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
      const landscape = /\b(?:landscape|orientation=landscape)\b/.test(card.text);
      const next = landscape
        ? card.text.replace(/\s+(?:landscape|orientation=landscape)/, '')
        : card.text.replace(/^::: cols\b/, '::: cols landscape');
      updateCard(index, next, 'columns');
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
  // this TWICE (independent scroll containers, independent DOM), both fed the
  // exact same `doc`/`selected`/handlers, so editing in either pane edits the
  // one shared document (P1: the canvas is a view, never a second copy).
  const renderPane = (ref: React.RefObject<HTMLDivElement>): JSX.Element => (

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
                  dropZone={drag?.over === index ? drag.zone : null}
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

  return (
    <>
      <div className="sr-canvas-toolbar flex h-11 shrink-0 items-center gap-1.5 overflow-hidden border-b border-slate-200/80 px-3 dark:border-slate-800">
        <InsertMenu onInsert={(tpl) => insertAt(viewportInsertIndex(), tpl.text)} />
        <button
          type="button"
          onClick={() => setSplitView((v) => !v)}
          aria-pressed={splitView}
          title="Chia đôi khung soạn — xem hai chỗ trong cùng tài liệu cùng lúc"
          className={`inline-flex h-[28px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-medium transition ${
            splitView
              ? 'border-sky-200 bg-sky-50 text-sky-700 shadow-sm dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300'
              : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100'
          }`}
        >
          <Columns2 size={13} strokeWidth={1.5} /> Chia đôi
        </button>

        {viewSwitch ? (
          <div
            role="tablist"
            aria-label="Khung nhìn"
            className="flex h-[30px] items-center gap-0.5 rounded-full border border-slate-200/80 bg-slate-100/80 px-[3px] dark:border-slate-700 dark:bg-slate-900/70"
          >
            {(['canvas', 'preview'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={viewSwitch.view === v}
                onClick={() => viewSwitch.setView(v)}
                className={`h-[24px] rounded-full px-2.5 text-[11.5px] transition ${
                  viewSwitch.view === v
                    ? 'bg-white font-medium text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {v === 'canvas' ? 'Soạn' : 'Bản in'}
              </button>
            ))}
          </div>
        ) : null}

        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-slate-200 md:block dark:bg-slate-700" />
        <button
          type="button"
          onClick={() => setShowFront(true)}
          title="Thông tin tài liệu — tên nhóm, GVHD, MSSV"
          className="hidden h-[28px] shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[11.5px] text-slate-500 transition hover:border-slate-200 hover:bg-white hover:text-slate-900 md:inline-flex dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <FileText size={13} strokeWidth={1.5} /> Thông tin
        </button>
        <button
          type="button"
          onClick={() => setShowSource(true)}
          title="Xem mã nguồn Markdown của tài liệu"
          className="hidden h-[28px] shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[11.5px] text-slate-500 transition hover:border-slate-200 hover:bg-white hover:text-slate-900 lg:inline-flex dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <Braces size={13} strokeWidth={1.5} /> Mã nguồn
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-slate-200/80 bg-white/70 p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
          <button
            type="button"
            title="Hoàn tác (Ctrl+Z)"
            aria-label="Hoàn tác"
            onClick={undo}
            className="grid h-[26px] w-[26px] place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Undo2 size={13} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            title="Làm lại (Ctrl+Y)"
            aria-label="Làm lại"
            onClick={redo}
            className="grid h-[26px] w-[26px] place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Redo2 size={13} strokeWidth={1.5} />
          </button>
          <span className="whitespace-nowrap px-2 font-mono text-[10.5px] text-slate-400">
            {doc.cards.length} khối
          </span>
        </div>
      </div>

      {splitView ? (
        <div
          ref={(node) => {
            splitBoxRef.current = node;
            if (node) {
              splitPctRef.current = splitPct;
              splitLeftRef.current = node.firstElementChild as HTMLDivElement | null;
              splitRightRef.current = node.lastElementChild as HTMLDivElement | null;
            }
          }}
          className="flex min-h-0 flex-1 flex-row"
        >
          <div ref={splitLeftRef} style={{ width: `${splitPct}%` }} className="flex min-h-0 flex-col">
            {renderPane(listRef)}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để đổi chiều rộng hai khung"
            onMouseDown={() => {
              const box = splitBoxRef.current;
              if (!box) return;
              splitPctRef.current = splitPct;
              splitDragRectRef.current = box.getBoundingClientRect();
              setSplitDragging(true);
            }}
            className="w-[5px] shrink-0 cursor-col-resize border-x border-ink-900/[0.06] bg-ink-900/[0.03] hover:bg-deep-100"
          />
          <div ref={splitRightRef} style={{ width: `${100 - splitPct}%` }} className="flex min-h-0 flex-col">
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

