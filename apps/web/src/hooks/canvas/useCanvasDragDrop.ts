import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { Card, CanvasDoc } from '~/lib/cards';
import { moveCard } from '~/lib/cards';
import { detectPaste, parseBulkMarkdown } from '~/lib/paste';
import type { DropZone } from '~/components/canvas/CardShell';
import { nextCanvasCardId } from '~/components/canvas/canvasUtils';

interface Drag {
  from: number;
  over: number | null;
  zone: DropZone | null;
}

export interface CanvasDragDropOptions {
  doc: CanvasDoc;
  selected: number;
  splitView: boolean;
  listRefs: RefObject<HTMLDivElement>[];
  setCards: (cards: Card[]) => void;
  setSelected: Dispatch<SetStateAction<number>>;
  setActiveBlockId: (id: string | null) => void;
  setPasteToast: Dispatch<SetStateAction<{ label: string } | null>>;
  addAssets: (files: File[]) => Promise<string[]>;
  insertAt: (index: number, text: string, label?: string) => void;
  viewportInsertIndex: () => number;
  selectCard: (index: number) => void;
  mergeColumns: (a: number, b: number) => void;
}

export interface CanvasDragDropResult {
  drag: Drag | null;
  dragRef: MutableRefObject<Drag | null>;
  setDragBoth: (next: Drag | null) => void;
  stopDragAutoScroll: () => void;
  handleDragAutoScroll: (host: HTMLDivElement, clientY: number) => void;
  onDrop: () => void;
}

export function useCanvasDragDrop(options: CanvasDragDropOptions): CanvasDragDropResult {
  const {
    doc, selected, splitView, listRefs, setCards, setSelected, setActiveBlockId,
    setPasteToast, addAssets, insertAt, viewportInsertIndex, selectCard, mergeColumns,
  } = options;

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dragScrollRef = useRef<{ host: HTMLDivElement; clientY: number } | null>(null);
  const dragScrollFrame = useRef<number | null>(null);
  const pasteToastTimerRef = useRef<number | null>(null);
  /** Scroll-into-view frame from a bulk paste; cancelled on unmount with the rest. */
  const pasteFrameRef = useRef<number | null>(null);

  const setDragBoth = useCallback((next: Drag | null): void => {
    dragRef.current = next;
    setDrag(next);
  }, []);

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
    let step = 0;
    if (topDistance >= 0 && topDistance < edge) {
      step = -Math.max(1, Math.round(maxStep * (1 - topDistance / edge)));
    } else if (bottomDistance >= 0 && bottomDistance < edge) {
      step = Math.max(1, Math.round(maxStep * (1 - bottomDistance / edge)));
    }
    if (step !== 0) {
      state.host.scrollTop += step;
      dragScrollFrame.current = window.requestAnimationFrame(stepDragAutoScroll);
    } else {
      dragScrollFrame.current = null;
    }
  }, []);

  const handleDragAutoScroll = useCallback((host: HTMLDivElement, clientY: number): void => {
    if (!dragRef.current) return;
    dragScrollRef.current = { host, clientY };
    if (dragScrollFrame.current === null) {
      dragScrollFrame.current = window.requestAnimationFrame(stepDragAutoScroll);
    }
  }, [stepDragAutoScroll]);

  useEffect(() => stopDragAutoScroll, [stopDragAutoScroll]);

  const onDrop = useCallback((): void => {
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
  }, [doc.cards, mergeColumns, selectCard, setCards, setDragBoth, stopDragAutoScroll]);

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

      const showToast = (message: string, duration: number): void => {
        if (pasteToastTimerRef.current !== null) window.clearTimeout(pasteToastTimerRef.current);
        setPasteToast({ label: message });
        pasteToastTimerRef.current = window.setTimeout(() => {
          pasteToastTimerRef.current = null;
          setPasteToast(null);
        }, duration);
      };

      if (file) {
        e.preventDefault();
        const stamped = new File([file], file.name || `anh-dan-${Date.now()}.png`, { type: file.type });
        const [name] = await addAssets([stamped]);
        if (!name) return;
        insertAt(insertionIndex, `![Chú thích hình](asset:${name}){#fig:anh-${name} width=80%}`, 'Ảnh từ clipboard');
        showToast('Đã chèn Hình ảnh từ clipboard', 1800);
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
            const card: Card = { id: nextCanvasCardId(), kind: item.cardKind, text: item.markdown, line: 0 };
            cards.splice(Math.min(at, cards.length), 0, card);
            at++;
          }
          setCards(cards);
          const focusCard = cards[Math.min(at - 1, cards.length - 1)];
          setSelected(Math.max(0, at - 1));
          setActiveBlockId(focusCard?.id ?? null);
          showToast(`Đã nhận ${bulk.length} khối từ nội dung AI`, 2200);
          const frame = window.requestAnimationFrame(() => {
            pasteFrameRef.current = null;
            const first = document.querySelector<HTMLElement>(`[data-card-id="${focusCard?.id ?? ''}"]`);
            first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          if (pasteFrameRef.current !== null) window.cancelAnimationFrame(pasteFrameRef.current);
          pasteFrameRef.current = frame;
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
      showToast(`Đã chèn ${result.label}`, 1800);
    },
    [addAssets, doc.cards, insertAt, selected, setActiveBlockId, setCards, setPasteToast, viewportInsertIndex],
  );

  /**
   * `smartPaste` is rebuilt on every `doc.cards` change — i.e. on every
   * keystroke — so binding the effect to it tore down and re-registered the
   * paste listener on both panes, on every keystroke. The handler now reads the
   * current implementation out of a ref, which leaves the effect depending only
   * on things that actually change (`splitView` adds or removes the second
   * pane). One registration per pane, for the pane's whole life.
   */
  const smartPasteRef = useRef(smartPaste);
  smartPasteRef.current = smartPaste;

  useEffect(() => {
    const hosts = listRefs.map((r) => r.current).filter((h): h is HTMLDivElement => h !== null);
    if (!hosts.length) return undefined;
    const handler = (e: ClipboardEvent): void => { void smartPasteRef.current(e); };
    hosts.forEach((h) => h.addEventListener('paste', handler));
    return () => hosts.forEach((h) => h.removeEventListener('paste', handler));
  }, [listRefs, splitView]);

  useEffect(() => () => {
    stopDragAutoScroll();
    if (pasteToastTimerRef.current !== null) {
      window.clearTimeout(pasteToastTimerRef.current);
      pasteToastTimerRef.current = null;
    }
    if (pasteFrameRef.current !== null) {
      window.cancelAnimationFrame(pasteFrameRef.current);
      pasteFrameRef.current = null;
    }
  }, [stopDragAutoScroll]);

  return { drag, dragRef, setDragBoth, stopDragAutoScroll, handleDragAutoScroll, onDrop };
}
