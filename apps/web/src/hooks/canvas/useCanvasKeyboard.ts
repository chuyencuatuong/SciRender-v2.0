import { useEffect, useRef, type RefObject } from 'react';
import { isEditableTarget, listenForShortcuts, matchesShortcut } from '~/lib/shortcuts';
import { setHeadingDepth } from '~/lib/card-forms';
import { nextCanvasCardId } from '~/components/canvas/canvasUtils';
import type { CanvasDoc, Card } from '~/lib/cards';

export interface CanvasKeyboardContext {
  doc: CanvasDoc;
  selected: number;
  updateCard: (index: number, text: string, forcedKind?: Card['kind']) => void;
  insertAt: (index: number, text: string, label?: string) => void;
  undo: () => void;
  redo: () => void;
  duplicateAt: (index: number) => void;
  moveBy: (index: number, delta: number) => void;
  requestDelete: (index: number) => void;
  selectCard: (index: number) => void;
  focusCardEditor: (index: number, caret: 'start' | 'end', origin?: HTMLElement | null) => void;
  selectAdjacentCard: (index: number, caret: 'start' | 'end', origin: HTMLElement | null) => void;
  splitParagraphAt: (index: number, at: number, left: string, right: string) => void;
}

export function useCanvasKeyboard(context: CanvasKeyboardContext): RefObject<CanvasKeyboardContext> {
  /**
   * Frames scheduled from inside the key handler (restore focus after a merge,
   * after a heading downgrade, after a list-marker autocorrect). They ran
   * uncancelled: a keystroke that unmounted the pane in the same tick left a
   * callback that focused a detached element and held the event target alive.
   */
  const pendingFrames = useRef(new Set<number>());
  const scheduleFrame = (fn: () => void): void => {
    const id = requestAnimationFrame(() => {
      pendingFrames.current.delete(id);
      fn();
    });
    pendingFrames.current.add(id);
  };
  useEffect(
    () => () => {
      for (const id of pendingFrames.current) cancelAnimationFrame(id);
      pendingFrames.current.clear();
    },
    [],
  );

  const {
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
  } = context;

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
            const newCard: Card = { id: nextCanvasCardId(), kind: 'paragraph', text: right, line: current.line };
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
            scheduleFrame(() => {
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
            scheduleFrame(() => context.focusCardEditor(activeIndex, 'start', target));
            return;
          }
          if (card.kind === 'paragraph' && editor.value.length === 0) {
            if (currentDoc.cards.length <= 1) return;
            e.preventDefault();
            context.requestDelete(activeIndex);
            const prev = Math.max(0, activeIndex - 1);
            const prevId = currentDoc.cards[prev]?.id;
            if (prevId) {
              // `context.focusCardEditor`, not the destructured one: the effect
              // below has an empty dependency array, so every name captured
              // directly here is frozen at mount. Every other call in this
              // handler already goes through the ref; this one did not, so
              // backspace-merge focused using a callback that still believed in
              // the card list as it was when the pane first rendered.
              scheduleFrame(() => context.focusCardEditor(prev, 'end', target));
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
  return shortcutContextRef;
}
